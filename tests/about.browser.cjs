const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.NM_TEST_URL || 'http://127.0.0.1:8814';
const screenshots = process.env.NM_ABOUT_SCREENSHOTS;

for (const engine of ['webkit', 'chromium']) {
  test(`${engine}: About remains readable and navigable across layouts`, {timeout: 120000}, async () => {
    const options = {headless: true};
    if (engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
    const browser = await playwright[engine].launch(options);
    if (screenshots) await fs.mkdir(screenshots, {recursive: true});
    try {
      for (const [width, height] of [[320,568],[390,844],[768,1024],[1024,768],[1920,1080],[2560,1440]]) {
        const context = await browser.newContext({viewport: {width,height}, hasTouch: width <= 1024,
          isMobile: width <= 1024, deviceScaleFactor: width <= 390 ? 3 : 1});
        const page = await context.newPage(), errors = [], failed = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
        await page.goto(origin + '/about/', {waitUntil: 'networkidle'});
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const outside = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main p,main a,main img,main li,.about-footer')]
            .filter(el => { const r=el.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1); })
            .map(el => ({tag:el.tagName, text:el.textContent.trim().slice(0,70), width:el.getBoundingClientRect().width}));
          return {width: innerWidth, scrollWidth: document.documentElement.scrollWidth, outside,
            headerBottom: document.querySelector('.nm-hdr').getBoundingClientRect().bottom,
            introTop: document.querySelector('.about-topline').getBoundingClientRect().top};
        });
        assert.ok(layout.scrollWidth <= layout.width, `${width}×${height}: page overflows horizontally`);
        assert.deepEqual(layout.outside, [], `${width}×${height}: text/image extends outside the viewport`);
        assert.ok(layout.introTop > layout.headerBottom, `${width}×${height}: header overlaps introduction`);
        assert.equal(await page.locator('main h1').count(), 1);
        assert.equal(await page.locator('.about-job').count(), 4);
        if (screenshots) await page.screenshot({path: path.join(screenshots, `${engine}-${width}-intro.png`)});

        await page.getByRole('link', {name: 'My résumé', exact: true}).click();
        await page.waitForURL('**/about/#resume');
        const resume = await page.locator('.about-resume-heading').boundingBox();
        assert.ok(resume.y >= layout.headerBottom && resume.y < height / 2, `${width}×${height}: résumé heading hidden below header`);
        if (screenshots) await page.screenshot({path: path.join(screenshots, `${engine}-${width}-resume.png`)});
        await page.locator('.about-product img').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {const img=document.querySelector('.about-product img');return img.complete && img.naturalWidth > 0;});
        if (width === 320 && screenshots) {
          await page.locator('.about-contact').scrollIntoViewIfNeeded();
          await page.screenshot({path: path.join(screenshots, `${engine}-${width}-contact.png`)});
        }
        assert.deepEqual(errors, [], `${width}×${height}: JavaScript/console errors`);
        assert.deepEqual(failed, [], `${width}×${height}: failed HTTP responses`);
        console.log(`${engine} ${width}×${height}: About fits, résumé anchor visible, image loaded`);
        await context.close();
      }

      const context = await browser.newContext({viewport: {width:1440,height:900}});
      const page = await context.newPage();
      await page.goto(origin, {waitUntil: 'domcontentloaded'});
      await page.locator('header a[href="/about/"]:visible').click();
      await page.waitForURL('**/about/');
      assert.equal(await page.locator('.nm-nav [aria-current="page"]').textContent(), 'about');
      await page.goBack();
      await page.waitForURL(origin + '/');
      await page.goForward();
      await page.waitForURL('**/about/');
      await page.locator('.nm-nav a[href="/index/"]').click();
      await page.waitForURL('**/index/');
      await page.locator('.nm-nav a[href="/about/"]').click();
      await page.waitForURL('**/about/');

      for (const legacy of ['/#about', '/index.html#about']) {
        await page.goto(origin + legacy, {waitUntil:'domcontentloaded'});
        await page.waitForURL('**/about/');
      }
      await page.setViewportSize({width:390,height:844});
      await page.locator('.nm-burger').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.nm-burger-panel a[href="/about/"]').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('nm-burger')), true);
      await page.goto(origin, {waitUntil:'domcontentloaded'});
      await page.locator('.nm-burger').click();
      await page.locator('.nm-burger-panel a[href="/about/"]').click();
      await page.waitForURL('**/about/');
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('nm-menu-open')), false);
      await context.close();

      const noJs = await browser.newContext({viewport: {width:390,height:844}, javaScriptEnabled: false});
      const staticPage = await noJs.newPage();
      await staticPage.goto(origin + '/about/');
      assert.equal(await staticPage.locator('main h1').textContent(), 'Hey,I’m Nico!');
      assert.equal(await staticPage.locator('.about-job').count(), 4, 'experience is available without JavaScript');
      await staticPage.getByRole('link', {name:'My résumé',exact:true}).click();
      await staticPage.waitForURL('**/about/#resume');
      await staticPage.locator('.wordmark').click();
      await staticPage.waitForURL(origin + '/');
      await noJs.close();
    } finally {await browser.close();}
  });
}
