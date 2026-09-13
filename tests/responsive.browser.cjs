const assert = require('node:assert/strict');
const {test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.NM_TEST_URL || 'http://127.0.0.1:8814';

for (const engine of ['webkit','chromium']) {
  test(`${engine}: gallery recovery, navigation, rotation and motion preferences`, {timeout:120000}, async () => {
    const options={headless:true};
    if(engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE)options.executablePath=process.env.CHROMIUM_EXECUTABLE;
    const browser=await playwright[engine].launch(options);
    try {
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
      const page=await context.newPage();
      await page.goto(origin+'/index/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('.grid img').complete);
      assert.match(await page.locator('.grid img').first().evaluate(el=>el.currentSrc),/\/nm-index\//,'Retina phones use the intermediate image');
      await page.locator('#nm-coord').focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>document.activeElement.className),'nm-c-p-go','keyboard activation reaches the popup link');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'nm-coord','Escape returns focus to the location button');
      async function locationToMenu() {
        await page.locator('#nm-coord').click();
        await page.locator('.nm-burger').click();
        assert.equal(await page.locator('.nm-c-panel').evaluate(el=>el.classList.contains('is-open')||el.matches(':popover-open')),false,'location card must not cover the mobile menu');
        assert.equal(await page.locator('#nm-coord').getAttribute('aria-expanded'),'false');
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close menu');
        await page.locator('.nm-menu-close').click();
      }
      await locationToMenu();
      const tile=page.locator('.grid .tile').nth(40);
      await tile.focus();await page.keyboard.press('Enter');
      await page.waitForSelector('.nm-lb img.is-ready');
      const first=await page.locator('.nm-lb img').getAttribute('src');
      await page.keyboard.press('ArrowRight');await page.waitForSelector('.nm-lb img.is-ready');
      assert.notEqual(await page.locator('.nm-lb img').getAttribute('src'),first);
      await page.keyboard.press('ArrowLeft');await page.waitForSelector('.nm-lb img.is-ready');
      assert.equal(await page.locator('.nm-lb img').getAttribute('src'),first);
      await page.setViewportSize({width:844,height:390});
      await page.keyboard.press('Escape');
      assert.equal(await tile.evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-lb-open')),false);

      await page.route('**/media/nm-work/**',route=>route.abort('failed'));
      await page.locator('.grid .tile').nth(150).click();
      await page.waitForFunction(()=>{
        const image=document.querySelector('.nm-lb img');
        return image.src.includes('/nm-thumb/')&&image.complete&&image.naturalWidth>0&&image.classList.contains('is-ready');
      });
      await page.keyboard.press('Escape');
      await page.route('**/media/nm-thumb/**',route=>route.abort('failed'));
      await page.locator('.grid .tile').nth(160).click();
      await page.locator('.nm-lb-message').waitFor({state:'visible'});
      assert.equal(await page.locator('.nm-lb img').evaluate(el=>el.hidden),true);
      await page.keyboard.press('Escape');
      await page.unrouteAll({behavior:'wait'});
      await page.locator('.grid .tile').first().click();
      await page.waitForSelector('.nm-lb img.is-ready');
      assert.equal(await page.locator('.nm-lb-message').evaluate(el=>el.hidden),true);
      await page.keyboard.press('Escape');

      await page.setViewportSize({width:390,height:844});
      await page.locator('.nm-burger').click();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'contact');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close menu');
      await page.locator('.nm-burger-panel a[data-anchor="about"]').click();
      await page.waitForURL('**/#about');await page.waitForSelector('#about');
      await page.waitForFunction(()=>Math.abs(document.querySelector('#about').getBoundingClientRect().top)<2);
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-menu-open')),false);
      await locationToMenu();

      await page.goto(origin+'/#run',{waitUntil:'domcontentloaded'});
      const start=page.getByRole('button',{name:'Start run',exact:true});
      await start.waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('.nm-run-panel button').disabled);
      for(const [width,height] of [[320,480],[390,844],[480,320],[568,320],[667,375],[844,390],[768,1024]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(150);
        const bounds=await page.locator('.nm-run').evaluate(el=>({
          top:el.querySelector('.nm-run-top').getBoundingClientRect().top,
          width:el.scrollWidth,
          buttons:[...el.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.getBoundingClientRect().toJSON())
        }));
        assert.ok(bounds.top>=0,`${width}×${height}: Exit is above the scrollable area`);
        assert.ok(bounds.width<=width,`${width}×${height}: horizontal overflow`);
        if(width>height)assert.ok(bounds.buttons.every(b=>b.top>=0&&b.bottom<=height&&b.left>=0&&b.right<=width),`${width}×${height}: controls do not fit`);
      }
      await page.setViewportSize({width:568,height:320});
      await start.click();await page.keyboard.press('KeyP');
      assert.equal(await page.locator('.nm-run').getAttribute('data-state'),'paused');
      const pause=await page.getByRole('button',{name:'Resume',exact:true}).last().boundingBox();
      assert.ok(pause.x>=0&&pause.x+pause.width<=568,'resume overlay button fits in compact landscape');
      await page.getByRole('button',{name:'Exit',exact:true}).click();
      assert.equal(await page.locator('.nm-run').count(),0);
      assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('nm-run-open')),false);

      for(const hash of ['#work','#nm-services']){
        const linked=await context.newPage();
        await linked.goto(origin+'/'+hash);
        await linked.waitForFunction(hash=>Math.abs(document.querySelector(hash)?.getBoundingClientRect().top)<2,hash);
        await linked.close();
      }

      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/textures/nm-mark-sdf.png',async route=>{await gate;await route.continue();});
      try {
        await page.goto(origin+'/index/',{waitUntil:'domcontentloaded'});
        await page.waitForSelector('.foot-mark canvas',{state:'attached'});
        await page.setViewportSize({width:1024,height:768});
        await page.waitForTimeout(250);
      } finally {release();}
      await page.waitForSelector('.foot-mark.is-ready',{state:'attached'});
      await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
      await page.waitForTimeout(250);
      await page.evaluate(()=>{
        window.__footerDraws=0;
        const draw=CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage=function(...args){
          if(this.canvas.closest('.foot-mark'))window.__footerDraws++;
          return draw.apply(this,args);
        };
      });
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForTimeout(200);
      await page.evaluate(()=>window.__footerDraws=0);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.__footerDraws),0,'reduced motion stops the footer loop');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(()=>window.__footerDraws)>0,'footer motion resumes when requested');
      await page.evaluate(()=>scrollTo(0,0));
      await page.waitForTimeout(100);
      await page.evaluate(()=>window.__footerDraws=0);
      await page.setViewportSize({width:1280,height:800});
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>window.__footerDraws),0,'resizing does not wake an offscreen footer');
      assert.deepEqual(errors,[],'rotation during a delayed texture load must not throw');
      await context.close();
    } finally {await browser.close();}
  });
}
