/* ============================================================
   MCQ Ops Hub — App engine v2
   Login + FaceID + 30-min auto-logout + grouped nav +
   config-driven modules + real checklist + HR/management pages.
   ============================================================ */
'use strict';

const State = { account:null, role:'store', branch:'Morley', route:{mod:'home',tab:null}, charts:[], idleTimer:null };
window.State = State;
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin = ()=> State.account && (State.account.role==='admin' || State.account.role==='super');
const isSuper = ()=> State.account && State.account.role==='super';
const isBa = ()=> State.account && State.account.role==='ba';   // Chú Ba — read-only checklist viewer (all stores)
const isEmployee = ()=> State.account && State.account.role==='employee';   // individual staff account
const seesAllStores = ()=> isSuper() || isBa();
/* Display labels — internal role strings are unchanged (admin/staff/super/ba/employee) */
function roleName(role){ return role==='super'?'Super Admin':role==='ba'?'Chú Ba':role==='admin'?'Manager':role==='staff'?'Department Lead':role==='employee'?'Staff':'Staff'; }
function logoHTML(cls){ return `<span class="mcq-logo ${cls||''}"><img src="assets/mcq-logo-exact.png" alt="MCQ Supermarket logo"></span>`; }
function recordInScope(r){ return isSuper() || !!(r && r.store===State.branch); }
function storeForWrite(store){ return isSuper() ? (store || State.branch) : State.branch; }
function storeCode(store){
  const map={'Morley':'MOR','Mirrabooka':'MIR','Malaga':'MAL','Subiaco':'SUB','Armadale':'ARM','Beechboro Fresh':'BEE','Market West':'MKT','Warehouse':'WHS','All stores':'ALL'};
  if(map[store]) return map[store];
  const parts=String(store||'store').replace(/[^a-z0-9 ]/gi,' ').trim().split(/\s+/).filter(Boolean);
  return (parts.length>1?parts.map(p=>p[0]).join(''):String(parts[0]||'sto').slice(0,3)).toUpperCase();
}
function ymdCompact(d){ return (d?new Date(d):new Date()).toISOString().slice(0,10).replace(/-/g,''); }
function makeRecordId(prefix,store,d){
  const code=storeCode(storeForWrite(store));
  return `${code}-${prefix}-${ymdCompact(d)}-${Math.floor(1000+Math.random()*9000)}`;
}
function auditUser(){ const a=State.account||{}; return {name:a.name||'System',role:a.role||'system',branch:a.branch||State.branch||''}; }
function auditVal(v){
  if(v==null || typeof v==='string' || typeof v==='number' || typeof v==='boolean') return v;
  if(Array.isArray(v)) return `[${v.length} items]`;
  return '[object]';
}
function auditDiff(before,after){
  const b=before||{}, a=after||{}, keys=[...new Set(Object.keys(b).concat(Object.keys(a)))];
  const out={};
  keys.forEach(k=>{
    if(['items','photo','photos','data'].includes(k)) return;
    const bv=auditVal(b[k]), av=auditVal(a[k]);
    if(JSON.stringify(bv)!==JSON.stringify(av)) out[k]={from:bv,to:av};
  });
  return out;
}
function auditLog(action,entity,entityId,store,before,after,note){
  const st=storeForWrite(store || (after&&after.store) || (before&&before.store));
  const u=auditUser();
  DB.auditLogs=DB.auditLogs||[];
  DB.auditLogs.unshift({id:makeRecordId('AUD',st),created:new Date().toISOString(),store:st,user:u.name,role:u.role,action,entity,entityId,note:note||'',changes:auditDiff(before,after)});
  if(DB.auditLogs.length>800) DB.auditLogs.length=800;
}
function syncScopeLabel(account){
  const a=account||State.account||{};
  return a.role==='super'?'all stores':(a.branch||State.branch||'store');
}
function titleWords(s){ return String(s||'').replace(/\b\w/g,c=>c.toUpperCase()); }
function setBootMessage(msg,detail){
  const splash=document.getElementById('boot-splash');
  if(!splash) return;
  const text=document.getElementById('boot-text');
  const sub=document.getElementById('boot-sub');
  if(text) text.textContent=msg||'Loading...';
  if(sub) sub.textContent=detail||'';
}
function syncBadge(){
  const s=State.dataSync||{status:'local',message:'Local data'};
  const cls=s.status==='synced'?'ok':s.status==='loading'?'warn':s.status==='error'?'bad':'warn';
  const icon=s.status==='synced'?'fa-cloud-check':s.status==='loading'?'fa-spinner fa-spin':s.status==='error'?'fa-triangle-exclamation':'fa-database';
  return `<span class="dot ${cls}"></span><i class="fas ${icon}"></i> ${esc(s.message||'Local data')}`;
}
function refreshSyncUi(){
  const foot=document.getElementById('side-sync'); if(foot) foot.innerHTML=syncBadge();
  const top=document.getElementById('sync-pill'); if(top) top.innerHTML=syncBadge();
}

/* ---------- tones / colours ---------- */
const TONE_HEX={ok:'#10b981',warn:'#f59e0b',bad:'#ef4444',info:'#3b82f6',mute:'#94a3b8'};
const PALETTE=['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#14b8a6','#f43f5e','#a855f7','#0ea5e9'];
const toneOf=l=>TONES[l]||'mute';
const toneHex=l=>TONE_HEX[toneOf(l)];

/* ---------- current user / scope ---------- */
function me(){
  const a=State.account||{name:'Guest',role:'staff',branch:'Morley'};
  const roleLabel = roleName(a.role);
  return { name:a.name, role:roleLabel,
    scope:isSuper()?'All stores':a.branch, store:a.branch, initials:a.initials||'?', kind:isAdmin()?'ho':'store' };
}
function scopedRecords(mod){
  const m=DB.modules[mod]; if(!m||!m.records) return [];
  if(isSuper()){ const f=State.superStore;   // global Super store filter (topbar) — '' / 'ALL' = every store
    return (f&&f!=='ALL')?m.records.filter(r=>r.store===f):m.records; }
  const s=State.branch; return m.records.filter(r=>r.store===s);  // admin + staff: own store only
}

/* ============================================================ LOGIN */
function showLogin(notice){
  document.getElementById('boot-splash')?.remove();
  document.body.classList.add('on-login');
  $('#app').style.display='none';
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
      <label class="login-lbl">ID <span class="login-opt" id="login-id-opt">· your 4-digit personal ID (skip it if your password alone signs you in)</span></label>
      <input id="login-id" class="login-input" inputmode="numeric" maxlength="4" placeholder="e.g. 2345" autocomplete="off">
      <label class="login-lbl">Password</label>
      <div class="login-pw">
        <input id="login-pw" class="login-input" type="password" placeholder="Enter password" autocomplete="off">
        <button class="pw-eye" onclick="togglePw()">👁️</button>
      </div>
      <div class="login-links"><button class="login-forgot" onclick="idOpen()">Forgot ID?</button><button class="login-forgot" onclick="fpOpen()">Forgot password?</button></div>
      <div id="login-err" class="login-err"></div>
      <button class="login-btn" onclick="doLogin()">Sign In →</button>
      <div class="login-or"><span>or</span></div>
      <button class="faceid-btn" onclick="faceIdLogin()">
        <span class="fid-ic">🪪</span> Sign in with Face ID
      </button>
      <button class="activate-btn" onclick="actOpen()"><span class="act-spark">✨</span> Activate your account <span class="act-arrow">→</span></button>
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
  $('#login-id').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  $('#login-pw').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
  updateLoginHint();
}
function togglePw(){ const p=$('#login-pw'); p.type=p.type==='password'?'text':'password'; }

