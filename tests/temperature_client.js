/* Temperature Check page — logic tests against the real assets/temperature.js
   with a stubbed DOM. Run:  node tests/temperature_client.js                */
require('./harness.js');
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');

const painted={};
function el(id){ return painted[id]=painted[id]||{id,innerHTML:'',value:'',textContent:'',className:'',style:{},
  disabled:false,focus(){},select(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];}}; }
global.document.getElementById=id=>painted[id]||null;
global.$=sel=>el(String(sel).replace('#',''));
global.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.setAccent=()=>{}; global.setCrumb=(a,b,c)=>{ painted.__crumb=c; };
let toasts=[]; global.toast=m=>toasts.push(String(m));
global.expToggle=()=>{};
global.expXlsBlob=(t,inner,meta)=>{ painted.__xls={t,inner,meta}; };
global.mcqModal=(title,inner)=>{ painted.__modal={title,inner}; };
global.mcqModalClose=()=>{ painted.__modal=null; };
global.confirm=()=>true;
global.innerWidth=1200;
global.compressImage=async()=>'data:image/jpeg;base64,AAAA';
global.MCQDB={savePhoto:()=>'p_test1'};
global.imgSrc=r=>'blob:'+r; global.openLightbox=()=>{};
global.MCQ_LOGO_URL=''; global.perthStamp=()=>'2026-11-09 09:00';
global.State={account:{role:'admin',branch:'Morley',name:'Mgr',staffName:'Minh Tran'},branch:'Morley',route:{mod:'tempcheck'},charts:[]};
global.isSuper=()=>State.account.role==='super'; global.isBa=()=>State.account.role==='ba';
global.isAdmin=()=>['admin','super'].includes(State.account.role);
function dlgType(v,extra){ el('tc-dlg-in').value=v; Object.keys(extra||{}).forEach(k=>{ el('tc-dlg-'+k).value=extra[k]; }); tcDlgOk(); }
function capturePrint(fn){ let cap=''; const ow=global.open;
  global.open=()=>({document:{write:h=>{cap=h;},close(){}}});
  try{ fn(); } finally { global.open=ow; } return cap; }
let pdfOut=null;
global.jspdf={jsPDF:function(opts){ const o={texts:[],pages:1,saved:null,opts:opts};
  return { internal:{pageSize:{getWidth:()=>(opts&&opts.orientation==='landscape')?842:595,
                               getHeight:()=>(opts&&opts.orientation==='landscape')?595:842},
           getNumberOfPages:()=>o.pages},
    setFillColor(){},rect(){},setTextColor(){},setFont(){},setFontSize(){},setDrawColor(){},setLineWidth(){},
    line(){},addImage(){},setPage(){},addPage(){o.pages++;},splitTextToSize:t=>[String(t)],
    text(t){ o.texts.push(String(t)); }, save(n){ o.saved=n; pdfOut=o; } }; }};
global.ensureJsPDF=()=>Promise.resolve(true);

/* ---- a document shaped like the live one ---- */
const doc={rev:7,seed:5,title:'BUTCHER — TEMPERATURE CHECK',updatedAt:'2026-11-09 08:00',updatedBy:'Office',
  sheets:[
    {id:'sh_butcher',name:'Butcher',title:'BUTCHER — TEMPERATURE CHECK',
     rounds:[{id:'tr1',name:'Morning',time:'08:00',type:'fridge'},
             {id:'tr2',name:'Midday',time:'12:30',type:'fridge'},
             {id:'tr3',name:'Evening',time:'17:30',type:'coolroom'}],
     items:[{id:'ti1',name:'Beef Display — Sample 1'},{id:'ti2',name:'Beef Display — Sample 2'},
            {id:'ti7',name:'Cool Room — Room temperature'}]},
    {id:'sh_dairy',name:'Dairy',title:'DAIRY — TEMPERATURE CHECK',
     rounds:[{id:'trd1',name:'Morning',time:'08:00',type:'fridge'},
             {id:'trd2',name:'Afternoon',time:'16:00',type:'fridge'}],
     items:[{id:'tid1',name:'Dairy Fridge — Air temperature'},{id:'tid2',name:'Fresh Milk'},
            {id:'tid5',name:'Fresh Tofu'}]}],
  recvTitle:'BUTCHER — GOODS RECEIVED TEMPERATURE LOG', qualities:['Good','Acceptable','Rejected'], recvBlankRows:3,
  recvCategories:[{id:'rc1',name:'Pork meat',type:'fridge',catalog:'pork'},{id:'rc2',name:'Beef meat',type:'fridge',catalog:'beef'},
    {id:'rc3',name:'Chicken',type:'fridge',catalog:'chicken'},{id:'rc4',name:'Pork FZ',type:'freezer',catalog:'pork'},
    {id:'rc5',name:'Chicken FZ',type:'freezer',catalog:'chicken'},{id:'rc7',name:'Offals',type:'fridge',catalog:'offals'}]};
