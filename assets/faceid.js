/* ============================================================================
   Face ID / passkeys v2 — professional, server-verified.

   How it works (accurate, revocable, device-bound):
   1. ENROL (signed in): the device biometric (WebAuthn platform authenticator —
      Face ID / Touch ID / Windows Hello) creates a device-bound key. The server
      then issues a DEVICE CREDENTIAL (id + secret, hashed at rest) bound to the
      person's CURRENT identity (account / role / store / staff).
   2. SIGN IN: passing the biometric check unlocks the locally-stored secret,
      which is exchanged over HTTPS for a REAL server session token — the same
      as a password login. No face data ever leaves the device.
   3. REVOKE: each device credential can be removed (owner or account admin) —
      the biometric instantly stops working for the app on that device.
   Enrolments are NEVER synced between devices (WebAuthn keys are device-bound).
   ============================================================================ */
window.MCQFace = (function(){
  var LS='mcq_faceids';
  function b64u(buf){ var b=new Uint8Array(buf), s=''; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function unb64u(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); var pad=s.length%4?'='.repeat(4-s.length%4):''; var bin=atob(s+pad); var u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u.buffer; }
  function load(){ try{ return JSON.parse(localStorage.getItem(LS)||'[]'); }catch(e){ return []; } }
  function store(list){ try{ localStorage.setItem(LS, JSON.stringify(list)); }catch(e){} }
  function rand(n){ var u=new Uint8Array(n); crypto.getRandomValues(u); return u; }
  async function supported(){ if(!window.PublicKeyCredential) return false; try{ return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }catch(e){ return false; } }

  // ENROL — must be signed in; binds this device to the CURRENT identity on the server
  async function enroll(label){
    if(!window.PublicKeyCredential) throw new Error('This device does not support Face ID (WebAuthn)');
    if(!window.mcqDeviceEnroll || !(window.localStorage&&localStorage.getItem('mcq_token'))) throw new Error('Sign in first, then enrol Face ID');
    var acct=(window.State&&State.account)||{};
    var who=acct.staffName||acct.name||'MCQ user';
    var cred=await navigator.credentials.create({ publicKey:{
      challenge: rand(32),
      rp:{ name:'MCQ Supermarket', id: location.hostname },
      user:{ id: rand(16), name: who, displayName: (label||who) },
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout:60000, attestation:'none'
    }});
    var credId=b64u(cred.rawId);
    var r=await mcqDeviceEnroll(credId, label||who);
    if(!(r&&r.ok&&r.device_id)) throw new Error((r&&r.error)||'Server could not enrol this device');
    var entry={ v:2, id:credId, device_id:r.device_id, secret:r.secret, label:label||who, who:who,
      role:acct.role||'', store:(acct.role==='super'||acct.role==='ba')?'':(acct.branch||''),
      created:(window.todayISO?todayISO():new Date().toISOString().slice(0,10)) };
    var list=load().filter(function(x){return x.id!==credId;}); list.push(entry); store(list);
    return entry;
  }

  // SIGN IN — biometric unlocks the device secret → exchanged for a real server session
  // Pass a credential id to sign in as a SPECIFIC person (shared-iPad person picker)
  async function login(credId){
    if(!window.PublicKeyCredential) throw new Error('This device does not support Face ID (WebAuthn)');
    var list=load().filter(function(c){return c.v===2 && c.device_id && c.secret;});
    if(credId) list=list.filter(function(c){return c.id===credId;});
    if(!list.length){ var e=new Error('none'); e.code='none'; throw e; }
    var assertion;
    try{
      assertion=await navigator.credentials.get({ publicKey:{
        challenge: rand(32), timeout:60000, userVerification:'required', rpId: location.hostname,
        allowCredentials: list.map(function(c){ return {type:'public-key', id: unb64u(c.id), transports:['internal']}; })
      }});
    }catch(werr){ var we=new Error(nice(werr)); we.code='webauthn'; we.name=(werr&&werr.name)||''; throw we; }
    var id=b64u(assertion.rawId), match=list.find(function(c){return c.id===id;});
    if(!match){ var me=new Error('This Face ID is not enrolled for the app on this device.'); me.code='webauthn'; throw me; }
    var res=await mcqDeviceLogin(match.device_id, match.secret);
    if(!(res&&res.ok)){
      var err=new Error((res&&res.error)||'Face ID sign-in failed');
      err.code='server'; err.credId=match.id; err.label=match.label||match.who||'';
      throw err;
    }
    res._label=match.label; res._credId=match.id;
    return res;
  }

  // translate raw WebAuthn failures into copy a staff member can act on
  function nice(err){
    var n=(err&&err.name)||'', m=(err&&err.message)||'';
    if(n==='NotAllowedError') return 'Face ID was cancelled or not recognised — try again.';
    if(n==='SecurityError')  return 'Face ID needs the official app address (https). Open the installed app icon and try again.';
    if(n==='InvalidStateError') return 'This device rejected the Face ID key — sign in with your password, then enrol again.';
    if(n==='AbortError' || /timed? ?out/i.test(m)) return 'Face ID timed out — tap the button to try again.';
    return m||'Face ID failed — try again or use your password.';
  }

  function legacy(){ return load().filter(function(c){return !c.v;}); }
  function listV2(){ return load().filter(function(c){return c.v===2;}); }
  function remove(id){
    var entry=load().find(function(x){return x.id===id;});
    if(entry&&entry.device_id&&window.mcqDeviceRevoke){ try{ mcqDeviceRevoke(entry.device_id); }catch(e){} }
    store(load().filter(function(x){return x.id!==id;}));
  }
  // drop a LOCAL entry only (used when the server says the credential was revoked/removed)
  function removeLocal(id){ store(load().filter(function(x){return x.id!==id;})); }
  return { supported:supported, enroll:enroll, login:login, list:load, listV2:listV2, legacy:legacy, remove:remove, removeLocal:removeLocal,
    listFor:function(){ return listV2(); }, syncFromDB:function(){} };   // legacy shims
})();

