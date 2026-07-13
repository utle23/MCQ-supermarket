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
import os, sqlite3, json, time, hashlib, secrets, re as _re, unicodedata

BASE   = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR lets a host (e.g. a Render persistent disk) place the DB file + uploads on durable
# storage. Falls back to the repo folders for local dev.
DATA   = os.environ.get('DATA_DIR') or os.path.join(BASE, 'data')
DB_PATH = os.path.join(DATA, 'mcq.db')
UPLOADS = os.environ.get('UPLOADS_DIR') or (os.path.join(DATA, 'uploads') if os.environ.get('DATA_DIR') else os.path.join(BASE, 'uploads'))

# ---- database backend: Postgres when DATABASE_URL is set (Render), else SQLite (local dev) ----
DATABASE_URL = os.environ.get('DATABASE_URL', '')
IS_PG = bool(DATABASE_URL)
if IS_PG:
    import psycopg2, psycopg2.extras

class _Cur:
    """Uniform cursor: .fetchone()/.fetchall() return dict-like rows (row['col'] + row.keys())."""
    def __init__(self, cur): self._c = cur
    def fetchone(self): return self._c.fetchone()
    def fetchall(self): return self._c.fetchall()
    @property
    def rowcount(self): return self._c.rowcount

def _pg_translate(sql):
    # Postgres uses %s placeholders and needs literal % doubled; our SQL never uses a literal %.
    return sql.replace('?', '%s')

class _Conn:
    """Thin wrapper so the whole codebase can keep calling conn.execute(sql, params) with ? holders,
    conn.commit()/close(), and conn.executescript(ddl) on BOTH SQLite and Postgres."""
    def __init__(self, raw): self.raw = raw
    def execute(self, sql, params=()):
        if IS_PG:
            cur = self.raw.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(_pg_translate(sql), params)
            return _Cur(cur)
        return self.raw.execute(sql, params)
    def executescript(self, script):
        if IS_PG:
            ddl = _pg_ddl(script)
            cur = self.raw.cursor(); cur.execute(ddl); return _Cur(cur)
        return self.raw.executescript(script)
    def commit(self): return self.raw.commit()
    def close(self): return self.raw.close()

def _pg_ddl(script):
    """Make the shared SQLite schema valid for Postgres: autoincrement PKs + REAL types."""
    s = script
    s = _re.sub(r'INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY', s, flags=_re.I)
    s = s.replace('created_at REAL', 'created_at DOUBLE PRECISION').replace('expires_at REAL', 'expires_at DOUBLE PRECISION')
    return s

STORES = ['Morley', 'Mirrabooka', 'Malaga', 'Subiaco', 'Armadale', 'Warehouse']
# Stores that were removed — their data is purged on init (see init_db).
RETIRED_STORES = ['Beechboro Fresh', 'Market West']

# seed passwords (same scheme as the old frontend). These live ONLY on the server now.
SUPER_PW = '99999'
BA_PW = '19'   # "Chú Ba" — read-only viewer of checklist results across ALL stores
# Per-store admin passwords (each store admin has its own). Change here, then the next
# app start re-seeds new ones (existing data is untouched).
ADMIN_PW = {'Morley':'1010','Mirrabooka':'2020','Malaga':'3030','Subiaco':'4040',
            'Armadale':'5050','Warehouse':'8080'}
BRANCH_PW = {'Morley':'1111','Mirrabooka':'2222','Malaga':'3333','Subiaco':'4444',
             'Armadale':'5555','Warehouse':'8000'}

TOKEN_TTL = 60 * 60 * 24 * 7    # 7 days (was 30) — shorter window if a token leaks

SCHEMA = """
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, store_id TEXT,
  password_hash TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, role TEXT NOT NULL, store_id TEXT, created_at REAL, expires_at REAL);
CREATE TABLE IF NOT EXISTS staff_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL, staff_id TEXT NOT NULL,
  staff_name TEXT, password TEXT NOT NULL UNIQUE, created_at TEXT, updated_at TEXT);
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
CREATE TABLE IF NOT EXISTS deleted_records (
  store_id TEXT, id TEXT, deleted_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS bin_records (
  id TEXT, store_id TEXT, data_json TEXT, created_at TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id TEXT, store_id TEXT, data_json TEXT, PRIMARY KEY (store_id, id));
CREATE TABLE IF NOT EXISTS schedule_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, data_json TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT);
-- inbox / messaging (scales with employee count; kept OUT of the per-store state blob)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT,
  from_role TEXT, from_name TEXT, from_staff_id TEXT,
  to_staff_id TEXT, to_super INTEGER DEFAULT 0, to_managers INTEGER DEFAULT 0, to_store_all INTEGER DEFAULT 0,
  kind TEXT, subject TEXT, body_html TEXT, thread_id TEXT,
  read_by_json TEXT DEFAULT '[]', created_at TEXT);
-- announcements (store-scoped or ALL; read-only feed for staff)
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT, title TEXT, body_html TEXT,
  image_id TEXT, author TEXT, created_at TEXT, pinned INTEGER DEFAULT 0);
-- message attachments (Gmail-style): metadata row; bytes live on disk in uploads/_files
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, store_id TEXT, name TEXT, mime TEXT, size INTEGER,
  filename TEXT, created_at TEXT);
-- unified user accounts (activation system): 4-digit unique ID, self-chosen password,
-- role/store assigned centrally (account admin). First digit = store: Morley 1, Mirrabooka 2,
-- Malaga 3, Subiaco 4, Armadale 5, Warehouse 8, Demo 9, head-office/no-store 7.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, password TEXT, role TEXT DEFAULT 'employee',
  store_id TEXT, staff_id TEXT, name TEXT, email TEXT, department TEXT,
  activated INTEGER DEFAULT 0, acct_admin INTEGER DEFAULT 0, needs_profile INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT);
-- Face ID / passkey device credentials: the device biometric (WebAuthn) unlocks a
-- device-bound secret which is exchanged for a REAL server session. Hashed at rest,
-- bound to the enrolling identity, revocable per device. Never synced between devices.
CREATE TABLE IF NOT EXISTS device_creds (
  id TEXT PRIMARY KEY, secret_hash TEXT, cred_id TEXT, role TEXT, store_id TEXT,
  staff_id TEXT, staff_name TEXT, account_id TEXT, label TEXT, created_at TEXT, last_used TEXT);
-- login brute-force throttle: failed attempts per key (IP, or IP+id), auto-locks
CREATE TABLE IF NOT EXISTS login_throttle (
  k TEXT PRIMARY KEY, fails INTEGER DEFAULT 0, locked_until REAL DEFAULT 0, updated_at REAL DEFAULT 0);
-- Deputy attendance: one row per clock-in / clock-out webhook event
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY, ts_id TEXT, event TEXT, store_id TEXT, staff_id TEXT, staff_name TEXT,
  deputy_employee TEXT, scheduled_start TEXT, actual_start TEXT, scheduled_end TEXT, actual_end TEXT,
  late_min INTEGER DEFAULT 0, over_min INTEGER DEFAULT 0, warning TEXT DEFAULT '', created_at TEXT);
CREATE INDEX IF NOT EXISTS idx_att_staff ON attendance(store_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_store ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_photos_store ON photos(store_id);
CREATE INDEX IF NOT EXISTS idx_snap_store ON store_state_snapshots(store_id);
CREATE INDEX IF NOT EXISTS idx_msg_store ON messages(store_id);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_ann_store ON announcements(store_id);
"""

def connect():
    if IS_PG:
        raw = psycopg2.connect(DATABASE_URL); raw.set_client_encoding('UTF8')
        return _Conn(raw)
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(UPLOADS, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')      # avoids "database is locked" under load
    conn.execute('PRAGMA foreign_keys=ON')
    return _Conn(conn)

def now():
    # Perth wall-clock (Australia/Perth = UTC+8, no DST). Production servers run in UTC,
    # so server-side timestamps (messages, announcements, submissions, audit) must be
    # shifted or every displayed time reads 8 hours early.
    return time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 8 * 3600))

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
                     'ON CONFLICT (key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
                     (key, json.dumps(value), now()))
        conn.commit()
    finally:
        conn.close()

def hash_pw(pw):
    return hashlib.sha256(('mcq-salt::' + str(pw)).encode()).hexdigest()

def init_db():
    conn = connect()
    # Postgres aborts the whole transaction on the first error, but the idempotent ALTER-TABLE
    # migrations below intentionally fail (duplicate column) on every boot after the first.
    # Autocommit makes each DDL statement independent so one expected failure can't poison the rest.
    if IS_PG:
        try: conn.raw.autocommit = True
        except Exception: pass
    conn.executescript(SCHEMA)
    # migration: schedule_history needs a stable client id so merge-saves upsert
    # (instead of duplicating) and concurrent users don't clobber each other.
    try: conn.execute('ALTER TABLE schedule_history ADD COLUMN rec_id TEXT')
    except Exception: pass
    try: conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_recid ON schedule_history(store_id, rec_id)')
    except Exception: pass
    # migration: tokens carry the employee identity (staff_id/name) for individual logins
    for col in ('staff_id', 'staff_name', 'account_id'):
        try: conn.execute('ALTER TABLE tokens ADD COLUMN %s TEXT' % col)
        except Exception: pass
    try: conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_staffacct ON staff_accounts(store_id, staff_id)')
    except Exception: pass
    try: conn.execute('ALTER TABLE announcements ADD COLUMN pinned INTEGER DEFAULT 0')   # pin-to-top support
    except Exception: pass
    try: conn.execute("ALTER TABLE messages ADD COLUMN attachments_json TEXT DEFAULT '[]'")   # Gmail-style attachments
    except Exception: pass
    try: conn.execute('ALTER TABLE announcements ADD COLUMN department TEXT')   # department-group announcements
    except Exception: pass
    try: conn.execute('ALTER TABLE photos ADD COLUMN cloud TEXT')                # Cloudinary asset id
    except Exception: pass
    try: conn.execute('ALTER TABLE files ADD COLUMN cloud TEXT')                 # Cloudinary base id
    except Exception: pass
    try: conn.execute('ALTER TABLE files ADD COLUMN chunks INTEGER DEFAULT 0')   # >10MB files are split
    except Exception: pass
    try: conn.execute("ALTER TABLE announcements ADD COLUMN attachments_json TEXT DEFAULT '[]'")   # announcement files
    except Exception: pass
    try: conn.execute("ALTER TABLE announcements ADD COLUMN read_by_json TEXT DEFAULT '[]'")       # read/acknowledge receipts
    except Exception: pass
    try: conn.execute('ALTER TABLE accounts ADD COLUMN reset_code TEXT')          # forgot-password: hashed code
    except Exception: pass
    try: conn.execute('ALTER TABLE accounts ADD COLUMN reset_expires REAL')       # forgot-password: code expiry (epoch)
    except Exception: pass
    # seed stores
    for s in STORES:
        conn.execute('INSERT INTO stores(id,name,active,created_at) VALUES(?,?,1,?) ON CONFLICT (id) DO NOTHING', (s, s, now()))
    # seed users (passwords server-side only)
    def add_user(role, store, pw, sync=False):
        cur = conn.execute("SELECT 1 FROM users WHERE role=? AND COALESCE(store_id,'')=?", (role, store or ''))
        if not cur.fetchone():
            conn.execute('INSERT INTO users(role,store_id,password_hash,created_at) VALUES(?,?,?,?)',
                         (role, store, hash_pw(pw), now()))
        elif sync:
            # keep the stored password in sync with the constant above (lets us
            # change admin/super passwords by editing this file + restarting)
            conn.execute("UPDATE users SET password_hash=? WHERE role=? AND COALESCE(store_id,'')=?",
                         (hash_pw(pw), role, store or ''))
    add_user('super', None, SUPER_PW, sync=True)
    add_user('ba', None, BA_PW, sync=True)
    for s, pw in ADMIN_PW.items():
        add_user('admin', s, pw, sync=True)
    for s, pw in BRANCH_PW.items():
        add_user('staff', s, pw)
    conn.commit()
    try: seed_named_supers()   # 6 ready-made Super Admin accounts (7001-7006)
    except Exception: pass
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
## ---------- login brute-force throttle ----------
THROTTLE_LOCK = 300        # lock duration (seconds) = 5 minutes
THROTTLE_WINDOW = 900      # a fail streak older than this is forgotten (15 min)
THROTTLE_ID_MAX = 6        # wrong attempts on ONE account (per IP) before that account locks
THROTTLE_IP_MAX = 20       # wrong attempts from ONE IP across many accounts (anti-scan) — loose
                           # so a shared store IP isn't locked by a few honest typos

def _throttle_keys(ip, login_id):
    """Returns [(key, limit)]. The per-account key locks fast (6); the broad per-IP key is
    lenient (20) so one store's shared connection isn't locked by a couple of typos."""
    ip = (str(ip or 'unknown').split(',')[0].strip()) or 'unknown'
    keys = [('ip:' + ip, THROTTLE_IP_MAX)]
    if str(login_id or '').strip():
        keys.append(('id:' + ip + ':' + str(login_id).strip(), THROTTLE_ID_MAX))
    return keys

def login_lock_remaining(ip, login_id):
    """Returns seconds remaining if any relevant key is locked, else 0."""
    conn = connect()
    try:
        now_t = time.time(); worst = 0
        for k, _lim in _throttle_keys(ip, login_id):
            row = conn.execute('SELECT locked_until FROM login_throttle WHERE k=?', (k,)).fetchone()
            if row and row['locked_until'] and row['locked_until'] > now_t:
                worst = max(worst, int(row['locked_until'] - now_t))
        return worst
    finally:
        conn.close()

def login_note_fail(ip, login_id):
    """Record a failed attempt on each key; lock a key once it passes its own limit."""
    conn = connect()
    try:
        now_t = time.time()
        for k, limit in _throttle_keys(ip, login_id):
            row = conn.execute('SELECT fails,locked_until,updated_at FROM login_throttle WHERE k=?', (k,)).fetchone()
            fails = 1
            if row and row['updated_at'] and (now_t - row['updated_at']) < THROTTLE_WINDOW:
                fails = int(row['fails'] or 0) + 1
            locked = now_t + THROTTLE_LOCK if fails >= limit else (row['locked_until'] if row else 0)
            conn.execute("""INSERT INTO login_throttle(k,fails,locked_until,updated_at) VALUES(?,?,?,?)
                            ON CONFLICT (k) DO UPDATE SET fails=excluded.fails, locked_until=excluded.locked_until, updated_at=excluded.updated_at""",
                         (k, fails, locked or 0, now_t))
        conn.commit()
    finally:
        conn.close()

