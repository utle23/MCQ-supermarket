/* ============================================================================
   MCQ MASTER APP — the launcher people land on after signing in.

   Two tiles today: Store Checklist (this site, exactly as it already works) and
   MCQ DevOps (the IT work-item system at mcqtask.onrender.com). Nothing else in
   the app moves: Store Checklist opens the ordinary home — the Super dashboard
   or the manager / dept-lead daily home — so every page, filter and store scope
   behaves as it did before.

   The DevOps tile points straight at MCQ DevOps for now. Single sign-on will
   put a signed ticket in front of it, at which point TC_DEVOPS_HREF becomes
   '/go/devops' and nothing else here changes.

   Colours are MCQ DevOps's, so the two apps read as one family: a deep lagoon
   gradient, lime accent, warm paper background.
   ============================================================================ */

const MCQ_DEVOPS_URL = 'https://mcqtask.onrender.com';
const MCQ_DEVOPS_HREF = MCQ_DEVOPS_URL;   // becomes '/go/devops' once SSO is wired

/* Everyone signed in sees both tiles. MCQ DevOps decides for itself who may go
   in and shows its own "You need access" page to anyone who may not. */
function mcqApps(){
  return [
    { id:'checklist', name:'Store Checklist', desc:'Daily store checks, by store',
      icon:'<i class="fas fa-clipboard-check"></i>', go:"go('home')", kind:'here' },
    { id:'devops', name:'MCQ DevOps', desc:'IT work items, issues and fixes',
      icon:'<i class="fas fa-screwdriver-wrench"></i>', href:MCQ_DEVOPS_HREF, kind:'away' },
  ];
}

function mcqGreeting(){
  try{
    const h=(typeof perthNow==='function'?perthNow():new Date()).getHours();
    return h<12 ? 'Good morning' : h<18 ? 'Good afternoon' : 'Good evening';
  }catch(e){ return 'Welcome'; }
}
/* the person's own name, and the store they work in — head office has none */
function mcqWho(){
  const a=(window.State&&State.account)||{};
  const name=String(a.staffName||a.name||'').trim();
  const first=name.split(/[\s,]+/)[0]||name;
  let where=a.branch||'';
  if(!where || where==='All stores') where = (a.role==='super'||a.role==='ba') ? 'Head Office' : '';
  return { first, full:name, where };
}

function renderLauncher(){
  const who=mcqWho(), apps=mcqApps();
  try{ setAccent('#0c4f6b'); }catch(e){}
  try{ setCrumb('▦','MCQ Master App', who.where ? ('Signed in as '+who.full+(who.where?' · '+who.where:'')) : 'Choose an app'); }catch(e){}

  const tiles = apps.map(a=>{
    const open = a.kind==='away'
      ? `onclick="mcqOpenApp('${a.id}')"`
      : `onclick="${a.go}"`;
    return `<button class="mcq-tile mcq-tile-${a.id}" ${open} aria-label="Open ${esc(a.name)}">
        <span class="mcq-tile-ic">${a.icon}</span>
        <span class="mcq-tile-body">
          <span class="mcq-tile-name">${esc(a.name)}</span>
          <span class="mcq-tile-desc">${esc(a.desc)}</span>
        </span>
        <span class="mcq-tile-go">${a.kind==='away'?'<i class="fas fa-arrow-up-right-from-square"></i>':'<i class="fas fa-arrow-right"></i>'}</span>
      </button>`;
  }).join('');

  $('#content').innerHTML = `
    <section class="mcq-launcher">
      <div class="mcq-hero">
        <div class="mcq-hero-brand">
          <img src="assets/mcq-logo-exact.png" alt="MCQ" class="mcq-hero-logo">
          <span class="mcq-hero-sub">MCQ International</span>
        </div>
        <h1 class="mcq-hero-h">${esc(mcqGreeting())}${who.first?(', '+esc(who.first)):''}</h1>
        <p class="mcq-hero-p">${who.where?esc(who.where)+' · ':''}Choose an app to get started.</p>
      </div>
      <div class="mcq-tiles">${tiles}</div>
      <p class="mcq-foot">Signed in once here — your apps open without another password.</p>
    </section>`;
  try{ window.scrollTo(0,0); }catch(e){}
}
window.renderLauncher = renderLauncher;

/* An app on another site opens in this tab, the way a launcher tile should.
   Kept in one place so wiring single sign-on later is a one-line change. */
function mcqOpenApp(id){
  const app=mcqApps().find(a=>a.id===id);
  if(!app) return;
  if(app.kind!=='away'){ try{ eval(app.go); }catch(e){} return; }
  try{ toast('Opening '+app.name+'…'); }catch(e){}
  try{ location.href=app.href; }catch(e){ try{ window.open(app.href,'_self'); }catch(_){} }
}
window.mcqOpenApp = mcqOpenApp;
