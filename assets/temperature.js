/* ============================================================================
   TEMPERATURE CHECK — the butcher display check, live for every store.

   One company-wide sheet (title, the check rounds and the units to measure) so
   every store sees and prints the same thing; each store writes its OWN
   readings, one record per day, so a food-safety history is kept and two stores
   checking at the same time never overwrite each other.

   A round carries the TIME it is due and the kind of unit being measured, and
   the kind decides the safe range a reading is judged against. The seeded sheet
   is the butcher one: Beef / Chicken / Pork Display, checked at 08:00 (fridge),
   12:30 (fridge) and 17:30 (cool room).

   Managers and Super shape the sheet — it is one sheet for every store, so an
   edit changes it everywhere. Anyone at a store can write the readings.
   ============================================================================ */

const TC_FALLBACK_RANGES = {
  fridge:   {label:'Fridge',    max:5,              text:'≤ 5 °C'},
  coolroom: {label:'Cool room', max:5,              text:'≤ 5 °C'},
  freezer:  {label:'Freezer',   min:-25, max:-15,   text:'-25 °C to -15 °C'},
};

function tcState(){
  State.temp = State.temp || { doc:null, ranges:null, store:'', day:'', values:{}, note:'',
                               edit:false, loading:false, failed:'', status:'',
                               view:'day', hist:null, histFrom:'', histTo:'', histLoading:false,
                               recv:[], photos:[], catalog:null };
  const s = State.temp;
  if(!s.store) s.store = tcDefaultStore();
  if(!s.day) s.day = todayISO();
  return s;
}
function tcDefaultStore(){
  try{
    if(tcMultiStore()) return (DB.stores&&DB.stores[0])||'';
    return (State.branch && State.branch!=='All stores') ? State.branch : ((DB.stores&&DB.stores[0])||'');
  }catch(e){ return ''; }
}
function tcMultiStore(){ try{ return isSuper()||isBa(); }catch(e){ return false; } }
function tcCanRecord(){ try{ return !isBa(); }catch(e){ return false; } }      // Chú Ba is read-only
function tcCanEdit(){ try{ return isAdmin(); }catch(e){ return false; } }      // Manager + Super shape the sheet
function tcRanges(){ const s=State.temp; return (s&&s.ranges)||TC_FALLBACK_RANGES; }
function tcRange(type){ return tcRanges()[type]||tcRanges().fridge||{text:''}; }
function tcRounds(){ const d=(State.temp&&State.temp.doc)||{}; return d.rounds||[]; }
function tcItems(){ const d=(State.temp&&State.temp.doc)||{}; return d.items||[]; }
function tcKey(roundId,itemId){ return roundId+'|'+itemId; }
/* A phone gets one CARD PER CHECK instead of a wide grid: at 8:00 you walk round
   and measure every unit, so the check is the thing you work through. A table of
   three columns of tiny boxes needed sideways scrolling and was easy to mis-tap. */
function tcNarrow(){ try{ return (window.innerWidth||1024) <= 760; }catch(e){ return false; } }
function tcDayShort(iso){
  try{ const d=new Date(iso+'T00:00'); return d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}); }
  catch(e){ return iso; }
}
function tcAddDays(iso,n){
  try{ const d=new Date(iso+'T00:00'); d.setDate(d.getDate()+n); return dISO(d); }catch(e){ return iso; }
}
/* re-lay the page when the window crosses the phone/desktop line (a tablet being
   turned). Never while someone is typing — that would take the keyboard away. */
if(!window._tcResizeHooked){
  window._tcResizeHooked = true;
  let _tcMode = null, _tcT = null;
  try{ window.addEventListener('resize', ()=>{
    if(!(State.route && State.route.mod==='tempcheck') || !State.temp || !State.temp.doc) return;
    const m = tcNarrow();
    if(_tcMode===null){ _tcMode=m; return; }
    if(m===_tcMode) return;
    _tcMode=m;
    clearTimeout(_tcT);
    _tcT=setTimeout(function again(){
      const ae=document.activeElement;
      if(ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName||'')){ _tcT=setTimeout(again,1500); return; }
      renderTempCheck();
    }, 260);
  }); }catch(e){}
}

/* a reading is judged against the range of the ROUND it was taken in */
function tcVerdict(raw, type){
  const v = Number(String(raw==null?'':raw).replace(',','.').replace(/[^\d.\-]/g,''));
  if(!Number.isFinite(v) || String(raw).trim()==='') return {state:'', v:null};
  const r = tcRange(type);
  if(typeof r.min==='number' && v<r.min) return {state:'bad', v, why:'below '+r.min+' °C'};
  if(typeof r.max==='number' && v>r.max) return {state:'bad', v, why:'above '+r.max+' °C'};
  return {state:'ok', v};
}
function tcTimeLabel(t){
  const m=/^(\d{2}):(\d{2})$/.exec(String(t||'')); if(!m) return String(t||'');
  let h=+m[1]; const ap=h<12?'AM':'PM'; h=h%12||12;
  return h+':'+m[2]+' '+ap;
}

/* ---------------------------------------------------------------- data load */
async function tcLoad(){
  const s = tcState();
  if(s.loading) return;
  s.loading = true; s.failed = '';
  try{
    const [docRes, logRes] = await Promise.all([ mcqTempDoc(), mcqTempLog(s.store, s.day) ]);
    if(!docRes || docRes.ok===false){
      s.loading=false; s.failed='Could not reach the server.'; renderTempCheck(); return;
    }
    s.doc = docRes.doc || null;
    if(docRes.ranges) s.ranges = docRes.ranges;
    if(docRes.catalog) s.catalog = docRes.catalog;
    const log = (logRes && logRes.log) || {};
    s.values = (log.values && typeof log.values==='object') ? log.values : {};
    s.recv = Array.isArray(log.recv) ? log.recv : [];
    s.photos = Array.isArray(log.photos) ? log.photos : [];
    s.note = log.note || '';
    s.savedAt = log.updatedAt || '';
    s.savedBy = log.updatedBy || '';
  }catch(e){ s.failed='Could not load the temperature sheet.'; }
  s.loading = false;
  renderTempCheck();
}
/* another device changed the shared sheet → pick it up, but never while typing */
function tcOnRemoteChange(){
  const s=State.temp; if(!s||!s.doc) return;
  if(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName||'')){ setTimeout(tcOnRemoteChange,4000); return; }
  mcqTempDoc().then(r=>{ if(r&&r.ok&&r.doc&&r.doc.rev!==(s.doc&&s.doc.rev)){ s.doc=r.doc; renderTempCheck();
    toast('↻ Temperature sheet updated by '+String(r.doc.updatedBy||'someone').split('(')[0].trim()); } }).catch(()=>{});
}
window.tcOnRemoteChange = tcOnRemoteChange;

/* ------------------------------------------------------- readings (per store) */
let _tcSaveT=null;
function tcSetStatus(h){ const el=document.getElementById('tc-status'); if(el) el.innerHTML=h; }
function tcQueueSave(){
  tcSetStatus('<i class="fas fa-circle-notch fa-spin"></i> Saving…');
  clearTimeout(_tcSaveT); _tcSaveT=setTimeout(tcSaveLog, 700);
}
function tcSaveLog(){
  const s=tcState(); if(!s.store || !tcCanRecord()) return;
  mcqTempLogSave(s.store, {day:s.day, values:s.values, note:s.note, recv:s.recv, photos:s.photos}).then(r=>{
    if(r && r.ok){ s.savedAt=(r.log&&r.log.updatedAt)||''; tcSetStatus('<i class="fas fa-circle-check"></i> Saved · '+esc(s.store)+' · '+esc(s.day)); }
    else { tcSetStatus('<i class="fas fa-triangle-exclamation"></i> Not saved — retrying'); setTimeout(tcSaveLog, 5000); }
  });
}
function tcSetVal(roundId, itemId, v){
  const s=tcState(), k=tcKey(roundId,itemId);
  v=String(v||'').trim().slice(0,12);
  if(v){
    const prev=s.values[k]||{};
    s.values[k]={v, at:prev.at||perthTimeHM(), by:prev.by||((State.account&&(State.account.staffName||State.account.name))||'')};
  }else{
    delete s.values[k];
  }
  tcPaintCell(roundId,itemId);
  tcQueueSave();
}
function tcSetNote(v){ const s=tcState(); s.note=String(v||'').slice(0,400); tcQueueSave(); }
window.tcSetVal=tcSetVal; window.tcSetNote=tcSetNote;

