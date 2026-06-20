"""
MCQ Supermarket — backend API (Flask blueprint + SQLite).

Per-store isolation is enforced on EVERY route. The API is exposed as a Flask
Blueprint so it can run standalone (local dev) OR be mounted inside the single
deployment app (flask_app.py) that also serves the frontend on the same origin.

Run standalone (local API only):
  cd server && python3 -m pip install -r requirements.txt
  python3 app.py            # http://localhost:8001
"""
import os, sys, json, time, secrets
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # so `import db` works when imported as server.app too
import db
from flask import Blueprint, Flask, request, jsonify, send_file, abort

api = Blueprint('api', __name__)

# ---------- helpers ----------
def current_auth():
    h = request.headers.get('Authorization', '')
    tok = h[7:] if h.startswith('Bearer ') else (request.args.get('token') or '')
    return db.auth_from_token(tok)

def require_auth():
    au = current_auth()
    if not au: abort(401)
    return au

def require_store(au, store_id):
    if store_id not in db.STORES: abort(404)
    if not db.can_access(au, store_id): abort(403)

def uid(au):
    return (au['role'] + ':' + (au['store_id'] or '')) if au else 'system'

def db_safe(s):
    return ''.join(c if c.isalnum() else '-' for c in str(s).lower()).strip('-') or 'store'

# ---------- health ----------
@api.route('/api/health')
def health():
    size = os.path.getsize(db.DB_PATH) if os.path.exists(db.DB_PATH) else 0
    return jsonify(ok=True, time=db.now(), db_bytes=size, stores=len(db.STORES))

# ---------- auth ----------
@api.route('/api/login', methods=['POST'])
def login():
    d = request.get_json(force=True, silent=True) or {}
    res = db.verify_login(d.get('mode'), d.get('store'), d.get('password'))
    if not res:
        return jsonify(ok=False, error='Invalid credentials'), 401
    role, store = res
    tok = db.issue_token(role, store)
    return jsonify(ok=True, token=tok, role=role, store=store,
                   stores=db.STORES if role == 'super' else [store])

# ---------- store list / summary ----------
@api.route('/api/stores')
def stores():
    au = require_auth()
    conn = db.connect()
    rows = conn.execute('SELECT store_id, length(state_json) AS bytes, updated_at FROM store_state').fetchall()
    conn.close()
    by = {r['store_id']: {'bytes': r['bytes'] or 0, 'updated_at': r['updated_at']} for r in rows}
    visible = db.STORES if au['role'] == 'super' else [au['store_id']]
    return jsonify(ok=True, stores=[
        {'id': s, 'name': s, 'bytes': by.get(s, {}).get('bytes', 0),
         'updated_at': by.get(s, {}).get('updated_at')} for s in visible])

# ---------- per-store state (records/subs/history normalized into tables; lean blob keeps the rest) ----------
@api.route('/api/state/<store_id>', methods=['GET'])
def get_state(store_id):
    au = require_auth(); require_store(au, store_id)
    state = db.load_state(store_id)
    return jsonify(ok=True, store=store_id, state=state, updated_at=db.state_updated_at(store_id))

@api.route('/api/state/<store_id>', methods=['POST'])
def post_state(store_id):
    au = require_auth(); require_store(au, store_id)
    d = request.get_json(force=True, silent=True) or {}
    state = d.get('state', d)
    if isinstance(state, dict):
        state['store'] = store_id    # a client can never write another store's id
    bytes_saved = db.save_state(store_id, state, uid(au))
    db.write_audit(uid(au), store_id, 'save', 'store_state', store_id, None, {'bytes': bytes_saved})
    return jsonify(ok=True, store=store_id, bytes=bytes_saved, updated_at=db.now())

# ---------- store config ----------
@api.route('/api/store-config/<store_id>', methods=['GET'])
def get_config(store_id):
    au = require_auth(); require_store(au, store_id)
    conn = db.connect()
    row = conn.execute('SELECT config_json FROM store_config WHERE store_id=?', (store_id,)).fetchone()
    conn.close()
    return jsonify(ok=True, store=store_id, config=json.loads(row['config_json']) if row and row['config_json'] else None)

@api.route('/api/store-config/<store_id>', methods=['POST'])
def post_config(store_id):
    au = require_auth(); require_store(au, store_id)
    d = request.get_json(force=True, silent=True) or {}
    cfg = d.get('config', d)
    conn = db.connect()
    conn.execute("""INSERT INTO store_config(store_id,config_json,updated_at) VALUES(?,?,?)
                    ON CONFLICT(store_id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at""",
                 (store_id, json.dumps(cfg), db.now()))
    conn.commit(); conn.close()
    db.write_audit(uid(au), store_id, 'save', 'store_config', store_id, None, None)
    return jsonify(ok=True, store=store_id)