/* ============================================================ ACCOUNT ACTIVATION WIZARD */
let _act={};   // {email, match, name}
function actClose(){ const o=document.getElementById('act-ov'); if(o) o.remove(); }
function actShell(inner){
  actClose();
  const o=document.createElement('div'); o.id='act-ov';
  o.innerHTML=`<div class="act-card">
    <button class="act-close" onclick="actClose()">✕</button>
    <div class="act-brand"><img src="assets/mcq-logo-exact.png" alt=""><span>MCQ Supermarket</span></div>
    ${inner}</div>`;
  document.body.appendChild(o);
}
function actOpen(){
  _act={};
  actShell(`
    <div class="act-step-dots"><span class="on"></span><span></span><span></span></div>
    <h2 class="act-h">Activate your account</h2>
    <p class="act-p">Enter <b>exactly the Gmail you use to log in to the Deputy app</b>. We'll match it with your staff profile.</p>
    <label class="login-lbl">Your Gmail</label>
    <input id="act-email" class="login-input" type="email" placeholder="name@gmail.com" autocomplete="email">
    <div id="act-err" class="login-err"></div>
    <button class="login-btn act-cta" onclick="actLookup()">Continue →</button>`);
  setTimeout(()=>document.getElementById('act-email')?.focus(),80);
}
async function actLookup(){
  const email=(document.getElementById('act-email')?.value||'').trim();
  const err=document.getElementById('act-err');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ if(err) err.textContent='Please enter a valid email address.'; return; }
  const btn=document.querySelector('.act-cta'); if(btn){ btn.disabled=true; btn.textContent='Checking…'; }
  let r=null;
  try{ r=await fetch('/api/activate/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}).then(x=>x.json()); }catch(e){}
  if(!r||!r.ok){ if(btn){ btn.disabled=false; btn.textContent='Continue →'; } if(err) err.textContent='Cannot reach the server — please try again.'; return; }
  if(r.already){
    actShell(`
      <div class="act-badge act-ok">✓</div>
      <h2 class="act-h">Already activated</h2>
      <p class="act-p">This email already has an account.</p>
      <div class="act-id-box"><span class="act-id-lbl">Your ID</span><span class="act-id">${esc(r.id)}</span></div>
      <p class="act-p">Sign in with this ID and your password — your access: <span class="act-tab">${esc(r.tab)}</span>.<br>Forgot your password? Use <b>Forgot password?</b> on the sign-in screen.</p>
      <button class="login-btn act-cta" onclick="actPrefill('${esc(r.id)}','${esc(r.role)}')">Go to sign in →</button>`);
    return;
  }
  if(!r.match){
    // email isn't in the system → activation is only for people Head Office has added
    actShell(`
      <div class="act-badge act-new">✋</div>
      <h2 class="act-h">Email not registered</h2>
      <p class="act-p">We couldn't find <b>${esc(email)}</b> in the staff system yet.<br>Please ask <b>Head Office</b> to add you, then activate again.</p>
      <button class="login-btn act-cta" onclick="actClose()">Got it</button>`);
    return;
  }
  _act={email,name:r.name||''};
  actShell(`
    <div class="act-step-dots"><span class="on"></span><span class="on"></span><span></span></div>
    <div class="act-badge act-ok">👋</div><h2 class="act-h">We found you, ${esc((r.name||'').split(' ')[0].toLowerCase().replace(/^./,c=>c.toUpperCase())||'friend')}!</h2>
    <p class="act-p"><b>${esc(r.name)}</b>${r.store?` · 🏪 MCQ ${esc(r.store)}`:''}</p>
    ${r.id?`<div class="act-id-box"><span class="act-id-lbl">Your ID</span><span class="act-id">${esc(r.id)}</span></div>
    <p class="act-p" style="margin-top:-6px">This is your permanent sign-in ID. Now create your password to finish:</p>`:'<p class="act-p">Now create your own password to finish.</p>'}
    <label class="login-lbl">Create a password</label>
    <input id="act-pw1" class="login-input" type="password" placeholder="At least 6 characters">
    <label class="login-lbl">Confirm password</label>
    <input id="act-pw2" class="login-input" type="password" placeholder="Type it again">
    <div id="act-err" class="login-err"></div>
    <button class="login-btn act-cta" onclick="actCreate()">Create my account →</button>`);
  setTimeout(()=>document.getElementById('act-pw1')?.focus(),80);
}
async function actCreate(){
  const p1=document.getElementById('act-pw1')?.value||'', p2=document.getElementById('act-pw2')?.value||'';
  const err=document.getElementById('act-err');
  if(p1.length<6){ if(err) err.textContent='Password must be at least 6 characters.'; return; }
  if(p1!==p2){ if(err) err.textContent='The two passwords do not match.'; return; }
  const btn=document.querySelector('.act-cta'); if(btn){ btn.disabled=true; btn.textContent='Creating…'; }
  let r=null;
  try{ r=await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:_act.email,password:p1})}).then(x=>x.json()); }catch(e){}
  if(!r||!r.ok){ if(btn){ btn.disabled=false; btn.textContent='Create my account →'; } if(err) err.textContent=(r&&r.error)||'Could not activate — please try again.'; return; }
  const roleName={employee:'Staff',staff:'Department Lead',admin:'Manager',super:'Super Admin'}[r.role]||'Staff';
  actShell(`
    <div class="act-step-dots"><span class="on"></span><span class="on"></span><span class="on"></span></div>
    <div class="act-badge act-ok act-pop">🎉</div>
    <h2 class="act-h">Welcome, ${esc((r.name||'').split(' ')[0]||'aboard')}!</h2>
    <p class="act-p">Your account is ready. This is your permanent ID — save it:</p>
    <div class="act-id-box"><span class="act-id-lbl">Your ID</span><span class="act-id">${esc(r.id)}</span></div>
    <div class="act-access"><span class="act-chip">${esc(roleName)}</span>${r.store?`<span class="act-chip act-chip-store">🏪 ${esc(r.store)}</span>`:''}</div>
    <p class="act-p">Sign in with this ID and your new password — your access: <span class="act-tab">${esc(r.tab)}</span>.${r.emailed?`<br>📧 We've also emailed your ID &amp; password to <b>${esc(_act.email||'your Gmail')}</b>.`:''}${r.needs_profile?'<br>📋 After signing in, please complete <b>My Profile</b> first.':''}</p>
    <button class="login-btn act-cta" onclick="actPrefill('${esc(r.id)}','${esc(r.role)}')">Sign in now →</button>`);
}
function actPrefill(id){
  actClose();
  const idEl=document.getElementById('login-id'); if(idEl) idEl.value=id;
  document.getElementById('login-pw')?.focus();
}
window.actOpen=actOpen; window.actClose=actClose; window.actLookup=actLookup; window.actCreate=actCreate; window.actPrefill=actPrefill;

/* ============================================================ FORGOT PASSWORD (emailed code) */
let _fp={};
function fpOpen(){
  _fp={};
  actShell(`
    <div class="act-step-dots"><span class="on"></span><span></span></div>
    <h2 class="act-h">Reset your password</h2>
    <p class="act-p">Enter your <b>Gmail</b> and we'll email you a 6-digit code.</p>
    <label class="login-lbl">Your Gmail</label>
    <input id="fp-email" class="login-input" type="email" placeholder="name@gmail.com" autocomplete="email">
    <div id="fp-err" class="login-err"></div>
    <button class="login-btn act-cta" onclick="fpRequest()">Send code →</button>`);
  setTimeout(()=>document.getElementById('fp-email')?.focus(),80);
}
async function fpRequest(){
  const email=(document.getElementById('fp-email')?.value||'').trim();
  const err=document.getElementById('fp-err');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ if(err) err.textContent='Please enter a valid email address.'; return; }
  const btn=document.querySelector('.act-cta'); if(btn){ btn.disabled=true; btn.textContent='Sending…'; }
  let r=null;
  try{ r=await fetch('/api/password/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}).then(x=>x.json()); }catch(e){}
  if(!r||!r.ok){ if(btn){ btn.disabled=false; btn.textContent='Send code →'; } if(err) err.textContent='Cannot reach the server — please try again.'; return; }
  _fp={email};
  fpCodeStep(r.configured===false);
}
function fpCodeStep(notConfigured){
  actShell(`
    <div class="act-step-dots"><span class="on"></span><span class="on"></span></div>
    <div class="act-badge act-ok">📧</div>
    <h2 class="act-h">Check your email</h2>
    <p class="act-p">If <b>${esc(_fp.email)}</b> has an account, a 6-digit code is on its way. It expires in 15 minutes.${notConfigured?'<br><span style="color:#c2570f">⚠️ Email is not set up on the server yet — ask Head Office.</span>':''}</p>
    <label class="login-lbl">6-digit code</label>
    <input id="fp-code" class="login-input" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="off">
    <label class="login-lbl">New password</label>
    <input id="fp-pw1" class="login-input" type="password" placeholder="At least 6 characters">
    <label class="login-lbl">Confirm new password</label>
    <input id="fp-pw2" class="login-input" type="password" placeholder="Type it again">
    <div id="fp-err" class="login-err"></div>
    <button class="login-btn act-cta" onclick="fpReset()">Reset password →</button>
    <button class="act-link" onclick="fpRequest()">Resend code</button>`);
  setTimeout(()=>document.getElementById('fp-code')?.focus(),80);
}
async function fpReset(){
  const code=(document.getElementById('fp-code')?.value||'').trim();
  const p1=document.getElementById('fp-pw1')?.value||'', p2=document.getElementById('fp-pw2')?.value||'';
  const err=document.getElementById('fp-err');
  if(code.length<4){ if(err) err.textContent='Enter the 6-digit code from your email.'; return; }
  if(p1.length<6){ if(err) err.textContent='Password must be at least 6 characters.'; return; }
  if(p1!==p2){ if(err) err.textContent='The two passwords do not match.'; return; }
  const btn=document.querySelector('.act-cta'); if(btn){ btn.disabled=true; btn.textContent='Resetting…'; }
  let r=null;
  try{ r=await fetch('/api/password/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:_fp.email,code,password:p1})}).then(x=>x.json()); }catch(e){}
  if(!r||!r.ok){ if(btn){ btn.disabled=false; btn.textContent='Reset password →'; } if(err) err.textContent=(r&&r.error)||'Could not reset — please try again.'; return; }
  actShell(`
    <div class="act-badge act-ok act-pop">🎉</div>
    <h2 class="act-h">Password updated!</h2>
    <div class="act-id-box"><span class="act-id-lbl">Your ID</span><span class="act-id">${esc(r.id)}</span></div>
    <p class="act-p">Sign in with your ID and new password — your access: <span class="act-tab">${esc(r.tab)}</span>.</p>
    <button class="login-btn act-cta" onclick="actPrefill('${esc(r.id)}','${esc(r.role)}')">Sign in now →</button>`);
}
window.fpOpen=fpOpen; window.fpRequest=fpRequest; window.fpReset=fpReset;

/* ============================================================ FORGOT ID (same lookup as activation — one source of truth) */
function idOpen(){
  actShell(`
    <h2 class="act-h">Find your ID</h2>
    <p class="act-p">Enter your <b>Gmail</b> and we'll show the ID linked to it.</p>
    <label class="login-lbl">Your Gmail</label>
    <input id="fid-email" class="login-input" type="email" placeholder="name@gmail.com" autocomplete="email">
    <div id="fid-err" class="login-err"></div>
    <button class="login-btn act-cta" onclick="idLookup()">Find my ID →</button>`);
  setTimeout(()=>document.getElementById('fid-email')?.focus(),80);
}
async function idLookup(){
  const email=(document.getElementById('fid-email')?.value||'').trim();
  const err=document.getElementById('fid-err');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ if(err) err.textContent='Please enter a valid email address.'; return; }
  const btn=document.querySelector('.act-cta'); if(btn){ btn.disabled=true; btn.textContent='Looking…'; }
  let r=null;
  try{ r=await fetch('/api/activate/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}).then(x=>x.json()); }catch(e){}
  if(!r||!r.ok){ if(btn){ btn.disabled=false; btn.textContent='Find my ID →'; } if(err) err.textContent='Cannot reach the server — please try again.'; return; }
  if(r.already){
    actShell(`
      <div class="act-badge act-ok">🪪</div>
      <h2 class="act-h">Here's your ID</h2>
      <div class="act-id-box"><span class="act-id-lbl">Your ID</span><span class="act-id">${esc(r.id)}</span></div>
      <p class="act-p">Sign in with this ID and your password — your access: <span class="act-tab">${esc(r.tab)}</span>.<br>Forgot the password too? Use <b>Forgot password?</b> — same Gmail.</p>
      <button class="login-btn act-cta" onclick="actPrefill('${esc(r.id)}','${esc(r.role)}')">Go to sign in →</button>`);
    return;
  }
  if(r.match){
    actShell(`
      <div class="act-badge act-new">✨</div>
      <h2 class="act-h">No ID yet</h2>
      <p class="act-p">We found <b>${esc(r.name)}</b>${r.store?` · MCQ ${esc(r.store)}`:''}, but this account hasn't been activated — activate it now and you'll get your ID.</p>
      <button class="login-btn act-cta" onclick="actOpen()">Activate my account →</button>`);
    return;
  }
  actShell(`
    <div class="act-badge act-new">✋</div>
    <h2 class="act-h">Email not registered</h2>
    <p class="act-p">We couldn't find <b>${esc(email)}</b> in the staff system.<br>Please ask <b>Head Office</b> to add you first.</p>
    <button class="login-btn act-cta" onclick="actClose()">Got it</button>`);
}
window.idOpen=idOpen; window.idLookup=idLookup;
function loginFail(m){ const e=$('#login-err'); if(e) e.textContent='❌ '+m; const c=$('.login-card'); if(c){ c.classList.add('shake'); setTimeout(()=>c.classList.remove('shake'),450); } }
function updateLoginHint(){ const el=$('#login-hint'); if(!el) return;
  // one unified form — the server derives WHO you are and WHAT access you have from the
  // credentials themselves (ID+password, a unique staff numeric password, or a master password)
  el.innerHTML=`🔐 One sign-in for every role — your account decides your access &amp; store automatically`; }
function doLogin(){
  const pw=$('#login-pw').value.trim();
  const loginId=($('#login-id')?.value||'').trim();
  $('#login-err').textContent='';
  if(!pw) return loginFail('Enter your password.');
  // server-checked login when the API backend is active (passwords live on the server)
  if(window.MCQDB && MCQDB._api && MCQDB.login){
    const btn=$('.login-btn'); if(btn){ btn.disabled=true; btn.textContent='Signing in…'; }
    MCQDB.login('auto', '', pw, loginId).then(res=>{
      if(res && res.ok){ loginAs(res.role, (res.role==='super'||res.role==='ba')?'All stores':res.store, {staffId:res.staff_id, name:res.staff_name, accountId:res.account_id, needsProfile:res.needs_profile, acctAdmin:res.acct_admin}); }
      else { if(btn){ btn.disabled=false; btn.textContent='Sign In →'; } loginFail(res&&res.error?res.error:(loginId?'Incorrect ID or password.':'Incorrect password — or enter your ID above if you have one.')); }
    }).catch(()=>{ if(btn){ btn.disabled=false; btn.textContent='Sign In →'; } loginFail('Cannot reach the server.'); });
    return;
  }
  // offline fallback (only when the server API is unavailable): master passwords still work
  if(pw===DB.auth.superAdminPassword) return loginAs('super','All stores');
  if(pw===(DB.auth.baPassword||'19')) return loginAs('ba','All stores');
  return loginFail('This account needs an internet connection. Please try again when online.');
}
let dataSyncRun = 0;
function syncStillCurrent(run,account){ return run===dataSyncRun && State.account===account; }
function finishAccountSync(run,account,scope,last){
  if(!syncStillCurrent(run,account)) return false;
  last=last||{};
  const status=last.status||'synced';
  State.dataSync={status,message:last.message||`${titleWords(scope)} data loaded`};
  if(account.role==='super'&&status==='error'){
    State.superFullSyncStarted=false;
    State.superFullSyncFailedAt=Date.now();
  }else if(account.role==='super'){
    State.superFullSyncFailedAt=0;
  }
  if(account.role==='super') State.superRouteSyncMark=0;
  if(State.account){ buildTopbar(); buildSidebar(); render(); }
  refreshSyncUi();
  return true;
}
function failAccountSync(run,account,scope,e){
  if(!syncStillCurrent(run,account)) return false;
  State.dataSync={status:'error',message:`Cloud load failed · local ${scope}`};
  if(account&&account.role==='super'){
    State.superFullSyncStarted=false;
    State.superFullSyncFailedAt=Date.now();
    State.superRouteSyncMark=0;
  }
  console.warn('[APP] data load failed', e&&e.message);
  refreshSyncUi();
  return true;
}
async function syncAccountData(){
  const account=State.account;
  if(!account) return;
  const run=++dataSyncRun;
  const scope=syncScopeLabel(account);
  const alreadyContinuing=State.dataSync&&State.dataSync.status==='local'&&/cloud sync continuing/.test(State.dataSync.message||'');
  if(!alreadyContinuing) State.dataSync={status:'loading',message:`Syncing ${scope} data...`};
  setBootMessage(`Syncing ${scope} data...`,'Refreshing the store workspace in the background');
  refreshSyncUi();
  try{
    if(window.MCQDB && MCQDB.ready){
      const loadPromise=(async()=>{
        await MCQDB.ready;
        if(!syncStillCurrent(run,account)) return null;
        const res=MCQDB.loadForAccount?await MCQDB.loadForAccount(account):null;
        return MCQDB.lastSync||res||{};
      })();
      const settled=loadPromise.then(last=>({last}),error=>({error}));
      const first=await Promise.race([settled,new Promise(res=>setTimeout(()=>res({softTimeout:true}), account.role==='super'?4000:3000))]);
      if(first.softTimeout){
        if(!syncStillCurrent(run,account)) return;
        State.dataSync={status:'local',message:`Local ${scope} data · cloud sync continuing`};
        refreshSyncUi();
        settled.then(done=>{
          if(done.error) failAccountSync(run,account,scope,done.error);
          else if(done.last) finishAccountSync(run,account,scope,done.last);
        });
        return;
      }
      if(first.error) throw first.error;
      if(first.last) finishAccountSync(run,account,scope,first.last);
    }else{
      State.dataSync={status:'local',message:`Local ${scope} data`};
    }
  }catch(e){
    failAccountSync(run,account,scope,e);
    return;
  }
  refreshSyncUi();
}
function hydrateAccountData(){
  const scope=syncScopeLabel(State.account);
  try{
    if(window.MCQDB && MCQDB.hydrateFromCache){
      const res=MCQDB.hydrateFromCache(State.account)||{};
      State.dataSync={status:res.status||'local',message:res.message||`Local ${scope} data · syncing...`};
    }else{
      State.dataSync={status:'local',message:`Local ${scope} data · syncing...`};
    }
  }catch(e){
    State.dataSync={status:'local',message:`Local ${scope} data · syncing...`};
  }
  refreshSyncUi();
}
function startAccountSync(force){
  if(State.account&&State.account.role==='super'&&!force){
    const cached=State.dataSync&&State.dataSync.status==='cached';
    State.dataSync={status:cached?'cached':'local',message:(cached?'Cached all stores':'Super Admin ready')+' · open a data page to sync all stores'};
    refreshSyncUi();
    return;
  }
  setTimeout(()=>syncAccountData(), State.account&&State.account.role==='super'?250:0);
}
function maybeStartRouteSync(){
  if(!State.account || State.account.role!=='super' || State.superFullSyncStarted) return;
  if(State.superFullSyncFailedAt && Date.now()-State.superFullSyncFailedAt<30000) return;
  const heavy=['manager','history','analytics','photos','data','storeconfig','checklist','binadmin','schedules','issue','complaint','maintenance','incident','delivery','violation','reward','training','raise','birthday','feedback','staff','structure','schedule','performance'];
  if(heavy.includes(State.route.mod)){
    State.superFullSyncStarted=true;
    State.superFullSyncFailedAt=0;
    const mark=Date.now();
    State.superRouteSyncMark=mark;
    State.dataSync={status:'loading',message:'Syncing all stores data...'};
    refreshSyncUi();
    setTimeout(()=>{
      if(State.account&&State.account.role==='super'&&State.superFullSyncStarted&&State.superRouteSyncMark===mark&&State.dataSync&&State.dataSync.status==='loading'){
        State.dataSync={status:'local',message:'Local all stores data · cloud sync continuing'};
        refreshSyncUi();
      }
    },4000);
    startAccountSync(true);
  }
}
async function loginAs(role, branch, meta){
  meta=meta||{};
  const name = role==='super' ? 'Head Office' : role==='ba' ? 'Chú Ba' : role==='employee' ? (meta.name||'Staff') : role==='admin' ? (branch+' Manager') : (branch+' Dept Lead');
  const initials = role==='super' ? 'HO' : role==='ba' ? 'CB' : role==='employee' ? (String(meta.name||'S').trim().slice(0,2).toUpperCase()) : branch.slice(0,2).toUpperCase();
  State.account={ name:(meta.name&&role!=='employee'?meta.name:name), role, branch, initials, staffId:meta.staffId||null, staffName:meta.name||null,
    accountId:meta.accountId||null, needsProfile:!!meta.needsProfile, acctAdmin:!!meta.acctAdmin };
  State.branch=branch; State.role=(role==='staff'||role==='employee')?'store':'ho';
  try{ sessionStorage.setItem('mcq_acct', JSON.stringify(State.account)); }catch(e){}
  const btn=$('.login-btn'); if(btn){ btn.disabled=true; btn.textContent='Opening workspace...'; }
  hydrateAccountData();
  enterApp();
  startAccountSync();
}
function enterApp(){
  document.getElementById('boot-splash')?.remove();
  document.body.classList.remove('on-login');
  document.body.className = 'role-'+State.role;
  $('#login-root').style.display='none';
  $('#app').style.display='';   // let CSS decide (grid on desktop, block flow on mobile) — avoids inline override
  if(!location.hash || location.hash==='#') location.hash='#/home'; else render();
  buildTopbar(); buildSidebar(); render();
  startIdleWatch();
  // warm the rarely-used modules AND the rich-text editor in the background so deep pages and
  // every composer (inbox, Share Your Thought, announcements…) open with CKEditor 5 instantly
  try{ const idle=window.requestIdleCallback||function(f){return setTimeout(f,1200);}; idle(()=>{ try{ ensureLazyModules(); }catch(e){} try{ if(window.ensureCKE) ensureCKE(); }catch(e){} }); }catch(e){}
  startLiveRefresh();   // Super Admin + Chú Ba see records/checklists live
  startUnreadPoll();    // inbox unread badge for every role (light GET, guarded)
}
let _unreadTimer=null;
function startUnreadPoll(){
  if(!window.mcqRefreshUnread) return;
  try{ mcqRefreshUnread(); }catch(e){}
  wsStart();                                          // realtime push — polling below is only the fallback
  if(_unreadTimer) return;
  // fallback poll: 12s while visible WITHOUT a live socket; a light 90s safety net with one.
  _unreadTimer=setInterval(()=>{
    if(!State.account) return;
    if(document.hidden) return;                       // backgrounded tab / phone in pocket: no polling
    if(window.__mcqWsLive){ if(Date.now()-(_wsLastBeat||0)<90000) return; }   // socket alive → no HTTP polling
    const busy=document.getElementById('mcq-modal') || $('.drawer.open');
    const ae=document.activeElement, typing=ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName||'');
    if(busy||typing) return;
    try{ mcqRefreshUnread(); }catch(e){}
  }, 12000);
  // coming back to the tab → check mail immediately (feels instant after unlocking the phone)
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && State.account){ try{ mcqRefreshUnread(); }catch(e){} wsStart(); } });
}
/* ---- realtime: one WebSocket per signed-in client; server pushes tiny change-hints
   ({"what":"inbox"} / {"what":"announcements"}) and we refetch through the normal
   authorized endpoints. Auto-reconnects with backoff; polling above is the safety net. */
let _ws=null,_wsRetry=800,_wsPing=null,_wsLastBeat=0;
function wsStart(){
  if(_ws || !State.account || !window.WebSocket) return;
  const tok=(window.localStorage&&localStorage.getItem('mcq_token'))||''; if(!tok) return;
  let url; try{ url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/ws?token='+encodeURIComponent(tok); }catch(e){ return; }
  try{ _ws=new WebSocket(url); }catch(e){ _ws=null; return; }
  _ws.onopen=()=>{ window.__mcqWsLive=true; _wsLastBeat=Date.now(); _wsRetry=800;
    clearInterval(_wsPing); _wsPing=setInterval(()=>{ try{ if(_ws&&_ws.readyState===1) _ws.send('ping'); }catch(e){} },25000); };
  _ws.onmessage=ev=>{ _wsLastBeat=Date.now(); let d={}; try{ d=JSON.parse(ev.data); }catch(e){ return; }
    if(d.what==='inbox'){
      try{ mcqRefreshUnread(); }catch(e){}
      // live-update the inbox list when it's on screen (never while a modal/composer is open)
      if(State.route&&State.route.mod==='inbox' && window.renderInbox && !document.getElementById('mcq-modal')) try{ renderInbox(); }catch(e){}
    }
    if(d.what==='announcements' && State.route&&State.route.mod==='announcements' && window.renderAnnouncements && !document.getElementById('mcq-modal')) try{ renderAnnouncements(); }catch(e){}
  };
  _ws.onclose=()=>{ window.__mcqWsLive=false; _ws=null; clearInterval(_wsPing);
    if(State.account) setTimeout(wsStart, _wsRetry=Math.min(_wsRetry*2,30000)); };
  _ws.onerror=()=>{ try{ _ws&&_ws.close(); }catch(e){} };
}
function wsStop(){ try{ _ws&&_ws.close(); }catch(e){} _ws=null; window.__mcqWsLive=false; clearInterval(_wsPing); }
let _liveTimer=null;
const LIVE_ROUTES=['home','manager','analytics','history','photos','feedback','baview'];
function startLiveRefresh(){
  if(_liveTimer) return;
  _liveTimer=setInterval(()=>{
    if(!State.account || !(isSuper()||isBa()) || !(window.MCQDB&&MCQDB.loadForAccount)) return;
    const ae=document.activeElement, typing=ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName||'');
    const busy=$('.drawer.open') || [...document.querySelectorAll('.lb-overlay,.ck-block-ov,.ck-success-ov,#email-log-modal,#mgr-rec-modal')].some(e=>e && e.style.display && e.style.display!=='none');
    if(typing||busy) return;   // never interrupt active editing / an open dialog
    MCQDB.loadForAccount(State.account).then(()=>{
      if(!State.account || !(isSuper()||isBa())) return;
      if(isBa() || LIVE_ROUTES.includes(State.route.mod)) render();   // repaint only read-only views; data is fresh regardless
    }).catch(()=>{});
  }, 30000);
}
function stopLiveRefresh(){ if(_liveTimer){ clearInterval(_liveTimer); _liveTimer=null; } }
async function logout(reason){
  // flush any unsaved work and WAIT for the server to confirm BEFORE clearing the account,
  // otherwise the next login could read the server before this save lands → last edits lost.
  try{ if(window.MCQDB && MCQDB.saveAll && State.account){
    try{ State.dataSync={status:'loading',message:'Saving…'}; refreshSyncUi(); }catch(e){}
    await MCQDB.saveAll();
  } }catch(e){}
  // revoke the server session token so a leaked/shared device can't reuse it
  try{ const t=localStorage.getItem('mcq_token');
    if(t) await fetch('/api/logout',{method:'POST',headers:{'Authorization':'Bearer '+t}}).catch(()=>{});
    if(window.MCQDB && MCQDB.logout) MCQDB.logout(); }catch(e){}
  stopLiveRefresh(); wsStop();
  dataSyncRun++;
  State.superFullSyncStarted=false;
  State.superFullSyncFailedAt=0;
  State.superRouteSyncMark=0;
  State.account=null; try{ sessionStorage.removeItem('mcq_acct'); }catch(e){}
  stopIdleWatch();
  showLogin(reason);
}

/* Face ID — REAL device biometric via WebAuthn (Face ID / Touch ID / Windows Hello) */
async function faceIdLogin(){
  const modal=$('#fid-modal'), sub=$('#fid-sub'), title=$('.fid-title');
  if(!window.MCQFace){ loginFail('Face ID module not loaded'); return; }
  modal.classList.add('open'); if(title) title.textContent='Face ID / Touch ID';
  const v2=MCQFace.listV2?MCQFace.listV2():[];
  if(!v2.length){
    const hasLegacy=MCQFace.legacy&&MCQFace.legacy().length;
    if(sub) sub.textContent=hasLegacy
      ? 'Security upgrade needed — sign in once with your ID/password, then re-enrol in Account → Face ID.'
      : 'No Face ID on this device yet — sign in, then enrol in Account → Face ID.';
    setTimeout(closeFid,3000); return;
  }
  if(sub) sub.textContent='Follow the Face ID / Touch ID prompt on your device…';
  try{
    const res=await MCQFace.login();   // biometric → device secret → REAL server session
    if(sub) sub.innerHTML='✅ Welcome, '+esc(res.staff_name||res._label||'')+' — signing in…';
    setTimeout(()=>{ closeFid();
      loginAs(res.role, (res.role==='super'||res.role==='ba')?'All stores':res.store,
        {staffId:res.staff_id, name:res.staff_name, accountId:res.account_id, needsProfile:res.needs_profile, acctAdmin:res.acct_admin});
    }, 600);
  }catch(e){
    if(sub) sub.textContent='❌ '+((e&&e.message)||'Face ID failed');
    setTimeout(closeFid,2400);
  }
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
function navSolo(mod,icon,label){
  const m=DB.modules[mod]||DB.customPages[mod]; if(!m) return '';
  if(m.super&&!isSuper()) return ''; if(m.admin&&!isAdmin()) return '';
  const cnt=openCount(mod);
  return `<a class="nav-item solo" data-mod="${mod}"><span class="ic"><i class="fas ${icon}"></i></span><span class="lbl">${esc(label)}</span>${cnt?`<span class="count">${cnt}</span>`:''}</a>`;
}
function buildSidebar(){
  if(isBa()){   // Chú Ba — read-only, only the checklist-results viewer
    $('#nav').innerHTML = navLink('baview','fa-clipboard-check','Checklist Results','',true);
    $$('#nav .nav-item').forEach(el=>el.onclick=()=>{ go(el.dataset.mod); if(window.innerWidth<=860) closeSidebarM(); });
    paintActive(); refreshSyncUi(); return;
  }
  if(isEmployee()){   // individual staff — personal workspace only
    const ub=(window.inboxUnread?inboxUnread():0);
    $('#nav').innerHTML =
      navLink('home','fa-house','My Home','',true)+
      navLink('inbox','fa-inbox','My Inbox',ub?`<span class="count">${ub}</span>`:'',true)+
      navLink('announcements','fa-bullhorn','Announcements','',true)+
      navLink('issue','fa-flag','Report Issue','',true)+
      navLink('myvios','fa-gavel','My Violations','',true)+
      navLink('training','fa-graduation-cap','Training','',true)+
      navLink('feedback','fa-comment-dots','Ideas & Feedback','',true)+
      navLink('profile','fa-id-card','My Profile','',true);
    $$('#nav .nav-item').forEach(el=>el.onclick=()=>{ go(el.dataset.mod); if(window.innerWidth<=860) closeSidebarM(); });
    paintActive(); refreshSyncUi(); return;
  }
  let html = navLink('home','fa-gauge-high','Dashboard','',true);
  html += navLink('checklist','fa-clipboard-check','Checklist','',true);   // ⭐ first & prominent for everyone
  html += navSolo('issue','fa-flag','Report Issue');
  html += navSolo('violation','fa-gavel','Violation');
  if(!isAdmin()){   // staff also get Training + Report Violation
    html += navLink('training','fa-graduation-cap','Training','',true);
    html += navLink('violation','fa-gavel','Report Violation','',true);
  }
  { const ub=(window.inboxUnread?inboxUnread():0);
    html += navLink('inbox','fa-inbox',isSuper()?'Inbox':'Store Inbox', ub?`<span class="count">${ub}</span>`:'', true); }
  html += navLink('announcements','fa-bullhorn','Announcements','',true);
  html += navLink('feedback','fa-comment-dots',isSuper()?'Feedback Inbox':'Share Your Thought','',true);
  if(State.account&&State.account.acctAdmin) html += navLink('accounts','fa-user-lock','Account Management','',true);   // Khoi Nguyen only
  DB.navGroups.forEach(g=>{
    if(g.admin && !isAdmin()) return;
    const items = g.items.filter(id=>{
      const m=DB.modules[id]||DB.customPages[id];
      if(!m) return false;
      if(m.admin && !isAdmin()) return false;
      if(m.super && !isSuper()) return false;
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
  refreshSyncUi();
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
// global Super store filter (topbar): scope every page to one store, or 'ALL'
function superSetStore(v){ State.superStore=(v==='ALL')?'':v; try{ if(State.mgr) State.mgr.store=State.superStore||'ALL'; }catch(e){} buildTopbar(); render(); }
window.superSetStore=superSetStore;
// Active scope label for crumbs/titles — reflects the Super store filter (or the user's fixed store)
function superScopeLabel(){ return isSuper()?((State.superStore&&State.superStore!=='ALL')?State.superStore:'All stores'):State.branch; }
window.superScopeLabel=superScopeLabel;

/* ============================================================ TOPBAR */
function buildTopbar(){
  const u=me();
  const scopeLabel=isSuper()?'All stores':State.branch;
  const roleLabel=isSuper()?'Super':State.account&&State.account.role==='ba'?'Chú Ba':State.account&&State.account.role==='admin'?'Manager':State.account&&State.account.role==='employee'?'Staff':'Dept Lead';
  // Super: the store filter gets its own prominent bar under the topbar (see #store-scope-bar).
  // Everyone else: a small badge in the topbar showing their fixed store.
  const scopeBar=$('#store-scope-bar');
  if(scopeBar){
    scopeBar.innerHTML = isSuper()
      ? `<div class="ssb-inner"><span class="ssb-label"><i class="fas fa-store"></i> Viewing store</span>
          <select id="tb-store" class="ssb-select" onchange="superSetStore(this.value)" title="Filter every page by store">
            <option value="ALL" ${(!State.superStore||State.superStore==='ALL')?'selected':''}>🏬 All stores</option>
            ${DB.stores.map(s=>`<option value="${esc(s)}" ${State.superStore===s?'selected':''}>${esc(s)}</option>`).join('')}</select>
          <span class="ssb-hint">${(!State.superStore||State.superStore==='ALL')?'Showing every store — pick one to focus':'Every page is scoped to this store'}</span></div>`
      : '';
  }
  const superStoreSel = isSuper() ? '' : `<span class="tb-badge"><i class="fas fa-store"></i> ${esc(scopeLabel)}</span>`;
  $('#topbar-right').innerHTML = `
    ${superStoreSel}
    <span class="tb-badge"><i class="fas fa-clock"></i> idle <b id="idle-ind">30m</b></span>
    <span class="tb-badge ${isAdmin()?'badge-admin':''}"><i class="fas ${isAdmin()?'fa-shield-halved':'fa-user'}"></i> ${roleLabel}</span>
    <button class="tb-bell" onclick="cmdK()" title="Search (⌘K / Ctrl-K)"><i class="fas fa-magnifying-glass"></i></button>
    <button class="tb-bell" id="tb-bell" onclick="if(window.renderAttention)renderAttention()" title="Needs attention"><i class="fas fa-bell"></i><span class="tb-bell-n" id="tb-bell-n" style="display:none">0</span></button>
    <span class="tb-badge sync-top" id="sync-pill">${syncBadge()}</span>
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
  maybeStartRouteSync();
  destroyCharts(); closeDrawer();
  const mod=State.route.mod;
  buildSidebar();
  refreshBell();
  if(isBa()) return renderBaView();   // Chú Ba only ever sees the read-only checklist viewer
  if(isEmployee()){   // individual staff — personal workspace only
    const own={home:renderEmployeeHome, profile:renderEmployeeProfile, myvios:renderMyViolations};
    if(own[mod]) return own[mod]();
    const shared=['issue','feedback','inbox','announcements','training'];   // rendered by their normal renderers below
    if(!shared.includes(mod)) return renderEmployeeHome();
    // fall through to customPages/module routing for the shared pages the employee may use
  }
  if(mod==='home') return isAdmin()?renderHome():renderStaffHome();
  if(mod==='inbox' && window.renderInbox) return renderInbox();
  if(mod==='announcements' && window.renderAnnouncements) return renderAnnouncements();
  if(mod==='accounts'){ if(State.account&&State.account.acctAdmin&&window.renderAccounts) return renderAccounts(); location.hash='#/home'; return; }
  if(DB.customPages[mod]){
    const page=DB.customPages[mod];
    if((page.admin&&!isAdmin())||(page.super&&!isSuper())){ location.hash='#/home'; return; }
    // the render fn may live in a lazily-loaded module (pages2.js / ai.js) — load it, then render
    if(typeof window[page.render]!=='function'){
      const c=$('#content'); if(c) c.innerHTML='<div class="empty"><div class="e-ic">⏳</div>Loading…</div>';
      ensureLazyModules().then(()=>{ if(typeof window[page.render]==='function') window[page.render](page); else if(c) c.innerHTML='<div class="empty">Could not load this page. Please refresh.</div>'; }).catch(()=>{});
      return;
    }
    return window[page.render](page);
  }
  if(mod==='checklist') return renderChecklist();
  if(!DB.modules[mod]){ location.hash='#/home'; return; }
  renderModule(mod, State.route.tab||defaultTab());
  window.scrollTo(0,0);
}

