/* ============================================================
   MCQ Ops Hub — Custom pages (checklist, HR, management)
   Uses globals from app.js.
   ============================================================ */

function photoSpec(p){
  if(!p) return null;
  if(p[0]==='R'){ const m=p.slice(1).split('-'); return {req:true,min:+m[0],max:+(m[1]||m[0])}; }
  if(p[0]==='O'){ const n=p.slice(1); return {req:false,max:n?+n:null}; }
  return null;
}
function photoChip(ps){
  if(!ps) return '';
  if(ps.req) return `<span class="ev-chip ev-req">📷 Required · ${ps.min}-${ps.max}</span>`;
  return `<span class="ev-chip ev-req">📷 Required before submit${ps.max?' · max '+ps.max:''}</span>`;
}

/* ============================================================ STAFF HOME (simplified, mobile-first) */
function renderStaffHome(){
  setAccent('#0e9f6e'); setCrumb('🏠','My Store','MCQ '+State.branch);
  const u=me();
  const openItems=DB.order.reduce((n,id)=>n+openCount(id),0);
  const actions=[
    ['✅','Store Checklist','Opening & closing checks','#10b981',"go('checklist')"],
    ['🚩','Report an Issue','Maintenance, safety, stock…','#e53935',"go('issue')"],
    ['🚚','Log Delivery','Truck & crate return','#3b82f6',"go('delivery','new')"],
    ['📖','Store Rules','Handbook & standards','#8b5cf6',"go('rules')"],
  ];
  const feed=recentFeed().slice(0,6).map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div><div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('')||'<div class="empty">No recent activity at your store yet.</div>';
  $('#content').innerHTML=`
    <div class="staff-hero">
      <div class="sh-greet"><div class="sh-hi">Hi, ${esc((u.name||'Team').split(' ')[0])} 👋</div>
        <div class="sh-sub">MCQ ${esc(State.branch)} · ${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'})}</div></div>
      <div class="sh-badge"><b>${openItems}</b><span>open items</span></div>
    </div>
    <div class="section-title">What do you need to do?</div>
    <div class="staff-actions">${actions.map(a=>`<button class="sa-tile" style="--c:${a[3]}" onclick="${a[4]}"><span class="sa-ic">${a[0]}</span><span class="sa-txt"><b>${a[1]}</b><small>${a[2]}</small></span><span class="sa-arrow">→</span></button>`).join('')}</div>
    <div class="section-title">Recent at your store</div>
    <div class="card"><div class="feed">${feed}</div></div>`;
}

