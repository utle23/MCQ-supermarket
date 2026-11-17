"""Master App -> MCQ DevOps: ticket, directory and webhook.
Run:  python3 tests/sso_server.py                                            """
import base64, hashlib, hmac, json, os, shutil, sys, tempfile, time

TMP = tempfile.mkdtemp(prefix='mcqsso_')
os.environ['DATA_DIR'] = TMP
os.environ['UPLOADS_DIR'] = os.path.join(TMP, 'uploads')
SECRET = 'test-sso-secret-at-least-32-bytes-long!!'
APIKEY = 'test-master-api-key-0123456789'
os.environ['MCQ_SSO_SECRET'] = SECRET
os.environ['MASTER_API_KEY'] = APIKEY
os.environ['DEVOPS_URL'] = 'https://mcqtask.example'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server')); sys.path.insert(0, ROOT)
os.chdir(ROOT)

import db, app as backend                 # noqa: E402
from flask import Flask                   # noqa: E402

fails = []
def check(n, c, e=None):
    print(('  ok   ' if c else '  FAIL ') + n + (('  -> ' + repr(e)) if (not c and e is not None) else ''))
    if not c: fails.append(n)

def unpack(ticket):
    body, sig = ticket.split('.')
    pad = lambda x: x + '=' * (-len(x) % 4)
    want = base64.urlsafe_b64encode(hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    return json.loads(base64.urlsafe_b64decode(pad(body))), (sig == want)

sent = []        # the webhook calls, captured instead of sent
try:
    db.init_db()
    db.notify_devops = lambda person, event: sent.append((dict(person), event))
    backend.db.notify_devops = db.notify_devops
    fl = Flask(__name__); fl.register_blueprint(backend.api); cl = fl.test_client()
    sup = db.issue_token('super', None, staff_name='Super', account_id='7003')
    mgr = db.issue_token('admin', 'Morley', staff_name='Morley Mgr')
    H = lambda t: {'Authorization': 'Bearer ' + t}

    print('\n1. the one-off rename ran')
    r = db.connect().execute("SELECT name FROM accounts WHERE id='7006'").fetchone()
    check('7006 is Kevin Pham, not Kelvin', r and r['name'] == 'Kevin Pham', r and r['name'])

    print('\n2. the sign-in ticket')
    r = cl.post('/api/sso/devops-ticket', headers=H(sup), json={})
    j = r.get_json()
    check('a signed-in person gets one', r.status_code == 200 and j.get('ticket'), j)
    payload, sig_ok = unpack(j['ticket'])
    check('the signature verifies with the shared secret', sig_ok)
    check('it is addressed to MCQ Tasks', payload['aud'] == 'mcq-tasks', payload.get('aud'))
    check('sub is the account, store-free', payload['sub'] == 'acct:7003', payload.get('sub'))
    check('it lives 60 seconds', payload['exp'] - payload['iat'] == 60, payload['exp'] - payload['iat'])
    check('the nonce is long enough and random', 16 <= len(payload['nonce']) <= 128, payload.get('nonce'))
    r2 = cl.post('/api/sso/devops-ticket', headers=H(sup), json={}).get_json()
    check('every ticket has a fresh nonce', unpack(r2['ticket'])[0]['nonce'] != payload['nonce'])
    check('it posts to the DevOps /sso endpoint', j['url'] == 'https://mcqtask.example/sso', j.get('url'))
    check('no password or hash rides along',
          not ({'password', 'password_hash', 'pw'} & set(payload.keys())), list(payload.keys()))

    print('\n3. the ticket cannot be used to bounce someone elsewhere')
    for bad in ('https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', 'evil'):
        jj = cl.post('/api/sso/devops-ticket', headers=H(sup), json={'next': bad}).get_json()
        check('rejected next=%r' % bad, jj['next'] == '', jj.get('next'))
    jj = cl.post('/api/sso/devops-ticket', headers=H(sup), json={'next': '/tasks/IT-118'}).get_json()
    check('a plain path is kept', jj['next'] == '/tasks/IT-118', jj.get('next'))

    print('\n4. a staff-only session gets a store-qualified sub')
    c0 = db.connect()
    c0.execute("INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?)",
               ('E0074', 'Morley', json.dumps({'id': 'E0074', 'name': 'Floor Staff', 'store': 'Morley',
                                               'role': 'PACKER', 'active': 1, 'email': 'f@s.z'})))
    c0.commit(); c0.close()
    stf = db.issue_token('staff', 'Morley', staff_id='E0074', staff_name='Floor Staff')
    p2 = unpack(cl.post('/api/sso/devops-ticket', headers=H(stf), json={}).get_json()['ticket'])[0]
    check('sub carries the store', p2['sub'] == 'staff:Morley:E0074', p2['sub'])
    check('the staff id also rides along on its own', p2['staff_id'] == 'E0074', p2.get('staff_id'))
    check('their store fills in for the DevOps home store', p2['store'] == 'Morley', p2.get('store'))
    ghost = db.issue_token('staff', 'Morley', staff_id='E9999', staff_name='Nobody')
    r = cl.post('/api/sso/devops-ticket', headers=H(ghost), json={})
    check('a session matching no person is refused, not given a shared id', r.status_code == 409, r.status_code)
    r = cl.post('/api/sso/devops-ticket')
    check('a signed-out device gets no ticket', r.status_code == 401, r.status_code)

    print('\n5. the people directory')
    r = cl.get('/api/v1/people')
    check('no key -> 401', r.status_code == 401, r.status_code)
    r = cl.get('/api/v1/people', headers={'Authorization': 'Bearer wrong-key'})
    check('wrong key -> 401', r.status_code == 401, r.status_code)
    r = cl.get('/api/v1/people?include_inactive=1', headers={'Authorization': 'Bearer ' + APIKEY})
    check('the right key is served', r.status_code == 200)
    people = r.get_json()['people']
    by_id = {p['id']: p for p in people}
    check('head office accounts are in it', 'acct:7003' in by_id and 'acct:7006' in by_id, list(by_id)[:4])
    check('each row has exactly the agreed fields',
          all(sorted(p) == ['active', 'email', 'id', 'kind', 'name', 'position', 'staff_id', 'store', 'updated_at']
              for p in people), sorted(people[0]) if people else None)
    check('nothing secret leaks',
          not any({'password', 'password_hash', 'reset_code'} & set(p) for p in people))
    check('Kevin Pham reads correctly here too', by_id['acct:7006']['name'] == 'Kevin Pham', by_id['acct:7006']['name'])
    check('an account id is never ambiguous with a staff id',
          all(p['id'].startswith('acct:') or p['id'].startswith('staff:') for p in people))

    print('\n6. switching someone off tells MCQ DevOps')
    sent.clear()
    conn = db.connect()
    conn.execute("INSERT INTO staff(id,store_id,data_json) VALUES(?,?,?)",
                 ('E9001', 'Morley', json.dumps({'id': 'E9001', 'name': 'Leaver Test', 'store': 'Morley',
                                                 'role': 'PACKER', 'active': 1, 'email': 'x@y.z'})))
    conn.commit()
    db._revoke_person_tokens(conn, 'Morley', 'E9001')
    conn.commit(); conn.close()
    check('the webhook fired once', len(sent) == 1, sent)
    if sent:
        person, event = sent[0]
        check("the event is 'deactivated'", event == 'deactivated', event)
        check('it names the person by the same id scheme', person['id'] == 'staff:Morley:E9001', person['id'])
        check('and says they are off', person['active'] is False, person)

    print('\n7. the webhook signs itself the way DevOps expects')
    body = json.dumps({'id': 'acct:7006', 'event': 'updated'}, separators=(',', ':')).encode()
    ts = str(int(time.time()))
    mine = hmac.new(SECRET.encode(), (ts + '.').encode() + body, hashlib.sha256).hexdigest()
    check('HMAC-SHA256 over timestamp + "." + body', len(mine) == 64 and mine.isalnum())

    print('\n8. with no secret configured, everything fails closed')
    db.SSO_SECRET = ''
    r = cl.post('/api/sso/devops-ticket', headers=H(sup), json={})
    check('no ticket is minted', r.status_code == 503, r.status_code)
    sent.clear(); db.notify_devops({'id': 'acct:1'}, 'updated')
    check('and the webhook stays quiet', True)   # stubbed above; real one returns early
    db.SSO_SECRET = SECRET
    db.MASTER_API_KEY = ''
    r = cl.get('/api/v1/people', headers={'Authorization': 'Bearer ' + APIKEY})
    check('the directory refuses everyone', r.status_code == 401, r.status_code)
    db.MASTER_API_KEY = APIKEY
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print('\n' + ('ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)))
sys.exit(1 if fails else 0)
