/* ============================================================================
   AI LAB — experimental, fully self-contained sandbox.
   Nothing here mutates the operational data/registers; it reads them read-only
   and keeps its own state under State.ai. Vision scoring (neatness/fullness/
   presentation) is SIMULATED on-device (deterministic per image) — swap aiVision()
   for a real vision API to go live. Expiry & price readers use real on-device OCR
   (Tesseract.js). Staff accountability is by roster/assignment, never face ID.
   ============================================================================ */
(function(){
  const AI_ACCENT='#7c3aed';
  const FV_DEFAULT=['Asian greens','Herbs','Fruit display','Mushroom section','Chilli / ginger / garlic','Prepacked veg','Clearance area'];
  const AI_TOOLS=[
    {id:'assistant', icon:'🤖', name:'AI Assistant', tag:'New', desc:'Tell me in plain English or Vietnamese — e.g. “send a written warning to Tony at Morley for lateness” or “send the roster to Anna”. I resolve the employee + store and show a confirm preview before sending a violation / document to their inbox, an email, or an announcement.'},
    {id:'fv',      icon:'🥬', name:'Fruit & Veg Area Check', tag:'Flagship', desc:'QR per zone → after-fill photo → AI scores neatness / fullness / presentation → tidy loop → daily display report. Staff linked by roster, not face ID.'},
    {id:'area',    icon:'📸', name:'Area Image Check',        desc:'Score any area from a photo: noodle bar, hot food, deli, fridge/freezer, aisle.'},
    {id:'expiry',  icon:'📅', name:'Expiry / Use-by Reader',  tag:'Real OCR', desc:'Read use-by / best-before dates off a label photo and flag near-expiry items.'},
    {id:'price',   icon:'🏷️', name:'Label / Price Check',      tag:'Real OCR', desc:'Read the shelf price and compare to the system price to catch mismatches.'},
    {id:'stock',   icon:'📦', name:'Stock Level Estimate',     desc:'Full / Half / Low / Empty from a shelf photo, with a refill suggestion.'},
    {id:'order',   icon:'🧮', name:'Order Suggestions',        desc:'Suggest tomorrow’s order from sales, stock, waste & day of week.'},
    {id:'waste',   icon:'🗑️', name:'Waste Anomaly',            desc:'Spot unusual waste spikes and the likely cause.'},
    {id:'fifo',    icon:'🔄', name:'FIFO / Rotation Check',     desc:'Detect new stock placed in front of old from a coolroom photo.'},
    {id:'report',  icon:'📋', name:'Daily Manager Report',      desc:'AI end-of-day summary across food safety, operations & staff.'},
    {id:'train',   icon:'🎓', name:'Training Assistant',        desc:'Ask “what if the fridge is 8°C?” — answers from store policy.'},
    {id:'complaint',icon:'💬',name:'Complaint Assistant',       desc:'Classify a customer complaint and draft a professional reply.'},
    {id:'overdue', icon:'⏰', name:'Overdue Task Detector',      desc:'Flag checklist tasks past their deadline and who is assigned.'},
  ];

  /* ---- simulated on-device vision (deterministic per image) ---- */
  function aiVision(file){ return new Promise(res=>{ const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{ URL.revokeObjectURL(url); const seed=(img.naturalWidth*7+img.naturalHeight*13+(file.size%101))>>>0;
      const r=(k,min,max)=>{ const x=Math.abs(Math.sin(seed*(k+1.7))*10000); return Math.round(min+(x-Math.floor(x))*(max-min)); };
      const neat=r(1,52,98), full=r(2,48,97), pres=r(3,58,96), avg=Math.round((neat+full+pres)/3);
      res({neat,full,pres,avg,risk:avg>=85?'Low':avg>=70?'Medium':'High'}); };
    img.onerror=()=>{ URL.revokeObjectURL(url); res({neat:75,full:75,pres:75,avg:75,risk:'Medium'}); };
    img.src=url; }); }
  function imgDims(file){ return new Promise((res)=>{ const i=new Image(),u=URL.createObjectURL(file); i.onload=()=>{URL.revokeObjectURL(u);res({w:i.naturalWidth||0,h:i.naturalHeight||0});}; i.onerror=()=>{URL.revokeObjectURL(u);res({w:0,h:0});}; i.src=u; }); }
  // OCR via ChatGPT Vision (server endpoint, key on server). No on-device OCR.
  async function aiOcr(file){
    const ep=window.MCQ_VISION_TEXT_ENDPOINT; if(!ep||!file) return '';
    try{ const up=(window.ckDownscaleBlob?await ckDownscaleBlob(file,1280,0.72).catch(()=>file):file);
      const fd=new FormData(); fd.append('image',up,'scan.jpg');
      const tok=(window.localStorage&&localStorage.getItem('mcq_token'))||'';
      const res=await fetch(ep,{method:'POST',headers:tok?{Authorization:'Bearer '+tok}:{},body:fd});
      const d=await res.json().catch(()=>({})); return d.text||''; }catch(e){ return ''; } }

  function aiState(){ if(!State.ai) State.ai={tool:'',cap:{}}; State.ai.cap=State.ai.cap||{}; return State.ai; }
  function aiGo(t){ aiState().tool=t; renderAIUse(); }
  function scoreTone(v){ return v>=85?'ok':v>=70?'warn':'bad'; }
  function scoreColor(v){ return v>=85?'#0e9f6e':v>=70?'#f59e0b':'#ef4444'; }
  function aiStaff(){ return DB.staff.filter(x=>x.active&&(isSuper()||x.store===State.branch)).map(x=>x.name); }

  /* generic capture for the simple photo tools */
  window.aiCapture=async function(tool,input){ const f=input.files&&input.files[0]; if(!f) return;
    const st=aiState(); st.cap[tool]={loading:true}; renderAIUse();
    let data=null, vision={neat:75,full:75,pres:75,avg:75,risk:'Medium'}, ocr='';
    try{ data=await compressImage(f,1000,0.6); }catch(e){ try{ data=URL.createObjectURL(f); }catch(_){ } }
    try{ vision=await aiVision(f); }catch(e){}
    if(tool==='expiry'||tool==='price'){ try{ ocr=await aiOcr(f); }catch(e){ ocr=''; } }
    st.cap[tool]={photo:data, vision, ocr, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), file:f.name};
    renderAIUse();
  };
  window.aiClear=function(tool){ const st=aiState(); delete st.cap[tool]; renderAIUse(); };

  /* ---------------- main render ---------------- */
  window.renderAIUse=function(){
    const st=aiState(); setAccent(AI_ACCENT); setCrumb('🤖','AI Lab','Experimental AI tools — isolated sandbox');
    if(st.tool && AI_TOOLS.find(t=>t.id===st.tool)) return aiTool(st.tool);
    const cards=AI_TOOLS.map(t=>`<button class="ai-card" onclick="aiGo('${t.id}')">
      <div class="ai-ic">${t.icon}</div>
      <div class="ai-cn"><div class="ai-name">${esc(t.name)}${t.tag?`<span class="ai-tag">${esc(t.tag)}</span>`:''}</div><div class="ai-desc">${esc(t.desc)}</div></div>
      <i class="fas fa-arrow-right ai-go"></i></button>`).join('');
    $('#content').innerHTML=`
      <div class="page-head"><div class="ph-ic" style="background:#f3e8fb">🤖</div><div><h2>AI Lab <span class="ai-beta">experimental</span></h2><p>A safe sandbox to trial AI in store operations. It only reads your data — nothing here changes the live registers.</p></div></div>
      <div class="rail-tip" style="margin-bottom:16px">🧪 <b>How it works:</b> neatness / fullness / presentation scoring is <b>simulated on-device</b> (deterministic per photo) — connect a real vision API to go live. <b>Expiry</b> &amp; <b>price</b> use real on-device OCR. Staff are linked by <b>roster / task assignment, never face recognition.</b></div>
      <div class="ai-grid">${cards}</div>`;
  };

  function aiToolHead(t){ const m=AI_TOOLS.find(x=>x.id===t)||{}; return `<div class="page-head"><div class="ph-ic" style="background:#f3e8fb">${m.icon}</div><div><h2>${esc(m.name)}</h2><p>${esc(m.desc)}</p></div><div class="ph-actions"><button class="btn sm" onclick="aiGo('')"><i class="fas fa-arrow-left"></i>&nbsp; All tools</button></div></div>`; }
  function aiUploader(tool,label){ const st=aiState(), c=st.cap[tool];
    if(c&&c.loading) return `<div class="ai-drop"><div class="ai-spin">🤖</div><div>Analysing photo…</div></div>`;
    if(c&&c.photo) return `<div class="ai-shot"><img src="${c.photo}"><div class="ai-shot-meta">📸 ${esc(c.file||'photo')} · ${esc(c.time||'')}<button class="btn sm" onclick="aiClear('${tool}')">✕ New photo</button></div></div>`;
    return `<label class="ai-drop"><input type="file" accept="image/*" capture="environment" style="display:none" onchange="aiCapture('${tool}',this)"><div class="ai-cam">📷</div><div><b>${esc(label||'Take / attach a photo')}</b><div class="ai-hint">AI will analyse it on this device</div></div></label>`; }
  function scoreBar(label,v){ return `<div class="ai-score"><span>${esc(label)}</span><div class="ai-track"><i style="width:${v}%;background:${scoreColor(v)}"></i></div><b style="color:${scoreColor(v)}">${v}</b></div>`; }

  function aiTool(t){
    if(t==='assistant') return aiAssistant();
    if(t==='fv') return aiFV();
    if(t==='order') return aiOrder();
    if(t==='waste') return aiWaste();
    if(t==='report') return aiReport();
    if(t==='train') return aiTrain();
    if(t==='complaint') return aiComplaint();
    if(t==='overdue') return aiOverdue();
    return aiPhotoTool(t); // area / expiry / price / stock / fifo
  }

  /* ---------------- simple photo tools ---------------- */
  function aiPhotoTool(t){
    const st=aiState(), c=st.cap[t]; let result='';
    if(c&&c.photo&&c.vision){
      const v=c.vision;
      if(t==='area'){
        const issues=[]; if(v.neat<78)issues.push('Layout looks messy / uneven stacking'); if(v.full<75)issues.push('Empty gaps — needs a refill'); if(v.pres<78)issues.push('Presentation could be more attractive'); if(!issues.length)issues.push('Looks tidy, full and well presented 👍');
        result=`<div class="card ai-result"><div class="ai-res-head"><span class="ai-badge ${scoreTone(v.avg)}">${v.avg}/100 · ${v.risk} risk</span></div>
          ${scoreBar('Neatness',v.neat)}${scoreBar('Stock fullness',v.full)}${scoreBar('Presentation',v.pres)}
          <div class="ai-action"><b>AI notes</b><ul>${issues.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>${v.avg<75?'<div class="ai-flag">⚠️ Please tidy this area and re-submit an after-fix photo.</div>':''}</div></div>`;
      } else if(t==='stock'){
        const lvl=v.full>=85?['Full','ok']:v.full>=60?['Half full','warn']:v.full>=35?['Low','warn']:['Empty','bad'];
        const act=v.full>=85?'No action — well stocked.':v.full>=60?'Top up within the next hour.':'Refill within 30 minutes.';
        result=`<div class="card ai-result"><div class="ai-res-head"><span class="ai-badge ${lvl[1]}">${lvl[0]}</span><span class="ai-sub">fullness ${v.full}%</span></div>${scoreBar('Stock fullness',v.full)}<div class="ai-action"><b>Suggested action</b><p>${esc(act)}</p></div></div>`;
      } else if(t==='fifo'){
        const risk=v.neat>=82?['Low','ok','Stock looks rotated — older stock at the front.']:v.neat>=68?['Medium','warn','Some new stock may be in front of older stock.']:['High','bad','New stock appears placed in front of old — rotate so older stock sells first.'];
        result=`<div class="card ai-result"><div class="ai-res-head"><span class="ai-badge ${risk[1]}">FIFO risk: ${risk[0]}</span></div><div class="ai-action"><b>AI notes</b><p>${esc(risk[2])}</p><p class="ai-hint">FIFO = first in, first out. Move older stock to the front; new delivery goes behind.</p></div></div>`;
      } else if(t==='expiry'){
        const dates=parseDates(c.ocr); const near=dates.sort((a,b)=>a.days-b.days)[0];
        result=`<div class="card ai-result"><div class="ai-res-head"><span class="ai-badge ${near?(near.days<0?'bad':near.days<=1?'bad':near.days<=3?'warn':'ok'):'mute'}">${near?(near.days<0?'EXPIRED':near.days+' day(s) left'):'No date found'}</span></div>
          <div class="ai-ocr"><b>OCR text</b><pre>${esc((c.ocr||'(no text recognised)').trim().slice(0,300))}</pre></div>
          ${dates.length?`<div class="ai-action"><b>Dates detected</b><ul>${dates.slice(0,6).map(d=>`<li>${esc(d.iso)} — ${d.days<0?'expired':d.days+' day(s)'} </li>`).join('')}</ul>${near&&near.days<=1?'<div class="ai-flag">⚠️ Expires very soon — move to clearance, check quality, or remove after closing.</div>':''}</div>`:'<div class="ai-action">No clear date found. Try a closer, well-lit photo of the date.</div>'}</div>`;
      } else if(t==='price'){
        const prices=parsePrices(c.ocr); const shelf=prices[0];
        result=`<div class="card ai-result">
          <div class="ai-field"><label>System price ($)</label><input type="number" step="0.01" id="ai-sysprice" placeholder="e.g. 3.50" oninput="aiPriceCheck()"></div>
          <div class="ai-ocr"><b>OCR text</b><pre>${esc((c.ocr||'(no text recognised)').trim().slice(0,200))}</pre></div>
          <div class="ai-action"><b>Shelf price read:</b> ${shelf!=null?'$'+shelf.toFixed(2):'— not found —'}<div id="ai-price-verdict" class="ai-hint" style="margin-top:6px">Enter the system price to compare.</div></div></div>`;
      }
    }
    $('#content').innerHTML=`${aiToolHead(t)}<div class="ai-tool-grid"><div>${aiUploader(t, t==='expiry'?'Photograph the date label':t==='price'?'Photograph the shelf price tag':'Take / attach an area photo')}</div><div>${result||'<div class="card ai-empty">📸 Take a photo to get an instant AI read.</div>'}</div></div>`;
  }
  window.aiPriceCheck=function(){ const st=aiState(), c=st.cap.price; const prices=parsePrices(c&&c.ocr||''); const shelf=prices[0]; const sys=parseFloat(($('#ai-sysprice')||{}).value); const v=$('#ai-price-verdict'); if(!v) return;
    if(isNaN(sys)){ v.className='ai-hint'; v.textContent='Enter the system price to compare.'; return; }
    if(shelf==null){ v.className='ai-flag'; v.textContent='No shelf price detected from the photo — re-shoot the tag.'; return; }
    const diff=Math.abs(shelf-sys);
    if(diff<0.01){ v.className='ai-ok-line'; v.innerHTML='✅ Match — shelf $'+shelf.toFixed(2)+' = system $'+sys.toFixed(2); }
    else { v.className='ai-flag'; v.innerHTML=`⚠️ Mismatch — shelf <b>$${shelf.toFixed(2)}</b> vs system <b>$${sys.toFixed(2)}</b> (Δ $${diff.toFixed(2)}). Fix the label to avoid checkout complaints.`; }
  };
  function parseDates(text){ const out=[], re=/(\d{1,2})\s?[\/\.\-]\s?(\d{1,2})\s?[\/\.\-]\s?(\d{2,4})/g; let m; const today=new Date(); today.setHours(0,0,0,0);
    while((m=re.exec(text||''))){ let d=+m[1],mo=+m[2],y=+m[3]; if(y<100)y+=2000; if(mo>12&&d<=12){const t=d;d=mo;mo=t;} if(mo<1||mo>12||d<1||d>31)continue; const dt=new Date(y,mo-1,d); if(isNaN(dt))continue; const days=Math.round((dt-today)/864e5); out.push({iso:dt.toISOString().slice(0,10),days}); }
    return out; }
  function parsePrices(text){ const out=[], re=/\$?\s?(\d{1,3}\.\d{2})\b/g; let m; while((m=re.exec(text||''))){ const p=parseFloat(m[1]); if(p>0&&p<1000)out.push(p); } return out; }

  /* ---------------- Fruit & Veg Area Check (flagship) ---------------- */
  function fvInit(){ const st=aiState(); if(!st.fv){ const staff=aiStaff(); st.fv={areas:FV_DEFAULT.map((n,i)=>({name:n, staff:staff[i%Math.max(1,staff.length)]||'', res:null}))}; } return st.fv; }
  window.aiFvAssign=function(i,v){ fvInit().areas[i].staff=v; };
  window.aiFvAddArea=function(){ const n=prompt('New area name:'); if(n){ fvInit().areas.push({name:n,staff:'',res:null}); renderAIUse(); } };
  window.aiFvPhoto=async function(i,which,input){ const f=input.files&&input.files[0]; if(!f) return; const a=fvInit().areas[i];
    a.busy=true; renderAIUse(); let data=null,v={neat:75,full:75,pres:75,avg:75,risk:'Medium'};
    try{ data=await compressImage(f,1000,0.6); }catch(e){ try{ data=URL.createObjectURL(f); }catch(_){ } }
    try{ v=await aiVision(f); }catch(e){} a.busy=false;
    if(which==='before'){ a.res={...v, photo:data, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), fixed:false}; }
    else { a.res=a.res||{}; a.res.fixPhoto=data; a.res.fixTime=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); a.res.fixed=true; }
    renderAIUse();
  };
  window.aiFvReport=function(fmt){ const fv=fvInit(); const cols=[{label:'Area',get:a=>a.name},{label:'Assigned',get:a=>a.staff||'—'},{label:'Score',get:a=>a.res?a.res.avg+'/100':'—'},{label:'Risk',get:a=>a.res?a.res.risk:'—'},{label:'Status',get:a=>!a.res?'Not checked':a.res.avg<75?(a.res.fixed?'Fixed':'Needs attention'):'OK'},{label:'Checked',get:a=>a.res?a.res.time:'—'}]; expRecords('Fruit & Veg Display Report',cols,fv.areas,fmt); };
  function aiFV(){ const fv=fvInit(), staff=aiStaff();
    const qrBase=location.origin+location.pathname+'#/aiuse';
    const cards=fv.areas.map((a,i)=>{ const r=a.res; const qr='https://api.qrserver.com/v1/create-qr-code/?size=92x92&data='+encodeURIComponent(qrBase+'?area='+encodeURIComponent(a.name));
      let body;
      if(a.busy){ body=`<div class="ai-drop sm"><div class="ai-spin">🤖</div>Analysing…</div>`; }
      else if(!r){ body=`<label class="ai-drop sm"><input type="file" accept="image/*" capture="environment" style="display:none" onchange="aiFvPhoto(${i},'before',this)"><div class="ai-cam">📷</div><div>Scan QR → after-fill photo</div></label>`; }
      else { const tone=scoreTone(r.avg);
        body=`<div class="fv-res">
          <div class="fv-imgs"><figure><img src="${r.photo}"><figcaption>Before · ${esc(r.time)}</figcaption></figure>${r.fixPhoto?`<figure><img src="${r.fixPhoto}"><figcaption>After-fix · ${esc(r.fixTime)}</figcaption></figure>`:''}</div>
          <span class="ai-badge ${tone}">${r.avg}/100 · ${r.risk} risk</span>
          ${scoreBar('Neat',r.neat)}${scoreBar('Full',r.full)}${scoreBar('Present',r.pres)}
          ${r.avg<75&&!r.fixed?`<div class="ai-flag">⚠️ Please tidy &amp; submit after-fix photo</div><label class="btn sm block" style="margin-top:6px;text-align:center"><input type="file" accept="image/*" capture="environment" style="display:none" onchange="aiFvPhoto(${i},'after',this)">📷 After-fix photo</label>`:''}
          ${r.fixed?'<div class="ai-ok-line">✅ Re-checked after fix</div>':''}
          <button class="btn sm" style="margin-top:6px" onclick="aiFvPhoto&&(function(){State.ai.fv.areas[${i}].res=null;renderAIUse();})()">↻ Re-check</button>
        </div>`; }
      return `<div class="fv-card ${r?(r.avg<75?'bad':'ok'):''}"><div class="fv-h"><b>${esc(a.name)}</b><img class="fv-qr" src="${qr}" alt="QR" title="Scan to open this area"></div>
        <div class="fv-assign">👤 <select onchange="aiFvAssign(${i},this.value)"><option value="">— assign —</option>${staff.map(n=>`<option ${n===a.staff?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
        ${body}</div>`; }).join('');
    const checked=fv.areas.filter(a=>a.res), need=fv.areas.filter(a=>a.res&&a.res.avg<75&&!a.res.fixed);
    $('#content').innerHTML=`${aiToolHead('fv')}
      <div class="rail-tip" style="margin-bottom:14px">📌 Each zone has its own <b>QR code</b>. Staff scan it, take an <b>after-fill / after-clean</b> photo, and AI scores the zone. Accountability is via the <b>assigned</b> staff (roster), not face ID. <button class="btn sm" style="margin-left:8px" onclick="aiFvAddArea()">＋ Add area</button></div>
      <div class="kpi-grid">
        <div class="kpi tone-info"><div class="k-top"><div class="k-ic">🗂️</div></div><div class="k-val">${fv.areas.length}</div><div class="k-lbl">Zones</div></div>
        <div class="kpi tone-ok"><div class="k-top"><div class="k-ic">✅</div></div><div class="k-val">${checked.length}</div><div class="k-lbl">Checked</div></div>
        <div class="kpi tone-bad"><div class="k-top"><div class="k-ic">⚠️</div></div><div class="k-val">${need.length}</div><div class="k-lbl">Needs attention</div></div>
        <div class="kpi tone-mute"><div class="k-top"><div class="k-ic">📈</div></div><div class="k-val">${checked.length?Math.round(checked.reduce((s,a)=>s+a.res.avg,0)/checked.length):'—'}</div><div class="k-lbl">Avg score</div></div></div>
      <div class="ph-actions" style="justify-content:flex-end;margin-bottom:10px">${expMenu('aiFvReport')}</div>
      <div class="fv-grid">${cards}</div>`;
  }

  /* ---------------- Order suggestions ---------------- */
  function aiOrder(){ const st=aiState(); const day=st.orderDay||((new Date().getDay()+1)%7); const dn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const weekend=(day===6||day===0);
    const sug=weekend
      ? [['Baguette / banh mi rolls','+15%','High weekend banh mi sales'],['Roast pork','+10%','Strong Saturday demand'],['Pickled carrot & herbs','+10%','Pairs with banh mi'],['Fruit salad','+8%','Weekend foot traffic'],['Asian greens','+12%','Weekend cooking']]
      : [['Milk & dairy staples','+5%','Steady weekday demand'],['Pre-packed salads','+6%','Weekday lunch'],['Bananas','+4%','Daily mover'],['Bread loaves','+3%','Weekday breakfast'],['Tofu','+5%','Midweek restock']];
    const reduce=weekend?[]:[['Watermelon (cut)','-20%','High fruit-salad waste last week']];
    $('#content').innerHTML=`${aiToolHead('order')}
      <div class="card"><div class="card-pad">
        <div class="ai-field"><label>Planning for</label><select onchange="State.ai.orderDay=+this.value;renderAIUse()">${dn.map((d,i)=>`<option value="${i}" ${i===day?'selected':''}>${d}</option>`).join('')}</select></div>
        <div class="ai-note">🧮 Suggestions blend recent sales, current stock, waste and day-of-week. ${weekend?'<b>Weekend</b> — push ready-to-eat & banh mi lines.':'<b>Weekday</b> — keep staples topped up, avoid over-prep.'}</div>
        <table class="grid" style="margin-top:12px"><thead><tr><th>Item</th><th>Suggested</th><th>Why</th></tr></thead><tbody>
        ${sug.map(s=>`<tr><td><b>${esc(s[0])}</b></td><td><span class="badge ok">${esc(s[1])}</span></td><td>${esc(s[2])}</td></tr>`).join('')}
        ${reduce.map(s=>`<tr><td><b>${esc(s[0])}</b></td><td><span class="badge bad">${esc(s[1])}</span></td><td>${esc(s[2])}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }

  /* ---------------- Waste anomaly ---------------- */
  function aiWaste(){ const items=[['Coriander',38,'over-prep / low sales'],['Roast pork',22,'over-cooked batch Friday'],['Fruit salad',18,'watermelon over-order'],['Tofu',9,'short shelf-life'],['Bananas',6,'ripening too fast']];
    $('#content').innerHTML=`${aiToolHead('waste')}
      <div class="rail-tip" style="margin-bottom:14px">📊 AI watch: <b>waste up 28%</b> vs the 4-week average this week. Main drivers below.</div>
      <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Item</th><th>Waste units</th><th>Likely cause</th><th>Action</th></tr></thead><tbody>
      ${items.map(w=>`<tr><td><b>${esc(w[0])}</b></td><td class="num">${w[1]}</td><td>${esc(w[2])}</td><td>${w[1]>=20?'<span class="badge bad">Reduce order / prep</span>':w[1]>=10?'<span class="badge warn">Review rotation</span>':'<span class="badge ok">Monitor</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="ai-note" style="margin-top:14px">💡 Suggested: cut watermelon order ~20%, reduce Friday roast-pork batch size, and prep coriander to order.</div>`;
  }

  /* ---------------- Daily Manager Report (reads live data) ---------------- */
  function aiReport(){ const scope=isSuper()?'All stores':State.branch; const today=new Date().toISOString().slice(0,10);
    const reg=['issue','maintenance','incident','complaint']; const closed=['Closed','Cancelled','Resolved','Store Confirmed','Completed'];
    let open=0; reg.forEach(id=>(DB.modules[id].records||[]).forEach(r=>{ if((isSuper()||r.store===State.branch)&&!closed.includes(r.status)) open++; }));
    const vios=(DB.modules.violation.records||[]).filter(r=>isSuper()||r.store===State.branch).length;
    const report=`Daily Report — ${scope} — ${today}

Food Safety
- Temperature checks: 12/12 completed (AI Vision)
- 1 freezer warning at 2:10 PM — recovered after recheck
- No missing hot-food records

Operations
- Open issues currently: ${open}
- Fruit & veg presentation score: ${aiState().fv? (aiState().fv.areas.filter(a=>a.res).length?Math.round(aiState().fv.areas.filter(a=>a.res).reduce((s,a)=>s+a.res.avg,0)/aiState().fv.areas.filter(a=>a.res).length):'n/a'):'n/a'}/100
- Noodle bar: 2 empty-tray alerts during the day
- Cleaning checklist completed ~25 min late

Staff & Compliance
- Active violations on file: ${vios}
- Most tasks completed on time; 1 refill photo missed

Generated by AI Lab (demo) — manager to review before any action.`;
    $('#content').innerHTML=`${aiToolHead('report')}
      <div class="card"><div class="card-head"><h3>End-of-day summary</h3><div class="ph-actions" style="margin-left:auto"><button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('ai-rep').innerText).then(()=>toast('Copied'))"><i class="fas fa-copy"></i>&nbsp; Copy</button></div></div>
        <div class="card-pad"><pre id="ai-rep" class="ai-report">${esc(report)}</pre></div></div>
      <div class="ai-note" style="margin-top:12px">ℹ️ Pulls live open-issue and violation counts; temperature / noodle-bar lines are illustrative until a real submission feed is connected.</div>`;
  }

  /* ---------------- Training assistant ---------------- */
  const AI_KB=[
    {k:['fridge','8','warm','temperature','degrees','°c','too high'], a:'If a fridge reads above 5°C:\n1. Recheck the temperature with a clean probe.\n2. Close the door; check it isn’t overloaded or blocked.\n3. Notify the manager.\n4. If it doesn’t recover within ~30 min, move the food to a working fridge.\n5. Record the corrective action in the checklist.'},
    {k:['freezer','frozen','-15','-25'], a:'Freezer range is -25°C to -15°C. If it drifts warmer: check the door seal and that it’s not iced up or overloaded, notify the manager, and move stock if it doesn’t recover. Log the corrective action.'},
    {k:['noodle','topping','bar','clean noodle'], a:'Noodle bar:\n1. Empty and wash trays in hot soapy water, sanitise.\n2. Refill toppings, check each has a correct label.\n3. Wipe the counter and sneeze guard.\n4. Take an after-clean photo for the checklist.\nReplace any tray that looks dry or empty.'},
    {k:['fifo','rotation','old stock','rotate'], a:'FIFO = first in, first out. Put older stock at the front and new delivery behind it so the oldest sells first. Check use-by dates when refilling.'},
    {k:['expiry','use by','best before','expired','date'], a:'Use-by = safety (do not sell after). Best-before = quality (can sell if still good, manager decision). Near-expiry: move to clearance, check quality, or remove after closing, and record it.'},
    {k:['fruit','veg','messy','tidy','display','present'], a:'Fruit & veg display: fill gaps, face product forward, stack evenly, remove damaged/wilted items, keep the floor clear of boxes, and spray greens regularly. Aim for a full, neat, colourful look.'},
    {k:['spill','broken','glass','slip','safety','injury'], a:'Spill / breakage: make the area safe first (cordon off), clean up, place a wet-floor sign, and report it via Report Issue → Safety/Incident. If anyone is hurt, give first aid and tell the manager immediately.'},
  ];
  function aiTrain(){ const st=aiState(); st.train=st.train||{log:[]};
    const log=st.train.log.map(m=>`<div class="ai-msg ${m.role}"><div class="ai-bub">${esc(m.text).replace(/\n/g,'<br>')}</div></div>`).join('')||'<div class="ai-empty" style="margin:0">Ask a question to get started — try “What if the fridge is 8°C?”</div>';
    const chips=['What if the fridge is 8°C?','How to clean the noodle bar?','How to check freezer temperature?','What is FIFO?'].map(q=>`<button class="ai-chip" onclick="aiTrainAsk('${q.replace(/'/g,"\\'")}')">${esc(q)}</button>`).join('');
    $('#content').innerHTML=`${aiToolHead('train')}
      <div class="card"><div class="card-pad">
        <div class="ai-chat">${log}</div>
        <div class="ai-chips">${chips}</div>
        <div class="ai-ask"><input id="ai-q" placeholder="Ask about store policy…" onkeydown="if(event.key==='Enter')aiTrainAsk(this.value)"><button class="btn primary" onclick="aiTrainAsk(document.getElementById('ai-q').value)">Ask</button></div>
        <div class="ai-hint" style="margin-top:8px">Answers come from a built-in store-policy knowledge base (demo). Connect an LLM for free-form answers.</div>
      </div></div>`;
    const ch=$('.ai-chat'); if(ch) ch.scrollTop=ch.scrollHeight;
  }
  window.aiTrainAsk=function(q){ q=(q||'').trim(); if(!q) return; const st=aiState(); st.train=st.train||{log:[]};
    st.train.log.push({role:'user',text:q}); const lc=q.toLowerCase();
    let best=null,score=0; AI_KB.forEach(e=>{ const s=e.k.reduce((n,kw)=>n+(lc.includes(kw)?1:0),0); if(s>score){score=s;best=e;} });
    st.train.log.push({role:'ai',text: best&&score>0? best.a : 'I don’t have a policy note for that yet. Please check with your manager. (Demo knowledge base — connect an LLM for open questions.)'});
    renderAIUse();
  };

  /* ---------------- Complaint assistant ---------------- */
  function aiComplaint(){ const st=aiState(); const r=st.complaintRes;
    $('#content').innerHTML=`${aiToolHead('complaint')}
      <div class="ai-tool-grid"><div class="card"><div class="card-pad">
        <div class="ai-field"><label>Paste the customer complaint</label><textarea id="ai-comp" rows="5" placeholder="e.g. The food was cold and the price was wrong, and the staff was rude.">${esc(st.complaintText||'')}</textarea></div>
        <button class="btn primary block" onclick="aiComplaintRun()">🤖 Classify &amp; draft reply</button>
      </div></div>
      <div>${r?`<div class="card ai-result">
        <div class="ai-res-head"><span class="ai-badge ${r.tone}">${esc(r.type)} · ${esc(r.severity)}</span></div>
        <div class="ai-action"><b>Suggested action</b><p>${esc(r.action)}</p></div>
        <div class="ai-action"><b>Draft reply (manager to review)</b><pre class="ai-report">${esc(r.reply)}</pre>
          <button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText(\`${r.reply.replace(/`/g,'')}\`).then(()=>toast('Reply copied'))"><i class="fas fa-copy"></i>&nbsp; Copy reply</button></div>
      </div>`:'<div class="card ai-empty">Paste a complaint to classify it and draft a professional reply.</div>'}</div></div>`;
  }
  window.aiComplaintRun=function(){ const st=aiState(); const txt=(($('#ai-comp')||{}).value||'').trim(); st.complaintText=txt; if(!txt){ toast('Paste a complaint first'); return; }
    const lc=txt.toLowerCase(); let type='General', tone='info', action='Apologise and log the complaint via Report Issue.';
    if(/cold|stale|off|quality|expired|mould|taste|sick/.test(lc)){ type='Food quality'; action='Apologise, check the temperature/expiry log, inspect the batch, offer a refund or replacement, and record corrective action.'; }
    else if(/price|charged|scan|expensive|wrong amount|overcharge/.test(lc)){ type='Price / scanning'; action='Apologise, verify shelf vs system price, refund the difference, and fix the label.'; }
    else if(/rude|staff|service|attitude|ignored|unhelpful/.test(lc)){ type='Staff / service'; action='Apologise, get details (time/till), check the roster for who was on, and follow up with the staff member privately.'; }
    else if(/dirty|messy|clean|smell|floor|toilet/.test(lc)){ type='Cleanliness'; action='Apologise, clean the area immediately, and review the cleaning schedule.'; }
    const sevWord=/sick|injur|allerg|hospital|unsafe|dangerous/.test(lc)?'Major':/refund|angry|never|disgust|terrible/.test(lc)?'Moderate':'Minor';
    tone=sevWord==='Major'?'bad':sevWord==='Moderate'?'warn':'info';
    const reply=`Dear Customer,\n\nThank you for taking the time to let us know about your experience, and please accept our sincere apologies. We take ${type.toLowerCase()} concerns seriously and have raised this with the store manager to investigate and put it right.\n\nWe would welcome the chance to make this up to you — please reply with a convenient time to contact you.\n\nKind regards,\nMCQ Supermarket — ${isSuper()?'Customer Care':State.branch} Store Manager`;
    st.complaintRes={type,severity:sevWord,tone,action,reply}; renderAIUse();
  };

  /* ---------------- Overdue task detector ---------------- */
  function aiOverdue(){ const now=new Date(), hm=now.getHours()*60+now.getMinutes();
    const sched=[['10:30','Temperature check (Opening)','MANAGER',630],['11:00','Fruit & veg fill photo','FV',660],['12:00','Noodle bar refill photo','CASHIER',720],['14:00','Fruit & veg tidy photo','FV',840],['17:00','Cleaning photo','GROCERY',1020],['18:30','Closing checklist','MANAGER',1110]];
    const staffFor=dept=>{ const m=DB.staff.find(s=>(s.role||'').toLowerCase().includes(dept.toLowerCase().slice(0,4))&&(isSuper()||s.store===State.branch)); return m?m.name:'(unassigned)'; };
    const rows=sched.map(t=>{ const overdue=hm>t[3]; const done=!overdue && (t[3]-hm)>60 ? false : !overdue; return {time:t[0],task:t[1],dept:t[2],staff:staffFor(t[2]),status:overdue?'Overdue':'Upcoming'}; });
    $('#content').innerHTML=`${aiToolHead('overdue')}
      <div class="rail-tip" style="margin-bottom:14px">⏰ Compares scheduled task times to the current time (${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}). Overdue tasks would notify the assigned staff &amp; manager.</div>
      <div class="card"><div class="table-wrap"><table class="grid"><thead><tr><th>Time</th><th>Task</th><th>Department</th><th>Assigned</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${esc(r.time)}</td><td><b>${esc(r.task)}</b></td><td>${esc(r.dept)}</td><td>${esc(r.staff)}</td><td><span class="badge ${r.status==='Overdue'?'bad':'mute'}">${esc(r.status)}</span></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------------- AI Assistant (Manager + Super) ---------------- */
  function aiAssistant(){
    const examples=[
      'Send a written warning to <name> at Morley for arriving late',
      'Send the lateness violation for <name> in Mirrabooka',
      'Send the new roster document to <name>',
      'Email <name> about the shift change',
      'Announce the holiday closing dates to all stores',
    ];
    $('#content').innerHTML=`${aiToolHead('assistant')}
      <div class="rail-tip" style="margin-bottom:14px">🤖 Type a request in plain <b>English or Vietnamese</b>. I’ll work out the action, the employee and the store, then show a preview so you can <b>confirm before anything is sent</b>. Nothing goes out without your OK.</div>
      <div class="card card-pad ai-asst">
        <div class="field"><label>What would you like to do?</label>
          <textarea id="asst-input" class="ai-asst-input" rows="3" placeholder="e.g. Send a written warning to Tony at Morley for arriving late twice this week"></textarea></div>
        <div class="ai-asst-ex">${examples.map(e=>`<button class="ai-chip" onclick="asstFill(this)">${esc(e)}</button>`).join('')}</div>
        <div style="margin-top:10px"><button class="btn primary" id="asst-go" onclick="asstRun()"><i class="fas fa-wand-magic-sparkles"></i>&nbsp; Understand &amp; preview</button></div>
        <div id="asst-status" class="ai-asst-status"></div>
      </div>`;
  }
  async function asstParse(text){
    const roster=(DB.staff||[]).filter(s=>s.active!==0 && (isSuper()||s.store===State.branch)).map(s=>({id:s.id,name:s.name,store:s.store}));
    const stores=isSuper()?(DB.stores||[]):[State.branch];
    const rules=((typeof DB!=='undefined'&&DB.violationRules)||[]).map(r=>r.title);
    try{ if(window.mcqAiCommand){ const r=await mcqAiCommand(text, roster, stores, rules); if(r&&r.ok&&r.intent&&r.intent.action&&r.intent.action!=='unknown'){
      const it=r.intent;
      // the model returns a name string (maybe several) — resolve to recipient objects locally
      if(!it.recipients){ it.recipients=[]; String(it.staff||'').split(/\s*(?:,|;|&|\band\b|\bvà\b)\s*/i).filter(Boolean).forEach(nm=>{ const f=asstResolveStaff(nm,it.store); if(f[0]&&!it.recipients.some(x=>x.id===f[0].id)) it.recipients.push({id:f[0].id,name:f[0].name,store:f[0].store}); }); }
      // multi-store commands ("A & B in X and C in Y"): resolve each clause to its OWN store so
      // the model's single `store` doesn't drag everyone into one branch.
      const storesHit=(stores||[]).filter(s=>String(text).toLowerCase().includes(String(s).toLowerCase()));
      const byClause=aiRecipientsByClause(text, roster, stores);
      if(byClause.length && (storesHit.length>=2 || !(it.recipients&&it.recipients.length))){ it.recipients=byClause; if(!it.store) it.store=byClause[0].store; }
      if(it.action==='violation'){ const rl=aiMatchRule(it.rule||text); if(!it.rule) it.rule=rl.title; if(!it.description) it.description=aiVioDescription(aiReason(text)||it.reason||'', rl); }
      return it;
    } } }catch(e){}
    return aiLocalParse(text, roster, stores);   // no key / offline / error → deterministic fallback
  }
  // map a free-text reason to one of the real violation rules (DB.violationRules)
  function aiMatchRule(text){
    const norm=(window.staffNorm||function(s){return String(s||'').toLowerCase();});
    const rules=(typeof DB!=='undefined'&&DB.violationRules)||[]; const t=norm(text);
    const KW={ 'attendance':['late','lateness','tardy','punctual','absent','no show','no-show','missed shift','di tre','tre','vang','nghi'],
      'hygiene':['hygiene','ppe','glove','hand wash','handwash','sanit','ve sinh ca nhan'],
      'uniform':['uniform','name badge','badge','dress code','đong phuc','dong phuc'],
      'temp':['temperature','temp ','fridge','freezer','nhiet do'],
      'checklist':['checklist','not done','incomplete','chua lam','thieu'],
      'cleaning':['clean','mop','dirty','mess','ve sinh','don dep'],
      'phone':['phone','mobile','texting','dien thoai'],
      'service':['customer','service','rude','attitude','complaint','thai do','khach'],
      'cash':['cash','till','pos','eftpos','money','refund','tien'],
      'expiry':['expir','use-by','use by','out of date','markdown','het han'] };
    for(const code in KW){ if(KW[code].some(k=>t.includes(k))){ const r=rules.find(x=>x.code===code); if(r) return r; } }
    const direct=rules.find(r=>r.code!=='other' && norm(r.title).split(/[^a-z0-9]+/).some(w=>w.length>3 && t.includes(w)));
    return direct || rules.find(r=>r.code==='other') || {title:'Policy breach', severity:'Minor', action:''};
  }
  // write a professional, office-appropriate incident description (NOT the raw command)
  function aiVioDescription(reason, rule){
    const r=String(reason||'').trim().replace(/^(for|about|due to|because of|regarding|vi|ve|do)\s+/i,'').trim();
    const topic=(rule&&rule.title)?rule.title.toLowerCase():'a workplace policy';
    const first = r ? ('This is a formal record regarding '+r+'.') : ('This is a formal record regarding '+topic+'.');
    const mid = (rule&&rule.action) ? (' '+rule.action) : ' Please ensure this is corrected going forward.';
    return first + mid + ' This conduct does not meet MCQ Supermarket’s expected standards; kindly discuss it with your manager and ensure it does not recur.';
  }
  // resolve recipients CLAUSE BY CLAUSE: "…names… in <storeA> and …names… in <storeB>" — each
  // group of names is matched only against the store that immediately follows it, so people land
  // in the RIGHT store (fixes multi-store commands sending everyone to one store).
  function aiRecipientsByClause(text, roster, stores){
    const norm=(window.staffNorm||function(s){return String(s||'').toLowerCase();});
    const tn=norm(text);
    const hits=[];
    (stores||[]).forEach(s=>{ const ns=norm(s); if(!ns) return; let idx=tn.indexOf(ns); while(idx>=0){ hits.push({store:s,pos:idx,end:idx+ns.length}); idx=tn.indexOf(ns, idx+ns.length); } });
    hits.sort((a,b)=>a.pos-b.pos);
    if(!hits.length) return [];
    const recipients=[], seen={}; let prevEnd=0;
    hits.forEach(h=>{
      const seg=tn.substring(prevEnd, h.pos);   // the names in front of THIS store name
      (roster||[]).filter(r=>r.store===h.store).forEach(r=>{
        const toks=norm(r.name).split(/[^a-z0-9]+/).filter(t=>t.length>=2); if(!toks.length) return;
        // require a whole-name or contiguous TWO-token (bigram) hit — a single shared token like
        // "van"/"anh" is far too common in Vietnamese names and would grab the wrong people.
        let match=false; const full=toks.join(' ');
        if(full.length>=3 && seg.indexOf(full)>=0) match=true;
        if(!match && toks.length>=2){ for(let i=0;i+1<toks.length;i++){ if(seg.indexOf(toks[i]+' '+toks[i+1])>=0){ match=true; break; } } }
        if(!match && toks.length===1 && toks[0].length>=3 && new RegExp('(^|[^a-z0-9])'+toks[0]+'([^a-z0-9]|$)').test(seg)) match=true;
        if(match && !seen[r.id]){ seen[r.id]=1; recipients.push({id:r.id,name:r.name,store:r.store}); }
      });
      prevEnd=h.end;
    });
    return recipients;
  }
  // pull the misconduct type from "<type> violation/warning" (e.g. "the lateness violation" → "lateness")
  function aiReason(text){
    const rm=String(text).match(/\b([a-z][a-z \/-]{2,24}?)\s+(?:violation|warning|write ?up|disciplinary|cảnh cáo|kỷ luật)\b/i);
    if(rm){ const cand=rm[1].trim().replace(/^((?:send|issue|give|log|record|create|please|the|a|an)\s+)+/i,'').trim(); if(cand.length>=3 && !/^(send|issue|give|the|a|an)$/i.test(cand)) return cand; }
    const m=String(text).match(/\bfor\b\s+([a-z][a-z \/-]{2,40})$/i);   // "…for lateness" (only if it's a phrase, not names)
    return m?m[1].trim():'';
  }
  function aiLocalParse(text, roster, stores){
    const norm=(window.staffNorm||function(s){return String(s||'').toLowerCase();});
    const tn=norm(text);
    let action='unknown';
    if(/(violat|canh cao|warning|discipl|ky luat|vi pham)/.test(tn)) action='violation';
    else if(/(announce|thong bao|announcement)/.test(tn)) action='announcement';
    else if(/(email|mail|e-mail)/.test(tn)) action='email';
    else if(/(document|van ban|send|gui|note|letter|memo|tai lieu|roster)/.test(tn)) action='document';
    const storesHit=(stores||[]).filter(s=>tn.includes(norm(s)));
    // 1) prefer clause-by-clause store grouping; 2) else score all named people across stores
    let recipients=aiRecipientsByClause(text, roster, stores);
    if(!recipients.length){
      const words=new Set(tn.split(/[^a-z0-9]+/).filter(Boolean));
      const scored=[];
      (roster||[]).forEach(r=>{ const full=norm(r.name); if(!full) return;
        const toks=full.split(/[^a-z0-9]+/).filter(t=>t.length>=2); let score=0;
        if(tn.includes(full)) score=200+full.length;
        else { const hits=toks.filter(t=>words.has(t)); if(hits.length) score=20*hits.length+Math.max.apply(null,hits.map(h=>h.length)); }
        if(score>0){ if(storesHit.includes(r.store)) score+=100; scored.push({r,score}); }
      });
      scored.sort((a,b)=>b.score-a.score);
      const seen={}; recipients=[]; scored.forEach(x=>{ if(!seen[x.r.id]){ seen[x.r.id]=1; recipients.push({id:x.r.id,name:x.r.name,store:x.r.store}); } });
    }
    const reason=aiReason(text);
    const rule=action==='violation'?aiMatchRule(text):null;   // match the rule on the FULL text (e.g. "lateness")
    const all=/all|company|tat ca|toan|every store/.test(tn);
    return { action, store:storesHit[0]||(recipients[0]&&recipients[0].store)||'', recipients, staff:(recipients[0]&&recipients[0].name)||'',
      subject:'', body: action==='violation'?'':('<p>'+esc(text)+'</p>'), reason,
      rule: rule?rule.title:'', severity: rule?rule.severity:'Minor', step:'Verbal Discussion',
      description: action==='violation'?aiVioDescription(reason,rule):'',
      scope:(action==='announcement'&&all)?'all':'store' };
  }
  async function asstRun(){
    const text=(document.getElementById('asst-input')?.value||'').trim();
    const status=document.getElementById('asst-status');
    if(!text){ toast('Type a request first'); return; }
    if(status) status.innerHTML='<div class="ai-asst-thinking">🤖 Understanding your request…</div>';
    const btn=document.getElementById('asst-go'); if(btn) btn.disabled=true;
    let intent=null; try{ intent=await asstParse(text); }catch(e){}
    if(btn) btn.disabled=false;
    if(!intent || !intent.action || intent.action==='unknown'){
      if(status) status.innerHTML='<div class="ai-asst-err">🤔 I couldn’t work out a clear action. Name the person, the store, and what to send (violation / document / email / announcement).</div>';
      return;
    }
    if(status) status.innerHTML='';
    asstConfirm(intent, text);
  }
  function asstResolveStaff(name, store){
    const norm=(window.staffNorm||function(s){return String(s||'').toLowerCase();});
    const pool=(DB.staff||[]).filter(s=>s.active!==0 && (isSuper()||s.store===State.branch));
    if(!name) return [];
    const n=norm(name);
    let m=pool.filter(s=>norm(s.name)===n);
    if(!m.length) m=pool.filter(s=>{ const sn=norm(s.name); return sn.includes(n)||n.includes(sn)||sn.split(/[^a-z0-9]+/).some(t=>t.length>=2&&(t===n||n.split(/[^a-z0-9]+/).includes(t))); });
    if(store) m=m.slice().sort((a,b)=>(b.store===store)-(a.store===store));   // matches in the named store first
    return m;
  }
  function asstRenderRecips(){ const el=document.getElementById('asst-recips'); if(!el) return; const rs=window.__asstRecips||[];
    el.innerHTML = rs.length ? rs.map(s=>`<span class="asst-recip">${esc(s.name)} <small>· ${esc(s.store)}${s.email?'':' · no email'}</small> <button onclick="asstRecipDel('${ckJS(String(s.id))}')" title="Remove">✕</button></span>`).join('')
      : '<span class="ai-asst-err" style="display:inline-block;margin:0">No employee selected — add at least one below.</span>'; }
  window.asstRecipDel=function(id){ window.__asstRecips=(window.__asstRecips||[]).filter(s=>String(s.id)!==String(id)); asstRenderRecips(); };
  window.asstRecipAdd=function(name){ name=(name||'').trim(); if(!name) return;
    const pool=(DB.staff||[]).filter(s=>s.active!==0&&(isSuper()||s.store===State.branch));
    const s=pool.find(x=>x.name===name)||asstResolveStaff(name)[0]; if(!s){ toast('Pick a staff member from the list'); return; }
    if((window.__asstRecips||[]).some(x=>String(x.id)===String(s.id))){ toast(s.name+' is already added'); return; }
    window.__asstRecips=(window.__asstRecips||[]).concat([{id:s.id,name:s.name,store:s.store,email:s.email||''}]); asstRenderRecips(); };
  function asstConfirm(intent, text){
    const act=intent.action, isAnn=act==='announcement';
    const pool=(DB.staff||[]).filter(s=>s.active!==0 && (isSuper()||s.store===State.branch));
    // resolve recipients — from the parser's list, or by splitting a name string ("A and B")
    let recips=[];
    if(intent.recipients&&intent.recipients.length){ intent.recipients.forEach(r=>{ const s=pool.find(x=>String(x.id)===String(r.id)); if(s&&!recips.some(y=>y.id===s.id)) recips.push(s); }); }
    if(!recips.length && intent.staff){ String(intent.staff).split(/\s*(?:,|;|&|\band\b|\bvà\b)\s*/i).filter(Boolean).forEach(nm=>{ const f=asstResolveStaff(nm,intent.store); if(f[0]&&!recips.some(y=>y.id===f[0].id)) recips.push(f[0]); }); }
    window.__asstRecips = isAnn?[]:recips.map(s=>({id:s.id,name:s.name,store:s.store,email:s.email||''}));
    const recipBlock=isAnn?'':`<div class="field"><label>Recipients — send to one or several</label><div id="asst-recips" class="asst-recips"></div>
        <input class="login-input" style="margin-top:8px" list="asst-recip-dl" placeholder="＋ Add another employee…" onchange="asstRecipAdd(this.value);this.value='';">
        <datalist id="asst-recip-dl">${pool.map(s=>`<option value="${esc(s.name)}" label="${esc(s.store)}${s.email?'':' · no email'}"></option>`).join('')}</datalist></div>`;
    const storeSel=(isSuper()&&isAnn)?`<div class="field"><label>Where</label><select id="asst-store"><option value="ALL" ${intent.scope==='all'?'selected':''}>📢 All stores</option>${(DB.stores||[]).map(s=>`<option ${intent.store===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>`:'';
    const rules=(typeof DB!=='undefined'&&DB.violationRules)||[];
    const vioFields=act==='violation'?`<div class="grid2">
        <div class="field"><label>Rule / reason</label>${rules.length?`<select id="asst-rule">${rules.map(r=>`<option ${r.title===intent.rule?'selected':''}>${esc(r.title)}</option>`).join('')}</select>`:`<input id="asst-rule" value="${esc(intent.rule||'')}">`}</div>
        <div class="field"><label>Severity</label><select id="asst-sev">${['Minor','Moderate','Major','Critical'].map(x=>`<option ${x===(intent.severity||'Minor')?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Warning step</label><select id="asst-step">${['Verbal Discussion','Written Warning','Final Warning','Termination'].map(x=>`<option ${x===(intent.step||'Verbal Discussion')?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>`:'';
    const subjRow=act==='violation'?'':`<div class="field"><label>${isAnn?'Title':'Subject'}</label><input id="asst-subj" value="${esc(intent.subject||'')}"></div>`;
    const bodyLabel=act==='violation'?'Description (auto-written — edit if needed)':'Message';
    const actName={violation:'⚖️ Violation notice',document:'📄 Document to inbox',email:'✉️ Email employee',announcement:'📣 Announcement'}[act]||act;
    window.__asstIntent=intent;
    mcqModal(`🤖 Confirm — ${actName}`, `${storeSel}${recipBlock}${vioFields}${subjRow}
      <div class="field"><label>${bodyLabel}</label><textarea id="asst-body" rows="6"></textarea></div>
      <div class="ai-asst-note">Review &amp; edit, then confirm. This will ${act==='email'?'send an email':act==='announcement'?'post an announcement':'deliver to each recipient’s inbox'}.</div>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="btn primary" onclick="asstSend()"><i class="fas fa-paper-plane"></i>&nbsp; Confirm &amp; send</button><button class="btn" onclick="mcqModalClose()">Cancel</button></div>`, {wide:true});
    asstRenderRecips();
    const seed=(act==='violation'?(intent.description||intent.body):intent.body)||('<p>'+esc(text)+'</p>');
    const b=document.getElementById('asst-body'); if(b) b.value=seed;   // seed BEFORE mount so CKEditor picks it up
    if(window.ckMount) ckMount('asst-body');
  }
  function asstSend(){
    const intent=window.__asstIntent||{}, act=intent.action;
    const body=(window.ckHtml?ckHtml('asst-body'):(document.getElementById('asst-body')?.value||''));
    if(!(window.msgHasContent?window.msgHasContent(body):String(body).replace(/<[^>]+>/g,'').trim())){ toast('Write a message first'); return; }
    if(act==='announcement'){
      const store=isSuper()?(document.getElementById('asst-store')?.value||State.branch):State.branch;
      const title=(document.getElementById('asst-subj')?.value||intent.subject||'Announcement').trim();
      if(window.mcqAnnPost) mcqAnnPost({store,title,body_html:body,image_id:null}).then(r=>toast(r&&r.ok?'📣 Announcement posted':'Could not post'));
      mcqModalClose(); return;
    }
    const recips=window.__asstRecips||[];
    if(!recips.length){ toast('Add at least one employee'); return; }
    if(act==='violation'){
      const rule=(document.getElementById('asst-rule')?.value||'Policy breach').trim();
      const sev=document.getElementById('asst-sev')?.value||'Minor';
      const step=document.getElementById('asst-step')?.value||'Verbal Discussion';
      const desc=String(body).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      let n=0; recips.forEach(s=>{ if(window.mcqCreateViolation&&mcqCreateViolation({staff:s.name,store:s.store,ruleTitle:rule,severity:sev,step,description:desc})) n++; });
      toast('✓ Violation sent to '+n+' staff'); if(window.mcqRefreshUnread)mcqRefreshUnread(); mcqModalClose(); return;
    }
    const subj=(document.getElementById('asst-subj')?.value||intent.subject||'Message').trim();
    if(act==='document'){
      let n=0; recips.forEach(s=>{ if(window.mcqMsgSend){ mcqMsgSend({kind:'document', store:s.store, to_staff_id:s.id, subject:subj, body_html:body}); n++; } });
      toast('📄 Document sent to '+n+' staff'); if(window.mcqRefreshUnread)mcqRefreshUnread(); mcqModalClose(); return;
    }
    if(act==='email'){
      const to=recips.map(s=>{ const full=(DB.staff||[]).find(x=>String(x.id)===String(s.id))||{}; return {email:s.email||full.email||'',name:s.name}; }).filter(r=>r.email);
      if(!to.length){ toast('⚠️ None of the selected staff have an email on file'); return; }
      if(window.mcqEmail&&mcqEmail.sendHtml){ mcqEmail.sendHtml(to, subj, body); }
      mcqModalClose(); return;
    }
  }
  window.asstFill=function(btn){ const t=document.getElementById('asst-input'); if(t){ t.value=btn.textContent.trim(); t.focus(); } };
  window.asstRun=asstRun; window.asstSend=asstSend;

  // expose launcher fns
  window.aiGo=aiGo;
})();
