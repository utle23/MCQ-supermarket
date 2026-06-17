/* ============================================================
   MCQ Ops Hub — App engine v2
   Login + FaceID + 30-min auto-logout + grouped nav +
   config-driven modules + real checklist + HR/management pages.
   ============================================================ */
'use strict';

const State = { account:null, role:'store', branch:'Morley', route:{mod:'home',tab:null}, charts:[], idleTimer:null };
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin = ()=> State.account && (State.account.role==='admin' || State.account.role==='super');
const isSuper = ()=> State.account && State.account.role==='super';
function logoHTML(cls){ return `<span class="mcq-logo ${cls||''}"><img src="assets/mcq-logo-exact.png" alt="MCQ Supermarket logo"></span>`; }

/* ---------- tones / colours ---------- */
const TONE_HEX={ok:'#10b981',warn:'#f59e0b',bad:'#ef4444',info:'#3b82f6',mute:'#94a3b8'};
const PALETTE=['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#14b8a6','#f43f5e','#a855f7','#0ea5e9'];
const toneOf=l=>TONES[l]||'mute';
const toneHex=l=>TONE_HEX[toneOf(l)];

/* ---------- current user / scope ---------- */
function me(){
  const a=State.account||{name:'Guest',role:'staff',branch:'Morley'};
  const roleLabel = a.role==='super'?'Super Admin':a.role==='admin'?'Store Admin':'Store Staff';
  return { name:a.name, role:roleLabel,
    scope:isSuper()?'All stores':a.branch, store:a.branch, initials:a.initials||'?', kind:isAdmin()?'ho':'store' };
}
function scopedRecords(mod){
  const m=DB.modules[mod]; if(!m||!m.records) return [];
  if(isSuper()) return m.records;                 // super admin: every store
  const s=State.branch; return m.records.filter(r=>!r.store || r.store===s);  // admin + staff: own store only
}

/* ============================================================ LOGIN */
function showLogin(notice){
  document.getElementById('boot-splash')?.remove();
  document.body.classList.add('on-login');
  $('#app').style.display='none';
  const branches = DB.branches.map(b=>`<option value="${esc(b)}">MCQ ${esc(b)}</option>`).join('');
  $('#login-root').style.display='flex';
  $('#login-root').innerHTML = `
    <div class="login-bg"><span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span><span class="orb o4"></span></div>
    <div class="login-card">
      <div class="login-brand">${logoHTML('lg')}
        <div class="lb-sub">Supermarket Operations Platform</div>
      </div>
      <h1 class="login-h">Welcome back</h1>
      <p class="login-p">Sign in to your store operations workspace.</p>
      ${notice?`<div class="login-note"><i>⏱️</i> ${esc(notice)}</div>`:''}
      <div class="seg" id="login-mode">
        <button class="seg-btn active" data-mode="staff">🧑‍💼 Staff</button>
        <button class="seg-btn" data-mode="admin">🛡️ Admin</button>
        <button class="seg-btn" data-mode="super">👑 Super</button>
      </div>
      <label class="login-lbl">Store / Branch</label>
      <select id="login-branch" class="login-input">${branches}</select>
      <label class="login-lbl">Password</label>
      <div class="login-pw">
        <input id="login-pw" class="login-input" type="password" placeholder="Enter password" autocomplete="off">
        <button class="pw-eye" onclick="togglePw()">👁️</button>
      </div>
      <div id="login-err" class="login-err"></div>
      <button class="login-btn" onclick="doLogin()">Sign In →</button>
      <div class="login-or"><span>or</span></div>
      <button class="faceid-btn" onclick="faceIdLogin()">
        <span class="fid-ic">🪪</span> Sign in with Face ID
      </button>
      <button class="faceid-enroll" onclick="faceEnroll()">＋ Set up Face ID for this branch</button>
      <div class="fid-list" id="fid-list"></div>
      <div class="login-hint" id="login-hint"></div>
      <div class="login-feats">
        <span>✅ Checklists</span><span>📷 Photo proof</span><span>📊 Analytics</span><span>🪪 Face ID</span>
      </div>
    </div>
    <!-- FaceID scanner modal -->
    <div id="fid-modal" class="fid-modal"><div class="fid-box">
      <div class="fid-ring"><video id="fid-video" autoplay playsinline muted></video><div class="fid-scan"></div></div>
      <div class="fid-title">Scanning face…</div>
      <div class="fid-sub" id="fid-sub">Look at the camera</div>
      <button class="btn" onclick="closeFid()">Cancel</button>
    </div></div>`;
  $$('#login-mode .seg-btn').forEach(b=>b.onclick=()=>{
    $$('#login-mode .seg-btn').forEach(x=>x.classList.toggle('active',x===b));
    updateLoginHint();
  });
  $('#login-branch').addEventListener('change',updateLoginHint);
  $('#login-pw').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  updateLoginHint();
  if(window.faceRefreshList) faceRefreshList();
}
function loginMode(){ return $('#login-mode .seg-btn.active').dataset.mode; }
function togglePw(){ const p=$('#login-pw'); p.type=p.type==='password'?'text':'password'; }
function loginFail(m){ const e=$('#login-err'); if(e) e.textContent='❌ '+m; const c=$('.login-card'); if(c){ c.classList.add('shake'); setTimeout(()=>c.classList.remove('shake'),450); } }
function updateLoginHint(){ const el=$('#login-hint'); if(!el) return; const mode=loginMode(), branch=$('#login-branch')?.value;
  el.innerHTML = mode==='super' ? `Super Admin password: <b>${esc(DB.auth.superAdminPassword)}</b> · all stores + compare`
    : mode==='admin' ? `Admin password: <b>${esc(DB.auth.adminPassword)}</b> · this store only`
    : `MCQ ${esc(branch||'')} staff password: <b>${esc(DB.auth.branchPasswords[branch]||'—')}</b>`; }
