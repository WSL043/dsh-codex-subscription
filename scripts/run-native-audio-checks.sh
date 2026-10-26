#!/usr/bin/env bash
# Isolated acceptance environment only. Never called by the installed plugin.
set -euo pipefail
mode="${1:?pulse, pipewire or arch required}"
if [[ "$mode" == arch ]]; then
  [[ "$EUID" == 0 && -d /work && -d /evidence ]] || exit 2
  printf '%s\n' 'Server = https://archive.archlinux.org/repos/2026/10/20/$repo/os/$arch' > /etc/pacman.d/mirrorlist
  pacman -Syyuu --noconfirm --needed archlinux-keyring
  pacman -S --noconfirm --needed python-gobject gst-python gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugin-pipewire libnice pipewire pipewire-audio pipewire-pulse wireplumber libpulse dbus
  useradd -m -u 1001 nativevoice
  chown nativevoice:nativevoice /evidence
  pacman -Q gstreamer gst-plugins-bad pipewire pipewire-pulse wireplumber > /evidence/versions.txt
  export NATIVE_AUDIO_OUTPUT=/evidence
  exec runuser -u nativevoice -- dbus-run-session -- bash /work/scripts/run-native-audio-checks.sh pipewire
fi
[[ "$mode" == pulse || "$mode" == pipewire ]] || exit 2
cd "$(dirname "$0")/.."
out="${NATIVE_AUDIO_OUTPUT:?output directory required}"
mkdir -p "$out"
export XDG_RUNTIME_DIR
XDG_RUNTIME_DIR="$(mktemp -d)"
chmod 700 "$XDG_RUNTIME_DIR"
cleanup() {
  if [[ "$mode" == pulse ]]; then pulseaudio --kill || true
  else kill "${pp:-}" "${wp:-}" "${pw:-}" 2>/dev/null || true; fi
}
trap cleanup EXIT
if [[ "$mode" == pulse ]]; then
  pulseaudio --start --exit-idle-time=-1
else
  pipewire >"$out/pipewire.log" 2>&1 & pw=$!
  wireplumber >"$out/wireplumber.log" 2>&1 & wp=$!
  pipewire-pulse >"$out/pipewire-pulse.log" 2>&1 & pp=$!
fi
ready=0
for i in {1..60}; do
  if pactl info >"$out/audio-server.txt" 2>&1; then ready=1; break; fi
  sleep 0.1
done
[[ "$ready" == 1 ]] || { cat "$out/audio-server.txt"; exit 1; }
uname -a >"$out/kernel.txt"
gst-inspect-1.0 --version >"$out/gstreamer.txt"
repeats="${NATIVE_AUDIO_REPEATS:-1}"
[[ "$repeats" == 1 || "$repeats" == 2 ]] || exit 2
for (( attempt=1; attempt<=repeats; attempt++ )); do
  attempt_out="$out"
  if [[ "$repeats" == 2 ]]; then attempt_out="$out/run-$attempt"; fi
  python3 scripts/verify-native-audio.py --helper native/linux-voice-helper.py --output "$attempt_out"
done
