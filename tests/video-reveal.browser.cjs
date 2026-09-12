/* Run against the static preview with Playwright's WebKit and Chromium engines.
   Holding MP4 responses reproduces Safari's poster-to-video layout collapse. */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.NM_TEST_URL || 'http://127.0.0.1:8814';

for (const engine of ['webkit','chromium']) {
  test(`${engine}: first video frames never collapse or uncover the collage`, {timeout:120000}, async () => {
    const options = {headless:true};
    if (engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE) options.executablePath=process.env.CHROMIUM_EXECUTABLE;
    const browser = await playwright[engine].launch(options);
    try {
      for (const [width,height] of [[390,844],[768,1024],[1920,1080]]) {
        const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:width<1000?3:1,
          isMobile:width<1000,hasTouch:width<1000});
        const page = await context.newPage(), errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        let release;
        const gate = new Promise(resolve=>{release=resolve;});
        await page.route('**/*.mp4',async route=>{await gate;await route.continue();});
        try {
          await page.goto(origin,{waitUntil:'domcontentloaded'});
          await page.waitForSelector('html.nm-scene-ready');
          await page.waitForFunction(()=>document.querySelectorAll('.nm-video-poster').length===5 &&
            [...document.querySelectorAll('.idx-cell img')].every(img=>img.complete&&img.naturalWidth));
          if (width<1000) await page.waitForSelector('#nm-made.nm-intro-cached');
          const geometry=()=>page.evaluate(()=>({height:document.querySelector('.index-feature').offsetHeight,
            tiles:[...document.querySelectorAll('.idx-cell')].map(cell=>[cell.offsetTop,cell.offsetHeight,cell.offsetWidth])}));
          const before=await geometry();
          // Capture every layout frame across loading and first playback, not just endpoints.
          await page.evaluate(()=>{
            window.__revealHeights=[];
            window.__sampleReveal=true;
            const sample=()=>{
              window.__revealHeights.push(document.querySelector('.index-feature').offsetHeight);
              if(window.__sampleReveal)requestAnimationFrame(sample);
            };
            sample();scrollTo(0,document.querySelector('main > section.h-svh').offsetHeight);
          });
          await page.waitForFunction(()=>document.querySelector('#nm-made video[src]'));
          await page.waitForTimeout(500);
          assert.deepEqual(await geometry(),before,`${width}px: loading changed the grid geometry`);
          const covered=await page.evaluate(()=>[...document.querySelectorAll('#nm-made video[src]')].every(video=>
            getComputedStyle(video).opacity==='0' && video.parentElement.querySelector('.nm-video-poster').complete));
          assert.equal(covered,true,`${width}px: a loading video must retain its visible photo`);
          release();
          await page.waitForSelector('#nm-made video[data-nm-frame-ready]');
          await page.waitForTimeout(500);
          assert.deepEqual(await geometry(),before,`${width}px: decoded metadata changed the grid geometry`);
          const heights=await page.evaluate(()=>{window.__sampleReveal=false;return window.__revealHeights;});
          assert.deepEqual([...new Set(heights)],[before.height],`${width}px: a transient frame collapsed`);
          await page.evaluate(()=>scrollTo(0,0));
          if(width<1000)await page.waitForSelector('#nm-made.nm-intro-cached');
          await page.waitForFunction(()=>[...document.querySelectorAll('#nm-made video')].every(video=>video.paused));
          assert.deepEqual(await geometry(),before,`${width}px: returning to the logo changed the grid`);
          assert.deepEqual(errors,[]);
          console.log(`${engine} ${width}x${height}: stable ${before.height}px grid, photos retained until video frames`);
        } finally {release();await context.close();}
      }
    } finally {await browser.close();}
  });
}