function doLogin(){
  const pw=$('#login-pw').value.trim(), branch=$('#login-branch').value, mode=loginMode();
  $('#login-err').textContent='';
  if(mode==='super'){
    if(pw===DB.auth.superAdminPassword) return loginAs('super',branch);
    return loginFail('Incorrect super admin password.');
  }
  if(mode==='admin'){
    if(pw===DB.auth.adminPassword) return loginAs('admin',branch);
    return loginFail('Incorrect admin password.');
  }
  // staff: must match THIS branch's password
  if(pw===DB.auth.branchPasswords[branch]) return loginAs('staff',branch);
  if(pw===DB.auth.adminPassword) return loginFail('That is the admin password — switch to the Admin tab.');
  loginFail(`Wrong password for MCQ ${branch}.`);
}
function loginAs(role, branch){
  const name = role==='super' ? 'Head Office' : role==='admin' ? (branch+' Admin') : (branch+' Staff');
  const initials = role==='super' ? 'HO' : role==='admin' ? branch.slice(0,2).toUpperCase() : branch.slice(0,2).toUpperCase();
  State.account={ name, role, branch, initials };
  State.branch=branch; State.role=role==='staff'?'store':'ho';
  try{ sessionStorage.setItem('mcq_acct', JSON.stringify(State.account)); }catch(e){}
  enterApp();
}
function enterApp(){
  document.getElementById('boot-splash')?.remove();
  document.body.classList.remove('on-login');
  document.body.className = 'role-'+State.role;
  $('#login-root').style.display='none';
  $('#app').style.display='grid';
  if(!location.hash || location.hash==='#') location.hash='#/home'; else render();
  buildTopbar(); buildSidebar(); render();
  startIdleWatch();
}
function logout(reason){
  State.account=null; try{ sessionStorage.removeItem('mcq_acct'); }catch(e){}
  stopIdleWatch();
  showLogin(reason);
}

/* Face ID — REAL device biometric via WebAuthn (Face ID / Touch ID / Windows Hello) */
async function faceIdLogin(){
  const modal=$('#fid-modal'), sub=$('#fid-sub'), title=$('.fid-title');
  if(!window.MCQFace){ loginFail('Face ID module not loaded'); return; }
  modal.classList.add('open'); if(title) title.textContent='Face ID / Touch ID';
  if(!MCQFace.list().length){ if(sub) sub.textContent='No Face ID set up on this device yet'; setTimeout(closeFid,1900);
    toast('Set up Face ID first: pick your branch, enter its password, then “Set up Face ID”.'); return; }
  if(sub) sub.textContent='Follow the Face ID / Touch ID prompt on your device…';
  try{
    const m=await MCQFace.login();
    if(sub) sub.innerHTML='✅ Verified — '+esc(m.label||m.branch);
    setTimeout(()=>{ closeFid(); loginAs(m.role, m.branch); }, 650);
  }catch(e){ if(sub) sub.textContent='❌ '+((e&&e.message)||'Face ID failed'); setTimeout(closeFid,2200); }
}
function closeFid(){ const m=$('#fid-modal'); if(m) m.classList.remove('open');
  if(State._fidStream){ State._fidStream.getTracks().forEach(t=>t.stop()); State._fidStream=null; } }

/* ============================================================ AUTO-LOGOUT (30 min idle) */
function startIdleWatch(){
  stopIdleWatch();
  const ms=(DB.auth.idleMinutes||30)*60000;
  State._lastActive=Date.now();
  const bump=()=>{ State._lastActive=Date.now(); };
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev=>document.addEventListener(ev,bump,{passive:true}));
  State._bump=bump;
  State.idleTimer=setInterval(()=>{
    const idle=Date.now()-State._lastActive;
    const left=Math.max(0,Math.ceil((ms-idle)/60000));
    const ind=$('#idle-ind'); if(ind) ind.textContent=left+'m';
    if(idle>=ms) logout('You were signed out after 30 minutes of inactivity.');
  },15000);
}
function stopIdleWatch(){ if(State.idleTimer) clearInterval(State.idleTimer); State.idleTimer=null;
  if(State._bump){ ['mousemove','keydown','click','scroll','touchstart'].forEach(ev=>document.removeEventListener(ev,State._bump)); } }

