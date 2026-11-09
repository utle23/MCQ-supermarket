"""Temperature Check endpoints — end-to-end against a throwaway sqlite DB.
Run:  python3 tests/temperature_server.py                                   """
import json, os, shutil, sys, tempfile

TMP = tempfile.mkdtemp(prefix='mcqtemp_')
os.environ['DATA_DIR'] = TMP
os.environ['UPLOADS_DIR'] = os.path.join(TMP, 'uploads')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server')); sys.path.insert(0, ROOT)
os.chdir(ROOT)

import db, app as backend                  # noqa: E402
from flask import Flask                    # noqa: E402

fails = []
def check(n, c, e=None):
    print(('  ok   ' if c else '  FAIL ') + n + (('  -> ' + repr(e)) if (not c and e is not None) else ''))
    if not c: fails.append(n)

try:
    db.init_db()
    fl = Flask(__name__); fl.register_blueprint(backend.api); cl = fl.test_client()
    sup = db.issue_token('super', None, staff_name='Super')
    mgr = db.issue_token('admin', 'Morley', staff_name='Morley Mgr')
    mgr2 = db.issue_token('admin', 'Malaga', staff_name='Malaga Mgr')
    lead = db.issue_token('staff', 'Morley', staff_name='Butcher Lead')
    ba = db.issue_token('ba', None, staff_name='Chu Ba')
    H = lambda t: {'Authorization': 'Bearer ' + t}
    TODAY = db.today_str()

    print('\n1. two department sheets are seeded')
    j = cl.get('/api/temp-check', headers=H(mgr)).get_json(); doc = j['doc']
    names = [sh['name'] for sh in doc['sheets']]
    check('Butcher and Dairy', names == ['Butcher', 'Dairy'], names)
    bu = doc['sheets'][0]; da = doc['sheets'][1]
    check('butcher checks at 8:00 / 12:30 / 17:30',
          [r['time'] for r in bu['rounds']] == ['08:00', '12:30', '17:30'], [r['time'] for r in bu['rounds']])
    check('butcher lines leave the product open',
          all('Sample' in i['name'] or 'Room temperature' in i['name'] for i in bu['items']),
          [i['name'] for i in bu['items']])
    check('dairy checks at 8:00 and 16:00',
          [r['time'] for r in da['rounds']] == ['08:00', '16:00'], [r['time'] for r in da['rounds']])
    dn = [i['name'] for i in da['items']]
    check('dairy holds the chilled lines off the area plan',
          all(x in dn for x in ['Dairy Fridge — Air temperature', 'Fresh Milk', 'Fresh Tofu',
                                'Yoghurt', 'Cheese', 'Kimchi', 'Sausages', 'Salted Duck Eggs',
                                'Broken Eggs', 'Mung Bean Cakes', 'Tofu Pack']), dn)
    check('the dry goods kept in there are not on it',
          not [x for x in dn if 'Dried' in x or 'Tamarind' in x], dn)
    check('no line id is shared between sheets',
          not (set(i['id'] for i in bu['items']) & set(i['id'] for i in da['items'])))

    print('\n2. Beef FZ is gone from goods received')
    rc = [c['name'] for c in doc['recvCategories']]
    check('six categories, no Beef FZ', rc == ['Pork meat', 'Beef meat', 'Chicken', 'Pork FZ', 'Chicken FZ', 'Offals'], rc)

    print('\n3. every store sees the same sheets')
    for tok, who_ in ((mgr2, 'Malaga'), (lead, 'a dept lead'), (ba, 'Chu Ba')):
        d2 = cl.get('/api/temp-check', headers=H(tok)).get_json()['doc']
        check('%s gets the same two sheets' % who_, [s['id'] for s in d2['sheets']] == [s['id'] for s in doc['sheets']])

    print('\n4. an edit names the sheet it belongs to')
    r = cl.post('/api/temp-check/op', headers=H(mgr),
                json={'ops': [{'op': 'item.add', 'sheet': 'sh_dairy', 'name': 'Cream'}]})
    d = r.get_json()['doc']
    check('the dairy sheet grew', 'Cream' in [i['name'] for i in d['sheets'][1]['items']])
    check('the butcher sheet did not', 'Cream' not in [i['name'] for i in d['sheets'][0]['items']])
    r = cl.post('/api/temp-check/op', headers=H(mgr),
                json={'ops': [{'op': 'title.set', 'sheet': 'sh_dairy', 'title': 'DAIRY COLD ROOM'}]})
    d = r.get_json()['doc']
    check('each sheet has its own title', d['sheets'][1]['title'] == 'DAIRY COLD ROOM'
          and d['sheets'][0]['title'].startswith('BUTCHER'), [s['title'] for s in d['sheets']])
    r = cl.post('/api/temp-check/op', headers=H(mgr), json={'ops': [{'op': 'sheet.add', 'name': 'Seafood'}]})
    d = r.get_json()['doc']
    check('a department can be added', [s['name'] for s in d['sheets']][-1] == 'Seafood')
    newsheet = r.get_json()['result']
    r = cl.post('/api/temp-check/op', headers=H(mgr), json={'ops': [{'op': 'sheet.del', 'sheet': newsheet}]})
    check('and removed', len(r.get_json()['doc']['sheets']) == 2)
    r = cl.post('/api/temp-check/op', headers=H(lead), json={'ops': [{'op': 'sheet.add', 'name': 'Nope'}]})
    check('a dept lead cannot reshape the sheets', r.status_code == 403, r.status_code)

    print('\n5. readings, the product probed, and photos per sheet')
    r = cl.post('/api/temp-log/Morley', headers=H(lead), json={'day': TODAY,
        'values': {'tr1|ti1': {'v': '2.5', 'at': '08:05', 'by': 'Minh'},
                   'trd1|tid2': {'v': '3.8', 'at': '08:20', 'by': 'Lan'}},
        'products': {'ti1': 'Scotch Fillet', 'tid2': 'Brownes 2L'},
        'tempPhotos': ['p_temp1'], 'photos': ['p_recv1'],
        'recv': [{'id': 'rr1', 'cat': 'rc2', 'supplier': 'Harvey Beef', 'product': 'BEEF MINCE /KG',
                  'temp': '3.0', 'quality': 'Good', 'time': '6:40 AM', 'by': 'Minh'}]})
    got = r.get_json()['log']
    check('readings from both sheets live in one day', len(got['values']) == 2, got['values'])
    check('what was probed is kept', got['products'] == {'ti1': 'Scotch Fillet', 'tid2': 'Brownes 2L'}, got['products'])
    check('each sheet keeps its own photos', got['tempPhotos'] == ['p_temp1'] and got['photos'] == ['p_recv1'])
    check('a received line carries its supplier', got['recv'][0]['supplier'] == 'Harvey Beef', got['recv'][0])
    check('and the time it came in', got['recv'][0]['time'] == '06:40', got['recv'][0]['time'])
    other = cl.get('/api/temp-log/Malaga?day=' + TODAY, headers=H(mgr2)).get_json()['log']
    check("another store's day is its own", other['values'] == {} and other['recv'] == [])
    r = cl.get('/api/temp-log/Malaga?day=' + TODAY, headers=H(mgr))
    check("a manager cannot read another store's day", r.status_code == 403, r.status_code)

    print('\n6. an older single-sheet document is folded in, not lost')
    db.set_setting('temp_check', {
        'rev': 4, 'seed': 3, 'title': 'OUR OWN BUTCHER SHEET',
        'rounds': [{'id': 'trX', 'name': 'Once', 'time': '09:00', 'type': 'fridge'}],
        'items': [{'id': 'tiX', 'name': 'Our own line'}]})
    up = cl.get('/api/temp-check', headers=H(mgr)).get_json()['doc']
    check('what they had becomes the first sheet',
          up['sheets'][0]['title'] == 'OUR OWN BUTCHER SHEET'
          and [i['name'] for i in up['sheets'][0]['items']] == ['Our own line'], up['sheets'][0])
    check('and Dairy is added alongside it', [s['name'] for s in up['sheets']][-1] == 'Dairy', [s['name'] for s in up['sheets']])
    check('their check time is untouched', up['sheets'][0]['rounds'][0]['time'] == '09:00')
    check('Beef FZ is NOT force-removed from a reshaped log', 'recvCategories' in up)
    cl.post('/api/temp-check/op', headers=H(sup), json={'ops': [{'op': 'doc.restore'}]})
    back = cl.get('/api/temp-check', headers=H(mgr)).get_json()['doc']
    check('restore brings both seeded sheets back', [s['name'] for s in back['sheets']] == ['Butcher', 'Dairy'])
    kept = cl.get('/api/temp-log/Morley?day=' + TODAY, headers=H(mgr)).get_json()['log']
    check('and never touches the readings', kept['values']['tr1|ti1']['v'] == '2.5')

    print('\n7. guards')
    r = cl.post('/api/temp-check/op', headers=H(mgr), json={'ops': [{'op': 'round.set', 'sheet': 'sh_dairy',
                                                                    'id': 'trd1', 'time': 'half past'}]})
    check('a time that makes no sense is refused', r.status_code == 400, r.status_code)
    d = cl.get('/api/temp-check', headers=H(mgr)).get_json()['doc']
    for it in d['sheets'][1]['items'][1:]:
        cl.post('/api/temp-check/op', headers=H(mgr), json={'ops': [{'op': 'item.del', 'sheet': 'sh_dairy', 'id': it['id']}]})
    r = cl.post('/api/temp-check/op', headers=H(mgr), json={'ops': [{'op': 'item.del', 'sheet': 'sh_dairy',
                                                                    'id': d['sheets'][1]['items'][0]['id']}]})
    check('a sheet cannot be emptied of every line', r.status_code == 400, r.status_code)
    r = cl.post('/api/temp-log/Morley', headers=H(ba), json={'day': TODAY, 'values': {}})
    check('Chu Ba cannot write readings', r.status_code == 403, r.status_code)
    r = cl.get('/api/temp-check')
    check('a signed-out device gets nothing', r.status_code == 401, r.status_code)
finally:
    shutil.rmtree(TMP, ignore_errors=True)   # nothing left behind

print('\n' + ('ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)))
sys.exit(1 if fails else 0)
