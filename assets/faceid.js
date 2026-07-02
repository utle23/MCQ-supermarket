/* ============================================================================
   REAL Face ID via WebAuthn platform authenticator (device Face ID / Touch ID /
   Windows Hello). No face data is stored — only a device-bound credential id,
   mapped to a branch + role. Multiple Face IDs can be enrolled (one per person /
   per branch) on the same device; on login the matched credential decides which
   branch/role to sign in as. Device-bound: enroll on each device that will use it.
   ============================================================================ */
window.MCQFace = (function(){
  var LS = 'mcq_faceids';
  function b64u(buf){ var b=new Uint8Array(buf), s=''; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function unb64u(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); var pad=s.length%4?'='.repeat(4-s.length%4):''; var bin=atob(s+pad); var u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u.buffer; }
  function load(){ try{ return JSON.parse(localStorage.getItem(LS)||'[]'); }catch(e){ return []; } }
  function store(list){ try{ localStorage.setItem(LS, JSON.stringify(list)); }catch(e){} }
  function rand(n){ var u=new Uint8Array(n); crypto.getRandomValues(u); return u; }
  async function supported(){ if(!window.PublicKeyCredential) return false; try{ return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }catch(e){ return false; } }

  async function enroll(branch, role, label){
    if(!window.PublicKeyCredential) throw new Error('WebAuthn not supported on this device');
    var cred = await navigator.credentials.create({ publicKey:{
      challenge: rand(32),
      rp:{ name:'MCQ Supermarket', id: location.hostname },
      user:{ id: rand(16), name:(label||branch)+' · '+role, displayName:(label||branch)+' ('+role+')' },
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout:60000, attestation:'none'
    }});
    var id=b64u(cred.rawId);
    var list=load().filter(function(x){return x.id!==id;});
    var entry={ id:id, branch:branch, role:role, label:label||branch, created:new Date().toISOString().slice(0,10) };
    list.push(entry); store(list);
    try{ DB.faceCreds=DB.faceCreds||[]; if(!DB.faceCreds.find(function(x){return x.id===id;})){ DB.faceCreds.push(Object.assign({device:(navigator.platform||'device')},entry)); if(window.persist) window.persist(); } }catch(e){}
    return entry;
  }
  // credentials for ONE store (plus super/Head-Office, which works at any store)
  function listFor(branch){ var all=load(); return branch ? all.filter(function(c){return c.branch===branch||c.role==='super';}) : all; }
  async function login(branch){
    if(!window.PublicKeyCredential) throw new Error('WebAuthn not supported on this device');
    var list=listFor(branch);
    if(!list.length) throw new Error(branch ? ('No Face ID set up for '+branch+' on this device') : 'No Face ID set up on this device');
    var assertion = await navigator.credentials.get({ publicKey:{
      challenge: rand(32), timeout:60000, userVerification:'required', rpId: location.hostname,
      allowCredentials: list.map(function(c){ return {type:'public-key', id: unb64u(c.id), transports:['internal']}; })
    }});
    var id=b64u(assertion.rawId), match=list.find(function(c){return c.id===id;});
    if(!match) throw new Error(branch ? ('Face ID not recognised for '+branch) : 'Face ID not recognised on this device');
    return match;
  }
  // rebuild this device's local list from the synced DB.faceCreds (so the in-app
  // manager never looks empty after a cache clear — the WebAuthn key stays device-bound)
  function syncFromDB(){ try{ if(!window.DB||!Array.isArray(DB.faceCreds)) return; var list=load(), have={}; list.forEach(function(c){have[c.id]=1;});
    DB.faceCreds.forEach(function(c){ if(c&&c.id&&!have[c.id]){ list.push({id:c.id,branch:c.branch,role:c.role,label:c.label||c.branch,created:c.created||''}); have[c.id]=1; } });
    store(list); }catch(e){} }
  return { supported:supported, enroll:enroll, login:login, list:load, listFor:listFor, syncFromDB:syncFromDB,
    remove:function(id){ store(load().filter(function(x){return x.id!==id;})); try{ if(DB.faceCreds){ DB.faceCreds=DB.faceCreds.filter(function(x){return x.id!==id;}); if(window.persist) window.persist(); } }catch(e){} } };
})();