/* ============================================================ SIDEBAR */
function buildSidebar(){
  let html = navLink('home','fa-gauge-high','Dashboard','',true);
  DB.navGroups.forEach(g=>{
    if(g.admin && !isAdmin()) return;
    const items = g.items.filter(id=>{
      const m=DB.modules[id]||DB.customPages[id];
      if(!m) return false;
      if(m.admin && !isAdmin()) return false;
      return true;
    });
    if(!items.length) return;
    html += `<div class="nav-group" data-g="${g.id}">
      <button class="nav-head" onclick="toggleGroup(this)"><i class="fas ${g.icon} fa-fw"></i><span>${esc(g.label)}</span><i class="fas fa-chevron-down chev"></i></button>
      <div class="nav-body">${items.map(id=>navItemFor(id)).join('')}</div></div>`;
  });
  $('#nav').innerHTML = html;
  $$('#nav .nav-item').forEach(el=>el.onclick=()=>{ go(el.dataset.mod); if(window.innerWidth<=860) closeSidebarM(); });
  // open group containing active, restore saved
  const active=State.route.mod;
  $$('#nav .nav-group').forEach(g=>{ if($(`.nav-item[data-mod]`,g) && [...g.querySelectorAll('.nav-item')].some(a=>a.dataset.mod===active)) g.classList.add('open','has-active'); });
  paintActive();
}
function navItemFor(id){
  const m=DB.modules[id], c=DB.customPages[id];
  if(m){ const cnt=openCount(id); return navItem(id,m.icon,m.short||m.label, cnt?`<span class="count">${cnt}</span>`:''); }
  if(c){ return navItem(id,c.icon,c.label,''); }
  return '';
}
function navLink(mod,faIcon,label,extra,solo){
  return `<a class="nav-item ${solo?'solo':''}" data-mod="${mod}"><span class="ic"><i class="fas ${faIcon}"></i></span><span class="lbl">${esc(label)}</span>${extra}</a>`;
}
function navItem(mod,emoji,label,extra){
  return `<a class="nav-item" data-mod="${mod}"><span class="ic">${emoji}</span><span class="lbl">${esc(label)}</span>${extra}</a>`;
}
function toggleGroup(btn){ btn.closest('.nav-group').classList.toggle('open'); }
function openCount(mod){
  const m=DB.modules[mod]; if(!m||!m.records) return 0;
  const recs=scopedRecords(mod);
  if(mod==='delivery') return recs.filter(r=>r.status==='Submitted').length;
  const closed=['Closed','Cancelled','Store Confirmed','Resolved','Paid','Given','Approved','Declined','Completed'];
  return recs.filter(r=>!closed.includes(r.status)).length;
}
function paintActive(){ $$('#nav .nav-item').forEach(el=>el.classList.toggle('active', el.dataset.mod===State.route.mod)); }

/* ============================================================ TOPBAR */
function buildTopbar(){
  const u=me();
  $('#topbar-right').innerHTML = `
    <span class="tb-badge"><i class="fas fa-store"></i> ${esc(State.branch)}</span>
    <span class="tb-badge"><i class="fas fa-clock"></i> idle <b id="idle-ind">30m</b></span>
    <span class="tb-badge ${isAdmin()?'badge-admin':''}"><i class="fas ${isAdmin()?'fa-shield-halved':'fa-user'}"></i> ${isAdmin()?'Admin':'Staff'}</span>
    <div class="user-chip"><div class="avatar">${esc(u.initials)}</div>
      <div><div class="u-name">${esc(u.name)}</div><div class="u-role">${esc(u.role)}</div></div></div>
    <button class="logout" onclick="logout()" title="Logout"><i class="fas fa-right-from-bracket"></i></button>`;
}

