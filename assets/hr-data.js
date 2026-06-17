/* ============================================================
   MCQ Ops Hub — Supermarket HR / Management data (Stage 1)
   Extends DB (from data.js). Checklist content is the REAL
   store-wide checklist provided by the owner. HR feature data
   is adapted from the MCQ Mirrabooka Restaurant web app, redone
   for the supermarket departments.
   ============================================================ */

/* ---------- Auth & branches ---------- */
DB.branches = ['Morley','Mirrabooka','Malaga','Subiaco','Armadale','Beechboro Fresh','Market West','Warehouse'];
DB.auth = {
  adminPassword: '77771',                 // store admin — own store only
  superAdminPassword: '99999',             // super admin — ALL stores + cross-store compare
  branchPasswords: {                      // each branch has its OWN staff password
    'Morley':'1111', 'Mirrabooka':'2222', 'Malaga':'3333', 'Subiaco':'4444',
    'Armadale':'5555', 'Beechboro Fresh':'6666', 'Market West':'7000', 'Warehouse':'8000',
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
DB.emailConfig = { channel:'preview', apiKey:'', fromEmail:'', fromName:'MCQ Supermarket' };
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
  items: [
    // ---- MANAGER ----
    ['MANAGER','Opening','ALL STAFF HAVING PROPER UNIFORM AND NAME BADGE','O',0],
    ['MANAGER','Opening','ALL STAFF WORK THEIR ROSTERED SHIFT AS SCHEDULED','O',0],
    ['MANAGER','Opening','SHOP FLOOR LIGHTS TURN ON','O',0],
    ['MANAGER','Opening','BIN AREA EMPTY / TIDY','O','R1-5'],
    ['MANAGER','Opening','ALL DESIGNATED STAFF HAVING WALKIE-TALKIE DEVICE AND FILLING LOG BOOK PROPERLY','O','R1-2'],
    ['MANAGER','Closing','ALL STAFF HAVING PROPER UNIFORM AND NAME BADGE','C',0],
    ['MANAGER','Closing','ALL STAFF WORK THEIR ROSTERED SHIFT AS SCHEDULED','C',0],
    ['MANAGER','Closing','ALL GATES & ROLLER DOORS CLOSED AND LOCKED','C','O5'],
    ['MANAGER','Closing','BINS ARE EMPTY AND BIN AREA CLEAR','C','R1-2'],
    ['MANAGER','Closing','CAFE WATER TURN OFF AND ALL APPLIANCES WORKING','C',0],
    ['MANAGER','Closing','SHOP FLOOR LIGHTS TURN OFF','C',0],
    ['MANAGER','Closing','ALL WALKIE-TALKIE DEVICES CHARGED IN DOCKS AND LOG BOOK UP TO DATE','C','R1-2'],
    ['MANAGER','Temperature Checks','CASHIER - FRIDGE FRUIT SALAD NO.1 TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Cashier',equipment:'Fridge Fruit Salad No.1'}],
    ['MANAGER','Temperature Checks','CASHIER - FRIDGE HOMEMADE NO.2 TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Cashier',equipment:'Fridge Homemade No.2'}],
    ['MANAGER','Temperature Checks','CAFE - HOMEMADE / SUPPLIER FRIDGE TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Cafe',equipment:'Homemade / Supplier Fridge'}],
    ['MANAGER','Temperature Checks','FV - FRUIT DISPLAY FRIDGE TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'FV',equipment:'Fruit Display Fridge'}],
    ['MANAGER','Temperature Checks','FV - BACK DOOR COOLROOM TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'FV',equipment:'Back Door Coolroom'}],
    ['MANAGER','Temperature Checks','FROZEN & DAIRY - DAIRY FRIDGE TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Frozen & Dairy',equipment:'Dairy Fridge'}],
    ['MANAGER','Temperature Checks','FROZEN & DAIRY - FREEZER TEMPERATURE','O','R1-1',{temp:true,type:'freezer',dept:'Frozen & Dairy',equipment:'Freezer'}],
    ['MANAGER','Temperature Checks','BUTCHER - MEAT DISPLAY FRIDGE TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Butcher',equipment:'Meat Display Fridge'}],
    ['MANAGER','Temperature Checks','BUTCHER - COLDROOM TEMPERATURE','O','R1-1',{temp:true,type:'fridge',dept:'Butcher',equipment:'Coldroom'}],
    ['MANAGER','Temperature Checks','CASHIER - FRIDGE FRUIT SALAD NO.1 TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Cashier',equipment:'Fridge Fruit Salad No.1'}],
    ['MANAGER','Temperature Checks','CASHIER - FRIDGE HOMEMADE NO.2 TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Cashier',equipment:'Fridge Homemade No.2'}],
    ['MANAGER','Temperature Checks','CAFE - HOMEMADE / SUPPLIER FRIDGE TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Cafe',equipment:'Homemade / Supplier Fridge'}],
    ['MANAGER','Temperature Checks','FV - FRUIT DISPLAY FRIDGE TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'FV',equipment:'Fruit Display Fridge'}],
    ['MANAGER','Temperature Checks','FV - BACK DOOR COOLROOM TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'FV',equipment:'Back Door Coolroom'}],
    ['MANAGER','Temperature Checks','FROZEN & DAIRY - DAIRY FRIDGE TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Frozen & Dairy',equipment:'Dairy Fridge'}],
    ['MANAGER','Temperature Checks','FROZEN & DAIRY - FREEZER TEMPERATURE','C','R1-1',{temp:true,type:'freezer',dept:'Frozen & Dairy',equipment:'Freezer'}],
    ['MANAGER','Temperature Checks','BUTCHER - MEAT DISPLAY FRIDGE TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Butcher',equipment:'Meat Display Fridge'}],
    ['MANAGER','Temperature Checks','BUTCHER - COLDROOM TEMPERATURE','C','R1-1',{temp:true,type:'fridge',dept:'Butcher',equipment:'Coldroom'}],
    ['MANAGER','Opening','OVERNIGHT FRIDGE / FREEZER ALARMS CHECKED — ALL RECOVERED','O',0],
    ['MANAGER','Opening','CCTV AND SECURITY ALARM WORKING','O',0],
    ['MANAGER','Opening','FIRST-AID KIT STOCKED AND ACCESSIBLE','O',0],
    ['MANAGER','Opening','CASH FLOATS ISSUED TO TILLS AND RECORDED','O',0],
    ['MANAGER','Closing','CASH COUNTED, RECONCILED AND SECURED IN SAFE','C',0],
    ['MANAGER','Closing','STORE EMPTY OF CUSTOMERS — ALL DOORS SECURED','C',0],
    ['MANAGER','Closing','SECURITY ALARM ARMED AND CCTV RECORDING','C',0],
    ['MANAGER','Closing','FIRE EXITS CLEAR AND EMERGENCY LIGHTS WORKING','C',0],
    // ---- CASHIER ----
    ['CASHIER','Opening','TURN ON MUSIC','O',0],
    ['CASHIER','Opening','CUSTOMER SERVICE: GREETING AND SMILING TO CUSTOMERS','O',0],
    ['CASHIER','Opening','CAFE HOMEMADE + SUPPLIER ITEMS CORRECT LABEL AND WELL-ORGANISED','O','R1-5'],
    ['CASHIER','Opening','FLOWER DISPLAY','O',0],
    ['CASHIER','Opening','ORGANISE FV BOX AND TIDY UP BOXES AREA','O','R1-5'],
    ['CASHIER','Opening','CLEARANCE SHELF & BANNER PUSHED OUT','O',0],
    ['CASHIER','Opening','TILL FLOW CHECKED BY 7.50AM','O',0],
    ['CASHIER','Opening','BLACK GATES PUT AWAY','O',0],
    ['CASHIER','Opening','BASKETS & ROLLER DOOR','O',0],
    ['CASHIER','Opening','BAGS FILLED','O','O5'],
    ['CASHIER','Opening','CHECK QUALITY AND DATE OF STOCK IN FRIDGE','O',0],
    ['CASHIER','Opening','HOMEMADE ITEMS RECEIVED AND EXPIRED RETURNED','O',0],
    ['CASHIER','Opening','FLOWERS QUALITY CHECK','O',0],
    ['CASHIER','Opening','BREADS FILLED AND EXPIRY DATE CHECKED','O',0],
    ['CASHIER','Closing','CUSTOMER SERVICE: GREETING AND SMILING TO CUSTOMERS','C',0],
    ['CASHIER','Closing','RECEIPTS ROLL FILLED (REPORT TO MANAGER ORDER)','C','R1-2'],
    ['CASHIER','Closing','ALL TILLS AND CABINETS CLEANED AND PEST CONTROL SPRAYED','C','O3'],
    ['CASHIER','Closing','REFILL AND PULL OUT MEDICAL CABINETS','C','R1-5'],
    ['CASHIER','Closing','PULL OUT STOCK COSMETIC CABINET','C','R1-5'],
    ['CASHIER','Closing','TRASH TAKEN OUT','C',0],
    ['CASHIER','Closing','BREAD ORGANISED','C','R1-2'],
    ['CASHIER','Closing','CHINESE MEDICINE SHELF FACED UP','C','R1-2'],
    ['CASHIER','Closing','KNIVES CABINET FACES UP','C','R1-2'],
    ['CASHIER','Closing','DRINK FRIDGE FILLED','C','R1-2'],
    ['CASHIER','Closing','FV & GROC RETURNED','C',0],
    ['CASHIER','Closing','LOCKED UP ALL BLACK GATES','C',0],
    ['CASHIER','Opening','EFTPOS TERMINALS AND SCANNERS TESTED AND WORKING','O',0],
    ['CASHIER','Opening','HAND SANITISER AT COUNTER TOPPED UP','O',0],
    ['CASHIER','Opening','CHECKOUT BELTS AND SCALES WIPED CLEAN','O','R1-2'],
    ['CASHIER','Closing','TILL CASH COUNTED AND HANDED TO MANAGER','C',0],
    ['CASHIER','Closing','EFTPOS SETTLEMENT / BATCH DONE','C',0],
    // ---- FV ----
    ['FV','Fruit','AISLES CLEAR, NO PALLET JACK / BINS BLOCKING','A','R1-10'],
    ['FV','Fruit','ALL STOCK DISPLAY FILLED 8:30AM AND 2:00PM','A','R1-10'],
    ['FV','Fruit','FRUITS IN THE FRIDGE FILLED','A','R1-10'],
    ['FV','Fruit','QUALITY CHECKED','A',0],
    ['FV','Fruit','ROLL BAGS FILLED','A',0],
    ['FV','Fruit','FLOORS & FRUIT AREA CLEANED','A','R1-5'],
    ['FV','Fruit','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','ALL STOCK DISPLAY FILLED 8:30AM AND 2:00PM','A','R1-10'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','QUALITY CHECKED','A','O'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','ROLL BAGS FILLED','A','O'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','FLOORS & VEGE AREA CLEANED','A','R1-2'],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Veges (Eggplant–Onion, Potatoes–Banana)','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Chinese Veges – Packing Tables','ALL STOCK DISPLAY FILLED 8:30AM AND 2:00PM','A','R1-10'],
    ['FV','Chinese Veges – Packing Tables','QUALITY CHECKED','A',0],
    ['FV','Chinese Veges – Packing Tables','ROLL BAGS FILLED','A',0],
    ['FV','Chinese Veges – Packing Tables','FLOORS & VEGE AREA CLEANED','A','R1-5'],
    ['FV','Chinese Veges – Packing Tables','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Chinese Veges – Packing Tables','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Chinese Veges – Packing Tables','EMPTY BINS & SPRAY WATER EVERY 30 MINS','A',0],
    ['FV','Veges Fridges','ALL STOCK DISPLAY FILLED 8:30AM AND 2:00PM','A','R1-10'],
    ['FV','Veges Fridges','QUALITY CHECKED','A',0],
    ['FV','Veges Fridges','FLOORS & VEGE AREA CLEANED','A','R1-2'],
    ['FV','Veges Fridges','EMPTY BOXES & CRATE CLEANED','A',0],
    ['FV','Veges Fridges','PRICE LABELS CORRECT ITEMS','A',0],
    ['FV','Veges Fridges','TIDY UP VIETNAMESE HERBS','A','R1-2'],
    ['FV','Veges Fridges','SPRAY WATER EVERY 30 MINS','A',0],
    ['FV','Cutting Fruit & Packing Veges','FRUIT SALAD FILLED BY 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','WATER MELON CUT FILLED 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','VEGES CUT FILLED 8:30AM','O','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','PACKING ALL SECOND STOCK','O',0],
    ['FV','Cutting Fruit & Packing Veges','CUTTING AREA CLEANED','A','R1-5'],
    ['FV','Cutting Fruit & Packing Veges','KNIVES, PRICE GUN & ALL UTENSILS PUT BACK','A','R1-2'],
    ['FV','Fruit & Veges Back Door WH','COOLROOM CLEAN & TIDY','A','R1-3'],
    ['FV','Fruit & Veges Back Door WH','KITCHEN / CUTTING AREA CLEANED','A','R1-2'],
    ['FV','Fruit & Veges Back Door WH','CRATES IN ORDER','A','R1-3'],
    ['FV','Fruit & Veges Back Door WH','RUBBISH BINS EMPTY / TIDY','A','R1-2'],
    ['FV','Fruit & Veges Back Door WH','PUT AWAY TROLLEY IN THE WOOD BIN','A','R1-2'],
    ['FV','Fruit & Veges Back Door WH','EMPTY BOXES','A',0],
    ['FV','Fruit & Veges Back Door WH','EMPTY PAPER IN MACHINE','A',0],
    ['FV','Fruit & Veges Back Door WH','PUT AWAY & TIDY EMPTY PALLETS','A',0],
    ['FV','Fruit','REMOVE SPOILED / ROTTEN PRODUCE FROM DISPLAY','A',0],
    ['FV','Cutting Fruit & Packing Veges','WASH HANDS AND WEAR GLOVES BEFORE CUTTING','O',0],
    ['FV','Cutting Fruit & Packing Veges','SANITISE KNIVES AND CUTTING BOARDS BEFORE USE','O',0],
    ['FV','Cutting Fruit & Packing Veges','CUT FRUIT / SALAD LABELLED WITH PACK & USE-BY DATE','A',0],
    ['FV','Cutting Fruit & Packing Veges','WEIGHING SCALES CHECKED AND ZEROED','O',0],
    // ---- GROCERY ----
    ['GROCERY','Grocery','AISLES CLEAR, NO PALLET JACK / BINS / BOXES BLOCKING','A','R1-5'],
    ['GROCERY','Grocery','CHECK PRICE LABEL ACCURACY','A',0],
    ['GROCERY','Grocery','REMOVE DAMAGED PACKAGING FROM SHELF','A',0],
    ['GROCERY','Grocery','RANDOM EXPIRY CHECK FOR SHORT-DATED ITEMS','A',0],
    ['GROCERY','Grocery','KEY VALUE ITEMS ARE FILLED UP','A','O'],
    ['GROCERY','Grocery','AISLES CLEAN, NO RUBBISH ON THE WAY','A',0],
    ['GROCERY','Grocery','FRONT SHELVES ARE FACED UP WITH LABELS','A','O'],
    ['GROCERY','Grocery','LEFT BEHIND PRODUCTS RETURNED','A',0],
    ['GROCERY','Grocery','ROTATE STOCK — OLDER DATES TO THE FRONT (FIFO)','A',0],
    ['GROCERY','Grocery','CHECK / REPLACE MISSING OR WRONG SHELF TICKETS','A',0],
    ['GROCERY','Grocery','SPILLS CLEANED IMMEDIATELY AND WET-FLOOR SIGN USED','A',0],
    ['GROCERY','Grocery','SPECIALS / PROMO DISPLAYS FILLED AND TICKETED','A','O'],
    ['GROCERY','Grocery','REPORT OUT-OF-STOCK / LOW LINES TO MANAGER','A',0],
    // ---- FROZEN & DAIRY ----
    ['FROZEN & DAIRY','Frozen & Dairy','FRIDGES ARE CLEAN AND CLEAR','A','R1-10'],
    ['FROZEN & DAIRY','Frozen & Dairy','CHECK PRICE LABEL ACCURACY','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','RANDOM EXPIRY CHECK FOR SHORT-DATED ITEMS. MARKDOWN DONE','A',0],
    ['FROZEN & DAIRY','Frozen & Dairy','KEY VALUE ITEMS ARE FILLED UP','A',0],
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
    // ---- CASHIER · Cosmetics (sub-section of Cashier) ----
    ['CASHIER','Cosmetics','ALL COSMETIC SHELVES FULLY STOCKED AND FACED UP','O','R1-5'],
    ['CASHIER','Cosmetics','GLASS DISPLAY CABINETS WIPED AND FINGERPRINT-FREE','O','R1-3'],
    ['CASHIER','Cosmetics','TESTER UNITS CLEAN, WORKING AND TOPPED UP','O',0],
    ['CASHIER','Cosmetics','PRICE LABELS CORRECT AND PROMOTIONAL TAGS IN PLACE','O',0],
    ['CASHIER','Cosmetics','CHECK EXPIRY DATES — REMOVE OR MARK DOWN SHORT-DATED ITEMS','A',0],
    ['CASHIER','Cosmetics','NEW ARRIVALS PRICED, TAGGED AND PUSHED TO SHELF','A','R1-3'],
    ['CASHIER','Cosmetics','HIGH-VALUE / FRAGRANCE LOCKED CABINET STOCK CHECKED','A',0],
    ['CASHIER','Cosmetics','SECTION LOOKS NEAT, WELL ORGANISED AND SHOPPABLE','A','R1-3'],
    ['CASHIER','Cosmetics','RESTOCK GAPS FROM BACK STOCK AND FACE UP ALL SHELVES','C','R1-5'],
    ['CASHIER','Cosmetics','TIDY AND ORGANISE COSMETIC CABINETS NEATLY','C','R1-3'],
    ['CASHIER','Cosmetics','CLEAN COUNTER, MIRRORS AND TESTER AREA','C',0],
    ['CASHIER','Cosmetics','RETURN MISPLACED PRODUCTS TO CORRECT SECTION','C',0],
    ['CASHIER','Cosmetics','LOCK HIGH-VALUE / FRAGRANCE CABINET','C',0],
    // ---- OFFICE ----
    ['OFFICE','Admin','DESKS AND TABLES CLEAN, CLEAR AND ORGANISED','O','R1-2'],
    ['OFFICE','Admin','SORT AND FILE TODAY’S INVOICES AND DELIVERY DOCKETS','A',0],
    ['OFFICE','Admin','CHECK INCOMING INVOICES AGAINST DELIVERIES (QTY & PRICE)','A',0],
    ['OFFICE','Admin','UPDATE PRICE CHANGES AND PRINT NEW SHELF LABELS','A','R1-2'],
    ['OFFICE','Admin','STOCK UP STATIONERY, RECEIPT ROLLS AND LABEL PAPER','A',0],
    ['OFFICE','Admin','PETTY CASH COUNTED AND LOGGED','A',0],
    ['OFFICE','Admin','ANSWER AND LOG SUPPLIER CALLS AND EMAILS','A',0],
    ['OFFICE','Admin','SEND INVOICE BATCH TO HEAD OFFICE — MONDAY & THURSDAY','A',0],
    ['OFFICE','Admin','FILE COMPLETED PAPERWORK AND LOCK FILING CABINET','C',0],
    ['OFFICE','Admin','BACK UP DAILY SALES REPORT','C',0],
    ['OFFICE','Admin','TABLES CLEARED, WIPED AND TIDY FOR NEXT DAY','C','R1-2'],
    ['OFFICE','Admin','RECONCILE DAILY TAKINGS AND PREPARE BANKING','A',0],
    ['OFFICE','Admin','REVIEW ROSTER AND TIMESHEETS','A',0],
    ['OFFICE','Admin','CHECK STAFF CERTIFICATES / VISA / LICENCES FOR EXPIRY','A',0],
    // ---- FORKLIFT (pre-use safety + battery + during use) ----
    ['FORKLIFT','Pre-Use Inspection','OPERATOR HOLDS A CURRENT FORKLIFT (LF) LICENCE','O',0],
    ['FORKLIFT','Pre-Use Inspection','TYRES, FORKS, MAST AND CHASSIS CHECKED FOR DAMAGE','O','R1-3'],
    ['FORKLIFT','Pre-Use Inspection','HORN, LIGHTS AND REVERSE BEEPER WORKING','O',0],
    ['FORKLIFT','Pre-Use Inspection','BRAKES, STEERING AND PARKING BRAKE TESTED','O',0],
    ['FORKLIFT','Pre-Use Inspection','HYDRAULIC LIFT / TILT WORKING, NO OIL LEAKS','O',0],
    ['FORKLIFT','Pre-Use Inspection','SEATBELT PRESENT AND IN GOOD WORKING ORDER','O',0],
    ['FORKLIFT','Battery & Charging','BATTERY CHARGE LEVEL OK BEFORE SHIFT','O','R1-1'],
    ['FORKLIFT','Battery & Charging','BATTERY WATER / ELECTROLYTE TOPPED UP WITH DISTILLED WATER','A','R1-1'],
    ['FORKLIFT','Battery & Charging','CHARGING AREA CLEAR, DRY AND WELL VENTILATED','A',0],
    ['FORKLIFT','Battery & Charging','NO DAMAGE TO CHARGER LEAD, PLUG OR CONNECTOR','A',0],
    ['FORKLIFT','During Use','SEATBELT FASTENED BEFORE MOVING — WORN AT ALL TIMES','A',0],
    ['FORKLIFT','During Use','LOAD WITHIN CAPACITY, FORKS LOW WHILE TRAVELLING','A',0],
    ['FORKLIFT','During Use','SOUND HORN AT BLIND CORNERS, KEEP TO SPEED LIMIT','A',0],
    ['FORKLIFT','During Use','NO PASSENGERS, KEEP PEOPLE AND AISLES CLEAR','A',0],
    ['FORKLIFT','After Use / Closing','PARKED IN BAY, FORKS LOWERED, KEY REMOVED','C','R1-2'],
    ['FORKLIFT','After Use / Closing','PLUGGED IN TO CHARGE FOR NEXT SHIFT','C','R1-1'],
    ['FORKLIFT','After Use / Closing','ANY FAULTS OR DAMAGE REPORTED TO MANAGER','C',0],
  ],
};
/* ============================================================
   CLEANING & MAINTENANCE SCHEDULES — recurring (not daily) jobs,
   each with a frequency + who is responsible. Shown on the
   Schedules page; separate cadence from the daily checklist.
   ============================================================ */
