#!/usr/bin/env python3
"""
MCQ Supermarket — automatic 9 PM all-store daily summary.

Runs as a PythonAnywhere *Scheduled Task* (no web request / no auth token):

    python3.x /home/mcqsupermarket/<path>/server/daily_digest.py

For every store it builds ONE branded PDF (today's Opening / Mid-afternoon /
Closing checklist completion, temperature-out-of-range readings, open
violations / incidents / complaints / maintenance, with photo evidence) and
emails all PDFs as attachments to the Super-Admin recipients configured in the
app (Email Notifications -> "Daily summary recipients"), via Brevo.

Requirements: `pip install --user fpdf2`  (pure-python, works on PythonAnywhere).
Reads BREVO_API_KEY / MCQ_FROM_EMAIL / MCQ_FROM_NAME from the environment — the
PythonAnywhere "Scheduled tasks" run with your account env, so set them in your
WSGI/.bashrc or pass inline.  Falls back to an HTML-only email if fpdf2 is absent.
"""
import os, sys, json, time, base64, urllib.request, urllib.error, warnings

warnings.simplefilter('ignore', DeprecationWarning)   # keep the scheduled-task log clean (fpdf2 ln= notices)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db

OPEN_STATES_DONE = {'Closed', 'Cancelled', 'Resolved', 'Store Confirmed', 'Completed'}
ISSUE_MODULES = ['violation', 'incident', 'complaint', 'maintenance']


def db_safe(s):
    return ''.join(c if c.isalnum() else '-' for c in str(s).lower()).strip('-') or 'store'


def today_str():
    return time.strftime('%Y-%m-%d')


_TMP_PHOTOS = []   # temp files created for Cloudinary-hosted photos (cleaned at exit)

def photo_path(conn, pid):
    if not pid:
        return None
    row = conn.execute('SELECT * FROM photos WHERE id=?', (str(pid),)).fetchone()
    if not row:
        return None
    p = os.path.join(db.UPLOADS, db_safe(row['store_id']), row['filename'])
    if os.path.isfile(p):
        return p
    # Render has no local disk — photos live on Cloudinary; fetch to a temp file for the PDF
    cloud = row['cloud'] if ('cloud' in row.keys() and row['cloud']) else None
    if cloud:
        try:
            import cloudstore, tempfile
            if cloudstore.ENABLED:
                data = cloudstore.get_photo(cloud)
                tf = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
                tf.write(data); tf.close(); _TMP_PHOTOS.append(tf.name)
                return tf.name
        except Exception:
            pass
    return None


def gather_store(conn, store, date):
    """Return a summary dict for one store for the given date."""
    subs = []
    for r in conn.execute('SELECT data_json FROM checklist_submissions WHERE store_id=?', (store,)).fetchall():
        try:
            s = json.loads(r['data_json'])
        except Exception:
            continue
        if s.get('date') == date:
            subs.append(s)

    temp_alerts, photos = [], []
    for s in subs:
        for it in (s.get('items') or []):
            t = it.get('temp') or {}
            if t and t.get('inRange') is False:
                temp_alerts.append({'dept': s.get('department', ''), 'task': it.get('task', ''),
                                    'value': t.get('value')})
            for pid in (it.get('photos') or []):
                pp = photo_path(conn, pid)
                if pp:
                    photos.append({'path': pp, 'label': (s.get('department', '') + ' · ' + it.get('area', ''))})

    issues = []
    for r in conn.execute('SELECT module,data_json FROM records WHERE store_id=?', (store,)).fetchall():
        if r['module'] not in ISSUE_MODULES:
            continue
        try:
            rec = json.loads(r['data_json'])
        except Exception:
            continue
        if rec.get('status') in OPEN_STATES_DONE:
            continue
        issues.append({'module': r['module'], 'id': rec.get('id', ''),
                       'summary': rec.get('summary') or rec.get('title') or rec.get('equipment') or rec.get('category') or '',
                       'priority': rec.get('priority') or rec.get('severity') or rec.get('step') or '',
                       'created': rec.get('created') or rec.get('date') or ''})
    return {'store': store, 'subs': subs, 'temp_alerts': temp_alerts, 'photos': photos, 'issues': issues}