/* ============================================================ HOME */
function renderHome(){
  setAccent('#4f46e5'); setCrumb('🏠','Dashboard',`${DB.brand.org} · ${superScopeLabel()}`);
  const u=me();
  let totalOpen=0,critical=0,records=0;
  DB.order.forEach(id=>{ totalOpen+=openCount(id); records+=scopedRecords(id).length;
    critical+=scopedRecords(id).filter(r=>['Critical','Major'].includes(r.severity)||r.priority==='Critical').length; });
  const stores=isSuper()?DB.stores.length:1;
  const opsTiles = DB.order.map(id=>tileFor(id)).join('');
  const hrTiles = ['violation','reward','training','birthday'].map(id=>tileFor(id)).join('');
  const feed = recentFeed().map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div>
    <div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('');
  $('#content').innerHTML = `
    <div class="hero"><div class="glow">${isAdmin()?'🏢':'🧑‍💼'}</div>
      <h2>Hi, ${esc(u.name.split(' ')[0])} 👋</h2>
      <p>${isSuper()?'Cross-store command centre — operations, staff, compliance and people risk in real time.':isAdmin()?`MCQ ${esc(State.branch)} command centre — store operations, staff and compliance in real time.`:'Your store workspace — run checklists and log issues fast.'}</p>
      <div class="hero-stats">
        <div class="hs"><b>${stores}</b><span>${stores>1?'Stores':'Store'}</span></div>
        <div class="hs"><b>${totalOpen}</b><span>Open items</span></div>
        <div class="hs"><b>${critical}</b><span>Critical / Major</span></div>
        <div class="hs"><b>${records}</b><span>Records</span></div>
      </div></div>
    ${window.ckTodayStripHTML?ckTodayStripHTML():''}
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
  const storeOpts=isSuper()?['All stores',...DB.stores]:[State.branch];
  $('#view').innerHTML=`
    <div class="toolbar"><span class="count-chip" id="rec-count">…</span>
      <div class="filter"><label>Store</label><select id="f-store" ${isSuper()?'':'disabled'}>${opts(storeOpts)}</select></div>
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
  body.innerHTML=rows.map(r=>`<tr onclick='openDetail("${m.id}","${esc(r.id)}","${ckJS(r.store||'')}")'>${m.columns.map(c=>`<td class="${c.kind==='num'?'num':''}">${cell(r,c)}</td>`).join('')}</tr>`).join('');
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
  if(f.key==='store' && !isSuper()) ctrl=`<input type="hidden" name="store" value="${esc(State.branch)}"><input value="${esc(State.branch)}" disabled>`;
  else if(f.type==='select') ctrl=`<select name="${f.key}"${rq}><option value="">-- Select --</option>${opts(f.options)}</select>`;
  else if(f.type==='staffadd'){
    // pick ANY active staff member of the store (drivers listed first), OR type a brand-new
    // name to register them. Used for the Delivery "driver / delivery person" field.
    const listId='dl_'+f.key; const base=(f.options||[]).slice();
    try{ const mine=(DB.staff||[]).filter(s=>(isSuper()||s.store===State.branch)&&s.active!==0);
      mine.filter(s=>/driv/i.test((s.role||'')+' '+(s.dept||''))).forEach(s=>{ if(!base.includes(s.name)) base.push(s.name); });
      mine.forEach(s=>{ if(!base.includes(s.name)) base.push(s.name); });
    }catch(e){}
    ctrl=`<input list="${listId}" name="${f.key}"${rq} autocomplete="off" placeholder="Pick a name, or type a new one to add"><datalist id="${listId}">${base.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>`;
  }
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
  const writeStore=storeForWrite(obj.store);
  const id=makeRecordId(m.idPrefix,writeStore);
  const rec=Object.assign({id,created:new Date().toISOString().slice(0,16).replace('T',' '),store:writeStore,status:m.statuses[0],
    severity:obj.severity||obj.priority,priority:obj.priority,summary:obj.whatHappened||obj.shortDescription||obj.issueDescription||obj.description||obj.caseDetails,
    issue:obj.issueDescription,shortDescription:obj.shortDescription,category:obj.category||obj.issueCategory||obj.concernCategory,
    equipment:obj.equipmentName,type:obj.incidentType,employee:obj.employeeName,step:obj.step||obj.disciplinaryStep,department:obj.department,age:0},obj);
  rec.store=storeForWrite(rec.store);
  // Delivery driver name: if a brand-new name was typed, register them as a Driver staff member
  if(modId==='delivery' && obj.driverName) ensureDriverStaff(obj.driverName, rec.store);
  auditLog('create',modId,rec.id,rec.store,null,rec);
  m.records.unshift(rec); if(window.persist) window.persist(); e.target.reset();
  toast(`${m.short} submitted — ${id}`); buildSidebar(); go(modId,'records');
}
function ensureDriverStaff(name, store){
  name=String(name||'').trim(); if(!name) return;
  store=store||State.branch;
  if((DB.staff||[]).some(s=>s.name===name && s.store===store)) return;  // already a staff member here
  const rec={ id:(typeof storeCode==='function'?storeCode(store):'STF')+'-'+String(20000+Math.floor(Math.random()*9000)),
    name, role:'Driver', dept:'Logistics', store, phone:'', email:'', gender:'', dob:'',
    start:new Date().toISOString().slice(0,10), active:1 };
  DB.staff=DB.staff||[]; DB.staff.unshift(rec);
  try{ auditLog('create','staff',rec.id,store,null,rec); }catch(e){}
  toast(`👤 ${name} added to Staff Members (Driver)`);
}

