#!/usr/bin/env python3
"""
Origami local dev server — replaces `python3 -m http.server`.
Sends the headers required for:
  - SharedArrayBuffer (meshopt GLB decoder): COOP + COEP
  - CORS (cross-origin fetch for GLB/WASM/audio): ACAO
  - Correct MIME types for GLB, WASM, JS modules
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

MIME = {
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
    '.mjs':  'text/javascript',
    '.js':   'text/javascript',
    '.json': 'application/json',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
}

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin',      '*')
        self.send_header('Access-Control-Allow-Methods',     'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers',     '*')
        self.send_header('Cross-Origin-Opener-Policy',       'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy',     'require-corp')
        self.send_header('Cross-Origin-Resource-Policy',     'cross-origin')
        self.send_header('Cache-Control',                    'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def guess_type(self, path):
        import os
        ext = os.path.splitext(path)[1].lower()
        return MIME.get(ext, super().guess_type(path))

    def log_message(self, fmt, *args):
        # Quiet — only log errors
        if args and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)

with socketserver.TCPServer(('', PORT), CORSHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f'Origami server: http://localhost:{PORT}/NewOrigami.8.html')
    print('CORS + COOP/COEP headers active (required for meshopt GLB + SharedArrayBuffer)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
