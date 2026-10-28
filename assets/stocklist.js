/* ============================================================================
   STOCK LIST — the printed produce stock / order sheet, live.

   The paper sheet (Stock_List_Landscape) is three landscape pages of category
   blocks; each row is an item with three boxes: IN (stock on hand), O (order),
   D (delivery). This page is that same sheet, editable by everyone who has the
   code, and it prints back out looking like the paper.

   The three pages are three different KINDS of stock, so a page is a real thing
   here, not just where the paper happened to run out: a category always belongs
   to one page, a new category is added to the page you pick, and every page
   starts on a fresh printed sheet. If one page outgrows a single sheet it flows
   onto another one of its own — the next page still starts clean, so two kinds
   are never mixed on one sheet.

   Two separate pieces, on purpose:
     * the DOCUMENT  — categories + item names. One company-wide list, so every
       store prints the same sheet. Structural edits (add / rename / delete /
       move) are applied ON THE SERVER one at a time, so two people editing at
       once cannot overwrite each other.
     * the COUNT     — IN / O / D, plus date and who checked / ordered. Saved
       PER STORE, so two stores counting at the same time never clash.

   Locked behind a shared code that the SERVER checks, so a device without it is
   never served the list. The code itself is never in this repository (it is
   public): it comes from the STOCK_LIST_CODE environment variable on the host,
   or a Super sets it once from the lock screen.
   ============================================================================ */

const STK_TONES = {
  veg:   { band:'#dee9d6', tab:'#4b7a32', ink:'#1f3d12', label:'Vegetables (green)' },
  fruit: { band:'#f8e3cc', tab:'#c97520', ink:'#6b3a06', label:'Fruit (orange)' },
  other: { band:'#e5e5e5', tab:'#6b7280', ink:'#27303f', label:'Other (grey)' },
};
const STK_FIELDS = ['in','o','d'];

function stkState(){
  State.stock = State.stock || { doc:null, store:'', values:{}, meta:{date:'',checkedBy:'',orderedBy:''},
                                 edit:false, q:'', status:'', loading:false, loadedStore:'', failed:'' };
  const s = State.stock;
  if(!s.store) s.store = stkDefaultStore();
  return s;
}
function stkDefaultStore(){
  try{
    if(!stkMultiStore()) return State.branch && State.branch!=='All stores' ? State.branch : (DB.stores&&DB.stores[0])||'';
    return (DB.stores&&DB.stores[0])||'';
  }catch(e){ return ''; }
}
function stkPages(){ const d=(State.stock&&State.stock.doc)||{}; return (d.pages&&d.pages.length)?d.pages:[{id:'p1',name:'Page 1'}]; }
/* Categories grouped by page. A category whose page is missing or unknown (an
   older document, or one page removed behind our back) is shown on the FIRST
   page rather than disappearing from the screen — nothing is ever hidden. */
function stkGroupCats(){
  const d=(State.stock&&State.stock.doc)||{}, ids=stkPages().map(p=>p.id), out={};
  ids.forEach(id=>out[id]=[]);
  (d.categories||[]).forEach(c=>{ out[ids.indexOf(c.page)>=0?c.page:ids[0]].push(c); });
  return out;
}
function stkCatsOf(pageId){ return stkGroupCats()[pageId]||[]; }
function stkPageName(id){ const p=stkPages().find(x=>x.id===id); return p?p.name:''; }
/* Signed in with the stock code itself (no ID): the token already proves the code,
   so there is nothing more to type — the sheet opens straight away. */
function stkCodeSession(){ try{ return !!(window.isStockOnly && isStockOnly()); }catch(e){ return false; } }
function stkUnlocked(){ return stkCodeSession() || !!(window.mcqStockCode && mcqStockCode()); }
function stkCanEdit(){ return !isBa(); }   // Chú Ba is read-only everywhere
/* who gets the store picker: anyone whose session is not tied to one store */
function stkMultiStore(){ try{ return isSuper()||isBa()||stkCodeSession(); }catch(e){ return false; } }

