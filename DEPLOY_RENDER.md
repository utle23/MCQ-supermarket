# Deploy MCQ Supermarket on Render (Web Service + Postgres)

The app auto-detects its database: **Postgres** when `DATABASE_URL` is set (Render),
**SQLite** otherwise (local dev). Uploads (photos/files) live under `DATA_DIR` so they
survive deploys on a persistent disk.

## A. Easiest — Blueprint (uses render.yaml)
1. Push this repo to GitHub (already done).
2. Render → **New → Blueprint** → connect `utle23/MCQ-supermarket`.
3. Render reads `render.yaml` and creates: the **Web Service** + **Postgres** + a **5GB disk**
   for uploads. Click **Apply**.
4. In the web service → **Environment**, set the secrets it left blank:
   `DEPUTY_WEBHOOK_SECRET`, `DEPUTY_HOST`, `DEPUTY_TOKEN` (only if you use Deputy).
5. First deploy builds + boots; `db.init_db()` creates all tables + seeds automatically.
   App is live at `https://mcq-supermarket.onrender.com` (HTTPS → Face ID & PWA work).

## B. Manual (if you prefer clicking)
1. **New → Postgres** → plan Basic (~$6/mo) → copy its **Internal Database URL**.
2. **New → Web Service** → connect the repo →
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn flask_app:app --workers 3 --timeout 120 --bind 0.0.0.0:$PORT`
   - Instance: **Starter $7** (always-on) or **Standard $25** (recommended for 5×70).
3. Web service → **Disks → Add Disk**: mount `/var/data`, size 5GB.
4. Web service → **Environment**:
   - `DATABASE_URL` = the Internal Database URL from step 1
   - `DATA_DIR` = `/var/data`
   - Deputy secrets if used.
5. Deploy.

## C. Move your existing data (PythonAnywhere SQLite → Render Postgres)
Run ONCE from a machine that has the current `mcq.db` (e.g. download it from PythonAnywhere
Files, or your local copy):
```bash
pip install psycopg2-binary
DATABASE_URL="<the EXTERNAL database URL from Render Postgres>" \
python3 server/migrate_to_postgres.py path/to/mcq.db
```
It creates the schema, upserts every table (safe to re-run), and fixes id sequences.
Then copy the **uploads** folder contents into the Render disk (via the service Shell, or
re-upload through the app). Verify a few logins on the Render URL before going live.

## Notes
- Render disks pin the service to a single instance. For 5×70 users that's fine; if you later
  need multiple instances/HA, move uploads to object storage (S3-compatible) — small change.
- Postgres on Render is UTF-8 by default (Vietnamese names + emoji migrate cleanly).
- Free Postgres expires after 30 days and the free Web Service sleeps after 15 min idle —
  use paid plans for production.
