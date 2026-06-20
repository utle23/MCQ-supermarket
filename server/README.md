# MCQ Supermarket — local backend (Flask + SQLite)

Per-store isolated API. **Not deployed yet** — build & test locally first.

## Run the backend
```bash
cd server
python3 -m pip install -r requirements.txt
python3 app.py                 # http://localhost:8001  (SQLite at server/data/mcq.db)
```
`python3 app.py` auto-creates the database + seeds the 8 stores and the login
passwords on first run.

## Serve the frontend (separate terminal, repo root)
```bash
python3 -m http.server 8765
```
Open http://localhost:8765 then, in the browser DevTools console (once):
```js
localStorage.mcq_api_base = 'http://localhost:8001'; location.reload();
```
Now the app talks to the Flask backend instead of Firebase. (Remove that key to
go back to the old behaviour.) When the Flask app later serves the frontend too,
the same origin is used automatically.

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
