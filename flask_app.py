"""
MCQ Supermarket — static-site server for PythonAnywhere.

This serves the front-end (index.html + assets/*) over HTTPS so Face ID (WebAuthn)
and the installable PWA work. It does NOT expose .git, dotfiles or this server file.

PythonAnywhere setup (see DEPLOY_PYTHONANYWHERE.md):
  WSGI file:  from flask_app import app as application
"""
import os
from flask import Flask, send_from_directory, abort

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

# files that must never be served publicly
BLOCK = {'.git', '.gitignore', 'flask_app.py', 'requirements.txt',
         'deploy_pythonanywhere.py', 'DEPLOY_PYTHONANYWHERE.md', '__pycache__'}

def _safe(rel):
    rel = rel.lstrip('/')
    parts = rel.split('/')
    if any(p == '' or p.startswith('.') or p in BLOCK for p in parts):
        return None
    full = os.path.normpath(os.path.join(BASE, rel))
    if not full.startswith(BASE):           # path-traversal guard
        return None
    return rel if os.path.isfile(full) else None

@app.route('/')
def index():
    return send_from_directory(BASE, 'index.html')

@app.route('/<path:p>')
def files(p):
    rel = _safe(p)
    if rel:
        resp = send_from_directory(BASE, rel)
        # never cache the service worker so updates roll out immediately
        if rel.endswith('sw.js'):
            resp.headers['Cache-Control'] = 'no-cache'
        return resp
    # unknown path → single-page-app fallback
    return send_from_directory(BASE, 'index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
