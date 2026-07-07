"""
MCQ Supermarket — backend API (Flask blueprint + SQLite).

Per-store isolation is enforced on EVERY route. The API is exposed as a Flask
Blueprint so it can run standalone (local dev) OR be mounted inside the single
deployment app (flask_app.py) that also serves the frontend on the same origin.

Run standalone (local API only):
  cd server && python3 -m pip install -r requirements.txt
  python3 app.py            # http://localhost:8001
"""
import os, sys, json, time, secrets, base64, re, hmac, hashlib, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # so `import db` works when imported as server.app too
import db
import cloudstore
import ssl as _ssl
try:
    import certifi as _certifi
    _TLS = _ssl.create_default_context(cafile=_certifi.where())
except Exception:
    _TLS = _ssl.create_default_context()
from flask import Blueprint, Flask, request, jsonify, send_file, abort, Response

api = Blueprint('api', __name__)

# ---------- helpers ----------
def current_auth():
    h = request.headers.get('Authorization', '')
    tok = h[7:] if h.startswith('Bearer ') else (request.args.get('token') or '')
    return db.auth_from_token(tok)

def require_auth():
    au = current_auth()
    if not au: abort(401)
    return au

def require_store(au, store_id):
    if store_id not in db.STORES: abort(404)
    if not db.can_access(au, store_id): abort(403)

def require_write(au):
    if not db.can_write(au): abort(403)   # Chú Ba (ba) is read-only

def uid(au):
    return (au['role'] + ':' + (au['store_id'] or '')) if au else 'system'

def who(au):
    """Human-readable audit identity: name + account/staff id + role."""
    if not au: return 'system'
    name = au.get('staff_name') or ''
    ident = au.get('account_id') or au.get('staff_id') or ''
    return ('%s (%s · %s)' % (name or au.get('role'), ident or '-', au.get('role') or '')).strip()

def db_safe(s):
    return ''.join(c if c.isalnum() else '-' for c in str(s).lower()).strip('-') or 'store'

# ---------- health ----------
@api.route('/api/health')
def health():
    size = os.path.getsize(db.DB_PATH) if os.path.exists(db.DB_PATH) else 0
    # rev: which commit is live (Render sets RENDER_GIT_COMMIT) — lets deploys be confirmed
    return jsonify(ok=True, time=db.now(), db_bytes=size, stores=len(db.STORES),
                   rev=(os.environ.get('RENDER_GIT_COMMIT') or '')[:8] or None)

# ---------- 9:30 PM daily digest, triggerable by an external cron (cron-job.org) ----------
# Protect with a shared secret in the URL: /api/cron/daily-digest?key=<CRON_SECRET>
# (&email=someone@x.com to test-send to one address). Runs in a background thread so the
# cron caller gets an instant 200 and never times out while 6 PDFs build + email.
@api.route('/api/cron/daily-digest', methods=['GET', 'POST'])
def cron_daily_digest():
    secret = os.environ.get('CRON_SECRET', '')
    if not secret or (request.args.get('key') or '') != secret:
        abort(403)
    override = request.args.get('email') or None
    import threading, daily_digest
    threading.Thread(target=lambda: daily_digest.run(override), daemon=True).start()
    return jsonify(ok=True, started=True, note='digest is building & emailing in the background')

# Proactive overdue-checklist alerts. Have cron-job.org hit this a few times across store
# hours (e.g. every 30 min) — it only alerts once per store/session/day after each deadline.
@api.route('/api/cron/overdue-check', methods=['GET', 'POST'])
def cron_overdue_check():
    secret = os.environ.get('CRON_SECRET', '')
    if not secret or (request.args.get('key') or '') != secret:
        abort(403)
    return jsonify(**db.check_overdue_and_alert())

# ---------- auth ----------
def _client_ip():
    xff = request.headers.get('X-Forwarded-For', '')
    return (xff.split(',')[0].strip() if xff else '') or request.remote_addr or 'unknown'

@api.route('/api/login', methods=['POST'])
def login():
    d = request.get_json(force=True, silent=True) or {}
    ip = _client_ip(); lid = d.get('id')
    lock = db.login_lock_remaining(ip, lid)
    if lock:
        mins = max(1, (lock + 59) // 60)
        return jsonify(ok=False, locked=True,
                       error='Too many failed attempts. Please wait %d minute%s and try again.'
                             % (mins, '' if mins == 1 else 's')), 429
    res = db.verify_login(d.get('mode'), d.get('store'), d.get('password'), login_id=lid)
    if isinstance(res, dict) and res.get('wrong_tab'):
        db.login_note_fail(ip, lid); time.sleep(0.4)
        return jsonify(ok=False, error='This ID belongs to a %s account — please use the %s tab.'
                       % (res['wrong_tab'], res['wrong_tab'])), 401
    if isinstance(res, dict) and res.get('need_id'):
        return jsonify(ok=False, error='Managers & Department Leads now sign in with their personal ID + password. Enter your 4-digit ID. No account yet? Ask Head Office to set up your access.'), 401
    if not res:
        db.login_note_fail(ip, lid); time.sleep(0.4)   # slow down scripted guessing
        return jsonify(ok=False, error='Invalid credentials'), 401
    db.login_note_ok(ip, lid)
    role, store = res[0], res[1]
    meta = res[2] if len(res) > 2 else {}
    tok = db.issue_token(role, store, meta.get('staff_id'), meta.get('staff_name'), meta.get('account_id'))
    return jsonify(ok=True, token=tok, role=role, store=store, home_store=meta.get('home_store'),
                   staff_id=meta.get('staff_id'), staff_name=meta.get('staff_name'),
                   account_id=meta.get('account_id'), needs_profile=bool(meta.get('needs_profile')),
                   acct_admin=db.is_account_admin({'account_id': meta.get('account_id')}) if meta.get('account_id') else False,
                   stores=db.STORES if role in ('super', 'ba') else [store])

@api.route('/api/logout', methods=['POST'])
def logout_route():
    h = request.headers.get('Authorization', '')
    tok = h[7:] if h.startswith('Bearer ') else ''
    db.revoke_token(tok)
    return jsonify(ok=True)

# ---------- Deputy attendance (clock-in/out webhooks → lateness, warnings, inbox) ----------
def _deputy_norm(topic, d):
    """Normalise a Deputy timesheet payload into our attendance event. Deputy field names vary
    by install/version, so we accept several aliases and fall back gracefully."""
    def pick(*keys):
        for k in keys:
            if isinstance(d, dict) and d.get(k) not in (None, '', 0): return d.get(k)
        return None
    actual_start = db._to_epoch(pick('StartTime', 'Start', 'startTime', 'TimeStart'))
    actual_end   = db._to_epoch(pick('EndTime', 'End', 'endTime', 'TimeEnd'))
    sched_start  = db._to_epoch(pick('RosterStartTime', 'ScheduledStart', 'rosterStart', 'StartTimeScheduled'))
    sched_end    = db._to_epoch(pick('RosterEndTime', 'ScheduledEnd', 'rosterEnd', 'EndTimeScheduled'))
    # optionally enrich scheduled times from the linked Roster via the Deputy API (if configured)
    roster_id = pick('RosterId', 'Roster')
    if (sched_start is None) and roster_id and os.environ.get('DEPUTY_HOST') and os.environ.get('DEPUTY_TOKEN'):
        try:
            req = urllib.request.Request(
                os.environ['DEPUTY_HOST'].rstrip('/') + '/api/v1/resource/Roster/' + str(roster_id),
                headers={'Authorization': 'OAuth ' + os.environ['DEPUTY_TOKEN'], 'Accept': 'application/json'})
            ro = json.loads(urllib.request.urlopen(req, timeout=8, context=_TLS).read().decode())
            sched_start = db._to_epoch(ro.get('StartTime')); sched_end = db._to_epoch(ro.get('EndTime'))
        except Exception:
            pass
    event = 'clockout' if actual_end else 'clockin'
    meta = d.get('_DPMetaData') if isinstance(d, dict) else None
    name = pick('EmployeeName', 'DisplayName') or (meta.get('EmployeeName') if isinstance(meta, dict) else None)
    email = pick('EmployeeEmail', 'Email', 'email')
    emp = pick('Employee', 'EmployeeId')
    late = over = 0
    if event == 'clockin' and actual_start and sched_start:
        late = max(0, round((actual_start - sched_start) / 60))
    if event == 'clockout' and actual_end and sched_end:
        over = max(0, round((actual_end - sched_end) / 60))
    return {'ts_id': pick('Id', 'id'), 'event': event, 'deputy_employee': emp, 'name': name, 'email': email,
            'actual_start': str(actual_start or ''), 'actual_end': str(actual_end or ''),
            'scheduled_start': str(sched_start or ''), 'scheduled_end': str(sched_end or ''),
            'late_min': late, 'over_min': over}

def _fmt_hm(epoch):
    try: return time.strftime('%d %b %H:%M', time.gmtime(int(epoch) + 8 * 3600))   # Perth (UTC+8)
    except Exception: return ''

@api.route('/api/deputy/webhook', methods=['POST'])
def deputy_webhook():
    raw = request.get_data() or b''
    secret = os.environ.get('DEPUTY_WEBHOOK_SECRET', '')
    if secret:   # verify Deputy's signature when the private key is configured
        sig = request.headers.get('X-Deputy-Secret', '')
        calc = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, sig):
            abort(401)
    try: body = json.loads(raw.decode() or '{}')
    except Exception: return jsonify(ok=False, error='bad json'), 400
    topic = str(body.get('topic') or '')
    if 'timesheet' not in topic.lower() and body.get('data') is None:
        return jsonify(ok=True, ignored=topic)   # ack non-timesheet events
    data = body.get('data'); items = data if isinstance(data, list) else [data]
    processed = 0
    for d in items:
        if not isinstance(d, dict): continue
        ev = _deputy_norm(topic, d)
        m = db._match_staff_for_deputy(ev.get('email'), ev.get('name'), ev.get('deputy_employee'))
        if not m or not m.get('id'):
            continue   # employee not matched to any MCQ staff — skip (logged by count)
        ev['store_id'] = m['store']; ev['staff_id'] = m['id']; ev['staff_name'] = m['name']
        res = db.record_attendance(ev)
        processed += 1
        # notify the employee's inbox
        try:
            au = {'role': 'super', 'store_id': None, 'staff_id': None, 'staff_name': '⏱ Attendance'}
            if ev['event'] == 'clockin' and res['late_min'] > db.LATE_GRACE_MIN:
                # full late pipeline: violation record + staff inbox + managers copy + email
                _md = (d.get('_DPMetaData') or {}) if isinstance(d, dict) else {}
                _oui = _md.get('OperationalUnitInfo') or {}
                _deputy_late_effects(m, ev, res,
                                     dept_name=str((d.get('OperationalUnitName') if isinstance(d, dict) else '') or _oui.get('OperationalUnitName') or ''),
                                     loc_name=str((d.get('CompanyName') if isinstance(d, dict) else '') or _oui.get('CompanyName') or ''))
                continue
            if ev['event'] == 'clockin':
                subj = '✅ Clock-in recorded — on time'
                body_html = '<p>Thanks — you clocked in on time%s. Have a great shift! 💚</p>' % (' at ' + _fmt_hm(ev['actual_start']) if ev['actual_start'] else '')
            else:
                subj = '👋 Clock-out recorded'
                body_html = ('<p>You clocked out%s.%s</p>'
                             % ((' at ' + _fmt_hm(ev['actual_end']) if ev['actual_end'] else ''),
                                (' You stayed <b>%d minutes past</b> your rostered finish.' % res['over_min'] if res['over_min'] > 0 else '')))
            db.send_message(au, ev['store_id'], 'message', subj, body_html, to_staff_id=ev['staff_id'], to_super=False, to_managers=False)
        except Exception:
            pass
    return jsonify(ok=True, processed=processed, received=len(items))

