/* ============================================================
   MCQ Ops Hub — Data & Configuration
   Reconstructed from the live MCQ Master App (Google Apps Script).
   Pure config: app.js renders everything generically from this.
   ============================================================ */

const TONES = {
  // severity / priority
  Minor:'ok', Low:'ok', Moderate:'warn', Medium:'info', Major:'bad', High:'warn',
  Critical:'bad',
  // status
  Open:'info', New:'info', Submitted:'info', Draft:'mute',
  'Under Review':'warn', 'HO Reviewed':'warn', Assigned:'warn', Scheduled:'warn',
  'In Progress':'warn', 'Action Required':'bad', 'Action In Progress':'warn',
  'Action Completed':'ok', Completed:'ok', 'Store Confirmed':'ok', Reviewed:'ok',
  Corrected:'warn', Closed:'ok', Cancelled:'mute',
  // people steps
  'No Formal Step':'mute', Coaching:'info', Informal:'info', 'Verbal Discussion':'warn',
  'Written Warning':'warn', 'Final Warning':'bad', Review:'info', 'Termination Referral':'bad',
  Yes:'bad', No:'mute',
};

// PERTH date/time helpers — the business runs on Australia/Perth (UTC+8, no DST).
// Neither the device timezone (a phone set to Vietnam/overseas time) nor the server
// timezone may shift "today", deadlines or report stamps, so every date/time the app
// GENERATES comes from these. (toISOString() is UTC — reads as YESTERDAY before 8am.)
const MCQ_TZ='Australia/Perth';
function perthNow(){
  try{ return new Date(new Date().toLocaleString('en-US',{timeZone:MCQ_TZ})); }
  catch(e){ return new Date(Date.now()+(new Date().getTimezoneOffset()+480)*60000); }   // UTC+8 fallback
}
function dISO(d){ const x=d?new Date(d):perthNow(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function todayISO(){ return dISO(); }
function perthTimeHM(){ const p=perthNow(); return String(p.getHours()).padStart(2,'0')+':'+String(p.getMinutes()).padStart(2,'0'); }
function perthStamp(){ try{ return new Date().toLocaleString('en-AU',{timeZone:MCQ_TZ}); }catch(e){ return perthNow().toLocaleString(); } }
function perthDateLbl(opts){ try{ return new Date().toLocaleDateString('en-AU',Object.assign({timeZone:MCQ_TZ},opts||{})); }catch(e){ return perthNow().toLocaleDateString(undefined,opts); } }
// Full Perth timestamp 'YYYY-MM-DDTHH:MM:SS' — the Perth replacement for new Date().toISOString()
// (UTC would read as YESTERDAY / the wrong hour before 8am). Slicing behaves the same.
function perthISO(){ const p=perthNow(), z=n=>String(n).padStart(2,'0');
  return p.getFullYear()+'-'+z(p.getMonth()+1)+'-'+z(p.getDate())+'T'+z(p.getHours())+':'+z(p.getMinutes())+':'+z(p.getSeconds()); }
function perthMonth(){ return perthISO().slice(0,7); }                 // 'YYYY-MM' in Perth
function perthDT(){ return perthISO().slice(0,16).replace('T',' '); }  // 'YYYY-MM-DD HH:MM' in Perth
try{ window.dISO=dISO; window.todayISO=todayISO; window.perthNow=perthNow; window.perthTimeHM=perthTimeHM; window.perthStamp=perthStamp; window.perthDateLbl=perthDateLbl; window.perthISO=perthISO; window.perthMonth=perthMonth; window.perthDT=perthDT; }catch(e){}

const STORES = ['Morley','Mirrabooka','Malaga','Subiaco','Armadale','Warehouse'];
const DRIVERS = ['Chu Phuoc','Chu Tam','Michael Tran','Duy Quyen Pham','Duy Thanh Le','Nguyen Ba Cong','Nguyen Thanh Tri'];

const DB = {
  brand: { name: 'MCQ Supermarket', org: 'MCQ International', tagline: 'Retail Operations Platform' },
  stores: STORES,
  drivers: DRIVERS,
  employees: [
    { id:'20007', name:'Karsang Dorji', store:'Morley' },
    { id:'20011', name:'Sarah Nguyen', store:'Subiaco' },
    { id:'20014', name:'David Tran', store:'Malaga' },
    { id:'20019', name:'Mai Le', store:'Mirrabooka' },
    { id:'20023', name:'James Pham', store:'Armadale' },
  ],
  // The two experiences the user asked for
  users: {
    store: { name:'Linh Nguyen', role:'Store Manager', scope:'Morley', store:'Morley', initials:'LN', kind:'store' },
    ho:    { name:'Tony Lam',    role:'Head Office',   scope:'GENERAL · SUP', store:'All stores', initials:'TL', kind:'ho' },
  },
  groups: [
    { id:'daily',    label:'Daily Operations' },
    { id:'customer', label:'Customer' },
    { id:'readiness',label:'Store Readiness' },
    { id:'safety',   label:'Safety & Risk' },
    { id:'logistics',label:'Logistics' },
    { id:'people',   label:'People & Culture' },
  ],
};

/* ---------- shared option lists ---------- */
const STORE_OPTS = ['Morley','Mirrabooka','Malaga','Subiaco','Armadale'];

/* ============================================================
   MODULES
   Each: id, label, short, icon, accent, group, desc, idPrefix,
   severities/statuses, form sections, columns, records, analytics
   ============================================================ */
DB.modules = {

  /* ---------------- CHECKLIST ---------------- */
  checklist: {
    id:'checklist', label:'Store Operation Checklist', short:'Checklist', icon:'✅',
    accent:'#10b981', group:'daily',
    desc:'Run opening, closing and routine checks by store, department and date.',
    idPrefix:'CHK',
    severities:[], statuses:['Pending','In Progress','Completed','Overdue'],
    summary:'Daily execution and department checks',
    form:{ sections:[
      { title:'Checklist Setup', hint:'Pick the store, area and shift to run today’s checks.', fields:[
        { key:'store', label:'Store', type:'select', options:STORE_OPTS, required:true },
        { key:'department', label:'Department / Area', type:'select', options:['Checkout','Fruit & Veg','Grocery','Butcher','Café','Store operations / cleanliness'], required:true },
        { key:'shift', label:'Shift', type:'select', options:['Opening','Mid-day','Closing','Routine'], required:true },
        { key:'date', label:'Date', type:'date', required:true },
      ]},
      { title:'Checks', hint:'Tick each item as completed.', fields:[
        { key:'c1', label:'Temperatures recorded (fridges / freezers)', type:'checkbox' },
        { key:'c2', label:'Floors clean & dry, no hazards', type:'checkbox' },
        { key:'c3', label:'Price tags & promo signage correct', type:'checkbox' },
        { key:'c4', label:'Stock rotation / use-by checked', type:'checkbox' },
        { key:'c5', label:'Equipment switched on & working', type:'checkbox' },
        { key:'notes', label:'Notes', type:'textarea', full:true },
      ]},
    ]},
    columns:[
      {key:'id',label:'Checklist',kind:'id'},{key:'date',label:'Date'},{key:'store',label:'Store'},
      {key:'department',label:'Dept'},{key:'shift',label:'Shift'},
      {key:'progress',label:'Progress',kind:'progress'},{key:'status',label:'Status',kind:'badge'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Today’s checklists',calc:'count'},
        {label:'Completed',calc:'countWhere',field:'status',value:'Completed',tone:'ok'},
        {label:'In progress',calc:'countWhere',field:'status',value:'In Progress',tone:'warn'},
        {label:'Overdue',calc:'countWhere',field:'status',value:'Overdue',tone:'bad'},
      ],
      charts:[{type:'doughnut',title:'By status',group:'status'},{type:'bar',title:'By store',group:'store'}],
    },
  },

  /* ---------------- COMPLAINT ---------------- */
  complaint:{
    id:'complaint', label:'Customer Complaint', short:'Complaints', icon:'💬',
    accent:'#ec4899', group:'customer',
    desc:'Log, review and track customer complaints, follow-ups and closure.',
    idPrefix:'CCL',
    severities:['Minor','Moderate','Major'], statuses:['Open','Closed'],
    summary:'Quick frontline complaint capture',
    form:{ sections:[
      { title:'Store & Staff', hint:'Identify where and who handled the complaint.', fields:[
        { key:'store', label:'Store', type:'select', options:STORE_OPTS, required:true },
        { key:'frontlineStaffName', label:'Frontline Staff Name', type:'text', required:true },
      ]},
      { title:'Channel & Severity', hint:'How did the customer complain, and how serious is it?', fields:[
        { key:'channel', label:'Channel', type:'radio', options:['In-store','Phone','Email','Social Media','Google Review','Other'] },
        { key:'severity', label:'Severity Level', type:'radio', options:['Minor','Moderate','Major'], tone:true },
      ]},
      { title:'Complaint Details', hint:'Capture what the customer said in their own words.', fields:[
        { key:'category', label:'Category', type:'select', options:['Product quality','Price / scanning','Staff attitude / service','Cleanliness','Safety','Stock availability','Online / social media','Other'], required:true },
        { key:'subcategory', label:'Subcategory (optional)', type:'text' },
        { key:'department', label:'Department', type:'select', options:['Checkout','Fruit & Veg','Grocery','Butcher','Café','Store operations / cleanliness','Other'] },
        { key:'shortDescription', label:'Short Description (1–2 lines, customer words)', type:'textarea', full:true },
      ]},
      { title:'Immediate Action', hint:'For Minor: tick what you did. For Moderate/Major: MUST include “Acknowledged & escalated to Store Manager”.', fields:[
        { key:'immediateAction', label:'Action taken', type:'checks', options:['Refund / exchange processed','Product replaced','Voucher / goodwill given','Apology only (no transaction)','None (information only)','Acknowledged & escalated to Store Manager'], full:true },
      ]},
      { title:'Customer Info (optional)', hint:'Only if customer is happy to share.', fields:[
        { key:'customerName', label:'Customer Name', type:'text' },
        { key:'customerContact', label:'Customer Contact (phone/email)', type:'text' },
        { key:'followupRequested', label:'Did customer request follow-up?', type:'radio', options:['No','Yes'] },
      ]},
    ]},
    columns:[
      {key:'id',label:'Case ID',kind:'id'},{key:'created',label:'Created'},{key:'store',label:'Store'},
      {key:'severity',label:'Severity',kind:'badge'},{key:'department',label:'Dept'},{key:'category',label:'Category'},
      {key:'shortDescription',label:'Short description',kind:'wrap'},{key:'followup',label:'Follow-up'},
      {key:'status',label:'Status',kind:'badge'},{key:'age',label:'Age (days)',kind:'num'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Total complaints',calc:'count'},
        {label:'Open',calc:'countWhere',field:'status',value:'Open',tone:'info'},
        {label:'Major + Moderate',calc:'countWhereIn',field:'severity',values:['Major','Moderate'],tone:'warn'},
        {label:'Follow-up requested',calc:'countWhere',field:'followup',value:'Yes',tone:'bad'},
      ],
      charts:[
        {type:'doughnut',title:'By severity',group:'severity'},
        {type:'bar',title:'By store',group:'store'},
        {type:'bar',title:'By category',group:'category',horizontal:true},
      ],
    },
  },

  /* ---------------- MAINTENANCE ---------------- */
  maintenance:{
    id:'maintenance', label:'Maintenance', short:'Maintenance', icon:'🛠️',
    accent:'#f59e0b', group:'readiness',
    desc:'Report equipment, facility, refrigeration, POS and repair issues.',
    idPrefix:'MTN',
    severities:['Low','Medium','High','Critical'],
    statuses:['New','HO Reviewed','Assigned','Scheduled','In Progress','Completed','Store Confirmed','Closed','Cancelled'],
    summary:'Create new repair or facility request',
    form:{ sections:[
      { title:'Where & What', hint:'Tell us the store, area and the equipment affected.', fields:[
        { key:'store', label:'Store', type:'select', options:['Morley','Malaga','Armadale','Subiaco','Mirrabooka','Warehouse'], required:true },
        { key:'departmentArea', label:'Department / Area', type:'select', options:['General','Grocery','FV','Butcher','Checkout','Kitchen','Warehouse','Office'] },
        { key:'equipmentName', label:'Equipment name', type:'text', required:true },
        { key:'locationDetail', label:'Location detail', type:'text' },
      ]},
      { title:'Issue', hint:'Describe the problem and how urgent it is.', fields:[
        { key:'issueCategory', label:'Issue category', type:'select', required:true, options:['Refrigeration','Electrical','Plumbing','POS','EFTPOS','Printer','IT','Forklift','Pallet Jack','Building','Door','Fixture','Cleaning','Pest','Kitchen Equipment','Butcher Equipment','Safety Hazard','Other'] },
        { key:'priority', label:'Priority', type:'select', required:true, options:['Low','Medium','High','Critical'], tone:true },
        { key:'issueDescription', label:'Issue description', type:'textarea', full:true, required:true },
      ]},
      { title:'Risk flags', hint:'Flag anything affecting safety, trading or food safety.', fields:[
        { key:'safetyRisk', label:'Safety risk?', type:'select', options:['No','Yes'] },
        { key:'tradingImpact', label:'Trading impact?', type:'select', options:['No','Yes'] },
        { key:'foodSafetyImpact', label:'Food safety impact?', type:'select', options:['No','Yes'] },
        { key:'photoUrl', label:'Photo URL / evidence link', type:'text', full:true },
      ]},
    ]},
    columns:[
      {key:'id',label:'Case',kind:'id'},{key:'store',label:'Store'},{key:'equipment',label:'Equipment'},
      {key:'priority',label:'Priority',kind:'badge'},{key:'status',label:'Status',kind:'badge'},
      {key:'issue',label:'Issue',kind:'wrap'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Total cases',calc:'count'},
        {label:'Open',calc:'countWhereNotIn',field:'status',values:['Closed','Cancelled','Store Confirmed'],tone:'info'},
        {label:'Critical open',calc:'custom',fn:'criticalOpen',tone:'bad'},
        {label:'High open',calc:'custom',fn:'highOpen',tone:'warn'},
      ],
      charts:[
        {type:'doughnut',title:'By priority',group:'priority'},
        {type:'bar',title:'By store',group:'store'},
        {type:'bar',title:'By category',group:'category',horizontal:true},
      ],
    },
  },

  /* ---------------- INCIDENT ---------------- */
  incident:{
    id:'incident', label:'Incident', short:'Incidents', icon:'⚠️',
    accent:'#ef4444', group:'safety',
    desc:'Report staff incident, near miss, property damage, equipment event or operational risk.',
    idPrefix:'INC',
    severities:['Low','Medium','High','Critical'],
    statuses:['New','Under Review','Action Required','Action In Progress','Action Completed','Closed','Cancelled'],
    summary:'Create incident, near miss or internal risk report',
    form:{ sections:[
      { title:'What & Where', hint:'For internal staff incidents, near misses, damage or unsafe conditions.', fields:[
        { key:'store', label:'Store', type:'select', options:['Morley','Malaga','Armadale','Subiaco','Mirrabooka','Warehouse'], required:true },
        { key:'areaLocation', label:'Area / Location', type:'text', placeholder:'e.g. FV coolroom, checkout, loading dock' },
        { key:'incidentDateTime', label:'Incident date/time', type:'datetime-local', required:true },
        { key:'incidentType', label:'Incident type', type:'select', required:true, options:['Staff injury','Near miss','Equipment / facility damage','Property damage','Food safety internal issue','Security / theft concern','Vehicle / loading dock','Behaviour / conflict','Other'] },
        { key:'severity', label:'Severity', type:'select', required:true, options:['Low','Medium','High','Critical'], tone:true, hint:'Critical = injury, medical attention, serious risk or major operational impact.' },
      ]},
      { title:'People involved', hint:'Who was involved and what were they doing?', fields:[
        { key:'personInvolved', label:'Person involved', type:'text', placeholder:"Name or 'No injury'" },
        { key:'employmentType', label:'Employment type', type:'select', options:['Employee','Contractor','Visitor','Supplier','Other'] },
        { key:'taskBeingPerformed', label:'Task being performed', type:'text' },
        { key:'injuryYn', label:'Injury?', type:'select', options:['No','Yes'] },
        { key:'medicalAttentionYn', label:'Medical attention required?', type:'select', options:['No','Yes'] },
      ]},
      { title:'Account', hint:'Describe what happened and what was done immediately.', fields:[
        { key:'whatHappened', label:'What happened?', type:'textarea', full:true, required:true },
        { key:'immediateAction', label:'Immediate action taken', type:'textarea', full:true, required:true },
      ]},
      { title:'Compliance', hint:'Regulatory and site-preservation flags.', fields:[
        { key:'potentiallyNotifiable', label:'Potentially notifiable?', type:'select', options:['No','Yes'], hint:'If unsure, set Yes and HO will review.' },
        { key:'sitePreserved', label:'Site preserved?', type:'select', options:['No','Yes'] },
        { key:'regulatorNotified', label:'Regulator notified?', type:'select', options:['No','Yes'] },
        { key:'contributingFactorCategory', label:'Contributing factor category', type:'select', options:['Unsafe condition','Unsafe behaviour','Equipment failure','Training gap','PPE issue','Housekeeping / cleaning','Manual handling','Process not followed','External factor','Unknown','Other'] },
      ]},
    ]},
    columns:[
      {key:'id',label:'Incident',kind:'id'},{key:'store',label:'Store'},{key:'type',label:'Type'},
      {key:'severity',label:'Severity',kind:'badge'},{key:'status',label:'Status',kind:'badge'},
      {key:'summary',label:'Summary',kind:'wrap'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Total incidents',calc:'count'},
        {label:'Open',calc:'countWhereNotIn',field:'status',values:['Closed','Cancelled'],tone:'info'},
        {label:'Medical attention',calc:'countWhere',field:'medical',value:'Yes',tone:'bad'},
        {label:'Equipment involved',calc:'countWhere',field:'equipment',value:'Yes',tone:'warn'},
      ],
      charts:[
        {type:'doughnut',title:'By severity',group:'severity'},
        {type:'bar',title:'By type',group:'type',horizontal:true},
        {type:'bar',title:'By store',group:'store'},
      ],
    },
  },

  /* ---------------- DELIVERY ---------------- */
  delivery:{
    id:'delivery', label:'Delivery & Crate Tracking', short:'Delivery', icon:'🚚',
    accent:'#3b82f6', group:'logistics',
    desc:'Track truck arrival/departure, receiver, driver and returned crates by store.',
    idPrefix:'DLV',
    severities:[], statuses:['Submitted','Reviewed','Corrected','Cancelled'],
    summary:'Submit daily truck and crate return record',
    form:{ sections:[
      { title:'Trip', hint:'Who delivered, where and when.', fields:[
        { key:'date', label:'Date', type:'date', required:true },
        { key:'store', label:'Store / Location', type:'select', options:STORES, required:true },
        { key:'department', label:'Department', type:'select', options:['Butcher','Fruit','Vege','Grocery','Other'], required:true },
        { key:'driverName', label:'Driver name', type:'staffadd', options:DRIVERS, role:'driver', required:true, hint:'Pick a driver, or type a new name to add them as a staff member.' },
        { key:'receiverName', label:'Receiver name', type:'text', required:true },
        { key:'timeArrived', label:'Time arrived', type:'time', required:true },
        { key:'timeDeparted', label:'Time departed', type:'time', required:true },
      ]},
      { title:'Crates returned', hint:'Count returned crates by type.', fields:[
        { key:'united22', label:'United 22L', type:'number' },
        { key:'united36', label:'United 36L', type:'number' },
        { key:'united84', label:'United 84L', type:'number' },
        { key:'wa22', label:'WA 22L', type:'number' },
        { key:'wa36', label:'WA 36L', type:'number' },
        { key:'wa84', label:'WA 84L', type:'number' },
        { key:'otherCratesReturn', label:'Crates - Others', type:'text' },
        { key:'comments', label:'Comments', type:'textarea', full:true },
      ]},
    ]},
    columns:[
      {key:'id',label:'Delivery',kind:'id'},{key:'store',label:'Store'},{key:'department',label:'Dept'},
      {key:'arrived',label:'Arrived'},{key:'departed',label:'Departed'},{key:'dwell',label:'Dwell',kind:'dwell'},
      {key:'crates',label:'Total Crates',kind:'num'},{key:'status',label:'Status',kind:'badge'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Total trips',calc:'count'},
        {label:'Total crates',calc:'sum',field:'crates',tone:'info'},
        {label:'Avg dwell (min)',calc:'avg',field:'dwell',tone:'warn'},
        {label:'Long dwell (>60m)',calc:'countWhereGt',field:'dwell',value:60,tone:'bad'},
      ],
      charts:[
        {type:'bar',title:'Trips by store',group:'store'},
        {type:'doughnut',title:'By department',group:'department'},
        {type:'bar',title:'Trips by driver',group:'driver',horizontal:true},
      ],
    },
  },

  /* ---------------- PEOPLE ---------------- */
  people:{
    id:'people', label:'People Accountability', short:'People', icon:'👥',
    accent:'#8b5cf6', group:'people',
    desc:'Record coaching, disciplinary actions, follow-up reviews and people-risk visibility.',
    idPrefix:'PAC',
    severities:['Low','Medium','High','Critical'],
    statuses:['Open','Closed','Cancelled'],
    summary:'Create coaching or disciplinary record',
    form:{ sections:[
      { title:'Employee & Case', hint:'Who the case is about and what type it is.', fields:[
        { key:'employeeName', label:'Employee', type:'text', placeholder:'Type at least 2 characters…', required:true },
        { key:'store', label:'Store', type:'select', options:STORES, required:true },
        { key:'caseType', label:'Case type', type:'select', options:['Coaching','Informal','Disciplinary Case'], required:true },
        { key:'reportedDate', label:'Reported date', type:'date' },
        { key:'incidentDate', label:'Incident / issue date', type:'date' },
      ]},
      { title:'Concern', hint:'Categorise the concern and its severity.', fields:[
        { key:'concernCategory', label:'Concern category', type:'select', required:true, options:['Attendance & Leave Compliance','Uniform & Appearance','Integrity, Dishonesty & Theft','Performance / Productivity','SOP / Process Breach','Health and Safety','Cash / POS / Financial Control','Customer Service','Behaviour / Bullying / Harassment','Discrimination / Racism','Reputation / Brand Conduct','Others'] },
        { key:'severity', label:'Severity', type:'select', options:['Low','Medium','High','Critical'], tone:true },
        { key:'confidentialLevel', label:'Confidential level', type:'select', options:['Standard','Restricted','Highly Restricted'] },
        { key:'immediateRisk', label:'Immediate risk?', type:'select', options:['No','Yes'] },
        { key:'caseDetails', label:'Case details', type:'textarea', full:true },
      ]},
      { title:'Process & Outcome', hint:'Track the disciplinary step and follow-up.', fields:[
        { key:'employeeInformedYn', label:'Employee informed?', type:'select', options:['No','Yes'] },
        { key:'investigationStatus', label:'Investigation status', type:'select', options:['Draft','Open','Under Review','Awaiting Employee Response','Improvement Period','Escalated','Closed'] },
        { key:'disciplinaryStep', label:'Disciplinary step', type:'select', options:['No Formal Step','Coaching','Informal','Verbal Discussion','Written Warning','Final Warning','Review','Termination Referral'], tone:true },
        { key:'reviewDate', label:'Review date', type:'date' },
        { key:'employeeResponse', label:'Employee response', type:'textarea', full:true },
        { key:'improvementPlan', label:'Improvement / support plan', type:'textarea', full:true },
      ]},
    ]},
    columns:[
      {key:'id',label:'Case',kind:'id'},{key:'employee',label:'Employee',kind:'emp'},{key:'category',label:'Category'},
      {key:'step',label:'Step',kind:'badge'},{key:'severity',label:'Severity',kind:'badge'},{key:'status',label:'Status',kind:'badge'},
    ],
    records:[],
    analytics:{ kpis:[
        {label:'Total cases',calc:'count'},
        {label:'Open',calc:'countWhere',field:'status',value:'Open',tone:'info'},
        {label:'Active warnings',calc:'countWhereIn',field:'step',values:['Written Warning','Final Warning'],tone:'warn'},
        {label:'Critical',calc:'countWhere',field:'severity',value:'Critical',tone:'bad'},
      ],
      charts:[
        {type:'doughnut',title:'By step',group:'step'},
        {type:'bar',title:'By category',group:'category',horizontal:true},
        {type:'bar',title:'By store',group:'store'},
      ],
    },
  },

};

/* module display order */
DB.order = ['checklist','complaint','maintenance','incident','delivery'];

/* ============================================================
   GAP FILL — additional create-form fields captured from the
   live app, added here to reach full field parity.
   ============================================================ */

// Complaint: "Other channel name" (shown when channel = Other)
DB.modules.complaint.form.sections[1].fields.splice(1,0,
  { key:'otherChannelName', label:'Other channel name', type:'text', placeholder:'If channel = Other' });

// People: evidence / witnesses / escalation
DB.modules.people.form.sections[1].fields.push(
  { key:'evidenceUrl', label:'Evidence URL', type:'text' },
  { key:'witnesses', label:'Witnesses', type:'text' });
DB.modules.people.form.sections[2].fields.push(
  { key:'escalatedTo', label:'Escalated to', type:'text' });

// Incident: equipment + evidence fields
DB.modules.incident.form.sections[1].fields.push(
  { key:'equipmentInvolvedYn', label:'Equipment / facility involved?', type:'select', options:['No','Yes'] },
  { key:'assetId', label:'Asset ID', type:'text', placeholder:'Optional' });
DB.modules.incident.form.sections[3].fields.push(
  { key:'photoUrl', label:'Photo / evidence URL', type:'text', placeholder:'Paste Google Drive link if available' });
// Incident: full "Linked Maintenance case" sub-form
DB.modules.incident.form.sections.push({
  title:'Linked Maintenance case (optional)',
  hint:'If the incident involves broken equipment or a facility hazard, raise a linked Maintenance case from here.',
  fields:[
    { key:'createMaintenanceCase', label:'Create linked Maintenance case?', type:'select', options:['No','Yes'] },
    { key:'maintenancePriority', label:'Maintenance priority', type:'select', options:['Critical','High','Medium','Low'] },
    { key:'maintenanceIssueCategory', label:'Maintenance issue category', type:'select', options:['Safety Hazard','Building','Door','Fixture','Forklift','Pallet Jack','Electrical','Plumbing','Refrigeration','POS','EFTPOS','Printer','IT','Cleaning','Pest','Other'] },
    { key:'maintenanceTradingImpact', label:'Trading impact?', type:'select', options:['No','Yes'] },
    { key:'maintenanceFoodSafetyImpact', label:'Food safety impact?', type:'select', options:['No','Yes'] },
    { key:'maintenanceEquipmentName', label:'Maintenance equipment / issue name', type:'text' },
    { key:'maintenanceLocationDetail', label:'Maintenance location detail', type:'text' },
    { key:'maintenanceIssueDescription', label:'Maintenance issue description', type:'textarea', full:true },
  ]
});

/* ============================================================
   MANAGER-SIDE REVIEW FIELDS (Head Office) — captured from the
   *_store_view / *_review pages. Rendered in the detail drawer.
   ============================================================ */
const STAT = id => DB.modules[id].statuses;

DB.modules.complaint.review = [
  { key:'status', label:'Status', type:'select', options:STAT('complaint') },
  { key:'assignedTo', label:'Assigned to', type:'text' },
  { key:'comment', label:'Resolution / follow-up note', type:'textarea', full:true },
];
DB.modules.maintenance.review = [
  { key:'status', label:'Status', type:'select', options:STAT('maintenance') },
  { key:'priority', label:'Priority', type:'select', options:['Low','Medium','High','Critical'] },
  { key:'assignedToType', label:'Assigned to type', type:'select', options:['Internal staff','External contractors'] },
  { key:'assignedTo', label:'Assigned to', type:'text' },
  { key:'vendorId', label:'Vendor ID', type:'text' },
  { key:'scheduledDate', label:'Scheduled date', type:'date' },
  { key:'estimatedCost', label:'Estimated cost', type:'number' },
  { key:'finalCost', label:'Final cost', type:'number' },
  { key:'comment', label:'Action / update comment', type:'textarea', full:true },
  { key:'resolutionNotes', label:'Resolution notes', type:'textarea', full:true },
];
DB.modules.incident.review = [
  { key:'status', label:'Status', type:'select', options:STAT('incident') },
  { key:'severity', label:'Severity', type:'select', options:['Low','Medium','High','Critical'] },
  { key:'contributingFactorCategory', label:'Contributing factor', type:'select', options:['Unsafe condition','Unsafe behaviour','Equipment failure','Training gap','PPE issue','Housekeeping / cleaning','Manual handling','Process not followed','External factor','Unknown','Other'] },
  { key:'correctiveActionOwner', label:'Corrective action owner', type:'text' },
  { key:'correctiveActionDueDate', label:'Corrective action due date', type:'date' },
  { key:'rootCause', label:'Root cause', type:'textarea', full:true },
  { key:'correctiveAction', label:'Corrective action', type:'textarea', full:true },
  { key:'comment', label:'Review comment', type:'textarea', full:true },
];
DB.modules.delivery.review = [
  { key:'status', label:'Status', type:'select', options:STAT('delivery') },
  { key:'reviewNotes', label:'Review notes', type:'textarea', full:true },
];
DB.modules.people.review = [
  { key:'status', label:'Status', type:'select', options:STAT('people') },
  { key:'investigationStatus', label:'Investigation status', type:'select', options:['Draft','Open','Under Review','Awaiting Employee Response','Improvement Period','Escalated','Closed'] },
  { key:'disciplinaryStep', label:'Disciplinary step', type:'select', options:['No Formal Step','Coaching','Informal','Verbal Discussion','Written Warning','Final Warning','Review','Termination Referral'] },
  { key:'severity', label:'Severity', type:'select', options:['Low','Medium','High','Critical'] },
  { key:'reviewDate', label:'Review date', type:'date' },
  { key:'outcome', label:'Outcome', type:'text' },
  { key:'comment', label:'Update comment', type:'textarea', full:true },
];
DB.modules.checklist.review = [
  { key:'status', label:'Status', type:'select', options:STAT('checklist') },
  { key:'notes', label:'Notes', type:'textarea', full:true },
];
