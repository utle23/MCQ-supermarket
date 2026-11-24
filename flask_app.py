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

# non-secret service defaults; the SECRET keys (Anthropic/Brevo) come from env vars on
# Render/PythonAnywhere, or from server/keys_local.py (gitignored) for local dev —
# this repo is public, so GitHub blocks key pushes and leaked keys get revoked.
os.environ.setdefault('MCQ_FROM_EMAIL', 'mcqcafe.notify@gmail.com')
os.environ.setdefault('MCQ_FROM_NAME', 'MCQ Supermarket Notification')
try:
    import keys_local   # noqa: F401 — sets ANTHROPIC_API_KEY / BREVO_API_KEY when present
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

# ---------------------------------------------------------------------------
# /go/devops — the MCQ DevOps tile on the launcher.
#
# The person is identified by the token the app keeps in this browser, not by a
# cookie, so the server cannot mint the ticket from a plain GET. This page asks
# the API for a ticket with that token and auto-submits it to MCQ DevOps as a
# form POST — the ticket never appears in the address bar, in history, or in a
# referrer header. With single sign-on not configured yet it simply opens MCQ
# DevOps, which is what the agreed plan says to do until the secrets exist.
# ---------------------------------------------------------------------------
_GO_DEVOPS = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Opening MCQ DevOps\u2026</title><meta name="referrer" content="no-referrer">
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f2ed;
   font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif;color:#0a4250}
 .b{text-align:center;padding:30px}
 .s{width:34px;height:34px;margin:0 auto 16px;border-radius:50%;
   border:3px solid #d7e0dc;border-top-color:#0c4f6b;animation:sp .8s linear infinite}
 @keyframes sp{to{transform:rotate(360deg)}}
 h1{font-size:17px;margin:0 0 6px;font-weight:800}
 p{margin:0;font-size:13px;color:#5d6b66}
 a{color:#0c4f6b;font-weight:700}
</style></head><body>
<div class="b"><div class="s"></div><h1>Opening MCQ DevOps</h1>
<p id="m">Signing you in\u2026</p>
<p id="f" style="margin-top:14px;display:none"><a href="__DEVOPS__">Continue to MCQ DevOps</a></p></div>
<form id="go" method="POST" action="" style="display:none">
  <input type="hidden" name="ticket" id="t"><input type="hidden" name="next" id="n"></form>
<script>
(function(){
  var DEVOPS="__DEVOPS__";
  function plain(msg){ document.getElementById('m').textContent=msg||'Opening MCQ DevOps\u2026';
    document.getElementById('f').style.display=''; setTimeout(function(){ location.href=DEVOPS; },1200); }
  var tok=null; try{ tok=localStorage.getItem('mcq_token'); }catch(e){}
  if(!tok){ plain('Please sign in to MCQ Supermarket first.'); return; }
  var next=''; try{ next=new URLSearchParams(location.search).get('next')||''; }catch(e){}
  fetch('/api/sso/devops-ticket',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body:JSON.stringify({next:next})})
    .then(function(r){ return r.json().catch(function(){return {};}); })
    .then(function(j){
      if(!j||!j.ok||!j.ticket){ plain(j&&j.error?j.error:'Opening MCQ DevOps\u2026'); return; }
      var f=document.getElementById('go');
      f.action=j.url; document.getElementById('t').value=j.ticket;
      document.getElementById('n').value=j.next||'';
      f.submit();
    })
    .catch(function(){ plain(); });
})();
</script></body></html>"""


@app.route('/go/devops')
def go_devops():
    url = (os.environ.get('DEVOPS_URL') or 'https://mcqtask.onrender.com').rstrip('/')
    return Response(_GO_DEVOPS.replace('__DEVOPS__', url), mimetype='text/html')

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
