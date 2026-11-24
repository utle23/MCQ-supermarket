/* Restaurant Statements page — logic tests against the real assets/statements.js
   and assets/launcher.js, with the server calls stubbed.
   Run:  node tests/statements_client.js                                       */
const { load } = require('./harness.js');

const painted={};
const el=id=>painted[id]=painted[id]||{id,innerHTML:'',value:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},
  querySelector(){ return {style:{},textContent:''}; }, scrollIntoView(){}};
global.$=s=>el(String(s).replace('#',''));
global.document.getElementById=id=>painted[id]||null;
global.document.querySelectorAll=()=>[];
const bodyCls=new Set();
global.document.body={classList:{add:c=>bodyCls.add(c),remove:c=>bodyCls.delete(c),contains:c=>bodyCls.has(c)},appendChild:n=>{painted.__modal=n;}};
global.document.createElement=()=>({id:'',className:'',innerHTML:'',style:{},setAttribute(){},remove(){},
  querySelector(){ return {classList:{add(){}}}; }});
global.setCrumb=()=>{};
global.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toasts=[]; global.toast=m=>toasts.push(String(m));
let went=null; global.go=m=>{ went=m; };
global.todayISO=()=>'2026-11-12';
global.State.account={role:'super',name:'Khoi'};
global.State.route={mod:'statements'};

let fails=[];
const check=(n,c,e)=>{ console.log((c?'  ok   ':'  FAIL ')+n+((!c&&e!==undefined)?('  -> '+JSON.stringify(e).slice(0,200)):'')); if(!c) fails.push(n); };
const html=()=>painted.content.innerHTML;
const tick=()=>new Promise(r=>setTimeout(r,0));

/* ---- a tiny fake server holding the notes ---- */
const CFG={ok:true,supplier:'MCQ Street Food',abn:'',customers:[{id:'beechboro',name:'M&MW Beechboro',stores:[]}],
  products:[{id:'pork',name:'Roast Pork Roll',price:6.5},{id:'trad',name:'Traditional Roll',price:5.5},{id:'chicken',name:'Chicken',price:6.5}],
  canConfig:true, ai:true};
let notes=[], reads=[], uploads=0, inflight=0, maxInflight=0;
function days(month){ const out=[]; const n=new Date(+month.slice(0,4),+month.slice(5,7),0).getDate();
  for(let d=1;d<=n;d++){ const iso=month+'-'+String(d).padStart(2,'0'); const wd=(new Date(iso+'T00:00:00').getDay()+6)%7;
    out.push({date:iso,weekday:wd,qty:{pork:0,trad:0,chicken:0},notes:[]}); } return out; }
function statement(month){
  const ds=days(month); let used=0;
  notes.filter(n=>n.status==='read'&&n.data&&n.data.date).forEach(n=>{ const d=ds.find(x=>x.date===n.data.date); if(!d) return; used++;
    d.notes.push(n.data.number); n.data.lines.forEach(l=>{ if(l.product) d.qty[l.product]+=l.qty; }); });
  const totals=CFG.products.map(p=>{ const q=ds.reduce((t,d)=>t+d.qty[p.id],0); return {product:p.id,name:p.name,qty:q,price:p.price,amount:q*p.price}; });
  return {customer:'M&MW Beechboro',supplier:'MCQ Street Food',month,products:CFG.products.map(p=>({id:p.id,name:p.name})),
    days:ds,totals,grand_total:totals.reduce((t,x)=>t+x.amount,0),notes_used:used,left_out:[]};
}
global.mcqStmtConfig=async()=>CFG;
global.mcqStmtNotes=async(c,m)=>({ok:true,customer:c,month:m,notes:JSON.parse(JSON.stringify(notes)),
  checks:{duplicates:[...new Set(notes.map(n=>n.data&&n.data.number).filter((x,i,a)=>x&&a.indexOf(x)!==i))],missing:[]},
  statement:statement(m),months:[{month:m,count:notes.length}]});
global.compressImage=async()=>'data:image/jpeg;base64,'+Buffer.from('jpegbytes').toString('base64');
global.mcqStmtUpload=async(c,m,blob)=>{ uploads++; if(uploads===3) return {ok:true,duplicate:true,note:notes[0]};
  const n={id:'dn-'+uploads,customer:c,month:m,status:'pending',data:null,warnings:[],createdAt:'2026-11-12 10:0'+uploads};
  notes.push(n); return {ok:true,note:n}; };
let script={};
global.mcqStmtRead=async(id)=>{ reads.push(id); inflight++; maxInflight=Math.max(maxInflight,inflight); await tick(); inflight--;
  const n=notes.find(x=>x.id===id); const s=script[id]||{};
  if(s.fail){ n.status='error'; n.data={error:'the AI is busy'}; return {ok:false,error:'the AI is busy',note:n}; }
  n.status='read'; n.data={number:s.number||id.slice(3),date:s.date||'2026-10-0'+(1+reads.length%9),lines:[{qty:6,product:'pork',item:'Quay',amount:39}],total:39,checked:false};
  n.warnings=s.warn?[{code:'line_math',text:'6 × $6.50 = $39.00, but the note says $38.00'}]:[];
  return {ok:true,note:n}; };
global.mcqStmtPhoto=async()=>'blob:x';

load('assets/statements.js');
load('assets/launcher.js');