/* ============================================================ DETAIL DRAWER */
function findScopedRecord(modId,id,store){
  const m=DB.modules[modId]; if(!m||!m.records) return null;
  if(!isSuper()) return m.records.find(x=>x.id===id && x.store===State.branch)||null;
  if(store) return m.records.find(x=>x.id===id && x.store===store)||null;
  return m.records.find(x=>x.id===id)||null;
}
function openDetail(modId,id,store){
  const m=DB.modules[modId]; const r=findScopedRecord(modId,id,store); if(!r) return;
  if(!recordInScope(r)){ toast('This record belongs to another store'); return; }
  const skip=new Set(['id','created','age','photo']);
  const rows=Object.entries(r).filter(([k,v])=>!skip.has(k)&&v!==''&&v!=null).map(([k,v])=>{
    const isB=m.severities.includes(v)||m.statuses.includes(v)||TONES[v];
    return `<dt>${esc(prettyKey(k))}</dt><dd>${isB?badge(v):esc(v)}</dd>`;}).join('');
  const photoBlk=r.photo?`<div class="section-title" style="margin-top:4px">📷 Photo</div><a href="${imgSrc(r.photo)}" target="_blank" rel="noopener"><img src="${imgSrc(r.photo)}" style="max-width:100%;border-radius:12px;border:1px solid var(--line);margin-bottom:14px"></a>`:'';
  const canEdit=isAdmin() && recordInScope(r);
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic">${m.icon}</div>
    <div><div style="font-weight:840;font-size:16px">${esc(r.id)}</div><div style="color:var(--muted);font-size:12.5px">${esc(m.label)} · ${esc(r.store||'')} ${r.created?'· '+esc(r.created):''}</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${r.severity?badge(r.severity):''}${r.priority&&r.priority!==r.severity?badge(r.priority):''}${r.step?badge(r.step):''}${r.status?badge(r.status):''}</div></div>
    <button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body">
    ${photoBlk}
    ${canEdit?`<div class="section-title" style="margin-top:4px">Edit record <span class="badge info" style="margin-left:6px">Admin · full access</span></div>
      <div class="grid2">${editFields(r,m)}</div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primary" style="flex:1" onclick="recSaveAll('${modId}','${esc(id)}','${ckJS(r.store||'')}')">💾 Save changes</button>
        <button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="recDelete('${modId}','${esc(id)}','${ckJS(r.store||'')}')"><i class="fas fa-trash"></i>&nbsp; Delete</button>
      </div>`
      :`<dl class="dl">${rows}</dl><div class="rail-tip" style="margin-top:20px">👀 Viewing as Staff. Head Office can edit &amp; close this record.</div>`}</div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function reviewField(f,r){
  const val=r[f.key]!=null?r[f.key]:''; let ctrl;
  if(f.key==='store' && !isSuper()) ctrl=`<input id="d-store" type="hidden" value="${esc(State.branch)}"><input value="${esc(State.branch)}" disabled>`;
  else if(f.type==='select') ctrl=`<select id="d-${f.key}"><option value=""></option>${(f.options||[]).map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(f.type==='textarea') ctrl=`<textarea id="d-${f.key}" placeholder="${esc(f.label)}…">${esc(val)}</textarea>`;
  else ctrl=`<input id="d-${f.key}" type="${f.type||'text'}" value="${esc(val)}" placeholder="${esc(f.label)}…">`;
  return `<div class="field ${f.full?'full':''}"><label>${esc(f.label)}</label>${ctrl}</div>`;
}
function reviewSave(modId,id,store){
  const m=DB.modules[modId]; const r=findScopedRecord(modId,id,store);
  if(!r || !recordInScope(r)){ toast('This record belongs to another store'); return; }
  const before=JSON.parse(JSON.stringify(r));
  (m.review||[{key:'status'}]).forEach(f=>{const el=document.getElementById('d-'+f.key); if(el&&el.value!=='') r[f.key]=el.value;});
  if(!isSuper()) r.store=State.branch;
  auditLog('review',modId,r.id,r.store,before,r);
  if(window.persist) window.persist();
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
function recSaveAll(modId,id,store){
  const m=DB.modules[modId]; const r=findScopedRecord(modId,id,store); if(!r) return;
  if(!recordInScope(r)){ toast('This record belongs to another store'); return; }
  const before=JSON.parse(JSON.stringify(r));
  Object.keys(r).forEach(k=>{ const el=document.getElementById('d-'+k); if(el){ r[k]=el.value; } });
  r.store=storeForWrite(r.store);
  if(r.priority && m.id==='maintenance') r.severity=r.priority;
  auditLog('update',modId,r.id,r.store,before,r);
  if(window.persist) window.persist();
  closeDrawer(); toast(`${id} saved`); buildSidebar(); render();
}
function recDelete(modId,id,store){
  if(!confirm('Delete this record permanently?')) return;
  const m=DB.modules[modId]; const i=m.records.findIndex(x=>x.id===id && (isSuper()?(!store||x.store===store):x.store===State.branch));
  if(i>=0 && !recordInScope(m.records[i])){ toast('This record belongs to another store'); return; }
  if(i>=0){ const before=JSON.parse(JSON.stringify(m.records[i])); auditLog('delete',modId,before.id,before.store,before,null); m.records.splice(i,1); }
  if(window.persist) window.persist();
  closeDrawer(); toast(`${id} deleted`); buildSidebar(); render();
}
function closeDrawer(){ $('#drawer')?.classList.remove('open'); $('#drawer-mask')?.classList.remove('open'); }
function refreshBell(){ try{ const n=(window.ckAttentionCount?ckAttentionCount():0); const el=$('#tb-bell-n'); if(el){ el.textContent=n>99?'99+':n; el.style.display=n?'':'none'; } const b=$('#tb-bell'); if(b) b.classList.toggle('has',n>0); }catch(e){} }

/* ---------- command palette (Cmd/Ctrl-K) ---------- */
function cmdKResults(q){
  q=(q||'').trim().toLowerCase(); const out=[];
  const vis=m=>!((m.admin&&!isAdmin())||(m.super&&!isSuper()));
  const inScope=store=>isSuper()||store===State.branch;
  const pages=[['home','fa-gauge-high','Dashboard'],['checklist','fa-clipboard-check','Store Checklist']];
  Object.entries(DB.customPages||{}).forEach(([id,p])=>{ if(vis(p)) pages.push([id,'fa-file-lines',p.label]); });
  Object.entries(DB.modules||{}).forEach(([id,m])=>{ if(vis(m)) pages.push([id,'fa-folder-open',m.label||m.short]); });
  pages.filter(p=>!q||p[2].toLowerCase().includes(q)).slice(0,q?5:8).forEach(p=>out.push({icon:p[1],title:p[2],sub:'Open page',onclick:`go('${p[0]}')`}));
  if(q){
    (DB.staff||[]).filter(s=>inScope(s.store)&&String(s.name||'').toLowerCase().includes(q)).slice(0,6)
      .forEach(s=>out.push({icon:'fa-user',title:s.name,sub:'Staff'+(s.role?' · '+s.role:'')+(isSuper()?' · '+s.store:''),onclick:`go('staff');setTimeout(function(){if(window.staffEditOpen)staffEditOpen('${String(s.id).replace(/'/g,'')}');},80)`}));
    Object.entries(DB.modules||{}).forEach(([id,m])=>{ if(!vis(m))return; (m.records||[]).filter(r=>inScope(r.store)&&JSON.stringify(r).toLowerCase().includes(q)).slice(0,4)
      .forEach(r=>out.push({icon:'fa-file-lines',title:(r.id||m.short||id)+' · '+String(r.title||r.summary||r.equipment||r.category||r.staffName||'').slice(0,38),sub:m.label||id,onclick:`go('${id}')`})); });
    (((DB.checklist||{}).items)||[]).map(ckItem).filter(r=>ckStoreOk(r)&&String(r.task).toLowerCase().includes(q)).slice(0,5)
      .forEach(r=>out.push({icon:'fa-square-check',title:r.task,sub:'Checklist · '+r.dept,onclick:`go('checklist')`}));
  }
  return out.slice(0,20);
}
function cmdKRender(q){ const res=$('#cmdk-res'); if(!res) return; const items=cmdKResults(q);
  res.innerHTML=items.length?items.map(a=>`<button class="cmdk-row" onclick="cmdKClose();${a.onclick}"><span class="cmdk-ic"><i class="fas ${a.icon}"></i></span><span class="cmdk-main"><b>${esc(a.title)}</b><small>${esc(a.sub)}</small></span></button>`).join(''):'<div class="cmdk-empty">No matches.</div>'; }
function cmdK(){
  if(!State.account) return;
  let ov=$('#cmdk');
  if(!ov){ ov=document.createElement('div'); ov.id='cmdk'; ov.className='cmdk-ov'; ov.onclick=e=>{ if(e.target===ov) cmdKClose(); };
    ov.innerHTML=`<div class="cmdk-box"><div class="cmdk-in"><i class="fas fa-magnifying-glass"></i><input id="cmdk-input" placeholder="Search staff, records, tasks, pages…" autocomplete="off"><kbd>Esc</kbd></div><div class="cmdk-res" id="cmdk-res"></div></div>`;
    document.body.appendChild(ov);
    const inp=$('#cmdk-input',ov);
    inp.addEventListener('input',()=>cmdKRender(inp.value));
    inp.addEventListener('keydown',e=>{ if(e.key==='Escape')cmdKClose(); else if(e.key==='Enter'){ const f=ov.querySelector('.cmdk-row'); if(f)f.click(); } });
  }
  ov.classList.add('show'); const inp=$('#cmdk-input',ov); inp.value=''; cmdKRender(''); setTimeout(()=>inp.focus(),30);
}
function cmdKClose(){ const ov=$('#cmdk'); if(ov) ov.classList.remove('show'); }
document.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ if(!State.account) return; e.preventDefault(); cmdK(); } });

