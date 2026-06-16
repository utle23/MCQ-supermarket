/* ============================================================
   MCQ Supermarket — Firebase sync layer (Firestore)
   All stores share ONE document (mcq/state): records, staff,
   structure, checklist template, email routes. Loads on boot,
   auto-saves on change, syncs across devices in real time.
   Falls back to in-memory sample data if Firebase is unreachable.
   ============================================================ */
(function(){
  const cfg = {
    apiKey: "AIzaSyCMxz3tsBfHb3VLOwEUbJmdgmpWXBewIGs",
    authDomain: "mcq-supermarket.firebaseapp.com",
    projectId: "mcq-supermarket",
    storageBucket: "mcq-supermarket.firebasestorage.app",
    messagingSenderId: "430633479978",
    appId: "1:430633479978:web:85fb955b05ef9dc1267853",
  };
  const RECORD_MODS = ['complaint','maintenance','incident','delivery','people','violation','reward','raise','birthday','training','issue'];
  const FB = window.MCQDB = { enabled:false };

  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('load '+src)); document.head.appendChild(s); }); }

  /* ---------- Photo storage ----------
     Photos are compressed on capture and each saved as its own doc in the
     `mcq_photos` collection, so the main state doc stays tiny. Records/checklist
     keep only the photo id; imgSrc() resolves an id to a usable src (lazy-fetched). */
  const PhotoStore = window.PhotoStore = window.PhotoStore || {};
  const _photoPending = {};
  const LOADING_IMG = 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="70"><rect width="100%" height="100%" rx="8" fill="#eef2f7"/><text x="50%" y="54%" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="sans-serif">loading…</text></svg>');
  let _rrTimer; function rerenderSoon(){ clearTimeout(_rrTimer); _rrTimer=setTimeout(()=>{ try{ if(window.State&&State.account&&typeof render==='function') render(); }catch(e){} }, 150); }

  // resize to <= maxDim on the long edge, return a JPEG data URL (~40–120KB)
  window.compressImage = function(file, maxDim, quality){
    maxDim=maxDim||1000; quality=quality||0.55;
    return new Promise((resolve,reject)=>{
      const img=new Image(), url=URL.createObjectURL(file);
      img.onload=()=>{ let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
        if(w>h && w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; } else if(h>=w && h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; }
        const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
        try{ resolve(c.toDataURL('image/jpeg',quality)); }catch(e){ reject(e); } };
      img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('img-load')); };
      img.src=url;
    });
  };
  // data/blob/http/asset paths pass through; a photo id is looked up (and lazily fetched from cloud)
  window.imgSrc = function(ref){
    if(!ref) return '';
    if(/^(data:|blob:|https?:|assets\/|\/)/.test(ref)) return ref;
    if(PhotoStore[ref]) return PhotoStore[ref];
    FB.fetchPhoto(ref); return LOADING_IMG;
  };
  FB.savePhoto = function(dataUrl){
    const id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    PhotoStore[id]=dataUrl;
    if(FB.enabled && FB._db){ try{ FB._db.collection('mcq_photos').doc(id).set({data:dataUrl,created:Date.now()}).catch(e=>console.warn('[FB] photo save', e&&e.message)); }catch(e){} }
    return id;
  };
  FB.fetchPhoto = function(id){
    if(!id || PhotoStore[id] || _photoPending[id] || !(FB.enabled&&FB._db)) return;
    _photoPending[id]=true;
    FB._db.collection('mcq_photos').doc(id).get().then(snap=>{ delete _photoPending[id];
      if(snap&&snap.exists){ PhotoStore[id]=snap.data().data; rerenderSoon(); } }).catch(e=>{ delete _photoPending[id]; });
  };

  function buildState(){
    const modules={}; RECORD_MODS.forEach(m=>{ if(DB.modules[m]) modules[m]=DB.modules[m].records; });
    return { modules, staff:DB.staff, structure:DB.structure,
      // checklist items are tuples (arrays) — Firestore forbids nested arrays, so store as JSON string
      checklistItems: JSON.stringify((DB.checklist&&DB.checklist.items)||[]),
      issueEmailRoutes:DB.issueEmailRoutes||{}, updatedAt:Date.now() };
  }
  function applyState(d){
    if(!d) return;
    if(d.modules) RECORD_MODS.forEach(m=>{ if(d.modules[m] && DB.modules[m]) DB.modules[m].records=d.modules[m]; });
    if(Array.isArray(d.staff)) DB.staff=d.staff;
    if(Array.isArray(d.structure)) DB.structure=d.structure;
    if(d.checklistItems && DB.checklist){ let ci=d.checklistItems; if(typeof ci==='string'){ try{ ci=JSON.parse(ci); }catch(e){ ci=null; } } if(Array.isArray(ci)&&ci.length) DB.checklist.items=ci; }
    if(d.issueEmailRoutes) DB.issueEmailRoutes=d.issueEmailRoutes;
  }

  // resolves to true(connected) / false(offline) — never rejects, so boot never hangs
  FB.ready = (async ()=>{
    try{
      const TIMEOUT=new Promise((_,rej)=>setTimeout(()=>rej(new Error('fb-timeout')),6000));
      await Promise.race([(async()=>{
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
        firebase.initializeApp(cfg);
        FB._db = firebase.firestore();
        try{ FB._db.settings({ experimentalForceLongPolling:true }); }catch(e){}  // robust on restrictive networks / headless
      })(), TIMEOUT]);
      FB.enabled = true;
      const ref = FB._db.collection('mcq').doc('state');

      const withTimeout=(pr,ms,tag)=>Promise.race([pr, new Promise((_,rej)=>setTimeout(()=>rej(new Error(tag+'-timeout')),ms))]);
      FB.loadAll = async function(){
        try{ const snap = await withTimeout(ref.get(), 5000, 'load');
          if(snap.exists){ applyState(snap.data()); }
          else { await withTimeout(ref.set(buildState()), 7000, 'seed'); }   // first run: seed cloud from sample data
          FB._loaded = true;
        }catch(e){ console.warn('[FB] load skipped — using local data', e&&e.message); }
      };
      FB.saveAll = async function(){ try{ await withTimeout(ref.set(buildState()), 7000, 'save'); }catch(e){ console.warn('[FB] save skipped', e&&e.message); } };

      // real-time: when ANOTHER device changes the data, refresh + re-render
      let first=true;
      ref.onSnapshot(snap=>{
        if(first){ first=false; return; }
        if(!snap.exists || snap.metadata.hasPendingWrites) return;   // ignore our own writes
        applyState(snap.data());
        try{ if(window.State && State.account && typeof render==='function'){ render(); if(typeof buildSidebar==='function') buildSidebar(); } }catch(e){}
      });
      console.log('[FB] connected · realtime sync on');
    }catch(e){
      FB.enabled=false; console.warn('[FB] unavailable — running offline with sample data', e&&e.message);
    }
    return FB.enabled;
  })();

  // debounced auto-save: any change is pushed to the cloud within ~0.8s
  let timer, lastHash='';
  function snapshotHash(){ try{ return JSON.stringify(buildState()).length+':'+JSON.stringify(buildState().modules).length; }catch(e){ return ''; } }
  window.persist = function(){ if(!FB.enabled) return; clearTimeout(timer); timer=setTimeout(()=>{ FB.saveAll&&FB.saveAll(); }, 800); };
  // safety net: poll for changes every 5s and push if the data changed
  setInterval(()=>{ if(!FB.enabled || !(window.State&&State.account)) return; const h=JSON.stringify(buildState()); if(h!==lastHash){ lastHash=h; FB.saveAll&&FB.saveAll(); } }, 5000);
  window.addEventListener('beforeunload', ()=>{ if(FB.enabled&&FB.saveAll) FB.saveAll(); });
})();
