/* ============================================================================
   MCQ — Demo store sample data (presentations).
   Builds a rich, REALISTIC dataset for the isolated "Demo" store: staff copied
   from Mirrabooka, operational records across every register, and many submitted
   checklists (a mix of pending + verified). Everything is tagged store:'Demo'
   so it never touches the 8 real stores. Idempotent: inject() is a no-op once the
   Demo data is already present (locally or loaded back from the server).
   ============================================================================ */
(function(){
  var STORE='Demo';
  function has(){ try{ return (DB.checklistSubs||[]).some(function(s){return s.store===STORE;})
      || (DB.staff||[]).some(function(s){return s.store===STORE;}); }catch(e){ return false; } }
  function rnd(n){ return Math.floor(Math.random()*n); }
  function pick(a){ return a&&a.length?a[rnd(a.length)]:''; }
  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function daysAgo(n){ var d=new Date(); d.setDate(d.getDate()-n); return d; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  /* ---- realistic content pools per register ---- */
  var SUMMARIES={
    complaint:['Customer said the strawberries were mouldy at the bottom of the punnet.',
      'Price at the shelf did not match the price at the register on canned tomatoes.',
      'Customer felt the cashier was abrupt during a busy period.',
      'Spilled liquid near aisle 4 was not cleaned up quickly enough.',
      'Out of the advertised special (chicken thigh) by mid-morning.',
      'Bread on the shelf was past its best-before date.',
      'Customer unhappy with the wait time at the deli counter.',
      'Google review: great produce but checkout queues too long on weekends.'],
    maintenance:['Cool room #2 compressor making a loud noise — needs technician.',
      'Freezer door seal in the back room is torn and not sealing.',
      'Flickering light tube above checkout 3.',
      'Trolley bay gate hinge broken in the car park.',
      'Leaking tap in the staff kitchen.',
      'Weighing scale at the FV section reads inconsistently.',
      'Automatic front door slow to open — sensor check needed.',
      'Air conditioning not cooling the grocery aisles properly.'],
    incident:['Staff member slipped on a wet floor near the dairy fridge — first aid given.',
      'Customer reported a near-miss with a stacking trolley in aisle 2.',
      'Minor knife cut at the butcher prep bench — bandaged, logged.',
      'Box fell from the top shelf in the back room, no injury.',
      'Forklift came close to a pedestrian in the loading dock.',
      'Broken glass jar in aisle 6 cleaned up and isolated.'],
    delivery:['Morning grocery delivery received and checked against the invoice.',
      'Fruit & veg delivery — 2 crates short, noted on the docket.',
      'Frozen delivery temperature checked on arrival, within range.',
      'Butcher delivery received, crates returned to the driver.',
      'Afternoon top-up delivery for weekend specials.'],
    violation:['Staff member clocked in 20 minutes late without notice.',
      'PPE (cut glove) not worn at the butcher section.',
      'Mobile phone use on the shop floor during shift.',
      'Did not follow the cash-handling procedure at close.',
      'Uniform standard not met — verbal reminder given.'],
    issue:['Request to reorder shelf labels for the new promo.',
      'Suggestion to move the bread stand closer to the entrance.',
      'Back-room shelving needs reorganising for safety.',
      'Need more training on the new POS refund flow.'],
    reward:['Great customer service during a busy weekend — nominated by supervisor.',
      'Helped a new starter settle in and learn the FV section.',
      'Spotted and fixed a fridge temperature issue early.'],
    training:['Food safety refresher completed.','Manual handling training session.',
      'New POS system walkthrough.','Fire & evacuation drill briefing.'],
    raise:['Annual review — proposed pay adjustment for strong performance.',
      'Moving from casual to part-time with a rate review.'],
    birthday:['Team birthday — cake in the staff room.','Work anniversary celebration.']
  };
  var STATUS_WEIGHT={
    complaint:['Open','Open','Closed'], maintenance:['Submitted','In Progress','Completed','Store Confirmed'],
    incident:['Open','Under Review','Closed'], delivery:['Submitted','Reviewed','Corrected'],
    violation:['Open','Under Review','Closed']
  };

  function fillField(f, idx){
    if(f.key==='store') return STORE;
    var t=f.type||'text';
    if(t==='select'||t==='radio'){ var o=(f.options||[]).filter(function(x){return x&&x!=='All stores';}); return o.length?pick(o):''; }
    if(t==='checks'){ var os=(f.options||[]); return os.length?pick(os):''; }
    if(t==='checkbox') return Math.random()<0.7;
    if(t==='number') return String(1+rnd(12));
    if(t==='date') return ymd(daysAgo(rnd(20)));
    if(t==='time'){ return pad(6+rnd(12))+':'+pick(['00','15','30','45']); }
    if(t==='staffadd') return pick((f.options||['Driver']));
    // text / textarea → plausible short text from the label
    return '';
  }

  function buildRecords(){
    var out={};
    var mods=['complaint','maintenance','incident','delivery','violation','issue','reward','training','raise','birthday'];
    var staffNames=(DB.staff||[]).filter(function(s){return s.store===STORE;}).map(function(s){return s.name;});
    if(!staffNames.length) staffNames=['Jordan Lee','Sam Tran','Alex Nguyen','Priya Shah','Minh Vo'];
    mods.forEach(function(mid){
      var m=DB.modules&&DB.modules[mid]; if(!m||!m.form) return;
      var n=6+rnd(4); var recs=[];
      for(var k=0;k<n;k++){
        var obj={}; (m.form.sections||[]).forEach(function(sec){ (sec.fields||[]).forEach(function(f){ var v=fillField(f); if(v!=='' && v!=null && v!==false) obj[f.key]=v; }); });
        obj.store=STORE;
        var desc=pick(SUMMARIES[mid]||['Sample record for demonstration.']);
        // put the description into whatever the module's main text field is
        ['shortDescription','issueDescription','description','whatHappened','caseDetails','details','reason','note','notes','summary'].forEach(function(key){
          (m.form.sections||[]).forEach(function(sec){ (sec.fields||[]).forEach(function(f){ if(f.key===key && (f.type==='textarea'||f.type==='text')) obj[key]=desc; }); });
        });
        var who=pick(staffNames);
        ['employeeName','staffName','frontlineStaffName','name','nominee','reportedBy'].forEach(function(key){
          (m.form.sections||[]).forEach(function(sec){ (sec.fields||[]).forEach(function(f){ if(f.key===key) obj[key]=who; }); });
        });
        var created=daysAgo(rnd(30));
        var statuses=STATUS_WEIGHT[mid]||m.statuses||['Submitted'];
        var status=pick(statuses);
        var sev=(m.severities&&m.severities.length)?pick(m.severities):(obj.severity||obj.priority||'');
        var age=Math.max(0,Math.round((Date.now()-created.getTime())/86400000));
        var rec=Object.assign({
          id:'DEMO-'+(m.idPrefix||mid.toUpperCase())+'-'+pad(k+1),
          created:ymd(created)+' '+pad(8+rnd(10))+':'+pick(['05','17','29','42','51']),
          store:STORE, status:status,
          severity:obj.severity||sev, priority:obj.priority||sev,
          summary:desc, shortDescription:obj.shortDescription||desc, issue:obj.issueDescription||desc,
          category:obj.category||obj.issueCategory||obj.concernCategory||'',
          equipment:obj.equipmentName||'', type:obj.incidentType||'', employee:who,
          step:obj.step||obj.disciplinaryStep||'', department:obj.department||pick(['Checkout','Grocery','Fruit & Veg','Butcher','Café']),
          followup:obj.followupRequested||'No', age:age
        }, obj);
        recs.push(rec);
      }
      out[mid]=recs;
    });
    return out;
  }

  function buildStaff(){
    var src=(DB.staff||[]).filter(function(s){return s.store==='Mirrabooka' && s.active!==0;});
    if(!src.length) return [];
    return src.map(function(s){ var c=clone(s); c.id='DEMO-'+s.id; c.store=STORE; return c; });
  }

  function subItems(dept,session){
    if(!(DB.checklist&&Array.isArray(DB.checklist.items))||typeof ckItem!=='function') return [];
    return DB.checklist.items.map(function(it,i){ return ckItem(it,i); })
      .filter(function(r){ return (typeof ckStoreOk!=='function'||ckStoreOk(r,STORE)) && r.dept===dept && (typeof ckInSession!=='function'||ckInSession(r,session)); });
  }
  function buildSubs(){
    var depts=((DB.checklist&&DB.checklist.depts)||['MANAGER','CASHIER','FV','GROCERY','FROZEN & DAIRY','BUTCHER']).slice(0,5);
    var sessions=['Opening','Closing'];
    var mgrs=(DB.staff||[]).filter(function(s){return s.store===STORE && /manager|supervisor|admin/i.test((s.role||'')+(s.dept||''));}).map(function(s){return s.name;});
    if(!mgrs.length) mgrs=['Quinn Chen','Store Manager'];
    var staffNames=(DB.staff||[]).filter(function(s){return s.store===STORE;}).map(function(s){return s.name;});
    if(!staffNames.length) staffNames=['Sam Tran','Alex Nguyen'];
    var subs=[];
    for(var off=0; off<7; off++){
      var d=daysAgo(off), ds=ymd(d), dname=d.toLocaleDateString(undefined,{weekday:'long'});
      depts.forEach(function(dept,di){
        sessions.forEach(function(session){
          // skip a few to look natural
          if(Math.random()<0.18) return;
          var rows=subItems(dept,session); if(!rows.length) return;
          var items=rows.map(function(r,ix){
            var done=Math.random()<0.88; var note='';
            var temp=null;
            if(r.meta&&r.meta.temp){ var bad=Math.random()<0.12; var val=bad?(7+Math.random()*3):(1+Math.random()*4);
              temp={value:Math.round(val*10)/10, inRange:!bad, defrosting:false, source:'AI', manual:false}; done=true; }
            if(!done) note=pick(['Not completed — handed to next shift','Item out of stock','Will recheck this afternoon','N/A today']);
            return {task:r.task, area:r.area, done:done, note:note, photos:[], temp:temp};
          });
          var total=items.length, doneN=items.filter(function(i){return i.done;}).length;
          var out=items.filter(function(i){return i.temp&&i.temp.inRange===false;}).length;
          var verified=off>=2;   // recent days pending, older days verified
          var overall=verified?pick(['Good','Good','Good','Need improving','Critical']):'';
          var sub={ id:'DEMO-CKS-'+ds.replace(/-/g,'')+'-'+di+session.charAt(0),
            store:STORE, dept:dept, session:session, date:ds, dayName:dname,
            by:pick(staffNames), responsible:pick(staffNames),
            created:ds+' '+(session==='Opening'?'07:'+pick(['05','22','40']):'20:'+pick(['10','25','48'])),
            progress: total?Math.round(doneN/total*100):0, done:doneN, total:total,
            status: verified?'Verified':'Submitted', tempAlerts:out, items:items };
          if(verified){ sub.verifiedBy=pick(mgrs); sub.verifiedAt=new Date(d.getTime()+3600000).toISOString();
            sub.overallResult=overall;
            sub.issuesFound = overall==='Good'?'' : (out?(out+' temperature reading(s) out of range — '):'')+pick(['Floor near dairy needs attention','Some shelves not fully faced','Date checks incomplete on one aisle']);
            sub.actionResponsible = overall==='Good'?'' : pick(['Cleaner to re-mop — '+pick(staffNames),'Re-check temps in 1h — '+pick(mgrs),'Restock & face shelves — '+pick(staffNames)]);
            sub.verifyNote = overall==='Good'?'All good, well done team.':'Please action the items noted and confirm.';
          }
          subs.push(sub);
        });
      });
    }
    return subs;
  }

  function buildSchedule(){
    var staffNames=(DB.staff||[]).filter(function(s){return s.store===STORE;}).map(function(s){return s.name;});
    if(!staffNames.length) staffNames=['Sam Tran','Alex Nguyen'];
    var tasks=[['cleaning','Deep clean cool room','Cool room'],['cleaning','Mop & sanitise floors','Shop floor'],
      ['maintenance','Check fridge temperatures','Refrigeration'],['cleaning','Clean deli display','Deli'],
      ['maintenance','Test fire exits & lights','Safety'],['cleaning','Sanitise trolleys & baskets','Front']];
    var out=[];
    for(var k=0;k<12;k++){ var d=daysAgo(rnd(21)); var t=pick(tasks);
      out.push({ id:'DEMO-SH-'+pad(k+1), store:STORE, type:t[0], day:d.toLocaleDateString(undefined,{weekday:'short'}),
        date:ymd(d), dept:t[2], task:t[1], staffName:pick(staffNames), photo:null }); }
    return out;
  }

  function inject(){
    try{
      if(typeof DB==='undefined'||!DB.modules) return false;
      if(has()) return false;   // idempotent — already seeded / loaded from server
      var staff=buildStaff(); if(staff.length){ DB.staff=(DB.staff||[]).concat(staff); }
      var recs=buildRecords();
      Object.keys(recs).forEach(function(mid){ if(DB.modules[mid]) DB.modules[mid].records=(DB.modules[mid].records||[]).concat(recs[mid]); });
      var subs=buildSubs(); if(subs.length){ DB.checklistSubs=(DB.checklistSubs||[]).concat(subs); }
      var sched=buildSchedule(); if(sched.length){ DB.scheduleHistory=(DB.scheduleHistory||[]).concat(sched); }
      console.info('[MCQ] Demo store seeded —', staff.length, 'staff,', subs.length, 'checklists');
      return true;
    }catch(e){ console.warn('[MCQ] demo seed failed', e); return false; }
  }

  window.MCQDemo={ inject:inject, has:has, STORE:STORE };
})();
