#!/usr/bin/env python3
"""
Build the MCQ Supermarket documentation set with LIVE screenshots:

  * 5 per-role illustrated PDF guides   (Staff / Department Lead / Manager /
                                          Super Admin / Chu Ba)
  * 1 confidential accounts & passwords PDF (all stores, staff logins excluded)
  * intro_email.html + intro_email.txt  (English launch email)

Run with the local app up:  python3 flask_app.py   (port 8000)
    python3 tools/build_user_guide.py
Everything is written into ./guides/.
Requires: playwright (chromium) + fpdf2 + pillow.
"""
import asyncio, ast, json, os, time, urllib.request
from playwright.async_api import async_playwright
from fpdf import FPDF

BASE = 'http://localhost:8000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDES = os.path.join(ROOT, 'guides')
SHOTS = '/tmp/mcq_guide_shots'
os.makedirs(GUIDES, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)

GREEN = (14, 159, 110)
DARK = (30, 30, 30)
INK = (40, 40, 40)
APP_URL = 'https://mcqsupermarket.pythonanywhere.com/'

# demo employee used only to capture the Staff guide screenshots (created + deleted at run time)
GUIDE_SID = 'GUIDE-1'
GUIDE_NAME = 'GUIDE DEMO STAFF'


# ---------------------------------------------------------------- passwords (parsed from db.py)
def load_passwords():
    """Read STORES / SUPER_PW / BA_PW / ADMIN_PW / BRANCH_PW straight from server/db.py
    (parsed with ast, never imported) so the sheet can never drift from the server."""
    src = open(os.path.join(ROOT, 'server', 'db.py'), encoding='utf-8').read()
    tree = ast.parse(src)
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in ('STORES', 'SUPER_PW', 'BA_PW', 'ADMIN_PW', 'BRANCH_PW'):
                try:
                    out[name] = ast.literal_eval(node.value)
                except Exception:
                    pass
    return out

PW = load_passwords()
SUPER_PW = PW.get('SUPER_PW', '99999')
BA_PW = PW.get('BA_PW', '19')
ADMIN_PW = PW.get('ADMIN_PW', {})
BRANCH_PW = PW.get('BRANCH_PW', {})
STORES = PW.get('STORES', [])


def S(s):
    """Sanitise text for fpdf2's latin-1 core fonts."""
    for k, v in {'—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"',
                 '…': '...', '·': '-', '✓': '[ok]', '✗': '[x]', '🏬': '', '🏪': '',
                 'Chú Ba': 'Chu Ba', 'chú ba': 'chu ba', '\U0001f3ac': ''}.items():
        s = s.replace(k, v)
    return s.encode('latin-1', 'ignore').decode('latin-1')


# ================================================================ CONTENT
# Each section: (key, route, title, [bullets]).  key doubles as the screenshot name.
LOGIN = {
    'staff': ('login', '/', 'Signing in',
        ['Open %s on any phone, tablet or computer. Tap Install / Add to Home Screen to keep it like an app.' % APP_URL,
         'On the sign-in screen tap the STAFF tab. You do NOT choose a store.',
         'Type the numeric password your manager created for you (Staff Members > Create login) and tap Sign In.',
         'After the first login you can enrol Face ID / Touch ID on your device for faster sign-in next time.']),
    'staff2': ('login', '/', 'Signing in',
        ['Open %s. Tap the DEPT LEAD tab, choose your Store, and type your store Department-Lead password.' % APP_URL,
         'Tap Sign In. Face ID / Touch ID can be enrolled afterwards for faster access.',
         'You only ever see your own store; everything you submit is stamped with your name.']),
    'admin': ('login', '/', 'Signing in',
        ['Open %s. Tap the MANAGER tab, choose your Store, and type your store Manager password.' % APP_URL,
         'Tap Sign In. Managers can also sign in with Face ID once enrolled.',
         'A Manager sees and manages everything within their own store.']),
    'super': ('login', '/', 'Signing in',
        ['Open %s. Tap the SUPER tab - no store is needed - and type the Super Admin password.' % APP_URL,
         'Tap Sign In. After login use the store-filter bar at the top to focus one store or view all stores.',
         'Super Admin sees every store and can edit each store configuration.']),
    'ba': ('login', '/', 'Signing in',
        ['Open %s. Tap the CHU BA tab - no store is needed - and type the Chu Ba password.' % APP_URL,
         'Tap Sign In. You get a read-only view of checklist results across every store.',
         'You cannot edit anything; this login is for oversight only.']),
}

