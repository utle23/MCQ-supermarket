# Deploy MCQ Supermarket on PythonAnywhere

This hosts the web app over HTTPS (needed for Face ID / installable app).
You already `git clone`d the repo — follow these steps.

## 1. Open a Bash console (PythonAnywhere → Consoles → Bash)
```bash
# go to your cloned repo (change the path/name to match yours)
cd ~/MCQ-supermarket
git pull                       # get the latest (incl. flask_app.py)

# install Flask for your Python version
pip install --user -r requirements.txt
```

## 2. Create the web app (PythonAnywhere → Web → Add a new web app)
1. Click **Add a new web app** → **Next**.
2. Choose **Manual configuration** (NOT “Flask” auto) → pick **Python 3.10** (or your version) → **Next**.

## 3. Point it at the code (Web tab)
- **Source code:** `/home/YOURUSER/MCQ-supermarket`
- **Working directory:** `/home/YOURUSER/MCQ-supermarket`
- Click the **WSGI configuration file** link and replace its whole contents with:
```python
import sys
path = '/home/YOURUSER/MCQ-supermarket'      # <-- change YOURUSER
if path not in sys.path:
    sys.path.insert(0, path)
from flask_app import app as application
```
- (Optional) **Virtualenv:** leave blank if you used `pip install --user`.

## 4. Reload & open
- Click the green **Reload** button.
- Open `https://YOURUSER.pythonanywhere.com` → the login screen appears.
- HTTPS is automatic on `*.pythonanywhere.com`, so **Face ID and “Install app” work**.

## 5. Updating later
Whenever you change the code (or I push updates):
```bash
cd ~/MCQ-supermarket && git pull
```
then click **Reload** on the Web tab. (The app uses `?v=` cache-busting, so browsers fetch the new files.)

---

## Notes
- **Logins:** staff per branch (Morley 1111 … Warehouse 8000), Admin 77771, Super 99999.
- **Data right now:** the app still syncs through Firebase (and works offline via a local cache). To **move data fully onto PythonAnywhere** (per-store SQLite database, with the same strict per-store isolation), I still need to add Flask API routes + a small DB layer and switch the client off Firebase — ask me to build “the PythonAnywhere data backend” and I’ll do it as the next step.
- **Privacy:** `hr-data.js` contains real employee details. Keep the GitHub repo **Private**, and the app behind login.
- **Free vs paid:** a static front-end runs on the free tier; you only need the paid plan for the bigger database once the data backend is added.