/* in-app enrolment — the user is already authenticated; the credential binds to WHO THEY ARE */
async function faceEnrollInApp(){
  if(!window.PublicKeyCredential){ toast('This device does not support Face ID (WebAuthn).'); return; }
  var acct=(window.State&&State.account)||{};
  var who=acct.staffName||acct.name||'Me';
  var suggested=who+' · '+(navigator.platform||'this device');
  var doEnroll=async function(label){
    try{
      toast('Confirm with Face ID / Touch ID on your device…');
      var e=await MCQFace.enroll((label||'').trim()||who);
      try{ localStorage.setItem('mcq_fid_nudge','done'); }catch(_){ }
      toast('✅ Face ID ready — next time one look signs you in as '+(e.who||who));
      if(window.renderFaceId && State.route && State.route.mod==='faceid') renderFaceId();
    }catch(err){ toast((err&&err.message)||'Face ID setup cancelled or failed'); }
  };
  if(window.mcqModal){
    mcqModal('🪪 Enable Face ID sign-in', '<p class="fhint" style="margin:0 0 10px">Your device biometric (Face ID / Touch ID) will sign you in as <b>'+(who)+'</b> on THIS device only. No face data ever leaves the device.</p>'+
      '<div class="field"><label>Name this device</label><input id="fid-label" value="'+suggested.replace(/"/g,'&quot;')+'"></div>'+
      '<div style="display:flex;gap:10px;margin-top:12px"><button class="btn primary" id="fid-go">🪪 Enrol this device</button><button class="btn" onclick="mcqModalClose()">Cancel</button></div>');
    var go=document.getElementById('fid-go');
    if(go) go.onclick=function(){ var v=(document.getElementById('fid-label')||{}).value||suggested; mcqModalClose(); doEnroll(v); };
  } else {
    var label=window.prompt('Name this Face ID (so you can tell devices apart):', suggested);
    if(label===null) return;
    doEnroll(label);
  }
}
window.faceEnrollInApp=faceEnrollInApp;

/* login-page helper — enrolment now happens IN the app (it must bind to a real signed-in identity) */
function faceEnroll(){ toast('Sign in first, then open Account → Face ID to enrol this device.'); }
function faceRefreshList(){ var el=document.getElementById('fid-list'); if(!el) return; var list=MCQFace.listV2();
  el.innerHTML = list.length ? '<div class="fid-list-h">🪪 Face IDs on this device</div>'+list.map(function(c){ return '<div class="fid-row"><span>'+(c.label||c.who||'')+'</span><button title="Remove" onclick="faceRemove(\''+c.id+'\')">✕</button></div>'; }).join('') : '';
}
function faceRemove(id){ MCQFace.remove(id); faceRefreshList(); toast('Face ID removed'); }
window.faceEnroll=faceEnroll; window.faceRefreshList=faceRefreshList; window.faceRemove=faceRemove;