# ---- shared feature descriptions (reused across roles, wording kept role-appropriate) ----
CHECKLIST_LEAD = ['Pick the shift - Opening, Mid-afternoon or Closing - then pick your department chip.',
    'Each department now shows ONE long checklist; section names (e.g. OPENING) appear as bold green headings inside it.',
    'Photo tasks need a photo before they count; the small camera sits on the same row as the task and note.',
    'Temperature tasks read the number from your photo with AI Vision - check or correct it before it saves.',
    'Fill Responsible Person and Submitted by, then tap Submit. Any unticked task without a note is listed for you at Submit time so nothing is missed.']
ISSUE_B = ['Report any operational problem from one guided form.',
    'Choosing a category routes the report to the right register: Complaint, Maintenance or Incident.',
    'Required fields change with the category so you capture the right detail without a long generic form.',
    'Attach photos where useful; the report is stamped with your name, store, time and reference number.']
TRAINING_B = ['Run or review a training session by role, department and checklist topic.',
    'Topics come from the live checklist, so training follows the real store procedure.',
    'Each session records trainee, trainer, shift, rating, achievements and improvement notes.']
HANDOVER_B = ['Record who is on duty and what the next shift must know.',
    'Capture opening notes, closing notes, key issues and follow-up actions.',
    'Handovers are saved by store and date so the next person can read the previous shift quickly.']
HISTORY_B = ['A searchable archive of submitted checklists, bin records and completed cleaning / maintenance tasks.',
    'Open any record to see task detail, staff name, notes, timestamp and photo evidence.',
    'Filter by store filter (Super) or by department and date.']
BIN_B = ['The weekly bin-collection calendar runs Monday to Sunday; only scheduled bin days can be submitted.',
    'Enter your name and bin quantity, complete every bin check, and add photo evidence before submitting.',
    'Managers can edit the active pickup days and the bin checklist tasks in Edit mode.']
SCHED_B = ['A weekly grid of cleaning and maintenance tasks grouped by department.',
    'Tick the scheduled day, attach a completion photo, add a note and save the record.',
    'Managers can edit tasks, departments, days, assigned staff, frequency and external technician details.']
DELIV_B = ['Log deliveries, drivers, pallets, crates and supplier notes.',
    'Use the New tab to record a delivery / crate return and the Records tab to audit past ones.',
    'Each store keeps its own delivery records.']
RULES_B = ['A quick handbook of store standards: customer service, food safety, hygiene, presentation and conduct.',
    'Violation records reference these rules, so any action is tied to a clear standard.',
    'Use it as a quick reference before or during a shift.']
FACE_B = ['Enrol Face ID / Touch ID on this device for faster sign-in.',
    'Each enrolment is named and can be removed later.',
    'Face ID is only a convenience; your access still follows your role and store.']
ANN_READ_B = ['Company and store announcements appear newest first; pinned notices stay on top.',
    'Tap an announcement to read the full message and view any image.',
    'Announcements are read-only for staff and department leads.']
VIOL_LEAD_B = ['Report a staff rule breach against the supermarket rule list.',
    'The system suggests the correct warning step from the person history.',
    'Your manager tracks open cases, written / final warnings and follow-up dates.']

# ================================================================ per-role section maps
STAFF = [
    LOGIN['staff'],
    ('home', '/#/home', 'My Home', ['Your personal home shows unread inbox messages, your latest announcements and quick links.',
        'It is your private workspace - you only see your own information.']),
    ('inbox', '/#/inbox', 'My Inbox', ['Read messages and documents your manager sends you.',
        'Open a message and use Reply to write back - the editor supports rich text and images.',
        'Use Message management to start a new message to your store manager.',
        'Unread messages show a count badge on the Inbox menu; everything stays in sync on the server.']),
    ('announcements', '/#/announcements', 'Announcements', ANN_READ_B),
    ('issue', '/#/issue', 'Report an Issue', ISSUE_B),
    ('myvios', '/#/myvios', 'My Violations', ['See your own standing and any warnings on record.',
        'The escalation ladder shows what each warning step means.',
        'Only you and management can see your violations.']),
    ('training', '/#/training', 'Training', TRAINING_B),
    ('feedback', '/#/feedback', 'Ideas & Feedback', ['Share an idea, suggestion or concern with management.',
        'The rich editor lets you format text and attach an image.',
        'Your feedback is sent under your account name.']),
    ('profile', '/#/profile', 'My Profile', ['View and edit your own details and profile photo.',
        'Your login password is shown here - tap the eye to reveal it or copy it.',
        'Keep your contact details current so rosters and reports stay correct.']),
]

