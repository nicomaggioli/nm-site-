const assert = require('node:assert/strict');
const {test} = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.NM_TEST_URL || 'http://127.0.0.1:8814';

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: public metadata survives hydration and the home fallback works without scripts`, {timeout:120000}, async () => {
    const options = {headless:true};
    if (engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
    const browser = await playwright[engine].launch(options);
    try {
      for (const route of ['/', '/index/', '/about/']) {
        const page = await browser.newPage({viewport:{width:1440,height:900}});
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(request.url()));
        await page.goto(origin + route, {waitUntil:'networkidle'});
        if (route === '/') await page.waitForFunction(() => window.__nmHydrated);
        const data = await page.evaluate(() => ({
          title:document.title,
          canonical:[...document.querySelectorAll('link[rel=canonical]')].map(el => el.href),
          social:[...document.querySelectorAll('meta[property="og:title"]')].map(el => el.content),
          schemas:[...document.querySelectorAll('script[type="application/ld+json"]')].map(el => JSON.parse(el.textContent)),
          h1:document.querySelectorAll('h1').length,
          overflow:document.documentElement.scrollWidth > innerWidth,
        }));
        assert.deepEqual(data.canonical, ['https://nicomaggioli.com' + route]);
        assert.deepEqual(data.social, [data.title]);
        assert.equal(data.schemas.length, 1);
        assert.equal(data.h1, 1);
        assert.equal(data.overflow, false);
        assert.deepEqual(errors, [], route);
        assert.equal(requests.some(url => /[?&]_rsc=/.test(url)), false, 'static hosting must not prefetch RSC responses');
        assert.equal(requests.some(url => url.includes('/css/nm-nojs.css')), false, 'script-enabled pages do not load the fallback');
        await page.close();
      }

      for (const width of [320,390,768,1440,2560]) {
        const context = await browser.newContext({javaScriptEnabled:false,viewport:{width,height:900}});
        const page = await context.newPage();
        await page.goto(origin + '/', {waitUntil:'networkidle'});
        assert.equal(await page.locator('.nm-nojs h1').isVisible(), true);
        assert.equal(await page.locator('.nm-nojs-services li').count(), 6);
        assert.equal(await page.locator('.nm-nojs-sites li').count(), 8);
        assert.equal(await page.locator('.nm-nojs-work img').count(), 6);
        for (const image of await page.locator('.nm-nojs-work img').all()) {
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction(img => img.complete && img.naturalWidth > 0, await image.elementHandle());
          assert.ok(await image.getAttribute('alt'));
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('.nm-nojs nav a[href="/about/"]').click();
        await page.waitForURL('**/about/');
        assert.equal(await page.locator('#about-title').isVisible(), true);
        await page.locator('a[href="/#nm-services"]').click();
        await page.waitForURL('**/#nm-services');
        const serviceTop = await page.locator('#nm-services').evaluate(el => el.getBoundingClientRect().top);
        assert.ok(serviceTop >= -1 && serviceTop < 200, 'About service link reaches the no-JavaScript service section');
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
}