/* ============================================================ ROUTER */
function go(mod,tab){ location.hash = mod==='home'?'#/home':`#/${mod}${tab?'/'+tab:''}`; }
function defaultTab(){ return isAdmin()?'overview':'records'; }
function parseHash(){ const p=(location.hash.replace(/^#\/?/,'')||'home').split('/'); return {mod:p[0]||'home',tab:p[1]||null}; }
function render(){
  if(!State.account){ showLogin(); return; }
  State.route=parseHash();
  destroyCharts(); closeDrawer();
  const mod=State.route.mod;
  buildSidebar();
  if(mod==='home') return isAdmin()?renderHome():renderStaffHome();
  if(DB.customPages[mod]) return window[DB.customPages[mod].render](DB.customPages[mod]);
  if(mod==='checklist') return renderChecklist();
  if(!DB.modules[mod]){ location.hash='#/home'; return; }
  renderModule(mod, State.route.tab||defaultTab());
  window.scrollTo(0,0);
}

/* ============================================================ HOME */
function renderHome(){
  setAccent('#4f46e5'); setCrumb('🏠','Dashboard',`${DB.brand.org} · ${isAdmin()?'All stores':State.branch}`);
  const u=me();
  let totalOpen=0,critical=0,records=0;
  DB.order.forEach(id=>{ totalOpen+=openCount(id); records+=scopedRecords(id).length;
    critical+=scopedRecords(id).filter(r=>['Critical','Major'].includes(r.severity)||r.priority==='Critical').length; });
  const stores=isAdmin()?DB.stores.length:1;
  const opsTiles = DB.order.map(id=>tileFor(id)).join('');
  const hrTiles = ['violation','reward','training','birthday'].map(id=>tileFor(id)).join('');
  const feed = recentFeed().map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div>
    <div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('');
  $('#content').innerHTML = `
    <div class="hero"><div class="glow">${isAdmin()?'🏢':'🧑‍💼'}</div>
      <h2>Hi, ${esc(u.name.split(' ')[0])} 👋</h2>
      <p>${isAdmin()?'Cross-store command centre — operations, staff, compliance and people risk in real time.':'Your store workspace — run checklists and log issues fast.'}</p>
      <div class="hero-stats">
        <div class="hs"><b>${stores}</b><span>${stores>1?'Stores':'Store'}</span></div>
        <div class="hs"><b>${totalOpen}</b><span>Open items</span></div>
        <div class="hs"><b>${critical}</b><span>Critical / Major</span></div>
        <div class="hs"><b>${records}</b><span>Records</span></div>
      </div></div>
    ${isSuper()?superHomeBlock():''}
    <div class="section-title">Daily Operations</div>
    <div class="tiles">${opsTiles}</div>
    <div class="section-title">Staff & HR</div>
    <div class="tiles">${hrTiles}</div>
    <div class="split-2">
      <div class="card"><div class="card-head"><h3>Recent activity</h3><span class="ch-sub">Across modules</span></div><div class="feed">${feed}</div></div>
      <div class="card"><div class="card-head"><h3>Open items by module</h3></div><div class="card-pad"><div class="chart-box"><canvas id="home-chart"></canvas></div></div></div>
    </div>`;
  const labels=DB.order.map(id=>DB.modules[id].short), data=DB.order.map(id=>openCount(id)), colors=DB.order.map(id=>DB.modules[id].accent);
  mkChart('home-chart',{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:8,maxBarThickness:38}]},options:baseOpts({legend:false})});
}
/* super-admin only: cross-store load & risk comparison */
function superCrossStore(){
  const closed=['Closed','Cancelled','Resolved','Store Confirmed','Completed'];
  return DB.stores.map(store=>{ let open=0,crit=0,recs=0;
    DB.order.forEach(id=>{ const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if(r.store!==store) return; recs++;
      if(!closed.includes(r.status)) open++;
      if(['Critical','Major'].includes(r.severity)||r.priority==='Critical') crit++; }); });
    return {store,open,crit,recs};
  }).sort((a,b)=>b.open-a.open);
}
function superHomeBlock(){
  const rows=superCrossStore(); const maxOpen=Math.max(1,...rows.map(r=>r.open));
  return `<div class="section-title">🏪 Cross-store overview <span class="badge bad" style="margin-left:8px">Super Admin</span></div>
    <div class="card"><div class="card-head"><h3>All stores — open load &amp; risk</h3><span class="ch-sub" style="margin-right:auto">Highest open load first</span>${exportBtns('super-store-table','All Stores Overview')}</div>
      <div class="table-wrap"><table class="grid" id="super-store-table"><thead><tr><th>Store</th><th>Open items</th><th>Critical / Major</th><th>Total records</th><th>Open load</th></tr></thead><tbody>
      ${rows.map(r=>`<tr onclick="go('analytics')"><td><b>${esc(r.store)}</b></td><td class="num">${r.open}</td><td class="num">${r.crit?`<span class="badge bad">${r.crit}</span>`:'0'}</td><td class="num">${r.recs}</td><td><span class="pbar" style="display:inline-flex;width:130px;vertical-align:middle"><i style="width:${Math.round(r.open/maxOpen*100)}%;background:#4f46e5"></i></span></td></tr>`).join('')}
      </tbody></table></div></div>`;
}
function tileFor(id){
  const m=DB.modules[id]; const open=openCount(id);
  return `<div class="tile" style="--accent:${m.accent};--accent-soft:${soft(m.accent)}" onclick="go('${id}')">
    <span class="t-bar"></span>
    <div class="t-head"><div class="t-ic">${m.icon}</div><div><div class="t-grp">${esc(groupLabelOf(id))}</div><div class="t-name">${esc(m.label)}</div></div></div>
    <div class="t-desc">${esc(m.desc)}</div>
    <div class="t-foot"><div class="t-metric"><b style="color:${m.accent}">${open}</b><span>open</span></div><span class="t-go">Open <span>→</span></span></div></div>`;
}
function groupLabelOf(id){ const g=DB.navGroups.find(g=>g.items.includes(id)); return g?g.label:''; }
function recentFeed(){
  const items=[];
  DB.order.concat(['violation','reward','training','issue']).forEach(id=>{ const m=DB.modules[id]; if(!m) return;
    scopedRecords(id).forEach(r=>items.push({accent:m.accent,icon:m.icon,sortKey:(r.created||r.date||''),
      title:`${m.short}: ${r.id}`,sub:`${r.store||''} · ${truncate(r.summary||r.issue||r.shortDescription||r.title||r.category||r.staffName||r.equipment||'',60)}`,time:relTime(r.created||r.date)})); });
  return items.sort((a,b)=>String(b.sortKey).localeCompare(String(a.sortKey))).slice(0,8);
}