DB.schedules = {
  cleaning: { label:'Cleaning Schedule', icon:'🧽', accent:'#0e9f6e',
    desc:'Recurring deep-cleaning jobs across the store — beyond the daily checklist.',
    tasks:[
      {task:'Degrease & clean fridge / freezer condenser coils and filters', area:'Refrigeration', freq:'Every 2 weeks', who:'Frozen & Dairy', last:'2026-06-05'},
      {task:'Deep-clean coolroom floors, shelves and door seals',           area:'Coolrooms',     freq:'Weekly',        who:'FV / Butcher',  last:'2026-06-12'},
      {task:'Sanitise all glass display cabinets and sneeze guards',         area:'Displays',      freq:'2× per week',   who:'Cosmetic / Cashier', last:'2026-06-15'},
      {task:'Clean entrance glass doors, front windows & door tracks',       area:'Storefront',    freq:'2× per week',   who:'Cleaner',       last:'2026-06-15'},
      {task:'Degrease & sanitise butcher band-saw, blocks and prep tables',  area:'Butcher',       freq:'Daily',         who:'Butcher',       last:'2026-06-16'},
      {task:'Mop & sanitise all back-of-house and prep floors',             area:'Back of house', freq:'Daily',         who:'All depts',     last:'2026-06-16'},
      {task:'Descale & clean café coffee machine and water lines',          area:'Café',          freq:'Weekly',        who:'Café',          last:'2026-06-10'},
      {task:'Empty, wash and sanitise all bins and the bin area',           area:'Waste',         freq:'Daily',         who:'Cleaner',       last:'2026-06-16'},
      {task:'Dust & wipe top shelves, signage and light fittings',          area:'Grocery',       freq:'Monthly',       who:'Grocery',       last:'2026-05-28'},
      {task:'Clean & polish checkout belts, scales and EFTPOS units',       area:'Checkout',      freq:'Daily',         who:'Cashier',       last:'2026-06-16'},
      {task:'Wash floor mats, trolleys and baskets',                        area:'Front',         freq:'Weekly',        who:'Cashier',       last:'2026-06-11'},
      {task:'Pest-control inspection and bait-station check',               area:'Whole store',   freq:'Monthly',       who:'External',      last:'2026-05-20'},
    ]},
  maintenance: { label:'Maintenance Schedule', icon:'🔧', accent:'#f59e0b',
    desc:'Planned servicing & technician visits to keep equipment safe and compliant.',
    tasks:[
      {task:'Refrigeration technician service — coolrooms, display fridges & freezers', area:'Refrigeration', freq:'Every 2 weeks', who:'External technician', last:'2026-06-04'},
      {task:'Air-conditioning & ventilation filter service',               area:'HVAC',         freq:'Monthly',     who:'External technician', last:'2026-05-22'},
      {task:'Test & tag electrical equipment, RCD / safety-switch test',    area:'Electrical',   freq:'Quarterly',   who:'Electrician',         last:'2026-04-15'},
      {task:'Forklift & pallet-jack safety inspection and service',        area:'Warehouse',    freq:'Monthly',     who:'External technician', last:'2026-05-30'},
      {task:'Fire extinguishers, exit lights and alarm system check',      area:'Safety',       freq:'Quarterly',   who:'Fire contractor',     last:'2026-04-02'},
      {task:'POS / EFTPOS, scanners and printers servicing',               area:'IT',           freq:'Monthly',     who:'IT contractor',       last:'2026-05-26'},
      {task:'Plumbing & grease-trap inspection',                           area:'Plumbing',     freq:'Every 2 weeks', who:'Plumber',           last:'2026-06-06'},
      {task:'Roller doors, gates and door closers — lubricate & service',  area:'Building',     freq:'Monthly',     who:'Maintenance',         last:'2026-05-24'},
      {task:'Shelving, gondola and display-fixture safety check',          area:'Fixtures',     freq:'Quarterly',   who:'Maintenance',         last:'2026-04-18'},
      {task:'CCTV and security system health check',                       area:'Security',     freq:'Monthly',     who:'Security contractor', last:'2026-05-29'},
      {task:'Trade-approved weighing-scale calibration',                   area:'Scales',       freq:'Every 6 months', who:'Calibration service', last:'2026-02-12'},
      {task:'Trolley repair and wheel replacement round',                  area:'Front',        freq:'Monthly',     who:'Maintenance',         last:'2026-05-25'},
    ]},
};