def _deputy_late_effects(m, ev, res, dept_name='', loc_name=''):
    """Everything that happens for ONE late clock-in (>10 min past the rostered start):
    a violation record in that store's Violation module (Khoi's 6-month ladder step),
    an inbox notice to the employee + a copy to the store's managers/super, and a
    branded email to the employee's gmail. `m` = matched MCQ staff {store,id,name,email}."""
    step = res.get('warning') or 'Verbal Discussion'
    nth = res.get('warning_number') or 1
    late = res.get('late_min') or 0
    at_hm = _fmt_hm(ev.get('actual_start')) if ev.get('actual_start') else ''
    sched_hm = _fmt_hm(ev.get('scheduled_start')) if ev.get('scheduled_start') else ''
    sev = 'Minor' if step == 'Verbal Discussion' else 'Serious' if step == 'Written Warning' else 'Major'
    desc = ('Clocked in %d minutes late%s%s%s%s.'
            % (late, (' at ' + at_hm) if at_hm else '', (' (rostered ' + sched_hm + ')') if sched_hm else '',
               (' · Location: ' + loc_name) if loc_name else '',
               (' · Deputy department: ' + dept_name) if dept_name else ''))
    rec = {'id': 'VIO-ATT-' + secrets.token_hex(4).upper(), 'created': db.now()[:16],
           'staffName': m.get('name') or '', 'store': m['store'], 'category': 'Late clock-in',
           'severity': sev, 'step': step, 'status': step, 'description': desc,
           'actionTaken': 'Automatic attendance monitor (Deputy)', 'followUpDate': '',
           'reportedBy': 'Attendance monitor', 'auto': True}
    try: db.add_violation_record(m['store'], rec)
    except Exception: pass
    icon = {'Verbal Discussion': '🟠', 'Written Warning': '🔴', 'Final Warning': '⛔', 'Termination Referral': '🚫'}.get(step, '🟠')
    subj = '%s Late clock-in — %d min · %s' % (icon, late, step)
    body_html = ('<p>You clocked in <b>%d minutes late</b>%s%s%s%s.</p>'
                 '<p>This is lateness <b>#%d</b> in the last 6 months → <b>%s</b>.</p>'
                 '<p>Reference %s · Please speak with your manager — if they accept your reason they will remove the violation. This is a formal record.</p>'
                 % (late, (' at <b>' + at_hm + '</b>') if at_hm else '',
                    (' (rostered ' + sched_hm + ')') if sched_hm else '',
                    (' · Location: <b>' + esc_html(loc_name) + '</b>') if loc_name else '',
                    (' · Deputy department: <b>' + esc_html(dept_name) + '</b>') if dept_name else '',
                    nth, step, rec['id']))
    au = {'role': 'super', 'store_id': None, 'staff_id': None, 'staff_name': '⏱ Attendance'}
    try:
        db.send_message(au, m['store'], 'violation', subj, body_html, to_staff_id=m['id'], to_super=True, to_managers=False)
        db.send_message(au, m['store'], 'message',
                        '⏱ %s — %s (late %dm, lateness #%d)' % (m.get('name') or '', step, late, nth),
                        body_html, to_managers=True, to_super=True)
    except Exception: pass
    email = str(m.get('email') or '').strip()
    if email and '@' in email:
        html = ('<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto">'
                '<div style="background:linear-gradient(135deg,#0e9f6e,#0891b2);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">'
                '<b style="font-size:17px">MCQ Supermarket</b><div style="font-size:12px;opacity:.9">Attendance notice · %s</div></div>'
                '<div style="border:1px solid #e5e7eb;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.65;color:#334155">'
                '<p>Dear %s,</p>%s<p style="color:#64748b;font-size:12px">Sent automatically from the MCQ attendance monitor (Deputy clock-in data). Do not reply.</p></div></div>'
                % (m['store'], m.get('name') or 'team member', body_html))
        try: _brevo_send([{'email': email, 'name': m.get('name') or email}],
                         'MCQ %s · Late clock-in — %s' % (m['store'], step), html)
        except Exception: pass
    return rec['id']

def _deputy_over_reminder(m, ev, dept_name='', loc_name=''):
    """Clocked out PAST the rostered finish → a personalised inbox REMINDER (deliberately
    NOT a violation — Khoi's rule: only late clock-ins go on the record)."""
    over = ev.get('over_min') or 0
    out_hm = _fmt_hm(ev.get('actual_end')) if ev.get('actual_end') else ''
    end_hm = _fmt_hm(ev.get('scheduled_end')) if ev.get('scheduled_end') else ''
    subj = '⏰ Reminder — clocked out %d min past your rostered finish' % over
    body_html = ('<p>Hi %s — you clocked out <b>%d minutes past</b> your rostered finish%s%s%s%s.</p>'
                 '<p>This is a <b>friendly reminder only</b> (not a violation). Please try to finish on time, '
                 'or check with your manager if extra time was needed.</p>'
                 % (esc_html(m.get('name') or ''), over,
                    (' at <b>' + out_hm + '</b>') if out_hm else '',
                    (' (rostered ' + end_hm + ')') if end_hm else '',
                    (' · Location: <b>' + esc_html(loc_name) + '</b>') if loc_name else '',
                    (' · Deputy department: <b>' + esc_html(dept_name) + '</b>') if dept_name else ''))
    au = {'role': 'super', 'store_id': None, 'staff_id': None, 'staff_name': '⏱ Attendance'}
    try:
        db.send_message(au, m['store'], 'message', subj, body_html, to_staff_id=m['id'], to_super=False, to_managers=False)
    except Exception: pass

def esc_html(s):
    return str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ---------- Deputy POLLING (no webhook needed): cron-job.org hits this every ~10 min ----------
_dep_emp_cache = {}
def _deputy_get(host, token, path):
    req = urllib.request.Request(host + path, headers={'Authorization': 'OAuth ' + token, 'Accept': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=15, context=_TLS).read().decode())

def _deputy_employee_email(host, token, emp_id):
    """Employee email, cached. Deputy keeps it on Employee or on the linked Contact record."""
    key = str(emp_id)
    if key in _dep_emp_cache: return _dep_emp_cache[key]
    email = ''; name = ''
    try:
        e = _deputy_get(host, token, '/api/v1/resource/Employee/' + key)
        name = str(e.get('DisplayName') or e.get('FirstName', '') or '')
        for f in ('Email', 'EmailAddress'):
            if e.get(f): email = str(e[f]); break
        if not email and e.get('Contact'):
            c = _deputy_get(host, token, '/api/v1/resource/Contact/' + str(e['Contact']))
            for f in ('Email', 'Email1', 'Email2'):
                if c.get(f): email = str(c[f]); break
    except Exception:
        pass
    _dep_emp_cache[key] = (email, name)
    return email, name

