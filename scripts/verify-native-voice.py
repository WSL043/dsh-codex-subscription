"""A native GTK3/WebKitGTK view. Audio devices are WebKit mocks, never host hardware."""
import json
import sys
import subprocess
from pathlib import Path
import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gtk, WebKit2, GLib, GdkX11

result = {'passed': False, 'error': {'message': 'native test timed out'}}
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('nativeVoiceResult')

def finished(_manager, value):
    global result
    try:
        value = value.get_js_value() if hasattr(value, 'get_js_value') else value
        result = json.loads(value.to_string())
        if result.pop('pending', False):
            print(json.dumps({'phase': result.get('phase')}), flush=True)
            return
    except Exception as error:
        result = {'passed': False, 'error': {'name': type(error).__name__}}
    Gtk.main_quit()

manager.connect('script-message-received::nativeVoiceResult', finished)
view = WebKit2.WebView(user_content_manager=manager)
settings = view.get_settings()
settings.set_enable_mock_capture_devices(True)
settings.set_enable_webrtc(True)
settings.set_media_playback_requires_user_gesture(True)

def permission(_view, request):
    if isinstance(request, WebKit2.UserMediaPermissionRequest):
        if request.get_property('is-for-audio-device') and not request.get_property('is-for-video-device'):
            # Permission prompts may outlive the original click gesture.
            GLib.timeout_add(600, lambda: (request.allow(), False)[1])
        else:
            request.deny()
        return True
    return False

view.connect('permission-request', permission)
window = Gtk.Window()
window.set_default_size(800, 600)
window.add(view)
window.show_all()

def load_changed(_view, event):
    if event == WebKit2.LoadEvent.FINISHED:
        def click():
            view.grab_focus()
            subprocess.run(['xdotool', 'windowfocus', '--sync', str(window.get_window().get_xid())], check=True)
            subprocess.run(['xdotool', 'key', 'Return'], check=True)
            return False
        GLib.timeout_add(200, click)

view.connect('load-changed', load_changed)
view.load_uri(sys.argv[1])
GLib.timeout_add_seconds(45, lambda: (Gtk.main_quit(), False)[1])
Gtk.main()
result['webkitVersion'] = '.'.join(str(fn()) for fn in (WebKit2.get_major_version, WebKit2.get_minor_version, WebKit2.get_micro_version))
result['mockCaptureEnabled'] = settings.get_enable_mock_capture_devices()
result['autoplayRequiresGesture'] = settings.get_media_playback_requires_user_gesture()
Path(sys.argv[2]).write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
sys.exit(0 if result.get('passed') else 1)
