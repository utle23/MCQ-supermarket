/* ============================================================
   MCQ Ops Hub — Supermarket HR / Management data (Stage 1)
   Extends DB (from data.js). Checklist content is the REAL
   store-wide checklist provided by the owner. HR feature data
   is adapted from the MCQ Mirrabooka Restaurant web app, redone
   for the supermarket departments.
   ============================================================ */

/* ---------- Auth & branches ---------- */
DB.branches = ['Morley','Mirrabooka','Malaga','Subiaco','Armadale','Warehouse'];
DB.auth = {
  adminPasswords: {                       // each store has its OWN admin password
    'Morley':'1010', 'Mirrabooka':'2020', 'Malaga':'3030', 'Subiaco':'4040',
    'Armadale':'5050', 'Warehouse':'8080',
  },
  superAdminPassword: '99999',             // super admin — ALL stores + cross-store compare
  baPassword: '19',                        // Chú Ba — read-only checklist viewer (all stores)
  branchPasswords: {                      // each branch has its OWN staff password
    'Morley':'1111', 'Mirrabooka':'2222', 'Malaga':'3333', 'Subiaco':'4444',
    'Armadale':'5555', 'Warehouse':'8000',
  },
  idleMinutes: 30,            // auto-logout after 30 min idle
  absoluteHours: 8,
};

/* ---- Email recipients + per-category routing for Report Issue ---- */
DB.emailRecipients = [
  { key:'ho',    name:'Tony Lam · Head Office', email:'tony@mcqinternational.com' },
  { key:'ops',   name:'Operations',             email:'ops@mcqinternational.com' },
  { key:'hr',    name:'HR',                      email:'hr@mcqinternational.com' },
  { key:'fac',   name:'Facilities / Maintenance',email:'maintenance@mcqinternational.com' },
  { key:'safety',name:'Safety Officer',          email:'safety@mcqinternational.com' },
  { key:'mgr',   name:'Store Manager',           email:'manager@mcqinternational.com' },
];
/* email sending config (copies the restaurant: Brevo HTTP API, + Gmail-compose / mailto fallbacks).
   channel: 'preview' (demo toast) | 'brevo' (auto-send via api.brevo.com) | 'gmail' | 'mailto' */
/* Brevo by default; the API KEY is NOT here — it lives in the server env var
   BREVO_API_KEY and is used by the /api/send-email relay. Sender/name are not secret. */
DB.emailConfig = { channel:'brevo', apiKey:'', fromEmail:'mcqcafe.notify@gmail.com', fromName:'MCQ Supermarket Notification' };
/* Sent-mail history (proof emails actually went out) — capped to ~100, persisted per store */
DB.emailLog = [];
/* Per-store department-lead emails: { [store]: { [dept]: [ {name,email}, … ] } } — isolated per store */
DB.checklistLeadEmails = {};
/* "Share Your Thought" — confidential staff feedback to the owner. Store-scoped; only Super Admin views the inbox. */
DB.feedback = [];
/* default recipients per category group */
const _GROUP_RECIPIENTS = {
  'Maintenance & Facility':['fac','ho'],
  'Safety & Incident':['safety','ho','ops'],
  'Customer Complaint':['mgr','ho'],
  'Operational':['ops','mgr'],
  'People':['hr','ho'],
  'Other':['ho'],
};
TONES.Normal='info'; TONES.Urgent='bad'; TONES.Active='ok';

/* ============================================================
   REAL CHECKLIST  — Store-wide (all departments)
   item tuple: [dept, area(session), task, when, photo]
   when : 'O'=opening(AM) | 'C'=closing(PM) | 'A'=all day(AM+PM)
   photo: 0 none | 'O' optional | 'O5' optional max5 | 'R1-5' required 1..5
   ============================================================ */