def _deputy_poll():
    """Pull today's Deputy timesheets and run every NEW clock-in through the lateness
    pipeline. Only Deputy employees whose gmail (or exact name) exists in MCQ Staff
    Members are processed — everyone else is skipped, per store isolation."""
    host, token = db.deputy_cfg()
    if not host or not token:
        return {'error': 'Deputy not configured — POST /api/deputy/config {host, token} as Super', 'processed': 0}
    today = db.now()[:10]
    q = {'search': {'d': {'field': 'Date', 'type': 'eq', 'data': today}},
         'join': ['OperationalUnitObject'], 'max': 500}
    req = urllib.request.Request(host + '/api/v1/resource/Timesheet/QUERY',
                                 data=json.dumps(q).encode(),
                                 headers={'Authorization': 'OAuth ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
                                 method='POST')
    rows = json.loads(urllib.request.urlopen(req, timeout=25, context=_TLS).read().decode())
    if not isinstance(rows, list):
        return {'error': 'unexpected Deputy response', 'processed': 0}
    seen = skipped = late_n = over_n = processed = 0
    for t in rows:
        if not isinstance(t, dict): continue
        ts_id = str(t.get('Id') or '')
        actual_start = db._to_epoch(t.get('StartTime'))
        actual_end = db._to_epoch(t.get('EndTime'))
        if not ts_id or not actual_start: continue
        need_in = not db.attendance_seen(ts_id, 'clockin')
        need_out = bool(actual_end) and not db.attendance_seen(ts_id, 'clockout')
        if not need_in and not need_out: seen += 1; continue
        email, dep_name = _deputy_employee_email(host, token, t.get('Employee'))
        ou = t.get('OperationalUnitObject') if isinstance(t.get('OperationalUnitObject'), dict) else {}
        dept_name = str(ou.get('OperationalUnitName') or '')
        loc_name = str(ou.get('CompanyName') or '')   # Deputy location, e.g. "MCQ Supermarket Armadale"
        m = db._match_staff_for_deputy(email, dep_name, t.get('Employee'))
        if not m or not m.get('id'): skipped += 1; continue   # gmail not in MCQ → not ours to notify
        sched_start = sched_end = None
        if t.get('Roster'):
            try:
                ro = _deputy_get(host, token, '/api/v1/resource/Roster/' + str(t['Roster']))
                sched_start = db._to_epoch(ro.get('StartTime')); sched_end = db._to_epoch(ro.get('EndTime'))
            except Exception: pass
        if need_in:
            late = max(0, round((actual_start - sched_start) / 60)) if sched_start else 0
            ev = {'ts_id': ts_id, 'event': 'clockin', 'store_id': m['store'], 'staff_id': m['id'],
                  'staff_name': m['name'], 'deputy_employee': str(t.get('Employee') or ''),
                  'scheduled_start': sched_start, 'actual_start': actual_start,
                  'scheduled_end': sched_end, 'actual_end': None, 'late_min': late, 'over_min': 0}
            res = db.record_attendance(ev)
            processed += 1
            if res['late_min'] > db.LATE_GRACE_MIN:
                late_n += 1
                try: _deputy_late_effects(m, ev, res, dept_name=dept_name, loc_name=loc_name)
                except Exception: pass
        if need_out:
            over = max(0, round((actual_end - sched_end) / 60)) if sched_end else 0
            ev = {'ts_id': ts_id, 'event': 'clockout', 'store_id': m['store'], 'staff_id': m['id'],
                  'staff_name': m['name'], 'deputy_employee': str(t.get('Employee') or ''),
                  'scheduled_start': sched_start, 'actual_start': actual_start,
                  'scheduled_end': sched_end, 'actual_end': actual_end, 'late_min': 0, 'over_min': over}
            db.record_attendance(ev)
            processed += 1
            if over > db.LATE_GRACE_MIN:   # a friendly REMINDER only — clocking out late is NOT a violation
                over_n += 1
                try: _deputy_over_reminder(m, ev, dept_name=dept_name, loc_name=loc_name)
                except Exception: pass
    return {'processed': processed, 'late': late_n, 'overtime_reminders': over_n,
            'already_seen': seen, 'skipped_unmatched': skipped, 'timesheets': len(rows), 'date': today}

@api.route('/api/cron/deputy-late', methods=['GET', 'POST'])
def cron_deputy_late():
    secret = os.environ.get('CRON_SECRET', '')
    if not secret or (request.args.get('key') or '') != secret:
        abort(403)
    try:
        return jsonify(ok=True, **_deputy_poll())
    except Exception as e:
        return jsonify(ok=False, error=str(e)[:300]), 500

@api.route('/api/deputy/status', methods=['GET'])
def deputy_status():
    """Deputy attendance monitor health + today's numbers. Super sees every store (plus a
    per-store breakdown, optionally ?store=X); a store Manager sees ONLY their own store."""
    au = require_auth()
    if au['role'] not in ('super', 'admin'): abort(403)
    host, token = db.deputy_cfg()
    last = db.get_setting('deputy_poll_slot')
    today = db.now()[:10]
    store = au.get('store_id') if au['role'] == 'admin' else (request.args.get('store') or None)
    if store and store not in db.STORES: store = None
    conn = db.connect()
    if store:
        rows = conn.execute("SELECT event,warning,over_min,store_id FROM attendance WHERE created_at LIKE ? AND store_id=?",
                            (today + '%', store)).fetchall()
    else:
        rows = conn.execute("SELECT event,warning,over_min,store_id FROM attendance WHERE created_at LIKE ?",
                            (today + '%',)).fetchall()
    conn.close()
    per = {}
    clockins = late = overs = 0
    for r in rows:
        s = r['store_id'] or '—'
        d = per.setdefault(s, {'clockins': 0, 'late': 0, 'over': 0})
        if r['event'] == 'clockin':
            clockins += 1; d['clockins'] += 1
            if (r['warning'] or ''): late += 1; d['late'] += 1
        elif r['event'] == 'clockout' and (r['over_min'] or 0) > db.LATE_GRACE_MIN:
            overs += 1; d['over'] += 1
    last_hm = _fmt_hm(float(last)) if last else None
    return jsonify(ok=True, configured=bool(host and token),
                   host=(host or None) if au['role'] == 'super' else None,
                   last_poll=last_hm, store=store,
                   clockins_today=clockins, late_today=late, overtime_today=overs,
                   stores=(per if au['role'] == 'super' and not store else None),
                   self_polling=not bool(os.environ.get('MCQ_NO_BG_POLL')))

@api.route('/api/deputy/config', methods=['POST'])
def deputy_config():
    """Super only: store the Deputy install URL + permanent token in the settings table
    (never in the repo). Validates the pair with a live /api/v1/me call."""
    au = require_auth()
    if au['role'] != 'super': abort(403)
    d = request.get_json(force=True, silent=True) or {}
    host = str(d.get('host') or '').strip().rstrip('/')
    token = str(d.get('token') or '').strip()
    if host and not host.startswith('http'): host = 'https://' + host
    if not host or not token: return jsonify(ok=False, error='host and token required'), 400
    try:
        me = _deputy_get(host, token, '/api/v1/me')
        who = str((me or {}).get('Name') or (me or {}).get('Login') or 'ok')
    except Exception as e:
        return jsonify(ok=False, error='Deputy rejected the host/token: ' + str(e)[:200]), 400
    db.set_setting('deputy_host', host)
    db.set_setting('deputy_token', token)
    db.write_audit(uid(au), 'ALL', 'save', 'deputy_config', host, None, {'who': who})
    return jsonify(ok=True, host=host, connected_as=who)

@api.route('/api/attendance/<store_id>/<staff_id>', methods=['GET'])
def attendance_view(store_id, staff_id):
    au = require_auth(); require_store(au, store_id)
    if au['role'] not in ('super', 'admin', 'staff') and str(au.get('staff_id') or '') != str(staff_id): abort(403)
    return jsonify(ok=True, stats=db.attendance_stats(store_id, staff_id))

# ---------- Face ID / passkey device credentials ----------
@api.route('/api/device/enroll', methods=['POST'])
def device_enroll():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    if not d.get('cred_id'): abort(400)
    res = db.enroll_device(au, d.get('cred_id'), d.get('label'))
    db.write_audit(uid(au), au.get('store_id') or '', 'enroll', 'device', res['device_id'], None, {'label': d.get('label')})
    return jsonify(ok=True, **res)

@api.route('/api/device/login', methods=['POST'])
def device_login():
    d = request.get_json(force=True, silent=True) or {}
    res = db.device_login(d.get('device_id'), d.get('secret'))
    if not res:
        time.sleep(0.8)   # slow down guessing
        return jsonify(ok=False, error='Face ID sign-in failed — please re-enrol on this device'), 401
    role, store, meta = res
    tok = db.issue_token(role, store, meta.get('staff_id'), meta.get('staff_name'), meta.get('account_id'))
    return jsonify(ok=True, token=tok, role=role, store=store, home_store=meta.get('home_store'),
                   staff_id=meta.get('staff_id'), staff_name=meta.get('staff_name'),
                   account_id=meta.get('account_id'), needs_profile=bool(meta.get('needs_profile')),
                   acct_admin=db.is_account_admin({'account_id': meta.get('account_id')}) if meta.get('account_id') else False,
                   stores=db.STORES if role in ('super', 'ba') else [store])

@api.route('/api/device/revoke', methods=['POST'])
def device_revoke():
    au = require_auth()
    d = request.get_json(force=True, silent=True) or {}
    ok = db.revoke_device(au, d.get('device_id'))
    if ok: db.write_audit(uid(au), au.get('store_id') or '', 'revoke', 'device', str(d.get('device_id')), None, None)
    return jsonify(ok=ok)

# ---------- account activation (Gmail must match the store's staff directory) ----------
@api.route('/api/activate/lookup', methods=['POST'])
def activate_lookup():
    d = request.get_json(force=True, silent=True) or {}
    if not d.get('email'): abort(400)
    return jsonify(ok=True, **db.activate_lookup(d.get('email')))

def _welcome_email_html(name, aid, password, access, store, app_url):
    first = (str(name or '').split(' ') or [''])[0].title() or 'there'
    chip = ('<span style="display:inline-block;background:#e7f7f0;color:#0e7a56;border:1px solid #b6ecd6;'
            'border-radius:999px;padding:4px 14px;font-weight:700;font-size:13px;margin:2px">%s</span>')
    chips = chip % ('🔑 ' + (access or 'Staff')) + ((chip % ('🏪 MCQ ' + store)) if store else '')
    return ('<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1f2937">'
            '<div style="background:linear-gradient(135deg,#f97316,#f59e0b);color:#fff;padding:26px 26px 22px;border-radius:16px 16px 0 0">'
            '<div style="font-size:20px;font-weight:800;letter-spacing:.02em">MCQ Supermarket</div>'
            '<div style="opacity:.92;font-size:14px;margin-top:3px">Your account is ready 🎉</div></div>'
            '<div style="border:1px solid #f1e3d4;border-top:none;border-radius:0 0 16px 16px;padding:26px;background:#fffdfa">'
            '<p style="font-size:15px;margin:0 0 6px"><b>Hi %s,</b> welcome aboard! 👋</p>'
            '<p style="color:#57534e;font-size:13.5px;margin:0 0 18px">Your MCQ Supermarket account has been activated. '
            'Here are your sign-in details — keep this email safe.</p>'
            '<div style="background:#fff7ed;border:1.6px dashed #fdba74;border-radius:14px;padding:18px;text-align:center;margin-bottom:10px">'
            '<div style="font-size:10px;font-weight:800;letter-spacing:.16em;color:#c2570f;text-transform:uppercase">Your ID</div>'
            '<div style="font-family:ui-monospace,Menlo,monospace;font-size:38px;font-weight:800;letter-spacing:.3em;color:#7c2d12;text-indent:.3em">%s</div></div>'
            '<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:12px 16px;margin-bottom:14px">'
            '<span style="color:#78716c;font-size:12.5px;font-weight:700;margin-right:10px">PASSWORD</span>'
            '<span style="font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;color:#1c1917">%s</span></div>'
            '<div style="text-align:center;margin-bottom:18px">%s</div>'
            '<a href="%s" style="display:block;text-align:center;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;'
            'text-decoration:none;font-weight:800;font-size:15px;padding:13px;border-radius:12px">Open the app →</a>'
            '<p style="color:#a8a29e;font-size:11.5px;margin:16px 0 0;text-align:center">Sign in with your ID + password. '
            'Keep this email private — anyone with these details can access your account.</p></div></div>'
            % (first, aid, password, chips, app_url))

@api.route('/api/activate', methods=['POST'])
def activate():
    d = request.get_json(force=True, silent=True) or {}
    if not d.get('email'): abort(400)
    res = db.activate_account(d.get('email'), password=d.get('password'))
    if res.get('error'):
        return jsonify(ok=False, error=res['error']), 400
    db.write_audit('activation', res.get('store') or '', 'create', 'account', res.get('id'), None, {'matched': res.get('matched')})
    # email the credentials to the person (nice to have — never blocks activation)
    emailed = False
    try:
        app_url = (request.url_root or '').rstrip('/') or 'https://mcq-supermarket.onrender.com'
        ok, _ = _brevo_send([{'email': d.get('email'), 'name': res.get('name') or d.get('email')}],
                            '🎉 Your MCQ Supermarket account — ID ' + str(res.get('id')),
                            _welcome_email_html(res.get('name'), res.get('id'), d.get('password'),
                                                res.get('tab'), res.get('store'), app_url))
        emailed = bool(ok)
    except Exception:
        pass
    return jsonify(ok=True, emailed=emailed, **res)

# ---------- central account management (account admin — Khoi Nguyen — only) ----------
def require_acct_admin():
    au = require_auth()
    if not db.is_account_admin(au): abort(403)
    return au

@api.route('/api/accounts', methods=['GET'])
def accounts_list():
    require_acct_admin()
    return jsonify(ok=True, accounts=db.list_accounts(request.args.get('q', '')))

@api.route('/api/dept-leads/<store_id>')
def dept_leads(store_id):
    au = require_auth(); require_store(au, store_id)
    return jsonify(ok=True, leads=db.get_dept_leads(store_id))

@api.route('/api/dept-lead/remove', methods=['POST'])
def dept_lead_remove():
    au = require_acct_admin()
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store'); require_store(au, store)
    res = db.remove_dept_lead(store, d.get('department'), d.get('email'))
    if res.get('error'):
        return jsonify(ok=False, error=res['error']), 400
    db.write_audit(uid(au), store, 'remove', 'dept-lead', res.get('id') or res.get('email'), None,
                   {'email': res.get('email'), 'department': res.get('department')})
    return jsonify(ok=True, **res)

@api.route('/api/checklist/submit', methods=['POST'])
def checklist_submit():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    sub = d.get('sub') or {}
    store = (sub.get('store') if au['role'] in ('super', 'ba') else au['store_id']) or au['store_id']
    if store not in db.STORES: abort(400)
    require_store(au, store)
    sub['store'] = store
    sid = db.save_checklist_submission(store, sub)
    if not sid: abort(400)
    dept = sub.get('dept') or sub.get('department')
    verified = str(sub.get('status') or '').strip().lower() == 'verified' or sub.get('verifiedBy')
    if verified:
        db.write_audit(uid(au), store, 'verify', 'checklist', sid, None,
                       {'dept': dept, 'session': sub.get('session'), 'by': sub.get('verifiedBy'), 'result': sub.get('overallResult')})
    else:
        db.write_audit(uid(au), store, 'submit', 'checklist', sid, None,
                       {'dept': dept, 'session': sub.get('session'), 'progress': sub.get('progress'), 'by': sub.get('by')})
    return jsonify(ok=True, id=sid)

@api.route('/api/staff/import', methods=['POST'])
def staff_import():
    au = require_auth(); require_write(au)
    if au['role'] not in ('super', 'admin'): abort(403)   # Super any store; Manager own store only
    d = request.get_json(force=True, silent=True) or {}
    rows = d.get('rows') or []
    allowed = None if au['role'] == 'super' else [au['store_id']]
    res = db.bulk_import_staff(rows, allowed_stores=allowed)
    db.write_audit(uid(au), au.get('store_id') or 'ALL', 'import', 'staff', 'csv', None,
                   {'added': len(res['added']), 'skipped': len(res['skipped']), 'errors': len(res['errors'])})
    return jsonify(ok=True, **res)

@api.route('/api/account/create', methods=['POST'])
def account_create():
    au = require_acct_admin()
    d = request.get_json(force=True, silent=True) or {}
    res = db.add_account(d.get('email'), d.get('name'), d.get('role'), d.get('store'), d.get('department'))
    if res.get('error'):
        return jsonify(ok=False, error=res['error']), 400
    db.write_audit(uid(au), d.get('store') or '', 'create', 'account', res.get('id'), None, {'email': d.get('email'), 'role': d.get('role')})
    return jsonify(ok=True, **res)

@api.route('/api/account/update', methods=['POST'])
def account_update():
    au = require_acct_admin()
    d = request.get_json(force=True, silent=True) or {}
    ok = db.update_account(d.get('id'), d.get('patch') or {})
    if isinstance(ok, dict) and ok.get('error'):
        return jsonify(ok=False, error=ok['error']), 400
    db.write_audit(who(au), '', 'update', 'account', str(d.get('id')), None, {'fields': list((d.get('patch') or {}).keys())})
    return jsonify(ok=bool(ok))

@api.route('/api/account/delete', methods=['POST'])
def account_delete():
    au = require_acct_admin()
    d = request.get_json(force=True, silent=True) or {}
    db.delete_account(d.get('id'))
    db.write_audit(uid(au), '', 'delete', 'account', str(d.get('id')), None, None)
    return jsonify(ok=True)

@api.route('/api/accounts/staff-sync', methods=['POST'])
def accounts_staff_sync():
    """Super only. mode='audit' → per-store report of Account↔Staff mismatches (read-only);
    mode='fix' → create/relink the missing staff profiles and return what was fixed."""
    au = require_auth()
    if au['role'] != 'super': abort(403)
    d = request.get_json(force=True, silent=True) or {}
    fix = (str(d.get('mode') or 'audit').lower() == 'fix')
    only = d.get('only') if isinstance(d.get('only'), list) else None
    res = db.staff_sync(fix=fix, only=only)
    if fix:
        db.write_audit(uid(au), 'ALL', 'sync', 'staff', 'accounts-staff-sync', None,
                       {'fixed': len(res.get('fixed') or []), 'only': only})
    return jsonify(ok=True, mode='fix' if fix else 'audit', **res)

@api.route('/api/account/password', methods=['POST'])
def account_password():
    au = require_auth()
    d = request.get_json(force=True, silent=True) or {}
    ok = db.set_own_password(au, d.get('password'))
    return (jsonify(ok=True) if ok else (jsonify(ok=False, error='Password must be at least 6 characters'), 400))

@api.route('/api/activation-status/<store_id>', methods=['GET'])
def activation_status(store_id):
    au = require_auth(); require_store(au, store_id)
    if au['role'] not in ('super', 'admin', 'staff'): abort(403)
    return jsonify(ok=True, status=db.activation_status(store_id))

# ---------- staff accounts (Manager/Super create & view individual employee logins) ----------
@api.route('/api/staff-account', methods=['POST'])
def staff_account():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store'); require_store(au, store)
    acct = db.create_staff_account(store, d.get('staff_id'), d.get('name'), reset=bool(d.get('reset')))
    if not acct: abort(400)
    db.write_audit(uid(au), store, 'account', 'staff', str(d.get('staff_id')), None, {'reset': bool(d.get('reset'))})
    return jsonify(ok=True, account=acct)

@api.route('/api/staff-accounts/<store_id>', methods=['GET'])
def staff_accounts(store_id):
    au = require_auth(); require_store(au, store_id)
    if au['role'] not in ('super', 'admin'): abort(403)
    return jsonify(ok=True, accounts=db.get_staff_accounts(store_id))

@api.route('/api/staff-account/delete', methods=['POST'])
def staff_account_delete():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store'); require_store(au, store)
    db.delete_staff_account(store, d.get('staff_id'))
    return jsonify(ok=True)

@api.route('/api/staff-profile', methods=['POST'])
def staff_profile():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store'); require_store(au, store)
    sid = str(d.get('staff_id') or '')
    if not sid: abort(400)
    # employees & dept leads may only edit their OWN row; Manager/Super may edit anyone in their store
    if au['role'] in ('employee', 'staff') and str(au.get('staff_id') or '') != sid: abort(403)
    if au['role'] not in ('employee', 'staff', 'admin', 'super'): abort(403)
    patch = d.get('patch') or {}
    cur = db.update_staff_profile(store, sid, patch)
    if isinstance(cur, dict) and set(cur.keys()) == {'error'}:   # e.g. duplicate email in this store
        return jsonify(ok=False, error=cur['error']), 400
    db.write_audit(uid(au), store, 'profile', 'staff', sid, None, {'fields': list(patch.keys()) if isinstance(patch, dict) else []})
    return jsonify(ok=True, staff=cur)

# ---------- inbox / messaging ----------
# who may originate each kind of message
_MSG_ALLOWED = {
    'employee': {'feedback', 'issue', 'reply', 'message'},
    'staff':    {'feedback', 'issue', 'reply', 'message'},
    'admin':    {'feedback', 'issue', 'reply', 'document', 'violation', 'message'},
    'super':    {'feedback', 'issue', 'reply', 'document', 'violation', 'announcement', 'message'},
}

@api.route('/api/my-password', methods=['GET'])
def my_password():
    au = require_auth()
    info = db.get_my_password(au) or {}
    return jsonify(ok=True, password=info.get('password'), account=info or None)
@api.route('/api/message', methods=['POST'])
def message_send():
    au = require_auth(); require_write(au)   # Chú Ba (ba) can't send
    d = request.get_json(force=True, silent=True) or {}
    role = au['role']; kind = d.get('kind') or 'document'
    # store is pinned to the caller's own store; only Super may target another store —
    # except a 'message' (question), which may be aimed at another store's management mailbox
    store = d.get('store') if role == 'super' else au['store_id']
    if not store: store = au['store_id']
    if kind == 'reply' and d.get('thread_id') and db.thread_store(d.get('thread_id')):
        # a reply belongs to its THREAD's store (Super has no store of its own, and a sender
        # replying in a cross-store thread must land in that thread, not their home store).
        # Access rule: you may only reply to a thread you can actually see.
        if not db.thread_messages(au, d.get('thread_id')): abort(403)
        store = db.thread_store(d.get('thread_id'))
    elif kind == 'message' and role != 'super' and d.get('store') and d.get('store') != store:
        # deliberate cross-store question — mailbox delivery only, never a broadcast
        if d.get('store') not in db.STORES: abort(404)
        store = d.get('store'); d['to_store_all'] = False
    else:
        require_store(au, store)
    if kind not in _MSG_ALLOWED.get(role, set()): abort(403)
    res = db.send_message(au, store, kind, d.get('subject'), d.get('body_html'),
                          to_staff_id=d.get('to_staff_id'), to_store_all=bool(d.get('to_store_all')),
                          thread_id=d.get('thread_id'), to_super=d.get('to_super'), to_managers=d.get('to_managers'),
                          attachments=d.get('attachments'))
    return jsonify(ok=True, **res)

@api.route('/api/messages', methods=['GET'])
def messages_list():
    au = require_auth()
    return jsonify(ok=True, **db.list_messages(au))

@api.route('/api/messages/unread', methods=['GET'])
def messages_unread():
    au = require_auth()
    return jsonify(ok=True, unread=db.unread_count(au))

@api.route('/api/cleanup', methods=['POST'])
def cleanup():
    au = require_auth(); require_write(au)
    if au['role'] not in ('super', 'admin'): abort(403)
    d = request.get_json(force=True, silent=True) or {}
    before = str(d.get('before') or '')[:10]
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', before): abort(400)
    kinds = [k for k in (d.get('kinds') or []) if k in ('photos', 'checklistSubs', 'scheduleHistory', 'binRecords')]
    if not kinds: abort(400)
    stores = db.STORES if (au['role'] == 'super' and d.get('store') in (None, '', 'ALL')) else [d.get('store') or au['store_id']]
    total = {}
    for s in stores:
        if s not in db.STORES: continue
        require_store(au, s)
        for k, n in db.cleanup_old(s, before, kinds).items():
            total[k] = total.get(k, 0) + n
    db.write_audit(uid(au), ','.join(stores), 'cleanup', 'data', before, None, total)
    return jsonify(ok=True, deleted=total)

@api.route('/api/message/delete', methods=['POST'])
def message_delete():
    au = require_auth(); require_write(au)
    if au['role'] not in ('super', 'admin', 'staff'): abort(403)   # employees cannot delete inbox messages
    d = request.get_json(force=True, silent=True) or {}
    ok = db.delete_message(au, d.get('id'))
    if ok: db.write_audit(uid(au), au.get('store_id') or '', 'delete', 'message', str(d.get('id')), None, None)
    return jsonify(ok=ok)

@api.route('/api/message/read', methods=['POST'])
def message_read():
    au = require_auth()
    d = request.get_json(force=True, silent=True) or {}
    db.mark_message_read(au, d.get('id'))
    return jsonify(ok=True, unread=db.unread_count(au))

@api.route('/api/thread/<thread_id>', methods=['GET'])
def thread_view(thread_id):
    au = require_auth()
    return jsonify(ok=True, messages=db.thread_messages(au, thread_id))

# ---------- announcements ----------
@api.route('/api/announcements', methods=['GET'])
def announcements_list():
    au = require_auth()
    return jsonify(ok=True, announcements=db.list_announcements(au))

@api.route('/api/announcement', methods=['POST'])
def announcement_post():
    au = require_auth(); require_write(au)
    if au['role'] not in ('super', 'admin', 'staff'): abort(403)   # Super + Manager + Dept Lead post; employees read-only
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store') or au['store_id']
    if store == 'ALL':
        if au['role'] != 'super': abort(403)              # only Super posts to ALL stores
    else:
        require_store(au, store)                           # Manager pinned to own store
    aid = db.post_announcement(au, store, d.get('title'), d.get('body_html'), d.get('image_id'), d.get('department'), d.get('attachments'))
    db.write_audit(uid(au), store, 'post', 'announcement', str(aid), None, {'title': d.get('title')})
    db.emit_event('announcements')
    return jsonify(ok=True, id=aid)

@api.route('/api/announcement/update', methods=['POST'])
def announcement_update():
    au = require_auth(); require_write(au)
    if au['role'] not in ('super', 'admin', 'staff'): abort(403)
    d = request.get_json(force=True, silent=True) or {}
    ok = db.update_announcement(au, d.get('id'), d.get('title'), d.get('body_html'), d.get('image_id'), d.get('attachments'), d.get('department'), d.get('store'))
    if ok:
        db.write_audit(uid(au), au.get('store_id') or '', 'update', 'announcement', str(d.get('id')), None, {'title': d.get('title')})
        db.emit_event('announcements')
    return jsonify(ok=ok)

@api.route('/api/announcement/delete', methods=['POST'])
def announcement_delete():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    ok = db.delete_announcement(au, d.get('id'))
    if not ok: abort(403)
    db.emit_event('announcements')
    return jsonify(ok=True)

@api.route('/api/announcement/pin', methods=['POST'])
def announcement_pin():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    ok = db.set_announcement_pin(au, d.get('id'), bool(d.get('pinned')))
    if not ok: abort(403)
    db.emit_event('announcements')
    return jsonify(ok=True)

@api.route('/api/announcement/read', methods=['POST'])
def announcement_read():
    au = require_auth()   # any signed-in reader may acknowledge (Chú Ba read-only is fine here)
    d = request.get_json(force=True, silent=True) or {}
    ok = db.mark_announcement_read(au, d.get('id'))
    return jsonify(ok=bool(ok))

# ---------- store list / summary ----------
@api.route('/api/stores')
def stores():
    au = require_auth()
    conn = db.connect()
    rows = conn.execute('SELECT store_id, length(state_json) AS bytes, updated_at FROM store_state').fetchall()
    conn.close()
    by = {r['store_id']: {'bytes': r['bytes'] or 0, 'updated_at': r['updated_at']} for r in rows}
    visible = db.STORES if au['role'] in ('super', 'ba') else [au['store_id']]
    return jsonify(ok=True, stores=[
        {'id': s, 'name': s, 'bytes': by.get(s, {}).get('bytes', 0),
         'updated_at': by.get(s, {}).get('updated_at')} for s in visible])

# ---------- per-store state (records/subs/history normalized into tables; lean blob keeps the rest) ----------
@api.route('/api/state/<store_id>', methods=['GET'])
def get_state(store_id):
    au = require_auth(); require_store(au, store_id)
    state = db.load_state(store_id)
    return jsonify(ok=True, store=store_id, state=state, updated_at=db.state_updated_at(store_id))

@api.route('/api/state/<store_id>', methods=['POST'])
def post_state(store_id):
    au = require_auth(); require_write(au); require_store(au, store_id)
    d = request.get_json(force=True, silent=True) or {}
    state = d.get('state', d)
    if isinstance(state, dict):
        state['store'] = store_id    # a client can never write another store's id
    bytes_saved = db.save_state(store_id, state, who(au), client=d.get('client'))
    # (no audit row for routine saves — every autosave would flood the log; meaningful
    #  events like task add/remove and submit/verify are audited on their own paths)
    return jsonify(ok=True, store=store_id, bytes=bytes_saved, updated_at=db.now())

# ---------- store config ----------
@api.route('/api/store-config/<store_id>', methods=['GET'])
def get_config(store_id):
    """Store Config shows the store's LIVE workspace in real time — the same checklist
    template / staff / schedule the store is using right now (from its state blob),
    not a separate copy."""
    au = require_auth(); require_store(au, store_id)
    state = db.load_state(store_id) or {}
    items = state.get('checklistItems')
    if isinstance(items, str):
        try: items = json.loads(items)
        except Exception: items = []
    sched = state.get('scheduleTasks')
    if isinstance(sched, str):
        try: sched = json.loads(sched)
        except Exception: sched = []
    cfg = {'store': store_id,
           'staff': state.get('staff') or [],
           'checklistItems': items if isinstance(items, list) else [],
           'scheduleTasks': sched if isinstance(sched, list) else [],
           'auditLogs': (state.get('auditLogs') or [])[:50]}
    return jsonify(ok=True, store=store_id, config=cfg)

@api.route('/api/store-config/<store_id>', methods=['POST'])
def post_config(store_id):
    """Saving Store Config applies straight to the store's LIVE workspace (template
    version-bumped so every device at that store picks it up) — one store only."""
    au = require_auth(); require_write(au); require_store(au, store_id)
    d = request.get_json(force=True, silent=True) or {}
    cfg = d.get('config', d)
    # apply_store_config now writes per-task add/remove audit rows (traced to this person);
    # no coarse "saved config" row — the audit log only keeps meaningful events.
    res = db.apply_store_config(store_id, cfg if isinstance(cfg, dict) else {}, who(au))
    # keep a copy in store_config as a change-history trail
    conn = db.connect()
    conn.execute("""INSERT INTO store_config(store_id,config_json,updated_at) VALUES(?,?,?)
                    ON CONFLICT (store_id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at""",
                 (store_id, json.dumps(cfg), db.now()))
    conn.commit(); conn.close()
    return jsonify(ok=True, store=store_id, **res)

# ---------- message attachments (Gmail-style, 30 MB per file) ----------
MAX_FILE_BYTES = 30 * 1024 * 1024

@api.route('/api/file', methods=['POST'])
def post_file():
    au = require_auth(); require_write(au)
    f = request.files.get('file')
    if not f: abort(400)
    f.stream.seek(0, 2); size = f.stream.tell(); f.stream.seek(0)
    if size > MAX_FILE_BYTES:
        return jsonify(ok=False, error='File is larger than 30 MB'), 413
    store_id = au['store_id'] if au['role'] not in ('super', 'ba') else 'ALL'
    fid = 'f_' + time.strftime('%Y%m%d', time.gmtime(time.time() + 8 * 3600)) + '_' + secrets.token_hex(9)
    name = (f.filename or 'file').replace('/', '_').replace('\\', '_')[-120:]
    mime = f.mimetype or 'application/octet-stream'
    cloud = None; chunks = 0
    if cloudstore.ENABLED:
        data = f.read()
        # free-plan cap is 10MB/file: oversize images get recompressed, other oversize
        # files are split losslessly into parts and re-joined on download
        cloud, chunks, size, mime = cloudstore.put_file(fid, data, mime)
    else:
        folder = os.path.join(db.UPLOADS, '_files'); os.makedirs(folder, exist_ok=True)
        f.save(os.path.join(folder, fid + '.bin'))
    conn = db.connect()
    conn.execute('INSERT INTO files(id,store_id,name,mime,size,filename,created_at,cloud,chunks) VALUES(?,?,?,?,?,?,?,?,?)',
                 (fid, store_id, name, mime, size, fid + '.bin', db.now(), cloud, chunks))
    conn.commit(); conn.close()
    return jsonify(ok=True, id=fid, name=name, size=size, mime=mime)

@api.route('/api/file/<fid>', methods=['GET'])
def get_file(fid):
    au = require_auth()
    row = db.file_meta(fid)
    if not row: abort(404)
    if not db.can_download_file(au, fid): abort(403)
    cloud = row['cloud'] if 'cloud' in row.keys() else None
    if cloud and cloudstore.ENABLED:
        try: data = cloudstore.get_file(cloud, row['chunks'] if 'chunks' in row.keys() else 1)
        except Exception: abort(404)
        resp = Response(data, mimetype=row['mime'] or 'application/octet-stream')
        resp.headers['Content-Disposition'] = 'attachment; filename="%s"' % (row['name'] or 'file').replace('"', '')
    else:
        path = os.path.join(db.UPLOADS, '_files', row['filename'])
        if not os.path.isfile(path): abort(404)
        resp = send_file(path, mimetype=row['mime'] or 'application/octet-stream',
                         as_attachment=True, download_name=row['name'] or 'file')
    resp.headers['Cache-Control'] = 'private, max-age=31536000, immutable'   # ids are unique → cache hard
    return resp

# ---------- photos: files + metadata row ----------
@api.route('/api/photos', methods=['POST'])
def post_photo():
    au = require_auth(); require_write(au)
    store_id = request.form.get('store_id') or (au['store_id'] if au['role'] != 'super' else None)
    if not store_id or store_id not in db.STORES: abort(400)
    require_store(au, store_id)
    f = request.files.get('image')
    data_url = request.form.get('dataUrl')
    pid = request.form.get('id') or ('p_' + time.strftime('%Y%m%d', time.gmtime(time.time() + 8 * 3600)) + '_' + secrets.token_hex(5))
    pid = ''.join(c for c in pid if c.isalnum() or c in '_-')[:40] or ('p_' + secrets.token_hex(5))
    mime = 'image/jpeg'; ext = 'jpg'; data = None
    if f:
        mime = f.mimetype or mime; ext = (f.filename.rsplit('.', 1)[-1] if '.' in (f.filename or '') else 'jpg')[:5]
        data = f.read()
    elif data_url and ',' in data_url:
        import base64
        head, b64 = data_url.split(',', 1)
        if 'png' in head: mime, ext = 'image/png', 'png'
        data = base64.b64decode(b64)
    else:
        abort(400)
    cloud = None
    if cloudstore.ENABLED:
        cloud = cloudstore.put_photo(pid, data)
    else:
        folder = os.path.join(db.UPLOADS, db_safe(store_id)); os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, pid + '.' + ext), 'wb') as out: out.write(data)
    meta = {'area': request.form.get('area', ''), 'equipment': request.form.get('equipment', '')}
    conn = db.connect()
    conn.execute('INSERT INTO photos(id,store_id,filename,mime,meta_json,created_at,cloud) VALUES(?,?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET filename=excluded.filename, mime=excluded.mime, meta_json=excluded.meta_json, created_at=excluded.created_at, cloud=excluded.cloud',
                 (pid, store_id, pid + '.' + ext, mime, json.dumps(meta), db.now(), cloud))
    conn.commit(); conn.close()
    return jsonify(ok=True, id=pid)

