# Native Linux voice component

`linux-voice-helper.py` is an independent Python/GI GStreamer process. The plugin
uses it only from a local Linux desktop window without browser WebRTC, after an
explicit microphone confirmation. A normal WebRTC browser keeps its existing
media path. No audio samples cross Python/JavaScript IPC, no dependencies are
installed automatically, and the helper never accepts account credentials.

The authenticated host keeps signaling, account access and conversation ownership.
The helper handles audio devices and WebRTC. A session-specific lease protects
controls; losing the window's heartbeat stops capture after ten seconds. Startup
cancellation, hangup, settings disable and host disposal release the component.
The existing speech gate uses native levels to interrupt playback and resumes
only after old output has drained. Probe opens no microphone or speaker.

Runtime prerequisites: Python GI with Gst/GstSdp/GstWebRTC 1.0 introspection,
libnice, Opus RTP plugins, PulseAudio source/sink plugins and webrtcdsp. PulseAudio
can be supplied by PipeWire's Pulse server. On Arch the media dependencies are
`python-gobject gst-python gstreamer gst-plugins-base gst-plugins-good
gst-plugins-bad libnice pipewire-pulse wireplumber`. `probe` reports missing
factories without constructing a pipeline or opening audio devices. If the
runtime is unavailable, continue the same conversation in a WebRTC browser.

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
- `interrupt`: suppresses output through the bounded native renderer. RTP and decoder
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
Dynamic LATENCY messages recalculate the live graph's latency. Muting keeps the
receive graph running: flushing the renderer can propagate FLUSHING upstream and
stop WebRTC reception. Silent PCM drains the bounded speaker storage instead.

Official contracts:

- https://gstreamer.freedesktop.org/documentation/webrtc/
- https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcdsp.html
- https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcechoprobe.html

The component has been exercised on Arch userspace with GStreamer 1.28.8 and
PipeWire 1.6.9 using digital Pulse input/output devices. Tests cover independent
speaker recordings, mute/resume, command interruption, stale-output rejection,
default-device selection, level-cache expiry and stop/EOF/parent-death cleanup.

The host integration was also verified in the actual v0.25.0 Tauri window on
Arch/Hyprland with WebKitGTK 2.54.1 and DSH core 0.2.1-rc.4, a real signed-in account, digital audio devices
and synthetic spoken requests. It covered permission denial, capture/playback,
automatic speech-driven interruption, a fresh spoken answer, microphone/speaker
controls and hangup. No manual interrupt command was used in that call. Physical
microphone/speaker quality and acoustic echo cancellation/double-talk remain
unverified; digital-device evidence does not establish those properties.

Ubuntu 24.04's stock GStreamer 1.24.2 package omits webrtcdsp/webrtcechoprobe;
the capability probe correctly refuses to start there. A compatible media runtime
must be supplied before enabling this component on such a distribution. No runtime
installer is included. The component is not a replacement WebKit build.

The [earlier component baseline](https://github.com/WSL043/dsh-codex-subscription/actions/runs/40388255071)
completed two consecutive fresh call sequences in one media runtime, each with
17 passing checks and eight PCM positive/negative controls. The current
path-filtered workflow runs 19 checks per sequence, adding default-device and
level-cache regressions, and records each run's command-to-monitor-silence timing.
It runs on main and pull requests using the tested image digest and pinned Arch
package snapshot. These timings are not acoustic latency.