/* repaint ONE cell — never the page, so the box being typed in keeps focus */
function tcPaintCell(roundId,itemId){
  const s=tcState(), r=tcRounds().find(x=>x.id===roundId); if(!r) return;
  const cell=document.getElementById('tc-cell-'+roundId+'-'+itemId); if(!cell) return;
  const rec=s.values[tcKey(roundId,itemId)]||{};
  const vd=tcVerdict(rec.v, r.type);
  cell.className='tc-cell '+(vd.state==='ok'?'ok':vd.state==='bad'?'bad':'');
  const tag=cell.querySelector('.tc-stamp');
  if(tag) tag.textContent = rec.v ? ((rec.at||'')+(rec.by?(' · '+rec.by.split(' ')[0]):'')) : '';
  const warn=cell.querySelector('.tc-warn');
  if(warn) warn.textContent = vd.state==='bad' ? ('⚠ '+vd.why) : '';
}
function tcSetDay(v){ const s=tcState(); s.day=v||todayISO(); s.values={}; s.note=''; s.recv=[]; s.photos=[]; tcLoad(); }
function tcSetStore(v){ const s=tcState(); if(v===s.store) return; clearTimeout(_tcSaveT); tcSaveLog(); s.store=v; s.values={}; s.note=''; s.recv=[]; s.photos=[]; tcLoad(); }
function tcToday(){ tcSetDay(todayISO()); }
window.tcSetDay=tcSetDay; window.tcSetStore=tcSetStore; window.tcToday=tcToday;

/* ------------------------------------------------------- the sheet (shared) */
function tcOps(ops, okMsg){
  if(!tcCanEdit()){ toast('Only a manager can change the sheet'); return Promise.resolve(false); }
  const s=tcState();
  tcSetStatus('<i class="fas fa-circle-notch fa-spin"></i> Saving…');
  return mcqTempOps(ops).then(r=>{
    if(r && r.ok && r.doc){ s.doc=r.doc; renderTempCheck(); if(okMsg) toast(okMsg); return r; }
    toast((r&&r.error)||'Could not save that change');
    tcSetStatus('<i class="fas fa-triangle-exclamation"></i> Not saved');
    return false;
  });
}
/* one dialog for every name, with a box big enough to read what you type */
function tcDialog(opts){
  mcqModal(esc(opts.title), `
    <div class="tc-dlg">
      <label class="tc-dlg-lbl">${esc(opts.label||'Name')}</label>
      <input id="tc-dlg-in" class="tc-dlg-in" value="${esc(opts.value||'')}" placeholder="${esc(opts.placeholder||'')}"
             autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter')tcDlgOk()">
      ${opts.extra||''}
      ${opts.hint?`<div class="tc-dlg-hint">${opts.hint}</div>`:''}
      <div class="tc-dlg-actions">
        <button class="btn" onclick="mcqModalClose()">Cancel</button>
        <button class="btn primary" onclick="tcDlgOk()">${esc(opts.ok||'Save')}</button>
      </div>
    </div>`);
  window._tcDlg=opts;
  setTimeout(()=>{ try{ const el=document.getElementById('tc-dlg-in'); if(el){ el.focus(); if(el.select) el.select(); } }catch(e){} }, 60);
}
function tcDlgOk(){
  const o=window._tcDlg||{}, el=document.getElementById('tc-dlg-in');
  const v=(el&&el.value||'').trim();
  if(!v && !o.allowEmpty){ if(el) el.focus(); return; }
  const extra={};
  ['tc-dlg-time','tc-dlg-type'].forEach(id=>{ const e=document.getElementById(id); if(e) extra[id.replace('tc-dlg-','')]=e.value; });
  mcqModalClose();
  if(o.onOk) o.onOk(v, extra);
}
window.tcDialog=tcDialog; window.tcDlgOk=tcDlgOk;

function tcTypeOptions(sel){
  return Object.keys(tcRanges()).map(k=>`<option value="${esc(k)}" ${k===sel?'selected':''}>${esc(tcRange(k).label||k)} · ${esc(tcRange(k).text||'')}</option>`).join('');
}
function tcTitleEdit(){
  const s=tcState();
  tcDialog({ title:'Sheet title', label:'Title', value:s.doc.title||'', ok:'Save',
    hint:'Shown at the top of the page and on the printed sheet, for every store.',
    onOk:t=>tcOps([{op:'title.set', title:t}], '✓ Title updated') });
}
function tcRoundAdd(){
  tcDialog({ title:'Add a check', label:'Check name', value:'', placeholder:'e.g. Late evening', ok:'Add check',
    extra:`<label class="tc-dlg-lbl">Time it is due</label>
      <input id="tc-dlg-time" class="tc-dlg-in small" value="17:30" placeholder="08:00 or 5:30 PM">
      <label class="tc-dlg-lbl">Unit type (sets the safe range)</label>
      <select id="tc-dlg-type" class="tc-dlg-sel">${tcTypeOptions('fridge')}</select>`,
    onOk:(name,x)=>tcOps([{op:'round.add', name, time:x.time, type:x.type}], '✓ Check added') });
}
function tcRoundEdit(id){
  const r=tcRounds().find(x=>x.id===id); if(!r) return;
  tcDialog({ title:'Edit check', label:'Check name', value:r.name||'', ok:'Save',
    extra:`<label class="tc-dlg-lbl">Time it is due</label>
      <input id="tc-dlg-time" class="tc-dlg-in small" value="${esc(r.time||'')}" placeholder="08:00 or 5:30 PM">
      <label class="tc-dlg-lbl">Unit type (sets the safe range)</label>
      <select id="tc-dlg-type" class="tc-dlg-sel">${tcTypeOptions(r.type)}</select>`,
    onOk:(name,x)=>tcOps([{op:'round.set', id, name, time:x.time, type:x.type}], '✓ Check updated') });
}
function tcRoundMove(id,dir){ tcOps([{op:'round.move', id, dir}]); }
function tcRoundDel(id){
  const r=tcRounds().find(x=>x.id===id); if(!r) return;
  if(!confirm('Delete the "'+r.name+'" check ('+tcTimeLabel(r.time)+')?\n\nThis changes the sheet for EVERY store. Readings already written down are kept.')) return;
  tcOps([{op:'round.del', id}], '🗑️ Check deleted');
}
function tcItemAdd(){
  tcDialog({ title:'Add a unit', label:'Unit name', value:'', placeholder:'e.g. Lamb Display', ok:'Add unit',
    hint:'It is added to the sheet for every store.',
    onOk:name=>tcOps([{op:'item.add', name}], '✓ Unit added') });
}
function tcItemRename(id){
  const it=tcItems().find(x=>x.id===id); if(!it) return;
  tcDialog({ title:'Rename unit', label:'Unit name', value:it.name||'', ok:'Save',
    onOk:name=>tcOps([{op:'item.rename', id, name}]) });
}
function tcItemMove(id,dir){ tcOps([{op:'item.move', id, dir}]); }
function tcItemDel(id){
  const it=tcItems().find(x=>x.id===id); if(!it) return;
  if(!confirm('Delete "'+it.name+'" from the sheet?\n\nThis changes the sheet for EVERY store. Readings already written down are kept.')) return;
  tcOps([{op:'item.del', id}], '🗑️ Unit deleted');
}
function tcRestore(){
  if(!confirm('Restore the original butcher sheet?\n\nThe title, the three checks (8:00 AM, 12:30 PM, 5:30 PM) and the three displays come back. Readings already written down are kept.')) return;
  tcOps([{op:'doc.restore'}], '↩ Original sheet restored');
}
function tcToggleEdit(){ const s=tcState(); s.edit=!s.edit; renderTempCheck(); }
window.tcTitleEdit=tcTitleEdit; window.tcRoundAdd=tcRoundAdd; window.tcRoundEdit=tcRoundEdit;
window.tcRoundMove=tcRoundMove; window.tcRoundDel=tcRoundDel; window.tcItemAdd=tcItemAdd;
window.tcItemRename=tcItemRename; window.tcItemMove=tcItemMove; window.tcItemDel=tcItemDel;
window.tcRestore=tcRestore; window.tcToggleEdit=tcToggleEdit; window.tcRetry=function(){ const s=tcState(); s.failed=''; renderTempCheck(); };

