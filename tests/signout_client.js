/* #signout — one press in MCQ DevOps ends both sessions.
   Run:  node tests/signout_client.js                                        */
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'assets/app.js'),'utf8');

let fails=[];
const check=(n,c,e)=>{ console.log((c?'  ok   ':'  FAIL ')+n+((!c&&e!==undefined)?('  \u2192 '+JSON.stringify(e)):'')); if(!c) fails.push(n); };

// lift the guard out of render() and run it against the real regex and branches
const guard=/if\(\/\^#\\\/\?signout[\s\S]*?\n  \}/.exec(src);
check('the guard is the first thing render() does', !!guard && src.indexOf(guard[0]) < src.indexOf("if(!State.account){ showLogin(); return; }"));

const re=/^#\/?signout(\b|$)/;
console.log('\n1. which URLs sign a person out');
[['#signout',true],['#/signout',true],['#signout?x=1',true],
 ['#apps',false],['#home',false],['#signoutish',false],['',false],['#',false]].forEach(([h,want])=>{
  check((h||'(empty)')+' \u2192 '+(want?'signs out':'ignored'), re.test(h)===want, re.test(h));
});

console.log('\n2. what it does');
let calls=[];
const env={ logout:r=>calls.push(['logout',r]), showLogin:r=>calls.push(['showLogin',r]),
            history:{replaceState:()=>calls.push(['clearHash'])}, location:{hash:'#signout'},
            State:{account:{name:'Someone'}} };
function runGuard(st){
  calls=[]; env.State.account=st;
  if(re.test(env.location.hash)){
    env.history.replaceState(null,'','#');
    if(env.State.account) env.logout('You have been signed out of MCQ DevOps and MCQ Supermarket.');
    else env.showLogin('You have been signed out.');
    return true;
  }
  return false;
}
runGuard({name:'Someone'});
check('a signed-in person is logged out', calls.some(c=>c[0]==='logout'));
check('the hash is cleared first, so signing back in lands on the launcher',
      calls[0] && calls[0][0]==='clearHash');
check('they are told why', /signed out/i.test((calls.find(c=>c[0]==='logout')||[])[1]||''));
runGuard(null);
check('already signed out is harmless \u2014 just the sign-in page',
      calls.some(c=>c[0]==='showLogin') && !calls.some(c=>c[0]==='logout'));
check('no confirmation is asked for', !/confirm\(/.test(guard?guard[0]:''));

console.log('\n3. every sign-out path forgets the page you were on');
// the three places a session can end, read out of the real source
function tail(fnStart, lines){ const i=src.indexOf(fnStart); return i<0?'':src.slice(i, src.indexOf('\n}', i)); }
const logoutSrc = tail('async function logout(reason){');
const expiredSrc = tail('function mcqSessionExpired(){');
check('the Sign out button / idle timeout resets the hash',
      /replaceState\(null,'','#\/apps'\)/.test(logoutSrc));
check('it happens BEFORE the sign-in screen is shown',
      logoutSrc.indexOf("replaceState") < logoutSrc.indexOf('showLogin('));
check('an expired or revoked session does too',
      /replaceState\(null,'','#\/apps'\)/.test(expiredSrc));
check('and #signout leaves the launcher hash', /replaceState\(null,'','#\/apps'\)/.test(guard?guard[0]:''));

console.log('\n4. sign out on a checklist page, sign back in -> launcher');
// enterApp()'s landing rule, verbatim from app.js
function landing(hash){ return (!hash || hash==='#') ? '#/apps' : hash; }
function signOutThen(wasOn){
  let hash=wasOn;
  hash='#/apps';                       // what logout() now does
  return landing(hash);
}
[['#/home','the manager daily home'],['#/checklist','the checklist page'],
 ['#/tempcheck','the temperature sheet'],['#/history','checklist history']].forEach(([h,what])=>{
  check('signed out from '+what+' -> launcher', signOutThen(h)==='#/apps', signOutThen(h));
});
check('a deep link arriving while signed OUT still wins', landing('#/history')==='#/history');
check('and an empty address bar lands on the launcher', landing('')==='#/apps' && landing('#')==='#/apps');

console.log('\n'+(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS'));
process.exit(fails.length?1:0);
