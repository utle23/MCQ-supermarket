#!/usr/bin/env python3
"""
Build an illustrated MCQ Supermarket user guide (PDF) with live screenshots.
Run with the local app up:  python3 flask_app.py  (port 8000)
    python3 tools/build_user_guide.py
Output: MCQ_Supermarket_User_Guide.pdf in the project root.
Requires: playwright (chromium) + fpdf2 + pillow.
"""
import asyncio, os, time
from playwright.async_api import async_playwright
from fpdf import FPDF

BASE = 'http://localhost:8000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = '/tmp/mcq_guide_shots'
os.makedirs(SHOTS, exist_ok=True)
GREEN = (14, 159, 110)

# (key, login-creds-or-None, route, title, [bullets])
SECTIONS = [
    ('login', None, '/', 'Signing in',
     ['Open the app link on any phone or computer. Tap "Install" / "Add to Home Screen" to use it like an app.',
      'Pick a role: Staff, Admin, or Super. Choose your store, type the password, tap Sign In.',
      'Or use "Sign in with Face ID" once a Face ID is set up on the device (see the Face ID section).']),
    ('home', ('admin', 'Demo', '0000'), '/#/home', 'Dashboard',
     ["After login you land on the dashboard - today's checklists, open issues and quick stats at a glance.",
      'The left menu groups everything: Operations, Staff & HR, Management, Reports, AI Lab.',
      'Top-right shows the live save status: "Saving", "Saved", or "Save failed - retrying".']),
    ('checklist', ('admin', 'Demo', '0000'), '/#/checklist', 'Daily checklist',
     ['Pick the session (Opening / Mid-afternoon / Closing) and the department. Each section shows its own progress (e.g. 3/5).',
      'Tick each task. Photo tasks need a photo; temperature tasks are read by AI Vision from a photo.',
      'The Submit button stays locked (grey) until every section is complete - it lists what is left. A task you cannot do must have a reason written in its note.',
      'Your progress auto-saves; you can leave and come back. A confirmation appears before the whole checklist is submitted.']),
    ('issue', ('admin', 'Demo', '0000'), '/#/issue', 'Report an issue',
     ['Staff and managers can log complaints, maintenance, incidents and other issues with an optional photo.',
      'Pick the category - the right people are emailed automatically (set in Email Notifications).']),
    ('manager', ('admin', 'Demo', '0000'), '/#/manager', 'Manager Panel - verify checklists',
     ['Managers review submitted checklists here. Pending items show as cards; tap "Review & Verify".',
      'Fill the structured assessment: Verified by, Overall result, Issues found, Action/Responsible, and a note. You can attach annotated photos.',
      'Tap a photo to zoom it full-screen. Press Verify to finalise - the department leader is emailed a branded PDF report.',
      'Use "Verified records" (top-right) to browse past verified checklists by date and store.']),
    ('records', ('super', None, '99999'), '/#/complaint/records', 'Records & registers',
     ['Every register (complaints, maintenance, incidents, deliveries, violations) lists records newest-first.',
      'Super Admin can filter by Store using the Store dropdown, plus by status, date range and search.',
      'Click any row to open it, update its status, or export to Excel/PDF.']),
    ('history', ('super', None, '99999'), '/#/history', 'History',
     ['A searchable archive of submitted checklists, bin records and completed schedules - with photo evidence.',
      'Super Admin can switch store and department; everyone can search and filter by date.']),
    ('analytics', ('super', None, '99999'), '/#/analytics', 'Analytics',
     ['Cross-store and per-module insights: completion rates, open issues, temperature alerts and trends.',
      'Great for the weekly review and for comparing branches.']),
    ('staff', ('admin', 'Demo', '0000'), '/#/staff', 'Staff members',
     ['Each store keeps its own staff list. Add, edit or deactivate people; their details feed the checklists and schedules.',
      'Staff names appear in dropdowns (responsible person, department leaders, drivers).']),
    ('schedules', ('admin', 'Demo', '0000'), '/#/schedules', 'Cleaning & maintenance schedule',
     ['A weekly grid per department. Managers tick off scheduled days and can attach completion photos.',
      'Edit mode lets admins set which days each task is scheduled.']),
    ('email', ('super', None, '99999'), '/#/email', 'Email notifications',
     ['Emails send automatically and silently via Brevo (the key lives on the server - nothing to enter here).',
      'Recipients: add, edit or remove people and tick which issue categories / checklists each one receives.',
      'Department leaders: per store, pick the staff member(s) who receive the verified-note PDF for each department.',
      'Super Admin: set the "Daily summary recipients" who get the automatic 9 PM all-store PDF digest.',
      'Use "Sent history" to confirm emails actually went out.']),
    ('data', ('admin', 'Demo', '0000'), '/#/data', 'Data management & backup',
     ['"Download all data" exports everything (records, staff, checklists, schedules, audit log) as one JSON backup file.',
      'Per-module export to Excel, and clean-up tools to delete old data by date range when space is tight.']),
    ('faceid', ('admin', 'Demo', '0000'), '/#/faceid', 'Face ID',
     ['Sign in with your device Face ID / Touch ID instead of a password. Enrolment is per-device.',
      'When enrolling, name the Face ID (e.g. "Morley Admin - Tony") so several people at one branch are easy to tell apart.',
      "The list shows only this store's Face IDs; remove any you no longer need. Enrolments are saved and never lost."]),
    ('whatsapp', ('admin', 'Demo', '0000'), '/#/whatsapp', 'WhatsApp daily share',
     ['Builds a branded PDF report for the selected session - checklist results, photos and temperature alerts.',
      'Tap "Share PDF to WhatsApp" to send it to your team group, or "Copy summary" for the text version.']),
]


