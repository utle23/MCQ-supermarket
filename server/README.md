# MCQ Supermarket — backend (Flask + SQLite)

Per-store isolated API. **Not deployed yet** — build & test locally first.

## Option A — single app (frontend + API on one origin, same as production)
From the **repo root**:
```bash
python3 -m pip install -r requirements.txt
python3 flask_app.py           # http://localhost:8000  (serves the UI AND /api)
```
Open http://localhost:8000 and log in — **no browser config needed**. The page is
served with `window.__MCQ_SAME_ORIGIN_API=true` injected, so the frontend uses
`/api` automatically and **Firebase stays off**. This is exactly how it runs on
PythonAnywhere (see ../DEPLOY_PYTHONANYWHERE.md).

## Option B — API only (separate origin, for adapter testing)
```bash
cd server
python3 -m pip install -r requirements.txt
python3 app.py                 # http://localhost:8001  (SQLite at server/data/mcq.db)
```
Then serve the frontend separately and point it at the API once:
```bash
python3 -m http.server 8765    # repo root, another terminal
```
```js
// browser DevTools console, once:
localStorage.mcq_api_base = 'http://localhost:8001'; location.reload();
```
Either option auto-creates the database + seeds the 8 stores and the login
passwords on first run. Open via plain `http.server` with no flag/key set → the
old Firebase/offline build runs unchanged.

## Data model
Heavy collections are **normalized into tables** (not one giant JSON blob):
`records` (per module), `staff`, `checklist_submissions`, `schedule_history`,
`bin_records`. The per-store `store_state` row keeps only the lean config
(structure, templates, routes…). `load_state()` rebuilds the exact frontend shape
on read, so the UI is unchanged. Photos are files + a `photos` metadata row.

## API
| Method | Route | Who |
|---|---|---|
| GET | `/api/health` | anyone |
| POST | `/api/login` `{mode,store,password}` | anyone |
| GET | `/api/stores` | any signed-in (super: all, else own) |
| GET/POST | `/api/state/<store_id>` | own store; super: any |
| GET/POST | `/api/store-config/<store_id>` | own store; super: any |
| POST | `/api/photos` (multipart: image/dataUrl, store_id, id) | own store |
| GET | `/api/photos/<photo_id>` | owner store / super |
| GET | `/api/history/<store_id>` | own store; super: any |
| POST | `/api/audit-log` | signed-in |

Logins (server-side only now): staff per branch (Morley 1111 … Warehouse 8000),
admin 77771, super 99999.

## Test checklist (all verified automatically)
- [x] Admin Morley sees only Morley data; Admin Mirrabooka sees only Mirrabooka.
- [x] Save/edit/delete in one store does not affect any other store
      (cross-store GET/POST/photo/history → HTTP 403; no token → 401).
- [x] Super Admin loads the store **list first** (lazy), then aggregates a store
      / all-stores only when a view needs it.
- [x] Photos upload as files (server/uploads/<store>/) with a DB metadata row,
      and load back; cross-store photo fetch is 403.
- [x] Audit logs are written on every save / photo / explicit action.
- [x] The frontend never auto-saves before its first successful load
      (so a slow/failed load can't wipe a store), and shows clear sync states.
- [x] If the backend is slow/unreachable the app stays usable on local data.

## Switch to MySQL on PythonAnywhere later
All SQL is plain/portable. Replace `db.connect()` with a MySQL connector
(`mysql.connector` / SQLAlchemy), keep the same tables. Photos already live as
files, so only small metadata rows grow the DB.