@api.route('/api/photos/<photo_id>', methods=['GET'])
def get_photo(photo_id):
    au = require_auth()
    conn = db.connect()
    row = conn.execute('SELECT store_id,filename,mime,cloud FROM photos WHERE id=?', (photo_id,)).fetchone()
    allowed = False
    if row:
        allowed = db.can_access(au, row['store_id'])
        if not allowed:
            # a photo attached to an announcement is readable by that announcement's audience —
            # company-wide ('ALL') by everyone, a store post by that store's people.
            ann = conn.execute('SELECT store_id FROM announcements WHERE image_id=? LIMIT 1', (photo_id,)).fetchone()
            if ann and (ann['store_id'] == 'ALL' or db.can_access(au, ann['store_id'])):
                allowed = True
    conn.close()
    if not row: abort(404)
    if not allowed: abort(403)
    cloud = row['cloud'] if 'cloud' in row.keys() else None
    if cloud and cloudstore.ENABLED:
        try: data = cloudstore.get_photo(cloud)
        except Exception: abort(404)
        resp = Response(data, mimetype=row['mime'] or 'image/jpeg')
    else:
        path = os.path.join(db.UPLOADS, db_safe(row['store_id']), row['filename'])
        if not os.path.isfile(path): abort(404)
        resp = send_file(path, mimetype=row['mime'])
    resp.headers['Cache-Control'] = 'private, max-age=31536000, immutable'   # photo ids are unique → cache hard so images don't re-download
    return resp

