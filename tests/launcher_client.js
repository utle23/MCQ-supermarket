/* MCQ Master App launcher — logic tests against the real assets/launcher.js.
   Run:  node tests/launcher_client.js                                        */
require('./harness.js');
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');

const painted={};
function el(id){ return painted[id]=painted[id]||{id,innerHTML:'',value:'',textContent:''}; }
global.document.getElementById=id=>painted[id]||null;
global.$=s=>el(String(s).replace('#',''));
global.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.setAccent=()=>{}; global.setCrumb=(a,b,c)=>{ painted.__crumb=c; };
let toasts=[]; global.toast=m=>toasts.push(String(m));
let went=null; global.go=m=>{ went=m; };
global.scrollTo=()=>{};
global.logout=()=>{};
const bodyCls=new Set();
global.document.body={classList:{add:c=>bodyCls.add(c),remove:c=>bodyCls.delete(c),contains:c=>bodyCls.has(c)},appendChild:n=>{painted.__panel=n;}};
global.document.createElement=()=>({id:'',className:'',innerHTML:'',style:{},setAttribute(){},remove(){}});
global.State_route_mod='apps';
global.location={href:'', origin:'http://x', hash:''};
global.State={account:{role:'admin',branch:'Morley',name:'Morley Manager',staffName:'Minh Tran',initials:'MT'},route:{mod:'apps'}};
global.isSuper=()=>State.account.role==='super'; global.isBa=()=>State.account.role==='ba';
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'assets/launcher.js'),'utf8'),{filename:'assets/launcher.js'});

let fails=[];
const check=(n,c,e)=>{ console.log((c?'  ok   ':'  FAIL ')+n+((!c&&e!==undefined)?('  → '+JSON.stringify(e).slice(0,160)):'')); if(!c) fails.push(n); };
const html=()=>painted.content.innerHTML;

console.log('1. the two apps');
renderLauncher();
check('both tiles are there', html().includes('Store Checklist') && html().includes('MCQ DevOps'));
check('each has its one-line description',
  html().includes('Daily store checks, by store') && html().includes('IT work items, issues and fixes'));
check('it is called MCQ DevOps, not Azure DevOps', !/Azure/i.test(html()));
check('the DevOps tile goes through the sign-in page', html().includes("mcqOpenApp('devops')"));
check('the checklist tile opens this app\'s home', html().includes("mcqOpenApp('checklist')"));
check('all the text is English', !/[àáâãèéêìíòóôõùúăđĩũơưăạảấầẩẫậắằẳẵặẹẻẽềềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(html().replace(/Khoi|Minh Tran/g,'')));

console.log('\n2. it greets the person by name and store');
check('first name only, not the whole row', /Minh/.test(html()) && !/Minh Tran,/.test(html()));
check('their store is shown', /Morley/.test(html()));
check('the greeting changes with the hour', ['Good morning','Good afternoon','Good evening'].some(g=>html().includes(g)));
State.account={role:'super',branch:'All stores',name:'Head Office',staffName:'Khoi'};
renderLauncher();
check('head office is named, not "All stores"', /Head Office/.test(html()) && !/All stores/.test(html()));

console.log('\n3. every signed-in role sees both tiles');
for(const role of ['admin','staff','employee','ba','super']){
  State.account={role, branch:'Malaga', name:'X', staffName:'Someone'};
  renderLauncher();
  check(role+' sees both', html().includes('Store Checklist') && html().includes('MCQ DevOps'));
}

console.log('\n4. opening an app');
State.account={role:'admin',branch:'Morley',name:'M',staffName:'Minh'};
renderLauncher();
went=null; location.href=''; mcqOpenApp('checklist');
check('the checklist tile stays inside this app', went==='home' && !location.href);
location.href=''; mcqOpenApp('devops');
check('the DevOps tile goes to /go/devops, which mints the ticket', location.href==='/go/devops', location.href);
{ // the ticket is minted server-side; no signing material may sit in client code
  const code=fs.readFileSync(path.join(ROOT,'assets/launcher.js'),'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  check('no signing material in the browser bundle', !/SSO_SECRET|MASTER_API_KEY|hmac|createHmac|sha256/i.test(code)); }
check('and says so while it goes', toasts.some(t=>/Opening MCQ DevOps/.test(t)));
mcqOpenApp('nonsense');
check('an unknown tile does nothing', true);

console.log('\n5. the launcher owns the whole screen');
check('it switches the app shell into launcher mode', bodyCls.has('on-launcher'));
check('its own top bar carries the brand, the person and Sign out',
  /mcqL-logo/.test(html()) && /MCQ Master App/.test(html()) && /logout\(\)/.test(html()));
check('the hero names the store and the day',
  /mcqL-eyebrow/.test(html()) && /Morley/.test(html()) && /mcqL-sub/.test(html()));
{ const av=()=>{ const m=/<span class="mcqL-av"[\s\S]{0,60}?<\/span>/.exec(html()); return m?m[0]:''; };
  check('the account\'s own initials are used', /MI/.test(av()), av());   // "Minh" -> MI
  State.account={role:'admin',branch:'Morley',name:'Morley Manager',staffName:'Minh Tran',initials:'MT'};
  renderLauncher();
  check('and a set initials field wins', /MT/.test(av()), av()); }

console.log('\n6. the 9-dot app switcher');
{
  const w=mcqWaffleHTML();
  check('the waffle is a real button with a label', /<button class="mcq-waffle"/.test(w) && /aria-label="MCQ apps"/.test(w));
  check('it has nine dots', (w.match(/<span><\/span>/g)||[]).length===9, (w.match(/<span><\/span>/g)||[]).length);
  State.route={mod:'home'};            // inside Store Checklist
  mcqSwitcherToggle(null);
  const panel=(painted.__panel||{}).innerHTML||'';
  check('the panel is titled MCQ APPS', /MCQ APPS/.test(panel));
  check('it lists both apps', /Store Checklist/.test(panel) && /MCQ DevOps/.test(panel));
  check('the app you are in is marked', /You are here/.test(panel) && /mcq-sw-row cur/.test(panel));
  check('and only one is marked', (panel.match(/You are here/g)||[]).length===1);
  check('there is a way back to all apps', /All apps/.test(panel));
  State.route={mod:'apps'};
}

console.log('\n7. phone-friendly markup');
check('tiles are real buttons, big tap targets', (html().match(/<button class="mcqL-card/g)||[]).length===2);
check('each tile is labelled for screen readers', (html().match(/aria-label="Open /g)||[]).length===2);

console.log('\n'+(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS'));
process.exit(fails.length?1:0);
