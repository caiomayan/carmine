#!/usr/bin/env python3
"""Um S3/R2 de mentira para os testes: guarda objetos num diretório. GET e HEAD só respondem a pedidos
assinados com SigV4 (Authorization: AWS4-HMAC-SHA256 Credential=<chave>/... e x-amz-content-sha256);
sem isso, 403. PUT é aceito sem assinatura (o awscli de mentira dos testes não assina)."""
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
KEY = sys.argv[3]


class Handler(BaseHTTPRequestHandler):
    def _path(self):
        return os.path.join(ROOT, self.path.lstrip("/"))

    def _signed(self):
        auth = self.headers.get("Authorization", "")
        return auth.startswith(f"AWS4-HMAC-SHA256 Credential={KEY}/") and bool(
            self.headers.get("x-amz-content-sha256")
        )

    def _serve(self, body):
        if not self._signed():
            self.send_response(403)
            self.end_headers()
            return
        path = self._path()
        if not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Length", str(size))
        self.end_headers()
        if body:
            with open(path, "rb") as f:
                self.wfile.write(f.read())

    def do_GET(self):
        self._serve(True)

    def do_HEAD(self):
        self._serve(False)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length)
        path = self._path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
