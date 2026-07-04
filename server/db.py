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
BA_PW = '19'   # "Chú Ba" — read-only viewer of checklist results across ALL stores
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
CREATE INDEX IF NOT EXISTS idx_audit_store ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_photos_store ON photos(store_id);
CREATE INDEX IF NOT EXISTS idx_snap_store ON store_state_snapshots(store_id);
CREATE INDEX IF NOT EXISTS idx_msg_store ON messages(store_id);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_ann_store ON announcements(store_id);
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
    # migration: tokens carry the employee identity (staff_id/name) for individual logins
    for col in ('staff_id', 'staff_name'):
        try: conn.execute('ALTER TABLE tokens ADD COLUMN %s TEXT' % col)
        except Exception: pass
    try: conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_staffacct ON staff_accounts(store_id, staff_id)')
    except Exception: pass
    try: conn.execute('ALTER TABLE announcements ADD COLUMN pinned INTEGER DEFAULT 0')   # pin-to-top support
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
    add_user('ba', None, BA_PW, sync=True)
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
    """Returns (role, store_id[, meta]) on success or None. store_id is 'ALL' for super.
    For mode 'employee' the 3rd element is {staff_id, staff_name}."""
    conn = connect()
    try:
        if mode == 'super':
            row = conn.execute('SELECT password_hash FROM users WHERE role="super"').fetchone()
            return ('super', 'ALL') if row and row['password_hash'] == hash_pw(pw) else None
        if mode == 'ba':
            row = conn.execute('SELECT password_hash FROM users WHERE role="ba"').fetchone()
            return ('ba', 'ALL') if row and row['password_hash'] == hash_pw(pw) else None
        if mode == 'employee':
            # individual staff account — numeric password only (globally unique)
            row = conn.execute('SELECT store_id, staff_id, staff_name FROM staff_accounts WHERE password=?',
                               (str(pw or '').strip(),)).fetchone()
            if not row or row['store_id'] not in STORES: return None
            return ('employee', row['store_id'], {'staff_id': row['staff_id'], 'staff_name': row['staff_name']})
        if mode == 'admin':
            if store not in STORES: return None
            row = conn.execute('SELECT password_hash FROM users WHERE role="admin" AND store_id=?', (store,)).fetchone()
            return ('admin', store) if row and row['password_hash'] == hash_pw(pw) else None
        # staff (Department Lead): per-store password
        if store not in STORES: return None
        row = conn.execute('SELECT password_hash FROM users WHERE role="staff" AND store_id=?', (store,)).fetchone()
        return ('staff', store) if row and row['password_hash'] == hash_pw(pw) else None
    finally:
        conn.close()

def issue_token(role, store_id, staff_id=None, staff_name=None):
    tok = secrets.token_hex(24)
    conn = connect()
    conn.execute('INSERT INTO tokens(token,role,store_id,created_at,expires_at,staff_id,staff_name) VALUES(?,?,?,?,?,?,?)',
                 (tok, role, store_id, time.time(), time.time() + TOKEN_TTL, staff_id, staff_name))
    conn.commit(); conn.close()
    return tok

