#!/usr/bin/env python3
"""Digital Pulse-device/WebRTC acceptance; never claims physical-device success."""
import argparse
import array
import collections
import importlib.util
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import types
import uuid
import wave

RATE = 48000
TONES = (613, 997, 1499)
ANALYSIS_SAMPLES = RATE // 100  # Fixed 10ms windows, independent of Pulse buffer size.
AUDIBLE_RMS = .004


def analyze(data, at):
    values = array.array('h', data)
    if sys.byteorder != 'little':
        values.byteswap()
    count = len(values)
    amplitudes = {}
    for frequency in TONES:
        coefficient = 2 * math.cos(2 * math.pi * frequency / RATE)
        a = b = 0.0
        for value in values:
            c = value + coefficient * a - b
            b, a = a, c
        amplitudes[frequency] = math.sqrt(max(0, a*a + b*b - coefficient*a*b)) / count / 32768
    return {'at': at, 'duration': count / RATE,
            'rms': math.sqrt(sum(v*v for v in values) / count) / 32768,
            'amplitudes': amplitudes, 'data': data}


def command(*args):
    return subprocess.check_output(args, text=True, timeout=5).strip()


def configured_pipewire_defaults():
    """Preserve an unset preference as unset, not a Pulse default alias."""
    for value in json.loads(command('pw-dump')):
        if value.get('type') == 'PipeWire:Interface:Metadata' and value.get('props', {}).get('metadata.name') == 'default':
            return {item['key']: {'type': item['type'], 'value': item['value']}
                    for item in value.get('metadata', []) if item.get('subject') == 0
                    and item.get('key') in ('default.configured.audio.source', 'default.configured.audio.sink')}
    raise RuntimeError('PipeWire default metadata is not ready')


def restore_pipewire_defaults(previous):
    for kind in ('source', 'sink'):
        key = 'default.configured.audio.' + kind
        if key in previous:
            item = previous[key]
            value = item['value'] if isinstance(item['value'], str) else json.dumps(item['value'])
            command('pw-metadata', '-n', 'default', '0', key, value, item['type'])
        else:
            # Delete this preference only; never clear the metadata object.
            command('pw-metadata', '-n', 'default', '-d', '0', key)


def default_names_match(previous, current, configured, prefix):
    for kind, device in previous.items():
        actual = current.get(kind)
        if actual == device:
            continue
        # A previously unresolved alias is not a concrete device to restore.
        # Its original absent preference must be restored independently, and
        # policy resolution must not point at one of our temporary devices.
        if configured is None or 'default.configured.audio.' + kind in configured \
                or device != '@DEFAULT_' + kind.upper() + '@' or not actual \
                or prefix and actual.startswith(prefix):
            return False
    return True


def fixture_identity(Gst, element, identifier):
    properties = Gst.Structure.new_empty('props')
    properties.set_value('application.name', identifier)
    properties.set_value('application.id', identifier)
    properties.set_value('media.name', identifier)
    element.set_property('client-name', identifier)
    element.set_property('stream-properties', properties)


class Peer:
    def __init__(self, helper, name, output, reader=None, writer=None, pid=None):
        self.events, self.lock = [], threading.Condition()
        self.sequence = 0
        self.process = None
        self.name = name
        if reader is None:
            self.stderr = open(output / (name + '.stderr.log'), 'wb')
            self.process = subprocess.Popen([sys.executable, str(helper)], stdin=subprocess.PIPE,
                                            stdout=subprocess.PIPE, stderr=self.stderr)
            reader, writer, pid = self.process.stdout, self.process.stdin, self.process.pid
        self.reader, self.writer, self.pid = reader, writer, pid
        self.thread = threading.Thread(target=self.read, daemon=True)
        self.thread.start()

    def read(self):
        for raw in self.reader:
            try:
                event = json.loads(raw)
            except (ValueError, UnicodeError):
                continue
            event['_at'] = time.monotonic()
            with self.lock:
                self.events.append(event)
                self.lock.notify_all()

    def send(self, kind, **values):
        self.sequence += 1
        identifier = self.name + '-' + str(self.sequence)
        self.writer.write((json.dumps({'id': identifier, 'type': kind, **values}) + '\n').encode())
        self.writer.flush()
        return identifier

    def wait(self, kind, seconds=12, after=0, state=None):
        deadline = time.monotonic() + seconds
        with self.lock:
            while True:
                for event in self.events:
                    if event['_at'] < after:
                        continue
                    tag = event.get('type', event.get('event'))
                    if tag == 'error' or event.get('ok') is False:
                        raise RuntimeError(self.name + ': ' + str(event.get('code', event.get('message', 'helper error')))[:240])
                    if (event.get('id') == kind or tag == kind) and (state is None or event.get('state') == state):
                        return event
                if time.monotonic() >= deadline:
                    raise TimeoutError(self.name + ' missing ' + kind + (':' + state if state else ''))
                self.lock.wait(min(.1, deadline - time.monotonic()))

    def safe_events(self):
        return [{k: e[k] for k in ('type', 'event', 'state', 'code') if k in e} for e in self.events]

    def shutdown(self):
        try:
            self.writer.close()
        except (OSError, ValueError):
            pass
        if self.process and self.process.poll() is None:
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
        if hasattr(self, 'stderr'):
            self.stderr.close()