/* ----------------------------------------------- goods received at the door */
function tcRecvCats(){ const d=(State.temp&&State.temp.doc)||{}; return d.recvCategories||[]; }
function tcQualities(){ const d=(State.temp&&State.temp.doc)||{}; return (d.qualities&&d.qualities.length)?d.qualities:['Good','Acceptable','Rejected']; }
function tcBlankRows(){ const d=(State.temp&&State.temp.doc)||{}; return Math.max(1,Math.min(20,+(d.recvBlankRows||3))); }
function tcCatalogFor(cat){ const s=tcState(); return ((s.catalog||{})[(cat&&cat.catalog)||'beef'])||[]; }
function tcRecvOf(catId){ const s=tcState(); return (s.recv||[]).filter(r=>r.cat===catId); }
function tcRecvRow(id){ const s=tcState(); return (s.recv||[]).find(r=>r.id===id); }

function tcRecvAdd(catId){
  const s=tcState(); if(!tcCanRecord()) return;
  s.recv=s.recv||[];
  s.recv.push({id:'rr'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), cat:catId,
               product:'', temp:'', quality:'', time:perthTimeHM(),
               by:(State.account&&(State.account.staffName||State.account.name))||''});
  renderTempCheck(); tcQueueSave();
  setTimeout(()=>{ try{ const all=document.querySelectorAll('.tc-rv-prod'); const el=all[all.length-1]; if(el) el.focus(); }catch(e){} },40);
}
function tcRecvSet(id, field, v){
  const r=tcRecvRow(id); if(!r) return;
  r[field]=String(v||'').slice(0, field==='product'?80:40);
  if(field==='temp') tcPaintRecvRow(id);
  tcQueueSave();
}
function tcRecvDel(id){
  const s=tcState(); s.recv=(s.recv||[]).filter(r=>r.id!==id);
  renderTempCheck(); tcQueueSave();
}
/* repaint ONE received row, so typing never costs the keyboard */
function tcPaintRecvRow(id){
  const r=tcRecvRow(id); if(!r) return;
  const cat=tcRecvCats().find(c=>c.id===r.cat); if(!cat) return;
  const el=document.getElementById('tc-rv-'+id); if(!el) return;
  const vd=tcVerdict(r.temp, cat.type);
  el.className='tc-rv '+(vd.state==='ok'?'ok':vd.state==='bad'?'bad':'');
  const w=el.querySelector('.tc-rv-warn'); if(w) w.textContent = vd.state==='bad' ? ('\u26a0 '+vd.why) : '';
}
window.tcRecvAdd=tcRecvAdd; window.tcRecvSet=tcRecvSet; window.tcRecvDel=tcRecvDel;

/* a photo of the paper form, kept with the day's record */
async function tcPhoto(input){
  const f=input&&input.files&&input.files[0]; if(!f) return;
  const s=tcState();
  if(!tcCanRecord()){ toast('Read-only account'); return; }
  toast('\ud83d\udcf7 Attaching photo\u2026');
  try{
    const d=await compressImage(f, 1600, .82);
    const ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d;
    s.photos=s.photos||[]; s.photos.push(ref);
    renderTempCheck(); tcSaveLog();
    toast('\u2713 Photo attached to '+s.day);
  }catch(e){ toast('Could not read that photo'); }
}
function tcPhotoDel(ref){
  const s=tcState();
  if(!confirm('Remove this photo from the record?')) return;
  s.photos=(s.photos||[]).filter(p=>p!==ref);
  renderTempCheck(); tcSaveLog();
}
window.tcPhoto=tcPhoto; window.tcPhotoDel=tcPhotoDel;

function tcRecvTitleEdit(){
  const s=tcState();
  tcDialog({ title:'Goods received \u2014 title', label:'Title', value:s.doc.recvTitle||'', ok:'Save',
    onOk:t=>tcOps([{op:'recvTitle.set', title:t}], '\u2713 Title updated') });
}
function tcRecvCatOptions(sel){
  const s=tcState(), kinds=Object.keys(s.catalog||{beef:1,pork:1,chicken:1,offals:1});
  return kinds.map(k=>`<option value="${esc(k)}" ${k===sel?'selected':''}>${esc(k)}</option>`).join('');
}
function tcRecvCatAdd(){
  tcDialog({ title:'Add a received category', label:'Category name', value:'', placeholder:'e.g. Lamb FZ', ok:'Add',
    extra:`<label class="tc-dlg-lbl">Chilled or frozen (sets the safe range)</label>
      <select id="tc-dlg-type" class="tc-dlg-sel">${tcTypeOptions('fridge')}</select>
      <label class="tc-dlg-lbl">Product list to offer</label>
      <select id="tc-dlg-cat" class="tc-dlg-sel">${tcRecvCatOptions('beef')}</select>`,
    onOk:(name,x)=>tcOps([{op:'recv.add', name, type:x.type, catalog:(document.getElementById('tc-dlg-cat')||{}).value||'beef'}], '\u2713 Category added') });
}
function tcRecvCatEdit(id){
  const c=tcRecvCats().find(x=>x.id===id); if(!c) return;
  tcDialog({ title:'Edit category', label:'Category name', value:c.name||'', ok:'Save',
    extra:`<label class="tc-dlg-lbl">Chilled or frozen (sets the safe range)</label>
      <select id="tc-dlg-type" class="tc-dlg-sel">${tcTypeOptions(c.type)}</select>
      <label class="tc-dlg-lbl">Product list to offer</label>
      <select id="tc-dlg-cat" class="tc-dlg-sel">${tcRecvCatOptions(c.catalog)}</select>`,
    onOk:(name,x)=>tcOps([{op:'recv.set', id, name, type:x.type, catalog:(document.getElementById('tc-dlg-cat')||{}).value||c.catalog}]) });
}
function tcRecvCatMove(id,dir){ tcOps([{op:'recv.move', id, dir}]); }
function tcRecvCatDel(id){
  const c=tcRecvCats().find(x=>x.id===id); if(!c) return;
  if(!confirm('Delete the "'+c.name+'" category?\n\nThis changes the log for EVERY store. Rows already written down are kept.')) return;
  tcOps([{op:'recv.del', id}], '\ud83d\uddd1\ufe0f Category deleted');
}
function tcRecvBlankRows(){
  tcDialog({ title:'Blank lines when printing', label:'How many empty lines under each category?',
    value:String(tcBlankRows()), ok:'Save',
    hint:'Used by <b>Print blank form</b> \u2014 the sheet staff fill in by hand.',
    onOk:v=>tcOps([{op:'recv.rows', rows:parseInt(v,10)||3}], '\u2713 Saved') });
}
window.tcRecvTitleEdit=tcRecvTitleEdit; window.tcRecvCatAdd=tcRecvCatAdd; window.tcRecvCatEdit=tcRecvCatEdit;
window.tcRecvCatMove=tcRecvCatMove; window.tcRecvCatDel=tcRecvCatDel; window.tcRecvBlankRows=tcRecvBlankRows;

