"""
Realtime notifications over WebSocket (flask-sock).

Every signed-in client keeps ONE socket open; when something changes (new inbox
message, announcement posted/edited) the server pushes a tiny {"what": "inbox"}
hint and clients refetch through the normal authorized endpoints — the socket
itself never carries message content, so no ACL is bypassed.

Multi-worker fan-out: gunicorn runs several workers, and a message posted via
worker A must reach sockets held by worker B → every worker LISTENs on a
Postgres NOTIFY channel (see db.emit_event). On SQLite (single-process dev)
db.emit_event calls the local broadcaster directly.
"""
import threading, time

_clients = set()
_lock = threading.Lock()

def broadcast(payload):
    with _lock:
        targets = list(_clients)
    for ws in targets:
        try: ws.send(payload)
        except Exception:
            with _lock: _clients.discard(ws)

def _pg_listen(db):
    """One daemon thread per worker: LISTEN on Postgres, fan out to local sockets."""
    import select as _select, psycopg2
    while True:
        try:
            conn = psycopg2.connect(db.DATABASE_URL)
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute('LISTEN mcq_events;')
            while True:
                if _select.select([conn], [], [], 60) == ([], [], []):
                    continue
                conn.poll()
                while conn.notifies:
                    n = conn.notifies.pop(0)
                    broadcast(n.payload)
        except Exception:
            time.sleep(5)   # DB restart etc. → reconnect

def attach(app, db):
    from flask_sock import Sock
    from flask import request
    sock = Sock(app)
    db.EVENT_SINKS.append(broadcast)                       # local/SQLite fan-out
    if db.IS_PG:
        threading.Thread(target=_pg_listen, args=(db,), daemon=True).start()

    @sock.route('/api/ws')
    def _ws(ws):
        au = db.auth_from_token(request.args.get('token') or '')
        if not au:
            return
        with _lock: _clients.add(ws)
        try:
            while True:
                msg = ws.receive(timeout=30)               # None on timeout → keep alive
                if msg == 'ping': ws.send('{"what":"pong"}')
        except Exception:
            pass
        finally:
            with _lock: _clients.discard(ws)