/* in-app enrolment — the user is already authenticated, so no login-form password needed */
async function faceEnrollInApp(){
  if(!window.PublicKeyCredential){ toast('This device does not support Face ID (WebAuthn).'); return; }
  var acct=(window.State&&State.account)||{}, role=acct.role||'staff', branch=acct.branch||'';
  var base = role==='super'?'Head Office':(role==='admin'?branch+' Manager':branch+' Dept Lead');
  // many people can enrol at the same branch — ask WHO this Face ID belongs to so they're
  // easy to tell apart later. Default suggests the next number so names never collide.
  var scope = role==='super'?'':branch;
  var same = (MCQFace.listFor(scope)||[]).filter(function(c){return c.role===role;}).length;
  var suggested = base + (same? ' '+(same+1):'');
  var person = window.prompt('Whose Face ID is this? Enter a name so it can be told apart\n(e.g. "'+base+' · Tony"):', suggested);
  if(person===null) return;                       // cancelled
  var label = (person||'').trim() || suggested;    // blank → use the numbered default
  try{ toast('Follow your device Face ID / Touch ID prompt…');
    await MCQFace.enroll(scope, role, label);
    toast('✅ Face ID added for '+label); if(window.renderFaceId) renderFaceId();
  }catch(e){ toast('Face ID setup cancelled or failed'); }
}
window.faceEnrollInApp=faceEnrollInApp;

/* password check (mirrors doLogin) so only an authorised person can enrol a branch */
function mcqAuthRole(mode,branch,pw){ if(!pw) return null; var a=(typeof DB!=='undefined'&&DB.auth)||{};
  if(mode==='super') return pw===a.superAdminPassword?'super':null;
  if(mode==='admin') return pw===((a.adminPasswords||{})[branch])?'admin':null;
  return pw===((a.branchPasswords||{})[branch])?'staff':null; }

async function faceEnroll(){
  var pwEl=document.getElementById('login-pw'), brEl=document.getElementById('login-branch');
  var modeBtn=document.querySelector('#login-mode .seg-btn.active');
  var mode=modeBtn?modeBtn.dataset.mode:'staff', branch=brEl?brEl.value:'', pw=pwEl?pwEl.value.trim():'';
  var role=mcqAuthRole(mode,branch,pw);
  if(!role){ if(window.loginFail) loginFail('Enter the correct password first, then set up Face ID.'); return; }
  if(!window.PublicKeyCredential){ toast('This browser/device does not support Face ID (WebAuthn).'); return; }
  try{
    toast('Follow your device Face ID / Touch ID prompt…');
    var label = role==='super'?'Head Office':(role==='admin'?branch+' Admin':branch);
    await MCQFace.enroll(branch, role, label);
    if(pwEl) pwEl.value='';
    toast('✅ Face ID added for '+label+' ('+role+')'); faceRefreshList();
  }catch(e){ toast('Face ID setup cancelled or failed'); }
}
function faceRefreshList(){ var el=document.getElementById('fid-list'); if(!el) return; var list=MCQFace.list();
  el.innerHTML = list.length ? '<div class="fid-list-h">🪪 Face IDs on this device</div>'+list.map(function(c){ return '<div class="fid-row"><span>'+(c.label||c.branch)+' · '+c.role+'</span><button title="Remove" onclick="faceRemove(\''+c.id+'\')">✕</button></div>'; }).join('') : '';
}
function faceRemove(id){ MCQFace.remove(id); faceRefreshList(); toast('Face ID removed'); }
window.faceEnroll=faceEnroll; window.faceRefreshList=faceRefreshList; window.faceRemove=faceRemove; window.mcqAuthRole=mcqAuthRole;