def login_note_ok(ip, login_id):
    """Successful login clears the counters for its keys (so honest users never accrue a lock)."""
    conn = connect()
    try:
        for k, _lim in _throttle_keys(ip, login_id):
            conn.execute('DELETE FROM login_throttle WHERE k=?', (k,))
        conn.commit()
    finally:
        conn.close()

def verify_login(mode, store, pw, login_id=None):
    """Returns (role, store_id[, meta]) on success or None. store_id is 'ALL' for super.
    The login form has NO role tabs any more — credentials are self-identifying:
      * ID given → unified-account login; the account's ASSIGNED access decides the role.
      * no ID    → the password itself identifies the person: a staff numeric password
                   (globally unique, never colliding with the master passwords — see
                   _gen_staff_pw), the Super master password, or Chú Ba's.
    A legacy `mode` from an old cached client is still honoured for its master paths."""
    if str(login_id or '').strip():
        return account_login(login_id, pw, mode if mode not in (None, '', 'auto') else None)
    conn = connect()
    try:
        p = str(pw or '').strip()
        if not p: return None
        if mode in (None, '', 'auto'):
            # password IS the identity — try staff numeric first (most common), then masters
            row = conn.execute('SELECT store_id, staff_id, staff_name FROM staff_accounts WHERE password=?', (p,)).fetchone()
            if row and row['store_id'] in STORES:
                return ('employee', row['store_id'], {'staff_id': row['staff_id'], 'staff_name': row['staff_name']})
            row = conn.execute("SELECT password_hash FROM users WHERE role='super'").fetchone()
            if row and row['password_hash'] == hash_pw(p): return ('super', 'ALL')
            row = conn.execute("SELECT password_hash FROM users WHERE role='ba'").fetchone()
            if row and row['password_hash'] == hash_pw(p): return ('ba', 'ALL')
            return None
        # ---- legacy tab modes (old cached clients) ----
        if mode == 'super':
            row = conn.execute("SELECT password_hash FROM users WHERE role='super'").fetchone()
            return ('super', 'ALL') if row and row['password_hash'] == hash_pw(p) else None
        if mode == 'ba':
            row = conn.execute("SELECT password_hash FROM users WHERE role='ba'").fetchone()
            return ('ba', 'ALL') if row and row['password_hash'] == hash_pw(p) else None
        if mode == 'employee':
            row = conn.execute('SELECT store_id, staff_id, staff_name FROM staff_accounts WHERE password=?', (p,)).fetchone()
            if not row or row['store_id'] not in STORES: return None
            return ('employee', row['store_id'], {'staff_id': row['staff_id'], 'staff_name': row['staff_name']})
        if mode in ('admin', 'staff'):
            return {'need_id': True}
        return None
    finally:
        conn.close()

# ---------- realtime: tiny change-hints pushed to connected WebSocket clients ----------
EVENT_SINKS = []   # ws_hub registers its broadcaster here (single-process / SQLite path)
def emit_event(what, store=None, client=None):
    """Notify every connected client that `what` changed ('inbox' / 'announcements' /
    'state' + store). `client` echoes the saver's client id so THAT device can skip
    re-fetching its own save. Postgres: NOTIFY reaches every worker. Fire-and-forget."""
    body = {'what': what}
    if store: body['store'] = store
    if client: body['client'] = client
    payload = json.dumps(body)
    try:
        if IS_PG:
            conn = connect()
            try: conn.execute("SELECT pg_notify('mcq_events', ?)", (payload,))
            finally: conn.close()
        else:
            for cb in EVENT_SINKS:
                try: cb(payload)
                except Exception: pass
    except Exception:
        pass

def issue_token(role, store_id, staff_id=None, staff_name=None, account_id=None):
    tok = secrets.token_hex(24)
    conn = connect()
    conn.execute('INSERT INTO tokens(token,role,store_id,created_at,expires_at,staff_id,staff_name,account_id) VALUES(?,?,?,?,?,?,?,?)',
                 (tok, role, store_id, time.time(), time.time() + TOKEN_TTL, staff_id, staff_name, account_id))
    conn.commit(); conn.close()
    return tok

def revoke_token(token):
    if not token: return
    conn = connect()
    try:
        conn.execute('DELETE FROM tokens WHERE token=?', (token,)); conn.commit()
    finally:
        conn.close()

def auth_from_token(token):
    if not token: return None
    conn = connect()
    try:
        row = conn.execute('SELECT role,store_id,expires_at,staff_id,staff_name,account_id FROM tokens WHERE token=?', (token,)).fetchone()
        now_t = time.time()
        if not row or row['expires_at'] < now_t: return None
        # SLIDING expiry: an actively-used token is renewed so nobody is thrown out mid-shift
        # (the fixed 7-day window used to log people out while they were working). Only write
        # when >1 day has elapsed since the last renewal → ~1 write per token per day.
        try:
            if (row['expires_at'] - now_t) < (TOKEN_TTL - 86400):
                conn.execute('UPDATE tokens SET expires_at=? WHERE token=?', (now_t + TOKEN_TTL, token))
                conn.commit()
        except Exception: pass
        return {'role': row['role'], 'store_id': row['store_id'],
                'staff_id': row['staff_id'] if 'staff_id' in row.keys() else None,
                'staff_name': row['staff_name'] if 'staff_name' in row.keys() else None,
                'account_id': row['account_id'] if 'account_id' in row.keys() else None}
    finally:
        conn.close()

# ---- staff accounts (individual employee logins; numeric, unique, viewable) ----
def _role_pw_set():
    s = {SUPER_PW, BA_PW, '0000'}
    s.update(ADMIN_PW.values()); s.update(BRANCH_PW.values())
    return s

def _gen_staff_pw(conn):
    used = _role_pw_set()
    existing = {r['password'] for r in conn.execute('SELECT password FROM staff_accounts').fetchall()}
    used.update(existing)
    for _ in range(500):
        pw = str(secrets.randbelow(900000) + 100000)   # 6-digit, random (not sequential)
        if pw not in used:
            return pw
    return str(secrets.randbelow(9000000) + 1000000)    # 7-digit fallback

