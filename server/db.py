"""
MCQ Supermarket backend — database layer (SQLite now, MySQL-ready later).

Design notes
------------
* Every store's data is isolated by `store_id` on every row. No query ever
  returns rows from another store unless the caller is a Super Admin.
* The working path stores one JSON state blob per store (`store_state`) so the
  existing frontend keeps working unchanged. Photos are saved as FILES with a
  metadata row (never inside the giant JSON). Audit logs + per-store snapshots
  are first-class tables. The normalized tables (staff, checklist_*, records,
  bin_records, schedule_*) exist so heavy data can be split out later without a
  schema rewrite.
* To move to MySQL on PythonAnywhere: swap `connect()` for a MySQL connector and
  change `AUTOINC`/types; all SQL is kept simple and portable.
"""
import os, sqlite3, json, time, hashlib, secrets

BASE   = os.path.dirname(os.path.abspath(__file__))
DATA   = os.path.join(BASE, 'data')
DB_PATH = os.path.join(DATA, 'mcq.db')
UPLOADS = os.path.join(BASE, 'uploads')

STORES = ['Morley', 'Mirrabooka', 'Malaga', 'Subiaco', 'Armadale', 'Warehouse', 'Demo']
# Stores that were removed — their data is purged on init (see init_db).
RETIRED_STORES = ['Beechboro Fresh', 'Market West']

# seed passwords (same scheme as the old frontend). These live ONLY on the server now.
SUPER_PW = '99999'
# Per-store admin passwords (each store admin has its own). Change here, then the next
# app start re-seeds new ones (existing data is untouched).
ADMIN_PW = {'Morley':'1010','Mirrabooka':'2020','Malaga':'3030','Subiaco':'4040',
            'Armadale':'5050','Warehouse':'8080','Demo':'0000'}
BRANCH_PW = {'Morley':'1111','Mirrabooka':'2222','Malaga':'3333','Subiaco':'4444',
             'Armadale':'5555','Warehouse':'8000','Demo':'0000'}

TOKEN_TTL = 60 * 60 * 24 * 30   # 30 days

SCHEMA = """
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, store_id TEXT,
  password_hash TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, role TEXT NOT NULL, store_id TEXT, created_at REAL, expires_at REAL);
CREATE TABLE IF NOT EXISTS store_state (
  store_id TEXT PRIMARY KEY, state_json TEXT, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS store_config (
  store_id TEXT PRIMARY KEY, config_json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS store_state_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, state_json TEXT, created_at TEXT, created_by TEXT);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, store_id TEXT, filename TEXT, mime TEXT, meta_json TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, store_id TEXT, action TEXT,
  entity_type TEXT, entity_id TEXT, before_json TEXT, after_json TEXT, created_at TEXT);
-- future normalization (created now, populated later):
CREATE TABLE IF NOT EXISTS staff (
  id TEXT, store_id TEXT, data_json TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS checklist_templates (
  store_id TEXT PRIMARY KEY, data_json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id TEXT, store_id TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS records (
  id TEXT, store_id TEXT, module TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, module, id));
CREATE TABLE IF NOT EXISTS bin_records (
  id TEXT, store_id TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id TEXT, store_id TEXT, data_json TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, data_json TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS idx_audit_store ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_photos_store ON photos(store_id);
CREATE INDEX IF NOT EXISTS idx_snap_store ON store_state_snapshots(store_id);
"""

