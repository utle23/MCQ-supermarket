/* ============================================================
   MCQ Ops Hub — Custom pages (checklist, HR, management)
   Uses globals from app.js.
   ============================================================ */

function photoSpec(p){
  if(!p) return null;
  if(p[0]==='R'){ const m=p.slice(1).split('-'); return {req:true,min:+m[0],max:+(m[1]||m[0])}; }
  if(p[0]==='O'){ const n=p.slice(1); return {req:false,max:n?+n:null}; }
  return null;
}
function photoChip(ps){
  if(!ps) return '';
  if(ps.req) return `<span class="ev-chip ev-req">📷 Required · ${ps.min}-${ps.max}</span>`;
  return `<span class="ev-chip ev-req">📷 Required before submit${ps.max?' · max '+ps.max:''}</span>`;
}

/* ============================================================ STAFF HOME (simplified, mobile-first) */
function renderStaffHome(){
  setAccent('#0e9f6e'); setCrumb('🏠','My Store','MCQ '+State.branch);
  const u=me();
  const openItems=DB.order.reduce((n,id)=>n+openCount(id),0);
  const actions=[
    ['✅','Store Checklist','Opening & closing checks','#10b981',"go('checklist')"],
    ['🗑️','Bin Checklist','Tue, Thu & Fri evidence','#64748b',"go('binadmin')"],
    ['🔁','Shift Handover','Who is on + pass notes','#0891b2',"go('handover')"],
    ['🚩','Report an Issue','Maintenance, safety, stock…','#e53935',"go('issue')"],
    ['🚚','Log Delivery','Truck & crate return','#3b82f6',"go('delivery','new')"],
    ['📖','Store Rules','Handbook & standards','#8b5cf6',"go('rules')"],
  ];
  const feed=recentFeed().slice(0,6).map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div><div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('')||'<div class="empty">No recent activity at your store yet.</div>';
  $('#content').innerHTML=`
    <div class="staff-hero">
      <div class="sh-greet"><div class="sh-hi">Hi, ${esc((u.name||'Team').split(' ')[0])} 👋</div>
        <div class="sh-sub">MCQ ${esc(State.branch)} · ${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'})}</div></div>
      <div class="sh-badge"><b>${openItems}</b><span>open items</span></div>
    </div>
    <div class="section-title">What do you need to do?</div>
    <div class="staff-actions">${actions.map(a=>`<button class="sa-tile" style="--c:${a[3]}" onclick="${a[4]}"><span class="sa-ic">${a[0]}</span><span class="sa-txt"><b>${a[1]}</b><small>${a[2]}</small></span><span class="sa-arrow">→</span></button>`).join('')}</div>
    <div class="section-title">Recent at your store</div>
    <div class="card"><div class="feed">${feed}</div></div>`;
}

/* ============================================================ CHECKLIST — Opening/Closing + photo capture */
const CK_DEADLINE={Opening:'10:30 AM',Closing:'6:30 PM'};
function ckJS(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function staffNorm(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function staffScopeList(){
  return (DB.staff||[]).filter(s=>s.active!==0 && (isSuper() || s.store===State.branch));
}
function staffDeptNeedles(dept){
  const d=staffNorm(dept);
  if(!d || /whole store|all store|all staff|storefront|amenit/.test(d)) return [];
  const rules=[
    [/cash|checkout|front/,['cashier','front end']],
    [/\bfv\b|fruit|veg/,['fv','fruit','veg']],
    [/grocery/,['grocery']],
    [/frozen|dairy|refrigeration|coolroom|freezer/,['frozen','dairy','grocery']],
    [/butcher|meat/,['butcher']],
    [/cafe/,['cafe']],
    [/manager|office|leadership/,['manager','supervisor','head office','assistant manager']],
    [/forklift|warehouse|loading|logistics/,['warehouse','logistics','forklift']],
    [/clean|toilet/,['cleaner']],
    [/maintenance|building|electrical|plumbing|\bit\b|safety/,['maintenance','manager','supervisor','warehouse']]
  ];
  const hit=rules.find(r=>r[0].test(d));
  return hit?hit[1]:[d];
}
function staffIsAdmin(s){ return !!(s&&(s.admin||(Array.isArray(s.roles)&&s.roles.some(r=>staffNorm(r)==='admin')))); }
function staffForDept(dept,opts){
  const all=staffScopeList(), dn=staffNorm(dept);
  if(dn){
    // explicit links: Admin staff appear in EVERY checklist; multi-role staff appear in each of their roles; plus the legacy single dept field
    const explicit=all.filter(s=> staffIsAdmin(s)
      || (Array.isArray(s.roles)&&s.roles.some(r=>staffNorm(r)===dn))
      || staffNorm(s.dept)===dn );
    if(explicit.length) return explicit;
  }
  const needles=staffDeptNeedles(dept);
  if(!needles.length) return all;
  const rows=all.filter(s=>{ const role=staffNorm(s.role), name=staffNorm(s.name); return needles.some(n=>role.includes(n)||name.includes(n)); });
  return rows.length?rows:((opts&&opts.fallbackAll)?all:[]);
}
function staffById(id){
  return (DB.staff||[]).find(s=>String(s.id)===String(id));
}
function staffIdsForNames(names,dept){
  const vals=String(names||'').split(',').map(s=>s.trim()).filter(Boolean);
  const pool=staffForDept(dept,{fallbackAll:true});
  return vals.map(n=>(pool.find(s=>s.name===n)||staffScopeList().find(s=>s.name===n)||{}).id).filter(Boolean);
}
function staffNamesFromIds(ids){
  return (ids||[]).map(id=>staffById(id)).filter(Boolean).map(s=>s.name);
}
function staffDisplayForTask(t){
  const names=staffNamesFromIds(t.staffIds||[]);
  if(names.length) return names.join(', ');
  return staffDisplayForDept(t.dept,t.who);
}
function staffDataList(id,dept,current){
  const rows=staffForDept(dept), seen=new Set(rows.map(s=>s.name));
  const currentVals=(Array.isArray(current)?current:[current]).map(v=>String(v||'').trim()).filter(Boolean);
  const curOpt=currentVals.filter(v=>!seen.has(v)).map(v=>`<option value="${esc(v)}" label="Current value"></option>`).join('');
  return `<datalist id="${id}">${curOpt}${rows.map(s=>`<option value="${esc(s.name)}" label="${esc((s.role||'Staff')+(isSuper()?' · '+s.store:''))}"></option>`).join('')}</datalist>`;
}
function staffSelectOptions(dept,current,placeholder,opts){
  const rows=dept?staffForDept(dept,opts):staffScopeList(), cur=String(current||'').trim(), seen=new Set(rows.map(s=>s.name));
  const curOpt=cur&&!seen.has(cur)?`<option selected>${esc(cur)}</option>`:'';
  return `<option value="">${esc(placeholder||'— Select staff —')}</option>${curOpt}${rows.map(s=>`<option value="${esc(s.name)}" ${s.name===cur?'selected':''}>${esc(s.name)}${isSuper()?` · ${esc(s.store)}`:''}${s.role?` · ${esc(s.role)}`:''}</option>`).join('')}`;
}
/* Searchable staff picker (type-to-filter via input+datalist). Reads exactly like a
   <select> ($('#id').value). Use everywhere a staff name is chosen. */
function staffPickOptions(dept,opts){ const rows=dept?staffForDept(dept,opts):staffScopeList();
  return rows.map(s=>`<option value="${esc(s.name)}">${isSuper()&&s.store?(s.store+' · '):''}${s.role?esc(s.role):''}</option>`).join(''); }
function staffPick(id,dept,current,placeholder,opts){ opts=opts||{}; const on=opts.onchange?` onchange="${opts.onchange}"`:''; const oi=opts.oninput?` oninput="${opts.oninput}"`:'';
  return `<input id="${id}" class="staff-pick login-input" list="${id}-dl" value="${esc(current||'')}" placeholder="${esc(placeholder||'Search staff…')}" autocomplete="off"${on}${oi}><datalist id="${id}-dl">${staffPickOptions(dept,opts)}</datalist>`; }
function staffPickRefresh(id,dept,opts){ const dl=document.getElementById(id+'-dl'); if(dl) dl.innerHTML=staffPickOptions(dept,opts); }
function staffNamesScoped(dept,opts){ const rows=dept?staffForDept(dept,opts):staffScopeList(); return rows.map(s=>s.name); }
function staffByName(name){ return (DB.staff||[]).find(s=>s.name===name && (isSuper()||s.store===State.branch)) || (DB.staff||[]).find(s=>s.name===name); }
function staffDisplayForDept(dept,current){
  const cur=String(current||'').trim();
  const actual=cur && staffScopeList().some(s=>s.name===cur);
  if(actual || /external|contractor|technician|electrician|plumber|fire contractor/i.test(cur)) return cur;
  const names=staffForDept(dept).slice(0,3).map(s=>s.name);
  return names.length?names.join(', '):(cur||'—');
}
function ckItem(it,i){ return {i,dept:it[0],area:it[1],task:it[2],when:it[3],photo:photoSpec(it[4]),meta:it[5]||{}}; }
function ckStoreOk(r,store){
  const allowed=r&&r.meta&&Array.isArray(r.meta.stores)?r.meta.stores:null;
  if(!allowed||!allowed.length) return true;
  return allowed.includes(store||State.branch);
}
function ckInSession(r,session){
  if(session==='Opening') return r.when==='O'||r.when==='A';
  if(session==='Closing') return r.when==='C'||r.when==='A';
  if(session==='Mid-afternoon') return r.when==='M';
  return false;
}
function ckDeadline(session){
  // Sunday: Opening deadline is 12:00 noon (store opens later on Sundays)
  if(session==='Opening'){ const ds=(State.chk&&State.chk.date)||ckTodayStr(); const d=new Date(ds+'T00:00'); if(d.getDay()===0) return '12:00 PM'; }
  return ((DB.checklist&&DB.checklist.deadlines)||{})[session] || CK_DEADLINE[session] || '';
}
function ckEditDeadline(session){ const v=prompt('Deadline for '+session+' (e.g. 10:30 AM):', ckDeadline(session)); if(v==null) return;
  DB.checklist.deadlines=DB.checklist.deadlines||{}; DB.checklist.deadlines[session]=v.trim(); if(window.persist)window.persist(); renderChecklist(); toast('✓ Deadline updated'); }
/* ---- in-progress checklist DRAFT (survives accidental close / lock / app-switch) ----
   Saved to localStorage per store + day. Only small data (done flags, notes, temp
   objects, photo IDs) — no image blobs — so it stays tiny. Restored on reopen. */
function ckDraftKey(){ return 'mcq_ckdraft_'+(State.branch||'store')+'_'+ckTodayStr(); }
let _ckDraftTimer=null;
function ckWriteDraft(){ try{ if(!State.chk) return; localStorage.setItem(ckDraftKey(), JSON.stringify({state:State.chk.state||{}, resp:State.chk.resp||{}, t:Date.now()})); }catch(e){} }
function ckSaveDraft(){ clearTimeout(_ckDraftTimer); _ckDraftTimer=setTimeout(ckWriteDraft, 500); }   // debounced
function ckRestoreDraft(){ try{
  const raw=localStorage.getItem(ckDraftKey()); if(!raw) return;
  const d=JSON.parse(raw);
  if(d && d.state && Object.keys(d.state).length){
    State.chk.state=d.state; State.chk.resp=d.resp||{};
    try{ Object.values(d.state).forEach(st=>{ ((st&&st.photos)||[]).forEach(id=>{ if(window.MCQDB&&MCQDB.fetchPhoto) MCQDB.fetchPhoto(id); }); }); }catch(e){}
    setTimeout(()=>{ try{ toast('↩ Restored your unsaved checklist for today'); }catch(e){} }, 500);
  }
}catch(e){} }
if(!window._ckDraftHooked){ window._ckDraftHooked=true;
  try{ document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') ckWriteDraft(); }); window.addEventListener('pagehide', ckWriteDraft); }catch(e){}
}
function renderChecklist(){
  const C=DB.checklist; setAccent('#0e9f6e');
  if(!State.chk){ State.chk={session:'Opening',dept:C.depts[0],area:'ALL',state:{},resp:{}}; ckRestoreDraft(); }
  if(State.chk.dept==='ALL' || !C.depts.includes(State.chk.dept)) State.chk.dept=C.depts[0];
  if(!State.chk.area) State.chk.area='ALL';
  if(!State.chk.resp) State.chk.resp={};
  const s=State.chk;
  const today=ckTodayStr(); if(!s.date) s.date=today; const viewing=s.date!==today;
  const reopened=!!(State.chk.reopen && State.chk.reopen[s.dept+'|'+s.session]);
  const submitted=!viewing && !isAdmin() && ckSubmittedFor(s.dept,s.session,today) && !reopened;   // show the Done screen for staff after submit
  setCrumb('✅','Store Operation Checklist',`${isSuper()?'All stores':State.branch} · ${s.session}${viewing?' · '+s.date:''}`);
  const chips=C.depts.map(d=>{ const m=C.deptMeta[d]||{}; const col=m.color||'#0e9f6e';
    return `<button class="dept-chip ${d===s.dept?'active':''}" style="--dc:${col}" ${isAdmin()?`ondblclick="ckDeptHEdit('${ckJS(d)}')" title="Double-click to rename / delete"`:''} onclick="ckDept('${ckJS(d)}')">${m.icon?`<i class="fas ${m.icon}"></i> `:''}${esc(d)}</button>`; }).join('')
    + (isAdmin()?`<button class="dept-chip ghost" onclick="ckAddDept()" title="Add department"><i class="fas fa-plus"></i>&nbsp;Add</button>`:'');
  const areaChips=ckAreaChips();
  $('#content').innerHTML=`
   <div class="page-head"><div class="ph-ic">✅</div>
     <div><h2>Store Operation Checklist</h2><p>Every photo task needs evidence before submit. Temperature checks must be read by AI Vision or marked defrosting.</p></div>
     <div class="ph-actions">${checklistExportMenu()}</div></div>
   <div class="ck-sessionbar card">
     <div class="seg ck-seg">
       <button class="seg-btn ${s.session==='Opening'?'active':''}" onclick="ckSession('Opening')">☀️ Opening</button>
       <button class="seg-btn ${s.session==='Mid-afternoon'?'active':''}" onclick="ckSession('Mid-afternoon')">🌤️ Mid-afternoon</button>
       <button class="seg-btn ${s.session==='Closing'?'active':''}" onclick="ckSession('Closing')">🌙 Closing</button>
     </div>
     <span class="ck-deadline ${s.session==='Opening'?'am':'pm'}">⏰ Deadline <b>${esc(ckDeadline(s.session))}</b>${isAdmin()?` <button class="ck-dl-edit" onclick="ckEditDeadline('${ckJS(s.session)}')" title="Edit deadline">✎</button>`:''}</span>
     ${!viewing && ckDeadlinePassed(s.session) && !ckSubmittedFor(s.dept,s.session,today)?'<span class="ck-overdue">⏰ OVERDUE</span>':''}
     <div class="tb-spacer"></div>
     <div class="filter"><label>Date</label><input type="date" max="${today}" value="${esc(s.date)}" onchange="ckSetDate(this.value)">${viewing?`<button class="btn sm" onclick="ckSetDate('${today}')">Today</button>`:''}</div>
   </div>
   <div class="ck-toolbar"><div class="dept-chips">${chips}</div></div>
   ${areaChips}
   ${viewing?`<div class="ck-build-hint" style="border-color:#bcd; background:#eff6ff; color:#1e40af"><i class="fas fa-clock-rotate-left"></i> Viewing the submitted <b>${esc(s.session)}</b> checklist for <b>${esc(s.date)}</b> (read-only).</div>`:(isAdmin()?`<div class="ck-build-hint"><i class="fas fa-wand-magic-sparkles"></i> <b>Builder mode</b> — double-click a department, section or task to rename / delete · tap <b>+</b> to add</div>`:'')}
   ${(viewing||submitted)?'':`<div class="ck-bulk"><button class="btn sm ghost" onclick="ckAll(true)"><i class="fas fa-check-double"></i>&nbsp; Check all done</button><button class="btn sm ghost" onclick="ckAll(false)"><i class="fas fa-rotate-left"></i>&nbsp; Uncheck all</button></div>`}
   <div id="chk-prog" class="ck-progbar"></div>
   <div id="ck-temp-report"></div>
   <div id="chk-body"></div>
   ${(viewing||submitted)?'':`<div class="ck-submit"><div id="ck-submit-note" class="ck-submit-note"></div>
   <button id="ck-submit-btn" class="btn primary lg" onclick="chkSubmit()">✓ Submit ${s.session} checklist</button></div>`}`;
  if(viewing){ const b=$('#chk-body'); if(b) b.innerHTML=ckPastHTML(); }
  else if(submitted){ const b=$('#chk-body'); if(b) b.innerHTML=ckDoneHTML(s.dept,s.session); }
  else { ckDraw(); ckUpdateSubmitBtn(); }
}
function ckSetDate(v){ State.chk.date=v||ckTodayStr(); State.chk.editing=null; State.chk.editDeptH=null; State.chk.editArea=null; renderChecklist(); }

/* ============================================================ SHARE YOUR THOUGHT (confidential feedback → owner) */
function fbSubmit(){
  const name=($('#fb-name')&&$('#fb-name').value.trim())||'';
  const msg=($('#fb-msg')&&$('#fb-msg').value.trim())||'';
  const anon=$('#fb-anon')&&$('#fb-anon').checked;
  if(!msg){ toast('Please write your message first'); return; }
  const rec={ id:'FB-'+Date.now().toString(36), store:State.branch, name:anon?'(anonymous)':(name||'(unnamed)'),
    role:(State.account&&State.account.role)||'staff', message:msg, ts:new Date().toISOString() };
  DB.feedback=DB.feedback||[]; DB.feedback.unshift(rec);
  if(window.persist) window.persist();
  // also email the owner/office silently if recipients exist (confidential — not shown to store admin)
  try{ if(window.mcqEmail&&mcqEmail.notify) mcqEmail.notify('feedback', `Staff feedback · ${State.branch}`, `From: ${rec.name} (${rec.role})\nStore: ${State.branch}\n\n${msg}`, {}); }catch(e){}
  const c=$('#content'); if(c) c.innerHTML=`<div class="fb-thanks"><div class="fb-thanks-ic">💚</div><h2>Thank you</h2><p>Your message has been sent privately to the owner. It is kept confidential.</p><button class="btn primary" onclick="renderFeedback()">Share another thought</button></div>`;
}
function renderFeedback(){
  setAccent('#7c3aed'); setCrumb('💬', isSuper()?'Feedback Inbox':'Share Your Thought', isSuper()?'Confidential staff feedback · all stores':'Private message to the owner');
  if(isSuper()){
    const list=(DB.feedback||[]).slice().sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
    $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">💬</div><div><h2>Feedback Inbox</h2><p>Confidential messages staff shared directly with you. Only you (owner) can see these.</p></div></div>
      <div class="fb-list">${list.length?list.map(f=>`<div class="fb-card"><div class="fb-card-h"><b>${esc(f.name||'(unnamed)')}</b><span>${esc(f.store||'')} · ${esc((f.ts||'').slice(0,16).replace('T',' '))}</span></div><div class="fb-msg">${esc(f.message||'')}</div></div>`).join(''):'<div class="empty"><div class="e-ic">💬</div>No feedback yet.</div>'}</div>`;
    return;
  }
  const names=(typeof staffNamesScoped==='function')?staffNamesScoped('',{fallbackAll:true}):[];
  $('#content').innerHTML=`<div class="form-shell"><div class="card card-pad fb-form">
      <div class="fb-hero">💬</div>
      <h2>Share your thought</h2>
      <p class="fb-intro">This is your safe space. Share any feedback, idea, concern or complaint <b>directly and privately with the owner</b>. Your store manager will <b>not</b> see this — please speak freely and honestly. Your voice matters. 💚</p>
      <div class="field"><label>Your name (optional)</label>${staffPick('fb-name','', (State.account&&State.account.name)||'', 'Search your name…',{fallbackAll:true})}</div>
      <label class="check-row" style="margin:6px 0 12px"><input type="checkbox" id="fb-anon"> Send anonymously (hide my name)</label>
      <div class="field"><label>Your message</label><textarea id="fb-msg" rows="6" placeholder="Write anything you'd like the owner to know…"></textarea></div>
      <button class="btn primary lg block" onclick="fbSubmit()"><i class="fas fa-paper-plane"></i>&nbsp; Send privately to the owner</button>
      <p class="fb-note">🔒 Confidential — delivered only to the owner.</p>
    </div></div>`;
}

/* ============================================================ CHÚ BA — read-only checklist viewer (all stores) */
function baSetStore(v){ State.ba.store=v; renderBaView(); }
function baSetDate(v){ State.ba.date=v||ckTodayStr(); renderBaView(); }
function baSetSession(v){ State.ba.session=v; renderBaView(); }
function renderBaView(){
  setAccent('#0f766e'); setCrumb('👓','Checklist Results','Read-only · all stores');
  const today=ckTodayStr();
  if(!State.ba) State.ba={store:(DB.stores||[])[0], date:today, session:'All'};
  const b=State.ba;
  const stores=(DB.stores||[]).filter(Boolean);
  if(!stores.includes(b.store)) b.store=stores[0];
  const subs=(DB.checklistSubs||[]).filter(s=>s.store===b.store && s.date===b.date && (b.session==='All'||s.session===b.session))
    .sort((a,b2)=>String(a.dept).localeCompare(String(b2.dept))||String(a.session).localeCompare(String(b2.session)));
  const tot=subs.reduce((n,s)=>n+(s.total||0),0), don=subs.reduce((n,s)=>n+(s.done||0),0);
  const tempBad=subs.reduce((n,s)=>n+((s.items||[]).filter(it=>it.temp&&it.temp.inRange===false).length),0);
  const photoN=subs.reduce((n,s)=>n+((s.items||[]).reduce((m,it)=>m+((it.photos||[]).length),0)),0);
  const storeChips=stores.map(s=>`<button class="ba-store ${s===b.store?'active':''}" onclick="baSetStore('${ckJS(s)}')">${s==='Demo'?'🎬 Demo':esc(s)}</button>`).join('');
  const sessSeg=['All','Opening','Mid-afternoon','Closing'].map(x=>`<button class="seg-btn ${b.session===x?'active':''}" onclick="baSetSession('${x}')">${x==='All'?'All day':esc(x)}</button>`).join('');
  const dm=(DB.checklist&&DB.checklist.deptMeta)||{};
  const cards=subs.map(s=>{
    const meta=dm[s.dept]||{color:'#0f766e'};
    const byArea={}; (s.items||[]).forEach(it=>{(byArea[it.area||'General']=byArea[it.area||'General']||[]).push(it);});
    const areas=Object.entries(byArea).map(([area,items])=>{
      const rows=items.map(it=>{
        const t=it.temp?`<span class="badge ${it.temp.inRange===false?'bad':'ok'}">${it.temp.defrosting?'Defrosting':(it.temp.value!=null?it.temp.value+'°C':'—')}</span>`:'';
        const imgs=(it.photos||[]).map(u=>`<img class="ba-thumb" src="${imgSrc(u)}" onclick="openLightbox('${ckJS(imgSrc(u))}')">`).join('');
        return `<div class="ba-task ${it.done?'done':'todo'}"><span class="ba-check">${it.done?'✓':'○'}</span>
          <div class="ba-main"><div class="ba-name">${esc(it.task)} ${t}</div>${it.note?`<div class="ba-note">📝 ${esc(it.note)}</div>`:''}${imgs?`<div class="ba-thumbs">${imgs}</div>`:''}</div></div>`;
      }).join('');
      return `<div class="ba-area"><div class="ba-area-h">${esc(area)}</div>${rows}</div>`;
    }).join('');
    const out=(s.items||[]).filter(it=>!it.done);
    return `<div class="ba-card" style="--c:${meta.color}"><div class="ba-card-h">
        <div><b>${meta.icon?meta.icon+' ':''}${esc(s.dept)}</b> <span class="badge ${s.session==='Opening'?'warn':'info'}">${esc(s.session)}</span></div>
        <div class="ba-meta">${s.done||0}/${s.total||0} · ${s.progress||0}%${s.verifiedBy?` · ✅ ${esc(s.verifiedBy)}`:''}${s.by?` · 👤 ${esc(s.by)}`:''}</div></div>
      <div class="ba-prog"><i style="width:${s.progress||0}%;background:${meta.color}"></i></div>
      ${areas}
      ${out.length?`<div class="ba-incomplete">⚠️ ${out.length} not completed: ${esc(out.slice(0,6).map(it=>it.task).join(', '))}${out.length>6?'…':''}</div>`:''}
    </div>`;
  }).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">👓</div><div><h2>Checklist Results</h2><p>Live, read-only view of every store's checklists.</p></div></div>
    <div class="ba-storebar">${storeChips}</div>
    <div class="ba-toolbar card">
      <div class="seg ck-seg">${sessSeg}</div>
      <div class="tb-spacer"></div>
      <div class="filter"><label>Date</label><input type="date" max="${today}" value="${esc(b.date)}" onchange="baSetDate(this.value)">${b.date!==today?`<button class="btn sm" onclick="baSetDate('${today}')">Today</button>`:''}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${don}/${tot}</div><div class="k-lbl">Tasks done</div></div>
      <div class="kpi"><div class="k-top"><div class="k-ic">📋</div></div><div class="k-val">${subs.length}</div><div class="k-lbl">Checklists</div></div>
      <div class="kpi tone-${tempBad?'bad':'mute'}"><div class="k-top"><div class="k-ic">🌡️</div></div><div class="k-val">${tempBad}</div><div class="k-lbl">Temp alerts</div></div>
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📷</div></div><div class="k-val">${photoN}</div><div class="k-lbl">Photos</div></div>
    </div>
    <div class="ba-list">${cards||`<div class="empty"><div class="e-ic">📅</div>No checklists submitted for ${esc(b.store)} on ${esc(b.date)}.</div>`}</div>`;
}
function ckSubmittedFor(dept,session,date){ return (DB.checklistSubs||[]).some(x=>(isSuper()||x.store===State.branch)&&x.dept===dept&&x.session===session&&x.date===date); }
function ckPastHTML(){
  const s=State.chk;
  const subs=(DB.checklistSubs||[]).filter(x=>(isSuper()||x.store===State.branch)&&x.dept===s.dept&&x.session===s.session&&x.date===s.date);
  if(!subs.length) return `<div class="empty"><div class="e-ic">📅</div>No ${esc(s.session)} submission for ${esc(s.dept)} on ${esc(s.date)}.</div>`;
  let html='';
  subs.forEach(rec=>{
    html+=`<div class="ck-dept"><div class="ck-dept-h"><span class="chk-dot" style="background:#0e9f6e"></span>${esc(rec.store)} · ${esc(rec.dept)} · ${esc(rec.session)}<span class="ck-dept-n">${rec.done||0}/${rec.total||0} · ${rec.progress||0}%</span></div>
      <div class="ck-resp-card" style="margin:6px 0 4px"><span class="badge ${rec.status==='Verified'?'ok':'warn'}">${esc(rec.status||'Submitted')}</span>${rec.by?' · by '+esc(rec.by):''}${rec.verifiedBy?' · verified by '+esc(rec.verifiedBy):''}${rec.verifyNote?`<div style="margin-top:6px;color:#64748b">📝 ${esc(rec.verifyNote)}</div>`:''}</div>`;
    const byArea={}; (rec.items||[]).forEach(it=>{(byArea[it.area||'General']=byArea[it.area||'General']||[]).push(it);});
    Object.entries(byArea).forEach(([area,items])=>{
      html+=`<div class="ck-area-h">${esc(area)}</div>`;
      items.forEach(it=>{
        const imgs=(it.photos||[]).map(u=>`<img class="ck-slot-img" src="${imgSrc(u)}" style="height:64px;border-radius:8px;margin:2px">`).join('');
        const t=it.temp?`<span class="badge ${it.temp.inRange===false?'bad':'ok'}">${it.temp.defrosting?'Defrosting':(it.temp.value!=null?it.temp.value+'°C':'')}</span>`:'';
        html+=`<div class="ck-task ${it.done?'done':''}"><button class="ck-check" disabled>${it.done?'✓':''}</button><div class="ck-main"><div class="ck-name">${esc(it.task)} ${t}</div>${it.note?`<div style="color:#64748b;font-size:12px">📝 ${esc(it.note)}</div>`:''}${imgs?`<div class="ck-slots">${imgs}</div>`:''}</div></div>`;
      });
    });
    html+=`</div>`;
  });
  return html;
}
function ckReopen(dept,session){ State.chk.reopen=State.chk.reopen||{}; State.chk.reopen[dept+'|'+session]=1; renderChecklist(); }
function ckDoneHTML(dept,session){
  const subs=(DB.checklistSubs||[]).filter(x=>x.store===State.branch&&x.dept===dept&&x.session===session&&x.date===ckTodayStr());
  const s=subs[0]||{done:0,total:0,progress:0};
  const out=(s.items||[]).filter(it=>!it.done);
  return `<div class="ck-done">
      <div class="ck-done-ring"><svg viewBox="0 0 52 52"><circle class="cs-circle" cx="26" cy="26" r="24"/><path class="cs-check" d="M14.5 27l7.5 7.5 16-16.5"/></svg></div>
      <h3>${esc(dept)} · ${esc(session)} — Submitted ✓</h3>
      <p>${s.done||0}/${s.total||0} done · ${s.progress||0}%${s.by?` · by ${esc(s.by)}`:''}${s.status==='Verified'?' · ✅ Verified':''}</p>
      ${out.length?`<div class="ck-done-out">⚠️ ${out.length} not completed: ${esc(out.slice(0,8).map(it=>it.task).join(', '))}${out.length>8?'…':''}</div>`:'<div class="ck-done-ok">All tasks completed. Great work! 🎉</div>'}
      <div class="ck-done-actions">
        <button class="btn" onclick="ckReopen('${ckJS(dept)}','${ckJS(session)}')"><i class="fas fa-pen"></i>&nbsp; Re-open to edit</button>
        <button class="btn primary" onclick="ckSharePDF('${ckJS(session)}')"><i class="fab fa-whatsapp"></i>&nbsp; Share PDF</button>
      </div>
    </div>
    <div class="ck-done-summary">${ckPastHTML()}</div>`;
}
function ckRows(ignoreArea){
  const s=State.chk;
  return DB.checklist.items.map(ckItem)
    .filter(r=>ckStoreOk(r) && (s.dept==='ALL'||r.dept===s.dept) && ckInSession(r,s.session) && (ignoreArea||s.area==='ALL'||r.area===s.area));
}
function ckList(){
  return ckRows(false);
}
function ckAreaChips(){
  const s=State.chk, admin=isAdmin();
  const areas=[...new Set(ckRows(true).map(r=>r.area))];
  if(!admin){ s.area='ALL'; return ''; }   // staff: ONE long list per department — sections shown as headings, submit once
  if(areas.length>1 && !areas.includes(s.area)) s.area=areas[0];
  if(areas.length<=1) s.area='ALL';
  const chips=areas.map(a=>{ const done=ckAreaDone(a); return `<button class="area-chip ${a===s.area?'active':''} ${done?'sec-ok':'sec-pending'}" ${admin?`ondblclick="ckSectionEdit('${ckJS(s.dept)}','${ckJS(a)}')" title="Double-click to rename / delete"`:''} onclick="ckArea('${ckJS(a)}')">${done?'✓ ':'○ '}${esc(a)}</button>`; }).join('')
    + (admin?`<button class="area-chip ghost" onclick="ckAddSection('${ckJS(s.dept)}')" title="Add a section"><i class="fas fa-plus"></i>&nbsp;Section</button>`:'');
  return `<div class="ck-subtoolbar"><span>Sections</span><div class="area-chips">${chips}</div>${admin?'<span class="ck-sub-hint">double-click a section to rename / delete</span>':''}</div>`;
}
function ckCurrentArea(){
  const areas=[...new Set(ckRows(true).map(r=>r.area))];
  if(State.chk.area&&State.chk.area!=='ALL') return State.chk.area;
  return areas[0]||'General';
}
function ckAdminTools(){
  const dept=State.chk.dept, area=ckCurrentArea();
  return `<div class="ck-adminbar card">
    <div class="ck-admin-copy"><b>Checklist Builder</b><span>Edit this department template. Changes are saved into the current store workspace.</span></div>
    <button class="btn sm" onclick="ckAddDept()"><i class="fas fa-plus-circle"></i> Add department</button>
    <button class="btn sm" onclick="ckRenameDept('${ckJS(dept)}')"><i class="fas fa-tag"></i> Rename department</button>
    <button class="btn sm" onclick="ckAddSection('${ckJS(dept)}')"><i class="fas fa-layer-group"></i> Add section</button>
    <button class="btn sm" onclick="ckRenameSection('${ckJS(dept)}','${ckJS(area)}')"><i class="fas fa-pen"></i> Rename section</button>
    <button class="btn sm primary" onclick="ckAddTask('${ckJS(dept)}','${ckJS(area)}')"><i class="fas fa-plus"></i> Add task</button>
  </div>`;
}
function ckDraw(){
  const rows=ckList(),C=DB.checklist,groups={};
  rows.forEach(r=>{(groups[r.dept]=groups[r.dept]||{})[r.area]=(groups[r.dept][r.area]||[]);groups[r.dept][r.area].push(r);});
  let html='';
  Object.entries(groups).forEach(([dept,areas])=>{
    const dm=C.deptMeta[dept]||{};
    if(isAdmin() && State.chk.editDeptH===dept){
      html+=`<div class="ck-dept"><div class="ck-dept-h ck-head-edit" style="--dc:${dm.color}">
        <input id="ckh-dept" class="ck-head-input" value="${esc(dept)}" onkeydown="if(event.key==='Enter')ckSaveDeptH('${ckJS(dept)}');if(event.key==='Escape')ckCancelHeads()">
        <button class="mini good" onclick="ckSaveDeptH('${ckJS(dept)}')"><i class="fas fa-check"></i></button>
        <button class="mini" onclick="ckCancelHeads()">Cancel</button>
        <button class="mini ck-del" onclick="ckDelDept('${ckJS(dept)}')"><i class="fas fa-trash"></i> Delete dept</button></div>`;
    }else{
      html+=`<div class="ck-dept"><div class="ck-dept-h" style="--dc:${dm.color}" ${isAdmin()?`ondblclick="ckDeptHEdit('${ckJS(dept)}')" title="Double-click to rename / delete"`:''}>${dm.icon?`<i class="fas ${dm.icon}" style="color:${dm.color};margin-right:7px"></i>`:`<span class="chk-dot" style="background:${dm.color}"></span>`}${esc(dept)}<span class="ck-dept-n">${Object.values(areas).flat().length} tasks</span></div>`;
    }
    html+=ckRespHTML(dept);
    Object.entries(areas).forEach(([area,items])=>{
      if(isAdmin() && State.chk.editArea===dept+'::'+area){
        html+=`<div class="ck-area-h ck-head-edit">
          <input id="ckh-area" class="ck-head-input sm" value="${esc(area)}" onkeydown="if(event.key==='Enter')ckSaveSection('${ckJS(dept)}','${ckJS(area)}');if(event.key==='Escape')ckCancelHeads()">
          <button class="mini good" onclick="ckSaveSection('${ckJS(dept)}','${ckJS(area)}')"><i class="fas fa-check"></i></button>
          <button class="mini" onclick="ckCancelHeads()">Cancel</button>
          <button class="mini ck-del" onclick="ckDelSection('${ckJS(dept)}','${ckJS(area)}')"><i class="fas fa-trash"></i> Delete section</button></div>`;
      }else{
        const aOk=items.filter(r=>!ckTaskIssue(r,State.chk.state[r.i])).length, aTot=items.length, aDone=aOk===aTot;
        html+=`<div class="ck-area-h" ${isAdmin()?`ondblclick="ckSectionEdit('${ckJS(dept)}','${ckJS(area)}')" title="Double-click to rename / delete"`:''}>${esc(area)}<span class="ck-sec-badge ${aDone?'ok':'pending'}">${aDone?'✓ ':''}${aOk}/${aTot}</span></div>`;
      }
      items.forEach(r=>{ const st=State.chk.state[r.i]||{}; const done=st.done;
        if(isAdmin() && State.chk.editing===r.i){
          const pm = r.photo ? (r.photo.req ? {mode:'R',min:r.photo.min,max:r.photo.max} : {mode:'O',min:0,max:(r.photo.max||5)}) : {mode:'0',min:1,max:5};
          html+=`<div class="ck-task editing" id="ck-row-${r.i}"><div class="ck-edit">
            <input id="cke-task" class="ck-edit-name" value="${esc(r.task)}" placeholder="Task description">
            <div class="ck-edit-row">
              <select id="cke-when"><option value="O" ${r.when==='O'?'selected':''}>☀️ Opening</option><option value="M" ${r.when==='M'?'selected':''}>🌤️ Mid-afternoon</option><option value="C" ${r.when==='C'?'selected':''}>🌙 Closing</option><option value="A" ${r.when==='A'?'selected':''}>All day</option></select>
              <select id="cke-photo"><option value="0" ${pm.mode==='0'?'selected':''}>No photo</option><option value="O" ${pm.mode==='O'?'selected':''}>📷 Photo optional</option><option value="R" ${pm.mode==='R'?'selected':''}>📷 Photo required</option></select>
              <label class="cke-num">min <input id="cke-pmin" type="number" min="0" max="10" value="${pm.min}"></label>
              <label class="cke-num">max <input id="cke-pmax" type="number" min="1" max="10" value="${pm.max}"></label>
              <button class="btn sm primary" onclick="ckSaveTask(${r.i})">💾 Save</button>
              <button class="btn sm" onclick="ckCancelEdit()">Cancel</button>
              <button class="btn sm ck-del" onclick="ckDelTask(${r.i})"><i class="fas fa-trash"></i></button>
            </div></div></div>`;
          return;
        }
        let photoHtml='';
        if(r.photo){
          if(r.meta.temp && st.defrosting){
            photoHtml=`<div class="ck-photos locked"><div class="ck-photos-h"><span class="ev-chip ev-opt">Defrosting</span><span class="ck-lock">Photo capture locked while defrosting</span></div></div>`;
          }else{
            const need=r.photo.req?r.photo.min:1, have=(st.photos||[]).length;
            const cap=r.meta.temp?(r.photo.max||1):Math.max(r.photo.max||5,5);   // allow up to 5 photos for normal tasks
            let slots=(st.photos||[]).map(u=>`<span class="ck-slot filled"><img class="ck-slot-img" src="${imgSrc(u)}"><span class="ck-rm" onclick="ckRmPhoto(event,${r.i},'${u}')">✕</span></span>`).join('');
            if(have<cap) slots+=`<label class="ck-slot"><input type="file" accept="image/*" capture="environment" onchange="ckPhoto(this,${r.i})"><span class="ck-slot-empty">📷<small>${r.meta.temp?'AI read':'Photo'}</small></span></label>`;
            photoHtml=`<div class="ck-photos" id="ck-photo-${r.i}"><div class="ck-photos-h">${photoChip(r.photo)} <span class="ck-pc ${have>=need?'ok':''}">${have}/${need}</span></div><div class="ck-slots">${slots}</div></div>`;
          }
        }
        html+=`<div class="ck-task ${done?'done':''}" id="ck-row-${r.i}" ${isAdmin()?`ondblclick="ckEditTask(${r.i})" title="Double-click to edit / delete"`:''}>
          <button class="ck-check" onclick="ckTick(${r.i})">${done?'✓':''}</button>
          <div class="ck-main"><div class="ck-name">${esc(r.task)}</div>
            ${r.meta.temp?ckTempBox(r,st):''}
            <div class="ck-note-row"><input class="ck-note" placeholder="Add note / reason…" value="${esc(st.note||'')}" oninput="ckNote(${r.i},this.value)">${photoHtml}</div></div></div>`;
      });
      if(isAdmin()) html+=`<button class="ck-add-ghost" onclick="ckAddTask('${ckJS(dept)}','${ckJS(area)}')"><i class="fas fa-plus"></i> Add task</button>`;
    });
    html+=`</div>`;
  });
  $('#chk-body').innerHTML=html||(isAdmin()
    ? `<div class="empty"><div class="e-ic">📝</div>No ${esc(State.chk.session)} tasks in ${esc(State.chk.dept)} yet.
        <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" onclick="ckAddTask('${ckJS(State.chk.dept)}','${ckJS(ckCurrentArea())}')"><i class="fas fa-plus"></i>&nbsp; Add task</button>
          <button class="btn" onclick="ckAddSection('${ckJS(State.chk.dept)}')"><i class="fas fa-layer-group"></i>&nbsp; Add section</button>
        </div></div>`
    : '<div class="empty"><div class="e-ic">✅</div>No tasks for this filter.</div>');
  const report=$('#ck-temp-report'); if(report) report.innerHTML=(State.chk.dept==='MANAGER')?ckTempReportHTML():'';
  ckProgress();
}
function ckRespId(dept,field){ return 'ck-resp-'+field+'-'+String(dept).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function ckRespHTML(dept){
  State.chk.resp=State.chk.resp||{};
  const rec=(State.chk.resp[dept]=State.chk.resp[dept]||{p1:'',p2:'',submittedBy:''});
  const listId=ckRespId(dept,'staff-list');
  const field=(key,label,required)=>`<label class="ck-resp-field"><span>${esc(label)}${required?' <b>*</b>':''}</span><input id="${ckRespId(dept,key)}" list="${listId}" value="${esc(rec[key]||'')}" placeholder="Select ${esc(dept)} staff" oninput="ckResp('${ckJS(dept)}','${key}',this.value)"></label>`;
  return `<div class="ck-resp-card" id="${ckRespId(dept,'card')}">
    ${staffDataList(listId,dept,[rec.p1,rec.p2,rec.submittedBy])}
    ${field('p1','Responsible Person 1',true)}
    ${field('p2','Responsible Person 2',false)}
    ${field('submittedBy','Submitted by',true)}
  </div>`;
}
function ckResp(dept,field,value){
  State.chk.resp=State.chk.resp||{};
  State.chk.resp[dept]=State.chk.resp[dept]||{p1:'',p2:'',submittedBy:''};
  State.chk.resp[dept][field]=value;
  const el=document.getElementById(ckRespId(dept,field));
  if(el&&value.trim()) el.classList.remove('invalid');
  ckSaveDraft();
}
function ckProgress(){
  const rows=ckList(); let done=0,total=rows.length,preq=0,pdone=0,tok=0,tbad=0,tscan=0;
  rows.forEach(r=>{
    const st=State.chk.state[r.i]||{}; if(st.done)done++;
    const skipPhoto=r.meta.temp&&st.defrosting;
    if(r.photo&&!skipPhoto){preq++; if((st.photos||[]).length>=1)pdone++;}
    if(r.meta.temp&&st.temp){ if(st.temp.inRange) tok++; else tbad++; }
    if(r.meta.temp&&st.aiStatus==='scanning') tscan++;
  });
  const pct=total?Math.round(done/total*100):0;
  const hasTemp=rows.some(r=>r.meta&&r.meta.temp);
  const el=$('#chk-prog'); if(el) el.innerHTML=`<span class="count-chip">✅ ${done}/${total} done</span><span class="count-chip">📷 ${pdone}/${preq} photo tasks</span>
    ${hasTemp?`<span class="count-chip temp-ok">🌡️ ${tok} in range</span><span class="count-chip temp-bad">⚠️ ${tbad} out</span><span class="count-chip temp-scan">AI ${tscan} scanning</span>`:''}
    <span class="pwrap" style="flex:1;min-width:160px"><span class="pbar" style="flex:1"><i style="width:${pct}%"></i></span><b>${pct}%</b></span>`;
  ckUpdateSubmitBtn();
}
/* ---- completeness gate: a task is "done OR has a reason note"; photo/temp still required when ticked ---- */
function ckTaskIssue(r,st){
  st=st||{};
  if(st.done){
    if(r.meta&&r.meta.temp && !st.defrosting && (!st.temp || st.aiStatus==='scanning')) return 'temperature not recorded yet';
    // temperature tasks: photo is OPTIONAL (a manual °C entry is enough); other photo tasks still need a photo
    if(r.photo && !(r.meta&&r.meta.temp) && (st.photos||[]).length<1) return 'photo missing';
    return null;   // satisfied
  }
  if(String(st.note||'').trim()) return null;   // not done but a reason was written → OK
  return 'not done — tick it, or write a reason in the note';
}
// evaluate ALL sections in the current department+session (not just the visible area)
function ckGate(){
  const rows=ckRows(true), areas={};
  rows.forEach(r=>{ (areas[r.area]=areas[r.area]||[]).push(r); });
  const sections=[]; let firstPending=null;
  Object.entries(areas).forEach(([area,items])=>{
    let ok=0; const issues=[];
    items.forEach(r=>{ const st=State.chk.state[r.i]||{}; const why=ckTaskIssue(r,st);
      if(!why) ok++; else { issues.push({i:r.i,task:r.task,why}); if(firstPending==null) firstPending=r.i; } });
    sections.push({area, total:items.length, ok, complete:ok===items.length, issues});
  });
  const resp=(State.chk.resp||{})[State.chk.dept]||{};
  const respOk=!!(String(resp.p1||'').trim() && String(resp.submittedBy||'').trim());
  const incompleteSections=sections.filter(s=>!s.complete).map(s=>s.area);
  return {sections, incompleteSections, respOk, firstPending, complete: incompleteSections.length===0 && respOk};
}
function ckAreaDone(area){ const rows=ckRows(true).filter(r=>r.area===area); return rows.length>0 && rows.every(r=>!ckTaskIssue(r,State.chk.state[r.i])); }
function ckUpdateSubmitBtn(){
  const btn=document.getElementById('ck-submit-btn'); if(!btn) return;
  const note=document.getElementById('ck-submit-note');
  const g=ckGate();
  btn.innerHTML=`✓ Submit ${esc(State.chk.session)} checklist`;   // label stays "Submit" — just greys out when locked
  if(g.complete){
    btn.className='btn primary lg';
    if(note){ note.className='ck-submit-note ready'; note.innerHTML='✓ All sections complete — ready to submit'; }
  }else{
    btn.className='btn lg ck-locked';
    const left=[]; if(g.incompleteSections.length) left.push(...g.incompleteSections); if(!g.respOk) left.push('Responsible Person');
    if(note){ note.className='ck-submit-note pending'; note.innerHTML=`<b>${left.length}</b> to finish before submitting — <span>${esc(left.join(', '))}</span>`; }
  }
}
function ckTick(i){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  const r=ckItem(DB.checklist.items[i],i);
  const ps=r.photo;
  const skipPhoto=r.meta.temp&&st.defrosting;
  if(!st.done && r.meta.temp && !st.defrosting && st.aiStatus==='scanning'){
    toast('AI Vision is still reading the temperature');
    return;
  }
  if(!st.done && r.meta.temp && !st.defrosting && !st.temp){
    toast('Enter a temperature (type it or take a photo) first');
    return;
  }
  // non-temperature photo tasks still need a photo before ticking done
  if(!st.done && ps && !r.meta.temp && (st.photos||[]).length<1){
    toast('📷 Attach at least 1 photo before marking this done');
    const row=document.getElementById('ck-row-'+i); const pe=row&&row.querySelector('.ck-photos');
    if(pe){ pe.classList.add('invalid','shake'); setTimeout(()=>pe.classList.remove('shake','invalid'),1400); }
    return;
  }
  st.done=!st.done; const row=document.getElementById('ck-row-'+i);
  if(row){row.classList.toggle('done',st.done);row.querySelector('.ck-check').textContent=st.done?'✓':'';}
  ckProgress(); ckSaveDraft();
}
function ckNote(i,v){const st=State.chk.state[i]=State.chk.state[i]||{};st.note=v;ckSaveDraft();ckUpdateSubmitBtn();}
async function ckPhoto(input,i){
  const f=input.files&&input.files[0]; if(!f)return;
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(r.meta.temp&&st.defrosting){ input.value=''; toast('Defrosting is ticked, so photo capture is locked'); return; }
  st.photos=st.photos||[];
  const preview=URL.createObjectURL(f);     // show the photo INSTANTLY (no wait for compression)
  st.photos.push(preview);
  if(r.meta.temp){ st.aiStatus='scanning'; st.aiError=''; st.aiSuggestion=null; st.aiManualAllowed=false; st.temp=null; st.done=false; ckDraw();
    setTimeout(()=>ckAiTemp(i,f.name,f),250);
  }else{ ckDraw(); }
  // compress + persist in the background, then swap the preview for the stored ref
  try{
    const d=await compressImage(f);
    const ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d;
    const idx=(st.photos||[]).indexOf(preview);
    if(idx>=0){ st.photos[idx]=ref; try{URL.revokeObjectURL(preview);}catch(e){} ckSaveDraft(); if(!r.meta.temp) ckDraw(); }
  }catch(e){ /* keep the instant objectURL preview if compression fails */ }
}
function ckRmPhoto(e,i,url){
  e.preventDefault(); e.stopPropagation();
  const st=State.chk.state[i], r=ckItem(DB.checklist.items[i],i);
  if(st&&st.photos){st.photos=st.photos.filter(u=>u!==url); if(r.meta.temp&&!st.photos.length){st.temp=null;st.aiStatus=null;st.aiError='';st.aiSuggestion=null;st.aiManualAllowed=false;st.done=false;} ckDraw(); ckSaveDraft();}
}
function ckSession(v){State.chk.session=v;State.chk.area='ALL';renderChecklist();}
function ckDept(d){State.chk.dept=d;State.chk.area='ALL';renderChecklist();}
/* ---- admin checklist CRUD (add / edit / delete task) ---- */
function ckPersistTemplate(){ if(window.persist) window.persist(); }
function ckEditTask(i){ State.chk.editing=i; renderChecklist(); }
function ckCancelEdit(){ State.chk.editing=null; renderChecklist(); }
function ckSaveTask(i){
  const it=DB.checklist.items[i]; if(!it) return;
  const name=(document.getElementById('cke-task')?.value||'').trim(); if(name) it[2]=name;
  const w=document.getElementById('cke-when')?.value; if(w) it[3]=w;
  const mode=document.getElementById('cke-photo')?.value;
  let pmin=parseInt(document.getElementById('cke-pmin')?.value,10); if(isNaN(pmin))pmin=1;
  let pmax=parseInt(document.getElementById('cke-pmax')?.value,10); if(isNaN(pmax))pmax=Math.max(1,pmin);
  if(mode==='R'){ pmin=Math.max(1,pmin); pmax=Math.max(pmax,pmin); it[4]='R'+pmin+'-'+pmax; }
  else if(mode==='O'){ it[4]= pmax>0 ? ('O'+pmax) : 'O'; }
  else it[4]=0;
  State.chk.editing=null; ckPersistTemplate(); renderChecklist(); toast('✓ Task saved');
}
// map the active session to the task's "when" code so a task added while viewing
// Mid-afternoon actually shows under Mid-afternoon (was always falling back to 'C').
function ckSessionWhen(session){ return session==='Mid-afternoon'?'M':(session==='Closing'?'C':'O'); }
function ckAddTask(dept,area){
  const when=ckSessionWhen(State.chk.session);
  DB.checklist.items.push([dept,area,'NEW TASK',when,0]);
  State.chk.editing=DB.checklist.items.length-1;
  if(State.chk.dept!=='ALL' && State.chk.dept!==dept) State.chk.dept=dept;
  State.chk.area=area;
  ckPersistTemplate();
  renderChecklist();
}
function ckAddSection(dept){
  const area=(prompt('New section name:')||'').trim();
  if(!area) return;
  const when=ckSessionWhen(State.chk.session);
  DB.checklist.items.push([dept,area,'NEW TASK',when,0]);
  State.chk.editing=DB.checklist.items.length-1;
  State.chk.dept=dept;
  State.chk.area=area;
  ckPersistTemplate();
  renderChecklist();
  toast('✓ Section added');
}
function ckAddDept(){
  const name=(prompt('New department name:')||'').trim();
  if(!name) return;
  DB.checklist.depts=DB.checklist.depts||[];
  if(DB.checklist.depts.includes(name)){ State.chk.dept=name; State.chk.area='ALL'; renderChecklist(); toast('That department already exists'); return; }
  DB.checklist.depts.push(name);
  DB.checklist.deptMeta=DB.checklist.deptMeta||{};
  const palette=['#0e9f6e','#0891b2','#6366f1','#ec4899','#f59e0b','#ef4444','#14b8a6','#8b5cf6'];
  DB.checklist.deptMeta[name]={color:palette[(DB.checklist.depts.length-1)%palette.length],icon:'fa-store'};
  DB.checklist.items.push([name,'General','NEW TASK',ckSessionWhen(State.chk.session),0]);
  State.chk.dept=name; State.chk.area='General'; State.chk.editing=DB.checklist.items.length-1;
  ckPersistTemplate();
  renderChecklist();
  toast('✓ Department added — edit the first task');
}
function doRenameDept(dept,name){
  name=(name||'').trim();
  if(!name||name===dept) return false;
  if((DB.checklist.depts||[]).includes(name)){ toast('A department with that name already exists'); return false; }
  DB.checklist.items.forEach(it=>{ if(it[0]===dept) it[0]=name; });
  DB.checklist.depts=(DB.checklist.depts||[]).map(d=>d===dept?name:d);
  if(DB.checklist.deptMeta&&DB.checklist.deptMeta[dept]&&!DB.checklist.deptMeta[name]){
    DB.checklist.deptMeta[name]=DB.checklist.deptMeta[dept]; delete DB.checklist.deptMeta[dept];
  }
  if(DB.checklistEmailRoutes&&DB.checklistEmailRoutes[dept]&&!DB.checklistEmailRoutes[name]){
    DB.checklistEmailRoutes[name]=DB.checklistEmailRoutes[dept]; delete DB.checklistEmailRoutes[dept];
  }
  if(State.chk.dept===dept) State.chk.dept=name;
  return true;
}
/* ---- inline header editing (double-click) ---- */
function ckCancelHeads(){ State.chk.editDeptH=null; State.chk.editArea=null; ckDraw(); }
function ckDeptHEdit(dept){ State.chk.dept=dept; State.chk.editDeptH=dept; State.chk.editArea=null; State.chk.editing=null; renderChecklist(); setTimeout(()=>{const el=document.getElementById('ckh-dept'); if(el){el.focus();el.select();}},30); }
function ckSaveDeptH(dept){ const v=(document.getElementById('ckh-dept')||{}).value||''; State.chk.editDeptH=null; if(doRenameDept(dept,v)){ ckPersistTemplate(); toast('✓ Department renamed'); } renderChecklist(); }
function ckDelDept(dept){
  if(!confirm(`Delete the entire "${dept}" department and ALL its sections & tasks?`)) return;
  DB.checklist.items=DB.checklist.items.filter(it=>it[0]!==dept);
  DB.checklist.depts=(DB.checklist.depts||[]).filter(d=>d!==dept);
  if(DB.checklist.deptMeta) delete DB.checklist.deptMeta[dept];
  State.chk.state={}; State.chk.editDeptH=null; State.chk.editing=null;
  State.chk.dept=(DB.checklist.depts||[])[0]||''; State.chk.area='ALL';
  ckPersistTemplate(); renderChecklist(); toast('🗑 Department deleted');
}
function ckSectionEdit(dept,area){ State.chk.dept=dept; State.chk.area=area; State.chk.editArea=dept+'::'+area; State.chk.editDeptH=null; State.chk.editing=null; renderChecklist(); setTimeout(()=>{const el=document.getElementById('ckh-area'); if(el){el.focus();el.select();}},40); }
function ckSaveSection(dept,area){ const v=((document.getElementById('ckh-area')||{}).value||'').trim(); State.chk.editArea=null;
  if(v&&v!==area){ DB.checklist.items.forEach(it=>{ if(it[0]===dept&&it[1]===area) it[1]=v; }); if(State.chk.area===area) State.chk.area=v; ckPersistTemplate(); toast('✓ Section renamed'); }
  renderChecklist(); }
function ckDelSection(dept,area){
  if(!confirm(`Delete the "${area}" section in ${dept} and ALL its tasks?`)) return;
  DB.checklist.items=DB.checklist.items.filter(it=>!(it[0]===dept&&it[1]===area));
  State.chk.state={};          // item indexes shifted — clear in-progress ticks for a clean re-render
  State.chk.editing=null; State.chk.area='ALL';
  ckPersistTemplate(); renderChecklist(); toast('🗑 Section deleted');
}
function ckRenameSection(dept,area){
  const name=(prompt('Rename section:',area)||'').trim();
  if(!name||name===area) return;
  DB.checklist.items.forEach(it=>{ if(it[0]===dept&&it[1]===area) it[1]=name; });
  if(State.chk.area===area) State.chk.area=name;
  ckPersistTemplate();
  renderChecklist();
  toast('✓ Section renamed');
}
function ckDelTask(i){
  if(!confirm('Delete this checklist task permanently?')) return;
  DB.checklist.items.splice(i,1);
  const ns={}; Object.entries(State.chk.state||{}).forEach(([k,v])=>{k=+k; if(k===i)return; ns[k>i?k-1:k]=v;});
  State.chk.state=ns;
  if(State.chk.editing===i) State.chk.editing=null; else if(State.chk.editing>i) State.chk.editing--;
  ckPersistTemplate(); renderChecklist(); toast('🗑 Task deleted');
}
function ckArea(a){State.chk.area=a;renderChecklist();}
function ckAll(v){ckList().forEach(r=>{const st=State.chk.state[r.i]=State.chk.state[r.i]||{};st.done=v;});ckDraw();ckSaveDraft();}
function ckDefrost(i,on){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  st.defrosting=on; st.aiStatus=null; st.temp=null; st.aiError=''; st.aiSuggestion=null; st.aiManualAllowed=false;
  if(on){ st.photos=[]; st.done=true; ckRecordTemp(i,{defrosting:true,inRange:true,value:null}); }
  else st.done=false;
  ckDraw(); ckSaveDraft();
  toast(on?'Defrosting marked; photo capture locked':'Defrosting removed; photo required again');
}
function ckTempRange(type){ return (DB.checklist.tempRanges||{})[type]||{label:type,max:5,text:'<= 5 C'}; }
function ckTempInRange(v,type){
  const r=ckTempRange(type);
  if(typeof r.min==='number' && v<r.min) return false;
  if(typeof r.max==='number' && v>r.max) return false;
  return true;
}
async function ckAiTemp(i,fileName,file){
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(!r.meta.temp||st.defrosting) return;
  const result=await ckVisionValue(fileName,file,r,i);
  if(!result||result.error||!Number.isFinite(result.value)){
    const suggestion=Number(result&&result.suggestedValue);
    st.aiStatus=Number.isFinite(suggestion)?'confirm':'error';
    st.aiError=result&&result.message?result.message:'AI Vision could not read the temperature clearly. Retake a closer, brighter photo of only the display.';
    st.aiQuality=result&&result.quality?result.quality:null;
    st.aiSuggestion=Number.isFinite(suggestion)?{value:suggestion,confidence:result.confidence||null,source:result.source||'AI Vision OCR',text:result.text||'',rawReading:result.rawReading||result.text||''}:null;
    st.aiManualAllowed=true;   // always let the user type/confirm the value, even if AI couldn't read it
    st.temp=null;
    st.done=false;
    ckDraw();
    toast(st.aiError);
    return;
  }
  // Food-safety policy: AI fills the best reading, but a manager/staff member
  // confirms or edits it before saving. Ambiguous decimal/minus cases are already
  // routed through the same confirm UI with a safer suggested value.
  st.aiStatus='confirm';
  st.aiError=ckTempConfirmMessage(result,r.meta.type);
  st.aiSuggestion={value:result.value,confidence:result.confidence||null,source:result.source||'AI Vision',text:result.text||'',rawReading:result.rawReading||result.text||''};
  st.aiManualAllowed=true; st.aiQuality=result.quality||null; st.temp=null; st.done=false;
  ckDraw(); toast(st.aiError);
}
function ckTempConfirmMessage(result,type){
  if(result&&result.message) return result.message;
  const value=Number(result&&result.value);
  const raw=String((result&&result.rawReading)||(result&&result.text)||'').trim();
  const range=ckTempRange(type).text;
  const rawLine=raw?` Raw display: "${raw}".`:'';
  return Number.isFinite(value)
    ? `AI Vision read ${value.toFixed(1)} C.${rawLine} Confirm or edit before saving. Safe range: ${range}.`
    : `AI Vision needs confirmation. Confirm or retake a closer photo. Safe range: ${range}.`;
}
function ckSaveTempReading(i,value,result,manual){
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  const tempValue=Number(value), inRange=ckTempInRange(tempValue,r.meta.type);
  st.aiStatus='done';
  st.aiError='';
  st.aiSuggestion=null;
  st.aiManualAllowed=false;
  st.done=true;
  st.temp={value:tempValue,inRange,type:r.meta.type,range:ckTempRange(r.meta.type).text,source:result.source||'AI Vision OCR',ocrText:result.text||'',confidence:result.confidence||null,quality:result.quality||null,manual:!!manual,confirmedBy:manual?ckTempConfirmer():'',suggestedValue:result.suggestedValue??null,rawReading:result.rawReading||result.text||'',at:new Date().toISOString()};
  ckRecordTemp(i,st.temp);
  if(!inRange) ckQueueTempAlert(i,st.temp);
  ckDraw(); ckSaveDraft();
  const label=manual?'Manager confirmed':'AI Vision saved';
  toast(inRange?`${label} ${tempValue.toFixed(1)} C · in range`:`${label} ${tempValue.toFixed(1)} C · Gmail alert queued`);
}
function ckTempConfirmer(){
  const resp=(State.chk&&State.chk.resp&&State.chk.resp[State.chk.dept])||{};
  return resp.submittedBy||resp.p1||State.user?.name||State.role||'Manager';
}
function ckManualTemp(i){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  const input=document.getElementById(`ck-temp-manual-${i}`);
  const raw=(input&&input.value.trim())||(st.aiSuggestion&&String(st.aiSuggestion.value))||'';
  const value=Number(String(raw).replace(',','.'));
  if(!Number.isFinite(value)||value<=-45||value>=35){ toast('Enter a valid temperature between -45 C and 35 C'); return; }
  ckSaveTempReading(i,value,{value,source:'Manager confirmed',text:st.aiSuggestion?.text||'',confidence:st.aiSuggestion?.confidence||null,quality:st.aiQuality||null,suggestedValue:st.aiSuggestion?.value??null,rawReading:st.aiSuggestion?.rawReading||st.aiSuggestion?.text||''},true);
}
function ckRetakeTemp(i){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  st.photos=[]; st.temp=null; st.aiStatus=null; st.aiError=''; st.aiSuggestion=null; st.aiManualAllowed=false; st.done=false;
  ckDraw();
  toast('Temperature photo cleared. Take a new close-up photo.');
}
/* downscale a photo to a small JPEG Blob before upload — big speed win (a 3-4 MB
   camera photo → ~150-300 KB) and fewer image tokens for the vision model. */
function ckDownscaleBlob(file,max,q){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{
  const s=Math.min(1,(max||1280)/Math.max(img.width||max,img.height||max));
  const w=Math.max(1,Math.round((img.width||max)*s)), h=Math.max(1,Math.round((img.height||max)*s));
  try{ const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
    c.toBlob(b=>{ try{URL.revokeObjectURL(img.src);}catch(e){} res(b||file); },'image/jpeg',q||0.72); }
  catch(e){ res(file); } }; img.onerror=()=>res(file); img.src=URL.createObjectURL(file); }); }
/* AI Vision temperature reader — ChatGPT (OpenAI) via the server endpoint.
   The OpenAI key lives ONLY on the server (env OPENAI_API_KEY); nothing runs on-device. */
async function ckVisionValue(fileName,file,r,i){
  const endpoint=window.MCQ_AI_VISION_ENDPOINT||localStorage.getItem('mcq_ai_vision_endpoint');
  if(!endpoint||!file) return {error:true,message:'AI Vision is not available here. Enter the temperature manually.',manualAllowed:true};
  try{
    const up=await ckDownscaleBlob(file,1280,0.72).catch(()=>file);
    const body=new FormData();
    body.append('image',up,'temperature.jpg');
    body.append('equipment',r.meta.equipment||'');
    body.append('type',r.meta.type||'fridge');
    const tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
    const res=await fetch(endpoint,{method:'POST',headers:tok?{Authorization:'Bearer '+tok}:{},body});
    const data=await res.json().catch(()=>({}));
    if(data.fallback) return {error:true,message:'AI Vision is not set up on the server yet (no key). Enter the temperature manually.',manualAllowed:true};
    const v=Number(data.temperature ?? data.value ?? data.tempC);
    const confidence=data.confidence==null?null:Number(data.confidence);
    if(Number.isFinite(v)){
      const rawText=String(data.displayText||data.text||data.rawText||v);
      const implicit=ckImplicitTempSuggestion(v,r.meta.type,rawText);
      if(implicit) return {error:true,suggestedValue:implicit.value,message:implicit.message,source:data.source||'ChatGPT Vision',text:rawText,rawReading:rawText,confidence,quality:{model:data.model||'',ambiguous:true},candidates:[v,implicit.value],manualAllowed:true};
      return {value:v,source:data.source||'ChatGPT Vision',text:rawText,rawReading:rawText,confidence,quality:{model:data.model||''}};
    }
    return {error:true,message:data.message||'AI Vision could not read a temperature. Retake a closer photo of the display, or enter it manually.',source:data.source||'ChatGPT Vision',text:data.displayText||data.text||'',confidence,manualAllowed:true};
  }catch(e){ console.warn('AI Vision failed',e); return {error:true,message:'AI Vision could not reach the server. Check the connection, then enter the temperature manually.',manualAllowed:true}; }
}
function ckImplicitTempSuggestion(value,type,rawText){
  value=Number(value);
  if(!Number.isFinite(value)) return null;
  const raw=String(rawText||'').trim();
  if(/[.,]/.test(raw)) return null;
  const rounded=Math.round(Math.abs(value));
  if(Math.abs(Math.abs(value)-rounded)>0.05) return null;
  if(type==='freezer' && value>=10 && value<=35){
    const suggested=-rounded;
    return {value:suggested,message:`AI Vision read "${raw||rounded}" for a freezer, but the minus sign was not clearly visible. Suggested ${suggested.toFixed(1)} C. Confirm, edit, or retake.`};
  }
  if(type!=='freezer' && value>=10 && value<=99){
    const suggested=Math.round(rounded)/10;
    return {value:suggested,message:`AI Vision read "${raw||rounded}" for a fridge/coolroom, but the decimal point was not clearly visible. Suggested ${suggested.toFixed(1)} C. Confirm, edit, or retake.`};
  }
  return null;
}
function ckRecordTemp(i,temp){
  const r=ckItem(DB.checklist.items[i],i);
  State.tempReadings=State.tempReadings||[];
  State.tempReadings.unshift({
    item:i,session:State.chk.session,store:State.branch,dept:r.meta.dept,equipment:r.meta.equipment,type:r.meta.type,
    value:temp.value,inRange:temp.inRange,defrosting:!!temp.defrosting,range:ckTempRange(r.meta.type).text,source:temp.source||'',confidence:temp.confidence||null,manual:!!temp.manual,confirmedBy:temp.confirmedBy||'',suggestedValue:temp.suggestedValue??null,rawReading:temp.rawReading||'',at:new Date().toISOString()
  });
}
function ckQueueTempAlert(i,temp){
  const r=ckItem(DB.checklist.items[i],i);
  State.tempAlerts=State.tempAlerts||[];
  State.tempAlerts.unshift({
    item:i,store:State.branch,session:State.chk.session,dept:r.meta.dept,equipment:r.meta.equipment,
    value:temp.value,range:temp.range,emails:DB.checklist.tempAlertEmails||[],at:new Date().toISOString()
  });
  const endpoint=window.MCQ_GMAIL_ALERT_ENDPOINT||localStorage.getItem('mcq_gmail_alert_endpoint');
  if(endpoint){
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(State.tempAlerts[0])}).catch(e=>console.warn('Gmail alert endpoint failed',e));
  }
  // email the store admin + temp-alert recipients (silent via Brevo if configured)
  if(window.mcqEmail && mcqEmail.alert){
    const subject=`🌡️ TEMP ALERT · ${State.branch} · ${r.meta.equipment||r.task||r.dept}`;
    const body=`Temperature OUT OF RANGE\n\nStore: ${State.branch}\nDepartment: ${r.dept}\nEquipment: ${r.meta.equipment||r.task||'—'}\nReading: ${temp.value!=null?temp.value+' °C':'—'}\nSafe range: ${temp.range||''}\nSession: ${State.chk.session}\nTime: ${new Date().toLocaleString()}\n\nPlease check the unit and record the corrective action.`;
    const res=mcqEmail.alert(subject,body,DB.checklist.tempAlertEmails||[]);
    if(res==='silent') toast('🌡️ Temp alert emailed to admin');
  }
}
function ckTempBox(r,st){
  const range=ckTempRange(r.meta.type), temp=st.temp;
  const scanning=st.aiStatus==='scanning';
  const status=st.defrosting?'defrost':(temp?(temp.inRange?'ok':'bad'):(scanning?'scan':(st.aiStatus==='error'||st.aiStatus==='confirm'?'confirm':'idle')));
  const suggested=Number.isFinite(Number(st.aiSuggestion?.value))?Number(st.aiSuggestion.value).toFixed(1):'';
  const reading=st.defrosting?'DEFROSTING':(temp?`${temp.value.toFixed(1)} C`:(scanning?'Scanning photo…':(suggested!==''?`AI read ${suggested} °C — check & save`:'Type °C, or 📷 to auto-read')));
  const source=temp?` · ${temp.source||'Manual'}${temp.confidence?` ${temp.confidence}%`:''}`:'';
  const detail=temp?`${temp.inRange?'Within safety range':'OUT OF RANGE — alert queued'}${source}`:`Safety range ${range.text}`;
  // Manual entry is ALWAYS available (photo/AI is optional) — type a value and Save, or use a photo.
  const manualVal = temp? temp.value.toFixed(1) : suggested;
  const manual = st.defrosting ? '' : `<div class="ck-temp-manual">
      <input id="ck-temp-manual-${r.i}" type="number" step="0.1" min="-45" max="35" value="${esc(manualVal)}" placeholder="°C" ${scanning?'disabled':''} onkeydown="if(event.key==='Enter'){event.preventDefault();ckManualTemp(${r.i});}">
      <button class="mini good" type="button" onclick="ckManualTemp(${r.i})">${temp?'Update':'Save °C'}</button>
      ${(st.photos&&st.photos.length)?`<button class="mini" type="button" onclick="ckRetakeTemp(${r.i})">Clear photo</button>`:''}
    </div>`;
  return `<div class="ck-temp-box ${status}">
    <div class="ck-temp-main"><span class="ck-temp-label">${esc(range.label)}</span><b>${esc(reading)}</b><small>${esc(detail)}</small>${manual}</div>
    <label class="ck-defrost"><input type="checkbox" ${st.defrosting?'checked':''} onchange="ckDefrost(${r.i},this.checked)"> Defrosting</label>
  </div>`;
}
function ckTempEntries(){
  const current=[];
  DB.checklist.items.forEach((it,i)=>{
    const r=ckItem(it,i), st=State.chk?.state?.[i]||{};
    if(!r.meta.temp) return;
    if(st.temp||st.defrosting) current.push({
      item:i,session:State.chk.session,store:State.branch,dept:r.meta.dept,equipment:r.meta.equipment,type:r.meta.type,
      value:st.temp?.value??null,inRange:st.defrosting?true:!!st.temp?.inRange,defrosting:!!st.defrosting,
      range:ckTempRange(r.meta.type).text,at:st.temp?.at||new Date().toISOString()
    });
  });
  const seen=new Set(current.map(e=>`${e.item}-${e.session}`));
  return current.concat((State.tempReadings||[]).filter(e=>!seen.has(`${e.item}-${e.session}`)));
}
function ckTempReportHTML(){
  const entries=ckTempEntries(), alerts=State.tempAlerts||[];
  const real=entries.filter(e=>!e.defrosting), ok=real.filter(e=>e.inRange).length, bad=real.filter(e=>!e.inRange).length, def=entries.filter(e=>e.defrosting).length;
  const latest=entries.slice(0,5).map(e=>`<div class="ck-tr-row ${e.defrosting?'defrost':(e.inRange?'ok':'bad')}"><b>${esc(e.dept)} · ${esc(e.equipment)}</b><span>${e.defrosting?'Defrosting':`${Number(e.value).toFixed(1)} C`}</span><small>${esc(e.range)}</small></div>`).join('');
  return `<div class="ck-temp-report card">
    <div class="ck-temp-head"><div><h3>AI Temperature Safety Report</h3><p>Fridge range ${esc(ckTempRange('fridge').text)} · Freezer range ${esc(ckTempRange('freezer').text)}</p></div><span>Gmail alerts ${alerts.length}</span></div>
    <div class="ck-temp-kpis">
      <div><b>${ok}</b><span>In range</span></div><div><b>${bad}</b><span>Out of range</span></div><div><b>${def}</b><span>Defrosting</span></div>
      <div><b>${real.length}</b><span>Weekly report</span></div><div><b>${real.length}</b><span>Monthly report</span></div>
    </div>
    ${latest?`<div class="ck-tr-list">${latest}</div>`:'<div class="ck-tr-empty">No temperature readings yet. Take a photo on Manager temperature checks and AI Vision will save the number automatically.</div>'}
  </div>`;
}
function chkSubmit(){
  const g=ckGate();
  if(!g.complete){
    if(!g.respOk) ckMarkRespMissing([State.chk.dept]);
    ckBlockModal(g);
    return;
  }
  ckConfirmSubmit(g);
}
// persistent, can't-miss list of what's still incomplete (per section) — replaces the easy-to-miss toast
function ckBlockModal(g){
  const secHtml=g.sections.map(s=>{
    const list=s.complete?'':`<ul class="ck-block-list">${s.issues.slice(0,10).map(it=>`<li><button class="ck-block-jump" onclick="ckJumpTo(${it.i})">${esc(it.task)}</button> <span class="muted">— ${esc(it.why)}</span></li>`).join('')}${s.issues.length>10?`<li>…and ${s.issues.length-10} more</li>`:''}</ul>`;
    return `<div class="ck-block-sec"><div class="ck-block-sec-h ${s.complete?'ok':'bad'}">${s.complete?'✅':'⛔'} ${esc(s.area)} — ${s.ok}/${s.total}</div>${list}</div>`;
  }).join('');
  const respHtml=g.respOk?'':`<div class="ck-block-sec"><div class="ck-block-sec-h bad">⛔ Responsible Person — required</div><ul class="ck-block-list"><li>Enter Responsible Person 1 and Submitted by</li></ul></div>`;
  const ov=document.createElement('div'); ov.className='lb-overlay ck-block-ov'; ov.style.display='flex';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`<div class="lb-panel"><div class="card-head" style="padding:14px 16px"><h3>Not ready to submit — items still incomplete</h3><button class="x-btn" onclick="this.closest('.ck-block-ov').remove()">✕</button></div>
    <div class="card-pad" style="max-height:62vh;overflow:auto"><p class="fhint" style="margin:0 0 10px">Finish every section below, or write a <b>reason</b> in the note for any task you can't complete. Your progress is saved automatically.</p>${respHtml}${secHtml}</div></div>`;
  document.body.appendChild(ov);
}
function ckJumpTo(i){ document.querySelectorAll('.ck-block-ov').forEach(n=>n.remove());
  const r=ckItem(DB.checklist.items[i],i);
  if(State.chk.area!=='ALL' && r && r.area!==State.chk.area){ State.chk.area=r.area; renderChecklist(); }
  setTimeout(()=>{ const row=document.getElementById('ck-row-'+i); if(row){ row.scrollIntoView({behavior:'smooth',block:'center'}); row.classList.add('ck-flash'); setTimeout(()=>row.classList.remove('ck-flash'),1600); } },120);
}
// final confirmation — makes clear this submits the WHOLE department checklist
function ckConfirmSubmit(g){
  const total=g.sections.reduce((n,s)=>n+s.total,0), ok=g.sections.reduce((n,s)=>n+s.ok,0);
  const ov=document.createElement('div'); ov.className='lb-overlay ck-block-ov'; ov.style.display='flex';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`<div class="lb-panel" style="max-width:440px"><div class="card-head" style="padding:14px 16px"><h3>Submit the whole checklist?</h3><button class="x-btn" onclick="this.closest('.ck-block-ov').remove()">✕</button></div>
    <div class="card-pad"><p>You're submitting the <b>ENTIRE</b> <b>${esc(State.chk.dept)} · ${esc(State.chk.session)}</b> checklist for <b>${esc(State.branch)}</b>.</p>
    <p class="fhint">${g.sections.length} section(s) · ${ok}/${total} items complete. It will then go to the manager to verify.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn" onclick="this.closest('.ck-block-ov').remove()">Cancel</button><button class="btn primary" onclick="this.closest('.ck-block-ov').remove();ckDoSubmit()">✓ Submit checklist</button></div></div></div>`;
  document.body.appendChild(ov);
}
function ckDoSubmit(){
  // ---- persist a REAL submission (Manager verify / Performance / records all read this) ----
  const allRows=DB.checklist.items.map(ckItem).filter(r=>ckStoreOk(r) && r.dept===State.chk.dept && ckInSession(r,State.chk.session));
  const out=allRows.filter(r=>r.meta.temp&&(State.chk.state[r.i]||{}).temp&&!((State.chk.state[r.i]||{}).temp.inRange)).length;
  const items=allRows.map(r=>{ const st=State.chk.state[r.i]||{};
    return {task:r.task, area:r.area, done:!!st.done, note:st.note||'', photos:(st.photos||[]).slice(), temp: st.temp?{value:st.temp.value,inRange:!!st.temp.inRange,defrosting:!!st.defrosting,source:st.temp.source||'',manual:!!st.temp.manual,confirmedBy:st.temp.confirmedBy||'',suggestedValue:st.temp.suggestedValue??null,rawReading:st.temp.rawReading||''}:null }; });
  const doneN=items.filter(i=>i.done).length, totalN=items.length;
  const resp=(State.chk.resp||{})[State.chk.dept]||{};
  const ymd=new Date().toISOString().slice(0,10);
  const sub={ id:makeRecordId('CKS',State.branch),
    store:State.branch, dept:State.chk.dept, session:State.chk.session, date:ymd, dayName:new Date().toLocaleDateString(undefined,{weekday:'long'}),
    by:resp.submittedBy||'', responsible:resp.p1||'', created:new Date().toISOString().slice(0,16).replace('T',' '),
    progress: totalN?Math.round(doneN/totalN*100):0, done:doneN, total:totalN, status:'Submitted', tempAlerts:out, items };
  DB.checklistSubs=DB.checklistSubs||[]; DB.checklistSubs.unshift(sub);
  auditLog('create','checklistSubmission',sub.id,sub.store,null,sub,`${sub.dept} ${sub.session}`);
  if(window.persist) window.persist();
  if(window.mcqEmail) mcqEmail.notify('checklist', `Checklist submitted · ${sub.dept} ${sub.session} · ${State.branch}`,
    `Department: ${sub.dept}\nSession: ${sub.session}\nStore: ${State.branch}\nProgress: ${doneN}/${totalN} (${sub.progress}%)\nSubmitted by: ${sub.by||'—'}\nResponsible: ${sub.responsible||'—'}${out?`\n⚠️ ${out} temperature alert(s)`:''}`, {dept:sub.dept});
  if(State.chk&&State.chk.reopen) delete State.chk.reopen[sub.dept+'|'+sub.session];   // clear re-open flag so the Done screen shows
  ckSubmitSuccess(sub,out);
  renderChecklist();   // repaint underneath → shows the "Submitted ✓" Done screen
}
/* smooth, instant success confirmation after submit */
function ckSubmitSuccess(sub,out){
  document.querySelectorAll('.ck-success-ov').forEach(n=>n.remove());
  const ov=document.createElement('div'); ov.className='ck-success-ov';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`<div class="ck-success-card">
    <div class="ck-success-ring"><svg viewBox="0 0 52 52"><circle class="cs-circle" cx="26" cy="26" r="24"/><path class="cs-check" d="M14.5 27l7.5 7.5 16-16.5"/></svg></div>
    <h3>Checklist submitted</h3>
    <p>${esc(sub.dept)} · ${esc(sub.session)} · ${esc(sub.store)}</p>
    <div class="ck-success-stats"><div><b>${sub.done}/${sub.total}</b><span>tasks done</span></div><div><b>${sub.progress}%</b><span>complete</span></div>${out?`<div class="bad"><b>${out}</b><span>temp alert${out>1?'s':''}</span></div>`:''}</div>
    <div class="ck-success-actions">
      <button class="btn primary" onclick="this.closest('.ck-success-ov').remove();ckSharePDF('${ckJS(sub.session)}')"><i class="fab fa-whatsapp"></i>&nbsp; Share PDF</button>
      <button class="btn ghost" onclick="this.closest('.ck-success-ov').remove()">Done</button>
    </div></div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>ov.classList.add('show'));
  setTimeout(()=>{ if(document.body.contains(ov)) ov.classList.add('idle'); },2600);
}
function ckMarkRespMissing(depts){
  depts.forEach(dept=>{
    ['p1','submittedBy'].forEach(field=>{
      const el=document.getElementById(ckRespId(dept,field));
      if(el&&!el.value.trim()) el.classList.add('invalid','shake');
    });
  });
  const first=document.getElementById(ckRespId(depts[0],'p1'));
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-resp-field input.shake').forEach(el=>el.classList.remove('shake')),500);
}
function ckMarkPhotoMissing(rows){
  rows.forEach(r=>{
    const el=document.getElementById('ck-photo-'+r.i);
    if(el) el.classList.add('invalid','shake');
  });
  const first=document.getElementById('ck-row-'+rows[0].i);
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-photos.shake').forEach(el=>el.classList.remove('shake')),500);
}
function ckMarkTempMissing(rows){
  rows.forEach(r=>{
    const row=document.getElementById('ck-row-'+r.i);
    const box=row&&row.querySelector('.ck-temp-box');
    if(box) box.classList.add('invalid','shake');
  });
  const first=document.getElementById('ck-row-'+rows[0].i);
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-temp-box.shake').forEach(el=>el.classList.remove('shake')),500);
}

/* ============================================================ REPORT ISSUE — dynamic per-category form */
function renderIssue(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue','Report anything that needs management attention');
  if(!State.iss) State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  if(State.iss.tab==='analytics') return isAdmin()?renderIssueAnalytics():(State.iss.tab='records',renderIssueRecords());
  if(State.iss.tab==='records') return renderIssueRecords();
  const cats=DB.issueCategories;
  const card=(k,c)=>`<button type="button" class="cat-card ${State.iss.cat===k?'selected':''}" data-k="${k}" style="--cc:${c.color}" onclick="issCat('${k}')"><i class="fas ${c.icon} cat-ic" style="color:${c.color}"></i><span class="cat-label">${esc(c.label)}</span></button>`;
  const cards=DB.issueGroups.map(g=>{const inG=Object.entries(cats).filter(([k,c])=>c.group===g); return inG.length?`<div class="cat-group-h">${esc(g)}</div><div class="cat-grid">${inG.map(([k,c])=>card(k,c)).join('')}</div>`:'';}).join('');
  const c=State.iss.cat?cats[State.iss.cat]:null, mod=c?c.mod:'issue';
  const fhBg=c?c.color+'1f':'#fdeaea', fhTitle=c?`<i class="fas ${c.icon}" style="color:${c.color}"></i>&nbsp; ${esc(c.label)}`:`<i class="fas fa-pen"></i>&nbsp; Issue details`;
  const routeLbl={maintenance:'Maintenance register',incident:'Incident register',complaint:'Customer Complaint register',issue:'Issues register'}[mod];
  $('#content').innerHTML=`
   <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue</h2><p>Report any operational issue, request or suggestion — reviewed by management only.</p></div>
     <div class="ph-actions">${issSeg('report')}</div></div>
   <div class="iss-cat-h">What would you like to report?</div>
   ${cards}
   <div class="iss-grid">
     <div class="card" id="iss-formcard">
       <div class="card-head" id="iss-formhead" style="background:${fhBg}"><h3>${fhTitle}</h3>${c?`<span class="reg-tag" style="margin-left:auto">→ ${routeLbl}</span>`:''}</div>
       <div class="card-pad">
         ${issFormBody(c,mod)}
         <div id="iss-warn" class="rail-tip" style="display:none;margin-top:14px">⚠️ Please select a category above first.</div>
         <button class="btn block lg iss-submit" style="margin-top:16px" onclick="issSubmit()"><i class="fas fa-paper-plane"></i>&nbsp; Submit Report</button>
       </div>
     </div>
     <aside class="form-rail">
       <div class="card rail-card" style="background:var(--accent-soft)"><h4>🛡️ Your report is confidential</h4>
         <ul><li>Only management can view submitted reports</li><li>Reports are reviewed promptly</li><li>For urgent issues, speak to your manager directly</li><li>Missed clock-in/out: management will adjust your timesheet</li><li>A photo is optional on every report</li></ul></div>
       ${issRailTip(mod)}
     </aside>
   </div>`;
}
/* dynamic form body by category mod */
function issFormBody(c,mod){
  const selName=State.iss.name||'', selStore=State.iss.store||State.branch;
  const stores=isSuper()?DB.stores:[State.branch];
  const depts=(DB.checklist&&DB.checklist.depts)||[];
  const deptSel=id=>`<select id="${id}" onchange="issDeptChanged()"><option value="">— Select —</option>${depts.map(d=>`<option>${esc(d)}</option>`).join('')}<option>Front of store / Checkout</option><option>Loading dock</option><option>Coolroom / Freezer</option><option>Online</option><option>Other</option></select>`;
  const prio=[['Low','mute'],['Normal','info'],['High','warn'],['Urgent','bad']];
  const prioLbl=mod==='complaint'||mod==='incident'?'Severity':'Priority';
  const prioHint=mod==='complaint'?'<div class="fhint">Low → Minor · Normal → Moderate · High / Urgent → Major</div>':'';
  const nameStore=`<div class="grid2">
       <div class="field"><label>${mod==='incident'||mod==='complaint'?'Submitted by':'Your name'} <span class="req">*</span></label>${staffPick('iss-name','',selName,'Search your name…',{fallbackAll:true})}</div>
       <div class="field"><label>Store</label><select id="iss-store" ${isSuper()?'':'disabled'}>${stores.map(s=>`<option ${s===selStore?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
     </div>`;
  const prioRow=`<div class="field" style="margin-top:14px"><label>${prioLbl}</label><div class="prio-pills" id="iss-prio">${prio.map(p=>`<button type="button" class="prio-pill ${p[1]} ${p[0]===State.iss.prio?'on':''}" data-v="${p[0]}" onclick="issPrio(this)">${p[0]}</button>`).join('')}</div>${prioHint}</div>`;
  let body;
  if(mod==='maintenance'){
    body=`${nameStore}${prioRow}
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Department / Area</label>${deptSel('iss-dept')}</div>
       <div class="field"><label>Equipment name <span class="req">*</span></label><input id="iss-equip" maxlength="120" placeholder="e.g. Coolroom 1 compressor, Till 2 scanner…"></div>
     </div>
     <div class="field" style="margin-top:14px"><label>Location detail</label><input id="iss-loc" maxlength="120" placeholder="e.g. Till 2, Coolroom 1, Loading dock…"></div>
     <div class="field" style="margin-top:14px"><label>What's wrong? <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe the fault — when it started, noises, leaks, error codes, what stopped working…"></textarea></div>`;
  } else if(mod==='complaint'){
    const staff2=staffPick('iss-staff2','','','Search staff (optional)…',{fallbackAll:true});
    const channels=['In-store','Phone','Email','Social Media','Google Review','Other'];
    const actions=['Refund / exchange processed','Product replaced','Voucher / goodwill given','Apology only (no transaction)','None (information only)','Acknowledged & escalated to Store Manager'];
    body=`${nameStore}${prioRow}
     <div class="field" style="margin-top:14px"><label>Channel</label><div class="iss-radios" id="iss-channel">${channels.map((ch,i)=>`<label class="iss-radio"><input type="radio" name="iss-channel" value="${esc(ch)}" ${i===0?'checked':''}> ${esc(ch)}</label>`).join('')}</div></div>
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Department</label>${deptSel('iss-dept')}</div>
       <div class="field"><label>Staff being complained about</label>${staff2}</div>
     </div>
     <div class="field" style="margin-top:14px"><label>Complaint details <span class="req">*</span></label><textarea id="iss-desc" placeholder="What did the customer complain about? Include product, price, time, and what was said…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Immediate action taken</label><div class="iss-checks" id="iss-actions">${actions.map(a=>`<label class="iss-check"><input type="checkbox" value="${esc(a)}"> ${esc(a)}</label>`).join('')}</div>
       <div class="fhint"><b>Minor:</b> tick what you did. <b>Moderate / Major:</b> you MUST tick “Acknowledged & escalated to Store Manager”.</div></div>
     <div class="iss-subhead">Customer info <span class="opt">(optional)</span></div>
     <div class="grid2">
       <div class="field"><label>Customer name</label><input id="iss-cust-name" placeholder="Optional"></div>
       <div class="field"><label>Customer contact (phone / email)</label><input id="iss-cust-contact" placeholder="Optional"></div>
     </div>
     <div class="field" style="margin-top:14px"><label>Did the customer request follow-up?</label><div class="iss-radios" id="iss-followup"><label class="iss-radio"><input type="radio" name="iss-followup" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-followup" value="Yes"> Yes</label></div></div>
     <div class="field" style="margin-top:14px"><label>Photo / evidence URL <span class="opt">(optional)</span></label><input id="iss-url" placeholder="Paste a link to a photo, screenshot or online review…"></div>`;
  } else if(mod==='incident'){
    const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    body=`${nameStore}${prioRow}
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Area / Location</label><input id="iss-loc" maxlength="120" placeholder="e.g. Coolroom 1, Aisle 4, Loading dock…"></div>
       <div class="field"><label>Incident date & time</label><input type="datetime-local" id="iss-when" value="${nowLocal}"></div>
     </div>
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Injury?</label><div class="iss-radios" id="iss-injury"><label class="iss-radio"><input type="radio" name="iss-injury" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-injury" value="Yes"> Yes</label></div></div>
       <div class="field"><label>Medical attention required?</label><div class="iss-radios" id="iss-medical"><label class="iss-radio"><input type="radio" name="iss-medical" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-medical" value="Yes"> Yes</label></div></div>
     </div>
     <div class="field" style="margin-top:14px"><label>What happened? <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe clearly and factually — what happened, where, and who was involved…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Immediate action taken? <span class="req">*</span></label><textarea id="iss-action" placeholder="e.g. first aid given, area isolated, equipment removed, manager informed…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Photo / evidence URL <span class="opt">(optional)</span></label><input id="iss-url" placeholder="Paste a link to a photo or document…"></div>`;
  } else { /* generic operational / people / other */
    body=`${nameStore}${prioRow}
     <div class="field" style="margin-top:14px"><label>Brief title <span class="req">*</span></label><input id="iss-title" maxlength="120" placeholder="Short description of the issue…"></div>
     <div class="field" style="margin-top:14px"><label>Full description <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe the issue in detail. Include dates, names and any relevant info…"></textarea><div class="fhint">All reports are confidential and reviewed by management only.</div></div>`;
  }
  return body+issPhotoBox();
}
function issDeptChanged(){
  const dept=$('#iss-dept')?.value||'';
  staffPickRefresh('iss-name',dept,{fallbackAll:true});   // narrow the search suggestions to the chosen dept
  staffPickRefresh('iss-staff2',dept,{fallbackAll:true});
}
function issPhotoBox(){ const has=!!State.iss.photo;
  return `<div class="field" style="margin-top:14px"><label>Photo <span class="opt">(optional)</span></label>
     <label class="photo-box" id="iss-photobox"><input type="file" accept="image/*" capture="environment" onchange="issPhoto(this)" style="display:none">
       <div id="iss-ph-empty" style="display:${has?'none':'block'}"><i class="fas fa-camera"></i><div class="pb-t">Tap to take / attach a photo (optional)</div></div>
       <img id="iss-ph-img" src="${has?imgSrc(State.iss.photo):''}" style="display:${has?'block':'none'}"></label>
     <div id="iss-ph-rm" style="display:${has?'block':'none'};margin-top:8px"><button class="btn sm" onclick="issClearPhoto(event)">✕ Remove photo</button></div>
   </div>`;
}
function issRailTip(mod){
  const tips={
    maintenance:['Name the exact equipment + location so the right tech is sent','Refrigeration / electrical faults → mark Urgent','Add a photo of the fault or error code if you can'],
    complaint:['Stay factual — record what the customer said','Moderate / Major must be escalated to the Store Manager','Customer details are optional and kept confidential'],
    incident:['Make people safe first, then report','Record date, time and exact location','Note any injury and whether medical help was needed'],
    issue:['Low stock / supplier / HR / suggestions go here','Missed clock-in/out: management will adjust your timesheet','Be specific so it can be actioned quickly'],
  };
  const t=tips[mod]||tips.issue;
  return `<div class="card rail-card"><h4>Tips for this report</h4><ul>${t.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function issCat(k){
  if(State.iss){ const n=$('#iss-name'),s=$('#iss-store'); if(n)State.iss.name=n.value; if(s)State.iss.store=isSuper()?s.value:State.branch; }
  State.iss.cat=k; renderIssue();
  const fc=$('#iss-formcard'); if(fc) fc.scrollIntoView({behavior:'smooth',block:'start'});
}
function issPrio(btn){ $$('#iss-prio .prio-pill').forEach(p=>p.classList.remove('on')); btn.classList.add('on'); State.iss.prio=btn.dataset.v; }
async function issPhoto(input){ const f=input.files&&input.files[0]; if(!f) return;
  let ref; try{ const d=await compressImage(f); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d; }catch(e){ ref=URL.createObjectURL(f); }
  State.iss.photo=ref;
  const img=$('#iss-ph-img'); if(img){ img.src=imgSrc(ref); img.style.display='block'; }
  const em=$('#iss-ph-empty'); if(em) em.style.display='none'; const rm=$('#iss-ph-rm'); if(rm) rm.style.display='block'; }
function issClearPhoto(e){ e.preventDefault(); e.stopPropagation(); State.iss.photo=null; $('#iss-ph-img').style.display='none'; $('#iss-ph-empty').style.display='block'; $('#iss-ph-rm').style.display='none'; }
function issSubmit(){
  if(!State.iss.cat){ const w=$('#iss-warn'); if(w){w.style.display='flex';} window.scrollTo({top:0,behavior:'smooth'}); return; }
  const c=DB.issueCategories[State.iss.cat], mod=c.mod;
  const val=id=>{const e=$('#'+id); return e?e.value.trim():'';};
  const radio=nm=>{const e=document.querySelector(`input[name="${nm}"]:checked`); return e?e.value:'';};
  const checks=id=>{const w=$('#'+id); return w?[...w.querySelectorAll('input:checked')].map(x=>x.value):[];};
  // validation
  $$('#iss-formcard .invalid').forEach(e=>e.classList.remove('invalid'));
  const req= mod==='maintenance'?['iss-name','iss-equip','iss-desc']
           : mod==='incident'   ?['iss-name','iss-desc','iss-action']
           : mod==='complaint'  ?['iss-name','iss-desc']
           :                      ['iss-name','iss-title','iss-desc'];
  let bad=null;
  req.forEach(id=>{const e=$('#'+id); if(!e) return; const empty=(id==='iss-name')?(e.value.startsWith('—')||!e.value.trim()):!e.value.trim();
    if(empty){ e.classList.add('invalid','shake'); setTimeout(()=>e.classList.remove('shake'),450); bad=bad||e; }});
  if(bad){ toast('Please complete the required fields'); bad.scrollIntoView({behavior:'smooth',block:'center'}); return; }
  const name=val('iss-name'), desc=val('iss-desc'), store=storeForWrite($('#iss-store')?.value), prio=State.iss.prio||'Normal';
  const now=new Date().toISOString().slice(0,16).replace('T',' ');
  const sev=DB.prioToSeverity[prio]; const photo=State.iss.photo||''; let modOut=mod, ref, rec;
  if(mod==='maintenance'){
    const dept=val('iss-dept'), loc=val('iss-loc'), equip=val('iss-equip');
    ref=makeRecordId('MTN',store);
    rec={id:ref,created:now,store,equipment:equip,category:c.label,department:dept,location:loc,priority:sev,severity:sev,status:'New',issue:desc,reportedBy:name,photo};
  } else if(mod==='incident'){
    const loc=val('iss-loc'), when=(val('iss-when')||'').replace('T',' '), injury=radio('iss-injury'), medical=radio('iss-medical'), action=val('iss-action'), url=val('iss-url');
    ref=makeRecordId('INC',store);
    rec={id:ref,created:now,store,type:c.label,category:c.label,severity:sev,status:'New',location:loc,occurredAt:when,injury,medicalAttention:medical,summary:desc,actionTaken:action,reportedBy:name,evidenceUrl:url,photo};
  } else if(mod==='complaint'){
    const channel=radio('iss-channel'), dept=val('iss-dept'), staff2=val('iss-staff2'), actions=checks('iss-actions'), custName=val('iss-cust-name'), custContact=val('iss-cust-contact'), followup=radio('iss-followup'), url=val('iss-url');
    ref=makeRecordId('CCL',store);
    rec={id:ref,created:now,store,severity:DB.prioToComplaint[prio],category:c.label,channel,department:dept,staffComplained:staff2,shortDescription:desc,actionTaken:actions.join(', '),customerName:custName,customerContact:custContact,followup,status:'Open',reportedBy:name,evidenceUrl:url,age:0,photo};
  } else {
    modOut='issue'; const title=val('iss-title'); ref=makeRecordId('ISS',store);
    rec={id:ref,created:now,store,title,category:c.label,priority:prio,status:'Open',reportedBy:name,description:desc,photo};
  }
  auditLog('create',modOut,rec.id,rec.store,null,rec);
  DB.modules[modOut].records.unshift(rec);
  const cat=State.iss.cat;
  const names=(DB.issueEmailRoutes[cat]||[]).map(k=>(DB.emailRecipients.find(x=>x.key===k)||{}).name).filter(Boolean);
  if(window.mcqEmail) mcqEmail.notify('issue', `${ref} · ${c.label} · ${store}`, `New report: ${c.label}\nReference: ${ref}\nStore: ${store}\nReported by: ${name}\nPriority: ${prio}\n\n${desc}`, {cat});
  State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  if(window.persist) window.persist();
  toast(`✓ ${ref} → ${DB.modules[modOut].short}${names.length?' · 📧 '+names.length+' notified':''}`); buildSidebar(); renderIssue();
}

/* ---- Report Issue · Analytics (by category + branch comparison) ---- */
const ISS_GROUP_COLOR={'Maintenance & Facility':'#f59e0b','Customer Complaint':'#ec4899','Safety & Incident':'#ef4444','Operational':'#3b82f6','People':'#8b5cf6','Other':'#64748b'};
function issGroupOf(r){
  if(r.mod==='maintenance') return 'Maintenance & Facility';
  if(r.mod==='incident') return 'Safety & Incident';
  if(r.mod==='complaint') return 'Customer Complaint';
  const c=Object.values(DB.issueCategories).find(x=>x.label===r.category); return c?c.group:'Other';
}
function issTab(t){ if(!State.iss)State.iss={cat:'',photo:null,prio:'Normal'}; State.iss.tab=t; renderIssue(); }
function issDrill(cat){ if(!State.iss)State.iss={}; State.iss.drillCat = State.iss.drillCat===cat?null:cat; renderIssueAnalytics(); }
function issSeg(active){ return `<div class="seg seg-light"><button class="seg-btn ${active==='report'?'active':''}" onclick="issTab('report')">➕ New</button><button class="seg-btn ${active==='records'?'active':''}" onclick="issTab('records')">📋 Records</button>${isAdmin()?`<button class="seg-btn ${active==='analytics'?'active':''}" onclick="issTab('analytics')">📊 Analytics</button>`:''}</div>`; }
function issRecDate(which,val){ State.iss=State.iss||{}; State.iss[which]=val; renderIssueRecords(); }
function renderIssueRecords(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue · Records','All reports across registers');
  if(!State.iss) State.iss={tab:'records'};
  const regMods=['issue','maintenance','incident','complaint'];
  let all=[]; regMods.forEach(id=>DB.modules[id].records.forEach(r=>all.push({mod:id,icon:DB.modules[id].icon,short:DB.modules[id].short,...r})));
  if(!isSuper()) all=all.filter(r=>r.store===State.branch);
  const from=State.iss.recFrom||'', to=State.iss.recTo||'';
  all=all.filter(r=>{ const d=String(r.created||r.date||'').slice(0,10); if(from&&(!d||d<from)) return false; if(to&&(!d||d>to)) return false; return true; });
  all.sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue · Records</h2><p>Every report — Issue / Maintenance / Incident / Complaint, newest first.</p></div>
      <div class="ph-actions">${issSeg('records')}</div></div>
    <div class="toolbar"><span class="count-chip">📋 ${all.length} report${all.length!==1?'s':''}</span>
      <div class="filter f-daterange"><label>Date</label><input type="date" value="${esc(from)}" onchange="issRecDate('recFrom',this.value)"><span>→</span><input type="date" value="${esc(to)}" onchange="issRecDate('recTo',this.value)"></div>
      ${from||to?`<button class="btn sm" onclick="issRecDate('recFrom','');State.iss.recTo='';renderIssueRecords()">✕ Clear</button>`:''}
      <div class="tb-spacer"></div>${exportBtns('iss-rec-table','Report Issue Records')}</div>
    <div class="card"><div class="card-head"><h3>${isSuper()?'All stores':esc(State.branch)} · ${all.length} reports</h3></div><div class="table-wrap"><table class="grid" id="iss-rec-table"><thead><tr><th>Ref</th><th>Register</th><th>Title</th><th>Store</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${all.length?all.map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}","${ckJS(r.store||'')}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td><div class="wrap">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.category||'')}</div></td><td>${esc(r.store||'')}</td><td>${(r.priority||r.severity)?badge(r.priority||r.severity):''}</td><td>${r.status?badge(r.status):''}</td><td>${esc((r.created||r.date||'').slice(0,16))}</td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No reports in this range.</div></td></tr>'}
    </tbody></table></div></div>`;
}
function renderIssueEmail(){
  setAccent('#1565c0'); setCrumb('🚩','Report an Issue · Email routing','Choose who gets emailed per category');
  const cats=DB.issueCategories, recips=DB.emailRecipients;
  let rows='';
  DB.issueGroups.forEach(g=>{ const inG=Object.entries(cats).filter(([k,c])=>c.group===g); if(!inG.length) return;
    rows+=`<tr class="er-grouprow"><td colspan="${recips.length+1}">${esc(g)}</td></tr>`;
    inG.forEach(([k,c])=>{ rows+=`<tr><td class="er-cat"><i class="fas ${c.icon}" style="color:${c.color}"></i> ${esc(c.label)}</td>${recips.map(r=>{const on=(DB.issueEmailRoutes[k]||[]).includes(r.key);return `<td class="ctr"><input type="checkbox" ${on?'checked':''} onchange="issEmailToggle('${k}','${r.key}',this.checked)"></td>`;}).join('')}</tr>`; });
  });
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#e8f1fe">📧</div><div><h2>Report Issue · Email routing</h2><p>Tick who receives an email when a report is submitted in each category.</p></div>
      <div class="ph-actions">${issSeg('email')}</div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-pad er-recips">${recips.map(r=>`<div class="er-recip"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></div>`).join('')}</div></div>
    <div class="card"><div class="table-wrap"><table class="grid er-table"><thead><tr><th>Category</th>${recips.map(r=>`<th class="ctr">${esc(r.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="rail-tip" style="margin-top:14px">💡 When staff submit a report in a category, the ticked people are emailed automatically. <b>(Demo shows who would be notified.)</b></div>`;
}
function issEmailToggle(cat,rk,on){ const a=DB.issueEmailRoutes[cat]=DB.issueEmailRoutes[cat]||[]; const i=a.indexOf(rk); if(on&&i<0)a.push(rk); if(!on&&i>=0)a.splice(i,1); }
function renderIssueAnalytics(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue · Analytics',isSuper()?'By category & branch comparison':'By category within '+State.branch);
  const regMods=['issue','maintenance','incident','complaint'];
  let all=[]; regMods.forEach(id=>DB.modules[id].records.forEach(r=>all.push({mod:id,...r})));
  if(!isSuper()) all=all.filter(r=>r.store===State.branch);
  const open=all.filter(r=>!['Closed','Cancelled','Resolved','Store Confirmed'].includes(r.status)).length;
  const catCount={}; all.forEach(r=>{const c=r.category||'Other';catCount[c]=(catCount[c]||0)+1;});
  const catEnt=Object.entries(catCount).sort((a,b)=>b[1]-a[1]);
  const groups=DB.issueGroups, stores=isSuper()?DB.stores:[State.branch];
  const matrix={}; stores.forEach(s=>matrix[s]=Object.fromEntries(groups.map(g=>[g,0])));
  all.forEach(r=>{const g=issGroupOf(r); if(matrix[r.store]) matrix[r.store][g]++;});
  const kpis=[['📋',all.length,'Total reports','info'],['🔴',open,'Open','bad'],['🗂️',catEnt.length,'Categories','warn'],['🏪',isSuper()?stores.length:State.branch,isSuper()?'Branches':'Store','ok']];
  const matRows=stores.map(s=>{const row=matrix[s],tot=groups.reduce((n,g)=>n+row[g],0);
    return `<tr><td><b>${esc(s)}</b></td>${groups.map(g=>`<td class="num">${row[g]?`<span class="mx" style="background:${ISS_GROUP_COLOR[g]};opacity:${(0.5+Math.min(0.5,row[g]/8)).toFixed(2)}">${row[g]}</span>`:'<span class="mx0">·</span>'}</td>`).join('')}<td class="num"><b>${tot}</b></td></tr>`;}).join('');
  const totRow=`<tr class="mx-tot"><td><b>All branches</b></td>${groups.map(g=>`<td class="num"><b>${stores.reduce((n,s)=>n+matrix[s][g],0)}</b></td>`).join('')}<td class="num"><b>${all.length}</b></td></tr>`;
  const dc=State.iss.drillCat||null;
  const catChips=catEnt.map(([lbl,n])=>`<button class="drill-chip ${dc===lbl?'on':''}" onclick="issDrill('${lbl}')">${esc(lbl)} <b>${n}</b></button>`).join('');
  let drillHtml='';
  if(dc){ const dRecs=all.filter(r=>(r.category||'Other')===dc), dOpen=dRecs.filter(r=>!['Closed','Cancelled','Resolved','Store Confirmed'].includes(r.status)).length;
    const topStore=stores.map(s=>[s,dRecs.filter(r=>r.store===s).length]).sort((a,b)=>b[1]-a[1])[0];
    drillHtml=`<div class="card drill-card"><div class="card-head"><h3>🔎 ${esc(dc)}</h3><span class="ch-sub">${dRecs.length} reports · ${dOpen} open${isSuper()&&topStore&&topStore[1]?` · most at ${esc(topStore[0])}`:''}</span><button class="btn sm" style="margin-left:auto" onclick="issDrill('${dc}')">✕ Close</button></div>
      <div class="card-pad"><div class="chart-grid cols-2"><div><div class="mini-h">${isSuper()?'By store':'This store'}</div><div class="chart-box"><canvas id="iad-store"></canvas></div></div><div><div class="mini-h">By status</div><div class="chart-box"><canvas id="iad-status"></canvas></div></div></div></div></div>`; }
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue · Analytics</h2><p>${isSuper()?'Breakdown by category, with a side-by-side comparison across branches.':'Breakdown by category for MCQ '+esc(State.branch)+'.'}</p></div>
      <div class="ph-actions">${issSeg('analytics')}</div></div>
    <div class="kpi-grid">${kpis.map(k=>`<div class="kpi tone-${k[3]}"><div class="k-top"><div class="k-ic">${k[0]}</div></div><div class="k-val">${k[1]}</div><div class="k-lbl">${esc(k[2])}</div></div>`).join('')}</div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>Reports by category</h3></div><div class="card-pad"><div class="chart-box"><canvas id="ia-cat"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>${isSuper()?'Branch comparison':'Store category mix'}</h3><span class="ch-sub">stacked by type</span></div><div class="card-pad"><div class="chart-box"><canvas id="ia-branch"></canvas></div></div></div>
    </div>
    <div class="section-title">${isSuper()?'Branch × category matrix':'Store category matrix'}</div>
    <div class="card"><div class="table-wrap"><table class="grid mx-table"><thead><tr><th>Store</th>${groups.map(g=>`<th>${esc(g.split(' & ')[0].replace('Maintenance','Maint.'))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${matRows}${isSuper()?totRow:''}</tbody></table></div></div>
    <div class="section-title">Per-category analytics — click a category to drill in</div>
    <div class="drill-chips">${catChips||'<span class="text-muted" style="color:var(--muted)">No data.</span>'}</div>
    ${drillHtml}`;
  if(dc){ const dRecs=all.filter(r=>(r.category||'Other')===dc);
    const sCounts=stores.map(s=>dRecs.filter(r=>r.store===s).length);
    mkChart('iad-store',{type:'bar',data:{labels:stores,datasets:[{data:sCounts,backgroundColor:'#e53935',borderRadius:6,maxBarThickness:30}]},options:baseOpts({legend:false})});
    const stMap={}; dRecs.forEach(r=>{const s=r.status||'—';stMap[s]=(stMap[s]||0)+1;}); const se=Object.entries(stMap);
    mkChart('iad-status',{type:'doughnut',data:{labels:se.map(x=>x[0]),datasets:[{data:se.map(x=>x[1]),backgroundColor:se.map(x=>toneHex(x[0])),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  }
  mkChart('ia-cat',{type:'bar',data:{labels:catEnt.map(e=>e[0]),datasets:[{data:catEnt.map(e=>e[1]),backgroundColor:catEnt.map((e,i)=>PALETTE[i%PALETTE.length]),borderRadius:7,maxBarThickness:20}]},options:baseOpts({indexAxis:'y',legend:false})});
  const datasets=groups.map(g=>({label:g,data:stores.map(s=>matrix[s][g]),backgroundColor:ISS_GROUP_COLOR[g],borderRadius:4}));
  mkChart('ia-branch',{type:'bar',data:{labels:stores,datasets},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:9,font:{family:'Inter',size:10,weight:'600'},color:'#475569'}},tooltip:{backgroundColor:'#0f172a',padding:10,cornerRadius:9}},
    scales:{x:{stacked:true,grid:{display:false},ticks:{font:{family:'Inter',size:10},color:'#64748b'},border:{display:false}},y:{stacked:true,grid:{color:'#eef2f7'},ticks:{precision:0,font:{family:'Inter',size:11},color:'#64748b'},border:{display:false}}}}});
}

/* ============================================================ STAFF STRUCTURE (org chart) */
function renderStructure(){
  setAccent('#1e7a52'); setCrumb('🏢','Staff Structure','Organisation chart by department');
  const top=DB.structure[0];
  const cards=DB.structure.slice(1).map(d=>`<div class="org-card" style="--c:${d.color}">
    <div class="org-dept">${esc(d.dept)}</div><div class="org-head">${esc(d.head)}</div>
    <ul class="org-members">${d.members.map(m=>`<li>${esc(m)}</li>`).join('')}</ul></div>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure</h2><p>How MCQ supermarket teams report and connect.</p></div></div>
    <div class="org-top"><div class="org-card org-boss" style="--c:#0e9f6e"><div class="org-dept">${esc(top.dept)}</div><div class="org-head">${esc(top.head)}</div>
      <ul class="org-members">${top.members.map(m=>`<li>${esc(m)}</li>`).join('')}</ul></div></div>
    <div class="org-line"></div><div class="org-grid">${cards}</div>`;
}

/* ============================================================ STAFF MEMBERS */
function renderStaff(){
  setAccent('#0e9f6e'); setCrumb('🧑‍🤝‍🧑','Staff Members',`${DB.staff.length} people`);
  const rows=DB.staff.filter(s=>isSuper()||s.store===State.branch);
  const active=rows.filter(s=>s.active).length;
  const ed=State.staffEdit, roles=DB.staffRoles||['Staff'];
  let editForm='';
  const cdepts=(DB.checklist&&DB.checklist.depts)||[];
  if(ed){ const s = ed==='new'?{id:'',name:'',dept:'',role:'',store:State.branch,phone:'',email:'',gender:'',dob:'',start:new Date().toISOString().slice(0,10),cardId:'',tfn:'',address:'',suburb:'',country:'Australia',basis:'Individual',category:'',estatus:'',active:1} : (DB.staff.find(x=>x.id===ed)||{});
    const storeField=isSuper()
      ? `<select id="st-store">${DB.stores.map(x=>`<option ${x===s.store?'selected':''}>${esc(x)}</option>`).join('')}</select>`
      : `<input type="hidden" id="st-store" value="${esc(State.branch)}"><input value="${esc(State.branch)}" disabled>`;
    const sel=(cur,opts)=>opts.map(o=>`<option ${String(o)===String(cur||'')?'selected':''}>${esc(o)}</option>`).join('');
    editForm=`<div class="card" style="margin-bottom:16px;border:2px solid var(--accent-soft)"><div class="card-head"><h3>${ed==='new'?'➕ Add staff member':'✎ Edit '+esc(s.name)}</h3><button class="btn sm" style="margin-left:auto" onclick="staffCancel()">✕ Cancel</button></div>
      <div class="card-pad"><div class="grid2">
        <div class="field"><label>Full name <span class="req">*</span></label><input id="st-name" value="${esc(s.name||'')}"></div>
        <div class="field"><label>Primary department (checklist)</label><select id="st-dept"><option value="">— Unassigned —</option>${cdepts.map(d=>`<option ${d===s.dept?'selected':''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="field"><label>Role / Classification</label><input id="st-role" value="${esc(s.role||s.classification||'')}" placeholder="e.g. CASHIER, FRUIT & VEGGIES"></div>
        <div class="field span2"><label>Checklist roles — this person appears in these department checklists (Responsible / Submitted by). One person can have several.</label>
          <div class="role-pick">
            <label class="role-opt admin"><input type="checkbox" id="st-admin" ${s.admin?'checked':''}> <i class="fas fa-shield-halved"></i> <b>Admin</b> — appears in ALL checklists</label>
            ${cdepts.map(d=>{ const on=staffIsAdmin(s)||(Array.isArray(s.roles)&&s.roles.includes(d))||s.dept===d; const m=(DB.checklist.deptMeta||{})[d]||{}; return `<label class="role-opt" style="--dc:${m.color||'#0e9f6e'}"><input type="checkbox" class="st-role-cb" value="${esc(d)}" ${on&&!staffIsAdmin(s)?'checked':''}>${m.icon?`<i class="fas ${m.icon}"></i> `:''}${esc(d)}</label>`; }).join('')}
          </div></div>
        <div class="field"><label>Store</label>${storeField}</div>
        <div class="field"><label>Phone</label><input id="st-phone" value="${esc(s.phone||'')}" placeholder="0400 000 000"></div>
        <div class="field"><label>Email</label><input id="st-email" value="${esc(s.email||'')}"></div>
        <div class="field"><label>Gender</label><select id="st-gender"><option value=""></option>${sel(s.gender,['Male','Female','Other'])}</select></div>
        <div class="field"><label>Date of birth</label><input type="date" id="st-dob" value="${esc(s.dob||'')}"></div>
        <div class="field"><label>Start date</label><input type="date" id="st-start" value="${esc(s.start||'')}"></div>
        <div class="field"><label>Card ID</label><input id="st-cardid" value="${esc(s.cardId||'')}"></div>
        <div class="field"><label>Tax File Number</label><input id="st-tfn" value="${esc(s.tfn||'')}"></div>
        <div class="field"><label>Street address</label><input id="st-address" value="${esc(s.address||'')}"></div>
        <div class="field"><label>Suburb / City</label><input id="st-suburb" value="${esc(s.suburb||'')}"></div>
        <div class="field"><label>Country</label><input id="st-country" value="${esc(s.country||'')}"></div>
        <div class="field"><label>Employment basis</label><input id="st-basis" value="${esc(s.basis||'')}" placeholder="Individual"></div>
        <div class="field"><label>Employment category</label><select id="st-cat"><option value=""></option>${sel(s.category,['Permanent','Temporary'])}</select></div>
        <div class="field"><label>Employment type</label><select id="st-estatus"><option value=""></option>${sel(s.estatus,['FullTime','PartTime','Casual'])}</select></div>
        <div class="field"><label>Status</label><select id="st-active"><option value="1" ${s.active?'selected':''}>Active</option><option value="0" ${!s.active?'selected':''}>Inactive</option></select></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn primary" onclick="staffSave('${ed}')">💾 Save</button>${ed!=='new'?`<button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="staffDelete('${esc(ed)}')"><i class="fas fa-trash"></i>&nbsp; Delete</button>`:''}</div>
      </div></div>`;
  }
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🧑‍🤝‍🧑</div><div><h2>Staff Members</h2><p>Team directory${isSuper()?' · all stores':' · '+esc(State.branch)}.</p></div>
      <div class="ph-actions"><button class="btn primary" onclick="staffNew()"><i class="fas fa-user-plus"></i>&nbsp; Add member</button></div></div>
    <div class="kpi-grid"><div class="kpi tone-info"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${rows.length}</div><div class="k-lbl">Total staff</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${active}</div><div class="k-lbl">Active</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🏪</div></div><div class="k-val">${new Set(rows.map(s=>s.store)).size}</div><div class="k-lbl">Stores</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧰</div></div><div class="k-val">${new Set(rows.map(s=>s.role)).size}</div><div class="k-lbl">Roles</div></div></div>
    ${editForm}
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Directory · ${rows.length}</h3><span class="ch-sub">${exportBtns('staff-table','Staff Directory — '+(isSuper()?'All stores':State.branch))}</span></div><div class="table-wrap"><table class="grid" id="staff-table"><thead><tr><th>Name</th><th>Dept</th><th>Role</th><th>Store</th><th>Phone</th><th>Email</th><th>DOB</th><th>Started</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${s.admin?'<span class="badge ok">ADMIN · all</span>':((Array.isArray(s.roles)&&s.roles.length)?s.roles.map(r=>`<span class="badge mute">${esc(r)}</span>`).join(' '):(s.dept?`<span class="badge mute">${esc(s.dept)}</span>`:'—'))}</td><td>${esc(s.role||s.classification||'')}</td><td>${esc(s.store)}</td><td>${esc(s.phone||'')}</td><td>${esc(s.email||'')}</td><td>${esc(s.dob||'—')}</td><td>${esc(s.start||'')}</td><td>${esc(s.estatus||s.category||'')}</td><td>${s.active?'<span class="badge ok"><span class="bdot"></span>Active</span>':'<span class="badge mute"><span class="bdot"></span>Inactive</span>'}</td><td><span class="ck-task-admin"><button onclick="staffEditOpen('${esc(s.id)}')" title="Edit">✎</button><button onclick="staffDelete('${esc(s.id)}')" title="Delete">🗑</button></span></td></tr>`).join('')}
      </tbody></table></div></div>`;
}
function staffNew(){ State.staffEdit='new'; renderStaff(); window.scrollTo({top:0,behavior:'smooth'}); }
function staffEditOpen(id){ const s=DB.staff.find(x=>x.id===id); if(!recordInScope(s)){ toast('This staff member belongs to another store'); return; } State.staffEdit=id; renderStaff(); window.scrollTo({top:0,behavior:'smooth'}); }
function staffCancel(){ State.staffEdit=null; renderStaff(); }
function staffSave(ed){
  const g=id=>(document.getElementById(id)?.value||'');
  const name=g('st-name').trim(); if(!name){ toast('Enter a name'); return; }
  const store=isSuper()?g('st-store'):State.branch;
  const role=g('st-role');
  const adminRole=document.getElementById('st-admin')?.checked||false;
  const roles=[...document.querySelectorAll('.st-role-cb:checked')].map(c=>c.value);
  const rec={name,dept:g('st-dept'),role,classification:role,roles,admin:adminRole,store,phone:g('st-phone'),email:g('st-email'),gender:g('st-gender'),
    dob:g('st-dob'),start:g('st-start'),cardId:g('st-cardid'),tfn:g('st-tfn'),address:g('st-address'),suburb:g('st-suburb'),
    country:g('st-country'),basis:g('st-basis'),category:g('st-cat'),estatus:g('st-estatus'),active:g('st-active')==='1'?1:0};
  if(ed==='new'){ rec.id=storeCode(store)+'-'+String(20000+Math.floor(Math.random()*9000)); auditLog('create','staff',rec.id,rec.store,null,rec); DB.staff.unshift(rec); }
  else { const s=DB.staff.find(x=>x.id===ed); if(!recordInScope(s)){ toast('This staff member belongs to another store'); return; } if(s){ const before=JSON.parse(JSON.stringify(s)); Object.assign(s,rec); auditLog('update','staff',s.id,s.store,before,s); } }
  if(window.persist) window.persist();
  State.staffEdit=null; toast('✓ Staff saved'); renderStaff();
}
function staffDelete(id){ if(!confirm('Delete this staff member permanently?')) return; const i=DB.staff.findIndex(x=>x.id===id); if(i>=0 && !recordInScope(DB.staff[i])){ toast('This staff member belongs to another store'); return; } if(i>=0){ const before=JSON.parse(JSON.stringify(DB.staff[i])); auditLog('delete','staff',before.id,before.store,before,null); DB.staff.splice(i,1); if(window.mcqDeleteRecords) mcqDeleteRecords('staff',[before.id],isSuper()?{store:before.store}:null); } if(window.persist) window.persist(); State.staffEdit=null; toast('🗑 Staff deleted'); renderStaff(); }

/* ============================================================ JOB SCHEDULE — duties per department + weekly roster */
const JOB_DUTIES={
  'Cashier':{icon:'fa-cash-register',color:'#0ea5e9',kw:'cashier',tasks:['Open tills, count float & test EFTPOS by 7:50am','Greet & serve customers, keep queues moving','Restock bags, receipt rolls & front counter','Face up cigarettes, medicine & front cabinets','Cash-up, process returns & reconcile tills at close']},
  'FV':{icon:'fa-carrot',color:'#10b981',kw:'fv',tasks:['Fill fruit & veg displays by 8:30am and 2:00pm','Quality-check & rotate stock, remove spoilage','Cut fruit / salad & pack second stock','Spray water on greens every 30 minutes','Clean cutting area, coolroom & crates']},
  'Grocery':{icon:'fa-basket-shopping',color:'#f59e0b',kw:'grocer',tasks:['Fill key-value lines & face up front shelves','Check price-label accuracy & promo tags','Random expiry check on short-dated stock','Keep aisles clear — no pallet jacks / boxes blocking','Flatten cartons & return left-behind products']},
  'Frozen & Dairy':{icon:'fa-snowflake',color:'#0891b2',kw:'dairy',tasks:['Fill dairy & frozen lines, face up shelves','Confirm fridge / freezer temps logged with Manager','Expiry check & markdowns completed','Keep fridges clean, clear & organised','Report any temperature alarm immediately']},
  'Butcher':{icon:'fa-drumstick-bite',color:'#ef4444',kw:'butcher',tasks:['Prepare sanitizer & paper towel at the station','Fill & face meat display, labels correct','Keep trays gapped front & back, rotate stock','Label & date all crates in the coldroom','Wrap & wash trays, wipe windows at close']},
  'Cosmetic':{icon:'fa-wand-magic-sparkles',color:'#ec4899',kw:'cosmetic',tasks:['Fully stock & face up all cosmetic shelves','Wipe glass cabinets fingerprint-free','Clean & top up tester units','Price new arrivals & check expiry / markdowns','Keep section neat, organised & shoppable']},
  'Office':{icon:'fa-file-invoice-dollar',color:'#64748b',kw:'manager',tasks:['Keep desks & tables clean and organised','Sort, file & check invoices against deliveries','Update price changes & print shelf labels','Send invoice batch to Head Office (Mon & Thu)','Count petty cash & back up daily sales report']},
  'Café':{icon:'fa-mug-hot',color:'#b45309',kw:'caf',tasks:['Set up café & check homemade / supplier fridge temps','Prep & display fresh items with correct labels','Keep counter, machine & seating clean','Descale coffee machine weekly','Cash-up & switch off appliances at close']},
};
function jobDuties(){
  if(!DB.jobDuties) DB.jobDuties=JSON.parse(JSON.stringify(JOB_DUTIES));
  return DB.jobDuties;
}
function jobRoster(){
  if(!DB.jobRoster) DB.jobRoster={};
  return DB.jobRoster;
}
function jobPersist(){ if(window.persist) window.persist(); }
function jobEditToggle(){ State.job=State.job||{}; State.job.edit=!State.job.edit; renderSchedule(); }
function jobSave(){ jobPersist(); toast('✓ Job schedule saved'); }
function jobSetDept(oldName,field,value){
  const d=jobDuties()[oldName]; if(!d) return;
  if(field==='name'){
    const name=String(value||'').trim(); if(!name||name===oldName) return;
    if(jobDuties()[name]){ toast('Department already exists'); return; }
    jobDuties()[name]=d; delete jobDuties()[oldName];
  }else d[field]=value;
  jobPersist(); renderSchedule();
}
function jobSetTasks(dept,value){ const d=jobDuties()[dept]; if(d){ d.tasks=String(value||'').split('\n').map(s=>s.trim()).filter(Boolean); jobPersist(); } }
function jobSetTeam(dept,value){ const d=jobDuties()[dept]; if(d){ d.team=String(value||'').split(',').map(s=>s.trim()).filter(Boolean); jobPersist(); renderSchedule(); } }
function jobAddDept(){ const name=(prompt('New department name:')||'').trim(); if(!name) return;
  if(jobDuties()[name]){ toast('Department already exists'); return; }
  jobDuties()[name]={icon:'fa-briefcase',color:'#0e9f6e',kw:name.toLowerCase(),team:[],tasks:['New duty']};
  jobPersist(); renderSchedule();
}
function jobDelDept(name){ if(!confirm('Delete this department from Job Schedule?')) return; delete jobDuties()[name]; jobPersist(); renderSchedule(); }
function jobRosterKey(si,di){ return si+'-'+di; }
function jobSetRoster(si,di,value){ jobRoster()[jobRosterKey(si,di)]=value; jobPersist(); }
function renderSchedule(){
  setAccent('#6a1b9a'); setCrumb('🗓️','Job Schedule','Daily duties by department & weekly roster');
  State.job=State.job||{edit:false};
  const edit=isAdmin()&&State.job.edit;
  const staff=DB.staff.filter(x=>x.active&&(isSuper()||x.store===State.branch));
  const pickFor=(d)=>{ let m=staff.filter(s=>String(s.role||'').toLowerCase().includes(d.kw)); if(!m.length) m=staff.filter(s=>/manager|supervisor/i.test(s.role||'')); if(!m.length) m=staff.slice(0,2); return m.slice(0,3); };
  const duties=jobDuties();
  const depts=Object.keys(duties);
  const dutyRows=depts.map(dept=>{ const d=duties[dept]; const team=(d.team&&d.team.length)?d.team:pickFor(d).map(s=>s.name); const names=team.length?team.map(s=>esc(s)).join(', '):'—';
    if(edit) return `<tr><td><div class="jd-edit-stack"><input value="${esc(dept)}" onchange="jobSetDept('${ckJS(dept)}','name',this.value)"><input value="${esc(d.icon||'fa-briefcase')}" onchange="jobSetDept('${ckJS(dept)}','icon',this.value)" placeholder="FontAwesome icon"><input type="color" value="${esc(d.color||'#0e9f6e')}" onchange="jobSetDept('${ckJS(dept)}','color',this.value)"><input value="${esc(d.kw||'')}" onchange="jobSetDept('${ckJS(dept)}','kw',this.value)" placeholder="staff role keyword"><button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="jobDelDept('${ckJS(dept)}')"><i class="fas fa-trash"></i></button></div></td><td><textarea rows="4" onchange="jobSetTeam('${ckJS(dept)}',this.value)" placeholder="Comma separated names">${esc(team.join(', '))}</textarea></td><td><textarea rows="6" onchange="jobSetTasks('${ckJS(dept)}',this.value)">${esc((d.tasks||[]).join('\n'))}</textarea></td></tr>`;
    return `<tr><td><span class="jd-dept" style="--c:${d.color}"><i class="fas ${d.icon||'fa-briefcase'}"></i> ${esc(dept)}</span></td><td>${names}</td><td><ul class="jd-tasks">${(d.tasks||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></td></tr>`;}).join('');
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const shifts=[['Open','06:00–14:00'],['Mid','09:00–17:00'],['Close','13:00–21:00']];
  let rnames=staff.map(s=>s.name); if(!rnames.length) rnames=['Anna B.','Sarah N.','Kim H.','David T.','Mai L.','Tuan N.','James P.','Lucy T.'];
  const roster=jobRoster();
  const cellName=(d,i)=>roster[jobRosterKey(i,d)]||rnames[(d+i)%rnames.length];
  const staffOptions=`<datalist id="job-staff-list">${rnames.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>`;
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗓️</div><div><h2>Job Schedule</h2><p>Concrete daily duties per department${isSuper()?' (all stores)':' · '+esc(State.branch)} and this week's roster.</p></div>
    <div class="ph-actions">${exportBtns('sched-duty-table','Job Schedule — Daily Duties')}${isAdmin()?`<button class="btn sm ${edit?'primary':''}" onclick="jobEditToggle()"><i class="fas fa-pen"></i>&nbsp; ${edit?'Done':'Edit'}</button><button class="btn sm primary" onclick="jobSave()"><i class="fas fa-save"></i>&nbsp; Save</button>`:''}</div></div>
    ${staffOptions}
    <div class="section-title">Daily duties by department</div>
    <div class="card"><div class="table-wrap"><table class="grid jobduty" id="sched-duty-table"><thead><tr><th>Department</th><th>Team on shift</th><th>Key daily duties</th></tr></thead><tbody>${dutyRows}</tbody></table></div>${edit?`<div class="card-pad"><button class="btn" onclick="jobAddDept()">＋ Add department</button></div>`:''}</div>
    <div class="section-title">This week's roster</div>
    <div class="card"><div class="table-wrap"><table class="grid sched"><thead><tr><th>Shift</th>${days.map(d=>`<th class="ctr">${d}</th>`).join('')}</tr></thead><tbody>
    ${shifts.map((sh,si)=>`<tr><td><b>${sh[0]}</b><div class="cell-sub">${sh[1]}</div></td>${days.map((d,di)=>`<td class="ctr">${edit?`<input class="job-roster-input" list="job-staff-list" value="${esc(cellName(di,si))}" onchange="jobSetRoster(${si},${di},this.value)">`:`<span class="shift-pill s${si}">${esc(cellName(di,si))}</span>`}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="section-title">Coverage by department</div><div class="card"><div class="card-pad"><div class="chart-box"><canvas id="sched-chart"></canvas></div></div></div>`;
  mkChart('sched-chart',{type:'bar',data:{labels:depts,datasets:[{label:'Shifts',data:depts.map((_,i)=>5+((i*3+4)%9)),backgroundColor:depts.map(d=>(duties[d]||{}).color||'#0e9f6e'),borderRadius:8,maxBarThickness:38}]},options:baseOpts({legend:false})});
}

/* ============================================================ EXPORT — branded Print / PDF / Excel / Word (dropdown) */
function exportBtns(tableId,title){ const t=ckJS(title||''), g=ckJS(tableId);
  return `<div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
    <div class="exp-menu">
      <button onclick="exportTablePrint('${g}','${t}')"><i class="fas fa-print"></i> Print</button>
      <button onclick="exportTablePDF('${g}','${t}')"><i class="fas fa-file-pdf"></i> PDF</button>
      <button onclick="exportTableExcel('${g}','${t}')"><i class="fas fa-file-excel"></i> Excel</button>
      <button onclick="exportTableWord('${g}','${t}')"><i class="fas fa-file-word"></i> Word</button>
    </div></div>`;
}
function expToggle(btn,e){ if(e)e.stopPropagation(); const dd=btn.closest('.exp-dd'); const wasOpen=dd.classList.contains('open');
  document.querySelectorAll('.exp-dd.open').forEach(d=>d.classList.remove('open'));
  if(!wasOpen){ dd.classList.add('open'); setTimeout(()=>document.addEventListener('click',expCloseAll,{once:true}),0); } }
function expCloseAll(){ document.querySelectorAll('.exp-dd.open').forEach(d=>d.classList.remove('open')); }
function expFileName(title,ext){ return 'MCQ_'+String(title||'report').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')+'_'+new Date().toISOString().slice(0,10)+'.'+ext; }
function expDownload(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},600); }
function expScope(){ return isSuper()?'All stores':State.branch; }
function expGetTable(id){ const t=document.getElementById(id); return t?t.innerHTML:null; }
function expColsOf(html){ const m=html.match(/<th[ >]/gi); return m?m.length:12; }
const EXP_CSS=`*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:28px}
  .rpt-head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e9f6e;padding-bottom:14px}
  .rpt-logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#0e9f6e,#0891b2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;letter-spacing:.5px;box-shadow:0 4px 10px rgba(14,159,110,.3)}
  .rpt-title{font-size:21px;font-weight:800;letter-spacing:-.01em}.rpt-sub{color:#6b7280;font-size:12px;margin-top:3px}
  .rpt-stamp{margin-left:auto;text-align:right;color:#9ca3af;font-size:10.5px;line-height:1.5}
  .rpt-meta{margin:14px 0 16px;color:#374151;font-size:12px;background:#f0fdf8;border:1px solid #bbf7d8;border-radius:10px;padding:10px 14px}.rpt-meta b{color:#0e9f6e}
  table{border-collapse:collapse;width:100%;font-size:11.5px}thead{display:table-header-group}
  th{background:#0e9f6e;color:#fff;text-align:left;padding:8px 10px;font-weight:700}
  td{border-bottom:1px solid #e5e7eb;padding:7px 10px;vertical-align:top}
  tr:nth-child(even) td{background:#f8fafc}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#eef2f7;color:#475569}
  .cbx{font-size:16px}.cbx.on{color:#0e9f6e}.cbx.off{color:#cbd5e1}
  .sched-dept td{background:#ecfdf5!important;color:#047857;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border-top:2px solid #a7f3d0}
  .sched-cbx{display:inline-block;width:22px;height:22px;line-height:20px;border:2px solid #94a3b8;border-radius:6px;font-size:15px;font-weight:900;color:#94a3b8;background:#fff}
  .sched-cbx.done{border-color:#16a34a;background:#dcfce7;color:#15803d}
  .sched-cbx.todo{border-color:#f59e0b;background:#fffbeb;color:#a16207}
  .sched-day{min-width:44px;text-align:center}.sched-day small{display:block;margin-top:3px;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase}
  .sign-line{display:block;min-width:84px;border-bottom:1px solid #94a3b8;height:18px}
  .note-line{display:block;min-width:100px;border-bottom:1px solid #cbd5e1;height:18px}
  ul{margin:0;padding-left:16px}li{margin:2px 0}
  td img{max-height:160px;height:auto;border-radius:8px;border:1px solid #e2e8f0;margin:3px}
  .rpt-foot{margin-top:22px;color:#9ca3af;font-size:10px;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  @page{margin:13mm}`;
const EXP_DOC_CSS=`table{border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt}th{background:#0e9f6e;color:#fff;border:1px solid #0b8f63;padding:6px 9px;text-align:left}td{border:1px solid #d9e2ec;padding:6px 9px;vertical-align:top}.cbx.on{color:#0e9f6e}.sched-dept td{background:#ecfdf5;color:#047857;font-weight:bold}.sched-cbx{font-size:16pt;font-weight:bold}.sched-cbx.done{color:#15803d}.sched-cbx.todo{color:#a16207}.sched-day{text-align:center}.sched-day small{display:block;font-size:8pt;color:#64748b}.sign-line,.note-line{display:block;border-bottom:1px solid #94a3b8;height:16px;min-width:80px}`;
function expPrintReport(title,inner,meta){
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to print / export'); return; }
  const when=new Date().toLocaleString(), role=isSuper()?'Super Admin':isAdmin()?'Admin':'Staff';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${EXP_CSS}</style></head><body>
    <div class="rpt-head">${MCQ_LOGO_URL?`<img src="${MCQ_LOGO_URL}" alt="MCQ" style="height:50px;width:auto;object-fit:contain">`:'<div class="rpt-logo">MCQ</div>'}<div><div class="rpt-title">${esc(title)}</div><div class="rpt-sub">MCQ Supermarket · ${esc(expScope())}</div></div><div class="rpt-stamp">${esc(when)}<br>${esc(role)} view</div></div>
    ${meta?`<div class="rpt-meta">${meta}</div>`:''}
    <table>${inner}</table>
    <div class="rpt-foot">MCQ Supermarket — Operations report · Confidential · Generated ${esc(when)}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>`);
  w.document.close();
}
function expDocBlob(title,inner,meta){
  const when=new Date().toLocaleString();
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${EXP_DOC_CSS}</style></head><body>
    ${MCQ_LOGO_URL?`<img src="${MCQ_LOGO_URL}" alt="MCQ" style="height:42px;width:auto"><br>`:''}
    <h2 style="color:#0e9f6e;margin:0 0 2px">MCQ Supermarket — ${esc(title)}</h2>
    <div style="color:#64748b;font-size:10pt;margin-bottom:10px">${esc(expScope())} · Generated ${esc(when)}</div>
    ${meta?`<div style="font-size:10pt;margin-bottom:10px">${meta}</div>`:''}
    <table>${inner}</table></body></html>`;
  expDownload(new Blob(['﻿'+html],{type:'application/msword'}), expFileName(title,'doc')); toast('⬇️ Word exported');
}
function expXlsBlob(title,inner,meta){
  const when=new Date().toLocaleString(), cols=expColsOf(inner);
  const style='<style>table{border-collapse:collapse;font-family:Calibri,Arial}th{background:#0e9f6e;color:#fff;border:1px solid #cbd5e1;padding:7px 10px;text-align:left;font-size:12px}td{border:1px solid #e2e8f0;padding:6px 10px;font-size:12px}.sched-dept td{background:#ecfdf5;color:#047857;font-weight:bold}.sched-cbx{font-size:16px;font-weight:bold}.sched-cbx.done{color:#15803d}.sched-cbx.todo{color:#a16207}.sched-day{text-align:center}.sched-day small{display:block;color:#64748b;font-size:9px}.sign-line,.note-line{display:block;border-bottom:1px solid #94a3b8;height:16px;min-width:80px}</style>';
  const head=`<tr><td colspan="${cols}" style="font-size:17px;font-weight:bold;color:#0e9f6e;padding:8px 10px">MCQ Supermarket — ${esc(title)}</td></tr><tr><td colspan="${cols}" style="color:#64748b;padding:0 10px 10px">${esc(expScope())} · Generated ${esc(when)}${meta?' · '+meta.replace(/<[^>]+>/g,''):''}</td></tr>`;
  const html='<html><head><meta charset="utf-8">'+style+'</head><body><table>'+head+inner+'</table></body></html>';
  expDownload(new Blob(['﻿'+html],{type:'application/vnd.ms-excel'}), expFileName(title,'xls')); toast('⬇️ Excel exported');
}
function exportTablePrint(id,title){ const h=expGetTable(id); if(!h){ toast('Nothing to export'); return; } const n=document.querySelectorAll('#'+id+' tbody tr').length; expPrintReport(title,h,`<b>Scope:</b> ${esc(expScope())} &nbsp; <b>Rows:</b> ${n}`); }
function exportTablePDF(id,title){ exportTablePrint(id,title); }
function exportTableExcel(id,title){ const h=expGetTable(id); if(!h){ toast('Nothing to export'); return; } expXlsBlob(title,h); }
function exportTableWord(id,title){ const h=expGetTable(id); if(!h){ toast('Nothing to export'); return; } expDocBlob(title,h); }

/* checklist export — reflects current done/notes/photos, with tick boxes */
/* MCQ logo as a data URL (works inside print windows, Word docs and jsPDF). */
let MCQ_LOGO_URL='';
(function(){ try{ const img=new Image(); img.onload=function(){ try{
  const max=200, s=Math.min(1,max/Math.max(img.naturalWidth||max,img.naturalHeight||max));
  const w=Math.round((img.naturalWidth||max)*s), h=Math.round((img.naturalHeight||max)*s);
  const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
  MCQ_LOGO_URL=c.toDataURL('image/png');   // small copy — keeps exported PDFs light & fast
}catch(e){} }; img.src='assets/mcq-logo-exact.png'; }catch(e){} })();

function checklistExportMenu(){
  return `<div class="exp-dd"><button class="btn sm exp-trigger" style="background:#25d366;border-color:#1eb155;color:#fff" onclick="expToggle(this,event)"><i class="fab fa-whatsapp"></i>&nbsp; Share PDF <i class="fas fa-caret-down"></i></button>
    <div class="exp-menu">
      <button onclick="ckSharePDF('Opening')">☀️ Opening — share PDF</button>
      <button onclick="ckSharePDF('Mid-afternoon')">🌤️ Mid-afternoon — share PDF</button>
      <button onclick="ckSharePDF('Closing')">🌙 Closing — share PDF</button>
      ${isSuper()?`<button onclick="ckAllStoresPDF()">🏪 All-stores report (PDF)</button>`:''}
    </div></div>
   <div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
    <div class="exp-menu">
      <button onclick="exportChecklist('print')"><i class="fas fa-print"></i> Print</button>
      <button onclick="exportChecklist('pdf')"><i class="fas fa-file-pdf"></i> PDF</button>
      <button onclick="exportChecklist('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button onclick="exportChecklist('word')"><i class="fas fa-file-word"></i> Word</button>
    </div></div>`;
}
/* Super Admin: one branded PDF covering EVERY store's submitted checklists for a date,
   with an overall cover, a per-store cover with stats, incomplete items and photos. */
async function ckAllStoresPDF(){
  toast('Building all-stores report…');
  try{ if(window.ensureJsPDF) await ensureJsPDF(); }catch(e){}
  if(!(window.jspdf&&window.jspdf.jsPDF)){ toast('PDF engine not ready — try again'); return; }
  const date=(State.chk&&State.chk.date)||new Date().toISOString().slice(0,10);
  const subs=(DB.checklistSubs||[]).filter(s=>s.date===date);
  if(!subs.length){ toast('No checklists submitted on '+date); return; }
  const stores=[...new Set(subs.map(s=>s.store))].sort();
  const urls=[]; subs.forEach(s=>(s.items||[]).forEach(it=>(it.photos||[]).forEach(u=>urls.push(u))));
  const pmap={}; await Promise.all([...new Set(urls)].slice(0,140).map(async u=>{ const d=await ckImgData(imgSrc(u),1200); if(d) pmap[u]=d; }));
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=40; let y=0;
  const ensure=h=>{ if(y+h>PH-40){ doc.addPage(); y=44; } };
  const totalTasks=subs.reduce((n,s)=>n+(s.total||0),0), doneTasks=subs.reduce((n,s)=>n+(s.done||0),0);
  const tempBad=subs.reduce((n,s)=>n+((s.items||[]).filter(it=>it.temp&&it.temp.inRange===false).length),0);
  // ---- overall cover ----
  doc.setFillColor(14,159,110); doc.rect(0,0,PW,PH,'F'); doc.setFillColor(11,125,143); doc.rect(0,PH-84,PW,84,'F');
  if(MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',PW/2-40,PH/2-176,80,80); }catch(e){} }
  doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(27); doc.text('MCQ Supermarket',PW/2,PH/2-70,{align:'center'});
  doc.setFontSize(15); doc.text('All-Stores Checklist Report',PW/2,PH/2-44,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.text(date+'   ·   '+stores.length+' store(s)',PW/2,PH/2-20,{align:'center'});
  const tiles=[['Stores',String(stores.length)],['Checklists',String(subs.length)],['Tasks done',doneTasks+'/'+totalTasks],['Temp alerts',String(tempBad)]];
  const tw=120,gap=12,span=tiles.length*tw+(tiles.length-1)*gap,sx=PW/2-span/2,ty=PH/2+6;
  tiles.forEach((t,i)=>{ const x=sx+i*(tw+gap); doc.setFillColor(255,255,255); doc.roundedRect(x,ty,tw,58,8,8,'F');
    doc.setTextColor(i===3&&tempBad?185:14,i===3&&tempBad?28:159,i===3&&tempBad?28:110); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text(String(t[1]),x+tw/2,ty+30,{align:'center'});
    doc.setTextColor(100); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(t[0],x+tw/2,ty+46,{align:'center'}); });
  doc.setTextColor(255); doc.setFontSize(9); doc.text('Generated '+new Date().toLocaleString()+'  ·  MCQ International',PW/2,PH-32,{align:'center'});
  // ---- per store ----
  stores.forEach(store=>{
    doc.addPage(); y=44;
    const ss=subs.filter(s=>s.store===store);
    const sTot=ss.reduce((n,s)=>n+(s.total||0),0), sDone=ss.reduce((n,s)=>n+(s.done||0),0), sBad=ss.reduce((n,s)=>n+((s.items||[]).filter(it=>it.temp&&it.temp.inRange===false).length),0);
    doc.setFillColor(14,159,110); doc.rect(0,0,PW,64,'F');
    let tx=M; if(MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',M,12,42,42); tx=M+54; }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(String(store),tx,30);
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.text(date+'  ·  '+sDone+'/'+sTot+' tasks done  ·  '+sBad+' temp alert(s)',tx,48);
    y=84;
    ss.forEach(s=>{
      ensure(24); doc.setFillColor(236,253,245); doc.roundedRect(M,y,PW-2*M,20,4,4,'F'); doc.setTextColor(15,118,110); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(String(s.dept)+' · '+String(s.session)+'   ('+(s.done||0)+'/'+(s.total||0)+' · '+(s.progress||0)+'%)',M+8,y+14); y+=26;
      const out=(s.items||[]).filter(it=>!it.done);
      if(out.length){ ensure(14); doc.setTextColor(185,28,28); doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.text('Incomplete ('+out.length+'):',M+8,y+9); y+=13;
        doc.setTextColor(80); doc.setFont('helvetica','normal'); doc.setFontSize(9);
        out.slice(0,25).forEach(it=>{ const l=doc.splitTextToSize('• '+String(it.task)+(it.note?('  — '+it.note):''),PW-2*M-16); ensure(l.length*11); doc.text(l,M+14,y+8); y+=l.length*11; }); y+=6;
      } else { ensure(12); doc.setTextColor(21,128,61); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('✓ All tasks completed.',M+8,y+8); y+=14; }
      const ph=(s.items||[]).reduce((a,it)=>a.concat((it.photos||[])),[]).map(u=>pmap[u]).filter(Boolean);
      if(ph.length){ const box=120,th=90,gp=8; let x=M+8; ensure(th+10); ph.slice(0,12).forEach(d=>{ if(x+box>PW-M){ x=M+8; y+=th+gp; ensure(th+10); } const ar=(d.w&&d.h)?d.w/d.h:4/3; let iw=box,ih=iw/ar; if(ih>th){ ih=th; iw=ih*ar; } try{ doc.addImage(d.data,'JPEG',x,y,iw,ih); }catch(e){} doc.setDrawColor(210); doc.rect(x,y,iw,ih); x+=box+gp; }); y+=th+14; }
    });
  });
  const n=doc.internal.getNumberOfPages(); for(let i=2;i<=n;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text('MCQ Supermarket · All-stores checklist report · Confidential',M,PH-16); doc.text('Page '+i+' / '+n,PW-M,PH-16,{align:'right'}); }
  const blob=doc.output('blob'); expDownload(blob,'MCQ_AllStores_Checklists_'+date+'.pdf'); toast('📄 All-stores report saved');
}
function ckHexToRgb(hex){ const m=/^#?([0-9a-f]{6})$/i.exec(hex||''); if(!m) return {r:14,g:159,b:110}; const n=parseInt(m[1],16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
function ckImgData(url,max,quality){ max=max||1400; quality=quality||0.9; return new Promise(res=>{ const img=new Image(); img.onload=()=>{ const s=Math.min(1,max/Math.max(img.width||max,img.height||max)); const w=Math.max(1,Math.round((img.width||max)*s)), h=Math.max(1,Math.round((img.height||max)*s)); try{ const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(img,0,0,w,h); res({data:c.toDataURL('image/jpeg',quality),w,h}); }catch(e){ res(null); } }; img.onerror=()=>res(null); img.src=url; }); }
/* Build a branded, photo-rich PDF for ONE session (Opening / Mid-afternoon /
   Closing) across all departments of the store, then share it to WhatsApp.
   Each of the three menu items generates its own session deliberately, so you
   can pick any session at any time. */
async function ckSharePDF(session){
  const C=DB.checklist;
  const rows=C.items.map(ckItem).filter(r=>ckStoreOk(r)&&ckInSession(r,session));
  if(!rows.length){ toast('No '+session+' tasks for this store'); return; }
  toast('Building '+session+' PDF…');
  try{ if(window.ensureJsPDF) await ensureJsPDF(); }catch(e){}
  if(!(window.jspdf&&window.jspdf.jsPDF)){ toast('PDF engine loading — using printable report'); return ckSessionPrint(session,rows); }
  const date=new Date().toISOString().slice(0,10);
  const store=isSuper()?'All stores':State.branch;
  let outCount=0; rows.forEach(r=>{ const st=State.chk.state[r.i]||{}; if(st.temp&&st.temp.inRange===false) outCount++; });
  // preload + downscale photos
  const urls=[]; rows.forEach(r=>{ const st=State.chk.state[r.i]||{}; (st.photos||[]).forEach(u=>urls.push(u)); });
  const pmap={}; await Promise.all([...new Set(urls)].map(async u=>{ const d=await ckImgData(imgSrc(u),1400); if(d) pmap[u]=d; }));
  const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4',orientation:'landscape'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=40; let y=96;
  const ensure=h=>{ if(y+h>PH-44){ doc.addPage(); y=44; } };
  // ---- branded cover page with statistics ----
  (function cover(){
    const total=rows.length; let dn=0; rows.forEach(r=>{ const st=State.chk.state[r.i]||{}; if(st.done) dn++; });
    doc.setFillColor(14,159,110); doc.rect(0,0,PW,PH,'F');
    doc.setFillColor(11,125,143); doc.rect(0,PH-90,PW,90,'F');
    if(MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',PW/2-40,PH/2-158,80,80); }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(30); doc.text('MCQ Supermarket',PW/2,PH/2-52,{align:'center'});
    doc.setFontSize(17); doc.text('Operations Checklist Report',PW/2,PH/2-24,{align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(13); doc.text(store+'    ·    '+session+'    ·    '+date,PW/2,PH/2+2,{align:'center'});
    const tiles=[['Tasks done',dn+'/'+total],['Complete',(total?Math.round(dn/total*100):0)+'%'],['Temp alerts',String(outCount)],['Incomplete',String(total-dn)]];
    const tw=150,gap=16,span=tiles.length*tw+(tiles.length-1)*gap,sx=PW/2-span/2,ty=PH/2+34;
    tiles.forEach((t,i)=>{ const x=sx+i*(tw+gap); doc.setFillColor(255,255,255); doc.roundedRect(x,ty,tw,60,9,9,'F');
      doc.setTextColor(i===2&&outCount?185:14,i===2&&outCount?28:159,i===2&&outCount?28:110); doc.setFont('helvetica','bold'); doc.setFontSize(21); doc.text(String(t[1]),x+tw/2,ty+31,{align:'center'});
      doc.setTextColor(100); doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(t[0],x+tw/2,ty+48,{align:'center'}); });
    doc.setTextColor(255); doc.setFontSize(9.5); doc.text('Generated '+new Date().toLocaleString()+'  ·  MCQ International',PW/2,PH-34,{align:'center'});
    doc.addPage();
  })();
  function header(){
    doc.setFillColor(14,159,110); doc.rect(0,0,PW,78,'F');
    let tx=M; if(MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',M,15,48,48); tx=M+60; }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('MCQ Supermarket',tx,34);
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.text('Operations Checklist — '+session,tx,54);
    doc.setFontSize(10); doc.text(store+'  ·  '+date,PW-M,42,{align:'right'});
    y=96;
  }
  header();
  if(outCount>0){ ensure(26); doc.setFillColor(254,242,242); doc.setDrawColor(220,38,38); doc.setLineWidth(0.8); doc.roundedRect(M,y,PW-2*M,22,4,4,'FD'); doc.setLineWidth(0.2); doc.setTextColor(185,28,28); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('TEMPERATURE ALERTS: '+outCount+' reading(s) OUT OF SAFE RANGE — see highlighted tasks below',M+12,y+15); y+=32; }
  const groups={}; rows.forEach(r=>{(groups[r.dept]=groups[r.dept]||{})[r.area]=(groups[r.dept][r.area]||[]);groups[r.dept][r.area].push(r);});
  let total=0,done=0;
  Object.entries(groups).forEach(([dept,areas])=>{
    const col=ckHexToRgb(((C.deptMeta&&C.deptMeta[dept])||{}).color);
    ensure(30); doc.setFillColor(col.r,col.g,col.b); doc.roundedRect(M,y,PW-2*M,22,4,4,'F');
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(String(dept),M+10,y+15); y+=30;
    Object.entries(areas).forEach(([area,items])=>{
      ensure(20); doc.setTextColor(90); doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.text(String(area).toUpperCase(),M+4,y+9); y+=16;
      items.forEach(r=>{ const st=State.chk.state[r.i]||{}; const ok=!!st.done; total++; if(ok)done++;
        const taskLines=doc.splitTextToSize(String(r.task),PW-2*M-30);
        const tline = st.temp ? (st.temp.defrosting?'Defrosting':((st.temp.value!=null?st.temp.value.toFixed(1)+' C':'')+(st.temp.inRange===false?'  OUT OF RANGE':''))) : '';
        const noteLines=st.note?doc.splitTextToSize('Note: '+st.note,PW-2*M-30):[];
        ensure(16+taskLines.length*12+(tline?12:0)+noteLines.length*11);
        doc.setDrawColor(ok?21:170,ok?128:170,ok?61:170); doc.setFillColor(ok?21:255,ok?128:255,ok?61:255);
        doc.roundedRect(M+4,y-1,12,12,2,2,ok?'FD':'D');
        if(ok){ doc.setDrawColor(255); doc.setLineWidth(1.6); doc.line(M+6.5,y+5,M+9,y+8); doc.line(M+9,y+8,M+13.5,y+2.5); doc.setLineWidth(0.2); }
        doc.setTextColor(30); doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(taskLines,M+24,y+8); let yy=y+8+taskLines.length*12-4;
        if(tline){ const bad=st.temp&&st.temp.inRange===false; doc.setTextColor(bad?185:20,bad?28:120,40); doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.text('Temp: '+tline,M+24,yy+10); yy+=12; }
        if(noteLines.length){ doc.setTextColor(115); doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.text(noteLines,M+24,yy+10); yy+=noteLines.length*11; }
        y=yy+10;
        const ph=(st.photos||[]).map(u=>pmap[u]).filter(Boolean);
        if(ph.length){ const box=250, th=188, gap=12; let x=M+24; ensure(th+12);
          ph.forEach(d=>{ if(x+box>PW-M){ x=M+24; y+=th+gap; ensure(th+12); }
            const ar=(d.w&&d.h)?d.w/d.h:4/3; let iw=box, ih=iw/ar; if(ih>th){ ih=th; iw=ih*ar; }
            try{ doc.addImage(d.data,'JPEG',x,y,iw,ih); }catch(e){} doc.setDrawColor(205); doc.setLineWidth(0.6); doc.rect(x,y,iw,ih); doc.setLineWidth(0.2); x+=box+gap; });
          y+=th+14;
        }
      });
    });
    y+=4;
  });
  const n=doc.internal.getNumberOfPages();
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text('MCQ Supermarket — '+store+' · '+session+' · Confidential',M,PH-18); doc.text('Page '+i+' / '+n,PW-M,PH-18,{align:'right'}); }
  const fileName='MCQ_'+store.replace(/\s+/g,'_')+'_'+session.replace(/\s+/g,'')+'_'+date+'.pdf';
  const blob=doc.output('blob'); const file=new File([blob],fileName,{type:'application/pdf'});
  const caption='*MCQ '+store+' — '+session+' Checklist*\n'+date+' · '+done+'/'+total+' tasks done'+(outCount?'\n⚠️ '+outCount+' temperature alert(s) — out of range':'');
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:fileName,text:caption}); toast('Shared ✓'); return; }
  }catch(e){ if(e&&e.name==='AbortError') return; }
  // device can't share files directly (e.g. desktop) → save the real PDF file so it can be attached
  expDownload(blob,fileName); toast('📄 PDF saved to your device — open WhatsApp and attach it'); try{ window.open('https://wa.me/?text='+encodeURIComponent(caption),'_blank'); }catch(e){}
}
/* fallback (no jsPDF): branded printable report with photos */
function ckSessionPrint(session,rows){
  const groups={}; rows.forEach(r=>{(groups[r.dept]=groups[r.dept]||{})[r.area]=(groups[r.dept][r.area]||[]);groups[r.dept][r.area].push(r);});
  let done=0,total=0; let body='<tbody>';
  Object.entries(groups).forEach(([dept,areas])=>{
    body+=`<tr><td colspan="3" style="background:#0e9f6e;color:#fff;font-weight:800">${esc(dept)}</td></tr>`;
    Object.entries(areas).forEach(([area,items])=>{
      body+=`<tr><td colspan="3" style="background:#ecfdf5;color:#047857;font-weight:700">${esc(area)}</td></tr>`;
      items.forEach(r=>{ const st=State.chk.state[r.i]||{}, ok=!!st.done; total++; if(ok)done++;
        const imgs=(st.photos||[]).map(u=>`<img src="${imgSrc(u)}" style="height:150px;border-radius:8px;margin:3px;border:1px solid #ddd">`).join('');
        const t=st.temp?`<div style="color:${st.temp.inRange===false?'#b91c1c':'#047857'};font-weight:700">Temp: ${st.temp.defrosting?'Defrosting':(st.temp.value!=null?st.temp.value.toFixed(1)+' C':'')}${st.temp.inRange===false?' (OUT OF RANGE)':''}</div>`:'';
        body+=`<tr><td style="text-align:center;font-size:16px">${ok?'☑':'☐'}</td><td>${esc(r.task)}${t}${st.note?`<div style="color:#64748b">${esc(st.note)}</div>`:''}</td><td>${imgs||'—'}</td></tr>`;
      });
    });
  });
  body+='</tbody>';
  const head='<thead><tr><th style="width:30px">✓</th><th>Task</th><th style="width:360px">Photos</th></tr></thead>';
  expPrintReport(`${session} Checklist`,head+body,`<b>Store:</b> ${esc(expScope())} &nbsp; <b>Session:</b> ${esc(session)} &nbsp; <b>Date:</b> ${new Date().toISOString().slice(0,10)} &nbsp; <b>Done:</b> ${done}/${total}`);
}
function exportChecklist(fmt){
  const C=DB.checklist, s=State.chk;
  const rows=C.items.map(ckItem).filter(r=>ckStoreOk(r) && r.dept===s.dept && ckInSession(r,s.session));
  if(!rows.length){ toast('No checklist tasks to export'); return; }
  const byArea={}; rows.forEach(r=>{(byArea[r.area]=byArea[r.area]||[]).push(r);});
  let done=0; rows.forEach(r=>{ if((State.chk.state[r.i]||{}).done) done++; });
  const head=`<thead><tr><th style="width:36px;text-align:center">✓</th><th>Task</th><th style="width:120px">Evidence</th><th>Note</th></tr></thead>`;
  let body='<tbody>';
  Object.entries(byArea).forEach(([area,items])=>{
    body+=`<tr><td colspan="4" style="background:#ecfdf5;font-weight:800;color:#0e9f6e">${esc(area)}</td></tr>`;
    items.forEach(r=>{ const st=State.chk.state[r.i]||{}, ok=!!st.done;
      const need=r.photo?(r.photo.req?r.photo.min:1):0, have=(st.photos||[]).length;
      const ev=r.photo?`📷 ${have}/${need}`:'—';
      body+=`<tr><td style="text-align:center"><span class="cbx ${ok?'on':'off'}">${ok?'☑':'☐'}</span></td><td>${esc(r.task)}</td><td>${esc(ev)}</td><td>${esc(st.note||'')}</td></tr>`;
    });
  });
  body+='</tbody>';
  const resp=(State.chk.resp||{})[s.dept]||{};
  const title=`Checklist — ${s.dept} · ${s.session}`;
  const meta=`<b>Store:</b> ${esc(expScope())} &nbsp; <b>Department:</b> ${esc(s.dept)} &nbsp; <b>Session:</b> ${esc(s.session)} &nbsp; <b>Date:</b> ${new Date().toISOString().slice(0,10)} &nbsp; <b>Done:</b> ${done}/${rows.length}${resp.p1?` &nbsp; <b>Responsible:</b> ${esc(resp.p1)}`:''}${resp.submittedBy?` &nbsp; <b>Submitted by:</b> ${esc(resp.submittedBy)}`:''}`;
  const inner=head+body;
  if(fmt==='excel') return expXlsBlob(title,inner,meta);
  if(fmt==='word') return expDocBlob(title,inner,meta);
  return expPrintReport(title,inner,meta);
}
/* dropdown that calls a custom fn(fmt) — for views without a DOM table id */
function expMenu(fnName){
  return `<div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
    <div class="exp-menu"><button onclick="${fnName}('print')"><i class="fas fa-print"></i> Print</button><button onclick="${fnName}('pdf')"><i class="fas fa-file-pdf"></i> PDF</button><button onclick="${fnName}('excel')"><i class="fas fa-file-excel"></i> Excel</button><button onclick="${fnName}('word')"><i class="fas fa-file-word"></i> Word</button></div></div>`;
}
/* build a branded export from records: cols=[{label,get}] */
function expRecords(title,cols,rows,fmt){
  const head='<thead><tr>'+cols.map(c=>`<th>${esc(c.label)}</th>`).join('')+'</tr></thead>';
  const body='<tbody>'+(rows.length?rows.map(r=>'<tr>'+cols.map(c=>{let v=c.get(r); if(v==null)v=''; return `<td>${esc(String(v))}</td>`;}).join('')+'</tr>').join(''):`<tr><td colspan="${cols.length}">No records.</td></tr>`)+'</tbody>';
  const inner=head+body, meta=`<b>Scope:</b> ${esc(expScope())} &nbsp; <b>Records:</b> ${rows.length} &nbsp; <b>Date:</b> ${new Date().toISOString().slice(0,10)}`;
  if(fmt==='excel') return expXlsBlob(title,inner,meta);
  if(fmt==='word') return expDocBlob(title,inner,meta);
  return expPrintReport(title,inner,meta);
}

/* ============================================================ CLEANING & MAINTENANCE — editable weekly schedule */
const SCHED_DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function schedWeekStart(off){ const d=new Date(); d.setHours(0,0,0,0); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd+(off||0)*7); return d; }
function schedWeekKey(off){ return schedWeekStart(off).toISOString().slice(0,10); }
function schedTickKey(id,day,off){ return schedWeekKey(off)+'|'+id+'|'+day; }
function schedTab(t){ State.sched=State.sched||{}; State.sched.tab=t; renderSchedules(); }
function schedWeek(delta){ State.sched=State.sched||{}; State.sched.week=(State.sched.week||0)+delta; renderSchedules(); }
function schedEditToggle(){ State.sched=State.sched||{}; State.sched.edit=!State.sched.edit; renderSchedules(); }
function schedStore(){ return isSuper()?((State.sched&&State.sched.store)||DB.stores[0]):State.branch; }
function schedSetStore(store){ State.sched=State.sched||{}; State.sched.store=store; renderSchedules(); }
function schedRecordForKey(k){ return (DB.scheduleHistory||[]).find(r=>r.tickKey===k); }
function schedTick(id,day){
  const off=(State.sched||{}).week||0, k=schedTickKey(id,day,off);
  DB.scheduleTicks=DB.scheduleTicks||{};
  if(DB.scheduleTicks[k]){
    const rec=schedRecordForKey(k);
    if(rec) return histOpenSchedule(rec.id);
    if(confirm('Remove this completed tick?')){ delete DB.scheduleTicks[k]; if(window.persist)window.persist(); renderSchedules(); }
    return;
  }
  schedCompleteOpen(id,day,off);
}
function schedDay(id,day){ const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return; t.days=t.days||[];
  const i=t.days.indexOf(day); if(i>=0)t.days.splice(i,1); else t.days.push(day); if(window.persist)window.persist(); renderSchedules(); }
function schedCompleteOpen(id,day,off){
  const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return;
  const store=schedStore(), date=schedWeekStart(off); date.setDate(date.getDate()+SCHED_DAYS.indexOf(day));
  State.schedComplete={taskId:id,day,week:off||0,store,date:date.toISOString().slice(0,10),staffName:(t.who||'').split(',')[0].trim(),note:'',photo:null};
  schedCompleteDrawer();
}
function schedCompleteSet(field,value){ State.schedComplete=State.schedComplete||{}; State.schedComplete[field]=value; }
async function schedCompletePhoto(input){
  const f=input.files&&input.files[0]; if(!f) return;
  const c=State.schedComplete||{}, t=(DB.scheduleTasks||[]).find(x=>x.id===c.taskId)||{};
  let ref; try{ const d=await compressImage(f,1600,.82); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d,{module:'scheduleHistory',store:c.store,taskId:c.taskId,day:c.day,date:c.date,type:t.type}):d; }catch(e){ ref=URL.createObjectURL(f); }
  c.photo=ref; schedCompleteDrawer(); toast('Photo evidence attached');
}
function schedCompleteDrawer(){
  const c=State.schedComplete||{}, t=(DB.scheduleTasks||[]).find(x=>x.id===c.taskId);
  if(!t)return;
  const listId='sched-complete-staff';
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">✅</div><div><div style="font-weight:840;font-size:16px">Complete ${esc(t.type==='maintenance'?'maintenance':'cleaning')} task</div><div style="color:var(--muted);font-size:12.5px">${esc(c.store)} · ${esc(c.date)} · ${esc(c.day)}</div></div><button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body sched-complete">
      ${staffDataList(listId,t.dept,c.staffName)}
      <div class="hist-record-title"><b>${esc(t.task)}</b><span>${esc(t.dept||'')} · ${esc(t.freq||'')}</span></div>
      <div class="field"><label>Completed by <span class="req">*</span></label><input list="${listId}" value="${esc(c.staffName||'')}" oninput="schedCompleteSet('staffName',this.value)" placeholder="Select or enter staff name"></div>
      <div class="field"><label>Note</label><textarea oninput="schedCompleteSet('note',this.value)" placeholder="Condition, issue found, follow-up needed">${esc(c.note||'')}</textarea></div>
      <label class="bin-photo hist-photo ${c.photo?'has':''}"><input type="file" accept="image/*" capture="environment" onchange="schedCompletePhoto(this)">${c.photo?`<img src="${imgSrc(c.photo)}" alt="Evidence">`:'<span><i class="fas fa-camera"></i><b>Photo required</b><small>Capture the completed task / area</small></span>'}</label>
      <button class="btn primary block lg" onclick="schedCompleteSubmit()"><i class="fas fa-check"></i> Save completion record</button>
    </div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function schedCompleteSubmit(){
  const c=State.schedComplete||{}, t=(DB.scheduleTasks||[]).find(x=>x.id===c.taskId);
  if(!t)return;
  const staff=String(c.staffName||'').trim();
  if(!staff){ toast('Enter completed by staff name'); return; }
  if(!c.photo){ toast('Photo evidence is required'); return; }
  const k=schedTickKey(c.taskId,c.day,c.week||0), store=c.store||schedStore();
  const rec={id:makeRecordId(t.type==='maintenance'?'MNT':'CLN',store,c.date),tickKey:k,store,date:c.date,day:c.day,type:t.type,dept:t.dept||'',taskId:t.id,task:t.task||'',frequency:t.freq||'',assigned:t.who||'',staffName:staff,note:c.note||'',photo:c.photo,created:new Date().toISOString(),createdBy:(State.account&&State.account.name)||staff};
  DB.scheduleHistory=DB.scheduleHistory||[]; DB.scheduleHistory.unshift(rec);
  DB.scheduleTicks=DB.scheduleTicks||{}; DB.scheduleTicks[k]=true;
  auditLog('create','scheduleHistory',rec.id,store,null,rec);
  State.schedComplete=null;
  closeDrawer();
  if(window.persist)window.persist();
  renderSchedules();
  toast('✓ Completion record saved with photo');
}
function schedDeleteHistory(id){
  const rec=(DB.scheduleHistory||[]).find(r=>r.id===id);
  if(!rec||!confirm('Delete this completion record?')) return;
  auditLog('delete','scheduleHistory',id,rec.store,rec,null);
  DB.scheduleHistory=(DB.scheduleHistory||[]).filter(r=>r.id!==id);
  if(window.mcqDeleteRecords) mcqDeleteRecords('schedule_history',[id],isSuper()?{store:rec.store}:null);
  if(rec.tickKey&&DB.scheduleTicks) delete DB.scheduleTicks[rec.tickKey];
  if(window.persist)window.persist();
  closeDrawer();
  render();
}
function schedAddTask(type,dept){
  if(!dept) dept=prompt('Department / area:','Whole store')||'Whole store';
  const task={id:'sch'+Date.now(),type:type,dept:dept,task:'New task',days:[],who:'',staffIds:[],freq:''};
  DB.scheduleTasks=DB.scheduleTasks||[]; DB.scheduleTasks.push(task);
  auditLog('create','scheduleTask',task.id,State.branch,null,task);
  if(window.persist)window.persist(); State.sched=State.sched||{}; State.sched.edit=true; renderSchedules();
}
function schedSetTask(id,field,value){
  const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return;
  const before=JSON.parse(JSON.stringify(t));
  t[field]=String(value||'').trim();
  if(field==='who'||field==='dept') t.staffIds=staffIdsForNames(t.who,t.dept);
  auditLog('update','scheduleTask',t.id,State.branch,before,t);
  if(window.persist)window.persist();
  if(field==='dept'||field==='type') renderSchedules();
}
function schedAssignStaff(id){
  const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return;
  const staff=staffForDept(t.dept,{fallbackAll:true});
  if(!staff.length){ toast('No active staff found for this store'); return; }
  const current=String(t.who||'').split(',').map(s=>s.trim()).filter(Boolean);
  const list=staff.map((s,i)=>`${i+1}. ${s.name} — ${s.role||'Staff'}`).join('\n');
  const ans=prompt(`Assign staff for ${t.dept || 'this task'}:\n${list}\n\nEnter number(s), e.g. 1 or 1,3`, current.join(', '));
  if(ans==null) return;
  const before=JSON.parse(JSON.stringify(t));
  const pickedStaff=String(ans).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
    const n=Number(x);
    if(Number.isInteger(n)&&n>=1&&n<=staff.length) return staff[n-1];
    return staff.find(s=>s.name===x)||{name:x,id:null};
  }).filter(Boolean);
  t.who=[...new Set(pickedStaff.map(s=>s.name).filter(Boolean))].join(', ');
  t.staffIds=[...new Set(pickedStaff.map(s=>s.id).filter(Boolean))];
  auditLog('assign','scheduleTask',t.id,State.branch,before,t);
  if(window.persist)window.persist();
  renderSchedules();
}
function schedClearStaff(id){ const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return; const before=JSON.parse(JSON.stringify(t)); t.who=''; t.staffIds=[]; auditLog('assign','scheduleTask',t.id,State.branch,before,t); if(window.persist)window.persist(); renderSchedules(); }
function schedEditTask(id){ const t=(DB.scheduleTasks||[]).find(x=>x.id===id); if(!t)return; State.sched=State.sched||{}; State.sched.edit=true; renderSchedules(); }
function schedDelTask(id){ if(!confirm('Delete this scheduled task?'))return; const before=(DB.scheduleTasks||[]).find(x=>x.id===id); if(before) auditLog('delete','scheduleTask',id,State.branch,before,null); DB.scheduleTasks=(DB.scheduleTasks||[]).filter(x=>x.id!==id);
  Object.keys(DB.scheduleTicks||{}).forEach(k=>{ if(k.indexOf('|'+id+'|')>=0) delete DB.scheduleTicks[k]; }); if(window.persist)window.persist(); renderSchedules(); }
function schedSave(){ if(window.MCQDB && MCQDB.enabled && MCQDB.saveAll){ MCQDB.saveAll(); } else if(window.persist){ window.persist(); } toast('✓ Schedule saved'); }
/* responsible = assigned staff and/or external technician (name + phone + location) */
function schedRespText(t){ const parts=[]; const s=staffDisplayForTask(t); if(s&&s!=='—') parts.push(s);
  if(t.techName||t.techPhone){ parts.push('🔧 '+[t.techName,t.techPhone,t.techNote].filter(Boolean).join(' · ')); }
  return parts.join('  ·  ')||'—'; }
function schedRespHTML(t){ const s=staffDisplayForTask(t); let h = (s&&s!=='—')?`👤 <span class="sc-who-name">${esc(s)}</span>`:'';
  if(t.techName||t.techPhone){ h += (h?'<br>':'') + `<span class="sc-tech-line">🔧 ${esc(t.techName||'Technician')}${t.techPhone?` · 📞 <a href="tel:${esc(t.techPhone)}">${esc(t.techPhone)}</a>`:''}${t.techNote?` · 📍 ${esc(t.techNote)}`:''}</span>`; }
  return h||'—'; }
/* export the weekly grid with checkbox cells for PDF / Excel sign-off */
function schedGridInner(type,off){
  const tasks=(DB.scheduleTasks||[]).filter(t=>t.type===type), ticks=DB.scheduleTicks||{};
  const depts=[...new Set(tasks.map(t=>t.dept))];
  const cols=12;
  const head='<thead><tr><th style="width:27%">Task</th><th>Responsible</th><th>Frequency</th>'+SCHED_DAYS.map(d=>`<th style="text-align:center">${d}</th>`).join('')+'<th>Checked by</th><th>Notes</th></tr></thead>';
  let body='<tbody>';
  depts.forEach(dep=>{
    body+=`<tr class="sched-dept"><td colspan="${cols}">${esc(dep)}</td></tr>`;
    tasks.filter(t=>t.dept===dep).forEach(t=>{
      const cells=SCHED_DAYS.map(d=>{ if(!(t.days||[]).includes(d)) return '<td class="sched-day" style="text-align:center;color:#cbd5e1">—</td>';
        const ticked=!!ticks[schedTickKey(t.id,d,off)];
        return `<td class="sched-day" style="text-align:center;background:${ticked?'#dcfce7':'#fffbeb'}"><span class="sched-cbx ${ticked?'done':'todo'}">${ticked?'✓':'□'}</span><small>${ticked?'Done':'Tick'}</small></td>`; }).join('');
      body+=`<tr><td>${esc(t.task)}</td><td>${esc(schedRespText(t))}</td><td>${esc(t.freq||'')}</td>${cells}<td><span class="sign-line"></span></td><td><span class="note-line"></span></td></tr>`;
    });
  });
  return head+body+'</tbody>';
}
function schedExport(fmt){ const type=(State.sched||{}).tab||'cleaning', off=(State.sched||{}).week||0;
  const ws=schedWeekStart(off), wk=ws.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' – '+new Date(ws.getTime()+6*864e5).toLocaleDateString(undefined,{day:'numeric',month:'short'});
  const title=(type==='cleaning'?'Cleaning':'Maintenance')+' Weekly Schedule';
  const meta=`<b>Week:</b> ${esc(wk)} &nbsp; <b>Scope:</b> ${esc(expScope())} &nbsp; <b>Legend:</b> □ scheduled · ✓ completed`;
  const inner=schedGridInner(type,off);
  if(fmt==='excel') return expXlsBlob(title,inner,meta);
  if(fmt==='word') return expDocBlob(title,inner,meta);
  return expPrintReport(title,inner,meta);
}
function renderSchedules(){
  if(!State.sched) State.sched={tab:'cleaning',week:0,edit:false};
  const type=State.sched.tab||'cleaning', off=State.sched.week||0, edit=isAdmin()&&State.sched.edit;
  const accent=type==='cleaning'?'#0e9f6e':'#f59e0b', icon=type==='cleaning'?'🧽':'🔧';
  setAccent(accent); setCrumb(icon,'Cleaning & Maintenance', (type==='cleaning'?'Cleaning':'Maintenance')+' weekly schedule');
  const tasks=(DB.scheduleTasks||[]).filter(t=>t.type===type);
  const ws=schedWeekStart(off), wkLabel=ws.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' – '+new Date(ws.getTime()+6*864e5).toLocaleDateString(undefined,{day:'numeric',month:'short'});
  const storePick=isSuper()?`<select class="login-input" style="width:auto" onchange="schedSetStore(this.value)">${DB.stores.map(st=>`<option ${st===schedStore()?'selected':''}>${esc(st)}</option>`).join('')}</select>`:'';
  // KPIs: scheduled cells this week vs ticked
  let sched=0,doneN=0; tasks.forEach(t=>(t.days||[]).forEach(d=>{ sched++; if((DB.scheduleTicks||{})[schedTickKey(t.id,d,off)]) doneN++; }));
  const depts=[...new Set(tasks.map(t=>t.dept))];
  const seg=`<div class="seg seg-light"><button class="seg-btn ${type==='cleaning'?'active':''}" onclick="schedTab('cleaning')">🧽 Cleaning</button><button class="seg-btn ${type==='maintenance'?'active':''}" onclick="schedTab('maintenance')">🔧 Maintenance</button></div>`;
  const todayIdx=(new Date().getDay()+6)%7;
  const grids=depts.map(dep=>{ const dt=tasks.filter(t=>t.dept===dep); const meta=(DB.checklist.deptMeta||{})[String(dep).toUpperCase()]||{color:accent};
    const rows=dt.map(t=>{
      const cells=SCHED_DAYS.map((d,di)=>{ const on=(t.days||[]).includes(d); const ticked=!!(DB.scheduleTicks||{})[schedTickKey(t.id,d,off)];
        if(edit){ return `<td class="sc-cell ${on?'sch-on':'sch-off'}" onclick="schedDay('${t.id}','${d}')" title="Click to ${on?'unschedule':'schedule'}">${on?'●':'+'}</td>`; }
        if(on) return `<td class="sc-cell sch-on ${ticked?'sch-done':''} ${di===todayIdx&&off===0?'sch-today':''}" onclick="schedTick('${t.id}','${d}')">${ticked?'✓':''}</td>`;
        return `<td class="sc-cell sch-off">·</td>`;
      }).join('');
      const listId='sc-staff-'+String(t.id).replace(/[^a-z0-9_-]/gi,'-');
      const resp=staffDisplayForTask(t);
      const nameCell = edit
        ? `<td class="sc-task">${staffDataList(listId,t.dept,t.who)}
            <select class="sc-type-select" onchange="schedSetTask('${ckJS(t.id)}','type',this.value)"><option value="cleaning" ${t.type==='cleaning'?'selected':''}>Cleaning</option><option value="maintenance" ${t.type==='maintenance'?'selected':''}>Maintenance</option></select>
            <input class="sc-task-input" value="${esc(t.task)}" onchange="schedSetTask('${ckJS(t.id)}','task',this.value)" placeholder="Task">
            <div class="sc-edit-row">
              <input class="sc-dept-input" value="${esc(t.dept||'')}" onchange="schedSetTask('${ckJS(t.id)}','dept',this.value)" placeholder="Department">
              <input class="sc-who-input" list="${listId}" value="${esc(t.who||'')}" onchange="schedSetTask('${ckJS(t.id)}','who',this.value)" placeholder="Staff">
              <input class="sc-freq-input" value="${esc(t.freq||'')}" onchange="schedSetTask('${ckJS(t.id)}','freq',this.value)" placeholder="Frequency">
            </div>
            <div class="sc-tech-edit"><span class="sc-tech-h">🔧 External technician (if a tradesperson comes to fix)</span>
              <div class="sc-edit-row">
                <input class="sc-tech-input" value="${esc(t.techName||'')}" onchange="schedSetTask('${ckJS(t.id)}','techName',this.value)" placeholder="Technician / company name">
                <input class="sc-tech-input" type="tel" value="${esc(t.techPhone||'')}" onchange="schedSetTask('${ckJS(t.id)}','techPhone',this.value)" placeholder="📞 Phone number">
                <input class="sc-tech-input" value="${esc(t.techNote||'')}" onchange="schedSetTask('${ckJS(t.id)}','techNote',this.value)" placeholder="📍 Location / what to fix">
              </div></div>
            <div class="sc-actions"><button onclick="schedAssignStaff('${ckJS(t.id)}')">👤 Assign staff</button><button onclick="schedClearStaff('${ckJS(t.id)}')">Clear staff</button><button class="danger" onclick="schedDelTask('${ckJS(t.id)}')">🗑 Delete</button></div></td>`
        : `<td class="sc-task"><b>${esc(t.task)}</b><div class="sc-who">${schedRespHTML(t)}${t.freq?' · '+esc(t.freq):''}</div></td>`;
      return `<tr>${nameCell}${cells}</tr>`;
    }).join('');
    return `<div class="card sc-card"><div class="card-head" style="--dc:${meta.color}"><h3><span class="chk-dot" style="background:${meta.color}"></span>${esc(dep)}</h3>${edit?`<button class="btn sm" style="margin-left:auto" onclick="schedAddTask('${type}','${ckJS(dep)}')">＋ Add task</button>`:''}</div>
      <div class="table-wrap"><table class="grid sc-grid"><thead><tr><th>Task</th>${SCHED_DAYS.map((d,di)=>`<th class="ctr ${di===todayIdx&&off===0?'sch-today-h':''}">${d}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="8"><div class="empty">No tasks.</div></td></tr>`}</tbody></table></div></div>`;
  }).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:${accent}1f">${icon}</div><div><h2>Cleaning &amp; Maintenance</h2><p>Weekly schedule by department — managers tick off each scheduled day.${edit?' <b>Edit mode:</b> click a day to schedule/unschedule.':''}</p></div>
      <div class="ph-actions">${storePick}${seg} ${expMenu('schedExport')}<button class="btn sm primary" onclick="schedSave()"><i class="fas fa-save"></i>&nbsp; Save</button>${isAdmin()?`<button class="btn sm ${edit?'primary':''}" onclick="schedEditToggle()"><i class="fas fa-pen"></i>&nbsp; ${edit?'Done':'Edit'}</button>`:''}</div></div>
    <div class="sc-weekbar"><button class="btn sm" onclick="schedWeek(-1)">‹ Prev</button><div class="sc-week"><b>Week of ${esc(wkLabel)}</b>${off===0?'<span class="badge ok">This week</span>':`<button class="btn sm" onclick="schedWeek(${-off})">This week</button>`}</div><button class="btn sm" onclick="schedWeek(1)">Next ›</button></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🗓️</div></div><div class="k-val">${tasks.length}</div><div class="k-lbl">Tasks</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🟡</div></div><div class="k-val">${sched}</div><div class="k-lbl">Scheduled this week</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${doneN}</div><div class="k-lbl">Ticked done</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">⏳</div></div><div class="k-val">${sched-doneN}</div><div class="k-lbl">Outstanding</div></div>
    </div>
    <div class="sc-prog"><span class="pbar" style="flex:1"><i style="width:${sched?Math.round(doneN/sched*100):0}%;background:${accent}"></i></span><b>${sched?Math.round(doneN/sched*100):0}%</b></div>
    ${grids||'<div class="empty">No scheduled tasks. '+(isAdmin()?'Use Edit → Add task.':'')+'</div>'}
    ${edit?`<button class="btn block" style="margin-top:14px" onclick="schedAddTask('${type}','')">＋ Add task / department</button>`:''}`;
}

/* ============================================================ BIN ADMIN */
function binCfg(){ DB.binAdmin=DB.binAdmin||{activeDays:['Tue','Thu','Fri'],checklist:[],records:[]}; return DB.binAdmin; }
function binState(){
  const b=binCfg(), active=(b.activeDays&&b.activeDays[0])||'Tue';
  State.bin=State.bin||{week:0,day:active,edit:false,store:isSuper()?DB.stores[0]:State.branch,checks:{},name:'',qty:'',photo:null};
  if(!State.bin.day) State.bin.day=active;
  if(isSuper()&&!State.bin.store) State.bin.store=DB.stores[0];
  return State.bin;
}
function binStore(){ const s=binState(); return isSuper()?(s.store||DB.stores[0]):State.branch; }
function binWeek(delta){ const s=binState(); s.week=(s.week||0)+delta; renderBinAdmin(); }
function binSelect(day){ const b=binCfg(); if(!(b.activeDays||[]).includes(day)){ toast('No bin checklist scheduled for '+day); return; } const s=binState(); s.day=day; s.checks={}; s.name=''; s.qty=''; s.photo=null; renderBinAdmin(); }
function binSetStore(store){ const s=binState(); s.store=store; s.checks={}; s.name=''; s.qty=''; s.photo=null; renderBinAdmin(); }
function binSet(field,value){ const s=binState(); s[field]=value; }
function binToggleTask(id,on){ const s=binState(); s.checks=s.checks||{}; s.checks[id]=!!on; }
function binDayDate(day,off){ const start=schedWeekStart(off||0), idx=SCHED_DAYS.indexOf(day), d=new Date(start); d.setDate(start.getDate()+Math.max(0,idx)); return d; }
function binDayKey(day,off){ return binDayDate(day,off).toISOString().slice(0,10); }
function binRecordsForWeek(){
  const s=binState(), store=binStore(), start=schedWeekStart(s.week||0), end=new Date(start); end.setDate(start.getDate()+7);
  return (binCfg().records||[]).filter(r=>(isSuper()?r.store===store:r.store===State.branch) && new Date(r.date)>=start && new Date(r.date)<end);
}
async function binPhoto(input){
  const f=input.files&&input.files[0]; if(!f) return;
  const s=binState();
  let ref; try{ const d=await compressImage(f,1600,.82); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d,{module:'binAdmin',store:binStore(),day:s.day,date:binDayKey(s.day,s.week||0)}):d; }catch(e){ ref=URL.createObjectURL(f); }
  s.photo=ref; renderBinAdmin(); toast('Photo evidence attached');
}
function binSubmit(){
  const cfg=binCfg(), s=binState(), store=binStore(), active=cfg.activeDays||[], tasks=cfg.checklist||[];
  if(!active.includes(s.day)){ toast('This day is not scheduled for bin collection'); return; }
  const name=String(s.name||'').trim(), qty=Number(s.qty);
  if(!name){ toast('Enter staff name'); return; }
  if(!Number.isFinite(qty)||qty<=0){ toast('Enter bin quantity'); return; }
  if(!s.photo){ toast('Photo evidence is required'); return; }
  const missing=tasks.filter(t=>!s.checks||!s.checks[t.id]);
  if(missing.length){ toast('Complete every bin checklist item before submit'); return; }
  const rec={id:makeRecordId('BIN',store,binDayDate(s.day,s.week||0)),store,date:binDayKey(s.day,s.week||0),day:s.day,staffName:name,binQty:qty,photo:s.photo,
    checklist:tasks.map(t=>({id:t.id,task:t.task,done:true})),created:new Date().toISOString(),createdBy:(State.account&&State.account.name)||name};
  cfg.records=cfg.records||[]; cfg.records.unshift(rec);
  auditLog('create','binAdmin',rec.id,store,null,rec);
  s.checks={}; s.name=''; s.qty=''; s.photo=null;
  if(window.persist) window.persist();
  renderBinAdmin();
  toast('✓ Bin checklist saved with photo and timestamp');
}
function binEditToggle(){ const s=binState(); s.edit=!s.edit; renderBinAdmin(); }
function binSetActive(day,on){ const cfg=binCfg(); cfg.activeDays=cfg.activeDays||[]; const i=cfg.activeDays.indexOf(day); if(on&&i<0) cfg.activeDays.push(day); if(!on&&i>=0) cfg.activeDays.splice(i,1); cfg.activeDays.sort((a,b)=>SCHED_DAYS.indexOf(a)-SCHED_DAYS.indexOf(b)); if(window.persist) window.persist(); renderBinAdmin(); }
function binTaskSet(id,value){ const t=(binCfg().checklist||[]).find(x=>x.id===id); if(!t) return; t.task=String(value||'').trim(); if(window.persist) window.persist(); }
function binTaskAdd(){ const cfg=binCfg(); cfg.checklist=cfg.checklist||[]; cfg.checklist.push({id:'bin-'+Date.now(),task:'NEW BIN CHECKLIST ITEM'}); if(window.persist) window.persist(); renderBinAdmin(); }
function binTaskDel(id){ const cfg=binCfg(); if(!confirm('Delete this bin checklist item?')) return; cfg.checklist=(cfg.checklist||[]).filter(t=>t.id!==id); if(window.persist) window.persist(); renderBinAdmin(); }
function binDeleteRecord(id){ const cfg=binCfg(); const rec=(cfg.records||[]).find(r=>r.id===id); if(!rec||!confirm('Delete this bin record?')) return; auditLog('delete','binAdmin',id,rec.store,rec,null); cfg.records=(cfg.records||[]).filter(r=>r.id!==id); if(window.persist) window.persist(); renderBinAdmin(); }
function renderBinAdmin(){
  const cfg=binCfg(), s=binState(), store=binStore(), active=cfg.activeDays||[], tasks=cfg.checklist||[], edit=isAdmin()&&s.edit;
  setAccent('#64748b'); setCrumb('🗑️','Bin Admin',`${store} · weekly bin collection checklist`);
  const today=(new Date().getDay()+6)%7, records=binRecordsForWeek();
  const storePick=isSuper()?`<select class="login-input" style="width:auto" onchange="binSetStore(this.value)">${DB.stores.map(st=>`<option ${st===store?'selected':''}>${esc(st)}</option>`).join('')}</select>`:'';
  const dayCards=SCHED_DAYS.map((d,idx)=>{ const on=active.includes(d), selected=s.day===d, recs=records.filter(r=>r.day===d);
    return `<button class="bin-day ${on?'on':'off'} ${selected?'selected':''} ${idx===today&&s.week===0?'today':''}" onclick="binSelect('${d}')" ${on?'':'disabled'}>
      <b>${d}</b><span>${binDayDate(d,s.week||0).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</span>
      <small>${on?(recs.length?recs.length+' submitted':'Checklist open'):'No bin pickup'}</small>
    </button>`;
  }).join('');
  const checklist=tasks.map(t=>`<label class="bin-check"><input type="checkbox" ${s.checks&&s.checks[t.id]?'checked':''} onchange="binToggleTask('${ckJS(t.id)}',this.checked)"><span>${esc(t.task)}</span></label>`).join('');
  const form=active.includes(s.day)?`<div class="card bin-form">
    <div class="card-head"><h3>${esc(s.day)} bin checklist</h3><span class="ch-sub">${esc(binDayKey(s.day,s.week||0))}</span></div>
    <div class="card-pad">
      <div class="grid2">
        <div class="field"><label>Staff name <span class="req">*</span></label><input value="${esc(s.name||'')}" oninput="binSet('name',this.value)" placeholder="Enter staff name"></div>
        <div class="field"><label>Bin quantity taken <span class="req">*</span></label><input type="number" min="1" step="1" value="${esc(s.qty||'')}" oninput="binSet('qty',this.value)" placeholder="e.g. 6"></div>
      </div>
      <div class="bin-checklist">${checklist||'<div class="empty compact">No bin checklist items configured.</div>'}</div>
      <div class="bin-photo-row">
        <label class="bin-photo ${s.photo?'has':''}"><input type="file" accept="image/*" capture="environment" onchange="binPhoto(this)">${s.photo?`<img src="${imgSrc(s.photo)}" alt="Bin evidence">`:'<span><i class="fas fa-camera"></i><b>Photo required</b><small>Take photo of bins / collection area</small></span>'}</label>
        <button class="btn primary" onclick="binSubmit()"><i class="fas fa-check"></i> Submit bin checklist</button>
      </div>
    </div></div>`:`<div class="card card-pad bin-closed"><b>${esc(s.day)} is not scheduled for bin collection.</b><span>Only ${active.map(esc).join(', ')} can be checked. Admin can change this in Edit mode.</span></div>`;
  const editPanel=edit?`<div class="card bin-edit"><div class="card-head"><h3>Admin edit</h3><button class="btn sm" style="margin-left:auto" onclick="binTaskAdd()"><i class="fas fa-plus"></i> Add task</button></div><div class="card-pad">
    <div class="bin-edit-days">${SCHED_DAYS.map(d=>`<label><input type="checkbox" ${active.includes(d)?'checked':''} onchange="binSetActive('${d}',this.checked)"> ${d}</label>`).join('')}</div>
    <div class="bin-edit-list">${tasks.map(t=>`<div><input value="${esc(t.task)}" onchange="binTaskSet('${ckJS(t.id)}',this.value)"><button class="btn sm" onclick="binTaskDel('${ckJS(t.id)}')"><i class="fas fa-trash"></i></button></div>`).join('')}</div>
  </div></div>`:'';
  const recRows=records.map(r=>`<tr><td><b>${esc(r.id)}</b><div class="cell-sub">${esc(r.date)} · ${esc(r.day)}</div></td><td>${esc(r.staffName)}</td><td class="num">${esc(r.binQty)}</td><td>${r.photo?`<img class="bin-thumb" src="${imgSrc(r.photo)}" alt="">`:'—'}</td><td>${esc((r.created||'').slice(0,16).replace('T',' '))}</td><td>${isAdmin()?`<button class="btn sm" onclick="binDeleteRecord('${ckJS(r.id)}')"><i class="fas fa-trash"></i></button>`:''}</td></tr>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗑️</div><div><h2>Bin Admin</h2><p>Weekly bin checklist with required staff name, bin quantity and photo evidence.</p></div>
    <div class="ph-actions">${storePick}<button class="btn sm" onclick="binWeek(-1)">‹ Prev</button><button class="btn sm" onclick="binWeek(${-(s.week||0)})">This week</button><button class="btn sm" onclick="binWeek(1)">Next ›</button>${isAdmin()?`<button class="btn sm ${edit?'primary':''}" onclick="binEditToggle()"><i class="fas fa-pen"></i> ${edit?'Done':'Edit'}</button>`:''}</div></div>
    <div class="bin-days">${dayCards}</div>
    ${editPanel}
    ${form}
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Submitted bin records</h3><span class="ch-sub">${records.length} this week</span></div><div class="table-wrap"><table class="grid"><thead><tr><th>Record</th><th>Staff</th><th>Qty</th><th>Photo</th><th>Created</th><th></th></tr></thead><tbody>${recRows||'<tr><td colspan="6"><div class="empty compact">No bin records for this week.</div></td></tr>'}</tbody></table></div></div>`;
}

/* ============================================================ CHECKLIST HISTORY */
function histState(){
  State.hist=State.hist||{tab:'checklist',store:isSuper()?'All stores':State.branch,dept:'All departments',q:'',date:''};
  if(State.hist.date===undefined) State.hist.date='';
  if(!isSuper()) State.hist.store=State.branch;
  return State.hist;
}
function histDateOk(r){ const d=histState().date; return !d||String(r.date||'').slice(0,10)===d; }
function histTab(tab){ const h=histState(); h.tab=tab; h.dept='All departments'; renderHistory(); }
function histSet(k,v){ const h=histState(); h[k]=v; renderHistory(); }
function histStoreOk(r){ const h=histState(); return h.store==='All stores'||r.store===h.store; }
function histTextOk(r){ const q=staffNorm(histState().q||''); return !q||staffNorm(JSON.stringify(r)).includes(q); }
function histPhotos(list){ return (list||[]).filter(Boolean); }
function histStrip(photos){
  photos=histPhotos(photos).slice(0,5);
  return photos.length?`<div class="hist-photos">${photos.map(p=>`<img src="${imgSrc(p)}" alt="" style="cursor:zoom-in" onclick="event.stopPropagation();openLightbox('${ckJS(imgSrc(p))}')">`).join('')}</div>`:'<div class="hist-no-photo">No photo evidence</div>';
}
function histChecklistRows(){
  const h=histState();
  return (DB.checklistSubs||[]).filter(r=>histStoreOk(r)&&histTextOk(r)&&(h.dept==='All departments'||r.dept===h.dept))
    .sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
}
function histBinRows(){
  return ((DB.binAdmin&&DB.binAdmin.records)||[]).filter(r=>histStoreOk(r)&&histTextOk(r))
    .sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
}
function histScheduleRows(){
  const h=histState();
  return (DB.scheduleHistory||[]).filter(r=>r.type!=='handover'&&histStoreOk(r)&&histTextOk(r)&&(h.dept==='All departments'||r.dept===h.dept))
    .sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
}
function histOpenChecklist(id){
  const sub=(DB.checklistSubs||[]).find(r=>r.id===id); if(!sub) return;
  const photos=[]; (sub.items||[]).forEach(it=>(it.photos||[]).forEach(p=>photos.push({src:p,task:it.task,area:it.area})));
  const rows=(sub.items||[]).map(it=>`<div class="hist-line ${it.done?'done':'todo'}">
    <div><b>${it.done?'✓':'○'} ${esc(it.task)}</b><span>${esc(it.area||'General')}${it.note?' · '+esc(it.note):''}</span></div>
    ${it.temp?`<em class="${it.temp.inRange?'ok':'bad'}">${it.temp.defrosting?'Defrosting':Number(it.temp.value).toFixed(1)+' C'}</em>`:''}
    ${(it.photos||[]).length?histStrip(it.photos):''}
  </div>`).join('');
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">✅</div><div><div style="font-weight:840;font-size:16px">${esc(sub.dept)} · ${esc(sub.session)}</div><div style="color:var(--muted);font-size:12.5px">${esc(sub.store)} · ${esc(sub.date)} · ${esc(sub.id)}</div></div><button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body hist-drawer"><div class="hist-summary"><span><b>${esc(sub.progress||0)}%</b> Progress</span><span><b>${esc(sub.done||0)}/${esc(sub.total||0)}</b> Done</span><span><b>${photos.length}</b> Photos</span><span><b>${esc(sub.by||'—')}</b> Submitted by</span></div>${rows||'<div class="empty">No checklist items stored.</div>'}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function histOpenBin(id){
  const r=((DB.binAdmin&&DB.binAdmin.records)||[]).find(x=>x.id===id); if(!r) return;
  const checks=(r.checklist||[]).map(c=>`<div class="hist-line done"><div><b>✓ ${esc(c.task)}</b><span>Completed</span></div></div>`).join('');
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">🗑️</div><div><div style="font-weight:840;font-size:16px">Bin record · ${esc(r.day)}</div><div style="color:var(--muted);font-size:12.5px">${esc(r.store)} · ${esc(r.date)} · ${esc(r.id)}</div></div><button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body hist-drawer"><div class="hist-summary"><span><b>${esc(r.staffName)}</b> Staff</span><span><b>${esc(r.binQty)}</b> Bins</span><span><b>${esc((r.created||'').slice(0,16).replace('T',' '))}</b> Time</span></div>${r.photo?`<img class="hist-hero-photo" style="cursor:zoom-in" src="${imgSrc(r.photo)}" alt="" onclick="openLightbox('${ckJS(imgSrc(r.photo))}')">`:''}${checks}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function histOpenSchedule(id){
  const r=(DB.scheduleHistory||[]).find(x=>x.id===id); if(!r) return;
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">${r.type==='maintenance'?'🔧':'🧽'}</div><div><div style="font-weight:840;font-size:16px">${esc(r.task)}</div><div style="color:var(--muted);font-size:12.5px">${esc(r.store)} · ${esc(r.date)} · ${esc(r.id)}</div></div><button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body hist-drawer"><div class="hist-summary"><span><b>${esc(r.staffName)}</b> Completed by</span><span><b>${esc(r.dept||'')}</b> Department</span><span><b>${esc(r.day)}</b> Day</span><span><b>${esc((r.created||'').slice(0,16).replace('T',' '))}</b> Time</span></div>${r.photo?`<img class="hist-hero-photo" style="cursor:zoom-in" src="${imgSrc(r.photo)}" alt="" onclick="openLightbox('${ckJS(imgSrc(r.photo))}')">`:''}${r.note?`<div class="hist-note">${esc(r.note)}</div>`:''}${isAdmin()?`<button class="btn sm" onclick="schedDeleteHistory('${ckJS(r.id)}')"><i class="fas fa-trash"></i> Delete record</button>`:''}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function renderHistory(){
  const h=histState(); setAccent('#0f766e'); setCrumb('🧾','Checklist History','Checklist, bin and cleaning evidence records');
  const tabs=[['checklist','Checklist'],['bin','Bin'],['schedule','Cleaning & Maintenance']].map(t=>`<button class="seg-btn ${h.tab===t[0]?'active':''}" onclick="histTab('${t[0]}')">${t[1]}</button>`).join('');
  const storePick=isSuper()?`<select class="login-input" style="width:auto" onchange="histSet('store',this.value)">${['All stores',...DB.stores].map(s=>`<option ${s===h.store?'selected':''}>${esc(s)}</option>`).join('')}</select>`:'';
  const rows=(h.tab==='checklist'?histChecklistRows():h.tab==='bin'?histBinRows():histScheduleRows()).filter(histDateOk);
  const datePick=`<input type="date" class="login-input" style="width:auto" value="${esc(h.date||'')}" title="Filter by date" onchange="histSet('date',this.value)">${h.date?`<button class="btn sm" onclick="histSet('date','')">✕ All dates</button>`:''}`;
  const deptList=h.tab==='checklist'?[...new Set((DB.checklistSubs||[]).filter(histStoreOk).map(r=>r.dept).filter(Boolean))]:h.tab==='schedule'?[...new Set((DB.scheduleHistory||[]).filter(histStoreOk).map(r=>r.dept).filter(Boolean))]:[];
  const deptPick=deptList.length?`<select class="login-input" style="width:auto" onchange="histSet('dept',this.value)">${['All departments',...deptList.sort()].map(d=>`<option ${d===h.dept?'selected':''}>${esc(d)}</option>`).join('')}</select>`:'';
  const cards=rows.map(r=>{
    if(h.tab==='checklist'){
      const photos=[]; (r.items||[]).forEach(it=>(it.photos||[]).forEach(p=>photos.push(p)));
      return `<button class="hist-card" onclick="histOpenChecklist('${ckJS(r.id)}')"><div class="hist-top"><b>${esc(r.dept)} · ${esc(r.session)}</b><span>${esc(r.progress||0)}%</span></div><p>${esc(r.store)} · ${esc(r.date)} · by ${esc(r.by||'—')}</p>${histStrip(photos)}<small>${esc(r.done||0)}/${esc(r.total||0)} tasks · ${photos.length} photos</small></button>`;
    }
    if(h.tab==='bin') return `<button class="hist-card" onclick="histOpenBin('${ckJS(r.id)}')"><div class="hist-top"><b>Bin · ${esc(r.day)}</b><span>${esc(r.binQty)} bins</span></div><p>${esc(r.store)} · ${esc(r.date)} · ${esc(r.staffName||'—')}</p>${histStrip([r.photo])}<small>${esc(r.id)}</small></button>`;
    return `<button class="hist-card" onclick="histOpenSchedule('${ckJS(r.id)}')"><div class="hist-top"><b>${esc(r.type==='maintenance'?'Maintenance':'Cleaning')}</b><span>${esc(r.day)}</span></div><p>${esc(r.store)} · ${esc(r.date)} · ${esc(r.dept||'')}</p><strong>${esc(r.task)}</strong>${histStrip([r.photo])}<small>Completed by ${esc(r.staffName||'—')}</small></button>`;
  }).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🧾</div><div><h2>Checklist History</h2><p>Review submitted checklist records, bin evidence, and completed cleaning/maintenance tasks with photos.</p></div><div class="ph-actions">${storePick}${deptPick}${datePick}<div class="seg seg-light">${tabs}</div></div></div>
    <div class="toolbar"><span class="count-chip">${rows.length} record${rows.length!==1?'s':''}</span><div class="search"><input value="${esc(h.q||'')}" oninput="State.hist.q=this.value;renderHistory()" placeholder="Search staff, task, area, ID..."></div></div>
    <div class="hist-grid">${cards||'<div class="card card-pad empty compact">No history records yet.</div>'}</div>`;
}

/* ============================================================ SHIFT HANDOVER */
function hoKey(store,date){ return 'HO-'+dataStoreId(store)+'-'+date; }
function hoEntry(store,date){ return (DB.scheduleHistory||[]).find(r=>r.type==='handover'&&r.store===store&&r.date===date); }
function hoSet(k,v){ State.ho=State.ho||{}; State.ho[k]=v; renderHandover(); }
function renderHandover(){
  setAccent('#0891b2'); setCrumb('🔁','Shift Handover','Who is on duty + end-of-shift notes');
  if(!State.ho) State.ho={date:ckTodayStr()};
  const store=isSuper()?((State.ho.store)||DB.stores[0]):State.branch;
  if(isSuper()) State.ho.store=store;
  const date=State.ho.date||ckTodayStr();
  const e=hoEntry(store,date)||{};
  const staffNames=(DB.staff||[]).filter(s=>s.store===store&&s.active!==0).map(s=>s.name);
  const recent=(DB.scheduleHistory||[]).filter(r=>r.type==='handover'&&(isSuper()||r.store===State.branch)).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8);
  const storeSel=isSuper()?`<select class="login-input" style="width:auto" onchange="hoSet('store',this.value)">${DB.stores.map(s=>`<option ${s===store?'selected':''}>${esc(s)}</option>`).join('')}</select>`:'';
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🔁</div><div><h2>Shift Handover</h2><p>Log who's on duty and pass clear notes to the next shift.</p></div>
    <div class="ph-actions">${storeSel}<input type="date" class="login-input" style="width:auto" value="${esc(date)}" max="${ckTodayStr()}" onchange="hoSet('date',this.value)"></div></div>
    <div class="card"><div class="card-pad">
      <datalist id="ho-staff">${staffNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
      <div class="field"><label>👥 On duty · ${esc(store)} · ${esc(date)}</label><input id="ho-onduty" list="ho-staff" value="${esc(e.onDuty||'')}" placeholder="Type names, comma-separated"></div>
      <div class="grid2" style="margin-top:12px">
        <div class="field"><label>☀️ Start-of-shift note</label><textarea id="ho-start" placeholder="Anything the team should know at the start of the day…">${esc(e.startNote||'')}</textarea></div>
        <div class="field"><label>🌙 End-of-shift handover</label><textarea id="ho-end" placeholder="Pass to the next shift — pending tasks, issues, deliveries, stock…">${esc(e.endNote||'')}</textarea></div>
      </div>
      <div style="margin-top:14px"><button class="btn primary lg" onclick="hoSave('${ckJS(store)}','${date}')"><i class="fas fa-floppy-disk"></i>&nbsp; Save handover</button>${e.by?`<span class="ch-sub" style="margin-left:12px">Last saved by ${esc(e.by)}</span>`:''}</div>
    </div></div>
    <div class="section-title">Recent handovers</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Date</th>${isSuper()?'<th>Store</th>':''}<th>On duty</th><th>Handover note</th><th>By</th></tr></thead><tbody>
      ${recent.length?recent.map(r=>`<tr><td><b>${esc(r.date)}</b></td>${isSuper()?`<td>${esc(r.store)}</td>`:''}<td>${esc(r.onDuty||'—')}</td><td>${esc(r.endNote||r.startNote||'—')}</td><td>${esc(r.by||'')}</td></tr>`).join(''):`<tr><td colspan="${isSuper()?5:4}"><div class="empty compact"><div class="e-ic">🔁</div>No handovers logged yet.</div></td></tr>`}
    </tbody></table></div></div>`;
}
function hoSave(store,date){
  const onDuty=(document.getElementById('ho-onduty')||{}).value||'';
  const startNote=(document.getElementById('ho-start')||{}).value||'';
  const endNote=(document.getElementById('ho-end')||{}).value||'';
  const by=(State.account&&State.account.name)||State.role||'Staff';
  DB.scheduleHistory=DB.scheduleHistory||[];
  const id=hoKey(store,date);
  let e=DB.scheduleHistory.find(r=>r.id===id); const before=e?JSON.parse(JSON.stringify(e)):null;
  if(!e){ e={id,type:'handover',store,date,created:new Date().toISOString()}; DB.scheduleHistory.unshift(e); }
  Object.assign(e,{onDuty,startNote,endNote,by,at:new Date().toISOString()});
  if(window.auditLog) auditLog(before?'update':'create','handover',id,store,before,e);
  if(window.persist) window.persist();
  toast('✓ Shift handover saved'); renderHandover();
}
/* ============================================================ MANAGER PANEL */
function mgrSynthSubs(){
  if(State._synthSubs) return State._synthSubs;
  const depts=(DB.checklist&&DB.checklist.depts)||['MANAGER','CASHIER','FV','GROCERY','FROZEN & DAIRY','BUTCHER'];
  const stores=DB.stores, names=DB.staff.map(s=>s.name);
  const today=new Date(), fmt=d=>d.toISOString().slice(0,10), dn=d=>d.toLocaleDateString(undefined,{weekday:'long'});
  const out=[];
  [0,1,2,3,4,5,6].forEach(off=>{ const d=new Date(today); d.setDate(d.getDate()-off); const ds=fmt(d), dname=dn(d);
    stores.forEach((store,si)=>depts.forEach((dept,di)=>['Opening','Closing'].forEach((session,sei)=>{
      const total=8+((di*3+sei*2)%14), done=Math.max(0,total-((si+di+off+sei)%3));
      const status = ((si+di*2+sei+off)%4===0) ? 'Submitted' : 'Verified';
      out.push({id:`CHK-${ds.replace(/-/g,'')}-${si}${di}${sei}`,date:ds,dayName:dname,store,department:dept,session,by:names[(si+di+sei)%names.length]||'Staff',total,done,progress:Math.round(done/total*100),status});
    })));
  });
  State._synthSubs=out; return out;
}
function mcqDemoMode(){ try{ return localStorage.getItem('mcq_demo')==='1'; }catch(e){ return false; } }
/* REAL submitted checklists only (demo history is opt-in via localStorage.mcq_demo='1') */
function mgrSubs(){
  const real=(DB.checklistSubs||[]).map(s=>({ id:s.id, date:s.date, dayName:s.dayName||new Date(s.date+'T00:00').toLocaleDateString(undefined,{weekday:'long'}),
    store:s.store, department:s.dept, session:s.session, by:s.by||s.responsible||'Staff',
    total:s.total, done:s.done, progress:s.progress, status:s.status||'Submitted', real:true, items:s.items,
    verifyNote:s.verifyNote||'', verifiedAt:s.verifiedAt||'', verifiedBy:s.verifiedBy||'',
    overallResult:s.overallResult||'', issuesFound:s.issuesFound||'', actionResponsible:s.actionResponsible||'', verifyPhotos:s.verifyPhotos||[] }));
  return mcqDemoMode() ? real.concat(mgrSynthSubs()) : real;
}
/* ---------- daily operations pulse + "needs attention" (real data only) ---------- */
function ckTodayStr(){ return new Date().toISOString().slice(0,10); }
function ckDeadlinePassed(session){
  const t=ckDeadline(session); if(!t) return false;
  const m=/(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t); if(!m) return false;
  let h=+m[1]; const mi=+m[2], ap=(m[3]||'').toUpperCase();
  if(ap==='PM'&&h<12)h+=12; if(ap==='AM'&&h===12)h=0;
  const now=new Date(); return (now.getHours()*60+now.getMinutes())>(h*60+mi);
}
function ckMyScope(s){ return isSuper() || s===State.branch; }
function ckOpsPulse(){
  const today=ckTodayStr();
  const depts=(DB.checklist&&DB.checklist.depts)||[];
  const stores=isSuper()?(DB.stores||[]):[State.branch];
  const subs=mgrSubs().filter(s=>ckMyScope(s.store));
  const todaySubs=subs.filter(s=>s.date===today);
  const expectedPer=Math.max(1,depts.length*stores.length);
  const sessions=['Opening','Mid-afternoon','Closing'].map(sess=>{
    const sub=todaySubs.filter(s=>s.session===sess), submitted=sub.length;
    return {key:sess, submitted, expected:expectedPer,
      pct:Math.min(100,Math.round(submitted/expectedPer*100)),
      overdue: ckDeadlinePassed(sess) && submitted<expectedPer };
  });
  const pendingVerify=subs.filter(s=>s.status!=='Verified').length;
  let tempAlerts=0; todaySubs.forEach(s=>(s.items||[]).forEach(it=>{ if(it.temp&&it.temp.inRange===false) tempAlerts++; }));
  const overdue=sessions.reduce((n,s)=>n+(s.overdue?(s.expected-s.submitted):0),0);
  return {sessions, pendingVerify, tempAlerts, overdue, today};
}
function ckAttentionItems(){
  const out=[], today=ckTodayStr(), subs=mgrSubs().filter(s=>ckMyScope(s.store));
  subs.filter(s=>s.status!=='Verified').slice(0,40).forEach(s=>out.push({icon:'fa-clipboard-check',accent:'#0e9f6e',title:'Verify · '+s.department+' '+s.session,sub:s.store+' · '+s.date+' · '+(s.progress||0)+'%',go:"go('manager')"}));
  ckOpsPulse().sessions.filter(s=>s.overdue).forEach(s=>out.push({icon:'fa-clock',accent:'#ef4444',title:'Overdue · '+s.key+' checklist',sub:(s.expected-s.submitted)+' of '+s.expected+' not submitted',go:"go('checklist')"}));
  subs.filter(s=>s.date===today).forEach(s=>(s.items||[]).forEach(it=>{ if(it.temp&&it.temp.inRange===false) out.push({icon:'fa-temperature-half',accent:'#f59e0b',title:'Temp out of range',sub:s.store+' · '+s.department+' · '+(it.temp.value!=null?it.temp.value+'°C':'')+' · '+String(it.task||'').slice(0,40),go:"go('manager')"}); }));
  ['issue','maintenance','incident','complaint'].forEach(id=>{ const m=DB.modules[id]; if(!m) return;
    (m.records||[]).filter(r=>ckMyScope(r.store)&&(['Critical','Major'].includes(r.severity)||r.priority==='Critical')&&!['Closed','Cancelled','Resolved','Store Confirmed'].includes(r.status)).slice(0,20)
      .forEach(r=>out.push({icon:'fa-triangle-exclamation',accent:'#dc2626',title:'Critical · '+(m.short||id)+' '+r.id,sub:(r.store||'')+' · '+String(r.title||r.summary||r.equipment||r.category||'').slice(0,46),go:"go('"+id+"')"})); });
  return out;
}
function ckAttentionCount(){ try{ return ckAttentionItems().length; }catch(e){ return 0; } }
function renderAttention(){
  const items=ckAttentionItems();
  const rows=items.length?items.map(a=>`<button class="att-row" onclick="closeDrawer();${a.go}"><span class="att-ic" style="background:${a.accent}1f;color:${a.accent}"><i class="fas ${a.icon}"></i></span><span class="att-main"><b>${esc(a.title)}</b><small>${esc(a.sub)}</small></span><i class="fas fa-chevron-right att-go"></i></button>`).join('')
    : '<div class="empty compact"><div class="e-ic">✅</div>All clear — nothing needs attention.</div>';
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic" style="background:#fef2f2;color:#dc2626"><i class="fas fa-bell"></i></div>
    <div><div style="font-weight:840;font-size:16px">Needs attention</div><div style="color:var(--muted);font-size:12.5px">${esc(isSuper()?'All stores':State.branch)} · ${items.length} item${items.length!==1?'s':''}</div></div>
    <button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body"><div class="att-list">${rows}</div></div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function ckTodayStripHTML(){
  const p=ckOpsPulse();
  const tiles=p.sessions.map(s=>`<button class="today-tile ${s.overdue?'over':''}" onclick="go('checklist')">
    <span class="tt-h">${s.key}${s.overdue?' · OVERDUE':''}</span>
    <span class="tt-bar"><i style="width:${s.expected?Math.round(s.submitted/s.expected*100):0}%"></i></span>
    <span class="tt-n">${s.submitted}/${s.expected} submitted</span></button>`).join('');
  const chip=(cls,n,label,onclick)=>`<button class="today-chip ${cls}" onclick="${onclick}"><b>${n}</b><span>${label}</span></button>`;
  return `<div class="section-title">Today · ${esc(isSuper()?'All stores':State.branch)}</div>
    <div class="today-grid">${tiles}</div>
    <div class="today-chips">${chip('ok',p.pendingVerify,'Pending verify',"go('manager')")}${chip(p.tempAlerts?'bad':'mute',p.tempAlerts,'Temp alerts today',"go('manager')")}${chip(p.overdue?'bad':'mute',p.overdue,'Overdue checklists',"go('checklist')")}</div>`;
}
function mgrActivity(storeScope){
  const mods=['issue','maintenance','incident','complaint','violation','reward']; let items=[];
  const inScope=store=>isSuper()?(!storeScope||storeScope==='ALL'||store===storeScope):store===State.branch;
  mods.forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if(inScope(r.store)) items.push({accent:m.accent,icon:m.icon,sortKey:r.created||r.date||'',title:`${m.short}: ${r.id}`,sub:`${r.store||''} · ${(r.title||r.summary||r.shortDescription||r.category||r.staffName||r.equipment||'').slice(0,60)}`,time:relTime(r.created||r.date)}); });});
  return items.sort((a,b)=>String(b.sortKey).localeCompare(String(a.sortKey))).slice(0,12);
}
function mgrStore(store){ if(!State.mgr) State.mgr={}; State.mgr.store=store||'ALL'; renderManager(); }
function mgrSubInScope(s){ return isSuper() || !!(s && s.store===State.branch); }
function mgrStoreRecipients(store){
  const out=[], seen={};
  const add=(r)=>{ if(!r||!r.email||seen[String(r.email).toLowerCase()]) return; seen[String(r.email).toLowerCase()]=1; out.push(r); };
  const cfg=DB.emailConfig||{};
  // store-admin's own manager email (per-store config). Super uses staff-manager emails (store-specific) instead.
  if(cfg.managerEmail && State.branch===store) add({key:'cfgmgr',name:cfg.managerName||(store+' Store Manager'),email:cfg.managerEmail});
  const map=DB.storeManagerEmails||DB.managerEmails||{};
  const fromMap=map&&map[store];
  if(Array.isArray(fromMap)) fromMap.forEach((r,i)=>add(typeof r==='string'?{key:'mgr-'+store+'-'+i,name:store+' Store Manager',email:r}:r));
  else if(typeof fromMap==='string') add({key:'mgr-'+store,name:store+' Store Manager',email:fromMap});
  else add(fromMap);
  // staff flagged Admin (multi-role) or a manager/supervisor, with an email — store-specific (works for Super too)
  (DB.staff||[]).filter(x=>x.store===store && x.email && (staffIsAdmin(x) || /manager|supervisor/i.test(x.role||'')))
    .forEach(x=>add({key:'staff-'+x.id,name:x.name,email:x.email}));
  add((DB.emailRecipients||[]).find(r=>r.key==='mgr'));
  return out;
}
function mgrEmailVerifyNote(s,note){
  const to=mgrStoreRecipients(s.store);
  if(!to.length){ toast('No admin email set for '+s.store+' — add one in Email Notifications'); return false; }
  const subject=`MCQ ${s.store} · Checklist verified · ${s.department} ${s.session}`;
  const body=`Store: ${s.store}
Department: ${s.department}
Session: ${s.session}
Date: ${s.date}
Verified by: ${(State.account&&State.account.name)||'Manager'}
Progress: ${s.done}/${s.total} (${s.progress}%)

Assessment note:
${note}`;
  const cfg=(window.mcqEmail&&mcqEmail.cfg&&mcqEmail.cfg())||DB.emailConfig||{};
  if(window.mcqEmail && mcqEmail.canBrevo && mcqEmail.canBrevo()){ mcqEmail._brevo(to,subject,body,cfg); return 'silent'; }   // send in the background, no window
  if(window.mcqEmail && mcqEmail._gmail) mcqEmail._gmail(to,subject,body);
  else window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to.map(r=>r.email).join(','))+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),'_blank');
  return 'compose';
}
async function mgrAddVerifyPhotos(e){
  const files=e.target.files; if(!files||!files.length) return;
  State.mgrV=State.mgrV||{photos:[]}; State.mgrV.photos=State.mgrV.photos||[];
  for(const f of files){ const preview=URL.createObjectURL(f); State.mgrV.photos.push(preview);
    try{ const d=await compressImage(f); const ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d; const idx=State.mgrV.photos.indexOf(preview); if(idx>=0){ State.mgrV.photos[idx]=ref; try{URL.revokeObjectURL(preview);}catch(_){} } }catch(_){}
  }
  e.target.value=''; mgrDrawVerifyPhotos(); if(State.mgrV.id) mgrSaveVerifyDraft(State.mgrV.id);
}
function mgrRmVerifyPhoto(p){ State.mgrV.photos=(State.mgrV.photos||[]).filter(x=>x!==p); mgrDrawVerifyPhotos(); if(State.mgrV.id) mgrSaveVerifyDraft(State.mgrV.id); }
function mgrDrawVerifyPhotos(){ const el=document.getElementById('mgr-vphotos'); if(!el) return;
  el.innerHTML=(State.mgrV.photos||[]).map(p=>`<span style="position:relative;display:inline-block"><img src="${imgSrc(p)}" onclick="openLightbox('${ckJS(imgSrc(p))}')" style="cursor:zoom-in"><span class="ck-rm" onclick="mgrRmVerifyPhoto('${ckJS(p)}')">✕</span></span>`).join(''); }
/* ---- verify-note DRAFT: survives closing the drawer; cleared only when Verified ---- */
function mgrVfKey(s){ const store=(s&&s.store)||State.branch; return 'mcq_vfdraft_'+dataStoreId(store)+'_'+((s&&s.id)||State.mgrV&&State.mgrV.id||''); }
function mgrSaveVerifyDraft(id){
  const s=mgrSubs().find(x=>x.id===id); if(!s||s.status==='Verified') return;
  const a=mgrAssessment();
  try{ localStorage.setItem(mgrVfKey(s), JSON.stringify({verifiedBy:a.verifiedBy,overallResult:a.overallResult,issuesFound:a.issuesFound,actionResponsible:a.actionResponsible,verifyNote:a.verifyNote,photos:a.verifyPhotos,ts:Date.now()})); }catch(e){}
}
function mgrLoadVerifyDraft(s){ try{ const raw=localStorage.getItem(mgrVfKey(s)); if(!raw) return null; const d=JSON.parse(raw);
    // only treat as a draft if it actually has content
    if(d&&(d.verifyNote||d.issuesFound||d.actionResponsible||(d.overallResult&&d.overallResult!=='')||(d.photos&&d.photos.length))) return d; }catch(e){} return null; }
function mgrClearVerifyDraft(s){ try{ localStorage.removeItem(mgrVfKey(s)); }catch(e){} }
function mgrAssessment(){
  const g=id=>{ const el=document.getElementById(id); return el?String(el.value||'').trim():''; };
  return { verifiedBy:g('mgr-by')||((State.account&&State.account.name)||'Manager'), overallResult:g('mgr-overall'),
    issuesFound:g('mgr-issues'), actionResponsible:g('mgr-action'), verifyNote:g('mgr-note'),
    verifyPhotos:((State.mgrV&&State.mgrV.photos)||[]).slice() };
}
function mgrVerify(id){
  const a=mgrAssessment();
  const s=mgrSubs().find(x=>x.id===id);
  if(!mgrSubInScope(s)){ toast('This checklist belongs to another store'); return; }
  const apply=(o)=>{ o.status='Verified'; o.verifyNote=a.verifyNote; o.verifiedBy=a.verifiedBy; o.overallResult=a.overallResult; o.issuesFound=a.issuesFound; o.actionResponsible=a.actionResponsible; o.verifyPhotos=a.verifyPhotos; o.verifiedAt=new Date().toISOString(); };
  if(s) apply(s);
  const real=(DB.checklistSubs||[]).find(x=>x.id===id && x.store===s.store);
  if(real){ const before=JSON.parse(JSON.stringify(real)); apply(real); auditLog('verify','checklistSubmission',real.id,real.store,before,real,a.verifyNote); if(window.persist) window.persist(); }
  mgrClearVerifyDraft(s);   // committed → the draft is no longer needed (it now lives in the verified record)
  // notify store admin (existing behaviour) when there's any written assessment
  const hasContent=a.verifyNote||a.issuesFound||a.actionResponsible||a.overallResult;
  const sent=hasContent&&s&&mgrEmailVerifyNote(s,mgrAssessmentText(a));
  // notify department lead(s) for this store+dept with a branded PDF
  let leadSent=false;
  try{ const leads=leadList(s.store,s.department).filter(l=>l.email); if(leads.length){ mgrSendLeadPDF(s,a,leads); leadSent=true; } }catch(err){}
  closeDrawer&&closeDrawer();
  toast(leadSent?('✓ Verified · PDF sent to '+s.department+' lead'):sent==='silent'?('✓ Verified · note sent to '+s.store+' admin'):'✓ Checklist verified');
  renderManager(); }
function mgrAssessmentText(a){
  return `Verified by: ${a.verifiedBy}
Overall result: ${a.overallResult||'—'}

Issues found:
${a.issuesFound||'—'}

Action / Responsible:
${a.actionResponsible||'—'}

${a.verifyNote?('Manager note:\n'+a.verifyNote):''}`.trim();
}
async function mgrSendLeadPDF(s,a,leads){
  const text=mgrAssessmentText(a);
  const subject=`MCQ ${s.store} · ${s.department} ${s.session} — verified (${a.overallResult||'reviewed'})`;
  try{
    try{ if(window.ensureJsPDF) await ensureJsPDF(); }catch(e){}
    if(!(window.jspdf&&window.jspdf.jsPDF)) throw new Error('no jspdf');
    const tasks=mgrSubTasks(s), doneN=tasks.filter(t=>t.done).length;
    const { jsPDF }=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'});
    const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=40; let y=92;
    const ensure=h=>{ if(y+h>PH-40){ doc.addPage(); y=44; } };
    doc.setFillColor(14,159,110); doc.rect(0,0,PW,74,'F');
    let tx=M; if(window.MCQ_LOGO_URL){ try{ doc.addImage(MCQ_LOGO_URL,'PNG',M,14,46,46); tx=M+58; }catch(e){} }
    doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('MCQ Supermarket — Checklist Verification',tx,32);
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.text(`${s.store} · ${s.department} · ${s.session} · ${s.date}`,tx,52);
    // assessment summary box
    const col = a.overallResult==='Critical'?[185,28,28]:a.overallResult==='Need improving'?[202,138,4]:[21,128,61];
    ensure(20); doc.setFillColor(col[0],col[1],col[2]); doc.roundedRect(M,y,PW-2*M,24,4,4,'F'); doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text(`Overall result: ${a.overallResult||'Reviewed'}   ·   ${doneN}/${tasks.length} tasks done (${s.progress}%)`,M+12,y+16); y+=36;
    const block=(label,val)=>{ if(!val)return; ensure(16); doc.setTextColor(90); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text(label,M,y); y+=14;
      doc.setTextColor(30); doc.setFont('helvetica','normal'); doc.setFontSize(10.5); const lines=doc.splitTextToSize(String(val),PW-2*M); ensure(lines.length*13); doc.text(lines,M,y); y+=lines.length*13+8; };
    block('Verified by', a.verifiedBy);
    block('Issues found', a.issuesFound);
    block('Action / Responsible', a.actionResponsible);
    block('Manager note', a.verifyNote);
    // outstanding tasks list
    const out=tasks.filter(t=>!t.done);
    if(out.length){ ensure(16); doc.setTextColor(185,28,28); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text(`Outstanding tasks (${out.length})`,M,y); y+=14;
      doc.setTextColor(60); doc.setFont('helvetica','normal'); doc.setFontSize(10); out.slice(0,30).forEach(t=>{ const l=doc.splitTextToSize('• '+t.task+(t.area?(' ('+t.area+')'):''),PW-2*M); ensure(l.length*12); doc.text(l,M,y); y+=l.length*12+2; }); y+=6; }
    // annotated photos from the manager
    const photoIds=(a.verifyPhotos||[]); if(photoIds.length){ ensure(16); doc.setTextColor(90); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text('Manager photos',M,y); y+=14;
      const pmap={}; await Promise.all([...new Set(photoIds)].map(async u=>{ const d=await ckImgData(imgSrc(u),1400); if(d) pmap[u]=d; }));
      const box=230, th=173, gap=12; let x=M; photoIds.forEach(u=>{ const d=pmap[u]; if(!d) return; if(x+box>PW-M){ x=M; y+=th+gap; } ensure(th+12);
        const ar=(d.w&&d.h)?d.w/d.h:4/3; let iw=box, ih=iw/ar; if(ih>th){ ih=th; iw=ih*ar; } try{ doc.addImage(d.data,'JPEG',x,y,iw,ih); }catch(e){} doc.setDrawColor(205); doc.rect(x,y,iw,ih); x+=box+gap; }); y+=th+14; }
    const n=doc.internal.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text('MCQ Supermarket · '+s.store+' · Confidential',M,PH-18); doc.text('Page '+i+' / '+n,PW-M,PH-18,{align:'right'}); }
    const fileName=`MCQ_${String(s.store).replace(/\s+/g,'_')}_${String(s.department).replace(/\s+/g,'')}_${s.session}_${s.date}.pdf`;
    const b64=doc.output('datauristring').split(',')[1];
    mcqEmail.sendPdf(leads, subject, text, b64, fileName);
  }catch(e){ // fallback: plain HTML email
    if(window.mcqEmail) mcqEmail._brevo(leads, subject, text, mcqEmail.cfg());
  }
}
function mgrDate(v){ if(!State.mgr) State.mgr={}; State.mgr.date=v; renderManager(); }
/* derive the actual checklist (items, done state, notes, evidence photos) for a submission */
function mgrSubTasks(s){
  if(s.real && Array.isArray(s.items)){   // real submission — show exactly what was submitted
    return s.items.map(it=>({task:it.task, area:it.area, done:!!it.done, photoReq:(it.photos||[]).length>0||false,
      photos:(it.photos||[]).slice(), note:it.note||'', temp: it.temp?{ok:it.temp.inRange, label: it.temp.defrosting?'Defrosting':(it.temp.value!=null?it.temp.value+'°C':'—')}:null }));
  }
  const items=((DB.checklist&&DB.checklist.items)||[]).map(ckItem).filter(r=>ckStoreOk(r,s.store||State.branch) && r.dept===s.department && ckInSession(r,s.session));
  const doneN=Math.max(0,Math.min(items.length, Math.round(items.length*((s.progress||0)/100))));
  const col=(((DB.checklist&&DB.checklist.deptMeta)||{})[s.department]||{}).color||'#0f766e';
  return items.map((r,idx)=>{
    const done=idx<doneN, photoReq=!!r.photo;
    const photos=(done&&photoReq)?[mgrPhotoStub(r.area,col)]:[];
    let temp=null; if(r.meta&&r.meta.temp){ temp={ok:done, label: done?(idx%4===0?'4.2°C':'2.8°C'):'pending'}; }
    const note=(!done&&idx%3===0)?'Not completed — needs follow-up':'';
    return {task:r.task, area:r.area, done, photoReq, photos, temp, note};
  });
}
function mgrPhotoStub(label,color){
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='${color}aa'/></linearGradient></defs><rect width='100%' height='100%' rx='10' fill='url(#g)'/><text x='50%' y='45%' fill='#fff' font-size='30' text-anchor='middle' font-family='sans-serif'>&#128247;</text><text x='50%' y='72%' fill='#ffffffdd' font-size='12' text-anchor='middle' font-family='sans-serif'>${String(label).slice(0,24)}</text></svg>`;
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
}
function mgrReview(id){
  const s=mgrSubs().find(x=>x.id===id); if(!s) return;
  if(!mgrSubInScope(s)){ toast('This checklist belongs to another store'); return; }
  const tasks=mgrSubTasks(s);
  const meta=(((DB.checklist&&DB.checklist.deptMeta)||{})[s.department])||{color:'#0f766e'};
  const doneN=tasks.filter(t=>t.done).length, outN=tasks.length-doneN, photoN=tasks.reduce((n,t)=>n+t.photos.length,0);
  // restore an in-progress draft (saved if the manager closed the drawer without verifying)
  const draft=s.status==='Verified'?null:mgrLoadVerifyDraft(s);
  const existingNote=(draft&&draft.verifyNote)||s.verifyNote||'';
  State.mgrV={id:s.id, photos:((draft&&draft.photos)||s.verifyPhotos||[]).slice()};
  // managers/admins for this store to populate "Verified by"
  const mgrNames=[]; const seenN={};
  (DB.staff||[]).filter(x=>x.store===s.store && (staffIsAdmin(x)||/manager|supervisor/i.test(x.role||''))).forEach(x=>{ if(x.name&&!seenN[x.name]){seenN[x.name]=1;mgrNames.push(x.name);} });
  const curName=(State.account&&State.account.name)||'Manager'; if(!seenN[curName]) mgrNames.unshift(curName);
  const verifiedBy=(draft&&draft.verifiedBy)||s.verifiedBy||curName, overall=(draft&&draft.overallResult)||s.overallResult||'', issues=(draft&&draft.issuesFound)||s.issuesFound||'', action=(draft&&draft.actionResponsible)||s.actionResponsible||'';
  const disabled=s.status==='Verified'?'disabled':'';
  if(draft) setTimeout(()=>toast('📝 Draft restored — your unsaved notes are back'),300);
  const rows=tasks.map(t=>`<div class="mr-task ${t.done?'done':'todo'}">
      <div class="mr-tk"><span class="mr-check">${t.done?'✓':'○'}</span><div class="mr-name">${esc(t.task)}<small>${esc(t.area)}</small></div>${t.temp?`<span class="badge ${t.temp.ok?'ok':'warn'}">${esc(t.temp.label)}</span>`:''}</div>
      ${t.note?`<div class="mr-note">📝 ${esc(t.note)}</div>`:''}
      ${t.photos.length?`<div class="mr-photos">${t.photos.map(p=>`<img src="${imgSrc(p)}" onclick="openLightbox('${ckJS(imgSrc(p))}')" style="cursor:zoom-in">`).join('')}</div>`:(t.photoReq&&!t.done?`<div class="mr-nophoto">📷 Photo required — not attached</div>`:'')}
    </div>`).join('');
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic" style="background:${meta.color}1f;color:${meta.color}">✅</div>
    <div><div style="font-weight:840;font-size:16px">${esc(s.department)} · ${esc(s.session)}</div>
    <div style="color:var(--muted);font-size:12.5px">${esc(s.store)} · ${esc(s.date)} (${esc(s.dayName)}) · by ${esc(s.by)}</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap"><span class="badge ok">${doneN} done</span>${outN?`<span class="badge warn">${outN} outstanding</span>`:''}<span class="badge info">📷 ${photoN}</span><span class="badge ${s.status==='Verified'?'ok':'warn'}">${esc(s.status)}</span></div></div>
    <button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body">
      <div class="mr-prog"><span class="pbar" style="flex:1"><i style="width:${s.progress}%;background:${meta.color}"></i></span><b>${s.progress}%</b></div>
      <div class="mr-list">${rows||'<div class="empty">No tasks for this session.</div>'}</div>
      <div class="mr-eval">
        <div class="field"><label>Verified by</label>
          <select id="mgr-by" ${disabled} onchange="mgrSaveVerifyDraft('${s.id}')">${mgrNames.map(n=>`<option ${n===verifiedBy?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label>Overall result</label>
          <select id="mgr-overall" ${disabled} onchange="mgrSaveVerifyDraft('${s.id}')"><option value="">— Select —</option>${['Good','Need improving','Critical'].map(o=>`<option ${o===overall?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="field"><label>Issues found</label>
          <textarea id="mgr-issues" ${disabled} oninput="mgrSaveVerifyDraft('${s.id}')" placeholder="Describe issues…">${esc(issues)}</textarea></div>
        <div class="field"><label>Action / Responsible</label>
          <textarea id="mgr-action" ${disabled} oninput="mgrSaveVerifyDraft('${s.id}')" placeholder="What needs doing & who is responsible">${esc(action)}</textarea></div>
        <div class="field"><label>Manager note</label>
          <textarea id="mgr-note" ${disabled} oninput="mgrSaveVerifyDraft('${s.id}')" placeholder="Additional note for the store manager / department lead">${esc(existingNote)}</textarea></div>
        <div class="field"><label>Attach photos (annotate problem areas)</label>
          ${s.status==='Verified'?'':'<input type="file" id="mgr-photo-in" accept="image/*" multiple onchange="mgrAddVerifyPhotos(event)">'}
          <div id="mgr-vphotos" class="mr-photos" style="margin-top:8px">${(State.mgrV.photos||[]).map(p=>`<span style="position:relative;display:inline-block"><img src="${imgSrc(p)}" onclick="openLightbox('${ckJS(imgSrc(p))}')" style="cursor:zoom-in">${s.status==='Verified'?'':`<span class="ck-rm" onclick="mgrRmVerifyPhoto('${ckJS(p)}')">✕</span>`}</span>`).join('')}</div>
        </div>
      </div>
      ${s.status==='Verified'
        ? `<div class="rail-tip" style="margin-top:16px">✅ Verified by ${esc(s.verifiedBy||'—')}${s.overallResult?' · '+esc(s.overallResult):''}.</div>`
        : `<button class="btn primary block lg" style="margin-top:16px" onclick="mgrVerify('${s.id}')"><i class="fas fa-check-double"></i>&nbsp; Verify &amp; notify department lead</button>
           ${outN?`<div class="fhint" style="text-align:center;margin-top:8px">⚠️ ${outN} task(s) still outstanding</div>`:''}`}
    </div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function renderManager(){
  setAccent('#0f766e'); setCrumb('🛡️','Manager Panel','Verify checklists & action today’s issues');
  const todayStr=new Date().toISOString().slice(0,10);
  if(!State.mgr) State.mgr={sort:'newest',date:todayStr};
  if(!State.mgr.date) State.mgr.date=todayStr;
  if(isSuper()&&!State.mgr.store) State.mgr.store='ALL';
  const storeScope=isSuper()?(State.mgr.store||'ALL'):State.branch;
  const inStore=store=>isSuper()?(storeScope==='ALL'||store===storeScope):store===State.branch;
  const allSubs=mgrSubs();
  const subs=allSubs.filter(s=>inStore(s.store));
  const allPending=subs.filter(s=>s.status==='Submitted');
  const pending=allPending.filter(s=>s.date===State.mgr.date).sort((a,b)=>State.mgr.sort==='newest'?b.id.localeCompare(a.id):a.id.localeCompare(b.id));
  const doneStat=['Closed','Cancelled','Resolved','Store Confirmed','Completed'];
  let issues=[]; ['maintenance','incident','complaint','violation','issue'].forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if(inStore(r.store)&&!doneStat.includes(r.status)) issues.push({mod:id,icon:m.icon,short:m.short,...r}); });});
  issues.sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
  const verifiedToday=subs.filter(s=>s.date===todayStr&&s.status==='Verified').length;
  const critical=issues.filter(r=>['Critical','Major'].includes(r.severity)||['Critical','Urgent'].includes(r.priority)||r.step==='Final Warning').length;
  const stats=[['🕒',allPending.length,'Awaiting verification','warn'],['✅',verifiedToday,'Verified today','ok'],['🚩',issues.length,'Open issues','info'],['🔴',critical,'Critical / urgent','bad']];
  const dm=(DB.checklist&&DB.checklist.deptMeta)||{}; const capN=18, shown=pending.slice(0,capN);
  const storeTitle=isSuper()?(storeScope==='ALL'?'all stores':storeScope):State.branch;
  const storeCards=isSuper()?`<div class="mgr-store-grid">
    <button class="mgr-store-card ${storeScope==='ALL'?'active':''}" onclick="mgrStore('ALL')">
      <span class="ms-ic">🏪</span><b>All stores</b><small>${allSubs.filter(s=>s.status==='Submitted'&&s.date===State.mgr.date).length} pending today</small>
    </button>
    ${DB.stores.map((st,i)=>{
      const stSubs=allSubs.filter(s=>s.store===st), stPending=stSubs.filter(s=>s.status==='Submitted'&&s.date===State.mgr.date).length;
      const stAllPending=stSubs.filter(s=>s.status==='Submitted').length;
      let stIssues=0; ['maintenance','incident','complaint','violation','issue'].forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if(r.store===st&&!doneStat.includes(r.status)) stIssues++; });});
      return `<button class="mgr-store-card ${storeScope===st?'active':''}" style="--c:${PALETTE[i%PALETTE.length]}" onclick="mgrStore('${ckJS(st)}')">
        <span class="ms-ic">🏬</span><b>${esc(st)}</b><small>${stPending} pending today · ${stAllPending} total · ${stIssues} issues</small>
      </button>`;
    }).join('')}
  </div>`:'';
  const cards=shown.map(s=>{const meta=dm[s.department]||{color:'#0f766e'}, isToday=s.date===todayStr;
    return `<div class="pv-card" style="--c:${meta.color}"><span class="pv-stripe"></span>
      <div class="pv-head"><b>${esc(s.department)}</b><span class="badge ${s.session==='Opening'?'warn':'info'}">${s.session}</span>${isToday?'<span class="badge ok">Today</span>':''}</div>
      <div class="pv-meta"><span>📅 ${esc(s.date)} — ${esc(s.dayName)}</span>${isSuper()?`<span>🏪 ${esc(s.store)}</span>`:''}<span>👤 ${esc(s.by)}</span></div>
      <div class="pv-prog"><span class="pbar" style="flex:1"><i style="width:${s.progress}%"></i></span><b>${s.done}/${s.total}</b></div>
      <button class="btn primary block sm" onclick="mgrReview('${s.id}')"><i class="fas fa-eye"></i>&nbsp; Review &amp; Verify</button></div>`;}).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">🛡️</div><div><h2>Manager Panel</h2><p>Verify today’s checklists and action open issues across ${esc(storeTitle)}.</p></div>
      <div class="ph-actions"><input type="date" class="mgr-date" value="${esc(State.mgr.date)}" max="${todayStr}" onchange="mgrDate(this.value)"><button class="btn sm" onclick="mgrSort()"><i class="fas fa-arrow-down-wide-short"></i>&nbsp; ${State.mgr.sort==='newest'?'Newest first':'Oldest first'}</button><button class="btn sm primary" onclick="mgrRecordsOpen()"><i class="fas fa-folder-open"></i>&nbsp; Verified records</button></div></div>
    <div id="mgr-rec-modal" class="lb-overlay" style="display:none" onclick="if(event.target===this)mgrRecordsClose()"><div class="lb-panel" onclick="event.stopPropagation()"><div class="card-head" style="padding:14px 16px"><h3>📁 Verified records</h3><button class="x-btn" onclick="mgrRecordsClose()">✕</button></div><div class="card-pad"><div style="display:flex;gap:12px;flex-wrap:wrap"><div class="field" style="max-width:200px"><label>Date</label><input type="date" id="mgr-rec-date" value="${esc(State.mgr.date)}" max="${todayStr}" onchange="mgrRecDate(this.value)"></div>${isSuper()?`<div class="field" style="max-width:220px"><label>Store</label><select id="mgr-rec-store" onchange="mgrRecStore(this.value)"><option value="ALL">All stores</option>${DB.stores.map(s=>`<option value="${esc(s)}" ${(State.mgr.store||'ALL')===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>`:''}</div><div id="mgr-rec-body" style="max-height:52vh;overflow:auto;margin-top:8px"></div></div></div></div>
    <div class="kpi-grid">${stats.map(s=>`<div class="kpi tone-${s[3]}"><div class="k-top"><div class="k-ic">${s[0]}</div></div><div class="k-val">${s[1]}</div><div class="k-lbl">${esc(s[2])}</div></div>`).join('')}</div>
    ${storeCards}
    <div class="section-title"><i class="fas fa-clock" style="color:#f59e0b"></i> Pending Verification · ${esc(storeTitle)} · ${esc(State.mgr.date)}${State.mgr.date===todayStr?' (Today)':''} · ${pending.length}${pending.length>capN?` (showing ${capN})`:''}</div>
    <div class="pv-grid">${cards||`<div class="empty">🎉 Nothing pending for ${esc(State.mgr.date)}.${allPending.length?` <b>${allPending.length}</b> still pending on other dates — change the date above.`:''}</div>`}</div>
    <div class="section-title"><i class="fas fa-triangle-exclamation" style="color:#ef4444"></i> Open issues today · ${issues.length}</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Register</th><th>Store</th><th>Summary</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
      ${issues.length?issues.slice(0,20).map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}","${ckJS(r.store||'')}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td>${esc(r.store||'')}</td><td><div class="wrap">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.staffName||r.category||'')}</div></td><td>${(r.priority||r.severity||r.step)?badge(r.priority||r.severity||r.step):''}</td><td>${badge(r.status)}</td><td><button class="btn sm primary" onclick='event.stopPropagation();openDetail("${r.mod}","${esc(r.id)}","${ckJS(r.store||'')}")'>Review</button></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No open issues 🎉</div></td></tr>'}
    </tbody></table></div></div>
    <div class="section-title">📋 Activity Log — ${todayStr}</div>
    <div class="card"><div class="feed">${mgrActivity(storeScope).map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div><div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('')||'<div class="empty">No recent activity.</div>'}</div></div>`;
}
function mgrSort(){ State.mgr.sort=State.mgr.sort==='newest'?'oldest':'newest'; renderManager(); }
/* ---- Verified records archive (browse verified checklists by date) ---- */
function mgrRecordsOpen(){ const m=document.getElementById('mgr-rec-modal'); if(m){ m.style.display='flex'; mgrRecRender(); } }
function mgrRecordsClose(){ const m=document.getElementById('mgr-rec-modal'); if(m) m.style.display='none'; }
function mgrRecDate(v){ State.mgr.recDate=v; mgrRecRender(); }
function mgrRecStore(v){ State.mgr.store=v; mgrRecRender(); }
function mgrRecRender(){
  const el=document.getElementById('mgr-rec-body'); if(!el) return;
  const date=State.mgr.recDate||($('#mgr-rec-date')&&$('#mgr-rec-date').value)||State.mgr.date;
  const storeScope=isSuper()?(($('#mgr-rec-store')&&$('#mgr-rec-store').value)||State.mgr.store||'ALL'):State.branch;
  const inStore=store=>isSuper()?(storeScope==='ALL'||store===storeScope):store===State.branch;
  const recs=mgrSubs().filter(s=>s.status==='Verified'&&s.date===date&&inStore(s.store))
    .sort((a,b)=>String(b.verifiedAt||'').localeCompare(String(a.verifiedAt||'')));
  const tone=r=>r==='Critical'?'bad':r==='Need improving'?'warn':'ok';
  el.innerHTML = recs.length ? recs.map(s=>`<div class="card" style="margin-bottom:10px"><div class="card-pad">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <b>${esc(s.department)} · ${esc(s.session)}</b>
        ${isSuper()?`<span class="badge info">🏪 ${esc(s.store)}</span>`:''}
        ${s.overallResult?`<span class="badge ${tone(s.overallResult)}">${esc(s.overallResult)}</span>`:''}
        <span class="badge ok">${s.done||0}/${s.total||0}</span>
        <span style="margin-left:auto;color:var(--muted);font-size:12px">✅ ${esc(s.verifiedBy||'—')}${s.verifiedAt?(' · '+esc(String(s.verifiedAt).slice(0,16).replace('T',' '))):''}</span>
      </div>
      ${s.issuesFound?`<div style="margin-top:6px;font-size:13px"><b>Issues:</b> ${esc(s.issuesFound)}</div>`:''}
      ${s.actionResponsible?`<div style="margin-top:2px;font-size:13px"><b>Action:</b> ${esc(s.actionResponsible)}</div>`:''}
      ${s.verifyNote?`<div style="margin-top:2px;font-size:13px;color:#64748b">📝 ${esc(s.verifyNote)}</div>`:''}
      ${(s.verifyPhotos&&s.verifyPhotos.length)?`<div class="mr-photos" style="margin-top:8px">${s.verifyPhotos.map(p=>`<img src="${imgSrc(p)}" onclick="openLightbox('${ckJS(imgSrc(p))}')" style="cursor:zoom-in">`).join('')}</div>`:''}
      <div style="margin-top:8px"><button class="btn sm" onclick="mgrRecordsClose();mgrReview('${s.id}')"><i class="fas fa-eye"></i>&nbsp; Open full</button></div>
    </div></div>`).join('') : `<div class="empty">No verified checklists on ${esc(date)}.</div>`;
}

/* ============================================================ ANALYTICS */
function renderAnalytics(){
  setAccent('#6a1b9a'); setCrumb('📈','Analytics',isSuper()?'Cross-store, cross-module insights':'MCQ '+State.branch+' insights');
  const analysisMods=[...DB.order,'violation','reward','training','raise','birthday','issue'].filter((id,i,a)=>DB.modules[id]&&a.indexOf(id)===i);
  const recsOf=id=>isSuper()?((DB.modules[id]&&DB.modules[id].records)||[]):scopedRecords(id);
  const totals=analysisMods.map(id=>({m:DB.modules[id],n:recsOf(id).length})).filter(t=>t.n||['issue','violation'].includes(t.m.id));
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">📈</div><div><h2>Analytics</h2><p>${isSuper()?'Volume, severity and store comparison across all operations.':'Within-store analysis for MCQ '+esc(State.branch)+' across issues, violations and operations.'}</p></div></div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>Records by module</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an1"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Open vs closed</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an2"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>${isSuper()?'Activity by store':'Activity by register'}</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an3"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Severity mix</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an4"></canvas></div></div></div>
    </div>`;
  mkChart('an1',{type:'bar',data:{labels:totals.map(t=>t.m.short),datasets:[{data:totals.map(t=>t.n),backgroundColor:totals.map(t=>t.m.accent),borderRadius:8,maxBarThickness:40}]},options:baseOpts({legend:false})});
  const closed=['Closed','Cancelled','Store Confirmed','Resolved'];
  let open=0,cl=0; analysisMods.forEach(id=>recsOf(id).forEach(r=>closed.includes(r.status)?cl++:open++));
  mkChart('an2',{type:'doughnut',data:{labels:['Open','Closed'],datasets:[{data:[open,cl],backgroundColor:['#3b82f6','#10b981'],borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  const activity={};
  if(isSuper()) analysisMods.forEach(id=>recsOf(id).forEach(r=>{if(r.store)activity[r.store]=(activity[r.store]||0)+1;}));
  else analysisMods.forEach(id=>{ const m=DB.modules[id]; activity[m.short||m.label]=(activity[m.short||m.label]||0)+recsOf(id).length; });
  const sl=Object.entries(activity).sort((a,b)=>b[1]-a[1]);
  mkChart('an3',{type:'bar',data:{labels:sl.map(x=>x[0]),datasets:[{data:sl.map(x=>x[1]),backgroundColor:'#0e9f6e',borderRadius:8,maxBarThickness:30}]},options:baseOpts({indexAxis:'y',legend:false})});
  const sev={}; analysisMods.forEach(id=>recsOf(id).forEach(r=>{const v=r.severity||r.priority||r.step;if(v)sev[v]=(sev[v]||0)+1;}));
  const se=Object.entries(sev);
  mkChart('an4',{type:'doughnut',data:{labels:se.map(x=>x[0]),datasets:[{data:se.map(x=>x[1]),backgroundColor:se.map(x=>toneHex(x[0])),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
}

/* ============================================================ PHOTO GALLERY */
function pgState(){ State.pg=State.pg||{store:isSuper()?'All stores':State.branch,dept:'All departments',area:'All sections',date:''}; if(State.pg.date===undefined) State.pg.date=''; return State.pg; }
function pgSet(field,value){ const pg=pgState(); pg[field]=value; if(field==='dept') pg.area='All sections'; renderPhotos(); }
function pgPhotos(){
  const rows=[], today=new Date().toISOString().slice(0,10);
  (DB.checklistSubs||[]).forEach(sub=>{
    if(!isSuper()&&sub.store!==State.branch) return;
    (sub.items||[]).forEach(it=>(it.photos||[]).forEach((src,idx)=>rows.push({
      src, store:sub.store||State.branch, dept:sub.dept||'Checklist', area:it.area||'General', task:it.task||'Checklist photo',
      session:sub.session||'', date:sub.date||'', by:sub.by||sub.responsible||'', source:'Checklist', idx
    })));
  });
  if(State.chk&&State.chk.state){
    (DB.checklist.items||[]).map(ckItem).filter(r=>ckStoreOk(r)).forEach(r=>{
      const st=State.chk.state[r.i]||{};
      (st.photos||[]).forEach((src,idx)=>rows.push({
        src, store:State.branch, dept:r.dept, area:r.area||'General', task:r.task, session:State.chk.session||'', date:today, by:'Draft checklist', source:'Draft', idx
      }));
    });
  }
  ['maintenance','incident','complaint','issue'].forEach(id=>{
    const m=DB.modules[id]; if(!m) return;
    (m.records||[]).forEach(r=>{
      if(!r.photo||(!isSuper()&&r.store!==State.branch)) return;
      rows.push({src:r.photo,store:r.store||State.branch,dept:r.department||r.category||m.short,area:r.location||r.category||m.short,task:r.title||r.equipment||r.summary||r.shortDescription||r.issue||r.description||m.label,session:'',date:String(r.created||r.date||'').slice(0,10),by:r.reportedBy||'',source:m.short,idx:0});
    });
  });
  ((DB.binAdmin&&DB.binAdmin.records)||[]).forEach(r=>{
    if(!r.photo||(!isSuper()&&r.store!==State.branch)) return;
    rows.push({src:r.photo,store:r.store||State.branch,dept:'Bin Admin',area:r.day||'Bin collection',task:`${r.binQty||''} bins taken out`,session:'',date:r.date||String(r.created||'').slice(0,10),by:r.staffName||'',source:'Bin Admin',idx:0});
  });
  (DB.scheduleHistory||[]).forEach(r=>{
    if(!r.photo||(!isSuper()&&r.store!==State.branch)) return;
    rows.push({src:r.photo,store:r.store||State.branch,dept:r.type==='maintenance'?'Maintenance':'Cleaning',area:r.dept||'Schedule',task:r.task||'Completed task',session:r.day||'',date:r.date||String(r.created||'').slice(0,10),by:r.staffName||'',source:'Cleaning & Maintenance',idx:0});
  });
  return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function renderPhotos(){
  setAccent('#0891b2'); setCrumb('🖼️','Photo Gallery','Evidence photos from checklists & reports');
  const pg=pgState(), all=pgPhotos();
  const stores=isSuper()?['All stores',...DB.stores]:[State.branch];
  if(!stores.includes(pg.store)) pg.store=stores[0];
  let scoped=all.filter(p=>(pg.store==='All stores'||p.store===pg.store));
  const depts=['All departments',...[...new Set(scoped.map(p=>p.dept).filter(Boolean))].sort()];
  if(!depts.includes(pg.dept)) pg.dept='All departments';
  scoped=scoped.filter(p=>pg.dept==='All departments'||p.dept===pg.dept);
  const areas=['All sections',...[...new Set(scoped.map(p=>p.area).filter(Boolean))].sort()];
  if(!areas.includes(pg.area)) pg.area='All sections';
  scoped=scoped.filter(p=>pg.area==='All sections'||p.area===pg.area);
  scoped=scoped.filter(p=>!pg.date||String(p.date||'').slice(0,10)===pg.date);
  const groups={};
  scoped.forEach(p=>{ const k=`${p.dept}||${p.area}`; (groups[k]=groups[k]||[]).push(p); });
  const html=Object.entries(groups).map(([k,photos])=>{
    const [dept,area]=k.split('||'), meta=(DB.checklist.deptMeta||{})[dept]||{};
    return `<div class="pg-section card"><div class="card-head"><h3><span class="chk-dot" style="background:${meta.color||'#0891b2'}"></span>${esc(dept)} · ${esc(area)}</h3><span class="ch-sub">${photos.length} photo${photos.length!==1?'s':''}</span></div>
      <div class="photo-grid">${photos.map(p=>`<div class="photo-tile real" style="cursor:zoom-in;background-image:linear-gradient(transparent,rgba(0,0,0,.62)),url('${imgSrc(p.src)}')" onclick="openLightbox('${ckJS(imgSrc(p.src))}')">
        <span class="pt-ic">🔍</span><div class="pt-cap">${esc(p.task)}<small>${esc(p.store)} · ${esc(p.session||p.source)} · ${esc(p.date||'')}</small>${p.by?`<small>By ${esc(p.by)}</small>`:''}</div></div>`).join('')}</div></div>`;
  }).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🖼️</div><div><h2>Photo Gallery</h2><p>Browse photo evidence captured against checklist tasks and issue reports.</p></div>
    <div class="ph-actions">
      <select class="login-input" style="width:auto" onchange="pgSet('store',this.value)">${stores.map(s=>`<option ${s===pg.store?'selected':''}>${esc(s)}</option>`).join('')}</select>
      <select class="login-input" style="width:auto" onchange="pgSet('dept',this.value)">${depts.map(d=>`<option ${d===pg.dept?'selected':''}>${esc(d)}</option>`).join('')}</select>
      <select class="login-input" style="width:auto" onchange="pgSet('area',this.value)">${areas.map(a=>`<option ${a===pg.area?'selected':''}>${esc(a)}</option>`).join('')}</select>
      <input type="date" class="login-input" style="width:auto" value="${esc(pg.date||'')}" title="Filter by date" onchange="pgSet('date',this.value)">
      ${pg.date?`<button class="btn sm" onclick="pgSet('date','')" title="Show all dates">✕ All dates</button>`:''}
    </div></div>
    <div class="kpi-grid"><div class="kpi tone-info"><div class="k-top"><div class="k-ic">📷</div></div><div class="k-val">${scoped.length}</div><div class="k-lbl">Photos shown</div></div><div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${all.filter(p=>p.source==='Checklist'||p.source==='Draft').length}</div><div class="k-lbl">Checklist photos</div></div><div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🚩</div></div><div class="k-val">${all.filter(p=>p.source!=='Checklist'&&p.source!=='Draft').length}</div><div class="k-lbl">Report photos</div></div></div>
    ${html||'<div class="empty">No photos found for this store / department / section yet.</div>'}`;
}

/* ============================================================ WHATSAPP DAILY SHARE */
function renderWhatsapp(){
  setAccent('#128C7E'); setCrumb('💬','Daily Share',`${isSuper()?'All stores':State.branch} · WhatsApp report`);
  if(!State.wa) State.wa={period:'Opening'};
  const period=State.wa.period, C=DB.checklist;
  const byDept={};
  C.items.forEach((it,i)=>{ const r=ckItem(it,i); if(!ckStoreOk(r)) return; const when=it[3], inP=period==='Opening'?(when==='O'||when==='A'):period==='Mid-afternoon'?(when==='M'):(when==='C'||when==='A'); if(!inP) return;
    const dept=it[0], ps=photoSpec(it[4]), st=(State.chk&&State.chk.state[i])||{};
    const d=byDept[dept]=byDept[dept]||{total:0,done:0,photos:[],reqMissing:0,tempBad:0,meta:C.deptMeta[dept]||{}};
    d.total++; if(st.done)d.done++; (st.photos||[]).forEach(u=>d.photos.push(u)); if(ps&&ps.req&&!(st.photos||[]).length)d.reqMissing++; if(st.temp&&st.temp.inRange===false)d.tempBad++; });
  const tempBadTotal=Object.values(byDept).reduce((n,d)=>n+(d.tempBad||0),0);
  const snap=[
    ['💬','Complaints',DB.modules.complaint.records.filter(r=>r.status==='Open').length,'open','#ec4899'],
    ['🛠️','Maintenance',DB.modules.maintenance.records.filter(r=>!['Closed','Cancelled','Store Confirmed'].includes(r.status)).length,'open','#f59e0b'],
    ['⚠️','Incidents',DB.modules.incident.records.filter(r=>!['Closed','Cancelled'].includes(r.status)).length,'open','#ef4444'],
    ['🚚','Deliveries',DB.modules.delivery.records.length,'trips','#3b82f6'] ];
  let allPhotos=[]; Object.values(byDept).forEach(d=>allPhotos=allPhotos.concat(d.photos));
  const date=new Date().toLocaleDateString();
  const deptCards=Object.entries(byDept).map(([dept,d])=>{
    const pct=d.total?Math.round(d.done/d.total*100):0;
    const realThumbs=d.photos.map(u=>`<img src="${imgSrc(u)}">`).join('');
    const ph=d.photos.length?'':Array.from({length:Math.max(2,Math.min(5,d.reqMissing))}).map(()=>`<span class="wa-ph" style="background:${d.meta.color||'#888'}"><i class="fas ${d.meta.icon||'fa-camera'}"></i></span>`).join('');
    return `<div class="wa-card"><span class="wa-stripe" style="background:${d.meta.color||'#888'}"></span>
      <div class="wa-body"><div class="wa-pills">
        <span class="wa-pill" style="background:${d.meta.color||'#888'}">${esc(dept)}</span>
        <span class="wa-pill" style="background:${pct>=90?'#43A047':'#FB8C00'}">${d.done}/${d.total} · ${pct}%</span>
        <span class="wa-pill" style="background:#1A1A2E">📷 ${d.photos.length||d.reqMissing} photos</span></div>
        <div class="wa-thumbs">${realThumbs}${ph}</div></div></div>`;
  }).join('');
  const msg=`*MCQ ${State.branch} — ${period} Report (${date})*\n`+Object.entries(byDept).map(([dept,d])=>`• ${dept}: ${d.done}/${d.total} done${d.tempBad?` · 🌡️ ${d.tempBad} temp alert`:''}`).join('\n')+
    (tempBadTotal?`\n\n⚠️ TEMPERATURE ALERTS: ${tempBadTotal} reading(s) OUT OF RANGE`:'')+
    `\n\n💬 Complaints open: ${snap[0][2]}\n🛠️ Maintenance open: ${snap[1][2]}\n⚠️ Incidents open: ${snap[2][2]}\n🚚 Deliveries: ${snap[3][2]}\n📷 Photos attached: ${allPhotos.length}\n\n_Sent from MCQ Supermarket_`;
  $('#content').innerHTML=`
    <div class="wa-hero">
      <div class="wa-date">📅 ${date} · ${period} report</div>
      <h2><i class="fab fa-whatsapp"></i>&nbsp; ${period} Report — ready to share</h2>
      <p>Auto-built from today’s checklist, photo evidence and open items. Tap Share to send it straight to your team WhatsApp group.</p>
      <div class="wa-toggle"><button class="${period==='Opening'?'active':''}" onclick="waPeriod('Opening')">☀️ Opening</button><button class="${period==='Mid-afternoon'?'active':''}" onclick="waPeriod('Mid-afternoon')">🌤️ Mid-afternoon</button><button class="${period==='Closing'?'active':''}" onclick="waPeriod('Closing')">🌙 Closing</button></div>
      <div class="wa-actions"><button class="wa-share" onclick="waSharePDF()"><i class="fab fa-whatsapp"></i>&nbsp; Share PDF to WhatsApp</button>
        <button class="wa-dl" onclick="waCopy()"><i class="fas fa-copy"></i>&nbsp; Copy summary</button></div>
    </div>
    ${tempBadTotal?`<div class="rail-tip" style="margin-top:14px;background:#fef2f2;border-color:#f3c9c9;color:#b91c1c">⚠️ <b>${tempBadTotal} temperature reading(s) out of range</b> today — included in the report.</div>`:''}
    <div class="section-title">What's in the ${period} report</div>
    <div class="wa-cards">${deptCards||'<div class="empty">No checklist tasks for this period.</div>'}</div>
    <div class="section-title">Operations snapshot</div>
    <div class="kpi-grid">${snap.map(s=>`<div class="kpi"><div class="k-top"><div class="k-ic" style="background:${s[4]}1f;color:${s[4]}">${s[0]}</div></div><div class="k-val" style="color:${s[4]}">${s[2]}</div><div class="k-lbl">${s[1]} ${s[3]}</div></div>`).join('')}</div>
    ${allPhotos.length?`<div class="section-title">Photo evidence · ${allPhotos.length}</div><div class="wa-gallery">${allPhotos.map(u=>`<img src="${imgSrc(u)}" onclick="openLightbox('${ckJS(imgSrc(u))}')" style="cursor:zoom-in">`).join('')}</div>`:''}
    <div class="section-title">Message preview</div>
    <div class="card card-pad"><textarea id="wa-msg" style="min-height:170px;font-family:monospace">${esc(msg)}</textarea>
      <div class="fhint" style="margin-top:8px">💡 <b>Share PDF</b> builds a branded report (checklist + photos + temperature alerts) for the selected period and opens the WhatsApp share sheet. “Copy summary” copies the text version.</div></div>`;
}
function waPeriod(p){ State.wa.period=p; renderWhatsapp(); }
function waSharePDF(){ const p=(State.wa&&State.wa.period)||'Opening'; return ckSharePDF(p); }   // builds branded PDF (checklist + photos + temp alerts) and shares
function waShare(){ const txt=$('#wa-msg')?$('#wa-msg').value:''; const t=encodeURIComponent(txt);
  if(navigator.share){ navigator.share({title:'MCQ Daily Report',text:txt}).catch(()=>window.open('https://wa.me/?text='+t,'_blank')); }
  else window.open('https://wa.me/?text='+t,'_blank'); }
function waCopy(){ navigator.clipboard?.writeText($('#wa-msg').value); toast('Summary copied'); }

/* ============================================================ EMAIL NOTIFICATIONS */
/* ============================================================ EMAIL SENDING (copies the restaurant: Brevo HTTP API + Gmail-compose / mailto) */
window.mcqEmail={
  cfg(){ const c=DB.emailConfig||(DB.emailConfig={channel:'brevo',apiKey:'',fromEmail:'mcqcafe.notify@gmail.com',fromName:'MCQ Supermarket Notification'}); c.channel='brevo'; return c; },
  recipients(eventType,meta){ const recips=DB.emailRecipients||[]; let keys;
    if(eventType==='checklist') keys=(DB.checklistEmailRoutes&&DB.checklistEmailRoutes[meta&&meta.dept])||[];
    else if(eventType==='issue') keys=(DB.issueEmailRoutes&&DB.issueEmailRoutes[meta&&meta.cat])||[];
    else keys=recips.map(r=>r.key);   // violation & others broadcast
    return recips.filter(r=>keys.includes(r.key)&&r.email); },
  _html(title,body){ return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;margin:auto"><div style="background:linear-gradient(135deg,#0e9f6e,#0891b2);color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><div style="font-weight:800;font-size:18px">MCQ Supermarket</div><div style="opacity:.9;font-size:13px">${esc(title)}</div></div><div style="border:1px solid #e5e7eb;border-top:0;padding:18px 20px;border-radius:0 0 12px 12px;white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(body)}</div><div style="color:#9ca3af;font-size:11px;text-align:center;margin-top:10px">Automated notification · MCQ Supermarket Operations</div></div>`; },
  // can we send silently?
  //  • server relay present (key on the server) → send silently by default, unless the
  //    admin explicitly chose Gmail compose or the device mail app.
  //  • no relay → only if a frontend Brevo key + sender are configured.
  canBrevo(){ const c=this.cfg();
    if(window.MCQ_EMAIL_RELAY) return c.channel!=='gmail' && c.channel!=='mailto';
    return c.channel==='brevo' && !!c.apiKey && !!c.fromEmail; },
  notify(eventType,subject,body,meta){ const to=this.recipients(eventType,meta); if(!to.length) return; const cfg=this.cfg();
    if(this.canBrevo()) return this._brevo(to,subject,body,cfg);
    if(cfg.channel==='gmail'){ this._gmail(to,subject,body); toast(`📧 Gmail compose opened · ${to.length} recipient(s)`); return; }
    if(cfg.channel==='mailto'){ window.location.href=this._mailto(to,subject,body); return; }
    toast(`📧 ${to.length} recipient(s) would be notified (demo) — enable real sending in Email settings`); },
  alert(subject,body,extraEmails){
    const cfg=this.cfg(), to=[], seen={};
    (extraEmails||[]).forEach(e=>{ e=String(e||'').trim(); if(e&&!seen[e.toLowerCase()]){ seen[e.toLowerCase()]=1; to.push({email:e,name:e}); } });
    try{ (window.mgrStoreRecipients?mgrStoreRecipients(State.branch):[]).forEach(r=>{ if(r.email&&!seen[r.email.toLowerCase()]){ seen[r.email.toLowerCase()]=1; to.push(r); } }); }catch(e){}
    if(!to.length) return false;
    if(this.canBrevo()){ this._brevo(to,subject,body,cfg); return 'silent'; }   // background, no window
    if(cfg.channel==='gmail'){ this._gmail(to,subject,body); return 'compose'; }
    return 'queued';
  },
  log(to,subject,ok,error){
    try{ DB.emailLog=DB.emailLog||[];
      DB.emailLog.unshift({ts:new Date().toISOString(), to:(to||[]).map(r=>r.email||r).filter(Boolean), subject:subject||'', ok:!!ok, error:error||'', store:(window.State&&State.branch)||''});
      if(DB.emailLog.length>100) DB.emailLog.length=100;
      if(window.persist) window.persist();
      if(window.State&&State.route==='email' && typeof renderEmail==='function' && document.getElementById('email-log-body')) renderEmailLog();
    }catch(e){}
  },
  _brevo(to,subject,body,cfg){
    cfg=cfg||this.cfg(); const self=this;
    if(window.MCQ_EMAIL_RELAY){   // preferred: server holds the key (nothing secret in the browser/repo)
      fetch(window.MCQ_EMAIL_RELAY,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+((window.localStorage&&localStorage.getItem('mcq_token'))||'')},
        body:JSON.stringify({to:to.map(r=>({email:r.email,name:r.name})),subject,html:this._html(subject,body),fromEmail:cfg.fromEmail,fromName:cfg.fromName})})
        .then(r=>r.json().catch(()=>({}))).then(d=>{ const ok=!!(d&&d.ok); self.log(to,subject,ok,ok?'':((d&&d.error)||'set BREVO_API_KEY on the server')); toast(ok?`📧 Sent to ${to.length} (Brevo)`:('📧 Not sent: '+((d&&d.error)||'set BREVO_API_KEY on the server'))); })
        .catch(()=>{ self.log(to,subject,false,'email server unreachable'); toast('📧 Email server unreachable'); });
      return;
    }
    if(!(cfg.apiKey&&cfg.fromEmail)){ this.log(to,subject,false,'Brevo not configured'); toast('📧 Brevo not configured'); return; }
    fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'accept':'application/json','content-type':'application/json','api-key':cfg.apiKey},
      body:JSON.stringify({sender:{name:cfg.fromName||'MCQ Supermarket',email:cfg.fromEmail},to:to.map(r=>({email:r.email,name:r.name})),subject,htmlContent:this._html(subject,body)})})
      .then(r=>{ self.log(to,subject,r.ok,r.ok?'':('Brevo error '+r.status)); if(r.ok) toast(`📧 Sent to ${to.length} via Brevo`); else toast('📧 Brevo error '+r.status+' — check API key / sender'); })
      .catch(()=>{ self.log(to,subject,false,'CORS blocked'); toast('📧 Browser blocked Brevo (CORS) — deploy on the server to send silently'); }); },
  sendPdf(to,subject,body,base64,filename){ const self=this, cfg=this.cfg();
    if(!window.MCQ_EMAIL_RELAY){ this._brevo(to,subject,body,cfg); return; }   // no relay → send body only
    fetch(window.MCQ_EMAIL_RELAY,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+((window.localStorage&&localStorage.getItem('mcq_token'))||'')},
      body:JSON.stringify({to:to.map(r=>({email:r.email,name:r.name})),subject,html:this._html(subject,body),fromEmail:cfg.fromEmail,fromName:cfg.fromName,attachment:[{content:base64,name:filename}]})})
      .then(r=>r.json().catch(()=>({}))).then(d=>{ const ok=!!(d&&d.ok); self.log(to,subject,ok,ok?'':((d&&d.error)||'send failed')); toast(ok?`📧 PDF sent to ${to.length}`:('📧 Not sent: '+((d&&d.error)||'check server'))); })
      .catch(()=>{ self.log(to,subject,false,'email server unreachable'); toast('📧 Email server unreachable'); }); },
  _gmail(to,subject,body){ window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to.map(r=>r.email).join(','))+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),'_blank'); },
  _mailto(to,subject,body){ return 'mailto:'+encodeURIComponent(to.map(r=>r.email).join(','))+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body); },
  test(){ const cfg=this.cfg(), to=(DB.emailRecipients||[]).filter(r=>r.email).slice(0,1); if(!to.length){toast('No recipients with an email');return;}
    if(this.canBrevo()) this._brevo(to,'MCQ Supermarket — test email','This is a test notification from MCQ Supermarket. If you received this, real email sending works.',cfg);
    else if(cfg.channel==='gmail'){ this._gmail(to,'MCQ Supermarket — test email','This is a test notification from MCQ Supermarket.'); toast('📧 Gmail compose opened'); }
    else if(cfg.channel==='mailto'){ window.location.href=this._mailto(to,'MCQ Supermarket — test email','Test'); }
    else toast('Demo mode — choose Brevo or Gmail to actually send'); }
};
function emailCfgSet(f,v){ mcqEmail.cfg()[f]=v; if(window.persist) window.persist(); }
function emailCfgChannel(v){ emailCfgSet('channel',v); renderEmail(); }
function emailTest(){ mcqEmail.test(); }
function renderEmail(){
  setAccent('#1565c0'); setCrumb('✉️','Email Notifications','Customise who gets which alerts');
  const cfg=mcqEmail.cfg();
  const recips=DB.emailRecipients||[], cats=DB.issueCategories||{}, groups=DB.issueGroups||[];
  const cards=recips.map(r=>{
    const myN=Object.keys(cats).filter(k=>(DB.issueEmailRoutes[k]||[]).includes(r.key)).length;
    const open=State.emailOpen===r.key;
    const dd=open?`<div class="email-dd">${groups.map(g=>{const inG=Object.entries(cats).filter(([k,c])=>c.group===g); return inG.length?`<div class="email-grp">${esc(g)}</div><div class="email-cats">`+inG.map(([k,c])=>{const on=(DB.issueEmailRoutes[k]||[]).includes(r.key);return `<label class="email-cat"><input type="checkbox" ${on?'checked':''} onchange="issEmailToggle('${k}','${r.key}',this.checked);emailRefreshCount('${r.key}')"><i class="fas ${c.icon}" style="color:${c.color}"></i> ${esc(c.label)}</label>`;}).join('')+`</div>`:'';}).join('')}</div>`:'';
    return `<div class="card email-card"><div class="email-row">
        <div class="avatar">${esc(r.name.slice(0,1))}</div>
        <div class="email-info"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></div>
        <span class="badge info" id="email-cnt-${r.key}">${myN} categories</span>
        <button class="btn sm" onclick="emailToggleDD('${r.key}')">Customise ${open?'▲':'▾'}</button>
      </div>${dd}</div>`;
  }).join('');
  const chkDepts=(DB.checklist&&DB.checklist.depts)||[], dm=(DB.checklist&&DB.checklist.deptMeta)||{};
  DB.checklistEmailRoutes=DB.checklistEmailRoutes||{};
  const chkCards=recips.map(r=>{
    const n=chkDepts.filter(d=>(DB.checklistEmailRoutes[d]||[]).includes(r.key)).length;
    const open=State.emailOpenChk===r.key;
    const dd=open?`<div class="email-dd"><div class="email-cats">${chkDepts.map(d=>{const on=(DB.checklistEmailRoutes[d]||[]).includes(r.key), meta=dm[d]||{}; return `<label class="email-cat"><input type="checkbox" ${on?'checked':''} onchange="chkEmailToggle('${ckJS(d)}','${r.key}',this.checked);emailRefreshChkCount('${r.key}')"><i class="fas ${meta.icon||'fa-list-check'}" style="color:${meta.color||'#0e9f6e'}"></i> ${esc(d)}</label>`;}).join('')}</div></div>`:'';
    return `<div class="card email-card"><div class="email-row">
        <div class="avatar">${esc(r.name.slice(0,1))}</div>
        <div class="email-info"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></div>
        <span class="badge ok" id="chkmail-cnt-${r.key}">${n} checklists</span>
        <button class="btn sm" onclick="emailToggleChk('${r.key}')">Customise ${open?'▲':'▾'}</button>
      </div>${dd}</div>`;
  }).join('');
  const relayOn=!!window.MCQ_EMAIL_RELAY;
  // editable recipient rows (name + email + delete)
  const recipEditRows=recips.map(r=>`<div class="email-row" style="gap:8px">
      <div class="avatar">${esc((r.name||'?').slice(0,1))}</div>
      <input class="login-input" style="flex:1;min-width:120px" value="${esc(r.name||'')}" placeholder="Name / role" oninput="recipSet('${r.key}','name',this.value)">
      <input class="login-input" style="flex:1.4;min-width:150px" type="email" value="${esc(r.email||'')}" placeholder="email@address.com" oninput="recipSet('${r.key}','email',this.value)">
      <button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="recipDel('${r.key}')" title="Delete recipient">🗑</button>
    </div>`).join('');
  // department-lead block (per store)
  const leadStore=isSuper()?(State.emailLeadStore||DB.stores[0]):State.branch;
  const leadStorePicker=isSuper()?`<select class="login-input" style="max-width:220px" onchange="emailLeadStore(this.value)">${(DB.stores||[]).map(s=>`<option ${s===leadStore?'selected':''}>${esc(s)}</option>`).join('')}</select>`:'';
  const leadBlocks=chkDepts.map(d=>{ const meta=dm[d]||{}; const list=leadList(leadStore,d); const staffOpts=leadStaffFor(leadStore,d);
    const rows=list.map((l,i)=>`<div class="email-row" style="gap:8px;padding:6px 0">
        <select class="login-input" style="flex:1;min-width:120px" onchange="leadPick('${ckJS(leadStore)}','${ckJS(d)}',${i},this)">
          <option value="">— Select staff —</option>
          ${staffOpts.map(sm=>`<option value="${esc(sm.name)}" data-email="${esc(sm.email||'')}" ${sm.name===l.name?'selected':''}>${esc(sm.name)}${sm.role?(' · '+esc(sm.role)):''}</option>`).join('')}
          ${l.name&&!staffOpts.some(sm=>sm.name===l.name)?`<option value="${esc(l.name)}" selected>${esc(l.name)} (manual)</option>`:''}
        </select>
        <input class="login-input" style="flex:1.4;min-width:150px" type="email" value="${esc(l.email||'')}" placeholder="lead@email.com" oninput="leadSet('${ckJS(leadStore)}','${ckJS(d)}',${i},'email',this.value)">
        <button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="leadDel('${ckJS(leadStore)}','${ckJS(d)}',${i})">🗑</button>
      </div>`).join('');
    return `<div class="card" style="margin-bottom:10px"><div class="card-head"><h3 style="font-size:14px"><i class="fas ${meta.icon||'fa-list-check'}" style="color:${meta.color||'#0e9f6e'}"></i>&nbsp; ${esc(d)}</h3><span class="ch-sub">${list.length} lead(s)</span></div>
      <div class="card-pad">${rows||'<div class="fhint" style="margin:0 0 8px">No leads yet for this department.</div>'}
        <button class="btn sm" style="margin-top:6px" onclick="leadAdd('${ckJS(leadStore)}','${ckJS(d)}')">＋ Add lead</button></div></div>`;
  }).join('');
  // super: daily-digest recipients (server scheduled 9pm)
  const digestCard=isSuper()?`<div class="card" style="margin-bottom:16px"><div class="card-head"><h3><i class="fas fa-clock"></i>&nbsp; Daily summary recipients (Super Admin)</h3><span class="ch-sub">Automatic 9 PM all-store PDF digest is emailed to these addresses</span></div>
      <div class="card-pad" id="digest-recips"><div class="fhint">Loading…</div></div></div>`:'';
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic" style="background:#e8f1fe">✉️</div><div><h2>Email Notifications</h2><p>Emails send automatically in the background via Brevo. Set who receives what below.</p></div><div class="ph-actions"><button class="btn sm" onclick="emailHistoryOpen()"><i class="fas fa-clock-rotate-left"></i>&nbsp; Sent history</button><button class="btn sm primary" onclick="emailTest()"><i class="fas fa-paper-plane"></i>&nbsp; Send test</button></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h3><i class="fas fa-paper-plane"></i>&nbsp; Sending</h3><span class="ch-sub">Automatic · Brevo (server-side key)</span></div>
      <div class="card-pad"><div class="grid2">
        <div class="field"><label>From name</label><input value="${esc(cfg.fromName||'')}" oninput="emailCfgSet('fromName',this.value)" placeholder="MCQ Supermarket Notification"></div>
        <div class="field"><label>Status</label><input value="${relayOn?'✅ Connected — emails send silently':'⚠️ Server relay not detected'}" disabled></div>
      </div>
      <div class="rail-tip" style="margin-top:12px">📨 Emails are sent <b>automatically and silently</b> through the server (Brevo). No API key needed here — it lives safely on the server. Use <b>Sent history</b> to confirm delivery.</div>
      </div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h3><i class="fas fa-user-shield"></i>&nbsp; Store Admin · verify-note recipient</h3><span class="ch-sub">${isSuper()?'When a store’s checklist is verified with a note, it is emailed to that store’s admin.':'When a '+esc(State.branch)+' checklist is verified with a note, it is emailed to this store admin.'}</span></div>
      <div class="card-pad"><div class="grid2">
        <div class="field"><label>Store admin name</label><input value="${esc(cfg.managerName||'')}" oninput="emailCfgSet('managerName',this.value)" placeholder="Store admin name"></div>
        <div class="field"><label>Store admin email</label><input type="email" value="${esc(cfg.managerEmail||'')}" oninput="emailCfgSet('managerEmail',this.value)" placeholder="admin@store.com"></div>
      </div>
      <div class="rail-tip" style="margin-top:12px">🔒 Per-store setting — staff flagged <b>Admin</b> with an email also receive these.</div>
      </div></div>
    ${digestCard}
    <div class="rail-tip" style="margin-bottom:16px;background:var(--bad-bg);border-color:#f3c9c9">⚠️ <b>Violation alerts</b> are sent to <b>all recipients</b> by default — no per-category opt-out.</div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>📇 Recipients</h3><span class="ch-sub">${recips.length} people · edit name/email or add</span></div>
      <div class="card-pad">${recipEditRows||'<div class="fhint">No recipients yet.</div>'}<button class="btn sm primary" style="margin-top:10px" onclick="recipAdd()">＋ Add recipient</button></div></div>
    <div class="section-title">Report Issue · who receives which category</div>
    <div class="email-list">${cards||'<div class="empty">No recipients.</div>'}</div>
    <div class="section-title" style="margin-top:24px">Checklist submissions · who receives which checklist</div>
    <div class="email-list">${chkCards||'<div class="empty">No recipients.</div>'}</div>
    <div class="section-title" style="margin-top:24px">Department leaders · verified-note recipients ${leadStorePicker}</div>
    <p class="fhint" style="margin:-4px 0 12px">When a manager verifies a checklist with an assessment note, the leader(s) below for that department receive a branded PDF report. ${isSuper()?'Pick a store above — each store has its own leaders.':'These are for <b>'+esc(State.branch)+'</b>.'}</p>
    ${leadBlocks||'<div class="empty">No checklist departments.</div>'}
    <div id="email-log-modal" class="lb-overlay" style="display:none" onclick="if(event.target===this)emailHistoryClose()"><div class="lb-panel" onclick="event.stopPropagation()"><div class="card-head" style="padding:14px 16px"><h3>📜 Sent history</h3><button class="x-btn" onclick="emailHistoryClose()">✕</button></div><div id="email-log-body" class="card-pad" style="max-height:60vh;overflow:auto"></div></div></div>`;
  if(isSuper()) digestRender();
}
function renderEmailLog(){
  const el=document.getElementById('email-log-body'); if(!el) return;
  const log=DB.emailLog||[];
  el.innerHTML = log.length ? `<table class="grid"><thead><tr><th>Time</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>${log.map(e=>`<tr><td>${esc((e.ts||'').slice(0,16).replace('T',' '))}</td><td><div class="wrap">${esc((e.to||[]).join(', '))}</div></td><td><div class="wrap">${esc(e.subject||'')}</div></td><td>${e.ok?'<span class="badge ok">✓ Sent</span>':'<span class="badge bad">✗ '+esc(e.error||'failed')+'</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No emails sent yet.</div>';
}
function emailHistoryOpen(){ const m=document.getElementById('email-log-modal'); if(m){ m.style.display='flex'; renderEmailLog(); } }
function emailHistoryClose(){ const m=document.getElementById('email-log-modal'); if(m) m.style.display='none'; }
/* ---- recipients CRUD ---- */
function recipAdd(){ DB.emailRecipients=DB.emailRecipients||[]; DB.emailRecipients.push({key:'r'+Date.now().toString(36),name:'',email:''}); if(window.persist) window.persist(); renderEmail(); }
function recipSet(key,field,val){ const r=(DB.emailRecipients||[]).find(x=>x.key===key); if(r){ r[field]=val; if(window.persist) window.persist(); } }
function recipDel(key){ if(!confirm('Remove this recipient?')) return; DB.emailRecipients=(DB.emailRecipients||[]).filter(x=>x.key!==key); if(window.persist) window.persist(); renderEmail(); }
/* ---- per-store department-lead emails ---- */
function leadList(store,dept){ const m=DB.checklistLeadEmails||(DB.checklistLeadEmails={}); return ((m[store]||{})[dept])||[]; }
function leadAdd(store,dept){ const m=DB.checklistLeadEmails=DB.checklistLeadEmails||{}; m[store]=m[store]||{}; m[store][dept]=m[store][dept]||[]; m[store][dept].push({name:'',email:''}); if(window.persist) window.persist(); renderEmail(); }
function leadSet(store,dept,i,field,val){ const a=leadList(store,dept); if(a[i]){ a[i][field]=val; if(window.persist) window.persist(); } }
function leadDel(store,dept,i){ const a=leadList(store,dept); if(i>=0&&i<a.length){ a.splice(i,1); if(window.persist) window.persist(); renderEmail(); } }
// staff that belong to a checklist department, for a SPECIFIC store (super may pick any store)
function leadStaffFor(store,dept){
  const all=(DB.staff||[]).filter(s=>s.active!==0 && s.store===store && s.name);
  const dn=staffNorm(dept); let rows=[];
  if(dn) rows=all.filter(s=> staffIsAdmin(s) || (Array.isArray(s.roles)&&s.roles.some(r=>staffNorm(r)===dn)) || staffNorm(s.dept)===dn);
  if(!rows.length){ const needles=staffDeptNeedles(dept); if(needles.length) rows=all.filter(s=>{ const role=staffNorm(s.role), name=staffNorm(s.name); return needles.some(n=>role.includes(n)||name.includes(n)); }); }
  if(!rows.length) rows=all;   // fallback: any staff in this store
  return rows;
}
function leadPick(store,dept,i,sel){ const a=leadList(store,dept); if(!a[i]) return;
  a[i].name=sel.value;
  const opt=sel.options[sel.selectedIndex], email=opt&&opt.getAttribute('data-email');
  if(email) a[i].email=email;   // auto-fill from the staff record (admin can still edit)
  if(window.persist) window.persist(); renderEmail(); }
function emailLeadStore(s){ State.emailLeadStore=s; renderEmail(); }
/* ---- super-admin daily-digest recipients (server-side settings) ---- */
function digestRender(){
  const el=document.getElementById('digest-recips'); if(!el) return;
  const draw=(emails)=>{ State.digestEmails=emails||[];
    el.innerHTML=(State.digestEmails.length?State.digestEmails.map((e,i)=>`<div class="email-row" style="gap:8px;padding:6px 0"><input class="login-input" style="flex:1" type="email" value="${esc(e)}" placeholder="superadmin@email.com" oninput="digestSet(${i},this.value)"><button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="digestDel(${i})">🗑</button></div>`).join(''):'<div class="fhint">No recipients yet — add the super-admin email(s) that should receive the 9 PM all-store summary.</div>')
      +`<button class="btn sm primary" style="margin-top:8px" onclick="digestAdd()">＋ Add email</button>`; };
  if(window.mcqSettings){ mcqSettings.get('digest_emails').then(d=>{ let v=d&&d.value; if(typeof v==='string'){ try{v=JSON.parse(v);}catch(e){v=[];} } draw(Array.isArray(v)?v:[]); }); }
  else draw(State.digestEmails||[]);
}
function digestSave(){ if(window.mcqSettings) mcqSettings.set('digest_emails',State.digestEmails||[]).then(()=>toast('💾 Daily-summary recipients saved')); }
function digestAdd(){ State.digestEmails=State.digestEmails||[]; State.digestEmails.push(''); digestRenderInline(); }
function digestSet(i,v){ State.digestEmails=State.digestEmails||[]; State.digestEmails[i]=v; clearTimeout(window._digestT); window._digestT=setTimeout(digestSave,800); }
function digestDel(i){ State.digestEmails.splice(i,1); digestSave(); digestRenderInline(); }
function digestRenderInline(){ const el=document.getElementById('digest-recips'); if(!el) return;
  el.innerHTML=(State.digestEmails.length?State.digestEmails.map((e,i)=>`<div class="email-row" style="gap:8px;padding:6px 0"><input class="login-input" style="flex:1" type="email" value="${esc(e)}" placeholder="superadmin@email.com" oninput="digestSet(${i},this.value)"><button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="digestDel(${i})">🗑</button></div>`).join(''):'<div class="fhint">No recipients yet.</div>')
    +`<button class="btn sm primary" style="margin-top:8px" onclick="digestAdd()">＋ Add email</button>`; }
function emailToggleDD(k){ State.emailOpen=State.emailOpen===k?null:k; renderEmail(); }
function emailRefreshCount(k){ const cats=DB.issueCategories||{}; const n=Object.keys(cats).filter(c=>(DB.issueEmailRoutes[c]||[]).includes(k)).length; const el=document.getElementById('email-cnt-'+k); if(el) el.textContent=n+' categories'; }
function emailToggleChk(k){ State.emailOpenChk=State.emailOpenChk===k?null:k; renderEmail(); }
function emailRefreshChkCount(k){ const depts=(DB.checklist&&DB.checklist.depts)||[]; const n=depts.filter(d=>(DB.checklistEmailRoutes[d]||[]).includes(k)).length; const el=document.getElementById('chkmail-cnt-'+k); if(el) el.textContent=n+' checklists'; }
function chkEmailToggle(dept,rk,on){ const a=DB.checklistEmailRoutes[dept]=DB.checklistEmailRoutes[dept]||[]; const i=a.indexOf(rk); if(on&&i<0)a.push(rk); if(!on&&i>=0)a.splice(i,1); if(window.persist) window.persist(); }

/* ============================================================ SUPER ADMIN — STORE CONFIG */
function cfgClone(v){ return JSON.parse(JSON.stringify(v==null?null:v)); }
function cfgState(){ State.cfg=State.cfg||{store:DB.stores[0],tab:'staff',loading:false,error:'',data:null}; if(!State.cfg.store) State.cfg.store=DB.stores[0]; if(!State.cfg.tab) State.cfg.tab='staff'; return State.cfg; }
function cfgLocalData(store){ return {store,staff:(DB.staff||[]).filter(s=>s.store===store).map(cfgClone),checklistItems:cfgClone((DB.checklist&&DB.checklist.items)||[]),scheduleTasks:cfgClone(DB.scheduleTasks||[]),auditLogs:(DB.auditLogs||[]).filter(a=>a.store===store).map(cfgClone)}; }
function cfgSelectStore(store){ const c=cfgState(); c.store=store; c.data=null; c.error=''; cfgLoad(store); renderStoreConfig(); }
function cfgTab(tab){ cfgState().tab=tab; renderStoreConfig(); }
async function cfgLoad(store){ const c=cfgState(); c.loading=true; c.error=''; renderStoreConfig(); try{ c.data=(window.MCQDB&&MCQDB.fetchStoreConfig)?await MCQDB.fetchStoreConfig(store):cfgLocalData(store); }catch(e){ c.error=(e&&e.message)||'Could not load store config'; c.data=cfgLocalData(store); } c.loading=false; renderStoreConfig(); }
function cfgAudit(action,entity,id,before,after,note){ const c=cfgState(); if(!c.data)return; const u=auditUser(); c.data.auditLogs=c.data.auditLogs||[]; c.data.auditLogs.unshift({id:makeRecordId('AUD',c.store),created:new Date().toISOString(),store:c.store,user:u.name,role:u.role,action,entity,entityId:id,note:note||'',changes:auditDiff(before,after)}); }
function cfgDirty(){ cfgState().dirty=true; }
function cfgStaffSet(i,k,v){ const c=cfgState(), row=c.data.staff[i]; if(!row)return; const before=cfgClone(row); row[k]=k==='active'?(v==='1'?1:0):v; row.store=c.store; cfgAudit('update','staff',row.id,before,row); cfgDirty(); }
function cfgStaffAdd(){ const c=cfgState(); c.data.staff.unshift({id:storeCode(c.store)+'-'+String(20000+Math.floor(Math.random()*9000)),name:'New staff',role:'Staff',store:c.store,phone:'',dob:'',start:new Date().toISOString().slice(0,10),active:1}); cfgAudit('create','staff',c.data.staff[0].id,null,c.data.staff[0]); cfgDirty(); renderStoreConfig(); }
function cfgStaffDel(i){ const c=cfgState(), row=c.data.staff[i]; if(!row||!confirm('Delete this staff member from '+c.store+'?'))return; cfgAudit('delete','staff',row.id,row,null); c.data.staff.splice(i,1); cfgDirty(); renderStoreConfig(); }
function cfgCkSet(i,pos,v){ const c=cfgState(), row=c.data.checklistItems[i]; if(!row)return; const before=cfgClone(row); row[pos]=v; cfgAudit('update','checklistItem',String(i),before,row); cfgDirty(); }
function cfgCkAdd(){ const c=cfgState(); c.data.checklistItems.unshift(['MANAGER','General','New checklist task','A','']); cfgAudit('create','checklistItem','new',null,c.data.checklistItems[0]); cfgDirty(); renderStoreConfig(); }
function cfgCkDel(i){ const c=cfgState(), row=c.data.checklistItems[i]; if(!row||!confirm('Delete this checklist item?'))return; cfgAudit('delete','checklistItem',String(i),row,null); c.data.checklistItems.splice(i,1); cfgDirty(); renderStoreConfig(); }
function cfgStaffIdsFromNames(names){ const c=cfgState(), vals=String(names||'').split(',').map(s=>s.trim()).filter(Boolean); return vals.map(n=>(c.data.staff||[]).find(s=>s.name===n)).filter(Boolean).map(s=>s.id); }
function cfgSchedSet(i,k,v){ const c=cfgState(), row=c.data.scheduleTasks[i]; if(!row)return; const before=cfgClone(row); row[k]=v; if(k==='who') row.staffIds=cfgStaffIdsFromNames(v); cfgAudit('update','scheduleTask',row.id,before,row); cfgDirty(); }
function cfgSchedAdd(){ const c=cfgState(); c.data.scheduleTasks.unshift({id:'sch'+Date.now(),type:'cleaning',dept:'Whole store',task:'New task',days:[],who:'',staffIds:[],freq:''}); cfgAudit('create','scheduleTask',c.data.scheduleTasks[0].id,null,c.data.scheduleTasks[0]); cfgDirty(); renderStoreConfig(); }
function cfgSchedDel(i){ const c=cfgState(), row=c.data.scheduleTasks[i]; if(!row||!confirm('Delete this schedule task?'))return; cfgAudit('delete','scheduleTask',row.id,row,null); c.data.scheduleTasks.splice(i,1); cfgDirty(); renderStoreConfig(); }
function cfgSchedDay(i,d){ const c=cfgState(), row=c.data.scheduleTasks[i]; if(!row)return; const before=cfgClone(row); row.days=row.days||[]; const idx=row.days.indexOf(d); if(idx>=0)row.days.splice(idx,1); else row.days.push(d); cfgAudit('update','scheduleTask',row.id,before,row); cfgDirty(); renderStoreConfig(); }
async function cfgSave(){ const c=cfgState(); if(!c.data||c.loading)return; c.loading=true; renderStoreConfig(); try{ if(window.MCQDB&&MCQDB.saveStoreConfig) await MCQDB.saveStoreConfig(c.store,c.data); c.dirty=false; toast('✓ '+c.store+' config saved'); }catch(e){ c.error=(e&&e.message)||'Could not save store config'; toast('Could not save store config'); } c.loading=false; renderStoreConfig(); }
function cfgRowsStaff(c){ const roles=DB.staffRoles||['Staff']; return `<div class="card"><div class="card-head"><h3>Staff · ${c.data.staff.length}</h3><button class="btn sm" style="margin-left:auto" onclick="cfgStaffAdd()">＋ Add staff</button></div><div class="table-wrap"><table class="grid cfg-table"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Phone</th><th>Active</th><th></th></tr></thead><tbody>${c.data.staff.map((s,i)=>`<tr><td class="cell-id">${esc(s.id)}</td><td><input value="${esc(s.name||'')}" onchange="cfgStaffSet(${i},'name',this.value)"></td><td><select onchange="cfgStaffSet(${i},'role',this.value)">${roles.map(r=>`<option ${r===s.role?'selected':''}>${esc(r)}</option>`).join('')}</select></td><td><input value="${esc(s.phone||'')}" onchange="cfgStaffSet(${i},'phone',this.value)"></td><td><select onchange="cfgStaffSet(${i},'active',this.value)"><option value="1" ${s.active!==0?'selected':''}>Active</option><option value="0" ${s.active===0?'selected':''}>Inactive</option></select></td><td><button class="btn sm" onclick="cfgStaffDel(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">No staff in this store.</div></td></tr>'}</tbody></table></div></div>`; }
function cfgRowsChecklist(c){ return `<div class="card"><div class="card-head"><h3>Checklist template · ${c.data.checklistItems.length}</h3><button class="btn sm" style="margin-left:auto" onclick="cfgCkAdd()">＋ Add task</button></div><div class="table-wrap"><table class="grid cfg-table"><thead><tr><th>Dept</th><th>Area</th><th>Task</th><th>When</th><th></th></tr></thead><tbody>${c.data.checklistItems.map((r,i)=>`<tr><td><input value="${esc(r[0]||'')}" onchange="cfgCkSet(${i},0,this.value)"></td><td><input value="${esc(r[1]||'')}" onchange="cfgCkSet(${i},1,this.value)"></td><td><input value="${esc(r[2]||'')}" onchange="cfgCkSet(${i},2,this.value)"></td><td><select onchange="cfgCkSet(${i},3,this.value)"><option value="O" ${r[3]==='O'?'selected':''}>Opening</option><option value="C" ${r[3]==='C'?'selected':''}>Closing</option><option value="A" ${r[3]==='A'?'selected':''}>Both</option></select></td><td><button class="btn sm" onclick="cfgCkDel(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">No checklist items.</div></td></tr>'}</tbody></table></div></div>`; }
function cfgRowsSchedules(c){ const staffList=`<datalist id="cfg-staff-list">${(c.data.staff||[]).map(s=>`<option value="${esc(s.name)}" label="${esc(s.id+' · '+(s.role||''))}"></option>`).join('')}</datalist>`; return `${staffList}<div class="card"><div class="card-head"><h3>Cleaning & maintenance schedule · ${c.data.scheduleTasks.length}</h3><button class="btn sm" style="margin-left:auto" onclick="cfgSchedAdd()">＋ Add task</button></div><div class="table-wrap"><table class="grid cfg-table"><thead><tr><th>Type</th><th>Dept</th><th>Task</th><th>Staff</th><th>Days</th><th></th></tr></thead><tbody>${c.data.scheduleTasks.map((t,i)=>`<tr><td><select onchange="cfgSchedSet(${i},'type',this.value)"><option value="cleaning" ${t.type==='cleaning'?'selected':''}>Cleaning</option><option value="maintenance" ${t.type==='maintenance'?'selected':''}>Maintenance</option></select></td><td><input value="${esc(t.dept||'')}" onchange="cfgSchedSet(${i},'dept',this.value)"></td><td><input value="${esc(t.task||'')}" onchange="cfgSchedSet(${i},'task',this.value)"></td><td><input list="cfg-staff-list" value="${esc(t.who||'')}" onchange="cfgSchedSet(${i},'who',this.value)"><div class="cell-sub">IDs: ${esc((t.staffIds||[]).join(', ')||'—')}</div></td><td class="cfg-days">${SCHED_DAYS.map(d=>`<button class="${(t.days||[]).includes(d)?'on':''}" onclick="cfgSchedDay(${i},'${d}')">${d}</button>`).join('')}</td><td><button class="btn sm" onclick="cfgSchedDel(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">No schedule tasks.</div></td></tr>'}</tbody></table></div></div>`; }
function renderStoreConfig(){ if(!isSuper()){ $('#content').innerHTML='<div class="empty">Super Admin only.</div>'; return; } const c=cfgState(); setAccent('#0f766e'); setCrumb('🏪','Store Config','Super Admin · edit one store workspace'); if(!c.data&&!c.loading&&!c.error) setTimeout(()=>cfgLoad(c.store),0); const storeSel=`<select class="login-input" style="width:auto" onchange="cfgSelectStore(this.value)">${DB.stores.map(s=>`<option ${s===c.store?'selected':''}>${esc(s)}</option>`).join('')}</select>`; const tabs=['staff','checklist','schedules'].map(t=>`<button class="seg-btn ${c.tab===t?'active':''}" onclick="cfgTab('${t}')">${t==='staff'?'Staff':t==='checklist'?'Checklist':'Schedules'}</button>`).join(''); const body=c.loading?`<div class="card card-pad loading-state"><i class="fas fa-spinner fa-spin"></i><b>Loading ${esc(c.store)} config...</b><span>Fetching the store document safely.</span></div>`:c.error?`<div class="card card-pad error-state"><b>Could not load cloud config</b><span>${esc(c.error)}</span><button class="btn sm" onclick="cfgLoad('${ckJS(c.store)}')">Retry</button></div>`:c.data?(c.tab==='staff'?cfgRowsStaff(c):c.tab==='checklist'?cfgRowsChecklist(c):cfgRowsSchedules(c)):''; $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🏪</div><div><h2>Manage Store Config</h2><p>Choose one branch and edit its staff, checklist template, and cleaning/maintenance schedule without changing other stores.</p></div><div class="ph-actions">${storeSel}<div class="seg seg-light">${tabs}</div><button class="btn primary" onclick="cfgSave()"><i class="fas fa-save"></i>&nbsp; Save ${esc(c.store)}</button></div></div><div class="kpi-grid"><div class="kpi tone-info"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${c.data?(c.data.staff||[]).length:'—'}</div><div class="k-lbl">Staff</div></div><div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${c.data?(c.data.checklistItems||[]).length:'—'}</div><div class="k-lbl">Checklist tasks</div></div><div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🧽</div></div><div class="k-val">${c.data?(c.data.scheduleTasks||[]).length:'—'}</div><div class="k-lbl">Schedule tasks</div></div><div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧾</div></div><div class="k-val">${c.data?(c.data.auditLogs||[]).length:'—'}</div><div class="k-lbl">Audit events</div></div></div>${c.dirty?'<div class="rail-tip" style="margin-bottom:14px">Unsaved changes in this store config.</div>':''}${body}`; }

/* ============================================================ DATA MANAGEMENT */
function dataStoreId(store){ return String(store||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown-store'; }
function dataBytes(obj){ try{ return new Blob([JSON.stringify(obj)]).size; }catch(e){ return JSON.stringify(obj||'').length; } }
function dataFmtSize(b){ return b>1048576?(b/1048576).toFixed(1)+' MB':b>1024?(b/1024).toFixed(1)+' KB':b+' B'; }
function dataScopeRecs(m){ return isSuper()?(m.records||[]):(m.records||[]).filter(r=>r.store===State.branch); }
function dataExportModule(id,fmt){ const m=DB.modules[id]; if(!m) return; const rows=dataScopeRecs(m);
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!['icon','short','mod'].includes(k));
  expRecords(m.label+' records', keys.map(k=>({label:prettyKey(k),get:r=>r[k]})), rows, fmt||'excel'); }
function dataDeleteModule(id){ const m=DB.modules[id]; if(!m) return; const n=dataScopeRecs(m).length;
  if(!n){ toast('Nothing to delete'); return; }
  if(!confirm('Delete '+n+' '+m.label+' record(s)'+(isSuper()?' across ALL stores':' for '+State.branch)+'?\nThis frees space and cannot be undone.')) return;
  const removed=dataScopeRecs(m).map(r=>r.id).filter(Boolean);
  m.records = isSuper()? [] : (m.records||[]).filter(r=>r.store!==State.branch);
  if(window.mcqDeleteRecords&&removed.length) mcqDeleteRecords('records',removed,isSuper()?{store:'ALL'}:null);
  if(window.auditLog) auditLog('delete','records',m.id,State.branch,{count:n},null);
  if(window.persist) window.persist(); toast('🗑 Deleted '+n+' '+m.label); renderData();
}
function dataClearSubs(){ const n=(DB.checklistSubs||[]).filter(s=>isSuper()||s.store===State.branch).length;
  if(!n){ toast('No submitted checklists'); return; }
  if(!confirm('Delete '+n+' submitted checklist(s)'+(isSuper()?' across ALL stores':' for '+State.branch)+'? Photos stay in storage until purged. Cannot be undone.')) return;
  const removedSubs=(DB.checklistSubs||[]).filter(s=>isSuper()||s.store===State.branch).map(s=>s.id).filter(Boolean);
  DB.checklistSubs = isSuper()? [] : (DB.checklistSubs||[]).filter(s=>s.store!==State.branch);
  if(window.mcqDeleteRecords&&removedSubs.length) mcqDeleteRecords('checklist_submissions',removedSubs,isSuper()?{store:'ALL'}:null);
  if(window.persist) window.persist(); toast('🗑 Cleared '+n+' submissions'); renderData();
}
function dataClearAll(){
  if(!confirm('Delete ALL operational records + submitted checklists'+(isSuper()?' across ALL stores':' for '+State.branch)+'?\nStaff, templates & schedules are KEPT. Cannot be undone.')) return;
  Object.values(DB.modules).forEach(m=>{ m.records = isSuper()?[]:(m.records||[]).filter(r=>r.store!==State.branch); });
  DB.checklistSubs = isSuper()? [] : (DB.checklistSubs||[]).filter(s=>s.store!==State.branch);
  if(window.mcqDeleteRecords){ const o=isSuper()?{store:'ALL',all:true}:{all:true}; mcqDeleteRecords('records',null,o); mcqDeleteRecords('checklist_submissions',null,o); mcqDeleteRecords('bin_records',null,o); }
  if(window.auditLog) auditLog('delete','records','ALL',State.branch,null,null);
  if(window.persist) window.persist(); toast('🗑 All records cleared'); renderData();
}
function dataDelInRange(d,from,to){ d=String(d||'').slice(0,10); return !!d&&(!from||d>=from)&&(!to||d<=to); }
function dataRecDate(r){ return String(r.date||r.created||r.at||r.reported||r.createdAt||'').slice(0,10); }
function dataDeleteRange(){
  const g=id=>document.getElementById(id);
  const from=(g('dr-from')||{}).value||'', to=(g('dr-to')||{}).value||'';
  const doSubs=!!(g('dr-subs')||{}).checked, doPhotos=!!(g('dr-photos')||{}).checked, doRecs=!!(g('dr-records')||{}).checked;
  State.dataDel={from,to};
  if(!doSubs&&!doPhotos&&!doRecs){ toast('Pick at least one type to delete'); return; }
  if(!from&&!to){ toast('Pick a “from” and/or “to” date'); return; }
  const inScope=store=>isSuper()||store===State.branch;
  const subs=DB.checklistSubs||[];
  let nSubs=0,nPhotos=0,nRecs=0;
  if(doSubs) nSubs=subs.filter(s=>inScope(s.store)&&dataDelInRange(s.date,from,to)).length;
  if(doPhotos&&!doSubs) subs.forEach(s=>{ if(inScope(s.store)&&dataDelInRange(s.date,from,to)) (s.items||[]).forEach(it=>{ nPhotos+=(it.photos||[]).length; }); });
  if(doRecs) Object.values(DB.modules).forEach(m=>{ nRecs+=(m.records||[]).filter(r=>inScope(r.store)&&dataDelInRange(dataRecDate(r),from,to)).length; });
  const parts=[]; if(doSubs)parts.push(nSubs+' submission(s)'); if(doPhotos&&!doSubs)parts.push(nPhotos+' photo(s)'); if(doRecs)parts.push(nRecs+' record(s)');
  if(!(nSubs+nRecs+nPhotos)){ toast('Nothing matches that date range / scope'); return; }
  if(!confirm('Delete '+parts.join(' + ')+'\ndated '+(from||'…')+' → '+(to||'…')+(isSuper()?' across ALL stores':' for '+State.branch)+'?\nThis cannot be undone.')) return;
  const opt=isSuper()?{store:'ALL'}:null;
  if(doPhotos&&!doSubs) subs.forEach(s=>{ if(inScope(s.store)&&dataDelInRange(s.date,from,to)) (s.items||[]).forEach(it=>{ it.photos=[]; }); });
  if(doSubs){ const rm=subs.filter(s=>inScope(s.store)&&dataDelInRange(s.date,from,to)).map(s=>s.id).filter(Boolean);
    DB.checklistSubs=subs.filter(s=>!(inScope(s.store)&&dataDelInRange(s.date,from,to)));
    if(window.mcqDeleteRecords&&rm.length) mcqDeleteRecords('checklist_submissions',rm,opt); }
  if(doRecs){ const rm=[]; Object.values(DB.modules).forEach(m=>{ (m.records||[]).forEach(r=>{ if(inScope(r.store)&&dataDelInRange(dataRecDate(r),from,to)&&r.id) rm.push(r.id); }); m.records=(m.records||[]).filter(r=>!(inScope(r.store)&&dataDelInRange(dataRecDate(r),from,to))); });
    if(window.mcqDeleteRecords&&rm.length) mcqDeleteRecords('records',rm,opt); }
  if(window.auditLog) auditLog('delete','dateRange',(from||'')+'..'+(to||''),State.branch,{subs:nSubs,photos:nPhotos,records:nRecs},null);
  if(window.persist) window.persist();
  toast('🗑 Deleted '+parts.join(' + ')); renderData();
}
function dataResetStore(store){ if(!isSuper()) return;
  if(!confirm('RESET all data for '+store+' (records, submitted checklists, schedule history)?\nStaff & templates kept. Cannot be undone.')) return;
  Object.values(DB.modules).forEach(m=>{ m.records=(m.records||[]).filter(r=>r.store!==store); });
  if(Array.isArray(DB.checklistSubs)) DB.checklistSubs=DB.checklistSubs.filter(s=>s.store!==store);
  if(Array.isArray(DB.scheduleHistory)) DB.scheduleHistory=DB.scheduleHistory.filter(r=>r.store!==store);
  if(window.mcqDeleteRecords){ ['records','checklist_submissions','bin_records','schedule_history'].forEach(t=>mcqDeleteRecords(t,null,{store:store,all:true})); }
  if(window.auditLog) auditLog('delete','store',store,store,null,null);
  if(window.persist) window.persist(); toast('🗑 Reset '+store); renderData();
}
function renderData(){
  setAccent('#b45309'); setCrumb('🗄️','Data Management','Export, delete & free up space');
  const counts=Object.values(DB.modules).map(m=>({l:m.label,n:isSuper()?(m.records||[]).length:(m.records||[]).filter(r=>r.store===State.branch).length,i:m.icon}));
  const scope=isSuper()?'Super Admin · aggregate view':'Store workspace · '+State.branch;
  const doc=isSuper()?'mcq_store_states/{each-store}':'mcq_store_states/'+dataStoreId(State.branch);
  const auditRows=(DB.auditLogs||[]).filter(a=>isSuper()||a.store===State.branch).slice(0,8);
  const smallCollections=[
    ['stores/{storeId}/staff','Staff profile documents keyed by staff ID'],
    ['stores/{storeId}/checklistTemplates','Opening/closing template sections and tasks'],
    ['stores/{storeId}/checklistSubs','Submitted checklists, verification notes and evidence'],
    ['stores/{storeId}/records','Operational records with prefixed IDs'],
    ['stores/{storeId}/photos','Photo evidence metadata by checklist section and area'],
    ['stores/{storeId}/schedules','Cleaning, maintenance and job schedule tasks'],
    ['stores/{storeId}/scheduleHistory','Cleaning and maintenance completion records with photo evidence'],
    ['stores/{storeId}/binRecords','Bin checklist submissions with quantity, staff and photo evidence'],
    ['stores/{storeId}/auditLogs','Immutable audit events for create/update/delete/verify']
  ];
  const isolationRows=[
    ['Staff members','Per-store staff list only'],
    ['Checklist template','Per-store opening/closing checklist'],
    ['Checklist submissions','Per-store evidence, notes and verification'],
    ['Photo evidence','Photo docs carry store metadata and only resolve inside the allowed store scope'],
    ['Cleaning & maintenance','Per-store tasks, ticks and assigned staff'],
    ['Job schedule','Per-store duties and roster'],
    ['Operations records','Complaint, incident, delivery, maintenance and issue records scoped by store'],
    ['Record identity','New IDs include store prefix, module prefix and date for audit clarity'],
    ['Audit trail','Create, edit, delete and verify actions store user, role, time and changed fields']
  ];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗄️</div><div><h2>Data Management</h2><p>Export data, run backups and clean up old records.</p></div>
      <div class="ph-actions"><button class="btn primary" onclick="dataBackupAll()">💾 Backup / Download all data</button></div></div>
    <div class="card" style="margin-bottom:14px"><div class="card-pad" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:26px">💾</div>
      <div style="flex:1;min-width:220px"><b>Full backup</b><div style="color:var(--muted);font-size:12.5px">Downloads <b>every record, staff member, checklist submission, schedule, bin record and audit log</b> ${isSuper()?'across <b>all stores</b>':'for <b>'+esc(State.branch)+'</b>'} as a single JSON file you can keep safe or re-import.</div></div>
      <button class="btn primary" onclick="dataBackupAll()">💾 Download all data</button>
    </div></div>
    <div class="card store-isolation-card">
      <div class="card-head"><h3>Store data isolation</h3><span class="ch-sub">${esc(scope)}</span></div>
      <div class="card-pad">
        <div class="iso-grid">
          <div><b>Active document</b><span>${esc(doc)}</span></div>
          <div><b>Write boundary</b><span>${isSuper()?'Split back into each store document':'This store document only'}</span></div>
          <div><b>Login scope</b><span>${isSuper()?'Can compare all stores':'Cannot load or save another store'}</span></div>
        </div>
        <table class="grid iso-table"><tbody>${isolationRows.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
    <div class="split-2 data-admin-grid">
      <div class="card">
        <div class="card-head"><h3>Audit log</h3><span class="ch-sub">${auditRows.length} recent events</span></div>
        <div class="table-wrap"><table class="grid audit-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead><tbody>
          ${auditRows.map(a=>`<tr><td><b>${esc((a.created||'').slice(0,16).replace('T',' '))}</b><div class="cell-sub">${esc(a.store||'')}</div></td><td>${esc(a.user||'System')}<div class="cell-sub">${esc(a.role||'')}</div></td><td><span class="badge info">${esc(a.action||'update')}</span></td><td>${esc(a.entity||'record')}<div class="cell-sub">${esc(a.entityId||'')}</div></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty compact"><div class="e-ic">🧾</div>No audit events yet.</div></td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Collection migration plan</h3><span class="ch-sub">ready when data grows</span></div>
        <div class="card-pad small-collection-list">
          <div class="migration-note"><b>Current prototype:</b> one safe per-store document. <b>Long term:</b> split heavy data into smaller collections so saves stay fast and conflicts are easier to audit.</div>
          ${smallCollections.map(r=>`<div class="collection-row"><code>${esc(r[0])}</code><span>${esc(r[1])}</span></div>`).join('')}
        </div>
      </div>
    </div>
    ${(()=>{ const mods=Object.entries(DB.modules).map(([id,m])=>{const rs=dataScopeRecs(m);return {id,l:m.label,i:m.icon,n:rs.length,b:dataBytes(rs)};});
      const subs=(DB.checklistSubs||[]).filter(s=>isSuper()||s.store===State.branch);
      const totalB=mods.reduce((s,m)=>s+m.b,0)+dataBytes(subs);
      return `<div class="card"><div class="card-head"><h3>Records &amp; storage</h3><span class="ch-sub">${esc(scope)} · ~${dataFmtSize(totalB)} of record data</span></div><div class="table-wrap"><table class="grid"><thead><tr><th>Module</th><th>Records</th><th>~Size</th><th>Export</th><th>Delete</th></tr></thead><tbody>
      ${mods.map(c=>`<tr><td>${c.i} <b>${esc(c.l)}</b></td><td class="num">${c.n}</td><td class="num">${dataFmtSize(c.b)}</td><td>${c.n?`<button class="btn sm" onclick="dataExportModule('${c.id}','excel')">⬇ Excel</button>`:'—'}</td><td>${c.n?`<button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="dataDeleteModule('${c.id}')">🗑</button>`:'—'}</td></tr>`).join('')}
      <tr><td>📋 <b>Submitted checklists</b></td><td class="num">${subs.length}</td><td class="num">${dataFmtSize(dataBytes(subs))}</td><td>—</td><td>${subs.length?`<button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="dataClearSubs()">🗑</button>`:'—'}</td></tr>
    </tbody></table></div></div>`; })()}
    <div class="card danger-zone" style="margin-top:16px;border:1.5px solid #f3c9c9"><div class="card-head"><h3 style="color:var(--bad)">⚠️ Cleanup &amp; free space</h3><span class="ch-sub">PythonAnywhere databases have size limits — delete old data to stay within them</span></div>
      <div class="card-pad">
        <p style="color:var(--muted);font-size:12.5px;margin:0 0 12px">Deleting clears the data from ${isSuper()?'every store document':'this store’s document'} and frees space. Staff, checklist templates and schedules are kept. <b>Export first if you need a copy.</b></p>
        <div class="data-range">
          <div class="dr-head"><i class="fas fa-calendar-day"></i> Delete by date range — choose what to remove</div>
          <div class="dr-row">
            <label>From <input type="date" id="dr-from" value="${esc((State.dataDel&&State.dataDel.from)||'')}"></label>
            <label>To <input type="date" id="dr-to" value="${esc((State.dataDel&&State.dataDel.to)||'')}"></label>
          </div>
          <div class="dr-targets">
            <label class="dr-opt"><input type="checkbox" id="dr-subs" checked> Submitted checklists</label>
            <label class="dr-opt"><input type="checkbox" id="dr-photos"> Photos only (keep checklist rows)</label>
            <label class="dr-opt"><input type="checkbox" id="dr-records"> Operational records</label>
          </div>
          <button class="btn" style="color:var(--bad);border-color:#f3c9c9;margin-top:4px" onclick="dataDeleteRange()"><i class="fas fa-trash"></i>&nbsp; Delete in date range</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="dataClearSubs()">🗑 Delete submitted checklists</button>
          <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="dataClearAll()">🗑 Delete all records + submissions</button>
        </div>
        ${isSuper()?`<div class="section-title" style="margin-top:18px">Reset a single store</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${DB.stores.map(s=>`<button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="dataResetStore('${ckJS(s)}')">Reset ${esc(s)}</button>`).join('')}</div>`:''}
      </div></div>`;
}
function dataStoreSnapshot(store){
  const inS=r=>!store||r.store===store; const modules={};
  Object.entries(DB.modules).forEach(([id,m])=>{ modules[id]=(m.records||[]).filter(inS); });
  return { store, modules, staff:(DB.staff||[]).filter(inS), checklistSubs:(DB.checklistSubs||[]).filter(inS),
    scheduleHistory:(DB.scheduleHistory||[]).filter(inS), auditLogs:(DB.auditLogs||[]).filter(inS),
    binAdmin:DB.binAdmin||{}, checklistItems:(DB.checklist&&DB.checklist.items)||[], scheduleTasks:DB.scheduleTasks||[] };
}
function dataBackupAll(){
  try{
    const FB=window.MCQDB; const build=(FB&&FB.buildStoreState)?(s=>FB.buildStoreState(s)):dataStoreSnapshot;
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const list=isSuper()?(DB.stores||DB.branches||[]):[State.branch];
    const stores={}; list.forEach(s=>{ try{ stores[s]=build(s); }catch(e){ stores[s]=dataStoreSnapshot(s); } });
    const payload={ type:'mcq-backup', app:'MCQ Supermarket', scope:isSuper()?'all-stores':State.branch, generated:new Date().toISOString(), storeCount:list.length, stores };
    const json=JSON.stringify(payload,null,2); const blob=new Blob([json],{type:'application/json'});
    expDownload(blob, 'MCQ-backup-'+(isSuper()?'all-stores':dataStoreId(State.branch))+'-'+stamp+'.json');
    toast('💾 Backup downloaded — '+list.length+' store(s), '+dataFmtSize(blob.size));
  }catch(e){ toast('Backup failed: '+((e&&e.message)||e)); }
}

/* ============================================================ RULES */
function renderRules(){
  setAccent('#b91c1c'); setCrumb('📖','Supermarket Rules','MCQ Supermarket — staff handbook');
  const items=DB.rules.map(r=>`<div class="rule-item"><div class="rule-n">${r.n}</div><div><div class="rule-t">${esc(r.title)}</div><div class="rule-b">${esc(r.body)}</div></div></div>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">📖</div><div><h2>Supermarket Rules</h2><p>The standards every MCQ team member follows.</p></div>
    <div class="ph-actions"><button class="btn sm" onclick="window.print()">🖨️ Print</button></div></div>
    <div class="card card-pad rules-wrap">${items}</div>`;
}

/* ============================================================ FACE ID */
function renderFaceId(){
  setAccent('#15803d'); setCrumb('🪪','Face ID',isSuper()?'Manage Face ID on this device':'Face ID for '+State.branch);
  try{ if(window.MCQFace&&MCQFace.syncFromDB) MCQFace.syncFromDB(); }catch(e){}
  const scope=isSuper()?'':State.branch;
  const list=(window.MCQFace&&MCQFace.listFor)?MCQFace.listFor(scope):[];
  const scopeLabel=isSuper()?'all stores (this device)':State.branch;
  const rows=list.map(c=>`<tr><td><b>${esc(c.label||c.branch)}</b><div class="cell-sub">${esc(c.role||'')}${c.branch?' · '+esc(c.branch):''}</div></td>
      <td><div class="cell-sub">Enrolled ${esc(c.created||'—')}</div></td>
      <td><span class="badge ok"><span class="bdot"></span>Active</span></td>
      <td><button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="faceRemoveInApp('${ckJS(c.id)}')">Remove</button></td></tr>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🪪</div><div><h2>Face ID &amp; Passkeys</h2><p>Sign in to <b>${esc(scopeLabel)}</b> with Face ID / Touch ID on this device.</p></div></div>
    <div class="form-shell"><div class="card card-pad" style="text-align:center">
        <div class="fid-hero">🪪</div><h3 style="margin:6px 0">Enrol this device</h3>
        <p style="color:var(--muted);font-size:13px;max-width:420px;margin:0 auto 16px">Uses your device’s secure biometric (WebAuthn). Your face never leaves the device — only a secure key is stored, mapped to <b>${esc(scopeLabel)}</b>.</p>
        <button class="btn primary" onclick="faceEnrollInApp()">＋ Enrol Face ID on this device</button>
        <button class="btn" style="margin-left:8px" onclick="faceIdLogin()">🪪 Test Face ID</button>
        <p class="login-hint" style="margin-top:12px">For real passkeys, open the app on <b>https</b> or <b>localhost</b>.</p>
      </div>
      <aside class="form-rail"><div class="card rail-card"><h4>Face IDs for ${esc(scopeLabel)}</h4>
        <div class="table-wrap"><table class="grid"><tbody>${rows||'<tr><td colspan="4"><div class="empty compact"><div class="e-ic">🪪</div>No Face ID enrolled on this device yet.</div></td></tr>'}</tbody></table></div></div>
        <div class="card rail-card"><h4>Security</h4><ul><li>Device-bound — enrol on each device used</li><li>Auto-logout after 30 min idle</li><li>Enrolments are saved &amp; synced (never lost)</li></ul></div></aside></div>`;
}
function faceRemoveInApp(id){ if(!confirm('Remove this Face ID from this device?')) return; try{ if(window.MCQFace) MCQFace.remove(id); }catch(e){} toast('Face ID removed'); renderFaceId(); }
