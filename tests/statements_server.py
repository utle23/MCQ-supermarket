"""Restaurant statements + the Claude AI layer — logic and endpoints against a
throwaway sqlite DB. The model is never called: ai.vision / the client are stubbed.
Run:  python3 tests/statements_server.py                                       """
import io, json, os, shutil, sys, tempfile

TMP = tempfile.mkdtemp(prefix='mcqstmt_')
os.environ['DATA_DIR'] = TMP
os.environ['UPLOADS_DIR'] = os.path.join(TMP, 'uploads')
for k in ('IMAGEKIT_URL_ENDPOINT', 'IMAGEKIT_PRIVATE_KEY', 'ANTHROPIC_API_KEY'):
    os.environ.pop(k, None)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server')); sys.path.insert(0, ROOT)
os.chdir(ROOT)

import db, ai, statements as S, app as backend   # noqa: E402
from flask import Flask                         # noqa: E402
from PIL import Image                           # noqa: E402

fails = []
def check(n, c, e=None):
    print(('  ok   ' if c else '  FAIL ') + n + (('  -> ' + repr(e)) if (not c and e is not None) else ''))
    if not c: fails.append(n)

def jpeg(w=800, h=600, color=(240, 240, 230), exif_orient=None):
    im = Image.new('RGB', (w, h), color); out = io.BytesIO()
    if exif_orient:
        ex = Image.Exif(); ex[0x0112] = exif_orient
        im.save(out, 'JPEG', quality=80, exif=ex.tobytes())
    else:
        im.save(out, 'JPEG', quality=80)
    return out.getvalue()

