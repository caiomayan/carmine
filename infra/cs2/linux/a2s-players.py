#!/usr/bin/env python3
"""Quantos jogadores (humanos) há num servidor CS2 agora, pela consulta A2S_INFO local.

Uso: a2s-players.py <porta> [host]   (host padrão 127.0.0.1)
Imprime o número de jogadores sem os bots e sai com 0. Sem resposta (servidor desligado ou ainda subindo): sai
com 1 e não imprime nada. Só biblioteca padrão; usado pelo carmine-plugin-deploy (--when-empty).
"""
import socket
import struct
import sys

HEADER = b"\xff\xff\xff\xff"
QUERY = HEADER + b"TSource Engine Query\x00"


def read_cstring(data: bytes, pos: int):
    end = data.index(b"\x00", pos)
    return data[pos:end], end + 1


def humans(response: bytes) -> int:
    if response[:4] != HEADER or response[4:5] != b"I":
        raise ValueError("resposta A2S_INFO inesperada")
    pos = 6  # cabeçalho (4) + 'I' + protocolo
    for _ in range(4):  # nome, mapa, pasta, jogo
        _, pos = read_cstring(response, pos)
    pos += 2  # app id
    players, _max_players, bots = struct.unpack_from("BBB", response, pos)
    return max(players - bots, 0)


def query(host: str, port: int, timeout: float = 2.0) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(timeout)
        sock.sendto(QUERY, (host, port))
        response, _ = sock.recvfrom(4096)
        if response[4:5] == b"A":  # o servidor pede o desafio e a consulta de novo
            sock.sendto(QUERY + response[5:9], (host, port))
            response, _ = sock.recvfrom(4096)
        return humans(response)


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: a2s-players.py <porta> [host]", file=sys.stderr)
        return 2
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    try:
        print(query(host, int(sys.argv[1])))
    except (OSError, ValueError, struct.error):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