def S(s):
    for k, v in {'—': '-', '–': '-', '’': "'", '‘': "'",
                 '“': '"', '”': '"', '…': '...', '·': '-',
                 '✓': '[ok]', '✗': '[x]', '\U0001f3ac': ''}.items():
        s = s.replace(k, v)
    return s.encode('latin-1', 'ignore').decode('latin-1')


async def shoot():
    shots = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, device_scale_factor=2)
        pg = await ctx.new_page()
        cur = None

        async def login(mode, branch, pw):
            await pg.goto(BASE + '/', wait_until='networkidle')
            # if a previous session is still active, log out so the login form is shown
            if not await pg.query_selector('#login-mode'):
                try: await pg.evaluate("window.logout && window.logout()")
                except Exception: pass
                await pg.wait_for_timeout(900)
                await pg.goto(BASE + '/', wait_until='networkidle')
            await pg.wait_for_selector('#login-mode', timeout=8000)
            await pg.evaluate("document.querySelector('#login-mode .seg-btn[data-mode=\"%s\"]').click()" % mode)
            if mode != 'super':
                await pg.select_option('#login-branch', branch)
            await pg.fill('#login-pw', pw)
            await pg.click('.login-btn')
            await pg.wait_for_timeout(3800)

        for key, creds, route, title, bullets in SECTIONS:
            try:
                if creds and creds != cur:
                    await login(*creds); cur = creds
                await pg.goto(BASE + route, wait_until='domcontentloaded')
                await pg.wait_for_timeout(2200)
                if key == 'manager':
                    try:
                        await pg.evaluate("(()=>{const b=document.querySelector('.pv-card button[onclick^=\"mgrReview\"]'); if(b) b.click();})()")
                        await pg.wait_for_timeout(900)
                    except Exception:
                        pass
                path = os.path.join(SHOTS, key + '.png')
                await pg.screenshot(path=path)
                shots[key] = path
                print('shot', key)
            except Exception as e:
                print('skip', key, e)
        await b.close()
    return shots


def build(shots):
    pdf = FPDF(unit='pt', format='A4')
    pdf.set_auto_page_break(auto=True, margin=44)
    PW = pdf.w
    M = 40
    CW = PW - 2 * M

    # cover
    pdf.add_page()
    pdf.set_fill_color(*GREEN); pdf.rect(0, 0, PW, pdf.h, 'F')
    logo = os.path.join(ROOT, 'assets', 'mcq-logo-exact.png')
    if os.path.isfile(logo):
        try: pdf.image(logo, x=PW / 2 - 60, y=210, w=120)
        except Exception: pass
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 30); pdf.set_xy(M, 360); pdf.cell(CW, 36, S('MCQ Supermarket'), align='C')
    pdf.set_font('Helvetica', 'B', 19); pdf.set_xy(M, 402); pdf.cell(CW, 26, S('Operations App - User Guide'), align='C')
    pdf.set_font('Helvetica', '', 12); pdf.set_xy(M, 446); pdf.cell(CW, 18, S('Checklists - Manager verify - Reports - Email - Analytics'), align='C')
    pdf.set_xy(M, 470); pdf.cell(CW, 18, S('Updated ' + time.strftime('%d %b %Y')), align='C')

    # contents
    pdf.add_page(); pdf.set_text_color(*GREEN); pdf.set_font('Helvetica', 'B', 20)
    pdf.set_xy(M, 44); pdf.cell(CW, 26, S('Contents'), ln=1)
    pdf.set_text_color(40, 40, 40); pdf.set_font('Helvetica', '', 13)
    for i, sec in enumerate(SECTIONS, 1):
        pdf.set_x(M); pdf.cell(CW, 22, S('%d.  %s' % (i, sec[3])), ln=1)
    pdf.ln(10); pdf.set_font('Helvetica', '', 11); pdf.set_text_color(90, 90, 90)
    pdf.set_x(M); pdf.multi_cell(CW, 16, S('Tip: emails send automatically via Brevo, and your work auto-saves as you go '
                                           '(watch the "Saved" status, top-right). The Demo store (password 0000) is sample '
                                           'data for training and presentations - it never affects the real branches.'))

    # sections
    for n, (key, creds, route, title, bullets) in enumerate(SECTIONS, 1):
        pdf.add_page()
        pdf.set_fill_color(*GREEN); pdf.rect(0, 0, PW, 52, 'F')
        pdf.set_text_color(255, 255, 255); pdf.set_font('Helvetica', 'B', 16)
        pdf.set_xy(M, 16); pdf.cell(CW, 22, S('%d. %s' % (n, title)))
        y = 70
        img = shots.get(key)
        if img and os.path.isfile(img):
            try:
                from PIL import Image
                iw, ih = Image.open(img).size
            except Exception:
                iw, ih = 1366, 900
            w = CW; h = w * ih / iw
            if h > 360:
                h = 360; w = h * iw / ih
            x = M + (CW - w) / 2
            pdf.set_draw_color(205, 205, 205); pdf.rect(x, y, w, h)
            try: pdf.image(img, x=x, y=y, w=w, h=h)
            except Exception: pass
            y += h + 18
        pdf.set_xy(M, y); pdf.set_text_color(30, 30, 30); pdf.set_font('Helvetica', '', 12)
        for bl in bullets:
            pdf.set_x(M); pdf.multi_cell(CW, 17, S('-  ' + bl)); pdf.ln(2)

    outp = os.path.join(ROOT, 'MCQ_Supermarket_User_Guide.pdf')
    pdf.output(outp)
    print('WROTE', outp, os.path.getsize(outp), 'bytes')


if __name__ == '__main__':
    build(asyncio.run(shoot()))