/* ------------------------------------------------------------------ history */
/* Every day is a row in temp_logs, so the history is simply a date range. Days
   with NO record are shown too — a gap in a food-safety log is the thing you
   most want to see. */
function tcShowHistory(){
  const s=tcState(); s.view='history';
  if(!s.histTo) s.histTo = todayISO();
  if(!s.histFrom) s.histFrom = tcAddDays(s.histTo,-29);
  renderTempCheck(); tcLoadHistory();
}
function tcShowView(v){ const s=tcState(); s.view=v||'day'; renderTempCheck(); }
window.tcShowView=tcShowView;
function tcShowDay(day){
  const s=tcState(); s.view='day';
  if(day && day!==s.day){ tcSetDay(day); return; }
  renderTempCheck();
}
function tcHistRange(which,v){ const s=tcState(); if(which==='from') s.histFrom=v||s.histFrom; else s.histTo=v||s.histTo; tcLoadHistory(); }
function tcHistMonth(back){
  const s=tcState(), base=new Date((s.histTo||todayISO())+'T00:00');
  base.setDate(1); base.setMonth(base.getMonth()+back);
  const end=new Date(base.getFullYear(), base.getMonth()+1, 0);
  s.histFrom=dISO(base); s.histTo=dISO(end); tcLoadHistory();
}
function tcLoadHistory(){
  const s=tcState(); if(s.histLoading) return;
  s.histLoading=true;
  mcqTempLogRange(s.store, s.histFrom, s.histTo).then(r=>{
    s.histLoading=false;
    s.hist = (r&&r.ok&&Array.isArray(r.days)) ? r.days : [];
    if(s.view==='history') renderTempCheck();
  }).catch(()=>{ s.histLoading=false; s.hist=[]; if(s.view==='history') renderTempCheck(); });
}
/* one summary row per CALENDAR day in the range, newest first, gaps included */
function tcHistRows(){
  const s=tcState(), rounds=tcRounds(), items=tcItems();
  const byDay={}; (s.hist||[]).forEach(d=>{ byDay[d.day]=d; });
  const out=[]; const total=rounds.length*items.length;
  let cur=s.histTo, guard=0;
  while(cur>=s.histFrom && guard++<400){
    const d=byDay[cur];
    const vals=(d&&d.values)||{};
    let done=0, bad=0;
    Object.keys(vals).forEach(k=>{
      const r=rounds.find(x=>x.id===k.split('|')[0]);
      done++;
      if(r && tcVerdict(vals[k].v, r.type).state==='bad') bad++;
    });
    out.push({day:cur, total, done, bad, note:(d&&d.note)||'', by:(d&&d.updatedBy)||'', at:(d&&d.updatedAt)||'', missing:!d});
    cur=tcAddDays(cur,-1);
  }
  return out;
}
window.tcShowHistory=tcShowHistory; window.tcShowDay=tcShowDay;
window.tcHistRange=tcHistRange; window.tcHistMonth=tcHistMonth;

/* ---------------------------------------------------------------- rendering */
/* one reading box — shared by the desktop grid and the phone cards */
function tcCellHTML(r, it, s, wide){
  const rec=s.values[tcKey(r.id,it.id)]||{}, vd=tcVerdict(rec.v,r.type);
  const stamp=rec.v?((rec.at||'')+(rec.by?(' \u00b7 '+String(rec.by).split(' ')[0]):'')):'';
  return `<div class="tc-in-wrap">
      <input class="tc-in" value="${esc(rec.v||'')}" inputmode="decimal" placeholder="\u2014"
        aria-label="${esc(it.name)} at ${esc(tcTimeLabel(r.time))}"
        ${tcCanRecord()?'':'disabled'} oninput="tcSetVal('${ckJS(r.id)}','${ckJS(it.id)}',this.value)">
      <span class="tc-deg">\u00b0C</span>
    </div>
    <div class="tc-stamp">${esc(stamp)}</div>
    <div class="tc-warn">${vd.state==='bad'?('\u26a0 '+esc(vd.why)):''}</div>`;
}
function tcCellClass(r,it,s){
  const rec=s.values[tcKey(r.id,it.id)]||{}, vd=tcVerdict(rec.v,r.type);
  return vd.state==='ok'?'ok':vd.state==='bad'?'bad':'';
}
function tcRoundBadge(r){
  return `<span class="tc-h-type tone-${esc(r.type)}">${esc(tcRange(r.type).label||r.type)} \u00b7 ${esc(tcRange(r.type).text||'')}</span>`;
}
function tcRoundOps(r,i,n,vertical){
  if(!State.temp.edit) return '';
  return `<span class="tc-h-ops">
    <button class="tc-ic" title="Edit this check" onclick="tcRoundEdit('${ckJS(r.id)}')"><i class="fas fa-pen"></i></button>
    <button class="tc-ic" title="Move earlier" ${i===0?'disabled':''} onclick="tcRoundMove('${ckJS(r.id)}','up')"><i class="fas fa-chevron-${vertical?'up':'left'}"></i></button>
    <button class="tc-ic" title="Move later" ${i===n-1?'disabled':''} onclick="tcRoundMove('${ckJS(r.id)}','down')"><i class="fas fa-chevron-${vertical?'down':'right'}"></i></button>
    <button class="tc-ic danger" title="Delete this check" onclick="tcRoundDel('${ckJS(r.id)}')"><i class="fas fa-trash"></i></button>
  </span>`;
}
function tcUnitLabel(it,ri,n,s){
  if(!s.edit) return `<b>${esc(it.name)}</b>`;
  return `<div class="tc-unit-ed">
      <span class="tc-mv">
        <button class="tc-ic" title="Move up" ${ri===0?'disabled':''} onclick="tcItemMove('${ckJS(it.id)}','up')"><i class="fas fa-chevron-up"></i></button>
        <button class="tc-ic" title="Move down" ${ri===n-1?'disabled':''} onclick="tcItemMove('${ckJS(it.id)}','down')"><i class="fas fa-chevron-down"></i></button>
      </span>
      <button class="tc-unit-name" onclick="tcItemRename('${ckJS(it.id)}')" title="Rename">${esc(it.name)} <i class="fas fa-pen"></i></button>
      <button class="tc-ic danger" title="Delete unit" onclick="tcItemDel('${ckJS(it.id)}')"><i class="fas fa-trash"></i></button>
    </div>`;
}

/* ---- desktop: units down the side, checks across the top ---- */
function tcDayTable(s){
  const rounds=tcRounds(), items=tcItems();
  const head = rounds.map((r,i)=>`<th class="tc-h">
      <div class="tc-h-name">${esc(r.name)}</div>
      <div class="tc-h-time">${esc(tcTimeLabel(r.time))}</div>
      ${tcRoundBadge(r)}
      ${tcRoundOps(r,i,rounds.length,false)}
    </th>`).join('');
  const rows = items.map((it,ri)=>`<tr>
      <td class="tc-unit">${tcUnitLabel(it,ri,items.length,s)}</td>
      ${rounds.map(r=>`<td id="tc-cell-${esc(r.id)}-${esc(it.id)}" class="tc-cell ${tcCellClass(r,it,s)}">${tcCellHTML(r,it,s,true)}</td>`).join('')}
    </tr>`).join('');
  return `<div class="table-wrap"><table class="tc-tbl">
      <thead><tr><th class="tc-unit-h">UNIT</th>${head}</tr></thead>
      <tbody>${rows||`<tr><td colspan="${rounds.length+1}"><div class="empty compact">No units on this sheet yet.</div></td></tr>`}</tbody>
    </table></div>`;
}

