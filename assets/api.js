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
  // server-side email relay (Brevo key lives on the server, never in the frontend/repo)
  window.MCQ_EMAIL_RELAY = (BASE||'') + '/api/send-email';
  // server-side AI Vision (OpenAI/ChatGPT key lives on the server)
  window.MCQ_AI_VISION_ENDPOINT = (BASE||'') + '/api/vision-temp';
  window.MCQ_VISION_TEXT_ENDPOINT = (BASE||'') + '/api/vision-text';
  var TOKEN = (window.localStorage && localStorage.getItem('mcq_token')) || '';
  var api = function(p){ return (BASE||'') + p; };
  function headers(json){ var h={}; if(json) h['Content-Type']='application/json'; if(TOKEN) h['Authorization']='Bearer '+TOKEN; return h; }
  function setToken(t){ TOKEN=t||''; try{ TOKEN?localStorage.setItem('mcq_token',TOKEN):localStorage.removeItem('mcq_token'); }catch(e){} }
  function stores(){ return (window.DB&&(DB.branches||DB.stores))||[]; }

  FB._api = true;
  FB.enabled = true;
  FB.apiBase = BASE;
  FB.ready = Promise.resolve(true);
  FB.lastSync = FB.lastSync || {status:'loading',message:'Connecting to server…'};

  // ---- auth ----
  FB.login = function(mode, store, password){
    return fetch(api('/api/login'), {method:'POST', headers:headers(true), body:JSON.stringify({mode:mode,store:store,password:password})})
      .then(function(r){ return r.json().catch(function(){return {ok:false};}); })
      .then(function(d){ if(d&&d.ok&&d.token){ setToken(d.token); FB._role=d.role; FB._stores=d.stores||[]; } return d||{ok:false}; })
      .catch(function(){ return {ok:false, error:'Cannot reach server'}; });
  };
  FB.logout = function(){ setToken(''); };

  // ---- per-store state ----
  function getState(store){ return fetch(api('/api/state/'+encodeURIComponent(store)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('state '+r.status); return r.json(); }); }
  function postState(store){
    var state = FB.buildStoreState ? FB.buildStoreState(store) : null;
    return fetch(api('/api/state/'+encodeURIComponent(store)), {method:'POST', headers:headers(true), body:JSON.stringify({state:state})})
      .then(function(r){ return r.json().catch(function(){return {};}); });
  }

  FB.loadForAccount = function(account){
    account = account || (window.State&&State.account) || {role:'super',branch:'All stores'};
    // instant paint from cache first
    if(FB.hydrateFromCache){ try{ FB.hydrateFromCache(account); }catch(e){} }
    if(!TOKEN){ FB.lastSync={status:'local',message:'Sign in to sync with the server'}; return Promise.resolve(FB.lastSync); }
    if(account.role==='super'){
      return fetch(api('/api/stores'), {headers:headers()}).then(function(r){return r.json();}).then(function(list){
        var ss=(list&&list.stores||[]).map(function(s){return s.id;});
        return Promise.all(ss.map(function(s){
          return getState(s).then(function(d){ return d&&d.state?{store:s,data:d.state}:null; }).catch(function(){return null;});
        })).then(function(rows){
          rows=rows.filter(Boolean);
          if(FB.resetToBase) FB.resetToBase();
          if(rows.length && FB.aggregateStates) FB.aggregateStates(rows);
          FB._loaded=true;
          FB.lastSync={status:'synced',message:'Loaded '+rows.length+' store(s)'};
          if(FB.rerenderApp) FB.rerenderApp();
          return FB.lastSync;
        });
      }).catch(function(e){ FB.lastSync={status:'error',message:'Server unavailable · local data'}; return FB.lastSync; });
    }
    var store=account.branch;
    return getState(store).then(function(d){
      if(d&&d.state){ if(FB.resetToBase) FB.resetToBase(); if(FB.applyStoreState) FB.applyStoreState(d.state); if(FB.rerenderApp) FB.rerenderApp(); }
      else { FB._loaded=true; postState(store); }   // first run for this store → seed backend from local
      FB._loaded=true;
      FB.lastSync={status:'synced',message:'Loaded '+store};
      return FB.lastSync;
    }).catch(function(e){ FB.lastSync={status:'error',message:'Server unavailable · local data'}; return FB.lastSync; });
  };
  FB.loadAll = function(){ return FB.loadForAccount(window.State&&State.account?State.account:{role:'super'}); };

  FB.saveAll = function(){
    var acct=(window.State&&State.account)||null; if(!acct||!TOKEN) return Promise.resolve();
    if(!FB._loaded) return Promise.resolve();   // never overwrite the server before the first successful load (prevents wiping data)
    if(acct.role==='super'){
      return Promise.all(stores().map(function(s){ return postState(s).catch(function(){}); }))
        .then(function(){ FB.lastSync={status:'synced',message:'Saved all stores'}; });
    }
    return postState(acct.branch).then(function(){ FB.lastSync={status:'synced',message:'Saved '+acct.branch}; })
      .catch(function(){ FB.lastSync={status:'error',message:'Save failed · will retry'}; });
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
  FB.savePhoto = function(dataUrl){
    var id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    PS[id]=dataUrl;
    var acct=(window.State&&State.account)||{}; var store=acct.branch&&acct.role!=='super'?acct.branch:(acct.branch||stores()[0]||'Morley');
    try{
      var fd=new FormData(); fd.append('id',id); fd.append('store_id',store); fd.append('dataUrl',dataUrl);
      fetch(api('/api/photos'), {method:'POST', headers:headers(), body:fd}).catch(function(){});
    }catch(e){}
    return id;
  };
  FB.fetchPhoto = function(id){
    if(!id || PS[id] || pending[id]) return;
    pending[id]=true;
    fetch(api('/api/photos/'+encodeURIComponent(id)), {headers:headers()})
      .then(function(r){ if(!r.ok) throw new Error('photo '+r.status); return r.blob(); })
      .then(function(b){ PS[id]=URL.createObjectURL(b); delete pending[id]; if(FB.rerenderApp) FB.rerenderApp(); })
      .catch(function(){ delete pending[id]; });
  };

  FB.lastSync={status:'ready',message:'Server ready ('+(BASE||'same origin')+')'};
  console.info('[MCQ] API backend active →', BASE||'(same origin)');
})();
