#!/usr/bin/env python3
"""Local server for the offline podium.global mirror.

Serves the site over http:// (required — the app's scripts and absolute asset
paths do NOT work from a double-clicked file://). Key features that make the
video-heavy homepage actually load:
  * multi-threaded  -> the 27 preload videos load in parallel, not one-by-one
  * HTTP Range (206) -> <video> can stream/seek instead of pulling whole files
  * resolves Next.js /_next/image optimizer requests to the local media files
Then it opens your browser automatically.
"""
import http.server, socketserver, os, urllib.parse, mimetypes, socket, threading, webbrowser, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def free_port(start=8814):   # fresh port => clean browser cache partition (avoids stale-chunk errors)
    for p in range(start, start + 25):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p)); return p
            except OSError:
                continue
    return start

class H(http.server.SimpleHTTPRequestHandler):
    def _fs_path(self):
        path = self.path
        if path.startswith("/_next/image"):                       # optimizer -> local file
            u = urllib.parse.parse_qs(urllib.parse.urlparse(path).query).get("url", [""])[0].split("&")[0]
            if u.startswith("/"):
                path = u
        path = urllib.parse.urlparse(path).path
        fs = self.translate_path(path)
        if os.path.isdir(fs):
            fs = os.path.join(fs, "index.html")
        return fs

    def do_HEAD(self):
        self._serve(head=True)

    def do_GET(self):
        self._serve(head=False)

    def _serve(self, head):
        fs = self._fs_path()
        if not os.path.isfile(fs):
            self.send_error(404, "File not found"); return
        size = os.path.getsize(fs)
        ctype = mimetypes.guess_type(fs)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        try:
            f = open(fs, "rb")
        except OSError:
            self.send_error(404); return
        try:
            start, end = 0, size - 1
            partial = False
            if rng and rng.startswith("bytes="):
                a, _, b = rng[6:].partition("-")
                try:
                    if a: start = int(a)
                    if b: end = int(b)
                    end = min(end, size - 1)
                    if a == "" and b:                              # suffix range: bytes=-N
                        start = max(0, size - int(b)); end = size - 1
                    if start > end or start >= size:
                        self.send_response(416)
                        self.send_header("Content-Range", f"bytes */{size}")
                        self.end_headers(); return
                    partial = True
                except ValueError:
                    partial = False
            length = end - start + 1
            self.send_response(206 if partial else 200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store, must-revalidate")  # always fetch fresh (files change during edits)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(length))
            if partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if head:
                return
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(262144, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass                                                   # browser aborted a video range — normal
        finally:
            f.close()

    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(ROOT)
    PORT = free_port()
    url = f"http://127.0.0.1:{PORT}/"
    httpd = Server(("127.0.0.1", PORT), lambda *a: H(*a, directory=ROOT))
    print(f"\n  Nico Maggioli (offline)  ->  {url}\n", flush=True)
    print("  Opening your browser... first load takes ~10-20s (the 3D scene compiles its shaders).", flush=True)
    print("  Keep this window open while viewing. Press Ctrl+C or close it to stop.\n", flush=True)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
