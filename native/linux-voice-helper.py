#!/usr/bin/env python3
"""Native voice media sidecar. No browser, credentials or arbitrary pipelines.

Requires Python GI: Gst, GstSdp, GstWebRTC 1.0, libnice and the fixed factories
listed in REQUIRED. JSON-lines protocol on stdin/stdout; diagnostics on stderr.
The DSH host owns confirmation, account signaling and the lifetime of each call.
"""
import ctypes
import json
import math
import os
import queue
import re
import signal
import sys
import threading
import time

MAX_LINE = 128 * 1024
REQUIRED = ('webrtcbin', 'pulsesrc', 'pulsesink', 'webrtcdsp', 'webrtcechoprobe',
            'audioconvert', 'audioresample', 'capsfilter', 'queue', 'volume',
            'level', 'opusenc', 'rtpopuspay', 'rtpopusdepay', 'opusdec')
RAW = 'audio/x-raw,format=S16LE,layout=interleaved,rate=48000,channels=1'
OUTPUT_LOCK = threading.Lock()


def emit(**message):
    data = json.dumps(message, separators=(',', ':'), ensure_ascii=True)
    if len(data.encode()) > MAX_LINE:
        data = '{"event":"error","message":"protocol output too large"}'
    with OUTPUT_LOCK:
        try:
            sys.stdout.write(data + '\n')
            sys.stdout.flush()
        except (BrokenPipeError, OSError):
            os._exit(1)


try:
    import gi
    gi.require_version('Gst', '1.0')
    gi.require_version('GstSdp', '1.0')
    gi.require_version('GstWebRTC', '1.0')
    from gi.repository import GLib, Gst, GstSdp, GstWebRTC
except (ImportError, ValueError):
    emit(event='error', message='Python GI/Gst/GstSdp/GstWebRTC are required')
    sys.exit(1)