@api.route('/api/audit/<store_id>', methods=['GET'])
def audit_trail(store_id):
    """Audit trail — a store Manager sees THEIR OWN store; Super sees any store or ALL.
    (Dept Leads / staff have no access.)"""
    au = require_auth()
    if au['role'] == 'admin':
        if store_id != (au.get('store_id') or ''): abort(403)   # manager locked to own store
    elif au['role'] != 'super':
        abort(403)
    limit = min(500, int(request.args.get('limit') or 300))
    return jsonify(ok=True, store=store_id, rows=db.list_audit(store_id, limit))

@api.route('/api/state-snapshots/<store_id>', methods=['GET'])
def state_snapshots(store_id):
    au = require_auth()
    if au['role'] != 'super': abort(403)
    conn = db.connect()
    rows = conn.execute("""SELECT id, created_at, created_by, length(state_json) AS bytes
                           FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 30""", (store_id,)).fetchall()
    conn.close()
    return jsonify(ok=True, store=store_id, snapshots=[{k: r[k] for k in r.keys()} for r in rows])

@api.route('/api/state-snapshot/<store_id>/<int:sid>', methods=['GET'])
def state_snapshot(store_id, sid):
    au = require_auth()
    if au['role'] != 'super': abort(403)
    conn = db.connect()
    row = conn.execute('SELECT state_json, created_at, created_by FROM store_state_snapshots WHERE store_id=? AND id=?', (store_id, sid)).fetchone()
    conn.close()
    if not row: abort(404)
    return jsonify(ok=True, store=store_id, created_at=row['created_at'], created_by=row['created_by'],
                   state=json.loads(row['state_json']))

