/* Run against the static preview. Network gates make the opening's cancellation
   and fail-open paths reproducible without adding production testing hooks. */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.NM_TEST_URL || 'http://127.0.0.1:8814';
const engines = process.env.NM_TEST_ENGINES?.split(',') || ['webkit', 'chromium'];

async function finished(page) {
  await page.waitForFunction(() => !window.__nmOpening?.active &&
    !document.documentElement.classList.contains('nm-opening'), null, {timeout:8500});
}
async function unobstructed(page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const header = document.querySelector('[data-nm-header]');
    const caption = document.querySelector('[data-nm-hero-caption]');
    const shown = el => !el || (getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > .99);
    return {opening:root.classList.contains('nm-opening'), header:shown(header), caption:shown(caption),
      overflow:root.scrollWidth > innerWidth, scrollLock:getComputedStyle(root).overflowY === 'hidden'};
  });
  assert.deepEqual(result, {opening:false,header:true,caption:true,overflow:false,scrollLock:false});
}
async function holdTexture(page) {
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  await page.route('**/textures/nm-mark-sdf.png', async route => { await gate; await route.continue(); });
  return release;
}
async function visit(browser, options, run) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  try { await run(page,context); } finally { await context.close(); }
}

for (const engine of engines) test(`${engine}: opening completion, input, navigation and asset recovery`, {timeout:180000}, async t => {
  const options = {headless:true};
  if (engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await playwright[engine].launch(options);
  try {
    await t.test('cold desktop and phone entrances finish at the existing hero layout', async () => {
      for (const [width,height] of [[1440,900],[390,844]]) await visit(browser,
        {viewport:{width,height},hasTouch:width<700,isMobile:width<700,deviceScaleFactor:width<700?3:1}, async page => {
          const errors=[];
          page.on('pageerror',error=>errors.push(error.message));
          await page.goto(origin,{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.__nmOpening?.phase==='playing',null,{timeout:6000});
          const opening = await page.evaluate(()=>({active:__nmOpening.active,morph:__nmOpening.morph,radius:__nmOpening.radius,scroll:scrollY}));
          assert.equal(opening.active,true);
          assert.ok(opening.morph>=0&&opening.morph<=1&&opening.radius>=0&&opening.radius<=1);
          assert.equal(opening.scroll,0);
          await finished(page);
          assert.equal(await page.evaluate(()=>window.__nmOpening.reason),'complete');
          await page.waitForTimeout(550);
          await unobstructed(page);
          const geometry=()=>page.evaluate(()=>({
            hero:document.querySelector('main > section.h-svh').getBoundingClientRect().toJSON(),
            grid:document.querySelector('#nm-made .index-feature').getBoundingClientRect().toJSON(),
            transform:document.querySelector('#nm-made .index-feature').style.transform
          }));
          const before=await geometry();
          assert.equal(await page.evaluate(()=>sessionStorage.getItem('nm-opening-seen-v1')), '1');
          await page.reload({waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.__nmHydrated&&document.querySelector('#nm-made .index-feature'));
          await finished(page);
          await page.waitForTimeout(150);
          assert.deepEqual(await geometry(),before,'a completed entrance has the same layout as a skipped return visit');
          assert.deepEqual(errors,[]);
        });
    });

    await t.test('scroll, keyboard and width rotation cancel without holding the page', async () => {
      for (const input of ['wheel','keyboard','rotation','touch','pageshow']) await visit(browser,
        {viewport:['wheel','keyboard'].includes(input)?{width:1440,height:900}:{width:390,height:844},hasTouch:!['wheel','keyboard'].includes(input),isMobile:!['wheel','keyboard'].includes(input)}, async page => {
          const release=await holdTexture(page);
          try {
            await page.goto(origin,{waitUntil:'domcontentloaded'});
            if(input==='wheel')await page.waitForFunction(()=>document.querySelector('#work')&&document.documentElement.scrollHeight>innerHeight+540);
            assert.equal(await page.evaluate(()=>window.__nmOpening?.active),true,input);
            if(input==='wheel') {
              await page.mouse.wheel(0,540);
              await page.waitForFunction(()=>scrollY>4);
            } else if(input==='keyboard') await page.keyboard.press('Tab');
            else if(input==='rotation') {
              await page.setViewportSize({width:390,height:700});
              await page.waitForTimeout(100);
              assert.equal(await page.evaluate(()=>window.__nmOpening?.active),true,'a toolbar-height change must not cancel');
              await page.setViewportSize({width:844,height:390});
            }
            else if(input==='touch') await page.dispatchEvent('body','touchstart');
            else await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
            await finished(page);
            const reason=await page.evaluate(()=>window.__nmOpening.reason);
            if(input==='wheel')assert.ok(['interaction','scroll'].includes(reason));
            else assert.equal(reason,input==='rotation'?'resize':input==='pageshow'?'history':'interaction');
            if(input==='wheel') assert.ok(await page.evaluate(()=>scrollY)>4,'cancellation must retain the user scroll');
          } finally {release();}
        });
    });

    await t.test('reduced motion skips initially and cancels when the preference changes', async () => {
      await visit(browser,{viewport:{width:390,height:844},reducedMotion:'reduce'},async page=>{
        await page.goto(origin,{waitUntil:'domcontentloaded'});
        await finished(page);
        assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-opening')),false);
        await page.emulateMedia({reducedMotion:'no-preference'});
        assert.equal(await page.evaluate(()=>!!window.__nmOpening?.active),false,'restoring motion must not replay the entrance');
      });
      await visit(browser,{viewport:{width:1440,height:900}},async page=>{
        const release=await holdTexture(page);
        try {
          await page.goto(origin,{waitUntil:'domcontentloaded'});
          assert.equal(await page.evaluate(()=>window.__nmOpening?.active),true);
          await page.emulateMedia({reducedMotion:'reduce'});
          await finished(page);
          assert.equal(await page.evaluate(()=>window.__nmOpening.reason),'reduced-motion');
        } finally {release();}
      });
    });

    await t.test('direct anchors, game links and Back keep their requested position', async () => {
      for(const hash of ['#work','#nm-services','#run']) await visit(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true},async page=>{
        await page.goto(origin+'/'+hash,{waitUntil:'domcontentloaded'});
        await finished(page);
        if(hash==='#run') {
          await page.getByRole('button',{name:'Start run',exact:true}).waitFor();
          assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-run-open')),true);
          await page.getByRole('button',{name:'Exit',exact:true}).click();
        } else await page.waitForFunction(hash=>Math.abs(document.querySelector(hash)?.getBoundingClientRect().top)<2,hash);
      });
      await visit(browser,{viewport:{width:1440,height:900}},async page=>{
        await page.goto(origin,{waitUntil:'domcontentloaded'});
        await finished(page);
        await page.waitForFunction(()=>document.querySelector('#work'));
        await page.evaluate(()=>{const target=document.querySelector('#work');if(window.__nmLenis)__nmLenis.scrollTo(target,{immediate:true});else scrollTo(0,target.getBoundingClientRect().top+scrollY);});
        await page.waitForFunction(()=>scrollY>4);
        await page.waitForTimeout(150);
        const position=await page.evaluate(()=>scrollY);
        await page.goto(origin+'/about/',{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>sessionStorage.removeItem('nm-opening-seen-v1'));
        await page.goBack({waitUntil:'domcontentloaded'});
        await finished(page);
        if(engine==='webkit')await page.waitForFunction(position=>Math.abs(scrollY-position)<2,position);
        // Chromium's Playwright launch disables BFCache. HEAD also returns to
        // zero while its deferred page content mounts, independent of opening.
        assert.equal(await page.evaluate(()=>history.scrollRestoration),'auto');
        assert.equal(await page.evaluate(()=>!!window.__nmOpening?.active),false);
      });
    });

    await t.test('slow texture and missing controller fail open within the bounded deadline', async () => {
      for(const mode of ['slow-texture','missing-image','missing-controller']) await visit(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true},async page=>{
        let release=()=>{};
        if(mode==='slow-texture')release=await holdTexture(page);
        else if(mode==='missing-image')await page.route('**/media/nmhome/nmhome-0.webp',route=>route.abort('failed'));
        else await page.route('**/js/nm-opening.js*',route=>route.abort('failed'));
        try {
          await page.goto(origin,{waitUntil:'domcontentloaded'});
          await finished(page);
          assert.equal(await page.evaluate(()=>window.__nmOpening.reason),mode==='missing-image'?'image-error':'timeout');
          await page.waitForTimeout(550);
          await unobstructed(page);
        } finally {release();}
      });
      await visit(browser,{viewport:{width:1440,height:900}},async page=>{
        await page.route('**/js/nm-opening.js*',route=>route.abort('failed'));
        await page.goto(origin,{waitUntil:'domcontentloaded'});
        assert.equal(await page.evaluate(()=>window.__nmOpening?.active),true);
        await page.keyboard.press('Tab');
        await finished(page);
        assert.equal(await page.evaluate(()=>window.__nmOpening.reason),'interaction');
      });
      await visit(browser,{viewport:{width:390,height:844}},async page=>{
        await page.route('**/textures/nm-mark-sdf.png',route=>route.abort('failed'));
        await page.goto(origin,{waitUntil:'domcontentloaded'});
        await finished(page);
        await page.waitForTimeout(550);
        await unobstructed(page);
      });
    });

    await t.test('disabled JavaScript retains the existing static content', async()=>{
      await visit(browser,{viewport:{width:390,height:844},javaScriptEnabled:false},async page=>{
        await page.goto(origin,{waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('.nm-nojs h1').isVisible(),true);
        assert.equal(await page.locator('.nm-nojs-work img').count(),6);
        assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-opening')),false);
      });
    });
  } finally {await browser.close();}
});
