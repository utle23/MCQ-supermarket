/* ============================================================================
   RESTAURANT STATEMENTS — a month of delivery notes becomes one statement.

   1. Photograph the month's carbon-copy delivery notes (30 at once is fine).
   2. Press Create statement: Claude reads every note that has not been read.
   3. The statement is built day by day from the price list, and anything that
      does not add up on a note (a sum, a total, a date, an unknown item, the same
      note twice) is listed first, so a person checks those before it is sent.

   Quantities come from the notes; money always comes from the price list. The
   amounts written on paper are only used to catch a misread.
   ============================================================================ */

const ST_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const ST_MON  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function stState(){
  State.stmt = State.stmt || { cfg:null, customer:'', month:'', notes:[], checks:null, statement:null,
    months:[], loading:false, failed:'', up:null, rd:null, showNums:true, created:false };
  return State.stmt;
}
function stMoney(v){ const n=Number(v)||0; return '$'+n.toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function stQty(v){ const n=Number(v)||0; return (Math.round(n*100)/100).toString(); }
function stMonthLabel(m){ if(!/^\d{4}-\d{2}$/.test(m||'')) return m||''; return ST_MON[+m.slice(5,7)-1]+' '+m.slice(0,4); }
function stShiftMonth(m,by){ let y=+m.slice(0,4), mo=+m.slice(5,7)-1+by; y+=Math.floor(mo/12); mo=((mo%12)+12)%12; return y+'-'+String(mo+1).padStart(2,'0'); }
function stDefaultMonth(){
  // statements go out after the month ends: until the 20th, last month is the one being done
  const t=(typeof todayISO==='function')?todayISO():new Date().toISOString().slice(0,10);
  const cur=t.slice(0,7);
  return (+t.slice(8,10) <= 20) ? stShiftMonth(cur,-1) : cur;
}
function stDayLabel(iso){ const d=+iso.slice(8,10), m=+iso.slice(5,7); return d+' '+ST_MON[m-1].slice(0,3); }
function stCustomer(){ const s=stState(); return ((s.cfg&&s.cfg.customers)||[]).find(c=>c.id===s.customer)||{}; }
function stProducts(){ const s=stState(); return (s.cfg&&s.cfg.products)||[]; }
function stLogo(){ try{ return (typeof MCQ_LOGO_URL!=='undefined'&&MCQ_LOGO_URL)||''; }catch(e){ return ''; } }

/* what is still open on a note: unread, failed, or read with something to check */
function stNoteState(n){
  if(n.status==='pending') return 'pending';
  if(n.status==='reading') return 'reading';
  if(n.status==='error') return 'error';
  const d=n.data||{};
  if(d.readable===false) return 'issue';
  if((n.warnings||[]).length && !d.checked) return 'issue';
  return 'ok';
}
function stDupNumbers(){
  const s=stState(), dups=((s.checks&&s.checks.duplicates)||[]);
  // the same note number twice is settled once a person has checked every copy
  return dups.filter(num=>s.notes.filter(n=>(n.data||{}).number===num).some(n=>!(n.data||{}).checked));
}
function stOpenCount(){
  const s=stState();
  return s.notes.filter(n=>['issue','error'].includes(stNoteState(n))).length + stDupNumbers().length;
}

/* ------------------------------------------------------------------ load */
async function stLoad(){
  const s=stState();
  if(s.loading) return;
  if(typeof mcqStmtConfig!=='function'){ s.failed='This needs the MCQ server.'; renderStatements(); return; }
  s.loading=true; s.failed='';
  try{
    if(!s.cfg){
      const c=await mcqStmtConfig();
      if(!c || c.ok===false){ s.loading=false; s.failed='Could not open Restaurant Statements — you may not have access, or the server could not be reached.'; renderStatements(); return; }
      s.cfg=c;
      if(!s.customer) s.customer=((c.customers||[])[0]||{}).id||'';
      if(!s.month) s.month=stDefaultMonth();
    }
    await stReload(true);
  }catch(e){ s.failed='Could not load the statement.'; }
  s.loading=false;
  renderStatements();
}
async function stReload(quiet){
  const s=stState();
  const r=await mcqStmtNotes(s.customer, s.month);
  if(!r || r.ok===false){ if(!quiet) toast('Could not refresh — check the connection'); return false; }
  if(r.customer!==s.customer || r.month!==s.month) return false;     // the picker moved on meanwhile
  s.notes=r.notes||[]; s.checks=r.checks||null; s.statement=r.statement||null; s.months=r.months||[];
  if(!quiet) renderStatements();
  return true;
}
function stSetMonth(m){
  const s=stState(); if(!/^\d{4}-\d{2}$/.test(m||'') || s.up || s.rd) return;
  s.month=m; s.notes=[]; s.statement=null; s.checks=null; s.created=false;
  renderStatements(); stReload(false);
}
function stSetCustomer(id){ const s=stState(); if(s.up||s.rd) return; s.customer=id; stSetMonth(s.month); }
window.stSetMonth=stSetMonth; window.stSetCustomer=stSetCustomer;

/* ---------------------------------------------------------------- photos in */
function stDataUrlToBlob(u){
  const [h,b]=u.split(','), mime=(h.match(/:(.*?);/)||[])[1]||'image/jpeg';
  const bin=atob(b), arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function stCompress(file){
  // 2000px keeps every handwritten digit readable and each photo well under a megabyte
  try{ return stDataUrlToBlob(await compressImage(file, 2000, .86)); }
  catch(e){ return file; }        // let the server try the original
}
async function stAddFiles(input){
  const s=stState();
  const files=[...((input&&input.files)||[])].filter(f=>/^image\//.test(f.type||'image/'));
  if(input) input.value='';
  if(!files.length || s.up || s.rd) return;
  s.up={done:0,total:files.length,dup:0,fail:0,err:''};
  renderStatements();
  let i=0;
  const worker=async()=>{
    while(i<files.length){
      const f=files[i++];
      try{
        const r=await mcqStmtUpload(s.customer, s.month, await stCompress(f));
        if(r && r.ok){
          if(r.duplicate) s.up.dup++;
          else if(r.note && !s.notes.find(n=>n.id===r.note.id)) s.notes.push(r.note);
        }else{ s.up.fail++; s.up.err=(r&&r.error)||''; }
      }catch(e){ s.up.fail++; }
      s.up.done++; stPaintBusy();
    }
  };
  await Promise.all([worker(),worker(),worker()]);
  const u=s.up; s.up=null;
  const added=u.total-u.dup-u.fail;
  toast(`✓ ${added} photo${added===1?'':'s'} added`+(u.dup?` · ${u.dup} already here`:'')+(u.fail?` · ${u.fail} failed${u.err?' ('+u.err+')':''}`:''));
  await stReload(true); renderStatements();
}
window.stAddFiles=stAddFiles;

/* --------------------------------------------------------------- create */
async function stCreate(){
  const s=stState();
  if(s.up || s.rd) return;
  if(!s.notes.length){ toast('Add the delivery note photos first'); return; }
  const todo=s.notes.filter(n=>['pending','error','reading'].includes(n.status));
  if(todo.length){
    if(s.cfg && s.cfg.ai===false){ toast('AI reading is not switched on (ANTHROPIC_API_KEY missing on the server)'); return; }
    s.rd={done:0,total:todo.length,fail:0};
    renderStatements();
    let i=0;
    const worker=async()=>{
      while(i<todo.length){
        const n=todo[i++];
        const r=await mcqStmtRead(n.id, false);
        if(r && r.note){ const k=s.notes.findIndex(x=>x.id===r.note.id); if(k>=0) s.notes[k]=r.note; }
        if(!r || r.ok===false) s.rd.fail++;
        s.rd.done++; stPaintBusy();
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    s.rd=null;
  }
  await stReload(true);
  s.created=true;
  renderStatements();
  const open=stOpenCount();
  toast(open ? `Statement created — ${open} thing${open===1?'':'s'} to check first` : '✓ Statement created — every note adds up');
  setTimeout(()=>{ const el=document.getElementById(open?'st-issues':'st-statement'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }, 80);
}
window.stCreate=stCreate;

/* progress without repainting the whole page under the person's thumb */
function stPaintBusy(){
  const s=stState(), b=s.up||s.rd, el=document.getElementById('st-busy');
  if(!b || !el){ renderStatements(); return; }
  const pct=Math.round(100*b.done/Math.max(1,b.total));
  el.querySelector('.st-busy-bar i').style.width=pct+'%';
  el.querySelector('.st-busy-txt').textContent = s.up
    ? `Uploading photo ${Math.min(b.done+1,b.total)} of ${b.total}…`
    : `Claude is reading note ${Math.min(b.done+1,b.total)} of ${b.total}…`;
  const grid=document.getElementById('st-grid');
  if(grid && s.rd){ grid.outerHTML=stGridHTML(); stHydrate(); }
  if(grid && s.up){ grid.outerHTML=stGridHTML(); stHydrate(); }
}

/* ------------------------------------------------------------------ page */
function renderStatements(){
  const s=stState();
  try{ document.body.classList.add('on-stmt'); }catch(e){}
  try{ setCrumb('🧾','Restaurant Statements',''); }catch(e){}
  const c=$('#content'); if(!c) return;
  if(!s.cfg && !s.failed){
    c.innerHTML=stShell(`<div class="st-empty"><div class="st-spin"></div>Opening Restaurant Statements…</div>`);
    stLoad(); return;
  }
  if(s.failed && !s.cfg){
    c.innerHTML=stShell(`<div class="st-empty"><div class="st-empty-ic">⚠️</div>${esc(s.failed)}
      <div class="st-row-gap"><button class="st-btn" onclick="stRetry()">Try again</button>
      <button class="st-btn ghost" onclick="go('apps')">Back to apps</button></div></div>`);
    return;
  }
  c.innerHTML=stShell(stBodyHTML());
  stHydrate();
}
function stRetry(){ const s=stState(); s.failed=''; s.cfg=null; renderStatements(); }
window.renderStatements=renderStatements; window.stRetry=stRetry;

function stShell(inner){
  const s=stState(), cust=stCustomer();
  const custs=((s.cfg&&s.cfg.customers)||[]);
  const monthOpts=(()=>{ const set=new Set([s.month, stDefaultMonth(), stShiftMonth(stDefaultMonth(),1)]);
    (s.months||[]).forEach(m=>set.add(m.month)); for(let k=1;k<=12;k++) set.add(stShiftMonth(stDefaultMonth(),-k));
    const counts={}; (s.months||[]).forEach(m=>counts[m.month]=m.count);
    return [...set].filter(Boolean).sort().reverse().map(m=>`<option value="${m}" ${m===s.month?'selected':''}>${esc(stMonthLabel(m))}${counts[m]?` · ${counts[m]} notes`:''}</option>`).join(''); })();
  const waffle=(window.mcqWaffleHTML?mcqWaffleHTML():'');
  return `<div class="st-app">
    <header class="st-top">
      <div class="st-top-l">${waffle}
        <button class="st-back" onclick="go('apps')" title="All apps"><i class="fas fa-arrow-left"></i></button>
        <span class="st-brand"><img src="assets/mcq-logo-exact.png" alt="MCQ"></span>
        <div class="st-ttl"><b>Restaurant Statements</b><small>${esc((s.cfg&&s.cfg.supplier)||'MCQ Street Food')}</small></div>
      </div>
      ${s.cfg?`<div class="st-top-r">
        ${custs.length>1?`<select class="st-sel" onchange="stSetCustomer(this.value)" aria-label="Customer">${custs.map(x=>`<option value="${esc(x.id)}" ${x.id===s.customer?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`
          :`<span class="st-cust"><i class="fas fa-store"></i> ${esc(cust.name||'')}</span>`}
        <div class="st-month">
          <button class="st-mbtn" onclick="stSetMonth(stShiftMonth(stState().month,-1))" aria-label="Previous month"><i class="fas fa-chevron-left"></i></button>
          <select class="st-sel" onchange="stSetMonth(this.value)" aria-label="Month">${monthOpts}</select>
          <button class="st-mbtn" onclick="stSetMonth(stShiftMonth(stState().month,1))" aria-label="Next month"><i class="fas fa-chevron-right"></i></button>
        </div>
        ${s.cfg.canConfig?`<button class="st-icon" onclick="stSettings()" title="Prices & access"><i class="fas fa-sliders"></i></button>`:''}
      </div>`:''}
    </header>
    <main class="st-main">${inner}</main>
  </div>`;
}
window.stShiftMonth=stShiftMonth; window.stState=stState;

function stBodyHTML(){
  const s=stState(), cust=stCustomer();
  const counts={all:s.notes.length, pending:0, ok:0, issue:0, error:0, reading:0};
  s.notes.forEach(n=>counts[stNoteState(n)]++);
  const busy=s.up||s.rd;
  const unread=counts.pending+counts.error+counts.reading;
  const ready=s.notes.length && !unread;
  const open=stOpenCount();
  const step=(k,t,on,done)=>`<div class="st-step ${on?'on':''} ${done?'done':''}"><span>${done?'<i class="fas fa-check"></i>':k}</span>${t}</div>`;
  return `
    <section class="st-hero">
      <div>
        <p class="st-kicker">STATEMENT · ${esc(stMonthLabel(s.month)).toUpperCase()}</p>
        <h1>${esc((s.cfg&&s.cfg.supplier)||'')} <span>→</span> ${esc(cust.name||'')}</h1>
        <div class="st-steps">
          ${step(1,'Photograph the notes', !s.notes.length, s.notes.length>0)}
          ${step(2,'Create statement', s.notes.length && unread, ready)}
          ${step(3,'Check & download', ready, ready && !open)}
        </div>
      </div>
      <div class="st-hero-r">
        <div class="st-stat"><b>${counts.all}</b><span>photos</span></div>
        <div class="st-stat"><b>${counts.ok}</b><span>read</span></div>
        <div class="st-stat ${open?'warn':''}"><b>${open}</b><span>to check</span></div>
        <div class="st-stat money"><b>${stMoney(s.statement?s.statement.grand_total:0)}</b><span>total so far</span></div>
      </div>
    </section>

    <section class="st-card">
      <div class="st-card-h">
        <div><h2>Delivery notes</h2><p>Every note from ${esc(stMonthLabel(s.month))}. Add them all at once from the camera roll, or one by one with the camera.</p></div>
        <div class="st-actions">
          <label class="st-btn ghost ${busy?'dis':''}"><input type="file" accept="image/*" multiple onchange="stAddFiles(this)" ${busy?'disabled':''}><i class="fas fa-images"></i> Add photos</label>
          <label class="st-btn ghost ${busy?'dis':''}"><input type="file" accept="image/*" capture="environment" onchange="stAddFiles(this)" ${busy?'disabled':''}><i class="fas fa-camera"></i> Take photo</label>
          <button class="st-btn go ${busy||!s.notes.length?'dis':''}" onclick="stCreate()" ${busy?'disabled':''}>
            <i class="fas fa-wand-magic-sparkles"></i> ${unread?`Create statement <em>${unread} to read</em>`:(s.notes.length?'Create statement':'Create statement')}</button>
        </div>
      </div>
      ${busy?`<div class="st-busy" id="st-busy"><div class="st-busy-txt">${s.up?'Uploading…':'Claude is reading…'}</div><div class="st-busy-bar"><i style="width:${Math.round(100*busy.done/Math.max(1,busy.total))}%"></i></div></div>`:''}
      ${s.cfg&&s.cfg.ai===false?`<div class="st-note-warn"><i class="fas fa-circle-info"></i> AI reading is off: the server has no ANTHROPIC_API_KEY. Photos can still be added and typed in by hand.</div>`:''}
      ${s.notes.length?stGridHTML():`<label class="st-drop ${busy?'dis':''}"><input type="file" accept="image/*" multiple onchange="stAddFiles(this)" ${busy?'disabled':''}>
          <i class="fas fa-cloud-arrow-up"></i><b>Add this month’s delivery notes</b><span>Select all the photos at once — 30 is fine. They are kept in the ${esc(cust.name||'')} invoice folder.</span></label>`}
    </section>

    ${stIssuesHTML()}
    ${stStatementHTML()}
  `;
}

function stGridHTML(){
  const s=stState();
  const order={issue:0,error:1,reading:2,pending:3,ok:4};
  const list=[...s.notes].sort((a,b)=>{
    const da=(a.data||{}).date||'9999', db=(b.data||{}).date||'9999';
    return da<db?-1:da>db?1:(((+((a.data||{}).number))||0)-((+((b.data||{}).number))||0)) || (a.createdAt<b.createdAt?-1:1);
  });
  const cards=list.map((n,i)=>{
    const st=stNoteState(n), d=n.data||{};
    const rolls=(d.lines||[]).reduce((t,l)=>t+(Number(l.qty)||0),0);
    const chip={pending:'<span class="st-chip">Not read yet</span>',
                reading:'<span class="st-chip rd"><span class="st-spin sm"></span> Reading</span>',
                error:'<span class="st-chip bad"><i class="fas fa-triangle-exclamation"></i> Type it in</span>',
                issue:'<span class="st-chip warn"><i class="fas fa-circle-exclamation"></i> Check</span>',
                ok:`<span class="st-chip ok"><i class="fas fa-check"></i> ${d.checked?'Checked':'Read'}</span>`}[st];
    const sub = (st==='ok'||st==='issue') && d.readable!==false
      ? `<b>#${esc(d.number||'?')}</b> · ${d.date?esc(stDayLabel(d.date)):'<span class="bad">no date</span>'} · ${stQty(rolls)} rolls`
      : (st==='error' ? esc(((n.data||{}).error)||'Could not be read') : 'Photo '+(i+1));
    return `<button class="st-tile ${st}" onclick="stOpen('${n.id}')">
        <span class="st-thumb"><img data-st-photo="${n.id}" alt=""></span>
        ${chip}
        <span class="st-tile-sub">${sub}</span>
      </button>`;
  }).join('');
  return `<div class="st-grid" id="st-grid">${cards}</div>`;
}
/* thumbnails need the sign-in header, so they are fetched, not linked */
function stHydrate(){
  document.querySelectorAll('img[data-st-photo]').forEach(img=>{
    if(img.dataset.loaded) return; img.dataset.loaded='1';
    mcqStmtPhoto(img.dataset.stPhoto, true).then(u=>{ img.src=u; }).catch(()=>{ img.dataset.loaded=''; });
  });
}

function stIssuesHTML(){
  const s=stState();
  if(!s.notes.length) return '';
  const items=[];
  s.notes.forEach(n=>{
    const st=stNoteState(n), d=n.data||{};
    const tag=d.number?('Note #'+esc(d.number)):'A photo';
    if(st==='error') items.push({id:n.id,lvl:'bad',t:`${tag} could not be read — ${esc(d.error||'type it in')}`});
    if(st==='issue') (n.warnings||[]).forEach(w=>items.push({id:n.id,lvl:'warn',t:`${tag}${d.date?' ('+esc(stDayLabel(d.date))+')':''}: ${esc(w.text)}`}));
  });
  stDupNumbers().forEach(num=>{ const n=s.notes.find(x=>(x.data||{}).number===num);
    items.push({id:n&&n.id,lvl:'bad',t:`Note #${esc(num)} is here twice — delete the extra photo, or it is counted twice`}); });
  const miss=(s.checks&&s.checks.missing)||[];
  const unread=s.notes.filter(n=>['pending','reading'].includes(n.status)).length;
  if(!items.length && !miss.length && !unread) return '';
  return `<section class="st-card st-issues" id="st-issues">
    <div class="st-card-h"><div><h2>${items.length?`Check ${items.length} thing${items.length===1?'':'s'} before sending`:'Nothing to fix'}</h2>
      <p>${items.length?'Tap one to see the photo beside what was read. Fix it, or confirm it is right.':'Every note that was read adds up.'}</p></div></div>
    ${unread?`<div class="st-iss info"><i class="fas fa-hourglass-half"></i> ${unread} photo${unread===1?' has':'s have'} not been read yet — press <b>Create statement</b>.</div>`:''}
    ${items.map(x=>`<button class="st-iss ${x.lvl}" ${x.id?`onclick="stOpen('${x.id}')"`:''}><i class="fas ${x.lvl==='bad'?'fa-triangle-exclamation':'fa-circle-exclamation'}"></i><span>${x.t}</span><i class="fas fa-chevron-right st-iss-go"></i></button>`).join('')}
    ${miss.length?`<div class="st-iss info"><i class="fas fa-circle-info"></i><span>No photo for note${miss.length===1?'':'s'} #${miss.slice(0,20).map(esc).join(', #')}${miss.length>20?'…':''}. Fine if ${miss.length===1?'it':'they'} went to another customer or ${miss.length===1?'was':'were'} cancelled.</span></div>`:''}
  </section>`;
}

/* ------------------------------------------------------------- statement */
function stStatementHTML(){
  const s=stState(), st=s.statement;
  if(!st || !s.notes.length) return '';
  const unread=s.notes.filter(n=>['pending','reading','error'].includes(n.status)).length;
  if(!st.notes_used && unread) return `<section class="st-card st-wait" id="st-statement">
      <div class="st-empty"><div class="st-empty-ic">🧾</div>Press <b>Create statement</b> and Claude reads the ${unread} photo${unread===1?'':'s'}.<br>The statement appears here.</div></section>`;
  const open=stOpenCount();
  const cust=stCustomer(), prods=st.products||[];
  const nums=s.showNums;
  const rows=st.days.map(d=>{
    const we=d.weekday>=5, any=prods.some(p=>d.qty[p.id]);
    return `<tr class="${we?'we':''} ${any?'':'none'}"><td class="st-d">${esc(stDayLabel(d.date))}</td><td class="st-wd">${ST_DAYS[d.weekday]}</td>
      ${prods.map(p=>`<td class="n">${d.qty[p.id]?stQty(d.qty[p.id]):''}</td>`).join('')}
      ${nums?`<td class="st-nums">${(d.notes||[]).map(esc).join(', ')}</td>`:''}</tr>`;
  }).join('');
  const tot=Object.fromEntries((st.totals||[]).map(t=>[t.product,t]));
  const cols=prods.length;
  return `<section class="st-card st-doc-card" id="st-statement">
    <div class="st-card-h">
      <div><h2>Statement</h2><p>${open?`<span class="st-draft">Draft — ${open} to check</span> `:'<span class="st-ready"><i class="fas fa-check"></i> Ready to send</span> '}Built from ${st.notes_used} delivery note${st.notes_used===1?'':'s'}; money from the price list.</p></div>
      <div class="st-actions">
        <label class="st-toggle"><input type="checkbox" ${nums?'checked':''} onchange="stState().showNums=this.checked;renderStatements()"> Note numbers</label>
        <button class="st-btn ghost" onclick="stExcel()"><i class="fas fa-file-excel"></i> Excel</button>
        <button class="st-btn ghost" onclick="stPdf(true)"><i class="fas fa-print"></i> Print</button>
        <button class="st-btn go" onclick="stPdf(false)"><i class="fas fa-file-pdf"></i> Download PDF</button>
      </div>
    </div>
    <div class="st-doc">
      ${open?'<div class="st-wm" aria-hidden="true">DRAFT</div>':''}
      <div class="st-doc-head">
        <div class="st-doc-logo">${stLogo()?`<img src="${stLogo()}" alt="MCQ">`:'<b>MCQ</b>'}</div>
        <div class="st-doc-ttl"><span>STATEMENT</span><b>${esc(stMonthLabel(st.month))}</b></div>
      </div>
      <div class="st-doc-parties">
        <div><small>FROM</small><b>${esc(st.supplier)}</b>${s.cfg&&s.cfg.abn?`<span>ABN ${esc(s.cfg.abn)}</span>`:''}</div>
        <div><small>TO</small><b>${esc(st.customer)}</b></div>
        <div><small>PERIOD</small><b>1 – ${st.days.length} ${esc(stMonthLabel(st.month))}</b><span>Issued ${esc(stIssued())}</span></div>
      </div>
      <h3 class="st-doc-line">Statement From ${esc(st.supplier)} To ${esc(st.customer)} — ${esc(stMonthLabel(st.month))}</h3>
      <div class="st-tbl-wrap"><table class="st-tbl">
        <thead><tr><th>Date</th><th>Day</th>${prods.map(p=>`<th class="n">${esc(p.name)}</th>`).join('')}${nums?'<th class="st-nums">Note no.</th>':''}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="t-qty"><th colspan="2">Total quantity</th>${prods.map(p=>`<td class="n">${stQty((tot[p.id]||{}).qty)}</td>`).join('')}${nums?'<td></td>':''}</tr>
          <tr class="t-price"><th colspan="2">Unit price</th>${prods.map(p=>`<td class="n">${stMoney((tot[p.id]||{}).price)}</td>`).join('')}${nums?'<td></td>':''}</tr>
          <tr class="t-amt"><th colspan="2">Amount</th>${prods.map(p=>`<td class="n">${stMoney((tot[p.id]||{}).amount)}</td>`).join('')}${nums?'<td></td>':''}</tr>
          <tr class="t-grand"><th colspan="2">Grand total</th><td class="n" colspan="${cols+(nums?1:0)}">${stMoney(st.grand_total)}</td></tr>
        </tfoot>
      </table></div>
      ${(st.left_out||[]).length?`<p class="st-left">Not on this statement: ${st.left_out.map(x=>'#'+esc(x.number||'?')+' ('+esc(x.reason)+')').join(', ')}</p>`:''}
    </div>
  </section>`;
}
function stIssued(){ const t=(typeof todayISO==='function')?todayISO():new Date().toISOString().slice(0,10); return +t.slice(8,10)+' '+ST_MON[+t.slice(5,7)-1]+' '+t.slice(0,4); }

/* ------------------------------------------------------------ note editor */
function stOpen(id){
  const s=stState(), n=s.notes.find(x=>x.id===id); if(!n) return;
  const d=n.data||{}, prods=stProducts();
  const lines=(d.lines&&d.lines.length)?d.lines:[{qty:'',product:'',item:'',amount:''}];
  const dateVal=d.date?(d.date.slice(8,10)+'/'+d.date.slice(5,7)+'/'+d.date.slice(2,4)):(d.raw_date||'');
  const warn=(n.warnings||[]);
  const ov=mcqModal(`${d.number?'Delivery note #'+esc(d.number):'Delivery note'}`, `
    <div class="stn">
      <div class="stn-ph"><div class="stn-ph-in"><span class="st-spin"></span><img id="stn-img" alt="Delivery note photo" onclick="openLightbox(this.src)"></div>
        <small>Tap the photo to zoom</small></div>
      <div class="stn-f">
        ${n.status==='error'?`<div class="stn-msg bad"><i class="fas fa-triangle-exclamation"></i> ${esc(d.error||'Could not be read')} — type it in below, or read it again.</div>`:''}
        ${d.readable===false?`<div class="stn-msg bad"><i class="fas fa-triangle-exclamation"></i> This did not look like a delivery note to Claude.</div>`:''}
        ${warn.map(w=>`<div class="stn-msg ${d.checked?'done':'warn'}"><i class="fas ${d.checked?'fa-check':'fa-circle-exclamation'}"></i> ${esc(w.text)}</div>`).join('')}
        <div class="stn-row">
          <label>Note no.<input id="stn-num" inputmode="numeric" value="${esc(d.number||'')}"></label>
          <label>Date <small>DD/MM/YY</small><input id="stn-date" value="${esc(dateVal)}" placeholder="30/10/26" oninput="stEdCalc()"></label>
        </div>
        <div class="stn-lines" id="stn-lines">
          <div class="stn-lh"><span>Qty</span><span>Item</span><span>Amount on note</span><span></span></div>
          ${lines.map(l=>stLineHTML(l,prods)).join('')}
        </div>
        <button class="st-link" onclick="stEdAddLine()"><i class="fas fa-plus"></i> Add a line</button>
        <div class="stn-row">
          <label>Total written on the note<input id="stn-total" inputmode="decimal" value="${d.total==null?'':esc(d.total)}" oninput="stEdCalc()"></label>
          <div class="stn-calc" id="stn-calc"></div>
        </div>
        <label class="stn-move" id="stn-move-wrap" style="display:none"><input type="checkbox" id="stn-move" checked> <span id="stn-move-txt"></span></label>
        ${d.by==='person'?`<div class="stn-by">Typed in / checked by a person</div>`:(d.model?`<div class="stn-by">Read by ${esc(d.model)}</div>`:'')}
        <div class="stn-act">
          <button class="st-btn danger ghost" onclick="stEdDelete('${n.id}')"><i class="fas fa-trash"></i></button>
          <button class="st-btn ghost" onclick="stEdReread('${n.id}')"><i class="fas fa-rotate"></i> Read again</button>
          <span class="sp"></span>
          <button class="st-btn go" onclick="stEdSave('${n.id}')"><i class="fas fa-check"></i> ${warn.length&&!d.checked?'It’s right — save':'Save'}</button>
        </div>
      </div>
    </div>`, {wide:true});
  try{ ov.querySelector('.mcq-modal-panel').classList.add('stn-panel'); }catch(e){}
  window._stEd={id, month:n.month};
  mcqStmtPhoto(id,false).then(u=>{ const im=document.getElementById('stn-img'); if(im){ im.src=u; im.parentNode.classList.add('in'); } }).catch(()=>{});
  stEdCalc();
}
function stLineHTML(l,prods){
  const opts=`<option value="">— not on the price list —</option>`+prods.map(p=>`<option value="${esc(p.id)}" ${p.id===l.product?'selected':''}>${esc(p.name)} · ${stMoney(p.price)}</option>`).join('');
  return `<div class="stn-line">
    <input class="q" inputmode="decimal" value="${l.qty==null?'':esc(l.qty)}" oninput="stEdCalc()" aria-label="Quantity">
    <span class="it"><select oninput="stEdCalc()" aria-label="Item">${opts}</select>${l.item?`<small>written: “${esc(l.item)}”</small>`:''}<input type="hidden" class="raw" value="${esc(l.item||'')}"></span>
    <input class="a" inputmode="decimal" value="${l.amount==null?'':esc(l.amount)}" oninput="stEdCalc()" aria-label="Amount">
    <button class="x" onclick="this.parentNode.remove();stEdCalc()" aria-label="Remove line">✕</button>
  </div>`;
}
function stEdAddLine(){ const box=document.getElementById('stn-lines'); if(!box) return;
  box.insertAdjacentHTML('beforeend', stLineHTML({qty:'',product:'',item:'',amount:''}, stProducts())); }
function stNum(v){ const t=String(v==null?'':v).trim().replace('$','').replace(/\s/g,''); if(!t) return null;
  const x=/^\d+,\d{1,2}$/.test(t)?t.replace(',','.'):t.replace(/,/g,''); const n=parseFloat(x); return isNaN(n)?null:n; }
function stEdLines(){
  return [...document.querySelectorAll('#stn-lines .stn-line')].map(r=>({
    qty:stNum(r.querySelector('.q').value), product:r.querySelector('select').value||null,
    item:r.querySelector('.raw').value||'', amount:stNum(r.querySelector('.a').value)
  })).filter(l=>l.qty!=null||l.amount!=null||l.product);
}
function stEdParseDate(v){
  const m=/^\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?\s*$/.exec(v||''); if(!m) return null;
  let y=m[3]?+m[3]:+(window._stEd&&window._stEd.month||'').slice(0,4); if(y<100) y+=2000;
  const mo=+m[2], d=+m[1]; if(mo<1||mo>12||d<1||d>new Date(y,mo,0).getDate()) return null;
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function stEdCalc(){
  const prods=stProducts(), price=id=>{ const p=prods.find(x=>x.id===id); return p?Number(p.price)||0:0; };
  const lines=stEdLines();
  let calc=0, bad=0;
  document.querySelectorAll('#stn-lines .stn-line').forEach(r=>{
    const q=stNum(r.querySelector('.q').value), pid=r.querySelector('select').value, a=stNum(r.querySelector('.a').value);
    const exp=(q!=null&&pid)?Math.round(q*price(pid)*100)/100:null;
    const off=exp!=null&&a!=null&&Math.abs(exp-a)>0.01;
    r.classList.toggle('off', off); if(off) bad++;
  });
  lines.forEach(l=>{ if(l.qty!=null&&l.product) calc+=l.qty*price(l.product); });
  const tot=stNum((document.getElementById('stn-total')||{}).value);
  const el=document.getElementById('stn-calc');
  if(el) el.innerHTML=`<small>From the price list</small><b>${stMoney(calc)}</b>`+
    (tot!=null&&Math.abs(tot-calc)>0.01?`<em>${stMoney(tot)} written on the note</em>`:'')+(bad?`<em>${bad} line${bad===1?'':'s'} don’t match the price</em>`:'');
  const iso=stEdParseDate((document.getElementById('stn-date')||{}).value);
  const mv=document.getElementById('stn-move-wrap'), ed=window._stEd||{};
  if(mv){ const other=iso&&iso.slice(0,7)!==ed.month; mv.style.display=other?'':'none';
    if(other) document.getElementById('stn-move-txt').textContent='Dated '+stMonthLabel(iso.slice(0,7))+' — move it to that month’s statement'; }
}
async function stEdSave(id){
  const s=stState();
  const date=(document.getElementById('stn-date')||{}).value||'';
  if(date.trim() && !stEdParseDate(date)){ toast('Date not understood — use DD/MM/YY'); return; }
  const mv=document.getElementById('stn-move');
  const payload={checked:true, move:!!(mv&&mv.checked&&document.getElementById('stn-move-wrap').style.display!=='none'),
    data:{number:(document.getElementById('stn-num')||{}).value||'', date, lines:stEdLines(),
          total:stNum((document.getElementById('stn-total')||{}).value)}};
  const r=await mcqStmtSave(id,payload);
  if(!r || r.ok===false){ toast((r&&r.error)||'Could not save — try again'); return; }
  mcqModalClose();
  toast(r.moved?('✓ Saved and moved to '+stMonthLabel(r.moved)):'✓ Saved');
  await stReload(true); renderStatements();
  // straight on to the next thing to check
  const next=s.notes.find(n=>n.id!==id && ['issue','error'].includes(stNoteState(n)));
  if(next) setTimeout(()=>stOpen(next.id), 160);
}
async function stEdReread(id){
  const s=stState();
  if(s.cfg && s.cfg.ai===false){ toast('AI reading is not switched on'); return; }
  const b=event&&event.currentTarget; if(b){ b.disabled=true; b.innerHTML='<span class="st-spin sm"></span> Reading…'; }
  const r=await mcqStmtRead(id,true);
  if(!r || r.ok===false) toast((r&&r.error)||'Could not read it'); else toast('✓ Read again');
  await stReload(true); renderStatements(); stOpen(id);
}
async function stEdDelete(id){
  if(!confirm('Delete this photo and what was read from it? It comes off the statement.')) return;
  const r=await mcqStmtDelete(id);
  if(!r || r.ok===false){ toast('Could not delete'); return; }
  mcqModalClose(); toast('Deleted');
  await stReload(true); renderStatements();
}
window.stOpen=stOpen; window.stEdAddLine=stEdAddLine; window.stEdCalc=stEdCalc;
window.stEdSave=stEdSave; window.stEdReread=stEdReread; window.stEdDelete=stEdDelete;

/* --------------------------------------------------------------- settings */
function stSettings(){
  const s=stState(); if(!s.cfg||!s.cfg.canConfig) return;
  const cust=stCustomer(), stores=((window.DB&&DB.stores)||[]).filter(x=>x&&x!=='All stores');
  mcqModal('Prices & access', `
    <div class="stset">
      <label>Supplier (on the statement)<input id="stset-sup" value="${esc(s.cfg.supplier||'')}"></label>
      <label>ABN <small>(optional)</small><input id="stset-abn" value="${esc(s.cfg.abn||'')}"></label>
      <label>Customer name<input id="stset-cust" value="${esc(cust.name||'')}"></label>
      <h4>Price list</h4>
      ${stProducts().map(p=>`<div class="stset-p" data-id="${esc(p.id)}">
        <input class="nm" value="${esc(p.name)}" aria-label="Product name">
        <span class="pr">$<input class="price" inputmode="decimal" value="${Number(p.price).toFixed(2)}" aria-label="Price"></span>
        <input class="al" value="${esc((p.aliases||[]).join(', '))}" placeholder="how it is written: quay, thit…" aria-label="Written as">
      </div>`).join('')}
      <p class="stset-hint">“Written as” is how the item appears on the notes; Claude uses it to match each line to a price.</p>
      <h4>Who can make ${esc(cust.name||'')} statements</h4>
      <p class="stset-hint">Super always can. Tick a store to let its managers too.</p>
      <div class="stset-stores">${stores.map(x=>`<label><input type="checkbox" value="${esc(x)}" ${(cust.stores||[]).includes(x)?'checked':''}> ${esc(x)}</label>`).join('')}</div>
      <div class="stn-act"><span class="sp"></span><button class="st-btn ghost" onclick="mcqModalClose()">Cancel</button>
        <button class="st-btn go" onclick="stSettingsSave()">Save</button></div>
    </div>`);
}
async function stSettingsSave(){
  const s=stState(), cust=stCustomer();
  const products=[...document.querySelectorAll('.stset-p')].map(r=>({id:r.dataset.id, name:r.querySelector('.nm').value.trim(),
    price:stNum(r.querySelector('.price').value), aliases:r.querySelector('.al').value.split(',').map(x=>x.trim()).filter(Boolean)}));
  if(products.some(p=>p.price==null||p.price<0)){ toast('Every price needs a number'); return; }
  const stores=[...document.querySelectorAll('.stset-stores input:checked')].map(x=>x.value);
  const r=await mcqStmtConfigSave({supplier:document.getElementById('stset-sup').value, abn:document.getElementById('stset-abn').value,
    customers:[{id:cust.id, name:document.getElementById('stset-cust').value, stores}], products});
  if(!r || r.ok===false){ toast('Could not save'); return; }
  mcqModalClose(); toast('✓ Saved — the statement uses the new prices');
  s.cfg=null; await stLoad();
}
window.stSettings=stSettings; window.stSettingsSave=stSettingsSave;

/* ------------------------------------------------------------------ PDF */
async function stPdf(print){
  const s=stState(), st=s.statement; if(!st) return;
  const open=stOpenCount();
  if(open && !confirm(`${open} thing${open===1?' is':'s are'} still to check. Make it anyway, marked DRAFT?`)) return;
  const ok=await (window.ensureJsPDF?ensureJsPDF():Promise.resolve(false));
  if(!ok || !(window.jspdf&&window.jspdf.jsPDF)){ toast('PDF engine not ready — check the connection'); return; }
  const { jsPDF }=window.jspdf, doc=new jsPDF({unit:'pt',format:'a4'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=40, TW=PW-2*M;
  const prods=st.products||[], nums=s.showNums;
  const ink=[15,23,42], teal=[11,79,108], soft=[100,116,139], red=[220,38,38];
  // --- head
  doc.setFillColor(...teal); doc.rect(0,0,PW,6,'F');
  const logo=stLogo(); let y=30;
  if(logo){ try{ doc.addImage(logo,'PNG',M,y,54,54); }catch(e){} }
  doc.setTextColor(...teal); doc.setFont('helvetica','bold'); doc.setFontSize(26);
  doc.text('STATEMENT', PW-M, y+24, {align:'right'});
  doc.setTextColor(...ink); doc.setFontSize(12.5); doc.text(stMonthLabel(st.month), PW-M, y+44, {align:'right'});
  y=104;
  const third=TW/3;
  const party=(x,label,main,sub)=>{ doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...soft); doc.text(label,x,y);
    doc.setFontSize(11.5); doc.setTextColor(...ink); doc.text(String(main),x,y+15);
    if(sub){ doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...soft); doc.text(String(sub),x,y+28); } };
  party(M,'FROM',st.supplier,(s.cfg&&s.cfg.abn)?('ABN '+s.cfg.abn):'');
  party(M+third,'TO',st.customer,'');
  party(M+2*third,'PERIOD','1 – '+st.days.length+' '+stMonthLabel(st.month),'Issued '+stIssued());
  y+=44;
  doc.setDrawColor(226,232,240); doc.line(M,y,PW-M,y); y+=18;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...ink);
  doc.text(`Statement From ${st.supplier} To ${st.customer} — ${stMonthLabel(st.month)}`, M, y); y+=12;
  // --- table
  const wDate=62, wDay=38, wNum=nums?70:0, wP=(TW-wDate-wDay-wNum)/Math.max(1,prods.length);
  const xs=[M, M+wDate]; prods.forEach((p,i)=>xs.push(M+wDate+wDay+i*wP)); const xNum=M+wDate+wDay+prods.length*wP;
  const RH=Math.min(15.2, (PH-y-200)/st.days.length);
  doc.setFillColor(...teal); doc.rect(M,y,TW,24,'F');
  doc.setTextColor(255); doc.setFontSize(8.6); doc.setFont('helvetica','bold');
  doc.text('DATE',M+6,y+15); doc.text('DAY',M+wDate+4,y+15);
  prods.forEach((p,i)=>doc.text(String(p.name).toUpperCase(), xs[2+i]+wP-6, y+15, {align:'right', maxWidth:wP-10}));
  if(nums) doc.text('NOTE NO.', xNum+wNum-6, y+15, {align:'right'});
  y+=24;
  st.days.forEach((d,i)=>{
    const we=d.weekday>=5;
    if(we){ doc.setFillColor(254,242,242); doc.rect(M,y,TW,RH,'F'); }
    else if(i%2){ doc.setFillColor(248,250,252); doc.rect(M,y,TW,RH,'F'); }
    doc.setTextColor(...(we?red:ink)); doc.setFont('helvetica', we?'bold':'normal'); doc.setFontSize(8.8);
    doc.text(stDayLabel(d.date), M+6, y+RH-4.4); doc.text(ST_DAYS[d.weekday], M+wDate+4, y+RH-4.4);
    doc.setFont('helvetica','normal');
    prods.forEach((p,k)=>{ if(d.qty[p.id]) doc.text(stQty(d.qty[p.id]), xs[2+k]+wP-6, y+RH-4.4, {align:'right'}); });
    if(nums && (d.notes||[]).length){ doc.setFontSize(7.4); doc.setTextColor(...soft);
      doc.text((d.notes||[]).join(', '), xNum+wNum-6, y+RH-4.6, {align:'right', maxWidth:wNum-8}); }
    y+=RH;
  });
  doc.setDrawColor(...teal); doc.setLineWidth(1); doc.line(M,y,PW-M,y); doc.setLineWidth(.5);
  const tot=Object.fromEntries((st.totals||[]).map(t=>[t.product,t]));
  const foot=(label,fn,bold)=>{ doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(9.4); doc.setTextColor(...ink);
    doc.text(label, M+6, y+13); prods.forEach((p,k)=>doc.text(fn(tot[p.id]||{}), xs[2+k]+wP-6, y+13, {align:'right'})); y+=18; };
  foot('Total quantity', t=>stQty(t.qty), true);
  foot('Unit price', t=>stMoney(t.price), false);
  foot('Amount', t=>stMoney(t.amount), true);
  y+=4;
  doc.setFillColor(198,242,78); doc.roundedRect(PW-M-220, y, 220, 34, 6, 6, 'F');
  doc.setTextColor(26,36,5); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('GRAND TOTAL', PW-M-208, y+21);
  doc.setFontSize(15); doc.text(stMoney(st.grand_total), PW-M-12, y+22, {align:'right'});
  y+=50;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.8); doc.setTextColor(...soft);
  doc.text(`Built from ${st.notes_used} delivery note${st.notes_used===1?'':'s'}. Weekends in red.`, M, PH-30);
  doc.text(String(st.supplier), PW-M, PH-30, {align:'right'});
  if(open){ doc.setTextColor(254,202,202); doc.setFont('helvetica','bold'); doc.setFontSize(110);
    doc.text('DRAFT', PW/2, PH/2+40, {align:'center', angle:30}); }
  const name=`Statement_${String(st.customer).replace(/[^a-z0-9]+/gi,'_')}_${st.month}${open?'_DRAFT':''}.pdf`;
  if(print){ try{ doc.autoPrint(); window.open(doc.output('bloburl'),'_blank'); return; }catch(e){} }
  doc.save(name);
}
function stExcel(){
  const s=stState(), st=s.statement; if(!st) return;
  const prods=st.products||[], tot=Object.fromEntries((st.totals||[]).map(t=>[t.product,t]));
  const td=(v,st2)=>`<td style="border:1px solid #e2e8f0;padding:5px 9px;${st2||''}">${v}</td>`;
  const rows=st.days.map(d=>{ const we=d.weekday>=5, c=we?'color:#dc2626;':'';
    return `<tr>${td(esc(d.date),c)}${td(ST_DAYS[d.weekday],c)}${prods.map(p=>td(d.qty[p.id]||'',c+'text-align:right')).join('')}${td(esc((d.notes||[]).join(', ')),'color:#64748b')}</tr>`; }).join('');
  const f=(l,fn,b)=>`<tr><td colspan="2" style="padding:5px 9px;${b?'font-weight:bold':''}">${l}</td>${prods.map(p=>td(fn(tot[p.id]||{}),'text-align:right;'+(b?'font-weight:bold':''))).join('')}<td></td></tr>`;
  const html=`<html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;font-family:Calibri,Arial;font-size:12px">
    <tr><td colspan="${prods.length+3}" style="font-size:17px;font-weight:bold;color:#0b4f6c;padding:8px 9px">Statement From ${esc(st.supplier)} To ${esc(st.customer)} — ${esc(stMonthLabel(st.month))}</td></tr>
    <tr>${['Date','Day'].concat(prods.map(p=>p.name)).concat(['Note no.']).map(h=>`<th style="background:#0b4f6c;color:#fff;padding:6px 9px;border:1px solid #cbd5e1">${esc(h)}</th>`).join('')}</tr>
    ${rows}${f('Total quantity',t=>stQty(t.qty),true)}${f('Unit price',t=>Number(t.price||0).toFixed(2))}${f('Amount',t=>Number(t.amount||0).toFixed(2),true)}
    <tr><td colspan="2" style="padding:7px 9px;font-weight:bold;background:#c6f24e">Grand total</td><td colspan="${prods.length+1}" style="padding:7px 9px;font-weight:bold;background:#c6f24e;text-align:right">${Number(st.grand_total).toFixed(2)}</td></tr>
  </table></body></html>`;
  const blob=new Blob(['﻿'+html],{type:'application/vnd.ms-excel'});
  const name=`Statement_${String(st.customer).replace(/[^a-z0-9]+/gi,'_')}_${st.month}.xls`;
  if(typeof expDownload==='function') expDownload(blob,name);
  else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
  toast('⬇️ Excel downloaded');
}
window.stPdf=stPdf; window.stExcel=stExcel;
