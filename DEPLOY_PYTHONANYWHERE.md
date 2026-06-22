# Deploy MCQ Supermarket on PythonAnywhere

ONE Flask app (`flask_app.py`) now serves **both** the web app **and** the data
backend (`/api/*`) on the same HTTPS origin. So:

- you deploy **once**,
- the frontend talks to `/api` automatically (no manual setup), and
- **Firebase turns itself off** whenever the app is served by this server.

You already `git clone`d the repo — follow these steps.

## 1. Open a Bash console (PythonAnywhere → Consoles → Bash)
```bash
cd ~/MCQ-supermarket            # change to match your clone
git pull                        # get the latest (flask_app.py + server/)
pip install --user -r requirements.txt
```

## 2. Create the web app (PythonAnywhere → Web → Add a new web app)
1. **Add a new web app** → **Next**.
2. **Manual configuration** (NOT the “Flask” auto option) → pick **Python 3.10**
   (or your version) → **Next**.

## 3. Point it at the code (Web tab)
- **Source code:** `/home/YOURUSER/MCQ-supermarket`
- **Working directory:** `/home/YOURUSER/MCQ-supermarket`
- Click the **WSGI configuration file** link and replace its whole contents with:
```python
import os, sys
path = '/home/YOURUSER/MCQ-supermarket'      # <-- change YOURUSER
if path not in sys.path:
    sys.path.insert(0, path)

# --- email (silent send via Brevo). The KEY lives ONLY here on the server,
#     never in the GitHub code. Paste your CURRENT Brevo key below. ---
os.environ['BREVO_API_KEY'] = 'xkeysib-...your-key...'
os.environ['MCQ_FROM_EMAIL'] = 'mcqcafe.notify@gmail.com'
os.environ['MCQ_FROM_NAME']  = 'MCQ Supermarket Notification'

# --- AI Vision (ChatGPT). Reads temperatures from photos + AI Lab OCR.
#     Key stays here on the server only, never in the GitHub code. ---
os.environ['OPENAI_API_KEY'] = 'sk-...your-openai-key...'
os.environ['OPENAI_VISION_MODEL'] = 'gpt-4o-mini'   # optional; gpt-4o for higher accuracy

from flask_app import app as application
```
- **Virtualenv:** leave blank if you used `pip install --user`.
- 🔐 **Email key:** the WSGI file lives on PythonAnywhere only (not on GitHub), so the
  Brevo key stays private. With it set, every store sends email **silently** (temperature
  alerts, verify notes, checklist notifications) via `/api/send-email` — no per-store
  setup, no key in the frontend. Without it, the app falls back to demo/Gmail-compose.
  ⚠️ The key shared earlier in chat is exposed — **regenerate it in Brevo** (SMTP & API →
  API Keys) and paste the NEW one here.

## 4. Reload & open
- Click the green **Reload** button.
- Open `https://YOURUSER.pythonanywhere.com` → login screen appears.
- HTTPS is automatic on `*.pythonanywhere.com`, so **Face ID + “Install app” work**.
- The data backend is live at the same address: `…/api/health` returns JSON.
  The first request auto-creates the SQLite database and seeds the 8 stores.

## 5. Updating later
```bash
cd ~/MCQ-supermarket && git pull
```
then click **Reload** on the Web tab. (`?v=` cache-busting makes browsers fetch
the new files.)

---

## Where the data lives
- **SQLite** at `server/data/mcq.db` (auto-created; gitignored). Uploaded photos
  are **files** under `server/uploads/<store>/` with a metadata row in the DB —
  large images never bloat the database.
- **Strict per-store isolation** is enforced on every `/api` route: a Store Admin
  can only read/write its own store; cross-store access returns HTTP 403; Super
  Admin reads all stores through controlled logic.
- Heavy collections (records, staff, checklist submissions, schedule history, bin
  records) are stored in **normalized tables**, not inside one giant JSON blob —
  smaller DB, and queryable per record.

### Disk / DB limits & switching to MySQL
- The free tier has limited disk; the **paid tier** gives more space + a real
  **MySQL** database. Photos-as-files keeps disk usage modest.
- To move to MySQL later: the SQL is plain/portable — swap `db.connect()` in
  `server/db.py` for a MySQL connector and keep the same tables. Use the in-app
  **Data Management** screen to delete old data and free space.

## Local development (no deploy)
```bash
# single app (frontend + API on one origin) — same as production:
python3 flask_app.py            # http://localhost:8000

# OR API only, on a separate port (frontend via any static server):
cd server && python3 app.py     # http://localhost:8001
```
When you open the page through `python3 -m http.server` (not Flask), the same-
origin flag is NOT injected, so the old Firebase/offline build still runs
unchanged — handy for comparing behaviour.

## Notes
- **Logins** are now checked **server-side** (no real passwords in the frontend
  JS): staff per branch (Morley 1111 … Warehouse 8000), Admin 77771, Super 99999.
  Change them in `server/db.py` (`BRANCH_PW` / `ADMIN_PW` / `SUPER_PW`) then
  delete `server/data/mcq.db` to reseed.
- **Privacy:** `hr-data.js` / the staff table contain real employee details. Keep
  the GitHub repo **Private** and the app behind login.
