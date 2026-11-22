"""Serve Track N Trace and relay multiplayer packets on a private IPv4 network."""
import argparse
import ipaddress
import json
import re
import secrets
import socket
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_PLAYERS = 4
MAX_BODY = 640 * 1024
MAX_EVENTS = 200
POLL_TIME = 7
EXPIRE_TIME = 32


class RoomError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def private_address(value):
    address = ipaddress.IPv4Address(value)
    return address.is_private or address.is_link_local or address in ipaddress.IPv4Network("100.64.0.0/10")


def local_addresses():
    choices = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # A UDP connect selects a route without sending a packet.
            probe.connect(("192.0.2.1", 9))
            choices.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        choices.extend(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    return list(dict.fromkeys(ip for ip in choices if private_address(ip) and not ip.startswith("127.")))


class RelayRoom:
    def __init__(self, version, addresses):
        self.version = version
        self.addresses = addresses
        self.owner = secrets.token_hex(24)
        self.invite = secrets.token_hex(24)
        self.condition = threading.Condition()
        self.clients = {}
        self.keys = {}

    def join(self, data, local_request):
        if data.get("version") != self.version:
            raise RoomError(409, f"Both devices must use Track N Trace v{self.version}.")
        role = data.get("role")
        secret = data.get("secret")
        if not isinstance(secret, str):
            raise RoomError(403, "Use the invite link from the laptop.")
        self.expire()
        if role == "host":
            if not local_request or not secrets.compare_digest(secret, self.owner):
                raise RoomError(403, "Open the host page on the laptop running the launcher.")
            if "host" in self.clients:
                self.remove("host", "The host reopened the room.")
            uid = "host"
        elif role == "guest":
            if not secrets.compare_digest(secret, self.invite):
                raise RoomError(403, "That invite is no longer valid. Scan the current QR.")
            if "host" not in self.clients:
                raise RoomError(409, "The host needs to open the laptop lobby first.")
            if len(self.clients) >= MAX_PLAYERS:
                raise RoomError(409, "This room is full.")
            uid = secrets.token_hex(12)
        else:
            raise RoomError(400, "Choose host or guest.")
        key = secrets.token_hex(24)
        self.keys[key] = uid
        self.clients[uid] = {"key": key, "last": time.monotonic(), "events": []}
        if uid != "host":
            self.enqueue("host", {"kind": "joined", "id": uid})
        result = {"id": uid, "key": key}
        if uid == "host":
            result.update(invite=self.invite, address=self.addresses[0], addresses=self.addresses)
        return result

    def require(self, data):
        key = data.get("key")
        uid = self.keys.get(key) if isinstance(key, str) else None
        if uid is None:
            raise RoomError(410, "The network room closed or the connection expired.")
        self.clients[uid]["last"] = time.monotonic()
        return uid

    def enqueue(self, target, event):
        client = self.clients.get(target)
        if client is None:
            return
        events = client["events"]
        if event.get("packet", {}).get("kind") == "snapshot":
            events[:] = [e for e in events if e.get("packet", {}).get("kind") != "snapshot"]
        if len(events) >= MAX_EVENTS:
            self.remove(target, "The network connection could not keep up.")
            return
        events.append(event)
        self.condition.notify_all()

    def send(self, uid, items):
        if not isinstance(items, list) or not 1 <= len(items) <= 8:
            raise RoomError(400, "Invalid network packet batch.")
        for item in items:
            if not isinstance(item, dict):
                continue
            target, packet = item.get("to"), item.get("packet")
            if not isinstance(target, str) or not isinstance(packet, dict):
                continue
            if (uid == "host" and target == "host") or (uid != "host" and target != "host"):
                continue
            kind = packet.get("kind")
            if not isinstance(kind, str) or len(json.dumps(packet, separators=(",", ":"))) > 65536:
                continue
            self.enqueue(target, {"kind": "message", "from": uid, "packet": packet})

    def poll(self, uid, key):
        end = time.monotonic() + POLL_TIME
        while True:
            self.expire()
            if self.keys.get(key) != uid:
                raise RoomError(410, "The host closed the room or the connection expired.")
            events = self.clients[uid]["events"]
            if events or time.monotonic() >= end:
                self.clients[uid]["events"] = []
                return events
            self.condition.wait(max(0, end - time.monotonic()))

    def remove(self, uid, reason):
        client = self.clients.pop(uid, None)
        if client is None:
            return
        self.keys.pop(client["key"], None)
        if uid == "host":
            self.invite = secrets.token_hex(24)
            for guest in list(self.clients):
                self.remove(guest, reason)
        else:
            self.enqueue("host", {"kind": "left", "id": uid, "reason": reason})
        self.condition.notify_all()

    def expire(self):
        for uid, client in list(self.clients.items()):
            if time.monotonic() - client["last"] > EXPIRE_TIME:
                self.remove(uid, "The player stopped responding.")


class LanServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 24

    def __init__(self, address, page, room):
        super().__init__(address, Handler)
        self.page = page
        self.room = room
        self.slots = threading.BoundedSemaphore(28)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(12)

    def log_message(self, *_):
        # Keep invite and session details out of the console.
        return

    def reply(self, status, payload, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def json_reply(self, status, data):
        self.reply(status, json.dumps(data, separators=(",", ":")).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        if not private_address(self.client_address[0]):
            self.json_reply(403, {"error": "Use a device on the local network."})
            return
        if urlsplit(self.path).path in {"/", "/index.html"}:
            self.reply(200, self.server.page, "text/html; charset=utf-8")
        else:
            self.json_reply(404, {"error": "Page not found."})

    def do_POST(self):
        try:
            if not private_address(self.client_address[0]):
                raise RoomError(403, "Use a device on the local network.")
            host = self.headers.get("Host")
            origin = self.headers.get("Origin")
            if not host or (origin is not None and origin != "http://" + host):
                raise RoomError(403, "Open the game from the local host’s invite link.")
            if self.headers.get_content_type() != "application/json":
                raise RoomError(415, "Expected a game request.")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                raise RoomError(413, "The game request is too large.")
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise RoomError(400, "Invalid game request.")
            result = self.handle_room(urlsplit(self.path).path, data)
            self.json_reply(200, result)
        except RoomError as error:
            self.json_reply(error.status, {"error": str(error)})
        except (ValueError, TypeError, RecursionError):
            self.json_reply(400, {"error": "Invalid game request."})

    def handle_room(self, path, data):
        room = self.server.room
        with room.condition:
            if path == "/lan/join":
                return room.join(data, self.client_address[0].startswith("127."))
            uid = room.require(data)
            if path == "/lan/poll":
                return {"events": room.poll(uid, data["key"])}
            if path == "/lan/send":
                room.send(uid, data.get("items"))
            elif path == "/lan/leave":
                room.remove(uid, "The host closed the room." if uid == "host" else "The player left.")
            elif path == "/lan/remove" and uid == "host" and isinstance(data.get("id"), str) and data["id"] != "host":
                room.remove(data["id"], "The host removed this player.")
            else:
                raise RoomError(404, "Unknown game request.")
            return {"ok": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--address", help="IPv4 address to use in the first QR code")
    parser.add_argument("--no-browser", action="store_true", help="Print the host address instead of opening it")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use a port between 1024 and 65535.")
    local = local_addresses()
    if args.address:
        if not private_address(args.address):
            parser.error("Use a private IPv4 address for the LAN.")
        local = list(dict.fromkeys([args.address, *local]))
    if not local:
        parser.error("Join Wi-Fi or use --address with the laptop’s local IPv4 address.")
    file = Path(__file__).resolve().with_name("index.html")
    try:
        page = file.read_bytes()
        version = re.search(rb"const multiplayerVersion='([0-9.]+)';", page)[1].decode()
    except (OSError, TypeError):
        parser.error("Keep the matching index.html next to the LAN host.")
    room = RelayRoom(version, [f"http://{address}:{args.port}" for address in local])
    host = f"http://127.0.0.1:{args.port}/#host={room.owner}"
    try:
        with LanServer(("0.0.0.0", args.port), page, room) as server:
            print(f"Track N Trace v{version} LAN host")
            print("Host on this laptop:", host)
            print("Private network addresses:", ", ".join(room.addresses))
            print("Leave this window and the host browser tab open. Ctrl+C stops hosting.")
            if not args.no_browser:
                threading.Timer(.15, lambda: webbrowser.open(host)).start()
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                print("\nLAN host stopped.")
    except OSError as error:
        parser.exit(1, f"Could not listen on port {args.port}: {error}\nTry --port 8790.\n")


if __name__ == "__main__":
    main()