DEPTLEAD = [
    LOGIN['staff2'],
    ('home', '/#/home', 'Dashboard', ['After login you land on the dashboard: today checklist status, open issues, alerts and quick actions.',
        'The sidebar groups the app into Operations, Reports & Rules and Account for your role.',
        'The sync badge (top-right) shows saving / saved / retrying - the app opens from cache first, then syncs.']),
    ('checklist', '/#/checklist', 'Store Operation Checklist', CHECKLIST_LEAD),
    ('issue', '/#/issue', 'Report an Issue', ISSUE_B),
    ('violation', '/#/violation', 'Report a Violation', VIOL_LEAD_B),
    ('training', '/#/training', 'Training', TRAINING_B),
    ('handover', '/#/handover', 'Shift Handover', HANDOVER_B),
    ('history', '/#/history', 'Checklist History', HISTORY_B),
    ('binadmin', '/#/binadmin', 'Bin Admin', BIN_B),
    ('schedules', '/#/schedules', 'Cleaning & Maintenance', SCHED_B),
    ('delivery', '/#/delivery/records', 'Delivery Register', DELIV_B),
    ('inbox', '/#/inbox', 'Store Inbox', ['Read and reply to messages for your store.',
        'Start a new message with Message management; everything stays in sync on the server.']),
    ('announcements', '/#/announcements', 'Announcements', ANN_READ_B),
    ('feedback', '/#/feedback', 'Share Your Thought', ['Send an idea or concern to management under your account name.',
        'The rich editor supports formatting and an image.']),
    ('rules', '/#/rules', 'Supermarket Rules', RULES_B),
    ('faceid', '/#/faceid', 'Face ID', FACE_B),
]

MANAGER = [
    LOGIN['admin'],
    ('home', '/#/home', 'Dashboard', ['Today checklist status, pending verifications, open issues, temperature alerts and quick actions for your store.',
        'The sidebar adds Staff & HR, Management and AI Lab groups for managers.',
        'The sync badge shows saving / saved / retrying; work auto-saves as you go.']),
    ('checklist', '/#/checklist', 'Store Operation Checklist (build & run)', CHECKLIST_LEAD + [
        'Managers can build the list: double-click a department, section or task to rename / delete, and use + to add.']),
    ('manager', '/#/manager', 'Manager Panel (verify)', ['Review submitted checklists with task detail, photo evidence, notes and temperature results.',
        'Open the verify drawer to add an assessment note, issues found, action / responsible person and manager photos.',
        'Verifying with a note can silently email the store manager or department lead.']),
    ('issue', '/#/issue', 'Report an Issue', ISSUE_B),
    ('complaint', '/#/complaint/records', 'Complaint Register', ['Track product, price / scanning, service, cleanliness, safety, stock and online complaints.',
        'Each record holds store, channel, severity, department, immediate action, follow-up, status and notes.',
        'Update status, review open complaints and export for follow-up.']),
    ('maintenance', '/#/maintenance/records', 'Maintenance Register', ['Track refrigeration, electrical, plumbing, POS, IT, forklift, building, cleaning, kitchen, butcher and safety issues.',
        'Records include equipment, location, priority, food-safety / trading impact, photos and repair status.']),
    ('incident', '/#/incident/records', 'Incident Register', ['Track injuries, near misses, damage, food-safety, security, dock and conflict incidents.',
        'Records include date, location, injury / medical flags, immediate action and status - a clear safety trail.']),
    ('violation', '/#/violation', 'Violation Rules', ['Record staff rule breaches against the rule list; the system suggests the right warning step from history.',
        'Track open cases, written warnings, final warnings, follow-up dates and resolved cases.']),
    ('handover', '/#/handover', 'Shift Handover', HANDOVER_B),
    ('history', '/#/history', 'Checklist History', HISTORY_B),
    ('binadmin', '/#/binadmin', 'Bin Admin', BIN_B),
    ('schedules', '/#/schedules', 'Cleaning & Maintenance', SCHED_B),
    ('delivery', '/#/delivery/records', 'Delivery Register', DELIV_B),
    ('structure', '/#/structure', 'Staff Structure', ['Each department is a chart: Level 1 lead, Level 2 staff, Level 3 new staff.',
        'Edit mode adds, renames or removes departments and the people under each level.']),
    ('staff', '/#/staff', 'Staff Members (+ Create login)', ['Your store staff list with role, department, contact, start date and status.',
        'Use the search box to find anyone by name; the count shows how many match.',
        'Use Create login on a staff row to generate that employee numeric password - give that number to the employee.',
        'Staff records feed submitted-by fields, schedules and reports; keep staff IDs stable.']),
    ('schedule', '/#/schedule', 'Job Schedule', ['Define department duties, teams and day-to-day responsibilities.',
        'Edit mode adjusts duties and job descriptions for Cashier, FV, Grocery, Frozen & Dairy, Butcher and more.']),
    ('performance', '/#/performance', 'Performance & Scoring', ['Combines attendance, training, violations, rewards and activity into a staff scorecard.',
        'Review performance bands and trends to support fair reviews with recorded evidence.']),
    ('training', '/#/training', 'Training Assessment', TRAINING_B),
    ('reward', '/#/reward', 'Monthly Rewards', ['Record awards such as Employee of the Month, Best Service, Team Player, Perfect Attendance and Cleanliness Champion.',
        'Each entry can hold month, staff member, store, amount, notes and status.']),
    ('raise', '/#/raise', 'Raise Salary Review', ['Prepare salary reviews with current rate, proposed rate, effective date and manager notes.',
        'Reference the performance scorecard to support the recommendation.']),
    ('birthday', '/#/birthday', 'Birthday Giveaways', ['Track staff birthdays and planned gifts by store.',
        'Record favourite gift, planned / given status and notes.']),
    ('analytics', '/#/analytics', 'Analytics', ['See within-store analytics: record volume, severity, open load and operational risk.',
        'Use it for weekly management review.']),
    ('photos', '/#/photos', 'Photo Gallery', ['Collects photo evidence from checklists, reports, bin records and cleaning / maintenance.',
        'Filter by department, area, task, date and source.']),
    ('whatsapp', '/#/whatsapp', 'WhatsApp Daily Share', ['Build a branded PDF for the selected session with results, photos and temperature alerts.',
        'Share it to WhatsApp or copy a text summary for the team.']),
    ('email', '/#/email', 'Email Notifications', ['Emails send automatically and silently through the server relay.',
        'Assign recipients to issue categories and checklist departments; add daily-summary recipients.',
        'Sent History confirms delivery.']),
    ('data', '/#/data', 'Data Management & Backup', ['Download a full JSON backup of records, staff, checklist submissions, schedules, bin records and audit logs.',
        'Clean-up tools delete old records by module, store or date range after exporting.']),
    ('aiuse', '/#/aiuse', 'AI Lab & AI Assistant', ['AI Lab is a safe area for operational AI tools: area image checks, expiry / price reading, stock estimate, FIFO, complaint assistant and report ideas.',
        'The AI Assistant turns a plain-English instruction (e.g. "send a lateness violation to Huu Anh") into a matched violation rule and a professional write-up.',
        'Review the recipients and description on the confirm screen, then send - one instruction can reach several staff at once.']),
    ('inbox', '/#/inbox', 'Store Inbox & Compose', ['Read and reply to store messages, feedback and documents.',
        'Use Compose / Message management to send a document or message to a staff member inbox.',
        'Everything stays in sync on the server and is never lost.']),
    ('announcements', '/#/announcements', 'Announcements (post)', ['Post an announcement to your store; add a title, rich text and an image.',
        'Pin important notices so they stay on top; posts appear instantly for your team.']),
    ('feedback', '/#/feedback', 'Share Your Thought', ['Read staff ideas and feedback for your store.']),
    ('rules', '/#/rules', 'Supermarket Rules', RULES_B),
    ('faceid', '/#/faceid', 'Face ID', FACE_B),
]