const RANGES={fridge:{label:'Fridge',max:5,text:'≤ 5 °C'},coolroom:{label:'Cool room',max:5,text:'≤ 5 °C'},
              freezer:{label:'Freezer',min:-25,max:-15,text:'-25 °C to -15 °C'}};
const CATALOG={beef:['BEEF MINCE /KG'],pork:['PORK BELLY /KG'],chicken:['CHICKEN WINGS /KG'],offals:['BEEF LIVER']};
let log={values:{'tr1|ti1':{v:'2.5',at:'08:05',by:'Minh Tran'}},note:'',products:{ti1:'Scotch Fillet'},
         recv:[],photos:[],tempPhotos:[],updatedAt:'2026-11-09 08:06'};
let saved=null, sentOps=[], rangeCalls=[];
global.mcqTempDoc=()=>Promise.resolve({ok:true,doc:JSON.parse(JSON.stringify(doc)),ranges:RANGES,catalog:CATALOG});
global.mcqTempLog=(store,day)=>Promise.resolve({ok:true,day,log:JSON.parse(JSON.stringify(log))});
global.mcqTempLogSave=(store,p)=>{ saved={store,p:JSON.parse(JSON.stringify(p))}; return Promise.resolve({ok:true,log:{updatedAt:'x'}}); };
global.mcqTempOps=ops=>{ sentOps.push(ops); return Promise.resolve({ok:true,doc:JSON.parse(JSON.stringify(doc))}); };
global.mcqTempLogRange=(st,f,t)=>{ rangeCalls.push([st,f,t]); return Promise.resolve({ok:true,days:[
  {day:'2026-11-06',values:{'tr1|ti1':{v:'9.0'}},note:'fridge serviced',updatedBy:'Minh',updatedAt:'x'}]}); };

vm.runInThisContext(fs.readFileSync(path.join(ROOT,'assets/temperature.js'),'utf8'),{filename:'assets/temperature.js'});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=[];
const check=(n,c,e)=>{ console.log((c?'  ok   ':'  FAIL ')+n+((!c&&e!==undefined)?('  → '+JSON.stringify(e).slice(0,170)):'')); if(!c) fails.push(n); };
const html=()=>painted.content?painted.content.innerHTML:'';

