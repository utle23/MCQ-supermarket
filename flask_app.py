"""
MCQ Supermarket — SINGLE deployment app for PythonAnywhere.

One Flask app that serves BOTH:
  * the frontend (index.html + assets/*) over HTTPS — so Face ID (WebAuthn) and
    the installable PWA work, and
  * the backend API at /api/* (per-store isolated, SQLite/MySQL) — mounted from
    server/app.py as a blueprint.

Because the frontend is served by this same app, it runs on the SAME ORIGIN as
/api, so:
  * the page is served with `window.__MCQ_SAME_ORIGIN_API = true` injected, which
    makes assets/api.js talk to /api automatically (no manual mcq_api_base), and
  * assets/firebase.js sees that flag and never starts Firestore — Firebase is
    effectively OFF whenever the app is served by this server.

Opening the files directly / via `python3 -m http.server` does NOT inject the
flag, so the old Firebase/offline build still works untouched.

PythonAnywhere setup (see DEPLOY_PYTHONANYWHERE.md):
  WSGI file:  from flask_app import app as application
"""
import os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, 'server'))   # so `import app`/`import db` resolve to server/*

from flask import Flask, send_from_directory, Response
import app as backend   # server/app.py  (provides the `api` blueprint + add_cors + db)
import db               # server/db.py

app = Flask(__name__, static_folder=None)
# allow large photo uploads and image-in-body posts (Werkzeug caps form FIELDS at 500KB by
# default → 413; photos now upload as files, and these lift the ceilings as a safety net)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
app.config['MAX_FORM_MEMORY_SIZE'] = 32 * 1024 * 1024   # Werkzeug 3.1+ (ignored on older versions)
db.init_db()                       # create/seed SQLite on first boot
app.register_blueprint(backend.api)  # mounts /api/* on this same app
backend.add_cors(app)              # harmless on same-origin; helps if you ever split origins

# files that must never be served publicly
BLOCK = {'.git', '.gitignore', 'flask_app.py', 'requirements.txt',
         'deploy_pythonanywhere.py', 'DEPLOY_PYTHONANYWHERE.md', '__pycache__', 'server'}

def _safe(rel):
    rel = rel.lstrip('/')
    parts = rel.split('/')
    if any(p == '' or p.startswith('.') or p in BLOCK for p in parts):
        return None
    full = os.path.normpath(os.path.join(BASE, rel))
    if not full.startswith(BASE):           # path-traversal guard
        return None
    return rel if os.path.isfile(full) else None

# the one-line flag that flips the frontend onto same-origin /api and turns Firebase off
_FLAG = '<script>window.__MCQ_SAME_ORIGIN_API=true;</script>'

def _serve_index():
    with open(os.path.join(BASE, 'index.html'), 'r', encoding='utf-8') as fh:
        html = fh.read()
    if _FLAG not in html:
        html = html.replace('<head>', '<head>\n  ' + _FLAG, 1)
    return Response(html, mimetype='text/html')

@app.route('/')
def index():
    return _serve_index()

@app.route('/<path:p>')
def files(p):
    # index.html must ALWAYS go through the flag-injecting path, never the raw file —
    # otherwise the frontend can load without window.__MCQ_SAME_ORIGIN_API and skip the backend.
    if p.lstrip('/').lower() in ('index.html', 'index.htm'):
        return _serve_index()
    rel = _safe(p)
    if rel:
        resp = send_from_directory(BASE, rel)
        if rel.endswith('sw.js'):           # never cache the SW so updates roll out immediately
            resp.headers['Cache-Control'] = 'no-cache'
        return resp
    return _serve_index()                    # SPA fallback (also injects the flag)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