SUPER = [
    LOGIN['super'],
    ('storefilter', '/#/home', 'The store filter bar', ['A green bar sits directly under the top bar: "Viewing store".',
        'Leave it on All stores to see the whole company, or pick one store to focus every page on it.',
        'The choice scopes the dashboard, checklist, records, staff, analytics and more - the crumbs show the active store.']),
    ('home', '/#/home', 'Cross-store Dashboard', ['A cross-store command centre: open items, critical / major counts and per-store open load & risk.',
        'Use the store filter to drill into one store or compare all.']),
    ('checklist', '/#/checklist', 'Store Operation Checklist', CHECKLIST_LEAD + [
        'With the store filter you can view any store checklist; one long list per department with section headings.']),
    ('storeconfig', '/#/storeconfig', 'Manage Store Config', ['Choose one store and edit it without affecting the others.',
        'Tabs cover Staff, Checklist and Schedules for the selected branch.',
        'This is the main place to customise each store staff list, checklist template and schedules.']),
    ('manager', '/#/manager', 'Manager Panel (verify)', ['Review and verify submitted checklists across any store.',
        'Add assessment notes, issues found and manager photos; the note can be emailed silently.']),
    ('issue', '/#/issue', 'Report an Issue', ISSUE_B),
    ('complaint', '/#/complaint/records', 'Complaint Register (all stores)', ['Every store complaints in one place; filter to a single store with the store bar.']),
    ('maintenance', '/#/maintenance/records', 'Maintenance Register (all stores)', ['All maintenance cases across stores with equipment, priority and status.']),
    ('incident', '/#/incident/records', 'Incident Register (all stores)', ['All incidents across stores - the company safety and risk trail.']),
    ('violation', '/#/violation', 'Violation Rules', ['Company-wide view of staff rule breaches and warning steps; filter by store.']),
    ('analytics', '/#/analytics', 'Cross-store Analytics', ['Compare record volume, severity, open load and risk across every branch.',
        'Supports company-wide weekly review and branch comparison.']),
    ('staff', '/#/staff', 'Staff Members (all stores)', ['Every store staff list; the store bar filters to one store, and the search box finds anyone by name.',
        'Create login generates an employee numeric password on the right store.']),
    ('email', '/#/email', 'Email Notifications & routing', ['Route issue categories and checklist departments to recipients across stores.',
        'Email a whole store or add an all-store recipient for daily summaries; Sent History confirms delivery.']),
    ('data', '/#/data', 'Data Management & Backup', ['Full JSON backup and clean-up tools scoped by module, store or date range.']),
    ('aiuse', '/#/aiuse', 'AI Lab & AI Assistant', ['The AI Assistant reads a plain-English instruction, matches the violation rule and writes a professional description.',
        'One instruction can send to several staff in different stores at once - review the recipient chips, then send.']),
    ('inbox', '/#/inbox', 'Unified Inbox', ['One inbox for feedback, violations and issues from every store.',
        'Reply, compose documents and keep the whole company conversation in one place.']),
    ('announcements', '/#/announcements', 'Company Announcements', ['Post to a single store or company-wide (All stores).',
        'Pin key notices; posts appear instantly for the chosen audience.']),
    ('feedback', '/#/feedback', 'Feedback Inbox', ['Read staff ideas and feedback from every store in one list.']),
    ('faceid', '/#/faceid', 'Face ID', FACE_B),
]