class Monitor:
    def __init__(self, Gst, source, identifier):
        self.Gst, self.frames, self.lock = Gst, collections.deque(maxlen=12000), threading.Lock()
        self.pending = b''
        self.pipeline = Gst.parse_launch(
            'pulsesrc name=monitor_source device=' + source + ' do-timestamp=true buffer-time=40000 latency-time=10000 '
            '! audioconvert ! audioresample ! audio/x-raw,format=S16LE,rate=48000,channels=1 '
            '! appsink name=capture emit-signals=true sync=false max-buffers=32 drop=true')
        self.pipeline.get_by_name('capture').connect('new-sample', self.sample)
        fixture_identity(Gst, self.pipeline.get_by_name('monitor_source'), identifier)
        if self.pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError('Pulse monitor could not start: ' + source)

    def sample(self, sink):
        sample = sink.emit('pull-sample')
        if not sample:
            return self.Gst.FlowReturn.ERROR
        buf = sample.get_buffer()
        ok, mapped = buf.map(self.Gst.MapFlags.READ)
        if not ok:
            return self.Gst.FlowReturn.ERROR
        data = bytes(mapped.data)
        buf.unmap(mapped)
        data = self.pending + data
        step = ANALYSIS_SAMPLES * 2
        complete = len(data) // step * step
        end = time.monotonic()
        frames = [analyze(data[offset:offset+step], end - (len(data)-offset-step) / (RATE*2))
                  for offset in range(0, complete, step)]
        self.pending = data[complete:]
        with self.lock:
            self.frames.extend(frames)
        return self.Gst.FlowReturn.OK

    def between(self, start, end):
        with self.lock:
            return [f for f in self.frames if start <= f['at'] <= end]

    def stop(self):
        self.pipeline.set_state(self.Gst.State.NULL)


def stats(monitor, start, end, frequency=None):
    frames = monitor.between(start, end)
    if not frames:
        return {'frames': 0, 'coverage': 0, 'meanRms': 0, 'toneFraction': 0,
                'toneDurationFraction': 0, 'maxGapMs': None,
                'maxUnobservedGapMs': (end-start) * 1000,
                'longestInternalMissingToneMs': None, 'longestAudibleMs': 0, 'maxAudibleRms': 0}
    duration = sum(f['duration'] for f in frames)
    expected = [bool(frequency and f['rms'] > .002 and f['amplitudes'].get(frequency, 0) > .0007
                     and f['amplitudes'].get(frequency, 0) > max(
                         [v for k, v in f['amplitudes'].items() if k != frequency] or [0]) * 2)
                for f in frames]
    missing = longest_missing = audible = longest_audible = 0.0
    seen_tone = False
    for f, positive in zip(frames, expected):
        if positive:
            if seen_tone:
                longest_missing = max(longest_missing, missing)
            seen_tone = True
            missing = 0.0
        elif seen_tone:
            missing += f['duration']
        audible = audible + f['duration'] if f['rms'] > AUDIBLE_RMS else 0.0
        longest_audible = max(longest_audible, audible)
    gaps = [max(0, b['at'] - a['at'] - b['duration']) for a, b in zip(frames, frames[1:])]
    unobserved = [max(0, frames[0]['at'] - frames[0]['duration'] - start),
                  *gaps, max(0, end - frames[-1]['at'])]
    return {'frames': len(frames), 'coverage': duration / (end - start),
            'meanRms': sum(f['rms'] * f['duration'] for f in frames) / duration,
            'peakRms': max(f['rms'] for f in frames), 'toneFraction': sum(expected) / len(frames),
            'toneDurationFraction': sum(f['duration'] for f, yes in zip(frames, expected) if yes) / duration,
            'longestInternalMissingToneMs': longest_missing * 1000,
            'longestAudibleMs': longest_audible * 1000,
            'maxAudibleRms': max([f['rms'] for f in frames if f['rms'] > AUDIBLE_RMS] or [0]),
            'maxUnobservedGapMs': max(unobserved) * 1000,
            'maxGapMs': max(gaps or [0]) * 1000}