# ---------- history (normalized rows + state snapshots + audit) ----------
@api.route('/api/history/<store_id>')
def history(store_id):
    au = require_auth(); require_store(au, store_id)
    conn = db.connect()
    snaps = conn.execute("""SELECT id, created_at, created_by, length(state_json) AS bytes
                            FROM store_state_snapshots WHERE store_id=? ORDER BY id DESC LIMIT 30""", (store_id,)).fetchall()
    sched = conn.execute("""SELECT data_json, created_at FROM schedule_history WHERE store_id=? ORDER BY id DESC LIMIT 50""", (store_id,)).fetchall()
    audits = conn.execute("""SELECT action, entity_type, entity_id, user_id, created_at
                             FROM audit_logs WHERE store_id=? ORDER BY id DESC LIMIT 30""", (store_id,)).fetchall()
    conn.close()
    return jsonify(ok=True, store=store_id, snapshots=[dict(r) for r in snaps],
                   scheduleHistory=[json.loads(r['data_json']) for r in sched if r['data_json']],
                   audit=[dict(a) for a in audits])

# ---------- audit log ----------
@api.route('/api/audit-log', methods=['POST'])
def audit_log():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store_id = d.get('store_id') or (au['store_id'] if au['role'] != 'super' else 'ALL')
    if au['role'] != 'super' and store_id != au['store_id']: abort(403)
    db.write_audit(uid(au), store_id, d.get('action', 'update'), d.get('entity_type', 'record'),
                   d.get('entity_id', ''), d.get('before_json'), d.get('after_json'))
    return jsonify(ok=True)