/* ============================================================ CHECKLIST — Opening/Closing + photo capture */
const CK_DEADLINE={Opening:'10:30 AM',Closing:'6:30 PM'};
function ckJS(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function ckItem(it,i){ return {i,dept:it[0],area:it[1],task:it[2],when:it[3],photo:photoSpec(it[4]),meta:it[5]||{}}; }
function ckInSession(r,session){ return session==='Opening'?(r.when==='O'||r.when==='A'):(r.when==='C'||r.when==='A'); }
function renderChecklist(){
  const C=DB.checklist; setAccent('#0e9f6e');
  if(!State.chk) State.chk={session:'Opening',dept:C.depts[0],area:'ALL',state:{}};
  if(State.chk.dept==='ALL' || !C.depts.includes(State.chk.dept)) State.chk.dept=C.depts[0];
  if(!State.chk.area) State.chk.area='ALL';
  if(!State.chk.resp) State.chk.resp={};
  const s=State.chk;
  setCrumb('✅','Store Operation Checklist',`${isAdmin()?'All stores':State.branch} · ${s.session}`);
  const chips=C.depts.map(d=>`<button class="dept-chip ${d===s.dept?'active':''}" onclick="ckDept('${ckJS(d)}')">${esc(d)}</button>`).join('');
  const areaChips=ckAreaChips();
  const staff=DB.staff.filter(x=>isAdmin()||x.store===State.branch).map(x=>x.name);
  $('#content').innerHTML=`
   <div class="page-head"><div class="ph-ic">✅</div>
     <div><h2>Store Operation Checklist</h2><p>Every photo task needs evidence before submit. Temperature checks must be read by AI Vision or marked defrosting.</p></div></div>
   <datalist id="ck-staff-list">${staff.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>
   <div class="ck-sessionbar card">
     <div class="seg ck-seg">
       <button class="seg-btn ${s.session==='Opening'?'active':''}" onclick="ckSession('Opening')">☀️ Opening</button>
       <button class="seg-btn ${s.session==='Closing'?'active':''}" onclick="ckSession('Closing')">🌙 Closing</button>
     </div>
     <span class="ck-deadline ${s.session==='Opening'?'am':'pm'}">⏰ Deadline <b>${CK_DEADLINE[s.session]}</b></span>
     <div class="tb-spacer"></div>
     <div class="filter"><label>Date</label><input type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   </div>
   <div class="ck-toolbar"><div class="dept-chips">${chips}</div></div>
   ${areaChips}
   <div id="chk-prog" class="ck-progbar"></div>
   <div id="ck-temp-report"></div>
   <div id="chk-body"></div>
   <div class="ck-submit"><button class="btn primary lg" onclick="chkSubmit()">✓ Submit ${s.session} checklist</button></div>`;
  ckDraw();
}
function ckRows(ignoreArea){
  const s=State.chk;
  return DB.checklist.items.map(ckItem)
    .filter(r=>(s.dept==='ALL'||r.dept===s.dept) && ckInSession(r,s.session) && (ignoreArea||s.area==='ALL'||r.area===s.area));
}
function ckList(){
  return ckRows(false);
}
function ckAreaChips(){
  const s=State.chk;
  const areas=[...new Set(ckRows(true).map(r=>r.area))];
  if(areas.length<=1){ s.area='ALL'; return ''; }
  if(!areas.includes(s.area)) s.area=areas[0];
  const chips=areas.map(a=>`<button class="area-chip ${a===s.area?'active':''}" onclick="ckArea('${ckJS(a)}')">${esc(a)}</button>`).join('');
  return `<div class="ck-subtoolbar"><span>Sections</span><div class="area-chips">${chips}</div></div>`;
}
function ckDraw(){
  const rows=ckList(),C=DB.checklist,groups={};
  rows.forEach(r=>{(groups[r.dept]=groups[r.dept]||{})[r.area]=(groups[r.dept][r.area]||[]);groups[r.dept][r.area].push(r);});
  let html='';
  Object.entries(groups).forEach(([dept,areas])=>{
    const dm=C.deptMeta[dept]||{};
    html+=`<div class="ck-dept"><div class="ck-dept-h" style="--dc:${dm.color}"><span class="chk-dot" style="background:${dm.color}"></span>${esc(dept)}<span class="ck-dept-n">${Object.values(areas).flat().length} tasks</span></div>`;
    html+=ckRespHTML(dept);
    Object.entries(areas).forEach(([area,items])=>{
      html+=`<div class="ck-area-h">${esc(area)}${isAdmin()?`<button class="ck-add-task" onclick="ckAddTask('${ckJS(dept)}','${ckJS(area)}')">＋ Add task</button>`:''}</div>`;
      items.forEach(r=>{ const st=State.chk.state[r.i]||{}; const done=st.done;
        if(isAdmin() && State.chk.editing===r.i){
          html+=`<div class="ck-task editing" id="ck-row-${r.i}"><div class="ck-edit">
            <input id="cke-task" class="ck-edit-name" value="${esc(r.task)}" placeholder="Task description">
            <div class="ck-edit-row">
              <select id="cke-when"><option value="O" ${r.when==='O'?'selected':''}>☀️ Opening</option><option value="C" ${r.when==='C'?'selected':''}>🌙 Closing</option><option value="A" ${r.when==='A'?'selected':''}>All day</option></select>
              <select id="cke-photo"><option value="0" ${!r.photo?'selected':''}>No photo</option><option value="O" ${r.photo&&!r.photo.req?'selected':''}>📷 Photo optional</option><option value="R1-5" ${r.photo&&r.photo.req?'selected':''}>📷 Photo required</option></select>
              <button class="btn sm primary" onclick="ckSaveTask(${r.i})">💾 Save</button>
              <button class="btn sm" onclick="ckCancelEdit()">Cancel</button>
              <button class="btn sm ck-del" onclick="ckDelTask(${r.i})"><i class="fas fa-trash"></i></button>
            </div></div></div>`;
          return;
        }
        let photoHtml='';
        if(r.photo){
          if(r.meta.temp && st.defrosting){
            photoHtml=`<div class="ck-photos locked"><div class="ck-photos-h"><span class="ev-chip ev-opt">Defrosting</span><span class="ck-lock">Photo capture locked while defrosting</span></div></div>`;
          }else{
            const need=r.photo.req?r.photo.min:1, have=(st.photos||[]).length;
            const cap=r.meta.temp?(r.photo.max||1):Math.max(r.photo.max||5,5);   // allow up to 5 photos for normal tasks
            let slots=(st.photos||[]).map(u=>`<span class="ck-slot filled"><img class="ck-slot-img" src="${imgSrc(u)}"><span class="ck-rm" onclick="ckRmPhoto(event,${r.i},'${u}')">✕</span></span>`).join('');
            if(have<cap) slots+=`<label class="ck-slot"><input type="file" accept="image/*" capture="environment" onchange="ckPhoto(this,${r.i})"><span class="ck-slot-empty">📷<small>${r.meta.temp?'AI read':'Photo'}</small></span></label>`;
            photoHtml=`<div class="ck-photos" id="ck-photo-${r.i}"><div class="ck-photos-h">${photoChip(r.photo)} <span class="ck-pc ${have>=need?'ok':''}">${have}/${need}</span></div><div class="ck-slots">${slots}</div></div>`;
          }
        }
        html+=`<div class="ck-task ${done?'done':''}" id="ck-row-${r.i}">
          <button class="ck-check" onclick="ckTick(${r.i})">${done?'✓':''}</button>
          <div class="ck-main"><div class="ck-name">${esc(r.task)}${isAdmin()?`<span class="ck-task-admin"><button onclick="ckEditTask(${r.i})" title="Edit task">✎</button><button onclick="ckDelTask(${r.i})" title="Delete task">🗑</button></span>`:''}</div>
            ${r.meta.temp?ckTempBox(r,st):''}
            <input class="ck-note" placeholder="Add note…" value="${esc(st.note||'')}" oninput="ckNote(${r.i},this.value)">${photoHtml}</div></div>`;
      });
    });
    html+=`</div>`;
  });
  $('#chk-body').innerHTML=html||'<div class="empty">No tasks for this filter.</div>';
  const report=$('#ck-temp-report'); if(report) report.innerHTML=(State.chk.dept==='MANAGER')?ckTempReportHTML():'';
  ckProgress();
}
function ckRespId(dept,field){ return 'ck-resp-'+field+'-'+String(dept).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function ckRespHTML(dept){
  State.chk.resp=State.chk.resp||{};
  const rec=(State.chk.resp[dept]=State.chk.resp[dept]||{p1:'',p2:'',submittedBy:''});
  const field=(key,label,required)=>`<label class="ck-resp-field"><span>${esc(label)}${required?' <b>*</b>':''}</span><input id="${ckRespId(dept,key)}" list="ck-staff-list" value="${esc(rec[key]||'')}" placeholder="Enter name" oninput="ckResp('${ckJS(dept)}','${key}',this.value)"></label>`;
  return `<div class="ck-resp-card" id="${ckRespId(dept,'card')}">
    ${field('p1','Responsible Person 1',true)}
    ${field('p2','Responsible Person 2',false)}
    ${field('submittedBy','Submitted by',true)}
  </div>`;
}
function ckResp(dept,field,value){
  State.chk.resp=State.chk.resp||{};
  State.chk.resp[dept]=State.chk.resp[dept]||{p1:'',p2:'',submittedBy:''};
  State.chk.resp[dept][field]=value;
  const el=document.getElementById(ckRespId(dept,field));
  if(el&&value.trim()) el.classList.remove('invalid');
}
function ckProgress(){
  const rows=ckList(); let done=0,total=rows.length,preq=0,pdone=0,tok=0,tbad=0,tscan=0;
  rows.forEach(r=>{
    const st=State.chk.state[r.i]||{}; if(st.done)done++;
    const skipPhoto=r.meta.temp&&st.defrosting;
    if(r.photo&&!skipPhoto){preq++; if((st.photos||[]).length>=1)pdone++;}
    if(r.meta.temp&&st.temp){ if(st.temp.inRange) tok++; else tbad++; }
    if(r.meta.temp&&st.aiStatus==='scanning') tscan++;
  });
  const pct=total?Math.round(done/total*100):0;
  const hasTemp=rows.some(r=>r.meta&&r.meta.temp);
  const el=$('#chk-prog'); if(el) el.innerHTML=`<span class="count-chip">✅ ${done}/${total} done</span><span class="count-chip">📷 ${pdone}/${preq} photo tasks</span>
    ${hasTemp?`<span class="count-chip temp-ok">🌡️ ${tok} in range</span><span class="count-chip temp-bad">⚠️ ${tbad} out</span><span class="count-chip temp-scan">AI ${tscan} scanning</span>`:''}
    <span class="pwrap" style="flex:1;min-width:160px"><span class="pbar" style="flex:1"><i style="width:${pct}%"></i></span><b>${pct}%</b></span>`;
}
function ckTick(i){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  const r=ckItem(DB.checklist.items[i],i);
  const ps=r.photo;
  const skipPhoto=r.meta.temp&&st.defrosting;
  if(!st.done && r.meta.temp && !st.defrosting && st.aiStatus==='scanning'){
    toast('AI Vision is still reading the temperature');
    return;
  }
  if(!st.done && ps && !skipPhoto && (st.photos||[]).length<1){
    toast('📷 Attach at least 1 photo before marking this done');
    const row=document.getElementById('ck-row-'+i); const pe=row&&row.querySelector('.ck-photos');
    if(pe){ pe.classList.add('invalid','shake'); setTimeout(()=>pe.classList.remove('shake','invalid'),1400); }
    return;
  }
  if(!st.done && r.meta.temp && !st.defrosting && !st.temp){
    toast('AI Vision has not saved a temperature yet');
    return;
  }
  st.done=!st.done; const row=document.getElementById('ck-row-'+i);
  if(row){row.classList.toggle('done',st.done);row.querySelector('.ck-check').textContent=st.done?'✓':'';}
  ckProgress();
}
function ckNote(i,v){const st=State.chk.state[i]=State.chk.state[i]||{};st.note=v;}
async function ckPhoto(input,i){
  const f=input.files&&input.files[0]; if(!f)return;
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(r.meta.temp&&st.defrosting){ input.value=''; toast('Defrosting is ticked, so photo capture is locked'); return; }
  let ref; try{ const d=await compressImage(f); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d; }catch(e){ ref=URL.createObjectURL(f); }
  st.photos=st.photos||[]; st.photos.push(ref);
  if(r.meta.temp){ st.aiStatus='scanning'; st.temp=null; st.done=false; ckDraw(); toast('AI Vision reading temperature...');
    setTimeout(()=>ckAiTemp(i,f.name,f),700);
  }else{ ckDraw(); toast('📷 Photo added'); }
}
function ckRmPhoto(e,i,url){
  e.preventDefault(); e.stopPropagation();
  const st=State.chk.state[i], r=ckItem(DB.checklist.items[i],i);
  if(st&&st.photos){st.photos=st.photos.filter(u=>u!==url); if(r.meta.temp&&!st.photos.length){st.temp=null;st.aiStatus=null;st.done=false;} ckDraw();}
}
function ckSession(v){State.chk.session=v;State.chk.area='ALL';renderChecklist();}
function ckDept(d){State.chk.dept=d;State.chk.area='ALL';renderChecklist();}
/* ---- admin checklist CRUD (add / edit / delete task) ---- */
function ckEditTask(i){ State.chk.editing=i; renderChecklist(); }
function ckCancelEdit(){ State.chk.editing=null; renderChecklist(); }
function ckSaveTask(i){
  const it=DB.checklist.items[i]; if(!it) return;
  const name=(document.getElementById('cke-task')?.value||'').trim(); if(name) it[2]=name;
  const w=document.getElementById('cke-when')?.value; if(w) it[3]=w;
  const p=document.getElementById('cke-photo')?.value; it[4]= (p==='0'||!p)?0:p;
  State.chk.editing=null; renderChecklist(); toast('✓ Task saved');
}
function ckAddTask(dept,area){
  const when=State.chk.session==='Opening'?'O':'C';
  DB.checklist.items.push([dept,area,'NEW TASK',when,0]);
  State.chk.editing=DB.checklist.items.length-1;
  if(State.chk.dept!=='ALL' && State.chk.dept!==dept) State.chk.dept=dept;
  renderChecklist();
}
function ckDelTask(i){
  if(!confirm('Delete this checklist task permanently?')) return;
  DB.checklist.items.splice(i,1);
  const ns={}; Object.entries(State.chk.state||{}).forEach(([k,v])=>{k=+k; if(k===i)return; ns[k>i?k-1:k]=v;});
  State.chk.state=ns;
  if(State.chk.editing===i) State.chk.editing=null; else if(State.chk.editing>i) State.chk.editing--;
  renderChecklist(); toast('🗑 Task deleted');
}
function ckArea(a){State.chk.area=a;renderChecklist();}
function ckAll(v){ckList().forEach(r=>{const st=State.chk.state[r.i]=State.chk.state[r.i]||{};st.done=v;});ckDraw();}
function ckDefrost(i,on){
  const st=State.chk.state[i]=State.chk.state[i]||{};
  st.defrosting=on; st.aiStatus=null; st.temp=null;
  if(on){ st.photos=[]; st.done=true; ckRecordTemp(i,{defrosting:true,inRange:true,value:null}); }
  else st.done=false;
  ckDraw();
  toast(on?'Defrosting marked; photo capture locked':'Defrosting removed; photo required again');
}
function ckTempRange(type){ return (DB.checklist.tempRanges||{})[type]||{label:type,max:5,text:'<= 5 C'}; }
function ckTempInRange(v,type){
  const r=ckTempRange(type);
  if(typeof r.min==='number' && v<r.min) return false;
  if(typeof r.max==='number' && v>r.max) return false;
  return true;
}
async function ckAiTemp(i,fileName,file){
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(!r.meta.temp||st.defrosting) return;
  const result=await ckVisionValue(fileName,file,r,i);
  if(!result||!Number.isFinite(result.value)){
    st.aiStatus='error';
    st.temp=null;
    st.done=false;
    ckDraw();
    toast('AI Vision could not read the temperature. Retake a clearer photo.');
    return;
  }
  const value=result.value, inRange=ckTempInRange(value,r.meta.type);
  st.aiStatus='done';
  st.done=true;
  st.temp={value,inRange,type:r.meta.type,range:ckTempRange(r.meta.type).text,source:result.source||'AI Vision OCR',ocrText:result.text||'',confidence:result.confidence||null,at:new Date().toISOString()};
  ckRecordTemp(i,st.temp);
  if(!inRange) ckQueueTempAlert(i,st.temp);
  ckDraw();
  toast(inRange?`AI Vision saved ${value.toFixed(1)} C · in range`:`AI Vision saved ${value.toFixed(1)} C · Gmail alert queued`);
}
async function ckVisionValue(fileName,file,r,i){
  const endpoint=window.MCQ_AI_VISION_ENDPOINT||localStorage.getItem('mcq_ai_vision_endpoint');
  if(endpoint&&file){
    try{
      const body=new FormData();
      body.append('image',file,fileName||'temperature.jpg');
      body.append('equipment',r.meta.equipment||'');
      body.append('type',r.meta.type||'fridge');
      const res=await fetch(endpoint,{method:'POST',body});
      const data=await res.json();
      const v=Number(data.temperature ?? data.value ?? data.tempC);
      if(Number.isFinite(v)) return {value:v,source:'AI Vision endpoint',text:data.text||data.rawText||'',confidence:data.confidence||null};
    }catch(e){ console.warn('AI Vision endpoint failed, trying browser OCR',e); }
  }
  const ocr=await ckOcrTemperature(file,r.meta.type);
  if(ocr) return ocr;
  return null;
}
async function ckOcrTemperature(file,type){
  if(!file||!window.Tesseract) return null;
  try{
    const img=await ckPrepOcrImage(file);
    const res=await Tesseract.recognize(img,'eng',{
      tessedit_char_whitelist:'-0123456789.,Ccin '
    });
    const text=res?.data?.text||'';
    const value=ckPickTempFromText(text,type);
    if(Number.isFinite(value)) return {value,source:'AI Vision OCR',text,confidence:Math.round(res?.data?.confidence||0)};
  }catch(e){ console.warn('Temperature OCR failed; retake required',e); }
  return null;
}
function ckPickTempFromText(text,type){
  const clean=String(text||'').replace(/[−–—]/g,'-').replace(/,/g,'.');
  const tagged=[...clean.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:c|deg|degree|degrees|celsius)/ig)].map(m=>parseFloat(m[1]));
  const loose=[...clean.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>parseFloat(m[0]));
  return ckPickTempCandidate(tagged.concat(loose),type);
}
function ckPickTempCandidate(nums,type){
  let vals=nums.filter(n=>Number.isFinite(n)&&n>-45&&n<35);
  if(type==='freezer'){
    vals=vals.flatMap(n=>(n>10&&n<35)?[-Math.abs(n),n]:[n]);
  }
  vals=[...new Set(vals.map(n=>Math.round(n*10)/10))];
  if(!vals.length) return null;
  const inRange=vals.filter(n=>ckTempInRange(n,type));
  const target=type==='freezer'?-20:3.5;
  const pool=inRange.length?inRange:vals.filter(n=>type==='freezer'?n<=0:n>=-2&&n<=12);
  const finalPool=pool.length?pool:vals;
  return finalPool.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
}
function ckPrepOcrImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const max=1500, scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let p=0;p<data.data.length;p+=4){
        const gray=(data.data[p]*0.299+data.data[p+1]*0.587+data.data[p+2]*0.114);
        const hi=gray>145?255:Math.max(0,gray*0.7);
        data.data[p]=data.data[p+1]=data.data[p+2]=hi;
      }
      ctx.putImageData(data,0,0);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror=e=>reject(e);
    img.src=URL.createObjectURL(file);
  });
}
function ckRecordTemp(i,temp){
  const r=ckItem(DB.checklist.items[i],i);
  State.tempReadings=State.tempReadings||[];
  State.tempReadings.unshift({
    item:i,session:State.chk.session,store:State.branch,dept:r.meta.dept,equipment:r.meta.equipment,type:r.meta.type,
    value:temp.value,inRange:temp.inRange,defrosting:!!temp.defrosting,range:ckTempRange(r.meta.type).text,source:temp.source||'',confidence:temp.confidence||null,at:new Date().toISOString()
  });
}
function ckQueueTempAlert(i,temp){
  const r=ckItem(DB.checklist.items[i],i);
  State.tempAlerts=State.tempAlerts||[];
  State.tempAlerts.unshift({
    item:i,store:State.branch,session:State.chk.session,dept:r.meta.dept,equipment:r.meta.equipment,
    value:temp.value,range:temp.range,emails:DB.checklist.tempAlertEmails||[],at:new Date().toISOString()
  });
  const endpoint=window.MCQ_GMAIL_ALERT_ENDPOINT||localStorage.getItem('mcq_gmail_alert_endpoint');
  if(endpoint){
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(State.tempAlerts[0])}).catch(e=>console.warn('Gmail alert endpoint failed',e));
  }
}
function ckTempBox(r,st){
  const range=ckTempRange(r.meta.type), temp=st.temp;
  const status=st.defrosting?'defrost':(temp?(temp.inRange?'ok':'bad'):(st.aiStatus==='scanning'?'scan':(st.aiStatus==='error'?'error':'idle')));
  const reading=st.defrosting?'DEFROSTING':(temp?`${temp.value.toFixed(1)} C`:(st.aiStatus==='scanning'?'Scanning photo...':(st.aiStatus==='error'?'Retake photo':'Waiting for photo')));
  const source=temp?` · ${temp.source||'AI Vision'}${temp.confidence?` ${temp.confidence}%`:''}`:'';
  const detail=temp?`${temp.inRange?'Within safety range':'Outside safety range - Gmail alert queued'}${source}`:(st.aiStatus==='error'?'AI Vision could not read the number clearly':`Safety range ${range.text}`);
  return `<div class="ck-temp-box ${status}">
    <div class="ck-temp-main"><span class="ck-temp-label">${esc(range.label)}</span><b>${esc(reading)}</b><small>${esc(detail)}</small></div>
    <label class="ck-defrost"><input type="checkbox" ${st.defrosting?'checked':''} onchange="ckDefrost(${r.i},this.checked)"> Defrosting</label>
  </div>`;
}
function ckTempEntries(){
  const current=[];
  DB.checklist.items.forEach((it,i)=>{
    const r=ckItem(it,i), st=State.chk?.state?.[i]||{};
    if(!r.meta.temp) return;
    if(st.temp||st.defrosting) current.push({
      item:i,session:State.chk.session,store:State.branch,dept:r.meta.dept,equipment:r.meta.equipment,type:r.meta.type,
      value:st.temp?.value??null,inRange:st.defrosting?true:!!st.temp?.inRange,defrosting:!!st.defrosting,
      range:ckTempRange(r.meta.type).text,at:st.temp?.at||new Date().toISOString()
    });
  });
  const seen=new Set(current.map(e=>`${e.item}-${e.session}`));
  return current.concat((State.tempReadings||[]).filter(e=>!seen.has(`${e.item}-${e.session}`)));
}
function ckTempReportHTML(){
  const entries=ckTempEntries(), alerts=State.tempAlerts||[];
  const real=entries.filter(e=>!e.defrosting), ok=real.filter(e=>e.inRange).length, bad=real.filter(e=>!e.inRange).length, def=entries.filter(e=>e.defrosting).length;
  const latest=entries.slice(0,5).map(e=>`<div class="ck-tr-row ${e.defrosting?'defrost':(e.inRange?'ok':'bad')}"><b>${esc(e.dept)} · ${esc(e.equipment)}</b><span>${e.defrosting?'Defrosting':`${Number(e.value).toFixed(1)} C`}</span><small>${esc(e.range)}</small></div>`).join('');
  return `<div class="ck-temp-report card">
    <div class="ck-temp-head"><div><h3>AI Temperature Safety Report</h3><p>Fridge range ${esc(ckTempRange('fridge').text)} · Freezer range ${esc(ckTempRange('freezer').text)}</p></div><span>Gmail alerts ${alerts.length}</span></div>
    <div class="ck-temp-kpis">
      <div><b>${ok}</b><span>In range</span></div><div><b>${bad}</b><span>Out of range</span></div><div><b>${def}</b><span>Defrosting</span></div>
      <div><b>${real.length}</b><span>Weekly report</span></div><div><b>${real.length}</b><span>Monthly report</span></div>
    </div>
    ${latest?`<div class="ck-tr-list">${latest}</div>`:'<div class="ck-tr-empty">No temperature readings yet. Take a photo on Manager temperature checks and AI Vision will save the number automatically.</div>'}
  </div>`;
}
function chkSubmit(){
  const rows=ckList();
  const missingResp=[...new Set(rows.map(r=>r.dept))].filter(dept=>{
    const rec=(State.chk.resp||{})[dept]||{};
    return !String(rec.p1||'').trim()||!String(rec.submittedBy||'').trim();
  });
  if(missingResp.length){
    ckMarkRespMissing(missingResp);
    toast(`Enter Responsible Person 1 and Submitted by for ${missingResp.length} department(s)`);
    return;
  }
  const missingPhotos=rows.filter(r=>{
    const st=State.chk.state[r.i]||{}, skip=r.meta.temp&&st.defrosting;
    return r.photo&&!skip&&((st.photos||[]).length<1);
  });
  if(missingPhotos.length){
    ckMarkPhotoMissing(missingPhotos);
    toast(`📷 ${missingPhotos.length} photo task(s) need at least 1 photo before submit`);
    return;
  }
  const pendingTemps=rows.filter(r=>{
    const st=State.chk.state[r.i]||{};
    return r.meta.temp&&!st.defrosting&&(!st.temp||st.aiStatus!=='done'||!st.done);
  });
  if(pendingTemps.length){
    ckMarkTempMissing(pendingTemps);
    toast(`AI Vision must finish and mark done for ${pendingTemps.length} temperature check(s)`);
    return;
  }
  const done=rows.filter(r=>(State.chk.state[r.i]||{}).done).length;
  if(!done){ toast('Tick at least one task before submitting'); return; }
  const out=rows.filter(r=>r.meta.temp&&(State.chk.state[r.i]||{}).temp&&!((State.chk.state[r.i]||{}).temp.inRange)).length;
  toast(`✓ ${State.chk.session} checklist submitted${isAdmin()?'':' for '+State.branch} · ${done} done${out?' · '+out+' temp alert(s)':''}`);
}
function ckMarkRespMissing(depts){
  depts.forEach(dept=>{
    ['p1','submittedBy'].forEach(field=>{
      const el=document.getElementById(ckRespId(dept,field));
      if(el&&!el.value.trim()) el.classList.add('invalid','shake');
    });
  });
  const first=document.getElementById(ckRespId(depts[0],'p1'));
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-resp-field input.shake').forEach(el=>el.classList.remove('shake')),500);
}
function ckMarkPhotoMissing(rows){
  rows.forEach(r=>{
    const el=document.getElementById('ck-photo-'+r.i);
    if(el) el.classList.add('invalid','shake');
  });
  const first=document.getElementById('ck-row-'+rows[0].i);
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-photos.shake').forEach(el=>el.classList.remove('shake')),500);
}
function ckMarkTempMissing(rows){
  rows.forEach(r=>{
    const row=document.getElementById('ck-row-'+r.i);
    const box=row&&row.querySelector('.ck-temp-box');
    if(box) box.classList.add('invalid','shake');
  });
  const first=document.getElementById('ck-row-'+rows[0].i);
  if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$$('.ck-temp-box.shake').forEach(el=>el.classList.remove('shake')),500);
}