class Helper:
    def __init__(self):
        Gst.init(None)
        self.loop = GLib.MainLoop()
        self.commands = queue.Queue(maxsize=32)
        self.parent = os.getppid()
        self.pipeline = self.webrtc = self.channel = None
        self.channels = []
        self.role = 'offerer'
        self.muted = self.output_muted = self.interrupted = False
        self.remote_pad = None
        self.pending_description = None
        self.description_created = False
        self.answer_set = False
        self.generation = 0
        self.input_cutoff = self.output_cutoff = 0
        self.metrics_lock = threading.Lock()
        self.metrics = {}
        self.levels = {'mic': 0.0, 'assistant': 0.0}
        self.level_seen = {'mic': 0.0, 'assistant': 0.0}
        self.shutdown_requested = False
        self.started_at = None

    def reset_metrics(self):
        self.levels = {'mic': 0.0, 'assistant': 0.0}
        self.level_seen = {'mic': 0.0, 'assistant': 0.0}
        self.metrics = dict(captureBuffers=0, captureSamples=0, rtpSent=0,
                            rtpReceived=0, decodedBuffers=0, playbackBuffers=0,
                            rtpBlockedByMute=0, rtpSentWhileMuted=0,
                            staleInputDropped=0, staleOutputDropped=0,
                            interrupts=0, dataMessagesReceived=0)

    def snapshot(self):
        with self.metrics_lock:
            values = dict(self.metrics)
        return dict(**values, active=self.pipeline is not None, pid=os.getpid(),
                    uptimeMs=round((time.monotonic() - self.started_at) * 1000) if self.started_at else 0,
                    muted=self.muted, outputMuted=self.output_muted,
                    interrupted=self.interrupted, generation=self.generation)

    def increment(self, name, count=1):
        with self.metrics_lock:
            self.metrics[name] = self.metrics.get(name, 0) + count

    def factory(self, factory, name, **properties):
        element = Gst.ElementFactory.make(factory, name)
        if element is None:
            raise RuntimeError('required GStreamer element unavailable: ' + factory)
        for key, value in properties.items():
            element.set_property(key.replace('_', '-'), value)
        self.pipeline.add(element)
        return element

    def fixed_queue(self, name):
        return self.factory('queue', name, max_size_buffers=5, max_size_bytes=0,
                            max_size_time=100 * Gst.MSECOND, leaky=2)

    @staticmethod
    def link(*elements):
        for first, second in zip(elements, elements[1:]):
            if not first.link(second):
                raise RuntimeError('fixed audio element link failed')

    @staticmethod
    def device(value):
        if value is None:
            return None
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:@+-]{1,256}', value):
            raise ValueError('device must be a PulseAudio device name')
        return value

    def running_time(self):
        if self.pipeline is None or self.pipeline.get_clock() is None:
            return 0
        return max(0, self.pipeline.get_clock().get_time() - self.pipeline.get_base_time())

    def start(self, command):
        if command.get('captureAllowed') is not True:
            raise ValueError('explicit captureAllowed:true is required')
        if self.pipeline is not None:
            raise ValueError('session already active')
        self.role = command.get('role', 'offerer')
        if self.role not in ('offerer', 'answerer'):
            raise ValueError('role must be offerer or answerer')
        input_device, output_device = self.device(command.get('inputDevice')), self.device(command.get('outputDevice'))
        missing = [name for name in REQUIRED if Gst.ElementFactory.find(name) is None]
        if missing:
            raise RuntimeError('missing factories: ' + ','.join(missing))
        self.reset_metrics()
        self.started_at = time.monotonic()
        self.generation += 1
        epoch = self.generation
        self.description_created = self.answer_set = False
        self.pending_description = self.remote_pad = None
        self.muted = self.output_muted = self.interrupted = False
        self.input_cutoff = self.output_cutoff = 0
        self.pipeline = Gst.Pipeline.new('native-voice')
        # Official DSP contract: create probe before activating DSP sink, same pipeline.
        self.echo = self.factory('webrtcechoprobe', 'voice_echo_probe')
        self.webrtc = self.factory('webrtcbin', 'rtc', bundle_policy=GstWebRTC.WebRTCBundlePolicy.MAX_BUNDLE)
        self.webrtc.set_property('latency', 60)
        self.webrtc.connect('on-negotiation-needed', lambda _: GLib.idle_add(self.negotiate, epoch))
        self.webrtc.connect('notify::ice-gathering-state', lambda *_: GLib.idle_add(self.gathered, epoch))
        self.webrtc.connect('notify::connection-state', lambda *_: GLib.idle_add(self.connection_state, epoch))
        self.webrtc.connect('pad-added', self.pad_added, epoch)
        self.webrtc.connect('on-data-channel', lambda _, channel: self.attach_channel(channel, epoch))
        # Keep the call separate from unrelated Python audio applications.
        audio_identity = Gst.Structure.new_empty('props')
        audio_identity.set_value('application.name', 'DSH Voice')
        audio_identity.set_value('application.id', 'com.dsh.codex-subscription.voice')
        source = self.factory('pulsesrc', 'microphone', do_timestamp=True,
                              buffer_time=100000, latency_time=10000,
                              client_name='DSH Voice', stream_properties=audio_identity,
                              device=input_device or '@DEFAULT_SOURCE@')
        # NULL may restore an old per-application route instead of the selected
        # system microphone. The Pulse default alias resolves that choice now.
        convert = self.factory('audioconvert', 'mic_convert')
        resample = self.factory('audioresample', 'mic_resample')
        caps = self.factory('capsfilter', 'mic_caps', caps=Gst.Caps.from_string(RAW))
        dsp = self.factory('webrtcdsp', 'mic_dsp', probe='voice_echo_probe', echo_cancel=True,
                           noise_suppression=True, gain_control=True)
        mic_level = self.factory('level', 'mic_level', interval=30 * Gst.MSECOND, post_messages=True)
        self.mic_volume = self.factory('volume', 'mic_mute', mute=False)
        encoder = self.factory('opusenc', 'encoder', bitrate=24000, frame_size=20, inband_fec=True)
        pay = self.factory('rtpopuspay', 'pay', pt=111)
        rtp_caps = self.factory('capsfilter', 'rtp_caps', caps=Gst.Caps.from_string(
            'application/x-rtp,media=audio,encoding-name=OPUS,clock-rate=48000,payload=111'))
        self.link(source, convert, resample, caps, dsp, mic_level, self.mic_volume, encoder, pay, rtp_caps)
        caps.get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, self.capture_probe, epoch)
        rtp_caps.get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, self.send_probe, epoch)
        request = self.webrtc.request_pad_simple('sink_%u')
        if request is None or rtp_caps.get_static_pad('src').link(request) != Gst.PadLinkReturn.OK:
            raise RuntimeError('WebRTC audio sender link failed')
        self.rtc_sink = request
        # Playback branch is fixed, native, and already contains the AEC reference.
        self.rx_queue = self.fixed_queue('receive_queue')
        depay = self.factory('rtpopusdepay', 'depay')
        decoder = self.factory('opusdec', 'decoder', plc=True)
        out_convert = self.factory('audioconvert', 'out_convert')
        out_resample = self.factory('audioresample', 'out_resample')
        out_caps = self.factory('capsfilter', 'out_caps', caps=Gst.Caps.from_string(RAW))
        remote_level = self.factory('level', 'assistant_level', interval=30 * Gst.MSECOND, post_messages=True)
        self.speaker_volume = self.factory('volume', 'speaker_mute', mute=False)
        self.sink = self.factory('pulsesink', 'speaker', sync=True,
                                buffer_time=100000, latency_time=10000,
                                client_name='DSH Voice', stream_properties=audio_identity,
                                device=output_device or '@DEFAULT_SINK@')
        self.sink.set_property('async', False)
        self.link(self.rx_queue, depay, decoder, out_convert, out_resample, out_caps,
                  remote_level, self.speaker_volume, self.echo, self.sink)
        remote_level.get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, self.decoded_probe, epoch)
        self.speaker_volume.get_static_pad('sink').add_probe(Gst.PadProbeType.BUFFER, self.output_probe, epoch)
        self.echo.get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, self.playback_probe, epoch)
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message', self.bus_message, epoch)
        self.bus = bus
        if self.pipeline.set_state(Gst.State.READY) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError('native pipeline READY failed')
        self.channel = self.webrtc.emit('create-data-channel', 'oai-events', None)
        if self.channel is None:
            raise RuntimeError('data channel creation failed')
        self.attach_channel(self.channel, epoch)
        if self.pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError('native pipeline PLAYING failed')
        emit(event='state', state='connecting', pid=os.getpid(), generation=epoch)

    def capture_probe(self, _pad, info, epoch):
        if epoch != self.generation:
            return Gst.PadProbeReturn.DROP
        self.increment('captureBuffers')
        self.increment('captureSamples', info.get_buffer().get_size() // 2)
        return Gst.PadProbeReturn.OK

    def send_probe(self, _pad, info, epoch):
        buffer = info.get_buffer()
        if epoch != self.generation:
            return Gst.PadProbeReturn.DROP
        if buffer.pts != Gst.CLOCK_TIME_NONE and buffer.pts < self.input_cutoff:
            self.increment('staleInputDropped')
            if self.muted:
                self.increment('rtpBlockedByMute')
            return Gst.PadProbeReturn.DROP
        # mic_volume has already zeroed muted PCM before Opus encoding. Keep its
        # silent RTP flowing: dropping numbered packets creates a jitter/PLC gap
        # for the whole mute interval and delays the receiver when capture resumes.
        if self.muted:
            self.increment('rtpSentWhileMuted')
        self.increment('rtpSent')
        return Gst.PadProbeReturn.OK

    def decoded_probe(self, _pad, _info, epoch):
        if epoch == self.generation:
            self.increment('decodedBuffers')
        return Gst.PadProbeReturn.OK

    def output_probe(self, _pad, info, epoch):
        buffer = info.get_buffer()
        if epoch != self.generation or (buffer.pts != Gst.CLOCK_TIME_NONE and buffer.pts < self.output_cutoff):
            self.increment('staleOutputDropped')
            return Gst.PadProbeReturn.DROP
        return Gst.PadProbeReturn.OK

    def playback_probe(self, _pad, _info, epoch):
        if epoch == self.generation:
            self.increment('playbackBuffers')
        return Gst.PadProbeReturn.OK

    def pad_added(self, _rtc, pad, epoch):
        if pad.get_direction() != Gst.PadDirection.SRC or epoch != self.generation:
            return
        caps = pad.get_current_caps() or pad.query_caps(None)
        if caps is None or caps.is_empty() or caps.get_structure(0).get_string('media') != 'audio':
            return
        if self.remote_pad is not None:
            GLib.idle_add(self.fail, 'unexpected second incoming audio track')
            return
        self.remote_pad = pad
        pad.add_probe(Gst.PadProbeType.BUFFER, self.receive_probe, epoch)
        if pad.link(self.rx_queue.get_static_pad('sink')) != Gst.PadLinkReturn.OK:
            GLib.idle_add(self.fail, 'incoming RTP link failed')

    def receive_probe(self, _pad, _info, epoch):
        if epoch == self.generation:
            self.increment('rtpReceived')
        return Gst.PadProbeReturn.OK

    def data_message(self, size):
        self.increment('dataMessagesReceived')
        emit(event='data', bytes=size)  # Never echo user text or credentials.

    def attach_channel(self, channel, epoch):
        self.channels.append(channel)
        channel.connect('on-open', lambda *_: emit(event='state', state='data-channel-open')
                        if epoch == self.generation and self.pipeline is not None else None)
        channel.connect('on-message-string', lambda _, text: self.data_message(len(text.encode()))
                        if epoch == self.generation and self.pipeline is not None else None)

    def promise(self, callback, epoch):
        def changed(promise, *_):
            GLib.idle_add(callback, promise, epoch)
        return Gst.Promise.new_with_change_func(changed, None, None)

    def negotiate(self, epoch):
        if self.pipeline is None or epoch != self.generation or self.role != 'offerer' or self.description_created:
            return False
        self.description_created = True
        self.webrtc.emit('create-offer', None, self.promise(lambda p, e: self.local_created(p, e, 'offer'), epoch))
        return False

    def local_created(self, promise, epoch, kind):
        if epoch != self.generation or self.pipeline is None:
            return False
        reply = promise.get_reply()
        if reply is None or not reply.has_field(kind):
            return self.fail('local description creation failed')
        description = reply.get_value(kind)
        self.pending_description = kind
        self.webrtc.emit('set-local-description', description, self.promise(self.local_applied, epoch))
        return False

    def local_applied(self, promise, epoch):
        reply = promise.get_reply()
        if reply is not None and reply.has_field('error'):
            return self.fail('local description apply failed')
        return self.gathered(epoch)

    def gathered(self, epoch):
        if epoch != self.generation or self.pipeline is None or self.pending_description is None:
            return False
        if self.webrtc.get_property('ice-gathering-state') != GstWebRTC.WebRTCICEGatheringState.COMPLETE:
            return False
        description = self.webrtc.get_property('local-description')
        if description is not None:
            kind, self.pending_description = self.pending_description, None
            emit(event=kind, sdp=description.sdp.as_text())
        return False

    def remote(self, command):
        if self.pipeline is None:
            raise ValueError('session not active')
        kind = command.get('descriptionType', command.get('type'))
        sdp = command.get('sdp')
        if kind not in ('offer', 'answer') or not isinstance(sdp, str) or not 0 < len(sdp.encode()) < 100 * 1024:
            raise ValueError('valid bounded offer/answer SDP is required')
        if (kind == 'offer') != (self.role == 'answerer') or self.answer_set:
            raise ValueError('unexpected remote description for role or session')
        result, message = GstSdp.SDPMessage.new()
        if result != GstSdp.SDPResult.OK or GstSdp.sdp_message_parse_buffer(sdp.encode(), message) != GstSdp.SDPResult.OK:
            raise ValueError('SDP could not be parsed')
        description = GstWebRTC.WebRTCSessionDescription.new(
            GstWebRTC.WebRTCSDPType.OFFER if kind == 'offer' else GstWebRTC.WebRTCSDPType.ANSWER, message)
        self.answer_set = True
        self.webrtc.emit('set-remote-description', description, self.promise(
            lambda promise, epoch: self.remote_applied(promise, epoch, kind), self.generation))

    def remote_applied(self, promise, epoch, kind):
        if epoch != self.generation or self.pipeline is None:
            return False
        reply = promise.get_reply()
        if reply is not None and reply.has_field('error'):
            return self.fail('remote description apply failed')
        if kind == 'offer':
            self.webrtc.emit('create-answer', None, self.promise(lambda p, e: self.local_created(p, e, 'answer'), epoch))
        return False

    def connection_state(self, epoch):
        if self.pipeline is not None and epoch == self.generation:
            state = self.webrtc.get_property('connection-state').value_nick
            emit(event='state', state=state)
            if state in ('failed', 'closed'):
                self.fail('WebRTC connection ' + state)
        return False

    def bus_message(self, _bus, message, epoch):
        if epoch != self.generation or self.pipeline is None:
            return
        if message.type == Gst.MessageType.ERROR:
            error, _debug = message.parse_error()
            print('GStreamer error from ' + message.src.get_name() + ': ' + error.message, file=sys.stderr, flush=True)
            self.fail('native GStreamer pipeline error')
        elif message.type == Gst.MessageType.LATENCY:
            # Incoming WebRTC pads change the live graph after PLAYING.
            self.pipeline.recalculate_latency()
        elif message.type == Gst.MessageType.EOS:
            self.fail('unexpected native audio end-of-stream')
        elif message.type == Gst.MessageType.ELEMENT:
            structure = message.get_structure()
            if structure is not None and structure.get_name() == 'level':
                rms = structure.get_value('rms')
                level = max((10 ** (float(value) / 20) for value in rms if math.isfinite(float(value))), default=0)
                key = 'mic' if message.src.get_name() == 'mic_level' else 'assistant'
                now = time.monotonic()
                self.level_seen[key] = now
                self.levels[key] = min(1.0, level)
                # A live service may stop sending RTP during an interruption.
                # Silence then has no level message of its own; never retain a
                # positive speaker level forever and prevent the gate resuming.
                for channel in self.levels:
                    if now - self.level_seen[channel] > .25:
                        self.levels[channel] = 0.0
                emit(event='level', **self.levels)

    def controls(self, command):
        if self.pipeline is None:
            raise ValueError('session not active')
        kind = command['type']
        if kind in ('mute', 'outputMute') and not isinstance(command.get('muted'), bool):
            raise ValueError('muted must be boolean')
        if kind == 'mute':
            self.muted = command['muted']
            self.mic_volume.set_property('mute', self.muted)
            self.input_cutoff = self.running_time()
        elif kind == 'outputMute':
            self.output_muted = command['muted']
        elif kind == 'interrupt':
            self.interrupted = True
            self.increment('interrupts')
        elif kind == 'resume':
            self.output_cutoff = self.running_time()
            self.interrupted = False
        self.speaker_volume.set_property('mute', self.output_muted or self.interrupted)
        # Drain the bounded renderer as silent PCM. A downstream flush can return
        # FLUSHING upstream and permanently stop WebRTC reception.
        return dict(monotonicNs=time.monotonic_ns(), metrics=self.snapshot())

    def stop(self):
        pipeline, self.pipeline = self.pipeline, None
        if pipeline is not None:
            self.generation += 1
            self.channel = None
            self.channels = []
            pipeline.set_state(Gst.State.NULL)
            result, state, _pending = pipeline.get_state(5 * Gst.SECOND)
            if state != Gst.State.NULL:
                raise RuntimeError('native audio did not stop within deadline')
            self.bus.remove_signal_watch()
            self.webrtc = self.remote_pad = None
            emit(event='closed', metrics=self.snapshot(), monotonicNs=time.monotonic_ns())

    def fail(self, message):
        emit(event='error', message=message)
        try:
            self.stop()
        except Exception:
            emit(event='error', message='native cleanup failed')
        return False

    def command(self, command):
        identifier = command.get('id')
        kind = command.get('type')
        try:
            if kind == 'probe':
                missing = [name for name in REQUIRED if Gst.ElementFactory.find(name) is None]
                value = dict(available=not missing, missing=missing, gstreamer=Gst.version_string(), metrics=self.snapshot())
            elif kind == 'start':
                self.start(command)
                value = dict(pid=os.getpid(), metrics=self.snapshot())
            elif kind in ('remote', 'offer', 'answer'):
                self.remote(command)
                value = {}
            elif kind in ('mute', 'outputMute', 'interrupt', 'resume'):
                value = self.controls(command)
            elif kind == 'send':
                data = command.get('data')
                if not isinstance(data, str) or len(data.encode()) > 16 * 1024 or self.channel is None:
                    raise ValueError('bounded data and active channel required')
                self.channel.emit('send-string', data)
                value = {}
            elif kind == 'stop':
                self.stop()
                value = dict(metrics=self.snapshot())
            else:
                raise ValueError('unknown command')
            emit(id=identifier, ok=True, **value)
        except (ValueError, RuntimeError) as error:
            emit(id=identifier, ok=False, message=str(error))
            if kind in ('start', 'remote', 'offer', 'answer'):
                self.fail('session setup failed')
        except Exception as error:
            print('native helper operation failed: ' + type(error).__name__, file=sys.stderr, flush=True)
            emit(id=identifier, ok=False, message='native helper operation failed')
            self.fail('native helper operation failed')

    def read_commands(self):
        try:
            while True:
                raw = sys.stdin.buffer.readline(MAX_LINE + 1)
                if not raw:
                    GLib.idle_add(self.shutdown)
                    return
                if len(raw) > MAX_LINE:
                    raise ValueError('protocol input too large')
                message = json.loads(raw)
                if not isinstance(message, dict) or not isinstance(message.get('id'), (int, str)):
                    raise ValueError('command object with id required')
                self.commands.put_nowait(message)
        except (ValueError, UnicodeError, OSError, queue.Full):
            emit(event='error', message='invalid or overflowing command stream')
            GLib.idle_add(self.shutdown)

    def pump(self):
        for _ in range(8):
            try:
                command = self.commands.get_nowait()
            except queue.Empty:
                break
            self.command(command)
        if os.getppid() != self.parent:
            return self.shutdown()
        return not self.shutdown_requested

    def shutdown(self):
        self.shutdown_requested = True
        try:
            self.stop()
        finally:
            self.loop.quit()
        return False

    def run(self):
        # Linux parent-death notification plus PID polling closes orphan sessions.
        if sys.platform.startswith('linux'):
            try:
                ctypes.CDLL(None).prctl(1, signal.SIGTERM, 0, 0, 0)
            except (AttributeError, OSError):
                pass
        for number in (signal.SIGINT, signal.SIGTERM):
            GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, number, self.shutdown)
        threading.Thread(target=self.read_commands, daemon=True).start()
        GLib.timeout_add(10, self.pump)
        try:
            self.loop.run()
        finally:
            self.shutdown()


if __name__ == '__main__':
    Helper().run()
