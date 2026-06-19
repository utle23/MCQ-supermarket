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
function renderViolation(){
  if(!State.vio) State.vio={rule:'',sev:'Minor',step:'Verbal Discussion',tab:'stats'};
  setAccent('#c62828');
  const tab=State.vio.tab||'stats';
  if(tab==='new') return vioNew();
  if(tab==='records') return vioRecords();
  return vioStats();
}
function vioSeg(a){ return `<div class="seg seg-light"><button class="seg-btn ${a==='stats'?'active':''}" onclick="vioTab('stats')">📊 Stats</button><button class="seg-btn ${a==='records'?'active':''}" onclick="vioTab('records')">📋 Records</button><button class="seg-btn ${a==='new'?'active':''}" onclick="vioTab('new')">➕ New Case</button></div>`; }
function vioTab(t){ State.vio.tab=t; renderViolation(); }
function vioDrill(cat){ State.vio.drillCat = State.vio.drillCat===cat?null:cat; vioStats(); }
function vioHead(a){ return `<div class="page-head"><div class="ph-ic" style="background:#fdeaea">⚠️</div><div><h2>Violation Rules</h2><p>Log staff rule breaches and manage the Verbal → Written → Final escalation.</p></div><div class="ph-actions">${vioSeg(a)}</div></div>`; }

