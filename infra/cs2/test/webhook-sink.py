#!/usr/bin/env python3
"""Um webhook do Discord de mentira para os testes: guarda o `content` de cada POST, uma linha por mensagem."""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1]
PORT = int(sys.argv[2])


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        with open(OUT, "a", encoding="utf-8") as f:
            f.write(body.get("content", "").replace("\n", " ") + "\n")
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