/* ============================================================ LAZY LOADERS
   Heavy libraries (Chart.js, jsPDF) and rarely-used local modules (pages2.js,
   ai.js) are loaded ON DEMAND so the login/first paint is fast. None of this
   touches data save/load. */
const _mcqScripts={};
function mcqLoadScript(src){ if(_mcqScripts[src]) return _mcqScripts[src];
  _mcqScripts[src]=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true;
    s.onload=()=>res(true); s.onerror=()=>{ delete _mcqScripts[src]; rej(new Error('load '+src)); };
    document.head.appendChild(s); });
  return _mcqScripts[src]; }
function ensureChart(){ return window.Chart?Promise.resolve(true):mcqLoadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js').catch(()=>false); }
function ensureJsPDF(){ return (window.jspdf&&window.jspdf.jsPDF)?Promise.resolve(true):mcqLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').catch(()=>false); }
function _assetVer(){ try{ const s=[...document.scripts].find(x=>/assets\/app\.js/.test(x.src||'')); const m=s&&(s.src.match(/\?v=[\w.-]+/)); return m?m[0]:''; }catch(e){ return ''; } }
let _lazyModsP;
function ensureLazyModules(){ if(_lazyModsP) return _lazyModsP; const v=_assetVer();
  _lazyModsP=Promise.all(['assets/pages2.js','assets/ai.js'].map(a=>mcqLoadScript(a+v).catch(()=>false)));
  return _lazyModsP; }
window.ensureJsPDF=ensureJsPDF; window.ensureChart=ensureChart; window.ensureLazyModules=ensureLazyModules;

/* ============================================================ CHARTS */
function destroyCharts(){ State.charts.forEach(c=>{try{c.destroy()}catch(e){}}); State.charts=[]; }
function mkChart(id,cfg){ const el=$('#'+id); if(!el) return;
  if(window.Chart){ State.charts.push(new Chart(el,cfg)); return; }
  // lazy: page paints now, the chart fills in a moment later once Chart.js loads
  ensureChart().then(()=>{ const e=$('#'+id); if(e && window.Chart) State.charts.push(new Chart(e,cfg)); }).catch(()=>{}); }
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
/* Reusable photo lightbox — tap/Esc to close, click image to toggle zoom */
function openLightbox(src){ if(!src) return; let ov=document.getElementById('mcq-lightbox');
  if(!ov){ ov=document.createElement('div'); ov.id='mcq-lightbox'; ov.className='lb-overlay';
    ov.innerHTML='<button class="lb-x" aria-label="Close">✕</button><img class="lb-img" alt="">';
    ov.addEventListener('click',e=>{ if(e.target===ov||e.target.classList.contains('lb-x')) closeLightbox(); });
    ov.querySelector('.lb-img').addEventListener('click',function(){ this.classList.toggle('zoomed'); });
    document.body.appendChild(ov);
  }
  ov.querySelector('.lb-img').classList.remove('zoomed');
  ov.querySelector('.lb-img').src=src; ov.style.display='flex';
}
function closeLightbox(){ const ov=document.getElementById('mcq-lightbox'); if(ov) ov.style.display='none'; }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLightbox(); });
Object.assign(window,{go,openDetail,closeDrawer,submitForm,reviewSave,recSaveAll,recDelete,logout,doLogin,togglePw,updateLoginHint,faceIdLogin,closeFid,toggleGroup,toggleSidebar,closeSidebarM,openLightbox,closeLightbox});
async function boot(){
  try{ const saved=sessionStorage.getItem('mcq_acct'); if(saved){ State.account=JSON.parse(saved); State.branch=State.account.branch; State.role=State.account.role==='staff'?'store':'ho'; } }catch(e){}
  if(State.account){
    setBootMessage(`Opening ${syncScopeLabel(State.account)} workspace...`,'Using cached data while cloud sync starts');
    hydrateAccountData();
    enterApp();
    startAccountSync();
  } else showLogin();
}
document.addEventListener('DOMContentLoaded',boot);
