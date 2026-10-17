"""Serves the app for a phone on the same Wi-Fi: python3 serve.py

The same as `python3 -m http.server 5500`, except it tells the browser to check for a
newer copy of each file on every load (Cache-Control: no-cache). Without that, a phone
keeps running old JavaScript after we edit it, and a home screen app has no refresh button.
Unchanged files still come back as a quick "304 Not Modified", so it isn't slower.
"""
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 5500


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def lanIp():
    # Opening a UDP socket toward any outside address makes the OS pick the network
    # interface it would use; nothing is actually sent.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return "localhost"


if __name__ == "__main__":
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"On this laptop: http://localhost:{PORT}/frontend/")
    print(f"On your phone:  http://{lanIp()}:{PORT}/frontend/")
    ThreadingHTTPServer(("", PORT), handler).serve_forever()