/* ---------------------------------------------------------------- data load */
async function stkLoad(force){
  const s = stkState();
  if(s.loading) return;
  s.loading = true; s.failed = '';
  try{
    const [docRes, cntRes] = await Promise.all([
      mcqStockGet(),
      s.store ? mcqStockCount(s.store) : Promise.resolve({ok:true,count:{values:{},meta:{}}})
    ]);
    if(!docRes || docRes.ok===false){
      if(docRes && docRes.status===403){
        s.doc=null; s.loading=false;
        if(stkCodeSession()){
          // signed in WITH the code, yet the server says no — the code was changed
          // since this session started. Say so; never re-request in a loop.
          s.failed='The stock code was changed. Sign out and sign in again with the new code.';
        }else{
          mcqStockSetCode(''); toast('That code is not right');
        }
        renderStockList(); return;
      }
      // DON'T auto-retry here: renderStockList() would call straight back into this
      // function and spin. Show the problem and let the person press Retry.
      s.loading=false; s.failed='Could not reach the server.'; renderStockList(); return;
    }
    s.doc = docRes.doc || null;
    const c = (cntRes && cntRes.count) || {};
    s.values = (c.values && typeof c.values==='object') ? c.values : {};
    s.meta = Object.assign({date:'',checkedBy:'',orderedBy:''}, c.meta||{});
    if(!s.meta.date) s.meta.date = todayISO();
    s.loadedStore = s.store;
    s.status = '';
  }catch(e){ s.failed='Could not load the stock list.'; }
  s.loading = false;
  renderStockList();
}
/* another device edited the list → pull it in without disturbing what is being typed */
function stkOnRemoteChange(){
  const s=State.stock; if(!s||!s.doc) return;
  if(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName||'')) { setTimeout(stkOnRemoteChange, 4000); return; }
  mcqStockGet().then(r=>{ if(r&&r.ok&&r.doc&&r.doc.rev!==(s.doc&&s.doc.rev)){ s.doc=r.doc; renderStockList(); toast('↻ Stock list updated by '+((r.doc.updatedBy||'someone').split('(')[0].trim())); } }).catch(()=>{});
}
window.stkOnRemoteChange = stkOnRemoteChange;