def connect():
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(UPLOADS, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')      # avoids "database is locked" under load
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

def now():
    return time.strftime('%Y-%m-%d %H:%M:%S')

def get_setting(key, default=None):
    conn = connect()
    try:
        row = conn.execute('SELECT value_json FROM settings WHERE key=?', (key,)).fetchone()
        if not row or row['value_json'] is None: return default
        try: return json.loads(row['value_json'])
        except Exception: return default
    finally:
        conn.close()

def set_setting(key, value):
    conn = connect()
    try:
        conn.execute('INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?) '
                     'ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
                     (key, json.dumps(value), now()))
        conn.commit()
    finally:
        conn.close()

def hash_pw(pw):
    return hashlib.sha256(('mcq-salt::' + str(pw)).encode()).hexdigest()

def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    # migration: schedule_history needs a stable client id so merge-saves upsert
    # (instead of duplicating) and concurrent users don't clobber each other.
    try: conn.execute('ALTER TABLE schedule_history ADD COLUMN rec_id TEXT')
    except Exception: pass
    try: conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_recid ON schedule_history(store_id, rec_id)')
    except Exception: pass
    # seed stores
    for s in STORES:
        conn.execute('INSERT OR IGNORE INTO stores(id,name,active,created_at) VALUES(?,?,1,?)', (s, s, now()))
    # seed users (passwords server-side only)
    def add_user(role, store, pw, sync=False):
        cur = conn.execute('SELECT 1 FROM users WHERE role=? AND IFNULL(store_id,"")=?', (role, store or ''))
        if not cur.fetchone():
            conn.execute('INSERT INTO users(role,store_id,password_hash,created_at) VALUES(?,?,?,?)',
                         (role, store, hash_pw(pw), now()))
        elif sync:
            # keep the stored password in sync with the constant above (lets us
            # change admin/super passwords by editing this file + restarting)
            conn.execute('UPDATE users SET password_hash=? WHERE role=? AND IFNULL(store_id,"")=?',
                         (hash_pw(pw), role, store or ''))
    add_user('super', None, SUPER_PW, sync=True)
    for s, pw in ADMIN_PW.items():
        add_user('admin', s, pw, sync=True)
    for s, pw in BRANCH_PW.items():
        add_user('staff', s, pw)
    # one-time purge of retired stores (Beechboro Fresh, Market West) — data permanently removed
    for rs in RETIRED_STORES:
        for tbl in ('records', 'staff', 'checklist_submissions', 'bin_records',
                    'schedule_history', 'store_state', 'store_state_snapshots',
                    'store_config', 'photos', 'audit_logs'):
            try: conn.execute('DELETE FROM %s WHERE store_id=?' % tbl, (rs,))
            except Exception: pass
        try: conn.execute('DELETE FROM stores WHERE id=?', (rs,))
        except Exception: pass
        try: conn.execute('UPDATE users SET password_hash=? WHERE store_id=?', ('retired-'+secrets.token_hex(8), rs))
        except Exception: pass
    conn.commit(); conn.close()

# ---- auth ----
def verify_login(mode, store, pw):
    """Returns (role, store_id) on success or None. store_id is 'ALL' for super."""
    conn = connect()
    try:
        if mode == 'super':
            row = conn.execute('SELECT password_hash FROM users WHERE role="super"').fetchone()
            return ('super', 'ALL') if row and row['password_hash'] == hash_pw(pw) else None
        if mode == 'admin':
            if store not in STORES: return None
            row = conn.execute('SELECT password_hash FROM users WHERE role="admin" AND store_id=?', (store,)).fetchone()
            return ('admin', store) if row and row['password_hash'] == hash_pw(pw) else None
        # staff: per-store password
        if store not in STORES: return None
        row = conn.execute('SELECT password_hash FROM users WHERE role="staff" AND store_id=?', (store,)).fetchone()
        return ('staff', store) if row and row['password_hash'] == hash_pw(pw) else None
    finally:
        conn.close()

def issue_token(role, store_id):
    tok = secrets.token_hex(24)
    conn = connect()
    conn.execute('INSERT INTO tokens(token,role,store_id,created_at,expires_at) VALUES(?,?,?,?,?)',
                 (tok, role, store_id, time.time(), time.time() + TOKEN_TTL))
    conn.commit(); conn.close()
    return tok

def auth_from_token(token):
    if not token: return None
    conn = connect()
    try:
        row = conn.execute('SELECT role,store_id,expires_at FROM tokens WHERE token=?', (token,)).fetchone()
        if not row or row['expires_at'] < time.time(): return None
        return {'role': row['role'], 'store_id': row['store_id']}
    finally:
        conn.close()

def can_access(au, store_id):
    return bool(au) and (au['role'] == 'super' or au['store_id'] == store_id)

# ---- per-store state: heavy collections normalized into tables, the rest kept as a lean blob ----
# The frontend wire shape is preserved exactly (firebase.js buildState/applyState):
# records live in `records`, staff in `staff`, submissions/schedule history/bin records in
# their own tables — so the JSON blob no longer carries those growing arrays (saves space &
# lets us query per-record later). load_state() rebuilds the identical full state on read.

def _parse(v):
    if v is None: return None
    if isinstance(v, (list, dict)): return v
    if isinstance(v, str):
        try: return json.loads(v)
        except Exception: return None
    return v

def state_updated_at(store_id):
    conn = connect()
    try:
        row = conn.execute('SELECT updated_at FROM store_state WHERE store_id=?', (store_id,)).fetchone()
        return row['updated_at'] if row else None
    finally:
        conn.close()

def save_state(store_id, state, user):
    state = dict(state or {})
    conn = connect()
    try:
        # records (per module) — MERGE (upsert): never mass-delete, so concurrent
        # editors at the same store accumulate rows instead of wiping each other.
        modules = state.get('modules') or {}
        if isinstance(modules, dict):
            for m, arr in modules.items():
                if not isinstance(arr, list): continue
                for i, r in enumerate(arr):
                    rid = str((isinstance(r, dict) and r.get('id')) or (str(m) + '#' + str(i)))
                    conn.execute('INSERT OR REPLACE INTO records(id,store_id,module,data_json,created_at) VALUES(?,?,?,?,?)',
                                 (rid, store_id, str(m), json.dumps(r), now()))
        # staff (merge/upsert)
        staff = state.get('staff') or []
        if isinstance(staff, list):
            for i, s in enumerate(staff):
                sid = str((isinstance(s, dict) and (s.get('id') or s.get('code'))) or ('s#' + str(i)))
                conn.execute('INSERT OR REPLACE INTO staff(id,store_id,data_json) VALUES(?,?,?)', (sid, store_id, json.dumps(s)))
        # checklist submissions (merge/upsert)
        subs = _parse(state.get('checklistSubs'))
        if isinstance(subs, list):
            for i, s in enumerate(subs):
                cid = str((isinstance(s, dict) and s.get('id')) or ('c#' + str(i)))
                conn.execute('INSERT OR REPLACE INTO checklist_submissions(id,store_id,data_json,created_at) VALUES(?,?,?,?)',
                             (cid, store_id, json.dumps(s), now()))
        # schedule history (merge/upsert by client record id, deduped via rec_id index)
        sh = _parse(state.get('scheduleHistory'))
        if isinstance(sh, list):
            for i, r in enumerate(sh):
                rid = str((isinstance(r, dict) and r.get('id')) or ('sh#' + str(i)))
                conn.execute('INSERT OR REPLACE INTO schedule_history(rec_id,store_id,data_json,created_at) VALUES(?,?,?,?)',
                             (rid, store_id, json.dumps(r), now()))
        # bin records (merge/upsert)
        ba = _parse(state.get('binAdmin'))
        bin_recs = ba.get('records') if isinstance(ba, dict) else None
        if isinstance(bin_recs, list):
            for i, r in enumerate(bin_recs):
                bid = str((isinstance(r, dict) and r.get('id')) or ('b#' + str(i)))
                conn.execute('INSERT OR REPLACE INTO bin_records(id,store_id,data_json,created_at) VALUES(?,?,?,?)',
                             (bid, store_id, json.dumps(r), now()))
        # lean blob: identical shape, heavy arrays emptied (rebuilt on load)
        lean = dict(state)
        lean['modules'] = {}
        lean['staff'] = []
        lean['checklistSubs'] = '[]'
        lean['scheduleHistory'] = '[]'
        if isinstance(ba, dict):
            ba2 = dict(ba); ba2['records'] = []
            lean['binAdmin'] = json.dumps(ba2)
        blob = json.dumps(lean)
        conn.execute("""INSERT INTO store_state(store_id,state_json,updated_at,updated_by) VALUES(?,?,?,?)
                        ON CONFLICT(store_id) DO UPDATE SET state_json=excluded.state_json,
                        updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                     (store_id, blob, now(), user))
        # capped snapshot trail (lean blob — size/timeline indicator)
        conn.execute('INSERT INTO store_state_snapshots(store_id,state_json,created_at,created_by) VALUES(?,?,?,?)',
                     (store_id, blob, now(), user))
        conn.execute("""DELETE FROM store_state_snapshots WHERE store_id=? AND id NOT IN
                        (SELECT id FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 20)""",
                     (store_id, store_id))
        conn.commit()
        return len(blob)
    finally:
        conn.close()

def load_state(store_id):
    conn = connect()
    try:
        row = conn.execute('SELECT state_json FROM store_state WHERE store_id=?', (store_id,)).fetchone()
        if not row: return None
        state = json.loads(row['state_json'])
        mods = {}
        for r in conn.execute('SELECT module,data_json FROM records WHERE store_id=?', (store_id,)).fetchall():
            mods.setdefault(r['module'], []).append(json.loads(r['data_json']))
        state['modules'] = mods
        state['staff'] = [json.loads(r['data_json']) for r in
                          conn.execute('SELECT data_json FROM staff WHERE store_id=?', (store_id,)).fetchall()]
        subs = [json.loads(r['data_json']) for r in
                conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=?', (store_id,)).fetchall()]
        state['checklistSubs'] = json.dumps(subs)
        sh = [json.loads(r['data_json']) for r in
              conn.execute('SELECT data_json FROM schedule_history WHERE store_id=? ORDER BY id', (store_id,)).fetchall()]
        state['scheduleHistory'] = json.dumps(sh)
        ba = _parse(state.get('binAdmin')) or {'activeDays': ['Tue', 'Thu', 'Fri'], 'checklist': [], 'records': []}
        ba['records'] = [json.loads(r['data_json']) for r in
                         conn.execute('SELECT data_json FROM bin_records WHERE store_id=?', (store_id,)).fetchall()]
        state['binAdmin'] = json.dumps(ba)
        return state
    finally:
        conn.close()

def write_audit(user, store_id, action, entity_type, entity_id, before, after):
    conn = connect()
    conn.execute("""INSERT INTO audit_logs(user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at)
                    VALUES(?,?,?,?,?,?,?,?)""",
                 (user, store_id, action, entity_type, str(entity_id or ''),
                  json.dumps(before) if before is not None else None,
                  json.dumps(after) if after is not None else None, now()))
    conn.commit(); conn.close()
