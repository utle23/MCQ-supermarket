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

STORES = ['Morley', 'Mirrabooka', 'Malaga', 'Subiaco', 'Armadale',
          'Beechboro Fresh', 'Market West', 'Warehouse']

# seed passwords (same scheme as the old frontend). These live ONLY on the server now.
SUPER_PW = '99999'
ADMIN_PW = '77771'
BRANCH_PW = {'Morley':'1111','Mirrabooka':'2222','Malaga':'3333','Subiaco':'4444',
             'Armadale':'5555','Beechboro Fresh':'6666','Market West':'7000','Warehouse':'8000'}

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
  id TEXT, store_id TEXT, module TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS bin_records (
  id TEXT, store_id TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id TEXT, store_id TEXT, data_json TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, data_json TEXT, created_at TEXT);
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

def hash_pw(pw):
    return hashlib.sha256(('mcq-salt::' + str(pw)).encode()).hexdigest()

def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    # seed stores
    for s in STORES:
        conn.execute('INSERT OR IGNORE INTO stores(id,name,active,created_at) VALUES(?,?,1,?)', (s, s, now()))
    # seed users (passwords server-side only)
    def add_user(role, store, pw):
        cur = conn.execute('SELECT 1 FROM users WHERE role=? AND IFNULL(store_id,"")=?', (role, store or ''))
        if not cur.fetchone():
            conn.execute('INSERT INTO users(role,store_id,password_hash,created_at) VALUES(?,?,?,?)',
                         (role, store, hash_pw(pw), now()))
    add_user('super', None, SUPER_PW)
    add_user('admin', None, ADMIN_PW)
    for s, pw in BRANCH_PW.items():
        add_user('staff', s, pw)
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
            row = conn.execute('SELECT password_hash FROM users WHERE role="admin"').fetchone()
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

def write_audit(user, store_id, action, entity_type, entity_id, before, after):
    conn = connect()
    conn.execute("""INSERT INTO audit_logs(user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at)
                    VALUES(?,?,?,?,?,?,?,?)""",
                 (user, store_id, action, entity_type, str(entity_id or ''),
                  json.dumps(before) if before is not None else None,
                  json.dumps(after) if after is not None else None, now()))
    conn.commit(); conn.close()