/* ---- phone: one card per check, the units stacked inside it ---- */
function tcDayCards(s){
  const rounds=tcRounds(), items=tcItems();
  if(!rounds.length || !items.length) return '<div class="empty compact">Nothing on this sheet yet.</div>';
  return `<div class="tc-cards">${rounds.map((r,i)=>{
    let done=0, bad=0;
    items.forEach(it=>{ const rec=s.values[tcKey(r.id,it.id)]||{}; if(rec.v){ done++; if(tcVerdict(rec.v,r.type).state==='bad') bad++; } });
    return `<section class="tc-card-r ${done===items.length?(bad?'has-bad':'all-done'):''}">
      <header class="tc-card-h">
        <div class="tc-card-time">${esc(tcTimeLabel(r.time))}</div>
        <div class="tc-card-meta"><b>${esc(r.name)}</b>${tcRoundBadge(r)}</div>
        <div class="tc-card-prog ${bad?'bad':(done===items.length?'ok':'')}">${done}/${items.length}${bad?(' \u00b7 '+bad+' \u26a0'):''}</div>
        ${tcRoundOps(r,i,rounds.length,true)}
      </header>
      <div class="tc-card-body">${items.map((it,ri)=>`
        <div id="tc-cell-${esc(r.id)}-${esc(it.id)}" class="tc-cell tc-line ${tcCellClass(r,it,s)}">
          <div class="tc-line-name">${tcUnitLabel(it,ri,items.length,s)}</div>
          <div class="tc-line-in">${tcCellHTML(r,it,s,false)}</div>
        </div>`).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

/* ---- history: every day in a range, gaps included ---- */
function tcHistoryHTML(s){
  const rows=tcHistRows();
  const body=rows.map(d=>{
    const cls=d.missing?'miss':(d.bad?'bad':(d.done>=d.total?'full':'part'));
    const state=d.missing?'Not recorded':(d.bad?(d.bad+' out of range'):(d.done>=d.total?'All in range':'Partly filled'));
    return `<tr class="tc-hrow ${cls}" onclick="tcShowDay('${ckJS(d.day)}')">
      <td class="tc-hday"><b>${esc(tcDayShort(d.day))}</b><span>${esc(d.day)}</span></td>
      <td class="tc-hcount">${d.done}/${d.total}</td>
      <td class="tc-hstate"><span class="tc-pill ${cls}">${esc(state)}</span></td>
      <td class="tc-hnote">${esc(d.note||'')}</td>
      <td class="tc-hby">${esc(String(d.by||'').split('(')[0].trim())}</td>
      <td class="tc-hgo"><i class="fas fa-chevron-right"></i></td>
    </tr>`;
  }).join('');
  const miss=rows.filter(d=>d.missing).length, bad=rows.filter(d=>d.bad).length;
  return `<div class="tc-hist-bar">
      <span class="hv-f"><span>\ud83d\udcc5</span>
        <input type="date" value="${esc(s.histFrom)}" onchange="tcHistRange('from',this.value)">
        <span>\u2192</span>
        <input type="date" value="${esc(s.histTo)}" onchange="tcHistRange('to',this.value)"></span>
      <button class="btn xs" onclick="tcHistMonth(0)">This month</button>
      <button class="btn xs" onclick="tcHistMonth(-1)">Last month</button>
      <span class="tc-hist-sum">${rows.length} day${rows.length===1?'':'s'}${miss?(' \u00b7 '+miss+' not recorded'):''}${bad?(' \u00b7 '+bad+' with a reading out of range'):''}</span>
    </div>
    <div class="card"><div class="table-wrap"><table class="grid tc-hist">
      <thead><tr><th>Day</th><th>Filled</th><th>Result</th><th>Notes</th><th>Last saved by</th><th></th></tr></thead>
      <tbody>${body||'<tr><td colspan="6"><div class="empty compact">No days in this range.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

/* ---- goods received: a block per category, each with its own rows ---- */
function tcRecvHTML(s){
  const cats=tcRecvCats(), quals=tcQualities(), narrow=tcNarrow();
  const lists = cats.map(c=>`<datalist id="tc-list-${esc(c.id)}">${tcCatalogFor(c).map(pn=>`<option value="${esc(pn)}"></option>`).join('')}</datalist>`).join('');
  const blocks = cats.map((c,ci)=>{
    const rows=tcRecvOf(c.id);
    const bad=rows.filter(r=>tcVerdict(r.temp,c.type).state==='bad').length;
    const body = rows.map(r=>{
      const vd=tcVerdict(r.temp,c.type);
      return `<div id="tc-rv-${esc(r.id)}" class="tc-rv ${vd.state==='ok'?'ok':vd.state==='bad'?'bad':''}">
        <input class="tc-rv-prod" list="tc-list-${esc(c.id)}" value="${esc(r.product||'')}" placeholder="Product\u2026"
          ${tcCanRecord()?'':'disabled'} oninput="tcRecvSet('${ckJS(r.id)}','product',this.value)">
        <span class="tc-rv-t"><input class="tc-rv-temp" value="${esc(r.temp||'')}" inputmode="decimal" placeholder="\u2014"
          ${tcCanRecord()?'':'disabled'} oninput="tcRecvSet('${ckJS(r.id)}','temp',this.value)"><i>\u00b0C</i></span>
        <select class="tc-rv-q" ${tcCanRecord()?'':'disabled'} onchange="tcRecvSet('${ckJS(r.id)}','quality',this.value)">
          <option value="">Quality\u2026</option>
          ${quals.map(q=>`<option ${q===r.quality?'selected':''}>${esc(q)}</option>`).join('')}
        </select>
        <input class="tc-rv-time" type="time" value="${esc(r.time||'')}" ${tcCanRecord()?'':'disabled'}
          onchange="tcRecvSet('${ckJS(r.id)}','time',this.value)">
        <input class="tc-rv-by" value="${esc(r.by||'')}" placeholder="Received by"
          ${tcCanRecord()?'':'disabled'} oninput="tcRecvSet('${ckJS(r.id)}','by',this.value)">
        ${tcCanRecord()?`<button class="tc-ic danger" title="Remove this line" onclick="tcRecvDel('${ckJS(r.id)}')"><i class="fas fa-trash"></i></button>`:''}
        <div class="tc-rv-warn">${vd.state==='bad'?('\u26a0 '+esc(vd.why)):''}</div>
      </div>`;
    }).join('');
    return `<section class="tc-rv-cat">
      <header class="tc-rv-h">
        <b>${esc(c.name)}</b>
        <span class="tc-h-type tone-${esc(c.type)}">${esc(tcRange(c.type).label||c.type)} \u00b7 ${esc(tcRange(c.type).text||'')}</span>
        <span class="tc-rv-count ${bad?'bad':''}">${rows.length} line${rows.length===1?'':'s'}${bad?(' \u00b7 '+bad+' \u26a0'):''}</span>
        ${s.edit?`<span class="tc-h-ops">
          <button class="tc-ic" title="Edit category" onclick="tcRecvCatEdit('${ckJS(c.id)}')"><i class="fas fa-pen"></i></button>
          <button class="tc-ic" title="Move up" ${ci===0?'disabled':''} onclick="tcRecvCatMove('${ckJS(c.id)}','up')"><i class="fas fa-chevron-up"></i></button>
          <button class="tc-ic" title="Move down" ${ci===cats.length-1?'disabled':''} onclick="tcRecvCatMove('${ckJS(c.id)}','down')"><i class="fas fa-chevron-down"></i></button>
          <button class="tc-ic danger" title="Delete category" onclick="tcRecvCatDel('${ckJS(c.id)}')"><i class="fas fa-trash"></i></button>
        </span>`:''}
      </header>
      ${!narrow&&rows.length?`<div class="tc-rv tc-rv-head"><span>PRODUCT</span><span>TEMP</span><span>QUALITY</span><span>TIME IN</span><span>RECEIVED BY</span><span></span></div>`:''}
      <div class="tc-rv-body">${body||'<div class="tc-rv-empty">Nothing received in this category yet.</div>'}</div>
      ${tcCanRecord()?`<button class="tc-add-line" onclick="tcRecvAdd('${ckJS(c.id)}')"><i class="fas fa-plus"></i> Add a line to ${esc(c.name)}</button>`:''}
    </section>`;
  }).join('');

  const photos=(s.photos||[]).map(ref=>`<span class="tc-ph">
      <img src="${imgSrc(ref)}" data-pref="${esc(ref)}" alt="" onclick="openLightbox(this.src)">
      ${tcCanRecord()?`<button class="tc-ph-x" title="Remove" onclick="event.stopPropagation();tcPhotoDel('${ckJS(ref)}')">\u2715</button>`:''}
    </span>`).join('');

  return `${lists}
    <div class="tc-rv-top">
      <h3>${esc(s.doc.recvTitle||'Goods received')}${tcCanEdit()?` <button class="tc-ic" title="Rename" onclick="tcRecvTitleEdit()"><i class="fas fa-pen"></i></button>`:''}</h3>
      <span class="tc-rv-sub">Everything that came in the back door on <b>${esc(s.day)}</b> \u2014 product, temperature on arrival, quality, time and who took it in.</span>
    </div>
    ${s.edit?`<div class="tc-edit-hint"><i class="fas fa-wand-magic-sparkles"></i> <b>Editing the log</b> \u2014 the categories are shared by every store.
      <button class="btn xs" onclick="tcRecvCatAdd()"><i class="fas fa-plus"></i> Add category</button>
      <button class="btn xs" onclick="tcRecvBlankRows()"><i class="fas fa-print"></i> Blank lines: ${tcBlankRows()}</button></div>`:''}
    <div class="tc-rv-wrap">${blocks}</div>
    <div class="card tc-ph-card"><div class="card-pad">
      <label class="tc-note-lbl">Photo of the paper sheet <span>(filled in by hand? photograph it here and it is kept with this day)</span></label>
      <div class="tc-ph-row">
        ${photos}
        ${tcCanRecord()?`<label class="tc-ph-add"><input type="file" accept="image/*" capture="environment" onchange="tcPhoto(this)"><i class="fas fa-camera"></i><span>Add photo</span></label>`:''}
      </div>
    </div></div>`;
}

function renderTempCheck(){
  setAccent('#0369a1');
  const s = tcState();

  if(!s.doc){
    if(s.failed){
      setCrumb('\ud83c\udf21\ufe0f','Temperature Check','Could not load');
      $('#content').innerHTML=`<div class="card card-pad tc-fail"><div class="tc-fail-ic">\u26a0\ufe0f</div>
        <b>${esc(s.failed)}</b><span>The sheet is kept on the server \u2014 nothing already written down is lost.</span>
        <button class="btn primary" onclick="tcRetry()"><i class="fas fa-rotate-right"></i>&nbsp; Try again</button></div>`;
      return;
    }
    setCrumb('\ud83c\udf21\ufe0f','Temperature Check','Loading\u2026');
    $('#content').innerHTML=`<div class="card card-pad loading-state"><i class="fas fa-spinner fa-spin"></i><b>Opening the temperature sheet\u2026</b><span>Fetching the live sheet and ${esc(s.store||'your store')}'s readings.</span></div>`;
    if(!s.loading) tcLoad();
    return;
  }

  const rounds=tcRounds(), items=tcItems();
  const hist=(s.view==='history'), recvView=(s.view==='recv');
  const filled=Object.keys(s.values).length, total=rounds.length*items.length;
  const bad=Object.keys(s.values).filter(k=>{ const r=rounds.find(x=>x.id===k.split('|')[0]);
    return r && tcVerdict(s.values[k].v, r.type).state==='bad'; }).length;
  const rvBad=(s.recv||[]).filter(r=>{ const c=tcRecvCats().find(x=>x.id===r.cat); return c && tcVerdict(r.temp,c.type).state==='bad'; }).length;
  setCrumb('\ud83c\udf21\ufe0f','Temperature Check', hist
    ? `${esc(s.store)} \u00b7 history ${esc(s.histFrom)} \u2192 ${esc(s.histTo)}`
    : recvView
      ? `${esc(s.store)} \u00b7 ${esc(s.day)} \u00b7 ${(s.recv||[]).length} received${rvBad?(' \u00b7 '+rvBad+' out of range'):''}`
      : `${esc(s.store)} \u00b7 ${esc(s.day)} \u00b7 ${filled}/${total} recorded${bad?(' \u00b7 '+bad+' out of range'):''}`);

  const storePick = tcMultiStore()
    ? `<select class="login-input tc-store" onchange="tcSetStore(this.value)">${(DB.stores||[]).map(st=>`<option ${st===s.store?'selected':''}>${esc(st)}</option>`).join('')}</select>`
    : `<span class="tc-store-fixed"><i class="fas fa-store"></i> ${esc(s.store)}</span>`;

  const tabs = `<div class="tc-tabs">
      <button class="${(!hist&&!recvView)?'on':''}" onclick="tcShowView('day')"><i class="fas fa-temperature-half"></i> Display check</button>
      <button class="${recvView?'on':''}" onclick="tcShowView('recv')"><i class="fas fa-truck-ramp-box"></i> Goods received</button>
      <button class="${hist?'on':''}" onclick="tcShowHistory()"><i class="fas fa-clock-rotate-left"></i> History</button>
    </div>`;

  $('#content').innerHTML=`
    <div class="page-head">
      <div class="ph-ic">\ud83c\udf21\ufe0f</div>
      <div><h2>${esc(s.doc.title||'Temperature Check')}${(tcCanEdit()&&!hist&&!recvView)?` <button class="tc-ic title-ed" title="Rename the sheet" onclick="tcTitleEdit()"><i class="fas fa-pen"></i></button>`:''}</h2>
        <p>${hist?'Every day that has been recorded for this store. Tap a day to open its sheet.'
                 :recvView?'Log every delivery as it comes in. Print the blank form if the team fills it in on paper.'
                 :'Probe two representative products at each counter. A reading outside the safe range turns red straight away.'}</p></div>
      <div class="ph-actions">
        ${storePick}
        ${hist?'':`<input type="date" class="login-input tc-date" value="${esc(s.day)}" onchange="tcSetDay(this.value)">`}
        ${(!hist&&s.day!==todayISO())?`<button class="btn sm" onclick="tcToday()"><i class="fas fa-rotate-left"></i> Today</button>`:''}
        ${(tcCanEdit()&&!hist)?`<button class="btn sm ${s.edit?'primary':''}" onclick="tcToggleEdit()"><i class="fas fa-pen"></i> ${s.edit?'Done':'Edit sheet'}</button>`:''}
        ${hist?'':`<div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
          <div class="exp-menu">
            <button onclick="tcExport('pdfblank')"><i class="fas fa-file-pdf"></i> PDF \u2014 BLANK form</button>
            <button onclick="tcExport('blank')"><i class="fas fa-file-lines"></i> Print BLANK form</button>
            <button onclick="tcExport('pdf')"><i class="fas fa-file-pdf"></i> PDF \u2014 filled in</button>
            <button onclick="tcExport('print')"><i class="fas fa-print"></i> Print what is filled in</button>
            <button onclick="tcExport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
          </div></div>`}
      </div>
    </div>

    ${tabs}

    ${hist ? tcHistoryHTML(s) : recvView ? tcRecvHTML(s) : `
      ${bad?`<div class="tc-alert"><i class="fas fa-triangle-exclamation"></i> <b>${bad} reading${bad>1?'s are':' is'} outside the safe range.</b> Move the stock, check the unit and tell the manager.</div>`:''}
      ${s.edit?`<div class="tc-edit-hint"><i class="fas fa-wand-magic-sparkles"></i> <b>Editing the sheet</b> \u2014 this is ONE sheet for every store, so a change here shows up at every store. Readings already written down are kept.
        <button class="btn xs" style="margin-left:auto" onclick="tcRestore()"><i class="fas fa-rotate-left"></i> Restore original</button></div>`:''}

      <div class="card tc-card">
        ${tcNarrow()?tcDayCards(s):tcDayTable(s)}
        ${s.edit?`<div class="tc-adds">
          <button class="btn xs" onclick="tcItemAdd()"><i class="fas fa-plus"></i>&nbsp; Add a unit</button>
          <button class="btn xs" onclick="tcRoundAdd()"><i class="fas fa-plus"></i>&nbsp; Add a check time</button>
        </div>`:''}
      </div>

      <div class="card tc-note"><div class="card-pad">
        <label class="tc-note-lbl">Notes for ${esc(s.day)} <span>(corrective action, unit faults, who was told\u2026)</span></label>
        <textarea class="tc-note-in" rows="2" ${tcCanRecord()?'':'disabled'} placeholder="e.g. Beef display read 7 \u00b0C at 12:30 \u2014 stock moved to cool room, fridge serviced."
          oninput="tcSetNote(this.value)">${esc(s.note||'')}</textarea>
        <div class="tc-foot">
          <span id="tc-status" class="tc-status">${s.savedAt?`<i class="fas fa-circle-check"></i> Saved \u00b7 ${esc(String(s.savedAt).slice(0,16))}`:'<i class="fas fa-pen-to-square"></i> Nothing recorded for this day yet'}</span>
          <span class="tc-foot-sub">Safe ranges: ${Object.keys(tcRanges()).map(k=>esc((tcRange(k).label||k)+' '+(tcRange(k).text||''))).join(' \u00b7 ')}</span>
        </div>
      </div></div>`}`;
}
window.renderTempCheck = renderTempCheck;

/* ---------------------------------------------------------------- exporting */
/* Two kinds of print: what is filled in, and a BLANK form the team writes on by
   hand and photographs back into the day's record. */
const TC_PRINT_CSS = `@page{size:A4 portrait;margin:10mm}
  *{box-sizing:border-box}
  body{font-family:Inter,Arial,Helvetica,sans-serif;margin:0;color:#000;font-size:14px}
  .hd{display:flex;align-items:flex-end;gap:16px;border-bottom:3px solid #000;padding-bottom:9px;margin-bottom:6px}
  .hd h1{font-size:26px;margin:0;letter-spacing:.3px;flex:1;line-height:1.1}
  .hd .f{font-size:14px;font-weight:800;white-space:nowrap}
  .hd .f u{display:inline-block;min-width:130px;border-bottom:1.5px solid #000;text-decoration:none;font-weight:600;padding:0 6px}
  .sub{font-size:12px;color:#333;margin:0 0 10px;line-height:1.35}
  table{width:100%;border-collapse:collapse;margin-bottom:12px;page-break-inside:auto}
  th{background:#000;color:#fff;font-size:12.5px;letter-spacing:.4px;padding:9px 7px;border:1.5px solid #000}
  th .rng{color:#dfe7ee;display:block;margin-top:2px;font-size:11px}
  td{border:1.5px solid #555;padding:0 8px;height:36px;font-size:16px;vertical-align:middle}
  td.u{width:34%;font-weight:700;font-size:15px}
  td.c{text-align:center;font-weight:700}
  tr.cat td{background:#dde4ea;font-weight:900;font-size:15px;letter-spacing:.5px;height:28px}
  .rng{font-weight:600;font-size:11px;color:#222}
  .sign{display:flex;gap:30px;margin-top:22px;font-size:13px;font-weight:600}
  .sign div{flex:1;border-top:1.5px solid #000;padding-top:5px}
  .ft{margin-top:10px;font-size:10.5px;color:#444;display:flex;justify-content:space-between}
  .bad{background:#ffd4d4;font-weight:900}`;

function tcPrintHead(title, s, blank){
  return `<div class="hd"><h1>${esc(title)}</h1>
      <span class="f">STORE: <u>${esc(blank?'':s.store)}</u></span>
      <span class="f">DATE: <u>${esc(blank?'':s.day)}</u></span></div>`;
}
function tcPrintWindow(title, inner){
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to print'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${TC_PRINT_CSS}</style></head><body>${inner}
    <script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>`);
  w.document.close();
}

/* ---- display check ---- */
function tcSheetTable(blank){
  const s=tcState(), rounds=tcRounds(), items=tcItems();
  const head='<thead><tr><th style="text-align:left">UNIT / SAMPLE</th>'+rounds.map(r=>
    `<th>${esc(r.name)}<br>${esc(tcTimeLabel(r.time))}<span class="rng">${esc(tcRange(r.type).text||'')}</span></th>`).join('')+'</tr></thead>';
  const body='<tbody>'+items.map(it=>'<tr><td class="u">'+esc(it.name)+'</td>'+rounds.map(r=>{
    if(blank) return '<td class="c"></td>';
    const rec=s.values[tcKey(r.id,it.id)]||{}, vd=tcVerdict(rec.v,r.type);
    return `<td class="c${vd.state==='bad'?' bad':''}">${esc(rec.v?rec.v+' \u00b0C':'')}${rec.at?`<br><span class="rng">${esc(rec.at)}</span>`:''}</td>`;
  }).join('')+'</tr>').join('')+'</tbody>';
  return head+body;
}
/* ---- goods received ---- */
/* How many lines a category prints: the ones actually added. A BLANK form keeps
   at least the configured minimum so there is something to write on when nothing
   has been entered yet. */
function tcRecvLineCount(catId, blank){
  const have=tcRecvOf(catId).length;
  return blank ? Math.max(have, tcBlankRows()) : have;
}
function tcRecvTable(blank){
  const s=tcState(), cats=tcRecvCats();
  let body='<tbody>';
  cats.forEach(c=>{
    body+=`<tr class="cat"><td colspan="5">${esc(c.name)} <span class="rng">\u00b7 ${esc(tcRange(c.type).text||'')}</span></td></tr>`;
    const have=tcRecvOf(c.id), n=tcRecvLineCount(c.id, blank);
    for(let i=0;i<n;i++){
      const r = blank ? null : have[i];
      if(!r){ body+='<tr><td></td><td class="c"></td><td class="c"></td><td class="c"></td><td></td></tr>'; continue; }
      const vd=tcVerdict(r.temp,c.type);
      body+=`<tr><td>${esc(r.product||'')}</td><td class="c${vd.state==='bad'?' bad':''}">${esc(r.temp?r.temp+' \u00b0C':'')}</td>`
          + `<td class="c">${esc(r.quality||'')}</td><td class="c">${esc(r.time||'')}</td><td>${esc(r.by||'')}</td></tr>`;
    }
    if(!n) body+='<tr><td colspan="5" style="color:#777">\u2014 nothing received \u2014</td></tr>';
  });
  body+='</tbody>';
  return '<thead><tr><th style="text-align:left">PRODUCT</th><th>TEMPERATURE</th><th>QUALITY</th><th>TIME RECEIVED</th><th>RECEIVED BY</th></tr></thead>'+body;
}

/* ---- PDF, drawn with jsPDF so it downloads as a file ---- */
function tcPdfSpec(blank){
  const s=tcState(), recvView=(s.view==='recv');
  if(recvView){
    const blocks=tcRecvCats().map(c=>{
      const have=tcRecvOf(c.id), n=tcRecvLineCount(c.id, blank), rows=[];
      for(let i=0;i<n;i++){
        const r = blank ? null : have[i];
        if(!r){ rows.push({cells:['','','','',''] }); continue; }
        rows.push({cells:[r.product||'', r.temp?(r.temp+' \u00b0C'):'', r.quality||'', r.time||'', r.by||''],
                   bad:tcVerdict(r.temp,c.type).state==='bad'});
      }
      if(!n) rows.push({cells:['\u2014 nothing received \u2014','','','','']});
      return {head:c.name+'   \u00b7   '+(tcRange(c.type).text||''), rows};
    });
    return { title:s.doc.recvTitle||'Goods received temperature log',
             cols:[{label:'PRODUCT',w:0.34},{label:'TEMPERATURE',w:0.16,c:1},{label:'QUALITY',w:0.15,c:1},
                   {label:'TIME RECEIVED',w:0.16,c:1},{label:'RECEIVED BY',w:0.19}],
             blocks };
  }
  const rounds=tcRounds();
  const rows=tcItems().map(it=>({cells:[it.name].concat(rounds.map(r=>{
      if(blank) return '';
      const rec=s.values[tcKey(r.id,it.id)]||{};
      return rec.v?(rec.v+' \u00b0C'):'';
    })),
    bad:!blank && rounds.some(r=>tcVerdict((s.values[tcKey(r.id,it.id)]||{}).v, r.type).state==='bad')}));
  const w=(1-0.34)/Math.max(1,rounds.length);
  return { title:s.doc.title||'Temperature check',
           cols:[{label:'UNIT / SAMPLE',w:0.34}].concat(rounds.map(r=>({label:r.name+'  '+tcTimeLabel(r.time),sub:tcRange(r.type).text||'',w,c:1}))),
           blocks:[{head:null, rows}] };
}
async function tcPdf(blank){
  const ok = await (window.ensureJsPDF?ensureJsPDF():Promise.resolve(false));
  if(!ok || !(window.jspdf&&window.jspdf.jsPDF)){ toast('PDF engine not ready \u2014 using the print window'); return tcExport(blank?'blank':'print'); }
  const s=tcState(), spec=tcPdfSpec(blank);
  const { jsPDF }=window.jspdf, doc=new jsPDF({unit:'pt',format:'a4'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=34;
  const TW=PW-2*M; let y=0;
  function header(){
    doc.setFillColor(3,105,161); doc.rect(0,0,PW,76,'F');
    let tx=M;
    if(window.MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',M,15,46,46); tx=M+58; }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('MCQ Supermarket',tx,30);
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text(String(spec.title),tx,52);
    doc.setFont('helvetica','normal'); doc.setFontSize(11.5);
    doc.text((blank?'STORE: ______________':('Store: '+s.store))+'     '+(blank?'DATE: ______________':('Date: '+s.day)), PW-M, 52, {align:'right'});
    y=94;
  }
  function room(h){ if(y+h>PH-88){ doc.addPage(); header(); colHead(); } }
  function colX(){ let x=M; return spec.cols.map(c=>{ const o=x; x+=c.w*TW; return o; }); }
  const xs=colX();
  function colHead(){
    if(y+32>PH-88){ doc.addPage(); header(); }
    doc.setFillColor(17,24,39); doc.rect(M,y,TW,30,'F');
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
    spec.cols.forEach((c,i)=>{
      const cw=c.w*TW, cx=c.c?xs[i]+cw/2:xs[i]+5;
      doc.text(String(c.label),cx,c.sub?y+13:y+19,{align:c.c?'center':'left'});
      if(c.sub){ doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text(String(c.sub),cx,y+25,{align:c.c?'center':'left'}); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); }
    });
    y+=30;
  }
  header(); colHead();
  spec.blocks.forEach(b=>{
    if(b.head){
      room(28);
      doc.setFillColor(221,228,234); doc.rect(M,y,TW,26,'F');
      doc.setTextColor(17,24,39); doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.text(String(b.head),M+7,y+18); y+=26;
    }
    b.rows.forEach(r=>{
      room(36);
      const h=34;
      if(r.bad){ doc.setFillColor(254,226,226); doc.rect(M,y,TW,h,'F'); }
      doc.setDrawColor(85,92,100); doc.setLineWidth(.9);
      doc.rect(M,y,TW,h);
      spec.cols.forEach((c,i)=>{ if(i) doc.line(xs[i],y,xs[i],y+h); });
      doc.setTextColor(r.bad?153:17, r.bad?27:24, r.bad?27:39);
      doc.setFont('helvetica', r.bad?'bold':'normal'); doc.setFontSize(13);
      r.cells.forEach((v,i)=>{
        if(v===''||v==null) return;
        const c=spec.cols[i], cw=c.w*TW;
        const txt=doc.splitTextToSize(String(v), cw-12)[0];
        doc.text(txt, c.c?xs[i]+cw/2:xs[i]+6, y+21, {align:c.c?'center':'left'});
      });
      y+=h;
    });
  });
  if(!blank && s.view!=='recv' && s.note){
    room(40); y+=10;
    doc.setTextColor(40); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Notes:',M,y);
    doc.setFont('helvetica','normal');
    doc.splitTextToSize(String(s.note),TW-54).slice(0,4).forEach((ln,i)=>doc.text(ln,M+48,y+(i*15))); y+=30;
  }
  if(blank){
    room(78); y+=16;
    doc.setTextColor(40); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Notes / corrective action:',M,y); y+=11;
    doc.setDrawColor(85,92,100); doc.setLineWidth(.9); doc.rect(M,y,TW,46); y+=46;
  }
  room(54); y+=28;
  doc.setDrawColor(17,24,39); doc.setLineWidth(1.1);
  doc.line(M,y,M+TW/2-14,y); doc.line(M+TW/2+14,y,M+TW,y);
  doc.setTextColor(60); doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
  doc.text('Checked by (print & sign)',M,y+16); doc.text('Manager verified',M+TW/2+14,y+16);
  const n=doc.internal.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setTextColor(120); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text('MCQ Supermarket \u00b7 butcher temperature record \u00b7 '+(blank?'blank form':perthStamp()), M, PH-18);
    doc.text('Page '+i+' / '+n, PW-M, PH-18, {align:'right'}); }
  const name=(spec.title.replace(/[^\w]+/g,'_')+'_'+(blank?'BLANK':(s.store+'_'+s.day))).replace(/_+/g,'_');
  doc.save(name+'.pdf');
  toast('\u2b07\ufe0f PDF downloaded');
}
window.tcPdf=tcPdf;

function tcExport(fmt){
  if(fmt==='pdf') return tcPdf(false);
  if(fmt==='pdfblank') return tcPdf(true);
  const s=tcState(), recvView=(s.view==='recv'), blank=(fmt==='blank');
  const title = recvView ? (s.doc.recvTitle||'Goods received temperature log')
                         : (s.doc.title||'Temperature check');
  const table = recvView ? tcRecvTable(blank) : tcSheetTable(blank);
  if(fmt==='excel'){
    const meta=`<b>Store:</b> ${esc(s.store)} &nbsp; <b>Date:</b> ${esc(s.day)}${(!recvView&&s.note)?` &nbsp; <b>Notes:</b> ${esc(s.note)}`:''}`;
    return expXlsBlob(title+' \u2014 '+s.store+' '+s.day, table, meta);
  }
  const legend = recvView
    ? 'Write the temperature as it reads on the probe when the delivery arrives. Mark the quality, the time it came in and who took it.'
    : 'Probe two representative products at each counter. '+Object.keys(tcRanges()).map(k=>(tcRange(k).label||k)+' '+(tcRange(k).text||'')).join(' \u00b7 ');
  tcPrintWindow(title, `${tcPrintHead(title, s, blank)}
    <p class="sub">${esc(legend)}</p>
    <table>${table}</table>
    ${(!recvView && !blank && s.note)?`<p class="sub"><b>Notes:</b> ${esc(s.note)}</p>`:''}
    ${blank?'<p class="sub"><b>Notes / corrective action:</b></p><table><tbody><tr><td style="height:42px"></td></tr><tr><td style="height:42px"></td></tr></tbody></table>':''}
    <div class="sign"><div>Checked by (print &amp; sign)</div><div>Manager verified</div></div>
    <div class="ft"><span>MCQ Supermarket \u00b7 butcher temperature record</span><span>${esc(blank?'Blank form':perthStamp())}</span></div>`);
}
window.tcExport=tcExport;
