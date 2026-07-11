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
    # Perth calendar day (UTC+8) — the server runs in UTC, and the 9:30 PM digest must
    # report Perth's "today", not the UTC date (which flips at 8 AM Perth).
    return time.strftime('%Y-%m-%d', time.gmtime(time.time() + 8 * 3600))


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
            pp_list = []
            for pid in (it.get('photos') or []):
                pp = photo_path(conn, pid)
                if pp:
                    pp_list.append(pp)
                    photos.append({'path': pp, 'label': (s.get('department', '') + ' · ' + it.get('area', ''))})
            it['_pp'] = pp_list   # resolved photo file paths, for inline rendering in the PDF

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


import unicodedata
def _ascii(s):
    """Core PDF fonts are latin-1 only; make any text safe (Vietnamese stays readable
    without tone marks, smart punctuation → ASCII) so the report never crashes."""
    s = str(s or '').replace('đ', 'd').replace('Đ', 'D')
    for a, b in (('—', '-'), ('–', '-'), ('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('…', '...'), ('•', '-')):
        s = s.replace(a, b)
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    return s.encode('latin-1', 'ignore').decode('latin-1')


def build_pdf(summary, date):
    """One polished, branded PDF per store (Opening / Mid-afternoon / Closing)."""
    try:
        from fpdf import FPDF
    except Exception:
        return None
    store = summary['store']; subs = summary['subs']
    W = 595.0; CW = W - 2 * M

    class _DigestPDF(FPDF):
        foot = ''
        def footer(self):
            self.set_y(-34); self.set_text_color(*C_SOFT); self.set_font('Helvetica', '', 8.5)
            self.cell(0, 12, '%s  -  page %d' % (self.foot, self.page_no()), align='C')

    pdf = _DigestPDF(unit='pt', format='A4')
    pdf.foot = 'MCQ %s  -  Automated 9:30 PM summary  -  %s' % (store, date)
    pdf.set_auto_page_break(auto=True, margin=44)
    pdf.add_page()

    # ---- header band ----
    pdf.set_fill_color(*C_BRAND); pdf.rect(0, 0, W, 92, 'F')
    pdf.set_fill_color(*C_BRAND_D); pdf.rect(0, 92, W, 4, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 20); pdf.set_xy(M, 24); pdf.cell(0, 24, _ascii('MCQ ' + store))
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

    BOT = pdf.h - 44   # bottom limit before a new page
    def need(space):
        nonlocal y
        if y + space > BOT:
            pdf.add_page(); y = 50

    def wrap(txt, font_sz, width):
        pdf.set_font('Helvetica', '', font_sz)
        words = _ascii(txt).split(); lines = []; cur = ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if pdf.get_string_width(t) <= width: cur = t
            else:
                if cur: lines.append(cur)
                cur = w
        if cur: lines.append(cur)
        return lines or ['']

    # ---- full checklist, grouped by session then department ----
    pdf.set_xy(M, y); pdf.set_text_color(*C_INK); pdf.set_font('Helvetica', 'B', 14)
    pdf.cell(0, 20, 'Checklist detail', ln=1); y = pdf.get_y() + 2
    for sess in SESSIONS:
        rows = [s for s in subs if s.get('session') == sess]
        s_done = sum(int(s.get('done', 0)) for s in rows); s_total = sum(int(s.get('total', 0)) for s in rows)
        s_pct = round(s_done / s_total * 100) if s_total else None
        need(30)
        # session banner
        pdf.set_fill_color(*C_BRAND); pdf.rect(M, y, CW, 24, 'F')
        pdf.set_text_color(255, 255, 255); pdf.set_font('Helvetica', 'B', 12); pdf.set_xy(M + 12, y + 5)
        pdf.cell(300, 14, '%s  (%s)' % (sess, SESSION_ICON.get(sess, '')))
        pdf.set_xy(M, y + 5)
        pdf.cell(CW - 12, 14, ('%d/%d - %d%%' % (s_done, s_total, s_pct)) if s_total else 'No submission', align='R')
        y += 24 + 6
        if not rows:
            need(18); pdf.set_text_color(*C_SOFT); pdf.set_font('Helvetica', 'I', 10)
            pdf.set_xy(M + 12, y); pdf.cell(0, 14, 'Not submitted today.'); y += 20
            continue
        for s in rows:
            need(26)
            who = s.get('by', '') or ''
            pdf.set_text_color(*C_INK); pdf.set_font('Helvetica', 'B', 11); pdf.set_xy(M + 4, y)
            pdf.cell(CW - 120, 15, _ascii(s.get('department', '') or 'General'))
            pdf.set_font('Helvetica', '', 9.5); pdf.set_text_color(*_pct_color(s.get('progress')))
            pdf.set_xy(M, y); pdf.cell(CW - 4, 15, '%s/%s (%s%%)%s' % (
                s.get('done', 0), s.get('total', 0), s.get('progress', 0), ('   by ' + _ascii(who)) if who else ''), align='R')
            y += 17
            for it in (s.get('items') or []):
                done = bool(it.get('done')); note = (it.get('note') or '').strip()
                t = it.get('temp') or {}; pps = it.get('_pp') or []
                task_lines = wrap(it.get('task', ''), 9.5, CW - 40)
                block_h = max(14, len(task_lines) * 12) + (12 if note else 0) + (12 if t else 0)
                photo_h = 60 if pps else 0
                need(block_h + photo_h + 4)
                # status box
                bx, byv = M + 4, y + 1
                if done: pdf.set_fill_color(*C_GOOD)
                else: pdf.set_fill_color(255, 255, 255); pdf.set_draw_color(*C_BAD)
                pdf.set_line_width(1); pdf.rect(bx, byv, 10, 10, 'F' if done else 'D')
                if done:
                    pdf.set_draw_color(255, 255, 255); pdf.set_line_width(1.2)
                    pdf.line(bx + 2, byv + 5, bx + 4.2, byv + 7.5); pdf.line(bx + 4.2, byv + 7.5, bx + 8, byv + 2.5)
                # task text
                pdf.set_text_color(*C_INK); pdf.set_font('Helvetica', '', 9.5)
                ty = y
                for i, ln in enumerate(task_lines):
                    pdf.set_xy(M + 22, ty); pdf.cell(CW - 30, 12, ln); ty += 12
                # area tag (right)
                if it.get('area'):
                    pdf.set_font('Helvetica', '', 8); pdf.set_text_color(*C_SOFT)
                    pdf.set_xy(M, y); pdf.cell(CW - 4, 12, _ascii(it.get('area', '')), align='R')
                y = ty
                if t:
                    inr = t.get('inRange'); col = C_BAD if inr is False else C_GOOD
                    val = t.get('value')
                    pdf.set_font('Helvetica', 'B', 8.5); pdf.set_text_color(*col); pdf.set_xy(M + 22, y)
                    pdf.cell(0, 12, ('Temp: %s C  %s' % (val, 'OUT OF RANGE' if inr is False else 'ok')) if val is not None else 'Temp recorded'); y += 12
                if note:
                    pdf.set_font('Helvetica', 'I', 8.5); pdf.set_text_color(*C_SOFT)
                    for ln in wrap('Note: ' + note, 8.5, CW - 44):
                        need(11); pdf.set_xy(M + 22, y); pdf.cell(0, 11, ln); y += 11
                if pps:
                    px = M + 22; pw = 78; ph = 58
                    for p in pps[:5]:
                        if px + pw > M + CW: break
                        try:
                            pdf.set_draw_color(*C_LINE); pdf.set_line_width(0.6); pdf.rect(px, y, pw, ph)
                            pdf.image(p, x=px + 1, y=y + 1, w=pw - 2, h=ph - 2)
                        except Exception: pass
                        px += pw + 6
                    y += ph + 4
                y += 3
            y += 6
        y += 4

    # ---- temperature alerts callout ----
    def section_header(title, color):
        nonlocal y
        need(30)
        pdf.set_xy(M, y); pdf.set_text_color(*color); pdf.set_font('Helvetica', 'B', 13)
        pdf.cell(0, 18, title, ln=1); y = pdf.get_y() + 2

    if summary['temp_alerts']:
        section_header('Temperature out of range (%d)' % len(summary['temp_alerts']), C_BAD)
        pdf.set_font('Helvetica', '', 10)
        for t in summary['temp_alerts'][:40]:
            need(15)
            val = ('%s C' % t['value']) if t.get('value') is not None else ''
            pdf.set_text_color(*C_INK); pdf.set_xy(M + 6, y)
            pdf.cell(CW - 12, 14, _ascii('- %s / %s   %s' % (t['dept'], t['task'], val))[:120]); y += 15
        y += 8

    # ---- open issues / report issue (full) ----
    if summary['issues']:
        section_header('Open issues & report-issue (%d)' % len(summary['issues']), C_WARN)
        pdf.set_font('Helvetica', '', 10)
        for it in summary['issues']:
            pr = ('  (' + it['priority'] + ')') if it['priority'] else ''
            created = ('  -  ' + str(it['created'])[:16]) if it.get('created') else ''
            head = '[%s] %s%s' % (it['module'], it['id'], pr)
            for j, ln in enumerate(wrap(head + '  ' + (it['summary'] or '') + created, 10, CW - 16)):
                need(14); pdf.set_text_color(*C_INK if j == 0 else C_SOFT); pdf.set_xy(M + 6, y)
                pdf.cell(CW - 12, 14, ('- ' if j == 0 else '   ') + ln); y += 14
            y += 3
        y += 6

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


def post_store_inboxes(summaries, date):
    """Also drop each store's daily report into that store's own in-app inbox (its Manager /
       Dept-Lead see it), so the report is not only emailed to Super Admins but recorded per
       store. Text summary only — the full PDF still rides the email (keeps the DB small)."""
    au = {'role': 'super', 'staff_name': '📋 Daily Report', 'staff_id': None}
    posted = 0
    for s in summaries:
        store = s.get('store')
        if not store:
            continue
        try:
            subject = '📋 Daily report · %s · %s' % (store, date)
            body = summary_html([s], date)
            db.send_message(au, store, 'document', subject, body, to_managers=True)
            posted += 1
        except Exception as e:
            print('[digest] inbox post failed for', store, ':', e)
    return posted


def run(recipient_override=None):
    """Build one PDF per store for today and email them. Returns a small status dict.
    recipient_override = a single address (test send) or a list; else all Super Admins."""
    db.init_db()
    date = today_str()
    conn = db.connect()
    if recipient_override:
        recipients = [recipient_override] if isinstance(recipient_override, str) else list(recipient_override)
        recipients = [e for e in recipients if e and '@' in e]
    else:
        recipients = super_admin_emails(conn) + [e for e in (db.get_setting('digest_emails', []) or []) if e and '@' in e]
        seen = set(); recipients = [e for e in recipients if not (e.lower() in seen or seen.add(e.lower()))]
    if not recipients:
        conn.close()
        print('[digest] no Super Admin emails and no digest_emails configured. Nothing to do.')
        return {'ok': False, 'error': 'no recipients', 'stores': 0, 'pdfs': 0}
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
    sent = send_brevo(recipients, subject, html, attachments)
    # ALSO record each store's report in its own store inbox (skip on a test/override send so a
    # test doesn't spam the real store inboxes).
    inboxed = 0
    if recipient_override is None:
        try: inboxed = post_store_inboxes(summaries, date)
        except Exception as e: print('[digest] inbox posting failed:', e)
    for f in _TMP_PHOTOS:
        try: os.remove(f)
        except Exception: pass
    del _TMP_PHOTOS[:]
    print('[digest] done:', len(summaries), 'stores,', len(attachments), 'PDFs,', len(recipients),
          'recipients, sent=%s, store-inboxes=%d' % (sent, inboxed))
    return {'ok': bool(sent), 'stores': len(summaries), 'pdfs': len(attachments),
            'recipients': len(recipients), 'store_inboxes': inboxed}


def main():
    override = sys.argv[1].strip() if (len(sys.argv) > 1 and '@' in sys.argv[1]) else None
    run(override)


if __name__ == '__main__':
    main()
