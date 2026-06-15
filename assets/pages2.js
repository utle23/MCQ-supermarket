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
  setAccent('#c62828'); setCrumb('⚠️','Violation Rules','Conduct, warnings & escalation');
  if(!State.vio) State.vio={rule:'',sev:'Minor',step:'Verbal Discussion'};
  const recs=scopedRecords('violation');
  const active=recs.filter(r=>!['Resolved','Cancelled'].includes(r.status));
  const byStaff={}; active.forEach(r=>{(byStaff[r.staffName]=byStaff[r.staffName]||[]).push(r);});
  const TH=3;
  const watch=Object.entries(byStaff).filter(([n,v])=>v.length>=2).sort((a,b)=>b[1].length-a[1].length);
  const total=recs.length, open=active.length, serious=recs.filter(r=>['Major','Critical'].includes(r.severity)).length, resolved=recs.filter(r=>r.status==='Resolved').length, rate=total?Math.round(resolved/total*100):0;
  const staff=['— Select staff —',...DB.staff.filter(x=>isAdmin()||x.store===State.branch).map(x=>x.name)];

  const strikeHtml = watch.length?`<div class="card"><div class="card-head"><h3><i class="fas fa-user-shield" style="color:#b71c1c"></i>&nbsp; Staff Strike Standings</h3><span class="ch-sub">${TH}+ active = review for termination</span></div>
    <div class="card-pad"><div class="strike-grid">${watch.map(([name,vs])=>{const crit=vs.length>=TH; return `<div class="strike-card ${crit?'crit':'warn'}">
      <div class="strike-top"><b>${esc(name)}</b><span class="badge ${crit?'bad':'warn'}">${crit?'REVIEW FOR TERMINATION':'WARNING'}</span></div>
      <div class="strike-dots">${Array.from({length:TH}).map((_,i)=>`<span class="sdot ${i<vs.length?'on':''}">${i+1}</span>`).join('')}<b style="margin-left:6px">${vs.length} active</b></div>
      <div class="strike-sev">${[...new Set(vs.map(v=>v.step))].map(s=>`<span class="badge ${toneOf(s)}">${esc(s)}</span>`).join(' ')}</div></div>`;}).join('')}</div></div></div>`:'';

  const ruleCards=DB.violationRules.map(rl=>`<button type="button" class="vrule ${State.vio.rule===rl.code?'active':''}" style="--rc:${sevColor(rl.severity)}" onclick="vioPick('${rl.code}')">
    <div class="vrule-h"><span class="vrule-ic" style="background:${sevColor(rl.severity)}"><i class="fas fa-triangle-exclamation"></i></span>
      <div><div class="vrule-t">${esc(rl.title)}</div><div class="vrule-tags"><span class="chip">${esc(rl.category)}</span><span class="badge ${toneOf(rl.severity)}">${esc(rl.severity)}</span></div></div></div>
    <div class="vrule-d">${esc(rl.action)}</div></button>`).join('');

  const list=recs.slice().sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))).map(v=>`
    <div class="card vcard" style="--rc:${sevColor(v.severity)}" onclick='openDetail("violation","${esc(v.id)}")'>
      <div class="vcard-h"><i class="fas fa-triangle-exclamation" style="color:${sevColor(v.severity)}"></i><b>${esc(v.category)}</b>
        <span class="badge ${toneOf(v.severity)}">${esc(v.severity)}</span><span class="badge ${toneOf(v.step)}">${esc(v.step||'')}</span><span class="badge ${toneOf(v.status)}">${esc(v.status)}</span>
        <span class="vcard-meta">👤 ${esc(v.staffName)} · 🏪 ${esc(v.store||'')} · ${esc((v.created||'').slice(0,16))}</span></div>
      <div class="vcard-b">${esc(v.description||'')}</div></div>`).join('');

  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">⚠️</div><div><h2>Violation Rules</h2><p>Log staff rule breaches and manage the Verbal → Written → Final warning escalation.</p></div></div>
    ${strikeHtml}
    <div class="kpi-grid" style="margin-top:${strikeHtml?'16px':'0'}">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📋</div></div><div class="k-val">${total}</div><div class="k-lbl">Total violations</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">🔴</div></div><div class="k-val">${open}</div><div class="k-lbl">Open / active</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">⚠️</div></div><div class="k-val">${serious}</div><div class="k-lbl">Serious / Major</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${rate}%</div><div class="k-lbl">Resolved rate</div></div></div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>By warning step</h3></div><div class="card-pad"><div class="chart-box"><canvas id="vio-step"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>By severity</h3></div><div class="card-pad"><div class="chart-box"><canvas id="vio-sev"></canvas></div></div></div></div>
    <div class="vio-grid">
      <div class="card"><div class="card-head"><h3><i class="fas fa-pen-to-square"></i>&nbsp; Record violation</h3></div><div class="card-pad">
        <div class="rail-tip" style="margin-bottom:14px">💡 Click a rule card to auto-fill the rule, severity &amp; suggested action.</div>
        <div class="grid2">
          <div class="field"><label>Staff member <span class="req">*</span></label><select id="vio-staff" onchange="vioStaffChange()"><option value="">— Select staff —</option>${staff.filter(n=>!n.startsWith('—')).map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
          <div class="field"><label>Store</label><select id="vio-store">${(isAdmin()?DB.stores:[State.branch]).map(s=>`<option ${s===State.branch?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
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
    </div>
    <div class="section-title">Violation records</div>
    ${list||'<div class="empty">No violations recorded.</div>'}`;

  const stepG=groupCount(recs,'step'), sevG=groupCount(recs,'severity');
  mkChart('vio-step',{type:'doughnut',data:{labels:stepG.labels,datasets:[{data:stepG.data,backgroundColor:stepG.labels.map(l=>STEP_COLOR[l]||'#90A4AE'),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  mkChart('vio-sev',{type:'doughnut',data:{labels:sevG.labels,datasets:[{data:sevG.data,backgroundColor:sevG.labels.map(sevColor),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
}
function vioPick(code){ const r=DB.violationRules.find(x=>x.code===code); if(!r) return; State.vio.rule=code; State.vio.ruleTitle=r.title; State.vio.sev=r.severity;
  document.querySelectorAll('.vrule').forEach(c=>c.classList.remove('active')); event.currentTarget.classList.add('active');
  const ri=$('#vio-rule'); if(ri) ri.value=r.title; const sv=$('#vio-sev2'); if(sv) sv.value=r.severity; const ac=$('#vio-action'); if(ac&&!ac.value) ac.value=r.action; }
function vioSubmit(){
  const staff=$('#vio-staff').value, desc=$('#vio-desc').value.trim();
  if(staff.startsWith('—')||!State.vio.ruleTitle||!desc){ toast('Pick a rule, staff and description'); return; }
  const step=$('#vio-step').value;
  const id=`VIO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000+Math.random()*9000)}`;
  DB.modules.violation.records.unshift({id,created:new Date().toISOString().slice(0,16).replace('T',' '),staffName:staff,store:$('#vio-store').value,
    category:State.vio.ruleTitle,severity:$('#vio-sev2').value,step,status:step,description:desc,actionTaken:$('#vio-action').value,followUpDate:$('#vio-follow').value});
  State.vio={rule:'',sev:'Minor',step:'Verbal Discussion'}; toast(`✓ Violation logged · ${step}`); buildSidebar(); renderViolation();
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
function renderTraining(){
  setAccent('#c0392b'); setCrumb('🎓','Training Assessment','Score staff training by role & topic');
  if(!State.trn) State.trn={mode:'list',role:'',rating:'',items:[]};
  if(State.trn.mode==='new') return trnForm();
  const recs=scopedRecords('training');
  const done=recs.filter(r=>r.status==='Completed').length;
  const roles=Object.keys(DB.trainingTopics).length;
  const thisMonth=recs.filter(r=>(r.sessionDate||'').slice(0,7)===new Date().toISOString().slice(0,7)).length;
  const ratingColor=v=>(TRN_RATINGS.find(r=>r[0]===v)||['','#888','#eee']);
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🎓</div><div><h2>Training Assessment</h2><p>Run and score staff training sessions; track who is achieving each skill.</p></div>
      <div class="ph-actions"><button class="btn primary" onclick="trnNew()"><i class="fas fa-plus"></i>&nbsp; New session</button></div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🎓</div></div><div class="k-val">${recs.length}</div><div class="k-lbl">Sessions</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${done}</div><div class="k-lbl">Completed</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">📅</div></div><div class="k-val">${thisMonth}</div><div class="k-lbl">This month</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧰</div></div><div class="k-val">${roles}</div><div class="k-lbl">Roles</div></div></div>
    <div class="section-title">Sessions</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Trainee</th><th>Role</th><th>Trainer</th><th>Date</th><th>Rating</th><th>Status</th></tr></thead><tbody>
      ${recs.length?recs.map(r=>{const ri=ratingColor(r.overallRating);return `<tr onclick='openDetail("training","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><b>${esc(r.traineeName)}</b></td><td><span class="badge mute">${esc(r.traineeRole)}</span></td><td>${esc(r.trainerName||'')}</td><td>${esc(r.sessionDate||'')}</td><td>${r.overallRating?`<span class="rating-badge" style="background:${ri[2]};color:${ri[1]}">${esc(r.overallRating)}</span>`:'—'}</td><td>${badge(r.status)}</td></tr>`;}).join(''):'<tr><td colspan="7"><div class="empty">No sessions yet.</div></td></tr>'}
    </tbody></table></div></div>`;
}
function trnNew(){ State.trn={mode:'new',role:'',rating:'',items:[]}; renderTraining(); }
function trnBack(){ State.trn.mode='list'; renderTraining(); }
function trnForm(){
  setCrumb('🎓','New Training Session','Score each topic by role');
  const staff=DB.staff.map(x=>x.name);
  const roles=Object.keys(DB.trainingTopics);
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
function trnRole(role){ const c=$('#trn-topics'); if(!role||!DB.trainingTopics[role]){c.innerHTML='<div class="topics-ph">Select a role…</div>';return;}
  State.trn.role=role; let html='';
  Object.entries(DB.trainingTopics[role]).forEach(([cat,items])=>{ html+=`<div class="cat-h2">${esc(cat)}</div>`;
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
  const id=`TRN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100+Math.random()*900)}`;
  DB.modules.training.records.unshift({id,created:new Date().toISOString().slice(0,16).replace('T',' '),traineeName:name,traineeRole:role,trainerName:$('#trn-trainer').value,
    sessionDate:$('#trn-date').value,status:'Completed',overallRating:State.trn.rating||'Good',score:`${ach}/${tot}`,keyAchievements:$('#trn-ach').value,needsImprovement:$('#trn-imp').value,store:State.branch});
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
  const staff=['— Select staff —',...DB.staff.map(x=>x.name)];
  const awards=['Employee of the Month','Best Customer Service','Best Team Player','Perfect Attendance','Cleanliness Champion'];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#e7f6ee">🏆</div><div><h2>Monthly Rewards</h2><p>Decide and track monthly staff awards and goodwill amounts.</p></div>
      <div class="ph-actions"><select class="login-input" style="width:auto" onchange="rwdMonth(this.value)">${months.concat(months.includes(month)?[]:[month]).map(m=>`<option ${m===month?'selected':''}>${esc(m)}</option>`).join('')}</select></div></div>
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
        <div class="field"><label>Store</label><select id="rwd-store">${DB.stores.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Amount ($)</label><input type="number" id="rwd-amt" placeholder="100"></div>
        <div class="field full"><label>Notes</label><textarea id="rwd-notes"></textarea></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="rwdSubmit()">🏆 Award staff</button></div></div>
      <div><div class="section-title" style="margin-top:0">Awards · ${esc(month)}</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Award</th><th>Staff</th><th>$</th><th>Status</th></tr></thead><tbody>
        ${mRecs.length?mRecs.map(r=>`<tr onclick='openDetail("reward","${esc(r.id)}")'><td><span class="badge ok">${esc(r.awardType)}</span></td><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td class="num">${r.rewardAmount||0}</td><td>${badge(r.status)}</td></tr>`).join(''):'<tr><td colspan="4"><div class="empty">No awards yet this month.</div></td></tr>'}
        </tbody></table></div></div></div>
    </div>`;
}
function rwdMonth(m){ State.rwdMonth=m; renderReward(); }
function rwdSubmit(){ const staff=$('#rwd-staff').value; if(staff.startsWith('—')){toast('Select a staff member');return;}
  const month=State.rwdMonth||new Date().toISOString().slice(0,7);
  DB.modules.reward.records.unshift({id:`RWD-${month.replace('-','')}-${Math.floor(10+Math.random()*89)}`,rewardMonth:month,awardType:$('#rwd-type').value,staffName:staff,store:$('#rwd-store').value,rewardAmount:+$('#rwd-amt').value||0,status:'Proposed',created:new Date().toISOString().slice(0,16).replace('T',' ')});
  toast('🏆 Award added'); buildSidebar(); renderReward();
}

/* ============================================================ RAISE SALARY REVIEW */
function renderRaise(){
  setAccent('#6a1b9a'); setCrumb('💸','Raise Salary Review','Review & approve pay-rate changes');
  const recs=scopedRecords('raise');
  const staff=['— Select staff —',...DB.staff.map(x=>x.name)];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#f3e8fb">💸</div><div><h2>Raise Salary Review</h2><p>Track current vs proposed pay rates and approval decisions.</p></div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">📄</div></div><div class="k-val">${recs.length}</div><div class="k-lbl">Reviews</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">⏳</div></div><div class="k-val">${recs.filter(r=>r.status==='Submitted').length}</div><div class="k-lbl">Submitted</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${recs.filter(r=>r.status==='Approved').length}</div><div class="k-lbl">Approved</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">🚫</div></div><div class="k-val">${recs.filter(r=>r.status==='Declined').length}</div><div class="k-lbl">Declined</div></div></div>
    <div class="vio-grid">
      <div class="card"><div class="card-head"><h3><i class="fas fa-file-signature"></i>&nbsp; Create raise review</h3></div><div class="card-pad"><div class="grid2">
        <div class="field"><label>Staff</label><select id="rai-staff">${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label>Review month</label><input type="month" id="rai-month" value="${new Date().toISOString().slice(0,7)}"></div>
        <div class="field"><label>Current rate ($/h)</label><input type="number" step="0.5" id="rai-cur" placeholder="27.50"></div>
        <div class="field"><label>Proposed rate ($/h)</label><input type="number" step="0.5" id="rai-prop" placeholder="29.00"></div>
        <div class="field"><label>Effective date</label><input type="date" id="rai-eff"></div>
        <div class="field full"><label>Manager notes</label><textarea id="rai-notes"></textarea></div>
      </div><button class="btn primary block" style="margin-top:12px" onclick="raiSubmit()">📤 Submit review</button></div></div>
      <div><div class="section-title" style="margin-top:0">Reviews</div>
        <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Staff</th><th>Current</th><th>Proposed</th><th>Change</th><th>Status</th></tr></thead><tbody>
        ${recs.length?recs.map(r=>{const up=(+r.proposedRate)-(+r.currentRate);return `<tr onclick='openDetail("raise","${esc(r.id)}")'><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td class="num">$${r.currentRate}</td><td class="num">$${r.proposedRate}</td><td class="num" style="color:${up>=0?'#0a8a5f':'#d13030'}">${up>=0?'+':''}$${up.toFixed(2)}</td><td>${badge(r.status)}</td></tr>`;}).join(''):'<tr><td colspan="5"><div class="empty">No reviews.</div></td></tr>'}
        </tbody></table></div></div></div>
    </div>`;
}
function raiSubmit(){ const staff=$('#rai-staff').value; if(staff.startsWith('—')){toast('Select a staff member');return;}
  DB.modules.raise.records.unshift({id:`RAI-${Math.floor(100+Math.random()*899)}`,staffName:staff,store:(DB.staff.find(x=>x.name===staff)||{}).store||State.branch,reviewMonth:$('#rai-month').value,currentRate:+$('#rai-cur').value||0,proposedRate:+$('#rai-prop').value||0,effectiveDate:$('#rai-eff').value,status:'Submitted',managerNotes:$('#rai-notes').value,created:new Date().toISOString().slice(0,16).replace('T',' ')});
  toast('📤 Raise review submitted'); buildSidebar(); renderRaise();
}

/* ============================================================ BIRTHDAY GIVEAWAYS */
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
  const staff=['— Select staff —',...DB.staff.map(x=>x.name)];
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fef4e0">🎂</div><div><h2>Birthday Giveaways</h2><p>Track staff birthdays and plan their gift.</p></div></div>
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
        ${withDays.map(r=>`<tr onclick='openDetail("birthday","${esc(r.id)}")'><td><b>${esc(r.staffName)}</b><div class="cell-sub">${esc(r.store||'')}</div></td><td>${esc(r.birthday)}</td><td>${esc(r.favoriteGift||'—')}</td><td><span class="badge ${r.du<=7?'bad':r.du<=30?'warn':'mute'}">${r.du} days</span></td><td>${badge(r.status)}</td></tr>`).join('')}
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
  const ex=DB.modules.birthday.records.find(r=>r.staffName===staff);
  const rec={id:ex?ex.id:`BDY-${Math.floor(10+Math.random()*89)}`,staffName:staff,store:(DB.staff.find(x=>x.name===staff)||{}).store||State.branch,birthday:date,favoriteGift:$('#bd-gift').value,status:$('#bd-status').value,created:new Date().toISOString().slice(0,10)};
  if(ex) Object.assign(ex,rec); else DB.modules.birthday.records.unshift(rec);
  toast('🎂 Birthday saved'); buildSidebar(); renderBirthday();
}

/* ============================================================ STAFF STRUCTURE (restaurant-style) */
function renderStructure(){
  setAccent('#0e9f6e'); setCrumb('🏢','Staff Structure','Organisation chart');
  const top=DB.structure[0];
  const depts=DB.structure.slice(1).map(d=>{const [lead,...rest]=[d.head,...d.members];
    return `<div class="ssd" style="--c:${d.color}"><div class="ssd-card"><div class="ssd-title">${esc(d.dept)}</div><div class="ssd-lead">${esc(d.head.split('—')[0].trim())}</div><div class="ssd-badge">${esc((d.head.split('—')[1]||'LEAD').trim().toUpperCase())}</div></div>
      <div class="ssd-members">${d.members.map(m=>`<div class="ssd-member">${esc(m)}</div>`).join('')}</div></div>`;}).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure</h2><p>How MCQ Supermarket teams report and connect.</p></div></div>
    <div class="ss-wrap">
      <div class="ss-mgr"><div class="ss-mgr-role">${esc((top.head.split('—')[1]||'HEAD OFFICE').trim().toUpperCase())}</div><div class="ss-mgr-name">${esc(top.head.split('—')[0].trim())}</div>
        <div class="ss-mgr-sub">${top.members.map(m=>esc(m)).join(' · ')}</div></div>
      <div class="ss-line"></div>
      <div class="ss-grid">${depts}</div>
    </div>`;
}