# ---------- photos: files + metadata row ----------
@api.route('/api/photos', methods=['POST'])
def post_photo():
    au = require_auth()
    store_id = request.form.get('store_id') or (au['store_id'] if au['role'] != 'super' else None)
    if not store_id or store_id not in db.STORES: abort(400)
    require_store(au, store_id)
    f = request.files.get('image')
    data_url = request.form.get('dataUrl')
    pid = request.form.get('id') or ('p_' + time.strftime('%Y%m%d') + '_' + secrets.token_hex(5))
    pid = ''.join(c for c in pid if c.isalnum() or c in '_-')[:40] or ('p_' + secrets.token_hex(5))
    folder = os.path.join(db.UPLOADS, db_safe(store_id)); os.makedirs(folder, exist_ok=True)
    mime = 'image/jpeg'; ext = 'jpg'
    if f:
        mime = f.mimetype or mime; ext = (f.filename.rsplit('.', 1)[-1] if '.' in (f.filename or '') else 'jpg')[:5]
        f.save(os.path.join(folder, pid + '.' + ext))
    elif data_url and ',' in data_url:
        import base64
        head, b64 = data_url.split(',', 1)
        if 'png' in head: mime, ext = 'image/png', 'png'
        with open(os.path.join(folder, pid + '.' + ext), 'wb') as out:
            out.write(base64.b64decode(b64))
    else:
        abort(400)
    meta = {'area': request.form.get('area', ''), 'equipment': request.form.get('equipment', '')}
    conn = db.connect()
    conn.execute('INSERT OR REPLACE INTO photos(id,store_id,filename,mime,meta_json,created_at) VALUES(?,?,?,?,?,?)',
                 (pid, store_id, pid + '.' + ext, mime, json.dumps(meta), db.now()))
    conn.commit(); conn.close()
    db.write_audit(uid(au), store_id, 'create', 'photo', pid, None, None)
    return jsonify(ok=True, id=pid)

@api.route('/api/photos/<photo_id>', methods=['GET'])
def get_photo(photo_id):
    au = require_auth()
    conn = db.connect()
    row = conn.execute('SELECT store_id,filename,mime FROM photos WHERE id=?', (photo_id,)).fetchone()
    conn.close()
    if not row: abort(404)
    if not db.can_access(au, row['store_id']): abort(403)
    path = os.path.join(db.UPLOADS, db_safe(row['store_id']), row['filename'])
    if not os.path.isfile(path): abort(404)
    return send_file(path, mimetype=row['mime'])

# ---------- history (normalized rows + state snapshots + audit) ----------
@api.route('/api/history/<store_id>')
def history(store_id):
    au = require_auth(); require_store(au, store_id)
    conn = db.connect()
    snaps = conn.execute("""SELECT id, created_at, created_by, length(state_json) AS bytes
                            FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 30""", (store_id,)).fetchall()
    sched = conn.execute("""SELECT data_json, created_at FROM schedule_history WHERE store_id=? ORDER BY id DESC LIMIT 50""", (store_id,)).fetchall()
    audits = conn.execute("""SELECT action, entity_type, entity_id, user_id, created_at
                             FROM audit_logs WHERE store_id=? ORDER BY id DESC LIMIT 30""", (store_id,)).fetchall()
    conn.close()
    return jsonify(ok=True, store=store_id, snapshots=[dict(r) for r in snaps],
                   scheduleHistory=[json.loads(r['data_json']) for r in sched if r['data_json']],
                   audit=[dict(a) for a in audits])

# ---------- audit log ----------
@api.route('/api/audit-log', methods=['POST'])
def audit_log():
    au = require_auth()
    d = request.get_json(force=True, silent=True) or {}
    store_id = d.get('store_id') or (au['store_id'] if au['role'] != 'super' else 'ALL')
    if au['role'] != 'super' and store_id != au['store_id']: abort(403)
    db.write_audit(uid(au), store_id, d.get('action', 'update'), d.get('entity_type', 'record'),
                   d.get('entity_id', ''), d.get('before_json'), d.get('after_json'))
    return jsonify(ok=True)

# ---------- CORS (only needed when frontend is on a different origin, e.g. local :8765↔:8001) ----------
def add_cors(app):
    @app.after_request
    def _cors(resp):
        origin = request.headers.get('Origin')
        if origin:
            resp.headers['Access-Control-Allow-Origin'] = origin
            resp.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
            resp.headers['Vary'] = 'Origin'
        return resp
    @app.route('/api/<path:_any>', methods=['OPTIONS'])
    def _preflight(_any):
        return ('', 204)

def create_app():
    app = Flask(__name__)
    db.init_db()
    app.register_blueprint(api)
    add_cors(app)
    return app

if __name__ == '__main__':
    create_app().run(host='0.0.0.0', port=8001, debug=True)
