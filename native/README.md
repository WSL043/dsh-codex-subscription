# Native Linux voice experiment

`linux-voice-helper.py` is an independent Python/GI GStreamer process. It is not
loaded by the plugin, does not change WebKit, and never accepts account credentials.
No audio samples cross Python/JavaScript IPC. No dependencies are installed by it.

Runtime prerequisites: Python GI with Gst/GstSdp/GstWebRTC 1.0 introspection,
libnice, Opus RTP plugins, PulseAudio source/sink plugins and webrtcdsp. PulseAudio
can be supplied by PipeWire's Pulse server. `probe` reports missing factories
without constructing a pipeline or opening audio devices.

One bounded JSON object per line (128 KiB), with `id` and **`type`**. Replies contain
the same id and `ok`. stdout is protocol only; stderr contains native diagnostics.

- `probe`: capabilities plus counters; safe before start and useful while active.
- `start`: requires `captureAllowed:true`; optional `inputDevice`/`outputDevice`
  are Pulse device names, never pipeline fragments. `role` is `offerer` (default)
  or `answerer`. Only one session per process; stop permits a fresh start.
- `remote`: `descriptionType:'offer'|'answer'`, `sdp`. The `offer` and `answer`
  command types are aliases. Commands acknowledge description dispatch; connection
  readiness is asynchronous. Local `offer`/`answer` events wait for complete ICE.
- `mute`, `outputMute`: require `muted:boolean`. Microphone mute silences the
  encoder input while continuing silent RTP to preserve the receiver's clock;
  already-buffered pre-mute packets are discarded. It does not revoke the previously permitted
  native device capture. Assistant level is measured before output mute.
- `interrupt`: suppresses output and flushes local speaker storage. RTP and decoder
  keep draining. `resume` discards stale timestamped output and restores playback
  only if `outputMute` is not active. Acknowledgements include monotonicNs.
- `send`: optional bounded `data` string for data-channel tests. Received text is
  never echoed; `data` events contain only byte count.
- `stop`: sets the whole pipeline NULL and reports `closed` with counters. EOF,
  SIGINT/SIGTERM and detected parent death also stop and exit.

Events: `offer`/`answer` with SDP; `state` (WebRTC states or data-channel-open);
`level` with linear RMS mic/assistant; `error`; `closed`; optional `data` byte count.
SDP itself contains ICE credentials: the caller must keep SDP out of shared logs.

Both directions use 48 kHz mono S16LE. The echo probe is created before the DSP
and resides in the same top-level pipeline, after output volume/mute and directly
before pulsesink. Speaker output is native, never a browser AudioContext. A Pulse
server or hardware gain applied after this process is not observable by this probe.
Queue and Pulse ring requests are bounded; independent OS recordings, not level
events or packet counters, must establish sound quality and mute/interrupt latency.

Official contracts:

- https://gstreamer.freedesktop.org/documentation/webrtc/
- https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcdsp.html
- https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcechoprobe.html

The prototype has been exercised on Arch userspace with GStreamer 1.28.8 and
PipeWire 1.6.9 using digital Pulse input/output devices. Tests cover independent
speaker recordings, mute/resume, command interruption, stale-output rejection,
and stop/EOF/parent-death cleanup. This does not establish physical microphone or
speaker quality, acoustic echo cancellation/double-talk, natural speech-driven
interruption, real-account signaling, or Hyprland window integration.

Ubuntu 24.04's stock GStreamer 1.24.2 package omits webrtcdsp/webrtcechoprobe;
the capability probe correctly refuses to start there. A compatible media runtime
must be supplied before enabling this component on such a distribution. No runtime
installer or default DSH integration is included in this experiment.

The [recorded acceptance run](https://github.com/WSL043/dsh-codex-subscription/actions/runs/40388255071)
completed two consecutive fresh call sequences in one media runtime, each with
17 passing checks and eight PCM positive/negative controls. Command interruption
to monitor silence measured 51.65ms and 49.78ms; this is not acoustic latency.
The path-filtered native-audio workflow reproduces those sequences on main and
pull requests using the tested image digest and pinned Arch package snapshot.