# ---------- explicit delete (save() now MERGES, so real deletes go through here) ----------
@api.route('/api/delete', methods=['POST'])
def delete_records():
    au = require_auth(); require_write(au)
    d = request.get_json(force=True, silent=True) or {}
    store = d.get('store_id'); require_store(au, store)
    table = d.get('table')
    if table not in ('records', 'staff', 'checklist_submissions', 'bin_records', 'schedule_history'):
        abort(400)
    idcol = 'rec_id' if table == 'schedule_history' else 'id'
    # scope: a specific store (admin or super), or ALL stores (super only)
    all_stores = (au['role'] == 'super' and store not in db.STORES)
    if not all_stores:
        require_store(au, store)
    scope = '' if all_stores else ' store_id=?'
    base = [] if all_stores else [store]
    conn = db.connect()
    try:
        if d.get('all'):
            conn.execute('DELETE FROM ' + table + (' WHERE' + scope if scope else ''), base)
        else:
            ids = [str(x) for x in (d.get('ids') or []) if x is not None]
            for chunk in [ids[i:i+400] for i in range(0, len(ids), 400)]:
                if not chunk: continue
                cond = (scope + ' AND' if scope else '') + ' ' + idcol + ' IN (' + ','.join('?'*len(chunk)) + ')'
                conn.execute('DELETE FROM ' + table + ' WHERE' + cond, base + chunk)
        conn.commit()
    finally:
        conn.close()
    db.write_audit(uid(au), store, 'delete', table, 'ALL' if d.get('all') else ','.join((d.get('ids') or [])[:5]), None, None)
    return jsonify(ok=True)

# ---------- settings (super-admin only): digest recipients, etc. ----------
@api.route('/api/settings', methods=['GET'])
def get_settings():
    au = require_auth()
    if au['role'] != 'super': abort(403)
    key = request.args.get('key') or ''
    if not key: abort(400)
    return jsonify(ok=True, key=key, value=db.get_setting(key, []))

@api.route('/api/settings', methods=['POST'])
def post_settings():
    au = require_auth()
    if au['role'] != 'super': abort(403)
    d = request.get_json(force=True, silent=True) or {}
    key = d.get('key') or ''
    if not key: abort(400)
    db.set_setting(key, d.get('value'))
    return jsonify(ok=True)

# ---- global "all-stores" notification recipients (one place, applies to every store) ----
# Read by EVERY signed-in device (a store's client needs it to know who also gets its alerts);
# only Super can change it. Fixes the slow per-store save and makes "receive from all stores" reliable.
@api.route('/api/notify-config', methods=['GET'])
def get_notify_config():
    require_auth()
    return jsonify(ok=True, config=db.get_setting('notify_all', {'recipients': []}))

@api.route('/api/notify-config', methods=['POST'])
def post_notify_config():
    au = require_auth()
    if au['role'] != 'super': abort(403)   # only Super manages the all-stores list
    d = request.get_json(force=True, silent=True) or {}
    cfg = d.get('config') or {}
    if not isinstance(cfg, dict) or not isinstance(cfg.get('recipients'), list): abort(400)
    # keep only clean recipient rows
    recips = [{'key': str(r.get('key') or ''), 'name': str(r.get('name') or ''), 'email': str(r.get('email') or ''),
               'issue': bool(r.get('issue')), 'vio': bool(r.get('vio')), 'checklist': bool(r.get('checklist'))}
              for r in cfg['recipients'] if isinstance(r, dict) and str(r.get('email') or '').strip()]
    db.set_setting('notify_all', {'recipients': recips})
    db.write_audit(uid(au), 'ALL', 'update', 'notify-config', 'all-stores', None, {'recipients': len(recips)})
    return jsonify(ok=True, config={'recipients': recips})

# ---------- email relay (Brevo) — API key stays on the SERVER, never in the frontend / repo ----------
def _brevo_send(recipients, subject, html, attachment=None, from_email=None, from_name=None):
    """Send an email via Brevo. `recipients` = [{email,name}]. Returns (ok, detail)."""
    key = os.environ.get('BREVO_API_KEY', '')
    to = [r for r in (recipients or []) if r.get('email')]
    if not to: return False, 'no recipients'
    if not key: return False, 'BREVO_API_KEY not set on the server'
    sender = {'email': from_email or os.environ.get('MCQ_FROM_EMAIL', 'mcqcafe.notify@gmail.com'),
              'name':  from_name  or os.environ.get('MCQ_FROM_NAME', 'MCQ Supermarket Notification')}
    payload = {'sender': sender,
               'to': [{'email': r['email'], 'name': r.get('name') or r['email']} for r in to],
               'subject': subject or 'MCQ Supermarket', 'htmlContent': html or ''}
    if isinstance(attachment, list) and attachment:
        payload['attachment'] = [{'content': a.get('content'), 'name': a.get('name') or 'attachment.pdf'}
                                 for a in attachment if a.get('content')]
    req = urllib.request.Request('https://api.brevo.com/v3/smtp/email',
        data=json.dumps(payload).encode('utf-8'),
        headers={'api-key': key, 'content-type': 'application/json', 'accept': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15, context=_TLS) as resp:
            return (200 <= resp.status < 300), 'sent'
    except urllib.error.HTTPError as e:
        return False, 'brevo ' + str(e.code) + ' ' + e.read().decode('utf-8', 'ignore')[:200]
    except Exception as e:
        return False, str(e)

@api.route('/api/send-email', methods=['POST'])
def send_email():
    require_write(require_auth())
    d = request.get_json(force=True, silent=True) or {}
    to = [r for r in (d.get('to') or []) if r.get('email')]
    if not to: return jsonify(ok=False, error='no recipients'), 400
    if not os.environ.get('BREVO_API_KEY', ''):
        return jsonify(ok=False, fallback=True, error='BREVO_API_KEY not set on the server'), 200
    html = d.get('html') or ('<pre style="font-family:Arial">' + (d.get('text') or '') + '</pre>')
    ok, detail = _brevo_send(to, d.get('subject'), html, attachment=d.get('attachment'),
                             from_email=d.get('fromEmail'), from_name=d.get('fromName'))
    if ok: return jsonify(ok=True, sent=len(to))
    return jsonify(ok=False, error=detail), 200

# ---------- forgot password: email a one-time code, then reset ----------
def _reset_email_html(name, code):
    first = (str(name or '').split(' ') or [''])[0] or 'there'
    return ('<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:auto">'
            '<div style="background:linear-gradient(135deg,#f97316,#f59e0b);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0">'
            '<b style="font-size:18px">MCQ Supermarket</b><div style="opacity:.9;font-size:13px">Password reset</div></div>'
            '<div style="border:1px solid #f1e3d4;border-top:none;border-radius:0 0 14px 14px;padding:22px">'
            '<p>Hi %s,</p><p>Use this code to reset your password. It expires in <b>15 minutes</b>.</p>'
            '<div style="font-size:34px;font-weight:800;letter-spacing:.35em;text-align:center;color:#c2570f;'
            'background:#fff7ed;border:1.5px dashed #fdba74;border-radius:12px;padding:16px;margin:14px 0">%s</div>'
            '<p style="color:#777;font-size:12.5px">If you didn\'t request this, you can ignore this email.</p></div></div>'
            % (first, code))

@api.route('/api/password/request', methods=['POST'])
def password_request():
    d = request.get_json(force=True, silent=True) or {}
    info = db.create_reset_code(d.get('email'))
    emailed = False
    if info:
        ok, _ = _brevo_send([{'email': info['email'], 'name': info['name']}],
                            'Your MCQ Supermarket password reset code',
                            _reset_email_html(info['name'], info['code']))
        emailed = bool(ok)
    # Always generic (don't reveal whether an email is registered)
    return jsonify(ok=True, emailed=emailed,
                   configured=bool(os.environ.get('BREVO_API_KEY', '')))

@api.route('/api/password/reset', methods=['POST'])
def password_reset():
    d = request.get_json(force=True, silent=True) or {}
    res = db.reset_password(d.get('email'), d.get('code'), d.get('password'))
    if res.get('error'): return jsonify(ok=False, error=res['error']), 400
    return jsonify(ok=True, **res)

# ---------- AI Vision (OpenAI / ChatGPT) — API key stays on the SERVER (OPENAI_API_KEY) ----------
def _openai_vision(image_bytes, mime, prompt, max_tokens=220):
    key = os.environ.get('OPENAI_API_KEY', '')
    if not key: return None, 'OPENAI_API_KEY not set on the server'
    b64 = base64.b64encode(image_bytes).decode('ascii')
    payload = {
        'model': os.environ.get('OPENAI_VISION_MODEL', 'gpt-4o-mini'),
        'temperature': 0, 'max_tokens': max_tokens,
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': prompt},
            {'type': 'image_url', 'image_url': {'url': 'data:' + (mime or 'image/jpeg') + ';base64,' + b64, 'detail': 'high'}}
        ]}],
    }
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=40, context=_TLS) as resp:
            out = json.loads(resp.read().decode('utf-8'))
        return out['choices'][0]['message']['content'], None
    except urllib.error.HTTPError as e:
        return None, 'openai ' + str(e.code) + ' ' + e.read().decode('utf-8', 'ignore')[:160]
    except Exception as e:
        return None, str(e)

