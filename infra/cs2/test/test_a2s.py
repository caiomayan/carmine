"""Testa o a2s-players.py contra um servidor A2S de mentira (UDP local): resposta direta, desafio e sem resposta."""
import importlib.util
import socket
import struct
import threading
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "a2s_players", Path(__file__).resolve().parents[1] / "linux" / "a2s-players.py"
)
a2s = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(a2s)

HEADER = b"\xff\xff\xff\xff"


def info_response(players: int, bots: int) -> bytes:
    body = b"\x11" + b"Carmine Retake\x00" + b"de_mirage\x00" + b"csgo\x00" + b"Counter-Strike 2\x00"
    body += struct.pack("<h", 730) + struct.pack("BBB", players, 10, bots)
    return HEADER + b"I" + body


class FakeServer:
    def __init__(self, players: int, bots: int, challenge: bool):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        self.players, self.bots, self.challenge = players, bots, challenge
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()

    def serve(self):
        self.sock.settimeout(5)
        try:
            while True:
                data, addr = self.sock.recvfrom(1024)
                if self.challenge and len(data) == len(a2s.QUERY):
                    self.sock.sendto(HEADER + b"A" + b"\x01\x02\x03\x04", addr)
                else:
                    self.sock.sendto(info_response(self.players, self.bots), addr)
        except OSError:
            pass

    def close(self):
        self.sock.close()


class A2sTests(unittest.TestCase):
    def test_conta_so_humanos(self):
        server = FakeServer(players=6, bots=2, challenge=False)
        self.addCleanup(server.close)
        self.assertEqual(a2s.query("127.0.0.1", server.port, timeout=2), 4)

    def test_servidor_vazio_com_bots_conta_zero(self):
        server = FakeServer(players=3, bots=3, challenge=False)
        self.addCleanup(server.close)
        self.assertEqual(a2s.query("127.0.0.1", server.port, timeout=2), 0)

    def test_responde_ao_desafio(self):
        server = FakeServer(players=5, bots=0, challenge=True)
        self.addCleanup(server.close)
        self.assertEqual(a2s.query("127.0.0.1", server.port, timeout=2), 5)

    def test_sem_resposta_da_erro(self):
        silent = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        silent.bind(("127.0.0.1", 0))
        self.addCleanup(silent.close)
        with self.assertRaises(OSError):
            a2s.query("127.0.0.1", silent.getsockname()[1], timeout=0.3)


if __name__ == "__main__":
    unittest.main()
