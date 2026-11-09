/* Shared Node harness: loads the real client scripts with browser stubs.
   Used by the *_client.js suites in this folder. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
global.window=global;
global.addEventListener=()=>{}; global.removeEventListener=()=>{};
const _ls={};
global.localStorage={getItem:k=>(k in _ls?_ls[k]:null),setItem:(k,v)=>{_ls[k]=String(v);},removeItem:k=>{delete _ls[k];},clear:()=>{for(const k in _ls)delete _ls[k];}};
const elStub=()=>({style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];},textContent:'',innerHTML:''});
global.document={addEventListener(){},removeEventListener(){},createElement:elStub,head:elStub(),body:elStub(),
  getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},activeElement:null,visibilityState:'visible'};
global.navigator={onLine:true,userAgent:'node'};
global.location={origin:'http://localhost',pathname:'/',href:'http://localhost/',hash:''};
global.fetch=async()=>({ok:true,status:200,json:async()=>({}),blob:async()=>({}),text:async()=>''});
global.URL.createObjectURL=()=>'blob:stub'; global.URL.revokeObjectURL=()=>{};
global.indexedDB=undefined;
global.alert=()=>{}; global.confirm=()=>true; global.toast=()=>{};
global.requestAnimationFrame=cb=>setTimeout(cb,0);
global.$=()=>null;
function load(f){ vm.runInThisContext(fs.readFileSync(path.join(ROOT,f),'utf8'),{filename:f}); }
load('assets/data.js'); load('assets/hr-data.js'); load('assets/pages.js');
global.State={account:{role:'admin',branch:'Morley',name:'Test'},role:'store',branch:'Morley',route:{mod:'home',tab:null},charts:[]};
global.isAdmin=()=>State.account&&(State.account.role==='admin'||State.account.role==='super');
global.isSuper=()=>State.account&&State.account.role==='super';
global.isBa=()=>State.account&&State.account.role==='ba';
global.auditLog=()=>{}; global.persist=()=>{};
global.makeRecordId=(p,s)=>p+'-'+s+'-'+Math.random().toString(36).slice(2,6);
load('assets/firebase.js');
module.exports={load, ROOT};