function vioStats(){
  setCrumb('⚠️','Violation Rules','Stats & escalation');
  const recs=scopedRecords('violation');
  const active=recs.filter(r=>!['Resolved','Cancelled'].includes(r.status));
  const byStaff={}; active.forEach(r=>{(byStaff[r.staffName]=byStaff[r.staffName]||[]).push(r);});
  const TH=3, watch=Object.entries(byStaff).filter(([n,v])=>v.length>=2).sort((a,b)=>b[1].length-a[1].length);
  const total=recs.length, open=active.length, serious=recs.filter(r=>['Major','Critical'].includes(r.severity)).length, resolved=recs.filter(r=>r.status==='Resolved').length, rate=total?Math.round(resolved/total*100):0;
  const strikeHtml = watch.length?`<div class="card"><div class="card-head"><h3><i class="fas fa-user-shield" style="color:#b71c1c"></i>&nbsp; Staff Strike Standings</h3><span class="ch-sub">${TH}+ active = review for termination</span></div>
    <div class="card-pad"><div class="strike-grid">${watch.map(([name,vs])=>{const crit=vs.length>=TH; return `<div class="strike-card ${crit?'crit':'warn'}">
      <div class="strike-top"><b>${esc(name)}</b><span class="badge ${crit?'bad':'warn'}">${crit?'REVIEW FOR TERMINATION':'WARNING'}</span></div>
      <div class="strike-dots">${Array.from({length:TH}).map((_,i)=>`<span class="sdot ${i<vs.length?'on':''}">${i+1}</span>`).join('')}<b style="margin-left:6px">${vs.length} active</b></div>
      <div class="strike-sev">${[...new Set(vs.map(v=>v.step))].map(s=>`<span class="badge ${toneOf(s)}">${esc(s)}</span>`).join(' ')}</div></div>`;}).join('')}</div></div></div>`:'';
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
  return scopedRecords('violation').slice()
    .filter(v=>{ const d=String(v.created||'').slice(0,10); if(from&&(!d||d<from))return false; if(to&&(!d||d>to))return false; return true; })
    .sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
}
function vioExport(fmt){ const cols=[{label:'Ref',get:v=>v.id},{label:'Date',get:v=>(v.created||'').slice(0,16)},{label:'Staff',get:v=>v.staffName},{label:'Store',get:v=>v.store},{label:'Category',get:v=>v.category},{label:'Severity',get:v=>v.severity},{label:'Step',get:v=>v.step},{label:'Status',get:v=>v.status},{label:'Description',get:v=>v.description}]; expRecords('Violation Records',cols,vioFilteredRecs(),fmt); }
function vioRecords(){
  setCrumb('⚠️','Violation Rules','All records');
  const from=State.vio&&State.vio.from||'', to=State.vio&&State.vio.to||'';
  const recs=vioFilteredRecs();
  const list=recs.map(v=>`
    <div class="card vcard" style="--rc:${sevColor(v.severity)}" onclick='openDetail("violation","${esc(v.id)}","${ckJS(v.store||'')}")'>
      <div class="vcard-h"><i class="fas fa-triangle-exclamation" style="color:${sevColor(v.severity)}"></i><b>${esc(v.category)}</b>
        <span class="badge ${toneOf(v.severity)}">${esc(v.severity)}</span><span class="badge ${toneOf(v.step)}">${esc(v.step||'')}</span><span class="badge ${toneOf(v.status)}">${esc(v.status)}</span>
        <span class="vcard-meta">👤 ${esc(v.staffName)} · 🏪 ${esc(v.store||'')} · ${esc((v.created||'').slice(0,16))}</span></div>
      <div class="vcard-b">${esc(v.description||'')}</div></div>`).join('');
  $('#content').innerHTML=`${vioHead('records')}
    <div class="toolbar"><span class="count-chip">📋 ${recs.length} record${recs.length!==1?'s':''}</span>
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
          <div class="field"><label>Staff member <span class="req">*</span></label><select id="vio-staff" onchange="vioStaffChange()"><option value="">— Select staff —</option>${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
          <div class="field"><label>Store</label><select id="vio-store">${(isSuper()?DB.stores:[State.branch]).map(s=>`<option ${s===State.branch?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field"><label>Severity</label><select id="vio-sev2">${['Minor','Moderate','Major','Critical'].map(s=>`<option ${s===State.vio.sev?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field"><label>Warning step <span class="auto-tag" id="vio-step-auto" style="display:none">auto</span></label><select id="vio-step" onchange="State.vio.step=this.value">${DB.warningSteps.map(s=>`<option ${s===State.vio.step?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field full" id="vio-suggest-wrap" style="display:none"><div class="vio-suggest" id="vio-suggest"></div></div>
          <div class="field"><label>Incident date</label><input type="date" id="vio-date" value="${new Date().toISOString().slice(0,10)}"></div>
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
function vioSubmit(){
  const staff=$('#vio-staff').value, desc=$('#vio-desc').value.trim();
  if(!staff||staff.startsWith('—')||!State.vio.ruleTitle||!desc){ toast('Pick a rule, staff and description'); return; }
  const step=$('#vio-step').value;
  const store=storeForWrite($('#vio-store')?.value), id=makeRecordId('VIO',store);
  const rec={id,created:new Date().toISOString().slice(0,16).replace('T',' '),staffName:staff,store,
    category:State.vio.ruleTitle,severity:$('#vio-sev2').value,step,status:step,description:desc,actionTaken:$('#vio-action').value,followUpDate:$('#vio-follow').value};
  auditLog('create','violation',rec.id,rec.store,null,rec);
  DB.modules.violation.records.unshift(rec);
  if(window.persist) window.persist();
  State.vio={rule:'',sev:'Minor',step:'Verbal Discussion',tab:'records'}; toast(`✓ Violation logged · ${step}`); buildSidebar(); renderViolation();
}
/* Auto-suggest the next escalation step from the staff's history (Verbal→Written→Final→Termination) */
function vioStaffChange(){
  const staff=$('#vio-staff').value, wrap=$('#vio-suggest-wrap'), hint=$('#vio-suggest'), tag=$('#vio-step-auto');
  if(!staff){ if(wrap)wrap.style.display='none'; if(tag)tag.style.display='none'; return; }
  const hist=DB.modules.violation.records.filter(r=>r.staffName===staff);
  const active=hist.filter(r=>!['Resolved','Cancelled'].includes(r.status));
  const idx=hist.reduce((mx,r)=>Math.max(mx,DB.warningSteps.indexOf(r.step)),-1);
  const nextIdx=Math.min(idx+1,DB.warningSteps.length-1), next=DB.warningSteps[nextIdx];
  const sel=$('#vio-step'); if(sel) sel.value=next; State.vio.step=next;
  if(tag) tag.style.display='';
  const tone=nextIdx>=2?'bad':nextIdx===1?'warn':'info';
  if(wrap&&hint){ wrap.style.display=''; hint.className='vio-suggest tone-'+tone;
    hint.innerHTML = hist.length
      ? `🔁 <b>${esc(staff)}</b> has <b>${hist.length}</b> prior violation(s)${active.length?` · ${active.length} active`:''}. Highest reached: <b>${idx>=0?esc(DB.warningSteps[idx]):'none'}</b> → auto-suggested next step: <b>${esc(next)}</b>${nextIdx>=2?' ⚠️':''}`
      : `🟢 <b>${esc(staff)}</b> has a clean record — suggested step: <b>${esc(next)}</b> (first warning).`;
  }
}

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
  const thisMonth=recs.filter(r=>(r.sessionDate||'').slice(0,7)===new Date().toISOString().slice(0,7)).length;
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
        <div class="field"><label>Date</label><input type="date" id="trn-date" value="${new Date().toISOString().slice(0,10)}"></div>
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
  const rec={id,created:new Date().toISOString().slice(0,16).replace('T',' '),traineeName:name,traineeRole:role,trainerName:$('#trn-trainer').value,
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
  const month=State.rwdMonth||months[0]||new Date().toISOString().slice(0,7);
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
        <div class="field"><label>Staff</label><select id="rwd-staff">${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
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
function rwdSubmit(){ const staff=$('#rwd-staff').value; if(staff.startsWith('—')){toast('Select a staff member');return;}
  const month=State.rwdMonth||new Date().toISOString().slice(0,7);
  const store=storeForWrite($('#rwd-store')?.value);
  const rec={id:makeRecordId('RWD',store),rewardMonth:month,awardType:$('#rwd-type').value,staffName:staff,store,rewardAmount:+$('#rwd-amt').value||0,status:'Proposed',created:new Date().toISOString().slice(0,16).replace('T',' ')};
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
        <div class="field"><label>Staff</label><select id="rai-staff" onchange="raiPerfHint()">${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label>Review month</label><input type="month" id="rai-month" value="${new Date().toISOString().slice(0,7)}"></div>
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
function raiSubmit(){ const staff=$('#rai-staff').value; if(staff.startsWith('—')){toast('Select a staff member');return;}
  const staffStore=(DB.staff.find(x=>x.name===staff)||{}).store;
  const store=storeForWrite(staffStore||State.branch);
  const rec={id:makeRecordId('RAI',store),staffName:staff,store,reviewMonth:$('#rai-month').value,currentRate:+$('#rai-cur').value||0,proposedRate:+$('#rai-prop').value||0,effectiveDate:$('#rai-eff').value,status:'Submitted',managerNotes:$('#rai-notes').value,created:new Date().toISOString().slice(0,16).replace('T',' ')};
  auditLog('create','raise',rec.id,rec.store,null,rec);
  DB.modules.raise.records.unshift(rec);
  if(window.persist) window.persist();
  toast('📤 Raise review submitted'); buildSidebar(); renderRaise();
}

/* ============================================================ BIRTHDAY GIVEAWAYS */
function bdExport(fmt){ const cols=[{label:'Staff',get:r=>r.staffName},{label:'Store',get:r=>r.store},{label:'Birthday',get:r=>r.birthday},{label:'Favourite gift',get:r=>r.favoriteGift},{label:'Status',get:r=>r.status}]; expRecords('Birthday Giveaways',cols,scopedRecords('birthday'),fmt); }
function renderBirthday(){
  setAccent('#f9a825'); setCrumb('🎂','Birthday Giveaways','Never miss a team birthday');
  const recs=scopedRecords('birthday');
  const today=new Date();
  const daysUntil=bd=>{ if(!bd) return 999; const [Y,M,D]=bd.split('-').map(Number); let n=new Date(today.getFullYear(),M-1,D); if(n<today.setHours(0,0,0,0))n=new Date(today.getFullYear()+1,M-1,D); return Math.ceil((n-new Date().setHours(0,0,0,0))/86400000); };
  const withDays=recs.map(r=>({...r,du:daysUntil(r.birthday)})).sort((a,b)=>a.du-b.du);
  const next=withDays[0];
  const next30=withDays.filter(r=>r.du<=30);
  const thisMonth=recs.filter(r=>(r.birthday||'').slice(5,7)===String(today.getMonth()+1).padStart(2,'0'));
  const given=recs.filter(r=>r.status==='Given');
  const staff=['— Select staff —',...DB.staff.filter(x=>isSuper()||x.store===State.branch).map(x=>x.name)];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fef4e0">🎂</div><div><h2>Birthday Giveaways</h2><p>Track staff birthdays and plan their gift.</p></div><div class="ph-actions">${expMenu('bdExport')}</div></div>
    ${next?`<div class="bd-hero"><div class="bd-days"><b>${next.du}</b><span>days</span></div><div><div class="bd-cap">Next birthday</div><div class="bd-name">${esc(next.staffName)}</div>
      <div class="bd-tags"><span class="badge warn">🎂 ${esc(next.birthday)}</span><span class="badge mute">🎁 ${esc(next.favoriteGift||'Gift not set')}</span><span class="badge ${next.status==='Given'?'ok':'info'}">${esc(next.status)}</span></div></div></div>`:''}
    <div class="kpi-grid">
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🎂</div></div><div class="k-val">${recs.length}</div><div class="k-lbl">Staff tracked</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">📅</div></div><div class="k-val">${next30.length}</div><div class="k-lbl">Next 30 days</div></div>
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🗓️</div></div><div class="k-val">${thisMonth.length}</div><div class="k-lbl">This month</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">🎁</div></div><div class="k-val">${given.length}</div><div class="k-lbl">Given</div></div></div>
    <div class="vio-grid">
      <div><div class="section-title" style="margin-top:0">Upcoming birthdays</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Staff</th><th>Birthday</th><th>Gift</th><th>In</th><th>Status</th></tr></thead><tbody>
        ${withDays.map(r=>`<tr onclick='openDetail("birthday","${esc(r.id)}","${ckJS(r.store||'')}")'><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td>${esc(r.birthday)}</td><td>${esc(r.favoriteGift||'—')}</td><td><span class="badge ${r.du<=7?'bad':r.du<=30?'warn':'mute'}">${r.du} days</span></td><td>${badge(r.status)}</td></tr>`).join('')}
        </tbody></table></div></div></div>
      <div class="card" style="align-self:start"><div class="card-head"><h3><i class="fas fa-pen-to-square"></i>&nbsp; Add / update birthday</h3></div><div class="card-pad"><div class="grid2">
        <div class="field full"><label>Staff</label><select id="bd-staff">${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label>Birthday</label><input type="date" id="bd-date"></div>
        <div class="field"><label>Gift status</label><select id="bd-status"><option>Planned</option><option>Given</option></select></div>
        <div class="field full"><label>Favourite gift</label><input id="bd-gift" placeholder="e.g. Coffee hamper"></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="bdSubmit()">🎂 Save birthday</button></div></div>
    </div>`;
}
function bdSubmit(){ const staff=$('#bd-staff').value, date=$('#bd-date').value; if(staff.startsWith('—')||!date){toast('Pick staff and birthday');return;}
  const recStore=storeForWrite((DB.staff.find(x=>x.name===staff)||{}).store||State.branch);
  const ex=DB.modules.birthday.records.find(r=>r.staffName===staff && r.store===recStore);
  const rec={id:ex?ex.id:makeRecordId('BDY',recStore),staffName:staff,store:recStore,birthday:date,favoriteGift:$('#bd-gift').value,status:$('#bd-status').value,created:new Date().toISOString().slice(0,10)};
  if(ex){ const before=JSON.parse(JSON.stringify(ex)); Object.assign(ex,rec); auditLog('update','birthday',ex.id,ex.store,before,ex); }
  else { auditLog('create','birthday',rec.id,rec.store,null,rec); DB.modules.birthday.records.unshift(rec); }
  if(window.persist) window.persist();
  toast('🎂 Birthday saved'); buildSidebar(); renderBirthday();
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
  const band=total>=130?{label:'Outstanding',tone:'ok'}:total>=110?{label:'Strong',tone:'ok'}:total>=95?{label:'Good',tone:'info'}:total>=80?{label:'Needs improvement',tone:'warn'}:{label:'At risk',tone:'bad'};
  const raise=total>=130?'Recommend raise · +5–8%':total>=115?'Eligible for review · +3–5%':total>=100?'Maintain — on track':total>=80?'Coaching plan — hold raise':'Performance management';
  return {name,d,C,total,band,raise};
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
      </div>
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
      <div class="field"><label>Level 2 · Staff under lead <small style="color:var(--muted)">(one per line)</small></label><textarea rows="5" oninput="structSetMembers(${i},this.value)">${esc((d.members||[]).join('\n'))}</textarea></div>
      <div class="field"><label>Level 3 · New staff / trainees <small style="color:var(--muted)">(one per line)</small></label><textarea rows="5" oninput="structSetNewStaff(${i},this.value)">${esc((d.newStaff||[]).join('\n'))}</textarea></div>
    </div>
    ${i>0?`<button class="btn sm" style="margin-top:10px;color:var(--bad);border-color:#f3c9c9" onclick="structDelDept(${i})"><i class="fas fa-trash"></i>&nbsp; Delete branch</button>`:''}
  </div></div>`;
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure · Live editor</h2><p>Edit departments, leads &amp; members — changes apply instantly. Add new branches/levels or rename.</p></div>
      <div class="ph-actions"><button class="btn" onclick="structAddDept()">＋ Add department</button><button class="btn primary" onclick="structEditToggle()">✓ Done</button></div></div>
    ${card(DB.structure[0],0)}
    <div class="section-title">Departments / branches</div>
    <div class="struct-edit-grid">${DB.structure.slice(1).map((d,k)=>card(d,k+1)).join('')}</div>`;
}
