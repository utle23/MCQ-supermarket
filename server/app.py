"""
MCQ Supermarket — backend API (Flask blueprint + SQLite).

Per-store isolation is enforced on EVERY route. The API is exposed as a Flask
Blueprint so it can run standalone (local dev) OR be mounted inside the single
deployment app (flask_app.py) that also serves the frontend on the same origin.

Run standalone (local API only):
  cd server && python3 -m pip install -r requirements.txt
  python3 app.py            # http://localhost:8001
"""
import os, sys, json, time, secrets, base64, re, urllib.request, urllib.error
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

def require_write(au):
    if not db.can_write(au): abort(403)   # Chú Ba (ba) is read-only

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
    visible = db.STORES if au['role'] in ('super', 'ba') else [au['store_id']]
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
    au = require_auth(); require_write(au); require_store(au, store_id)
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
    au = require_auth(); require_write(au); require_store(au, store_id)
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
    au = require_auth(); require_write(au)
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
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store_id = d.get('store_id') or (au['store_id'] if au['role'] != 'super' else 'ALL')
    if au['role'] != 'super' and store_id != au['store_id']: abort(403)
    db.write_audit(uid(au), store_id, d.get('action', 'update'), d.get('entity_type', 'record'),
                   d.get('entity_id', ''), d.get('before_json'), d.get('after_json'))
    return jsonify(ok=True)

# ---------- explicit delete (save() now MERGES, so real deletes go through here) ----------
@api.route('/api/delete', methods=['POST'])
def delete_records():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store_id'); require_store(au, store)
    table = d.get('table')
    if table not in ('records', 'staff', 'checklist_submissions', 'bin_records', 'schedule_history'):
        abort(400)
    idcol = 'rec_id' if table == 'schedule_history' else 'id'
    # scope: a specific store (admin or super), or ALL stores (super only)
    all_stores = (au['role'] == 'super' and store not in db.STORES)
    if not all_stores:
        require_store(au, store)
    scope = '' if all_stores else ' store_id=?'
    base = [] if all_stores else [store]
    conn = db.connect()
    try:
        if d.get('all'):
            conn.execute('DELETE FROM ' + table + (' WHERE' + scope if scope else ''), base)
        else:
            ids = [str(x) for x in (d.get('ids') or []) if x is not None]
            for chunk in [ids[i:i+400] for i in range(0, len(ids), 400)]:
                if not chunk: continue
                cond = (scope + ' AND' if scope else '') + ' ' + idcol + ' IN (' + ','.join('?'*len(chunk)) + ')'
                conn.execute('DELETE FROM ' + table + ' WHERE' + cond, base + chunk)
        conn.commit()
    finally:
        conn.close()
    db.write_audit(uid(au), store, 'delete', table, 'ALL' if d.get('all') else ','.join((d.get('ids') or [])[:5]), None, None)
    return jsonify(ok=True)

# ---------- settings (super-admin only): digest recipients, etc. ----------
@api.route('/api/settings', methods=['GET'])
def get_settings():
    au = require_auth()
    if au['role'] != 'super': abort(403)
    key = request.args.get('key') or ''
    if not key: abort(400)
    return jsonify(ok=True, key=key, value=db.get_setting(key, []))

@api.route('/api/settings', methods=['POST'])
def post_settings():
    au = require_auth()
    if au['role'] != 'super': abort(403)
    d = request.get_json(force=True, silent=True) or {}
    key = d.get('key') or ''
    if not key: abort(400)
    db.set_setting(key, d.get('value'))
    return jsonify(ok=True)