def tone_ok(value):
    return value['frames'] >= 10 and value['coverage'] > .65 and value['meanRms'] > .002 \
        and value['toneDurationFraction'] >= .98 - 1e-9 \
        and value['longestInternalMissingToneMs'] < 40 - 1e-6 \
        and value['maxUnobservedGapMs'] < 40 - 1e-6


def quiet_ok(value, baseline):
    return value['frames'] >= 5 and value['coverage'] > .6 \
        and value['meanRms'] < max(.004, baseline * .12) and value['longestAudibleMs'] < 20 - 1e-6 \
        and value['maxUnobservedGapMs'] < 40 - 1e-6


def memory_guards():
    """Exercise the same PCM analyzer and gates without GI, hardware or timing."""
    def frames(frequencies):
        result = []
        for index, frequency in enumerate(frequencies):
            values = array.array('h', (int(.24*32767*math.sin(2*math.pi*frequency*(index*ANALYSIS_SAMPLES+n)/RATE))
                                      if frequency else 0 for n in range(ANALYSIS_SAMPLES)))
            if sys.byteorder != 'little':
                values.byteswap()
            result.append(analyze(values.tobytes(), (index+1)/100))
        return result
    class MemoryMonitor:
        def __init__(self, values):
            self.values = values
        def between(self, _start, _end):
            return self.values
    cases = {'normal': [613]*200, 'dropout40ms': [613]*80+[0]*4+[613]*116,
             'dropout60ms': [613]*80+[0]*6+[613]*114,
             'oldAudioBurst40ms': [0]*80+[613]*4+[0]*116,
             'wrongFrequency': [997]*200, 'silence': [0]*200}
    results = {}
    for name, frequencies in cases.items():
        value = stats(MemoryMonitor(frames(frequencies)), 0, 2, 613)
        results[name] = {'metrics': value, 'toneAccepted': tone_ok(value), 'quietAccepted': quiet_ok(value, .17)}
    for name, frequency in (('unobserved80ms', 613), ('quietUnobserved80ms', 0)):
        observed = frames([frequency]*200)
        del observed[80:88]  # Missing observations, not zero-valued or filled-in audio.
        value = stats(MemoryMonitor(observed), 0, 2, 613)
        results[name] = {'metrics': value, 'toneAccepted': tone_ok(value), 'quietAccepted': quiet_ok(value, .17)}
    expected = {'normal': (True, False), 'dropout40ms': (False, False), 'dropout60ms': (False, False),
                'oldAudioBurst40ms': (False, False), 'wrongFrequency': (False, False), 'silence': (False, True),
                'unobserved80ms': (False, False), 'quietUnobserved80ms': (False, False)}
    return {'cases': results, 'passed': all((results[k]['toneAccepted'], results[k]['quietAccepted']) == v
                                          for k, v in expected.items())}


def pulse_streams(pids):
    found = []
    for group in ('sink-inputs', 'source-outputs'):
        for value in json.loads(command('pactl', '-f', 'json', 'list', group)):
            if str(value.get('properties', {}).get('application.process.id', '')) in {str(p) for p in pids}:
                found.append({'kind': group, 'index': value.get('index')})
    return found