BA = [
    LOGIN['ba'],
    ('baview', '/#/baview', 'Checklist Results', ['A read-only viewer of checklist results across every store.',
        'Choose a store, date and session (Opening / Mid-afternoon / Closing) to see what was completed.',
        'You can review task detail and photo evidence but cannot edit anything.']),
]

ROLE_GUIDES = {
    'staff':    {'file': 'MCQ_Guide_Staff.pdf',           'title': 'Staff Guide',            'sub': 'For every store team member',            'login': ('employee', None, None),  'sections': STAFF},
    'deptlead': {'file': 'MCQ_Guide_DepartmentLead.pdf',  'title': 'Department Lead Guide',  'sub': 'Run your store day to day',              'login': ('staff', 'Demo', '0000'), 'sections': DEPTLEAD},
    'manager':  {'file': 'MCQ_Guide_Manager.pdf',         'title': 'Manager Guide',          'sub': 'Manage your whole store',                'login': ('admin', 'Demo', '0000'), 'sections': MANAGER},
    'super':    {'file': 'MCQ_Guide_SuperAdmin.pdf',      'title': 'Super Admin Guide',      'sub': 'Oversee and configure every store',      'login': ('super', None, SUPER_PW), 'sections': SUPER},
    'ba':       {'file': 'MCQ_Guide_ChuBa.pdf',           'title': 'Chu Ba Guide',           'sub': 'Read-only oversight of all stores',      'login': ('ba', None, BA_PW),       'sections': BA},
}


# ================================================================ small HTTP helper (staff setup)
def api(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method='POST' if data is not None else 'GET')
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def staff_setup():
    """Create the throw-away Demo employee, seed a couple of inbox messages, return (token, password)."""
    tok = api('/api/login', {'mode': 'super', 'password': SUPER_PW})['token']
    acct = api('/api/staff-account', {'store': 'Demo', 'staff_id': GUIDE_SID, 'name': GUIDE_NAME}, tok)['account']
    for subj, html in [('Welcome to the MCQ Supermarket app',
                        '<p>Welcome to the team! Please review the Opening checklist before your first shift and reply if you have any questions.</p>'),
                       ('This week roster',
                        '<p>Your shift on Saturday starts at <b>8:00am</b>. Please arrive 10 minutes early for the handover.</p>')]:
        try:
            api('/api/message', {'kind': 'message', 'store': 'Demo', 'to_staff_id': GUIDE_SID,
                                 'subject': subj, 'body_html': html}, tok)
        except Exception as e:
            print('  seed message skipped:', e)
    return tok, acct['password']


def staff_cleanup(tok):
    try:
        api('/api/staff-account/delete', {'store': 'Demo', 'staff_id': GUIDE_SID}, tok)
        gone = not any(a['staff_id'] == GUIDE_SID for a in api('/api/staff-accounts/Demo', token=tok)['accounts'])
        print('  cleanup: temp Demo employee removed =', gone)
    except Exception as e:
        print('  cleanup skipped:', e)