/* ============================================================ GENERIC MODULE (form/records/overview) */
function renderModule(modId,tab){
  const m=DB.modules[modId];
  if(tab==='new' && m.noNew){ go('issue'); return; }
  setAccent(m.accent); setCrumb(m.icon,m.label,tabLabel(tab));
  let tabs = isAdmin()? [['overview','📊','Overview'],['records','📋','Records & Review'],['new','➕','New']]
                      : [['records','📋','My Records'],['new','➕','New']];
  if(m.noNew) tabs=tabs.filter(t=>t[0]!=='new');
  const tabBar=`<div class="seg seg-light">${tabs.map(([t,ic,l])=>`<button class="seg-btn ${t===tab?'active':''}" onclick="go('${modId}','${t}')">${ic} ${l}</button>`).join('')}</div>`;
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">${m.icon}</div>
    <div><h2>${esc(m.label)}</h2><p>${esc(m.desc)}</p></div><div class="ph-actions">${tabBar}</div></div><div id="view"></div>`;
  if(tab==='new') renderForm(m); else if(tab==='overview') renderOverview(m); else renderRecords(m);
}
function tabLabel(tab){ return tab==='new'?'New entry':tab==='overview'?'Overview':isAdmin()?'Records & review':'My records'; }

function renderRecords(m){
  const sevs=m.severities.length?['All',...m.severities]:null;
  const stat=['All',...m.statuses];
  const storeOpts=isAdmin()?['All stores',...DB.stores]:[State.branch];
  $('#view').innerHTML=`
    <div class="toolbar"><span class="count-chip" id="rec-count">…</span>
      <div class="filter"><label>Store</label><select id="f-store" ${isAdmin()?'':'disabled'}>${opts(storeOpts)}</select></div>
      <div class="filter"><label>Status</label><select id="f-status">${opts(stat)}</select></div>
      ${sevs?`<div class="filter"><label>${m.id==='maintenance'?'Priority':'Severity'}</label><select id="f-sev">${opts(sevs)}</select></div>`:''}
      <div class="filter f-daterange"><label>Date</label><input type="date" id="f-from" title="From"><span>→</span><input type="date" id="f-to" title="To"></div>
      <div class="filter search"><label>Search</label><input id="f-q" placeholder="Search…"></div>
      <div class="tb-spacer"></div>
      ${exportBtns('rec-table',m.label)}
      <button class="btn primary sm" onclick="go('${m.noNew?'issue':m.id}'${m.noNew?'':",'new'"})">➕ ${m.noNew?'Report':'New'}</button></div>
    <div class="card"><div class="card-head"><h3>${isAdmin()?'Records':'My records'}</h3><span class="ch-sub">${isAdmin()?'Click a row to review & update.':'Click a row for details.'} · Newest first</span></div>
      <div class="table-wrap"><table class="grid" id="rec-table"><thead><tr>${m.columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody id="rec-body"></tbody></table></div></div>`;
  ['f-store','f-status','f-sev','f-q','f-from','f-to'].forEach(id=>{const el=$('#'+id); if(el) el.oninput=()=>drawRows(m);});
  drawRows(m);
}
function drawRows(m){
  const fS=$('#f-store')?.value,fSt=$('#f-status')?.value,fSe=$('#f-sev')?.value,fQ=($('#f-q')?.value||'').toLowerCase();
  const fFrom=$('#f-from')?.value||'',fTo=$('#f-to')?.value||'';
  let rows=scopedRecords(m.id).slice().sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
  rows=rows.filter(r=>{
    if(fS&&!fS.startsWith('All')&&r.store!==fS) return false;
    if(fSt&&fSt!=='All'&&r.status!==fSt) return false;
    if(fSe&&fSe!=='All'&&(r.severity||r.priority)!==fSe) return false;
    const d=String(r.created||r.date||'').slice(0,10);
    if(fFrom&&(!d||d<fFrom)) return false;
    if(fTo&&(!d||d>fTo)) return false;
    if(fQ&&!Object.values(r).join(' ').toLowerCase().includes(fQ)) return false;
    return true;
  });
  $('#rec-count').innerHTML=`📋 ${rows.length} record${rows.length!==1?'s':''}`;
  const body=$('#rec-body');
  if(!rows.length){ body.innerHTML=`<tr><td colspan="${m.columns.length}"><div class="empty"><div class="e-ic">🗂️</div>No records match.</div></td></tr>`; return; }
  body.innerHTML=rows.map(r=>`<tr onclick='openDetail("${m.id}","${esc(r.id)}")'>${m.columns.map(c=>`<td class="${c.kind==='num'?'num':''}">${cell(r,c)}</td>`).join('')}</tr>`).join('');
}
function cell(r,c){
  const v=r[c.key];
  switch(c.kind){
    case 'id': return `<div class="cell-id">${esc(r.id)}</div>${r.created?`<div class="cell-sub">${esc(r.created)}</div>`:''}`;
    case 'badge': return v?badge(v):'—';
    case 'wrap': return `<div class="wrap">${esc(v||'—')}</div>`;
    case 'num': return esc(v??'—');
    case 'dwell': return `${esc(v)} min`;
    case 'emp': return `<div class="emp-name">${esc(r.employee)}</div><div class="emp-id">#${esc(r.staffId||'')}</div>`;
    case 'progress': return `<div class="pwrap"><span class="pbar"><i style="width:${v}%"></i></span><b>${v}%</b></div>`;
    default: return esc(v||'—');
  }
}
function badge(v){ return `<span class="badge ${toneOf(v)}"><span class="bdot"></span>${esc(v)}</span>`; }

