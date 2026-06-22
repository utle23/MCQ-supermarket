import asyncio, sys
from playwright.async_api import async_playwright
BASE='http://localhost:8000'
async def login(pg, mode, branch, pw):
    await pg.goto(BASE+'/', wait_until='networkidle')
    await pg.evaluate(f"document.querySelector('#login-mode .seg-btn[data-mode=\"{mode}\"]').click()")
    if mode!='super': await pg.select_option('#login-branch', branch)
    await pg.fill('#login-pw', pw); await pg.click('.login-btn'); await pg.wait_for_timeout(3500)
async def main():
    errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        await login(pg,'admin','Morley','1010')
        adapter=await pg.evaluate("({api:!!(window.MCQDB&&MCQDB._api), enabled:!!(window.MCQDB&&MCQDB.enabled), loaded:!!(window.MCQDB&&MCQDB._loaded), flag:!!window.__MCQ_SAME_ORIGIN_API})")
        print('adapter state:', adapter)
        # create: a checklist submission, an issue record, then verify the submission
        made=await pg.evaluate("""(()=>{
          const tag='E2E-'+Date.now();
          // 1) checklist submission (pending)
          DB.checklistSubs=DB.checklistSubs||[];
          const sub={id:'CKS-'+tag, store:'Morley', dept:'MANAGER', session:'Opening', date:new Date().toISOString().slice(0,10), dayName:'Mon', by:'Tester', progress:100, done:3, total:3, status:'Submitted', real:true, items:[{task:'A',area:'X',done:true,photos:[]}]};
          DB.checklistSubs.unshift(sub);
          // 2) issue record
          const m=DB.modules.issue||DB.modules.complaint; const mid=DB.modules.issue?'issue':'complaint';
          m.records=m.records||[]; const iss={id:'ISS-'+tag, store:'Morley', status:(m.statuses&&m.statuses[0])||'Open', summary:'E2E test issue', created:new Date().toISOString().slice(0,16).replace('T',' ')};
          m.records.unshift(iss);
          // 3) verify the submission
          sub.status='Verified'; sub.verifiedBy='Tester'; sub.overallResult='Good'; sub.verifiedAt=new Date().toISOString();
          if(window.persist) window.persist();
          return {tag, mid, subId:sub.id, issId:iss.id};
        })()""")
        print('created:', made)
        await pg.wait_for_timeout(2000)  # let debounce+save fire
        # logout (current logout is sync fire-and-forget)
        await pg.evaluate("logout()"); await pg.wait_for_timeout(1500)
        # login again
        await login(pg,'admin','Morley','1010')
        check=await pg.evaluate(f"""(()=>{{
          const mid='{made['mid']}';
          const sub=(DB.checklistSubs||[]).find(x=>x.id==='{made['subId']}');
          const iss=(DB.modules[mid].records||[]).find(x=>x.id==='{made['issId']}');
          return {{ subPresent:!!sub, subVerified: sub&&sub.status==='Verified', issPresent:!!iss }};
        }})()""")
        print('AFTER RE-LOGIN:', check)
        ok = check['subPresent'] and check['subVerified'] and check['issPresent']
        print('RESULT:', 'PASS ✅' if ok else 'FAIL ❌ (data lost)')
        await b.close()
    print('CONSOLE ERRORS:', errs if errs else 'none')
    sys.exit(0 if ok else 1)
asyncio.run(main())
