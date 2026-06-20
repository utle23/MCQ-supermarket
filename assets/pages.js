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
function staffForDept(dept,opts){
  const all=staffScopeList(), dn=staffNorm(dept);
  const byDept = dn ? all.filter(s=>staffNorm(s.dept)===dn) : [];   // explicit department link (from staff record)
  if(byDept.length) return byDept;
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
function ckDeadline(session){ return ((DB.checklist&&DB.checklist.deadlines)||{})[session] || CK_DEADLINE[session] || ''; }
function ckEditDeadline(session){ const v=prompt('Deadline for '+session+' (e.g. 10:30 AM):', ckDeadline(session)); if(v==null) return;
  DB.checklist.deadlines=DB.checklist.deadlines||{}; DB.checklist.deadlines[session]=v.trim(); if(window.persist)window.persist(); renderChecklist(); toast('✓ Deadline updated'); }
function renderChecklist(){
  const C=DB.checklist; setAccent('#0e9f6e');
  if(!State.chk) State.chk={session:'Opening',dept:C.depts[0],area:'ALL',state:{}};
  if(State.chk.dept==='ALL' || !C.depts.includes(State.chk.dept)) State.chk.dept=C.depts[0];
  if(!State.chk.area) State.chk.area='ALL';
  if(!State.chk.resp) State.chk.resp={};
  const s=State.chk;
  setCrumb('✅','Store Operation Checklist',`${isSuper()?'All stores':State.branch} · ${s.session}`);
  const chips=C.depts.map(d=>`<button class="dept-chip ${d===s.dept?'active':''}" onclick="ckDept('${ckJS(d)}')">${esc(d)}</button>`).join('');
  const areaChips=ckAreaChips();
  const adminTools=isAdmin()?ckAdminTools():'';
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
     <div class="tb-spacer"></div>
     <div class="filter"><label>Date</label><input type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   </div>
   <div class="ck-toolbar"><div class="dept-chips">${chips}</div></div>
   ${areaChips}
   ${adminTools}
   <div id="chk-prog" class="ck-progbar"></div>
   <div id="ck-temp-report"></div>
   <div id="chk-body"></div>
   <div class="ck-submit"><button class="btn primary lg" onclick="chkSubmit()">✓ Submit ${s.session} checklist</button></div>`;
  ckDraw();
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
  const s=State.chk;
  const areas=[...new Set(ckRows(true).map(r=>r.area))];
  if(areas.length<=1){ s.area='ALL'; return ''; }
  if(!areas.includes(s.area)) s.area=areas[0];
  const chips=areas.map(a=>`<button class="area-chip ${a===s.area?'active':''}" onclick="ckArea('${ckJS(a)}')">${esc(a)}</button>`).join('');
  return `<div class="ck-subtoolbar"><span>Sections</span><div class="area-chips">${chips}</div></div>`;
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
    html+=`<div class="ck-dept"><div class="ck-dept-h" style="--dc:${dm.color}"><span class="chk-dot" style="background:${dm.color}"></span>${esc(dept)}<span class="ck-dept-n">${Object.values(areas).flat().length} tasks</span></div>`;
    html+=ckRespHTML(dept);
    Object.entries(areas).forEach(([area,items])=>{
      html+=`<div class="ck-area-h">${esc(area)}${isAdmin()?`<button class="ck-icon-action" onclick="ckAddTask('${ckJS(dept)}','${ckJS(area)}')" title="Add task"><i class="fas fa-plus"></i><span>Add task</span></button>`:''}</div>`;
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
        html+=`<div class="ck-task ${done?'done':''}" id="ck-row-${r.i}">
          <button class="ck-check" onclick="ckTick(${r.i})">${done?'✓':''}</button>
          <div class="ck-main"><div class="ck-name">${esc(r.task)}${isAdmin()?`<span class="ck-task-admin"><button onclick="ckEditTask(${r.i})" title="Edit task">✎</button><button onclick="ckDelTask(${r.i})" title="Delete task">🗑</button></span>`:''}</div>
            ${r.meta.temp?ckTempBox(r,st):''}
            <input class="ck-note" placeholder="Add note…" value="${esc(st.note||'')}" oninput="ckNote(${r.i},this.value)">${photoHtml}</div></div>`;
      });
    });
    html+=`</div>`;
  });
  $('#chk-body').innerHTML=html||'<div class="empty">No tasks for this filter.</div>';
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
  if(!st.done && ps && !skipPhoto && (st.photos||[]).length<1){
    toast('📷 Attach at least 1 photo before marking this done');
    const row=document.getElementById('ck-row-'+i); const pe=row&&row.querySelector('.ck-photos');
    if(pe){ pe.classList.add('invalid','shake'); setTimeout(()=>pe.classList.remove('shake','invalid'),1400); }
    return;
  }
  if(!st.done && r.meta.temp && !st.defrosting && !st.temp){
    toast('AI Vision has not saved a temperature yet');
    return;
  }
  st.done=!st.done; const row=document.getElementById('ck-row-'+i);
  if(row){row.classList.toggle('done',st.done);row.querySelector('.ck-check').textContent=st.done?'✓':'';}
  ckProgress();
}
function ckNote(i,v){const st=State.chk.state[i]=State.chk.state[i]||{};st.note=v;}
async function ckPhoto(input,i){
  const f=input.files&&input.files[0]; if(!f)return;
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(r.meta.temp&&st.defrosting){ input.value=''; toast('Defrosting is ticked, so photo capture is locked'); return; }
  let ref; try{ const d=await compressImage(f); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d; }catch(e){ ref=URL.createObjectURL(f); }
  st.photos=st.photos||[]; st.photos.push(ref);
  if(r.meta.temp){ st.aiStatus='scanning'; st.aiError=''; st.aiSuggestion=null; st.aiManualAllowed=false; st.temp=null; st.done=false; ckDraw(); toast('AI Vision reading temperature...');
    setTimeout(()=>ckAiTemp(i,f.name,f),700);
  }else{ ckDraw(); toast('📷 Photo added'); }
}
function ckRmPhoto(e,i,url){
  e.preventDefault(); e.stopPropagation();
  const st=State.chk.state[i], r=ckItem(DB.checklist.items[i],i);
  if(st&&st.photos){st.photos=st.photos.filter(u=>u!==url); if(r.meta.temp&&!st.photos.length){st.temp=null;st.aiStatus=null;st.aiError='';st.aiSuggestion=null;st.aiManualAllowed=false;st.done=false;} ckDraw();}
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
function ckAddTask(dept,area){
  const when=State.chk.session==='Opening'?'O':'C';
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
  const when=State.chk.session==='Opening'?'O':'C';
  DB.checklist.items.push([dept,area,'NEW TASK',when,0]);
  State.chk.editing=DB.checklist.items.length-1;
  State.chk.dept=dept;
  State.chk.area=area;
  ckPersistTemplate();
  renderChecklist();
  toast('✓ Section added');
}
function ckRenameDept(dept){
  const name=(prompt('Rename department:',dept)||'').trim();
  if(!name||name===dept) return;
  DB.checklist.items.forEach(it=>{ if(it[0]===dept) it[0]=name; });
  DB.checklist.depts=(DB.checklist.depts||[]).map(d=>d===dept?name:d);
  if(DB.checklist.deptMeta&&DB.checklist.deptMeta[dept]&&!DB.checklist.deptMeta[name]){
    DB.checklist.deptMeta[name]=DB.checklist.deptMeta[dept];
    delete DB.checklist.deptMeta[dept];
  }
  if(DB.checklistEmailRoutes&&DB.checklistEmailRoutes[dept]&&!DB.checklistEmailRoutes[name]){
    DB.checklistEmailRoutes[name]=DB.checklistEmailRoutes[dept];
    delete DB.checklistEmailRoutes[dept];
  }
  if(State.chk.dept===dept) State.chk.dept=name;
  ckPersistTemplate();
  renderChecklist();
  toast('✓ Department renamed');
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
function ckAll(v){ckList().forEach(r=>{const st=State.chk.state[r.i]=State.chk.state[r.i]||{};st.done=v;});ckDraw();}
function ckDefrost(i,on){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  st.defrosting=on; st.aiStatus=null; st.temp=null; st.aiError=''; st.aiSuggestion=null; st.aiManualAllowed=false;
  if(on){ st.photos=[]; st.done=true; ckRecordTemp(i,{defrosting:true,inRange:true,value:null}); }
  else st.done=false;
  ckDraw();
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
    const manualSetting=result&&Object.prototype.hasOwnProperty.call(result,'manualAllowed');
    st.aiManualAllowed=!!(result&&(manualSetting?result.manualAllowed:(Number.isFinite(suggestion)||(result.quality&&!result.quality.fail))));
    st.temp=null;
    st.done=false;
    ckDraw();
    toast(st.aiError);
    return;
  }
  // success — auto-save only a confident on-device / strong-vision read; OCR or low-confidence → manager confirms or edits
  const src=String(result.source||''), isOCR=/OCR/i.test(src), conf=Number(result.confidence||0);
  const trusted = !isOCR && Number.isFinite(result.value) && conf>=88 && result.suggestedValue==null;
  if(trusted){ ckSaveTempReading(i,result.value,result,false); return; }
  st.aiStatus='confirm';
  st.aiError=`AI Vision read ${result.value.toFixed(1)} °C — confirm or edit before saving.`;
  st.aiSuggestion={value:result.value,confidence:result.confidence||null,source:result.source||'AI Vision',text:result.text||'',rawReading:result.rawReading||result.text||''};
  st.aiManualAllowed=true; st.aiQuality=result.quality||null; st.temp=null; st.done=false;
  ckDraw(); toast(st.aiError);
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
  ckDraw();
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
async function ckVisionValue(fileName,file,r,i){
  const endpoint=window.MCQ_AI_VISION_ENDPOINT||localStorage.getItem('mcq_ai_vision_endpoint');
  if(endpoint&&file){
    try{
      const body=new FormData();
      body.append('image',file,fileName||'temperature.jpg');
      body.append('equipment',r.meta.equipment||'');
      body.append('type',r.meta.type||'fridge');
      const res=await fetch(endpoint,{method:'POST',body});
      const data=await res.json();
      if(!res.ok && data.fallback) throw new Error(data.message||'AI Vision endpoint unavailable');
      const v=Number(data.temperature ?? data.value ?? data.tempC);
      const confidence=data.confidence==null?null:Number(data.confidence);
      if(Number.isFinite(v)) return {value:v,source:data.source||'Strong AI Vision',text:data.text||data.rawText||'',confidence,quality:{reason:data.reason||'',model:data.model||''},candidates:Array.isArray(data.candidates)?data.candidates:[]};
      if(data.error||data.readable===false) return {error:true,message:data.message||'Strong AI Vision could not read a temperature number. Retake a closer photo of the display.',source:data.source||'Strong AI Vision',text:data.text||data.rawText||'',confidence,manualAllowed:false};
    }catch(e){ console.warn('AI Vision endpoint failed, trying browser OCR',e); }
  }
  const ocr=await ckOcrTemperature(file,r.meta.type);
  if(ocr) return ocr;
  return null;
}
async function ckOcrTemperature(file,type){
  if(!file) return null;
  try{
    const quality=await ckImageQuality(file).catch(()=>null);
    const led=await ckReadRedLedTemperature(file,type,quality).catch(e=>(console.warn('Local LED OCR failed',e),null));
    if(led) return led;
    if(window.Tesseract){
      const raw=await ckTesseractTemperature(file,type,quality,'AI Vision OCR');
      if(raw) return raw;
      const img=await ckPrepOcrImage(file);
      const prep=await ckTesseractTemperature(img,type,quality,'AI Vision OCR enhanced');
      if(prep) return prep;
    }
    return {error:true,message:'AI Vision found no readable temperature number. Retake a closer photo of the display with the full number visible.',quality,manualAllowed:false};
  }catch(e){ console.warn('Temperature OCR failed; retake required',e); }
  return null;
}
async function ckTesseractTemperature(img,type,quality,source){
  const res=await Tesseract.recognize(img,'eng',{
    tessedit_char_whitelist:'-0123456789.,Ccin ',
    tessedit_pageseg_mode:'7'
  });
  const text=res?.data?.text||'';
  const confidence=Math.round(res?.data?.confidence||0);
  const pick=ckPickTempFromText(text,type);
  if(pick&&Number.isFinite(pick.value)) return {value:pick.value,source,text,confidence,quality,candidates:pick.candidates};
  return null;
}
function ckReadRedLedTemperature(file,type,quality){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const max=1400, scale=Math.min(1,max/Math.max(img.width,img.height));
      const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0,w,h);
      const data=ctx.getImageData(0,0,w,h).data;
      const strict=ckLedMask(data,w,h);
      const comps=ckMaskComponents(strict,w,h).filter(c=>c.area>=8);
      const reading=ckRecognizeLedComponents(comps,strict,data,w,h,type);
      URL.revokeObjectURL(img.src);
      if(reading&&Number.isFinite(reading.value)){
        const readingQuality=Object.assign({},quality||{},{led:true,display:reading.box,rawReading:reading.text});
        if(reading.suggestedValue!=null){
          resolve({error:true,suggestedValue:reading.suggestedValue,message:reading.message,source:'On-device display reader',text:reading.text,rawReading:reading.text,confidence:reading.confidence,quality:readingQuality,candidates:[reading.value,reading.suggestedValue],manualAllowed:true});
        }else{
          resolve({value:reading.value,source:'On-device display reader',text:reading.text,confidence:reading.confidence,quality:readingQuality,candidates:[reading.value]});
        }
      }else resolve(null);
    };
    img.onerror=()=>resolve(null);
    img.src=URL.createObjectURL(file);
  });
}
function ckRedMask(data,w,h,strict){
  const mask=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const r=data[i], g=data[i+1], b=data[i+2];
    const isRed=strict
      ? (r>195 && g<85 && b<95 && r>g*2.15 && r>b*1.95)
      : (r>135 && g<120 && b<135 && r>g*1.35 && r>b*1.2);
    if(isRed) mask[p]=1;
  }
  return mask;
}
/* Detects glowing 7-segment digits of ANY colour (red / amber / green / cyan /
   blue / white) on a dark display — not just red. A lit segment is either a
   bright, clearly-coloured pixel, or a near-white glow. The dull grey/blue
   plastic panel is low-saturation + not bright enough, so it is excluded. */
function ckLedMask(data,w,h){
  const mask=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const r=data[i], g=data[i+1], b=data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx-mn;
    const lit=(mx>120 && sat>55) || (mn>205 && mx>240);
    if(lit) mask[p]=1;
  }
  return mask;
}
function ckMaskComponents(mask,w,h){
  const seen=new Uint8Array(mask.length), out=[], stack=[];
  for(let p=0;p<mask.length;p++){
    if(!mask[p]||seen[p]) continue;
    let x=p%w, y=Math.floor(p/w), x1=x,x2=x,y1=y,y2=y, area=0;
    stack.length=0; stack.push(p); seen[p]=1;
    while(stack.length){
      const q=stack.pop(), qx=q%w, qy=Math.floor(q/w); area++;
      if(qx<x1)x1=qx; if(qx>x2)x2=qx; if(qy<y1)y1=qy; if(qy>y2)y2=qy;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy) continue;
        const nx=qx+dx, ny=qy+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        const np=ny*w+nx;
        if(mask[np]&&!seen[np]){ seen[np]=1; stack.push(np); }
      }
    }
    out.push({x1,y1,x2,y2,area,w:x2-x1+1,h:y2-y1+1,cx:(x1+x2)/2,cy:(y1+y2)/2});
  }
  return out;
}
// A lit blob is part of the display only if the area immediately AROUND it is
// dark (LED panels are black). This rejects bright clutter in a wide photo —
// red cables on a pale wall, printed labels, glare — which is the #1 cause of
// mis-reads when the display is small inside the frame.
function ckCompOnDarkBg(c,data,w,h){
  const pad=Math.max(2,Math.round(Math.min(c.w,c.h)*0.35));
  let dark=0,n=0;
  const at=(x,y)=>{ if(x<0||y<0||x>=w||y>=h) return; const p=(y*w+x)*4; const L=data[p]*0.299+data[p+1]*0.587+data[p+2]*0.114; n++; if(L<95) dark++; };
  for(let x=c.x1-pad;x<=c.x2+pad;x+=2){ at(x,c.y1-pad); at(x,c.y2+pad); }
  for(let y=c.y1;y<=c.y2;y+=2){ at(c.x1-pad,y); at(c.x2+pad,y); }
  return n? (dark/n)>=0.45 : true;   // mostly-dark surround ⇒ on a display (tolerates a bright edge)
}
function ckRecognizeLedComponents(comps,mask,data,w,h,type){
  // keep only lit blobs sitting on a dark display background (drops bright clutter
  // in a wide frame). Fall back to all blobs if that leaves nothing.
  const onDisplay=data?comps.filter(c=>ckCompOnDarkBg(c,data,w,h)):comps;
  const pool=onDisplay.length?onDisplay:comps;
  // candidate DIGIT-shaped lit blobs. Reject solid fills (panel / header band) by
  // fill ratio — BUT keep thin tall bars, because the digit "1" is a solid bar
  // with fill ≈ 1.0 and would otherwise be dropped.
  const cands=pool.filter(c=>c.area>=25&&c.h>=10&&c.w>=5&&c.h<=h*0.6&&c.w<=w*0.45
    && ((c.area/(c.w*c.h))<=0.92 || c.w<=c.h*0.45));
  if(!cands.length) return null;
  // the reader anchors on the LAST (right-most) digit and reads leftwards, so pick
  // the right-most among the FULL-HEIGHT blobs (digits share a height; a "1" is
  // narrow but just as tall). Height — not area — fixes trailing "1" (-21, 11, -1)
  // and equal pairs (-22, 88) without letting a short noise blob win.
  const maxH=Math.max.apply(null,cands.map(c=>c.h));
  const main=cands.filter(c=>c.h>=maxH*0.6).sort((a,b)=>b.x2-a.x2)[0];
  if(!main) return null;
  const H=main.h;
  const near=pool.filter(c=>{
    if(c===main) return true;
    const vOverlap=Math.max(0,Math.min(main.y2,c.y2)-Math.max(main.y1,c.y1)+1);
    const closeLeft=c.x2>=main.x1-H*.85 && c.x1<=main.x1+H*.25;
    const closeRight=c.x1<=main.x2+H*.28 && c.x2>=main.x2-H*.08;
    return c.area>=8 && vOverlap>=Math.min(c.h,main.h)*.35 && (closeLeft||closeRight) && c.cy>=main.y1-H*.12 && c.cy<=main.y2+H*.18;
  });
  const digitComps=near.filter(c=>!(c.h<=H*.28&&c.w<=H*.28&&c.cy>main.y1+H*.45));
  // a real left digit reaches DOWN to the digit baseline and sits within ~2 digit
  // widths of the main digit. This drops lit ICONS (snowflake / fan / °C) that
  // sit higher up and further left on the display.
  const leftComps=digitComps.filter(c=>c!==main && c.cx<main.cx && c.x1<main.x1+H*.18
    && c.y2>=main.y2-H*0.30 && c.cx>=main.x1-H*1.8);
  const leftBox=ckUnionBox(leftComps);
  const rightDigit=ckSevenDigit(main,mask,w,h);
  if(!rightDigit) return null;
  const chars=[];
  if(leftBox){
    const leftDigit=(leftBox.w<=H*.45&&leftBox.h>=H*.30)?'1':ckSevenDigit(leftBox,mask,w,h);
    if(leftDigit) chars.push(leftDigit);
  }
  chars.push(rightDigit);
  if(!chars.length) return null;
  const decimal=ckLedDecimalPoint(near,digitComps,leftBox,main,H);
  let text=chars.join('');
  if(decimal&&chars.length>=2) text=`${chars[0]}.${chars.slice(1).join('')}`;
  // minus sign = a wide, short lit bar to the LEFT of the digit cluster, near vertical centre (critical for freezers)
  const clusterLeft=leftBox?Math.min(leftBox.x1,main.x1):main.x1;
  const negative=pool.some(c=>c!==main && c.cx<clusterLeft-H*0.05 && c.cx>=main.x1-H*2.4 && c.w>=c.h*1.1 && c.h<=H*0.55 && c.h>=H*0.05 && c.cy>=main.y1+H*0.18 && c.cy<=main.y2-H*0.18);
  if(negative && text.indexOf('-')<0) text='-'+text;
  const value=Number(text);
  if(!Number.isFinite(value)||value<=-45||value>=80) return null;
  const box=ckUnionBox(near)||main;
  const out={value,text,confidence:decimal?94:90,box:{x1:box.x1,y1:box.y1,x2:box.x2,y2:box.y2}};
  if(!decimal && /^\d{2}$/.test(text)){
    if(type==='freezer' && value>=10 && value<=35){
      out.suggestedValue=-value;
      out.message=`AI Vision read ${text} on the freezer LED and suggests ${out.suggestedValue.toFixed(1)} C. Confirm, edit the value, or retake if the display is different.`;
    }else if(type!=='freezer' && value>=10 && value<=99){
      out.suggestedValue=Math.round(value)/10;
      out.message=`AI Vision read ${text} on the fridge LED and suggests ${out.suggestedValue.toFixed(1)} C. Confirm, edit the value, or retake if the display is different.`;
    }
  }
  return out;
}
function ckUnionBox(comps){
  if(!comps||!comps.length) return null;
  return comps.reduce((b,c)=>({
    x1:Math.min(b.x1,c.x1), y1:Math.min(b.y1,c.y1), x2:Math.max(b.x2,c.x2), y2:Math.max(b.y2,c.y2),
    area:(b.area||0)+c.area, w:Math.max(b.x2,c.x2)-Math.min(b.x1,c.x1)+1, h:Math.max(b.y2,c.y2)-Math.min(b.y1,c.y1)+1,
    cx:(Math.min(b.x1,c.x1)+Math.max(b.x2,c.x2))/2, cy:(Math.min(b.y1,c.y1)+Math.max(b.y2,c.y2))/2
  }), comps[0]);
}
function ckLedDecimalPoint(near,digitComps,leftBox,rightBox,H){
  if(!leftBox) return false;
  const digitSet=new Set(digitComps);
  return near.some(c=>{
    if(digitSet.has(c)) return false;
    const between=c.cx>=leftBox.x2-H*.08 && c.cx<=rightBox.x1+H*.18;
    const low=c.cy>=rightBox.y1+H*.52;
    return between && low && c.h<=H*.28 && c.w<=H*.28 && c.area>=3;
  });
}
function ckSevenDigit(box,mask,w,h){
  // a very narrow lit blob is the digit "1" (only the two right segments) — the
  // segment-occupancy test can't tell it apart because the box IS the bar.
  if(box.h>0 && box.w<=box.h*0.40) return '1';
  const regs={
    a:[.22,.78,0,.20], b:[.62,1,.10,.48], c:[.62,1,.52,.90],
    d:[.22,.78,.78,1], e:[0,.38,.52,.90], f:[0,.38,.10,.48], g:[.22,.78,.39,.62]
  };
  const occ={};
  Object.entries(regs).forEach(([k,r])=>{
    const x1=Math.max(0,Math.round(box.x1+r[0]*box.w)), x2=Math.min(w-1,Math.round(box.x1+r[1]*box.w));
    const y1=Math.max(0,Math.round(box.y1+r[2]*box.h)), y2=Math.min(h-1,Math.round(box.y1+r[3]*box.h));
    let red=0,total=0;
    for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++){ total++; if(mask[y*w+x]) red++; }
    occ[k]=red/Math.max(1,total);
  });
  const patterns={
    0:'abcdef', 1:'bc', 2:'abged', 3:'abgcd', 4:'fgbc', 5:'afgcd',
    6:'afgecd', 7:'abc', 8:'abcdefg', 9:'abfgcd'
  };
  // thickness-independent match: a digit is the pattern whose ON segments are lit
  // and OFF segments are dark. Scoring by (avg ON occupancy − avg OFF occupancy)
  // keeps every digit on an equal footing, so dense digits (8/0/6/9) no longer sit
  // on the edge of a fixed sum threshold and drop out when segments are thin.
  let best=null;
  Object.entries(patterns).forEach(([d,segs])=>{
    const on=segs.split(''), off='abcdefg'.split('').filter(s=>!segs.includes(s));
    const avgOn=on.reduce((a,s)=>a+occ[s],0)/on.length;
    const avgOff=off.length?off.reduce((a,s)=>a+occ[s],0)/off.length:0;
    const score=avgOn-avgOff;
    if(!best||score>best.score) best={digit:d,score,avgOn};
  });
  return best&&best.avgOn>0.22&&best.score>0.12?best.digit:null;
}
function ckPickTempFromText(text,type){
  const clean=String(text||'').replace(/[−–—]/g,'-').replace(/,/g,'.');
  const tagged=[...clean.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:c|deg|degree|degrees|celsius)/ig)].map(m=>parseFloat(m[1]));
  const loose=[...clean.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>parseFloat(m[0]));
  return ckPickTempCandidate(tagged.concat(loose),type);
}
function ckPickTempCandidate(nums,type){
  let vals=nums.filter(n=>Number.isFinite(n)&&n>-45&&n<35);
  if(type==='freezer'){
    vals=vals.flatMap(n=>(n>10&&n<35)?[-Math.abs(n),n]:[n]);
  }
  vals=[...new Set(vals.map(n=>Math.round(n*10)/10))];
  if(!vals.length) return {error:true,message:'AI Vision found no valid temperature number. Retake a close-up of the display.'};
  const inRange=vals.filter(n=>ckTempInRange(n,type));
  const target=type==='freezer'?-20:3.5;
  const pool=inRange.length?inRange:vals.filter(n=>type==='freezer'?n<=0:n>=-2&&n<=12);
  const finalPool=pool.length?pool:vals;
  const sorted=finalPool.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
  return {value:sorted[0],candidates:vals};
}
function ckImageQuality(file){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const max=360, scale=Math.min(1,max/Math.max(img.width,img.height));
      const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h).data, gray=new Float32Array(w*h);
      let sum=0, sumSq=0;
      for(let i=0,p=0;i<d.length;i+=4,p++){ const g=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; gray[p]=g; sum+=g; sumSq+=g*g; }
      const n=w*h, brightness=sum/n, contrast=Math.sqrt(Math.max(0,sumSq/n-brightness*brightness));
      let lapSum=0, lapSq=0, count=0;
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x, lap=gray[p-1]+gray[p+1]+gray[p-w]+gray[p+w]-4*gray[p]; lapSum+=lap; lapSq+=lap*lap; count++; }
      const blur=count?Math.max(0,lapSq/count-Math.pow(lapSum/count,2)):0;
      URL.revokeObjectURL(img.src);
      const fail=blur<18||brightness<35||brightness>235||contrast<18;
      const reason=blur<18?'photo is too blurry':brightness<35?'photo is too dark':brightness>235?'photo is over-exposed':'photo has low contrast';
      resolve({blur:Math.round(blur),brightness:Math.round(brightness),contrast:Math.round(contrast),fail,message:fail?`AI Vision quality check failed: ${reason}. Retake a closer, steady, well-lit photo.`:''});
    };
    img.onerror=()=>resolve({fail:true,message:'AI Vision could not inspect this image. Retake the photo.'});
    img.src=URL.createObjectURL(file);
  });
}
function ckPrepOcrImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const max=1500, scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let p=0;p<data.data.length;p+=4){
        const r=data.data[p],g=data.data[p+1],b=data.data[p+2];
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx-mn;
        const lit=(mx>120&&sat>55)||(mn>205&&mx>240);
        const v=lit?0:255;            // dark digits on white background — what Tesseract reads best
        data.data[p]=data.data[p+1]=data.data[p+2]=v;
      }
      ctx.putImageData(data,0,0);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror=e=>reject(e);
    img.src=URL.createObjectURL(file);
  });
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
}
function ckTempBox(r,st){
  const range=ckTempRange(r.meta.type), temp=st.temp;
  const needsConfirm=st.aiStatus==='confirm';
  const status=st.defrosting?'defrost':(temp?(temp.inRange?'ok':'bad'):(st.aiStatus==='scanning'?'scan':(needsConfirm?'confirm':(st.aiStatus==='error'?'error':'idle'))));
  const reading=st.defrosting?'DEFROSTING':(temp?`${temp.value.toFixed(1)} C`:(st.aiStatus==='scanning'?'Scanning photo...':(needsConfirm?'Confirm temperature':(st.aiStatus==='error'?'Retake or confirm':'Waiting for photo'))));
  const source=temp?` · ${temp.source||'AI Vision'}${temp.confidence?` ${temp.confidence}%`:''}`:'';
  const detail=temp?`${temp.inRange?'Within safety range':'Outside safety range - Gmail alert queued'}${source}`:((st.aiStatus==='error'||needsConfirm)?(st.aiError||'AI Vision could not read the number clearly'):`Safety range ${range.text}`);
  const manualValue=Number.isFinite(Number(st.aiSuggestion?.value))?Number(st.aiSuggestion.value).toFixed(1):'';
  const showRetake=!temp&&!st.defrosting&&(st.aiStatus==='error'||needsConfirm);
  const manual=showRetake?`<div class="ck-temp-manual">
      ${st.aiManualAllowed?`<input id="ck-temp-manual-${r.i}" type="number" step="0.1" min="-45" max="35" value="${esc(manualValue)}" placeholder="Enter °C">
      <button class="mini good" type="button" onclick="ckManualTemp(${r.i})">Confirm</button>`:''}
      <button class="mini" type="button" onclick="ckRetakeTemp(${r.i})">Retake</button>
    </div>`:'';
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
  const rows=ckList();
  const missingResp=[...new Set(rows.map(r=>r.dept))].filter(dept=>{
    const rec=(State.chk.resp||{})[dept]||{};
    return !String(rec.p1||'').trim()||!String(rec.submittedBy||'').trim();
  });
  if(missingResp.length){
    ckMarkRespMissing(missingResp);
    toast(`Enter Responsible Person 1 and Submitted by for ${missingResp.length} department(s)`);
    return;
  }
  const missingPhotos=rows.filter(r=>{
    const st=State.chk.state[r.i]||{}, skip=r.meta.temp&&st.defrosting;
    return r.photo&&!skip&&((st.photos||[]).length<1);
  });
  if(missingPhotos.length){
    ckMarkPhotoMissing(missingPhotos);
    toast(`📷 ${missingPhotos.length} photo task(s) need at least 1 photo before submit`);
    return;
  }
  const pendingTemps=rows.filter(r=>{
    const st=State.chk.state[r.i]||{};
    return r.meta.temp&&!st.defrosting&&(!st.temp||st.aiStatus!=='done'||!st.done);
  });
  if(pendingTemps.length){
    ckMarkTempMissing(pendingTemps);
    toast(`AI Vision must finish and mark done for ${pendingTemps.length} temperature check(s)`);
    return;
  }
  const done=rows.filter(r=>(State.chk.state[r.i]||{}).done).length;
  if(!done){ toast('Tick at least one task before submitting'); return; }
  const out=rows.filter(r=>r.meta.temp&&(State.chk.state[r.i]||{}).temp&&!((State.chk.state[r.i]||{}).temp.inRange)).length;
  // ---- persist a REAL submission (Manager verify / Performance / records all read this) ----
  const allRows=DB.checklist.items.map(ckItem).filter(r=>ckStoreOk(r) && r.dept===State.chk.dept && ckInSession(r,State.chk.session));
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
  toast(`✓ ${State.chk.session} checklist submitted${isAdmin()?'':' for '+State.branch} · ${done} done${out?' · '+out+' temp alert(s)':''} · saved`);
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
       <div class="field"><label>${mod==='incident'||mod==='complaint'?'Submitted by':'Your name'} <span class="req">*</span></label><select id="iss-name">${staffSelectOptions('',selName,'— Select your name —',{fallbackAll:true})}</select></div>
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
    const staff2=`<select id="iss-staff2">${staffSelectOptions('','','— N/A / Unknown —',{fallbackAll:true})}</select>`;
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
  const name=$('#iss-name'); if(name) name.innerHTML=staffSelectOptions(dept,name.value,'— Select your name —',{fallbackAll:true});
  const staff2=$('#iss-staff2'); if(staff2) staff2.innerHTML=staffSelectOptions(dept,staff2.value,'— N/A / Unknown —',{fallbackAll:true});
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
        <div class="field"><label>Department (checklist)</label><select id="st-dept"><option value="">— Unassigned —</option>${cdepts.map(d=>`<option ${d===s.dept?'selected':''}>${esc(d)}</option>`).join('')}</select></div>
        <div class="field"><label>Role / Classification</label><input id="st-role" value="${esc(s.role||s.classification||'')}" placeholder="e.g. CASHIER, FRUIT & VEGGIES"></div>
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
      ${rows.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${s.dept?`<span class="badge mute">${esc(s.dept)}</span>`:'—'}</td><td>${esc(s.role||s.classification||'')}</td><td>${esc(s.store)}</td><td>${esc(s.phone||'')}</td><td>${esc(s.email||'')}</td><td>${esc(s.dob||'—')}</td><td>${esc(s.start||'')}</td><td>${esc(s.estatus||s.category||'')}</td><td>${s.active?'<span class="badge ok"><span class="bdot"></span>Active</span>':'<span class="badge mute"><span class="bdot"></span>Inactive</span>'}</td><td><span class="ck-task-admin"><button onclick="staffEditOpen('${esc(s.id)}')" title="Edit">✎</button><button onclick="staffDelete('${esc(s.id)}')" title="Delete">🗑</button></span></td></tr>`).join('')}
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
  const rec={name,dept:g('st-dept'),role,classification:role,store,phone:g('st-phone'),email:g('st-email'),gender:g('st-gender'),
    dob:g('st-dob'),start:g('st-start'),cardId:g('st-cardid'),tfn:g('st-tfn'),address:g('st-address'),suburb:g('st-suburb'),
    country:g('st-country'),basis:g('st-basis'),category:g('st-cat'),estatus:g('st-estatus'),active:g('st-active')==='1'?1:0};
  if(ed==='new'){ rec.id=storeCode(store)+'-'+String(20000+Math.floor(Math.random()*9000)); auditLog('create','staff',rec.id,rec.store,null,rec); DB.staff.unshift(rec); }
  else { const s=DB.staff.find(x=>x.id===ed); if(!recordInScope(s)){ toast('This staff member belongs to another store'); return; } if(s){ const before=JSON.parse(JSON.stringify(s)); Object.assign(s,rec); auditLog('update','staff',s.id,s.store,before,s); } }
  if(window.persist) window.persist();
  State.staffEdit=null; toast('✓ Staff saved'); renderStaff();
}
function staffDelete(id){ if(!confirm('Delete this staff member permanently?')) return; const i=DB.staff.findIndex(x=>x.id===id); if(i>=0 && !recordInScope(DB.staff[i])){ toast('This staff member belongs to another store'); return; } if(i>=0){ const before=JSON.parse(JSON.stringify(DB.staff[i])); auditLog('delete','staff',before.id,before.store,before,null); DB.staff.splice(i,1); } if(window.persist) window.persist(); State.staffEdit=null; toast('🗑 Staff deleted'); renderStaff(); }

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
  .rpt-foot{margin-top:22px;color:#9ca3af;font-size:10px;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  @page{margin:13mm}`;
const EXP_DOC_CSS=`table{border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt}th{background:#0e9f6e;color:#fff;border:1px solid #0b8f63;padding:6px 9px;text-align:left}td{border:1px solid #d9e2ec;padding:6px 9px;vertical-align:top}.cbx.on{color:#0e9f6e}.sched-dept td{background:#ecfdf5;color:#047857;font-weight:bold}.sched-cbx{font-size:16pt;font-weight:bold}.sched-cbx.done{color:#15803d}.sched-cbx.todo{color:#a16207}.sched-day{text-align:center}.sched-day small{display:block;font-size:8pt;color:#64748b}.sign-line,.note-line{display:block;border-bottom:1px solid #94a3b8;height:16px;min-width:80px}`;
function expPrintReport(title,inner,meta){
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to print / export'); return; }
  const when=new Date().toLocaleString(), role=isSuper()?'Super Admin':isAdmin()?'Admin':'Staff';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${EXP_CSS}</style></head><body>
    <div class="rpt-head"><div class="rpt-logo">MCQ</div><div><div class="rpt-title">${esc(title)}</div><div class="rpt-sub">MCQ Supermarket · ${esc(expScope())}</div></div><div class="rpt-stamp">${esc(when)}<br>${esc(role)} view</div></div>
    ${meta?`<div class="rpt-meta">${meta}</div>`:''}
    <table>${inner}</table>
    <div class="rpt-foot">MCQ Supermarket — Operations report · Confidential · Generated ${esc(when)}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>`);
  w.document.close();
}
function expDocBlob(title,inner,meta){
  const when=new Date().toLocaleString();
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${EXP_DOC_CSS}</style></head><body>
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
function checklistExportMenu(){
  return `<div class="exp-dd"><button class="btn sm exp-trigger" onclick="expToggle(this,event)"><i class="fas fa-file-export"></i>&nbsp; Export <i class="fas fa-caret-down"></i></button>
    <div class="exp-menu">
      <button onclick="exportChecklist('print')"><i class="fas fa-print"></i> Print</button>
      <button onclick="exportChecklist('pdf')"><i class="fas fa-file-pdf"></i> PDF</button>
      <button onclick="exportChecklist('excel')"><i class="fas fa-file-excel"></i> Excel</button>
      <button onclick="exportChecklist('word')"><i class="fas fa-file-word"></i> Word</button>
    </div></div>`;
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
  let ref; try{ const d=await compressImage(f,1200,.62); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d,{module:'scheduleHistory',store:c.store,taskId:c.taskId,day:c.day,date:c.date,type:t.type}):d; }catch(e){ ref=URL.createObjectURL(f); }
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
  let ref; try{ const d=await compressImage(f,1200,.62); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d,{module:'binAdmin',store:binStore(),day:s.day,date:binDayKey(s.day,s.week||0)}):d; }catch(e){ ref=URL.createObjectURL(f); }
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
  State.hist=State.hist||{tab:'checklist',store:isSuper()?'All stores':State.branch,dept:'All departments',q:''};
  if(!isSuper()) State.hist.store=State.branch;
  return State.hist;
}
function histTab(tab){ const h=histState(); h.tab=tab; h.dept='All departments'; renderHistory(); }
function histSet(k,v){ const h=histState(); h[k]=v; renderHistory(); }
function histStoreOk(r){ const h=histState(); return h.store==='All stores'||r.store===h.store; }
function histTextOk(r){ const q=staffNorm(histState().q||''); return !q||staffNorm(JSON.stringify(r)).includes(q); }
function histPhotos(list){ return (list||[]).filter(Boolean); }
function histStrip(photos){
  photos=histPhotos(photos).slice(0,5);
  return photos.length?`<div class="hist-photos">${photos.map(p=>`<img src="${imgSrc(p)}" alt="">`).join('')}</div>`:'<div class="hist-no-photo">No photo evidence</div>';
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
  return (DB.scheduleHistory||[]).filter(r=>histStoreOk(r)&&histTextOk(r)&&(h.dept==='All departments'||r.dept===h.dept))
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
    <div class="drawer-body hist-drawer"><div class="hist-summary"><span><b>${esc(r.staffName)}</b> Staff</span><span><b>${esc(r.binQty)}</b> Bins</span><span><b>${esc((r.created||'').slice(0,16).replace('T',' '))}</b> Time</span></div>${r.photo?`<a href="${imgSrc(r.photo)}" target="_blank" rel="noopener"><img class="hist-hero-photo" src="${imgSrc(r.photo)}" alt=""></a>`:''}${checks}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function histOpenSchedule(id){
  const r=(DB.scheduleHistory||[]).find(x=>x.id===id); if(!r) return;
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">${r.type==='maintenance'?'🔧':'🧽'}</div><div><div style="font-weight:840;font-size:16px">${esc(r.task)}</div><div style="color:var(--muted);font-size:12.5px">${esc(r.store)} · ${esc(r.date)} · ${esc(r.id)}</div></div><button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body hist-drawer"><div class="hist-summary"><span><b>${esc(r.staffName)}</b> Completed by</span><span><b>${esc(r.dept||'')}</b> Department</span><span><b>${esc(r.day)}</b> Day</span><span><b>${esc((r.created||'').slice(0,16).replace('T',' '))}</b> Time</span></div>${r.photo?`<a href="${imgSrc(r.photo)}" target="_blank" rel="noopener"><img class="hist-hero-photo" src="${imgSrc(r.photo)}" alt=""></a>`:''}${r.note?`<div class="hist-note">${esc(r.note)}</div>`:''}${isAdmin()?`<button class="btn sm" onclick="schedDeleteHistory('${ckJS(r.id)}')"><i class="fas fa-trash"></i> Delete record</button>`:''}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function renderHistory(){
  const h=histState(); setAccent('#0f766e'); setCrumb('🧾','Checklist History','Checklist, bin and cleaning evidence records');
  const tabs=[['checklist','Checklist'],['bin','Bin'],['schedule','Cleaning & Maintenance']].map(t=>`<button class="seg-btn ${h.tab===t[0]?'active':''}" onclick="histTab('${t[0]}')">${t[1]}</button>`).join('');
  const storePick=isSuper()?`<select class="login-input" style="width:auto" onchange="histSet('store',this.value)">${['All stores',...DB.stores].map(s=>`<option ${s===h.store?'selected':''}>${esc(s)}</option>`).join('')}</select>`:'';
  const rows=h.tab==='checklist'?histChecklistRows():h.tab==='bin'?histBinRows():histScheduleRows();
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
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🧾</div><div><h2>Checklist History</h2><p>Review submitted checklist records, bin evidence, and completed cleaning/maintenance tasks with photos.</p></div><div class="ph-actions">${storePick}${deptPick}<div class="seg seg-light">${tabs}</div></div></div>
    <div class="toolbar"><span class="count-chip">${rows.length} record${rows.length!==1?'s':''}</span><div class="search"><input value="${esc(h.q||'')}" oninput="State.hist.q=this.value;renderHistory()" placeholder="Search staff, task, area, ID..."></div></div>
    <div class="hist-grid">${cards||'<div class="card card-pad empty compact">No history records yet.</div>'}</div>`;
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
/* real submitted checklists FIRST, then synthetic demo history */
function mgrSubs(){
  const real=(DB.checklistSubs||[]).map(s=>({ id:s.id, date:s.date, dayName:s.dayName||new Date(s.date+'T00:00').toLocaleDateString(undefined,{weekday:'long'}),
    store:s.store, department:s.dept, session:s.session, by:s.by||s.responsible||'Staff',
    total:s.total, done:s.done, progress:s.progress, status:s.status||'Submitted', real:true, items:s.items,
    verifyNote:s.verifyNote||'', verifiedAt:s.verifiedAt||'', verifiedBy:s.verifiedBy||'' }));
  return real.concat(mgrSynthSubs());
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
  const map=DB.storeManagerEmails||DB.managerEmails||{};
  const fromMap=map&&map[store];
  if(Array.isArray(fromMap)) fromMap.forEach((r,i)=>add(typeof r==='string'?{key:'mgr-'+store+'-'+i,name:store+' Store Manager',email:r}:r));
  else if(typeof fromMap==='string') add({key:'mgr-'+store,name:store+' Store Manager',email:fromMap});
  else add(fromMap);
  (DB.staff||[]).filter(x=>x.store===store && /manager|supervisor/i.test(x.role||'') && x.email)
    .forEach(x=>add({key:'staff-'+x.id,name:x.name,email:x.email}));
  add((DB.emailRecipients||[]).find(r=>r.key==='mgr'));
  return out;
}
function mgrEmailVerifyNote(s,note){
  const to=mgrStoreRecipients(s.store);
  if(!to.length){ toast('No manager email configured for '+s.store); return false; }
  const subject=`MCQ ${s.store} · Checklist verified · ${s.department} ${s.session}`;
  const body=`Store: ${s.store}
Department: ${s.department}
Session: ${s.session}
Date: ${s.date}
Verified by: ${(State.account&&State.account.name)||'Manager'}
Progress: ${s.done}/${s.total} (${s.progress}%)

Assessment note:
${note}`;
  if(window.mcqEmail && mcqEmail._gmail) mcqEmail._gmail(to,subject,body);
  else window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to.map(r=>r.email).join(','))+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),'_blank');
  return true;
}
function mgrVerify(id){
  const note=($('#mgr-note')&&$('#mgr-note').value||'').trim();
  const s=mgrSubs().find(x=>x.id===id); if(s){ s.status='Verified'; s.verifyNote=note; s.verifiedAt=new Date().toISOString(); s.verifiedBy=(State.account&&State.account.name)||'Manager'; }
  if(!mgrSubInScope(s)){ toast('This checklist belongs to another store'); return; }
  const real=(DB.checklistSubs||[]).find(x=>x.id===id && x.store===s.store);
  if(real){ const before=JSON.parse(JSON.stringify(real)); real.status='Verified'; real.verifyNote=note; real.verifiedAt=new Date().toISOString(); real.verifiedBy=(State.account&&State.account.name)||'Manager'; auditLog('verify','checklistSubmission',real.id,real.store,before,real,note); if(window.persist) window.persist(); }
  const emailed=note&&s&&mgrEmailVerifyNote(s,note);
  closeDrawer&&closeDrawer(); toast(emailed?'✓ Checklist verified · Gmail opened to store manager':'✓ Checklist verified'); renderManager(); }
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
  const existingNote=s.verifyNote||'';
  const rows=tasks.map(t=>`<div class="mr-task ${t.done?'done':'todo'}">
      <div class="mr-tk"><span class="mr-check">${t.done?'✓':'○'}</span><div class="mr-name">${esc(t.task)}<small>${esc(t.area)}</small></div>${t.temp?`<span class="badge ${t.temp.ok?'ok':'warn'}">${esc(t.temp.label)}</span>`:''}</div>
      ${t.note?`<div class="mr-note">📝 ${esc(t.note)}</div>`:''}
      ${t.photos.length?`<div class="mr-photos">${t.photos.map(p=>`<a href="${imgSrc(p)}" target="_blank" rel="noopener"><img src="${imgSrc(p)}"></a>`).join('')}</div>`:(t.photoReq&&!t.done?`<div class="mr-nophoto">📷 Photo required — not attached</div>`:'')}
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
        <label>Manager assessment note</label>
        <textarea id="mgr-note" ${s.status==='Verified'?'disabled':''} placeholder="Assessment note for the store manager">${esc(existingNote)}</textarea>
      </div>
      ${s.status==='Verified'
        ? `<div class="rail-tip" style="margin-top:16px">✅ This checklist is already verified.</div>`
        : `<button class="btn primary block lg" style="margin-top:16px" onclick="mgrVerify('${s.id}')"><i class="fas fa-check-double"></i>&nbsp; Verify this checklist</button>
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
      <div class="ph-actions"><input type="date" class="mgr-date" value="${esc(State.mgr.date)}" max="${todayStr}" onchange="mgrDate(this.value)"><button class="btn sm" onclick="mgrSort()"><i class="fas fa-arrow-down-wide-short"></i>&nbsp; ${State.mgr.sort==='newest'?'Newest first':'Oldest first'}</button></div></div>
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
function pgState(){ State.pg=State.pg||{store:isSuper()?'All stores':State.branch,dept:'All departments',area:'All sections'}; return State.pg; }
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
  const groups={};
  scoped.forEach(p=>{ const k=`${p.dept}||${p.area}`; (groups[k]=groups[k]||[]).push(p); });
  const html=Object.entries(groups).map(([k,photos])=>{
    const [dept,area]=k.split('||'), meta=(DB.checklist.deptMeta||{})[dept]||{};
    return `<div class="pg-section card"><div class="card-head"><h3><span class="chk-dot" style="background:${meta.color||'#0891b2'}"></span>${esc(dept)} · ${esc(area)}</h3><span class="ch-sub">${photos.length} photo${photos.length!==1?'s':''}</span></div>
      <div class="photo-grid">${photos.map(p=>`<a class="photo-tile real" href="${imgSrc(p.src)}" target="_blank" rel="noopener" style="background-image:linear-gradient(transparent,rgba(0,0,0,.62)),url('${imgSrc(p.src)}')">
        <span class="pt-ic">📷</span><div class="pt-cap">${esc(p.task)}<small>${esc(p.store)} · ${esc(p.session||p.source)} · ${esc(p.date||'')}</small>${p.by?`<small>By ${esc(p.by)}</small>`:''}</div></a>`).join('')}</div></div>`;
  }).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🖼️</div><div><h2>Photo Gallery</h2><p>Browse photo evidence captured against checklist tasks and issue reports.</p></div>
    <div class="ph-actions">
      <select class="login-input" style="width:auto" onchange="pgSet('store',this.value)">${stores.map(s=>`<option ${s===pg.store?'selected':''}>${esc(s)}</option>`).join('')}</select>
      <select class="login-input" style="width:auto" onchange="pgSet('dept',this.value)">${depts.map(d=>`<option ${d===pg.dept?'selected':''}>${esc(d)}</option>`).join('')}</select>
      <select class="login-input" style="width:auto" onchange="pgSet('area',this.value)">${areas.map(a=>`<option ${a===pg.area?'selected':''}>${esc(a)}</option>`).join('')}</select>
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
  C.items.forEach((it,i)=>{ const r=ckItem(it,i); if(!ckStoreOk(r)) return; const when=it[3], inP=period==='Opening'?(when==='O'||when==='A'):(when==='C'||when==='A'); if(!inP) return;
    const dept=it[0], ps=photoSpec(it[4]), st=(State.chk&&State.chk.state[i])||{};
    const d=byDept[dept]=byDept[dept]||{total:0,done:0,photos:[],reqMissing:0,meta:C.deptMeta[dept]||{}};
    d.total++; if(st.done)d.done++; (st.photos||[]).forEach(u=>d.photos.push(u)); if(ps&&ps.req&&!(st.photos||[]).length)d.reqMissing++; });
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
  const msg=`*MCQ ${State.branch} — ${period} Report (${date})*\n`+Object.entries(byDept).map(([dept,d])=>`• ${dept}: ${d.done}/${d.total} done`).join('\n')+
    `\n\n💬 Complaints open: ${snap[0][2]}\n🛠️ Maintenance open: ${snap[1][2]}\n⚠️ Incidents open: ${snap[2][2]}\n🚚 Deliveries: ${snap[3][2]}\n📷 Photos attached: ${allPhotos.length}\n\n_Sent from MCQ Supermarket_`;
  $('#content').innerHTML=`
    <div class="wa-hero">
      <div class="wa-date">📅 ${date} · ${period} report</div>
      <h2><i class="fab fa-whatsapp"></i>&nbsp; ${period} Report — ready to share</h2>
      <p>Auto-built from today’s checklist, photo evidence and open items. Tap Share to send it straight to your team WhatsApp group.</p>
      <div class="wa-toggle"><button class="${period==='Opening'?'active':''}" onclick="waPeriod('Opening')">☀️ Opening</button><button class="${period==='Closing'?'active':''}" onclick="waPeriod('Closing')">🌙 Closing</button></div>
      <div class="wa-actions"><button class="wa-share" onclick="waShare()"><i class="fab fa-whatsapp"></i>&nbsp; Share to WhatsApp</button>
        <button class="wa-dl" onclick="waCopy()"><i class="fas fa-copy"></i>&nbsp; Copy summary</button></div>
    </div>
    <div class="section-title">What's in the ${period} report</div>
    <div class="wa-cards">${deptCards||'<div class="empty">No checklist tasks for this period.</div>'}</div>
    <div class="section-title">Operations snapshot</div>
    <div class="kpi-grid">${snap.map(s=>`<div class="kpi"><div class="k-top"><div class="k-ic" style="background:${s[4]}1f;color:${s[4]}">${s[0]}</div></div><div class="k-val" style="color:${s[4]}">${s[2]}</div><div class="k-lbl">${s[1]} ${s[3]}</div></div>`).join('')}</div>
    ${allPhotos.length?`<div class="section-title">Photo evidence · ${allPhotos.length}</div><div class="wa-gallery">${allPhotos.map(u=>`<img src="${imgSrc(u)}">`).join('')}</div>`:''}
    <div class="section-title">Message preview</div>
    <div class="card card-pad"><textarea id="wa-msg" style="min-height:170px;font-family:monospace">${esc(msg)}</textarea>
      <div class="fhint" style="margin-top:8px">💡 Photos are attached automatically. Scheduled auto-send daily at 10:30 AM (opening) and 9:30 PM (closing).</div></div>`;
}
function waPeriod(p){ State.wa.period=p; renderWhatsapp(); }
function waShare(){ const txt=$('#wa-msg')?$('#wa-msg').value:''; const t=encodeURIComponent(txt);
  if(navigator.share){ navigator.share({title:'MCQ Daily Report',text:txt}).catch(()=>window.open('https://wa.me/?text='+t,'_blank')); }
  else window.open('https://wa.me/?text='+t,'_blank'); }