function renderOverview(m){
  const recs=scopedRecords(m.id),a=m.analytics;
  const kpiHtml=a.kpis.map(k=>`<div class="kpi tone-${k.tone||'info'}"><div class="k-top"><div class="k-ic">${m.icon}</div></div><div class="k-val">${calcKpi(recs,k)}</div><div class="k-lbl">${esc(k.label)}</div></div>`).join('');
  const cols=a.charts.length>=3?'cols-3':'cols-2';
  const chartCards=a.charts.map((c,i)=>`<div class="card"><div class="card-head"><h3>${esc(c.title)}</h3></div><div class="card-pad"><div class="chart-box"><canvas id="ovc-${i}"></canvas></div></div></div>`).join('');
  $('#view').innerHTML=`<div class="kpi-grid">${kpiHtml}</div><div class="chart-grid ${cols}">${chartCards}</div>
    <div class="section-title">By store</div><div class="card"><div class="table-wrap">${storeBreakdown(recs)}</div></div>`;
  a.charts.forEach((c,i)=>{ const g=groupCount(recs,c.group); const isD=c.type==='doughnut';
    const colors=g.labels.map((l,idx)=>(m.severities.includes(l)||m.statuses.includes(l)||TONES[l])?toneHex(l):PALETTE[idx%PALETTE.length]);
    mkChart('ovc-'+i,{type:c.type,data:{labels:g.labels,datasets:[{data:g.data,backgroundColor:colors,borderRadius:isD?0:8,maxBarThickness:34,...(isD?{borderColor:'#fff',borderWidth:3,hoverOffset:6}:{})}]},options:baseOpts({indexAxis:c.horizontal?'y':'x',legend:isD,donut:isD})}); });
}
function storeBreakdown(recs){
  const closed=['Closed','Cancelled','Store Confirmed','Resolved','Paid','Given'];
  const stores=[...new Set(recs.map(r=>r.store).filter(Boolean))].sort();
  const rows=stores.map(s=>{ const rs=recs.filter(r=>r.store===s);
    const open=rs.filter(r=>!closed.includes(r.status)).length;
    const crit=rs.filter(r=>['Critical','Major'].includes(r.severity)||r.priority==='Critical').length;
    return `<tr><td><b>${esc(s)}</b></td><td class="num">${rs.length}</td><td class="num">${open}</td><td class="num">${crit?`<span class="badge bad"><span class="bdot"></span>${crit}</span>`:'0'}</td></tr>`;}).join('');
  return `<table class="grid"><thead><tr><th>Store</th><th>Total</th><th>Open</th><th>Critical/Major</th></tr></thead><tbody>${rows||'<tr><td colspan=4><div class="empty">No data.</div></td></tr>'}</tbody></table>`;
}
function calcKpi(recs,k){
  const closed=['Closed','Cancelled','Store Confirmed'];
  switch(k.calc){
    case 'count': return recs.length;
    case 'countWhere': return recs.filter(r=>r[k.field]===k.value).length;
    case 'countWhereIn': return recs.filter(r=>k.values.includes(r[k.field])).length;
    case 'countWhereNotIn': return recs.filter(r=>!k.values.includes(r[k.field])).length;
    case 'countWhereGt': return recs.filter(r=>Number(r[k.field])>k.value).length;
    case 'sum': return recs.reduce((s,r)=>s+(Number(r[k.field])||0),0);
    case 'avg': return recs.length?Math.round(recs.reduce((s,r)=>s+(Number(r[k.field])||0),0)/recs.length):0;
    case 'custom':
      if(k.fn==='criticalOpen') return recs.filter(r=>r.priority==='Critical'&&!closed.includes(r.status)).length;
      if(k.fn==='highOpen') return recs.filter(r=>r.priority==='High'&&!closed.includes(r.status)).length;
      return 0;
    default: return 0;
  }
}
function groupCount(recs,field){ const map={}; recs.forEach(r=>{const v=r[field]||'—';map[v]=(map[v]||0)+1;}); const e=Object.entries(map).sort((a,b)=>b[1]-a[1]); return {labels:e.map(x=>x[0]),data:e.map(x=>x[1])}; }

/* ============================================================ FORM */
function renderForm(m){
  const sections=m.form.sections.map((s,si)=>`<div class="form-section"><div class="fs-title"><span class="fs-num">${si+1}</span>${esc(s.title)}</div>${s.hint?`<div class="fs-hint">${esc(s.hint)}</div>`:''}<div class="grid2">${s.fields.map(field).join('')}</div></div>`).join('');
  $('#view').innerHTML=`<div class="form-shell"><form class="card" id="entry-form" onsubmit="submitForm(event,'${m.id}')">${sections}
    <div class="form-section" style="display:flex;gap:12px;justify-content:flex-end"><button type="reset" class="btn">Clear</button><button type="submit" class="btn primary">✓ Submit ${esc(m.short)}</button></div></form>
    <aside class="form-rail"><div class="card rail-card"><h4>${m.icon} About</h4><p style="color:var(--muted);font-size:12.5px;margin:0 0 10px">${esc(m.desc)}</p>
      <div class="rail-tip">💡 Fields with <b style="color:var(--bad)">*</b> are required. New records start as <b>${esc(m.statuses[0])}</b>.</div></div>
      <div class="card rail-card"><h4>Workflow</h4><ul>${m.statuses.slice(0,6).map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div></aside></div>`;
  bindFieldUx();
}
function field(f){
  const req=f.required?'<span class="req">*</span>':''; const hint=f.hint?`<div class="fhint">${esc(f.hint)}</div>`:'';
  let ctrl='';
  const rq=f.required?' data-req="1"':'';
  if(f.type==='select') ctrl=`<select name="${f.key}"${rq}><option value="">-- Select --</option>${opts(f.options)}</select>`;
  else if(f.type==='textarea') ctrl=`<textarea name="${f.key}"${rq} placeholder="${esc(f.placeholder||'')}"></textarea>`;
  else if(f.type==='radio') ctrl=`<div class="radios">${f.options.map(o=>`<label class="radio-pill"><input type="radio" name="${f.key}" value="${esc(o)}">${esc(o)}</label>`).join('')}</div>`;
  else if(f.type==='checks') ctrl=`<div class="checks">${f.options.map(o=>`<label class="check-row"><input type="checkbox" name="${f.key}" value="${esc(o)}">${esc(o)}</label>`).join('')}</div>`;
  else if(f.type==='checkbox') return `<div class="field ${f.full?'full':''}"><label class="check-row"><input type="checkbox" name="${f.key}">${esc(f.label)}</label>${hint}</div>`;
  else ctrl=`<input type="${f.type||'text'}" name="${f.key}"${rq} placeholder="${esc(f.placeholder||'')}">`;
  return `<div class="field ${f.full?'full':''}"><label>${esc(f.label)}${req}</label>${ctrl}${hint}</div>`;
}
function bindFieldUx(){
  $$('#entry-form .radio-pill input').forEach(inp=>inp.onchange=()=>{$$(`#entry-form input[name="${inp.name}"]`).forEach(i=>i.closest('.radio-pill').classList.remove('checked'));inp.closest('.radio-pill').classList.add('checked');});
  $$('#entry-form .check-row input').forEach(inp=>inp.onchange=()=>inp.closest('.check-row').classList.toggle('checked',inp.checked));
}
function submitForm(e,modId){
  e.preventDefault();
  const form=e.target; let bad=null;
  form.querySelectorAll('[data-req]').forEach(el=>{ el.classList.remove('invalid'); if(!el.value){ el.classList.add('invalid'); bad=bad||el; }});
  if(bad){ toast('Please complete the required fields'); bad.classList.add('shake'); setTimeout(()=>bad.classList.remove('shake'),450); bad.scrollIntoView({behavior:'smooth',block:'center'}); return; }
  const m=DB.modules[modId]; const fd=new FormData(e.target); const obj={};
  fd.forEach((v,k)=>{obj[k]=obj[k]?obj[k]+', '+v:v;});
  const id=`${m.idPrefix}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000+Math.random()*9000)}`;
  const rec=Object.assign({id,created:new Date().toISOString().slice(0,16).replace('T',' '),store:obj.store||State.branch,status:m.statuses[0],
    severity:obj.severity||obj.priority,priority:obj.priority,summary:obj.whatHappened||obj.shortDescription||obj.issueDescription||obj.description||obj.caseDetails,
    issue:obj.issueDescription,shortDescription:obj.shortDescription,category:obj.category||obj.issueCategory||obj.concernCategory,
    equipment:obj.equipmentName,type:obj.incidentType,employee:obj.employeeName,step:obj.step||obj.disciplinaryStep,department:obj.department,age:0},obj);
  m.records.unshift(rec); e.target.reset();
  toast(`${m.short} submitted — ${id}`); buildSidebar(); go(modId,'records');
}