def _openai_chat(messages, max_tokens=700):
    key = os.environ.get('OPENAI_API_KEY', '')
    if not key: return None, 'OPENAI_API_KEY not set on the server'
    payload = {'model': os.environ.get('OPENAI_CHAT_MODEL', 'gpt-4o-mini'),
               'temperature': 0, 'max_tokens': max_tokens, 'messages': messages}
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=40, context=_TLS) as resp:
            out = json.loads(resp.read().decode('utf-8'))
        return out['choices'][0]['message']['content'], None
    except urllib.error.HTTPError as e:
        return None, 'openai ' + str(e.code) + ' ' + e.read().decode('utf-8', 'ignore')[:160]
    except Exception as e:
        return None, str(e)

def _extract_json(s):
    if not s: return None
    m = re.search(r'\{.*\}', s, re.S)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None

@api.route('/api/vision-temp', methods=['POST'])
def vision_temp():
    require_auth()
    f = request.files.get('image')
    if not f: return jsonify(readable=False, error='no image'), 400
    typ = request.form.get('type', 'fridge'); equip = request.form.get('equipment', '')
    prompt = ("Read the digital temperature display in this photo (a %s%s). "
              "Return ONLY compact JSON, no prose: "
              "{\"temperature\": <number>, \"displayText\": \"<exactly what is shown, incl. minus sign and decimal>\", "
              "\"confidence\": <0-100>, \"readable\": <true or false>}. "
              "Read the MAIN temperature number exactly as shown, including any minus sign and decimal point. "
              "If no temperature number is legible, set readable=false."
              % (typ, (' — ' + equip) if equip else ''))
    content, err = _openai_vision(f.read(), f.mimetype, prompt)
    if err is not None: return jsonify(readable=False, fallback=True, error=err), 200
    d = _extract_json(content) or {}
    return jsonify(temperature=d.get('temperature'), displayText=d.get('displayText'),
                   text=str(d.get('displayText') or ''), confidence=d.get('confidence'),
                   readable=bool(d.get('readable', d.get('temperature') is not None)),
                   source='ChatGPT Vision', model=os.environ.get('OPENAI_VISION_MODEL', 'gpt-4o-mini'))

@api.route('/api/vision-text', methods=['POST'])
def vision_text():
    require_auth()
    f = request.files.get('image')
    if not f: return jsonify(text='', error='no image'), 400
    prompt = request.form.get('prompt') or ("Read all visible text and numbers in this photo (product labels, "
             "expiry / use-by dates, prices, weights). Return them as plain text, one item per line. No commentary.")
    content, err = _openai_vision(f.read(), f.mimetype, prompt, max_tokens=400)
    if err is not None: return jsonify(text='', error=err), 200
    return jsonify(text=content or '', source='ChatGPT Vision')

# ---------- AI Assistant — parse a manager's instruction into ONE structured action ----------
# PARSE ONLY: the browser then confirms + executes via the normal store-scoped endpoints,
# so a misread can never bypass isolation or the human confirm step.
@api.route('/api/ai-command', methods=['POST'])
def ai_command():
    au = require_auth()
    if au['role'] not in ('super', 'admin'): abort(403)   # Manager + Super only
    d = request.get_json(force=True, silent=True) or {}
    text = (d.get('text') or '').strip()
    if not text: return jsonify(ok=False, error='empty'), 200
    stores = d.get('stores') or []
    roster = (d.get('roster') or [])[:400]                # names + stores only (no PII to the model)
    rules = d.get('rules') or []                           # violation rule titles to choose from
    sys_prompt = (
        "You convert a manager's instruction into ONE JSON action for a supermarket staff app. "
        "Return ONLY compact JSON, no prose. Schema: "
        "{\"action\":\"violation|document|email|announcement|unknown\", "
        "\"staff\":\"<one OR MORE employee names, comma-separated, exactly as written; '' if none>\", "
        "\"store\":\"<one of the stores or ''>\", \"subject\":\"<short subject>\", "
        "\"body\":\"<the message/description as short, professional, office-appropriate HTML paragraphs>\", "
        "\"reason\":\"<the raw reason phrase, e.g. 'lateness'>\", "
        "\"rule\":\"<for a violation, the CLOSEST matching rule title from the list below>\", "
        "\"severity\":\"Minor|Moderate|Major|Critical\", "
        "\"step\":\"Verbal Discussion|Written Warning|Final Warning|Termination\", "
        "\"scope\":\"store|all\"}. "
        "Choose 'violation' for warnings/discipline; 'document' to send a note/letter to an "
        "employee's inbox; 'email' to email an employee; 'announcement' for store or company news. "
        "The instruction may name SEVERAL employees (possibly at different stores) — list them all in 'staff'. "
        "For a violation, set 'rule' to the closest rule title from the list, and write 'body' as a polished, "
        "professional disciplinary description — do NOT just repeat the instruction text. "
        "Write body in the SAME language as the instruction. If the request is unclear, use action='unknown'.\n"
        "Violation rules (pick the closest for 'rule'): " + '; '.join(rules) + "\n"
        "Stores: " + ', '.join(stores) + "\n"
        "Employees (name @ store): " + '; '.join(
            '%s @ %s' % (r.get('name', ''), r.get('store', '')) for r in roster if r.get('name')))
    content, err = _openai_chat([{'role': 'system', 'content': sys_prompt},
                                 {'role': 'user', 'content': text}])
    if err is not None:
        return jsonify(ok=False, fallback=True, error=err), 200   # → browser uses its local parser
    return jsonify(ok=True, intent=(_extract_json(content) or {'action': 'unknown'}))

# ---------- CORS (only needed when frontend is on a different origin, e.g. local :8765↔:8001) ----------
def add_cors(app):
    @app.after_request
    def _cors(resp):
        origin = request.headers.get('Origin')
        if origin:
            resp.headers['Access-Control-Allow-Origin'] = origin
            resp.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
            resp.headers['Vary'] = 'Origin'
        return resp
    @app.route('/api/<path:_any>', methods=['OPTIONS'])
    def _preflight(_any):
        return ('', 204)

def create_app():
    app = Flask(__name__)
    db.init_db()
    app.register_blueprint(api)
    add_cors(app)
    _start_deputy_self_poll()
    return app

# ---------- Deputy SELF-polling: no external cron needed ----------
# Every worker runs this loop, but db.try_claim_poll_slot lets exactly ONE of them
# poll per ~10-minute window; per-(timesheet,event) dedupe makes any race harmless.
_dep_poll_started = False
def _deputy_self_poll_loop():
    import threading as _th, time as _time
    _time.sleep(45)   # let the app finish booting first
    while True:
        try:
            host, token = db.deputy_cfg()
            if host and token and db.try_claim_poll_slot('deputy_poll_slot', 540):
                _deputy_poll()
        except Exception:
            pass
        _time.sleep(600)

def _start_deputy_self_poll():
    global _dep_poll_started
    if _dep_poll_started or os.environ.get('MCQ_NO_BG_POLL'): return
    _dep_poll_started = True
    import threading as _th
    _th.Thread(target=_deputy_self_poll_loop, daemon=True, name='deputy-self-poll').start()

if __name__ == '__main__':
    create_app().run(host='0.0.0.0', port=8001, debug=True)
