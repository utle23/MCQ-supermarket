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
  if(!State.chk) State.chk={session:'Opening',dept:'ALL',area:'ALL',state:{}};
  if(!State.chk.area) State.chk.area='ALL';
  if(!State.chk.resp) State.chk.resp={};
  const s=State.chk;
  setCrumb('✅','Store Operation Checklist',`${isAdmin()?'All stores':State.branch} · ${s.session}`);
  const chips=['ALL',...C.depts].map(d=>`<button class="dept-chip ${d===s.dept?'active':''}" onclick="ckDept('${ckJS(d)}')">${d==='ALL'?'All':esc(d)}</button>`).join('');
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
   <div class="ck-toolbar"><div class="dept-chips">${chips}</div><div class="tb-spacer"></div>
     <button class="btn sm" onclick="ckAll(true)">✓ Check all</button><button class="btn sm" onclick="ckAll(false)">✕ Uncheck</button></div>
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
  if(s.dept==='ALL') return '';
  const areas=[...new Set(ckRows(true).map(r=>r.area))];
  if(areas.length<=1) return '';
  if(s.area!=='ALL' && !areas.includes(s.area)) s.area='ALL';
  const chips=['ALL',...areas].map(a=>`<button class="area-chip ${a===s.area?'active':''}" onclick="ckArea('${ckJS(a)}')">${a==='ALL'?'All '+esc(s.dept):esc(a)}</button>`).join('');
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
      html+=`<div class="ck-area-h">${esc(area)}</div>`;
      items.forEach(r=>{ const st=State.chk.state[r.i]||{}; const done=st.done;
        let photoHtml='';
        if(r.photo){
          if(r.meta.temp && st.defrosting){
            photoHtml=`<div class="ck-photos locked"><div class="ck-photos-h"><span class="ev-chip ev-opt">Defrosting</span><span class="ck-lock">Photo capture locked while defrosting</span></div></div>`;
          }else{
            const need=r.photo.req?r.photo.min:1, have=(st.photos||[]).length;
            let slots=(st.photos||[]).map(u=>`<span class="ck-slot filled"><img class="ck-slot-img" src="${u}"><span class="ck-rm" onclick="ckRmPhoto(event,${r.i},'${u}')">✕</span></span>`).join('');
            if(!r.photo.max||have<r.photo.max) slots+=`<label class="ck-slot"><input type="file" accept="image/*" capture="environment" onchange="ckPhoto(this,${r.i})"><span class="ck-slot-empty">📷<small>${r.meta.temp?'AI read':'Photo'}</small></span></label>`;
            photoHtml=`<div class="ck-photos" id="ck-photo-${r.i}"><div class="ck-photos-h">${photoChip(r.photo)} <span class="ck-pc ${have>=need?'ok':''}">${have}/${need}</span></div><div class="ck-slots">${slots}</div></div>`;
          }
        }
        html+=`<div class="ck-task ${done?'done':''}" id="ck-row-${r.i}">
          <button class="ck-check" onclick="ckTick(${r.i})">${done?'✓':''}</button>
          <div class="ck-main"><div class="ck-name">${esc(r.task)}</div>
            ${r.meta.temp?ckTempBox(r,st):''}
            <input class="ck-note" placeholder="Add note…" value="${esc(st.note||'')}" oninput="ckNote(${r.i},this.value)">${photoHtml}</div></div>`;
      });
    });
    html+=`</div>`;
  });
  $('#chk-body').innerHTML=html||'<div class="empty">No tasks for this filter.</div>';
  const report=$('#ck-temp-report'); if(report) report.innerHTML=ckTempReportHTML();
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
  const el=$('#chk-prog'); if(el) el.innerHTML=`<span class="count-chip">✅ ${done}/${total} done</span><span class="count-chip">📷 ${pdone}/${preq} photo tasks</span>
    <span class="count-chip temp-ok">🌡️ ${tok} in range</span><span class="count-chip temp-bad">⚠️ ${tbad} out</span><span class="count-chip temp-scan">AI ${tscan} scanning</span>
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
function ckPhoto(input,i){
  const f=input.files&&input.files[0]; if(!f)return;
  const r=ckItem(DB.checklist.items[i],i), st=State.chk.state[i]=State.chk.state[i]||{};
  if(r.meta.temp&&st.defrosting){ input.value=''; toast('Defrosting is ticked, so photo capture is locked'); return; }
  const url=URL.createObjectURL(f); st.photos=st.photos||[]; st.photos.push(url);
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

/* ============================================================ REPORT ISSUE (copied from restaurant) */
function renderIssue(){
  setAccent('#e53935'); setCrumb('🚩','Report an Issue','Report anything that needs management attention');
  if(!State.iss) State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  if(State.iss.tab==='analytics') return renderIssueAnalytics();
  if(State.iss.tab==='email' && isAdmin()) return renderIssueEmail();
  const cats=DB.issueCategories;
  const card=(k,c)=>`<button type="button" class="cat-card ${State.iss.cat===k?'selected':''}" data-k="${k}" style="--cc:${c.color}" onclick="issCat('${k}')"><i class="fas ${c.icon} cat-ic" style="color:${c.color}"></i><span class="cat-label">${esc(c.label)}</span></button>`;
  const cards=DB.issueGroups.map(g=>{const inG=Object.entries(cats).filter(([k,c])=>c.group===g); return inG.length?`<div class="cat-group-h">${esc(g)}</div><div class="cat-grid">${inG.map(([k,c])=>card(k,c)).join('')}</div>`:'';}).join('');
  const staff=['— Select your name —',...DB.staff.filter(x=>isAdmin()||x.store===State.branch).map(x=>x.name)];
  const prio=[['Low','mute'],['Normal','info'],['High','warn'],['Urgent','bad']];
  const regMods=['issue','maintenance','incident','complaint'];
  let recent=[]; regMods.forEach(id=>DB.modules[id].records.forEach(r=>recent.push({mod:id,icon:DB.modules[id].icon,short:DB.modules[id].short,...r})));
  if(!isAdmin()) recent=recent.filter(r=>r.store===State.branch);
  recent.sort((a,b)=>String(b.created||b.date||'').localeCompare(String(a.created||a.date||''))); recent=recent.slice(0,12);
  $('#content').innerHTML=`
   <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue</h2><p>Report any operational issue, request or suggestion — reviewed by management only.</p></div>
     <div class="ph-actions">${issSeg('report')}</div></div>
   <div class="iss-cat-h">What would you like to report?</div>
   ${cards}
   <div class="iss-grid">
     <div class="card">
       <div class="card-head" id="iss-formhead"><h3><i class="fas fa-pen"></i>&nbsp; Issue details</h3></div>
       <div class="card-pad">
         <div class="grid2">
           <div class="field"><label>Your name <span class="req">*</span></label><select id="iss-name">${staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>
           <div class="field"><label>Store</label><select id="iss-store">${(isAdmin()?DB.stores:[State.branch]).map(s=>`<option ${s===State.branch?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
         </div>
         <div class="field" style="margin-top:14px"><label>Priority</label><div class="prio-pills" id="iss-prio">${prio.map((p,i)=>`<button type="button" class="prio-pill ${p[1]} ${p[0]===State.iss.prio?'on':''}" data-v="${p[0]}" onclick="issPrio(this)">${p[0]}</button>`).join('')}</div></div>
         <div class="field" style="margin-top:14px"><label>Brief title <span class="req">*</span></label><input id="iss-title" maxlength="120" placeholder="Short description of the issue…"></div>
         <div class="field" style="margin-top:14px"><label>Full description <span class="req">*</span></label><textarea id="iss-desc" placeholder="Describe the issue in detail. Include dates, names and any relevant info…"></textarea><div class="fhint">All reports are confidential and reviewed by management only.</div></div>
         <div class="field" style="margin-top:14px"><label>Photo <span class="req">* required</span></label>
           <label class="photo-box" id="iss-photobox"><input type="file" accept="image/*" capture="environment" onchange="issPhoto(this)" style="display:none">
             <div id="iss-ph-empty"><i class="fas fa-camera"></i><div class="pb-t">Tap to take / attach a photo — required to submit</div></div>
             <img id="iss-ph-img" style="display:none"></label>
           <div id="iss-ph-rm" style="display:none;margin-top:8px"><button class="btn sm" onclick="issClearPhoto(event)">✕ Remove photo</button></div>
         </div>
         <div id="iss-warn" class="rail-tip" style="display:none;margin-top:14px">⚠️ Please select a category above first.</div>
         <button class="btn block lg iss-submit" style="margin-top:16px" onclick="issSubmit()"><i class="fas fa-paper-plane"></i>&nbsp; Submit Report</button>
       </div>
     </div>
     <aside class="form-rail">
       <div class="card rail-card" style="background:var(--accent-soft)"><h4>🛡️ Your report is confidential</h4>
         <ul><li>Only management can view submitted reports</li><li>Reports are reviewed promptly</li><li>For urgent issues, speak to your manager directly</li><li>Missed clock-in/out: management will adjust your timesheet</li><li>Suggestions are always welcome</li></ul></div>
       <div class="card rail-card"><h4>Categories</h4><div class="cat-list">${Object.values(cats).map(c=>`<div class="cat-list-row"><i class="fas ${c.icon}" style="color:${c.color}"></i> ${esc(c.label)}</div>`).join('')}</div></div>
     </aside>
   </div>
   ${recent.length?`<div class="section-title">Recent reports${isAdmin()?'':' · '+esc(State.branch)}</div>
     <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Register</th><th>Title</th><th>Store</th><th>Priority</th><th>Status</th></tr></thead><tbody>
     ${recent.map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td><div class="wrap">${esc(r.title||r.equipment||r.summary||r.shortDescription||r.category||'')}</div></td><td>${esc(r.store||'')}</td><td>${(r.priority||r.severity)?badge(r.priority||r.severity):''}</td><td>${r.status?badge(r.status):''}</td></tr>`).join('')}
     </tbody></table></div></div>`:''}`;
}
function issCat(k){ State.iss.cat=k;
  $$('.cat-card').forEach(c=>c.classList.toggle('selected',c.getAttribute('data-k')===k));
  const c=DB.issueCategories[k],h=$('#iss-formhead');
  if(h){ h.style.background=c.color+'1f'; h.querySelector('h3').innerHTML=`<i class="fas ${c.icon}" style="color:${c.color}"></i>&nbsp; ${esc(c.label)}`; }
  const w=$('#iss-warn'); if(w) w.style.display='none';
}
function issPrio(btn){ $$('#iss-prio .prio-pill').forEach(p=>p.classList.remove('on')); btn.classList.add('on'); State.iss.prio=btn.dataset.v; }
function issPhoto(input){ const f=input.files&&input.files[0]; if(!f) return; const url=URL.createObjectURL(f); State.iss.photo=url;
  $('#iss-ph-img').src=url; $('#iss-ph-img').style.display='block'; $('#iss-ph-empty').style.display='none'; $('#iss-ph-rm').style.display='block'; }
function issClearPhoto(e){ e.preventDefault(); e.stopPropagation(); State.iss.photo=null; $('#iss-ph-img').style.display='none'; $('#iss-ph-empty').style.display='block'; $('#iss-ph-rm').style.display='none'; }
function issSubmit(){
  ['iss-name','iss-title','iss-desc'].forEach(id=>$('#'+id)&&$('#'+id).classList.remove('invalid'));
  $('#iss-photobox')&&$('#iss-photobox').classList.remove('invalid');
  if(!State.iss.cat){ const w=$('#iss-warn'); w.style.display='flex'; window.scrollTo({top:0,behavior:'smooth'}); return; }
  const nameEl=$('#iss-name'), titleEl=$('#iss-title'), descEl=$('#iss-desc'); let bad=null;
  if(nameEl.value.startsWith('—')){nameEl.classList.add('invalid');bad=bad||nameEl;}
  if(!titleEl.value.trim()){titleEl.classList.add('invalid');bad=bad||titleEl;}
  if(!descEl.value.trim()){descEl.classList.add('invalid');bad=bad||descEl;}
  if(!State.iss.photo){ const pb=$('#iss-photobox'); pb.classList.add('invalid','shake'); setTimeout(()=>pb.classList.remove('shake'),450); bad=bad||pb; }
  if(bad){ toast(!State.iss.photo?'📷 A photo is required before you can submit':'Please complete the required fields'); bad.scrollIntoView({behavior:'smooth',block:'center'}); return; }
  const name=nameEl.value, title=titleEl.value.trim(), desc=descEl.value.trim();
  const c=DB.issueCategories[State.iss.cat], store=$('#iss-store').value, prio=State.iss.prio||'Normal';
  const now=new Date().toISOString().slice(0,16).replace('T',' '), ymd=new Date().toISOString().slice(0,10).replace(/-/g,''), rnd=()=>Math.floor(1000+Math.random()*9000);
  const sev=DB.prioToSeverity[prio]; let mod=c.mod, ref, rec;
  if(mod==='maintenance'){ ref=`MTN-${ymd}-${rnd()}`; rec={id:ref,created:now,store,equipment:title,category:c.label,priority:sev,severity:sev,status:'New',issue:desc}; }
  else if(mod==='incident'){ ref=`INC-${ymd}-${rnd()}`; rec={id:ref,created:now,store,type:c.label,severity:sev,status:'New',summary:desc}; }
  else if(mod==='complaint'){ ref=`CCL-${ymd}-${rnd()}`; rec={id:ref,created:now,store,severity:DB.prioToComplaint[prio],category:c.label,shortDescription:desc,status:'Open',followup:'',age:0}; }
  else { mod='issue'; ref=`ISS-${ymd}-${rnd()}`; rec={id:ref,created:now,store,title,category:c.label,priority:prio,status:'Open',reportedBy:name,description:desc}; }
  DB.modules[mod].records.unshift(rec);
  const names=(DB.issueEmailRoutes[State.iss.cat]||[]).map(k=>(DB.emailRecipients.find(x=>x.key===k)||{}).name).filter(Boolean);
  State.iss={cat:'',photo:null,prio:'Normal',tab:'report'};
  toast(`✓ ${ref} → ${DB.modules[mod].short}${names.length?' · 📧 '+names.length+' emailed':''}`); buildSidebar(); renderIssue();
}

/* ---- Report Issue · Analytics (by category + branch comparison) ---- */
const ISS_GROUP_COLOR={'Maintenance & Facility':'#f59e0b','Safety & Incident':'#ef4444','Customer':'#ec4899','Operational':'#3b82f6','People':'#8b5cf6','Other':'#64748b'};
function issGroupOf(r){
  if(r.mod==='maintenance') return 'Maintenance & Facility';
  if(r.mod==='incident') return 'Safety & Incident';
  if(r.mod==='complaint') return 'Customer';
  const c=Object.values(DB.issueCategories).find(x=>x.label===r.category); return c?c.group:'Other';
}
function issTab(t){ if(!State.iss)State.iss={cat:'',photo:null,prio:'Normal'}; State.iss.tab=t; renderIssue(); }
function issSeg(active){ return `<div class="seg seg-light"><button class="seg-btn ${active==='report'?'active':''}" onclick="issTab('report')">➕ Report</button><button class="seg-btn ${active==='analytics'?'active':''}" onclick="issTab('analytics')">📊 Analytics</button>${isAdmin()?`<button class="seg-btn ${active==='email'?'active':''}" onclick="issTab('email')">📧 Email</button>`:''}</div>`; }
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
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic" style="background:#fdeaea">🚩</div><div><h2>Report an Issue · Analytics</h2><p>Breakdown by category, with a side-by-side comparison across branches.</p></div>
      <div class="ph-actions">${issSeg('analytics')}</div></div>
    <div class="kpi-grid">${kpis.map(k=>`<div class="kpi tone-${k[3]}"><div class="k-top"><div class="k-ic">${k[0]}</div></div><div class="k-val">${k[1]}</div><div class="k-lbl">${esc(k[2])}</div></div>`).join('')}</div>
    <div class="chart-grid cols-2">
      <div class="card"><div class="card-head"><h3>Reports by category</h3></div><div class="card-pad"><div class="chart-box"><canvas id="ia-cat"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h3>Branch comparison</h3><span class="ch-sub">stacked by type</span></div><div class="card-pad"><div class="chart-box"><canvas id="ia-branch"></canvas></div></div></div>
    </div>
    <div class="section-title">Branch × category matrix</div>
    <div class="card"><div class="table-wrap"><table class="grid mx-table"><thead><tr><th>Store</th>${groups.map(g=>`<th>${esc(g.split(' & ')[0].replace('Maintenance','Maint.'))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${matRows}${totRow}</tbody></table></div></div>`;
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
  const rows=DB.staff.filter(s=>isAdmin()||s.store===State.branch);
  const active=rows.filter(s=>s.active).length;
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🧑‍🤝‍🧑</div><div><h2>Staff Members</h2><p>Team directory across stores.</p></div></div>
    <div class="kpi-grid"><div class="kpi tone-info"><div class="k-top"><div class="k-ic">👥</div></div><div class="k-val">${rows.length}</div><div class="k-lbl">Total staff</div></div>
      <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${active}</div><div class="k-lbl">Active</div></div>
      <div class="kpi tone-warn"><div class="k-top"><div class="k-ic">🏪</div></div><div class="k-val">${new Set(rows.map(s=>s.store)).size}</div><div class="k-lbl">Stores</div></div>
      <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">🧰</div></div><div class="k-val">${new Set(rows.map(s=>s.role)).size}</div><div class="k-lbl">Roles</div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Directory</h3></div><div class="table-wrap"><table class="grid"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Store</th><th>Phone</th><th>Started</th><th>Status</th></tr></thead><tbody>
      ${rows.map(s=>`<tr><td class="cell-id">#${esc(s.id)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.role)}</td><td>${esc(s.store)}</td><td>${esc(s.phone)}</td><td>${esc(s.start)}</td><td>${s.active?'<span class="badge ok"><span class="bdot"></span>Active</span>':'<span class="badge mute"><span class="bdot"></span>Inactive</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

/* ============================================================ JOB SCHEDULE (weekly) */
function renderSchedule(){
  setAccent('#6a1b9a'); setCrumb('🗓️','Job Schedule','Weekly roster by department');
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const shifts=[['Open','06:00–14:00'],['Mid','09:00–17:00'],['Close','13:00–21:00']];
  const depts=['Cashier','FV','Grocery','Butcher','Café'];
  const names=['Anna B.','Sarah N.','Kim H.','David T.','Mai L.','Tuan N.','James P.','Lucy T.'];
  const cellName=(d,i)=>names[(d+i)%names.length];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">🗓️</div><div><h2>Job Schedule</h2><p>Roster grid — who works which shift this week.</p></div>
    <div class="ph-actions"><button class="btn sm">‹ Prev</button><button class="btn sm">This week</button><button class="btn sm">Next ›</button></div></div>
    <div class="card"><div class="table-wrap"><table class="grid sched"><thead><tr><th>Shift</th>${days.map(d=>`<th class="ctr">${d}</th>`).join('')}</tr></thead><tbody>
    ${shifts.map((sh,si)=>`<tr><td><b>${sh[0]}</b><div class="cell-sub">${sh[1]}</div></td>${days.map((d,di)=>`<td class="ctr"><span class="shift-pill s${si}">${esc(cellName(di,si))}</span></td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="section-title">Coverage by department</div><div class="card"><div class="card-pad"><div class="chart-box"><canvas id="sched-chart"></canvas></div></div></div>`;
  mkChart('sched-chart',{type:'bar',data:{labels:depts,datasets:[{label:'Shifts',data:depts.map(()=>5+Math.floor(Math.random()*9)),backgroundColor:PALETTE,borderRadius:8,maxBarThickness:40}]},options:baseOpts({legend:false})});
}

/* ============================================================ MANAGER PANEL */
function renderManager(){
  setAccent('#0f766e'); setCrumb('🛡️','Manager Panel','Verify, review & control — all registers');
  if(!State.mgr) State.mgr={sort:'newest'};
  const reviewMods=['issue','maintenance','incident','complaint','violation','reward','raise'];
  const doneStat=['Closed','Cancelled','Resolved','Store Confirmed','Completed','Paid','Given','Approved','Declined'];
  let queue=[],activity=[];
  reviewMods.forEach(id=>{const m=DB.modules[id]; (m.records||[]).forEach(r=>{const row={mod:id,icon:m.icon,short:m.short,...r}; activity.push(row); if(!doneStat.includes(r.status)) queue.push(row);});});
  const dt=r=>String(r.created||r.date||'');
  const sortFn=(a,b)=>State.mgr.sort==='newest'?dt(b).localeCompare(dt(a)):dt(a).localeCompare(dt(b));
  queue.sort(sortFn); activity.sort(sortFn); const recent=activity.slice(0,15);
  const critical=queue.filter(r=>['Critical','Major'].includes(r.severity)||['Critical','Urgent'].includes(r.priority)||r.step==='Final Warning').length;
  const closed=activity.filter(r=>['Closed','Resolved','Completed','Approved','Paid'].includes(r.status)).length;
  const stats=[['🕒',queue.length,'Awaiting review','warn'],['🔴',critical,'Critical / urgent','bad'],['✅',closed,'Closed / done','ok'],['🏪',new Set(activity.map(r=>r.store).filter(Boolean)).size,'Stores active','info']];
  const sumOf=r=>r.title||r.equipment||r.summary||r.shortDescription||r.staffName||(r.awardType?r.awardType+' — '+r.staffName:'')||r.category||'';
  const prioOf=r=>r.priority||r.severity||r.step;
  $('#content').innerHTML=`
    <div class="page-head"><div class="ph-ic">🛡️</div><div><h2>Manager Panel</h2><p>Everything awaiting your review across all registers — sorted by date for easy control.</p></div>
      <div class="ph-actions"><button class="btn sm" onclick="mgrSort()"><i class="fas fa-arrow-down-wide-short"></i>&nbsp; ${State.mgr.sort==='newest'?'Newest first':'Oldest first'}</button></div></div>
    <div class="kpi-grid">${stats.map(s=>`<div class="kpi tone-${s[3]}"><div class="k-top"><div class="k-ic">${s[0]}</div></div><div class="k-val">${s[1]}</div><div class="k-lbl">${esc(s[2])}</div></div>`).join('')}</div>
    <div class="section-title">Pending review · ${queue.length}</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Register</th><th>Store</th><th>Summary</th><th>Priority</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
      ${queue.length?queue.map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td>${esc(r.store||'')}</td><td><div class="wrap">${esc(sumOf(r))}</div></td><td>${prioOf(r)?badge(prioOf(r)):''}</td><td>${badge(r.status)}</td><td>${esc(dt(r).slice(0,16))}</td><td><button class="btn sm primary" onclick='event.stopPropagation();openDetail("${r.mod}","${esc(r.id)}")'>Review</button></td></tr>`).join(''):`<tr><td colspan="8"><div class="empty">🎉 Nothing pending — all caught up.</div></td></tr>`}
    </tbody></table></div></div>
    <div class="section-title">Recent activity log</div>
    <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Register</th><th>Store</th><th>Summary</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${recent.map(r=>`<tr onclick='openDetail("${r.mod}","${esc(r.id)}")'><td class="cell-id">${esc(r.id)}</td><td><span class="reg-tag">${r.icon} ${esc(r.short)}</span></td><td>${esc(r.store||'')}</td><td><div class="wrap">${esc(sumOf(r))}</div></td><td>${badge(r.status)}</td><td>${esc(dt(r).slice(0,16))}</td></tr>`).join('')}
    </tbody></table></div></div>`;
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
    const realThumbs=d.photos.map(u=>`<img src="${u}">`).join('');
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
    ${allPhotos.length?`<div class="section-title">Photo evidence · ${allPhotos.length}</div><div class="wa-gallery">${allPhotos.map(u=>`<img src="${u}">`).join('')}</div>`:''}
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
  setAccent('#1565c0'); setCrumb('✉️','Email Notifications','Who gets alerted, and for what');
  const recips=[['tony@mcqinternational.com','Head Office','all'],['ops@mcqinternational.com','Operations','critical'],['hr@mcqinternational.com','HR','violations'],['maintenance@mcqinternational.com','Facilities','maintenance']];
  const events=[['Critical / Major incident',true],['New complaint (Major)',true],['Maintenance Critical',true],['Violation — Final Warning',true],['Daily checklist not completed',false],['Monthly reward approved',false]];
  $('#content').innerHTML=`<div class="page-head"><div class="ph-ic">✉️</div><div><h2>Email Notifications</h2><p>Configure recipients and which events trigger an email.</p></div></div>
    <div class="split-2"><div class="card"><div class="card-head"><h3>Recipients</h3></div><div class="table-wrap"><table class="grid"><thead><tr><th>Email</th><th>Role</th><th>Scope</th><th></th></tr></thead><tbody>
      ${recips.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td><span class="badge info"><span class="bdot"></span>${esc(r[2])}</span></td><td><label class="switch"><input type="checkbox" checked><span></span></label></td></tr>`).join('')}
      </tbody></table></div><div class="card-pad"><button class="btn sm">＋ Add recipient</button></div></div>
      <div class="card"><div class="card-head"><h3>Trigger events</h3></div><div class="card-pad">
      ${events.map(e=>`<label class="ev-row"><span>${esc(e[0])}</span><label class="switch"><input type="checkbox" ${e[1]?'checked':''}><span></span></label></label>`).join('')}
      <button class="btn primary block" style="margin-top:14px" onclick="toast('Email settings saved (demo)')">💾 Save settings</button></div></div></div>`;
}

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
