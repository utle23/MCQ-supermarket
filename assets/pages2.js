/* ============================================================
   MCQ Supermarket — HR pages copied 1:1 from the restaurant app
   (Violation, Training, Rewards, Raise, Birthday, Staff Structure)
   Loaded after pages.js; uses globals from app.js.
   ============================================================ */

const SEV_COLOR={Minor:'#90A4AE',Low:'#90A4AE',Moderate:'#FBC02D',Medium:'#FBC02D',Major:'#D32F2F',High:'#FB8C00',Critical:'#7B1B1B'};
const sevColor=s=>SEV_COLOR[s]||'#90A4AE';
const cap=s=>String(s||'').replace(/\b\w/g,c=>c.toUpperCase());
const STEP_COLOR={'Verbal Discussion':'#FBC02D','Written Warning':'#FB8C00','Final Warning':'#D32F2F','Termination Referral':'#7B1B1B'};

/* ============================================================ VIOLATION RULES */
// Violations are confidential: Dept Leads (role 'staff') may only REPORT a new case —
// records & stats stay with the Manager (own store) and Super (all stores).
// Staff see their own record in My Violations.
function vioReportOnly(){ return !!(State.account && State.account.role==='staff'); }
function renderViolation(){
  if(!State.vio) State.vio={rule:'',sev:'Minor',step:'Verbal Discussion',tab:'stats'};
  setAccent('#c62828');
  if(vioReportOnly()){ State.vio.tab='new'; return vioNew(); }
  const tab=State.vio.tab||'stats';
  if(tab==='new') return vioNew();
  if(tab==='records') return vioRecords();
  return vioStats();
}
function vioSeg(a){ if(vioReportOnly()) return `<div class="seg seg-light"><button class="seg-btn active">➕ Report violation</button></div>`;
  return `<div class="seg seg-light"><button class="seg-btn ${a==='stats'?'active':''}" onclick="vioTab('stats')">📊 Stats</button><button class="seg-btn ${a==='records'?'active':''}" onclick="vioTab('records')">📋 Records</button><button class="seg-btn ${a==='new'?'active':''}" onclick="vioTab('new')">➕ New Case</button></div>`; }
function vioTab(t){ State.vio.tab=t; renderViolation(); }
function vioDrill(cat){ State.vio.drillCat = State.vio.drillCat===cat?null:cat; vioStats(); }
function vioHead(a){ return `<div class="page-head"><div class="ph-ic" style="background:#fdeaea">⚠️</div><div><h2>Violation Rules</h2><p>Log staff rule breaches and manage the Verbal → Written → Final escalation.</p></div><div class="ph-actions">${vioSeg(a)}</div></div>`; }

