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

console.log('\n'+(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS'));
process.exit(fails.length?1:0);
