/* ============================================================================
   PythonAnywhere API adapter for MCQDB.

   Activates ONLY when an API base is configured:
     localStorage.mcq_api_base = 'http://localhost:8001'      (local testing)
     or window.MCQ_API_BASE, or — when the page is served by the Flask app —
     same-origin '/api' is auto-detected.
   When NOT configured it does nothing, so the current (Firebase/offline) build
   keeps working unchanged.

   It mutates the existing window.MCQDB object in place (so imgSrc + persist keep
   working) and reuses firebase.js's buildStoreState / applyStoreState /
   aggregateStates / resetToBase — no duplicated serialization.
   ============================================================================ */
(function(){
  function detectBase(){
    var b = (window.localStorage && localStorage.getItem('mcq_api_base')) || window.MCQ_API_BASE || '';
    if(b) return b.replace(/\/$/,'');
    // if a /api/health endpoint exists on this origin (Flask serving both), use same-origin
    if(window.__MCQ_SAME_ORIGIN_API) return '';   // '' => same origin
    return null;                                    // not configured
  }
  var BASE = detectBase();
  if(BASE===null) return;                           // no backend configured → leave MCQDB as-is

  var FB = window.MCQDB; if(!FB){ return; }

  // central session-expired guard: ANY authorized /api call that returns 401 means the token
  // is gone/expired/revoked → bounce to the login screen once (never for the public auth
  // endpoints). Fixes the silent "cache-only, saves don't land" dead state.
  if(!window.__mcqFetchWrapped){
    window.__mcqFetchWrapped=true;
    var _origFetch=window.fetch.bind(window);
    var SKIP=/\/api\/(login|activate|password\/|health)/;
    window.fetch=function(input,init){
      return _origFetch(input,init).then(function(r){
        try{
          var url=(typeof input==='string'?input:(input&&input.url))||'';
          if(r&&r.status===401 && url.indexOf('/api/')>=0 && !SKIP.test(url)
             && window.localStorage && localStorage.getItem('mcq_token') && window.mcqSessionExpired){
            window.mcqSessionExpired();
          }
        }catch(e){}
        return r;
      });
    };
  }
  // server-side email relay (Brevo key lives on the server, never in the frontend/repo)
  window.MCQ_EMAIL_RELAY = (BASE||'') + '/api/send-email';
  // server-side AI Vision (OpenAI/ChatGPT key lives on the server)
  window.MCQ_AI_VISION_ENDPOINT = (BASE||'') + '/api/vision-temp';
  window.MCQ_VISION_TEXT_ENDPOINT = (BASE||'') + '/api/vision-text';
  // server-side settings (super-admin only): digest recipient emails, etc.
  window.MCQ_SETTINGS_ENDPOINT = (BASE||'') + '/api/settings';
  window.mcqSettings = {
    get:function(key){ var tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
      return fetch((BASE||'')+'/api/settings?key='+encodeURIComponent(key),{headers:{Authorization:'Bearer '+tok}})
        .then(function(r){return r.json().catch(function(){return {};});}).catch(function(){return {};}); },
    set:function(key,value){ var tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
      return fetch((BASE||'')+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({key:key,value:value})})
        .then(function(r){return r.json().catch(function(){return {};});}).catch(function(){return {ok:false};}); }
  };
  // individual staff accounts (Manager/Super create & view employee logins)
  function _authFetch(path, opts){ var tok=(window.localStorage&&localStorage.getItem('mcq_token'))||''; opts=opts||{};
    opts.headers=Object.assign({'Content-Type':'application/json',Authorization:'Bearer '+tok},opts.headers||{});
    return fetch((BASE||'')+path,opts).then(function(r){return r.json().catch(function(){return {ok:false};});}).catch(function(){return {ok:false};}); }
  window.mcqAuditLog=function(store,limit){ return _authFetch('/api/audit/'+encodeURIComponent(store)+(limit?('?limit='+limit):'')); };
  window.mcqDeputyStatus=function(store){ return _authFetch('/api/deputy/status'+(store?('?store='+encodeURIComponent(store)):'')); };
  window.mcqStaffAccount=function(store,staffId,name,reset){ return _authFetch('/api/staff-account',{method:'POST',body:JSON.stringify({store:store,staff_id:staffId,name:name,reset:!!reset})}); };
  window.mcqStaffAccounts=function(store){ return _authFetch('/api/staff-accounts/'+encodeURIComponent(store)); };
  window.mcqStaffAccountDelete=function(store,staffId){ return _authFetch('/api/staff-account/delete',{method:'POST',body:JSON.stringify({store:store,staff_id:staffId})}); };
  // employee edits ONE staff row (own profile) — patches only, never the whole store blob
  window.mcqStaffProfile=function(store,staffId,patch){ return _authFetch('/api/staff-profile',{method:'POST',body:JSON.stringify({store:store,staff_id:staffId,patch:patch||{}})}); };
  window.mcqStaffImport=function(rows){ return _authFetch('/api/staff/import',{method:'POST',body:JSON.stringify({rows:rows||[]})}); };
  window.mcqChecklistSubmit=function(sub){
    // one small checklist record → its own row. keepalive lets the POST finish even if the
    // store device navigates away or the app is closed the instant after Submit (Android),
    // so a finished checklist / verification is never lost. Body is well under the 64KB
    // keepalive limit (photos are refs, not blobs).
    var tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
    return fetch((BASE||'')+'/api/checklist/submit',{method:'POST',keepalive:true,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},
      body:JSON.stringify({sub:sub||{}})})
      .then(function(r){return r.json().catch(function(){return {ok:false};});}).catch(function(){return {ok:false};}); };
  window.mcqDeptLeads=function(store){ return _authFetch('/api/dept-leads/'+encodeURIComponent(store)); };
  // global "all-stores" notification recipients — read by everyone, saved by Super only
  window.mcqNotifyConfig=function(){ return _authFetch('/api/notify-config'); };
  window.mcqNotifyConfigSave=function(config){ return _authFetch('/api/notify-config',{method:'POST',body:JSON.stringify({config:config||{recipients:[]}})}); };
  window.mcqDeptLeadRemove=function(payload){ return _authFetch('/api/dept-lead/remove',{method:'POST',body:JSON.stringify(payload||{})}); };
  // ---- inbox / messaging ----
  window.mcqMsgSend=function(payload){ return _authFetch('/api/message',{method:'POST',body:JSON.stringify(payload||{})}); };
  window.mcqMsgList=function(){ return _authFetch('/api/messages'); };
  window.mcqMsgRead=function(id){ return _authFetch('/api/message/read',{method:'POST',body:JSON.stringify({id:id})}); };
  window.mcqThread=function(threadId){ return _authFetch('/api/thread/'+encodeURIComponent(threadId)); };
  window.mcqMyPassword=function(){ return _authFetch('/api/my-password'); };   // employee views their own login password
  // cached unread count for sidebar/topbar badges (refreshed by the light poll)
  window.__inboxUnread=0;
  window.inboxUnread=function(){ return window.__inboxUnread||0; };
  window.mcqRefreshUnread=function(){
    if(!(window.localStorage&&localStorage.getItem('mcq_token'))) return Promise.resolve(0);
    return _authFetch('/api/messages/unread').then(function(r){ var n=(r&&r.unread)||0; var changed=(n!==window.__inboxUnread); window.__inboxUnread=n;
      if(changed){ try{ if(window.buildSidebar)buildSidebar(); if(window.refreshInboxBadge)refreshInboxBadge(); }catch(e){}
        // new mail while the Inbox page is open → refresh the list in place (no manual reload)
        try{ if(window.State&&State.route&&State.route.mod==='inbox' && window.mcqMsgList && window.inboxPaint && !document.getElementById('mcq-modal')){
          mcqMsgList().then(function(rr){ inboxPaint((rr&&rr.messages)||[]); }); } }catch(e){}
      } return n; }).catch(function(){ return window.__inboxUnread; }); };
  // ---- AI Assistant (parse only; execution stays on the normal store-scoped endpoints) ----
  window.mcqAiCommand=function(text,roster,stores,rules){ return _authFetch('/api/ai-command',{method:'POST',body:JSON.stringify({text:text,roster:roster||[],stores:stores||[],rules:rules||[]})}); };
  // ---- central account management (account admin only) ----
  window.mcqAccounts=function(q){ return _authFetch('/api/accounts'+(q?('?q='+encodeURIComponent(q)):'')); };
  window.mcqAccountCreate=function(payload){ return _authFetch('/api/account/create',{method:'POST',body:JSON.stringify(payload||{})}); };
  window.mcqAccountUpdate=function(id,patch){ return _authFetch('/api/account/update',{method:'POST',body:JSON.stringify({id:id,patch:patch||{}})}); };
  window.mcqAccountDelete=function(id){ return _authFetch('/api/account/delete',{method:'POST',body:JSON.stringify({id:id})}); };
  // ---- message attachments (Gmail-style; 30MB/file, uploaded as real file parts) ----
  window.mcqFileUpload=function(file,onProgress){
    return new Promise(function(res,rej){
      var fd=new FormData(); fd.append('file',file,file.name||'file');
      var x=new XMLHttpRequest(); x.open('POST', api('/api/file'));
      x.setRequestHeader('Authorization','Bearer '+TOKEN);
      if(x.upload&&onProgress) x.upload.onprogress=function(e){ if(e.lengthComputable) onProgress(Math.round(e.loaded*100/e.total)); };
      x.onload=function(){ try{ var j=JSON.parse(x.responseText||'{}'); if(x.status<300&&j.ok) res(j); else rej(new Error(j.error||('upload failed ('+x.status+')'))); }catch(e){ rej(e); } };
      x.onerror=function(){ rej(new Error('network')); };
      x.send(fd);
    });
  };
  window.mcqFileDownload=function(id,name){
    return fetch(api('/api/file/'+encodeURIComponent(id)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('download '+r.status); return r.blob(); })
      .then(function(b){ var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download=name||'file';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },4000); return true; })
      .catch(function(e){ if(window.toast) toast('Could not download the file'); throw e; });
  };
  // ---- announcements ----
  window.mcqAnnList=function(){ return _authFetch('/api/announcements'); };
  window.mcqAnnPost=function(payload){ return _authFetch('/api/announcement',{method:'POST',body:JSON.stringify(payload||{})}); };
  window.mcqAnnDelete=function(id){ return _authFetch('/api/announcement/delete',{method:'POST',body:JSON.stringify({id:id})}); };
  window.mcqAnnRead=function(id){ return _authFetch('/api/announcement/read',{method:'POST',body:JSON.stringify({id:id})}); };
  window.mcqAnnPin=function(id,pinned){ return _authFetch('/api/announcement/pin',{method:'POST',body:JSON.stringify({id:id,pinned:!!pinned})}); };
  // explicit delete — the per-store save MERGES (never mass-deletes), so real deletions
  // are propagated here. table: records|staff|checklist_submissions|bin_records|schedule_history
  window.mcqDeleteRecords = function(table, ids, opts){
    try{
      var tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
      var store=(opts&&opts.store)||(window.State&&State.branch)||'';
      var body={store_id:store, table:table};
      if(opts&&opts.all) body.all=true; else body.ids=(ids||[]).map(String);
      return fetch((BASE||'')+'/api/delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body)}).catch(function(){});
    }catch(e){}
  };
  var TOKEN = (window.localStorage && localStorage.getItem('mcq_token')) || '';
  var api = function(p){ return (BASE||'') + p; };
  function headers(json){ var h={}; if(json) h['Content-Type']='application/json'; if(TOKEN) h['Authorization']='Bearer '+TOKEN; return h; }
  function setToken(t){ TOKEN=t||''; try{ TOKEN?localStorage.setItem('mcq_token',TOKEN):localStorage.removeItem('mcq_token'); }catch(e){} }
  // NB: DB is a top-level `const` (NOT on window), so use the lexical DB, not window.DB
  // (the old `window.DB && ...` made this return [] → Super Admin never saved!).
  function stores(){ try{ var b=DB.branches||DB.stores||[]; return b&&b.length?b:[]; }catch(e){ return []; } }

  FB._api = true;
  FB.enabled = true;
  FB.apiBase = BASE;
  FB.ready = Promise.resolve(true);
  FB.lastSync = FB.lastSync || {status:'loading',message:'Connecting to server…'};

  // ---- auth ----
  FB.login = function(mode, store, password, id){
    return fetch(api('/api/login'), {method:'POST', headers:headers(true), body:JSON.stringify({mode:mode,store:store,password:password,id:id||undefined})})
      .then(function(r){ return r.json().catch(function(){return {ok:false};}); })
      .then(function(d){ if(d&&d.ok&&d.token){ setToken(d.token); FB._role=d.role; FB._stores=d.stores||[]; } return d||{ok:false}; })
      .catch(function(){ return {ok:false, error:'Cannot reach server'}; });
  };
  FB.logout = function(){ setToken(''); };
  // ---- Face ID / passkey device credentials (biometric unlocks a server-verified sign-in) ----
  window.mcqDeviceEnroll=function(credId,label){ return _authFetch('/api/device/enroll',{method:'POST',body:JSON.stringify({cred_id:credId,label:label})}); };
  window.mcqDeviceRevoke=function(deviceId){ return _authFetch('/api/device/revoke',{method:'POST',body:JSON.stringify({device_id:deviceId})}); };
  window.mcqDeviceLogin=function(deviceId,secret){
    return fetch(api('/api/device/login'),{method:'POST',headers:headers(true),body:JSON.stringify({device_id:deviceId,secret:secret})})
      .then(function(r){ return r.json().catch(function(){return {ok:false};}); })
      .then(function(d){ if(d&&d.ok&&d.token){ setToken(d.token); FB._role=d.role; FB._stores=d.stores||[]; } return d||{ok:false}; })
      .catch(function(){ return {ok:false, error:'Cannot reach server'}; });
  };

  // ---- per-store state ----
  function getState(store){ return fetch(api('/api/state/'+encodeURIComponent(store)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('state '+r.status); return r.json(); }); }
  function setSave(status,msg){ FB.lastSync={status:status,message:msg};
    try{ if(window.State) State.dataSync={status:status,message:msg}; if(window.refreshSyncUi) refreshSyncUi(); }catch(e){} }
  var saveDirty=false;   // a save failed → keep retrying until the server confirms
  var _storeHash={};     // store -> JSON of the last state successfully saved (super: skip unchanged stores)
  var CLIENT_ID='c'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  FB.clientId=CLIENT_ID;
  function postState(store, prebuilt){
    var state = prebuilt || (FB.buildStoreState ? FB.buildStoreState(store) : null);
    // SUPER sessions hold ONE aggregated template in memory (last-loaded store wins) — posting
    // it would copy one store's checklist onto another. Super edits templates only through
    // Store Config, so strip the template fields here; the server keeps each store's own.
    try{ var acct0=(window.State&&State.account)||{};
      if(state && (acct0.role==='super'||acct0.role==='ba')){ delete state.checklistItems; delete state.checklistTemplateVersion; delete state.checklistDeadlines; }
    }catch(e){}
    // mirror locally FIRST so the data survives even if the network/tab dies before the POST lands
    try{ if(state && FB.writeCache) FB.writeCache(store, state); }catch(e){}
    // SPEED: every checklist submission (create AND verify) is saved to its own row via
    // /api/checklist/submit and rebuilt from that table on load — so the growing history array
    // does NOT need to ride along in every routine whole-store save. Dropping it here keeps the
    // POST body small and fast even for stores with months of submissions (the #1 cause of the
    // "syncing gets slower as data grows" the store devices were seeing). It stays in the local
    // cache above, so an offline reload still shows everything.
    var body=state;
    try{ if(state && state.checklistSubs!=null){ body={}; for(var k in state){ if(k!=='checklistSubs') body[k]=state[k]; } } }catch(e){ body=state; }
    // NOTE: no `keepalive` — the full state often exceeds the 64KB keepalive limit, which would
    // make fetch throw and silently drop the save. Durability on unload is covered by the local
    // cache mirror above + the awaited logout flush + the retry loop.
    return fetch(api('/api/state/'+encodeURIComponent(store)), {method:'POST', headers:headers(true), body:JSON.stringify({state:body, client:CLIENT_ID})})
      .then(function(r){ if(!r.ok) throw new Error('save '+r.status); return r.json().catch(function(){return {};}); });
  }

  FB.loadForAccount = function(account){
    account = account || (window.State&&State.account) || {role:'super',branch:'All stores'};
    // instant paint from cache first
    if(FB.hydrateFromCache){ try{ FB.hydrateFromCache(account); }catch(e){} }
    if(!TOKEN){ FB.lastSync={status:'local',message:'Sign in to sync with the server'}; return Promise.resolve(FB.lastSync); }
    if(account.role==='super' || account.role==='ba'){   // Chú Ba loads all stores (read-only), like super
      try{ localStorage.removeItem('mcq_dirty_super'); }catch(_){}   // super keeps its debounced/5s/logout flushes; don't force a broad re-save (could touch uncached stores)
      return fetch(api('/api/stores'), {headers:headers()}).then(function(r){return r.json();}).then(function(list){
        var ss=(list&&list.stores||[]).map(function(s){return s.id;});
        return Promise.all(ss.map(function(s){
          return getState(s).then(function(d){ return d&&d.state?{store:s,data:d.state}:null; }).catch(function(){return null;});
        })).then(function(rows){
          rows=rows.filter(Boolean);
          if(FB.resetToBase) FB.resetToBase();
          if(rows.length && FB.aggregateStates) FB.aggregateStates(rows);
          FB._loadedStores=rows.map(function(r){return r.store;});   // only these are safe for Super to save back
          FB._loaded=true;
          FB.lastSync={status:'synced',message:'Loaded '+rows.length+' store(s)'};
          if(FB.rerenderApp) FB.rerenderApp();
          return FB.lastSync;
        });
      }).catch(function(e){ FB.lastSync={status:'error',message:'Server unavailable · local data'}; return FB.lastSync; });
    }
    var store=account.branch;
    // RECONCILE: if the last session left unsaved local edits for this store (dirty flag
    // survived a hard close/crash), flush the cached in-memory state to the server FIRST
    // (merge/upsert — never deletes) so the fresh load below can't overwrite that edit.
    var flush=Promise.resolve();
    try{ if(localStorage.getItem('mcq_dirty_'+store)) flush=postState(store).catch(function(){}); }catch(_){}
    return flush.then(function(){ return getState(store); }).then(function(d){
      if(d&&d.state){ if(FB.resetToBase) FB.resetToBase(); if(FB.applyStoreState) FB.applyStoreState(d.state); if(FB.rerenderApp) FB.rerenderApp(); }
      else { FB._loaded=true; postState(store); }   // first run for this store → seed backend from local
      FB._loaded=true;
      try{ localStorage.removeItem('mcq_dirty_'+store); }catch(_){}   // reconciled — server now has everything
      FB.lastSync={status:'synced',message:'Loaded '+store};
      return FB.lastSync;
    }).catch(function(e){ FB.lastSync={status:'error',message:'Server unavailable · local data'}; return FB.lastSync; });
  };
  FB.loadAll = function(){ return FB.loadForAccount(window.State&&State.account?State.account:{role:'super'}); };

  FB.saveAll = function(){
    var acct=(window.State&&State.account)||null; if(!acct||!TOKEN) return Promise.resolve();
    if(acct.role==='ba') return Promise.resolve();   // Chú Ba is read-only — never saves
    // NOTE: server save is MERGE/upsert (never deletes), so saving any time is safe —
    // we deliberately do NOT gate on _loaded (that previously disabled saves for a whole
    // session after one load hiccup → silent data loss).
    if(acct.role==='super'){
      // NEVER save a store Super hasn't fully loaded — its blob (feedback, email config…) would be
      // written back EMPTY and wipe the server copy. Only stores returned by the multi-store load
      // are safe. If none loaded yet, skip entirely (keeps dirty flag → retried after load).
      var loaded=FB._loadedStores;
      if(!loaded || !loaded.length){ return Promise.resolve(); }
      // Only upload stores whose CONTENT changed since the last successful save (per-store
      // hash). Content-based → it can never miss a real change; it just skips the unchanged
      // stores, removing the cost of POSTing all 9 every time. On failure the hash is NOT
      // updated for that store, so the retry resends it.
      var first=Object.keys(_storeHash).length===0;   // nothing saved yet → save everything (and seed hashes)
      var skipVolatile=function(k,v){ return k==='updatedAt'?undefined:v; };  // ignore the per-build timestamp
      var changed=[];
      stores().forEach(function(s){ if(loaded.indexOf(s)<0) return;   // unloaded → skip (don't wipe its blob)
        var st=FB.buildStoreState?FB.buildStoreState(s):null; if(!st) return;
        var h=JSON.stringify(st, skipVolatile); if(first || h!==_storeHash[s]) changed.push({s:s, st:st, h:h}); });
      if(!changed.length){ try{ localStorage.removeItem('mcq_dirty_super'); }catch(_){} setSave('synced','Saved · all stores'); return Promise.resolve(); }
      setSave('loading','Saving…');
      return Promise.all(changed.map(function(c){ return postState(c.s, c.st).then(function(){ _storeHash[c.s]=c.h; try{ localStorage.removeItem('mcq_dirty_'+c.s); }catch(_){} }); }))
        .then(function(){ saveDirty=false; try{ localStorage.removeItem('mcq_dirty_super'); }catch(_){} setSave('synced','Saved · '+changed.length+' store'+(changed.length>1?'s':'')); })
        .catch(function(){ saveDirty=true; setSave('error','Save failed — retrying'); });
    }
    setSave('loading','Saving…');
    return postState(acct.branch).then(function(){ saveDirty=false; try{ localStorage.removeItem('mcq_dirty_'+acct.branch); }catch(_){} setSave('synced','Saved · '+acct.branch); })
      .catch(function(){ saveDirty=true; setSave('error','Save failed — retrying'); });
  };

  // ---- store config ----
  FB.fetchStoreConfig = function(store){
    return fetch(api('/api/store-config/'+encodeURIComponent(store)), {headers:headers()})
      .then(function(r){return r.json();}).then(function(d){ return (d&&d.config)||{store:store}; })
      .catch(function(){ return {store:store}; });
  };
  FB.saveStoreConfig = function(store,cfg){
    return fetch(api('/api/store-config/'+encodeURIComponent(store)), {method:'POST', headers:headers(true), body:JSON.stringify({config:cfg})})
      .then(function(r){return r.ok;}).catch(function(){return false;});
  };

  // ---- photos (files on the server) ----
  var PS = window.PhotoStore = window.PhotoStore || {};
  var pending = {};
  function dataUrlToBlob(u){
    try{ var parts=String(u).split(','); var mime=((parts[0]||'').match(/:(.*?);/)||[])[1]||'image/jpeg';
      var bin=atob(parts[1]||''); var n=bin.length; var arr=new Uint8Array(n);
      for(var i=0;i<n;i++) arr[i]=bin.charCodeAt(i);
      return new Blob([arr],{type:mime}); }catch(e){ return null; }
  }
  // upload with retries — a dropped request used to lose the photo silently, so other
  // devices saw "loading…" forever. Retries on failure and again when back online.
  function postPhotoRetry(fd, tries){
    fetch(api('/api/photos'), {method:'POST', headers:headers(), body:fd})
      .then(function(r){ if(!r.ok) throw new Error('photo post '+r.status); })
      .catch(function(){
        if(tries>0) setTimeout(function(){ postPhotoRetry(fd, tries-1); }, 6000);
        else { try{ window.addEventListener('online', function once(){ window.removeEventListener('online', once); postPhotoRetry(fd, 2); }); }catch(e){} }
      });
  }
  FB.savePhoto = function(dataUrl){
    var id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    PS[id]=dataUrl;
    var acct=(window.State&&State.account)||{}; var store=(acct.role==='super'||acct.role==='ba'||acct.branch==='All stores')?(stores()[0]||'Morley'):(acct.branch||stores()[0]||'Morley');   // super/ba have no store of their own — file the photo under a real store (any store they can access)
    try{
      var fd=new FormData(); fd.append('id',id); fd.append('store_id',store);
      // send as a real file part — form FIELDS are capped at 500KB by Werkzeug (413), files are not
      var blob=dataUrlToBlob(dataUrl);
      if(blob){ fd.append('image', blob, id+'.jpg'); } else { fd.append('dataUrl', dataUrl); }
      postPhotoRetry(fd, 3);
    }catch(e){}
    return id;
  };
  // upload ONE photo and resolve only when the server has confirmed it (used by the
  // composers: embedded editor images become real photo files, not megabyte base64 bodies)
  window.mcqPhotoUpload=function(dataUrl){
    var id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    PS[id]=dataUrl;
    var acct=(window.State&&State.account)||{}; var store=(acct.role==='super'||acct.role==='ba'||acct.branch==='All stores')?(stores()[0]||'Morley'):(acct.branch||stores()[0]||'Morley');   // super/ba have no store of their own — file the photo under a real store (any store they can access)
    var fd=new FormData(); fd.append('id',id); fd.append('store_id',store);
    var blob=dataUrlToBlob(dataUrl);
    if(blob){ fd.append('image', blob, id+'.jpg'); } else { fd.append('dataUrl', dataUrl); }
    return fetch(api('/api/photos'), {method:'POST', headers:headers(), body:fd})
      .then(function(r){ return r.json(); })
      .then(function(j){ return (j&&j.ok)?{ok:true,id:j.id||id}:{ok:false}; })
      .catch(function(){ return {ok:false}; });
  };
  // A photo arriving must NEVER rebuild the page or an open overlay — rebuilds reset the
  // scroll position and feel like violent jank. Instead every waiting <img data-pref="…">
  // is patched IN PLACE the moment its photo lands; a full repaint happens at most every
  // 1.2s and never while a full-screen overlay (verify studio / history detail) is open.
  var _SVG_PLACEHOLDER=/^data:image\/svg/;
  window.patchPendingImgs=function(){
    try{
      var imgs=document.querySelectorAll('img[data-pref]');
      for(var i=0;i<imgs.length;i++){
        var el=imgs[i], ref=el.getAttribute('data-pref'), v=PS[ref];
        if(v && v!==PHOTO_WAIT_IMG && _SVG_PLACEHOLDER.test(el.getAttribute('src')||'')) el.src=v;
      }
    }catch(e){}
  };
  var _photoRR;
  function photoRerenderSoon(){
    try{ window.patchPendingImgs(); }catch(e){}
    clearTimeout(_photoRR);
    _photoRR=setTimeout(function(){
      try{ window.patchPendingImgs(); }catch(e){}
      if(document.getElementById('mv-ov')) return;      // overlay open → in-place patching only
      if(FB.rerenderApp) FB.rerenderApp();
    }, 1200);
  }
  // photos that keep failing (e.g. the upload from another device hasn't landed yet) are
  // paused for a while instead of re-fetching on every render — the UI shows a clean
  // "photo syncing" tile instead of an eternal "loading…" box, and retries later.
  var photoFails = {};
  var PHOTO_WAIT_IMG='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="70"><rect width="100%" height="100%" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="50%" y="46%" font-size="9" fill="#c2410c" text-anchor="middle" font-family="sans-serif">photo syncing</text><text x="50%" y="66%" font-size="8" fill="#ea580c" text-anchor="middle" font-family="sans-serif">from other device…</text></svg>');
  FB.fetchPhoto = function(id){
    if(!id || pending[id]) return;
    if(PS[id] && PS[id]!==PHOTO_WAIT_IMG) return;
    var f=photoFails[id];
    if(f && f.count>=3 && (Date.now()-f.at)<60000) return;   // back off 60s after 3 misses
    pending[id]=true;
    fetch(api('/api/photos/'+encodeURIComponent(id)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('photo '+r.status); return r.blob(); })
      .then(function(b){ PS[id]=URL.createObjectURL(b); delete pending[id]; delete photoFails[id]; photoRerenderSoon(); })
      .catch(function(){ delete pending[id];
        var g=photoFails[id]=photoFails[id]||{count:0,at:0}; g.count++; g.at=Date.now();
        if(g.count>=3){ PS[id]=PHOTO_WAIT_IMG; photoRerenderSoon(); setTimeout(function(){ if(PS[id]===PHOTO_WAIT_IMG){ delete PS[id]; } }, 65000); }
      });
  };
  // resolve a photo ref to a REAL displayable src (blob/data URL), waiting for the server
  // instead of returning the "loading…" placeholder. PDF / print / share builders use this
  // so reports embed actual photos. Resolves null when the photo truly isn't available.
  window.photoSrcAsync = function(ref){
    if(!ref) return Promise.resolve(null);
    if(/^(data:|blob:|https?:|assets\/|\/)/.test(ref)) return Promise.resolve(ref);
    if(PS[ref] && PS[ref]!==PHOTO_WAIT_IMG) return Promise.resolve(PS[ref]);
    return fetch(api('/api/photos/'+encodeURIComponent(ref)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('photo '+r.status); return r.blob(); })
      .then(function(b){ PS[ref]=URL.createObjectURL(b); delete photoFails[ref]; return PS[ref]; })
      .catch(function(){ return null; });
  };

  // keep retrying a failed save until the server confirms (covers transient drops / offline)
  function retryIfDirty(){ if(saveDirty && (window.State&&State.account) && TOKEN && FB.saveAll) FB.saveAll(); }
  setInterval(retryIfDirty, 7000);
  try{ window.addEventListener('online', retryIfDirty); }catch(e){}

  FB.lastSync={status:'ready',message:'Server ready ('+(BASE||'same origin')+')'};
  console.info('[MCQ] API backend active →', BASE||'(same origin)');
})();