def create_staff_account(store, staff_id, name, reset=False):
    if store not in STORES: return None
    conn = connect()
    try:
        row = conn.execute('SELECT password FROM staff_accounts WHERE store_id=? AND staff_id=?', (store, str(staff_id))).fetchone()
        if row and not reset:
            conn.execute('UPDATE staff_accounts SET staff_name=?, updated_at=? WHERE store_id=? AND staff_id=?',
                         (name, now(), store, str(staff_id)))
            conn.commit()
            return {'store': store, 'staff_id': str(staff_id), 'name': name, 'password': row['password']}
        pw = _gen_staff_pw(conn)
        if row:
            conn.execute('UPDATE staff_accounts SET password=?, staff_name=?, updated_at=? WHERE store_id=? AND staff_id=?',
                         (pw, name, now(), store, str(staff_id)))
        else:
            conn.execute('INSERT INTO staff_accounts(store_id,staff_id,staff_name,password,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                         (store, str(staff_id), name, pw, now(), now()))
        conn.commit()
        return {'store': store, 'staff_id': str(staff_id), 'name': name, 'password': pw}
    finally:
        conn.close()

def update_staff_profile(store, staff_id, patch):
    """Merge a patch into ONE staff row (used by employee self-edit — avoids posting the
    whole store blob, keeping concurrency safe). Supports MOVING to another store:
    the staff row is re-homed and the person's account + live tokens follow."""
    conn = connect()
    try:
        sid = str(staff_id)
        row = conn.execute('SELECT data_json FROM staff WHERE store_id=? AND id=?', (store, sid)).fetchone()
        cur = {}
        if row and row['data_json']:
            try: cur = json.loads(row['data_json'])
            except Exception: cur = {}
        if isinstance(patch, dict):
            for k in patch: cur[k] = patch[k]
        new_store = str((patch or {}).get('store') or '') if isinstance(patch, dict) else ''
        target = new_store if (new_store and new_store in STORES and new_store != store) else store
        # one profile per gmail per store — refuse an email another (live) profile already owns
        if isinstance(patch, dict) and str(patch.get('email') or '').strip():
            hit = _store_staff_by_email(conn, target, patch['email'])
            if hit and str(hit['staff_id']) != sid and not (hit['data'].get('archived') or hit['data'].get('active') == 0):
                return {'error': 'Another staff member in %s already uses this email' % target}
        cur['store'] = target; cur['id'] = sid
        conn.execute('INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json', (sid, target, json.dumps(cur)))
        if target != store:
            conn.execute('DELETE FROM staff WHERE store_id=? AND id=?', (store, sid))
            conn.execute('UPDATE accounts SET store_id=?, updated_at=? WHERE staff_id=?', (target, now(), sid))
            conn.execute('UPDATE tokens SET store_id=? WHERE staff_id=?', (target, sid))          # session follows
            conn.execute('UPDATE staff_accounts SET store_id=? WHERE store_id=? AND staff_id=?', (target, store, sid))
        # keep the account's cached name in sync when the employee renames themselves
        if isinstance(patch, dict) and patch.get('name'):
            conn.execute('UPDATE staff_accounts SET staff_name=? WHERE store_id=? AND staff_id=?', (patch['name'], target, sid))
            conn.execute('UPDATE accounts SET name=? WHERE staff_id=?', (patch['name'], sid))
        conn.commit()
        return cur
    finally:
        conn.close()

def get_staff_accounts(store):
    conn = connect()
    try:
        rows = conn.execute('SELECT staff_id, staff_name, password, updated_at FROM staff_accounts WHERE store_id=?', (store,)).fetchall()
        return [{'staff_id': r['staff_id'], 'name': r['staff_name'], 'password': r['password'], 'updated_at': r['updated_at']} for r in rows]
    finally:
        conn.close()

def delete_staff_account(store, staff_id):
    conn = connect()
    try:
        conn.execute('DELETE FROM staff_accounts WHERE store_id=? AND staff_id=?', (store, str(staff_id)))
        conn.commit()
    finally:
        conn.close()

# ============================================================ UNIFIED ACCOUNTS (activation system)
# Every person activates once with the Gmail they use in Deputy: matched against the chosen
# store's staff directory -> gets a unique 4-digit ID (first digit = store) + their own password.
ACCT_ID_PREFIX = {'Morley': '1', 'Mirrabooka': '2', 'Malaga': '3', 'Subiaco': '4',
                  'Armadale': '5', 'Warehouse': '8'}
ACCT_TABS = {'employee': 'Staff', 'staff': 'Dept Lead', 'admin': 'Manager', 'super': 'Super'}

def _gen_account_id(conn, store):
    prefix = ACCT_ID_PREFIX.get(store or '', '7')   # head-office / no-store -> 7xxx
    import random
    for _ in range(500):
        cand = prefix + str(random.randint(100, 999))
        if not conn.execute('SELECT 1 FROM accounts WHERE id=?', (cand,)).fetchone():
            return cand
    raise RuntimeError('no free account id for prefix ' + prefix)

def _store_staff_by_email(conn, store, email):
    e = str(email or '').strip().lower()
    if not e: return None
    for r in conn.execute('SELECT id,data_json FROM staff WHERE store_id=?', (store,)).fetchall():
        try: d = json.loads(r['data_json'] or '{}')
        except Exception: d = {}
        if str(d.get('email') or '').strip().lower() == e:
            return {'staff_id': r['id'], 'name': d.get('name') or '', 'store': store, 'data': d}
    return None

# job title shown in Staff Management for a NEW profile created from an account's access level
STAFF_TITLE = {'admin': 'Store Manager', 'staff': 'Department Lead', 'employee': 'Team Member'}

def _sync_accounts_from_staff(conn, store_id):
    """Staff Management → Account Management (the reverse direction): after staff rows for a
    store are written, re-link each of the store's accounts to its profile by email when the
    link is missing/dangling, and follow profile renames into the account. The account EMAIL
    is deliberately never auto-changed — it is the activation/login key."""
    idx_id, idx_email = {}, {}
    for r in conn.execute('SELECT id,data_json FROM staff WHERE store_id=?', (store_id,)).fetchall():
        try: d = json.loads(r['data_json'] or '{}')
        except Exception: d = {}
        idx_id[str(r['id'])] = d
        e = str(d.get('email') or '').strip().lower()
        if e and e not in idx_email: idx_email[e] = (str(r['id']), d)
    for a in conn.execute('SELECT id,staff_id,name,email FROM accounts WHERE store_id=?', (store_id,)).fetchall():
        sid = str(a['staff_id'] or ''); d = idx_id.get(sid)
        if d is None:
            hit = idx_email.get(str(a['email'] or '').strip().lower())
            if hit:
                sid, d = hit
                conn.execute('UPDATE accounts SET staff_id=?, updated_at=? WHERE id=?', (sid, now(), a['id']))
        if d:
            n = str(d.get('name') or '').strip()
            if n and n != str(a['name'] or '').strip():
                conn.execute('UPDATE accounts SET name=?, updated_at=? WHERE id=?', (n, now(), a['id']))
    # pass 2 — STORE MOVES: a LIVE profile in THIS store whose gmail belongs to an account
    # homed at another store means the person moved (Staff Members edit). The account, their
    # sessions and Face-ID creds follow, and the old store's live copy is archived so each
    # person exists live in exactly ONE store.
    for e, pair in idx_email.items():
        sid, d = pair
        if d.get('archived') or d.get('active') == 0: continue
        a = conn.execute("SELECT id,store_id FROM accounts WHERE lower(email)=? AND role NOT IN ('super','ba')", (e,)).fetchone()
        if not a or (a['store_id'] or '') == store_id: continue
        old = a['store_id']
        conn.execute('UPDATE accounts SET store_id=?, staff_id=?, updated_at=? WHERE id=?', (store_id, sid, now(), a['id']))
        try:
            conn.execute('UPDATE tokens SET store_id=? WHERE account_id=?', (store_id, a['id']))
            conn.execute('UPDATE device_creds SET store_id=? WHERE account_id=?', (store_id, a['id']))
        except Exception: pass
        if old:
            for r2 in conn.execute('SELECT id,data_json FROM staff WHERE store_id=?', (old,)).fetchall():
                try: d2 = json.loads(r2['data_json'] or '{}')
                except Exception: d2 = {}
                if str(d2.get('email') or '').strip().lower() == e and not (d2.get('archived') or d2.get('active') == 0):
                    d2['archived'] = 1; d2['active'] = 0
                    conn.execute('UPDATE staff SET data_json=? WHERE store_id=? AND id=?', (json.dumps(d2), old, r2['id']))
            conn.execute('INSERT INTO audit_logs(user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
                         ('system (store-move sync)', store_id, 'update', 'staffMove', str(d.get('name') or e)[:80],
                          json.dumps({'from': old}), json.dumps({'to': store_id, 'account': a['id']}), now()))

def _next_staff_id(conn):
    """Next E#### staff id — continues the same global series bulk_import_staff uses."""
    max_e = 0
    for r in conn.execute('SELECT id FROM staff').fetchall():
        rid = str(r['id'] or '')
        if rid.startswith('E') and rid[1:].isdigit(): max_e = max(max_e, int(rid[1:]))
    return 'E%04d' % (max_e + 1)

def _ensure_staff_for_account(conn, acct):
    """Account Management is a source of truth for PEOPLE: every non-super account must have a
    live staff profile in ITS store — Staff Management, pickers and birthdays all read staff.
    Finds the profile (linked staff_id, else email match in the store), refreshes its
    name/email/department from the account and un-archives it; creates it when missing.
    Caller commits. Returns the staff id, or None when the account has no valid store."""
    a = dict(acct) if not isinstance(acct, dict) else acct
    role = a.get('role') or 'employee'
    store = a.get('store_id') or ''
    if role == 'super' or store not in STORES: return None
    email = str(a.get('email') or '').strip()
    name = str(a.get('name') or '').strip()
    dept = str(a.get('department') or '').strip()
    row = None
    sid = str(a.get('staff_id') or '')
    if sid:
        row = conn.execute('SELECT id,data_json FROM staff WHERE store_id=? AND id=?', (store, sid)).fetchone()
    if not row and email:
        hit = _store_staff_by_email(conn, store, email)
        if hit:
            row = conn.execute('SELECT id,data_json FROM staff WHERE store_id=? AND id=?', (store, hit['staff_id'])).fetchone()
    if row:
        try: d = json.loads(row['data_json'] or '{}')
        except Exception: d = {}
        if name: d['name'] = name
        if email: d['email'] = email
        if dept: d['dept'] = dept
        # keep a real roster job title; only fill from the access level when empty, or when
        # the account is leadership (Manager / Dept Lead) — that SHOULD show in Staff Management
        if role in ('admin', 'staff') or not str(d.get('role') or '').strip():
            d['role'] = STAFF_TITLE.get(role, 'Team Member')
            if not str(d.get('classification') or '').strip(): d['classification'] = d['role']
        d['active'] = 1; d['archived'] = 0; d['store'] = store; d['id'] = row['id']
        conn.execute('UPDATE staff SET data_json=? WHERE store_id=? AND id=?',
                     (json.dumps(d), store, row['id']))
        if str(a.get('staff_id') or '') != str(row['id']) and a.get('id'):
            conn.execute('UPDATE accounts SET staff_id=?, updated_at=? WHERE id=?', (row['id'], now(), a['id']))
        return row['id']
    nid = _next_staff_id(conn)
    title = STAFF_TITLE.get(role, 'Team Member')
    rec = {'id': nid, 'name': name or (email.split('@')[0].replace('.', ' ').title() if email else nid),
           'email': email, 'store': store, 'active': 1, 'archived': 0,
           'role': title, 'classification': title, 'dept': dept, 'dob': '',
           'start': now()[:10], 'basis': 'Individual', 'category': '', 'estatus': ''}
    conn.execute('INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json',
                 (nid, store, json.dumps(rec)))
    if a.get('id'):
        conn.execute('UPDATE accounts SET staff_id=?, updated_at=? WHERE id=?', (nid, now(), a['id']))
    return nid

def _archive_staff(conn, store, staff_id):
    """Mark a staff profile archived (used when an account moves to another store)."""
    if not store or not staff_id: return
    row = conn.execute('SELECT data_json FROM staff WHERE store_id=? AND id=?', (store, str(staff_id))).fetchone()
    if not row: return
    try: d = json.loads(row['data_json'] or '{}')
    except Exception: d = {}
    d['archived'] = 1; d['active'] = 0
    conn.execute('UPDATE staff SET data_json=? WHERE store_id=? AND id=?', (json.dumps(d), store, str(staff_id)))

def apply_store_config(store_id, cfg, user=None):
    """Store Config (Super) edits the LIVE store workspace: the checklist template and
    schedule tasks go straight into this store's state blob (template version bumped so
    every client at the store picks the change up on next sync), and staff rows are
    upserted with the same one-gmail-per-store guard as normal saves. ONE store only."""
    conn = connect()
    try:
        row = conn.execute('SELECT state_json FROM store_state WHERE store_id=?', (store_id,)).fetchone()
        state = {}
        if row and row['state_json']:
            try: state = json.loads(row['state_json'])
            except Exception: state = {}
        out = {}
        if isinstance(cfg.get('checklistItems'), list):
            prev_items = state.get('checklistItems')   # audit WHO added/removed which task
            state['checklistItems'] = json.dumps(cfg['checklistItems'])
            state['checklistTemplateVersion'] = int(state.get('checklistTemplateVersion') or 0) + 1
            out['checklistItems'] = len(cfg['checklistItems']); out['templateVersion'] = state['checklistTemplateVersion']
            try: _audit_template_diff(conn, store_id, prev_items, cfg['checklistItems'], user or 'store-config')
            except Exception: pass
        # departments / dept styling / deadlines are per-store too — persist them alongside the
        # tasks (array/object, matching the blob) so a Super editing one store's checklist also
        # moves its department list & deadlines to THAT store, and nowhere else.
        if isinstance(cfg.get('checklistDepts'), list):
            state['checklistDepts'] = cfg['checklistDepts']
            out['checklistDepts'] = len(cfg['checklistDepts'])
        if isinstance(cfg.get('checklistDeptMeta'), dict):
            state['checklistDeptMeta'] = cfg['checklistDeptMeta']
        if isinstance(cfg.get('checklistDeadlines'), dict):
            state['checklistDeadlines'] = cfg['checklistDeadlines']
        if isinstance(cfg.get('scheduleTasks'), list):
            state['scheduleTasks'] = json.dumps(cfg['scheduleTasks'])
            out['scheduleTasks'] = len(cfg['scheduleTasks'])
        conn.execute("""INSERT INTO store_state(store_id,state_json,updated_at,updated_by) VALUES(?,?,?,?)
                        ON CONFLICT (store_id) DO UPDATE SET state_json=excluded.state_json,
                        updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                     (store_id, json.dumps(state), now(), 'store-config'))
        staff = cfg.get('staff')
        if isinstance(staff, list) and staff:
            email_owner = {}
            for r0 in conn.execute('SELECT id,data_json FROM staff WHERE store_id=?', (store_id,)).fetchall():
                try: d0 = json.loads(r0['data_json'] or '{}')
                except Exception: d0 = {}
                e0 = str(d0.get('email') or '').strip().lower()
                if e0 and e0 not in email_owner:
                    email_owner[e0] = (str(r0['id']), bool(d0.get('archived') or d0.get('active') == 0))
            n = 0
            for i, s in enumerate(staff):
                if not isinstance(s, dict): continue
                sid = str(s.get('id') or s.get('code') or ('s#' + str(i)))
                e = str(s.get('email') or '').strip().lower()
                if e:
                    own = email_owner.get(e)
                    if own and own[0] != sid:
                        if not own[1]: continue                # live owner elsewhere → duplicate gmail
                        sid = own[0]; s = dict(s); s['id'] = sid; s['archived'] = 0; s['active'] = 1
                    email_owner[e] = (sid, bool(s.get('archived') or s.get('active') == 0))
                conn.execute('INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json', (sid, store_id, json.dumps(s)))
                n += 1
            _sync_accounts_from_staff(conn, store_id)
            out['staff'] = n
        conn.commit()
        try: emit_event('state', store_id)
        except Exception: pass
        return out
    finally:
        conn.close()

def staff_sync(fix=False, only=None):
    """Audit (and optionally repair) Account Management ↔ Staff Management per store.
    Audit lists, per store: accounts with NO staff profile, name mismatches between the
    account and its linked profile, dangling staff_id links, and (info) how many staff
    have no login account. fix=True runs _ensure_staff_for_account for every account —
    or ONLY the account ids in `only` (targeted repair approved case-by-case)."""
    only = {str(x) for x in only} if only else None
    conn = connect()
    try:
        staff_ids, staff_names, staff_emails = set(), {}, {}
        staff_count, archived_count = {}, {}
        for r in conn.execute('SELECT id,store_id,data_json FROM staff').fetchall():
            try: d = json.loads(r['data_json'] or '{}')
            except Exception: d = {}
            key = (r['store_id'], str(r['id']))
            staff_ids.add(key); staff_names[key] = str(d.get('name') or '')
            e = str(d.get('email') or '').strip().lower()
            if e: staff_emails[(r['store_id'], e)] = str(r['id'])
            if d.get('archived') or d.get('active') == 0:
                archived_count[r['store_id']] = archived_count.get(r['store_id'], 0) + 1
            else:
                staff_count[r['store_id']] = staff_count.get(r['store_id'], 0) + 1
        accounts = [dict(a) for a in conn.execute('SELECT * FROM accounts ORDER BY store_id, name').fetchall()]
        stores = {}
        def bucket(store):
            return stores.setdefault(store or '(no store)', {
                'accounts': 0, 'staff_active': staff_count.get(store, 0), 'staff_archived': archived_count.get(store, 0),
                'missing_staff': [], 'name_mismatch': [], 'dangling_link': [], 'staff_without_account': 0})
        acct_staff_ids = set(); acct_emails = set()
        fixed = []
        for a in accounts:
            if a.get('role') == 'super': continue
            store = a.get('store_id') or ''
            b = bucket(store); b['accounts'] += 1
            email = str(a.get('email') or '').strip().lower()
            sid = str(a.get('staff_id') or '')
            if sid: acct_staff_ids.add((store, sid))
            if email: acct_emails.add((store, email))
            linked = bool(sid) and (store, sid) in staff_ids
            by_email = bool(email) and (store, email) in staff_emails
            if sid and not linked:
                b['dangling_link'].append({'id': a['id'], 'name': a.get('name'), 'staff_id': sid})
            if not linked and not by_email:
                b['missing_staff'].append({'id': a['id'], 'name': a.get('name'), 'email': a.get('email'), 'role': a.get('role')})
            elif linked:
                sn = staff_names.get((store, sid), ''); an = str(a.get('name') or '').strip()
                if an and sn and an.lower() != sn.lower():
                    b['name_mismatch'].append({'id': a['id'], 'account_name': an, 'staff_name': sn})
            if fix and store in STORES and (only is None or str(a['id']) in only):
                nid = _ensure_staff_for_account(conn, a)
                if nid: fixed.append({'account': a['id'], 'staff_id': nid, 'store': store})
        for (store, sid) in staff_ids:
            if (store, sid) not in acct_staff_ids:
                # profile with no linked account (fine — not everyone has a login); email-matched
                # accounts were already linked above, so this is a pure headcount signal
                if store in stores or True:
                    b = bucket(store); b['staff_without_account'] += 1
        if fix: conn.commit()
        out = {'stores': stores, 'total_accounts': sum(1 for a in accounts if a.get('role') != 'super')}
        if fix: out['fixed'] = fixed
        return out
    finally:
        conn.close()

## ---------- proactive overdue-checklist alerts ----------
import datetime as _dt

def _perth_now():
    return _dt.datetime.utcnow() + _dt.timedelta(hours=8)   # Australia/Perth = UTC+8, no DST

def _deadline_minutes(txt):
    m = _re.search(r'(\d{1,2}):(\d{2})\s*(AM|PM)?', str(txt or ''), _re.I)
    if not m: return None
    h = int(m.group(1)); mi = int(m.group(2)); ap = (m.group(3) or '').upper()
    if ap == 'PM' and h < 12: h += 12
    if ap == 'AM' and h == 12: h = 0
    return h * 60 + mi

CK_SESSIONS = ['Opening', 'Mid-afternoon', 'Closing']

def check_overdue_and_alert():
    """For every store: if a session's deadline has passed (Perth time) and some expected
    departments still haven't submitted today's checklist, send ONE inbox alert to the store
    managers + each missing department's lead. Deduped per (store, session, date) so it fires
    once. Returns a summary. Meant to be hit periodically by the external cron."""
    now_p = _perth_now(); today = now_p.strftime('%Y-%m-%d'); now_min = now_p.hour * 60 + now_p.minute
    fired = []
    conn = connect()
    try:
        for store in STORES:
            row = conn.execute('SELECT state_json FROM store_state WHERE store_id=?', (store,)).fetchone()
            if not row or not row['state_json']:
                continue
            try: st = json.loads(row['state_json'])
            except Exception: continue
            deadlines = st.get('checklistDeadlines') or {}
            if now_p.weekday() == 6:   # Sunday runs a later schedule at every store
                deadlines = {'Opening': '12:30 PM', 'Mid-afternoon': '3:30 PM', 'Closing': '6:30 PM'}
            items = st.get('checklistItems')
            if isinstance(items, str):
                try: items = json.loads(items)
                except Exception: items = []
            if not isinstance(items, list): items = []
            # expected departments per session, from the template
            expected = {s: set() for s in CK_SESSIONS}
            for it in items:
                if isinstance(it, list) and len(it) >= 2 and it[1] in expected and it[0]:
                    expected[it[1]].add(it[0])
            # today's submitted (dept,session) for this store
            submitted = {s: set() for s in CK_SESSIONS}
            for r in conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=?', (store,)).fetchall():
                try: sub = json.loads(r['data_json'])
                except Exception: continue
                if sub.get('date') == today and sub.get('session') in submitted:
                    submitted[sub['session']].add(sub.get('department') or sub.get('dept') or '')
            for sess in CK_SESSIONS:
                exp = expected.get(sess) or set()
                if not exp: continue
                dl = _deadline_minutes(deadlines.get(sess))
                if dl is None or now_min <= dl: continue      # deadline not passed yet
                missing = sorted(d for d in exp if d not in submitted.get(sess, set()))
                if not missing: continue
                marker = 'overdue_sent:%s:%s:%s' % (store, today, sess)
                if get_setting(marker): continue               # already alerted for this session today
                _send_overdue_alert(conn, store, sess, deadlines.get(sess), missing)
                set_setting(marker, 1)
                fired.append({'store': store, 'session': sess, 'missing': missing})
            # ---- BIN day enforcement: on active bin days the record is MANDATORY ----
            try:
                ba = st.get('binAdmin'); ba = json.loads(ba) if isinstance(ba, str) else (ba or {})
                wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][now_p.weekday()]
                if wd in (ba.get('activeDays') or []):
                    dlc = _deadline_minutes((deadlines or {}).get('Closing') or '9:30 PM')
                    if dlc is not None and now_min > dlc:
                        bmarker = 'binoverdue_sent:%s:%s' % (store, today)
                        if not get_setting(bmarker):
                            has_bin = False
                            for br in conn.execute('SELECT data_json FROM bin_records WHERE store_id=?', (store,)).fetchall():
                                try: bd = json.loads(br['data_json'])
                                except Exception: bd = {}
                                if str(bd.get('date') or '')[:10] == today: has_bin = True; break
                            if not has_bin:
                                subject = 'MANDATORY: bin checklist not submitted today'
                                body = ('<p><b>Today (%s) is a scheduled bin day at MCQ %s and the bin checklist has NOT been submitted.</b></p>'
                                        '<p>The bin record (staff name, quantity, photo evidence) is mandatory on %s. Please complete it in Bin Admin now.</p>'
                                        % (wd, store, ', '.join(ba.get('activeDays') or [])))
                                now_t = now()
                                mid = conn.execute('INSERT INTO messages(store_id,from_role,from_name,from_staff_id,to_staff_id,to_super,to_managers,to_store_all,kind,subject,body_html,thread_id,read_by_json,attachments_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id',
                                    (store, 'super', 'MCQ System', None, None, 1, 1, 0, 'message', subject, body, None, '[]', '[]', now_t)).fetchone()['id']
                                conn.execute('UPDATE messages SET thread_id=? WHERE id=?', ('T' + str(mid), mid))
                                conn.commit()
                                set_setting(bmarker, 1)
                                fired.append({'store': store, 'bin': 'missing'})
            except Exception:
                pass
        if fired:
            try: emit_event('inbox')
            except Exception: pass
        return {'ok': True, 'alerts': fired, 'checked_at': now_p.strftime('%Y-%m-%d %H:%M') + ' Perth'}
    finally:
        conn.close()

def _send_overdue_alert(conn, store, session, deadline_txt, missing):
    """Insert one inbox alert to the store's managers, and one to each missing dept's lead."""
    subject = 'Overdue: %s checklist not submitted' % session
    body = ('<p><b>%s checklist is overdue at MCQ %s.</b></p>'
            '<p>Deadline <b>%s</b> has passed and these departments have not submitted today:</p>'
            '<ul>%s</ul><p>Please follow up.</p>'
            % (session, store, deadline_txt or '', ''.join('<li>%s</li>' % d for d in missing)))
    now_t = now()
    def _insert(to_staff_id, to_managers):
        mid = conn.execute('''INSERT INTO messages(store_id,from_role,from_name,from_staff_id,to_staff_id,
            to_super,to_managers,to_store_all,kind,subject,body_html,thread_id,read_by_json,attachments_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (store, 'super', 'MCQ System', None, (str(to_staff_id) if to_staff_id else None),
             0, 1 if to_managers else 0, 0, 'message', subject, body, None, '[]', '[]', now_t)).fetchone()['id']
        conn.execute('UPDATE messages SET thread_id=? WHERE id=?', ('T' + str(mid), mid))
    _insert(None, True)                                        # → store managers' mailbox
    seen = set()
    for dept in missing:                                       # → each missing department's lead
        lead = conn.execute("""SELECT staff_id,id FROM accounts WHERE role='staff' AND store_id=?
                               AND lower(COALESCE(department,''))=lower(?) AND activated=1""",
                            (store, dept)).fetchone()
        sid = (lead['staff_id'] or lead['id']) if lead else None
        if sid and sid not in seen:
            seen.add(sid); _insert(sid, False)
    conn.commit()

def get_dept_leads(store):
    """Department leads by ACCESS: accounts with role='staff' (Dept Lead) assigned to this
    store, with their department + email — the single source of truth for lead routing."""
    conn = connect()
    try:
        out = []
        for r in conn.execute("""SELECT name,email,department FROM accounts
                                 WHERE role='staff' AND store_id=?""", (store,)).fetchall():
            if (r['email'] or '').strip():
                out.append({'name': r['name'] or '', 'email': r['email'].strip(),
                            'department': (r['department'] or '').strip()})
        return out
    finally:
        conn.close()

def _checklist_verified(sub):
    if not isinstance(sub, dict): return False
    return (str(sub.get('status') or '').strip().lower() == 'verified'
            or bool(sub.get('verifiedAt')) or bool(sub.get('verifiedBy')))

def _checklist_stamp(sub):
    if not isinstance(sub, dict): return ''
    return str(sub.get('verifiedAt') or sub.get('created') or sub.get('date') or '')

def _normalize_checklist_submission(sub):
    out = dict(sub or {})
    if not out.get('dept') and out.get('department'):
        out['dept'] = out.get('department')
    if _checklist_verified(out):
        out['status'] = 'Verified'
    elif not str(out.get('status') or '').strip():
        out['status'] = 'Submitted'
    return out

def _merge_checklist_submission(existing_json, incoming):
    """Never let an older/stale Submitted save downgrade a verified checklist."""
    incoming = _normalize_checklist_submission(incoming)
    try: existing = _normalize_checklist_submission(json.loads(existing_json or '{}'))
    except Exception: existing = {}
    if _checklist_verified(existing) and not _checklist_verified(incoming):
        return existing
    if _checklist_verified(existing) and _checklist_verified(incoming):
        if _checklist_stamp(existing) > _checklist_stamp(incoming):
            return existing
    return incoming

def save_checklist_submission(store, sub):
    """Append/replace ONE checklist submission immediately (upsert by id), independent of the
    big store blob — so a submission can never be lost to a concurrent whole-store save."""
    sid = str((sub or {}).get('id') or '')
    if not sid or store not in STORES: return None
    conn = connect()
    try:
        row = conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=? AND id=?',
                           (store, sid)).fetchone()
        payload = _merge_checklist_submission(row['data_json'] if row else None, sub)
        conn.execute('''INSERT INTO checklist_submissions(id,store_id,data_json,created_at)
                        VALUES(?,?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json, created_at=excluded.created_at''',
                     (sid, store, json.dumps(payload), now()))
        conn.commit()
        try: emit_event('state', store)
        except Exception: pass
        return sid
    finally:
        conn.close()

def bulk_import_staff(rows, allowed_stores=None):
    """Import staff from a parsed CSV. rows = [{name,store,email,role,dept,dob}].
    Dedupe by email (existing DB + within the batch); skip rows for stores not allowed.
    Returns {added:[...], skipped:[...], errors:[...]} — the server is the source of truth."""
    conn = connect()
    try:
        # existing emails + the current max E#### id (staff ids continue that series)
        have = set(); maxE = 0
        for r in conn.execute('SELECT id,data_json FROM staff').fetchall():
            try: d = json.loads(r['data_json'] or '{}')
            except Exception: d = {}
            e = str(d.get('email') or '').strip().lower()
            if e: have.add(e)
            rid = str(r['id'] or '')
            if rid.startswith('E') and rid[1:].isdigit(): maxE = max(maxE, int(rid[1:]))
        added, skipped, errors = [], [], []
        seen_batch = set()
        for raw in (rows or []):
            name = str(raw.get('name') or '').strip()
            store = str(raw.get('store') or '').strip()
            email = str(raw.get('email') or '').strip()
            el = email.lower()
            if not name or not email or '@' not in email:
                errors.append({'name': name, 'email': email, 'reason': 'missing name or valid email'}); continue
            if store not in STORES:
                errors.append({'name': name, 'email': email, 'reason': 'unknown store "%s"' % store}); continue
            if allowed_stores is not None and store not in allowed_stores:
                errors.append({'name': name, 'email': email, 'reason': 'not allowed to import into %s' % store}); continue
            if el in have or el in seen_batch:
                skipped.append({'name': name, 'email': email, 'store': store, 'reason': 'email already exists'}); continue
            maxE += 1; sid = 'E%04d' % maxE
            rec = {'id': sid, 'name': name, 'email': email, 'store': store, 'active': 1,
                   'role': str(raw.get('role') or '').strip(), 'classification': str(raw.get('role') or '').strip(),
                   'dept': str(raw.get('dept') or '').strip(), 'dob': str(raw.get('dob') or '').strip(),
                   'start': now()[:10], 'basis': 'Individual', 'category': '', 'estatus': ''}
            conn.execute('INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json',
                         (sid, store, json.dumps(rec)))
            have.add(el); seen_batch.add(el)
            added.append({'id': sid, 'name': name, 'email': email, 'store': store})
        conn.commit()
        return {'added': added, 'skipped': skipped, 'errors': errors}
    finally:
        conn.close()

def _staff_by_email_any(conn, email):
    """Find a staff member by email across ALL stores (store is no longer picked at activation).
    Real stores win over 'Demo' (Demo mirrors real staff as sample data)."""
    e = str(email or '').strip().lower()
    if not e: return None
    demo_hit = None
    for r in conn.execute('SELECT id,store_id,data_json FROM staff').fetchall():
        try: d = json.loads(r['data_json'] or '{}')
        except Exception: d = {}
        if str(d.get('email') or '').strip().lower() == e:
            if d.get('archived'): continue   # archived staff must be restored before activating
            hit = {'staff_id': r['id'], 'name': d.get('name') or '', 'store': r['store_id'], 'data': d}
            if r['store_id'] == 'Demo': demo_hit = hit
            else: return hit
    return demo_hit

def activate_lookup(email, store=None):
    """Step 1 of activation: is this Gmail known? (store is derived from the match, not picked).
    A staff-directory match RESERVES the account right away (activated=0, no password) so the
    person sees their permanent ID on the create-password screen. Idempotent — the same email
    always comes back to the same reserved ID."""
    conn = connect()
    try:
        acc = conn.execute('SELECT id,role,store_id,activated,name,department FROM accounts WHERE lower(email)=lower(?)',
                           (str(email or '').strip(),)).fetchone()
        if acc and acc['activated']:
            return {'already': True, 'id': acc['id'], 'role': acc['role'], 'tab': ACCT_TABS.get(acc['role'], 'Staff')}
        if acc:   # pre-assigned by the account admin (or reserved by an earlier lookup)
            return {'already': False, 'match': True, 'found': True, 'id': acc['id'],
                    'role': acc['role'], 'tab': ACCT_TABS.get(acc['role'], 'Staff'),
                    'name': acc['name'] or '', 'store': acc['store_id'] or '',
                    'department': acc['department'] or ''}
        hit = _staff_by_email_any(conn, email)
        if hit:   # reserve the account NOW so the ID can be shown before the password is set
            aid = _gen_account_id(conn, hit['store'])
            conn.execute('''INSERT INTO accounts(id,password,role,store_id,staff_id,name,email,activated,needs_profile,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,0,0,?,?)''',
                         (aid, '', 'employee', hit['store'], hit['staff_id'], hit['name'],
                          str(email or '').strip(), now(), now()))
            conn.commit()
            return {'already': False, 'match': True, 'found': True, 'id': aid,
                    'role': 'employee', 'tab': 'Staff', 'name': hit['name'], 'store': hit['store'],
                    'department': ''}
        return {'already': False, 'match': False, 'found': False, 'name': '', 'store': ''}
    finally:
        conn.close()

def activate_account(email, store=None, password=None, name=None):
    """Step 2: create (or claim) the account. Store is derived from the pre-assigned account
    or the staff-directory match — activation no longer asks the person to pick a store."""
    email = str(email or '').strip()
    if not email or '@' not in email: return {'error': 'Enter a valid email address'}
    if len(str(password or '')) < 6: return {'error': 'Password must be at least 6 characters'}
    conn = connect()
    try:
        acc = conn.execute('SELECT * FROM accounts WHERE lower(email)=lower(?)', (email,)).fetchone()
        if acc and acc['activated']:
            return {'error': 'This email is already activated — your ID is ' + acc['id']}
        if acc:   # pre-assigned by the account admin -> claim it (keep assigned role/store)
            conn.execute('UPDATE accounts SET password=?, activated=1, updated_at=? WHERE id=?',
                         (str(password), now(), acc['id']))
            a = conn.execute('SELECT * FROM accounts WHERE id=?', (acc['id'],)).fetchone()
            _ensure_staff_for_account(conn, dict(a))   # profile guaranteed once they activate
            conn.commit()
            return {'id': a['id'], 'role': a['role'], 'store': a['store_id'], 'name': a['name'],
                    'tab': ACCT_TABS.get(a['role'], 'Staff'), 'matched': True}
        hit = _staff_by_email_any(conn, email)
        if hit:   # email matches a staff record -> create their Staff account in that person's store
            store = hit['store']
            aid = _gen_account_id(conn, store)
            conn.execute('''INSERT INTO accounts(id,password,role,store_id,staff_id,name,email,activated,needs_profile,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,1,0,?,?)''',
                         (aid, str(password), 'employee', store, hit['staff_id'], hit['name'], email, now(), now()))
            conn.commit()
            return {'id': aid, 'role': 'employee', 'store': store, 'name': hit['name'],
                    'tab': 'Staff', 'matched': True}
        # not in the system at all: activation is only for people Head Office has added
        return {'error': "This email isn't registered yet. Please ask Head Office to add you first."}
    finally:
        conn.close()

# ---------- forgot password: emailed one-time code ----------
def create_reset_code(email):
    """Generate a 6-digit reset code for the account with this email; store it hashed with a
    15-minute expiry. Returns {email,name,code} for the caller to email, or None if no account."""
    import random
    email = str(email or '').strip()
    if not email or '@' not in email: return None
    conn = connect()
    try:
        a = conn.execute('SELECT id,name,email FROM accounts WHERE lower(email)=lower(?)', (email,)).fetchone()
        if not a: return None
        code = '%06d' % random.randint(0, 999999)
        conn.execute('UPDATE accounts SET reset_code=?, reset_expires=? WHERE id=?',
                     (hash_pw(code), time.time() + 900, a['id']))
        conn.commit()
        return {'email': a['email'], 'name': a['name'], 'code': code}
    finally:
        conn.close()

def reset_password(email, code, new_password):
    """Verify the emailed code and set a new password (also activates the account)."""
    email = str(email or '').strip()
    code = str(code or '').strip()
    if len(str(new_password or '')) < 6: return {'error': 'Password must be at least 6 characters'}
    conn = connect()
    try:
        a = conn.execute('SELECT * FROM accounts WHERE lower(email)=lower(?)', (email,)).fetchone()
        if not a or not a['reset_code']: return {'error': 'Please request a new code.'}
        if not a['reset_expires'] or time.time() > a['reset_expires']:
            return {'error': 'This code has expired — please request a new one.'}
        if a['reset_code'] != hash_pw(code):
            return {'error': 'Incorrect code. Please check the email and try again.'}
        conn.execute('UPDATE accounts SET password=?, activated=1, reset_code=NULL, reset_expires=NULL, updated_at=? WHERE id=?',
                     (str(new_password), now(), a['id']))
        conn.commit()
        return {'id': a['id'], 'role': a['role'], 'tab': ACCT_TABS.get(a['role'], 'Staff'), 'name': a['name']}
    finally:
        conn.close()

def account_login(login_id, pw, mode=None):
    """ID + password login. The account's ASSIGNED access decides the role — no tab needed.
    (A legacy `mode` from an old cached client is still validated against the assigned role.)"""
    conn = connect()
    try:
        a = conn.execute('SELECT * FROM accounts WHERE id=? AND activated=1', (str(login_id or '').strip(),)).fetchone()
        if not a or a['password'] != str(pw or ''): return None
        if mode and a['role'] != mode:
            return {'wrong_tab': ACCT_TABS.get(a['role'], 'Staff')}
        meta = {'staff_id': a['staff_id'] or a['id'], 'staff_name': a['name'], 'account_id': a['id'],
                'needs_profile': bool(a['needs_profile'])}
        if a['role'] == 'super':
            # a Super may be given a HOME STORE in Account Management: they keep full
            # cross-store powers, but the Checklist works as THAT store's checklist
            meta['home_store'] = a['store_id'] if (a['store_id'] or '') in STORES else None
            return ('super', 'ALL', meta)
        store = a['store_id']
        if not store or store not in STORES: return None
        return (a['role'], store, meta)
    finally:
        conn.close()

def account_of(au):
    if not au or not au.get('account_id'): return None
    conn = connect()
    try:
        return conn.execute('SELECT * FROM accounts WHERE id=?', (au['account_id'],)).fetchone()
    finally:
        conn.close()

def is_account_admin(au):
    a = account_of(au)
    return bool(a and a['acct_admin'])

def list_accounts(q=''):
    """EVERY person: existing accounts PLUS every staff member (all stores) who has no
    account yet — so the account admin can assign permissions to the whole company."""
    conn = connect()
    try:
        # staff index — lets each account row say whether its staff profile actually exists
        sidx_ids, sidx_emails = set(), set()
        for r in conn.execute('SELECT id,store_id,data_json FROM staff').fetchall():
            sidx_ids.add((r['store_id'], str(r['id'])))
            try: d = json.loads(r['data_json'] or '{}')
            except Exception: d = {}
            e = str(d.get('email') or '').strip().lower()
            if e: sidx_emails.add((r['store_id'], e))
        rows = conn.execute('SELECT * FROM accounts ORDER BY store_id, name').fetchall()
        out, have_staff, have_email = [], set(), set()
        for r in rows:
            d = {k: r[k] for k in r.keys()}
            if d.get('staff_id'): have_staff.add(str(d['staff_id']))
            if d.get('email'): have_email.add(str(d['email']).strip().lower())
            d['has_staff'] = d.get('role') == 'super' or bool(
                (d.get('staff_id') and (d.get('store_id'), str(d['staff_id'])) in sidx_ids)
                or (d.get('email') and (d.get('store_id'), str(d['email']).strip().lower()) in sidx_emails))
            out.append(d)
        for r in conn.execute('SELECT id,store_id,data_json FROM staff ORDER BY store_id').fetchall():
            if str(r['id']) in have_staff: continue
            if r['store_id'] == 'Demo': continue           # Demo mirrors real staff (sample data) → would double people
            try: d = json.loads(r['data_json'] or '{}')
            except Exception: d = {}
            if d.get('active') == 0: continue
            if d.get('archived'): continue                  # archived staff are hidden until restored
            email = str(d.get('email') or '').strip()
            if email and email.lower() in have_email: continue
            if email: have_email.add(email.lower())         # dedupe: one row per unique gmail
            out.append({'id': '', 'password': '', 'role': 'employee', 'store_id': r['store_id'],
                        'staff_id': r['id'], 'name': d.get('name') or r['id'], 'email': email,
                        'department': d.get('dept') or '', 'activated': 0, 'acct_admin': 0,
                        'no_account': True})
        ql = str(q or '').strip().lower()
        if ql:
            out = [d for d in out if ql in ' '.join(str(d.get(k) or '').lower()
                   for k in ('id', 'name', 'email', 'store_id', 'role', 'department'))]
        return out
    finally:
        conn.close()

def add_account(email, name, role, store, department=''):
    """Account admin pre-creates an account by EMAIL + assigned permission. The person then
    activates with that email: they claim this account (role/store kept) and set their password."""
    email = str(email or '').strip()
    if not email or '@' not in email: return {'error': 'Enter a valid email address'}
    if role not in ('employee', 'staff', 'admin', 'super'): role = 'employee'
    conn = connect()
    try:
        if conn.execute('SELECT 1 FROM accounts WHERE lower(email)=lower(?)', (email,)).fetchone():
            return {'error': 'An account with this email already exists'}
        hit = _store_staff_by_email(conn, store, email) if (store and store in STORES) else None
        aid = _gen_account_id(conn, store if role != 'super' else '')
        conn.execute('''INSERT INTO accounts(id,password,role,store_id,staff_id,name,email,department,activated,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,0,?,?)''',
                     (aid, '', role, store or '', (hit or {}).get('staff_id'),
                      (name or (hit or {}).get('name') or email.split('@')[0].replace('.', ' ').title()),
                      email, department or '', now(), now()))
        # keep Staff Management in step: the person must exist as a staff profile in this
        # store too (created here when new; refreshed/un-archived when they already exist)
        srow = conn.execute('SELECT * FROM accounts WHERE id=?', (aid,)).fetchone()
        staff_id = _ensure_staff_for_account(conn, dict(srow)) if srow else None
        conn.commit()
        return {'id': aid, 'matched': bool(hit), 'staff_id': staff_id, 'staff_created': bool(staff_id and not hit)}
    finally:
        conn.close()

def remove_dept_lead(store, department, email):
    """Remove a Dept Lead assignment from Email Notifications.

    Deleting a synced lead means the Account Management source row is no longer a Dept Lead.
    The account remains; it is downgraded to a normal staff member for the same store.
    """
    store = str(store or '').strip()
    department = str(department or '').strip()
    email = str(email or '').strip()
    if store not in STORES: return {'error': 'Unknown store'}
    if not department: return {'error': 'Choose a department'}
    if not email or '@' not in email: return {'error': 'Enter a valid email address'}
    conn = connect()
    try:
        acc = conn.execute("""SELECT * FROM accounts
                              WHERE lower(email)=lower(?) AND store_id=? AND role='staff'
                              AND lower(COALESCE(department,''))=lower(?)""",
                           (email, store, department)).fetchone()
        if not acc:
            return {'error': 'This person is not assigned as this department lead'}
        conn.execute("""UPDATE accounts SET role='employee', department='', updated_at=? WHERE id=?""",
                     (now(), acc['id']))
        conn.execute("""UPDATE tokens SET role='employee' WHERE account_id=?""", (acc['id'],))
        conn.execute("""UPDATE device_creds SET role='employee' WHERE account_id=?""", (acc['id'],))
        conn.commit()
        return {'id': acc['id'], 'email': acc['email'], 'name': acc['name'], 'store': store,
                'department': department, 'role': 'employee'}
    finally:
        conn.close()

def update_account(aid, patch):
    """Account admin edits: role / store / department / password / name.
    The linked staff profile follows: name/department/title refresh; moving the account to
    another store archives the old store's profile and creates/relinks one in the new store."""
    allowed = {'role', 'store_id', 'department', 'password', 'name', 'email'}
    if 'email' in (patch or {}):
        em = str(patch.get('email') or '').strip()
        if not em or '@' not in em: return {'error': 'Enter a valid email address'}
        conn0 = connect()
        try:
            dup = conn0.execute('SELECT id FROM accounts WHERE lower(email)=lower(?) AND id!=?', (em, str(aid))).fetchone()
        finally:
            conn0.close()
        if dup: return {'error': 'Another account already uses this email'}
        patch['email'] = em
    sets, vals = [], []
    for k, v in (patch or {}).items():
        if k in allowed:
            sets.append(k + '=?'); vals.append(str(v) if v is not None else None)
    if not sets: return False
    sets.append('updated_at=?'); vals.append(now()); vals.append(str(aid))
    conn = connect()
    try:
        old = conn.execute('SELECT * FROM accounts WHERE id=?', (str(aid),)).fetchone()
        conn.execute('UPDATE accounts SET ' + ','.join(sets) + ' WHERE id=?', vals)
        new = conn.execute('SELECT * FROM accounts WHERE id=?', (str(aid),)).fetchone()
        if new:
            nd = dict(new)
            if old and (old['store_id'] or '') != (nd.get('store_id') or '') and old['store_id'] and old['staff_id']:
                _archive_staff(conn, old['store_id'], old['staff_id'])
                conn.execute('UPDATE accounts SET staff_id=NULL WHERE id=?', (nd['id'],))
                nd['staff_id'] = None
            _ensure_staff_for_account(conn, nd)
        conn.commit()
        return True
    finally:
        conn.close()

def delete_account(aid):
    """Delete a login. The person's staff profile is ARCHIVED at the same time (they vanish
    from Staff Members and pickers, restorable via Staff Members -> Archived), and any live
    sessions / Face-ID creds for the account die immediately."""
    conn = connect()
    try:
        row = conn.execute('SELECT * FROM accounts WHERE id=? AND acct_admin=0', (str(aid),)).fetchone()
        if not row: return False
        store = row['store_id']
        if store:
            sid = row['staff_id']
            if not sid and row['email']:
                hit = _store_staff_by_email(conn, store, row['email'])
                sid = hit and hit['staff_id']
            if sid: _archive_staff(conn, store, sid)
        conn.execute('DELETE FROM accounts WHERE id=?', (row['id'],))
        try:
            conn.execute('DELETE FROM tokens WHERE account_id=?', (row['id'],))
            conn.execute('DELETE FROM device_creds WHERE account_id=?', (row['id'],))
        except Exception: pass
        conn.commit()
        return True
    finally:
        conn.close()

def set_own_password(au, new_pw):
    if len(str(new_pw or '')) < 6: return False
    conn = connect()
    try:
        if au.get('account_id'):
            conn.execute('UPDATE accounts SET password=?, updated_at=? WHERE id=?',
                         (str(new_pw), now(), au['account_id']))
        elif au.get('role') == 'employee':   # legacy numeric login
            conn.execute('UPDATE staff_accounts SET password=?, updated_at=? WHERE store_id=? AND staff_id=?',
                         (str(new_pw), now(), au.get('store_id'), str(au.get('staff_id'))))
        else:
            return False
        conn.commit()
        return True
    finally:
        conn.close()

def activation_status(store):
    """staff_id -> {activated, account_id, role} for the Staff Members page."""
    conn = connect()
    try:
        out = {}
        for r in conn.execute('SELECT id,staff_id,activated,role FROM accounts WHERE store_id=?', (store,)).fetchall():
            if r['staff_id']: out[str(r['staff_id'])] = {'activated': bool(r['activated']), 'id': r['id'], 'role': r['role']}
        return out
    finally:
        conn.close()

NAMED_SUPERS = [   # ready-made Super Admin accounts (7xxx = head office)
    ('7001', 'Diana Lam', 0), ('7002', 'Cong', 0), ('7003', 'Le Tan Khoi Nguyen', 1),
    ('7004', 'Tony Lam', 0), ('7005', 'Nhi Le', 0), ('7006', 'Kelvin', 0),
    ('7007', 'Linh Office', 0),
]

def seed_named_supers():
    """6 named Super Admin accounts with generated passwords (created once, never regenerated).
    Khoi Nguyen (7003) is the account admin. His account links to his Mirrabooka staff row."""
    import random
    conn = connect()
    try:
        for aid, nm, adm in NAMED_SUPERS:
            if conn.execute('SELECT 1 FROM accounts WHERE id=?', (aid,)).fetchone(): continue
            pw = str(random.randint(100000, 999999))
            email = 'letankhoinguyen@gmail.com' if aid == '7003' else ''
            staff_id = 'E0074' if aid == '7003' else None
            conn.execute('''INSERT INTO accounts(id,password,role,store_id,staff_id,name,email,activated,acct_admin,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,1,?,?,?)''',
                         (aid, pw, 'super', '', staff_id, nm, email, adm, now(), now()))
        conn.commit()
    finally:
        conn.close()

# ---- inbox / messaging ----
def _role_display(au, store=None):
    return au.get('staff_name') or {'super': 'Head Office', 'ba': 'Chú Ba',
        'admin': (store or au.get('store_id') or '') + ' Manager',
        'staff': (store or au.get('store_id') or '') + ' Dept Lead'}.get(au.get('role'), au.get('role') or 'User')

def _reader_key(au):
    r = au.get('role')
    if r in ('super', 'ba'): return 'super'
    if r in ('admin', 'staff'): return 'mgr:' + str(au.get('store_id'))
    if r == 'employee': return 'emp:' + str(au.get('staff_id'))
    return str(r)

def _route_for(kind):
    """Default inbox routing per message kind → (to_super, to_managers, to_store_all)."""
    k = kind or 'document'
    if k == 'feedback':  return (1, 0, 0)   # confidential to the owner/super only
    if k == 'issue':     return (1, 1, 0)   # super + this store's Manager/Dept-Lead
    if k == 'violation': return (1, 0, 0)   # super sees every violation; employee gets it via to_staff_id
    if k == 'reply':     return (1, 1, 0)   # fallback only — send_message re-routes replies to the THREAD's own audience
    if k == 'message':   return (1, 1, 0)   # staff → their store's Manager/Dept-Lead + Super
    return (0, 0, 0)                        # document/other → explicit targeting only

def get_my_password(au):
    """A user can view their own login credentials (unified account, or legacy numeric login)."""
    a = account_of(au)
    if a:
        return {'id': a['id'], 'password': a['password'], 'role': a['role'],
                'store': a['store_id'], 'department': a['department'], 'name': a['name']}
    if au.get('role') != 'employee': return None
    conn = connect()
    try:
        row = conn.execute('SELECT password FROM staff_accounts WHERE store_id=? AND staff_id=?',
                           (au.get('store_id'), str(au.get('staff_id')))).fetchone()
        return {'password': row['password']} if row else None
    finally:
        conn.close()

def file_meta(file_id):
    conn = connect()
    try:
        return conn.execute('SELECT * FROM files WHERE id=?', (str(file_id),)).fetchone()
    finally:
        conn.close()

def can_download_file(au, file_id):
    """Gmail-style ACL: you may download a file if you can SEE a message carrying it."""
    conn = connect()
    try:
        rows = conn.execute('SELECT * FROM messages WHERE attachments_json LIKE ? ORDER BY id DESC LIMIT 20',
                            ('%"' + str(file_id) + '"%',)).fetchall()
        r = au.get('role'); sid = str(au.get('staff_id')); store = au.get('store_id')
        for row in rows:
            if r in ('super', 'ba'):
                if row['to_super'] == 1 or row['from_role'] in ('super', 'ba'): return True
            elif r in ('admin', 'staff'):
                if row['store_id'] == store and (row['to_managers'] == 1 or row['from_role'] in ('admin', 'staff')): return True
            elif r == 'employee':
                if row['to_staff_id'] == sid or row['from_staff_id'] == sid or (row['store_id'] == store and row['to_store_all'] == 1): return True
        # attached to an announcement? readable by that announcement's audience
        for row in conn.execute('SELECT store_id FROM announcements WHERE attachments_json LIKE ? LIMIT 5',
                                ('%"' + str(file_id) + '"%',)).fetchall():
            if row['store_id'] == 'ALL' or can_access(au, row['store_id']): return True
        # not attached to any message yet → only the uploader's store (compose-time preview)
        f = conn.execute('SELECT store_id FROM files WHERE id=?', (str(file_id),)).fetchone()
        return bool(f and can_access(au, f['store_id']))
    finally:
        conn.close()

def cleanup_old(store, before, kinds):
    """Delete NON-critical data older than `before` (YYYY-MM-DD): photos (incl. files on disk),
    checklist submissions, cleaning/maintenance history, bin records. Important data
    (records, staff, audit logs, messages) is never touched."""
    counts = {}
    conn = connect()
    try:
        cut = str(before) + ' 00:00:00'
        if 'photos' in kinds:
            rows = conn.execute('SELECT * FROM photos WHERE store_id=? AND created_at<?', (store, cut)).fetchall()
            for r in rows:
                try:
                    cloud = r['cloud'] if 'cloud' in r.keys() else None
                    if cloud:
                        import cloudstore
                        if cloudstore.ENABLED: cloudstore.delete_photo(cloud)
                except Exception: pass
                try: os.remove(os.path.join(UPLOADS, ''.join(c if c.isalnum() else '-' for c in r['store_id'].lower()), r['filename']))
                except Exception: pass
            conn.execute('DELETE FROM photos WHERE store_id=? AND created_at<?', (store, cut))
            counts['photos'] = len(rows)
        if 'checklistSubs' in kinds:
            n = conn.execute('SELECT COUNT(*) c FROM checklist_submissions WHERE store_id=? AND created_at<?', (store, cut)).fetchone()['c']
            conn.execute('DELETE FROM checklist_submissions WHERE store_id=? AND created_at<?', (store, cut))
            counts['checklistSubs'] = n
        if 'scheduleHistory' in kinds:
            n = conn.execute('SELECT COUNT(*) c FROM schedule_history WHERE store_id=? AND created_at<?', (store, cut)).fetchone()['c']
            conn.execute('DELETE FROM schedule_history WHERE store_id=? AND created_at<?', (store, cut))
            counts['scheduleHistory'] = n
        if 'binRecords' in kinds:
            n = conn.execute('SELECT COUNT(*) c FROM bin_records WHERE store_id=? AND created_at<?', (store, cut)).fetchone()['c']
            conn.execute('DELETE FROM bin_records WHERE store_id=? AND created_at<?', (store, cut))
            counts['binRecords'] = n
        conn.commit()
        return counts
    finally:
        conn.close()

def delete_message(au, msg_id):
    """Super may delete any message; Manager/Dept Lead only within their own store."""
    conn = connect()
    try:
        row = conn.execute('SELECT store_id FROM messages WHERE id=?', (msg_id,)).fetchone()
        if not row: return False
        r = au.get('role')
        if not (r == 'super' or (r in ('admin', 'staff') and row['store_id'] == au.get('store_id'))):
            return False
        conn.execute('DELETE FROM messages WHERE id=?', (msg_id,))
        conn.commit()
        return True
    finally:
        conn.close()

def enroll_device(au, cred_id, label):
    """Bind a Face-ID/passkey device credential to the CURRENT authenticated identity."""
    did = 'd_' + secrets.token_hex(8)
    secret = secrets.token_hex(24)
    conn = connect()
    try:
        conn.execute("""INSERT INTO device_creds(id,secret_hash,cred_id,role,store_id,staff_id,staff_name,account_id,label,created_at,last_used)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                     (did, hash_pw(secret), str(cred_id)[:400], au.get('role'), au.get('store_id'),
                      au.get('staff_id'), au.get('staff_name'), au.get('account_id'),
                      str(label or '')[:80], now(), now()))
        conn.commit()
        return {'device_id': did, 'secret': secret}
    finally:
        conn.close()

def device_login(device_id, secret):
    """Exchange a device credential for a login identity (the biometric gated the secret).
    When the credential is bound to an ACCOUNT, the CURRENT account row decides the
    role/store/name — a store move or role change follows immediately, and a deleted or
    de-activated account kills the credential (same rules as password login)."""
    conn = connect()
    try:
        row = conn.execute('SELECT * FROM device_creds WHERE id=?', (str(device_id or ''),)).fetchone()
        if not row or row['secret_hash'] != hash_pw(str(secret or '')): return None
        conn.execute('UPDATE device_creds SET last_used=? WHERE id=?', (now(), row['id']))
        conn.commit()
        if row['account_id']:
            a = conn.execute('SELECT * FROM accounts WHERE id=? AND activated=1', (row['account_id'],)).fetchone()
            if not a: return None   # account deleted / deactivated → credential no longer valid
            meta = {'staff_id': a['staff_id'] or row['staff_id'], 'staff_name': a['name'] or row['staff_name'],
                    'account_id': a['id'], 'needs_profile': bool(a['needs_profile'])}
            role = a['role']
            if role == 'super':
                meta['home_store'] = a['store_id'] if (a['store_id'] or '') in STORES else None
            store = 'ALL' if role in ('super', 'ba') else a['store_id']
            if role not in ('super', 'ba') and store not in STORES: return None
            return (role, store, meta)
        # legacy credential without an account link — frozen identity from enrolment
        meta = {'staff_id': row['staff_id'], 'staff_name': row['staff_name'], 'account_id': None}
        role = row['role']
        store = 'ALL' if role in ('super', 'ba') else row['store_id']
        if role not in ('super', 'ba') and store not in STORES: return None
        return (role, store, meta)
    finally:
        conn.close()

def revoke_device(au, device_id):
    """Remove a device credential — the owner (same identity) or the account admin."""
    conn = connect()
    try:
        row = conn.execute('SELECT * FROM device_creds WHERE id=?', (str(device_id or ''),)).fetchone()
        if not row: return False
        own = ((row['account_id'] and row['account_id'] == au.get('account_id')) or
               (row['staff_id'] and str(row['staff_id']) == str(au.get('staff_id'))) or
               (row['role'] == au.get('role') and (row['store_id'] or '') == (au.get('store_id') or '')))
        if not (own or is_account_admin(au)): return False
        conn.execute('DELETE FROM device_creds WHERE id=?', (row['id'],))
        conn.commit()
        return True
    finally:
        conn.close()

# ============================================================ DEPUTY ATTENDANCE
LATE_GRACE_MIN = 10          # clock-in later than this many minutes past the rostered start = a lateness event
VERBAL_TO_WRITTEN = 3        # (legacy constant — the ladder below is what applies now)
LATE_WINDOW_DAYS = 183       # Khoi's escalation window: lateness count resets on a rolling 6 months

def late_ladder_step(conn, store, staff_id):
    """Lateness escalation ladder (per staff, rolling 6-month window, INCLUDING the event
    being recorded now): 1st-3rd → Verbal Discussion, 4th → Written Warning,
    5th → Final Warning, 6th+ → Termination Referral. Returns (occurrence_number, step)."""
    cutoff = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 8 * 3600 - LATE_WINDOW_DAYS * 86400))
    n = conn.execute("SELECT COUNT(*) c FROM attendance WHERE store_id=? AND staff_id=? AND event='clockin' AND late_min>? AND created_at>=?",
                     (store, str(staff_id), LATE_GRACE_MIN, cutoff)).fetchone()['c']
    nth = n + 1
    step = ('Verbal Discussion' if nth <= 3 else 'Written Warning' if nth == 4
            else 'Final Warning' if nth == 5 else 'Termination Referral')
    return nth, step

def attendance_seen(ts_id, event=None):
    """Has this Deputy timesheet (optionally: this specific clock-in/clock-out event)
    already been processed by the webhook or a previous poll?"""
    if not ts_id: return False
    conn = connect()
    try:
        if event:
            return bool(conn.execute('SELECT 1 FROM attendance WHERE ts_id=? AND event=? LIMIT 1', (str(ts_id), event)).fetchone())
        return bool(conn.execute('SELECT 1 FROM attendance WHERE ts_id=? LIMIT 1', (str(ts_id),)).fetchone())
    finally: conn.close()

def try_claim_poll_slot(key, min_interval_sec):
    """Atomic compare-and-swap on a settings row so exactly ONE gunicorn worker runs a
    self-scheduled job per interval (all workers race; the UPDATE … WHERE old-value
    guard lets a single winner through on both SQLite and Postgres)."""
    conn = connect()
    try:
        now_t = time.time()
        row = conn.execute('SELECT value_json FROM settings WHERE key=?', (key,)).fetchone()
        if row is None:
            try:
                conn.execute('INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?)',
                             (key, json.dumps(now_t), now()))
                conn.commit()
                return True
            except Exception:
                return False
        try: last = float(json.loads(row['value_json']))
        except Exception: last = 0
        if now_t - last < min_interval_sec:
            return False
        cur = conn.execute('UPDATE settings SET value_json=?, updated_at=? WHERE key=? AND value_json=?',
                           (json.dumps(now_t), now(), key, row['value_json']))
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()

def deputy_cfg():
    """Deputy install + permanent token. Env vars win; else the settings table (set once via
    the super-only /api/deputy/config — the token never lives in the repo)."""
    host = (os.environ.get('DEPUTY_HOST') or get_setting('deputy_host') or '').rstrip('/')
    token = os.environ.get('DEPUTY_TOKEN') or get_setting('deputy_token') or ''
    return host, token

def add_violation_record(store, rec):
    """Insert a violation into the records store (same shape the client's Violation module
    reads) — used by the automatic late-clock-in ladder."""
    conn = connect()
    try:
        conn.execute('INSERT INTO records(id,store_id,module,data_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT (store_id,module,id) DO UPDATE SET data_json=excluded.data_json',
                     (rec['id'], store, 'violation', json.dumps(rec), now()))
        conn.commit()
    finally:
        conn.close()

def _to_epoch(v):
    """Deputy sends unix seconds (int) or ISO strings — normalise to epoch seconds."""
    if v is None or v == '': return None
    try:
        if isinstance(v, (int, float)): return int(v)
        s = str(v).strip()
        if s.isdigit(): return int(s)
        import datetime
        s = s.replace('Z', '+00:00')
        return int(datetime.datetime.fromisoformat(s).timestamp())
    except Exception:
        return None

def _match_staff_for_deputy(email, name, deputy_id):
    """Find the MCQ staff row for a Deputy employee. Priority: stored deputyId → email → name."""
    conn = connect()
    try:
        rows = conn.execute('SELECT store_id, data_json FROM staff').fetchall()
        want_e = str(email or '').strip().lower()
        want_n = str(name or '').strip().lower()
        want_d = str(deputy_id or '').strip()
        by_email = by_name = None
        for r in rows:
            try: d = json.loads(r['data_json'] or '{}')
            except Exception: d = {}
            if want_d and str(d.get('deputyId') or '') == want_d:
                return {'store': r['store_id'], 'id': d.get('id'), 'name': d.get('name'), 'email': d.get('email') or ''}
            e = str(d.get('email') or '').strip().lower()
            if want_e and e == want_e and not by_email:
                by_email = {'store': r['store_id'], 'id': d.get('id'), 'name': d.get('name'), 'email': d.get('email') or ''}
            n = str(d.get('name') or '').strip().lower()
            if want_n and n == want_n and not by_name:
                by_name = {'store': r['store_id'], 'id': d.get('id'), 'name': d.get('name'), 'email': d.get('email') or ''}
        return by_email or by_name
    finally:
        conn.close()

def record_attendance(ev):
    """Persist one clock event and, for clock-ins, apply the lateness/warning ladder.
    `ev` is the normalised dict from the webhook. Returns a summary for the inbox note."""
    conn = connect()
    try:
        late = int(ev.get('late_min') or 0)
        over = int(ev.get('over_min') or 0)
        warning = ''
        nth = 0
        if ev.get('event') == 'clockin' and late > LATE_GRACE_MIN and ev.get('staff_id'):
            nth, warning = late_ladder_step(conn, ev.get('store_id'), ev.get('staff_id'))
        aid = 'att_' + secrets.token_hex(8)
        conn.execute('''INSERT INTO attendance(id,ts_id,event,store_id,staff_id,staff_name,deputy_employee,
            scheduled_start,actual_start,scheduled_end,actual_end,late_min,over_min,warning,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (aid, str(ev.get('ts_id') or ''), ev.get('event'), ev.get('store_id'), str(ev.get('staff_id') or ''),
             ev.get('staff_name'), str(ev.get('deputy_employee') or ''), ev.get('scheduled_start'), ev.get('actual_start'),
             ev.get('scheduled_end'), ev.get('actual_end'), late, over, warning, now()))
        conn.commit()
        return {'late_min': late, 'over_min': over, 'warning': warning, 'warning_number': nth}
    finally:
        conn.close()

def attendance_stats(store, staff_id):
    conn = connect()
    try:
        rows = conn.execute('SELECT * FROM attendance WHERE store_id=? AND staff_id=? ORDER BY id DESC LIMIT 400',
                            (store, str(staff_id))).fetchall()
        events = [{k: r[k] for k in r.keys()} for r in rows]
        clockins = [e for e in events if e['event'] == 'clockin']
        late_events = [e for e in clockins if (e['late_min'] or 0) > LATE_GRACE_MIN]
        return {
            'events': events[:60],
            'total_shifts': len(clockins),
            'late_count': len(late_events),
            'total_late_min': sum(e['late_min'] or 0 for e in clockins),
            'verbal_warnings': sum(1 for e in events if e['warning'] == 'verbal'),
            'written_warnings': sum(1 for e in events if e['warning'] == 'written'),
            'total_over_min': sum(e['over_min'] or 0 for e in events if e['event'] == 'clockout'),
            'on_time_rate': (round(100 * (len(clockins) - len(late_events)) / len(clockins)) if clockins else 100),
        }
    finally:
        conn.close()

def thread_store(thread_id):
    """The store a thread lives in (from its first message) — used to route replies."""
    conn = connect()
    try:
        row = conn.execute('SELECT store_id FROM messages WHERE thread_id=? ORDER BY id ASC LIMIT 1',
                           (thread_id,)).fetchone()
        return row['store_id'] if row else None
    finally:
        conn.close()

def sanitize_attachments(attachments):
    """[{id,...}] -> verified [{id,name,mime,size}] — ids must exist in the files table."""
    atts = []
    if isinstance(attachments, list):
        conn0 = connect()
        try:
            for a in attachments[:10]:
                if not isinstance(a, dict) or not a.get('id'): continue
                row = conn0.execute('SELECT id,name,mime,size FROM files WHERE id=?', (str(a['id']),)).fetchone()
                if row: atts.append({'id': row['id'], 'name': row['name'], 'mime': row['mime'], 'size': row['size']})
        finally:
            conn0.close()
    return atts

def send_message(au, store, kind, subject, body_html, to_staff_id=None, to_store_all=False,
                 thread_id=None, to_super=None, to_managers=None, attachments=None):
    atts = sanitize_attachments(attachments)
    conn = connect()
    try:
        ts, tm, ta = _route_for(kind)
        if to_super is not None: ts = 1 if to_super else 0
        if to_managers is not None: tm = 1 if to_managers else 0
        if to_store_all: ta = 1
        # PRIVACY: a reply stays within the thread's ORIGINAL audience. If Super messaged a staff
        # member privately, the staff reply must go back to Super only — never into the store
        # managers' inbox (and a confidential-feedback thread must never leak to managers).
        if kind == 'reply' and thread_id:
            root = conn.execute('SELECT * FROM messages WHERE thread_id=? ORDER BY id ASC LIMIT 1',
                                (thread_id,)).fetchone()
            if root is not None:
                # a reply inherits the ROOT's actual audience — NOT "any management-sent message
                # → managers group". This keeps a person-to-person thread (lead → one employee)
                # private to those two; only a message actually addressed to the management group
                # (to_managers) or the whole store stays shared. Super is reachable by role (no id).
                ts = 1 if (root['to_super'] or root['from_role'] in ('super', 'ba')) else 0
                tm = 1 if root['to_managers'] else 0
                ta = 1 if root['to_store_all'] else 0
                if not to_staff_id:
                    me = str(au.get('staff_id') or '')
                    if au.get('role') != 'employee':
                        # keep the employee participant in the loop when management replies
                        to_staff_id = root['to_staff_id'] or root['from_staff_id']
                    else:
                        # employee replying: address the OTHER employee in a person-to-person thread
                        for cand in (root['from_staff_id'], root['to_staff_id']):
                            if cand and str(cand) != me:
                                to_staff_id = cand; break
        mid = conn.execute('''INSERT INTO messages(store_id,from_role,from_name,from_staff_id,to_staff_id,
            to_super,to_managers,to_store_all,kind,subject,body_html,thread_id,read_by_json,attachments_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id''',
            (store, au.get('role'), _role_display(au, store), au.get('staff_id'),
             (str(to_staff_id) if to_staff_id else None), ts, tm, (1 if ta else 0),
             kind, subject or '', body_html or '', thread_id, '[]', json.dumps(atts), now())).fetchone()['id']
        if not thread_id:
            thread_id = 'T' + str(mid)
            conn.execute('UPDATE messages SET thread_id=? WHERE id=?', (thread_id, mid))
        conn.commit()
        emit_event('inbox')
        return {'id': mid, 'thread_id': thread_id}
    finally:
        conn.close()

def _msg_dict(row, key):
    try: rb = json.loads(row['read_by_json'] or '[]')
    except Exception: rb = []
    try: atts = json.loads((row['attachments_json'] if 'attachments_json' in row.keys() else None) or '[]')
    except Exception: atts = []
    return {'id': row['id'], 'store': row['store_id'], 'from_role': row['from_role'],
            'from_name': row['from_name'], 'from_staff_id': row['from_staff_id'],
            'to_staff_id': row['to_staff_id'], 'kind': row['kind'], 'subject': row['subject'],
            'body_html': row['body_html'], 'thread_id': row['thread_id'],
            'created_at': row['created_at'], 'read': key in rb, 'attachments': atts}

def _inbox_query(au):
    r = au.get('role')
    if r in ('super', 'ba'):
        return ('SELECT * FROM messages WHERE to_super=1 ORDER BY id DESC LIMIT ?', (500,))
    if r in ('admin', 'staff'):
        # participant-based: the shared management queue (to_managers) + store broadcasts, PLUS
        # this person's OWN directed mail (sent or received) — so a private lead↔staff thread
        # never shows in another lead's inbox.
        sid = str(au.get('staff_id') or '')
        if sid:
            return ('SELECT * FROM messages WHERE (store_id=? AND (to_managers=1 OR to_store_all=1)) OR to_staff_id=? OR from_staff_id=? ORDER BY id DESC LIMIT ?',
                    (au['store_id'], sid, sid, 500))
        return ('SELECT * FROM messages WHERE store_id=? AND (to_managers=1 OR to_store_all=1) ORDER BY id DESC LIMIT ?', (au['store_id'], 500))
    if r == 'employee':
        # personal mail matches by staff id GLOBALLY (ids are store-prefixed/unique) so a reply
        # from another store's management still reaches the sender; broadcasts stay store-scoped
        return ('SELECT * FROM messages WHERE (to_staff_id=? OR (store_id=? AND to_store_all=1)) ORDER BY id DESC LIMIT ?',
                (str(au.get('staff_id')), au['store_id'], 500))
    return (None, None)

def _list_body(html):
    """Lighten a message body for the LIST view: drop inline base64 images (the heavy part) and
    cap length. The inbox list only shows a text snippet; the full body loads on thread open."""
    if not html: return html
    import re
    html = re.sub(r'<img\b[^>]*src="data:[^"]*"[^>]*>', '', html, flags=re.I)   # strip embedded base64 photos
    return html[:1500]

def list_messages(au):
    q, args = _inbox_query(au)
    if not q: return {'messages': [], 'unread': 0}
    conn = connect()
    try:
        rows = conn.execute(q, args).fetchall()
        key = _reader_key(au)
        out = [_msg_dict(r, key) for r in rows]
        for m in out: m['body_html'] = _list_body(m.get('body_html'))   # keep the list payload small/fast
        unread = sum(1 for m in out if not m['read'])
        return {'messages': out, 'unread': unread}
    finally:
        conn.close()

def unread_count(au):
    q, args = _inbox_query(au)
    if not q: return 0
    conn = connect()
    try:
        rows = conn.execute(q, args).fetchall()
        key = _reader_key(au)
        return sum(1 for r in rows if key not in (json.loads(r['read_by_json'] or '[]') if r['read_by_json'] else []))
    finally:
        conn.close()

def mark_message_read(au, msg_id):
    conn = connect()
    try:
        row = conn.execute('SELECT read_by_json FROM messages WHERE id=?', (msg_id,)).fetchone()
        if not row: return False
        try: rb = json.loads(row['read_by_json'] or '[]')
        except Exception: rb = []
        key = _reader_key(au)
        if key not in rb:
            rb.append(key)
            conn.execute('UPDATE messages SET read_by_json=? WHERE id=?', (json.dumps(rb), msg_id))
            conn.commit()
        return True
    finally:
        conn.close()

def thread_messages(au, thread_id):
    """All messages in a thread the caller can see (their own inbox rows in that thread)."""
    conn = connect()
    try:
        rows = conn.execute('SELECT * FROM messages WHERE thread_id=? ORDER BY id ASC', (thread_id,)).fetchall()
        key = _reader_key(au); r = au.get('role'); sid = str(au.get('staff_id')); store = au.get('store_id')
        def visible(row):
            if r in ('super', 'ba'): return row['to_super'] == 1 or row['from_role'] in ('super', 'ba')
            if r in ('admin', 'staff'):
                if row['store_id'] == store and (row['to_managers'] == 1 or row['to_store_all'] == 1): return True
                return bool(sid) and (str(row['to_staff_id']) == sid or str(row['from_staff_id']) == sid)   # own directed mail only
            if r == 'employee': return str(row['to_staff_id']) == sid or str(row['from_staff_id']) == sid or (row['store_id'] == store and row['to_store_all'] == 1)
            return False
        return [_msg_dict(x, key) for x in rows if visible(x)]
    finally:
        conn.close()

# ---- announcements ----
def post_announcement(au, store, title, body_html, image_id=None, department=None, attachments=None):
    atts = sanitize_attachments(attachments)
    conn = connect()
    try:
        aid = conn.execute('INSERT INTO announcements(store_id,title,body_html,image_id,author,created_at,department,attachments_json) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
                     (store, title or '', body_html or '', image_id, _role_display(au, None if store == 'ALL' else store), now(),
                      (str(department).strip() or None) if department else None, json.dumps(atts))).fetchone()['id']
        conn.commit()
        return aid
    finally:
        conn.close()

def _dept_norm(s):
    """Accent-insensitive, lower-cased department/role key (mirrors the client's staffNorm)."""
    try:
        s = unicodedata.normalize('NFD', str(s or ''))
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    except Exception:
        s = str(s or '')
    return s.lower().strip()

def announcement_recipients(store, department):
    """Staff (with a real email) who should be Gmail-notified about an announcement.
       store not a real store (e.g. 'ALL') → every store; else just that store.
       department empty → EVERYONE in scope; else only staff whose dept OR any role
       matches (normalized) — mirrors the client's inDept() so the email set == the
       in-app audience. Deduped by email; archived / inactive staff are skipped."""
    conn = connect()
    try:
        stores = [store] if (store in STORES) else list(STORES)
        dn = _dept_norm(department)
        out = {}
        for st in stores:
            for r in conn.execute('SELECT data_json FROM staff WHERE store_id=?', (st,)).fetchall():
                try: d = json.loads(r['data_json'] or '{}')
                except Exception: d = {}
                if d.get('archived') or d.get('active') == 0: continue
                email = str(d.get('email') or '').strip()
                if '@' not in email: continue
                if dn:
                    roles = d.get('roles') if isinstance(d.get('roles'), list) else []
                    if _dept_norm(d.get('dept')) != dn and not any(_dept_norm(x) == dn for x in roles):
                        continue
                key = email.lower()
                if key not in out:
                    out[key] = {'email': email, 'name': (d.get('name') or email)}
        return list(out.values())
    finally:
        conn.close()

def list_announcements(au):
    conn = connect()
    try:
        if au.get('role') in ('super', 'ba'):
            rows = conn.execute('SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT 200').fetchall()
        else:
            rows = conn.execute("SELECT * FROM announcements WHERE store_id=? OR store_id='ALL' ORDER BY pinned DESC, id DESC LIMIT 200",
                                (au['store_id'],)).fetchall()
        me = str(au.get('account_id') or au.get('staff_id') or '')
        def readers(r):
            try: return json.loads(r['read_by_json']) if ('read_by_json' in r.keys() and r['read_by_json']) else []
            except Exception: return []
        out = []
        for r in rows:
            rd = readers(r)
            out.append({'id': r['id'], 'store': r['store_id'], 'title': r['title'], 'body_html': r['body_html'],
                 'image_id': r['image_id'], 'author': r['author'], 'created_at': r['created_at'],
                 'pinned': (r['pinned'] if 'pinned' in r.keys() else 0) or 0,
                 'department': (r['department'] if 'department' in r.keys() else None) or '',
                 'attachments': (json.loads(r['attachments_json']) if ('attachments_json' in r.keys() and r['attachments_json']) else []),
                 'readers': rd, 'read_count': len(rd), 'read_me': any(str(x.get('id')) == me for x in rd) if me else False})
        return out
    finally:
        conn.close()

def mark_announcement_read(au, ann_id):
    """Record that this person acknowledged an announcement (id + name + time; once)."""
    me = str(au.get('account_id') or au.get('staff_id') or '')
    if not me: return False
    conn = connect()
    try:
        row = conn.execute('SELECT read_by_json FROM announcements WHERE id=?', (ann_id,)).fetchone()
        if not row: return False
        try: rb = json.loads(row['read_by_json'] or '[]') if ('read_by_json' in row.keys() and row['read_by_json']) else []
        except Exception: rb = []
        if not any(str(x.get('id')) == me for x in rb):
            rb.append({'id': me, 'name': au.get('staff_name') or au.get('name') or me, 'at': now()})
            conn.execute('UPDATE announcements SET read_by_json=? WHERE id=?', (json.dumps(rb), ann_id))
            conn.commit()
        return True
    finally:
        conn.close()

def _ann_can_manage(au, store_id):
    # Super anywhere; Manager AND Dept Lead within their own store
    return au.get('role') == 'super' or (au.get('role') in ('admin', 'staff') and store_id == au.get('store_id'))

def set_announcement_pin(au, aid, pinned):
    conn = connect()
    try:
        row = conn.execute('SELECT store_id FROM announcements WHERE id=?', (aid,)).fetchone()
        if not row or not _ann_can_manage(au, row['store_id']): return False
        conn.execute('UPDATE announcements SET pinned=? WHERE id=?', (1 if pinned else 0, aid))
        conn.commit()
        return True
    finally:
        conn.close()

def update_announcement(au, aid, title, body_html, image_id=None, attachments=None, department=None, store=None):
    """Edit an announcement — Super anywhere, Manager/Dept Lead within their own store.
    The audience can change too: department (team) always, store scope by Super only."""
    conn = connect()
    try:
        row = conn.execute('SELECT store_id,image_id FROM announcements WHERE id=?', (aid,)).fetchone()
        if not row or not _ann_can_manage(au, row['store_id']): return False
        conn.execute('UPDATE announcements SET title=?, body_html=?, image_id=? WHERE id=?',
                     (title or '', body_html or '', (image_id if image_id is not None else row['image_id']), aid))
        if department is not None:
            conn.execute('UPDATE announcements SET department=? WHERE id=?',
                         ((str(department).strip() or None), aid))
        if store and au.get('role') == 'super' and (store == 'ALL' or store in STORES) and store != row['store_id']:
            conn.execute('UPDATE announcements SET store_id=? WHERE id=?', (store, aid))
        if attachments is not None:
            conn.execute('UPDATE announcements SET attachments_json=? WHERE id=?', (json.dumps(sanitize_attachments(attachments)), aid))
        conn.commit()
        return True
    finally:
        conn.close()

def delete_announcement(au, aid):
    conn = connect()
    try:
        row = conn.execute('SELECT store_id FROM announcements WHERE id=?', (aid,)).fetchone()
        if not row: return False
        if not _ann_can_manage(au, row['store_id']): return False   # super any; Manager own store only
        conn.execute('DELETE FROM announcements WHERE id=?', (aid,))
        conn.commit()
        return True
    finally:
        conn.close()

def can_access(au, store_id):
    # super + ba (read-only viewer) can read any store; others only their own
    return bool(au) and (au['role'] in ('super', 'ba') or au['store_id'] == store_id)

def can_write(au):
    return bool(au) and au['role'] != 'ba'   # Chú Ba is strictly read-only

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

def _tpl_rows(v):
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: v = []
    return v if isinstance(v, list) else []

def _audit_template_diff(conn, store, old_v, new_v, user):
    """Write one audit row per checklist task added/removed so template changes are
    traceable to the exact signed-in person (rename shows as remove+add)."""
    key = lambda r: (str(r[0]), str(r[1]), str(r[2]), str(r[3]) if len(r) > 3 else '')
    old = {key(r) for r in _tpl_rows(old_v) if isinstance(r, list) and len(r) >= 3}
    new = {key(r) for r in _tpl_rows(new_v) if isinstance(r, list) and len(r) >= 3}
    for r in sorted(new - old)[:80]:
        conn.execute("""INSERT INTO audit_logs(user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at)
                        VALUES(?,?,?,?,?,?,?,?)""",
                     (user, store, 'template-add', 'checklistTask', r[2][:120], None,
                      json.dumps({'dept': r[0], 'area': r[1], 'task': r[2], 'when': r[3]}), now()))
    for r in sorted(old - new)[:80]:
        conn.execute("""INSERT INTO audit_logs(user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at)
                        VALUES(?,?,?,?,?,?,?,?)""",
                     (user, store, 'template-remove', 'checklistTask', r[2][:120],
                      json.dumps({'dept': r[0], 'area': r[1], 'task': r[2], 'when': r[3]}), None, now()))

def tombstone_records(store_ids_and_ids):
    """Mark record ids as permanently deleted so a stale device can't re-upload them.
    store_ids_and_ids = list of (store_id, id). Old tombstones (>180d) are pruned."""
    pairs = [(str(s), str(i)) for (s, i) in (store_ids_and_ids or []) if s and i]
    if not pairs: return
    conn = connect()
    try:
        ts = now()
        for (s, i) in pairs:
            conn.execute('INSERT INTO deleted_records(store_id,id,deleted_at) VALUES(?,?,?) '
                         'ON CONFLICT (store_id,id) DO UPDATE SET deleted_at=excluded.deleted_at', (s, i, ts))
        conn.execute("DELETE FROM deleted_records WHERE deleted_at < ?",
                     (time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 8 * 3600 - 180 * 86400)),))
        conn.commit()
    finally:
        conn.close()

# noisy machine events that carry no human-meaningful "who did what" — never shown in the log
AUDIT_NOISE_TYPES = ('store_state', 'store_config', 'photo', 'file')

def list_audit(store, limit=300):
    """Meaningful events only: checklist submit/verify, tasks added/removed, records,
    accounts, staff, deletions, config. Routine saves / photo & file uploads are excluded."""
    conn = connect()
    try:
        ph = ','.join('?' * len(AUDIT_NOISE_TYPES))
        base = f"SELECT user_id,store_id,action,entity_type,entity_id,before_json,after_json,created_at FROM audit_logs WHERE entity_type NOT IN ({ph})"
        if store and store != 'ALL':
            rows = conn.execute(base + ' AND store_id=? ORDER BY id DESC LIMIT ?',
                                (*AUDIT_NOISE_TYPES, store, int(limit))).fetchall()
        else:
            rows = conn.execute(base + ' ORDER BY id DESC LIMIT ?',
                                (*AUDIT_NOISE_TYPES, int(limit))).fetchall()
        return [{k: r[k] for k in r.keys()} for r in rows]
    finally:
        conn.close()

def save_state(store_id, state, user, client=None):
    state = dict(state or {})
    conn = connect()
    try:
        # records (per module) — MERGE (upsert): never mass-delete, so concurrent
        # editors at the same store accumulate rows instead of wiping each other.
        # BUT skip any id that was explicitly DELETED (tombstoned) — otherwise a device that
        # still had the old record cached would re-upload it and "un-delete" it (records that
        # came back the next day). The tombstone makes a deletion final across all devices.
        tomb = {row['id'] for row in conn.execute('SELECT id FROM deleted_records WHERE store_id=?', (store_id,)).fetchall()}
        modules = state.get('modules') or {}
        if isinstance(modules, dict):
            for m, arr in modules.items():
                if not isinstance(arr, list): continue
                for i, r in enumerate(arr):
                    rid = str((isinstance(r, dict) and r.get('id')) or (str(m) + '#' + str(i)))
                    if rid in tomb: continue   # deleted → never re-add from a stale device
                    conn.execute('INSERT INTO records(id,store_id,module,data_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT (store_id,module,id) DO UPDATE SET data_json=excluded.data_json, created_at=excluded.created_at',
                                 (rid, store_id, str(m), json.dumps(r), now()))
        # staff (merge/upsert) — ONE profile per gmail per store: a second row with an email
        # that another profile in this store already owns is dropped (or, if the owner was
        # archived, merged onto the owner so the person is restored instead of duplicated).
        staff = state.get('staff') or []
        if isinstance(staff, list):
            email_owner = {}
            for r0 in conn.execute('SELECT id,data_json FROM staff WHERE store_id=?', (store_id,)).fetchall():
                try: d0 = json.loads(r0['data_json'] or '{}')
                except Exception: d0 = {}
                e0 = str(d0.get('email') or '').strip().lower()
                if e0 and e0 not in email_owner:
                    email_owner[e0] = (str(r0['id']), bool(d0.get('archived') or d0.get('active') == 0))
            for i, s in enumerate(staff):
                sid = str((isinstance(s, dict) and (s.get('id') or s.get('code'))) or ('s#' + str(i)))
                if sid in tomb: continue   # deleted staff → never re-add from a stale device's blob
                e = str((s.get('email') if isinstance(s, dict) else '') or '').strip().lower()
                if e:
                    own = email_owner.get(e)
                    if own and own[0] != sid:
                        if not own[1]: continue                # live owner → duplicate gmail, skip
                        sid = own[0]                           # archived owner → restore onto it
                        s = dict(s); s['id'] = sid; s['archived'] = 0; s['active'] = 1
                    arch = bool(isinstance(s, dict) and (s.get('archived') or s.get('active') == 0))
                    email_owner[e] = (sid, arch)
                conn.execute('INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json', (sid, store_id, json.dumps(s)))
            _sync_accounts_from_staff(conn, store_id)   # staff edits flow back to Account Management
        # checklist submissions (merge/upsert)
        subs = _parse(state.get('checklistSubs'))
        if isinstance(subs, list):
            for i, s in enumerate(subs):
                cid = str((isinstance(s, dict) and s.get('id')) or ('c#' + str(i)))
                row = conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=? AND id=?',
                                   (store_id, cid)).fetchone()
                payload = _merge_checklist_submission(row['data_json'] if row else None, s if isinstance(s, dict) else {})
                conn.execute('INSERT INTO checklist_submissions(id,store_id,data_json,created_at) VALUES(?,?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json, created_at=excluded.created_at',
                             (cid, store_id, json.dumps(payload), now()))
        # schedule history (merge/upsert by client record id, deduped via rec_id index)
        sh = _parse(state.get('scheduleHistory'))
        if isinstance(sh, list):
            for i, r in enumerate(sh):
                rid = str((isinstance(r, dict) and r.get('id')) or ('sh#' + str(i)))
                conn.execute('INSERT INTO schedule_history(rec_id,store_id,data_json,created_at) VALUES(?,?,?,?) ON CONFLICT (store_id,rec_id) DO UPDATE SET data_json=excluded.data_json, created_at=excluded.created_at',
                             (rid, store_id, json.dumps(r), now()))
        # bin records (merge/upsert)
        ba = _parse(state.get('binAdmin'))
        bin_recs = ba.get('records') if isinstance(ba, dict) else None
        if isinstance(bin_recs, list):
            for i, r in enumerate(bin_recs):
                bid = str((isinstance(r, dict) and r.get('id')) or ('b#' + str(i)))
                conn.execute('INSERT INTO bin_records(id,store_id,data_json,created_at) VALUES(?,?,?,?) ON CONFLICT (store_id,id) DO UPDATE SET data_json=excluded.data_json, created_at=excluded.created_at',
                             (bid, store_id, json.dumps(r), now()))
        # lean blob: identical shape, heavy arrays emptied (rebuilt on load)
        lean = dict(state)
        lean['modules'] = {}
        lean['staff'] = []
        lean['checklistSubs'] = '[]'
        lean['scheduleHistory'] = '[]'
        # ---- checklist template: guarded + audited ----
        # * client did NOT send a template (Super sessions never do) → keep the store's own.
        # * content changed but the version was not bumped ABOVE the stored one → stale or
        #   foreign copy → keep the store's own (an honest edit always bumps the version).
        # * accepted changes are diffed into audit_logs with the signed-in person.
        try:
            prev = conn.execute('SELECT state_json FROM store_state WHERE store_id=?', (store_id,)).fetchone()
            pj = {}
            if prev and prev['state_json']:
                try: pj = json.loads(prev['state_json'])
                except Exception: pj = {}
            posted_items = state.get('checklistItems', None)
            posted_depts = state.get('checklistDepts', None)
            prev_ver = int(pj.get('checklistTemplateVersion') or 0)
            def _keep_prev():
                lean['checklistItems'] = pj.get('checklistItems')
                lean['checklistTemplateVersion'] = pj.get('checklistTemplateVersion')
                if pj.get('checklistDeadlines') is not None: lean['checklistDeadlines'] = pj.get('checklistDeadlines')
                # the department list is versioned WITH the template — revert it too on a stale save
                if pj.get('checklistDepts') is not None: lean['checklistDepts'] = pj.get('checklistDepts')
                if pj.get('checklistDeptMeta') is not None: lean['checklistDeptMeta'] = pj.get('checklistDeptMeta')
            if posted_items is None:
                if pj: _keep_prev()
            else:
                new_ver = int(state.get('checklistTemplateVersion') or 0)
                items_changed = json.dumps(_tpl_rows(pj.get('checklistItems'))) != json.dumps(_tpl_rows(posted_items))
                depts_changed = (posted_depts is not None) and (json.dumps(pj.get('checklistDepts') or []) != json.dumps(posted_depts or []))
                changed = items_changed or depts_changed
                if changed and new_ver <= prev_ver and pj.get('checklistItems') is not None:
                    _keep_prev()
                elif items_changed:
                    try: _audit_template_diff(conn, store_id, pj.get('checklistItems'), posted_items, user)
                    except Exception: pass
            # a client that doesn't send the per-store dept list at all (e.g. an older cached
            # build) must NEVER wipe it — carry the stored list forward.
            if state.get('checklistDepts', None) is None and pj.get('checklistDepts') is not None:
                lean['checklistDepts'] = pj.get('checklistDepts')
                if pj.get('checklistDeptMeta') is not None: lean['checklistDeptMeta'] = pj.get('checklistDeptMeta')
            # MONOTONIC version: never store a LOWER template version than we already had. A stale
            # blob save (same items but an old version number, e.g. from a device whose local
            # version drifted) must not roll the version back — otherwise a later stale-but-higher
            # device could out-version and clobber an accepted edit.
            if pj.get('checklistItems') is not None:
                try:
                    if int(lean.get('checklistTemplateVersion') or 0) < prev_ver:
                        lean['checklistTemplateVersion'] = prev_ver
                except Exception:
                    pass
        except Exception:
            pass
        if isinstance(ba, dict):
            ba2 = dict(ba); ba2['records'] = []
            lean['binAdmin'] = json.dumps(ba2)
        blob = json.dumps(lean)
        conn.execute("""INSERT INTO store_state(store_id,state_json,updated_at,updated_by) VALUES(?,?,?,?)
                        ON CONFLICT (store_id) DO UPDATE SET state_json=excluded.state_json,
                        updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                     (store_id, blob, now(), user))
        # capped snapshot trail (lean blob — size/timeline indicator). Only snapshot when the
        # blob actually CHANGED vs the latest snapshot: autosaves fire every few seconds and are
        # usually byte-identical (ticking a checkbox doesn't touch the blob), so writing a fresh
        # snapshot each time was pure disk churn with no recovery value.
        last_snap = conn.execute('SELECT state_json FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 1',
                                 (store_id,)).fetchone()
        if not last_snap or last_snap['state_json'] != blob:
            conn.execute('INSERT INTO store_state_snapshots(store_id,state_json,created_at,created_by) VALUES(?,?,?,?)',
                         (store_id, blob, now(), user))
            conn.execute("""DELETE FROM store_state_snapshots WHERE store_id=? AND id NOT IN
                            (SELECT id FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 20)""",
                         (store_id, store_id))
        conn.commit()
        try: emit_event('state', store_id, client)   # every OTHER device at this store re-syncs
        except Exception: pass
        return len(blob)
    finally:
        conn.close()

def _days_ago_str(n):
    """Perth (UTC+8) calendar date n days ago, as 'YYYY-MM-DD' — comparable to created_at."""
    return time.strftime('%Y-%m-%d', time.gmtime(time.time() + 8 * 3600 - int(n) * 86400))

def checklist_subs_for(store_id):
    """Full checklist submission history for ONE store (used by the on-demand /api/checklist/history)."""
    conn = connect()
    try:
        return [json.loads(r['data_json']) for r in
                conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=? ORDER BY created_at', (store_id,)).fetchall()]
    finally:
        conn.close()

def all_checklist_subs():
    """Full checklist submission history across EVERY store (Super history/Data Management)."""
    conn = connect()
    try:
        return [json.loads(r['data_json']) for r in
                conn.execute('SELECT data_json FROM checklist_submissions ORDER BY created_at').fetchall()]
    finally:
        conn.close()

def load_state(store_id, subs_recent_days=None):
    # subs_recent_days: when set, the routine load returns only the last N days of checklist
    # submissions (keeps the payload/CPU small as history grows). The FULL history is served
    # on demand via /api/checklist/history for the History / Data Management / Photo views.
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
        if subs_recent_days:
            cutoff = _days_ago_str(subs_recent_days)
            sub_rows = conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 1500',
                                    (store_id, cutoff)).fetchall()
        else:
            sub_rows = conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=?', (store_id,)).fetchall()
        subs = [json.loads(r['data_json']) for r in sub_rows]
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