# ================================================================ screenshots
async def shoot(role, meta):
    shots = {}
    mode, branch, pw = meta['login']
    staff_token = None
    if role == 'staff':
        staff_token, pw = staff_setup()

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, device_scale_factor=2)
        pg = await ctx.new_page()

        async def login():
            await pg.goto(BASE + '/', wait_until='networkidle')
            if not await pg.query_selector('#login-mode'):
                try: await pg.evaluate("window.logout && window.logout()")
                except Exception: pass
                await pg.wait_for_timeout(900)
                await pg.goto(BASE + '/', wait_until='networkidle')
            await pg.wait_for_selector('#login-mode', timeout=8000)
            await pg.evaluate("document.querySelector('#login-mode .seg-btn[data-mode=\"%s\"]').click()" % mode)
            if mode in ('admin', 'staff'):
                await pg.select_option('#login-branch', branch)
            await pg.fill('#login-pw', pw)
            await pg.click('.login-btn')
            await pg.wait_for_timeout(4000)

        try:
            await login()
            wait = 3400 if role == 'super' else 2300
            for key, route, title, _bullets in meta['sections']:
                try:
                    await pg.goto(BASE + route, wait_until='domcontentloaded')
                    await pg.wait_for_timeout(wait)
                    if key == 'manager':
                        try:
                            await pg.evaluate("(()=>{const b=document.querySelector('.pv-card button[onclick^=\"mgrReview\"]'); if(b) b.click();})()")
                            await pg.wait_for_timeout(1000)
                        except Exception:
                            pass
                    path = os.path.join(SHOTS, '%s_%s.png' % (role, key))
                    await pg.screenshot(path=path)
                    shots[key] = path
                    print('  shot', role, key)
                except Exception as e:
                    print('  skip', role, key, e)
        finally:
            await b.close()

    if staff_token:
        staff_cleanup(staff_token)
    return shots


# ================================================================ PDF helpers
class Guide(FPDF):
    pass


def _cover(pdf, PWpt, CW, M, big, small):
    pdf.add_page()
    pdf.set_fill_color(*GREEN); pdf.rect(0, 0, PWpt, pdf.h, 'F')
    logo = os.path.join(ROOT, 'assets', 'mcq-logo-exact.png')
    if os.path.isfile(logo):
        try: pdf.image(logo, x=PWpt / 2 - 60, y=200, w=120)
        except Exception: pass
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 30); pdf.set_xy(M, 352); pdf.cell(CW, 36, S('MCQ Supermarket'), align='C')
    pdf.set_font('Helvetica', 'B', 20); pdf.set_xy(M, 396); pdf.cell(CW, 26, S(big), align='C')
    pdf.set_font('Helvetica', '', 12); pdf.set_xy(M, 438); pdf.cell(CW, 18, S(small), align='C')
    pdf.set_xy(M, 462); pdf.cell(CW, 18, S(APP_URL), align='C')
    pdf.set_xy(M, 484); pdf.cell(CW, 18, S('Updated ' + time.strftime('%d %b %Y')), align='C')


def build_role_pdf(role, meta, shots):
    pdf = Guide(unit='pt', format='A4')
    pdf.set_auto_page_break(auto=True, margin=44)
    PWpt = pdf.w; M = 40; CW = PWpt - 2 * M
    _cover(pdf, PWpt, CW, M, meta['title'], meta['sub'])

    # contents
    pdf.add_page()
    pdf.set_text_color(*GREEN); pdf.set_font('Helvetica', 'B', 20); pdf.set_xy(M, 44); pdf.cell(CW, 26, S('Contents')); pdf.ln(36)
    for i, (key, route, title, _b) in enumerate(meta['sections'], 1):
        if pdf.get_y() > pdf.h - 60:
            pdf.add_page(); pdf.set_xy(M, 44)
        pdf.set_text_color(*INK); pdf.set_font('Helvetica', '', 11); pdf.set_x(M + 8)
        pdf.cell(CW - 8, 16, S('%d.  %s' % (i, title))); pdf.ln(16)

    # sections
    for n, (key, route, title, bullets) in enumerate(meta['sections'], 1):
        pdf.add_page()
        pdf.set_fill_color(*GREEN); pdf.rect(0, 0, PWpt, 52, 'F')
        pdf.set_text_color(255, 255, 255); pdf.set_font('Helvetica', 'B', 15)
        pdf.set_xy(M, 17); pdf.cell(CW, 22, S('%d. %s' % (n, title)))
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
        pdf.set_xy(M, y); pdf.set_text_color(*DARK); pdf.set_font('Helvetica', '', 12)
        for bl in bullets:
            pdf.set_x(M); pdf.multi_cell(CW, 17, S('-  ' + bl)); pdf.ln(2)

    outp = os.path.join(GUIDES, meta['file'])
    pdf.output(outp)
    print('WROTE', meta['file'], os.path.getsize(outp), 'bytes')


