/* ============================================================================
   MCQ MASTER APP — the launcher, and the app switcher that sits in both apps.

   The launcher is the first screen after signing in: full bleed, no checklist
   chrome, just the two apps. Everything MCQ Supermarket does lives one level
   down, inside Store Checklist — nothing was removed or changed, it is simply
   reached by pressing that tile (or by a deep link, which still opens its page
   directly).

   The 9-dot switcher is the same control MCQ DevOps carries, so moving between
   the two apps feels like one product.

   Palette is MCQ DevOps's: lagoon gradient under radial lights, lime accent.
   ============================================================================ */

const MCQ_DEVOPS_URL  = 'https://mcqtask.onrender.com';
const MCQ_DEVOPS_HREF = '/go/devops';     // mints a signed ticket, then posts it to MCQ DevOps

function mcqApps(){
  return [
    { id:'checklist', name:'Store Checklist', desc:'Daily store checks, by store',
      icon:'<i class="fas fa-clipboard-check"></i>', kind:'here', go:'home' },
    { id:'devops', name:'MCQ DevOps', desc:'IT work items, issues and fixes',
      icon:'<i class="fas fa-screwdriver-wrench"></i>', kind:'away', href:MCQ_DEVOPS_HREF },
  ];
}
/* which app the person is looking at right now */
function mcqCurrentApp(){
  try{ return (State.route && State.route.mod==='apps') ? '' : 'checklist'; }catch(e){ return ''; }
}

function mcqGreeting(){
  try{
    const h=(typeof perthNow==='function'?perthNow():new Date()).getHours();
    return h<12 ? 'Good morning' : h<18 ? 'Good afternoon' : 'Good evening';
  }catch(e){ return 'Welcome'; }
}
function mcqToday(){
  try{
    const d=(typeof perthNow==='function'?perthNow():new Date());
    return d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }catch(e){ return ''; }
}
function mcqWho(){
  const a=(window.State&&State.account)||{};
  const name=String(a.staffName||a.name||'').trim();
  const first=name.split(/[\s,]+/)[0]||name;
  let where=a.branch||'';
  if(!where || where==='All stores') where = (a.role==='super'||a.role==='ba') ? 'Head Office' : '';
  const initials=(a.initials||name.slice(0,2)||'?').toString().slice(0,2).toUpperCase();
  return { first, full:name||'there', where, initials };
}

/* ------------------------------------------------------------- the launcher */
function renderLauncher(){
  const who=mcqWho(), apps=mcqApps();
  try{ document.body.classList.add('on-launcher'); }catch(e){}
  try{ setCrumb('▦','MCQ Master App', who.where||'Choose an app'); }catch(e){}

  const cards = apps.map((a,i)=>`
    <button class="mcqL-card mcqL-${a.id}" style="--d:${i*90}ms"
            onclick="mcqOpenApp('${a.id}')" aria-label="Open ${esc(a.name)}">
      <span class="mcqL-ic">${a.icon}</span>
      <span class="mcqL-name">${esc(a.name)}</span>
      <span class="mcqL-desc">${esc(a.desc)}</span>
      <span class="mcqL-open">Open <i class="fas fa-arrow-right"></i></span>
    </button>`).join('');

  $('#content').innerHTML = `
    <div class="mcqL" role="main">
      <div class="mcqL-bg" aria-hidden="true"><span class="mcqL-orb o1"></span><span class="mcqL-orb o2"></span></div>

      <header class="mcqL-top">
        <div class="mcqL-brand">
          <span class="mcqL-logo"><img src="assets/mcq-logo-exact.png" alt="MCQ"></span>
          <span class="mcqL-title">MCQ Master App</span>
        </div>
        <div class="mcqL-user">
          <span class="mcqL-av" aria-hidden="true">${esc(who.initials)}</span>
          <span class="mcqL-uname">${esc(who.full)}</span>
          <button class="mcqL-out" onclick="logout()">Sign out</button>
        </div>
      </header>

      <section class="mcqL-hero">
        <p class="mcqL-eyebrow">MCQ SUPERMARKET${who.where?(' · '+esc(who.where)):''}</p>
        <h1 class="mcqL-h1">${esc(mcqGreeting())}${who.first?(', '+esc(who.first)):''}</h1>
        <p class="mcqL-sub">${esc(mcqToday())}</p>
      </section>

      <section class="mcqL-cards">${cards}</section>

      <p class="mcqL-foot">MCQ Supermarket · All apps</p>
    </div>`;
  try{ window.scrollTo(0,0); }catch(e){}
}
window.renderLauncher = renderLauncher;

