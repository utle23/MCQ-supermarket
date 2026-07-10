/* ============================================================
   MCQ Supermarket — Firebase sync layer (Firestore)
   Store isolation model:
   - mcq_store_states/{storeId}: each branch has its own staff,
     records, checklist template, cleaning/maintenance schedule,
     job schedule and submitted checklist data.
   - Super Admin loads an aggregate view from every store document.
   - The old mcq/state document is kept only as a migration seed.
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
  const RECORD_MODS = Object.keys(DB.modules||{}).filter(k=>Array.isArray(DB.modules[k].records));
  const STORE_COLL = 'mcq_store_states';
  const FB = window.MCQDB = { enabled:false, lastSync:{status:'loading',message:'Starting sync...'} };
  const clone = v => JSON.parse(JSON.stringify(v==null?null:v));
  const CACHE_NS = 'mcq_store_state_cache_v3';
  let baseState=null, activeUnsub=null, activeMode='none', activeStore='';

  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('load '+src)); document.head.appendChild(s); }); }
  function storeId(store){ return String(store||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown-store'; }
  function storeRef(store){ return FB._db.collection(STORE_COLL).doc(storeId(store)); }
  function legacyRef(){ return FB._db.collection('mcq').doc('state'); }
  function cacheKey(store){ return CACHE_NS+':'+storeId(store); }
  function cacheLabel(store){ return isAllStore(store)?'all stores':store; }
  function readCache(store){
    try{ const raw=localStorage.getItem(cacheKey(store)); if(!raw) return null; const box=JSON.parse(raw); return box&&box.data?box:null; }catch(e){ return null; }
  }
  function writeCache(store,data){
    if(!data) return;
    try{ localStorage.setItem(cacheKey(store), JSON.stringify({store:store||'All stores',savedAt:Date.now(),data})); }
    catch(e){ console.warn('[FB] local cache skipped', e&&e.message); }
  }
  function captureBase(){ if(!baseState) baseState=buildState('',{full:true}); }
  function resetToBase(){ captureBase(); applyState(clone(baseState)); }
  function parseJSON(v,fallback){ if(v==null) return fallback; if(typeof v==='string'){ try{return JSON.parse(v);}catch(e){return fallback;} } return v; }
  function isAllStore(store){ return !store || store==='All stores' || store==='ALL'; }
  function inStore(r,store){ return isAllStore(store) || r.store===store; }
  function accountStore(){
    const acct=window.State&&State.account?State.account:null;
    return acct&&acct.role==='super'?'All stores':acct&&acct.branch;
  }
  function currentPhotoStore(){
    const acct=window.State&&State.account?State.account:null;
    if(acct&&acct.role!=='super') return acct.branch;
    if(window.State&&State.branch&&!isAllStore(State.branch)) return State.branch;
    return 'All stores';
  }
  function canReadStore(store){
    const acct=window.State&&State.account?State.account:null;
    return !store || !acct || acct.role==='super' || store===acct.branch;
  }
  FB.writeCache = writeCache;   // let the API adapter mirror each save locally (durable against stale reads / tab close)
  FB.hydrateFromCache = function(account){
    captureBase();
    const store=(account&&(account.role==='super'||account.role==='ba'))?'All stores':(account&&account.branch)||'Morley';
    const cached=readCache(store);
    if(cached){
      resetToBase();
      if(isAllStore(store) && cached.data && Array.isArray(cached.data.rows)) aggregateStates(cached.data.rows);
      else applyState(cached.data);
      activeMode=isAllStore(store)?'cache-super':'cache-store';
      activeStore=store;
      FB.lastSync={status:'cached',message:`Cached ${cacheLabel(store)} · syncing...`};
      return FB.lastSync;
    }
    resetToBase();
    if(account&&account.role!=='super') applyState(buildState(account.branch));
    activeMode='local'; activeStore=store;
    FB.lastSync={status:'local',message:`Local ${cacheLabel(store)} data · syncing...`};
    return FB.lastSync;
  };

  /* ---------- Photo storage ----------
     Photos are compressed on capture and each saved as its own doc in the
     `mcq_photos` collection, so the main state doc stays tiny. Records/checklist
     keep only the photo id; imgSrc() resolves an id to a usable src (lazy-fetched). */
  const PhotoStore = window.PhotoStore = window.PhotoStore || {};
  const _photoPending = {};
  const LOADING_IMG = 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="70"><rect width="100%" height="100%" rx="8" fill="#eef2f7"/><text x="50%" y="54%" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="sans-serif">loading…</text></svg>');
  let _rrTimer; function rerenderSoon(){ clearTimeout(_rrTimer); _rrTimer=setTimeout(()=>{ try{ if(window.State&&State.account&&typeof render==='function') render(); }catch(e){} }, 150); }

  // resize to <= maxDim on the long edge, return a JPEG data URL. Photos are stored as
  // SEPARATE files (not in the state blob) and uploaded asynchronously, so higher quality
  // here keeps PDFs/exports crisp without slowing the data save or the UI.
  window.compressImage = function(file, maxDim, quality){
    maxDim=maxDim||1600; quality=quality||0.82;
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
  FB.savePhoto = function(dataUrl,meta){
    const id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    PhotoStore[id]=dataUrl;
    if(FB.enabled && FB._db){ try{
      const doc=Object.assign({data:dataUrl,created:Date.now(),store:currentPhotoStore()},meta||{});
      FB._db.collection('mcq_photos').doc(id).set(doc).catch(e=>console.warn('[FB] photo save', e&&e.message));
    }catch(e){} }
    return id;
  };
  FB.fetchPhoto = function(id){
    if(!id || PhotoStore[id] || _photoPending[id] || !(FB.enabled&&FB._db)) return;
    _photoPending[id]=true;
    FB._db.collection('mcq_photos').doc(id).get().then(snap=>{ delete _photoPending[id];
      if(snap&&snap.exists){ const d=snap.data()||{}; if(!canReadStore(d.store)) return; PhotoStore[id]=d.data; rerenderSoon(); } }).catch(e=>{ delete _photoPending[id]; });
  };

  function buildModules(store){
    const modules={};
    RECORD_MODS.forEach(m=>{ if(DB.modules[m]) modules[m]=(DB.modules[m].records||[]).filter(r=>inStore(r,store)).map(r=>Object.assign({store:store||r.store},clone(r))); });
    return modules;
  }
  function buildBinAdmin(store){
    const b=DB.binAdmin||{};
    return {
      activeDays:Array.isArray(b.activeDays)?clone(b.activeDays):['Tue','Thu','Fri'],
      checklist:Array.isArray(b.checklist)?clone(b.checklist):[],
      records:(Array.isArray(b.records)?b.records:[]).filter(r=>inStore(r,store)).map(r=>Object.assign({store:store||r.store},clone(r)))
    };
  }
  function buildState(store,opts){
    const full=opts&&opts.full, scoped=!full&&!isAllStore(store);
    const modules=buildModules(scoped?store:'');
    const staff=(DB.staff||[]).filter(s=>!scoped||s.store===store).map(clone);
    const subs=(DB.checklistSubs||[]).filter(s=>!scoped||s.store===store).map(clone);
    const scheduleHistory=(DB.scheduleHistory||[]).filter(r=>!scoped||r.store===store).map(clone);
    const audits=(DB.auditLogs||[]).filter(a=>!scoped||a.store===store).map(clone);
    return { schemaVersion:2, store:scoped?store:'All stores', modules, staff, staffSeedVersion:(DB.staffSeedVersion||0), structure:clone(DB.structure||[]),
      // checklist items are tuples (arrays) — Firestore forbids nested arrays, so store as JSON string
      checklistItems: JSON.stringify((DB.checklist&&DB.checklist.items)||[]),
      checklistTemplateVersion: (DB.checklist&&DB.checklist.templateVersion)||0,
      checklistDeadlines: clone((DB.checklist&&DB.checklist.deadlines)||{}),
      // the department list is per-store now (so a store can drop e.g. BUTCHER without touching
      // others) — versioned with the template so a stale device can't revert it
      checklistDepts: clone((DB.checklist&&DB.checklist.depts)||[]),
      checklistDeptMeta: clone((DB.checklist&&DB.checklist.deptMeta)||{}),
      checklistSubs: JSON.stringify(subs),
      binAdmin: JSON.stringify(buildBinAdmin(scoped?store:'')),
      jobDuties: JSON.stringify(DB.jobDuties||null), jobRoster: JSON.stringify(DB.jobRoster||null),
      scheduleTasks: JSON.stringify(DB.scheduleTasks||[]), scheduleTicks: clone(DB.scheduleTicks||{}), scheduleHistory:JSON.stringify(scheduleHistory), auditLogs:audits,
      issueEmailRoutes:clone(DB.issueEmailRoutes||{}), checklistEmailRoutes:clone(DB.checklistEmailRoutes||{}), emailConfig:clone(DB.emailConfig||null), faceCreds:clone(DB.faceCreds||[]),
      emailRecipients:clone(DB.emailRecipients||[]), emailLog:(Array.isArray(DB.emailLog)?DB.emailLog.slice(0,100):[]).map(clone),
      feedback:(DB.feedback||[]).filter(f=>!scoped||f.store===store).map(clone),
      // dept-lead emails are per-store; keep only this store's subtree when scoped (isolation), full map for super
      checklistLeadEmails: scoped ? {[store]:clone((DB.checklistLeadEmails||{})[store]||{})} : clone(DB.checklistLeadEmails||{}),
      updatedAt:Date.now() };
  }
  function applyState(d){
    if(!d) return;
    if(d.modules) RECORD_MODS.forEach(m=>{ if(DB.modules[m]) DB.modules[m].records=Array.isArray(d.modules[m])?clone(d.modules[m]):[]; });
    if(Array.isArray(d.staff)){ const cv=+d.staffSeedVersion||0, sv=+(DB.staffSeedVersion||0); if(cv>=sv) DB.staff=clone(d.staff); }  // else keep newer seed (real employees) → next save imports it to this store
    if(Array.isArray(d.structure)){ DB.structure=clone(d.structure); if(window.normalizeStaffStructure) window.normalizeStaffStructure(); }
    if(d.checklistItems && DB.checklist){
      const cloudVer=+d.checklistTemplateVersion||0, seedVer=+((DB.checklist&&DB.checklist.templateVersion)||0);
      if(cloudVer>=seedVer){   // cloud template is same/newer → use it; else keep the newer seed and let next save push it to every store
        let ci=d.checklistItems; if(typeof ci==='string'){ try{ ci=JSON.parse(ci); }catch(e){ ci=null; } } if(Array.isArray(ci)&&ci.length) DB.checklist.items=ci;
        if(d.checklistDeadlines && typeof d.checklistDeadlines==='object') DB.checklist.deadlines=Object.assign({},DB.checklist.deadlines,d.checklistDeadlines);
        // per-store department list (versioned with the template): a store may drop a department
        if(Array.isArray(d.checklistDepts)&&d.checklistDepts.length) DB.checklist.depts=clone(d.checklistDepts);
        if(d.checklistDeptMeta && typeof d.checklistDeptMeta==='object') DB.checklist.deptMeta=Object.assign({},DB.checklist.deptMeta,clone(d.checklistDeptMeta));
        if(d.checklistTemplateVersion!=null) DB.checklist.templateVersion=cloudVer;
      }
      if(window.normalizeChecklistTemplate) window.normalizeChecklistTemplate();
    }
    if(d.checklistSubs!=null){ let cs=parseJSON(d.checklistSubs,null); if(Array.isArray(cs)) DB.checklistSubs=clone(cs); }
    if(d.binAdmin!=null){ const ba=parseJSON(d.binAdmin,null); if(ba&&typeof ba==='object') DB.binAdmin=Object.assign({activeDays:['Tue','Thu','Fri'],checklist:[],records:[]},clone(ba)); }
    if(d.jobDuties!=null){ let jd=d.jobDuties; if(typeof jd==='string'){ try{ jd=JSON.parse(jd); }catch(e){ jd=null; } } if(jd&&typeof jd==='object') DB.jobDuties=jd; }
    if(d.jobRoster!=null){ let jr=d.jobRoster; if(typeof jr==='string'){ try{ jr=JSON.parse(jr); }catch(e){ jr=null; } } if(jr&&typeof jr==='object') DB.jobRoster=jr; }
    if(d.scheduleTasks!=null){ let st=d.scheduleTasks; if(typeof st==='string'){ try{ st=JSON.parse(st); }catch(e){ st=null; } } if(Array.isArray(st)&&st.length) DB.scheduleTasks=st; }
    if(d.scheduleTicks && typeof d.scheduleTicks==='object') DB.scheduleTicks=clone(d.scheduleTicks);
    if(d.scheduleHistory!=null){ const sh=parseJSON(d.scheduleHistory,null); if(Array.isArray(sh)) DB.scheduleHistory=clone(sh); }
    if(Array.isArray(d.auditLogs)) DB.auditLogs=clone(d.auditLogs);
    if(d.emailConfig) DB.emailConfig=clone(d.emailConfig);
    if(Array.isArray(d.faceCreds)) DB.faceCreds=clone(d.faceCreds);
    try{ if(window.MCQFace&&MCQFace.syncFromDB) MCQFace.syncFromDB(); }catch(e){}
    if(d.issueEmailRoutes) DB.issueEmailRoutes=clone(d.issueEmailRoutes);
    if(d.checklistEmailRoutes) DB.checklistEmailRoutes=clone(d.checklistEmailRoutes);
    if(Array.isArray(d.emailRecipients)&&d.emailRecipients.length) DB.emailRecipients=clone(d.emailRecipients);
    if(Array.isArray(d.emailLog)) DB.emailLog=clone(d.emailLog);
    if(Array.isArray(d.feedback)) DB.feedback=clone(d.feedback);
    if(d.checklistLeadEmails && typeof d.checklistLeadEmails==='object'){ DB.checklistLeadEmails=DB.checklistLeadEmails||{}; Object.keys(d.checklistLeadEmails).forEach(st=>{ DB.checklistLeadEmails[st]=clone(d.checklistLeadEmails[st]); }); }
  }
  async function seedStoreState(store){
    resetToBase();
    let legacy=null;
    try{ const snap=await legacyRef().get(); if(snap.exists) legacy=snap.data(); }catch(e){}
    if(legacy){ resetToBase(); applyState(legacy); }
    const seeded=buildState(store);
    seeded.seededFrom=legacy?'mcq/state':'local-defaults';
    await storeRef(store).set(seeded);
    return seeded;
  }
  async function loadStoreState(store){
    if(isAllStore(store)) return loadAllStores();
    resetToBase();
    const snap=await storeRef(store).get();
    const data=snap.exists?snap.data():await seedStoreState(store);
    writeCache(store,data);
    resetToBase();
    applyState(data);
    activeMode='store'; activeStore=store;
    subscribeStore(store);
  }
  async function readStoreSnapshot(store){
    const snap=await storeRef(store).get();
    if(snap.exists){ const data=snap.data(); writeCache(store,data); return {store,data}; }
    return {store,data:null};
  }
  async function readOrSeedStore(store){
    const snap=await storeRef(store).get();
    const data=snap.exists?snap.data():await seedStoreState(store);
    writeCache(store,data);
    return {store,data};
  }
  function localStoreFallback(store,error){
    const cached=readCache(store);
    if(cached&&cached.data) return {store,data:cached.data,cached:true,error};
    captureBase();
    return {store,data:buildState(store),local:true,error};
  }
  function aggregateStates(rows){
    resetToBase();
    RECORD_MODS.forEach(m=>{ if(DB.modules[m]) DB.modules[m].records=[]; });
    DB.staff=[]; DB.checklistSubs=[]; DB.auditLogs=[]; DB.scheduleHistory=[]; DB.binAdmin=DB.binAdmin||{activeDays:['Tue','Thu','Fri'],checklist:[],records:[]}; DB.binAdmin.records=[];
    DB.checklistLeadEmails={};   // per-store dept-lead emails — rebuilt from each store's blob
    DB.feedback=[];              // Share-Your-Thought — collected from every store for the Super inbox
    const seenStaff=new Set(), seenSubs=new Set(), seenAudit=new Set(), seenBin=new Set(), seenSched=new Set(), seenRec={}, seenFb=new Set();
    rows.forEach(row=>{
      const d=row.data||{}, store=row.store;
      // per-store config: dept-lead emails (keep each store's own), + global-ish recipients/log (last non-empty wins)
      if(d.checklistLeadEmails && typeof d.checklistLeadEmails==='object'){ const sub=d.checklistLeadEmails[store]||d.checklistLeadEmails; if(sub&&typeof sub==='object') DB.checklistLeadEmails[store]=clone(sub); }
      (Array.isArray(d.feedback)?d.feedback:[]).forEach(f=>{ const rec=Object.assign({store},clone(f)); const key=rec.store+'|'+(rec.id||rec.ts); if(!seenFb.has(key)){ seenFb.add(key); DB.feedback.push(rec); } });
      if(Array.isArray(d.emailRecipients)&&d.emailRecipients.length) DB.emailRecipients=clone(d.emailRecipients);
      if(Array.isArray(d.emailLog)&&d.emailLog.length) DB.emailLog=clone(d.emailLog);
      const mods=d.modules||{};
      RECORD_MODS.forEach(m=>{
        if(!DB.modules[m]) return;
        seenRec[m]=seenRec[m]||new Set();
        (Array.isArray(mods[m])?mods[m]:[]).forEach(r=>{
          const rec=Object.assign({store},clone(r));
          const key=rec.store+'|'+(rec.id||JSON.stringify(rec));
          if(!seenRec[m].has(key)){ seenRec[m].add(key); DB.modules[m].records.push(rec); }
        });
      });
      (Array.isArray(d.staff)?d.staff:[]).forEach(s=>{
        const rec=Object.assign({store},clone(s));
        const key=rec.store+'|'+(rec.id||rec.name);
        if(!seenStaff.has(key)){ seenStaff.add(key); DB.staff.push(rec); }
      });
      const subs=parseJSON(d.checklistSubs,[]);
      (Array.isArray(subs)?subs:[]).forEach(s=>{
        const rec=Object.assign({store},clone(s));
        const key=rec.store+'|'+(rec.id||JSON.stringify(rec));
        if(!seenSubs.has(key)){ seenSubs.add(key); DB.checklistSubs.push(rec); }
      });
      (Array.isArray(d.auditLogs)?d.auditLogs:[]).forEach(a=>{
        const rec=Object.assign({store},clone(a));
        const key=rec.store+'|'+(rec.id||rec.created+'|'+rec.entityId+'|'+rec.action);
        if(!seenAudit.has(key)){ seenAudit.add(key); DB.auditLogs.push(rec); }
      });
      const ba=parseJSON(d.binAdmin,null);
      if(ba&&Array.isArray(ba.records)){
        if(!DB.binAdmin.checklist.length && Array.isArray(ba.checklist)) DB.binAdmin.checklist=clone(ba.checklist);
        if((!DB.binAdmin.activeDays||!DB.binAdmin.activeDays.length) && Array.isArray(ba.activeDays)) DB.binAdmin.activeDays=clone(ba.activeDays);
        ba.records.forEach(r=>{
          const rec=Object.assign({store},clone(r));
          const key=rec.store+'|'+(rec.id||rec.created+'|'+rec.day);
          if(!seenBin.has(key)){ seenBin.add(key); DB.binAdmin.records.push(rec); }
        });
      }
      const sh=parseJSON(d.scheduleHistory,[]);
      (Array.isArray(sh)?sh:[]).forEach(r=>{
        const rec=Object.assign({store},clone(r));
        const key=rec.store+'|'+(rec.id||rec.date+'|'+rec.taskId+'|'+rec.day);
        if(!seenSched.has(key)){ seenSched.add(key); DB.scheduleHistory.push(rec); }
      });
    });
    activeMode='super'; activeStore='All stores';
  }
  async function loadAllStores(){
    const stores=DB.branches||DB.stores||[];
    const reads=await Promise.all(stores.map(store=>readStoreSnapshot(store).catch(e=>{
      const cached=readCache(store);
      return cached?{store,data:cached.data,cached:true,error:e}:null;
    })));
    const rows=[];
    for(let i=0;i<stores.length;i++){
      const row=reads[i];
      if(row&&row.data){ rows.push(row); continue; }
      try{ rows.push(await readOrSeedStore(stores[i])); }
      catch(e){ rows.push(localStoreFallback(stores[i],e)); }
    }
    aggregateStates(rows);
    writeCache('All stores',{rows});
    subscribeAllStores();
  }
  function rerenderApp(){
    try{ if(window.State && State.account && typeof render==='function'){ render(); if(typeof buildSidebar==='function') buildSidebar(); if(typeof buildTopbar==='function') buildTopbar();
      // photos inside an open overlay are patched in place — never rebuilt (scroll stays put)
      if(window.patchPendingImgs) window.patchPendingImgs();
    } }catch(e){}
  }
  function subscribeStore(store){
    if(activeUnsub) activeUnsub();
    let first=true;
    activeUnsub=storeRef(store).onSnapshot(snap=>{
      if(first){ first=false; return; }
      if(!snap.exists || snap.metadata.hasPendingWrites) return;
      const data=snap.data(); writeCache(store,data);
      resetToBase(); applyState(data); rerenderApp();
    });
  }
  function subscribeAllStores(){
    if(activeUnsub) activeUnsub();
    let first=true;
    activeUnsub=FB._db.collection(STORE_COLL).onSnapshot(async qs=>{
      if(first){ first=false; return; }
      if(qs.metadata.hasPendingWrites) return;
      const rows=[];
      qs.forEach(doc=>{
        const d=doc.data(), store=d.store&&d.store!=='All stores'?d.store:(DB.branches||[]).find(s=>storeId(s)===doc.id)||doc.id;
        writeCache(store,d);
        rows.push({store,data:d});
      });
      if(rows.length){ aggregateStates(rows); writeCache('All stores',{rows}); rerenderApp(); }
    });
  }
  async function saveStore(store){
    if(isAllStore(store)) return saveAllStoresFromAggregate();
    const state=buildState(store);
    await storeRef(store).set(state);
    writeCache(store,state);
    FB.lastSync={status:'synced',message:`Saved ${store}`};
  }
  async function saveAllStoresFromAggregate(){
    const stores=DB.branches||DB.stores||[];
    await Promise.all(stores.map(async store=>{
      let current={};
      try{ const snap=await storeRef(store).get(); current=snap.exists?snap.data():buildState(store); }catch(e){ current=buildState(store); }
      const patch={
        schemaVersion:2, store, modules:buildModules(store),
        staff:(DB.staff||[]).filter(s=>s.store===store).map(clone),
        checklistSubs:JSON.stringify((DB.checklistSubs||[]).filter(s=>s.store===store).map(clone)),
        binAdmin:JSON.stringify(buildBinAdmin(store)),
        scheduleHistory:JSON.stringify((DB.scheduleHistory||[]).filter(r=>r.store===store).map(clone)),
        auditLogs:(DB.auditLogs||[]).filter(a=>a.store===store).map(clone),
        updatedAt:Date.now()
      };
      await storeRef(store).set(Object.assign({},current,patch),{merge:true});
      writeCache(store,Object.assign({},current,patch));
    }));
    FB.lastSync={status:'synced',message:'Saved all stores'};
  }
  function parseStoreConfigData(d){
    d=d||{};
    return {
      store:d.store||'',
      staff:Array.isArray(d.staff)?clone(d.staff):[],
      checklistItems:parseJSON(d.checklistItems,[]),
      scheduleTasks:parseJSON(d.scheduleTasks,[]),
      jobDuties:parseJSON(d.jobDuties,null),
      auditLogs:Array.isArray(d.auditLogs)?clone(d.auditLogs):[]
    };
  }
  async function fetchStoreConfig(store){
    const snap=await storeRef(store).get();
    const data=snap.exists?snap.data():await seedStoreState(store);
    const cfg=parseStoreConfigData(data);
    cfg.store=store;
    return cfg;
  }
  async function saveStoreConfig(store,cfg){
    const patch={schemaVersion:2,store,updatedAt:Date.now()};
    if(cfg.staff) patch.staff=clone(cfg.staff).map(s=>Object.assign({},s,{store}));
    if(cfg.checklistItems) patch.checklistItems=JSON.stringify(cfg.checklistItems);
    if(cfg.scheduleTasks) patch.scheduleTasks=JSON.stringify(cfg.scheduleTasks);
    if(cfg.jobDuties) patch.jobDuties=JSON.stringify(cfg.jobDuties);
    if(cfg.auditLogs) patch.auditLogs=clone(cfg.auditLogs).map(a=>Object.assign({},a,{store:a.store||store}));
    await storeRef(store).set(patch,{merge:true});
    FB.lastSync={status:'synced',message:`Saved ${store} config`};
    return true;
  }

  // exposed so the PythonAnywhere API adapter (api.js) can reuse the SAME per-store
  // serialization instead of duplicating it
  FB.buildStoreState=buildState; FB.applyStoreState=applyState;
  FB.aggregateStates=aggregateStates; FB.resetToBase=resetToBase; FB.rerenderApp=rerenderApp;

  // If the PythonAnywhere API backend is configured, do NOT start Firestore at all —
  // api.js owns loadForAccount/saveAll/etc. This avoids any race over the methods.
  FB.ready = ((window.localStorage && localStorage.getItem('mcq_api_base')) || window.MCQ_API_BASE || window.__MCQ_SAME_ORIGIN_API)
    ? Promise.resolve(false)
    : (async ()=>{
    try{
      const TIMEOUT=new Promise((_,rej)=>setTimeout(()=>rej(new Error('fb-timeout')),3800));
      await Promise.race([(async()=>{
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
        firebase.initializeApp(cfg);
        FB._db = firebase.firestore();
        try{ FB._db.settings({ experimentalForceLongPolling:true }); }catch(e){}  // robust on restrictive networks / headless
      })(), TIMEOUT]);
      if(FB._api){ captureBase(); return true; }   // PythonAnywhere API adapter is active → don't override its methods with Firestore
      FB.enabled = true;
      const withTimeout=(pr,ms,tag)=>Promise.race([pr, new Promise((_,rej)=>setTimeout(()=>rej(new Error(tag+'-timeout')),ms))]);
      captureBase();
      FB.loadForAccount = async function(account){
        try{
          const store=(account&&account.role==='super')?'All stores':(account&&account.branch)||'Morley';
          await withTimeout(loadStoreState(store), 4500, 'load-'+storeId(store));
          FB._loaded = true;
          FB.lastSync={status:'synced',message:`Loaded ${store==='All stores'?'all stores':store}`};
          return FB.lastSync;
        }catch(e){ FB.lastSync={status:'error',message:'Cloud unavailable · local data'}; console.warn('[FB] load skipped — using local data', e&&e.message); return FB.lastSync; }
      };
      FB.loadAll = function(){ return FB.loadForAccount(window.State&&State.account?State.account:{role:'super',branch:'All stores'}); };
      FB.saveAll = async function(){
        try{
          const acct=window.State&&State.account?State.account:null;
          const store=(acct&&acct.role==='super')?'All stores':(acct&&acct.branch)||activeStore;
          await withTimeout(saveStore(store), 12000, 'save-'+storeId(store));
        }catch(e){ console.warn('[FB] save skipped', e&&e.message); }
      };
      FB.fetchStoreConfig = function(store){ return withTimeout(fetchStoreConfig(store), 12000, 'fetch-config-'+storeId(store)); };
      FB.saveStoreConfig = function(store,cfg){ return withTimeout(saveStoreConfig(store,cfg), 12000, 'save-config-'+storeId(store)); };
      FB.subcollectionPlan = {
        root:'stores/{storeId}',
        collections:['staff/{staffId}','records/{recordId}','checklistSubmissions/{submissionId}','scheduleTasks/{taskId}','scheduleHistory/{recordId}','binRecords/{recordId}','auditLogs/{logId}','photos/{photoId}'],
        status:'planned-safe-migration'
      };
      console.log('[FB] connected · per-store realtime sync on');
    }catch(e){
      if(FB._api){ captureBase(); return true; }   // API adapter active → keep its methods
      FB.enabled=false; console.warn('[FB] unavailable — running offline with sample data', e&&e.message);
      captureBase();
      FB.loadForAccount = async function(account){ const hit=FB.hydrateFromCache(account); FB.lastSync={status:hit.status||'local',message:hit.status==='cached'?hit.message:'Offline · local sample data'}; return FB.lastSync; };
      FB.loadAll = function(){ return FB.loadForAccount(window.State&&State.account?State.account:{role:'super'}); };
      FB.saveAll = async function(){ try{ const acct=window.State&&State.account; if(!acct) return; const store=acct.role==='super'?'All stores':acct.branch; if(store&&!isAllStore(store)) writeCache(store, buildState(store)); FB.lastSync={status:'local',message:'Saved on this device (offline)'}; }catch(e){} };
      FB.fetchStoreConfig = async function(store){ return parseStoreConfigData(buildState(store)); };
      FB.saveStoreConfig = async function(){ FB.lastSync={status:'local',message:'Offline · changes stay local'}; return false; };
    }
    return FB.enabled;
  })();

  // debounced auto-save: any change is pushed to the current store doc within ~0.8s
  let timer, lastHash='';
  function snapshotHash(){
    try{ const s=buildState(accountStore()||activeStore||''); delete s.updatedAt; return JSON.stringify(s)+':'+activeMode; }catch(e){ return ''; }
  }
  window.persist = function(){ if(!(window.State&&State.account)) return;
    if(State.account.role==='ba') return;   // Chú Ba is read-only — never writes
    // ALWAYS mirror to the local cache immediately, so a reload/re-login can never show
    // less than the latest local data — even if the server save is delayed or fails.
    try{ const acct=State.account, store=acct.role==='super'?'All stores':acct.branch;
      if(store&&!isAllStore(store)) writeCache(store, buildState(store));
      // mark UNSAVED synchronously — cleared only once the server confirms the save. On the
      // next login, loadForAccount flushes any still-dirty store first (merge), so an edit
      // made just before a hard close/crash can never be overwritten by the fresh load.
      try{ localStorage.setItem(store&&!isAllStore(store)?('mcq_dirty_'+store):'mcq_dirty_super','1'); }catch(_){}
    }catch(e){}
    if(!FB.enabled) return;
    clearTimeout(timer); timer=setTimeout(()=>{ FB.saveAll&&FB.saveAll(); }, 450); };
  // safety net: poll for changes every 5s and push if the data changed
  setInterval(()=>{ if(!FB.enabled || !(window.State&&State.account)) return; const h=snapshotHash(); if(h!==lastHash){ lastHash=h; FB.saveAll&&FB.saveAll(); } }, 5000);
  window.addEventListener('beforeunload', ()=>{ if(FB.enabled&&FB.saveAll) FB.saveAll(); });
  window.addEventListener('pagehide', ()=>{ if(FB.enabled&&FB.saveAll) FB.saveAll(); });   // mobile: fires on tab close / app switch (keepalive POST survives)
})();