# ---------- email relay (Brevo) — API key stays on the SERVER, never in the frontend / repo ----------
@api.route('/api/send-email', methods=['POST'])
def send_email():
    require_write(require_auth())
    key = os.environ.get('BREVO_API_KEY', '')
    d = request.get_json(force=True, silent=True) or {}
    to = [r for r in (d.get('to') or []) if r.get('email')]
    if not to: return jsonify(ok=False, error='no recipients'), 400
    if not key: return jsonify(ok=False, fallback=True, error='BREVO_API_KEY not set on the server'), 200
    sender = {'email': d.get('fromEmail') or os.environ.get('MCQ_FROM_EMAIL', 'mcqcafe.notify@gmail.com'),
              'name':  d.get('fromName')  or os.environ.get('MCQ_FROM_NAME', 'MCQ Supermarket Notification')}
    payload = {'sender': sender,
               'to': [{'email': r['email'], 'name': r.get('name') or r['email']} for r in to],
               'subject': d.get('subject') or 'MCQ Supermarket',
               'htmlContent': d.get('html') or ('<pre style="font-family:Arial">' + (d.get('text') or '') + '</pre>')}
    att = d.get('attachment')
    if isinstance(att, list) and att:
        payload['attachment'] = [{'content': a.get('content'), 'name': a.get('name') or 'attachment.pdf'}
                                 for a in att if a.get('content')]
    req = urllib.request.Request('https://api.brevo.com/v3/smtp/email',
        data=json.dumps(payload).encode('utf-8'),
        headers={'api-key': key, 'content-type': 'application/json', 'accept': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return jsonify(ok=(200 <= resp.status < 300), sent=len(to))
    except urllib.error.HTTPError as e:
        return jsonify(ok=False, error='brevo ' + str(e.code), detail=e.read().decode('utf-8', 'ignore')[:200]), 200
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 200

# ---------- AI Vision (OpenAI / ChatGPT) — API key stays on the SERVER (OPENAI_API_KEY) ----------
def _openai_vision(image_bytes, mime, prompt, max_tokens=220):
    key = os.environ.get('OPENAI_API_KEY', '')
    if not key: return None, 'OPENAI_API_KEY not set on the server'
    b64 = base64.b64encode(image_bytes).decode('ascii')
    payload = {
        'model': os.environ.get('OPENAI_VISION_MODEL', 'gpt-4o-mini'),
        'temperature': 0, 'max_tokens': max_tokens,
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': prompt},
            {'type': 'image_url', 'image_url': {'url': 'data:' + (mime or 'image/jpeg') + ';base64,' + b64, 'detail': 'high'}}
        ]}],
    }
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            out = json.loads(resp.read().decode('utf-8'))
        return out['choices'][0]['message']['content'], None
    except urllib.error.HTTPError as e:
        return None, 'openai ' + str(e.code) + ' ' + e.read().decode('utf-8', 'ignore')[:160]
    except Exception as e:
        return None, str(e)

def _extract_json(s):
    if not s: return None
    m = re.search(r'\{.*\}', s, re.S)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None

@api.route('/api/vision-temp', methods=['POST'])
def vision_temp():
    require_auth()
    f = request.files.get('image')
    if not f: return jsonify(readable=False, error='no image'), 400
    typ = request.form.get('type', 'fridge'); equip = request.form.get('equipment', '')
    prompt = ("Read the digital temperature display in this photo (a %s%s). "
              "Return ONLY compact JSON, no prose: "
              "{\"temperature\": <number>, \"displayText\": \"<exactly what is shown, incl. minus sign and decimal>\", "
              "\"confidence\": <0-100>, \"readable\": <true or false>}. "
              "Read the MAIN temperature number exactly as shown, including any minus sign and decimal point. "
              "If no temperature number is legible, set readable=false."
              % (typ, (' — ' + equip) if equip else ''))
    content, err = _openai_vision(f.read(), f.mimetype, prompt)
    if err is not None: return jsonify(readable=False, fallback=True, error=err), 200
    d = _extract_json(content) or {}
    return jsonify(temperature=d.get('temperature'), displayText=d.get('displayText'),
                   text=str(d.get('displayText') or ''), confidence=d.get('confidence'),
                   readable=bool(d.get('readable', d.get('temperature') is not None)),
                   source='ChatGPT Vision', model=os.environ.get('OPENAI_VISION_MODEL', 'gpt-4o-mini'))

@api.route('/api/vision-text', methods=['POST'])
def vision_text():
    require_auth()
    f = request.files.get('image')
    if not f: return jsonify(text='', error='no image'), 400
    prompt = request.form.get('prompt') or ("Read all visible text and numbers in this photo (product labels, "
             "expiry / use-by dates, prices, weights). Return them as plain text, one item per line. No commentary.")
    content, err = _openai_vision(f.read(), f.mimetype, prompt, max_tokens=400)
    if err is not None: return jsonify(text='', error=err), 200
    return jsonify(text=content or '', source='ChatGPT Vision')

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