/* Opening an app. The checklist is this site, so it is a route change; MCQ
   DevOps is another site, reached through /go/devops which mints the ticket. */
function mcqOpenApp(id){
  const app=mcqApps().find(a=>a.id===id);
  if(!app) return;
  mcqSwitcherClose();
  if(app.kind!=='away'){ try{ go(app.go); }catch(e){} return; }
  try{ toast('Opening '+app.name+'…'); }catch(e){}
  try{ location.href=app.href; }catch(e){ try{ window.open(app.href,'_self'); }catch(_){} }
}
window.mcqOpenApp = mcqOpenApp;

/* --------------------------------------------------------- the app switcher */
/* The same 9-dot control MCQ DevOps carries, in the same place, so the two
   apps feel like one product. Lives in the Store Checklist header. */
function mcqWaffleHTML(){
  return `<button class="mcq-waffle" id="mcq-waffle-btn" onclick="mcqSwitcherToggle(event)"
      aria-haspopup="true" aria-expanded="false" aria-label="MCQ apps" title="MCQ apps">
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    </button>`;
}
function mcqSwitcherToggle(e){
  if(e){ e.stopPropagation(); }
  const open=document.getElementById('mcq-switcher');
  if(open){ mcqSwitcherClose(); return; }
  const here=mcqCurrentApp();
  const rows=mcqApps().map(a=>{
    const cur=(a.id===here);
    return `<button class="mcq-sw-row ${cur?'cur':''} mcqL-${a.id}" onclick="mcqOpenApp('${a.id}')">
        <span class="mcq-sw-ic">${a.icon}</span>
        <span class="mcq-sw-body"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
        ${cur?'<span class="mcq-sw-here">You are here</span>':''}
      </button>`;
  }).join('');
  const el=document.createElement('div');
  el.id='mcq-switcher'; el.className='mcq-switcher'; el.setAttribute('role','menu');
  el.innerHTML=`<div class="mcq-sw-h">MCQ APPS</div>${rows}
    <button class="mcq-sw-all" onclick="mcqOpenApp2apps()"><i class="fas fa-table-cells-large"></i> All apps</button>`;
  document.body.appendChild(el);
  const btn=document.getElementById('mcq-waffle-btn');
  if(btn){ btn.setAttribute('aria-expanded','true');
    try{ const r=btn.getBoundingClientRect();
      el.style.top=(r.bottom+8)+'px';
      el.style.left=Math.max(10, Math.min(r.left, window.innerWidth-300))+'px';
    }catch(_){} }
  setTimeout(()=>{ document.addEventListener('click', mcqSwitcherClose, {once:true}); }, 0);
}
function mcqSwitcherClose(){
  const el=document.getElementById('mcq-switcher'); if(el) el.remove();
  const btn=document.getElementById('mcq-waffle-btn'); if(btn) btn.setAttribute('aria-expanded','false');
}
function mcqOpenApp2apps(){ mcqSwitcherClose(); try{ go('apps'); }catch(e){} }
window.mcqWaffleHTML=mcqWaffleHTML; window.mcqSwitcherToggle=mcqSwitcherToggle;
window.mcqSwitcherClose=mcqSwitcherClose; window.mcqOpenApp2apps=mcqOpenApp2apps;
