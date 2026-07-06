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

# non-secret service defaults; the SECRET keys (OpenAI/Brevo) come from env vars on
# Render/PythonAnywhere, or from server/keys_local.py (gitignored) for local dev —
# this repo is public, so GitHub blocks key pushes and OpenAI auto-revokes leaked keys.
os.environ.setdefault('OPENAI_VISION_MODEL', 'gpt-4o')
os.environ.setdefault('MCQ_FROM_EMAIL', 'mcqcafe.notify@gmail.com')
os.environ.setdefault('MCQ_FROM_NAME', 'MCQ Supermarket Notification')
try:
    import keys_local   # noqa: F401 — sets OPENAI_API_KEY / BREVO_API_KEY when present
except Exception:
    pass

import logging, traceback
from flask import Flask, send_from_directory, Response, request, jsonify
import app as backend   # server/app.py  (provides the `api` blueprint + add_cors + db)
import db               # server/db.py

# ---- production logging → stdout (Render/PythonAnywhere capture it in their Logs tab) ----
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('mcq')

# optional error alerting: set SENTRY_DSN in the env + `pip install sentry-sdk` to enable
if os.environ.get('SENTRY_DSN'):
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=os.environ['SENTRY_DSN'], traces_sample_rate=0.0)
        log.info('Sentry error monitoring enabled')
    except Exception as _se:
        log.warning('Sentry requested but not initialised: %s', _se)

app = Flask(__name__, static_folder=None)
# allow large photo uploads and image-in-body posts (Werkzeug caps form FIELDS at 500KB by
# default → 413; photos now upload as files, and these lift the ceilings as a safety net)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
app.config['MAX_FORM_MEMORY_SIZE'] = 32 * 1024 * 1024   # Werkzeug 3.1+ (ignored on older versions)
db.init_db()                       # create/seed SQLite on first boot
app.register_blueprint(backend.api)  # mounts /api/* on this same app
backend.add_cors(app)              # harmless on same-origin; helps if you ever split origins
backend._start_deputy_self_poll()  # Deputy attendance monitor polls itself every ~10 min (no external cron)
# realtime WebSocket hub (/api/ws) — clients get push hints instead of polling
try:
    import ws_hub
    ws_hub.attach(app, db)
except Exception as _e:            # flask-sock missing → app still works (clients fall back to polling)
    print('[MCQ] websocket hub disabled:', _e)

# ---- never let an unhandled exception die as an HTML 500: log the full traceback with
#      request context, and return clean JSON so the frontend's .json() never chokes ----
@app.errorhandler(Exception)
def _on_error(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e                      # 401/403/404/413/429… keep their intended status
    path = request.path if request else '?'
    log.error('Unhandled error on %s %s (ip=%s)\n%s',
              request.method if request else '?', path,
              request.headers.get('X-Forwarded-For', request.remote_addr) if request else '?',
              traceback.format_exc())
    if path.startswith('/api/'):
        return jsonify(ok=False, error='Server error — the team has been notified.'), 500
    return Response('Something went wrong. Please try again.', status=500, mimetype='text/plain')

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
