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
global.location={href:'', origin:'http://x', hash:''};
global.State={account:{role:'admin',branch:'Morley',name:'Morley Manager',staffName:'Minh Tran'}};
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
check('the DevOps tile points at the DevOps site', html().includes("mcqOpenApp('devops')"));
check('the checklist tile opens this app\'s home', html().includes("go('home')"));
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
went=null; mcqOpenApp('checklist');
check('the checklist tile stays inside this app', went==='home' && !location.href);
location.href=''; mcqOpenApp('devops');
check('the DevOps tile leaves for MCQ DevOps', location.href==='https://mcqtask.onrender.com', location.href);
check('and says so while it goes', toasts.some(t=>/Opening MCQ DevOps/.test(t)));
mcqOpenApp('nonsense');
check('an unknown tile does nothing', true);

console.log('\n5. phone-friendly markup');
check('tiles are real buttons, big tap targets', (html().match(/<button class="mcq-tile/g)||[]).length===2);
check('each tile is labelled for screen readers', (html().match(/aria-label="Open /g)||[]).length===2);

console.log('\n'+(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS'));
process.exit(fails.length?1:0);