/* ---------------------------------------------------------------- unlocking */
function stkUnlock(){
  const el = document.getElementById('stk-code');
  const code = (el && el.value || '').trim();
  if(!code){ toast('Enter the stock list code'); return; }
  const btn = document.getElementById('stk-unlock-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Checking…'; }
  mcqStockGet(code).then(r=>{
    if(r && r.ok && r.doc){
      mcqStockSetCode(code);
      const s = stkState(); s.doc = r.doc;
      stkLoad();
    }else{
      if(btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-unlock"></i>&nbsp; Open stock list'; }
      const m = document.getElementById('stk-code-msg');
      if(m) m.textContent = (r && r.offline) ? 'Cannot reach the server — check the connection.' : 'Wrong code. Ask the office for the stock list code.';
      if(el){ el.value=''; el.focus(); }
    }
  });
}
/* Super only. The code lives on the server (settings table) or in the host's
   STOCK_LIST_CODE variable — never in the code of this public repository. */
function stkSetCode(){
  const code=prompt('Set the stock list code\n\nEveryone who opens the Stock List will type this. At least 6 characters.',''); 
  if(code===null) return;
  const c=String(code).trim();
  if(c.length<6){ toast('Use at least 6 characters'); return; }
  mcqStockCodeSet(c).then(r=>{
    if(r&&r.ok){ toast('✓ Stock code saved'); const el=document.getElementById('stk-code'); if(el){ el.value=c; el.focus(); } }
    else toast((r&&r.error)||'Could not save the code');
  });
}
window.stkSetCode=stkSetCode;
function stkRetry(){ const s=stkState(); s.failed=''; renderStockList(); }
window.stkRetry=stkRetry;
function stkLock(){ mcqStockSetCode(''); const s=State.stock; if(s){ s.doc=null; s.values={}; } renderStockList(); toast('🔒 Stock list locked'); }
window.stkUnlock=stkUnlock; window.stkLock=stkLock;

/* ---------------------------------------------------------- count (per store) */
let _stkSaveT=null, _stkSaving=false;
function stkSetStatus(t){ const el=document.getElementById('stk-status'); if(el) el.innerHTML=t; }
function stkQueueSave(){
  const s=stkState();
  s.status='saving'; stkSetStatus('<i class="fas fa-circle-notch fa-spin"></i> Saving…');
  clearTimeout(_stkSaveT);
  _stkSaveT=setTimeout(stkSaveCount, 700);
}
function stkSaveCount(){
  const s=stkState(); if(!s.store || !stkCanEdit()) return;
  _stkSaving=true;
  mcqStockCountSave(s.store, {values:s.values, meta:s.meta}).then(r=>{
    _stkSaving=false;
    if(r && r.ok){ s.status='saved'; stkSetStatus('<i class="fas fa-circle-check"></i> Saved · '+esc(s.store)); }
    else { s.status='error'; stkSetStatus('<i class="fas fa-triangle-exclamation"></i> Not saved — retrying'); setTimeout(stkSaveCount, 5000); }
  });
}
function stkSetVal(itemId, field, v){
  const s=stkState();
  v = String(v||'').trim().slice(0,16);
  const row = s.values[itemId] = s.values[itemId] || {};
  if(v) row[field]=v; else delete row[field];
  if(!Object.keys(row).length) delete s.values[itemId];
  stkQueueSave();
}
function stkSetMeta(field, v){ const s=stkState(); s.meta[field]=String(v||'').slice(0,60); stkQueueSave(); }
window.stkSetVal=stkSetVal; window.stkSetMeta=stkSetMeta;

function stkClearCounts(){
  const s=stkState();
  if(!confirm('Clear every IN / O / D number on this sheet for '+s.store+'?\n\nThe item list itself is not touched.')) return;
  s.values={}; stkSaveCount(); renderStockList(); toast('Sheet cleared — ready for a new count');
}
window.stkClearCounts=stkClearCounts;

function stkSetStore(v){
  const s=stkState(); if(v===s.store) return;
  clearTimeout(_stkSaveT); stkSaveCount();           // flush the store we are leaving
  s.store=v; s.values={}; s.meta={date:todayISO(),checkedBy:'',orderedBy:''};
  stkLoad();
}
window.stkSetStore=stkSetStore;

/* ------------------------------------------------------- structure (one list) */
function stkOps(ops, okMsg){
  if(!stkCanEdit()){ toast('Read-only account'); return Promise.resolve(false); }
  const s=stkState();
  stkSetStatus('<i class="fas fa-circle-notch fa-spin"></i> Saving…');
  return mcqStockOps(ops).then(r=>{
    if(r && r.ok && r.doc){
      s.doc=r.doc; renderStockList();
      stkSetStatus('<i class="fas fa-circle-check"></i> Saved');
      if(okMsg) toast(okMsg);
      return r;
    }
    stkSetStatus('<i class="fas fa-triangle-exclamation"></i> Not saved');
    toast(r && r.status===403 ? 'The stock code was rejected — unlock again' : 'Could not save that change');
    return false;
  });
}
/* A name is typed in a real dialog with a big, full-width box — a browser prompt
   is a cramped one-liner and people could not see what they were typing. */
function stkNameDialog(opts){
  const extra = opts.extra || '';
  mcqModal(esc(opts.title), `
    <div class="stk-dlg">
      <label class="stk-dlg-lbl">${esc(opts.label||'Name')}</label>
      <input id="stk-dlg-in" class="stk-dlg-in" value="${esc(opts.value||'')}" placeholder="${esc(opts.placeholder||'')}"
             autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter')stkDlgOk()">
      ${opts.hint?`<div class="stk-dlg-hint">${opts.hint}</div>`:''}
      ${extra}
      <div class="stk-dlg-actions">
        <button class="btn" onclick="mcqModalClose()">Cancel</button>
        <button class="btn primary" onclick="stkDlgOk()">${esc(opts.ok||'Save')}</button>
      </div>
    </div>`);
  window._stkDlg = opts;
  setTimeout(()=>{ try{ const el=document.getElementById('stk-dlg-in'); if(el){ el.focus(); if(el.select) el.select(); } }catch(e){} }, 60);
}
function stkDlgOk(){
  const o=window._stkDlg||{}; const el=document.getElementById('stk-dlg-in');
  const v=(el&&el.value||'').trim();
  if(!v){ if(el) el.focus(); return; }
  const extra={};
  ['stk-dlg-page','stk-dlg-tone'].forEach(id=>{ const e=document.getElementById(id); if(e) extra[id.replace('stk-dlg-','')]=e.value; });
  mcqModalClose();
  if(o.onOk) o.onOk(v, extra);
}
window.stkNameDialog=stkNameDialog; window.stkDlgOk=stkDlgOk;

function stkPageOptions(sel){
  return stkPages().map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('');
}
function stkCatAdd(pageId){
  const s=stkState();
  const page = pageId || (stkPages()[0]||{}).id;
  stkNameDialog({
    title:'Add a category', label:'Category name', value:'', placeholder:'e.g. HERBS',
    ok:'Add category',
    hint:'Categories are usually written in CAPITALS on the sheet.',
    extra:`<label class="stk-dlg-lbl">Which page does it belong to?</label>
      <select id="stk-dlg-page" class="stk-dlg-sel">${stkPageOptions(page)}</select>
      <div class="stk-dlg-hint">Each page is a separate kind of stock and prints on its own sheet.</div>
      <label class="stk-dlg-lbl">Band colour</label>
      <select id="stk-dlg-tone" class="stk-dlg-sel">${Object.keys(STK_TONES).map(k=>`<option value="${k}">${esc(STK_TONES[k].label)}</option>`).join('')}</select>`,
    onOk:(name,x)=>stkOps([{op:'cat.add', name:name.toUpperCase(), tone:x.tone||'veg', page:x.page||page}], '✓ Category added to '+stkPageName(x.page||page))
  });
}
function stkCatSetPage(id, pageId){ if(!pageId) return; stkOps([{op:'cat.setPage', id, page:pageId}], '→ Moved to '+stkPageName(pageId)); }
function stkPageAdd(){
  stkNameDialog({ title:'Add a page', label:'Page name', value:'', placeholder:'e.g. Page 4, or Dry goods',
    ok:'Add page', hint:'A page is one kind of stock. It always starts on a fresh sheet when printed.',
    onOk:name=>stkOps([{op:'page.add', name}], '✓ Page added') });
}
function stkPageRename(id){
  stkNameDialog({ title:'Rename page', label:'Page name', value:stkPageName(id), ok:'Save',
    onOk:name=>stkOps([{op:'page.rename', id, name}]) });
}
function stkPageMove(id,dir){ stkOps([{op:'page.move', id, dir}]); }
function stkPageDel(id){
  const n=stkCatsOf(id).length;
  if(n){ toast('Move or delete this page\'s '+n+' categor'+(n>1?'ies':'y')+' first'); return; }
  if(!confirm('Delete the page "'+stkPageName(id)+'"?')) return;
  stkOps([{op:'page.del', id}], '🗑️ Page deleted');
}
window.stkCatSetPage=stkCatSetPage; window.stkPageAdd=stkPageAdd; window.stkPageRename=stkPageRename;
window.stkPageMove=stkPageMove; window.stkPageDel=stkPageDel;
function stkCatRename(id, v){ const n=String(v||'').trim(); if(!n) { renderStockList(); return; } stkOps([{op:'cat.rename', id, name:n}]); }
function stkCatTone(id, tone){ stkOps([{op:'cat.tone', id, tone}]); }
function stkCatMove(id, dir){ stkOps([{op:'cat.move', id, dir}]); }
function stkCatDel(id){
  const s=stkState(), c=(s.doc.categories||[]).find(x=>x.id===id); if(!c) return;
  if(!confirm('Delete the category "'+c.name+'" and its '+(c.items||[]).length+' item(s)?\n\nThis affects every store\'s sheet.')) return;
  stkOps([{op:'cat.del', id}], '🗑️ Category deleted');
}
function stkItemAdd(catId){
  const s=stkState(), cat=(s.doc.categories||[]).find(c=>c.id===catId);
  stkNameDialog({ title:'Add an item', label:'Item name', value:'', placeholder:'e.g. Thai Basil 200g',
    ok:'Add item', hint:cat?('It goes to the bottom of <b>'+esc(cat.name)+'</b> on '+esc(stkPageName(cat.page))+'.'):'',
    onOk:name=>stkOps([{op:'item.add', cat:catId, name}], '✓ Item added') });
}
function stkItemRename(id, v){ const n=String(v||'').trim(); if(!n){ renderStockList(); return; } stkOps([{op:'item.rename', id, name:n}]); }
function stkItemMove(id, dir){ stkOps([{op:'item.move', id, dir}]); }
function stkItemMoveTo(id, catId){ if(!catId) return; stkOps([{op:'item.moveTo', id, cat:catId}], '→ Moved'); }
function stkItemDel(id){
  const s=stkState(); let nm='';
  (s.doc.categories||[]).forEach(c=>(c.items||[]).forEach(i=>{ if(i.id===id) nm=i.name; }));
  if(!confirm('Delete "'+nm+'" from the stock list?\n\nThis affects every store\'s sheet.')) return;
  stkOps([{op:'item.del', id}], '🗑️ Item deleted');
}
function stkRestore(){
  if(!confirm('Restore the ORIGINAL printed stock list?\n\nEvery change made to the categories and items is replaced by the sheet this page was built from. Counted numbers are not touched.')) return;
  stkOps([{op:'doc.restore'}], '↩ Original sheet restored');
}
window.stkCatAdd=stkCatAdd; window.stkCatRename=stkCatRename; window.stkCatTone=stkCatTone;
window.stkCatMove=stkCatMove; window.stkCatDel=stkCatDel; window.stkItemAdd=stkItemAdd;
window.stkItemRename=stkItemRename; window.stkItemMove=stkItemMove; window.stkItemMoveTo=stkItemMoveTo;
window.stkItemDel=stkItemDel; window.stkRestore=stkRestore;

function stkToggleEdit(){ const s=stkState(); s.edit=!s.edit; renderStockList(); }
function stkFilter(v){
  const s=stkState(); s.q=String(v||'');
  stkPaintFilter();
}
function stkPaintFilter(){
  const s=stkState(), q=staffNorm(s.q||'');
  document.querySelectorAll('#stk-grid .stk-cat').forEach(card=>{
    let shown=0;
    card.querySelectorAll('.stk-row').forEach(row=>{
      const hit = !q || staffNorm(row.getAttribute('data-name')||'').includes(q);
      row.style.display = hit?'':'none'; if(hit) shown++;
    });
    card.style.display = (q && !shown) ? 'none' : '';
  });
  const n=document.getElementById('stk-filter-n');
  if(n) n.textContent = q ? (document.querySelectorAll('#stk-grid .stk-row:not([style*="none"])').length+' match') : '';
}
window.stkToggleEdit=stkToggleEdit; window.stkFilter=stkFilter;

/* ---------------------------------------------------------------- rendering */
function stkRowHTML(it, cat, s, idx, total){
  const v = s.values[it.id] || {};
  const boxes = STK_FIELDS.map(f=>
    `<td class="stk-b"><input class="stk-in" value="${esc(v[f]||'')}" inputmode="decimal" autocomplete="off"
        aria-label="${esc(it.name)} ${f.toUpperCase()}" oninput="stkSetVal('${ckJS(it.id)}','${f}',this.value)"></td>`).join('');
  if(!s.edit) return `<tr class="stk-row" data-name="${esc(it.name)}"><td class="stk-n">${esc(it.name)}</td>${boxes}</tr>`;
  const cats=(s.doc.categories||[]);
  return `<tr class="stk-row stk-editing" data-name="${esc(it.name)}">
    <td class="stk-n">
      <div class="stk-ed-row">
        <span class="stk-mv">
          <button class="stk-ic" title="Move up" ${idx===0?'disabled':''} onclick="stkItemMove('${ckJS(it.id)}','up')"><i class="fas fa-chevron-up"></i></button>
          <button class="stk-ic" title="Move down" ${idx===total-1?'disabled':''} onclick="stkItemMove('${ckJS(it.id)}','down')"><i class="fas fa-chevron-down"></i></button>
        </span>
        <input class="stk-name-in" value="${esc(it.name)}" onchange="stkItemRename('${ckJS(it.id)}',this.value)">
        <select class="stk-move-sel" title="Move to another category" onchange="stkItemMoveTo('${ckJS(it.id)}',this.value);this.selectedIndex=0">
          <option value="">Move to…</option>
          ${cats.filter(c=>c.id!==cat.id).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
        </select>
        <button class="stk-ic danger" title="Delete item" onclick="stkItemDel('${ckJS(it.id)}')"><i class="fas fa-trash"></i></button>
      </div>
    </td>${boxes}</tr>`;
}
function stkCatHTML(cat, s, ci, total){
  const tone = STK_TONES[cat.tone] || STK_TONES.veg;
  const items = cat.items || [];
  const head = s.edit
    ? `<div class="stk-band" style="--band:${tone.band};--tab:${tone.tab};--ink:${tone.ink}">
         <input class="stk-band-in" value="${esc(cat.name)}" onchange="stkCatRename('${ckJS(cat.id)}',this.value)">
         <select class="stk-tone-sel" title="Band colour" onchange="stkCatTone('${ckJS(cat.id)}',this.value)">
           ${Object.keys(STK_TONES).map(k=>`<option value="${k}" ${cat.tone===k?'selected':''}>${esc(STK_TONES[k].label)}</option>`).join('')}
         </select>
         <button class="stk-ic" title="Move category up" ${ci===0?'disabled':''} onclick="stkCatMove('${ckJS(cat.id)}','up')"><i class="fas fa-chevron-up"></i></button>
         <button class="stk-ic" title="Move category down" ${ci===total-1?'disabled':''} onclick="stkCatMove('${ckJS(cat.id)}','down')"><i class="fas fa-chevron-down"></i></button>
         <select class="stk-page-sel" title="Move this category to another page" onchange="stkCatSetPage('${ckJS(cat.id)}',this.value)">
           ${stkPageOptions(cat.page)}
         </select>
         <button class="stk-ic danger" title="Delete category" onclick="stkCatDel('${ckJS(cat.id)}')"><i class="fas fa-trash"></i></button>
       </div>`
    : `<div class="stk-band" style="--band:${tone.band};--tab:${tone.tab};--ink:${tone.ink}"><b>${esc(cat.name)}</b><span class="stk-count">${items.length}</span></div>`;
  return `<section class="stk-cat" data-cat="${esc(cat.id)}">
    <table class="stk-tbl">
      <thead><tr><th class="stk-n">ITEM</th><th>IN</th><th>O</th><th>D</th></tr></thead>
      <tbody>
        <tr class="stk-band-row"><td colspan="4">${head}</td></tr>
        ${items.map((it,i)=>stkRowHTML(it,cat,s,i,items.length)).join('')}
        ${s.edit?`<tr class="stk-add-row"><td colspan="4"><button class="stk-add" onclick="stkItemAdd('${ckJS(cat.id)}')"><i class="fas fa-plus"></i> Add item to ${esc(cat.name)}</button></td></tr>`:''}
      </tbody>
    </table></section>`;
}
function renderStockList(){
  setAccent('#2f6f3e');
  const s = stkState();

  /* ---- locked ---- */
  if(!stkUnlocked()){
    setCrumb('🔒','Stock List','Enter the stock list code to open');
    $('#content').innerHTML = `<div class="stk-lock">
      <div class="card stk-lock-card"><div class="card-pad">
        <div class="stk-lock-ic">🔒</div>
        <h2>Stock List</h2>
        <p>This sheet is locked. Enter the stock list code to open it — the office can give it to you.</p>
        <input id="stk-code" class="login-input" type="password" inputmode="numeric" autocomplete="off"
               placeholder="Stock list code" onkeydown="if(event.key==='Enter')stkUnlock()">
        <div id="stk-code-msg" class="stk-code-msg"></div>
        <button id="stk-unlock-btn" class="btn primary block" onclick="stkUnlock()"><i class="fas fa-unlock"></i>&nbsp; Open stock list</button>
        ${isSuper()?`<button class="btn xs stk-setcode" onclick="stkSetCode()"><i class="fas fa-key"></i>&nbsp; Set / change the stock code</button>`:''}
      </div></div></div>`;
    if(isSuper() && window.mcqStockCodeState) mcqStockCodeState().then(r=>{
      const m=document.getElementById('stk-code-msg');
      if(m && r && r.ok && !r.configured) m.innerHTML='<span class="stk-note">No code is set yet — press <b>Set / change the stock code</b> below to choose one.</span>';
    }).catch(()=>{});
    setTimeout(()=>{ const el=document.getElementById('stk-code'); if(el) el.focus(); }, 60);
    return;
  }

  /* ---- loading / could not load ---- */
  if(!s.doc){
    if(s.failed){
      setCrumb('📦','Stock List','Could not load');
      $('#content').innerHTML = `<div class="card card-pad stk-fail"><div class="stk-lock-ic">⚠️</div>
        <b>${esc(s.failed)}</b>
        <span>The sheet is saved on the server — nothing you typed earlier is lost. Check the connection and try again.</span>
        <button class="btn primary" onclick="stkRetry()"><i class="fas fa-rotate-right"></i>&nbsp; Try again</button></div>`;
      return;
    }
    setCrumb('📦','Stock List','Loading…');
    $('#content').innerHTML = `<div class="card card-pad loading-state"><i class="fas fa-spinner fa-spin"></i><b>Opening the stock list…</b><span>Fetching the live sheet and ${esc(s.store||'your store')}'s numbers.</span></div>`;
    if(!s.loading) stkLoad();
    return;
  }

  const cats = s.doc.categories || [], pages = stkPages();
  const nItems = cats.reduce((n,c)=>n+((c.items||[]).length),0);
  const filled = Object.keys(s.values).length;
  setCrumb('📦','Stock List',`${esc(s.store)} · ${pages.length} pages · ${cats.length} categories · ${nItems} items`);

  const storePick = stkMultiStore()
    ? `<select class="login-input stk-store" onchange="stkSetStore(this.value)">${(DB.stores||[]).map(st=>`<option ${st===s.store?'selected':''}>${esc(st)}</option>`).join('')}</select>`
    : `<span class="stk-store-fixed"><i class="fas fa-store"></i> ${esc(s.store)}</span>`;

  $('#content').innerHTML = `
    <div class="page-head">
      <div class="ph-ic">📦</div>
      <div><h2>Stock List</h2><p>Count on hand, order and delivery — the same sheet you print, kept live. <b>IN</b> = stock on hand · <b>O</b> = order · <b>D</b> = delivery</p></div>
      <div class="ph-actions">
        ${storePick}
        ${stkCanEdit()?`<button class="btn sm ${s.edit?'primary':''}" onclick="stkToggleEdit()"><i class="fas fa-pen"></i> ${s.edit?'Done editing':'Edit list'}</button>`:''}
        <div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
          <div class="exp-menu">
            <button onclick="stkExport('print')"><i class="fas fa-print"></i> Print / PDF</button>
            <button onclick="stkExport('excel')"><i class="fas fa-file-excel"></i> Excel</button>
          </div></div>
        ${stkCodeSession()?'':`<button class="btn sm" title="Lock this page again" onclick="stkLock()"><i class="fas fa-lock"></i></button>`}
      </div>
    </div>

    <div class="card stk-meta"><div class="card-pad">
      <div class="stk-meta-grid">
        <label><span>DATE</span><input type="date" value="${esc(s.meta.date||'')}" onchange="stkSetMeta('date',this.value)"></label>
        <label><span>STORE</span><input value="${esc(s.store)}" readonly></label>
        <label><span>CHECKED BY</span><input value="${esc(s.meta.checkedBy||'')}" placeholder="Name" oninput="stkSetMeta('checkedBy',this.value)"></label>
        <label><span>ORDERED BY</span><input value="${esc(s.meta.orderedBy||'')}" placeholder="Name" oninput="stkSetMeta('orderedBy',this.value)"></label>
        <div class="stk-meta-side">
          <div id="stk-status" class="stk-status">${filled?('<i class="fas fa-circle-check"></i> '+filled+' item(s) filled'):'<i class="fas fa-pen-to-square"></i> Nothing counted yet'}</div>
          ${stkCanEdit()?`<button class="btn xs" onclick="stkClearCounts()"><i class="fas fa-eraser"></i> Clear numbers</button>`:''}
        </div>
      </div>
      <div class="stk-filter">
        <i class="fas fa-magnifying-glass"></i>
        <input placeholder="Find an item…  (e.g. banana, egg, lettuce)" value="${esc(s.q||'')}" oninput="stkFilter(this.value)">
        <span id="stk-filter-n" class="stk-filter-n"></span>
      </div>
    </div></div>

    ${s.edit?`<div class="stk-edit-hint"><i class="fas fa-wand-magic-sparkles"></i> <b>Editing the list</b> — rename straight in the box, ▲▼ to move, <b>Move to…</b> sends an item to another category and the page box moves a whole category to another page. Each page prints on its own sheet, so a page that grows long just continues on another sheet of its own. Changes apply to <b>every store's</b> sheet. <button class="btn xs" style="margin-left:auto" onclick="stkRestore()"><i class="fas fa-rotate-left"></i> Restore original sheet</button></div>`:''}

    <div id="stk-grid" class="stk-pages ${s.edit?'editing':''}">${(grouped=>pages.map((pg,pi)=>{
      const pcats = grouped[pg.id]||[];
      const pItems = pcats.reduce((n,c)=>n+((c.items||[]).length),0);
      return `<section class="stk-page" data-page="${esc(pg.id)}">
        <div class="stk-page-bar">
          <span class="stk-page-no">${pi+1}</span>
          <b>${esc(pg.name)}</b>
          <span class="stk-page-sub">${pcats.length} categor${pcats.length===1?'y':'ies'} · ${pItems} items · prints on its own sheet</span>
          ${s.edit?`<span class="stk-page-ops">
            <button class="stk-ic" title="Rename page" onclick="stkPageRename('${ckJS(pg.id)}')"><i class="fas fa-pen"></i></button>
            <button class="stk-ic" title="Move page up" ${pi===0?'disabled':''} onclick="stkPageMove('${ckJS(pg.id)}','up')"><i class="fas fa-chevron-up"></i></button>
            <button class="stk-ic" title="Move page down" ${pi===pages.length-1?'disabled':''} onclick="stkPageMove('${ckJS(pg.id)}','down')"><i class="fas fa-chevron-down"></i></button>
            <button class="stk-ic danger" title="Delete page" onclick="stkPageDel('${ckJS(pg.id)}')"><i class="fas fa-trash"></i></button>
          </span>`:''}
        </div>
        <div class="stk-grid">${pcats.map((c,i)=>stkCatHTML(c,s,i,pcats.length)).join('')
          || '<div class="empty compact">No categories on this page yet.</div>'}</div>
        ${s.edit?`<button class="btn xs stk-add-cat" onclick="stkCatAdd('${ckJS(pg.id)}')"><i class="fas fa-plus"></i>&nbsp; Add a category to ${esc(pg.name)}</button>`:''}
      </section>`;
    }).join(''))(stkGroupCats())}</div>

    ${s.edit?`<button class="btn block stk-add-page" onclick="stkPageAdd()"><i class="fas fa-file-circle-plus"></i>&nbsp; Add another page</button>`:''}

    <div class="stk-foot">IN = stock on hand &nbsp;·&nbsp; O = order &nbsp;·&nbsp; D = delivery${s.doc.updatedAt?` &nbsp;·&nbsp; list last changed ${esc(String(s.doc.updatedAt).slice(0,16))} by ${esc(String(s.doc.updatedBy||'').split('(')[0].trim())}`:''}</div>`;

  if(s.q) stkPaintFilter();
}
window.renderStockList = renderStockList;

/* ---------------------------------------------------------------- exporting */
function stkBlocksHTML(cats){
  const s=stkState();
  return cats.map(cat=>{
    const tone=STK_TONES[cat.tone]||STK_TONES.veg;
    const rows=(cat.items||[]).map(it=>{ const v=s.values[it.id]||{};
      return `<tr><td class="n">${esc(it.name)}</td><td class="b">${esc(v.in||'')}</td><td class="b">${esc(v.o||'')}</td><td class="b">${esc(v.d||'')}</td></tr>`;
    }).join('');
    return `<table class="blk"><thead><tr><th class="n">ITEM</th><th>IN</th><th>O</th><th>D</th></tr></thead><tbody>
      <tr class="band"><td colspan="4" style="background:${tone.band};color:${tone.ink};border-left:5px solid ${tone.tab}">${esc(cat.name)}</td></tr>
      ${rows}</tbody></table>`;
  }).join('');
}
function stkSheetHTML(){ const s=stkState(); return stkBlocksHTML(s.doc.categories||[]); }
function stkExport(fmt){
  const s=stkState();
  if(fmt==='excel') return stkExportExcel();
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to print'); return; }
  const css=`@page{size:A4 landscape;margin:9mm}
    *{box-sizing:border-box}
    body{font-family:Inter,Arial,Helvetica,sans-serif;margin:0;color:#111}
    .hd{display:flex;align-items:baseline;gap:14px;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}
    .hd h1{font-size:21px;margin:0;letter-spacing:.5px}
    .hd .f{font-size:10.5px;font-weight:700;letter-spacing:.3px}
    .hd .f u{display:inline-block;min-width:98px;border-bottom:1px solid #111;text-decoration:none;font-weight:400;padding:0 4px}
    .wrap{column-count:3;column-gap:9px}
    .sheet.brk{break-before:page;page-break-before:always}
    .hd .pg{background:#111;color:#fff;border-radius:4px;padding:2px 8px;letter-spacing:.6px}
    .blk{width:100%;border-collapse:collapse;break-inside:avoid;page-break-inside:avoid;margin:0 0 7px;font-size:9.6px}
    .blk th{background:#111;color:#fff;font-size:9px;letter-spacing:.4px;padding:3px 5px;text-align:center;border:1px solid #111}
    .blk th.n{text-align:left}
    .blk td{border:1px solid #c9ced6;padding:2.4px 5px;height:15px}
    .blk td.n{width:58%}
    .blk td.b{width:14%;text-align:center;font-weight:700}
    .blk tbody tr:nth-child(odd) td{background:#f6f7f8}   /* child 1 is the band, so items start white */
    .blk tr.band td{font-weight:800;font-size:10.2px;letter-spacing:.3px;padding:3px 6px}
    .ft{position:fixed;bottom:3mm;left:0;right:0;display:flex;justify-content:space-between;font-size:9px;color:#444;padding:0 2mm}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Stock List — ${esc(s.store)}</title><style>${css}</style></head><body>
    <div class="hd"><h1>STOCK LIST</h1>
      <span class="f pg">${esc((stkPages()[0]||{}).name||'')}</span>
      <span class="f">DATE: <u>${esc(s.meta.date||'')}</u></span>
      <span class="f">STORE: <u>${esc(s.store||'')}</u></span>
      <span class="f">CHECKED BY: <u>${esc(s.meta.checkedBy||'')}</u></span>
      <span class="f">ORDERED BY: <u>${esc(s.meta.orderedBy||'')}</u></span></div>
    ${(grouped=>stkPages().map((pg,i)=>{
      const pcats=grouped[pg.id]||[];
      if(!pcats.length) return '';
      return `<div class="sheet${i?' brk':''}">
        ${i?`<div class="hd"><h1>STOCK LIST</h1><span class="f pg">${esc(pg.name)}</span>
             <span class="f">DATE: <u>${esc(s.meta.date||'')}</u></span>
             <span class="f">STORE: <u>${esc(s.store||'')}</u></span>
             <span class="f">CHECKED BY: <u>${esc(s.meta.checkedBy||'')}</u></span>
             <span class="f">ORDERED BY: <u>${esc(s.meta.orderedBy||'')}</u></span></div>`:''}
        <div class="wrap">${stkBlocksHTML(pcats)}</div></div>`;
    }).join(''))(stkGroupCats())}
    <div class="ft"><span>IN = stock on hand &nbsp; O = order &nbsp; D = delivery</span><span>MCQ Supermarket · ${esc(perthStamp())}</span></div>
    <script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>`);
  w.document.close();
}
function stkExportExcel(){
  const s=stkState(), cats=s.doc.categories||[];
  let body='<tbody>';
  const grouped=stkGroupCats();
  stkPages().forEach(pg=>{
    const pcats=grouped[pg.id]||[]; if(!pcats.length) return;
    body+=`<tr><td colspan="4" style="background:#111827;color:#fff;font-weight:bold">${esc(pg.name)}</td></tr>`;
    pcats.forEach(cat=>{
      const tone=STK_TONES[cat.tone]||STK_TONES.veg;
      body+=`<tr><td colspan="4" style="background:${tone.band};color:${tone.ink};font-weight:bold">${esc(cat.name)}</td></tr>`;
      (cat.items||[]).forEach(it=>{ const v=s.values[it.id]||{};
        body+=`<tr><td>${esc(it.name)}</td><td>${esc(v.in||'')}</td><td>${esc(v.o||'')}</td><td>${esc(v.d||'')}</td></tr>`; });
    });
  });
  body+='</tbody>';
  const head='<thead><tr><th>ITEM</th><th>IN</th><th>O</th><th>D</th></tr></thead>';
  const meta=`<b>Store:</b> ${esc(s.store)} &nbsp; <b>Date:</b> ${esc(s.meta.date||todayISO())} &nbsp; <b>Checked by:</b> ${esc(s.meta.checkedBy||'—')} &nbsp; <b>Ordered by:</b> ${esc(s.meta.orderedBy||'—')}`;
  expXlsBlob('Stock List — '+s.store, head+body, meta);
}
window.stkExport=stkExport;