/* ============================================================
   STAFF MEMBERS  (sample supermarket roster)
   ============================================================ */
DB.staff = [
  {id:'20001',name:'Tony Lam',role:'Head Office',store:'Morley',phone:'0400 100 001',active:1,start:'2019-03-01'},
  {id:'20002',name:'Linh Nguyen',role:'Store Manager',store:'Morley',phone:'0400 100 002',active:1,start:'2020-06-15'},
  {id:'20007',name:'Karsang Dorji',role:'Grocery Team',store:'Morley',phone:'0400 100 007',active:1,start:'2022-01-10'},
  {id:'20011',name:'Sarah Nguyen',role:'Cashier / Front End',store:'Subiaco',phone:'0400 100 011',active:1,start:'2021-09-05'},
  {id:'20014',name:'David Tran',role:'Butcher',store:'Malaga',phone:'0400 100 014',active:1,start:'2020-11-20'},
  {id:'20019',name:'Mai Le',role:'Café',store:'Mirrabooka',phone:'0400 100 019',active:1,start:'2023-02-14'},
  {id:'20023',name:'James Pham',role:'FV Team',store:'Armadale',phone:'0400 100 023',active:1,start:'2022-07-30'},
  {id:'20026',name:'Hung Vo',role:'Assistant Manager',store:'Subiaco',phone:'0400 100 026',active:1,start:'2021-04-12'},
  {id:'20031',name:'Anna Bui',role:'Cashier / Front End',store:'Morley',phone:'0400 100 031',active:1,start:'2023-05-02'},
  {id:'20034',name:'Peter Do',role:'Warehouse / Logistics',store:'Warehouse',phone:'0400 100 034',active:1,start:'2019-08-19'},
  {id:'20038',name:'Kim Ha',role:'FV Team',store:'Malaga',phone:'0400 100 038',active:1,start:'2024-01-08'},
  {id:'20042',name:'Tuan Nguyen',role:'Grocery Team',store:'Mirrabooka',phone:'0400 100 042',active:1,start:'2022-10-25'},
  {id:'20045',name:'Lucy Tran',role:'Café',store:'Armadale',phone:'0400 100 045',active:1,start:'2023-09-11'},
  {id:'20049',name:'Minh Pham',role:'Butcher',store:'Morley',phone:'0400 100 049',active:0,start:'2018-12-01'},
];
DB.staffRoles = ['Head Office','Store Manager','Assistant Manager','Supervisor','Cashier / Front End','FV Team','Grocery Team','Butcher','Café','Warehouse / Logistics','Cleaner'];