# ================================================================ passwords PDF
def build_passwords_pdf():
    pdf = FPDF(unit='pt', format='A4')
    pdf.set_auto_page_break(auto=True, margin=44)
    PWpt = pdf.w; M = 40; CW = PWpt - 2 * M

    # cover
    pdf.add_page()
    pdf.set_fill_color(17, 24, 39); pdf.rect(0, 0, PWpt, pdf.h, 'F')
    logo = os.path.join(ROOT, 'assets', 'mcq-logo-exact.png')
    if os.path.isfile(logo):
        try: pdf.image(logo, x=PWpt / 2 - 55, y=210, w=110)
        except Exception: pass
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 26); pdf.set_xy(M, 350); pdf.cell(CW, 32, S('Accounts & Passwords'), align='C')
    pdf.set_font('Helvetica', 'B', 14); pdf.set_text_color(248, 113, 113)
    pdf.set_xy(M, 392); pdf.cell(CW, 22, S('CONFIDENTIAL - INTERNAL ONLY'), align='C')
    pdf.set_text_color(220, 220, 220); pdf.set_font('Helvetica', '', 11)
    pdf.set_xy(M, 430); pdf.cell(CW, 16, S(APP_URL), align='C')
    pdf.set_xy(M, 450); pdf.cell(CW, 16, S('Generated ' + time.strftime('%d %b %Y')), align='C')

    # content page
    pdf.add_page()
    pdf.set_text_color(*GREEN); pdf.set_font('Helvetica', 'B', 18); pdf.set_xy(M, 44)
    pdf.cell(CW, 24, S('How to sign in')); pdf.ln(30)
    pdf.set_text_color(*DARK); pdf.set_font('Helvetica', '', 11); pdf.set_x(M)
    pdf.multi_cell(CW, 16, S('Open %s. On the sign-in screen pick the role tab, then (for Manager and Dept Lead) '
                             'choose the store and type the password below. Super Admin and Chu Ba do not choose a store.'
                             % APP_URL)); pdf.ln(10)

    # super + chu ba block
    pdf.set_fill_color(236, 253, 245); pdf.set_draw_color(167, 243, 208)
    pdf.set_x(M); pdf.set_font('Helvetica', 'B', 12); pdf.set_text_color(*GREEN)
    pdf.cell(CW, 20, S('Company logins (no store)'), border=0, ln=1); pdf.ln(2)
    pdf.set_font('Helvetica', '', 12); pdf.set_text_color(*DARK)
    for label, val in [('Super Admin  (tab: Super)', SUPER_PW), ('Chu Ba  (tab: Chu Ba, read-only)', BA_PW)]:
        pdf.set_x(M); pdf.cell(CW * 0.6, 20, S('  ' + label), border=1)
        pdf.set_font('Helvetica', 'B', 12); pdf.cell(CW * 0.4, 20, S(str(val)), border=1, align='C', ln=1)
        pdf.set_font('Helvetica', '', 12)
    pdf.ln(14)

    # per-store table
    pdf.set_x(M); pdf.set_font('Helvetica', 'B', 12); pdf.set_text_color(*GREEN)
    pdf.cell(CW, 20, S('Store logins'), ln=1); pdf.ln(2)
    c1, c2, c3 = CW * 0.44, CW * 0.28, CW * 0.28
    pdf.set_font('Helvetica', 'B', 11); pdf.set_text_color(255, 255, 255); pdf.set_fill_color(*GREEN)
    pdf.set_x(M)
    pdf.cell(c1, 22, S('  Store'), border=1, fill=True)
    pdf.cell(c2, 22, S('Manager'), border=1, align='C', fill=True)
    pdf.cell(c3, 22, S('Dept Lead'), border=1, align='C', fill=True, ln=1)
    pdf.set_text_color(*DARK); pdf.set_font('Helvetica', '', 11)
    for i, s in enumerate(STORES):
        pdf.set_fill_color(*(247, 250, 252) if i % 2 else (255, 255, 255))
        pdf.set_x(M)
        pdf.cell(c1, 20, S('  ' + s), border=1, fill=True)
        pdf.set_font('Helvetica', 'B', 11)
        pdf.cell(c2, 20, S(str(ADMIN_PW.get(s, '-'))), border=1, align='C', fill=True)
        pdf.cell(c3, 20, S(str(BRANCH_PW.get(s, '-'))), border=1, align='C', fill=True, ln=1)
        pdf.set_font('Helvetica', '', 11)
    pdf.ln(16)

    pdf.set_x(M); pdf.set_font('Helvetica', 'B', 12); pdf.set_text_color(*GREEN)
    pdf.cell(CW, 18, S('Staff (individual employee) logins'), ln=1)
    pdf.set_font('Helvetica', '', 11); pdf.set_text_color(*DARK); pdf.set_x(M)
    pdf.multi_cell(CW, 16, S('Staff passwords are NOT listed here. A Manager or Super Admin creates each one from '
                             'Staff Members > Create login on the employee row; the generated number is given to that '
                             'employee, who signs in on the Staff tab (no store needed). Reset or remove a login from '
                             'the same row at any time.'))
    pdf.ln(10); pdf.set_x(M); pdf.set_text_color(180, 30, 30); pdf.set_font('Helvetica', 'B', 10)
    pdf.multi_cell(CW, 15, S('Keep this document confidential. Distribute only to people who must have it, and change '
                             'passwords if it is ever exposed.'))

    outp = os.path.join(GUIDES, 'MCQ_Accounts_Passwords.pdf')
    pdf.output(outp)
    print('WROTE MCQ_Accounts_Passwords.pdf', os.path.getsize(outp), 'bytes')