CFG = S.DEFAULT_CONFIG
try:
    print('\n1. reading handwriting into numbers')
    check('diacritics folded', S.fold(' Thịt ') == 'thit', S.fold(' Thịt '))
    check('Quay is roast pork', S.match_product('Quay', CFG['products']) == 'pork')
    check('Thit / Thịt is traditional', S.match_product('Thịt', CFG['products']) == 'trad')
    check('"Thit quay" is pork, not traditional', S.match_product('Thit quay', CFG['products']) == 'pork')
    check('Gà is chicken', S.match_product('Gà', CFG['products']) == 'chicken')
    check('unknown item is unmatched', S.match_product('Spring rolls', CFG['products']) is None)
    check('97,5 is 97.5', S.to_number('97,5') == 97.5)
    check('1,250 is a thousand', S.to_number('1,250') == 1250)
    check('$39.00', S.to_number('$39.00') == 39)
    check('30/10/26 -> 2026-10-30', S.parse_date('30/10/26') == '2026-10-30')
    check('day/month order (Australia)', S.parse_date('3/10/26') == '2026-10-03')
    check('31/11 is not a date', S.parse_date('31/11/26') is None)
    check('no year takes the batch month', S.parse_date('5/10', '2026-10') == '2026-10-05')
    check('chicken is $6.50', S.price_of('chicken', CFG['products']) == 6.5)
    p = S.ai_prompt(CFG, '2026-10')
    check('prompt names the month and the prices', 'October 2026' in p and '$5.50' in p and 'never correct' in p)
    check('prompt asks for care and for doubt', 'digit by digit' in p and '"sure"' in p and 'date_sure' in p)
    un = S.normalise({'number': '12', 'number_sure': True, 'date': '3/10/26', 'date_sure': False,
                      'lines': [{'qty': 6, 'item': 'Quay', 'amount': 39, 'sure': True},
                                {'qty': 4, 'item': 'Thit', 'amount': 22, 'sure': False}], 'total': 61}, CFG, '2026-10')
    check('doubt is kept', un['unsure'] == ['the date', 'line 2 (Thit)'], un['unsure'])
    uw = S.note_warnings(un, CFG, '2026-10')
    check('and shown as a check', [w['code'] for w in uw] == ['unsure'] and 'line 2' in uw[0]['text'], uw)
    check('not once a person typed it', S.note_warnings(dict(un, by='person'), CFG, '2026-10') == [])

    print('\n2. every line is re-priced; disagreements become warnings')
    good = S.normalise({'number': '0053', 'date': '30/10/26', 'to': 'M&MW Beechboro', 'from': 'MCQ',
                        'lines': [{'qty': 6, 'item': 'Quay', 'amount': 39},
                                  {'qty': '15', 'item': 'Thịt', 'amount': '82,5'}],
                        'total': 121.5, 'readable': True}, CFG, '2026-10')
    check('number loses leading zeros', good['number'] == '53', good['number'])
    check('items matched', [l['product'] for l in good['lines']] == ['pork', 'trad'])
    check('a clean note has no warnings', S.note_warnings(good, CFG, '2026-10') == [], S.note_warnings(good, CFG, '2026-10'))
    bad = json.loads(json.dumps(good)); bad['lines'][0]['amount'] = 38; bad['date'] = '2026-11-02'
    bad['lines'].append({'qty': 2, 'item': 'Pho', 'product': None, 'amount': 20})
    codes = [w['code'] for w in S.note_warnings(bad, CFG, '2026-10')]
    check('wrong line sum flagged', 'line_math' in codes, codes)
    check('wrong total flagged', 'total_math' in codes, codes)
    check('unknown product flagged', 'unknown_product' in codes, codes)
    check('date outside the month flagged', 'date_outside' in codes, codes)
    unr = S.normalise({'readable': False}, CFG, '2026-10')
    check('not a delivery note', [w['code'] for w in S.note_warnings(unr, CFG, '2026-10')] == ['unreadable'])

    print('\n3. the month adds up')
    notes = [{'id': 'a', 'data': good},
             {'id': 'b', 'data': dict(good, number='54', lines=[{'qty': 4, 'product': 'chicken', 'amount': 26}])},
             {'id': 'c', 'data': dict(good, number='57', date='2026-10-03')},
             {'id': 'd', 'data': dict(good, number='57', date=None)}]
    st = S.build_statement(notes, CFG, 'beechboro', '2026-10')
    check('31 day rows', len(st['days']) == 31)
    d30 = st['days'][29]
    check('two notes on the 30th summed', d30['qty'] == {'pork': 6, 'trad': 15, 'chicken': 4}, d30['qty'])
    check('weekend flagged (3 Oct 2026 is a Saturday)', st['days'][2]['weekday'] == 5)
    tot = {t['product']: (t['qty'], t['amount']) for t in st['totals']}
    check('totals priced from the list', tot == {'pork': (12, 78.0), 'trad': (30, 165.0), 'chicken': (4, 26.0)}, tot)
    check('grand total', st['grand_total'] == 269.0, st['grand_total'])
    check('undated note left out and reported', [x['id'] for x in st['left_out']] == ['d'], st['left_out'])
    sw = S.set_warnings(notes)
    check('duplicate number found', sw['duplicates'] == ['57'], sw)
    check('gaps in the run found', sw['missing'] == ['55', '56'], sw)
    check('invoice folder', S.folder_for(CFG['customers'][0]) == '/mcq/invoices/beechboro')

    print('\n4. photos are made acceptable to the model')
    small = jpeg()
    d, m = ai.prepare_image(small, 'image/jpeg')
    check('a fine photo is sent untouched', d == small and m == 'image/jpeg')
    big = io.BytesIO(); Image.new('RGB', (4000, 3000), (200, 200, 200)).save(big, 'PNG')
    d, m = ai.prepare_image(big.getvalue(), 'image/png')
    check('a huge photo is shrunk to 2000px JPEG', m == 'image/jpeg' and max(Image.open(io.BytesIO(d)).size) == 2000)
    rot = jpeg(800, 600, exif_orient=6)
    d, m = ai.prepare_image(rot, 'image/jpeg')
    check('a sideways phone photo is turned upright', Image.open(io.BytesIO(d)).size == (600, 800))
    try:
        ai.prepare_image(b'not an image', 'image/heic'); check('unreadable format refused', False)
    except ValueError:
        check('unreadable format refused', True)

    print('\n5. the Claude call')
    txt, err = ai.vision(small, 'image/jpeg', 'x')
    check('no key -> clean error, no call', txt is None and 'ANTHROPIC_API_KEY' in err, err)
    sent = {}
    class _B:
        def __init__(s, t, x=''): s.type = t; s.text = x
    class _R:
        def __init__(s, stop='end_turn', blocks=None): s.stop_reason = stop; s.content = blocks or []
    class _M:
        def __init__(s): s.reply = _R(blocks=[_B('thinking'), _B('text', '{"ok":1}')])
        def create(s, **kw): sent.clear(); sent.update(kw); return s.reply
    class _Beta:
        def __init__(s, m): s.messages = m
    class _C:
        def __init__(s): s.messages = _M(); s.beta = _Beta(s.messages); s.opts = None
        def with_options(s, **kw): s.opts = kw; return s
    fake = _C(); ai._client = fake; os.environ['ANTHROPIC_API_KEY'] = 'test-not-a-key'
    txt, err = ai.vision(small, 'image/jpeg', 'read it', effort='medium')
    check('text block returned, thinking skipped', txt == '{"ok":1}' and err is None, (txt, err))
    check('Haiku 5.5', sent.get('model') == 'claude-haiku-5-5', sent.get('model'))
    check('effort passed', sent.get('output_config') == {'effort': 'medium'})
    check('no temperature sent (rejected by the model)', 'temperature' not in sent)
    blk = sent['messages'][0]['content']
    check('image block then prompt', blk[0]['type'] == 'image' and blk[0]['source']['media_type'] == 'image/jpeg' and blk[1]['text'] == 'read it')
    ai.chat([{'role': 'system', 'content': 'be terse'}, {'role': 'user', 'content': 'hi'}])
    check('system turn becomes the system prompt', sent.get('system') == 'be terse' and sent['messages'] == [{'role': 'user', 'content': 'hi'}])
    big = io.BytesIO(); Image.new('RGB', (3600, 2700), (200, 200, 200)).save(big, 'JPEG')
    txt, err = ai.vision(big.getvalue(), 'image/jpeg', 'read it', effort='high', model=ai.STRONG_MODEL)
    check('delivery notes go to Opus 5.5', sent.get('model') == 'claude-opus-5-5', sent.get('model'))
    check('with the refusal fallback opted in', sent.get('betas') == ['server-side-fallback-2026-07-01'] and sent.get('fallbacks') == 'default')
    check('room to think, and a longer wait', sent.get('max_tokens') >= 16000 and fake.opts == {'timeout': 100.0})
    sent_img = Image.open(io.BytesIO(__import__('base64').b64decode(sent['messages'][0]['content'][0]['source']['data'])))
    check('Opus gets the photo at 2576px', max(sent_img.size) == 2576, sent_img.size)
    ai.vision(small, 'image/jpeg', 'x')
    check('everything else stays on Haiku, no beta', sent.get('model') == 'claude-haiku-5-5' and 'betas' not in sent)
    fake.messages.reply = _R(stop='refusal')
    txt, err = ai.vision(small, 'image/jpeg', 'x')
    check('a refusal is an error, not an empty read', txt is None and 'declined' in err, err)

    print('\n6. endpoints')
    db.init_db()
    fl = Flask(__name__); fl.register_blueprint(backend.api); cl = fl.test_client()
    sup = db.issue_token('super', None, staff_name='Super')
    mgr = db.issue_token('admin', 'Morley', staff_name='Morley Mgr')
    mgr2 = db.issue_token('admin', 'Malaga', staff_name='Malaga Mgr')
    lead = db.issue_token('staff', 'Morley', staff_name='Lead')
    ba = db.issue_token('ba', None, staff_name='Chu Ba')
    H = lambda t: {'Authorization': 'Bearer ' + t}
    j = cl.get('/api/stmt/config', headers=H(sup)).get_json()
    check('super sees Beechboro', [c['id'] for c in j['customers']] == ['beechboro'] and j['canConfig'])
    check('health reports the AI model, never the key',
          cl.get('/api/health').get_json().get('ai') == 'claude-haiku-5-5'
          and cl.get('/api/health').get_json().get('ai_notes') == 'claude-opus-5-5')
    for t, n in ((mgr, 'a manager (no store granted yet)'), (lead, 'a dept lead'), (ba, 'Chu Ba')):
        check('%s is kept out' % n, cl.get('/api/stmt/config', headers=H(t)).status_code == 403)
    r = cl.post('/api/stmt/config', headers=H(mgr), json={'products': []})
    check('a manager cannot change prices', r.status_code == 403)
    r = cl.post('/api/stmt/config', headers=H(sup), json={'customers': [{'id': 'beechboro', 'stores': ['Morley', 'Nowhere']}]})
    check('super grants Morley', r.get_json()['customers'][0]['stores'] == ['Morley'], r.get_json())
    check('Morley manager now in', cl.get('/api/stmt/config', headers=H(mgr)).status_code == 200)
    check('Malaga manager still out', cl.get('/api/stmt/config', headers=H(mgr2)).status_code == 403)
    check('bad month refused', cl.get('/api/stmt/notes?customer=beechboro&month=2026-13', headers=H(sup)).status_code == 400)

    def up(tok, data, month='2026-10'):
        return cl.post('/api/stmt/notes', headers=H(tok), content_type='multipart/form-data',
                       data={'customer': 'beechboro', 'month': month, 'image': (io.BytesIO(data), 'n.jpg', 'image/jpeg')})
    r = up(sup, jpeg(color=(250, 250, 250))); n1 = r.get_json()['note']
    check('photo stored as a pending note', r.get_json()['ok'] and n1['status'] == 'pending', r.get_json())
    files = os.listdir(os.path.join(TMP, 'uploads', 'invoices', 'beechboro'))
    check('in the Beechboro invoice folder', files == [n1['id'] + '.jpg'], files)
    r = up(mgr, jpeg(color=(250, 250, 250)))
    check('same photo twice is not added twice', r.get_json().get('duplicate') and r.get_json()['note']['id'] == n1['id'])
    check('Malaga cannot upload', up(mgr2, jpeg(color=(1, 2, 3))).status_code == 403)

    calls = []
    def fake_vision(img, mime, prompt, effort='low', max_tokens=8000, model=None):
        calls.append((prompt, effort, model))
        return json.dumps({'number': '0080', 'date': '30/10/26', 'to': 'M&MW', 'from': 'MCQ',
                           'lines': [{'qty': 6, 'item': 'Quay', 'amount': 39}, {'qty': 15, 'item': 'Thit', 'amount': 82.5}],
                           'total': 121.5, 'readable': True}), None
    real_vision = ai.vision; ai.vision = fake_vision
    r = cl.post('/api/stmt/notes/%s/read' % n1['id'], headers=H(sup), json={}).get_json()
    check('read by Claude', r['ok'] and r['note']['status'] == 'read' and r['note']['data']['number'] == '80', r)
    check('handwriting read by Opus thinking hard, month in the prompt',
          calls and calls[-1][1] == 'high' and calls[-1][2] == 'claude-opus-5-5' and 'October 2026' in calls[-1][0], calls[-1][1:])
    check('the note records which model read it', r['note']['data']['model'] == 'claude-opus-5-5')
    r = cl.post('/api/stmt/notes/%s/read' % n1['id'], headers=H(sup), json={}).get_json()
    check('an already-read note is not paid for again', r.get('busy') and len(calls) == 1, (r, len(calls)))
    r = cl.post('/api/stmt/notes/%s/read' % n1['id'], headers=H(sup), json={'again': True}).get_json()
    check('"Read again" does re-read', r['ok'] and len(calls) == 2)

    n2 = up(sup, jpeg(color=(10, 200, 10))).get_json()['note']
    ai.vision = lambda *a, **k: (None, 'the AI is busy')
    r = cl.post('/api/stmt/notes/%s/read' % n2['id'], headers=H(sup), json={}).get_json()
    check('AI failure leaves the note marked error', not r['ok'] and r['note']['status'] == 'error', r)
    ai.vision = lambda *a, **k: ('sorry, cannot help', None)
    r = cl.post('/api/stmt/notes/%s/read' % n2['id'], headers=H(sup), json={}).get_json()
    check('a non-JSON answer is an error too', not r['ok'] and r['note']['status'] == 'error', r)
    ai.vision = real_vision

    r = cl.post('/api/stmt/notes/' + n2['id'], headers=H(mgr), json={'data': {
        'number': '81', 'date': '31/10/26', 'lines': [{'qty': '4', 'product': 'chicken', 'amount': '26'},
                                                      {'qty': 2, 'product': 'bogus', 'item': 'x'}], 'total': 26}}).get_json()
    check('typed in by hand', r['ok'] and r['note']['status'] == 'read' and r['note']['data']['by'] == 'person', r)
    check('unknown product id dropped to unmatched', r['note']['data']['lines'][1]['product'] is None)
    r = cl.post('/api/stmt/notes/' + n2['id'], headers=H(sup), json={'data': {'date': '45/10/26', 'lines': []}})
    check('an impossible date is refused', r.status_code == 400)

    j = cl.get('/api/stmt/notes?customer=beechboro&month=2026-10', headers=H(mgr)).get_json()
    st = j['statement']
    check('statement built from both notes', st['days'][29]['qty'] == {'pork': 6, 'trad': 15, 'chicken': 0}
          and st['days'][30]['qty']['chicken'] == 4, (st['days'][29]['qty'], st['days'][30]['qty']))
    check('grand total', st['grand_total'] == 6 * 6.5 + 15 * 5.5 + 4 * 6.5, st['grand_total'])
    check('month list', j['months'] == [{'month': '2026-10', 'count': 2}], j['months'])

    n3 = up(sup, jpeg(color=(9, 9, 9))).get_json()['note']
    r = cl.post('/api/stmt/notes/' + n3['id'], headers=H(sup), json={'move': True, 'data': {
        'number': '90', 'date': '02/11/26', 'lines': [{'qty': 1, 'product': 'trad', 'amount': 5.5}], 'total': 5.5}}).get_json()
    check('a November note can be moved to November', r['moved'] == '2026-11' and r['note']['month'] == '2026-11', r)

    r = cl.get('/api/stmt/photo/' + n1['id'], headers=H(mgr))
    check('photo served to an allowed manager', r.status_code == 200 and r.mimetype == 'image/jpeg')
    check('photo kept from Malaga', cl.get('/api/stmt/photo/' + n1['id'], headers=H(mgr2)).status_code == 403)

    r = cl.post('/api/stmt/config', headers=H(sup), json={'products': [{'id': 'trad', 'price': '6'}, {'id': 'pork', 'price': -1}]}).get_json()
    pr = {p['id']: p['price'] for p in r['products']}
    check('price changed, nonsense ignored', pr == {'pork': 6.5, 'trad': 6.0, 'chicken': 6.5}, pr)
    j = cl.get('/api/stmt/notes?customer=beechboro&month=2026-10', headers=H(sup)).get_json()
    check('statement re-priced', j['statement']['grand_total'] == 6 * 6.5 + 15 * 6 + 4 * 6.5, j['statement']['grand_total'])

    print('\n7. typed in by hand')
    r = cl.post('/api/stmt/notes/manual', headers=H(mgr), json={'customer': 'beechboro', 'month': '2026-10', 'data': {
        'number': '95', 'date': '15/10/26', 'lines': [{'product': 'pork', 'qty': '10'}, {'product': 'trad', 'qty': None},
                                                      {'product': 'chicken', 'qty': 3}]}}).get_json()
    mn = r['note']
    check('saved with no photo', r['ok'] and not mn['hasPhoto'] and mn['status'] == 'read' and mn['data']['manual'], r)
    check('empty quantities dropped', [l['product'] for l in mn['data']['lines']] == ['pork', 'chicken'], mn['data']['lines'])
    check('no AI warnings on it', mn['warnings'] == [], mn['warnings'])
    rr = cl.post('/api/stmt/notes/%s/read' % mn['id'], headers=H(sup), json={})
    check('nothing to read on a typed note', rr.status_code == 400)
    check('no photo to serve', cl.get('/api/stmt/photo/' + mn['id'], headers=H(sup)).status_code == 404)
    blank = cl.post('/api/stmt/notes/manual', headers=H(sup), json={'customer': 'beechboro', 'month': '2026-10', 'checked': False}).get_json()['note']
    check('a blank row asks to be filled', sorted(w['code'] for w in blank['warnings']) == ['no_date', 'no_lines', 'no_number'], blank['warnings'])
    check('Malaga cannot type one in', cl.post('/api/stmt/notes/manual', headers=H(mgr2), json={'customer': 'beechboro', 'month': '2026-10'}).status_code == 403)
    check('a bad date is refused', cl.post('/api/stmt/notes/manual', headers=H(sup), json={'customer': 'beechboro', 'month': '2026-10', 'data': {'date': '40/10/26'}}).status_code == 400)
    st = cl.get('/api/stmt/notes?customer=beechboro&month=2026-10', headers=H(sup)).get_json()['statement']
    check('typed note is on the statement', st['days'][14]['qty'] == {'pork': 10, 'trad': 0, 'chicken': 3}, st['days'][14]['qty'])
    r = cl.post('/api/stmt/notes/' + blank['id'], headers=H(sup), json={'data': {'number': '96', 'date': '16/10/26', 'lines': [{'product': 'trad', 'qty': 7}]}}).get_json()
    check('the blank row filled in later', r['ok'] and r['note']['warnings'] == [] and r['note']['data'].get('manual') is True)
    cl.post('/api/stmt/notes/%s/delete' % mn['id'], headers=H(sup)); cl.post('/api/stmt/notes/%s/delete' % blank['id'], headers=H(sup))

    r = cl.post('/api/stmt/notes/%s/delete' % n1['id'], headers=H(sup)).get_json()
    check('deleted', r['ok'] and not os.path.exists(os.path.join(TMP, 'uploads', 'invoices', 'beechboro', n1['id'] + '.jpg')))
    check('gone from the month', len(cl.get('/api/stmt/notes?customer=beechboro&month=2026-10', headers=H(sup)).get_json()['notes']) == 1)
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print('\n%s' % ('ALL PASSED' if not fails else ('%d FAILED: %s' % (len(fails), fails))))
sys.exit(1 if fails else 0)