/* ============================================================
   ORG STRUCTURE  (for the staff-structure org chart)
   ============================================================ */
DB.structure = [
  {dept:'Store Leadership', color:'#4f46e5', head:'Tony Lam — Head Office', members:['Linh Nguyen — Store Manager (Morley)','Hung Vo — Assistant Manager (Subiaco)']},
  {dept:'Front End / Cashier', color:'#0ea5e9', head:'Sarah Nguyen — Front End Lead', members:['Anna Bui — Cashier','Cashier team ×6']},
  {dept:'Fruit & Veg', color:'#10b981', head:'James Pham — FV Lead', members:['Kim Ha — FV Team','Cutting & packing team ×4']},
  {dept:'Grocery', color:'#f59e0b', head:'Karsang Dorji — Grocery Lead', members:['Tuan Nguyen — Grocery Team','Frozen & dairy team ×3']},
  {dept:'Butcher', color:'#ef4444', head:'David Tran — Head Butcher', members:['Minh Pham — Butcher','Back storage team ×2']},
  {dept:'Café', color:'#8b5cf6', head:'Mai Le — Café Lead', members:['Lucy Tran — Café','Kitchen team ×3']},
  {dept:'Warehouse / Logistics', color:'#6d4c41', head:'Peter Do — Warehouse Lead', members:['Receiving & crates team ×4','Drivers ×7']},
];

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
  records:[
    {id:'VIO-20260610-3301',created:'2026-06-10 09:12',staffName:'Anna Bui',store:'Morley',category:'Phone use during shift',severity:'Minor',step:'Verbal Discussion',status:'Verbal Discussion',description:'On phone at register during a queue.'},
    {id:'VIO-20260608-7740',created:'2026-06-08 14:30',staffName:'Tuan Nguyen',store:'Mirrabooka',category:'Daily checklist late / incomplete',severity:'Moderate',step:'Written Warning',status:'Written Warning',description:'Closing checklist not completed two days running.'},
    {id:'VIO-20260603-5521',created:'2026-06-03 11:05',staffName:'Minh Pham',store:'Morley',category:'Hygiene / PPE breach',severity:'Major',step:'Final Warning',status:'Final Warning',description:'No gloves while handling raw meat.'},
    {id:'VIO-20260528-1180',created:'2026-05-28 16:20',staffName:'Kim Ha',store:'Malaga',category:'Expired stock on shelf / markdown missed',severity:'Major',step:'Written Warning',status:'Resolved',description:'Short-dated items left on display past markdown time.'},
  ],
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
  records:[
    {id:'RWD-202605-1',rewardMonth:'2026-05',awardType:'Employee of the Month',staffName:'Sarah Nguyen',store:'Subiaco',rewardAmount:200,status:'Paid',created:'2026-06-01 09:00'},
    {id:'RWD-202605-2',rewardMonth:'2026-05',awardType:'Best Customer Service',staffName:'Anna Bui',store:'Morley',rewardAmount:100,status:'Approved',created:'2026-06-01 09:05'},
    {id:'RWD-202606-1',rewardMonth:'2026-06',awardType:'Cleanliness Champion',staffName:'James Pham',store:'Armadale',rewardAmount:100,status:'Proposed',created:'2026-06-11 10:00'},
  ],
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
  records:[
    {id:'RAI-1',staffName:'Karsang Dorji',store:'Morley',reviewMonth:'2026-06',currentRate:27.5,proposedRate:29.0,effectiveDate:'2026-07-01',status:'Submitted',created:'2026-06-09 13:00'},
    {id:'RAI-2',staffName:'Sarah Nguyen',store:'Subiaco',reviewMonth:'2026-06',currentRate:28.0,proposedRate:30.5,effectiveDate:'2026-07-01',status:'Approved',created:'2026-06-05 11:00'},
    {id:'RAI-3',staffName:'Lucy Tran',store:'Armadale',reviewMonth:'2026-05',currentRate:26.0,proposedRate:27.0,effectiveDate:'2026-06-01',status:'Declined',created:'2026-05-20 15:00'},
  ],
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
  records:[
    {id:'BDY-1',staffName:'Mai Le',store:'Mirrabooka',birthday:'2026-06-18',favoriteGift:'Bubble tea voucher',status:'Planned',created:'2026-06-01'},
    {id:'BDY-2',staffName:'David Tran',store:'Malaga',birthday:'2026-06-25',favoriteGift:'Coffee hamper',status:'Planned',created:'2026-06-01'},
    {id:'BDY-3',staffName:'Anna Bui',store:'Morley',birthday:'2026-05-30',favoriteGift:'Movie tickets',status:'Given',created:'2026-05-01'},
  ],
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
  records:[
    {id:'TRN-20260611-1',traineeName:'Kim Ha',traineeRole:'FV',trainerName:'James Pham',sessionDate:'2026-06-11',shift:'Opening',status:'Completed',overallRating:'Good',created:'2026-06-11 09:00',store:'Malaga'},
    {id:'TRN-20260609-1',traineeName:'Anna Bui',traineeRole:'Cashier',trainerName:'Sarah Nguyen',sessionDate:'2026-06-09',shift:'Full',status:'Completed',overallRating:'Excellent',created:'2026-06-09 10:00',store:'Morley'},
    {id:'TRN-20260612-1',traineeName:'Lucy Tran',traineeRole:'Café',trainerName:'Mai Le',sessionDate:'2026-06-12',shift:'Mid',status:'In Progress',overallRating:'',created:'2026-06-12 11:00',store:'Armadale'},
  ],
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
  records:[
    {id:'ISS-20260612-1',title:'Trolley bay light flickering',category:'Facilities',store:'Morley',priority:'Normal',status:'Open',reportedBy:'Anna Bui',description:'Carpark trolley bay light keeps flickering at night.',created:'2026-06-12 08:30'},
    {id:'ISS-20260611-2',title:'Self-checkout 2 slow to scan',category:'IT / POS',store:'Subiaco',priority:'High',status:'In Progress',reportedBy:'Sarah Nguyen',description:'Scanner lags during busy periods.',created:'2026-06-11 16:10'},
    {id:'ISS-20260609-3',title:'Suggestion: more FV roll bags',category:'Suggestion',store:'Malaga',priority:'Low',status:'Resolved',reportedBy:'Kim Ha',description:'Roll bags run out by midday on weekends.',created:'2026-06-09 12:00'},
  ],
  analytics:{ kpis:[
    {label:'Issues',calc:'count'},{label:'Open',calc:'countWhereNotIn',field:'status',values:['Resolved','Closed'],tone:'info'},
    {label:'High + Urgent',calc:'countWhereIn',field:'priority',values:['High','Urgent'],tone:'bad'},{label:'Resolved',calc:'countWhere',field:'status',value:'Resolved',tone:'ok'},
  ], charts:[{type:'doughnut',title:'By category',group:'category'},{type:'bar',title:'By store',group:'store'},{type:'bar',title:'By priority',group:'priority'}]},
};

