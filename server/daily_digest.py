#!/usr/bin/env python3
"""
MCQ Supermarket — automatic 9:30 PM all-store daily summary.

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
import os, sys, json, time, base64, ssl, urllib.request, urllib.error, warnings

warnings.simplefilter('ignore', DeprecationWarning)   # keep the scheduled-task log clean (fpdf2 ln= notices)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db

try:
    import certifi
    _TLS = ssl.create_default_context(cafile=certifi.where())   # macOS python.org builds lack system CAs
except Exception:
    _TLS = ssl.create_default_context()

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


SESSIONS = ['Opening', 'Mid-afternoon', 'Closing']
SESSION_ICON = {'Opening': 'AM', 'Mid-afternoon': 'MID', 'Closing': 'PM'}

# palette (MCQ green brand + semantic)
C_BRAND=(14,159,110); C_BRAND_D=(8,110,78); C_INK=(38,32,27); C_SOFT=(122,110,98)
C_LINE=(228,224,219); C_TRACK=(238,235,231); C_GOOD=(14,159,110); C_WARN=(202,138,4)
C_BAD=(200,45,32); C_CARD=(250,248,245); M=40   # page margin


def _pct_color(pct):
    if pct is None: return C_SOFT
    if pct >= 90: return C_GOOD
    if pct >= 60: return C_WARN
    return C_BAD


def build_pdf(summary, date):
    """One polished, branded PDF per store (Opening / Mid-afternoon / Closing)."""
    try:
        from fpdf import FPDF
    except Exception:
        return None
    store = summary['store']; subs = summary['subs']
    W = 595.0; CW = W - 2 * M
    pdf = FPDF(unit='pt', format='A4')
    pdf.set_auto_page_break(auto=True, margin=44)
    pdf.add_page()

    # ---- header band ----
    pdf.set_fill_color(*C_BRAND); pdf.rect(0, 0, W, 92, 'F')
    pdf.set_fill_color(*C_BRAND_D); pdf.rect(0, 92, W, 4, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 20); pdf.set_xy(M, 24); pdf.cell(0, 24, 'MCQ ' + store)
    pdf.set_font('Helvetica', '', 11); pdf.set_xy(M, 52)
    pdf.cell(0, 16, 'Daily Operations Summary')
    pdf.set_font('Helvetica', 'B', 11); pdf.set_xy(M, 52)
    pdf.cell(CW, 16, date, align='R')
    pdf.set_font('Helvetica', '', 9.5); pdf.set_xy(M, 68)
    pdf.set_text_color(224, 245, 236)
    pdf.cell(CW, 14, 'MCQ Supermarket - Retail Operations Platform', align='R')

    # ---- KPI chips ----
    all_done = sum(int(s.get('done', 0)) for s in subs); all_total = sum(int(s.get('total', 0)) for s in subs)
    overall = round(all_done / all_total * 100) if all_total else None
    kpis = [('Overall completion', ('%d%%' % overall) if overall is not None else 'n/a', _pct_color(overall)),
            ('Temperature alerts', str(len(summary['temp_alerts'])), C_BAD if summary['temp_alerts'] else C_SOFT),
            ('Open issues', str(len(summary['issues'])), C_WARN if summary['issues'] else C_SOFT)]
    y = 112; gap = 12; cw = (CW - 2 * gap) / 3
    for i, (label, val, col) in enumerate(kpis):
        x = M + i * (cw + gap)
        pdf.set_fill_color(*C_CARD); pdf.set_draw_color(*C_LINE); pdf.set_line_width(0.8)
        pdf.rect(x, y, cw, 62, 'DF')
        pdf.set_xy(x + 14, y + 12); pdf.set_text_color(*C_SOFT); pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(cw - 20, 10, label.upper())
        pdf.set_xy(x + 14, y + 26); pdf.set_text_color(*col); pdf.set_font('Helvetica', 'B', 24)
        pdf.cell(cw - 20, 26, val)
    y += 62 + 24

    # ---- per-session cards ----
    pdf.set_xy(M, y); pdf.set_text_color(*C_INK); pdf.set_font('Helvetica', 'B', 13)
    pdf.cell(0, 18, 'Checklist by session', ln=1); y = pdf.get_y() + 4
    for sess in SESSIONS:
        rows = [s for s in subs if s.get('session') == sess]
        done = sum(int(s.get('done', 0)) for s in rows); total = sum(int(s.get('total', 0)) for s in rows)
        pct = round(done / total * 100) if total else None
        depts = [s for s in rows]
        card_h = 46 + (len(depts) * 15 if depts else 15)
        if y + card_h > pdf.h - 50:
            pdf.add_page(); y = 50
        pdf.set_fill_color(255, 255, 255); pdf.set_draw_color(*C_LINE); pdf.set_line_width(0.8)
        pdf.rect(M, y, CW, card_h, 'DF')
        pdf.set_fill_color(*_pct_color(pct)); pdf.rect(M, y, 4, card_h, 'F')   # status stripe
        pdf.set_xy(M + 16, y + 12); pdf.set_text_color(*C_INK); pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(200, 16, '%s  (%s)' % (sess, SESSION_ICON.get(sess, '')))
        if total:
            pdf.set_font('Helvetica', 'B', 12); pdf.set_text_color(*_pct_color(pct))
            pdf.set_xy(M + 16, y + 12); pdf.cell(CW - 32, 16, '%d/%d  -  %d%%' % (done, total, pct), align='R')
        else:
            pdf.set_font('Helvetica', '', 10.5); pdf.set_text_color(*C_SOFT)
            pdf.set_xy(M + 16, y + 12); pdf.cell(CW - 32, 16, 'No submission', align='R')
        # progress bar
        bx, by, bw = M + 16, y + 32, CW - 32
        pdf.set_fill_color(*C_TRACK); pdf.rect(bx, by, bw, 6, 'F')
        if pct:
            pdf.set_fill_color(*_pct_color(pct)); pdf.rect(bx, by, bw * pct / 100.0, 6, 'F')
        # dept breakdown
        ly = y + 44
        pdf.set_font('Helvetica', '', 9.5)
        if depts:
            for s in depts:
                pdf.set_text_color(*C_SOFT); pdf.set_xy(M + 16, ly)
                who = s.get('by', '') or ''
                pdf.cell(CW - 120, 13, '  %s  -  %s/%s (%s%%)%s' % (
                    s.get('department', ''), s.get('done', 0), s.get('total', 0), s.get('progress', 0),
                    ('  by ' + who) if who else '')[:90])
                ly += 15
        else:
            pdf.set_text_color(*C_SOFT); pdf.set_xy(M + 16, ly)
            pdf.cell(CW - 32, 13, '  Not submitted today'); ly += 15
        y += card_h + 10

    # ---- temperature alerts ----
    def section_header(title, color):
        nonlocal y
        if y + 40 > pdf.h - 50: pdf.add_page(); y = 50
        pdf.set_xy(M, y); pdf.set_text_color(*color); pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 18, title, ln=1); y = pdf.get_y() + 2

    if summary['temp_alerts']:
        section_header('Temperature out of range (%d)' % len(summary['temp_alerts']), C_BAD)
        pdf.set_font('Helvetica', '', 10)
        for t in summary['temp_alerts'][:30]:
            if y + 14 > pdf.h - 50: pdf.add_page(); y = 50
            val = ('%s C' % t['value']) if t.get('value') is not None else ''
            pdf.set_text_color(*C_INK); pdf.set_xy(M + 6, y)
            pdf.cell(CW - 12, 14, ('- %s / %s   %s' % (t['dept'], t['task'], val))[:110]); y += 15
        y += 8

    if summary['issues']:
        section_header('Open issues & violations (%d)' % len(summary['issues']), C_WARN)
        pdf.set_font('Helvetica', '', 10)
        for it in summary['issues'][:40]:
            if y + 14 > pdf.h - 50: pdf.add_page(); y = 50
            pdf.set_text_color(*C_INK); pdf.set_xy(M + 6, y)
            pr = ('  (' + it['priority'] + ')') if it['priority'] else ''
            pdf.cell(CW - 12, 14, ('- [%s] %s  %s%s' % (it['module'], it['id'], it['summary'], pr))[:110]); y += 15
        y += 8

    if summary['photos']:
        section_header('Photo evidence (%d)' % len(summary['photos']), C_BRAND)
        bw, bh, gapp = 122, 92, 10
        per = int((CW + gapp) / (bw + gapp)); x = M; col = 0
        for ph in summary['photos'][:18]:
            if col >= per: col = 0; x = M; y += bh + gapp
            if y + bh > pdf.h - 50: pdf.add_page(); y = 50; x = M; col = 0
            try:
                pdf.set_draw_color(*C_LINE); pdf.rect(x, y, bw, bh)
                pdf.image(ph['path'], x=x + 1, y=y + 1, w=bw - 2, h=bh - 2)
            except Exception:
                pass
            x += bw + gapp; col += 1
        y += bh + 12

    # ---- footer ----
    pdf.set_y(-34); pdf.set_text_color(*C_SOFT); pdf.set_font('Helvetica', '', 8.5)
    pdf.cell(0, 12, 'Automated 9:30 PM summary  -  MCQ Supermarket Operations  -  %s' % date, align='C')

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
    parts.append('<p style="color:#9ca3af;font-size:11px">Automated 9:30 PM summary · MCQ Supermarket Operations</p></div>')
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
        with urllib.request.urlopen(req, timeout=30, context=_TLS) as resp:
            ok = 200 <= resp.status < 300
            print('[digest] Brevo status', resp.status, '-> sent to', len(recipients))
            return ok
    except urllib.error.HTTPError as e:
        print('[digest] Brevo HTTP error', e.code, e.read().decode('utf-8', 'ignore')[:200])
        return False
    except Exception as e:
        print('[digest] send failed:', e)
        return False


def super_admin_emails(conn):
    """Every Super Admin account that has an email — they are the digest audience."""
    out = []
    for r in conn.execute("SELECT email FROM accounts WHERE role='super'").fetchall():
        e = str(r['email'] or '').strip()
        if e and '@' in e:
            out.append(e)
    return out


def main():
    db.init_db()
    date = today_str()
    conn = db.connect()
    # audience = all Super Admins + any extra addresses configured in Email Notifications.
    # A single email passed as argv[1] overrides everything (used for test sends).
    if len(sys.argv) > 1 and '@' in sys.argv[1]:
        recipients = [sys.argv[1].strip()]
    else:
        recipients = super_admin_emails(conn) + [e for e in (db.get_setting('digest_emails', []) or []) if e and '@' in e]
        seen = set(); recipients = [e for e in recipients if not (e.lower() in seen or seen.add(e.lower()))]
    if not recipients:
        print('[digest] no Super Admin emails and no digest_emails configured. Nothing to do.')
        conn.close(); return
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