# ================================================================ intro email
def build_email():
    rows = ''.join('<tr><td style="padding:6px 10px;border:1px solid #d1fae5">%s</td>'
                   '<td style="padding:6px 10px;border:1px solid #d1fae5"><b>%s</b></td>'
                   '<td style="padding:6px 10px;border:1px solid #d1fae5"><b>%s</b></td></tr>' % (s, ADMIN_PW.get(s, '-'), BRANCH_PW.get(s, '-'))
                   for s in STORES)
    html = """<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:620px;margin:0 auto;background:#ffffff">
    <div style="background:linear-gradient(135deg,#0e9f6e,#0891b2);padding:26px 30px;color:#fff">
      <div style="font-size:22px;font-weight:800">MCQ Supermarket - Operations App</div>
      <div style="opacity:.92;margin-top:4px">Your new all-in-one store operations workspace</div>
    </div>
    <div style="padding:26px 30px;line-height:1.6;font-size:15px">
      <p>Hi team,</p>
      <p>We are rolling out the <b>MCQ Supermarket Operations app</b> - one place for daily checklists, photo proof,
      shift handover, reports, staff & HR, announcements and analytics.</p>
      <p><b>Open the app:</b><br>
      <a href="{url}" style="color:#0e9f6e;font-weight:700">{url}</a></p>
      <p><b>Install it like an app:</b> open the link, then use your browser menu to
      <i>Add to Home Screen</i> (phone) or <i>Install</i> (computer).</p>
      <p><b>How to sign in:</b> on the sign-in screen pick your role tab, then:</p>
      <ul>
        <li><b>Staff</b> - no store; sign in with the numeric password your manager creates for you.</li>
        <li><b>Department Lead</b> - choose your store, then your store Dept-Lead password.</li>
        <li><b>Manager</b> - choose your store, then your store Manager password.</li>
        <li><b>Super Admin / Chu Ba</b> - no store; use the password on the confidential sheet.</li>
      </ul>
      <p>Your full role passwords for each store are in the attached <b>confidential accounts &amp; passwords sheet</b>,
      and a step-by-step illustrated guide is attached for your role.</p>
      <p>Any questions, just reply to this email.</p>
      <p>Thank you,<br>MCQ International</p>
    </div>
    <div style="background:#f8fafc;padding:14px 30px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">
      Please keep passwords confidential. This email was sent to introduce the MCQ Supermarket app.
    </div>
  </div>
</body></html>""".format(url=APP_URL)

    txt = """MCQ Supermarket - Operations App

Hi team,

We are rolling out the MCQ Supermarket Operations app - one place for daily
checklists, photo proof, shift handover, reports, staff & HR, announcements
and analytics.

Open the app:
  {url}

Install it like an app: open the link, then use your browser menu to
"Add to Home Screen" (phone) or "Install" (computer).

How to sign in - pick your role tab on the sign-in screen, then:
  - Staff: no store; use the numeric password your manager creates for you.
  - Department Lead: choose your store, then your store Dept-Lead password.
  - Manager: choose your store, then your store Manager password.
  - Super Admin / Chu Ba: no store; use the password on the confidential sheet.

Your full role passwords for each store are in the attached confidential
accounts & passwords sheet, and a step-by-step illustrated guide is attached
for your role.

Any questions, just reply to this email.

Thank you,
MCQ International
""".format(url=APP_URL)

    open(os.path.join(GUIDES, 'intro_email.html'), 'w', encoding='utf-8').write(html)
    open(os.path.join(GUIDES, 'intro_email.txt'), 'w', encoding='utf-8').write(txt)
    print('WROTE intro_email.html / intro_email.txt')


# ================================================================ main
def main():
    for role, meta in ROLE_GUIDES.items():
        print('== capturing', role, '==')
        shots = asyncio.run(shoot(role, meta))
        build_role_pdf(role, meta, shots)
    build_passwords_pdf()
    build_email()
    print('\nAll documents written to', GUIDES)


if __name__ == '__main__':
    main()