(async()=>{
  console.log('1. opening');
  renderStatements(); await tick(); await tick(); await tick();
  check('full-window app', bodyCls.has('on-stmt'));
  check('last month is the default until the 20th', stState().month==='2026-10', stState().month);
  check('supplier -> customer in the hero', /MCQ Street Food/.test(html()) && /M&amp;MW Beechboro/.test(html()));
  check('empty month asks for photos', /Add this month’s delivery notes/.test(html()));
  check('switcher and back-to-apps are there', /go\('apps'\)/.test(html()));
  check('a Super gets prices & access', /stSettings\(\)/.test(html()));

  console.log('\n2. thirty photos in');
  const files=Array.from({length:5},(_,i)=>({type:'image/jpeg',name:'p'+i+'.jpg'}));
  await stAddFiles({files, value:'x'});
  check('uploaded', uploads===5, uploads);
  check('the same photo twice is reported, not added', toasts.some(t=>/4 photos added · 1 already here/.test(t)), toasts);
  check('grid of notes shown', /st-grid/.test(html()) && (html().match(/class="st-tile /g)||[]).length===4);
  check('nothing read yet', /Create statement <em>4 to read<\/em>/.test(html()));
  check('statement waits for Create', /Press <b>Create statement<\/b>/.test(html()));

  console.log('\n3. Create reads only what is unread');
  script={'dn-2':{warn:true,number:'81'}, 'dn-4':{fail:true}};
  await stCreate();
  check('every unread note read once', reads.length===4 && new Set(reads).size===4, reads);
  check('never more than 3 at a time', maxInflight<=3 && maxInflight>=2, maxInflight);
  check('told how many to check', toasts.some(t=>/2 things to check first/.test(t)), toasts.slice(-2));
  check('issues listed first: the bad sum and the failed read',
    /says \$38\.00/.test(html()) && /could not be read/.test(html()));
  check('draft until checked', /Draft — 2 to check/.test(html()) && /st-wm/.test(html()));
  reads=[];
  await stCreate();
  check('pressing again only retries the failed one', reads.length===1 && reads[0]==='dn-4', reads);

  console.log('\n4. the statement');
  script={};
  notes.find(n=>n.id==='dn-4').status='error';
  await stCreate();
  const st=stState().statement;
  check('a row per day', st.days.length===31);
  check('weekend rows marked', /<tr class="we /.test(html()));
  check('three product columns + totals', /Roast Pork Roll/.test(html()) && /Traditional Roll/.test(html()) && /Chicken/.test(html()) && /Grand total/.test(html()));
  check('unit prices from the list', /\$6\.50/.test(html()) && /\$5\.50/.test(html()));
  check('grand total money', html().includes('$'+(st.grand_total).toFixed(2)), st.grand_total);
  check('note numbers column', /Note no\./.test(html()));
  stState().showNums=false; renderStatements();
  check('note numbers can be hidden', !/Note no\./.test(html()));

  console.log('\n5. a note that was checked stops being an issue');
  const n2=stState().notes.find(n=>n.id==='dn-2');
  check('it is open before', stNoteState(n2)==='issue');
  n2.data.checked=true;
  check('closed once a person confirms it', stNoteState(n2)==='ok');
  stState().notes.forEach(n=>{ n.warnings=[]; if(n.data) n.data.checked=true; n.status='read'; });
  stState().checks={duplicates:[],missing:['55']};
  renderStatements();
  check('ready to send', /Ready to send/.test(html()) && !/st-wm/.test(html()));
  check('a gap in note numbers is only information', /No photo for note #55/.test(html()) && stOpenCount()===0);
  stState().notes[0].data.number='90'; stState().notes[1].data.number='90'; stState().notes[1].data.checked=false;
  stState().checks={duplicates:['90'],missing:[]};
  check('the same note number twice blocks until checked', stOpenCount()===1);

  console.log('\n6. small parts');
  window._stEd={month:'2026-10'};
  check('date with 2-digit year', stEdParseDate('30/10/26')==='2026-10-30');
  check('date without a year takes the month', stEdParseDate('5/10')==='2026-10-05');
  check('impossible date refused', stEdParseDate('31/11/26')===null);
  check('97,5 is a decimal', stNum('97,5')===97.5 && stNum('$1,250')===1250 && stNum('')===null);
  check('months move across the year', stShiftMonth('2026-01',-1)==='2025-12' && stShiftMonth('2026-12',1)==='2027-01');
  check('money', stMoney(1234.5)==='$1,234.50');

  console.log('\n7. on the launcher');
  State.route={mod:'apps'};
  check('Super sees the tile', mcqApps().some(a=>a.id==='statements'));
  for(const role of ['staff','employee','ba']){ State.account={role}; check(role+' does not', !mcqApps().some(a=>a.id==='statements')); }
  let asked=0; global.mcqStmtConfig=async()=>{ asked++; return {ok:true}; };
  global.renderLauncher=()=>{};
  State.account={role:'admin'}; window.__mcqStmtOk=undefined;
  check('a manager waits for the server', !mcqApps().some(a=>a.id==='statements'));
  await tick(); await tick();
  check('asked once, then shown when granted', asked===1 && mcqApps().some(a=>a.id==='statements') && asked===1);
  State.route={mod:'statements'};
  check('the switcher knows where you are', mcqCurrentApp()==='statements');

  console.log('\n'+(fails.length?fails.length+' FAILED: '+fails.join(' | '):'ALL PASS'));
  process.exit(fails.length?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