def build_pdf(summary, date):
    """One branded PDF for a store. Returns bytes, or None if fpdf2 unavailable."""
    try:
        from fpdf import FPDF
    except Exception:
        return None
    store = summary['store']
    pdf = FPDF(unit='pt', format='A4')
    pdf.set_auto_page_break(auto=True, margin=40)
    pdf.add_page()
    pdf.set_fill_color(14, 159, 110)
    pdf.rect(0, 0, pdf.w, 60, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_xy(40, 18)
    pdf.cell(0, 20, 'MCQ Supermarket - Daily Summary')
    pdf.set_font('Helvetica', '', 11)
    pdf.set_xy(40, 38)
    pdf.cell(0, 16, '%s  |  %s' % (store, date))
    pdf.set_text_color(30, 30, 30)
    pdf.set_y(78)

    sessions = ['Opening', 'Mid-afternoon', 'Closing']
    by_session = {}
    for s in summary['subs']:
        by_session.setdefault(s.get('session', 'Other'), []).append(s)

    pdf.set_font('Helvetica', 'B', 13)
    pdf.cell(0, 18, 'Checklist completion', ln=1)
    pdf.set_font('Helvetica', '', 11)
    for sess in sessions:
        rows = by_session.get(sess, [])
        if not rows:
            pdf.cell(0, 16, '  %s: no submission' % sess, ln=1)
            continue
        for s in rows:
            line = '  %s - %s: %s/%s (%s%%) - %s' % (
                sess, s.get('department', ''), s.get('done', 0), s.get('total', 0),
                s.get('progress', 0), s.get('status', 'Submitted'))
            pdf.cell(0, 16, line[:120], ln=1)
    pdf.ln(6)

    if summary['temp_alerts']:
        pdf.set_text_color(185, 28, 28)
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 18, 'Temperature alerts (%d out of range)' % len(summary['temp_alerts']), ln=1)
        pdf.set_font('Helvetica', '', 10.5)
        for t in summary['temp_alerts'][:30]:
            val = ('%s C' % t['value']) if t.get('value') is not None else ''
            pdf.cell(0, 14, ('  %s - %s  %s' % (t['dept'], t['task'], val))[:120], ln=1)
        pdf.set_text_color(30, 30, 30)
        pdf.ln(6)

    if summary['issues']:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 18, 'Open issues / violations (%d)' % len(summary['issues']), ln=1)
        pdf.set_font('Helvetica', '', 10.5)
        for it in summary['issues'][:40]:
            line = '  [%s] %s - %s %s' % (it['module'], it['id'], it['summary'], ('(' + it['priority'] + ')') if it['priority'] else '')
            pdf.cell(0, 14, line[:120], ln=1)
        pdf.ln(6)

    if summary['photos']:
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 18, 'Photo evidence (%d)' % len(summary['photos']), ln=1)
        x0, y, bw, bh = 40, pdf.get_y(), 150, 110
        x = x0
        for ph in summary['photos'][:24]:
            if x + bw > pdf.w - 40:
                x = x0
                y += bh + 14
            if y + bh > pdf.h - 40:
                pdf.add_page()
                y = 60
            try:
                pdf.image(ph['path'], x=x, y=y, w=bw, h=bh)
            except Exception:
                pass
            x += bw + 12
        pdf.set_y(y + bh + 10)

    out = pdf.output()
    return bytes(out) if not isinstance(out, (bytes, bytearray)) else out


def summary_html(summaries, date):
    parts = ['<div style="font-family:Arial;color:#1f2937">',
             '<h2 style="color:#0e9f6e">MCQ Supermarket — Daily Summary (%s)</h2>' % date]
    for s in summaries:
        parts.append('<h3>%s</h3><ul>' % s['store'])
        if s['subs']:
            for sub in s['subs']:
                parts.append('<li>%s — %s: %s/%s (%s%%) · %s</li>' % (
                    sub.get('session', ''), sub.get('department', ''), sub.get('done', 0),
                    sub.get('total', 0), sub.get('progress', 0), sub.get('status', '')))
        else:
            parts.append('<li>No checklist submissions today</li>')
        if s['temp_alerts']:
            parts.append('<li style="color:#b91c1c"><b>%d temperature alert(s) out of range</b></li>' % len(s['temp_alerts']))
        if s['issues']:
            parts.append('<li><b>%d open issue(s)/violation(s)</b></li>' % len(s['issues']))
        parts.append('</ul>')
    parts.append('<p style="color:#9ca3af;font-size:11px">Automated 9 PM summary · MCQ Supermarket Operations</p></div>')
    return ''.join(parts)


def send_brevo(recipients, subject, html, attachments):
    key = os.environ.get('BREVO_API_KEY', '')
    if not key:
        print('[digest] BREVO_API_KEY not set — skipping send')
        return False
    sender = {'email': os.environ.get('MCQ_FROM_EMAIL', 'mcqcafe.notify@gmail.com'),
              'name': os.environ.get('MCQ_FROM_NAME', 'MCQ Supermarket Notification')}
    payload = {'sender': sender,
               'to': [{'email': e, 'name': e} for e in recipients],
               'subject': subject, 'htmlContent': html}
    if attachments:
        payload['attachment'] = [{'content': base64.b64encode(c).decode('ascii'), 'name': n}
                                 for (n, c) in attachments if c]
    req = urllib.request.Request('https://api.brevo.com/v3/smtp/email',
                                 data=json.dumps(payload).encode('utf-8'),
                                 headers={'api-key': key, 'content-type': 'application/json',
                                          'accept': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            ok = 200 <= resp.status < 300
            print('[digest] Brevo status', resp.status, '-> sent to', len(recipients))
            return ok
    except urllib.error.HTTPError as e:
        print('[digest] Brevo HTTP error', e.code, e.read().decode('utf-8', 'ignore')[:200])
        return False
    except Exception as e:
        print('[digest] send failed:', e)
        return False


def main():
    db.init_db()
    date = today_str()
    recipients = db.get_setting('digest_emails', []) or []
    recipients = [e for e in recipients if e and '@' in e]
    if not recipients:
        print('[digest] no digest_emails configured — set them in Email Notifications. Nothing to do.')
        return
    conn = db.connect()
    summaries, attachments = [], []
    try:
        for store in db.STORES:
            summary = gather_store(conn, store, date)
            summaries.append(summary)
            pdf = build_pdf(summary, date)
            if pdf:
                attachments.append(('MCQ_%s_%s.pdf' % (db_safe(store), date), pdf))
    finally:
        conn.close()
    subject = 'MCQ Supermarket — Daily Summary (%s)' % date
    html = summary_html(summaries, date)
    send_brevo(recipients, subject, html, attachments)
    print('[digest] done:', len(summaries), 'stores,', len(attachments), 'PDFs,', len(recipients), 'recipients')
    for f in _TMP_PHOTOS:
        try: os.remove(f)
        except Exception: pass


if __name__ == '__main__':
    main()