DB.checklist = {
  depts: ['MANAGER','CASHIER','FV','GROCERY','FROZEN & DAIRY','BUTCHER','FORKLIFT','OFFICE'],
  deptMeta: {
    MANAGER:{icon:'fa-user-tie', color:'#4f46e5'},
    CASHIER:{icon:'fa-cash-register', color:'#0ea5e9'},
    FV:     {icon:'fa-carrot', color:'#10b981'},
    GROCERY:{icon:'fa-basket-shopping', color:'#f59e0b'},
    'FROZEN & DAIRY':{icon:'fa-snowflake', color:'#0891b2'},
    BUTCHER:{icon:'fa-drumstick-bite', color:'#ef4444'},
    FORKLIFT:{icon:'fa-truck-ramp-box', color:'#6d4c41'},
    OFFICE: {icon:'fa-file-invoice-dollar', color:'#64748b'},
  },
  tempRanges: {
    fridge: {label:'Fridge', max:5, text:'<= 5 C'},
    freezer:{label:'Freezer', min:-25, max:-15, text:'-25 C to -15 C'},
  },
  tempAlertEmails: ['manager@mcqinternational.com','safety@mcqinternational.com'],
  deadlines: { Opening:'10:30 AM', 'Mid-afternoon':'3:30 PM', Closing:'9:30 PM' },
  templateVersion: 5,   // v5: Closing deadline 9:30 PM; removed the 2 duplicate MANAGER Closing tasks
  items: [
    // ---- MANAGER ----
    ['MANAGER','Opening','ALL STAFF HAVING PROPER UNIFORM AND NAME BADGE','O',0],
    ['MANAGER','Opening','ALL STAFF WORK THEIR ROSTERED SHIFT AS SCHEDULED','O',0],
    ['MANAGER','Opening','SHOP FLOOR LIGHTS TURN ON','O',0],
    ['MANAGER','Opening','BIN AREA EMPTY / TIDY','O','R1-5'],
    ['MANAGER','Opening','ALL DESIGNATED STAFF HAVING WALKIE-TALKIE DEVICE AND FILLING LOG BOOK PROPERLY','O','R1-2'],
    ['MANAGER','Opening','FIRST-AID KIT STOCKED AND ACCESSIBLE','O',0],
    ['MANAGER','Closing','ALL GATES & ROLLER DOORS CLOSED AND LOCKED','C','O5'],
    ['MANAGER','Closing','BINS ARE EMPTY AND BIN AREA CLEAR','C','R1-2'],
    ['MANAGER','Closing','SHOP FLOOR LIGHTS TURN OFF','C',0],
    ['MANAGER','Closing','ALL WALKIE-TALKIE DEVICES CHARGED IN DOCKS AND LOG BOOK UP TO DATE','C','R1-2'],
    ['MANAGER','Closing','CASH COUNTED, RECONCILED AND SECURED IN SAFE','C',0],
    ['MANAGER','Closing','STORE EMPTY OF CUSTOMERS — ALL DOORS SECURED','C',0],
    // MANAGER · Temperature Checks (Fridge A1–A7, C1–C5, B1–B8) + Cool Room / Frozen Room generated after this array
    // ---- CASHIER ----
    ['CASHIER','Opening','TURN ON MUSIC','O',0],
    ['CASHIER','Opening','CAFE HOMEMADE + SUPPLIER ITEMS CORRECT LABEL AND WELL-ORGANISED','O','R1-5'],
    ['CASHIER','Opening','FLOWER DISPLAY','O','R1-3'],
    ['CASHIER','Opening','ORGANISE FV BOX AND TIDY UP BOXES AREA','O','R1-5'],
    ['CASHIER','Opening','BANNER PUSHED OUT','O',0],
    ['CASHIER','Opening','KEEP THE RETURNED ITEM AREA CLEAN','O','R1-3'],
    ['CASHIER','Opening','TILL FLOW CHECKED + CHECK MONEY TO PAY FOR SUPPLIER + EFTPOS & SCANNERS TESTED AND WORKING','O',0],
    ['CASHIER','Opening','BASKETS & ROLLER DOOR','O',0],
    ['CASHIER','Opening','BAGS FILLED','O','O5'],
    ['CASHIER','Opening','CHECK QUALITY AND DATE OF STOCK IN FRIDGE','O',0],
    ['CASHIER','Opening','HOMEMADE ITEMS RECEIVED AND EXPIRED RETURNED','O',0],
    ['CASHIER','Opening','FLOWERS QUALITY CHECK','O',0],
    ['CASHIER','Opening','BREADS FILLED AND EXPIRY DATE CHECKED','O',0],
    ['CASHIER','Opening','HAND SANITISER AND WIPING CLOTHS AT COUNTER TOPPED UP','O',0],
    ['CASHIER','Opening','CHECKOUT AREA AND SCALES WIPED CLEAN','O','R1-2'],
    ['CASHIER','Closing','RECEIPTS ROLL FILLED (REPORT TO MANAGER ORDER)','C','R1-2'],
    ['CASHIER','Closing','ALL TILLS AND CABINETS CLEANED','C','O3'],
    ['CASHIER','Closing','REFILL AND PULL OUT MEDICAL CABINETS','C','R1-5'],
    ['CASHIER','Closing','TRASH TAKEN OUT','C',0],
    ['CASHIER','Closing','BREAD ORGANISED','C','R1-2'],
    ['CASHIER','Closing','CHINESE MEDICINE SHELF FACED UP','C','R1-2'],
    ['CASHIER','Closing','KNIVES CABINET FACES UP','C','R1-2'],
    ['CASHIER','Closing','REFILL YAKULT FRIDGE','C','R1-2'],
    ['CASHIER','Closing','FV & GROC RETURNED','C',0],
    ['CASHIER','Closing','TILL CASH COUNTED AND HANDED TO MANAGER','C',0],
    ['CASHIER','Closing','EFTPOS SETTLEMENT / BATCH DONE','C',0],
    // ---- FV ----
    ['FV','Fruit','AISLES CLEAR, NO PALLET JACK / BINS BLOCKING','A','R1-10'],
    ['FV','Fruit','ALL STOCK DISPLAY FILLED 2:30PM AND 9:00PM','C','R1-10'],
    ['FV','Fruit','FILL FULL TROPICAL FRUIT','C',0],
    ['FV','Fruit','FRUITS IN THE FRIDGE FILLED','A','R1-10'],
    ['FV','Fruit','QUALITY CHECKED','A',0],
    ['FV','Fruit','ROLL BAGS FILLED','A',0],
    ['FV','Fruit','FLOORS & FRUIT AREA CLEANED','A','R1-5'],
    ['FV','Fruit','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','ALL STOCK DISPLAY FILLED 2:30PM AND 9:00PM','C','R1-10'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','FILL FULL TOMATO BAG / LOOSE, BANANA, POTATO, ONION BAG / LOOSE','C',0],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','QUALITY CHECKED','A','O'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','ROLL BAGS FILLED','A','O'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','FLOORS & VEGE AREA CLEANED','A','R1-2'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Western Vege Table','ALL STOCK DISPLAY FILLED 2:30PM AND 9:00PM','C','R1-10'],
    ['FV','Western Vege Table','QUALITY CHECKED','A',0],
    ['FV','Western Vege Table','ROLL BAGS FILLED','A',0],
    ['FV','Western Vege Table','FLOORS & VEGE AREA CLEANED','A','R1-5'],
    ['FV','Western Vege Table','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Western Vege Table','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Western Vege Table','EMPTY BINS & SPRAY WATER EVERY 30 MINS','A',0],
    ['FV','Western Vege Table','EMPTY BIN AND RETURN BIN BACK TO DESIGNATED AREA','C',0],
    ['FV','Western Vege Table','TABLES ARE CLEAN','C','R1-2'],
    ['FV','Veges Fridges + Chinese Veges','ALL STOCK DISPLAY FILLED 2:30PM AND 9:00PM','C','R1-10'],
    ['FV','Veges Fridges + Chinese Veges','QUALITY CHECKED','A',0],
    ['FV','Veges Fridges + Chinese Veges','FLOORS & VEGE AREA CLEANED','A','R1-2'],
    ['FV','Veges Fridges + Chinese Veges','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Veges Fridges + Chinese Veges','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Veges Fridges + Chinese Veges','TIDY UP VIETNAMESE HERBS','A','R1-2'],
    ['FV','Veges Fridges + Chinese Veges','SPRAY WATER EVERY 30 MINS','A',0],
    ['FV','Veges Fridges + Chinese Veges','EMPTY BIN AND RETURN BIN BACK TO DESIGNATED AREA','C',0],
    ['FV','Veges Fridges + Chinese Veges','TABLES ARE CLEAN','C','R1-2'],
    ['FV','Veges Fridges + Chinese Veges','FRIDGES ARE CLEAN — REMOVE FALLEN PRODUCE FROM BOTTOM SHELVES','C','R1-2'],
    ['FV','Cutting Fruit & Packing Veges','FRUIT SALAD FILLED BY 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','WATER MELON CUT FILLED 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','VEGES CUT FILLED 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','PACKING ALL SECOND STOCK','O',0],
    ['FV','Cutting Fruit & Packing Veges','DISPLAY AREA CLEANED','A','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','KNIVES, PRICE GUN & ALL UTENSILS PUT BACK','A','R1-2'],
    ['FV','Back Door WH','COOLROOM CLEAN & TIDY','A','R1-3'],
    ['FV','Back Door WH','KITCHEN / CUTTING AREA CLEANED','A','R1-2'],
    ['FV','Back Door WH','CRATES IN ORDER','A','R1-3'],
    ['FV','Back Door WH','RUBBISH BINS EMPTY / TIDY','A','R1-2'],
    ['FV','Back Door WH','PUT AWAY TROLLEY IN THE WOOD BIN','A','R1-2'],
    ['FV','Back Door WH','EMPTY BOXES','A',0],
    ['FV','Back Door WH','EMPTY PAPER IN MACHINE','A',0],
    ['FV','Back Door WH','PUT AWAY & TIDY EMPTY PALLETS','A',0],
    ['FV','Fruit','REMOVE SPOILED / ROTTEN PRODUCE FROM DISPLAY','A',0],
    ['FV','Cutting Fruit & Packing Veges','WASH HANDS AND WEAR GLOVES BEFORE CUTTING','O',0],
    ['FV','Cutting Fruit & Packing Veges','SANITISE KNIVES AND CUTTING BOARDS BEFORE USE','O',0],
    ['FV','Cutting Fruit & Packing Veges','CUT FRUIT / SALAD LABELLED WITH PACK & USE-BY DATE','A',0],
    ['FV','Cutting Fruit & Packing Veges','WEIGHING SCALES CHECKED AND ZEROED','O',0],
    // FV · Mid-afternoon shift handover (photos)
    ['FV','Handover','SHIFT HANDOVER — TAKE HANDOVER PHOTOS AND SUBMIT','M','R1-5'],
    // ---- GROCERY ----
    ['GROCERY','Grocery','AISLES CLEAR, NO PALLET JACK / BINS / BOXES BLOCKING','A','R1-5'],
    ['GROCERY','Grocery','CHECK PRICE LABEL ACCURACY','A',0],
    ['GROCERY','Grocery','REMOVE DAMAGED PACKAGING FROM SHELF','A',0],
    ['GROCERY','Grocery','RANDOM EXPIRY CHECK FOR SHORT-DATED ITEMS','A',0],
    ['GROCERY','Grocery','KEY VALUE ITEMS ARE FILLED UP','A','O'],
    ['GROCERY','Grocery','PRODUCTS ARE WELL ORGANISED WITH NO EMPTY GAPS ON SHELVES','A','O'],
    ['GROCERY','Grocery','AISLES CLEAN, NO RUBBISH ON THE WAY','A',0],
    ['GROCERY','Grocery','FRONT SHELVES ARE FACED UP WITH LABELS','A','O'],
    ['GROCERY','Grocery','LEFT BEHIND PRODUCTS RETURNED','A',0],
    ['GROCERY','Grocery','ROTATE STOCK — OLDER DATES TO THE FRONT (FIFO)','A',0],
    ['GROCERY','Grocery','CHECK / REPLACE MISSING OR WRONG SHELF TICKETS','A',0],
    ['GROCERY','Grocery','SPILLS CLEANED IMMEDIATELY AND WET-FLOOR SIGN USED','A',0],
    ['GROCERY','Grocery','SPECIALS / PROMO DISPLAYS FILLED AND TICKETED','A','O'],
    ['GROCERY','Grocery','REPORT OUT-OF-STOCK / LOW LINES TO MANAGER','A',0],
    // GROCERY · Cosmetics (moved from Cashier)
    ['GROCERY','Cosmetics','PRICE LABELS CORRECT AND PROMOTIONAL TAGS IN PLACE','O',0],
    ['GROCERY','Cosmetics','NEW ARRIVALS PRICED, TAGGED AND PUSHED TO SHELF','A','R1-3'],
    ['GROCERY','Cosmetics','RESTOCK GAPS FROM BACK STOCK AND FACE UP ALL SHELVES','C','R1-5'],
    ['GROCERY','Cosmetics','TIDY AND ORGANISE COSMETIC CABINETS NEATLY','C','R1-3'],
    // ---- FROZEN & DAIRY ----
    ['FROZEN & DAIRY','Frozen & Dairy','FRIDGES ARE CLEAN AND CLEAR','A','R1-10'],
    ['FROZEN & DAIRY','Frozen & Dairy','CHECK PRICE LABEL ACCURACY','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','RANDOM EXPIRY CHECK FOR SHORT-DATED ITEMS. MARKDOWN DONE','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','KEY VALUE ITEMS ARE FILLED UP','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','PRODUCTS ARE WELL ORGANISED WITH NO EMPTY GAPS ON SHELVES','A','O'],
    ['FROZEN & DAIRY','Frozen & Dairy','FRONT SHELVES ARE FACED UP WITH LABELS','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','AISLES CLEAN, NO RUBBISH ON THE WAY','A','R1-5'],
    ['FROZEN & DAIRY','Frozen & Dairy','TOFU QUALITY CHECKED AND CLEAN','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','ROTATE STOCK — OLDER DATES TO THE FRONT (FIFO)','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','FREEZER DOORS CLOSE PROPERLY, NO ICE BUILD-UP','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','STOCK BELOW FILL LINE — AIR VENTS NOT BLOCKED','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','CLEAN ANY SPILLS OR LEAKS IN FRIDGES','A','R1-2'],
    ['FROZEN & DAIRY','Frozen & Dairy','REPORT ANY TEMPERATURE WARNING TO MANAGER','A',0],
    // ---- BUTCHER ----
    ['BUTCHER','Retail','PREPARE SANITIZER AND PAPER TOWEL AT THE STATION','O',0],
    ['BUTCHER','Retail','MEAT DISPLAY CLEAN AND LABEL CORRECT','O',0],
    ['BUTCHER','Retail','PRICE TAGS UPRIGHT AND CORRECT','A','O3'],
    ['BUTCHER','Retail','MEAT TRAYS HAVING GAPS FRONT AND BACK','A',0],
    ['BUTCHER','Retail','SERVING AREA FLOOR FREE OF BOX AND MOPPED','A','R1-3'],
    ['BUTCHER','Retail','WASH HANDS AND WEAR CLEAN GLOVES / APRON','O',0],
    ['BUTCHER','Retail','SANITISE KNIVES, BOARDS AND BAND-SAW BEFORE USE','O',0],
    ['BUTCHER','Retail','RAW MEAT, POULTRY & SEAFOOD KEPT SEPARATE (NO CROSS-CONTAMINATION)','A',0],
    ['BUTCHER','Retail','CHECK DATE LABELS AND ROTATE STOCK (FIFO)','A',0],
    ['BUTCHER','Back Storage','BOXES FLATTEN BEFORE DISPOSE','A',0],
    ['BUTCHER','Back Storage','ALL MEAT CRATES ARE LABELLED WITH DATES','A',0],
    ['BUTCHER','Back Storage','BUTCHER STORAGE ROOM CLEAN AND TIDY','A','R1-3'],
    ['BUTCHER','Retail Closing','ALL MEAT TRAYS PUT AWAY IN ORDER','C',0],
    ['BUTCHER','Retail Closing','ALL MEAT TRAYS WRAPPED AND LEFT IN GREEN CRATES','C',0],
    ['BUTCHER','Retail Closing','ALL WINDOWS WIPED','C',0],
    ['BUTCHER','Retail Closing','ALL TRAYS WASHED','C',0],
    ['BUTCHER','Retail Closing','ALL RAW MEAT RETURNED TO COLDROOM — NONE LEFT OUT','C',0],
    ['BUTCHER','Retail Closing','BAND-SAW, MINCER AND BOARDS DEEP-CLEANED & SANITISED','C','R1-2'],
    ['BUTCHER','Retail Closing','WASTE / TRIM BINS EMPTIED AND SANITISED','C',0],
    ['BUTCHER','Fridge','REPORT ANY TEMPERATURE WARNING TO MANAGER','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','CLEAN ANY SPILLS OR LEAKS IN FRIDGES','A','R1-2',{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','STOCK BELOW FILL LINE — AIR VENTS NOT BLOCKED','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','FREEZER DOORS CLOSE PROPERLY, NO ICE BUILD-UP','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','ROTATE STOCK — OLDER DATES TO THE FRONT (FIFO)','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','AISLES CLEAN, NO RUBBISH ON THE WAY','A','R1-2',{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','FRONT SHELVES ARE FACED UP WITH LABELS','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','PRODUCTS ARE WELL ORGANISED WITH NO EMPTY GAPS ON SHELVES','A','R1-2',{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','RANDOM EXPIRY CHECK FOR SHORT-DATED ITEMS. MARKDOWN DONE','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','CHECK PRICE AND LABEL ACCURACY','A',0,{stores:['Mirrabooka']}],
    ['BUTCHER','Fridge','FRIDGES ARE CLEAN AND CLEAR','A','R1-2',{stores:['Mirrabooka']}],
    // ---- CASHIER · Cosmetics (sub-section of Cashier) ----
    ['CASHIER','Cosmetics','ALL COSMETIC SHELVES FULLY STOCKED AND FACED UP','O','R1-5'],
    ['CASHIER','Cosmetics','GLASS DISPLAY CABINETS WIPED','O','R1-3'],
    ['CASHIER','Cosmetics','SECTION LOOKS NEAT, WELL ORGANISED AND SHOPPABLE','A','R1-3'],
    ['CASHIER','Cosmetics','CLEAN COUNTER, MIRRORS AND TESTER AREA','C',0],
    ['CASHIER','Cosmetics','RETURN MISPLACED PRODUCTS TO CORRECT SECTION','C',0],
    ['CASHIER','Cosmetics','PULL OUT STOCK COSMETIC CABINET','C','R1-5'],
    // ---- OFFICE ----
    ['OFFICE','Admin','DESKS AND TABLES CLEAN, CLEAR AND ORGANISED','O','R1-2'],
    ['OFFICE','Admin','NO FOOD NO DRINK','O',0],
    ['OFFICE','Admin','CHECK INCOMING INVOICES AGAINST DELIVERIES (QTY & PRICE)','O',0],
    ['OFFICE','Admin','ANSWER AND LOG SUPPLIER CALLS AND EMAILS','A',0],
    ['OFFICE','Admin','SEND INVOICE BATCH TO HEAD OFFICE — MONDAY & THURSDAY','A',0],
    ['OFFICE','Admin','STOCK UP STATIONERY, BLU TACK, INK, PAPER, PEN','C',0],
    ['OFFICE','Admin','CHECK WATER & ELECTRICITY METER READING (END OF EACH MONTH)','C',0],
    ['OFFICE','Admin','TABLES CLEARED, WIPED AND TIDY FOR NEXT DAY','C','R1-2'],
    // ---- FORKLIFT (single section) ----
    ['FORKLIFT','Forklift','REFILL WATER IF IT RUNS OUT','O',0],
    ['FORKLIFT','Forklift','CHECK CONTROL LEVERS WORKING','O',0],
    ['FORKLIFT','Forklift','CHECK TYRES','O',0],
    ['FORKLIFT','Forklift','CHECK LIGHTS','O',0],
    ['FORKLIFT','Forklift','CHECK HORN','O',0],
    ['FORKLIFT','Forklift','CHECK FOR OIL LEAKS','O',0],
    ['FORKLIFT','Forklift','CHARGE FORKLIFT BATTERY (MON, WED, FRI & SUN)','C',0],
    ['FORKLIFT','Forklift','FORKLIFT CHECK WATER LEVEL — IF RUN OUT, REPORT TO MANAGER','C',0],
    ['FORKLIFT','Forklift','CHECK FOR DAMAGE — REPORT TO MANAGER','C',0],
    ['FORKLIFT','Forklift','KEY IN MACHINE, PARKED IN BAY, FORKS LOWERED','C',0],
  ],
};
/* MANAGER · Temperature Checks — Fridge A1–A7, C1–C5, B1–B8 (AI scan) + Cool Room / Frozen Room */
(function(){
  const T=DB.checklist.items;
  [['A',7],['C',5],['B',8]].forEach(function(g){ for(var i=1;i<=g[1];i++){ var id=g[0]+i;
    ['O','C'].forEach(function(w){ T.push(['MANAGER','Temperature Checks','FRIDGE '+id+' TEMPERATURE',w,'R1-1',{temp:true,type:'fridge',equipment:'Fridge '+id}]); }); } });
  [['Meat Cool Room','fridge'],['Produce Cool Room','fridge'],['Dairy Cool Room','fridge'],['Banana Cool Room','fridge'],['Frozen Food Room','freezer']].forEach(function(r){
    ['O','C'].forEach(function(w){ T.push(['MANAGER','Cool Room / Frozen Room',r[0].toUpperCase()+' TEMPERATURE',w,'R1-1',{temp:true,type:r[1],equipment:r[0]}]); }); });
})();
function normalizeChecklistTemplate(){
  const items=(DB.checklist&&DB.checklist.items)||[];
  if(!Array.isArray(items)) return;
  const removeTasks=new Set([
    'OVERNIGHT FRIDGE / FREEZER ALARMS CHECKED — ALL RECOVERED',
    'CCTV AND SECURITY ALARM WORKING',
    'TESTER UNITS CLEAN, WORKING AND TOPPED UP',
    'CHECK EXPIRY DATES — REMOVE OR MARK DOWN SHORT-DATED ITEMS',
    'HIGH-VALUE / FRAGRANCE LOCKED CABINET STOCK CHECKED',
  ]);
  DB.checklist.items=items.filter(it=>!removeTasks.has(it&&it[2]));
  const renameTasks={
    'HAND SANITISER AT COUNTER TOPPED UP':'HAND SANITISER AND WIPING CLOTHS AT COUNTER TOPPED UP',
    'CHECKOUT BELTS AND SCALES WIPED CLEAN':'CHECKOUT AREA AND SCALES WIPED CLEAN',
    'GLASS DISPLAY CABINETS WIPED AND FINGERPRINT-FREE':'GLASS DISPLAY CABINETS WIPED',
  };
  DB.checklist.items.forEach(it=>{ if(renameTasks[it[2]]) it[2]=renameTasks[it[2]]; });
  const has=(dept,text)=>DB.checklist.items.some(it=>it[0]===dept&&it[2]===text);
  const addAfter=(dept,after,row)=>{
    if(has(dept,row[2])) return;
    const idx=DB.checklist.items.findIndex(it=>it[0]===dept&&it[2]===after);
    if(idx>=0) DB.checklist.items.splice(idx+1,0,row); else DB.checklist.items.push(row);
  };
  const addManagerPhoto=(row)=>{ if(!has('MANAGER',row[2])) DB.checklist.items.push(row); };
  addAfter('GROCERY','KEY VALUE ITEMS ARE FILLED UP',
    ['GROCERY','Grocery','PRODUCTS ARE WELL ORGANISED WITH NO EMPTY GAPS ON SHELVES','A','O']);
  addAfter('FROZEN & DAIRY','KEY VALUE ITEMS ARE FILLED UP',
    ['FROZEN & DAIRY','Frozen & Dairy','PRODUCTS ARE WELL ORGANISED WITH NO EMPTY GAPS ON SHELVES','A','O']);
  addManagerPhoto(['MANAGER','Cool Room / Frozen Room','OPENING COOL ROOM PHOTO — WELL ORGANISED, STOCK OFF FLOOR AND WALKWAY CLEAR','O','R1-5']);
  addManagerPhoto(['MANAGER','Cool Room / Frozen Room','OPENING FROZEN ROOM PHOTO — WELL ORGANISED, STOCK OFF FLOOR AND WALKWAY CLEAR','O','R1-5']);
  addManagerPhoto(['MANAGER','Cool Room / Frozen Room','CLOSING COOL ROOM PHOTO — WELL ORGANISED, STOCK OFF FLOOR AND WALKWAY CLEAR','C','R1-5']);
  addManagerPhoto(['MANAGER','Cool Room / Frozen Room','CLOSING FROZEN ROOM PHOTO — WELL ORGANISED, STOCK OFF FLOOR AND WALKWAY CLEAR','C','R1-5']);
}
normalizeChecklistTemplate();
/* ============================================================
   CLEANING & MAINTENANCE — editable WEEKLY schedule (per department).
   Each task is scheduled on weekdays (days[]); scheduled day cells show
   yellow and the manager ticks them off (DB.scheduleTicks, per week).
   Admin / Super Admin can add, edit days, reassign or delete tasks.
   ============================================================ */
DB.scheduleTasks = [
  // ---- CLEANING ----
  {type:'cleaning', dept:'Whole store', task:'Pest control — cockroach & rodent treatment + bait-station check', days:['Tue'], who:'External / Manager', freq:'Weekly'},
  {type:'cleaning', dept:'Cashier', task:'Deep-clean tills, weighing scales & EFTPOS units', days:['Mon','Thu'], who:'Cashier', freq:'2× / week'},
  {type:'cleaning', dept:'Cashier', task:'Clean & sanitise checkout belts, bag stands & counters', days:['Wed','Sat'], who:'Cashier', freq:'2× / week'},
  {type:'cleaning', dept:'FV', task:'Deep-clean cutting area, knives, boards & coolroom', days:['Mon','Thu'], who:'FV Team', freq:'2× / week'},
  {type:'cleaning', dept:'Butcher', task:'Deep-clean band-saw, blocks, mincer & coldroom', days:['Mon','Wed','Fri'], who:'Butcher', freq:'3× / week'},
  {type:'cleaning', dept:'Frozen & Dairy', task:'Defrost, wipe & sanitise freezers / fridges', days:['Wed'], who:'Grocery Team', freq:'Weekly'},
  {type:'cleaning', dept:'Grocery', task:'Dust top shelves, signage & light fittings', days:['Sun'], who:'Grocery Team', freq:'Weekly'},
  {type:'cleaning', dept:'Café', task:'Descale coffee machine & deep-clean equipment', days:['Mon'], who:'Café', freq:'Weekly'},
  {type:'cleaning', dept:'Storefront', task:'Clean entrance glass doors, windows & door tracks', days:['Tue','Fri'], who:'Cleaner', freq:'2× / week'},
  {type:'cleaning', dept:'Whole store', task:'Machine-scrub & mop the shop floor', days:['Sun'], who:'Cleaner', freq:'Weekly'},
  {type:'cleaning', dept:'Whole store', task:'Wash & sanitise all bins and the bin area', days:['Mon','Wed','Fri','Sun'], who:'Cleaner', freq:'4× / week'},
  {type:'cleaning', dept:'Amenities', task:'Deep-clean staff & customer toilets', days:['Mon','Thu','Sat'], who:'Cleaner', freq:'3× / week'},
  // ---- MAINTENANCE ----
  {type:'maintenance', dept:'Refrigeration', task:'Refrigeration technician service — coolrooms, fridges & freezers', days:['Wed'], who:'External technician', freq:'Fortnightly'},
  {type:'maintenance', dept:'Refrigeration', task:'Clean condenser coils & replace fridge filters', days:['Mon'], who:'Frozen & Dairy', freq:'Weekly'},
  {type:'maintenance', dept:'Forklift', task:'Forklift & pallet-jack inspection / service', days:['Mon'], who:'External technician', freq:'Monthly'},
  {type:'maintenance', dept:'Electrical', task:'Test & tag, RCD / safety-switch test', days:['Fri'], who:'Electrician', freq:'As scheduled'},
  {type:'maintenance', dept:'Safety', task:'Fire extinguishers, exit lights & alarm test', days:['Fri'], who:'Fire contractor', freq:'As scheduled'},
  {type:'maintenance', dept:'IT', task:'POS / EFTPOS / scanner & printer service', days:['Tue'], who:'IT contractor', freq:'Monthly'},
  {type:'maintenance', dept:'Plumbing', task:'Grease-trap & drains inspection', days:['Thu'], who:'Plumber', freq:'Fortnightly'},
  {type:'maintenance', dept:'Building', task:'Roller doors, gates & trolley repairs', days:['Wed'], who:'Maintenance', freq:'Monthly'},
];
DB.scheduleTasks.forEach(function(t,i){ t.id='sch'+(i+1); });
DB.scheduleTicks = {};   // key: `${weekStart}|${taskId}|${day}` -> true (manager ticked)
DB.scheduleHistory = []; // completed cleaning / maintenance records with staff, note and photo evidence
DB.binAdmin = {
  activeDays:['Tue','Thu','Fri'],
  checklist:[
    {id:'bin-area', task:'BINS MOVED TO COLLECTION AREA'},
    {id:'bin-count', task:'BIN QUANTITY COUNTED AND ENTERED'},
    {id:'bin-photo', task:'PHOTO EVIDENCE CAPTURED'},
    {id:'bin-return', task:'BINS RETURNED TO DESIGNATED AREA'}
  ],
  records:[]
};

/* ============================================================
   STAFF MEMBERS  (sample supermarket roster)
   ============================================================ */
DB.staffSeedVersion = 1;   // bump to re-import the real employee master file into every store
DB.staff = [
  {"id": "E0001", "name": "THI THU HANH PHAN", "store": "Morley", "dept": "GROCERY", "role": "PACKER", "classification": "PACKER", "status": "Active", "active": 1, "cardId": "420165821", "gender": "Female", "address": "21 GOLDSWORTHY ENTRANCE", "suburb": "ALEXANDER HEIGHTS WA 6064", "dob": "1972-01-03", "phone": "0403056225", "country": "Australia", "email": "anhna.thi.tran@gmail.com", "tfn": "420 165 821", "start": "2017-07-09", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0002", "name": "AMANDEEP SINGH MAAN", "store": "Morley", "dept": "GROCERY", "role": "STOCKMEN", "classification": "STOCKMEN", "status": "Active", "active": 1, "cardId": "531521973", "gender": "Male", "address": "6 JAKOBSONS WAY", "suburb": "MORLEY  WA 6062", "dob": "1989-07-15", "phone": "0468430951", "country": "Australia", "email": "maan6178@gmail.com", "tfn": "531 521 973", "start": "2017-07-09", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0003", "name": "THI THUY CHINH LE", "store": "Morley", "dept": "BUTCHER", "role": "SEAFOOD", "classification": "SEAFOOD", "status": "Active", "active": 1, "cardId": "501539924", "gender": "Female", "address": "5 Henty Ct", "suburb": "Mirrabooka WA 6061", "dob": "1977-11-25", "phone": "0424366963", "country": "AUSTRALIA", "email": "chinhtuan_le@yahoo.com", "tfn": "501 539 924", "start": "2018-05-18", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0004", "name": "QUINN QUYNH NHI CHEN", "store": "Morley", "dept": "MANAGER", "role": "STORE MANAGER", "classification": "STORE MANAGER", "status": "Active", "active": 1, "cardId": "408130755", "gender": "Female", "address": "3C HARKINS STREET", "suburb": "WESTMINSTER WA 6061", "dob": "1995-09-10", "phone": "0450145868", "country": "Australia", "email": "quinnchen21@gmail.com", "tfn": "408 130 755", "start": "2024-07-18", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0005", "name": "THI HIEN NGUYEN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "190163854", "gender": "Female", "address": "6 CAMERON STREET", "suburb": "EMBLETON WA 6062", "dob": "1971-01-01", "phone": "0416341171", "country": "Australia", "email": "lisa.tran94@hotmail.com", "tfn": "190 163 854", "start": "2020-02-20", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0006", "name": "MICHAEL DANIEL THOROGOOD", "store": "Morley", "dept": "MANAGER", "role": "Customer Service Manager", "classification": "Customer Service Manager", "status": "Active", "active": 1, "cardId": "157684270", "gender": "Male", "address": "4B DELPHINE AV", "suburb": "DIANELLA WA 6059", "dob": "1963-03-12", "phone": "0404402303", "country": "Australia", "email": "thordean1@hotmail.com", "tfn": "157 684 270", "start": "2021-01-21", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0007", "name": "DEREK LAM", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "468522551", "gender": "Male", "address": "126 ORCHID AVE", "suburb": "BENNETT SPRINGS WA 6063", "dob": "2008-07-03", "phone": "0410649834", "country": "Australia", "email": "dereklam.07@gmail.com", "tfn": "468 522 551", "start": "2022-03-17", "basis": "Individual", "category": "Permanent", "estatus": "Casual"},
  {"id": "E0008", "name": "VAN CHIN LE", "store": "Morley", "dept": "GROCERY", "role": "STOCKMEN", "classification": "STOCKMEN", "status": "Active", "active": 1, "cardId": "605119231", "gender": "Male", "address": "UNIT 4, 398 WALTER ROAD WEST", "suburb": "MORLEY WA 6062", "dob": "1994-12-15", "phone": "0423762045", "country": "Australia", "email": "levanchin93@gmail.com", "tfn": "605 119 231", "start": "2022-10-03", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0009", "name": "THI NGOC HUONG(CIARA VU", "store": "Morley", "dept": "OFFICE", "role": "BUSINESS ANALYST", "classification": "BUSINESS ANALYST", "status": "Active", "active": 1, "cardId": "683106038", "gender": "Female", "address": "31A IVANHOE STREET", "suburb": "BASSENDEAN WA 6054", "dob": "1997-01-06", "phone": "0451129994", "country": "Australia", "email": "vuthingochuong2210@gmail.com", "tfn": "683 106 038", "start": "2023-04-13", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0010", "name": "KARMA LHAKI", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "297613573", "gender": "Female", "address": "18 MURIEL AVENUE", "suburb": "INNALOO WA 6018", "dob": "2002-11-10", "phone": "0405256529", "country": "Australia", "email": "lhakikarma2002@gmail.com", "tfn": "297 613 573", "start": "2023-11-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0011", "name": "KIM PHUNG TRAN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "412604725", "gender": "Female", "address": "37 BERMUDA DRIVE", "suburb": "BALLAJURA WA 6066", "dob": "1970-10-11", "phone": "0424940943", "country": "Australia", "email": "tran.phung1479@gmail.com", "tfn": "412 604 725", "start": "2019-12-27", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0012", "name": "SONAM NIMA", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "666789662", "gender": "", "address": "9/189 NORTH BEACH DRIVE", "suburb": "", "dob": "", "phone": "0451651997", "country": "Australia", "email": "sonamhammer97@gmail.com", "tfn": "", "start": "", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0013", "name": "THI QUYNH THI NGUYEN", "store": "Morley", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "667247679", "gender": "Female", "address": "31 BALGONIE AVENUE", "suburb": "GIRRAWHEEN WA 6064", "dob": "2001-12-19", "phone": "0401467661", "country": "Australia", "email": "quynhthy19.12@icloud.com", "tfn": "667 247 679", "start": "2024-08-02", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0014", "name": "CHRISTINA DOAN", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "682569206", "gender": "", "address": "9 CAMROSE LANE", "suburb": "", "dob": "", "phone": "0466116371", "country": "Australia", "email": "quyen.vo1@icloud.com", "tfn": "", "start": "", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0015", "name": "THI PHUONG TRANG HUYNH", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "960267927", "gender": "Female", "address": "", "suburb": "", "dob": "", "phone": "0450747189", "country": "Australia", "email": "tranghuynhcfc@gmail.com", "tfn": "", "start": "", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0016", "name": "THI KIM DUNG BUI", "store": "Morley", "dept": "OFFICE", "role": "ACCOUNTANT", "classification": "ACCOUNTANT", "status": "Active", "active": 1, "cardId": "348813433", "gender": "Female", "address": "35 Ullinger Loop", "suburb": "Marangaroo WA 6064", "dob": "1981-05-26", "phone": "0449130610", "country": "Australia", "email": "buithikimdung81@gmail.com", "tfn": "348 813 433", "start": "2024-01-08", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0017", "name": "MINH NHAT NGUYEN", "store": "Morley", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "655994561", "gender": "Male", "address": "150 St Kilda Rd", "suburb": "Rivervale WA 6103", "dob": "2005-10-16", "phone": "0433095820", "country": "Australia", "email": "anthonynguyen1346@gmail.com", "tfn": "655 994 561", "start": "2024-01-12", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0018", "name": "VAN NAM (Cleaner) PHAN", "store": "Morley", "dept": "", "role": "CLEANER", "classification": "CLEANER", "status": "Active", "active": 1, "cardId": "212014344", "gender": "Male", "address": "49 Hudson Ave", "suburb": "Girrawheen WA 6064", "dob": "1957-06-21", "phone": "0402521630", "country": "Australia", "email": "", "tfn": "212 014 344", "start": "2024-12-28", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0019", "name": "VAN HUY PHAN", "store": "Morley", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "662833365", "gender": "Male", "address": "17 Beryl Avenue", "suburb": "Shelley WA 6148", "dob": "1992-03-02", "phone": "0478521679", "country": "Australia", "email": "huy.phan0302@gmail.com", "tfn": "662 833 365", "start": "2024-12-30", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0020", "name": "LAM VY TRAN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "658294380", "gender": "Female", "address": "2 WITCHCLIFFE WAY", "suburb": "DIANELLA WA 6059", "dob": "2006-06-29", "phone": "0404696575", "country": "Australia", "email": "tlv2966@gmail.com", "tfn": "658 294 380", "start": "2025-10-04", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0021", "name": "UGYEN DECHEN WANGMO", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "654393843", "gender": "Female", "address": "86 Rosher Road", "suburb": "Lockridge WA 6054", "dob": "2000-01-21", "phone": "0452036626", "country": "Australia", "email": "ugyendwangmo@gmail.com", "tfn": "654 393 843", "start": "2025-09-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0022", "name": "SARA TRAN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "519968972", "gender": "Female", "address": "37 Watheroo Court", "suburb": "BALLAJURA WA 6066", "dob": "2006-02-16", "phone": "0424771848", "country": "Australia", "email": "transara6@gmail.com", "tfn": "519 968 972", "start": "2025-06-30", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0023", "name": "DEEPAK DHAMI", "store": "Morley", "dept": "FV", "role": "FRUIT & VEGGIES", "classification": "FRUIT & VEGGIES", "status": "Active", "active": 1, "cardId": "467484440", "gender": "Male", "address": "Unit 1, 3 Cambridge Street", "suburb": "Maylands WA 6051", "dob": "1995-07-19", "phone": "0452327268", "country": "Australia", "email": "dhamideepak09@gmail.com", "tfn": "467 484 440", "start": "2025-07-31", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0024", "name": "TSHERING YUDON", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "590619554", "gender": "Female", "address": "60 Golf View Street", "suburb": "Yokine WA 6060", "dob": "1998-02-02", "phone": "0452589941", "country": "Australia", "email": "tsheringyouden7@gmail.com", "tfn": "590 619 554", "start": "2025-08-16", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0025", "name": "MINH NHAT LUONG", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "692774590", "gender": "Male", "address": "42 ELLERBY WAY", "suburb": "KOONDOOLA WA 6064", "dob": "2002-12-21", "phone": "0403869626", "country": "Australia", "email": "mnhat2002@gmail.com", "tfn": "692 774 590", "start": "2025-08-09", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0026", "name": "NHUT TIEN NGUYEN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "660675406", "gender": "Male", "address": "64B Nollamara Ave", "suburb": "Nollamara WA 6061", "dob": "2007-03-14", "phone": "0406963151", "country": "Australia", "email": "nhuttien.8c4@gmail.com", "tfn": "660 675 406", "start": "2025-04-10", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0027", "name": "LEVI JAY STANWYCK", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "243409416", "gender": "Male", "address": "", "suburb": "", "dob": "", "phone": "0427142750", "country": "Australia", "email": "levij2007@gmail.com", "tfn": "", "start": "", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0028", "name": "THUY DUONG TRAN", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "408323869", "gender": "", "address": "49 ULLINGER LOOP", "suburb": "", "dob": "", "phone": "0490214881", "country": "Australia", "email": "duongtran.hd@gmail.com", "tfn": "", "start": "", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0029", "name": "NGOC THANH NGUYEN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "474548652", "gender": "Female", "address": "200 Benara Road", "suburb": "Beechboro WA 6063", "dob": "1997-08-17", "phone": "0481320689", "country": "Australia", "email": "thanhnguyen161797@gmail.com", "tfn": "474 548 652", "start": "2025-03-11", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0030", "name": "THI ANH VI NGUYEN", "store": "Morley", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "528303135", "gender": "", "address": "29 MCKEON STREET", "suburb": "", "dob": "", "phone": "0430587779", "country": "Australia", "email": "vik32414@gmail.com", "tfn": "", "start": "", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0031", "name": "AMALIO KRISTOFER KAFIAR", "store": "Morley", "dept": "GROCERY", "role": "GROCERY STAFF", "classification": "GROCERY STAFF", "status": "Active", "active": 1, "cardId": "230125616", "gender": "Male", "address": "80 Stirling Street", "suburb": "Perth WA 6000", "dob": "2006-07-15", "phone": "0451507765", "country": "", "email": "kafiaramalio@gmail.com", "tfn": "230 125 616", "start": "2025-11-11", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0032", "name": "DUC TUNG TRAN", "store": "Morley", "dept": "GROCERY", "role": "STOCKMEN", "classification": "STOCKMEN", "status": "Active", "active": 1, "cardId": "427672703", "gender": "Male", "address": "16 BATES LOOP", "suburb": "LOCKRIDGE WA 6054", "dob": "1999-04-02", "phone": "0416464803", "country": "Australia", "email": "tung.dtran97@gmail.com", "tfn": "427 672 703", "start": "2025-12-28", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0033", "name": "BICH THANH DO", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "298878241", "gender": "Female", "address": "184 MARANGAROO DRIVE", "suburb": "GIRRAWHEEN WA 6064", "dob": "1995-11-06", "phone": "0457849847", "country": "Australia", "email": "jasminedo0711@gmail.com", "tfn": "298 878 241", "start": "2026-12-01", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0034", "name": "YEN NHI LE", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "253655684", "gender": "Female", "address": "36 Moulden Avenue", "suburb": "Yokine WA 6060", "dob": "2008-11-16", "phone": "0492969709", "country": "Australia", "email": "yennhile9900@gmail.com", "tfn": "253 655 684", "start": "2026-02-01", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0035", "name": "ARYAN GHORI", "store": "Morley", "dept": "FV", "role": "FRUIT & VEGGIES", "classification": "FRUIT & VEGGIES", "status": "Active", "active": 1, "cardId": "667454970", "gender": "Male", "address": "7A Mirador Road", "suburb": "Morley WA 6062", "dob": "2002-07-06", "phone": "0450393277", "country": "", "email": "aryanghori2@gmail.com", "tfn": "667 454 970", "start": "2026-02-16", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0036", "name": "JAMYANG CHODEN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "513930773", "gender": "Female", "address": "3/8 MARLBOROUGH STREET", "suburb": "MAYLANDS WA 6051", "dob": "2001-01-25", "phone": "0405799395", "country": "Australia", "email": "jamyanginfo@gmail.com", "tfn": "513 930 773", "start": "2026-02-26", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0037", "name": "HARKA BAHADUR THAPA", "store": "Morley", "dept": "FV", "role": "FRUIT & VEGGIES", "classification": "FRUIT & VEGGIES", "status": "Active", "active": 1, "cardId": "514537266", "gender": "Male", "address": "10 Cossington Court", "suburb": "Dianella WA 6059", "dob": "1999-01-03", "phone": "0478773127", "country": "Australia", "email": "khadkaharry22@gmail.com", "tfn": "514 537 266", "start": "2026-10-03", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0038", "name": "CHANEL NGUYEN", "store": "Morley", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "665225401", "gender": "Female", "address": "18 Dampier Loop", "suburb": "Mirrabooka WA 6061", "dob": "2006-01-20", "phone": "0480317053", "country": "", "email": "chanel1237@icloud.com", "tfn": "665 225 401", "start": "2026-03-24", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0039", "name": "NGAWANG JIGDREL", "store": "Morley", "dept": "FV", "role": "FRUIT & VEGGIES", "classification": "FRUIT & VEGGIES", "status": "Active", "active": 1, "cardId": "669330884", "gender": "Male", "address": "8/65 Flinders Street", "suburb": "Yokine WA 6060", "dob": "2003-11-09", "phone": "0452647195", "country": "", "email": "jigdrel003@gmail.com", "tfn": "669 330 884", "start": "2026-03-26", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0040", "name": "MOHD YOSUF AMANI", "store": "Armadale", "dept": "GROCERY", "role": "STOCKMAN", "classification": "STOCKMAN", "status": "Active", "active": 1, "cardId": "378905552", "gender": "Male", "address": "38B Evelyn Street", "suburb": "GOSNELLS WA 6110", "dob": "1984-03-21", "phone": "0434065211", "country": "AUSTRALIA", "email": "ajmal.amani85@yahoo.com", "tfn": "378 905 552", "start": "2017-07-01", "basis": "", "category": "", "estatus": ""},
  {"id": "E0041", "name": "THI HANH GALLAGHER", "store": "Armadale", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "559080177", "gender": "Female", "address": "92 POAD STREET", "suburb": "CHAMPION LAKES WA 6111", "dob": "1975-10-20", "phone": "0438773787", "country": "Australia", "email": "sari.76.hanh2@gmail.com", "tfn": "559 080 177", "start": "2025-03-27", "basis": "", "category": "", "estatus": ""},
  {"id": "E0042", "name": "TU NGA TRAN", "store": "Armadale", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "417854775", "gender": "Female", "address": "27 DWYER CRESCENT", "suburb": "GOSNELLS WA 6110", "dob": "1985-02-10", "phone": "0404479909", "country": "Australia", "email": "tututran19@gmail.com", "tfn": "417 854 775", "start": "2024-02-02", "basis": "", "category": "", "estatus": ""},
  {"id": "E0043", "name": "THI THINH NGUYEN", "store": "Armadale", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "227341874", "gender": "Female", "address": "24A Friar Road", "suburb": "Armadale WA 6112", "dob": "1977-08-10", "phone": "0481913374", "country": "Australia", "email": "nguyenthinh1977@myyahoo.com", "tfn": "227 341 874", "start": "2025-01-24", "basis": "", "category": "", "estatus": ""},
  {"id": "E0044", "name": "TASHI CHEZOM", "store": "Armadale", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "601792530", "gender": "Female", "address": "132A GERARD STREET", "suburb": "EAST CANNINGTON WA 6107", "dob": "1998-03-02", "phone": "0451600368", "country": "Australia", "email": "tashi.chezom06@gmail.com", "tfn": "601 792 530", "start": "2025-11-24", "basis": "", "category": "", "estatus": ""},
  {"id": "E0045", "name": "MELITA ANNISA PRATIWI", "store": "Armadale", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "669789549", "gender": "Female", "address": "3 WINCHESTER ROAD", "suburb": "ARMADALE WA 6112", "dob": "1991-05-21", "phone": "0414699090", "country": "Australia", "email": "melitaannisa21@gmail.com", "tfn": "669 789 549", "start": "2026-03-30", "basis": "", "category": "", "estatus": ""},
  {"id": "E0046", "name": "TAN TRUNG DUONG", "store": "Warehouse", "dept": "FV", "role": "FRUIT&VEG STOREMAN", "classification": "FRUIT&VEG STOREMAN", "status": "Active", "active": 1, "cardId": "434194455", "gender": "Male", "address": "5 VILBERIE CLOSE", "suburb": "KIARA WA 6054", "dob": "1979-12-29", "phone": "0434646759", "country": "AUSTRALIA", "email": "duongtant@yahoo.com", "tfn": "434 194 455", "start": "2011-07-01", "basis": "Individual", "category": "", "estatus": "PartTime"},
  {"id": "E0047", "name": "THONG MINH NGUYEN", "store": "Warehouse", "dept": "GROCERY", "role": "TRUCK DRIVER", "classification": "TRUCK DRIVER", "status": "Active", "active": 1, "cardId": "371043935", "gender": "Male", "address": "154B AMAZON DRIVE", "suburb": "BEECHBORO WA 6063", "dob": "1967-06-19", "phone": "0466892166", "country": "AUSTRALIA", "email": "minhtnguyen195@gmail.com", "tfn": "371 043 935", "start": "2026-01-01", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0048", "name": "MINH TRIEU VO", "store": "Warehouse", "dept": "GROCERY", "role": "PACKER", "classification": "PACKER", "status": "Active", "active": 1, "cardId": "396236246", "gender": "Male", "address": "339 BENARA ROAD", "suburb": "MORLEY WA 6062", "dob": "1964-07-01", "phone": "0402822026", "country": "AUSTRALIA", "email": "jennido68@gmail.com", "tfn": "396 236 246", "start": "2019-07-01", "basis": "Individual", "category": "", "estatus": "PartTime"},
  {"id": "E0049", "name": "THI TAM LY DANG", "store": "Warehouse", "dept": "GROCERY", "role": "PACKER", "classification": "PACKER", "status": "Active", "active": 1, "cardId": "205878894", "gender": "Female", "address": "8 VALLACK GROVE", "suburb": "MIRRABOOKA WA 6061", "dob": "1964-04-07", "phone": "0419049526", "country": "Australia", "email": "lydang2002@gmail.com", "tfn": "205 878 894", "start": "2021-02-04", "basis": "Individual", "category": "", "estatus": "PartTime"},
  {"id": "E0050", "name": "VAN TAM TRAN", "store": "Warehouse", "dept": "GROCERY", "role": "TRUCK DRIVER", "classification": "TRUCK DRIVER", "status": "Active", "active": 1, "cardId": "172685945", "gender": "Male", "address": "319 LANDSDALE ROAD", "suburb": "LANDSDALE WA 6065", "dob": "1968-06-02", "phone": "0455298143", "country": "Australia", "email": "Jason.v.t@hotmail.com", "tfn": "172 685 945", "start": "2026-01-01", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0051", "name": "THI NGHIEM TRAN", "store": "Warehouse", "dept": "GROCERY", "role": "PACKER", "classification": "PACKER", "status": "Active", "active": 1, "cardId": "342676224", "gender": "Female", "address": "46B WITTERING CRES", "suburb": "BALGA WA 6061", "dob": "1966-02-22", "phone": "0403121769", "country": "Australia", "email": "thinghiemtran66@hotmail.com", "tfn": "342 676 224", "start": "2021-12-09", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0052", "name": "THINLEY GALEY", "store": "Warehouse", "dept": "GROCERY", "role": "SUPPLY AND DISTRIBUTION MAN", "classification": "SUPPLY AND DISTRIBUTION MAN", "status": "Active", "active": 1, "cardId": "584573516", "gender": "Male", "address": "20A CARCOOLA STREET", "suburb": "NOLLAMARA WA 6021", "dob": "1987-07-27", "phone": "0468918667", "country": "Australia", "email": "gayley24@gmail.com", "tfn": "584 573 516", "start": "2023-04-17", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0053", "name": "NHAT HOA DUY THANH LE", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "398422843", "gender": "Male", "address": "19A WITTERING CRESCENT", "suburb": "BALGA WA 6061", "dob": "1983-09-26", "phone": "0451152626", "country": "Australia", "email": "leduythanh1983@yahoo.com", "tfn": "398 422 843", "start": "2023-05-29", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0054", "name": "FESTUS KIPKOGEI", "store": "Warehouse", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "104155008", "gender": "Male", "address": "34A WICKS STREET", "suburb": "EDEN HILL WA 6054", "dob": "2002-11-25", "phone": "0450499801", "country": "Australia", "email": "festuskipkogei05@gmail.com", "tfn": "104 155 008", "start": "2024-06-20", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0055", "name": "LEKEY DORJI", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "218577183", "gender": "Male", "address": "188 KOOYONG ROAD", "suburb": "RIVERVALE WA 6103", "dob": "1991-02-09", "phone": "0424458054", "country": "Australia", "email": "lekeydorji505@gmail.com", "tfn": "218 577 183", "start": "2024-07-22", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0056", "name": "BENJAMIN NHIM", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "465503665", "gender": "Male", "address": "78 AZELIA STREET", "suburb": "ALEXANDER HEIGHTS WA 6064", "dob": "2004-11-23", "phone": "0410837817", "country": "Australia", "email": "bennhim7@gmail.com", "tfn": "465 503 665", "start": "2024-09-09", "basis": "Individual", "category": "", "estatus": "PartTime"},
  {"id": "E0057", "name": "SONAM LHAMO", "store": "Warehouse", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "218573117", "gender": "Female", "address": "188 Kooyong Road", "suburb": "Rivervale WA 6103", "dob": "1990-08-28", "phone": "0406786242", "country": "Australia", "email": "lhamosonam690@gmail.com", "tfn": "218 573 117", "start": "2024-10-24", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0058", "name": "HAI DANG NGUYEN", "store": "Warehouse", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "677196742", "gender": "Male", "address": "12 THE AVENUE", "suburb": "ALEXANDER HEIGHTS WA 6064", "dob": "2003-10-20", "phone": "0478044567", "country": "Australia", "email": "dangnguyenhai20@gmail.com", "tfn": "677 196 742", "start": "2024-11-07", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0059", "name": "DAMON CORNISH", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "533929692", "gender": "Male", "address": "11 Glucina Road", "suburb": "Southern River WA 6110", "dob": "2005-08-15", "phone": "0415801508", "country": "Australia", "email": "damoncornish05@outlook.com", "tfn": "533 929 692", "start": "2024-12-05", "basis": "Individual", "category": "", "estatus": "PartTime"},
  {"id": "E0060", "name": "NIRONT SAMRETH", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "656945952", "gender": "Male", "address": "63 Ashburton Drive", "suburb": "Gosnells WA 6110", "dob": "2007-11-20", "phone": "0421797853", "country": "Australia", "email": "niront24@gmail.com", "tfn": "656 945 952", "start": "2025-02-18", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0061", "name": "MILAN GHALLEY", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "229597024", "gender": "Male", "address": "4/88 Cohn Street", "suburb": "Kewdale WA 6105", "dob": "1994-12-08", "phone": "0451429412", "country": "Australia", "email": "milanghalley222@gmail.com", "tfn": "229 597 024", "start": "2025-04-22", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0062", "name": "TSHERING YANGKI", "store": "Warehouse", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "659673575", "gender": "Female", "address": "21 Beverley Road", "suburb": "Cloverdale WA 6105", "dob": "1997-10-18", "phone": "0450344805", "country": "Australia", "email": "tsheringyangki1810@gmail.com", "tfn": "659 673 575", "start": "2025-05-22", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0063", "name": "SANGAY LHAMO", "store": "Warehouse", "dept": "GROCERY", "role": "PACKER", "classification": "PACKER", "status": "Active", "active": 1, "cardId": "101687558", "gender": "Female", "address": "188 Kooyoung Road", "suburb": "Rivervale WA 6103", "dob": "2006-12-20", "phone": "0413794865", "country": "Australia", "email": "sanglha2006@gmail.com", "tfn": "101 687 558", "start": "2025-08-02", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0064", "name": "DUY QUYEN PHAM", "store": "Warehouse", "dept": "GROCERY", "role": "TRUCK DRIVER", "classification": "TRUCK DRIVER", "status": "Active", "active": 1, "cardId": "655054314", "gender": "Male", "address": "9 BEESLEY COURT", "suburb": "SUCCESS WA 6164", "dob": "1987-03-30", "phone": "0452258879", "country": "Australia", "email": "phamduyquyen300387@gmail.co", "tfn": "655 054 314", "start": "2026-01-01", "basis": "Individual", "category": "", "estatus": "FullTime"},
  {"id": "E0065", "name": "THIEN PHUC TRAN", "store": "Warehouse", "dept": "MANAGER", "role": "Wholesale Account Manager", "classification": "Wholesale Account Manager", "status": "Active", "active": 1, "cardId": "438026791", "gender": "Male", "address": "33 Middleton Road", "suburb": "Alexander Heights WA 6064", "dob": "1997-09-11", "phone": "0435558585", "country": "Australia", "email": "phuctran3135@hotmail.com", "tfn": "438 026 791", "start": "2026-01-20", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0066", "name": "NAMGAY RINCHEN", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "669634760", "gender": "Male", "address": "159a Nicholson Road", "suburb": "Lynwood WA 6147", "dob": "1986-09-04", "phone": "0466495965", "country": "Australia", "email": "namgayr607@gmail.com", "tfn": "669 634 760", "start": "2026-03-09", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0067", "name": "BONFACE OMUSUGU KARANI", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "578833601", "gender": "Male", "address": "144 Edinbord Street", "suburb": "Joondanna WA 6060", "dob": "1997-03-21", "phone": "0478799303", "country": "Australia", "email": "bonfacekarani81@gmail.com", "tfn": "578 833 601", "start": "2026-05-11", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0068", "name": "PHU AN DUONG", "store": "Warehouse", "dept": "GROCERY", "role": "WAREHOUSE ASSISTANT", "classification": "WAREHOUSE ASSISTANT", "status": "Active", "active": 1, "cardId": "235852738", "gender": "Male", "address": "4 Dauphine Place", "suburb": "Joondalup WA 6027", "dob": "2003-11-10", "phone": "0437223245", "country": "Australia", "email": "duongphuan84@gmail.com", "tfn": "235 852 738", "start": "2026-05-14", "basis": "Individual", "category": "", "estatus": "Casual"},
  {"id": "E0069", "name": "PHAM HOANG PHUC BUI", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "470874166", "gender": "Male", "address": "", "suburb": "Alexander Heights WA 6064", "dob": "2000-01-10", "phone": "0458630177", "country": "Australia", "email": "oskarbui101@gmail.com", "tfn": "470 874 166", "start": "2024-11-23", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0070", "name": "NHUNG DINH", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "401231429", "gender": "Female", "address": "", "suburb": "DIANELLA WA 6059", "dob": "1971-05-20", "phone": "0479195095", "country": "Australia", "email": "nhungdinh197111@gmail.com", "tfn": "401 231 429", "start": "2024-12-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0071", "name": "VAN ANH LE", "store": "Mirrabooka", "dept": "CASHIER", "role": "Checkout Manager", "classification": "Checkout Manager", "status": "Active", "active": 1, "cardId": "973244262", "gender": "Female", "address": "", "suburb": "MIRRABOOKA WA 6061", "dob": "1997-06-15", "phone": "0416779981", "country": "Australia", "email": "levananh9673@gmail.com", "tfn": "973 244 262", "start": "2024-12-05", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0072", "name": "DANA TRUONG", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "696490158", "gender": "Female", "address": "", "suburb": "DARCH WA 6065", "dob": "2007-09-02", "phone": "0455596139", "country": "Australia", "email": "danatruong02@gmail.com", "tfn": "696 490 158", "start": "2024-12-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0073", "name": "TSHEWANG LHAMO", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "519901619", "gender": "Female", "address": "", "suburb": "BALGA WA 6061", "dob": "1998-10-01", "phone": "0421768559", "country": "Australia", "email": "tshewangl934@gmail.com", "tfn": "519 901 619", "start": "2024-12-05", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0074", "name": "TAN KHOI NGUYEN LE", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "219359895", "gender": "Male", "address": "", "suburb": "MIRRABOOKA WA 6061", "dob": "2005-12-09", "phone": "0450879697", "country": "Australia", "email": "letankhoinguyen@gmail.com", "tfn": "219 359 895", "start": "2024-12-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0075", "name": "PHUONG THU VU", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "238082633", "gender": "Female", "address": "", "suburb": "", "dob": "1988-06-24", "phone": "+61432307388", "country": "Australia", "email": "vpthu246@gmail.com", "tfn": "238 082 633", "start": "2024-12-05", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0076", "name": "THI TUONG VI LE", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "297447687", "gender": "Female", "address": "", "suburb": "YOKINE WA 6060", "dob": "1991-08-02", "phone": "0478241856", "country": "Australia", "email": "tuongvi2728@gmail.com", "tfn": "297 447 687", "start": "2024-12-19", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0077", "name": "THI NGOC DIEM PHAN", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "238089058", "gender": "Female", "address": "", "suburb": "MIRRABOOKA WA 6061", "dob": "1978-01-01", "phone": "0484075447", "country": "Australia", "email": "ngocdiem08cth@gmail.com", "tfn": "238 089 058", "start": "2025-01-16", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0078", "name": "VAN LOI NGUYEN", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "238088428", "gender": "Male", "address": "", "suburb": "MIRRABOOKA WA 6061", "dob": "1970-01-01", "phone": "0417818563", "country": "Australia", "email": "ngocdiem08cth@gmail.com", "tfn": "238 088 428", "start": "2025-02-04", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0079", "name": "HUU ANH NGUYEN", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "294722674", "gender": "Male", "address": "", "suburb": "MORLEY WA 6062", "dob": "2004-12-09", "phone": "0466642529", "country": "Australia", "email": "nguyenhuuanh123123000@gmail.com", "tfn": "294 722 674", "start": "2025-03-13", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0080", "name": "SONAM CHOKI", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "680336813", "gender": "Female", "address": "", "suburb": "Rivervale WA 6103", "dob": "2000-01-17", "phone": "0450805330", "country": "Australia", "email": "sonamchoki639@gmail.com", "tfn": "680 336 813", "start": "2025-03-11", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0081", "name": "UGYEN LHAMO", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "584583379", "gender": "Female", "address": "", "suburb": "BELMONT WA 6104", "dob": "1997-03-08", "phone": "0478141337", "country": "Australia", "email": "ugyenlhaamo08@gmail.com", "tfn": "584 583 379", "start": "2025-03-13", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0082", "name": "MAI KHANH THI NGUYEN", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "420578890", "gender": "Female", "address": "", "suburb": "Nollamara WA 6061", "dob": "1979-12-18", "phone": "0413656458", "country": "Australia", "email": "mainguyen181818@gmail.com", "tfn": "420 578 890", "start": "2025-05-16", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0083", "name": "NGUYEN LE", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "412484753", "gender": "Female", "address": "", "suburb": "ALEXANDER HEIGHTS WA 6064", "dob": "1979-07-30", "phone": "0466684527", "country": "Australia", "email": "tammylenguyen@hotmail.com", "tfn": "412 484 753", "start": "2025-05-22", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0084", "name": "VAN HA HOANG", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "347820275", "gender": "Male", "address": "", "suburb": "DIANELLA WA 6059", "dob": "1986-11-24", "phone": "0451191676", "country": "Australia", "email": "hvhauwa@gmail.com", "tfn": "347 820 275", "start": "2025-06-03", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0085", "name": "HIEP NGUYEN", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "658489500", "gender": "Male", "address": "", "suburb": "Rivervale WA 6103", "dob": "2007-08-12", "phone": "0436424250", "country": "Australia", "email": "hopebetterinlife007@gmail.com", "tfn": "658 489 500", "start": "2025-07-03", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0086", "name": "HUY HOANG BUI", "store": "Mirrabooka", "dept": "GROCERY", "role": "GROCERY ASSISTANT", "classification": "GROCERY ASSISTANT", "status": "Active", "active": 1, "cardId": "526993226", "gender": "Male", "address": "", "suburb": "Koondoola WA 6065", "dob": "2003-04-03", "phone": "0451893903", "country": "Australia", "email": "bhhoang0304@gmail.com", "tfn": "526 993 226", "start": "2025-07-03", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0087", "name": "XUAN THAO TRINH", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "191292013", "gender": "Female", "address": "", "suburb": "BALLAJURA WA 6066", "dob": "1975-06-09", "phone": "0478787578", "country": "Australia", "email": "jtrinh2006@gmail.com", "tfn": "191 292 013", "start": "2025-07-27", "basis": "Individual", "category": "Permanent", "estatus": "FullTime"},
  {"id": "E0088", "name": "LINH NGUYEN", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "204524239", "gender": "Female", "address": "", "suburb": "Dianella WA 6059", "dob": "1970-11-15", "phone": "0416328646", "country": "Australia", "email": "linhnguyen15111970@icloud.com", "tfn": "204 524 239", "start": "2025-09-19", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0089", "name": "SONAM YUDEN", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "659051234", "gender": "Female", "address": "", "suburb": "BAGA WA 6061", "dob": "2001-09-29", "phone": "0406547002", "country": "Australia", "email": "sonamyuden636@gmail.com", "tfn": "659 051 234", "start": "2025-09-18", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0090", "name": "PANHAYUT LOT", "store": "Mirrabooka", "dept": "BUTCHER", "role": "BUTCHER", "classification": "BUTCHER", "status": "Active", "active": 1, "cardId": "243501761", "gender": "Male", "address": "", "suburb": "KOONDOOLA WA 6064", "dob": "2008-04-03", "phone": "0413337402", "country": "Australia", "email": "panhayutlot@gmail.com", "tfn": "243 501 761", "start": "2025-10-24", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0091", "name": "MOHSEN JADERI", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "967906839", "gender": "Male", "address": "", "suburb": "Dianella WA 6059", "dob": "1984-03-28", "phone": "0432790564", "country": "", "email": "mohsen_jaderi@yahoo.com.au", "tfn": "967 906 839", "start": "2026-01-08", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0092", "name": "PHUONG ANH NGUYEN", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "583253495", "gender": "Female", "address": "", "suburb": "Balga WA 6061", "dob": "2003-01-12", "phone": "0424726801", "country": "", "email": "phanh120103@gmail.com", "tfn": "583 253 495", "start": "2026-02-06", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0093", "name": "HUU HAI LE", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "684740076", "gender": "Male", "address": "", "suburb": "Balga WA 6061", "dob": "1996-04-20", "phone": "0488713555", "country": "", "email": "romanhaicm@gmail.com", "tfn": "684 740 076", "start": "2026-02-14", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0094", "name": "THI DIEU NGUYEN", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "205463942", "gender": "Female", "address": "", "suburb": "Alexander Heights WA 6064", "dob": "1973-07-01", "phone": "0459165997", "country": "Australia", "email": "dieuthinguyen12@gmail.com", "tfn": "205 463 942", "start": "2026-02-12", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0095", "name": "THI HANG DINH", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "249093071", "gender": "Female", "address": "", "suburb": "Ballajura WA 6066", "dob": "1982-09-16", "phone": "0476981323", "country": "Australia", "email": "hang16961@gmail.com", "tfn": "249 093 071", "start": "2026-03-09", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0096", "name": "NIMA CHODEN", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "103713130", "gender": "Female", "address": "", "suburb": "Hamersly WA 6022", "dob": "2002-06-23", "phone": "0411750680", "country": "Australia", "email": "nimachoden541@gmail.com", "tfn": "103 713 130", "start": "2026-03-07", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0097", "name": "VAN CHIEU NGO", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "655885821", "gender": "Male", "address": "", "suburb": "Dianella WA 6059", "dob": "2000-02-12", "phone": "0466057644", "country": "Australia", "email": "ngovchieu1@gmail.com", "tfn": "655 885 821", "start": "2026-02-10", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0098", "name": "TSHERING NIDUP", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "669788864", "gender": "Male", "address": "", "suburb": "Tuart Hill WA 6060", "dob": "2001-10-04", "phone": "0451644376", "country": "", "email": "ngeozilsr1004@gmail.com", "tfn": "669 788 864", "start": "2026-03-14", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0099", "name": "KHUE THI MINH NGUYEN", "store": "Mirrabooka", "dept": "BUTCHER", "role": "BUTCHER", "classification": "BUTCHER", "status": "Active", "active": 1, "cardId": "416433529", "gender": "Female", "address": "", "suburb": "Ballajura WA 6066", "dob": "1977-11-28", "phone": "0400863542", "country": "Australia", "email": "khuenguyen1177@gmail.com", "tfn": "416 433 529", "start": "2026-02-24", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0100", "name": "THI TAM LE", "store": "Mirrabooka", "dept": "BUTCHER", "role": "BUTCHER", "classification": "BUTCHER", "status": "Active", "active": 1, "cardId": "856393587", "gender": "Female", "address": "", "suburb": "BALGA WA 6061", "dob": "1983-04-09", "phone": "0452221823", "country": "Australia", "email": "cobevuive_hoaphuongvi@yahoo.com", "tfn": "856 393 587", "start": "2026-03-10", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0101", "name": "DAVID TURNER", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "579165344", "gender": "Male", "address": "", "suburb": "Armadale WA 6112", "dob": "2006-12-13", "phone": "0436098808", "country": "", "email": "yurichiyt@gmail.com", "tfn": "579 165 344", "start": "2026-02-20", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0102", "name": "LE DUY TOAN TRAN", "store": "Mirrabooka", "dept": "GROCERY", "role": "WAREHOUSE STOCK WORKER", "classification": "WAREHOUSE STOCK WORKER", "status": "Active", "active": 1, "cardId": "462998844", "gender": "Male", "address": "", "suburb": "BALGA WA 6061", "dob": "1993-02-17", "phone": "0401119819", "country": "Australia", "email": "trantoancm@gmail.com", "tfn": "462 998 844", "start": "2026-03-20", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0103", "name": "HUY TRAN", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "300258311", "gender": "Male", "address": "", "suburb": "Marangaroo WA 6064", "dob": "2007-09-25", "phone": "0433851946", "country": "", "email": "zamakaxihuy@gmail.com", "tfn": "300 258 311", "start": "2026-04-08", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0104", "name": "VAN VIN NGUYEN", "store": "Mirrabooka", "dept": "FV", "role": "FRESH PRODUCE ASSISTANT", "classification": "FRESH PRODUCE ASSISTANT", "status": "Active", "active": 1, "cardId": "102003293", "gender": "Male", "address": "", "suburb": "Balga WA 6061", "dob": "1994-11-10", "phone": "0450510066", "country": "", "email": "winwin.ng94@gmail.com", "tfn": "102 003 293", "start": "2026-04-11", "basis": "Individual", "category": "Temporary", "estatus": "Casual"},
  {"id": "E0105", "name": "BA THACH NGUYEN", "store": "Mirrabooka", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "463360461", "gender": "Male", "address": "", "suburb": "Nollamara WA 6061", "dob": "1971-10-30", "phone": "0411665810", "country": "Australia", "email": "nguyenbathach6464@gmail.com", "tfn": "463 360 461", "start": "2026-04-09", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0106", "name": "HUYEN CHI VU", "store": "Mirrabooka", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "492252518", "gender": "Female", "address": "", "suburb": "LOCKRIDGE WA 6054", "dob": "2001-03-17", "phone": "0488181103", "country": "Australia", "email": "huyenchi2001@icloud.com", "tfn": "492 252 518", "start": "2026-04-09", "basis": "Individual", "category": "Permanent", "estatus": "PartTime"},
  {"id": "E0107", "name": "BA CONG NGUYEN", "store": "Malaga", "dept": "MANAGER", "role": "STORE MANAGER", "classification": "STORE MANAGER", "status": "Active", "active": 1, "cardId": "962453128", "gender": "Male", "address": "", "suburb": "BRABHAM WA 6055", "dob": "1996-05-01", "phone": "0402948379", "country": "", "email": "bacong199x@gmail.com", "tfn": "962 453 128", "start": "2017-10-01", "basis": "", "category": "", "estatus": ""},
  {"id": "E0108", "name": "HA TRANG DANG", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "999777184", "gender": "Female", "address": "", "suburb": "GIRRABHEEN WA 6064", "dob": "1991-12-12", "phone": "0416012821", "country": "", "email": "danghatrang12@gmail.com", "tfn": "999 777 184", "start": "2024-02-29", "basis": "", "category": "", "estatus": ""},
  {"id": "E0109", "name": "LIANG XIONG WEI", "store": "Malaga", "dept": "GROCERY", "role": "STOCKMAN", "classification": "STOCKMAN", "status": "Active", "active": 1, "cardId": "359585260", "gender": "Male", "address": "", "suburb": "BALGA WA 6061", "dob": "1967-09-22", "phone": "0478716689", "country": "", "email": "leonliangwei@outlook.com", "tfn": "359 585 260", "start": "2024-12-02", "basis": "", "category": "", "estatus": ""},
  {"id": "E0110", "name": "KIM SAO NGUYEN", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "437776193", "gender": "Female", "address": "", "suburb": "NOLLAMARA WA 6061", "dob": "1973-12-26", "phone": "0410500996", "country": "", "email": "nguyensaokim@gmail.com", "tfn": "437 776 193", "start": "2018-01-27", "basis": "", "category": "", "estatus": ""},
  {"id": "E0111", "name": "THI THU HUYEN HOANG", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "414021100", "gender": "Female", "address": "", "suburb": "MORLEY WA 6062", "dob": "1976-10-10", "phone": "0404088979", "country": "", "email": "hoangthi1076@yahoo.com.au", "tfn": "414 021 100", "start": "2020-03-19", "basis": "", "category": "", "estatus": ""},
  {"id": "E0112", "name": "THI PHUONG THUY NGUYEN", "store": "Malaga", "dept": "GROCERY", "role": "PACKING", "classification": "PACKING", "status": "Active", "active": 1, "cardId": "874912918", "gender": "Female", "address": "", "suburb": "BALLAJURA WA 6066", "dob": "1975-06-26", "phone": "0450230009", "country": "", "email": "hellentran2007@gmail.com", "tfn": "874 912 918", "start": "2020-09-03", "basis": "", "category": "", "estatus": ""},
  {"id": "E0113", "name": "THI TRA MY HOANG", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "858685723", "gender": "Female", "address": "", "suburb": "MORLEY WA 6062", "dob": "1991-12-13", "phone": "0413566846", "country": "", "email": "myhoang0911@gmail.com", "tfn": "858 685 723", "start": "2024-03-14", "basis": "", "category": "", "estatus": ""},
  {"id": "E0114", "name": "THINH BA NGUYEN", "store": "Malaga", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "582201018", "gender": "Male", "address": "", "suburb": "BRABHAM WA 6055", "dob": "2003-12-08", "phone": "0451650812", "country": "", "email": "nbtcups041@gmail.com", "tfn": "582 201 018", "start": "2022-11-24", "basis": "", "category": "", "estatus": ""},
  {"id": "E0115", "name": "THUY LINH NGUYEN", "store": "Malaga", "dept": "GROCERY", "role": "STOCKMAN", "classification": "STOCKMAN", "status": "Active", "active": 1, "cardId": "583532995", "gender": "Female", "address": "", "suburb": "BRABHAM WA 6055", "dob": "2004-09-26", "phone": "0404225717", "country": "", "email": "tling269@gmail.com", "tfn": "583 532 995", "start": "2022-12-06", "basis": "", "category": "", "estatus": ""},
  {"id": "E0116", "name": "THI CHAU LINH VO", "store": "Malaga", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "295739727", "gender": "Female", "address": "", "suburb": "KOONDOOLA WA 6064", "dob": "1980-01-28", "phone": "0472795023", "country": "", "email": "vochaulinh.dn@gmail.com", "tfn": "295 739 727", "start": "2023-03-22", "basis": "", "category": "", "estatus": ""},
  {"id": "E0117", "name": "THI KIEU LOAN BUI", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "297472483", "gender": "Female", "address": "", "suburb": "BALLAJURA WA 6066", "dob": "2001-02-19", "phone": "0497197521", "country": "", "email": "buikieuloan192@gmail.com", "tfn": "297 472 483", "start": "2023-08-15", "basis": "", "category": "", "estatus": ""},
  {"id": "E0118", "name": "THI MINH ANH LAI", "store": "Malaga", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "664294584", "gender": "Female", "address": "", "suburb": "BALLAJURA WA 6066", "dob": "2005-11-02", "phone": "0403678808", "country": "", "email": "laithiminhanh2005@gmail.com", "tfn": "664 294 584", "start": "2024-03-14", "basis": "", "category": "", "estatus": ""},
  {"id": "E0119", "name": "DUC LONG DANG", "store": "Malaga", "dept": "", "role": "", "classification": "", "status": "Active", "active": 1, "cardId": "103489484", "gender": "Male", "address": "", "suburb": "BALGA WA 6061", "dob": "2004-06-19", "phone": "0435826429", "country": "", "email": "luffylong123@gmail.com", "tfn": "103 489 484", "start": "2024-05-09", "basis": "", "category": "", "estatus": ""},
  {"id": "E0120", "name": "PHUC DINH BAO NGUYEN", "store": "Malaga", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "663234028", "gender": "Male", "address": "", "suburb": "Kingsley WA 6026", "dob": "2008-04-03", "phone": "0415064323", "country": "", "email": "phuccter1967@gmail.com", "tfn": "663 234 028", "start": "2024-11-25", "basis": "", "category": "", "estatus": ""},
  {"id": "E0121", "name": "TRINH GIA HAN PHAN", "store": "Malaga", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "601098599", "gender": "Female", "address": "", "suburb": "Girrawheen WA 6064", "dob": "2009-06-15", "phone": "0478368092", "country": "", "email": "hanaphanzeronine@gmail.com", "tfn": "601 098 599", "start": "2025-02-27", "basis": "", "category": "", "estatus": ""},
  {"id": "E0122", "name": "THI ANH THUONG PHAM", "store": "Malaga", "dept": "CASHIER", "role": "CASHIER", "classification": "CASHIER", "status": "Active", "active": 1, "cardId": "230401972", "gender": "Female", "address": "", "suburb": "Ballajura WA 6066", "dob": "1986-07-16", "phone": "0432505187", "country": "", "email": "anhthuongpham@gmail.com", "tfn": "230 401 972", "start": "2025-04-01", "basis": "", "category": "", "estatus": ""},
  {"id": "E0123", "name": "HUNG QUOC NGUYEN", "store": "Malaga", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "404059350", "gender": "Male", "address": "", "suburb": "Caversham WA 6055", "dob": "1969-11-29", "phone": "0450989810", "country": "", "email": "hungnguyen291169@gmail.com", "tfn": "404 059 350", "start": "2025-05-09", "basis": "", "category": "", "estatus": ""},
  {"id": "E0124", "name": "THANH HOANG HAI", "store": "Malaga", "dept": "GROCERY", "role": "STOCKMAN", "classification": "STOCKMAN", "status": "Active", "active": 1, "cardId": "437640094", "gender": "Female", "address": "", "suburb": "BALLAJURA WA 6066", "dob": "1981-10-23", "phone": "0406832860", "country": "", "email": "thanh_hoanghai2000@yahoo.com", "tfn": "437 640 094", "start": "2025-08-07", "basis": "", "category": "", "estatus": ""},
  {"id": "E0125", "name": "GAYLEK TASHI NAMGYEL", "store": "Malaga", "dept": "GROCERY", "role": "STORE ASSISTANT", "classification": "STORE ASSISTANT", "status": "Active", "active": 1, "cardId": "253883580", "gender": "Male", "address": "", "suburb": "Dianella WA 6059", "dob": "2004-09-16", "phone": "0451221604", "country": "", "email": "gaylektnamgyel2004@gmail.com", "tfn": "253 883 580", "start": "2026-01-30", "basis": "", "category": "", "estatus": ""},
  {"id": "E0126", "name": "DUC THANG TONG", "store": "Malaga", "dept": "MANAGER", "role": "RETAIL MANAGER", "classification": "RETAIL MANAGER", "status": "Active", "active": 1, "cardId": "512909598", "gender": "Male", "address": "", "suburb": "Beechboro WA 6063", "dob": "1990-10-08", "phone": "0493546986", "country": "", "email": "thangtd810@gmail.com", "tfn": "512 909 598", "start": "2026-05-11", "basis": "", "category": "", "estatus": ""},
];
DB.staffRoles = ['Head Office','Store Manager','Assistant Manager','Supervisor','Cashier / Front End','FV Team','Grocery Team','Butcher','Café','Warehouse / Logistics','Driver','Cleaner'];

/* ============================================================
   ORG STRUCTURE  (for the staff-structure org chart)
   ============================================================ */
DB.structure = [
  {dept:'Store Leadership', color:'#4f46e5', head:'Tony Lam — Head Office', members:['Linh Nguyen — Store Manager (Morley)','Hung Vo — Assistant Manager (Subiaco)'], newStaff:[]},
  {dept:'Front End / Cashier', color:'#0ea5e9', head:'Sarah Nguyen — Front End Lead', members:['Anna Bui — Cashier','Cashier team ×6'], newStaff:['New cashier starters']},
  {dept:'Fruit & Veg', color:'#10b981', head:'James Pham — FV Lead', members:['Kim Ha — FV Team','Cutting & packing team ×4'], newStaff:['New FV starters']},
  {dept:'Grocery', color:'#f59e0b', head:'Karsang Dorji — Grocery Lead', members:['Tuan Nguyen — Grocery Team','Frozen & dairy team ×3'], newStaff:['New grocery starters']},
  {dept:'Butcher', color:'#ef4444', head:'David Tran — Head Butcher', members:['Minh Pham — Butcher','Back storage team ×2'], newStaff:['New butcher starters']},
  {dept:'Café', color:'#8b5cf6', head:'Mai Le — Café Lead', members:['Lucy Tran — Café','Kitchen team ×3'], newStaff:['New cafe starters']},
  {dept:'Warehouse / Logistics', color:'#6d4c41', head:'Peter Do — Warehouse Lead', members:['Receiving & crates team ×4','Drivers ×7'], newStaff:['New warehouse starters']},
];
function normalizeStaffStructure(){
  if(!Array.isArray(DB.structure)) return;
  DB.structure.forEach((d,i)=>{
    if(!d) return;
    if(!Array.isArray(d.members)) d.members=[];
    if(!Array.isArray(d.newStaff)) d.newStaff=[];
    delete d.level;
    if(!d.color) d.color=['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#6d4c41'][i%7];
  });
}
normalizeStaffStructure();

/* ============================================================
   VIOLATION RULES catalog + escalation (verbal → written → final)
   ============================================================ */
DB.violationRules = [
  {code:'uniform',  title:'Uniform / name badge not worn correctly', category:'Presentation', severity:'Minor',   action:'Remind staff of uniform standard. Repeat breach requires manager follow-up.'},
  {code:'hygiene',  title:'Hygiene / PPE breach', category:'Food Safety', severity:'Major', action:'Stop task, correct immediately, retrain on hygiene expectations.'},
  {code:'temp',     title:'Temperature record missed or incorrect', category:'Food Safety', severity:'Major', action:'Manager to verify product safety and retrain on temperature process.'},
  {code:'checklist',title:'Daily checklist late / incomplete', category:'Compliance', severity:'Moderate', action:'Review checklist deadline and required evidence with responsible staff.'},
  {code:'cleaning', title:'Cleaning task not completed', category:'Cleanliness', severity:'Moderate', action:'Assign correction before close and record follow-up check.'},
  {code:'phone',    title:'Phone use during shift', category:'Conduct', severity:'Minor', action:'Verbal reminder. Escalate if repeated.'},
  {code:'service',  title:'Customer service issue', category:'Service', severity:'Moderate', action:'Manager to discuss incident and coach service standard.'},
  {code:'attendance',title:'Late arrival / missed shift procedure', category:'Attendance', severity:'Moderate', action:'Confirm reason, correct timesheet, monitor repeat pattern.'},
  {code:'cash',     title:'Cash / POS handling error', category:'Financial Control', severity:'Major', action:'Reconcile till, review CCTV if needed, retrain on cash procedure.'},
  {code:'expiry',   title:'Expired stock on shelf / markdown missed', category:'Food Safety', severity:'Major', action:'Remove stock immediately, review rotation process with team.'},
  {code:'other',    title:'Other', category:'Other', severity:'Minor', action:'Manager to review details and choose appropriate follow-up action.'},
];
DB.warningSteps = ['Verbal Discussion','Written Warning','Final Warning','Termination Referral'];

/* ============================================================
   SUPERMARKET RULES  (adaptedから restaurant rules)
   ============================================================ */
DB.rules = [
  {n:1, title:'Attendance & Rosters', body:'Arrive 10 minutes before your rostered shift. Clock in/out accurately. Notify your manager as early as possible if you cannot attend — never swap shifts without approval.'},
  {n:2, title:'Uniform & Presentation', body:'Wear the correct MCQ uniform and name badge at all times. Keep clothing clean and tidy. Closed shoes are mandatory on the shop floor and in the butcher / FV areas.'},
  {n:3, title:'Customer Service', body:'Greet and smile at every customer. Be helpful, polite and patient. Escalate complaints to the duty manager and log them in the Complaint module.'},
  {n:4, title:'Food Safety & Hygiene', body:'Wash hands regularly. Follow PPE rules in butcher, café and cutting areas. Record fridge/freezer temperatures on schedule. Never sell or display expired stock.'},
  {n:5, title:'Price & Labels', body:'Ensure shelf prices and promotional signage match the register. Report scanning errors immediately. Keep clearance and markdown labels current.'},
  {n:6, title:'Stock Rotation & Quality', body:'Practise FIFO. Check quality and use-by dates daily. Remove damaged packaging. Complete short-dated/expiry checks and markdowns as rostered.'},
  {n:7, title:'Cleanliness & Aisles', body:'Keep aisles clear of pallet jacks, bins and boxes. Clean spills immediately. Complete opening and closing cleaning tasks with photo evidence where required.'},
  {n:8, title:'Cash & POS', body:'Follow till procedures. Count floats accurately. Never leave a till unattended or share login PINs. Report discrepancies to the manager at once.'},
  {n:9, title:'Safety & Equipment', body:'Use forklifts, pallet jacks and the butcher bandsaw only if trained. Report any equipment fault or hazard via the Maintenance / Incident module immediately.'},
  {n:10,title:'Walkie-Talkie & Log Book', body:'Designated staff must carry their walkie-talkie and complete the log book each shift. Devices must be charged in the docks at close.'},
  {n:11,title:'Phone & Conduct', body:'No personal phone use during service. Treat colleagues with respect — bullying, harassment and discrimination are not tolerated.'},
  {n:12,title:'Security & Closing', body:'Follow the closing checklist. Lock all gates and roller doors. Set the alarm. Only authorised staff handle keys and cash drops.'},
];

/* ============================================================
   TRAINING topic templates (role → category → items)
   ============================================================ */
DB.trainingTopics = {
  'General':   {'Food Safety & Hygiene':['Hand washing','PPE use','Temperature awareness'],'Uniform & Presentation':['Correct uniform','Name badge'],'Conduct':['Phone policy','Respect & teamwork'],'Records':['Log book','Checklist evidence']},
  'Cashier':   {'Cashier Skills':['POS operation','Float & cash handling','Refunds & voids','Bagging'],'Customer Service':['Greeting','Handling complaints'],'Opening Tasks':['Till flow check','Fridge temp NO.1/NO.2'],'Closing Tasks':['Cabinets cleaned','Medical/cosmetic pull-out']},
  'FV':        {'FV Skills':['Display filling 8:30 & 2:00','Quality check','Cutting & packing','Spray & rotation'],'Cleanliness':['Floor & area cleaning','Crates in order'],'Records':['Fridge temperature']},
  'Grocery':   {'Grocery Skills':['Shelf facing & labels','Expiry & markdown','Key value items'],'Frozen & Dairy':['Fridge temp & clean','Tofu quality'],'Cleanliness':['Aisle clear & clean']},
  'Butcher':   {'Butcher Skills':['Tray gaps & display','Coldroom temperature','Crate labelling'],'Safety':['Bandsaw safety','PPE'],'Closing':['Trays wrapped & washed','Windows wiped']},
  'Café':      {'Café Skills':['Homemade item labels & temp','Appliance checks'],'Food Safety':['Hand washing','Allergen awareness']},
};

/* ============================================================
   HR / Management MODULES  (rendered by the generic engine)
   ============================================================ */
const SUPER_STORES = DB.stores; // 8 stores

DB.modules.violation = {
  id:'violation', label:'Violation Rules', short:'Violations', icon:'⚠️', accent:'#c62828', group:'hr', admin:true,
  desc:'Log staff rule breaches and manage verbal / written / final warnings.',
  idPrefix:'VIO',
  severities:['Minor','Moderate','Major'],
  statuses:['Open','Verbal Discussion','Written Warning','Final Warning','Resolved','Cancelled'],
  summary:'Record a staff rule breach',
  form:{ sections:[
    { title:'Who & When', hint:'Identify the staff member and when it happened.', fields:[
      { key:'staffName', label:'Staff member', type:'text', required:true },
      { key:'store', label:'Store', type:'select', options:SUPER_STORES, required:true },
      { key:'incidentDate', label:'Incident date', type:'date', required:true },
      { key:'incidentTime', label:'Incident time', type:'time' },
    ]},
    { title:'Breach', hint:'Pick the rule and severity.', fields:[
      { key:'category', label:'Rule', type:'select', required:true, options:DB.violationRules.map(r=>r.title) },
      { key:'severity', label:'Severity', type:'select', options:['Minor','Moderate','Major'], tone:true },
      { key:'description', label:'What happened', type:'textarea', full:true, required:true },
    ]},
    { title:'Action', hint:'Warning step follows the MCQ escalation: Verbal → Written → Final.', fields:[
      { key:'step', label:'Warning step', type:'select', options:['Verbal Discussion','Written Warning','Final Warning','Termination Referral'], tone:true },
      { key:'actionTaken', label:'Action taken', type:'textarea', full:true },
      { key:'followUpDate', label:'Follow-up date', type:'date' },
    ]},
  ]},
  columns:[
    {key:'id',label:'Ref',kind:'id'},{key:'staffName',label:'Staff'},{key:'store',label:'Store'},
    {key:'category',label:'Rule',kind:'wrap'},{key:'severity',label:'Severity',kind:'badge'},
    {key:'step',label:'Warning',kind:'badge'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Total cases',calc:'count'},
    {label:'Open',calc:'countWhereNotIn',field:'status',values:['Resolved','Cancelled'],tone:'info'},
    {label:'Written + Final',calc:'countWhereIn',field:'step',values:['Written Warning','Final Warning'],tone:'warn'},
    {label:'Major',calc:'countWhere',field:'severity',value:'Major',tone:'bad'},
  ], charts:[
    {type:'doughnut',title:'By warning step',group:'step'},
    {type:'bar',title:'By store',group:'store'},
    {type:'bar',title:'By rule',group:'category',horizontal:true},
  ]},
};

DB.modules.reward = {
  id:'reward', label:'Monthly Rewards', short:'Rewards', icon:'🏆', accent:'#2e7d32', group:'hr', admin:true,
  desc:'Decide and track monthly staff awards and goodwill amounts.',
  idPrefix:'RWD', severities:[], statuses:['Proposed','Approved','Paid'],
  summary:'Award a staff member',
  form:{ sections:[{ title:'Award', hint:'Pick the month, award and recipient.', fields:[
    { key:'rewardMonth', label:'Month', type:'month', required:true },
    { key:'awardType', label:'Award', type:'select', required:true, options:['Employee of the Month','Best Customer Service','Best Team Player','Perfect Attendance','Cleanliness Champion'] },
    { key:'staffName', label:'Staff member', type:'text', required:true },
    { key:'store', label:'Store', type:'select', options:SUPER_STORES },
    { key:'rewardAmount', label:'Reward amount ($)', type:'number' },
    { key:'notes', label:'Notes', type:'textarea', full:true },
  ]}]},
  columns:[
    {key:'rewardMonth',label:'Month'},{key:'awardType',label:'Award'},{key:'staffName',label:'Staff',kind:'wrap'},
    {key:'store',label:'Store'},{key:'rewardAmount',label:'Amount ($)',kind:'num'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Awards',calc:'count'},{label:'Paid',calc:'countWhere',field:'status',value:'Paid',tone:'ok'},
    {label:'Total $',calc:'sum',field:'rewardAmount',tone:'info'},{label:'Pending',calc:'countWhere',field:'status',value:'Proposed',tone:'warn'},
  ], charts:[{type:'doughnut',title:'By award',group:'awardType'},{type:'bar',title:'By store',group:'store'}]},
};

DB.modules.raise = {
  id:'raise', label:'Raise Salary Review', short:'Raises', icon:'💸', accent:'#6a1b9a', group:'hr', admin:true,
  desc:'Review and approve pay-rate changes for staff.',
  idPrefix:'RAI', severities:[], statuses:['Draft','Submitted','Approved','Declined'],
  summary:'Propose a pay review',
  form:{ sections:[{ title:'Review', hint:'Current vs proposed rate.', fields:[
    { key:'staffName', label:'Staff member', type:'text', required:true },
    { key:'store', label:'Store', type:'select', options:SUPER_STORES },
    { key:'reviewMonth', label:'Review month', type:'month' },
    { key:'currentRate', label:'Current rate ($/h)', type:'number' },
    { key:'proposedRate', label:'Proposed rate ($/h)', type:'number' },
    { key:'effectiveDate', label:'Effective date', type:'date' },
    { key:'managerNotes', label:'Manager notes', type:'textarea', full:true },
  ]}]},
  columns:[
    {key:'staffName',label:'Staff',kind:'wrap'},{key:'store',label:'Store'},{key:'currentRate',label:'Current ($/h)',kind:'num'},
    {key:'proposedRate',label:'Proposed ($/h)',kind:'num'},{key:'effectiveDate',label:'Effective'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Reviews',calc:'count'},{label:'Approved',calc:'countWhere',field:'status',value:'Approved',tone:'ok'},
    {label:'Submitted',calc:'countWhere',field:'status',value:'Submitted',tone:'warn'},{label:'Declined',calc:'countWhere',field:'status',value:'Declined',tone:'bad'},
  ], charts:[{type:'doughnut',title:'By status',group:'status'},{type:'bar',title:'By store',group:'store'}]},
};

DB.modules.birthday = {
  id:'birthday', label:'Birthday Giveaways', short:'Birthdays', icon:'🎂', accent:'#f9a825', group:'hr', admin:true,
  desc:'Track staff birthdays and plan their gift.',
  idPrefix:'BDY', severities:[], statuses:['Planned','Given'],
  summary:'Add a birthday',
  form:{ sections:[{ title:'Birthday', hint:'When and what gift.', fields:[
    { key:'staffName', label:'Staff member', type:'text', required:true },
    { key:'birthday', label:'Birthday', type:'date', required:true },
    { key:'favoriteGift', label:'Favourite gift', type:'text' },
    { key:'giftStatus', label:'Gift status', type:'select', options:['Planned','Given'] },
    { key:'notes', label:'Notes', type:'textarea', full:true },
  ]}]},
  columns:[
    {key:'staffName',label:'Staff',kind:'wrap'},{key:'birthday',label:'Birthday'},{key:'favoriteGift',label:'Gift'},
    {key:'store',label:'Store'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Birthdays',calc:'count'},{label:'Planned',calc:'countWhere',field:'status',value:'Planned',tone:'warn'},
    {label:'Given',calc:'countWhere',field:'status',value:'Given',tone:'ok'},{label:'This month',calc:'count',tone:'info'},
  ], charts:[{type:'doughnut',title:'By status',group:'status'},{type:'bar',title:'By store',group:'store'}]},
};

DB.modules.training = {
  id:'training', label:'Training Assessment', short:'Training', icon:'🎓', accent:'#c0392b', group:'hr',
  desc:'Run and score staff training sessions by role and topic.',
  idPrefix:'TRN', severities:[], statuses:['Scheduled','In Progress','Completed'],
  summary:'Start a training session',
  form:{ sections:[{ title:'Session', hint:'Who, role and date.', fields:[
    { key:'traineeName', label:'Trainee', type:'text', required:true },
    { key:'traineeRole', label:'Role', type:'select', options:Object.keys(DB.trainingTopics), required:true },
    { key:'trainerName', label:'Trainer', type:'text' },
    { key:'sessionDate', label:'Date', type:'date', required:true },
    { key:'shift', label:'Shift', type:'select', options:['Opening','Mid','Closing','Full'] },
    { key:'overallRating', label:'Overall rating', type:'select', options:['Excellent','Good','Satisfactory','Needs work'], tone:true },
    { key:'keyAchievements', label:'Key achievements', type:'textarea', full:true },
    { key:'needsImprovement', label:'Needs improvement', type:'textarea', full:true },
  ]}]},
  columns:[
    {key:'id',label:'Ref',kind:'id'},{key:'traineeName',label:'Trainee'},{key:'traineeRole',label:'Role'},
    {key:'trainerName',label:'Trainer'},{key:'sessionDate',label:'Date'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Sessions',calc:'count'},{label:'Completed',calc:'countWhere',field:'status',value:'Completed',tone:'ok'},
    {label:'In progress',calc:'countWhere',field:'status',value:'In Progress',tone:'warn'},{label:'Roles covered',calc:'count',tone:'info'},
  ], charts:[{type:'doughnut',title:'By role',group:'traineeRole'},{type:'bar',title:'By status',group:'status'}]},
};

DB.modules.issue = {
  id:'issue', label:'Report Issue', short:'Issues', icon:'🚩', accent:'#e53935', group:'reports',
  desc:'Report any operational issue or suggestion to Head Office.',
  idPrefix:'ISS', severities:['Low','Normal','High','Urgent'], statuses:['Open','In Progress','Resolved','Closed'],
  summary:'Raise an issue',
  form:{ sections:[{ title:'Issue', hint:'Tell us what is wrong.', fields:[
    { key:'category', label:'Category', type:'select', required:true, options:['Facilities','IT / POS','Safety','Stock','Staff','Customer','Suggestion','Other'] },
    { key:'title', label:'Title', type:'text', required:true },
    { key:'store', label:'Store', type:'select', options:SUPER_STORES },
    { key:'priority', label:'Priority', type:'select', options:['Low','Normal','High','Urgent'], tone:true },
    { key:'reportedBy', label:'Reported by', type:'text' },
    { key:'date', label:'Date', type:'date' },
    { key:'description', label:'Description', type:'textarea', full:true, required:true },
    { key:'photoUrl', label:'Photo / evidence URL', type:'text', full:true },
  ]}]},
  columns:[
    {key:'id',label:'Ref',kind:'id'},{key:'title',label:'Title',kind:'wrap'},{key:'category',label:'Category'},
    {key:'store',label:'Store'},{key:'priority',label:'Priority',kind:'badge'},{key:'status',label:'Status',kind:'badge'},
  ],
  records:[],
  analytics:{ kpis:[
    {label:'Issues',calc:'count'},{label:'Open',calc:'countWhereNotIn',field:'status',values:['Resolved','Closed'],tone:'info'},
    {label:'High + Urgent',calc:'countWhereIn',field:'priority',values:['High','Urgent'],tone:'bad'},{label:'Resolved',calc:'countWhere',field:'status',value:'Resolved',tone:'ok'},
  ], charts:[{type:'doughnut',title:'By category',group:'category'},{type:'bar',title:'By store',group:'store'},{type:'bar',title:'By priority',group:'priority'}]},
};

/* ---------- navigation groups (sidebar) ---------- */
DB.navGroups = [
  { id:'ops',    label:'Operations', icon:'fa-clipboard-list', items:['handover','history','binadmin','schedules','delivery'] },
  { id:'hr',     label:'Staff & HR', icon:'fa-users',          items:['structure','staff','schedule','performance','training','reward','raise','birthday'], admin:true },
  { id:'mgmt',   label:'Management', icon:'fa-user-shield',     items:['manager','storeconfig','analytics','photos','whatsapp','email','data'], admin:true },
  { id:'reports',label:'Reports & Rules', icon:'fa-flag',       items:['rules'] },
  { id:'lab',    label:'AI Lab', icon:'fa-robot',                items:['aiuse'], admin:true },
  { id:'account',label:'Account', icon:'fa-user-lock',          items:['profile','faceid'] },
];

/* ============================================================
   REPORT ISSUE — unified intake. Maintenance + Incident + Complaint
   are merged in here: each category routes to the right register
   (mod) so there is one place to report and no meaning overlap.
   ============================================================ */
DB.issueCategories = {
  // ── Maintenance & Facility → creates a Maintenance case ──
  refrigeration:{label:'Refrigeration',           icon:'fa-snowflake',          color:'#0277BD', group:'Maintenance & Facility', mod:'maintenance'},
  electrical:   {label:'Electrical',               icon:'fa-bolt',               color:'#F9A825', group:'Maintenance & Facility', mod:'maintenance'},
  plumbing:     {label:'Plumbing',                 icon:'fa-faucet-drip',        color:'#0288D1', group:'Maintenance & Facility', mod:'maintenance'},
  pos:          {label:'POS / EFTPOS',             icon:'fa-cash-register',      color:'#5E35B1', group:'Maintenance & Facility', mod:'maintenance'},
  it:           {label:'Printer / IT',             icon:'fa-print',              color:'#455A64', group:'Maintenance & Facility', mod:'maintenance'},
  forklift:     {label:'Forklift / Pallet Jack',   icon:'fa-truck-ramp-box',     color:'#6D4C41', group:'Maintenance & Facility', mod:'maintenance'},
  building:     {label:'Building / Door / Fixture',icon:'fa-door-open',          color:'#795548', group:'Maintenance & Facility', mod:'maintenance'},
  m_cleaning:   {label:'Cleaning / Pest',          icon:'fa-broom',              color:'#2E7D32', group:'Maintenance & Facility', mod:'maintenance'},
  kitchen_eq:   {label:'Kitchen Equipment',        icon:'fa-kitchen-set',        color:'#EF6C00', group:'Maintenance & Facility', mod:'maintenance'},
  butcher_eq:   {label:'Butcher Equipment',        icon:'fa-drumstick-bite',     color:'#C2185B', group:'Maintenance & Facility', mod:'maintenance'},
  m_safety:     {label:'Safety Hazard',            icon:'fa-triangle-exclamation',color:'#F57C00',group:'Maintenance & Facility', mod:'maintenance'},
  m_other:      {label:'Other (maintenance)',      icon:'fa-screwdriver-wrench', color:'#607D8B', group:'Maintenance & Facility', mod:'maintenance'},
  // ── Customer Complaint → creates a Complaint ──
  c_product:    {label:'Product quality',          icon:'fa-box',                color:'#C62828', group:'Customer Complaint', mod:'complaint'},
  c_price:      {label:'Price / scanning',         icon:'fa-tag',                color:'#0288D1', group:'Customer Complaint', mod:'complaint'},
  c_staff:      {label:'Staff attitude / service', icon:'fa-user-tie',           color:'#6A1B9A', group:'Customer Complaint', mod:'complaint'},
  c_clean:      {label:'Cleanliness',              icon:'fa-broom',              color:'#2E7D32', group:'Customer Complaint', mod:'complaint'},
  c_safety:     {label:'Safety',                   icon:'fa-triangle-exclamation',color:'#B71C1C',group:'Customer Complaint', mod:'complaint'},
  c_stock:      {label:'Stock availability',       icon:'fa-box-open',           color:'#E65100', group:'Customer Complaint', mod:'complaint'},
  c_online:     {label:'Online / social media',    icon:'fa-hashtag',            color:'#1565C0', group:'Customer Complaint', mod:'complaint'},
  c_other:      {label:'Other (complaint)',        icon:'fa-comment-dots',       color:'#D84315', group:'Customer Complaint', mod:'complaint'},
  // ── Safety & Incident → creates an Incident ──
  i_injury:     {label:'Staff injury',             icon:'fa-kit-medical',        color:'#C62828', group:'Safety & Incident', mod:'incident'},
  i_nearmiss:   {label:'Near miss',                icon:'fa-person-falling',     color:'#EF6C00', group:'Safety & Incident', mod:'incident'},
  i_equipment:  {label:'Equipment / facility damage',icon:'fa-helmet-safety',    color:'#F57C00', group:'Safety & Incident', mod:'incident'},
  i_property:   {label:'Property damage',          icon:'fa-house-crack',        color:'#8D6E63', group:'Safety & Incident', mod:'incident'},
  i_food:       {label:'Food safety internal issue',icon:'fa-utensils',          color:'#2E7D32', group:'Safety & Incident', mod:'incident'},
  i_security:   {label:'Security / theft concern', icon:'fa-shield-halved',      color:'#37474F', group:'Safety & Incident', mod:'incident'},
  i_vehicle:    {label:'Vehicle / loading dock',   icon:'fa-truck',              color:'#1565C0', group:'Safety & Incident', mod:'incident'},
  i_behaviour:  {label:'Behaviour / conflict',     icon:'fa-user-slash',         color:'#E53935', group:'Safety & Incident', mod:'incident'},
  i_other:      {label:'Other (incident)',         icon:'fa-circle-exclamation', color:'#546E7A', group:'Safety & Incident', mod:'incident'},
  // ── Operational → general issue ──
  low_stock:    {label:'Low Stock',                icon:'fa-box-open',           color:'#E65100', group:'Operational', mod:'issue'},
  supplier:     {label:'Supplier Delivery',        icon:'fa-truck-fast',         color:'#1565C0', group:'Operational', mod:'issue'},
  supplies:     {label:'Supply / Stock Request',   icon:'fa-cart-shopping',      color:'#00897B', group:'Operational', mod:'issue'},
  // ── People → general issue ──
  hr:           {label:'Salary / HR Issue',        icon:'fa-money-bill-wave',    color:'#7B1FA2', group:'People', mod:'issue'},
  timesheet:    {label:'Missed Clock-in / out',    icon:'fa-clock',              color:'#00796B', group:'People', mod:'issue'},
  // ── Other ──
  suggestion:   {label:'Idea / Suggestion',        icon:'fa-lightbulb',          color:'#F9A825', group:'Other', mod:'issue'},
  other:        {label:'Other',                    icon:'fa-circle-question',    color:'#546E7A', group:'Other', mod:'issue'},
};
DB.issueGroups = ['Maintenance & Facility','Customer Complaint','Safety & Incident','Operational','People','Other'];
/* per-category email routing (which recipients get notified) — default from group */
DB.issueEmailRoutes = {};
Object.entries(DB.issueCategories).forEach(([k,c])=>{ DB.issueEmailRoutes[k]=[...(_GROUP_RECIPIENTS[c.group]||['ho'])]; });
/* default recipients per checklist department (who gets the daily submission email) */
DB.checklistEmailRoutes = {};
((DB.checklist&&DB.checklist.depts)||[]).forEach(d=>{ DB.checklistEmailRoutes[d]=['ho','mgr']; });
/* priority (Low/Normal/High/Urgent) → module severity */
DB.prioToSeverity = { Low:'Low', Normal:'Medium', High:'High', Urgent:'Critical' };
DB.prioToComplaint = { Low:'Minor', Normal:'Moderate', High:'Major', Urgent:'Major' };
/* Maintenance/Incident/Complaint no longer have their own "New" form — report via Report Issue */
['complaint','maintenance','incident'].forEach(id=>{ if(DB.modules[id]) DB.modules[id].noNew=true; });

/* pages that are custom-rendered (not generic modules) */
DB.customPages = {
  issue:    { label:'Report Issue',    icon:'🚩', render:'renderIssue' },
  violation:{ label:'Violation Rules', icon:'⚠️', render:'renderViolation' },
  training: { label:'Training Assessment', icon:'🎓', render:'renderTraining' },
  reward:   { label:'Monthly Rewards', icon:'🏆', render:'renderReward', admin:true },
  raise:    { label:'Raise Salary Review', icon:'💸', render:'renderRaise', admin:true },
  birthday: { label:'Birthday Giveaways', icon:'🎂', render:'renderBirthday', admin:true },
  structure:{ label:'Staff Structure', icon:'🏢', render:'renderStructure' },
  staff:    { label:'Staff Members',   icon:'🧑‍🤝‍🧑', render:'renderStaff' },
  schedule: { label:'Job Schedule',    icon:'🗓️', render:'renderSchedule' },
  schedules:{ label:'Cleaning & Maintenance', icon:'🧽', render:'renderSchedules' },
  handover: { label:'Shift Handover', icon:'🔁', render:'renderHandover' },
  history:  { label:'Checklist History', icon:'🧾', render:'renderHistory' },
  binadmin: { label:'Bin Admin', icon:'🗑️', render:'renderBinAdmin' },
  performance:{ label:'Performance & Scoring', icon:'📊', render:'renderPerformance', admin:true },
  aiuse:    { label:'AI Lab',          icon:'🤖', render:'renderAIUse', admin:true },
  manager:  { label:'Manager Panel',   icon:'🛡️', render:'renderManager', admin:true },
  storeconfig:{ label:'Store Config',   icon:'🏪', render:'renderStoreConfig', admin:true, super:true },
  analytics:{ label:'Analytics',       icon:'📈', render:'renderAnalytics', admin:true },
  photos:   { label:'Photo Gallery',   icon:'🖼️', render:'renderPhotos', admin:true },
  whatsapp: { label:'WhatsApp Daily Share', icon:'💬', render:'renderWhatsapp', admin:true },
  email:    { label:'Email Notifications',  icon:'✉️', render:'renderEmail', admin:true },
  data:     { label:'Data Management', icon:'🗄️', render:'renderData', admin:true },
  rules:    { label:'Supermarket Rules', icon:'📖', render:'renderRules' },
  profile:  { label:'My Profile', icon:'👤', render:'renderEmployeeProfile' },
  faceid:   { label:'Face ID', icon:'🪪', render:'renderFaceId' },
  feedback: { label:'Share Your Thought', icon:'💬', render:'renderFeedback' },
};