/* ============================================================ DETAIL DRAWER */
function openDetail(modId,id){
  const m=DB.modules[modId]; const r=m.records.find(x=>x.id===id); if(!r) return;
  const skip=new Set(['id','created','age','photo']);
  const rows=Object.entries(r).filter(([k,v])=>!skip.has(k)&&v!==''&&v!=null).map(([k,v])=>{
    const isB=m.severities.includes(v)||m.statuses.includes(v)||TONES[v];
    return `<dt>${esc(prettyKey(k))}</dt><dd>${isB?badge(v):esc(v)}</dd>`;}).join('');
  const photoBlk=r.photo?`<div class="section-title" style="margin-top:4px">📷 Photo</div><a href="${imgSrc(r.photo)}" target="_blank" rel="noopener"><img src="${imgSrc(r.photo)}" style="max-width:100%;border-radius:12px;border:1px solid var(--line);margin-bottom:14px"></a>`:'';
  const canEdit=isAdmin();
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">${m.icon}</div>
    <div><div style="font-weight:840;font-size:16px">${esc(r.id)}</div><div style="color:var(--muted);font-size:12.5px">${esc(m.label)} · ${esc(r.store||'')} ${r.created?'· '+esc(r.created):''}</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${r.severity?badge(r.severity):''}${r.priority&&r.priority!==r.severity?badge(r.priority):''}${r.step?badge(r.step):''}${r.status?badge(r.status):''}</div></div>
    <button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body">
    ${photoBlk}
    ${canEdit?`<div class="section-title" style="margin-top:4px">Edit record <span class="badge info" style="margin-left:6px">Admin · full access</span></div>
      <div class="grid2">${editFields(r,m)}</div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primary" style="flex:1" onclick="recSaveAll('${modId}','${esc(id)}')">💾 Save changes</button>
        <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="recDelete('${modId}','${esc(id)}')"><i class="fas fa-trash"></i>&nbsp; Delete</button>
      </div>`
      :`<dl class="dl">${rows}</dl><div class="rail-tip" style="margin-top:20px">👀 Viewing as Staff. Head Office can edit &amp; close this record.</div>`}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function reviewField(f,r){
  const val=r[f.key]!=null?r[f.key]:''; let ctrl;
  if(f.type==='select') ctrl=`<select id="d-${f.key}"><option value=""></option>${(f.options||[]).map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(f.type==='textarea') ctrl=`<textarea id="d-${f.key}" placeholder="${esc(f.label)}…">${esc(val)}</textarea>`;
  else ctrl=`<input id="d-${f.key}" type="${f.type||'text'}" value="${esc(val)}" placeholder="${esc(f.label)}…">`;
  return `<div class="field ${f.full?'full':''}"><label>${esc(f.label)}</label>${ctrl}</div>`;
}
function reviewSave(modId,id){
  const m=DB.modules[modId]; const r=m.records.find(x=>x.id===id);
  (m.review||[{key:'status'}]).forEach(f=>{const el=document.getElementById('d-'+f.key); if(el&&el.value!=='') r[f.key]=el.value;});
  closeDrawer(); toast(`${id} updated`); buildSidebar(); if(State.route.mod===modId) render();
}
/* admin full-edit: render an editable control for every field of the record */
function editFields(r,m){
  const skip=new Set(['id','created','age','icon','short','mod','photo']);
  return Object.keys(r).filter(k=>!skip.has(k)).map(k=>{
    const v=r[k]; let f={key:k,label:prettyKey(k)};
    if((m.statuses||[]).includes(v)) f.type='select',f.options=m.statuses;
    else if((m.severities||[]).includes(v)) f.type='select',f.options=m.severities;
    else if((DB.warningSteps||[]).includes(v)) f.type='select',f.options=DB.warningSteps;
    else if(typeof v==='string' && v.length>44){ f.type='textarea'; f.full=true; }
    else f.type='text';
    return reviewField(f,r);
  }).join('');
}
function recSaveAll(modId,id){
  const m=DB.modules[modId]; const r=m.records.find(x=>x.id===id); if(!r) return;
  Object.keys(r).forEach(k=>{ const el=document.getElementById('d-'+k); if(el){ r[k]=el.value; } });
  if(r.priority && m.id==='maintenance') r.severity=r.priority;
  closeDrawer(); toast(`${id} saved`); buildSidebar(); render();
}
function recDelete(modId,id){
  if(!confirm('Delete this record permanently?')) return;
  const m=DB.modules[modId]; const i=m.records.findIndex(x=>x.id===id); if(i>=0) m.records.splice(i,1);
  closeDrawer(); toast(`${id} deleted`); buildSidebar(); render();
}
function closeDrawer(){ $('#drawer')?.classList.remove('open'); $('#drawer-mask')?.classList.remove('open'); }

/* ============================================================ CHARTS */
function destroyCharts(){ State.charts.forEach(c=>{try{c.destroy()}catch(e){}}); State.charts=[]; }
function mkChart(id,cfg){ const el=$('#'+id); if(!el||!window.Chart) return; State.charts.push(new Chart(el,cfg)); }
function baseOpts({indexAxis='x',legend=false,donut=false}={}){
  const o={responsive:true,maintainAspectRatio:false,indexAxis,
    plugins:{legend:{display:legend,position:'bottom',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:14,font:{family:'Inter',size:11,weight:'600'},color:'#475569'}},
    tooltip:{backgroundColor:'#0f172a',padding:10,cornerRadius:9,titleFont:{family:'Inter',weight:'700'},bodyFont:{family:'Inter'}}}};
  if(donut) o.cutout='62%';
  else o.scales={x:{grid:{display:indexAxis==='y',color:'#eef2f7'},ticks:{font:{family:'Inter',size:11},color:'#64748b'},border:{display:false}},
    y:{grid:{display:indexAxis==='x',color:'#eef2f7'},ticks:{font:{family:'Inter',size:11},color:'#64748b',precision:0},border:{display:false}}};
  return o;
}

/* ============================================================ HELPERS */
function setAccent(hex){ document.documentElement.style.setProperty('--accent',hex); document.documentElement.style.setProperty('--accent-soft',soft(hex)); }
function soft(hex){ return `color-mix(in srgb, ${hex} 12%, #fff)`; }
function setCrumb(ic,title,sub){ $('#crumbs').innerHTML=`<div class="c-ic">${ic}</div><div><h1>${esc(title)}</h1><div class="c-sub">${esc(sub)}</div></div>`; }
function opts(list){ return (list||[]).map(o=>`<option>${esc(o)}</option>`).join(''); }
function prettyKey(k){ return k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()).replace(/Yn$/,'?').trim(); }
function truncate(s,n){ s=String(s||''); return s.length>n?s.slice(0,n-1)+'…':s; }
function relTime(d){ if(!d) return ''; const t=new Date(String(d).replace(' ','T')); if(isNaN(t)) return d; const diff=(Date.now()-t)/86400000; if(diff<1)return'today'; if(diff<2)return'yesterday'; if(diff<30)return Math.floor(diff)+'d ago'; return t.toISOString().slice(0,10); }
let toastT;
function toast(msg){ let el=$('#toast'); if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el);} el.innerHTML=`<span class="t-ok">✓</span>${esc(msg)}`; el.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),2600); }

/* ============================================================ BOOT */
window.addEventListener('hashchange',()=>{ if(State.account) render(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
function toggleSidebar(){ const s=$('#sidebar'); if(!s) return; const open=s.classList.toggle('show'); const bd=$('#sb-backdrop'); if(bd) bd.classList.toggle('show',open); }
function closeSidebarM(){ $('#sidebar')?.classList.remove('show'); $('#sb-backdrop')?.classList.remove('show'); }
Object.assign(window,{go,openDetail,closeDrawer,submitForm,reviewSave,recSaveAll,recDelete,logout,doLogin,togglePw,updateLoginHint,faceIdLogin,closeFid,toggleGroup,toggleSidebar,closeSidebarM});
async function boot(){
  try{ if(window.MCQDB && MCQDB.ready){ const ok=await MCQDB.ready; if(ok && MCQDB.loadAll) await MCQDB.loadAll(); } }catch(e){}
  try{ const saved=sessionStorage.getItem('mcq_acct'); if(saved){ State.account=JSON.parse(saved); State.branch=State.account.branch; State.role=State.account.role==='staff'?'store':'ho'; } }catch(e){}
  if(State.account) enterApp(); else showLogin();
}
document.addEventListener('DOMContentLoaded',boot);