def helper_level_cache_guard(helper_path):
    """Simulated bus messages exercise the actual helper; no media acceptance."""
    spec = importlib.util.spec_from_file_location('dsh_native_level_regression', helper_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    helper = module.Helper()
    helper.pipeline = object()  # Only satisfy the bus handler's active-generation guard.
    helper.generation = 1
    clock, emitted, cases = [100.0], [], {}
    real_clock, real_emit = module.time.monotonic, module.emit

    def level_message(channel, decibels):
        structure = types.SimpleNamespace(get_name=lambda: 'level',
            get_value=lambda name: [decibels] if name == 'rms' else None)
        source = types.SimpleNamespace(get_name=lambda: channel + '_level')
        return types.SimpleNamespace(type=module.Gst.MessageType.ELEMENT,
            src=source, get_structure=lambda: structure)

    try:
        module.time.monotonic = lambda: clock[0]
        module.emit = lambda **message: emitted.append(dict(message))
        helper.bus_message(None, level_message('assistant', -6), 1)
        clock[0] = 100.20
        helper.bus_message(None, level_message('mic', -20), 1)
        cases['freshAssistantSurvivesMicFrame'] = math.isclose(
            emitted[-1]['assistant'], 10 ** (-6 / 20), rel_tol=1e-9)
        clock[0] = 100.30  # Assistant RTP has stopped; only the microphone reports a level.
        helper.bus_message(None, level_message('mic', -20), 1)
        cases['micFrameExpiresStaleAssistant'] = emitted[-1]['assistant'] == 0 \
            and emitted[-1]['mic'] > 0
        clock[0] = 100.31
        helper.bus_message(None, level_message('assistant', -3), 1)
        cases['newAssistantRestoresLevelImmediately'] = math.isclose(
            emitted[-1]['assistant'], 10 ** (-3 / 20), rel_tol=1e-9)
        helper.reset_metrics()
        cases['resetMetricsClearsLevelsAndTimestamps'] = \
            helper.levels == {'mic': 0.0, 'assistant': 0.0} \
            and helper.level_seen == {'mic': 0.0, 'assistant': 0.0}
    finally:
        module.emit = real_emit
        module.time.monotonic = real_clock
        helper.pipeline = None
        helper.loop.quit()
    return {'simulationOnly': True, 'cases': cases, 'passed': all(cases.values())}


def default_device_bindings(pid, capture, playback):
    """Resolve this helper's live Pulse streams to actual source/sink names."""
    bindings = []
    for streams, devices, field, expected in (
            ('source-outputs', 'sources', 'source', capture),
            ('sink-inputs', 'sinks', 'sink', playback)):
        targets = {value['index']: value['name']
                   for value in json.loads(command('pactl', '-f', 'json', 'list', devices))}
        for stream in json.loads(command('pactl', '-f', 'json', 'list', streams)):
            props = stream.get('properties', {})
            if str(props.get('application.process.id', '')) != str(pid):
                continue
            actual = targets.get(stream.get(field))
            bindings.append({'kind': streams, 'index': stream.get('index'),
                'pid': pid, 'deviceIndex': stream.get(field), 'deviceName': actual,
                'applicationName': props.get('application.name'),
                'applicationId': props.get('application.id'), 'expectedDevice': expected,
                'matched': actual == expected and props.get('application.name') == 'DSH Voice'
                    and props.get('application.id') == 'com.dsh.codex-subscription.voice'})
    selected = len(bindings) == 2 and {v['kind'] for v in bindings} == {'source-outputs', 'sink-inputs'} \
        and all(value['matched'] for value in bindings)
    return {'bindings': bindings, 'passed': selected}


def fixture_device_bindings(devices, prefix):
    expected = {prefix + '.monitor.' + name: ('source-outputs', device + '.monitor')
                for name, device in devices.items()}
    expected.update({prefix + '.injector.' + name: ('sink-inputs', devices[name])
                     for name in ('mic_a', 'mic_b')})
    bindings = []
    for streams, targets, field in (('source-outputs', 'sources', 'source'), ('sink-inputs', 'sinks', 'sink')):
        names = {value['index']: value['name']
                 for value in json.loads(command('pactl', '-f', 'json', 'list', targets))}
        for stream in json.loads(command('pactl', '-f', 'json', 'list', streams)):
            props = stream.get('properties', {})
            identifier = props.get('application.id')
            if identifier not in expected or str(props.get('application.process.id', '')) != str(os.getpid()):
                continue
            wanted_kind, wanted_device = expected[identifier]
            actual = names.get(stream.get(field))
            bindings.append({'applicationId': identifier, 'kind': streams, 'index': stream['index'],
                             'deviceName': actual, 'expectedDevice': wanted_device,
                             'matched': streams == wanted_kind and actual == wanted_device})
    selected = len(bindings) == len(expected) and {item['applicationId'] for item in bindings} == set(expected) \
        and all(item['matched'] for item in bindings)
    return {'bindings': bindings, 'passed': selected}


def alive(pid):
    try:
        text = Path('/proc/' + str(pid) + '/stat').read_text()
        return text[text.rfind(')') + 2:].split()[0] != 'Z'
    except FileNotFoundError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--helper', type=Path, default=Path('native/linux-voice-helper.py'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    report = {'digitalPulseDevices': True, 'physicalMicrophoneVerified': False,
              'physicalSpeakerVerified': False, 'fakeSinkUsed': False, 'phases': {},
              'checks': {}, 'helper': str(args.helper.resolve()), 'passed': False}
    modules, peers, monitors, generators = [], [], {}, []
    previous_defaults = None
    previous_configured_defaults = None
    prefix = None
    Gst = loop = supervisor = grandchild = None
    began = time.monotonic()
    try:
        guards = memory_guards()
        report['memoryNegativeGuards'] = guards
        report['checks']['memoryNegativeGuardsRejectDropoutsAndOldAudio'] = guards['passed']
        (output / 'negative-guards.json').write_text(json.dumps(guards, indent=2) + '\n')
        if not guards['passed']:
            raise AssertionError('Pure PCM negative guards did not reject a defective signal')
        import gi
        gi.require_version('Gst', '1.0')
        from gi.repository import Gst, GLib
        Gst.init(None)
        level_guard = helper_level_cache_guard(args.helper.resolve())
        report['helperLevelCacheSimulation'] = level_guard
        report['checks']['helperLevelCacheExpiresWithoutAssistantRtp'] = level_guard['passed']
        if not level_guard['passed']:
            raise AssertionError('Actual helper bus handler retained stale speaker levels')
        previous_defaults = {'source': command('pactl', 'get-default-source'),
                             'sink': command('pactl', 'get-default-sink')}
        report['defaultDevices'] = {'before': previous_defaults, 'restored': False}
        report['pulseServer'] = 'pipewire-pulse' if 'PipeWire' in command('pactl', 'info') else 'pulseaudio'
        if report['pulseServer'] == 'pipewire-pulse':
            previous_configured_defaults = configured_pipewire_defaults()
            report['defaultDevices']['configuredBefore'] = previous_configured_defaults
        loop = GLib.MainLoop()
        threading.Thread(target=loop.run, daemon=True).start()
        prefix = 'dsh_native_' + uuid.uuid4().hex[:10]
        devices = {}
        for name in ('mic_a', 'mic_b', 'speaker_a', 'speaker_b'):
            device = prefix + '_' + name
            modules.append(command('pactl', 'load-module', 'module-null-sink', 'sink_name=' + device,
                                   'rate=48000', 'channels=1', 'format=s16le'))
            devices[name] = device
        # Establish the fixture before opening any streams: a session manager
        # may move already-open streams when the system default changes.
        command('pactl', 'set-default-source', devices['mic_a'] + '.monitor')
        command('pactl', 'set-default-sink', devices['speaker_a'])
        report['defaultDevices']['during'] = {'source': command('pactl', 'get-default-source'),
                                              'sink': command('pactl', 'get-default-sink')}
        for name, device in devices.items():
            monitors[name] = Monitor(Gst, device + '.monitor', prefix + '.monitor.' + name)
        report['gstreamerVersion'] = Gst.version_string()
        for name, frequency in (('mic_a', 613), ('mic_b', 997)):
            pipeline = Gst.parse_launch('audiotestsrc name=tone is-live=true samplesperbuffer=480 wave=sine freq=' + str(frequency)
                + ' volume=0 ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,rate=48000,channels=1 '
                + '! queue max-size-buffers=4 max-size-time=40000000 max-size-bytes=0 '
                + '! pulsesink name=injection device=' + devices[name]
                + ' sync=true buffer-time=40000 latency-time=10000')
            fixture_identity(Gst, pipeline.get_by_name('injection'), prefix + '.injector.' + name)
            if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
                raise RuntimeError('Native pulse tone injection failed')
            generators.append(pipeline)

        def change_source(generator, label, **properties):
            requested = time.monotonic()
            source = generator.get_by_name('tone')
            for key, value in properties.items():
                source.set_property(key, value)
            sink = generator.get_by_name('injection')
            _, state, pending = generator.get_state(0)
            report.setdefault('sourceChanges', []).append({
                'label': label, 'requestedAfterStartMs': (requested - began) * 1000,
                'setterReturnedAfterStartMs': (time.monotonic() - began) * 1000,
                'volume': source.get_property('volume'), 'frequency': source.get_property('freq'),
                'samplesPerBuffer': source.get_property('samplesperbuffer'),
                'pipelineState': state.value_nick, 'pendingState': pending.value_nick,
                'sinkSync': sink.get_property('sync'), 'sinkBufferTimeUs': sink.get_property('buffer-time'),
                'sinkLatencyTimeUs': sink.get_property('latency-time')})
            return requested
        a, b = [Peer(args.helper.resolve(), name, output) for name in ('peer-a', 'peer-b')]
        peers.extend((a, b))
        for peer in peers:
            response = peer.wait(peer.send('probe'), 5)
            report.setdefault('capabilities', {})[peer.name] = response
            if response.get('ok') is not True or response.get('available') is not True:
                raise RuntimeError('Native helper capabilities unavailable: ' + ','.join(response.get('missing', [])))
        b.send('start', role='answerer', inputDevice=devices['mic_b'] + '.monitor', outputDevice=devices['speaker_b'], captureAllowed=True)
        a.send('start', role='offerer', captureAllowed=True)
        b.send('remote', descriptionType='offer', sdp=a.wait('offer')['sdp'])
        a.send('remote', descriptionType='answer', sdp=b.wait('answer')['sdp'])
        for peer in peers:
            peer.wait('state', state='connected')
        report['checks']['twoNativePeersConnected'] = True
        for index, generator in enumerate(generators):
            change_source(generator, 'initial-tone-' + str(index), volume=.24)
        def window(name, settle=.35, duration=1.25, new_tone=False):
            phase_start = time.monotonic()
            time.sleep(settle)
            start = time.monotonic(); time.sleep(duration); end = time.monotonic()
            if name == 'duplex':
                # Connected precedes the first decoded packet and Pulse sink.
                # Record live routes before any baseline pass/fail assertion,
                # once this unchanged observation window has actually played.
                selected = default_device_bindings(a.pid, devices['mic_a'] + '.monitor', devices['speaker_a'])
                report['defaultDevices']['peerA'] = selected
                report['defaultDevices']['peerB'] = default_device_bindings(
                    b.pid, devices['mic_b'] + '.monitor', devices['speaker_b'])
                report['checks']['defaultDevicesSelectedByAlias'] = selected['passed']
            values = {key: stats(value, start, end, (1499 if new_tone else 613) if key in ('mic_a', 'speaker_b') else 997)
                      for key, value in monitors.items()}
            report['phases'][name] = values
            # Preserve each attempt, including settling PCM, without padding,
            # truncating or pretending the four independent clocks are aligned.
            evidence = report.setdefault('phaseEvidence', [])
            item = {'name': name, 'attempt': 1 + sum(v['name'] == name for v in evidence),
                    'phaseStartAfterBeginningMs': (phase_start - began) * 1000,
                    'measurementStartAfterPhaseMs': (start - phase_start) * 1000,
                    'measurementEndAfterPhaseMs': (end - phase_start) * 1000,
                    'channels': {}, 'helperMetrics': {}, 'statistics': values}
            for key, monitor in monitors.items():
                frames = monitor.between(phase_start, end)
                filename = 'phase-%02d-%s-%s.wav' % (len(evidence) + 1, name, key)
                pcm = b''.join(frame['data'] for frame in frames)
                with wave.open(str(output / filename), 'wb') as wav:
                    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE)
                    wav.writeframes(pcm)
                item['channels'][key] = {'wav': filename, 'samples': len(pcm) // 2,
                    'frameEndAfterPhaseMs': [(frame['at'] - phase_start) * 1000 for frame in frames],
                    'frameSamples': [len(frame['data']) // 2 for frame in frames]}
            allowed_metrics = ('captureBuffers', 'captureSamples', 'rtpSent', 'rtpReceived',
                'decodedBuffers', 'playbackBuffers', 'rtpBlockedByMute', 'rtpSentWhileMuted',
                'staleInputDropped', 'staleOutputDropped', 'interrupts', 'dataMessagesReceived',
                'active', 'uptimeMs', 'muted', 'outputMuted', 'interrupted', 'generation')
            for peer in (a, b):
                with peer.lock:
                    levels = [event for event in peer.events
                              if event.get('event') == 'level' and start <= event['_at'] <= end]
                # Existing bus levels are after webrtcdsp / after decoding.
                # Diagnostic only: the independent PCM gates stay authoritative.
                item.setdefault('postDspLevelSummary', {})[peer.name] = {
                    channel: {'events': len(levels),
                              'mean': sum(event.get(channel, 0) for event in levels) / len(levels) if levels else None,
                              'min': min((event.get(channel, 0) for event in levels), default=None),
                              'max': max((event.get(channel, 0) for event in levels), default=None),
                              'belowAudibleFraction': sum(event.get(channel, 0) < AUDIBLE_RMS for event in levels) / len(levels) if levels else None}
                    for channel in ('mic', 'assistant')}
                try:
                    response = peer.wait(peer.send('probe'), 2)
                    metrics = response.get('metrics', {})
                    item['helperMetrics'][peer.name] = {key: metrics[key] for key in allowed_metrics
                        if key in metrics and isinstance(metrics[key], (int, float, bool))}
                except Exception as error:
                    item['helperMetrics'][peer.name] = {'probeError': type(error).__name__}
            evidence.append(item)
            if name == 'duplex':
                item['fixturePulseRoutes'] = fixture_device_bindings(devices, prefix)
                if not item['fixturePulseRoutes']['passed']:
                    raise AssertionError('Monitor or injector Pulse stream moved away from its explicit device')
            return values, start, end

        baseline = None
        for attempt in range(3):
            values, proof_start, proof_end = window('duplex', .4, 1.5)
            if tone_ok(values['speaker_a']) and tone_ok(values['speaker_b']):
                baseline = values; break
        if baseline is None:
            raise AssertionError('No continuous spectral proof of both actual Pulse speaker outputs')
        report['checks']['bidirectionalNativeDeviceOpusWebRTCPlayback'] = True
        report['checks']['knownInputWaveformsPresent'] = all(tone_ok(baseline[name]) for name in ('mic_a', 'mic_b'))
        # Short stereo evidence: left speaker A (997Hz), right speaker B (613Hz).
        tracks = [b''.join(f['data'] for f in monitors[name].between(proof_start, proof_end)) for name in ('speaker_a', 'speaker_b')]
        count = min(len(data) // 2 for data in tracks)
        left, right = [array.array('h', data[:count*2]) for data in tracks]
        stereo = array.array('h', (v for pair in zip(left, right) for v in pair))
        with wave.open(str(output / 'native-webrtc-proof.wav'), 'wb') as wav:
            wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(RATE); wav.writeframes(stereo.tobytes())

        a.send('mute', muted=True)
        muted, _, _ = window('capture-muted', .5)
        report['checks']['captureMute'] = quiet_ok(muted['speaker_b'], baseline['speaker_b']['meanRms']) and tone_ok(muted['mic_a']) and tone_ok(muted['speaker_a'])
        a.send('mute', muted=False)
        restored, _, _ = window('capture-resumed', .5)
        report['checks']['captureResume'] = tone_ok(restored['speaker_b'])
        b.send('outputMute', muted=True)
        muted, _, _ = window('output-muted', .25)
        report['checks']['outputMute'] = quiet_ok(muted['speaker_b'], baseline['speaker_b']['meanRms']) and tone_ok(muted['mic_a'])
        b.send('outputMute', muted=False)
        restored, _, _ = window('output-resumed', .3)
        report['checks']['outputResume'] = tone_ok(restored['speaker_b'])

        interrupted_at = time.monotonic(); b.send('interrupt')
        interrupted, _, _ = window('interrupted', .1, 1)
        frames = monitors['speaker_b'].between(interrupted_at, time.monotonic())
        quiet_threshold = max(.004, baseline['speaker_b']['meanRms'] * .12)
        quiet_run, quiet_at = 0, None
        for frame in frames:
            quiet_run = quiet_run + 1 if frame['rms'] < quiet_threshold else 0
            if quiet_run >= 3:
                quiet_at = frame['at']; break
        latency = None if quiet_at is None else (quiet_at - interrupted_at) * 1000
        report['interruptQuietLatencyMs'] = latency
        report['latencyClock'] = 'Pulse monitor sample-arrival timestamps, includes monitor/GStreamer buffering; not acoustic latency'
        report['checks']['interruptQuietWithin500ms'] = latency is not None and latency < 500 and quiet_ok(interrupted['speaker_b'], baseline['speaker_b']['meanRms'])
        change_source(generators[0], 'silence-and-select-fresh-frequency', volume=0, freq=1499)
        time.sleep(.8)
        b.send('resume')
        empty, _, _ = window('resumed-before-new-audio', .02, .65)
        report['checks']['resumeDoesNotReplayQueuedOldAudio'] = quiet_ok(empty['speaker_b'], baseline['speaker_b']['meanRms'])
        fresh_requested = change_source(generators[0], 'start-fresh-tone', volume=.24)
        fresh, _, fresh_end = window('fresh-tone-after-resume', .3, 1.3, True)
        run = 0
        for frame in monitors['mic_a'].between(fresh_requested, fresh_end):
            amplitudes = frame['amplitudes']
            match = frame['rms'] > .002 and amplitudes[1499] > .0007 and all(
                amplitudes[1499] > 2 * amplitudes[frequency] for frequency in TONES if frequency != 1499)
            run = run + 1 if match else 0
            if run == 3:
                report['freshToneObservedAtInputAfterSetterMs'] = (frame['at'] - fresh_requested) * 1000
                break
        report['checks']['freshInputToneContinuous'] = tone_ok(fresh['mic_a'])
        report['checks']['resumePlaysOnlyFreshFrequency'] = tone_ok(fresh['speaker_b'])

        for peer in peers:
            stamp = time.monotonic(); peer.send('stop'); peer.wait('closed', 4, after=stamp)
        report['checks']['stopReleasesPulseStreams'] = not pulse_streams([a.pid, b.pid])
        for peer in peers:
            peer.writer.close(); peer.process.wait(timeout=4)
        report['checks']['stoppedThenEOFExits'] = all(peer.process.returncode == 0 for peer in peers)
        eof = Peer(args.helper.resolve(), 'eof-active', output); peers.append(eof)
        eof.send('start', role='offerer', inputDevice=devices['mic_a'] + '.monitor', outputDevice=devices['speaker_a'], captureAllowed=True)
        eof.wait('offer'); eof.writer.close(); eof.process.wait(timeout=4)
        report['checks']['EOFWhileActiveExitsAndReleases'] = eof.process.returncode == 0 and not pulse_streams([eof.pid])

        # Keep both helper pipes open in THIS process. Killing its actual parent
        # therefore cannot accidentally pass merely by delivering stdin EOF.
        in_read, in_write = os.pipe(); out_read, out_write = os.pipe()
        supervisor_code = 'import subprocess,sys,time; p=subprocess.Popen([sys.executable,sys.argv[1]],stdin=int(sys.argv[2]),stdout=int(sys.argv[3]),stderr=subprocess.DEVNULL); print(p.pid,flush=True); time.sleep(120)'
        supervisor = subprocess.Popen([sys.executable, '-c', supervisor_code, str(args.helper.resolve()), str(in_read), str(out_write)],
                                      pass_fds=(in_read, out_write), stdout=subprocess.PIPE)
        os.close(in_read); os.close(out_write)
        child_pid = int(supervisor.stdout.readline())
        grandchild = Peer(args.helper.resolve(), 'parent-death', output, os.fdopen(out_read, 'rb'), os.fdopen(in_write, 'wb'), child_pid)
        peers.append(grandchild)
        grandchild.send('start', role='offerer', inputDevice=devices['mic_a'] + '.monitor', outputDevice=devices['speaker_a'], captureAllowed=True)
        grandchild.wait('offer')
        supervisor.kill(); supervisor.wait(timeout=2)
        until = time.monotonic() + 4
        while alive(child_pid) and time.monotonic() < until:
            time.sleep(.05)
        report['checks']['parentDeathExitsWithoutEOF'] = not alive(child_pid)
        report['checks']['parentDeathReleasesPulseStreams'] = not pulse_streams([child_pid])
        report['passed'] = all(report['checks'].values())
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)[:500]
    finally:
        report['events'] = {peer.name: peer.safe_events() for peer in peers}
        for peer in peers:
            peer.shutdown()
        if grandchild and alive(grandchild.pid):
            os.kill(grandchild.pid, signal.SIGKILL)  # failed-test containment only, never a passing proof
            report['failedGrandchildForcedCleanup'] = True
        if supervisor and supervisor.poll() is None:
            supervisor.kill(); supervisor.wait()
        if Gst:
            for generator in generators:
                generator.set_state(Gst.State.NULL)
            for monitor in monitors.values():
                monitor.stop()
        for module in reversed(modules):
            try:
                command('pactl', 'unload-module', module)
            except Exception:
                report['moduleCleanupFailed'] = True
        if previous_defaults is not None:
            # A fresh server may recreate its original auto-null device only
            # after our null sinks disappear. Retry cleanup briefly, never media.
            for attempt in range(5):
                restored, restore_errors = {}, {}
                configured_restored = True
                if previous_configured_defaults is not None:
                    try:
                        restore_pipewire_defaults(previous_configured_defaults)
                        configured_after = configured_pipewire_defaults()
                        report['defaultDevices']['configuredAfter'] = configured_after
                        configured_restored = configured_after == previous_configured_defaults
                    except Exception as error:
                        restore_errors['configured'] = type(error).__name__
                        configured_restored = False
                for kind, device in previous_defaults.items():
                    try:
                        if previous_configured_defaults is None:
                            command('pactl', 'set-default-' + kind, device)
                        restored[kind] = command('pactl', 'get-default-' + kind)
                    except Exception as error:
                        restore_errors[kind] = type(error).__name__
                if default_names_match(previous_defaults, restored, previous_configured_defaults, prefix) and configured_restored:
                    break
                if attempt < 4:
                    time.sleep(.05)
            report['defaultDevices']['after'] = restored
            report['defaultDevices']['restored'] = default_names_match(
                previous_defaults, restored, previous_configured_defaults, prefix) and configured_restored
            if not report['defaultDevices']['restored']:
                report['defaultDevicesRestoreFailed'] = True
                report['defaultDevices']['restoreErrors'] = restore_errors
        if loop:
            loop.quit()
        report['elapsedSeconds'] = time.monotonic() - began
        report['evidenceWav'] = 'native-webrtc-proof.wav' if (output / 'native-webrtc-proof.wav').exists() else None
        if report.get('failedGrandchildForcedCleanup') or report.get('moduleCleanupFailed') or report.get('defaultDevicesRestoreFailed'):
            report['passed'] = False
        (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