function waCopy(){ navigator.clipboard?.writeText($('#wa-msg').value); toast('Summary copied'); }

/* ============================================================ EMAIL NOTIFICATIONS */
/* ============================================================ EMAIL SENDING (copies the restaurant: Brevo HTTP API + Gmail-compose / mailto) */
window.mcqEmail={
  cfg(){ return DB.emailConfig||(DB.emailConfig={channel:'preview',apiKey:'',fromEmail:'',fromName:'MCQ Supermarket'}); },
  recipients(eventType,meta){ const recips=DB.emailRecipients||[]; let keys;
    if(eventType==='checklist') keys=(DB.checklistEmailRoutes&&DB.checklistEmailRoutes[meta&&meta.dept])||[];
    else if(eventType==='issue') keys=(DB.issueEmailRoutes&&DB.issueEmailRoutes[meta&&meta.cat])||[];
    else keys=recips.map(r=>r.key);   // violation & others broadcast
    return recips.filter(r=>keys.includes(r.key)&&r.email); },
  _html(title,body){ return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;margin:auto"><div style="background:linear-gradient(135deg,#0e9f6e,#0891b2);color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><div style="font-weight:800;font-size:18px">MCQ Supermarket</div><div style="opacity:.9;font-size:13px">${esc(title)}</div></div><div style="border:1px solid #e5e7eb;border-top:0;padding:18px 20px;border-radius:0 0 12px 12px;white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(body)}</div><div style="color:#9ca3af;font-size:11px;text-align:center;margin-top:10px">Automated notification · MCQ Supermarket Operations</div></div>`; },
  notify(eventType,subject,body,meta){ const to=this.recipients(eventType,meta); if(!to.length) return; const cfg=this.cfg();
    if(cfg.channel==='brevo'&&cfg.apiKey&&cfg.fromEmail) return this._brevo(to,subject,body,cfg);
    if(cfg.channel==='gmail'){ this._gmail(to,subject,body); toast(`📧 Gmail compose opened · ${to.length} recipient(s)`); return; }
    if(cfg.channel==='mailto'){ window.location.href=this._mailto(to,subject,body); return; }
    toast(`📧 ${to.length} recipient(s) would be notified (demo) — enable real sending in Email settings`); },
  _brevo(to,subject,body,cfg){
    fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'accept':'application/json','content-type':'application/json','api-key':cfg.apiKey},
      body:JSON.stringify({sender:{name:cfg.fromName||'MCQ Supermarket',email:cfg.fromEmail},to:to.map(r=>({email:r.email,name:r.name})),subject,htmlContent:this._html(subject,body)})})
      .then(r=>{ if(r.ok) toast(`📧 Sent to ${to.length} via Brevo`); else toast('📧 Brevo error '+r.status+' — check API key / sender'); })
      .catch(()=>toast('📧 Browser blocked Brevo (CORS) — use Gmail compose, or send via a server relay')); },
  _gmail(to,subject,body){ window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to.map(r=>r.email).join(','))+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),'_blank'); },
  _mailto(to,subject,body){ return 'mailto:'+encodeURIComponent(to.map(r=>r.email).join(','))+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body); },
  test(){ const cfg=this.cfg(), to=(DB.emailRecipients||[]).filter(r=>r.email).slice(0,1); if(!to.length){toast('No recipients with an email');return;}
    if(cfg.channel==='brevo'&&cfg.apiKey&&cfg.fromEmail) this._brevo(to,'MCQ Supermarket — test email','This is a test notification from MCQ Supermarket. If you received this, real email sending works.',cfg);
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
  const chan=[['preview','🧪 Demo (preview only)'],['brevo','📨 Brevo (auto-send)'],['gmail','✉️ Gmail compose'],['mailto','📧 Mail app']];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic" style="background:#e8f1fe">✉️</div><div><h2>Email Notifications</h2><p>For each person, tick which Report-Issue categories and which checklists they get emailed. Violation alerts always go to everyone.</p></div><div class="ph-actions"><button class="btn sm primary" onclick="emailTest()"><i class="fas fa-paper-plane"></i>&nbsp; Send test</button></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h3><i class="fas fa-gear"></i>&nbsp; Sending method</h3><span class="ch-sub">Same approach as the restaurant — Brevo HTTP API, or Gmail compose</span></div>
      <div class="card-pad"><div class="grid2">
        <div class="field"><label>Channel</label><select onchange="emailCfgChannel(this.value)">${chan.map(c=>`<option value="${c[0]}" ${cfg.channel===c[0]?'selected':''}>${esc(c[1])}</option>`).join('')}</select></div>
        <div class="field"><label>From name</label><input value="${esc(cfg.fromName||'')}" oninput="emailCfgSet('fromName',this.value)" placeholder="MCQ Supermarket"></div>
        ${cfg.channel==='brevo'?`<div class="field"><label>Brevo API key</label><input type="password" value="${esc(cfg.apiKey||'')}" oninput="emailCfgSet('apiKey',this.value)" placeholder="xkeysib-…"></div>
        <div class="field"><label>Verified sender email</label><input value="${esc(cfg.fromEmail||'')}" oninput="emailCfgSet('fromEmail',this.value)" placeholder="ops@mcqinternational.com"></div>`:''}
      </div>
      <div class="rail-tip" style="margin-top:12px">${cfg.channel==='brevo'?'📨 <b>Brevo</b> auto-sends over HTTPS (300/day free) — paste your API key + a verified sender. If your browser blocks it (CORS), use Gmail compose or relay through a tiny server.':cfg.channel==='gmail'?'✉️ <b>Gmail compose</b> opens a pre-filled Gmail window so you click Send — works everywhere, no setup.':cfg.channel==='mailto'?'📧 <b>Mail app</b> opens your device email client pre-filled.':'🧪 <b>Demo</b> only shows who would be notified. Pick Brevo or Gmail to actually send.'}</div>
      </div></div>
    <div class="rail-tip" style="margin-bottom:16px;background:var(--bad-bg);border-color:#f3c9c9">⚠️ <b>Violation alerts</b> are sent to <b>all recipients</b> by default — no per-category opt-out.</div>
    <div class="section-title">Report Issue · who receives which category</div>
    <div class="email-list">${cards||'<div class="empty">No recipients.</div>'}</div>
    <div class="section-title" style="margin-top:24px">Checklist submissions · who receives which checklist</div>
    <div class="email-list">${chkCards||'<div class="empty">No recipients.</div>'}</div>`;
}
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
  m.records = isSuper()? [] : (m.records||[]).filter(r=>r.store!==State.branch);
  if(window.auditLog) auditLog('delete','records',m.id,State.branch,{count:n},null);
  if(window.persist) window.persist(); toast('🗑 Deleted '+n+' '+m.label); renderData();
}
function dataClearSubs(){ const n=(DB.checklistSubs||[]).filter(s=>isSuper()||s.store===State.branch).length;
  if(!n){ toast('No submitted checklists'); return; }
  if(!confirm('Delete '+n+' submitted checklist(s)'+(isSuper()?' across ALL stores':' for '+State.branch)+'? Photos stay in storage until purged. Cannot be undone.')) return;
  DB.checklistSubs = isSuper()? [] : (DB.checklistSubs||[]).filter(s=>s.store!==State.branch);
  if(window.persist) window.persist(); toast('🗑 Cleared '+n+' submissions'); renderData();
}
function dataClearAll(){
  if(!confirm('Delete ALL operational records + submitted checklists'+(isSuper()?' across ALL stores':' for '+State.branch)+'?\nStaff, templates & schedules are KEPT. Cannot be undone.')) return;
  Object.values(DB.modules).forEach(m=>{ m.records = isSuper()?[]:(m.records||[]).filter(r=>r.store!==State.branch); });
  DB.checklistSubs = isSuper()? [] : (DB.checklistSubs||[]).filter(s=>s.store!==State.branch);
  if(window.auditLog) auditLog('delete','records','ALL',State.branch,null,null);
  if(window.persist) window.persist(); toast('🗑 All records cleared'); renderData();
}
function dataResetStore(store){ if(!isSuper()) return;
  if(!confirm('RESET all data for '+store+' (records, submitted checklists, schedule history)?\nStaff & templates kept. Cannot be undone.')) return;
  Object.values(DB.modules).forEach(m=>{ m.records=(m.records||[]).filter(r=>r.store!==store); });
  if(Array.isArray(DB.checklistSubs)) DB.checklistSubs=DB.checklistSubs.filter(s=>s.store!==store);
  if(Array.isArray(DB.scheduleHistory)) DB.scheduleHistory=DB.scheduleHistory.filter(r=>r.store!==store);
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
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗄️</div><div><h2>Data Management</h2><p>Export data, run backups and clean up old records.</p></div></div>
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
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="dataClearSubs()">🗑 Delete submitted checklists</button>
          <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="dataClearAll()">🗑 Delete all records + submissions</button>
        </div>
        ${isSuper()?`<div class="section-title" style="margin-top:18px">Reset a single store</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${DB.stores.map(s=>`<button class="btn sm" style="color:var(--bad);border-color:#f3c9c9" onclick="dataResetStore('${ckJS(s)}')">Reset ${esc(s)}</button>`).join('')}</div>`:''}
      </div></div>`;
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
  setAccent('#15803d'); setCrumb('🪪','Face ID','Passwordless sign-in for this device');
  const devices=[['iPhone 15 — Tony',true,'Today'],['MacBook Pro — Office',true,'2 days ago']];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🪪</div><div><h2>Face ID &amp; Passkeys</h2><p>Register this device so you can sign in with Face ID / Touch ID instead of a password.</p></div></div>
    <div class="form-shell"><div class="card card-pad" style="text-align:center">
        <div class="fid-hero">🪪</div><h3 style="margin:6px 0">Set up Face ID on this device</h3>
        <p style="color:var(--muted);font-size:13px;max-width:380px;margin:0 auto 16px">Uses your device’s secure biometric (WebAuthn). Your face never leaves the device — only a secure key is stored.</p>
        <button class="btn primary" onclick="faceIdLogin()">🪪 Register / Test Face ID</button>
        <p class="login-hint" style="margin-top:12px">For live camera &amp; real passkeys, open the app on <b>https</b> or <b>localhost</b>.</p>
      </div>
      <aside class="form-rail"><div class="card rail-card"><h4>Registered devices</h4>
        <table class="grid"><tbody>${devices.map(d=>`<tr><td><b>${esc(d[0])}</b><div class="cell-sub">Last used ${esc(d[2])}</div></td><td>${d[1]?'<span class="badge ok"><span class="bdot"></span>Active</span>':''}</td><td><button class="btn sm" onclick="toast('Removed (demo)')">Remove</button></td></tr>`).join('')}</tbody></table></div>
        <div class="card rail-card"><h4>Security</h4><ul><li>Auto-logout after 30 min idle</li><li>Hard limit 8 hours per session</li><li>Per-store password + admin password</li></ul></div></aside></div>`;
}