function vioStats(){
  setCrumb('⚠️','Violation Rules','Stats & escalation');
  const allRecs=scopedRecords('violation');
  const recs=allRecs.filter(r=>!vioIsInfo(r));   // strike / KPIs / charts = REAL violations only
  const infos=allRecs.filter(vioIsInfo);         // Late clock-out — tracked, never a violation
  const active=recs.filter(r=>!['Resolved','Cancelled'].includes(r.status));
  const byStaff={}; active.forEach(r=>{(byStaff[r.staffName]=byStaff[r.staffName]||[]).push(r);});
  const TH=3, watch=Object.entries(byStaff).filter(([n,v])=>v.length>=2).sort((a,b)=>b[1].length-a[1].length);
  const total=recs.length, open=active.length, serious=recs.filter(r=>['Major','Critical'].includes(r.severity)).length, resolved=recs.filter(r=>r.status==='Resolved').length, rate=total?Math.round(resolved/total*100):0;
  const strikeHtml = watch.length?`<div class="card"><div class="card-head"><h3><i class="fas fa-user-shield" style="color:#b71c1c"></i>&nbsp; Staff Strike Standings</h3><span class="ch-sub">click a card for the full record</span></div>
    <div class="card-pad"><div class="strike-grid">${watch.map(([name,vs])=>{const stn=vioStandingFromRecords(vs); const crit=stn.idx>=2; return `<div class="strike-card ${crit?'crit':'warn'}" style="cursor:pointer" onclick="vioPerson('${ckJS(name)}')">
      <div class="strike-top"><b>${esc(name)}</b><span class="badge ${crit?'bad':'warn'}" style="background:${stn.color};color:#fff">${esc(stn.step||'')}</span></div>
      <div class="strike-dots">${Array.from({length:Math.max(TH,stn.count)}).map((_,i)=>`<span class="sdot ${i<stn.count?'on':''}">${i+1}</span>`).join('')}<b style="margin-left:6px">${stn.count} active</b></div>
      <div class="strike-sev"><span class="btn xs">View record →</span></div></div>`;}).join('')}</div></div></div>`:'';
  const catCount={}; recs.forEach(r=>{const c=r.category||'Other';catCount[c]=(catCount[c]||0)+1;});
  const catEnt=Object.entries(catCount).sort((a,b)=>b[1]-a[1]);
  const dc=State.vio.drillCat||null;
  const catChips=catEnt.map(([lbl,n])=>`<button class="drill-chip ${dc===lbl?'on':''}" onclick="vioDrill('${String(lbl).replace(/'/g,'’')}')">${esc(lbl)} <b>${n}</b></button>`).join('')||'<span style="color:var(--muted)">No data.</span>';
  const stores=isSuper()?DB.stores:[State.branch];
  let drillHtml='';
  if(dc){ const dRecs=recs.filter(r=>(r.category||'Other')===dc), dOpen=dRecs.filter(r=>!['Resolved','Cancelled'].includes(r.status)).length;
    drillHtml=`<div class="card drill-card"><div class="card-head"><h3>🔎 ${esc(dc)}</h3><span class="ch-sub">${dRecs.length} cases · ${dOpen} active</span><button class="btn sm" style="margin-left:auto" onclick="vioDrill('${String(dc).replace(/'/g,'’')}')">✕ Close</button></div>
      <div class="card-pad"><div class="chart-grid cols-2"><div><div class="mini-h">${isSuper()?'By store':'This store'}</div><div class="chart-box"><canvas id="vd-store"></canvas></div></div><div><div class="mini-h">By warning step</div><div class="chart-box"><canvas id="vd-step"></canvas></div></div></div></div></div>`; }
  const superCmp = isSuper()?`<div class="card"><div class="card-head"><h3>Store comparison</h3><span class="ch-sub">stacked by step</span></div><div class="card-pad"><div class="chart-box"><canvas id="vio-bystore"></canvas></div></div></div>`:'';
  $('#content').innerHTML=`${vioHead('stats')}
    <div class="section-title" style="margin-top:0">Filter by type — click to see records</div>
    <div class="vio-typebar" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px">
      ${vioTypeTile('clockin','🕐','#c62828','Clock-in late','counts as a strike',recs.filter(r=>vioTypeOf(r)==='clockin').length)}
      ${vioTypeTile('clockout','🚪','#0891b2','Clock-out late','tracked · not a violation',infos.length)}
      ${vioTypeTile('manual','⚠️','#b45309','Other violations','manual cases',recs.filter(r=>vioTypeOf(r)==='manual').length)}
    </div>
    <div class="card" style="margin-bottom:14px"><div class="card-pad vio-lookup-bar">
      <span class="vio-lookup-lbl">🔎 Look up a staff member — see all their violations &amp; current standing:</span>
      ${staffPick('vio-lookup','','','Search staff…',{onchange:'vioLookup()'})}
      <button class="btn sm primary" onclick="vioLookup()">View record</button></div></div>
    ${strikeHtml}
    <div class="kpi-grid" style="margin-top:${strikeHtml?'16px':'0'}">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📋</div></div><div class="k-val">${total}</div><div class="k-lbl">Total violations</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">🔴</div></div><div class="k-val">${open}</div><div class="k-lbl">Open / active</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">⚠️</div></div><div class="k-val">${serious}</div><div class="k-lbl">Serious / Major</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${rate}%</div><div class="k-lbl">Resolved rate</div></div></div>
    <div class="chart-grid ${isSuper()?'cols-3':'cols-2'}">
      <div class="card"><div class="card-head"><h3>By warning step</h3></div><div class="card-pad"><div class="chart-box"><canvas id="vio-step"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>By severity</h3></div><div class="card-pad"><div class="chart-box"><canvas id="vio-sev"></canvas></div></div></div>
      ${superCmp}</div>
    <div class="section-title">Per-rule analytics — click a rule to drill in</div>
    <div class="drill-chips">${catChips}</div>
    ${drillHtml}`;
  const stepG=groupCount(recs,'step'), sevG=groupCount(recs,'severity');
  mkChart('vio-step',{type:'doughnut',data:{labels:stepG.labels,datasets:[{data:stepG.data,backgroundColor:stepG.labels.map(l=>STEP_COLOR[l]||'#90A4AE'),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  mkChart('vio-sev',{type:'doughnut',data:{labels:sevG.labels,datasets:[{data:sevG.data,backgroundColor:sevG.labels.map(sevColor),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  if(isSuper()){ const ds=DB.warningSteps.map(st=>({label:st,data:stores.map(s=>recs.filter(r=>r.store===s&&r.step===st).length),backgroundColor:STEP_COLOR[st]||'#90A4AE',borderRadius:4}));
    mkChart('vio-bystore',{type:'bar',data:{labels:stores,datasets:ds},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:8,font:{family:'Inter',size:10,weight:'600'},color:'#475569'}}},scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:10},color:'#64748b'},border:{display:false}},y:{stacked:true,grid:{color:'#eef2f7'},ticks:{precision:0,color:'#64748b'},border:{display:false}}}}}); }
  if(dc){ const dRecs=recs.filter(r=>(r.category||'Other')===dc);
    mkChart('vd-store',{type:'bar',data:{labels:stores,datasets:[{data:stores.map(s=>dRecs.filter(r=>r.store===s).length),backgroundColor:'#c62828',borderRadius:6,maxBarThickness:30}]},options:baseOpts({legend:false})});
    const sg=groupCount(dRecs,'step'); mkChart('vd-step',{type:'doughnut',data:{labels:sg.labels,datasets:[{data:sg.data,backgroundColor:sg.labels.map(l=>STEP_COLOR[l]||'#90A4AE'),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})}); }
}

function vioDate(which,val){ State.vio=State.vio||{}; State.vio[which]=val; renderViolation(); }
function vioFilteredRecs(){
  const from=State.vio&&State.vio.from||'', to=State.vio&&State.vio.to||'';
  const recStore=isSuper()?((State.vio&&State.vio.recStore)||'ALL'):null;
  const type=(State.vio&&State.vio.type)||'all';
  return scopedRecords('violation').slice()
    .filter(v=>recStore&&recStore!=='ALL'?v.store===recStore:true)   // per-page store filter (Super)
    .filter(v=>type==='all'?true:vioTypeOf(v)===type)                // type filter (clock-in / clock-out late / other)
    .filter(v=>{ const d=String(v.created||'').slice(0,10); if(from&&(!d||d<from))return false; if(to&&(!d||d>to))return false; return true; })
    .sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
}
function vioExport(fmt){ const TYPE={clockin:'Clock-in late',clockout:'Clock-out late',manual:'Violation'};
  const cols=[{label:'Ref',get:v=>v.id},{label:'Date',get:v=>(v.created||'').slice(0,16)},{label:'Staff',get:v=>v.staffName},{label:'Store',get:v=>v.store},
    {label:'Type',get:v=>TYPE[vioTypeOf(v)]||'Violation'},{label:'Category',get:v=>v.category},
    {label:'Severity',get:v=>vioIsInfo(v)?'—':v.severity},{label:'Step',get:v=>vioIsInfo(v)?'—':v.step},{label:'Status',get:v=>v.status},
    {label:'Description',get:v=>v.description},{label:'Reason / Note',get:v=>v.reasonNote||v.removeReason||''}];
  const T=(State.vio&&State.vio.type)||'all';
  expRecords(T==='all'?'Violation & Lateness Records':(TYPE[T]+' Records'),cols,vioFilteredRecs(),fmt); }
function vioRecords(){
  setCrumb('⚠️','Violation Rules','All records');
  const from=State.vio&&State.vio.from||'', to=State.vio&&State.vio.to||'';
  const recs=vioFilteredRecs();
  const list=recs.map(v=>{ const info=vioIsInfo(v), col=info?'#0891b2':sevColor(v.severity);
    return `<div class="card vcard${info?' vcard-info':''}" style="--rc:${col}" ${info?'':`onclick='openDetail("violation","${esc(v.id)}","${ckJS(v.store||'')}")'`}>
      <div class="vcard-h"><i class="fas ${info?'fa-door-open':'fa-triangle-exclamation'}" style="color:${col}"></i><b>${esc(v.category)}</b>
        ${info?`<span class="badge" style="background:#e0f2fe;color:#0369a1">ℹ️ Not a violation</span>`:`<span class="badge ${toneOf(v.severity)}">${esc(v.severity)}</span><span class="badge ${toneOf(v.step)}">${esc(v.step||'')}</span><span class="badge ${toneOf(v.status)}">${esc(v.status)}</span>`}
        <span class="vcard-meta">👤 ${esc(v.staffName)} · 🏪 ${esc(v.store||'')} · ${esc((v.created||'').slice(0,16))}</span></div>
      <div class="vcard-b">${esc(v.description||'')}${info&&v.reasonNote?`<div style="margin-top:6px;color:#0369a1">📝 Reason: ${esc(v.reasonNote)}</div>`:''}</div>
      ${info&&vioCanManage()?`<div style="padding:0 14px 12px"><button class="btn xs" onclick="vioNotePrompt('${ckJS(v.id)}','${ckJS(v.store||'')}','${ckJS(v.staffName||'')}')"><i class="fas fa-pen"></i>&nbsp; ${v.reasonNote?'Edit reason':'Note reason'}</button></div>`:''}
    </div>`; }).join('');
  const vRecStore=isSuper()?((State.vio&&State.vio.recStore)||'ALL'):State.branch;
  const storeFilter=isSuper()?`<div class="filter"><label>Store</label><select onchange="vioDate('recStore',this.value)">${['ALL'].concat(DB.stores||[]).map(s=>`<option value="${esc(s)}" ${vRecStore===s?'selected':''}>${s==='ALL'?'All stores':esc(s)}</option>`).join('')}</select></div>`:'';
  $('#content').innerHTML=`${vioHead('records')}
    <div style="margin-bottom:12px">${vioTypeSeg()}</div>
    <div class="toolbar"><span class="count-chip">📋 ${recs.length} record${recs.length!==1?'s':''}</span>
      ${storeFilter}
      <div class="filter f-daterange"><label>Date</label><input type="date" value="${esc(from)}" onchange="vioDate('from',this.value)"><span>→</span><input type="date" value="${esc(to)}" onchange="vioDate('to',this.value)"></div>
      ${from||to?`<button class="btn sm" onclick="State.vio.from='';vioDate('to','')">✕ Clear</button>`:''}
      <div class="tb-spacer"></div>${expMenu('vioExport')}</div>
    ${list||'<div class="empty">No violations in this range.</div>'}`;
}

function vioNew(){
  setCrumb('⚠️','Violation Rules','Record a violation');
  const staff=DB.staff.filter(x=>isSuper()||x.store===State.branch).map(x=>x.name);
  const ruleCards=DB.violationRules.map(rl=>`<button type="button" class="vrule ${State.vio.rule===rl.code?'active':''}" style="--rc:${sevColor(rl.severity)}" onclick="vioPick('${rl.code}')">
    <div class="vrule-h"><span class="vrule-ic" style="background:${sevColor(rl.severity)}"><i class="fas fa-triangle-exclamation"></i></span>
      <div><div class="vrule-t">${esc(rl.title)}</div><div class="vrule-tags"><span class="chip">${esc(rl.category)}</span><span class="badge ${toneOf(rl.severity)}">${esc(rl.severity)}</span></div></div></div>
    <div class="vrule-d">${esc(rl.action)}</div></button>`).join('');
  $('#content').innerHTML=`${vioHead('new')}
    <div class="vio-grid">
      <div class="card"><div class="card-head"><h3><i class="fas fa-pen-to-square"></i>&nbsp; Record violation</h3></div><div class="card-pad">
        <div class="rail-tip" style="margin-bottom:14px">💡 Click a rule card to auto-fill the rule, severity &amp; suggested action. Picking a staff member auto-suggests the next warning step.</div>
        <div class="grid2">
          <div class="field"><label>Staff member <span class="req">*</span></label>${staffPick('vio-staff','','','Search staff…',{onchange:'vioStaffChange()'})}</div>
          <div class="field"><label>Store</label><select id="vio-store">${(isSuper()?DB.stores:[State.branch]).map(s=>`<option ${s===State.branch?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field"><label>Severity</label><select id="vio-sev2">${['Minor','Moderate','Major','Critical'].map(s=>`<option ${s===State.vio.sev?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field"><label>Warning step <span class="auto-tag" id="vio-step-auto" style="display:none">auto</span></label><select id="vio-step" onchange="State.vio.step=this.value">${DB.warningSteps.map(s=>`<option ${s===State.vio.step?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field full" id="vio-suggest-wrap" style="display:none"><div class="vio-suggest" id="vio-suggest"></div></div>
          <div class="field"><label>Incident date</label><input type="date" id="vio-date" value="${todayISO()}"></div>
          <div class="field"><label>Follow-up date</label><input type="date" id="vio-follow"></div>
          <div class="field full"><label>Rule</label><input id="vio-rule" placeholder="Pick a rule card →" value="${esc(State.vio.ruleTitle||'')}" readonly></div>
          <div class="field full"><label>Description <span class="req">*</span></label><textarea id="vio-desc" placeholder="Describe the exact violation…"></textarea></div>
          <div class="field full"><label>Suggested / taken action</label><textarea id="vio-action" placeholder="Action, reminder, retraining…"></textarea></div>
        </div>
        <button class="btn block lg" style="margin-top:14px;background:linear-gradient(135deg,#e53935,#c62828);color:#fff;border:0" onclick="vioSubmit()"><i class="fas fa-save"></i>&nbsp; Submit Violation</button>
      </div></div>
      <div><div class="section-title" style="margin-top:0">Rule catalog</div><div class="vrule-grid">${ruleCards}</div></div>
    </div>`;
}
function vioPick(code){ const r=DB.violationRules.find(x=>x.code===code); if(!r) return; State.vio.rule=code; State.vio.ruleTitle=r.title; State.vio.sev=r.severity;
  document.querySelectorAll('.vrule').forEach(c=>c.classList.remove('active')); event.currentTarget.classList.add('active');
  const ri=$('#vio-rule'); if(ri) ri.value=r.title; const sv=$('#vio-sev2'); if(sv) sv.value=r.severity; const ac=$('#vio-action'); if(ac&&!ac.value) ac.value=r.action; }
// Shared violation-creation core — used by the manual form (vioSubmit) AND the AI Assistant,
// so both paths create identical records + side-effects (record, audit, save, email, inbox).
function mcqCreateViolation(o){
  o=o||{}; const staff=(o.staff||'').trim(); const store=o.store||State.branch;
  const ruleTitle=o.ruleTitle||o.rule||'Policy violation';
  const severity=o.severity||'Minor', step=o.step||'Verbal Discussion';
  const desc=(o.description||'').trim(), action=o.action||'', followUp=o.followUp||'';
  if(!staff||!desc) return null;
  const id=makeRecordId('VIO',store);
  const rec={id,created:perthDT(),staffName:staff,store,
    category:ruleTitle,severity,step,status:step,description:desc,actionTaken:action,followUpDate:followUp};
  auditLog('create','violation',rec.id,rec.store,null,rec);
  DB.modules.violation.records.unshift(rec);
  if(window.persist) window.persist();
  // email the employee + office recipients
  try{
    const body=`Dear ${staff},\n\nA violation has been recorded against you:\n\n• Store: ${store}\n• Rule: ${ruleTitle}\n• Severity: ${severity}\n• Warning step: ${step}\n• Date: ${rec.created}\n\nDescription:\n${desc}\n${action?('\nAction taken: '+action):''}${followUp?('\nFollow-up date: '+followUp):''}\n\nPlease speak with your manager — if they accept your reason they will remove the violation. This is a formal record.\n\n— MCQ Management`;
    const subject=`MCQ ${store} · Violation notice — ${ruleTitle} (${step})`;
    const sm=(typeof staffByName==='function')&&staffByName(staff);
    if(sm&&sm.email&&window.mcqEmail){ mcqEmail._brevo([{email:sm.email,name:sm.name}],subject,body,mcqEmail.cfg()); toast('📧 Violation emailed to '+sm.name); }
    if(window.mcqEmail&&mcqEmail.notify) mcqEmail.notify('violation',subject,body,{});
  }catch(e){}
  // → the employee's own inbox (violation notice) + Superadmin inbox (all stores)
  try{ if(window.mcqMsgSend){ const smi=(typeof staffByName==='function')&&staffByName(staff);
    mcqMsgSend({kind:'violation', store, to_staff_id:(smi&&smi.id)||null,
      subject:`Violation notice — ${ruleTitle} (${step})`,
      body_html:`<p>A violation has been recorded against you.</p><ul><li><b>Rule:</b> ${esc(ruleTitle)}</li><li><b>Severity:</b> ${esc(severity)}</li><li><b>Step:</b> ${esc(step)}</li></ul><p>${esc(desc).replace(/\n/g,'<br>')}</p>${action?`<p><b>Action:</b> ${esc(action)}</p>`:''}`}); } }catch(e){}
  return rec;
}
window.mcqCreateViolation=mcqCreateViolation;
function vioSubmit(){
  const staff=$('#vio-staff').value, desc=$('#vio-desc').value.trim();
  if(!staff||staff.startsWith('—')||!State.vio.ruleTitle||!desc){ toast('Pick a rule, staff and description'); return; }
  const step=$('#vio-step').value;
  const store=storeForWrite($('#vio-store')?.value);
  const rec=mcqCreateViolation({staff,store,ruleTitle:State.vio.ruleTitle,severity:$('#vio-sev2').value,step,
    description:desc,action:$('#vio-action').value,followUp:$('#vio-follow').value});
  if(!rec) return;
  State.vio={rule:'',sev:'Minor',step:'Verbal Discussion',tab:'records'}; toast(`✓ Violation logged · ${step}`); buildSidebar(); renderViolation();
}
/* Auto-suggest the step from the staff's ACTIVE violation COUNT (count-based ladder):
   after this new one, standing = ladder(activeCount + 1). 1-3 Verbal, 4 Written, 5 Final, 6+ Termination. */
function vioStaffChange(){
  const staff=$('#vio-staff').value, wrap=$('#vio-suggest-wrap'), hint=$('#vio-suggest'), tag=$('#vio-step-auto');
  if(!staff){ if(wrap)wrap.style.display='none'; if(tag)tag.style.display='none'; return; }
  const cur=vioStanding(staff), afterIdx=vioStepIdxForCount(cur.count+1), next=VIO_STEPS[afterIdx];
  const sel=$('#vio-step'); if(sel) sel.value=next; State.vio.step=next;
  if(tag) tag.style.display='';
  const tone=afterIdx>=2?'bad':afterIdx===1?'warn':'info';
  if(wrap&&hint){ wrap.style.display=''; hint.className='vio-suggest tone-'+tone;
    hint.innerHTML = cur.count
      ? `🔁 <b>${esc(staff)}</b> currently has <b>${cur.count}</b> active violation(s) → <b>${esc(cur.step)}</b>. Logging this one makes it <b>${cur.count+1}</b> → new standing: <b>${esc(next)}</b>${afterIdx>=2?' ⚠️':''}`
      : `🟢 <b>${esc(staff)}</b> has a clean record — this will be their <b>1st</b> → <b>${esc(next)}</b>.`;
  }
}
/* ---- per-employee violation card: everyone's full record + current (count-based) standing,
   with Remove/Restore for Manager & Super (removing lowers the standing automatically) ---- */
function vioCanManage(){ return State.account && (State.account.role==='admin' || State.account.role==='super'); }
function vioPerson(name){
  if(!name) return;
  const store=isSuper()?null:State.branch;
  const recs=vioRecordsFor(name,store).slice().sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
  const st=vioStandingFromRecords(recs);
  const head=st.step
    ? `<div class="vio-standing" style="--sc:${st.color}"><div class="vio-standing-h"><span class="vio-standing-badge">${esc(st.step)}</span>
         <div class="vio-standing-txt"><b>${esc(name)}</b><small>${st.count} active${st.total>st.count?` · ${st.total-st.count} removed`:''} · ${st.total} total</small></div></div>${vioLadderHTML(st.idx)}</div>`
    : `<div class="vio-standing good"><div class="vio-standing-h"><span class="vio-standing-badge ok">✓ Good standing</span><div class="vio-standing-txt"><b>${esc(name)}</b><small>No active violations</small></div></div></div>`;
  const rows=recs.length?recs.map(r=>{
    const act=vioIsActive(r), info=vioIsInfo(r);
    return `<div class="vp-row ${act&&!info?'':'off'}">
      <span class="badge ${info?'':toneOf(r.severity)}"${info?' style="background:#e0f2fe;color:#0369a1"':''}>${info?'info':esc(r.severity||'')}</span>
      <div class="vp-main"><b>${esc(r.category||'Violation')}</b><small>${esc((r.created||'').slice(0,16))}${info?' · not a violation':` · logged as ${esc(r.step||'—')}${act?'':` · <i>${esc(r.status)}</i>`}`}${!info&&!act&&r.removeReason?` · <span style="color:#64748b">reason: ${esc(r.removeReason)}</span>`:''}${info&&r.reasonNote?` · <span style="color:#0369a1">note: ${esc(r.reasonNote)}</span>`:''}</small>
        ${r.description?`<div class="vp-desc">${esc(r.description)}</div>`:''}</div>
      ${vioCanManage()?(info
        ? `<button class="btn xs" onclick="vioNotePrompt('${ckJS(r.id)}','${ckJS(r.store||'')}','${ckJS(name)}')">${r.reasonNote?'Edit reason':'📝 Note reason'}</button>`
        : (act
          ? `<button class="btn xs" style="color:var(--bad);border-color:#f3c9c9" onclick="vioRemovePrompt('${ckJS(r.id)}','${ckJS(r.store||'')}','${ckJS(name)}')">Remove</button>`
          : `<button class="btn xs" onclick="vioSetStatus('${ckJS(r.id)}','${ckJS(r.store||'')}','restore','${ckJS(name)}')">Restore</button>`)):''}
    </div>`; }).join(''):'<div class="empty">No records.</div>';
  mcqModal(`⚖️ ${esc(name)} — violation record`, `${head}
    <div class="vp-note fhint" style="margin:10px 0">Standing is based on <b>active</b> violations. Removing one (reason accepted) lowers the level automatically.</div>
    <div class="vp-list">${rows}</div>`, {wide:true});
}
/* Removing a violation needs a written REASON (mandatory) — captured on the record + audit.
   This especially matters for the Deputy auto "Late clock-in" violations so a manager can't
   silently wipe a lateness record. The Remove button opens vioRemovePrompt → vioConfirmRemove. */
function vioRemovePrompt(id,store,name){
  const recs=(((DB.modules||{}).violation||{}).records||[]);
  const r=recs.find(x=>x.id===id&&(!store||x.store===store)); if(!r) return;
  const isLate = r.category==='Late clock-in' || String(r.id||'').startsWith('VIO-ATT') || r.auto===true;
  mcqModal(isLate?'⏰ Remove late clock-in violation':'🗑 Remove violation', `
    <div class="rail-tip" style="margin-bottom:12px">Removing this lowers <b>${esc(name)}</b>'s standing. A written <b>reason is required</b>${isLate?' to remove a late clock-in':''} — it is kept on the record and in the audit log.</div>
    <div class="vp-desc" style="margin:0 0 12px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px">
      <b>${esc(r.category||'Violation')}</b> · ${esc(r.step||'')} · ${esc((r.created||'').slice(0,16))}${r.description?`<div style="margin-top:4px;color:#64748b">${esc(r.description)}</div>`:''}</div>
    <label class="field"><span style="font-weight:800">Reason for removing <span class="req">*</span></span>
      <textarea id="vio-remove-reason" rows="3" placeholder="${isLate?'e.g. Approved late start · traffic accident · clocked in by mistake · roster error':'e.g. Accepted explanation · logged in error'}" oninput="var b=document.getElementById('vio-remove-go'); if(b){ b.disabled=!this.value.trim(); b.style.opacity=this.value.trim()?'1':'.5'; }" style="width:100%;margin-top:5px"></textarea></label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn" onclick="mcqModalClose()">Cancel</button>
      <button class="btn" id="vio-remove-go" disabled style="background:linear-gradient(135deg,#e53935,#c62828);color:#fff;border:0;opacity:.5" onclick="vioConfirmRemove('${ckJS(id)}','${ckJS(store||'')}','${ckJS(name)}')"><i class="fas fa-trash"></i>&nbsp; Remove violation</button>
    </div>`, {});
  setTimeout(()=>{ var t=document.getElementById('vio-remove-reason'); if(t) t.focus(); }, 60);
}
function vioConfirmRemove(id,store,name){
  var el=document.getElementById('vio-remove-reason'); var reason=(el&&el.value||'').trim();
  if(!reason){ toast('Please enter a reason to remove this violation'); if(el) el.focus(); return; }
  vioSetStatus(id,store,'Removed',name,reason);
}
function vioSetStatus(id,store,status,name,reason){
  const recs=(((DB.modules||{}).violation||{}).records||[]);
  const r=recs.find(x=>x.id===id&&(!store||x.store===store)); if(!r) return;
  if(status!=='restore' && !String(reason||'').trim()){ toast('A reason is required to remove a violation'); return; }   // safety net: never remove without a reason
  const before=JSON.parse(JSON.stringify(r));
  if(status==='restore'){ r.status=r.step||'Verbal Discussion'; delete r.removeReason; delete r.removedBy; delete r.removedAt; }
  else { r.status=status; r.removeReason=String(reason).trim();
    r.removedBy=(State.account&&(State.account.name||State.account.staffName))||'Manager';
    r.removedAt=(typeof perthDT==='function')?perthDT():''; }
  auditLog('update','violation',r.id,r.store,before,r, status==='restore'?'restored':('removed · reason: '+r.removeReason));
  if(window.persist) window.persist();
  toast(status==='restore'?'↩ Violation restored':'🗑 Violation removed — standing updated');
  if(name) vioPerson(name);         // refresh the modal (standing recomputes live; also replaces the reason modal)
  if(State.route&&State.route.mod==='violation') renderViolation();   // refresh stats/records behind it
}
function vioLookup(){ const el=document.getElementById('vio-lookup'); const n=el&&el.value.trim(); if(n&&!n.startsWith('—')) vioPerson(n); else toast('Pick a staff member first'); }
window.vioPerson=vioPerson; window.vioSetStatus=vioSetStatus; window.vioLookup=vioLookup;
window.vioRemovePrompt=vioRemovePrompt; window.vioConfirmRemove=vioConfirmRemove;

/* ---- type filter (Clock-in late / Clock-out late / Other violations) ---- */
function vioSetType(t){ State.vio=State.vio||{}; State.vio.type=t; renderViolation(); }              // stay on current tab
function vioTypeGo(t){ State.vio=State.vio||{}; State.vio.type=t; State.vio.tab='records'; renderViolation(); }   // jump to Records filtered
function vioTypeSeg(){
  const t=(State.vio&&State.vio.type)||'all';
  const b=(k,lb)=>`<button class="seg-btn ${t===k?'active':''}" onclick="vioSetType('${k}')">${lb}</button>`;
  return `<div class="seg seg-light">${b('all','📋 All')}${b('clockin','🕐 Clock-in late')}${b('clockout','🚪 Clock-out late')}${b('manual','⚠️ Other')}</div>`;
}
function vioTypeTile(type,ic,color,lbl,sub,n){
  return `<button class="vio-typetile" onclick="vioTypeGo('${type}')" style="text-align:left;background:var(--card,#fff);border:1.5px solid var(--line);border-left:5px solid ${color};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:2px;box-shadow:var(--shadow)">
    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${ic}</span><b style="font-size:22px;color:${color}">${n}</b></div>
    <div style="font-weight:800;font-size:12.5px">${esc(lbl)}</div><div style="font-size:11px;color:var(--muted)">${esc(sub)}</div></button>`;
}
window.vioSetType=vioSetType; window.vioTypeGo=vioTypeGo;

/* ---- Clock-out late is NOT a violation: no Remove, only a required "reason note" (kept for the report) ---- */
function vioNotePrompt(id,store,name){
  const recs=(((DB.modules||{}).violation||{}).records||[]);
  const r=recs.find(x=>x.id===id&&(!store||x.store===store)); if(!r) return;
  mcqModal('📝 Note reason — Late clock-out', `
    <div class="rail-tip" style="margin-bottom:12px">Clocking out late is <b>not a violation</b> and this record stays on file. Add <b>${esc(name)}</b>'s reason (why they clocked out late) — it is kept for the report.</div>
    <div class="vp-desc" style="margin:0 0 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px">
      <b>${esc(r.category||'Late clock-out')}</b> · ${esc((r.created||'').slice(0,16))}${r.description?`<div style="margin-top:4px;color:#64748b">${esc(r.description)}</div>`:''}</div>
    <label class="field"><span style="font-weight:800">Employee's reason <span class="req">*</span></span>
      <textarea id="vio-note-reason" rows="3" placeholder="e.g. Served a late customer · helped close · manager asked to stay back" oninput="var b=document.getElementById('vio-note-go'); if(b){ b.disabled=!this.value.trim(); b.style.opacity=this.value.trim()?'1':'.5'; }" style="width:100%;margin-top:5px">${esc(r.reasonNote||'')}</textarea></label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn" onclick="mcqModalClose()">Cancel</button>
      <button class="btn primary" id="vio-note-go" ${r.reasonNote?'':'disabled'} style="background:#0891b2;border-color:#0891b2;color:#fff${r.reasonNote?'':';opacity:.5'}" onclick="vioConfirmNote('${ckJS(id)}','${ckJS(store||'')}','${ckJS(name)}')"><i class="fas fa-pen"></i>&nbsp; Save reason</button>
    </div>`, {});
  setTimeout(()=>{ var t=document.getElementById('vio-note-reason'); if(t) t.focus(); }, 60);
}
function vioConfirmNote(id,store,name){
  var el=document.getElementById('vio-note-reason'); var reason=(el&&el.value||'').trim();
  if(!reason){ toast('Please enter the reason'); if(el) el.focus(); return; }
  const recs=(((DB.modules||{}).violation||{}).records||[]);
  const r=recs.find(x=>x.id===id&&(!store||x.store===store)); if(!r) return;
  const before=JSON.parse(JSON.stringify(r));
  r.reasonNote=reason;
  r.notedBy=(State.account&&(State.account.name||State.account.staffName))||'Manager';
  r.notedAt=(typeof perthDT==='function')?perthDT():'';
  auditLog('update','violation',r.id,r.store,before,r,'clock-out reason noted: '+reason);
  if(window.persist) window.persist();
  toast('📝 Reason saved');
  if(name) vioPerson(name);
  if(State.route&&State.route.mod==='violation') renderViolation();
}
window.vioNotePrompt=vioNotePrompt; window.vioConfirmNote=vioConfirmNote;

/* ============================================================ TRAINING ASSESSMENT */
const TRN_RATINGS=[['Excellent','#2E7D32','#E8F5E9'],['Good','#1565C0','#E3F2FD'],['Satisfactory','#F57C00','#FFF3E0'],['Needs work','#C62828','#FDECEA']];
/* training topics are DERIVED from the live checklist: role = department, topics grouped by area */
function trnTopics(){ const t={}; ((DB.checklist&&DB.checklist.items)||[]).forEach(it=>{ const d=it[0],a=it[1],task=it[2]; (t[d]=t[d]||{}); (t[d][a]=t[d][a]||[]); if(!t[d][a].includes(task)) t[d][a].push(task); }); return t; }
function trnDate(which,val){ State.trn=State.trn||{}; State.trn[which]=val; renderTraining(); }
function trnFilteredRecs(){ const from=State.trn&&State.trn.from||'', to=State.trn&&State.trn.to||'';
  return scopedRecords('training').filter(r=>{ const d=String(r.sessionDate||'').slice(0,10); if(from&&(!d||d<from))return false; if(to&&(!d||d>to))return false; return true; }); }
function trnExport(fmt){ const cols=[{label:'Ref',get:r=>r.id},{label:'Trainee',get:r=>r.traineeName},{label:'Role',get:r=>r.traineeRole},{label:'Trainer',get:r=>r.trainerName},{label:'Date',get:r=>r.sessionDate},{label:'Rating',get:r=>r.overallRating},{label:'Status',get:r=>r.status}]; expRecords('Training Sessions',cols,trnFilteredRecs(),fmt); }
function renderTraining(){
  setAccent('#c0392b'); setCrumb('🎓','Training Assessment','Score staff training by role & checklist task');
  if(!State.trn) State.trn={mode:'list',role:'',rating:'',items:[]};
  if(State.trn.mode==='new') return trnForm();
  const recs=scopedRecords('training');
  const done=recs.filter(r=>r.status==='Completed').length;
  const roles=Object.keys(trnTopics()).length;
  const thisMonth=recs.filter(r=>(r.sessionDate||'').slice(0,7)===perthMonth()).length;
  const ratingColor=v=>(TRN_RATINGS.find(r=>r[0]===v)||['','#888','#eee']);
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🎓</div><div><h2>Training Assessment</h2><p>Run and score staff training sessions; track who is achieving each skill.</p></div>
      <div class="ph-actions">${expMenu('trnExport')}<button class="btn primary" onclick="trnNew()"><i class="fas fa-plus"></i>&nbsp; New session</button></div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🎓</div></div><div class="k-val">${recs.length}</div><div class="k-lbl">Sessions</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${done}</div><div class="k-lbl">Completed</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">📅</div></div><div class="k-val">${thisMonth}</div><div class="k-lbl">This month</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧰</div></div><div class="k-val">${roles}</div><div class="k-lbl">Roles</div></div></div>
    <div class="section-title">Sessions</div>
    <div class="toolbar"><span class="count-chip">📋 ${trnFilteredRecs().length} session${trnFilteredRecs().length!==1?'s':''}</span>
      <div class="filter f-daterange"><label>Date</label><input type="date" value="${esc(State.trn.from||'')}" onchange="trnDate('from',this.value)"><span>→</span><input type="date" value="${esc(State.trn.to||'')}" onchange="trnDate('to',this.value)"></div>
      ${(State.trn.from||State.trn.to)?`<button class="btn sm" onclick="State.trn.from='';trnDate('to','')">✕ Clear</button>`:''}</div>
    <div class="card"><div class="table-wrap"><table class="grid" id="trn-table"><thead><tr><th>Ref</th><th>Trainee</th><th>Role</th><th>Trainer</th><th>Date</th><th>Rating</th><th>Status</th></tr></thead><tbody>
      ${(()=>{const lr=trnFilteredRecs();return lr.length?lr.map(r=>{const ri=ratingColor(r.overallRating);return `<tr onclick='openDetail("training","${esc(r.id)}","${ckJS(r.store||'')}")'><td class="cell-id">${esc(r.id)}</td><td><b>${esc(r.traineeName)}</b></td><td><span class="badge mute">${esc(r.traineeRole)}</span></td><td>${esc(r.trainerName||'')}</td><td>${esc(r.sessionDate||'')}</td><td>${r.overallRating?`<span class="rating-badge" style="background:${ri[2]};color:${ri[1]}">${esc(r.overallRating)}</span>`:'—'}</td><td>${badge(r.status)}</td></tr>`;}).join(''):'<tr><td colspan="7"><div class="empty">No sessions in this range.</div></td></tr>';})()}
    </tbody></table></div></div>`;
}
function trnNew(){ State.trn={mode:'new',role:'',rating:'',items:[]}; renderTraining(); }
function trnBack(){ State.trn.mode='list'; renderTraining(); }
function trnForm(){
  setCrumb('🎓','New Training Session','Score each topic by role');
  const staff=DB.staff.filter(x=>isSuper()||x.store===State.branch).map(x=>x.name);
  const roles=Object.keys(trnTopics());
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🎓</div><div><h2>New Training Session</h2><p>Pick a role to load its topics, then mark each as Achieved / Needs practice / Not covered.</p></div>
      <div class="ph-actions"><button class="btn" onclick="trnBack()"><i class="fas fa-arrow-left"></i>&nbsp; Back</button></div></div>
    <div class="card trn-sec"><div class="trn-sec-h"><span class="sec-num">1</span> Session information</div><div class="card-pad">
      <div class="grid2">
        <div class="field"><label>Trainee <span class="req">*</span></label><input id="trn-name" list="trn-staff" placeholder="Select or type name"><datalist id="trn-staff">${staff.map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="field"><label>Role <span class="req">*</span></label><select id="trn-role" onchange="trnRole(this.value)"><option value="">— Select role —</option>${roles.map(r=>`<option>${esc(r)}</option>`).join('')}</select></div>
        <div class="field"><label>Trainer</label><input id="trn-trainer" list="trn-staff" placeholder="Who ran the training?"></div>
        <div class="field"><label>Date</label><input type="date" id="trn-date" value="${todayISO()}"></div>
      </div></div></div>
    <div class="card trn-sec"><div class="trn-sec-h"><span class="sec-num">2</span> Training topics <span class="trn-count" id="trn-count">0 achieved · 0 needs practice</span></div><div class="card-pad">
      <div class="trn-legend"><span><i class="dot" style="background:#43A047"></i>Achieved</span><span><i class="dot" style="background:#FB8C00"></i>Needs practice</span><span><i class="dot" style="background:#9E9E9E"></i>Not covered</span></div>
      <div id="trn-topics"><div class="topics-ph">Select a role above to load training topics</div></div></div></div>
    <div class="card trn-sec"><div class="trn-sec-h"><span class="sec-num">3</span> Summary &amp; rating</div><div class="card-pad">
      <label class="field-lbl">Overall rating</label>
      <div class="rating-opts" id="trn-rating">${TRN_RATINGS.map(r=>`<button type="button" class="ropt" style="--rc:${r[1]}" data-v="${r[0]}" onclick="trnRate(this)"><b style="color:${r[1]}">${r[0]}</b></button>`).join('')}</div>
      <div class="grid2" style="margin-top:14px">
        <div class="field"><label>⭐ Key achievements</label><textarea id="trn-ach"></textarea></div>
        <div class="field"><label>🔧 Needs more practice</label><textarea id="trn-imp"></textarea></div>
      </div></div></div>
    <button class="btn primary lg" style="margin:6px 0 16px" onclick="trnSave()"><i class="fas fa-save"></i>&nbsp; Submit Training Report</button>`;
}
function trnRole(role){ const c=$('#trn-topics'); const topics=trnTopics()[role]; if(!role||!topics){c.innerHTML='<div class="topics-ph">Select a role…</div>';return;}
  State.trn.role=role; let html='';
  Object.entries(topics).forEach(([cat,items])=>{ html+=`<div class="cat-h2">${esc(cat)}</div>`;
    items.forEach((it,i)=>{ const id=cat+'::'+it; html+=`<div class="trow s-not" data-id="${esc(id)}"><span class="tname">${esc(it)}</span><div class="sbtns">
      <button class="sbtn" data-s="achieved" onclick="trnStatus(this,'achieved')" title="Achieved"><i class="fas fa-check"></i></button>
      <button class="sbtn" data-s="needs" onclick="trnStatus(this,'needs')" title="Needs practice"><i class="fas fa-exclamation"></i></button>
      <button class="sbtn active-not" data-s="not" onclick="trnStatus(this,'not')" title="Not covered"><i class="fas fa-minus"></i></button></div></div>`; });
  });
  c.innerHTML=html; trnCount();
}
function trnStatus(btn,s){ const row=btn.closest('.trow'); row.querySelectorAll('.sbtn').forEach(b=>b.className='sbtn'); btn.className='sbtn active-'+(s==='achieved'?'ach':s==='needs'?'needs':'not'); row.className='trow s-'+(s==='achieved'?'ach':s==='needs'?'needs':'not'); trnCount(); }
function trnCount(){ const rows=[...document.querySelectorAll('#trn-topics .trow')]; const a=rows.filter(r=>r.classList.contains('s-ach')).length, n=rows.filter(r=>r.classList.contains('s-needs')).length;
  const el=$('#trn-count'); if(el) el.textContent=`${a} achieved · ${n} needs practice`; }
function trnRate(btn){ document.querySelectorAll('#trn-rating .ropt').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); State.trn.rating=btn.dataset.v; }
function trnSave(){ const name=$('#trn-name').value.trim(), role=$('#trn-role').value;
  if(!name||!role){ toast('Enter trainee name and role'); return; }
  const rows=[...document.querySelectorAll('#trn-topics .trow')]; const ach=rows.filter(r=>r.classList.contains('s-ach')).length; const tot=rows.length||0;
  const id=makeRecordId('TRN',State.branch);
  const rec={id,created:perthDT(),traineeName:name,traineeRole:role,trainerName:$('#trn-trainer').value,
    sessionDate:$('#trn-date').value,status:'Completed',overallRating:State.trn.rating||'Good',score:`${ach}/${tot}`,keyAchievements:$('#trn-ach').value,needsImprovement:$('#trn-imp').value,store:State.branch};
  auditLog('create','training',rec.id,rec.store,null,rec);
  DB.modules.training.records.unshift(rec);
  if(window.persist) window.persist();
  State.trn={mode:'list'}; toast(`✓ Training saved · ${ach}/${tot} achieved`); buildSidebar(); renderTraining();
}

/* ============================================================ MONTHLY REWARDS */
function renderReward(){
  setAccent('#2e7d32'); setCrumb('🏆','Monthly Rewards','Recognise & reward your team');
  const recs=scopedRecords('reward');
  const months=[...new Set(recs.map(r=>r.rewardMonth))].sort().reverse();
  const month=State.rwdMonth||months[0]||perthMonth();
  const mRecs=recs.filter(r=>r.rewardMonth===month);
  const eom=mRecs.find(r=>r.awardType==='Employee of the Month');
  const staff=['— Select staff —',...DB.staff.filter(x=>isSuper()||x.store===State.branch).map(x=>x.name)];
  const awards=['Employee of the Month','Best Customer Service','Best Team Player','Perfect Attendance','Cleanliness Champion'];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#e7f6ee">🏆</div><div><h2>Monthly Rewards</h2><p>Decide and track monthly staff awards and goodwill amounts.</p></div>
      <div class="ph-actions"><select class="login-input" style="width:auto" onchange="rwdMonth(this.value)">${months.concat(months.includes(month)?[]:[month]).map(m=>`<option ${m===month?'selected':''}>${esc(m)}</option>`).join('')}</select>${expMenu('rwdExport')}</div></div>
    ${eom?`<div class="winner"><div class="winner-medal">🏆</div><div><div class="winner-cap">Employee of the Month · ${esc(month)}</div><div class="winner-name">${esc(eom.staffName)}</div><div class="winner-sub">${esc(eom.store||'')} · $${eom.rewardAmount||0} reward · ${esc(eom.status)}</div></div></div>`:''}
    <div class="kpi-grid">
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">🏅</div></div><div class="k-val">${mRecs.length}</div><div class="k-lbl">Awards this month</div></div>
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">💵</div></div><div class="k-val">$${mRecs.reduce((s,r)=>s+(+r.rewardAmount||0),0)}</div><div class="k-lbl">Total reward $</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">⏳</div></div><div class="k-val">${mRecs.filter(r=>r.status==='Proposed').length}</div><div class="k-lbl">Pending</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${new Set(recs.map(r=>r.staffName)).size}</div><div class="k-lbl">Staff recognised</div></div></div>
    <div class="vio-grid">
      <div class="card"><div class="card-head"><h3><i class="fas fa-award"></i>&nbsp; Give an award</h3></div><div class="card-pad"><div class="grid2">
        <div class="field"><label>Award</label><select id="rwd-type">${awards.map(a=>`<option>${esc(a)}</option>`).join('')}</select></div>
        <div class="field"><label>Staff</label>${staffPick('rwd-staff','','','Search staff…')}</div>
        <div class="field"><label>Store</label><select id="rwd-store">${(isSuper()?DB.stores:[State.branch]).map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Amount ($)</label><input type="number" id="rwd-amt" placeholder="100"></div>
        <div class="field full"><label>Notes</label><textarea id="rwd-notes"></textarea></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="rwdSubmit()">🏆 Award staff</button></div></div>
      <div><div class="section-title" style="margin-top:0">Awards · ${esc(month)}</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Award</th><th>Staff</th><th>$</th><th>Status</th></tr></thead><tbody>
        ${mRecs.length?mRecs.map(r=>`<tr onclick='openDetail("reward","${esc(r.id)}","${ckJS(r.store||'')}")'><td><span class="badge ok">${esc(r.awardType)}</span></td><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td class="num">${r.rewardAmount||0}</td><td>${badge(r.status)}</td></tr>`).join(''):'<tr><td colspan="4"><div class="empty">No awards yet this month.</div></td></tr>'}
        </tbody></table></div></div></div>
    </div>`;
}
function rwdMonth(m){ State.rwdMonth=m; renderReward(); }
function rwdExport(fmt){ const cols=[{label:'Month',get:r=>r.rewardMonth},{label:'Award',get:r=>r.awardType},{label:'Staff',get:r=>r.staffName},{label:'Store',get:r=>r.store},{label:'Amount ($)',get:r=>r.rewardAmount||0},{label:'Status',get:r=>r.status}]; expRecords('Monthly Rewards',cols,scopedRecords('reward'),fmt); }
function rwdSubmit(){ const staff=$('#rwd-staff').value.trim(); if(!staff||staff.startsWith('—')){toast('Select a staff member');return;}
  const month=State.rwdMonth||perthMonth();
  const store=storeForWrite($('#rwd-store')?.value);
  const rec={id:makeRecordId('RWD',store),rewardMonth:month,awardType:$('#rwd-type').value,staffName:staff,store,rewardAmount:+$('#rwd-amt').value||0,status:'Proposed',created:perthDT()};
  auditLog('create','reward',rec.id,rec.store,null,rec);
  DB.modules.reward.records.unshift(rec);
  if(window.persist) window.persist();
  toast('🏆 Award added'); buildSidebar(); renderReward();
}

/* ============================================================ RAISE SALARY REVIEW */
function renderRaise(){
  setAccent('#6a1b9a'); setCrumb('💸','Raise Salary Review','Review & approve pay-rate changes');
  const recs=scopedRecords('raise');
  const staff=['— Select staff —',...DB.staff.filter(x=>isSuper()||x.store===State.branch).map(x=>x.name)];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#f3e8fb">💸</div><div><h2>Raise Salary Review</h2><p>Track current vs proposed pay rates and approval decisions.</p></div><div class="ph-actions">${expMenu('raiExport')}</div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📄</div></div><div class="k-val">${recs.length}</div><div class="k-lbl">Reviews</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">⏳</div></div><div class="k-val">${recs.filter(r=>r.status==='Submitted').length}</div><div class="k-lbl">Submitted</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${recs.filter(r=>r.status==='Approved').length}</div><div class="k-lbl">Approved</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">🚫</div></div><div class="k-val">${recs.filter(r=>r.status==='Declined').length}</div><div class="k-lbl">Declined</div></div></div>
    <div class="vio-grid">
      <div class="card"><div class="card-head"><h3><i class="fas fa-file-signature"></i>&nbsp; Create raise review</h3></div><div class="card-pad"><div class="grid2">
        <div class="field"><label>Staff</label>${staffPick('rai-staff','','','Search staff…',{onchange:'raiPerfHint()'})}</div>
        <div class="field"><label>Review month</label><input type="month" id="rai-month" value="${perthMonth()}"></div>
        <div class="field full" id="rai-perf-wrap" style="display:none"><div class="vio-suggest" id="rai-perf"></div></div>
        <div class="field"><label>Current rate ($/h)</label><input type="number" step="0.5" id="rai-cur" placeholder="27.50"></div>
        <div class="field"><label>Proposed rate ($/h)</label><input type="number" step="0.5" id="rai-prop" placeholder="29.00"></div>
        <div class="field"><label>Effective date</label><input type="date" id="rai-eff"></div>
        <div class="field full"><label>Manager notes</label><textarea id="rai-notes"></textarea></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="raiSubmit()">📤 Submit review</button></div></div>
      <div><div class="section-title" style="margin-top:0">Reviews</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Staff</th><th>Current</th><th>Proposed</th><th>Change</th><th>Status</th></tr></thead><tbody>
        ${recs.length?recs.map(r=>{const up=(+r.proposedRate)-(+r.currentRate);return `<tr onclick='openDetail("raise","${esc(r.id)}","${ckJS(r.store||'')}")'><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td class="num">$${r.currentRate}</td><td class="num">$${r.proposedRate}</td><td class="num" style="color:${up>=0?'#0a8a5f':'#d13030'}">${up>=0?'+':''}$${up.toFixed(2)}</td><td>${badge(r.status)}</td></tr>`;}).join(''):'<tr><td colspan="5"><div class="empty">No reviews.</div></td></tr>'}
        </tbody></table></div></div></div>
    </div>`;
}
function raiPerfHint(){ const name=$('#rai-staff').value, wrap=$('#rai-perf-wrap'), hint=$('#rai-perf');
  if(!name||name.startsWith('—')){ if(wrap)wrap.style.display='none'; return; }
  const p=perfScore(name); const tone=p.band.tone==='ok'?'info':p.band.tone;
  if(wrap&&hint){ wrap.style.display=''; hint.className='vio-suggest tone-'+tone;
    hint.innerHTML=`📊 <b>${esc(name)}</b> performance index: <b>${p.total}/150</b> · <b>${esc(p.band.label)}</b> → <b>${esc(p.raise)}</b>. <a href="#/performance" onclick="setTimeout(()=>perfPick('${ckJS(name)}'),50)">Open full scorecard →</a>`; }
}
function raiExport(fmt){ const cols=[{label:'Staff',get:r=>r.staffName},{label:'Store',get:r=>r.store},{label:'Review month',get:r=>r.reviewMonth},{label:'Current ($/h)',get:r=>r.currentRate},{label:'Proposed ($/h)',get:r=>r.proposedRate},{label:'Change',get:r=>((+r.proposedRate)-(+r.currentRate)).toFixed(2)},{label:'Effective',get:r=>r.effectiveDate},{label:'Status',get:r=>r.status}]; expRecords('Raise Salary Reviews',cols,scopedRecords('raise'),fmt); }
function raiSubmit(){ const staff=$('#rai-staff').value.trim(); if(!staff||staff.startsWith('—')){toast('Select a staff member');return;}
  const staffStore=(DB.staff.find(x=>x.name===staff)||{}).store;
  const store=storeForWrite(staffStore||State.branch);
  const rec={id:makeRecordId('RAI',store),staffName:staff,store,reviewMonth:$('#rai-month').value,currentRate:+$('#rai-cur').value||0,proposedRate:+$('#rai-prop').value||0,effectiveDate:$('#rai-eff').value,status:'Submitted',managerNotes:$('#rai-notes').value,created:perthDT()};
  auditLog('create','raise',rec.id,rec.store,null,rec);
  DB.modules.raise.records.unshift(rec);
  if(window.persist) window.persist();
  toast('📤 Raise review submitted'); buildSidebar(); renderRaise();
}

/* ============================================================ BIRTHDAY GIVEAWAYS
   Birthdays come STRAIGHT from each staff member's Date of birth (profile) — nothing
   to enter twice, per store automatically. The gift plan (favourite gift / Planned /
   Given) is the only thing managers add. */
function bdStaffList(){
  return (DB.staff||[]).filter(s=>s.dob && s.active!==0 && !s.archived &&
    (isSuper() ? (!State.superStore||State.superStore==='ALL'||s.store===State.superStore) : s.store===State.branch));
}
function bdCalc(dob){
  const t=new Date(); t.setHours(0,0,0,0);
  const [Y,M,D]=String(dob).split('-').map(Number);
  if(!Y||!M||!D) return null;
  let next=new Date(t.getFullYear(),M-1,D); if(next<t) next=new Date(t.getFullYear()+1,M-1,D);
  const du=Math.round((next-t)/86400000);
  return {du, turning:next.getFullYear()-Y, month:M, day:D,
    label:next.toLocaleDateString('en-AU',{day:'numeric',month:'short'})};
}
function bdGiftRec(s){ return (DB.modules.birthday.records||[]).find(r=>(r.staffId&&String(r.staffId)===String(s.id))||(r.staffName===s.name&&r.store===s.store)); }
function bdExport(fmt){ const cols=[{label:'Staff',get:r=>r.name},{label:'Store',get:r=>r.store},{label:'Dept',get:r=>r.dept||''},{label:'Birthday',get:r=>r.dob},{label:'In (days)',get:r=>r.bd.du},{label:'Favourite gift',get:r=>r.gift||''},{label:'Status',get:r=>r.status||''}];
  const rows=bdStaffList().map(s=>{const g=bdGiftRec(s)||{}; const bd=bdCalc(s.dob); return bd?{...s,bd,gift:g.favoriteGift||'',status:g.status||''}:null;}).filter(Boolean).sort((a,b)=>a.bd.du-b.bd.du);
  expRecords('Birthdays — '+(isSuper()?(State.superStore&&State.superStore!=='ALL'?State.superStore:'All stores'):State.branch),cols,rows,fmt); }
function renderBirthday(){
  setAccent('#f9a825'); setCrumb('🎂','Birthdays','From staff profiles · '+(isSuper()?(State.superStore&&State.superStore!=='ALL'?State.superStore:'all stores'):('MCQ '+State.branch)));
  const list=bdStaffList().map(s=>{ const bd=bdCalc(s.dob); const g=bdGiftRec(s)||{}; return bd?{...s,bd,gift:g.favoriteGift||'',status:g.status||''}:null; }).filter(Boolean).sort((a,b)=>a.bd.du-b.bd.du);
  const todayList=list.filter(r=>r.bd.du===0), next7=list.filter(r=>r.bd.du<=7), next30=list.filter(r=>r.bd.du<=30);
  const m=perthNow().getMonth()+1, thisMonth=list.filter(r=>r.bd.month===m);
  const missing=(DB.staff||[]).filter(s=>!s.dob && s.active!==0 && !s.archived && (isSuper()? (!State.superStore||State.superStore==='ALL'||s.store===State.superStore) : s.store===State.branch)).length;
  const next=list.find(r=>r.bd.du>0);
  const hero = todayList.length
    ? `<div class="bd-hero" style="background:linear-gradient(120deg,#fff7e0,#ffe9f2);color:#7c2d12"><div class="bd-days"><b>🎉</b><span>today</span></div><div><div class="bd-cap">Happy birthday!</div>
        <div class="bd-name">${todayList.map(r=>esc(r.name)).join(' · ')}</div>
        <div class="bd-tags">${todayList.map(r=>`<span class="badge warn">🎂 ${esc(r.store)}</span>`).join('')}</div></div></div>`
    : (next?`<div class="bd-hero"><div class="bd-days"><b>${next.bd.du}</b><span>days</span></div><div><div class="bd-cap">Next birthday</div><div class="bd-name">${esc(next.name)}</div>
        <div class="bd-tags"><span class="badge warn">🎂 ${esc(next.bd.label)}</span><span class="badge mute">${esc(next.dept||'')}${isSuper()?' · '+esc(next.store):''}</span><span class="badge ${next.status==='Given'?'ok':'info'}">🎁 ${esc(next.gift||'Gift not planned yet')}</span></div></div></div>`:'');
  // month-by-month calendar for the whole year (current month first)
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const byMonth=Array.from({length:12},(_,i)=>list.filter(r=>r.bd.month===i+1).sort((a,b)=>a.bd.day-b.bd.day));
  const monthCards=Array.from({length:12},(_,k)=>{ const mi=(m-1+k)%12; const rows=byMonth[mi];
    return `<div class="card bd-month ${mi===m-1?'bd-now':''}"><div class="card-head"><h3>${mi===m-1?'📍 ':''}${months[mi]}</h3><span class="ch-sub">${rows.length||'—'}</span></div>
      ${rows.length?`<div class="card-pad" style="padding-top:6px">${rows.map(r=>`<div class="bd-row"><span class="bd-d">${r.bd.day}</span><div class="bd-who"><b>${esc(r.name)}</b><small>${esc(r.dept||r.role||'')}${isSuper()?' · '+esc(r.store):''}</small></div>${r.bd.du<=30?`<span class="badge ${r.bd.du===0?'ok':r.bd.du<=7?'bad':'warn'}">${r.bd.du===0?'today 🎉':r.bd.du+'d'}</span>`:''}</div>`).join('')}</div>`:''}
    </div>`; }).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fef4e0">🎂</div><div><h2>Birthdays</h2><p>Automatic from each staff member's date of birth — plan the gift, never miss the day.</p></div><div class="ph-actions">${expMenu('bdExport')}</div></div>
    ${hero}
    <div class="kpi-grid">
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">🎉</div></div><div class="k-val">${todayList.length}</div><div class="k-lbl">Today</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">📅</div></div><div class="k-val">${next7.length}</div><div class="k-lbl">Next 7 days</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🗓️</div></div><div class="k-val">${thisMonth.length}</div><div class="k-lbl">This month</div></div>
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🎂</div></div><div class="k-val">${list.length}</div><div class="k-lbl">Birthdays tracked</div></div></div>
    ${missing?`<div class="rail-tip" style="margin-bottom:14px">ℹ️ <b>${missing}</b> staff member${missing>1?'s have':' has'} no date of birth yet — add it in <a href="#/staff" style="font-weight:800">Staff Members</a> and they appear here automatically.</div>`:''}
    <div class="vio-grid">
      <div><div class="section-title" style="margin-top:0">Coming up (30 days)</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Staff</th><th>Birthday</th><th>In</th><th>Gift</th><th>Status</th></tr></thead><tbody>
        ${next30.length?next30.map(r=>`<tr style="cursor:pointer" onclick="bdPick('${ckJS(r.name)}')"><td><b>${esc(r.name)}</b><div class="cell-sub">${esc(r.dept||r.role||'')}${isSuper()?' · '+esc(r.store):''}</div></td><td>${esc(r.bd.label)}</td><td><span class="badge ${r.bd.du===0?'ok':r.bd.du<=7?'bad':'warn'}">${r.bd.du===0?'🎉 today':r.bd.du+' days'}</span></td><td>${esc(r.gift||'—')}</td><td>${r.status?badge(r.status):'<span class="badge mute">No plan</span>'}</td></tr>`).join(''):`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">No birthdays in the next 30 days.</td></tr>`}
        </tbody></table></div></div>
        <div class="section-title">Year calendar</div>
        <div class="bd-months">${monthCards}</div></div>
      <div class="card" style="align-self:start"><div class="card-head"><h3>🎁 Plan a gift</h3></div><div class="card-pad">
        <div class="ai-asst-note" style="margin-bottom:10px">Birthday dates come from the staff profile automatically — here you only plan the gift.</div>
        <div class="grid2">
        <div class="field full"><label>Staff</label>${staffPick('bd-staff','','','Search staff…')}</div>
        <div class="field"><label>Gift status</label><select id="bd-status"><option>Planned</option><option>Given</option></select></div>
        <div class="field full"><label>Favourite gift</label><input id="bd-gift" placeholder="e.g. Coffee hamper"></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="bdSubmit()">🎁 Save gift plan</button></div></div>
    </div>`;
}
function bdPick(name){ const el=document.getElementById('bd-staff'); if(el){ el.value=name; el.dispatchEvent(new Event('input')); }
  const p=DB.staff.find(x=>x.name===name)||{};
  const g=bdGiftRec({name,store:p.store,id:p.id});
  if(g){ const gi=document.getElementById('bd-gift'); if(gi) gi.value=g.favoriteGift||''; const st=document.getElementById('bd-status'); if(st) st.value=g.status||'Planned'; }
  window.scrollTo({top:0,behavior:'smooth'});
}
window.bdPick=bdPick;
function bdSubmit(){ const staff=$('#bd-staff').value.trim(); if(!staff||staff.startsWith('—')){toast('Pick a staff member');return;}
  const person=DB.staff.find(x=>x.name===staff);
  if(!person){ toast('Staff member not found'); return; }
  if(!person.dob){ toast('This person has no date of birth — add it in Staff Members first'); return; }
  const recStore=storeForWrite(person.store||State.branch);
  const ex=DB.modules.birthday.records.find(r=>(r.staffId&&String(r.staffId)===String(person.id))||(r.staffName===staff&&r.store===recStore));
  const rec={id:ex?ex.id:makeRecordId('BDY',recStore),staffId:person.id,staffName:staff,store:recStore,birthday:person.dob,favoriteGift:$('#bd-gift').value,status:$('#bd-status').value,created:todayISO()};
  if(ex){ const before=JSON.parse(JSON.stringify(ex)); Object.assign(ex,rec); auditLog('update','birthday',ex.id,ex.store,before,ex); }
  else { auditLog('create','birthday',rec.id,rec.store,null,rec); DB.modules.birthday.records.unshift(rec); }
  if(window.persist) window.persist();
  toast('🎁 Gift plan saved'); renderBirthday();
}

/* ============================================================ PERFORMANCE & SCORING
   Every staff member starts on the same BASE (100). Points are EARNED for
   reliability (verified checklists), proactive reporting (responsibility),
   training and recognition — and LOST for violations and complaints against
   them. The resulting index drives a fair, transparent pay-review recommendation. */
const PERF_BASE=100;
function perfData(name){
  const st=(DB.staff.find(x=>x.name===name)||{}).store;
  const subs=mgrSubs().filter(s=>s.by===name && (!st||s.store===st));
  const verified=subs.filter(s=>s.status==='Verified');
  const avgProg=subs.length?Math.round(subs.reduce((a,s)=>a+(s.progress||0),0)/subs.length):0;
  let reports=[]; ['issue','maintenance','incident','complaint'].forEach(id=>(DB.modules[id].records||[]).forEach(r=>{ if(r.reportedBy===name) reports.push({mod:id,...r}); }));
  const complaintsAgainst=(DB.modules.complaint.records||[]).filter(r=>r.staffComplained===name);
  const violations=(DB.modules.violation.records||[]).filter(r=>r.staffName===name);
  const training=(DB.modules.training.records||[]).filter(r=>r.traineeName===name && r.status==='Completed');
  const rewards=(DB.modules.reward.records||[]).filter(r=>r.staffName===name);
  return {subs,verified,avgProg,reports,complaintsAgainst,violations,training,rewards};
}
function perfScore(name){
  const d=perfData(name);
  const C={};
  C.base=PERF_BASE;
  // reliability is COMPLETION-quality driven (not sheer count) so it doesn't max out for everyone
  C.reliability=Math.min(20, Math.round((d.avgProg/100)*16) + (d.verified.length>=10?4:d.verified.length>=3?2:0));
  C.reporting=Math.min(24,d.reports.length*3);                                  // proactive = responsibility → strongly rewarded
  C.training=Math.min(18,d.training.length*4 + d.training.filter(t=>t.overallRating==='Excellent').length*2);
  C.rewards=Math.min(20,d.rewards.reduce((s,r)=>s+(r.awardType==='Employee of the Month'?10:5),0));
  const vSev={Minor:-5,Moderate:-12,Major:-25,Critical:-40}, vStep={'Verbal Discussion':-5,'Written Warning':-12,'Final Warning':-25,'Termination':-40};
  C.violations=d.violations.reduce((s,v)=>s+(vSev[v.severity]||vStep[v.step]||-8),0);
  C.complaints=d.complaintsAgainst.reduce((s,r)=>s+(r.severity==='Major'?-15:r.severity==='Moderate'?-8:-4),0);
  let total=C.base+C.reliability+C.reporting+C.training+C.rewards+C.violations+C.complaints;
  total=Math.max(0,Math.min(150,Math.round(total)));
  // admin manual override (0–150) stored on the staff record
  const sm=(DB.staff||[]).find(x=>x.name===name); let override=false;
  if(sm && sm.perfManual!=null && sm.perfManual!=='' && Number.isFinite(Number(sm.perfManual))){ total=Math.max(0,Math.min(150,Math.round(Number(sm.perfManual)))); override=true; }
  const band=total>=130?{label:'Outstanding',tone:'ok'}:total>=110?{label:'Strong',tone:'ok'}:total>=95?{label:'Good',tone:'info'}:total>=80?{label:'Needs improvement',tone:'warn'}:{label:'At risk',tone:'bad'};
  const raise=total>=130?'Recommend raise · +5–8%':total>=115?'Eligible for review · +3–5%':total>=100?'Maintain — on track':total>=80?'Coaching plan — hold raise':'Performance management';
  return {name,d,C,total,band,raise,override};
}
function perfBands(){ return [['Outstanding','≥130','#0a8a5f'],['Strong','110–129','#0e9f6e'],['Good','95–109','#1565c0'],['Needs improvement','80–94','#f59e0b'],['At risk','<80','#ef4444']]; }
function perfPick(v){ State.perf=State.perf||{}; State.perf.sel=v; renderPerformance(); }
function perfExportLeaders(fmt){
  const staff=DB.staff.filter(x=>isSuper()||x.store===State.branch);
  const scored=staff.map(s=>({s,p:perfScore(s.name)})).sort((a,b)=>b.p.total-a.p.total);
  const cols=[{label:'Rank',get:(r,i)=>r._rank},{label:'Staff',get:r=>r.s.name},{label:'Role',get:r=>r.s.role},{label:'Store',get:r=>r.s.store},{label:'Score',get:r=>r.p.total},{label:'Band',get:r=>r.p.band.label},{label:'Recommendation',get:r=>r.p.raise}];
  scored.forEach((r,i)=>r._rank=i+1);
  expRecords('Staff Performance Leaderboard',cols,scored,fmt);
}
function perfExportOne(fmt){
  const name=State.perf&&State.perf.sel; if(!name) return; const p=perfScore(name);
  const cols=[{label:'Component',get:r=>r[0]},{label:'Points',get:r=>r[1]}];
  const rows=[['Base score',p.C.base],['Checklist reliability',(p.C.reliability>=0?'+':'')+p.C.reliability],['Proactive reporting',(p.C.reporting>=0?'+':'')+p.C.reporting],['Training',(p.C.training>=0?'+':'')+p.C.training],['Rewards & recognition',(p.C.rewards>=0?'+':'')+p.C.rewards],['Violations',p.C.violations],['Complaints against',p.C.complaints],['TOTAL SCORE',p.total],['Band',p.band.label],['Pay-review recommendation',p.raise],['Checklists submitted',p.d.subs.length+' ('+p.d.verified.length+' verified, '+p.d.avgProg+'% avg)'],['Reports filed',p.d.reports.length],['Violations',p.d.violations.length],['Complaints against',p.d.complaintsAgainst.length],['Training completed',p.d.training.length],['Awards',p.d.rewards.length]];
  expRecords('Performance — '+name,cols,rows,fmt);
}
function renderPerformance(){
  setAccent('#7c3aed'); setCrumb('📊','Performance & Scoring','Fair, transparent staff performance index');
  if(!State.perf) State.perf={sel:''};
  const staff=DB.staff.filter(x=>isSuper()||x.store===State.branch);
  const sel=State.perf.sel && staff.find(x=>x.name===State.perf.sel) ? State.perf.sel : '';
  const selector=`<select class="login-input" style="width:auto;min-width:220px" onchange="perfPick(this.value)"><option value="">— Whole team (leaderboard) —</option>${staff.map(x=>`<option ${x.name===sel?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  if(sel) return perfDetail(sel,selector);
  // ---- leaderboard ----
  const scored=staff.map(s=>({s,p:perfScore(s.name)})).sort((a,b)=>b.p.total-a.p.total);
  const avg=scored.length?Math.round(scored.reduce((a,r)=>a+r.p.total,0)/scored.length):0;
  const atRisk=scored.filter(r=>r.p.total<70).length, top=scored.filter(r=>r.p.total>=120).length;
  const bandsLegend=perfBands().map(b=>`<span class="perf-leg"><i style="background:${b[2]}"></i>${b[0]} <small>${b[1]}</small></span>`).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#f3e8fb">📊</div><div><h2>Performance &amp; Scoring</h2><p>Everyone starts on a level base of ${PERF_BASE}. Points are earned for reliability, proactive reporting, training &amp; recognition — and lost for violations &amp; complaints.</p></div>
      <div class="ph-actions">${selector} ${exportBtns('perf-table','Staff Performance Leaderboard')}</div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${scored.length}</div><div class="k-lbl">Staff scored</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">📈</div></div><div class="k-val">${avg}</div><div class="k-lbl">Average score</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">⭐</div></div><div class="k-val">${top}</div><div class="k-lbl">Raise-ready (≥120)</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">⚠️</div></div><div class="k-val">${atRisk}</div><div class="k-lbl">At risk (&lt;70)</div></div></div>
    <div class="perf-legend">${bandsLegend}</div>
    <div class="card"><div class="card-head"><h3>Leaderboard${isSuper()?' · all stores':' · '+esc(State.branch)}</h3><span class="ch-sub">Click a row to open the full scorecard</span></div>
      <div class="table-wrap"><table class="grid" id="perf-table"><thead><tr><th>#</th><th>Staff</th><th>Role</th><th>Store</th><th>Score</th><th>Band</th><th>Pay-review recommendation</th></tr></thead><tbody>
      ${scored.map((r,i)=>`<tr onclick="perfPick('${ckJS(r.s.name)}')"><td class="num"><b>${i+1}</b></td><td><b>${esc(r.s.name)}</b></td><td>${esc(r.s.role||'')}</td><td>${esc(r.s.store||'')}</td><td><span class="perf-pill" style="--pc:${perfColor(r.p.total)}">${r.p.total}</span></td><td><span class="badge ${r.p.band.tone}">${esc(r.p.band.label)}</span></td><td>${esc(r.p.raise)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">No staff to score.</div></td></tr>'}
      </tbody></table></div></div>`;
}
function perfColor(t){ return t>=130?'#0a8a5f':t>=110?'#0e9f6e':t>=95?'#1565c0':t>=80?'#f59e0b':'#ef4444'; }
function perfSetManual(name){ if(!isAdmin()) return; const s=DB.staff.find(x=>x.name===name); if(!s) return;
  const v=Number(($('#perf-manual')&&$('#perf-manual').value)||''); if(!Number.isFinite(v)||v<0||v>150){ toast('Enter a score between 0 and 150'); return; }
  const before=JSON.parse(JSON.stringify(s)); s.perfManual=Math.round(v); auditLog&&auditLog('update','staff',s.id,s.store,before,s,'performance score set');
  if(window.persist) window.persist(); toast('✓ Performance score set to '+s.perfManual); renderPerformance(); }
function perfClearManual(name){ if(!isAdmin()) return; const s=DB.staff.find(x=>x.name===name); if(!s) return;
  const before=JSON.parse(JSON.stringify(s)); delete s.perfManual; auditLog&&auditLog('update','staff',s.id,s.store,before,s,'performance score reset to automatic');
  if(window.persist) window.persist(); toast('Score reset to automatic'); renderPerformance(); }
function perfDetail(name,selector){
  const p=perfScore(name), d=p.d, s=DB.staff.find(x=>x.name===name)||{};
  const comp=[['Checklist reliability',p.C.reliability,'Verified submissions & completion','fa-clipboard-check'],
    ['Proactive reporting',p.C.reporting,'Issues/maintenance/incidents they raised','fa-bullhorn'],
    ['Training',p.C.training,'Completed sessions & ratings','fa-graduation-cap'],
    ['Rewards & recognition',p.C.rewards,'Awards received','fa-trophy'],
    ['Violations',p.C.violations,'Rule breaches logged against them','fa-triangle-exclamation'],
    ['Complaints against',p.C.complaints,'Customer complaints naming them','fa-comment-dots']];
  const maxAbs=Math.max(30,...comp.map(c=>Math.abs(c[1])));
  const bar=c=>{const pos=c[1]>=0; const w=Math.round(Math.abs(c[1])/maxAbs*100);
    return `<div class="perf-bd"><div class="perf-bd-h"><i class="fas ${c[3]}"></i> <b>${esc(c[0])}</b><small>${esc(c[2])}</small><span class="perf-bd-v ${pos?'pos':'neg'}">${pos?'+':''}${c[1]}</span></div><div class="perf-bd-track"><i class="${pos?'pos':'neg'}" style="width:${w}%"></i></div></div>`;};
  const reportList=d.reports.slice(0,6).map(r=>`<div class="feed-row"><div class="feed-ic" style="background:#ede9fe;color:#7c3aed">${(DB.modules[r.mod]||{}).icon||'🚩'}</div><div class="feed-main"><div class="fm-t">${esc(r.id)} · ${esc((DB.modules[r.mod]||{}).short||r.mod)}</div><div class="fm-s">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.category||'')}</div></div><div class="feed-time">${esc((r.created||r.date||'').slice(0,10))}</div></div>`).join('')||'<div class="empty">No reports filed.</div>';
  const vioList=d.violations.slice(0,6).map(v=>`<div class="feed-row"><div class="feed-ic" style="background:#fdecea;color:#c62828">⚠️</div><div class="feed-main"><div class="fm-t">${esc(v.category)} · <span class="badge ${toneOf(v.severity)}">${esc(v.severity)}</span></div><div class="fm-s">${esc(v.step||'')} · ${esc((v.description||'').slice(0,60))}</div></div><div class="feed-time">${esc((v.created||'').slice(0,10))}</div></div>`).join('')||'<div class="empty">No violations — clean record. 🟢</div>';
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#f3e8fb">📊</div><div><h2>${esc(name)}</h2><p>${esc(s.role||'')}${s.store?' · '+esc(s.store):''} — performance scorecard</p></div>
      <div class="ph-actions"><button class="btn sm" onclick="perfPick('')"><i class="fas fa-arrow-left"></i>&nbsp; Leaderboard</button>${selector} ${expMenu('perfExportOne')}</div></div>
    <div class="perf-top">
      <div class="card perf-scorecard" style="--pc:${perfColor(p.total)}">
        <div class="perf-score">${p.total}</div><div class="perf-of">/ 150</div>
        <div class="badge ${p.band.tone}" style="font-size:13px;padding:5px 14px">${esc(p.band.label)}</div>
        <div class="perf-raise">💡 ${esc(p.raise)}</div>
        ${p.override?'<div class="perf-override-tag">✎ Manually set by admin</div>':''}
      </div>
      ${isAdmin()?`<div class="card perf-adjust"><div class="card-head"><h3>Admin · adjust score</h3></div><div class="card-pad">
        <p class="fhint" style="margin:0 0 8px">Set a manual score (0–150) to override the calculated one, or clear it to use the automatic score.</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="perf-manual" class="login-input" style="max-width:120px" type="number" min="0" max="150" value="${esc(s.perfManual!=null?s.perfManual:'')}" placeholder="0–150">
          <button class="btn sm primary" onclick="perfSetManual('${ckJS(name)}')">Save score</button>
          <button class="btn sm" onclick="perfClearManual('${ckJS(name)}')">Use automatic</button>
        </div></div></div>`:''}
      <div class="card perf-breakdown"><div class="card-head"><h3>Score breakdown</h3><span class="ch-sub">Base ${PERF_BASE} ± activity</span></div>
        <div class="card-pad"><div class="perf-base">Base score <b>${PERF_BASE}</b></div>${comp.map(bar).join('')}<div class="perf-total">Total performance index <b style="color:${perfColor(p.total)}">${p.total}</b></div></div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${d.subs.length}</div><div class="k-lbl">Checklists submitted</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">🛡️</div></div><div class="k-val">${d.verified.length}</div><div class="k-lbl">Verified · ${d.avgProg}% avg</div></div>
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📣</div></div><div class="k-val">${d.reports.length}</div><div class="k-lbl">Reports filed</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">🎓</div></div><div class="k-val">${d.training.length}</div><div class="k-lbl">Training done</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🏆</div></div><div class="k-val">${d.rewards.length}</div><div class="k-lbl">Awards</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">⚠️</div></div><div class="k-val">${d.violations.length}</div><div class="k-lbl">Violations</div></div></div>
    <div class="split-2">
      <div class="card"><div class="card-head"><h3>📣 Proactive reports (responsibility)</h3><span class="ch-sub">Raising issues earns points</span></div><div class="feed">${reportList}</div></div>
      <div class="card"><div class="card-head"><h3>⚠️ Violations &amp; complaints</h3></div><div class="feed">${vioList}</div></div>
    </div>`;
}

/* ============================================================ STAFF STRUCTURE (restaurant-style) */
function renderStructure(){
  setAccent('#0e9f6e'); setCrumb('🏢','Staff Structure','Organisation chart');
  if(!State.struct) State.struct={edit:false};
  if(isAdmin() && State.struct.edit) return structEditor();
  const deptCard=d=>`<div class="ssd" style="--c:${d.color}">
    <div class="ssd-card">
      <div class="ssd-title">${esc(d.dept)}</div>
      <div class="ssd-tier lead"><span>Level 1</span><b>${esc((d.head||'').split('—')[0].trim())}</b><small>${esc(((d.head||'').split('—')[1]||'DEPARTMENT LEAD').trim())}</small></div>
      <div class="ssd-tier"><span>Level 2</span><b>Department staff</b><div class="ssd-members">${(d.members||[]).map(m=>`<div class="ssd-member">${esc(m)}</div>`).join('')||'<div class="ssd-empty">No level 2 staff yet</div>'}</div></div>
      <div class="ssd-tier new"><span>Level 3</span><b>New staff / trainees</b><div class="ssd-members">${(d.newStaff||[]).map(m=>`<div class="ssd-member">${esc(m)}</div>`).join('')||'<div class="ssd-empty">No new staff yet</div>'}</div></div>
    </div>
  </div>`;
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure</h2><p>How MCQ Supermarket teams report and connect.</p></div>
      ${isAdmin()?`<div class="ph-actions"><button class="btn primary" onclick="structEditToggle()">✎ Live editor</button></div>`:''}</div>
    <div class="ss-wrap">
      <div class="ss-grid">${(DB.structure||[]).map(deptCard).join('')}</div>
    </div>`;
}
function structEditToggle(){ State.struct=State.struct||{}; State.struct.edit=!State.struct.edit; renderStructure(); }
function structPersist(){ if(window.persist) window.persist(); }
function structSet(i,f,v){ if(DB.structure[i]){ DB.structure[i][f]=v; structPersist(); } }
function structSetMembers(i,txt){ if(DB.structure[i]){ DB.structure[i].members=txt.split('\n').map(s=>s.trim()).filter(Boolean); structPersist(); } }
function structSetNewStaff(i,txt){ if(DB.structure[i]){ DB.structure[i].newStaff=txt.split('\n').map(s=>s.trim()).filter(Boolean); structPersist(); } }
function structAddDept(){ DB.structure.push({dept:'NEW DEPARTMENT',color:'#0e9f6e',head:'Name — Department Lead',members:[],newStaff:[]}); structPersist(); renderStructure(); }
function structDelDept(i){ if(!confirm('Delete this department branch?')) return; DB.structure.splice(i,1); structPersist(); renderStructure(); }
function structEditor(){
  setCrumb('🏢','Staff Structure','Live editor');
  const card=(d,i)=>`<div class="card struct-edit-card" style="border-top:4px solid ${d.color||'#0e9f6e'}"><div class="card-pad">
    <div class="grid2">
      <div class="field"><label>${i===0?'Top / Head Office':'Department / branch'}</label><input value="${esc(d.dept)}" oninput="structSet(${i},'dept',this.value)"></div>
      <div class="field"><label>Level 1 · Department lead <small style="color:var(--muted)">(Name — Role)</small></label><input value="${esc(d.head||'')}" oninput="structSet(${i},'head',this.value)"></div>
      <div class="field"><label>Colour</label><input type="color" value="${d.color||'#0e9f6e'}" oninput="structSet(${i},'color',this.value)"></div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="field"><label>Level 2 · Staff under lead <small style="color:var(--muted)">(one per line)</small></label><textarea rows="5" oninput="structSetMembers(${i},this.value)">${esc((d.members||[]).join('\n'))}</textarea>
        <input class="login-input" style="margin-top:6px" list="struct-staff-dl" placeholder="＋ Pick a staff member to add…" onchange="structAddMember(${i},'members',this.value);this.value='';"></div>
      <div class="field"><label>Level 3 · New staff / trainees <small style="color:var(--muted)">(one per line)</small></label><textarea rows="5" oninput="structSetNewStaff(${i},this.value)">${esc((d.newStaff||[]).join('\n'))}</textarea>
        <input class="login-input" style="margin-top:6px" list="struct-staff-dl" placeholder="＋ Pick a staff member to add…" onchange="structAddMember(${i},'newStaff',this.value);this.value='';"></div>
    </div>
    ${i>0?`<button class="btn sm" style="margin-top:10px;color:var(--bad);border-color:#f3c9c9" onclick="structDelDept(${i})"><i class="fas fa-trash"></i>&nbsp; Delete branch</button>`:''}
  </div></div>`;
  // one shared datalist of real staff (name + role/store) for the "pick a staff member" inputs
  const staffOpts=(DB.staff||[]).filter(s=>s.active!==0 && (isSuper()||s.store===State.branch))
    .map(s=>`<option value="${esc(s.name)}" label="${esc((s.role||'Staff')+(isSuper()&&s.store?' · '+s.store:''))}"></option>`).join('');
  $('#content').innerHTML=`<datalist id="struct-staff-dl">${staffOpts}</datalist>
    <div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure · Live editor</h2><p>Edit departments, leads &amp; members — pick real staff from the dropdown or type. Changes apply instantly.</p></div>
      <div class="ph-actions"><button class="btn" onclick="structAddDept()">＋ Add department</button><button class="btn primary" onclick="structEditToggle()">✓ Done</button></div></div>
    ${card(DB.structure[0],0)}
    <div class="section-title">Departments / branches</div>
    <div class="struct-edit-grid">${DB.structure.slice(1).map((d,k)=>card(d,k+1)).join('')}</div>`;
}
function structAddMember(i,tier,name){ name=(name||'').trim(); if(!name||!DB.structure[i]) return;
  const arr=DB.structure[i][tier]=DB.structure[i][tier]||[]; if(!arr.includes(name)) arr.push(name);
  structPersist(); renderStructure(); }
window.structAddMember=structAddMember;