def auth_from_token(token):
    if not token: return None
    conn = connect()
    try:
        row = conn.execute('SELECT role,store_id,expires_at,staff_id,staff_name FROM tokens WHERE token=?', (token,)).fetchone()
        if not row or row['expires_at'] < time.time(): return None
        return {'role': row['role'], 'store_id': row['store_id'],
                'staff_id': row['staff_id'] if 'staff_id' in row.keys() else None,
                'staff_name': row['staff_name'] if 'staff_name' in row.keys() else None}
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
    whole store blob, keeping concurrency safe)."""
    conn = connect()
    try:
        row = conn.execute('SELECT data_json FROM staff WHERE store_id=? AND id=?', (store, str(staff_id))).fetchone()
        cur = {}
        if row and row['data_json']:
            try: cur = json.loads(row['data_json'])
            except Exception: cur = {}
        if isinstance(patch, dict):
            for k in patch: cur[k] = patch[k]
        cur['store'] = store; cur['id'] = str(staff_id)
        conn.execute('INSERT OR REPLACE INTO staff(id,store_id,data_json) VALUES(?,?,?)', (str(staff_id), store, json.dumps(cur)))
        # keep the account's cached name in sync when the employee renames themselves
        if isinstance(patch, dict) and patch.get('name'):
            conn.execute('UPDATE staff_accounts SET staff_name=? WHERE store_id=? AND staff_id=?', (patch['name'], store, str(staff_id)))
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
    """An employee can view their own numeric login password."""
    if au.get('role') != 'employee': return None
    conn = connect()
    try:
        row = conn.execute('SELECT password FROM staff_accounts WHERE store_id=? AND staff_id=?',
                           (au.get('store_id'), str(au.get('staff_id')))).fetchone()
        return row['password'] if row else None
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

def send_message(au, store, kind, subject, body_html, to_staff_id=None, to_store_all=False,
                 thread_id=None, to_super=None, to_managers=None):
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
                ts = 1 if (root['to_super'] or root['from_role'] in ('super', 'ba')) else 0
                tm = 1 if (root['to_managers'] or root['from_role'] in ('admin', 'staff')) else 0
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
        conn.execute('''INSERT INTO messages(store_id,from_role,from_name,from_staff_id,to_staff_id,
            to_super,to_managers,to_store_all,kind,subject,body_html,thread_id,read_by_json,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (store, au.get('role'), _role_display(au, store), au.get('staff_id'),
             (str(to_staff_id) if to_staff_id else None), ts, tm, (1 if ta else 0),
             kind, subject or '', body_html or '', thread_id, '[]', now()))
        mid = conn.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        if not thread_id:
            thread_id = 'T' + str(mid)
            conn.execute('UPDATE messages SET thread_id=? WHERE id=?', (thread_id, mid))
        conn.commit()
        return {'id': mid, 'thread_id': thread_id}
    finally:
        conn.close()

def _msg_dict(row, key):
    try: rb = json.loads(row['read_by_json'] or '[]')
    except Exception: rb = []
    return {'id': row['id'], 'store': row['store_id'], 'from_role': row['from_role'],
            'from_name': row['from_name'], 'from_staff_id': row['from_staff_id'],
            'to_staff_id': row['to_staff_id'], 'kind': row['kind'], 'subject': row['subject'],
            'body_html': row['body_html'], 'thread_id': row['thread_id'],
            'created_at': row['created_at'], 'read': key in rb}

def _inbox_query(au):
    r = au.get('role')
    if r in ('super', 'ba'):
        return ('SELECT * FROM messages WHERE to_super=1 ORDER BY id DESC LIMIT ?', (500,))
    if r in ('admin', 'staff'):
        return ('SELECT * FROM messages WHERE store_id=? AND to_managers=1 ORDER BY id DESC LIMIT ?', (au['store_id'], 500))
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
            if r in ('admin', 'staff'): return row['store_id'] == store and (row['to_managers'] == 1 or row['from_role'] in ('admin', 'staff'))
            if r == 'employee': return row['to_staff_id'] == sid or row['from_staff_id'] == sid or (row['store_id'] == store and row['to_store_all'] == 1)
            return False
        return [_msg_dict(x, key) for x in rows if visible(x)]
    finally:
        conn.close()

# ---- announcements ----
def post_announcement(au, store, title, body_html, image_id=None):
    conn = connect()
    try:
        conn.execute('INSERT INTO announcements(store_id,title,body_html,image_id,author,created_at) VALUES(?,?,?,?,?,?)',
                     (store, title or '', body_html or '', image_id, _role_display(au, None if store == 'ALL' else store), now()))
        aid = conn.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        conn.commit()
        return aid
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
        return [{'id': r['id'], 'store': r['store_id'], 'title': r['title'], 'body_html': r['body_html'],
                 'image_id': r['image_id'], 'author': r['author'], 'created_at': r['created_at'],
                 'pinned': (r['pinned'] if 'pinned' in r.keys() else 0) or 0} for r in rows]
    finally:
        conn.close()

def _ann_can_manage(au, store_id):
    return au.get('role') == 'super' or (au.get('role') == 'admin' and store_id == au.get('store_id'))

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