(async()=>{
  console.log('1. two department sheets');
  renderTempCheck(); await sleep(60);
  check('a picker offers Butcher and Dairy', /tcSetSheet\('sh_butcher'\)/.test(html()) && /tcSetSheet\('sh_dairy'\)/.test(html()));
  check('it opens on the butcher sheet', /BUTCHER/.test(html()) && html().includes('Beef Display — Sample 1'));
  check('the sheet does not dictate the product', /write what you probed/.test(html()));
  check('the notes example is not tied to one department', !/Beef display read/.test(html()));
  check('what was probed is remembered', /value="Scotch Fillet"/.test(html()));
  tcSetSheet('sh_dairy');
  check('switching shows the dairy lines', ['Dairy Fridge — Air temperature','Fresh Milk','Fresh Tofu'].every(n=>html().includes(esc(n))));
  { const d=html(), headings=(d.match(/class="tc-h-time">([^<]+)</g)||[]).join(' ');
    check('dairy has its own times', /8:00 AM/.test(headings) && /4:00 PM/.test(headings) && !/12:30/.test(headings), headings); }
  check('butcher lines are not mixed in', !html().includes('Beef Display'));
  tcSetSheet('sh_butcher');

  console.log('\n2. writing a reading and the product probed');
  tcSetProduct('ti2','Beef Mince'); tcSetVal('tr1','ti2','3.1'); await sleep(900);
  check('both reach the server', saved.p.products.ti2==='Beef Mince' && saved.p.values['tr1|ti2'].v==='3.1', saved.p.products);
  check('an edit keeps the earlier one', saved.p.products.ti1==='Scotch Fillet');

  console.log('\n3. a photo belongs to the sheet it was taken on');
  await tcPhoto({files:[{name:'a.jpg'}]},'temp'); await sleep(40);
  check('the temperature sheet keeps its own photos', saved.p.tempPhotos.length===1 && saved.p.photos.length===0, saved.p);
  tcShowView('recv');
  await tcPhoto({files:[{name:'b.jpg'}]},'recv'); await sleep(40);
  check('the delivery paperwork keeps its own', saved.p.photos.length===1 && saved.p.tempPhotos.length===1);

  console.log('\n4. goods received');
  check('Beef FZ is gone', !/Beef FZ/.test(html()) && /Chicken FZ/.test(html()));
  State.temp.recv=[]; tcRecvAdd('rc2'); await sleep(20);
  const rv=html();
  const order=['tc-rv-sup','tc-rv-prod','tc-rv-q','tc-rv-time','tc-rv-temp','tc-rv-by'].map(c=>rv.indexOf(c));
  check('supplier, product, quality, time, temp, received by \u2014 in that order',
    order.every((v,i)=>v>=0 && (i===0||v>order[i-1])), order);
  check('the column headings follow the same order', /SUPPLIER<\/span><span>PRODUCT<\/span><span>QUALITY<\/span><span>TIME IN<\/span><span>TEMP<\/span><span>RECEIVED BY/.test(rv));
  const row=State.temp.recv[0];
  tcRecvSet(row.id,'supplier','Harvey Beef'); tcRecvSet(row.id,'product','BEEF MINCE /KG');
  tcRecvSet(row.id,'temp','3.0'); tcRecvSet(row.id,'time','06:40'); await sleep(900);
  check('a supplier is saved on the line', saved.p.recv[0].supplier==='Harvey Beef', saved.p.recv[0]);
  tcRecvAdd('rc2'); await sleep(20);
  check('the next line keeps the same supplier', State.temp.recv[1].supplier==='Harvey Beef');

  console.log('\n5. the printed record: time down the side, staff at the end');
  tcShowView('day');
  const blank=capturePrint(()=>tcExport('blank'));
  check('TIME is the first column and STAFF the last', /<th style="text-align:left">TIME<\/th>/.test(blank) && /<th>STAFF<\/th>/.test(blank));
  check('each line is a column', blank.includes('Beef Display — Sample 1') && blank.includes('Cool Room — Room temperature'));
  check('a row for the product probed', /Product checked/.test(blank));
  check('one row per check time', ['8:00 AM','12:30 PM','5:30 PM'].every(t=>blank.includes(t)));
  check('the boxes are empty on a blank form', !/2\.5 °C/.test(blank));
  const filled=capturePrint(()=>tcExport('print'));
  check('a filled print carries the reading and who took it', /2\.5 °C/.test(filled) && /Minh/.test(filled));

  console.log('\n6. the received print: narrow time, wide product');
  tcShowView('recv');
  const rp=capturePrint(()=>tcExport('blank'));
  const w=(cls)=>{ const m=new RegExp('col\\.'+cls+'\\{width:(\\d+)%').exec(rp); return m?+m[1]:0; };
  check('the product column is the widest', w('c-prod')>=30, w('c-prod'));
  check('the time column is narrow', w('c-tin')<=9, w('c-tin'));
  check('product is much wider than time', w('c-prod') > w('c-tin')*3, [w('c-prod'),w('c-tin')]);
  check('the heading is shortened to TIME', /<th>TIME<\/th>/.test(rp) && !/TIME RECEIVED/.test(rp));

  console.log('\n6b. everything prints PORTRAIT, never sideways');
  tcShowView('day');
  const bu=capturePrint(()=>tcExport('blank'));
  check('the butcher sheet is portrait', /size:A4 portrait/.test(bu) && !/landscape/.test(bu));
  tcSetSheet('sh_dairy');
  const dy=capturePrint(()=>tcExport('blank'));
  check('the dairy sheet is portrait too', /size:A4 portrait/.test(dy) && !/landscape/.test(dy));
  const thSize=(h)=>{ const m=/\n  th\{[^}]*font-size:(\d+(?:\.\d+)?)px/.exec(h); return m?parseFloat(m[1]):0; };
  check('headings step down when there are more columns', thSize(dy) <= thSize(bu), [thSize(bu),thSize(dy)]);
  check('and they are allowed to wrap', /overflow-wrap:anywhere/.test(dy));
  tcShowView('recv');
  const rvp=capturePrint(()=>tcExport('blank'));
  check('the received form is portrait', /size:A4 portrait/.test(rvp) && !/landscape/.test(rvp));
  tcShowView('day'); tcSetSheet('sh_butcher');

  console.log('\n7. PDF');
  tcShowView('day'); pdfOut=null; await tcPdf(true); await sleep(20);
  check('a blank PDF is produced', /BLANK/.test(pdfOut.saved||''), pdfOut.saved);
  check('the PDF is portrait', (pdfOut.opts||{}).orientation===undefined, pdfOut.opts);
  check('it uses the time-row record', pdfOut.texts.includes('TIME') && pdfOut.texts.includes('STAFF'));
  check('each line is a column heading', pdfOut.texts.some(t=>/Beef Display/.test(t)));
  tcSetSheet('sh_dairy'); pdfOut=null; await tcPdf(false); await sleep(20);
  check('the dairy sheet makes its own PDF', /DAIRY/i.test(pdfOut.saved||'') && pdfOut.texts.some(t=>/Fresh Milk/.test(t)), pdfOut.saved);
  tcSetSheet('sh_butcher');

  console.log('\n8. history still works across sheets');
  rangeCalls=[]; tcShowHistory(); await sleep(60);
  check('it asks for a date range', rangeCalls.length===1);
  check('a day with a bad reading is flagged', /tc-pill bad/.test(html()));
  tcShowDay(); await sleep(20);
  check('and goes back to the sheet', /tc-tbl/.test(html()));

  console.log('\n'+(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS'));
  process.exit(fails.length?1:0);
})();
