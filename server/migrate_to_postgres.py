#!/usr/bin/env python3
"""Copy all data from the local SQLite mcq.db into the Postgres database in DATABASE_URL.

Usage (run once, on the machine that has the current mcq.db):
    DATABASE_URL="postgres://user:pass@host:5432/dbname" \
    python3 server/migrate_to_postgres.py  [path/to/mcq.db]

Safe to re-run: rows are upserted by primary key (ON CONFLICT DO NOTHING), so it won't
duplicate. It also fixes each SERIAL sequence afterwards so new inserts get fresh ids.
"""
import os, sys, sqlite3, psycopg2, psycopg2.extras

SQLITE_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'data', 'mcq.db')
PG_URL = os.environ.get('DATABASE_URL')
if not PG_URL:
    sys.exit('Set DATABASE_URL to the target Postgres database first.')

# create the schema on the target first
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db as _db                       # uses DATABASE_URL → initialises the PG schema
_db.init_db()
print('✓ Postgres schema ready')

sq = sqlite3.connect(SQLITE_PATH); sq.row_factory = sqlite3.Row
pg = psycopg2.connect(PG_URL); pg.set_client_encoding('UTF8'); pg.autocommit = True
pcur = pg.cursor()

# order doesn't matter (no FKs enforced across these), but keep parents first for tidiness
TABLES = ['stores','users','tokens','staff_accounts','store_state','store_config',
          'store_state_snapshots','photos','audit_logs','staff','checklist_templates',
          'checklist_submissions','records','bin_records','schedule_tasks','schedule_history',
          'settings','messages','announcements','files','accounts','device_creds','attendance']
SERIAL_ID = {'users','staff_accounts','store_state_snapshots','audit_logs',
             'schedule_history','messages','announcements'}   # BIGSERIAL id → fix sequence after

def sqlite_tables():
    return {r[0] for r in sq.execute("SELECT name FROM sqlite_master WHERE type='table'")}

have = sqlite_tables()
for t in TABLES:
    if t not in have: 
        print('– skip', t, '(not in source)'); continue
    rows = sq.execute('SELECT * FROM ' + t).fetchall()
    if not rows: 
        print('  ', t, '0 rows'); continue
    cols = rows[0].keys()
    collist = ','.join('"%s"' % c for c in cols)
    ph = ','.join(['%s'] * len(cols))
    n = 0
    for r in rows:
        try:
            pcur.execute('INSERT INTO %s (%s) VALUES (%s) ON CONFLICT DO NOTHING' % (t, collist, ph),
                         tuple(r[c] for c in cols))
            n += 1
        except Exception as e:
            print('   !', t, 'row error:', str(e)[:90])
    print('  ', t, n, 'rows')
    if t in SERIAL_ID:
        try: pcur.execute("SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s),1))" % (t, t))
        except Exception as e: print('   seq', t, str(e)[:60])

print('✓ Migration complete. Verify a few logins, then switch the app to Postgres.')