/* ---------- navigation groups (sidebar) ---------- */
DB.navGroups = [
  { id:'ops',    label:'Operations', icon:'fa-clipboard-list', items:['checklist','schedules','delivery','people'] },
  { id:'hr',     label:'Staff & HR', icon:'fa-users',          items:['structure','staff','schedule','performance','training','violation','reward','raise','birthday'], admin:true },
  { id:'mgmt',   label:'Management', icon:'fa-user-shield',     items:['manager','analytics','photos','whatsapp','email','data'], admin:true },
  { id:'reports',label:'Reports & Rules', icon:'fa-flag',       items:['rules','issue'] },
  { id:'lab',    label:'AI Lab', icon:'fa-robot',                items:['aiuse'], admin:true },
  { id:'account',label:'Account', icon:'fa-user-lock',          items:['faceid'] },
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
  violation:{ label:'Violation Rules', icon:'⚠️', render:'renderViolation', admin:true },
  training: { label:'Training Assessment', icon:'🎓', render:'renderTraining' },
  reward:   { label:'Monthly Rewards', icon:'🏆', render:'renderReward', admin:true },
  raise:    { label:'Raise Salary Review', icon:'💸', render:'renderRaise', admin:true },
  birthday: { label:'Birthday Giveaways', icon:'🎂', render:'renderBirthday', admin:true },
  structure:{ label:'Staff Structure', icon:'🏢', render:'renderStructure' },
  staff:    { label:'Staff Members',   icon:'🧑‍🤝‍🧑', render:'renderStaff' },
  schedule: { label:'Job Schedule',    icon:'🗓️', render:'renderSchedule' },
  schedules:{ label:'Cleaning & Maintenance', icon:'🧽', render:'renderSchedules' },
  performance:{ label:'Performance & Scoring', icon:'📊', render:'renderPerformance', admin:true },
  aiuse:    { label:'AI Lab',          icon:'🤖', render:'renderAIUse', admin:true },
  manager:  { label:'Manager Panel',   icon:'🛡️', render:'renderManager', admin:true },
  analytics:{ label:'Analytics',       icon:'📈', render:'renderAnalytics', admin:true },
  photos:   { label:'Photo Gallery',   icon:'🖼️', render:'renderPhotos', admin:true },
  whatsapp: { label:'WhatsApp Daily Share', icon:'💬', render:'renderWhatsapp', admin:true },
  email:    { label:'Email Notifications',  icon:'✉️', render:'renderEmail', admin:true },
  data:     { label:'Data Management', icon:'🗄️', render:'renderData', admin:true },
  rules:    { label:'Supermarket Rules', icon:'📖', render:'renderRules' },
  faceid:   { label:'Face ID', icon:'🪪', render:'renderFaceId' },
};
