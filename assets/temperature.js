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
                               edit:false, loading:false, failed:'', status:'' };
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
    const log = (logRes && logRes.log) || {};
    s.values = (log.values && typeof log.values==='object') ? log.values : {};
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
  mcqTempLogSave(s.store, {day:s.day, values:s.values, note:s.note}).then(r=>{
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
function tcSetDay(v){ const s=tcState(); s.day=v||todayISO(); s.values={}; s.note=''; s.doc=s.doc; tcLoad(); }
function tcSetStore(v){ const s=tcState(); if(v===s.store) return; clearTimeout(_tcSaveT); tcSaveLog(); s.store=v; s.values={}; s.note=''; tcLoad(); }
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

/* ---------------------------------------------------------------- rendering */
function renderTempCheck(){
  setAccent('#0369a1');
  const s = tcState();

  if(!s.doc){
    if(s.failed){
      setCrumb('🌡️','Temperature Check','Could not load');
      $('#content').innerHTML=`<div class="card card-pad tc-fail"><div class="tc-fail-ic">⚠️</div>
        <b>${esc(s.failed)}</b><span>The sheet is kept on the server — nothing already written down is lost.</span>
        <button class="btn primary" onclick="tcRetry()"><i class="fas fa-rotate-right"></i>&nbsp; Try again</button></div>`;
      return;
    }
    setCrumb('🌡️','Temperature Check','Loading…');
    $('#content').innerHTML=`<div class="card card-pad loading-state"><i class="fas fa-spinner fa-spin"></i><b>Opening the temperature sheet…</b><span>Fetching the live sheet and ${esc(s.store||'your store')}'s readings.</span></div>`;
    if(!s.loading) tcLoad();
    return;
  }

  const rounds=tcRounds(), items=tcItems();
  const filled=Object.keys(s.values).length, total=rounds.length*items.length;
  const bad=Object.keys(s.values).filter(k=>{ const rid=k.split('|')[0], r=rounds.find(x=>x.id===rid);
    return r && tcVerdict(s.values[k].v, r.type).state==='bad'; }).length;
  setCrumb('🌡️','Temperature Check',`${esc(s.store)} · ${esc(s.day)} · ${filled}/${total} recorded${bad?(' · '+bad+' out of range'):''}`);

  const storePick = tcMultiStore()
    ? `<select class="login-input tc-store" onchange="tcSetStore(this.value)">${(DB.stores||[]).map(st=>`<option ${st===s.store?'selected':''}>${esc(st)}</option>`).join('')}</select>`
    : `<span class="tc-store-fixed"><i class="fas fa-store"></i> ${esc(s.store)}</span>`;

  const head = rounds.map((r,i)=>`<th class="tc-h">
      <div class="tc-h-name">${esc(r.name)}</div>
      <div class="tc-h-time">${esc(tcTimeLabel(r.time))}</div>
      <div class="tc-h-type tone-${esc(r.type)}">${esc(tcRange(r.type).label||r.type)} · ${esc(tcRange(r.type).text||'')}</div>
      ${s.edit?`<div class="tc-h-ops">
        <button class="tc-ic" title="Edit this check" onclick="tcRoundEdit('${ckJS(r.id)}')"><i class="fas fa-pen"></i></button>
        <button class="tc-ic" title="Move left" ${i===0?'disabled':''} onclick="tcRoundMove('${ckJS(r.id)}','up')"><i class="fas fa-chevron-left"></i></button>
        <button class="tc-ic" title="Move right" ${i===rounds.length-1?'disabled':''} onclick="tcRoundMove('${ckJS(r.id)}','down')"><i class="fas fa-chevron-right"></i></button>
        <button class="tc-ic danger" title="Delete this check" onclick="tcRoundDel('${ckJS(r.id)}')"><i class="fas fa-trash"></i></button>
      </div>`:''}
    </th>`).join('');

  const rows = items.map((it,ri)=>`<tr>
      <td class="tc-unit">${s.edit?`<div class="tc-unit-ed">
          <span class="tc-mv">
            <button class="tc-ic" title="Move up" ${ri===0?'disabled':''} onclick="tcItemMove('${ckJS(it.id)}','up')"><i class="fas fa-chevron-up"></i></button>
            <button class="tc-ic" title="Move down" ${ri===items.length-1?'disabled':''} onclick="tcItemMove('${ckJS(it.id)}','down')"><i class="fas fa-chevron-down"></i></button>
          </span>
          <button class="tc-unit-name" onclick="tcItemRename('${ckJS(it.id)}')" title="Rename">${esc(it.name)} <i class="fas fa-pen"></i></button>
          <button class="tc-ic danger" title="Delete unit" onclick="tcItemDel('${ckJS(it.id)}')"><i class="fas fa-trash"></i></button>
        </div>`:`<b>${esc(it.name)}</b>`}</td>
      ${rounds.map(r=>{
        const rec=s.values[tcKey(r.id,it.id)]||{}, vd=tcVerdict(rec.v,r.type);
        return `<td id="tc-cell-${esc(r.id)}-${esc(it.id)}" class="tc-cell ${vd.state==='ok'?'ok':vd.state==='bad'?'bad':''}">
          <div class="tc-in-wrap">
            <input class="tc-in" value="${esc(rec.v||'')}" inputmode="decimal" placeholder="—"
              aria-label="${esc(it.name)} at ${esc(tcTimeLabel(r.time))}"
              ${tcCanRecord()?'':'disabled'} oninput="tcSetVal('${ckJS(r.id)}','${ckJS(it.id)}',this.value)">
            <span class="tc-deg">°C</span>
          </div>
          <div class="tc-stamp">${esc(rec.v?((rec.at||'')+(rec.by?(' · '+String(rec.by).split(' ')[0]):'')):'')}</div>
          <div class="tc-warn">${vd.state==='bad'?('⚠ '+esc(vd.why)):''}</div>
        </td>`;
      }).join('')}
    </tr>`).join('');

  $('#content').innerHTML=`
    <div class="page-head">
      <div class="ph-ic">🌡️</div>
      <div><h2>${esc(s.doc.title||'Temperature Check')}${tcCanEdit()?` <button class="tc-ic title-ed" title="Rename the sheet" onclick="tcTitleEdit()"><i class="fas fa-pen"></i></button>`:''}</h2>
        <p>Write the reading for every unit at each check. A reading outside the safe range turns red straight away.</p></div>
      <div class="ph-actions">
        ${storePick}
        <input type="date" class="login-input tc-date" value="${esc(s.day)}" onchange="tcSetDay(this.value)">
        ${s.day!==todayISO()?`<button class="btn sm" onclick="tcToday()"><i class="fas fa-rotate-left"></i> Today</button>`:''}
        ${tcCanEdit()?`<button class="btn sm ${s.edit?'primary':''}" onclick="tcToggleEdit()"><i class="fas fa-pen"></i> ${s.edit?'Done editing':'Edit sheet'}</button>`:''}
        <div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
          <div class="exp-menu">
            <button onclick="tcExport('print')"><i class="fas fa-print"></i> Print / PDF</button>
            <button onclick="tcExport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
          </div></div>
      </div>
    </div>

    ${bad?`<div class="tc-alert"><i class="fas fa-triangle-exclamation"></i> <b>${bad} reading${bad>1?'s are':' is'} outside the safe range.</b> Move the stock, check the unit and tell the manager.</div>`:''}
    ${s.edit?`<div class="tc-edit-hint"><i class="fas fa-wand-magic-sparkles"></i> <b>Editing the sheet</b> — this is ONE sheet for every store, so a change here shows up at every store. Readings already written down are kept.
      <button class="btn xs" style="margin-left:auto" onclick="tcRestore()"><i class="fas fa-rotate-left"></i> Restore original</button></div>`:''}

    <div class="card tc-card"><div class="table-wrap">
      <table class="tc-tbl">
        <thead><tr><th class="tc-unit-h">UNIT</th>${head}</tr></thead>
        <tbody>${rows||`<tr><td colspan="${rounds.length+1}"><div class="empty compact">No units on this sheet yet.</div></td></tr>`}</tbody>
      </table></div>
      ${s.edit?`<div class="tc-adds">
        <button class="btn xs" onclick="tcItemAdd()"><i class="fas fa-plus"></i>&nbsp; Add a unit</button>
        <button class="btn xs" onclick="tcRoundAdd()"><i class="fas fa-plus"></i>&nbsp; Add a check time</button>
      </div>`:''}
    </div>

    <div class="card tc-note"><div class="card-pad">
      <label class="tc-note-lbl">Notes for ${esc(s.day)} <span>(corrective action, unit faults, who was told…)</span></label>
      <textarea class="tc-note-in" rows="2" ${tcCanRecord()?'':'disabled'} placeholder="e.g. Beef display read 7 °C at 12:30 — stock moved to cool room, fridge serviced."
        oninput="tcSetNote(this.value)">${esc(s.note||'')}</textarea>
      <div class="tc-foot">
        <span id="tc-status" class="tc-status">${s.savedAt?`<i class="fas fa-circle-check"></i> Saved · ${esc(String(s.savedAt).slice(0,16))}`:'<i class="fas fa-pen-to-square"></i> Nothing recorded for this day yet'}</span>
        <span class="tc-foot-sub">Safe ranges: ${Object.keys(tcRanges()).map(k=>esc((tcRange(k).label||k)+' '+(tcRange(k).text||''))).join(' · ')}</span>
      </div>
    </div></div>`;
}
window.renderTempCheck = renderTempCheck;

/* ---------------------------------------------------------------- exporting */
function tcSheetTable(){
  const s=tcState(), rounds=tcRounds(), items=tcItems();
  const head='<thead><tr><th>UNIT</th>'+rounds.map(r=>`<th>${esc(r.name)}<br>${esc(tcTimeLabel(r.time))} · ${esc(tcRange(r.type).label||r.type)}<br><small>${esc(tcRange(r.type).text||'')}</small></th>`).join('')+'</tr></thead>';
  const body='<tbody>'+items.map(it=>'<tr><td class="u">'+esc(it.name)+'</td>'+rounds.map(r=>{
    const rec=s.values[tcKey(r.id,it.id)]||{}, vd=tcVerdict(rec.v,r.type);
    const cls=vd.state==='bad'?' style="background:#fee2e2;color:#991b1b;font-weight:bold"':(vd.state==='ok'?' style="background:#f0fdf4"':'');
    return `<td${cls}>${esc(rec.v?rec.v+' °C':'')}${rec.at?`<br><small>${esc(rec.at)}${rec.by?(' · '+esc(String(rec.by).split(' ')[0])):''}</small>`:''}</td>`;
  }).join('')+'</tr>').join('')+'</tbody>';
  return head+body;
}
function tcExport(fmt){
  const s=tcState();
  const meta=`<b>Store:</b> ${esc(s.store)} &nbsp; <b>Date:</b> ${esc(s.day)}${s.note?` &nbsp; <b>Notes:</b> ${esc(s.note)}`:''}`;
  if(fmt==='excel') return expXlsBlob((s.doc.title||'Temperature Check')+' — '+s.store+' '+s.day, tcSheetTable(), meta);
  expPrintReport((s.doc.title||'Temperature Check')+' — '+s.day, tcSheetTable(), meta);
}
window.tcExport=tcExport;