/* ============================================================ REPORT ISSUE — dynamic per-category form */
function renderIssue(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue','Report anything that needs management attention');
  if(!State.iss) State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  if(State.iss.tab==='analytics') return renderIssueAnalytics();
  if(State.iss.tab==='records') return renderIssueRecords();
  const cats=DB.issueCategories;
  const card=(k,c)=>`<button type="button" class="cat-card ${State.iss.cat===k?'selected':''}" data-k="${k}" style="--cc:${c.color}" onclick="issCat('${k}')"><i class="fas ${c.icon} cat-ic" style="color:${c.color}"></i><span class="cat-label">${esc(c.label)}</span></button>`;
  const cards=DB.issueGroups.map(g=>{const inG=Object.entries(cats).filter(([k,c])=>c.group===g); return inG.length?`<div class="cat-group-h">${esc(g)}</div><div class="cat-grid">${inG.map(([k,c])=>card(k,c)).join('')}</div>`:'';}).join('');
  const c=State.iss.cat?cats[State.iss.cat]:null, mod=c?c.mod:'issue';
  const fhBg=c?c.color+'1f':'#fdeaea', fhTitle=c?`<i class="fas ${c.icon}" style="color:${c.color}"></i>&nbsp; ${esc(c.label)}`:`<i class="fas fa-pen"></i>&nbsp; Issue details`;
  const routeLbl={maintenance:'Maintenance register',incident:'Incident register',complaint:'Customer Complaint register',issue:'Issues register'}[mod];
  $('#content').innerHTML=`
   <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue</h2><p>Report any operational issue, request or suggestion — reviewed by management only.</p></div>
     <div class="ph-actions">${issSeg('report')}</div></div>
   <div class="iss-cat-h">What would you like to report?</div>
   ${cards}
   <div class="iss-grid">
     <div class="card" id="iss-formcard">
       <div class="card-head" id="iss-formhead" style="background:${fhBg}"><h3>${fhTitle}</h3>${c?`<span class="reg-tag" style="margin-left:auto">→ ${routeLbl}</span>`:''}</div>
       <div class="card-pad">
         ${issFormBody(c,mod)}
         <div id="iss-warn" class="rail-tip" style="display:none;margin-top:14px">⚠️ Please select a category above first.</div>
         <button class="btn block lg iss-submit" style="margin-top:16px" onclick="issSubmit()"><i class="fas fa-paper-plane"></i>&nbsp; Submit Report</button>
       </div>
     </div>
     <aside class="form-rail">
       <div class="card rail-card" style="background:var(--accent-soft)"><h4>🛡️ Your report is confidential</h4>
         <ul><li>Only management can view submitted reports</li><li>Reports are reviewed promptly</li><li>For urgent issues, speak to your manager directly</li><li>Missed clock-in/out: management will adjust your timesheet</li><li>A photo is optional on every report</li></ul></div>
       ${issRailTip(mod)}
     </aside>
   </div>`;
}
/* dynamic form body by category mod */
function issFormBody(c,mod){
  const staffNames=DB.staff.filter(x=>isAdmin()||x.store===State.branch).map(x=>x.name);
  const nameOpts=['— Select your name —',...staffNames];
  const selName=State.iss.name||'', selStore=State.iss.store||State.branch;
  const stores=isAdmin()?DB.stores:[State.branch];
  const depts=(DB.checklist&&DB.checklist.depts)||[];
  const deptSel=id=>`<select id="${id}"><option value="">— Select —</option>${depts.map(d=>`<option>${esc(d)}</option>`).join('')}<option>Front of store / Checkout</option><option>Loading dock</option><option>Coolroom / Freezer</option><option>Online</option><option>Other</option></select>`;
  const prio=[['Low','mute'],['Normal','info'],['High','warn'],['Urgent','bad']];
  const prioLbl=mod==='complaint'||mod==='incident'?'Severity':'Priority';
  const prioHint=mod==='complaint'?'<div class="fhint">Low → Minor · Normal → Moderate · High / Urgent → Major</div>':'';
  const nameStore=`<div class="grid2">
       <div class="field"><label>${mod==='incident'||mod==='complaint'?'Submitted by':'Your name'} <span class="req">*</span></label><select id="iss-name">${nameOpts.map(n=>`<option ${n===selName?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
       <div class="field"><label>Store</label><select id="iss-store">${stores.map(s=>`<option ${s===selStore?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
     </div>`;
  const prioRow=`<div class="field" style="margin-top:14px"><label>${prioLbl}</label><div class="prio-pills" id="iss-prio">${prio.map(p=>`<button type="button" class="prio-pill ${p[1]} ${p[0]===State.iss.prio?'on':''}" data-v="${p[0]}" onclick="issPrio(this)">${p[0]}</button>`).join('')}</div>${prioHint}</div>`;
  let body;
  if(mod==='maintenance'){
    body=`${nameStore}${prioRow}
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Department / Area</label>${deptSel('iss-dept')}</div>
       <div class="field"><label>Equipment name <span class="req">*</span></label><input id="iss-equip" maxlength="120" placeholder="e.g. Coolroom 1 compressor, Till 2 scanner…"></div>
     </div>
     <div class="field" style="margin-top:14px"><label>Location detail</label><input id="iss-loc" maxlength="120" placeholder="e.g. Till 2, Coolroom 1, Loading dock…"></div>
     <div class="field" style="margin-top:14px"><label>What's wrong? <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe the fault — when it started, noises, leaks, error codes, what stopped working…"></textarea></div>`;
  } else if(mod==='complaint'){
    const staff2=`<select id="iss-staff2"><option value="">— N/A / Unknown —</option>${staffNames.map(n=>`<option>${esc(n)}</option>`).join('')}</select>`;
    const channels=['In-store','Phone','Email','Social Media','Google Review','Other'];
    const actions=['Refund / exchange processed','Product replaced','Voucher / goodwill given','Apology only (no transaction)','None (information only)','Acknowledged & escalated to Store Manager'];
    body=`${nameStore}${prioRow}
     <div class="field" style="margin-top:14px"><label>Channel</label><div class="iss-radios" id="iss-channel">${channels.map((ch,i)=>`<label class="iss-radio"><input type="radio" name="iss-channel" value="${esc(ch)}" ${i===0?'checked':''}> ${esc(ch)}</label>`).join('')}</div></div>
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Department</label>${deptSel('iss-dept')}</div>
       <div class="field"><label>Staff being complained about</label>${staff2}</div>
     </div>
     <div class="field" style="margin-top:14px"><label>Complaint details <span class="req">*</span></label><textarea id="iss-desc" placeholder="What did the customer complain about? Include product, price, time, and what was said…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Immediate action taken</label><div class="iss-checks" id="iss-actions">${actions.map(a=>`<label class="iss-check"><input type="checkbox" value="${esc(a)}"> ${esc(a)}</label>`).join('')}</div>
       <div class="fhint"><b>Minor:</b> tick what you did. <b>Moderate / Major:</b> you MUST tick “Acknowledged & escalated to Store Manager”.</div></div>
     <div class="iss-subhead">Customer info <span class="opt">(optional)</span></div>
     <div class="grid2">
       <div class="field"><label>Customer name</label><input id="iss-cust-name" placeholder="Optional"></div>
       <div class="field"><label>Customer contact (phone / email)</label><input id="iss-cust-contact" placeholder="Optional"></div>
     </div>
     <div class="field" style="margin-top:14px"><label>Did the customer request follow-up?</label><div class="iss-radios" id="iss-followup"><label class="iss-radio"><input type="radio" name="iss-followup" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-followup" value="Yes"> Yes</label></div></div>
     <div class="field" style="margin-top:14px"><label>Photo / evidence URL <span class="opt">(optional)</span></label><input id="iss-url" placeholder="Paste a link to a photo, screenshot or online review…"></div>`;
  } else if(mod==='incident'){
    const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    body=`${nameStore}${prioRow}
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Area / Location</label><input id="iss-loc" maxlength="120" placeholder="e.g. Coolroom 1, Aisle 4, Loading dock…"></div>
       <div class="field"><label>Incident date & time</label><input type="datetime-local" id="iss-when" value="${nowLocal}"></div>
     </div>
     <div class="grid2" style="margin-top:14px">
       <div class="field"><label>Injury?</label><div class="iss-radios" id="iss-injury"><label class="iss-radio"><input type="radio" name="iss-injury" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-injury" value="Yes"> Yes</label></div></div>
       <div class="field"><label>Medical attention required?</label><div class="iss-radios" id="iss-medical"><label class="iss-radio"><input type="radio" name="iss-medical" value="No" checked> No</label><label class="iss-radio"><input type="radio" name="iss-medical" value="Yes"> Yes</label></div></div>
     </div>
     <div class="field" style="margin-top:14px"><label>What happened? <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe clearly and factually — what happened, where, and who was involved…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Immediate action taken? <span class="req">*</span></label><textarea id="iss-action" placeholder="e.g. first aid given, area isolated, equipment removed, manager informed…"></textarea></div>
     <div class="field" style="margin-top:14px"><label>Photo / evidence URL <span class="opt">(optional)</span></label><input id="iss-url" placeholder="Paste a link to a photo or document…"></div>`;
  } else { /* generic operational / people / other */
    body=`${nameStore}${prioRow}
     <div class="field" style="margin-top:14px"><label>Brief title <span class="req">*</span></label><input id="iss-title" maxlength="120" placeholder="Short description of the issue…"></div>
     <div class="field" style="margin-top:14px"><label>Full description <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe the issue in detail. Include dates, names and any relevant info…"></textarea><div class="fhint">All reports are confidential and reviewed by management only.</div></div>`;
  }
  return body+issPhotoBox();
}
function issPhotoBox(){ const has=!!State.iss.photo;
  return `<div class="field" style="margin-top:14px"><label>Photo <span class="opt">(optional)</span></label>
     <label class="photo-box" id="iss-photobox"><input type="file" accept="image/*" capture="environment" onchange="issPhoto(this)" style="display:none">
       <div id="iss-ph-empty" style="display:${has?'none':'block'}"><i class="fas fa-camera"></i><div class="pb-t">Tap to take / attach a photo (optional)</div></div>
       <img id="iss-ph-img" src="${has?imgSrc(State.iss.photo):''}" style="display:${has?'block':'none'}"></label>
     <div id="iss-ph-rm" style="display:${has?'block':'none'};margin-top:8px"><button class="btn sm" onclick="issClearPhoto(event)">✕ Remove photo</button></div>
   </div>`;
}
function issRailTip(mod){
  const tips={
    maintenance:['Name the exact equipment + location so the right tech is sent','Refrigeration / electrical faults → mark Urgent','Add a photo of the fault or error code if you can'],
    complaint:['Stay factual — record what the customer said','Moderate / Major must be escalated to the Store Manager','Customer details are optional and kept confidential'],
    incident:['Make people safe first, then report','Record date, time and exact location','Note any injury and whether medical help was needed'],
    issue:['Low stock / supplier / HR / suggestions go here','Missed clock-in/out: management will adjust your timesheet','Be specific so it can be actioned quickly'],
  };
  const t=tips[mod]||tips.issue;
  return `<div class="card rail-card"><h4>Tips for this report</h4><ul>${t.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function issCat(k){
  if(State.iss){ const n=$('#iss-name'),s=$('#iss-store'); if(n)State.iss.name=n.value; if(s)State.iss.store=s.value; }
  State.iss.cat=k; renderIssue();
  const fc=$('#iss-formcard'); if(fc) fc.scrollIntoView({behavior:'smooth',block:'start'});
}
function issPrio(btn){ $$('#iss-prio .prio-pill').forEach(p=>p.classList.remove('on')); btn.classList.add('on'); State.iss.prio=btn.dataset.v; }
async function issPhoto(input){ const f=input.files&&input.files[0]; if(!f) return;
  let ref; try{ const d=await compressImage(f); ref=(window.MCQDB&&MCQDB.savePhoto)?MCQDB.savePhoto(d):d; }catch(e){ ref=URL.createObjectURL(f); }
  State.iss.photo=ref;
  const img=$('#iss-ph-img'); if(img){ img.src=imgSrc(ref); img.style.display='block'; }
  const em=$('#iss-ph-empty'); if(em) em.style.display='none'; const rm=$('#iss-ph-rm'); if(rm) rm.style.display='block'; }
function issClearPhoto(e){ e.preventDefault(); e.stopPropagation(); State.iss.photo=null; $('#iss-ph-img').style.display='none'; $('#iss-ph-empty').style.display='block'; $('#iss-ph-rm').style.display='none'; }
function issSubmit(){
  if(!State.iss.cat){ const w=$('#iss-warn'); if(w){w.style.display='flex';} window.scrollTo({top:0,behavior:'smooth'}); return; }
  const c=DB.issueCategories[State.iss.cat], mod=c.mod;
  const val=id=>{const e=$('#'+id); return e?e.value.trim():'';};
  const radio=nm=>{const e=document.querySelector(`input[name="${nm}"]:checked`); return e?e.value:'';};
  const checks=id=>{const w=$('#'+id); return w?[...w.querySelectorAll('input:checked')].map(x=>x.value):[];};
  // validation
  $$('#iss-formcard .invalid').forEach(e=>e.classList.remove('invalid'));
  const req= mod==='maintenance'?['iss-name','iss-equip','iss-desc']
           : mod==='incident'   ?['iss-name','iss-desc','iss-action']
           : mod==='complaint'  ?['iss-name','iss-desc']
           :                      ['iss-name','iss-title','iss-desc'];
  let bad=null;
  req.forEach(id=>{const e=$('#'+id); if(!e) return; const empty=(id==='iss-name')?(e.value.startsWith('—')||!e.value.trim()):!e.value.trim();
    if(empty){ e.classList.add('invalid','shake'); setTimeout(()=>e.classList.remove('shake'),450); bad=bad||e; }});
  if(bad){ toast('Please complete the required fields'); bad.scrollIntoView({behavior:'smooth',block:'center'}); return; }
  const name=val('iss-name'), desc=val('iss-desc'), store=$('#iss-store').value, prio=State.iss.prio||'Normal';
  const now=new Date().toISOString().slice(0,16).replace('T',' '), ymd=new Date().toISOString().slice(0,10).replace(/-/g,''), rnd=()=>Math.floor(1000+Math.random()*9000);
  const sev=DB.prioToSeverity[prio]; const photo=State.iss.photo||''; let modOut=mod, ref, rec;
  if(mod==='maintenance'){
    const dept=val('iss-dept'), loc=val('iss-loc'), equip=val('iss-equip');
    ref=`MTN-${ymd}-${rnd()}`;
    rec={id:ref,created:now,store,equipment:equip,category:c.label,department:dept,location:loc,priority:sev,severity:sev,status:'New',issue:desc,reportedBy:name,photo};
  } else if(mod==='incident'){
    const loc=val('iss-loc'), when=(val('iss-when')||'').replace('T',' '), injury=radio('iss-injury'), medical=radio('iss-medical'), action=val('iss-action'), url=val('iss-url');
    ref=`INC-${ymd}-${rnd()}`;
    rec={id:ref,created:now,store,type:c.label,category:c.label,severity:sev,status:'New',location:loc,occurredAt:when,injury,medicalAttention:medical,summary:desc,actionTaken:action,reportedBy:name,evidenceUrl:url,photo};
  } else if(mod==='complaint'){
    const channel=radio('iss-channel'), dept=val('iss-dept'), staff2=val('iss-staff2'), actions=checks('iss-actions'), custName=val('iss-cust-name'), custContact=val('iss-cust-contact'), followup=radio('iss-followup'), url=val('iss-url');
    ref=`CCL-${ymd}-${rnd()}`;
    rec={id:ref,created:now,store,severity:DB.prioToComplaint[prio],category:c.label,channel,department:dept,staffComplained:staff2,shortDescription:desc,actionTaken:actions.join(', '),customerName:custName,customerContact:custContact,followup,status:'Open',reportedBy:name,evidenceUrl:url,age:0,photo};
  } else {
    modOut='issue'; const title=val('iss-title'); ref=`ISS-${ymd}-${rnd()}`;
    rec={id:ref,created:now,store,title,category:c.label,priority:prio,status:'Open',reportedBy:name,description:desc,photo};
  }
  DB.modules[modOut].records.unshift(rec);
  const names=(DB.issueEmailRoutes[State.iss.cat]||[]).map(k=>(DB.emailRecipients.find(x=>x.key===k)||{}).name).filter(Boolean);
  State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  if(window.persist) window.persist();
  toast(`✓ ${ref} → ${DB.modules[modOut].short}${names.length?' · 📧 '+names.length+' emailed':''}`); buildSidebar(); renderIssue();
}

/* ---- Report Issue · Analytics (by category + branch comparison) ---- */
const ISS_GROUP_COLOR={'Maintenance & Facility':'#f59e0b','Customer Complaint':'#ec4899','Safety & Incident':'#ef4444','Operational':'#3b82f6','People':'#8b5cf6','Other':'#64748b'};
function issGroupOf(r){
  if(r.mod==='maintenance') return 'Maintenance & Facility';
  if(r.mod==='incident') return 'Safety & Incident';
  if(r.mod==='complaint') return 'Customer Complaint';
  const c=Object.values(DB.issueCategories).find(x=>x.label===r.category); return c?c.group:'Other';
}
function issTab(t){ if(!State.iss)State.iss={cat:'',photo:null,prio:'Normal'}; State.iss.tab=t; renderIssue(); }
function issDrill(cat){ if(!State.iss)State.iss={}; State.iss.drillCat = State.iss.drillCat===cat?null:cat; renderIssueAnalytics(); }
function issSeg(active){ return `<div class="seg seg-light"><button class="seg-btn ${active==='report'?'active':''}" onclick="issTab('report')">➕ New</button><button class="seg-btn ${active==='records'?'active':''}" onclick="issTab('records')">📋 Records</button><button class="seg-btn ${active==='analytics'?'active':''}" onclick="issTab('analytics')">📊 Analytics</button></div>`; }
function issRecDate(which,val){ State.iss=State.iss||{}; State.iss[which]=val; renderIssueRecords(); }
function renderIssueRecords(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue · Records','All reports across registers');
  if(!State.iss) State.iss={tab:'records'};
  const regMods=['issue','maintenance','incident','complaint'];
  let all=[]; regMods.forEach(id=>DB.modules[id].records.forEach(r=>all.push({mod:id,icon:DB.modules[id].icon,short:DB.modules[id].short,...r})));
  if(!isSuper()) all=all.filter(r=>r.store===State.branch);
  const from=State.iss.recFrom||'', to=State.iss.recTo||'';
  all=all.filter(r=>{ const d=String(r.created||r.date||'').slice(0,10); if(from&&(!d||d<from)) return false; if(to&&(!d||d>to)) return false; return true; });
  all.sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue · Records</h2><p>Every report — Issue / Maintenance / Incident / Complaint, newest first.</p></div>
      <div class="ph-actions">${issSeg('records')}</div></div>
    <div class="toolbar"><span class="count-chip">📋 ${all.length} report${all.length!==1?'s':''}</span>
      <div class="filter f-daterange"><label>Date</label><input type="date" value="${esc(from)}" onchange="issRecDate('recFrom',this.value)"><span>→</span><input type="date" value="${esc(to)}" onchange="issRecDate('recTo',this.value)"></div>
      ${from||to?`<button class="btn sm" onclick="issRecDate('recFrom','');State.iss.recTo='';renderIssueRecords()">✕ Clear</button>`:''}
      <div class="tb-spacer"></div>${exportBtns('iss-rec-table','Report Issue Records')}</div>
    <div class="card"><div class="card-head"><h3>${isSuper()?'All stores':esc(State.branch)} · ${all.length} reports</h3></div><div class="table-wrap"><table class="grid" id="iss-rec-table"><thead><tr><th>Ref</th><th>Register</th><th>Title</th><th>Store</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${all.length?all.map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td><div class="wrap">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.category||'')}</div></td><td>${esc(r.store||'')}</td><td>${(r.priority||r.severity)?badge(r.priority||r.severity):''}</td><td>${r.status?badge(r.status):''}</td><td>${esc((r.created||r.date||'').slice(0,16))}</td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No reports in this range.</div></td></tr>'}
    </tbody></table></div></div>`;
}
function renderIssueEmail(){
  setAccent('#1565c0'); setCrumb('🚩','Report an Issue · Email routing','Choose who gets emailed per category');
  const cats=DB.issueCategories, recips=DB.emailRecipients;
  let rows='';
  DB.issueGroups.forEach(g=>{ const inG=Object.entries(cats).filter(([k,c])=>c.group===g); if(!inG.length) return;
    rows+=`<tr class="er-grouprow"><td colspan="${recips.length+1}">${esc(g)}</td></tr>`;
    inG.forEach(([k,c])=>{ rows+=`<tr><td class="er-cat"><i class="fas ${c.icon}" style="color:${c.color}"></i> ${esc(c.label)}</td>${recips.map(r=>{const on=(DB.issueEmailRoutes[k]||[]).includes(r.key);return `<td class="ctr"><input type="checkbox" ${on?'checked':''} onchange="issEmailToggle('${k}','${r.key}',this.checked)"></td>`;}).join('')}</tr>`; });
  });
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#e8f1fe">📧</div><div><h2>Report Issue · Email routing</h2><p>Tick who receives an email when a report is submitted in each category.</p></div>
      <div class="ph-actions">${issSeg('email')}</div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-pad er-recips">${recips.map(r=>`<div class="er-recip"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></div>`).join('')}</div></div>
    <div class="card"><div class="table-wrap"><table class="grid er-table"><thead><tr><th>Category</th>${recips.map(r=>`<th class="ctr">${esc(r.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="rail-tip" style="margin-top:14px">💡 When staff submit a report in a category, the ticked people are emailed automatically. <b>(Demo shows who would be notified.)</b></div>`;
}
function issEmailToggle(cat,rk,on){ const a=DB.issueEmailRoutes[cat]=DB.issueEmailRoutes[cat]||[]; const i=a.indexOf(rk); if(on&&i<0)a.push(rk); if(!on&&i>=0)a.splice(i,1); }
function renderIssueAnalytics(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue · Analytics','By category & branch comparison');
  const regMods=['issue','maintenance','incident','complaint'];
  let all=[]; regMods.forEach(id=>DB.modules[id].records.forEach(r=>all.push({mod:id,...r})));
  if(!isAdmin()) all=all.filter(r=>r.store===State.branch);
  const open=all.filter(r=>!['Closed','Cancelled','Resolved','Store Confirmed'].includes(r.status)).length;
  const catCount={}; all.forEach(r=>{const c=r.category||'Other';catCount[c]=(catCount[c]||0)+1;});
  const catEnt=Object.entries(catCount).sort((a,b)=>b[1]-a[1]);
  const groups=DB.issueGroups, stores=isAdmin()?DB.stores:[State.branch];
  const matrix={}; stores.forEach(s=>matrix[s]=Object.fromEntries(groups.map(g=>[g,0])));
  all.forEach(r=>{const g=issGroupOf(r); if(matrix[r.store]) matrix[r.store][g]++;});
  const kpis=[['📋',all.length,'Total reports','info'],['🔴',open,'Open','bad'],['🗂️',catEnt.length,'Categories','warn'],['🏪',stores.length,'Branches','ok']];
  const matRows=stores.map(s=>{const row=matrix[s],tot=groups.reduce((n,g)=>n+row[g],0);
    return `<tr><td><b>${esc(s)}</b></td>${groups.map(g=>`<td class="num">${row[g]?`<span class="mx" style="background:${ISS_GROUP_COLOR[g]};opacity:${(0.5+Math.min(0.5,row[g]/8)).toFixed(2)}">${row[g]}</span>`:'<span class="mx0">·</span>'}</td>`).join('')}<td class="num"><b>${tot}</b></td></tr>`;}).join('');
  const totRow=`<tr class="mx-tot"><td><b>All branches</b></td>${groups.map(g=>`<td class="num"><b>${stores.reduce((n,s)=>n+matrix[s][g],0)}</b></td>`).join('')}<td class="num"><b>${all.length}</b></td></tr>`;
  const dc=State.iss.drillCat||null;
  const catChips=catEnt.map(([lbl,n])=>`<button class="drill-chip ${dc===lbl?'on':''}" onclick="issDrill('${lbl}')">${esc(lbl)} <b>${n}</b></button>`).join('');
  let drillHtml='';
  if(dc){ const dRecs=all.filter(r=>(r.category||'Other')===dc), dOpen=dRecs.filter(r=>!['Closed','Cancelled','Resolved','Store Confirmed'].includes(r.status)).length;
    const topStore=stores.map(s=>[s,dRecs.filter(r=>r.store===s).length]).sort((a,b)=>b[1]-a[1])[0];
    drillHtml=`<div class="card drill-card"><div class="card-head"><h3>🔎 ${esc(dc)}</h3><span class="ch-sub">${dRecs.length} reports · ${dOpen} open${isSuper()&&topStore&&topStore[1]?` · most at ${esc(topStore[0])}`:''}</span><button class="btn sm" style="margin-left:auto" onclick="issDrill('${dc}')">✕ Close</button></div>
      <div class="card-pad"><div class="chart-grid cols-2"><div><div class="mini-h">By store</div><div class="chart-box"><canvas id="iad-store"></canvas></div></div><div><div class="mini-h">By status</div><div class="chart-box"><canvas id="iad-status"></canvas></div></div></div></div></div>`; }
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue · Analytics</h2><p>Breakdown by category, with a side-by-side comparison across branches.</p></div>
      <div class="ph-actions">${issSeg('analytics')}</div></div>
    <div class="kpi-grid">${kpis.map(k=>`<div class="kpi tone-${k[3]}"><div class="k-top"><div class="k-ic">${k[0]}</div></div><div class="k-val">${k[1]}</div><div class="k-lbl">${esc(k[2])}</div></div>`).join('')}</div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>Reports by category</h3></div><div class="card-pad"><div class="chart-box"><canvas id="ia-cat"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Branch comparison</h3><span class="ch-sub">stacked by type</span></div><div class="card-pad"><div class="chart-box"><canvas id="ia-branch"></canvas></div></div></div>
    </div>
    <div class="section-title">Branch × category matrix</div>
    <div class="card"><div class="table-wrap"><table class="grid mx-table"><thead><tr><th>Store</th>${groups.map(g=>`<th>${esc(g.split(' & ')[0].replace('Maintenance','Maint.'))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${matRows}${totRow}</tbody></table></div></div>
    <div class="section-title">Per-category analytics — click a category to drill in</div>
    <div class="drill-chips">${catChips||'<span class="text-muted" style="color:var(--muted)">No data.</span>'}</div>
    ${drillHtml}`;
  if(dc){ const dRecs=all.filter(r=>(r.category||'Other')===dc);
    const sCounts=stores.map(s=>dRecs.filter(r=>r.store===s).length);
    mkChart('iad-store',{type:'bar',data:{labels:stores,datasets:[{data:sCounts,backgroundColor:'#e53935',borderRadius:6,maxBarThickness:30}]},options:baseOpts({legend:false})});
    const stMap={}; dRecs.forEach(r=>{const s=r.status||'—';stMap[s]=(stMap[s]||0)+1;}); const se=Object.entries(stMap);
    mkChart('iad-status',{type:'doughnut',data:{labels:se.map(x=>x[0]),datasets:[{data:se.map(x=>x[1]),backgroundColor:se.map(x=>toneHex(x[0])),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  }
  mkChart('ia-cat',{type:'bar',data:{labels:catEnt.map(e=>e[0]),datasets:[{data:catEnt.map(e=>e[1]),backgroundColor:catEnt.map((e,i)=>PALETTE[i%PALETTE.length]),borderRadius:7,maxBarThickness:20}]},options:baseOpts({indexAxis:'y',legend:false})});
  const datasets=groups.map(g=>({label:g,data:stores.map(s=>matrix[s][g]),backgroundColor:ISS_GROUP_COLOR[g],borderRadius:4}));
  mkChart('ia-branch',{type:'bar',data:{labels:stores,datasets},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',padding:9,font:{family:'Inter',size:10,weight:'600'},color:'#475569'}},tooltip:{backgroundColor:'#0f172a',padding:10,cornerRadius:9}},
    scales:{x:{stacked:true,grid:{display:false},ticks:{font:{family:'Inter',size:10},color:'#64748b'},border:{display:false}},y:{stacked:true,grid:{color:'#eef2f7'},ticks:{precision:0,font:{family:'Inter',size:11},color:'#64748b'},border:{display:false}}}}});
}

/* ============================================================ STAFF STRUCTURE (org chart) */
function renderStructure(){
  setAccent('#1e7a52'); setCrumb('🏢','Staff Structure','Organisation chart by department');
  const top=DB.structure[0];
  const cards=DB.structure.slice(1).map(d=>`<div class="org-card" style="--c:${d.color}">
    <div class="org-dept">${esc(d.dept)}</div><div class="org-head">${esc(d.head)}</div>
    <ul class="org-members">${d.members.map(m=>`<li>${esc(m)}</li>`).join('')}</ul></div>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🏢</div><div><h2>Staff Structure</h2><p>How MCQ supermarket teams report and connect.</p></div></div>
    <div class="org-top"><div class="org-card org-boss" style="--c:#0e9f6e"><div class="org-dept">${esc(top.dept)}</div><div class="org-head">${esc(top.head)}</div>
      <ul class="org-members">${top.members.map(m=>`<li>${esc(m)}</li>`).join('')}</ul></div></div>
    <div class="org-line"></div><div class="org-grid">${cards}</div>`;
}

/* ============================================================ STAFF MEMBERS */
function renderStaff(){
  setAccent('#0e9f6e'); setCrumb('🧑‍🤝‍🧑','Staff Members',`${DB.staff.length} people`);
  const rows=DB.staff.filter(s=>isSuper()||s.store===State.branch);
  const active=rows.filter(s=>s.active).length;
  const ed=State.staffEdit, roles=DB.staffRoles||['Staff'];
  let editForm='';
  if(ed){ const s = ed==='new'?{id:'',name:'',role:roles[4]||roles[0],store:State.branch,phone:'',dob:'',start:new Date().toISOString().slice(0,10),active:1} : (DB.staff.find(x=>x.id===ed)||{});
    editForm=`<div class="card" style="margin-bottom:16px;border:2px solid var(--accent-soft)"><div class="card-head"><h3>${ed==='new'?'➕ Add staff member':'✎ Edit '+esc(s.name)}</h3><button class="btn sm" style="margin-left:auto" onclick="staffCancel()">✕ Cancel</button></div>
      <div class="card-pad"><div class="grid2">
        <div class="field"><label>Full name <span class="req">*</span></label><input id="st-name" value="${esc(s.name||'')}"></div>
        <div class="field"><label>Role</label><select id="st-role">${roles.map(r=>`<option ${r===s.role?'selected':''}>${esc(r)}</option>`).join('')}</select></div>
        <div class="field"><label>Store</label><select id="st-store">${DB.stores.map(x=>`<option ${x===s.store?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label>Phone</label><input id="st-phone" value="${esc(s.phone||'')}" placeholder="0400 000 000"></div>
        <div class="field"><label>Date of birth</label><input type="date" id="st-dob" value="${esc(s.dob||'')}"></div>
        <div class="field"><label>Start date</label><input type="date" id="st-start" value="${esc(s.start||'')}"></div>
        <div class="field"><label>Status</label><select id="st-active"><option value="1" ${s.active?'selected':''}>Active</option><option value="0" ${!s.active?'selected':''}>Inactive</option></select></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn primary" onclick="staffSave('${ed}')">💾 Save</button>${ed!=='new'?`<button class="btn" style="color:var(--bad);border-color:#f3c9c9" onclick="staffDelete('${esc(ed)}')"><i class="fas fa-trash"></i>&nbsp; Delete</button>`:''}</div>
      </div></div>`;
  }
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🧑‍🤝‍🧑</div><div><h2>Staff Members</h2><p>Team directory${isSuper()?' · all stores':' · '+esc(State.branch)}.</p></div>
      <div class="ph-actions"><button class="btn primary" onclick="staffNew()"><i class="fas fa-user-plus"></i>&nbsp; Add member</button></div></div>
    <div class="kpi-grid"><div class="kpi tone-info"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${rows.length}</div><div class="k-lbl">Total staff</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${active}</div><div class="k-lbl">Active</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🏪</div></div><div class="k-val">${new Set(rows.map(s=>s.store)).size}</div><div class="k-lbl">Stores</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧰</div></div><div class="k-val">${new Set(rows.map(s=>s.role)).size}</div><div class="k-lbl">Roles</div></div></div>
    ${editForm}
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Directory · ${rows.length}</h3></div><div class="table-wrap"><table class="grid"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Store</th><th>Phone</th><th>DOB</th><th>Started</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(s=>`<tr><td class="cell-id">#${esc(s.id)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.role||'')}</td><td>${esc(s.store)}</td><td>${esc(s.phone||'')}</td><td>${esc(s.dob||'—')}</td><td>${esc(s.start||'')}</td><td>${s.active?'<span class="badge ok"><span class="bdot"></span>Active</span>':'<span class="badge mute"><span class="bdot"></span>Inactive</span>'}</td><td><span class="ck-task-admin"><button onclick="staffEditOpen('${esc(s.id)}')" title="Edit">✎</button><button onclick="staffDelete('${esc(s.id)}')" title="Delete">🗑</button></span></td></tr>`).join('')}
      </tbody></table></div></div>`;
}
function staffNew(){ State.staffEdit='new'; renderStaff(); window.scrollTo({top:0,behavior:'smooth'}); }
function staffEditOpen(id){ State.staffEdit=id; renderStaff(); window.scrollTo({top:0,behavior:'smooth'}); }
function staffCancel(){ State.staffEdit=null; renderStaff(); }
function staffSave(ed){
  const g=id=>(document.getElementById(id)?.value||'');
  const name=g('st-name').trim(); if(!name){ toast('Enter a name'); return; }
  const rec={name,role:g('st-role'),store:g('st-store'),phone:g('st-phone'),dob:g('st-dob'),start:g('st-start'),active:g('st-active')==='1'?1:0};
  if(ed==='new'){ rec.id=String(20000+Math.floor(Math.random()*9000)); DB.staff.unshift(rec); }
  else { const s=DB.staff.find(x=>x.id===ed); if(s) Object.assign(s,rec); }
  State.staffEdit=null; toast('✓ Staff saved'); renderStaff();
}
function staffDelete(id){ if(!confirm('Delete this staff member permanently?')) return; const i=DB.staff.findIndex(x=>x.id===id); if(i>=0) DB.staff.splice(i,1); State.staffEdit=null; toast('🗑 Staff deleted'); renderStaff(); }

/* ============================================================ JOB SCHEDULE — duties per department + weekly roster */
const JOB_DUTIES={
  'Cashier':{icon:'fa-cash-register',color:'#0ea5e9',kw:'cashier',tasks:['Open tills, count float & test EFTPOS by 7:50am','Greet & serve customers, keep queues moving','Restock bags, receipt rolls & front counter','Face up cigarettes, medicine & front cabinets','Cash-up, process returns & reconcile tills at close']},
  'FV':{icon:'fa-carrot',color:'#10b981',kw:'fv',tasks:['Fill fruit & veg displays by 8:30am and 2:00pm','Quality-check & rotate stock, remove spoilage','Cut fruit / salad & pack second stock','Spray water on greens every 30 minutes','Clean cutting area, coolroom & crates']},
  'Grocery':{icon:'fa-basket-shopping',color:'#f59e0b',kw:'grocer',tasks:['Fill key-value lines & face up front shelves','Check price-label accuracy & promo tags','Random expiry check on short-dated stock','Keep aisles clear — no pallet jacks / boxes blocking','Flatten cartons & return left-behind products']},
  'Frozen & Dairy':{icon:'fa-snowflake',color:'#0891b2',kw:'dairy',tasks:['Fill dairy & frozen lines, face up shelves','Confirm fridge / freezer temps logged with Manager','Expiry check & markdowns completed','Keep fridges clean, clear & organised','Report any temperature alarm immediately']},
  'Butcher':{icon:'fa-drumstick-bite',color:'#ef4444',kw:'butcher',tasks:['Prepare sanitizer & paper towel at the station','Fill & face meat display, labels correct','Keep trays gapped front & back, rotate stock','Label & date all crates in the coldroom','Wrap & wash trays, wipe windows at close']},
  'Cosmetic':{icon:'fa-wand-magic-sparkles',color:'#ec4899',kw:'cosmetic',tasks:['Fully stock & face up all cosmetic shelves','Wipe glass cabinets fingerprint-free','Clean & top up tester units','Price new arrivals & check expiry / markdowns','Keep section neat, organised & shoppable']},
  'Office':{icon:'fa-file-invoice-dollar',color:'#64748b',kw:'manager',tasks:['Keep desks & tables clean and organised','Sort, file & check invoices against deliveries','Update price changes & print shelf labels','Send invoice batch to Head Office (Mon & Thu)','Count petty cash & back up daily sales report']},
  'Café':{icon:'fa-mug-hot',color:'#b45309',kw:'caf',tasks:['Set up café & check homemade / supplier fridge temps','Prep & display fresh items with correct labels','Keep counter, machine & seating clean','Descale coffee machine weekly','Cash-up & switch off appliances at close']},
};
function renderSchedule(){
  setAccent('#6a1b9a'); setCrumb('🗓️','Job Schedule','Daily duties by department & weekly roster');
  const staff=DB.staff.filter(x=>x.active&&(isSuper()||x.store===State.branch));
  const pickFor=(d)=>{ let m=staff.filter(s=>String(s.role||'').toLowerCase().includes(d.kw)); if(!m.length) m=staff.filter(s=>/manager|supervisor/i.test(s.role||'')); if(!m.length) m=staff.slice(0,2); return m.slice(0,3); };
  const depts=Object.keys(JOB_DUTIES);
  const dutyRows=depts.map(dept=>{ const d=JOB_DUTIES[dept]; const team=pickFor(d); const names=team.length?team.map(s=>esc(s.name)).join(', '):'—';
    return `<tr><td><span class="jd-dept" style="--c:${d.color}"><i class="fas ${d.icon}"></i> ${esc(dept)}</span></td><td>${names}</td><td><ul class="jd-tasks">${d.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></td></tr>`;}).join('');
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const shifts=[['Open','06:00–14:00'],['Mid','09:00–17:00'],['Close','13:00–21:00']];
  let rnames=staff.map(s=>s.name); if(!rnames.length) rnames=['Anna B.','Sarah N.','Kim H.','David T.','Mai L.','Tuan N.','James P.','Lucy T.'];
  const cellName=(d,i)=>rnames[(d+i)%rnames.length];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗓️</div><div><h2>Job Schedule</h2><p>Concrete daily duties per department${isSuper()?' (all stores)':' · '+esc(State.branch)} and this week's roster.</p></div>
    <div class="ph-actions">${exportBtns('sched-duty-table','Job Schedule — Daily Duties')}</div></div>
    <div class="section-title">Daily duties by department</div>
    <div class="card"><div class="table-wrap"><table class="grid jobduty" id="sched-duty-table"><thead><tr><th>Department</th><th>Team on shift</th><th>Key daily duties</th></tr></thead><tbody>${dutyRows}</tbody></table></div></div>
    <div class="section-title">This week's roster</div>
    <div class="card"><div class="table-wrap"><table class="grid sched"><thead><tr><th>Shift</th>${days.map(d=>`<th class="ctr">${d}</th>`).join('')}</tr></thead><tbody>
    ${shifts.map((sh,si)=>`<tr><td><b>${sh[0]}</b><div class="cell-sub">${sh[1]}</div></td>${days.map((d,di)=>`<td class="ctr"><span class="shift-pill s${si}">${esc(cellName(di,si))}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="section-title">Coverage by department</div><div class="card"><div class="card-pad"><div class="chart-box"><canvas id="sched-chart"></canvas></div></div></div>`;
  mkChart('sched-chart',{type:'bar',data:{labels:depts,datasets:[{label:'Shifts',data:depts.map((_,i)=>5+((i*3+4)%9)),backgroundColor:depts.map(d=>JOB_DUTIES[d].color),borderRadius:8,maxBarThickness:38}]},options:baseOpts({legend:false})});
}

/* ============================================================ EXPORT (PDF / Excel) — branded, reusable */
function exportBtns(tableId,title){ return `<button class="btn sm exp-x" onclick="exportTableExcel('${tableId}','${ckJS(title||'')}')"><i class="fas fa-file-excel"></i>&nbsp; Excel</button><button class="btn sm exp-p" onclick="exportTablePDF('${tableId}','${ckJS(title||'')}')"><i class="fas fa-file-pdf"></i>&nbsp; PDF</button>`; }
function expFileName(title,ext){ return 'MCQ_'+String(title||'report').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')+'_'+new Date().toISOString().slice(0,10)+'.'+ext; }
function expDownload(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},600); }
function expScope(){ return isSuper()?'All stores':State.branch; }
function exportTableExcel(tableId,title){
  const tbl=document.getElementById(tableId); if(!tbl){ toast('Nothing to export'); return; }
  const when=new Date().toLocaleString(), cols=tbl.querySelectorAll('thead th').length||12;
  const style='<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif}th{background:#0e9f6e;color:#fff;border:1px solid #cbd5e1;padding:7px 10px;text-align:left;font-size:12px}td{border:1px solid #e2e8f0;padding:6px 10px;font-size:12px}</style>';
  const head=`<tr><td colspan="${cols}" style="font-size:17px;font-weight:bold;color:#0e9f6e;padding:8px 10px">MCQ Supermarket — ${esc(title)}</td></tr><tr><td colspan="${cols}" style="color:#64748b;padding:0 10px 10px">${esc(expScope())} · Generated ${esc(when)}</td></tr>`;
  const html='<html><head><meta charset="utf-8">'+style+'</head><body><table>'+head+tbl.innerHTML+'</table></body></html>';
  expDownload(new Blob(['﻿'+html],{type:'application/vnd.ms-excel'}), expFileName(title,'xls'));
  toast('⬇️ Excel exported');
}
function exportTablePDF(tableId,title){
  const tbl=document.getElementById(tableId); if(!tbl){ toast('Nothing to export'); return; }
  const when=new Date().toLocaleString(), role=isSuper()?'Super Admin':isAdmin()?'Admin':'Staff';
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to export PDF'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:26px}
    .rpt-head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0e9f6e;padding-bottom:14px}
    .rpt-logo{width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,#0e9f6e,#0891b2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;letter-spacing:.5px}
    .rpt-title{font-size:21px;font-weight:800}.rpt-sub{color:#6b7280;font-size:12px;margin-top:3px}
    .rpt-meta{margin:14px 0 16px;color:#374151;font-size:12px}
    table{border-collapse:collapse;width:100%;font-size:11px}thead{display:table-header-group}
    th{background:#0e9f6e;color:#fff;text-align:left;padding:8px 9px;font-weight:700}
    td{border-bottom:1px solid #e5e7eb;padding:6px 9px;vertical-align:top}
    tr:nth-child(even) td{background:#f8fafc}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#eef2f7;color:#475569}
    .rpt-foot{margin-top:20px;color:#9ca3af;font-size:10px;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
    @page{margin:13mm}</style></head><body>
    <div class="rpt-head"><div class="rpt-logo">MCQ</div><div><div class="rpt-title">${esc(title)}</div><div class="rpt-sub">MCQ Supermarket · ${esc(expScope())}</div></div></div>
    <div class="rpt-meta">Generated ${esc(when)} · ${esc(role)} view</div>
    <table>${tbl.innerHTML}</table>
    <div class="rpt-foot">MCQ Supermarket — Operations report · Confidential</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
  w.document.close();
}

/* ============================================================ CLEANING & MAINTENANCE SCHEDULES */
function schedFreqDays(f){ return {'Daily':1,'2× per week':3,'Weekly':7,'Every 2 weeks':14,'Monthly':30,'Quarterly':91,'Every 6 months':182}[f]||30; }
function schedFreqColor(f){ return {'Daily':'#0e9f6e','2× per week':'#0891b2','Weekly':'#3b82f6','Every 2 weeks':'#8b5cf6','Monthly':'#f59e0b','Quarterly':'#ef4444','Every 6 months':'#b91c1c'}[f]||'#64748b'; }
function schedRows(kind){ const sc=DB.schedules[kind], today=new Date();
  return sc.tasks.map(t=>{ const last=t.last?new Date(t.last):null;
    const due=last?new Date(last.getTime()+schedFreqDays(t.freq)*864e5):today;
    const diff=Math.round((due-today)/864e5);
    const tone=diff<0?'bad':diff<=2?'warn':'ok', status=diff<0?`Overdue ${-diff}d`:diff<=2?'Due soon':'On track';
    return {...t, due:due.toISOString().slice(0,10), tone, status};
  });
}
function schedTab(t){ State.sched=State.sched||{}; State.sched.tab=t; renderSchedules(); }
function renderSchedules(){
  if(!State.sched) State.sched={tab:'cleaning'};
  const kind=State.sched.tab, sc=DB.schedules[kind], rows=schedRows(kind);
  setAccent(sc.accent); setCrumb(sc.icon,'Cleaning & Maintenance',sc.label);
  const overdue=rows.filter(r=>r.tone==='bad').length, soon=rows.filter(r=>r.tone==='warn').length;
  const seg=`<div class="seg seg-light"><button class="seg-btn ${kind==='cleaning'?'active':''}" onclick="schedTab('cleaning')">🧽 Cleaning</button><button class="seg-btn ${kind==='maintenance'?'active':''}" onclick="schedTab('maintenance')">🔧 Maintenance</button></div>`;
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:${sc.accent}1f">${sc.icon}</div><div><h2>${esc(sc.label)}</h2><p>${esc(sc.desc)}</p></div>
      <div class="ph-actions">${seg} ${exportBtns('sched-table',sc.label)}</div></div>
    <div class="kpi-grid">
      <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🗂️</div></div><div class="k-val">${rows.length}</div><div class="k-lbl">Scheduled jobs</div></div>
      <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">⏰</div></div><div class="k-val">${overdue}</div><div class="k-lbl">Overdue</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🔔</div></div><div class="k-val">${soon}</div><div class="k-lbl">Due soon</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${rows.length-overdue-soon}</div><div class="k-lbl">On track</div></div>
    </div>
    <div class="card"><div class="card-head"><h3>${esc(sc.label)}</h3><span class="ch-sub">${esc(expScope())} · sorted by next due</span></div>
      <div class="table-wrap"><table class="grid" id="sched-table"><thead><tr><th>Task</th><th>Area</th><th>Frequency</th><th>Responsible</th><th>Last done</th><th>Next due</th><th>Status</th></tr></thead><tbody>
      ${rows.slice().sort((a,b)=>a.due.localeCompare(b.due)).map(r=>{const c=schedFreqColor(r.freq);
        return `<tr><td><div class="wrap"><b>${esc(r.task)}</b></div></td><td>${esc(r.area)}</td><td><span class="freq-pill" style="background:${c}1a;color:${c};border-color:${c}55">${esc(r.freq)}</span></td><td>${esc(r.who)}</td><td>${esc(r.last||'—')}</td><td>${esc(r.due)}</td><td><span class="badge ${r.tone}">${esc(r.status)}</span></td></tr>`;}).join('')}
      </tbody></table></div></div>`;
}

/* ============================================================ MANAGER PANEL */
function mgrSubs(){
  if(State._subs) return State._subs;
  const depts=(DB.checklist&&DB.checklist.depts)||['MANAGER','CASHIER','FV','GROCERY','FROZEN & DAIRY','BUTCHER'];
  const stores=DB.stores, names=DB.staff.map(s=>s.name);
  const today=new Date(), fmt=d=>d.toISOString().slice(0,10), dn=d=>d.toLocaleDateString(undefined,{weekday:'long'});
  const out=[];
  [0,1,2,3,4,5,6].forEach(off=>{ const d=new Date(today); d.setDate(d.getDate()-off); const ds=fmt(d), dname=dn(d);
    stores.forEach((store,si)=>depts.forEach((dept,di)=>['Opening','Closing'].forEach((session,sei)=>{
      const total=8+((di*3+sei*2)%14), done=Math.max(0,total-((si+di+off+sei)%3));
      const status = ((si+di*2+sei+off)%4===0) ? 'Submitted' : 'Verified';
      out.push({id:`CHK-${ds.replace(/-/g,'')}-${si}${di}${sei}`,date:ds,dayName:dname,store,department:dept,session,by:names[(si+di+sei)%names.length]||'Staff',total,done,progress:Math.round(done/total*100),status});
    })));
  });
  State._subs=out; return out;
}
function mgrActivity(){
  const mods=['issue','maintenance','incident','complaint','violation','reward']; let items=[];
  mods.forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if(isSuper()||r.store===State.branch) items.push({accent:m.accent,icon:m.icon,sortKey:r.created||r.date||'',title:`${m.short}: ${r.id}`,sub:`${r.store||''} · ${(r.title||r.summary||r.shortDescription||r.category||r.staffName||r.equipment||'').slice(0,60)}`,time:relTime(r.created||r.date)}); });});
  return items.sort((a,b)=>String(b.sortKey).localeCompare(String(a.sortKey))).slice(0,12);
}
function mgrVerify(id){ const s=mgrSubs().find(x=>x.id===id); if(s) s.status='Verified'; closeDrawer&&closeDrawer(); toast('✓ Checklist verified'); renderManager(); }
function mgrDate(v){ if(!State.mgr) State.mgr={}; State.mgr.date=v; renderManager(); }
/* derive the actual checklist (items, done state, notes, evidence photos) for a submission */
function mgrSubTasks(s){
  const items=((DB.checklist&&DB.checklist.items)||[]).map(ckItem).filter(r=>r.dept===s.department && ckInSession(r,s.session));
  const doneN=Math.max(0,Math.min(items.length, Math.round(items.length*((s.progress||0)/100))));
  const col=(((DB.checklist&&DB.checklist.deptMeta)||{})[s.department]||{}).color||'#0f766e';
  return items.map((r,idx)=>{
    const done=idx<doneN, photoReq=!!r.photo;
    const photos=(done&&photoReq)?[mgrPhotoStub(r.area,col)]:[];
    let temp=null; if(r.meta&&r.meta.temp){ temp={ok:done, label: done?(idx%4===0?'4.2°C':'2.8°C'):'pending'}; }
    const note=(!done&&idx%3===0)?'Not completed — needs follow-up':'';
    return {task:r.task, area:r.area, done, photoReq, photos, temp, note};
  });
}
function mgrPhotoStub(label,color){
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='${color}aa'/></linearGradient></defs><rect width='100%' height='100%' rx='10' fill='url(#g)'/><text x='50%' y='45%' fill='#fff' font-size='30' text-anchor='middle' font-family='sans-serif'>&#128247;</text><text x='50%' y='72%' fill='#ffffffdd' font-size='12' text-anchor='middle' font-family='sans-serif'>${String(label).slice(0,24)}</text></svg>`;
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
}
function mgrReview(id){
  const s=mgrSubs().find(x=>x.id===id); if(!s) return;
  const tasks=mgrSubTasks(s);
  const meta=(((DB.checklist&&DB.checklist.deptMeta)||{})[s.department])||{color:'#0f766e'};
  const doneN=tasks.filter(t=>t.done).length, outN=tasks.length-doneN, photoN=tasks.reduce((n,t)=>n+t.photos.length,0);
  const rows=tasks.map(t=>`<div class="mr-task ${t.done?'done':'todo'}">
      <div class="mr-tk"><span class="mr-check">${t.done?'✓':'○'}</span><div class="mr-name">${esc(t.task)}<small>${esc(t.area)}</small></div>${t.temp?`<span class="badge ${t.temp.ok?'ok':'warn'}">${esc(t.temp.label)}</span>`:''}</div>
      ${t.note?`<div class="mr-note">📝 ${esc(t.note)}</div>`:''}
      ${t.photos.length?`<div class="mr-photos">${t.photos.map(p=>`<a href="${imgSrc(p)}" target="_blank" rel="noopener"><img src="${imgSrc(p)}"></a>`).join('')}</div>`:(t.photoReq&&!t.done?`<div class="mr-nophoto">📷 Photo required — not attached</div>`:'')}
    </div>`).join('');
  $('#drawer').innerHTML=`<div class="drawer-head"><div class="dh-ic" style="background:${meta.color}1f;color:${meta.color}">✅</div>
    <div><div style="font-weight:840;font-size:16px">${esc(s.department)} · ${esc(s.session)}</div>
    <div style="color:var(--muted);font-size:12.5px">${esc(s.store)} · ${esc(s.date)} (${esc(s.dayName)}) · by ${esc(s.by)}</div>
    <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap"><span class="badge ok">${doneN} done</span>${outN?`<span class="badge warn">${outN} outstanding</span>`:''}<span class="badge info">📷 ${photoN}</span><span class="badge ${s.status==='Verified'?'ok':'warn'}">${esc(s.status)}</span></div></div>
    <button class="x-btn" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-body">
      <div class="mr-prog"><span class="pbar" style="flex:1"><i style="width:${s.progress}%;background:${meta.color}"></i></span><b>${s.progress}%</b></div>
      <div class="mr-list">${rows||'<div class="empty">No tasks for this session.</div>'}</div>
      ${s.status==='Verified'
        ? `<div class="rail-tip" style="margin-top:16px">✅ This checklist is already verified.</div>`
        : `<button class="btn primary block lg" style="margin-top:16px" onclick="mgrVerify('${s.id}')"><i class="fas fa-check-double"></i>&nbsp; Verify this checklist</button>
           ${outN?`<div class="fhint" style="text-align:center;margin-top:8px">⚠️ ${outN} task(s) still outstanding</div>`:''}`}
    </div>`;
  $('#drawer').classList.add('open'); $('#drawer-mask').classList.add('open');
}
function renderManager(){
  setAccent('#0f766e'); setCrumb('🛡️','Manager Panel','Verify checklists & action today’s issues');
  const todayStr=new Date().toISOString().slice(0,10);
  if(!State.mgr) State.mgr={sort:'newest',date:todayStr};
  if(!State.mgr.date) State.mgr.date=todayStr;
  const subs=mgrSubs().filter(s=>isSuper()||s.store===State.branch);
  const allPending=subs.filter(s=>s.status==='Submitted');
  const pending=allPending.filter(s=>s.date===State.mgr.date).sort((a,b)=>State.mgr.sort==='newest'?b.id.localeCompare(a.id):a.id.localeCompare(b.id));
  const doneStat=['Closed','Cancelled','Resolved','Store Confirmed','Completed'];
  let issues=[]; ['maintenance','incident','complaint','violation','issue'].forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{ if((isSuper()||r.store===State.branch)&&!doneStat.includes(r.status)) issues.push({mod:id,icon:m.icon,short:m.short,...r}); });});
  issues.sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||'')));
  const verifiedToday=subs.filter(s=>s.date===todayStr&&s.status==='Verified').length;
  const critical=issues.filter(r=>['Critical','Major'].includes(r.severity)||['Critical','Urgent'].includes(r.priority)||r.step==='Final Warning').length;
  const stats=[['🕒',allPending.length,'Awaiting verification','warn'],['✅',verifiedToday,'Verified today','ok'],['🚩',issues.length,'Open issues','info'],['🔴',critical,'Critical / urgent','bad']];
  const dm=(DB.checklist&&DB.checklist.deptMeta)||{}; const capN=18, shown=pending.slice(0,capN);
  const cards=shown.map(s=>{const meta=dm[s.department]||{color:'#0f766e'}, isToday=s.date===todayStr;
    return `<div class="pv-card" style="--c:${meta.color}"><span class="pv-stripe"></span>
      <div class="pv-head"><b>${esc(s.department)}</b><span class="badge ${s.session==='Opening'?'warn':'info'}">${s.session}</span>${isToday?'<span class="badge ok">Today</span>':''}</div>
      <div class="pv-meta"><span>📅 ${esc(s.date)} — ${esc(s.dayName)}</span>${isSuper()?`<span>🏪 ${esc(s.store)}</span>`:''}<span>👤 ${esc(s.by)}</span></div>
      <div class="pv-prog"><span class="pbar" style="flex:1"><i style="width:${s.progress}%"></i></span><b>${s.done}/${s.total}</b></div>
      <button class="btn primary block sm" onclick="mgrReview('${s.id}')"><i class="fas fa-eye"></i>&nbsp; Review &amp; Verify</button></div>`;}).join('');
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">🛡️</div><div><h2>Manager Panel</h2><p>Verify today’s checklists and action open issues across ${isSuper()?'all stores':esc(State.branch)}.</p></div>
      <div class="ph-actions"><input type="date" class="mgr-date" value="${esc(State.mgr.date)}" max="${todayStr}" onchange="mgrDate(this.value)"><button class="btn sm" onclick="mgrSort()"><i class="fas fa-arrow-down-wide-short"></i>&nbsp; ${State.mgr.sort==='newest'?'Newest first':'Oldest first'}</button></div></div>
    <div class="kpi-grid">${stats.map(s=>`<div class="kpi tone-${s[3]}"><div class="k-top"><div class="k-ic">${s[0]}</div></div><div class="k-val">${s[1]}</div><div class="k-lbl">${esc(s[2])}</div></div>`).join('')}</div>
    <div class="section-title"><i class="fas fa-clock" style="color:#f59e0b"></i> Pending Verification · ${esc(State.mgr.date)}${State.mgr.date===todayStr?' (Today)':''} · ${pending.length}${pending.length>capN?` (showing ${capN})`:''}</div>
    <div class="pv-grid">${cards||`<div class="empty">🎉 Nothing pending for ${esc(State.mgr.date)}.${allPending.length?` <b>${allPending.length}</b> still pending on other dates — change the date above.`:''}</div>`}</div>
    <div class="section-title"><i class="fas fa-triangle-exclamation" style="color:#ef4444"></i> Open issues today · ${issues.length}</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Register</th><th>Store</th><th>Summary</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
      ${issues.length?issues.slice(0,20).map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td>${esc(r.store||'')}</td><td><div class="wrap">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.staffName||r.category||'')}</div></td><td>${(r.priority||r.severity||r.step)?badge(r.priority||r.severity||r.step):''}</td><td>${badge(r.status)}</td><td><button class="btn sm primary" onclick='event.stopPropagation();openDetail("${r.mod}","${esc(r.id)}")'>Review</button></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No open issues 🎉</div></td></tr>'}
    </tbody></table></div></div>
    <div class="section-title">📋 Activity Log — ${todayStr}</div>
    <div class="card"><div class="feed">${mgrActivity().map(f=>`<div class="feed-row"><div class="feed-ic" style="background:${soft(f.accent)};color:${f.accent}">${f.icon}</div><div class="feed-main"><div class="fm-t">${esc(f.title)}</div><div class="fm-s">${esc(f.sub)}</div></div><div class="feed-time">${esc(f.time)}</div></div>`).join('')||'<div class="empty">No recent activity.</div>'}</div></div>`;
}
function mgrSort(){ State.mgr.sort=State.mgr.sort==='newest'?'oldest':'newest'; renderManager(); }

/* ============================================================ ANALYTICS */
function renderAnalytics(){
  setAccent('#6a1b9a'); setCrumb('📈','Analytics','Cross-store, cross-module insights');
  const totals=DB.order.map(id=>({m:DB.modules[id],n:DB.modules[id].records.length}));
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">📈</div><div><h2>Analytics</h2><p>Volume, severity and store comparison across all operations.</p></div></div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>Records by module</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an1"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Open vs closed</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an2"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Activity by store</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an3"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Severity mix</h3></div><div class="card-pad"><div class="chart-box"><canvas id="an4"></canvas></div></div></div>
    </div>`;
  mkChart('an1',{type:'bar',data:{labels:totals.map(t=>t.m.short),datasets:[{data:totals.map(t=>t.n),backgroundColor:totals.map(t=>t.m.accent),borderRadius:8,maxBarThickness:40}]},options:baseOpts({legend:false})});
  const closed=['Closed','Cancelled','Store Confirmed','Resolved'];
  let open=0,cl=0; DB.order.forEach(id=>DB.modules[id].records.forEach(r=>closed.includes(r.status)?cl++:open++));
  mkChart('an2',{type:'doughnut',data:{labels:['Open','Closed'],datasets:[{data:[open,cl],backgroundColor:['#3b82f6','#10b981'],borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
  const byStore={}; DB.order.forEach(id=>DB.modules[id].records.forEach(r=>{if(r.store)byStore[r.store]=(byStore[r.store]||0)+1;}));
  const sl=Object.entries(byStore).sort((a,b)=>b[1]-a[1]);
  mkChart('an3',{type:'bar',data:{labels:sl.map(x=>x[0]),datasets:[{data:sl.map(x=>x[1]),backgroundColor:'#0e9f6e',borderRadius:8,maxBarThickness:30}]},options:baseOpts({indexAxis:'y',legend:false})});
  const sev={}; DB.order.forEach(id=>DB.modules[id].records.forEach(r=>{const v=r.severity;if(v)sev[v]=(sev[v]||0)+1;}));
  const se=Object.entries(sev);
  mkChart('an4',{type:'doughnut',data:{labels:se.map(x=>x[0]),datasets:[{data:se.map(x=>x[1]),backgroundColor:se.map(x=>toneHex(x[0])),borderColor:'#fff',borderWidth:3}]},options:baseOpts({legend:true,donut:true})});
}

/* ============================================================ PHOTO GALLERY */
function renderPhotos(){
  setAccent('#0891b2'); setCrumb('🖼️','Photo Gallery','Evidence photos from checklists & reports');
  const cats=['Bin area','Fridge temp','Cutting area','Coldroom','Cabinets','Aisles','Crates','Cleaning'];
  const tiles=Array.from({length:12}).map((_,i)=>{ const c=cats[i%cats.length],col=PALETTE[i%PALETTE.length];
    return `<div class="photo-tile" style="background:linear-gradient(135deg,${col},${col}99)" onclick="toast('Photo preview (demo)')"><span class="pt-ic">📷</span><div class="pt-cap">${esc(c)}<small>${esc(DB.stores[i%5])} · ${i+1}d ago</small></div></div>`;}).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🖼️</div><div><h2>Photo Gallery</h2><p>Browse photo evidence captured against checklist tasks and issue reports.</p></div>
    <div class="ph-actions"><select class="login-input" style="width:auto"><option>All stores</option>${DB.stores.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div></div>
    <div class="photo-grid">${tiles}</div>`;
}

/* ============================================================ WHATSAPP DAILY SHARE */
function renderWhatsapp(){
  setAccent('#128C7E'); setCrumb('💬','Daily Share',`${isAdmin()?'All stores':State.branch} · WhatsApp report`);
  if(!State.wa) State.wa={period:'Opening'};
  const period=State.wa.period, C=DB.checklist;
  const byDept={};
  C.items.forEach((it,i)=>{ const when=it[3], inP=period==='Opening'?(when==='O'||when==='A'):(when==='C'||when==='A'); if(!inP) return;
    const dept=it[0], ps=photoSpec(it[4]), st=(State.chk&&State.chk.state[i])||{};
    const d=byDept[dept]=byDept[dept]||{total:0,done:0,photos:[],reqMissing:0,meta:C.deptMeta[dept]||{}};
    d.total++; if(st.done)d.done++; (st.photos||[]).forEach(u=>d.photos.push(u)); if(ps&&ps.req&&!(st.photos||[]).length)d.reqMissing++; });
  const snap=[
    ['💬','Complaints',DB.modules.complaint.records.filter(r=>r.status==='Open').length,'open','#ec4899'],
    ['🛠️','Maintenance',DB.modules.maintenance.records.filter(r=>!['Closed','Cancelled','Store Confirmed'].includes(r.status)).length,'open','#f59e0b'],
    ['⚠️','Incidents',DB.modules.incident.records.filter(r=>!['Closed','Cancelled'].includes(r.status)).length,'open','#ef4444'],
    ['🚚','Deliveries',DB.modules.delivery.records.length,'trips','#3b82f6'] ];
  let allPhotos=[]; Object.values(byDept).forEach(d=>allPhotos=allPhotos.concat(d.photos));
  const date=new Date().toLocaleDateString();
  const deptCards=Object.entries(byDept).map(([dept,d])=>{
    const pct=d.total?Math.round(d.done/d.total*100):0;
    const realThumbs=d.photos.map(u=>`<img src="${imgSrc(u)}">`).join('');
    const ph=d.photos.length?'':Array.from({length:Math.max(2,Math.min(5,d.reqMissing))}).map(()=>`<span class="wa-ph" style="background:${d.meta.color||'#888'}"><i class="fas ${d.meta.icon||'fa-camera'}"></i></span>`).join('');
    return `<div class="wa-card"><span class="wa-stripe" style="background:${d.meta.color||'#888'}"></span>
      <div class="wa-body"><div class="wa-pills">
        <span class="wa-pill" style="background:${d.meta.color||'#888'}">${esc(dept)}</span>
        <span class="wa-pill" style="background:${pct>=90?'#43A047':'#FB8C00'}">${d.done}/${d.total} · ${pct}%</span>
        <span class="wa-pill" style="background:#1A1A2E">📷 ${d.photos.length||d.reqMissing} photos</span></div>
        <div class="wa-thumbs">${realThumbs}${ph}</div></div></div>`;
  }).join('');
  const msg=`*MCQ ${State.branch} — ${period} Report (${date})*\n`+Object.entries(byDept).map(([dept,d])=>`• ${dept}: ${d.done}/${d.total} done`).join('\n')+
    `\n\n💬 Complaints open: ${snap[0][2]}\n🛠️ Maintenance open: ${snap[1][2]}\n⚠️ Incidents open: ${snap[2][2]}\n🚚 Deliveries: ${snap[3][2]}\n📷 Photos attached: ${allPhotos.length}\n\n_Sent from MCQ Supermarket_`;
  $('#content').innerHTML=`
    <div class="wa-hero">
      <div class="wa-date">📅 ${date} · ${period} report</div>
      <h2><i class="fab fa-whatsapp"></i>&nbsp; ${period} Report — ready to share</h2>
      <p>Auto-built from today’s checklist, photo evidence and open items. Tap Share to send it straight to your team WhatsApp group.</p>
      <div class="wa-toggle"><button class="${period==='Opening'?'active':''}" onclick="waPeriod('Opening')">☀️ Opening</button><button class="${period==='Closing'?'active':''}" onclick="waPeriod('Closing')">🌙 Closing</button></div>
      <div class="wa-actions"><button class="wa-share" onclick="waShare()"><i class="fab fa-whatsapp"></i>&nbsp; Share to WhatsApp</button>
        <button class="wa-dl" onclick="waCopy()"><i class="fas fa-copy"></i>&nbsp; Copy summary</button></div>
    </div>
    <div class="section-title">What's in the ${period} report</div>
    <div class="wa-cards">${deptCards||'<div class="empty">No checklist tasks for this period.</div>'}</div>
    <div class="section-title">Operations snapshot</div>
    <div class="kpi-grid">${snap.map(s=>`<div class="kpi"><div class="k-top"><div class="k-ic" style="background:${s[4]}1f;color:${s[4]}">${s[0]}</div></div><div class="k-val" style="color:${s[4]}">${s[2]}</div><div class="k-lbl">${s[1]} ${s[3]}</div></div>`).join('')}</div>
    ${allPhotos.length?`<div class="section-title">Photo evidence · ${allPhotos.length}</div><div class="wa-gallery">${allPhotos.map(u=>`<img src="${imgSrc(u)}">`).join('')}</div>`:''}
    <div class="section-title">Message preview</div>
    <div class="card card-pad"><textarea id="wa-msg" style="min-height:170px;font-family:monospace">${esc(msg)}</textarea>
      <div class="fhint" style="margin-top:8px">💡 Photos are attached automatically. Scheduled auto-send daily at 10:30 AM (opening) and 9:30 PM (closing).</div></div>`;
}
function waPeriod(p){ State.wa.period=p; renderWhatsapp(); }
function waShare(){ const txt=$('#wa-msg')?$('#wa-msg').value:''; const t=encodeURIComponent(txt);
  if(navigator.share){ navigator.share({title:'MCQ Daily Report',text:txt}).catch(()=>window.open('https://wa.me/?text='+t,'_blank')); }
  else window.open('https://wa.me/?text='+t,'_blank'); }
function waCopy(){ navigator.clipboard?.writeText($('#wa-msg').value); toast('Summary copied'); }

/* ============================================================ EMAIL NOTIFICATIONS */
function renderEmail(){
  setAccent('#1565c0'); setCrumb('✉️','Email Notifications','Customise who gets which alerts');
  const recips=DB.emailRecipients||[], cats=DB.issueCategories||{}, groups=DB.issueGroups||[];
  const cards=recips.map(r=>{
    const myN=Object.keys(cats).filter(k=>(DB.issueEmailRoutes[k]||[]).includes(r.key)).length;
    const open=State.emailOpen===r.key;
    const dd=open?`<div class="email-dd">${groups.map(g=>{const inG=Object.entries(cats).filter(([k,c])=>c.group===g); return inG.length?`<div class="email-grp">${esc(g)}</div><div class="email-cats">`+inG.map(([k,c])=>{const on=(DB.issueEmailRoutes[k]||[]).includes(r.key);return `<label class="email-cat"><input type="checkbox" ${on?'checked':''} onchange="issEmailToggle('${k}','${r.key}',this.checked);emailRefreshCount('${r.key}')"><i class="fas ${c.icon}" style="color:${c.color}"></i> ${esc(c.label)}</label>`;}).join('')+`</div>`:'';}).join('')}</div>`:'';
    return `<div class="card email-card"><div class="email-row">
        <div class="avatar">${esc(r.name.slice(0,1))}</div>
        <div class="email-info"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></div>
        <span class="badge info" id="email-cnt-${r.key}">${myN} categories</span>
        <button class="btn sm" onclick="emailToggleDD('${r.key}')">Customise ${open?'▲':'▾'}</button>
      </div>${dd}</div>`;
  }).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic" style="background:#e8f1fe">✉️</div><div><h2>Email Notifications</h2><p>For each person, tick which Report-Issue categories they get emailed. Violation alerts always go to everyone.</p></div></div>
    <div class="rail-tip" style="margin-bottom:16px;background:var(--bad-bg);border-color:#f3c9c9">⚠️ <b>Violation alerts</b> are sent to <b>all recipients</b> by default — no per-category opt-out.</div>
    <div class="section-title">Report Issue · who receives which category</div>
    <div class="email-list">${cards||'<div class="empty">No recipients.</div>'}</div>`;
}
function emailToggleDD(k){ State.emailOpen=State.emailOpen===k?null:k; renderEmail(); }
function emailRefreshCount(k){ const cats=DB.issueCategories||{}; const n=Object.keys(cats).filter(c=>(DB.issueEmailRoutes[c]||[]).includes(k)).length; const el=document.getElementById('email-cnt-'+k); if(el) el.textContent=n+' categories'; }

/* ============================================================ DATA MANAGEMENT */
function renderData(){
  setAccent('#b45309'); setCrumb('🗄️','Data Management','Export, back up & maintain records');
  const counts=Object.values(DB.modules).map(m=>({l:m.label,n:(m.records||[]).length,i:m.icon}));
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗄️</div><div><h2>Data Management</h2><p>Export data, run backups and clean up old records.</p></div></div>
    <div class="card"><div class="card-head"><h3>Record counts</h3></div><div class="table-wrap"><table class="grid"><thead><tr><th>Module</th><th>Records</th><th>Export</th></tr></thead><tbody>
      ${counts.map(c=>`<tr><td>${c.i} <b>${esc(c.l)}</b></td><td class="num">${c.n}</td><td><button class="btn sm" onclick="toast('Exported ${esc(c.l)} (demo CSV)')">⬇ CSV</button></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="split-2" style="margin-top:16px"><div class="card card-pad"><h4>Backup</h4><p style="color:var(--muted);font-size:12.5px">Last backup: today 02:00 · automatic nightly.</p><button class="btn primary" onclick="toast('Backup started (demo)')">⟳ Run backup now</button></div>
      <div class="card card-pad"><h4>Maintenance</h4><p style="color:var(--muted);font-size:12.5px">Archive records older than 12 months to keep the app fast.</p><button class="btn" onclick="toast('Archive scheduled (demo)')">🗃️ Archive old records</button></div></div>`;
}

/* ============================================================ RULES */
function renderRules(){
  setAccent('#b91c1c'); setCrumb('📖','Supermarket Rules','MCQ Supermarket — staff handbook');
  const items=DB.rules.map(r=>`<div class="rule-item"><div class="rule-n">${r.n}</div><div><div class="rule-t">${esc(r.title)}</div><div class="rule-b">${esc(r.body)}</div></div></div>`).join('');
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">📖</div><div><h2>Supermarket Rules</h2><p>The standards every MCQ team member follows.</p></div>
    <div class="ph-actions"><button class="btn sm" onclick="window.print()">🖨️ Print</button></div></div>
    <div class="card card-pad rules-wrap">${items}</div>`;
}

/* ============================================================ FACE ID */
function renderFaceId(){
  setAccent('#15803d'); setCrumb('🪪','Face ID','Passwordless sign-in for this device');
  const devices=[['iPhone 15 — Tony',true,'Today'],['MacBook Pro — Office',true,'2 days ago']];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🪪</div><div><h2>Face ID &amp; Passkeys</h2><p>Register this device so you can sign in with Face ID / Touch ID instead of a password.</p></div></div>
    <div class="form-shell"><div class="card card-pad" style="text-align:center">
        <div class="fid-hero">🪪</div><h3 style="margin:6px 0">Set up Face ID on this device</h3>
        <p style="color:var(--muted);font-size:13px;max-width:380px;margin:0 auto 16px">Uses your device’s secure biometric (WebAuthn). Your face never leaves the device — only a secure key is stored.</p>
        <button class="btn primary" onclick="faceIdLogin()">🪪 Register / Test Face ID</button>
        <p class="login-hint" style="margin-top:12px">For live camera &amp; real passkeys, open the app on <b>https</b> or <b>localhost</b>.</p>
      </div>
      <aside class="form-rail"><div class="card rail-card"><h4>Registered devices</h4>
        <table class="grid"><tbody>${devices.map(d=>`<tr><td><b>${esc(d[0])}</b><div class="cell-sub">Last used ${esc(d[2])}</div></td><td>${d[1]?'<span class="badge ok"><span class="bdot"></span>Active</span>':''}</td><td><button class="btn sm" onclick="toast('Removed (demo)')">Remove</button></td></tr>`).join('')}</tbody></table></div>
        <div class="card rail-card"><h4>Security</h4><ul><li>Auto-logout after 30 min idle</li><li>Hard limit 8 hours per session</li><li>Per-store password + admin password</li></ul></div></aside></div>`;
}
