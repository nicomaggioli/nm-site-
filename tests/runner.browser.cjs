const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.NM_TEST_URL||'http://127.0.0.1:8814';

// Expose the real model only in this browser context so tests can reach later
// levels without waiting minutes. No hooks are shipped in production scripts.
const source=fs.readFileSync(path.join(__dirname,'../js/nm-run-engine.mjs'),'utf8')
  .replace('export class Runner','class BaseRunner')+
  '\nexport class Runner extends BaseRunner { constructor(options){super(options);globalThis.__testRunner=this;} }';

for(const engine of ['webkit','chromium'])test(`${engine}: Cloud Run unlocks, HUD, pause, restart and small screens`,{timeout:60000},async()=>{
  const options={headless:true};
  if(engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE)options.executablePath=process.env.CHROMIUM_EXECUTABLE;
  const browser=await playwright[engine].launch(options);
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/js/nm-run-engine.mjs*',route=>route.fulfill({body:source,contentType:'text/javascript'}));
    await page.goto(origin+'/#run',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Start run',exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    for(const [width,height] of [[320,480],[320,568],[390,844],[480,320],[568,320],[844,390],[768,1024],[1920,1080]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(100);
      const layout=await page.locator('.nm-run-stage').evaluate(stage=>{
        const r=stage.getBoundingClientRect();
        const inside=el=>{const b=el.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;};
        const scores=[...stage.querySelectorAll('.nm-run-score')].map(el=>el.getBoundingClientRect());
        return {visible:[...stage.querySelectorAll('.nm-run-panel > *, .nm-run-score')].every(inside),
          scoreOverlap:scores.some((s,i)=>i>0&&s.left<scores[i-1].right),overflow:document.querySelector('.nm-run').scrollWidth>innerWidth};
      });
      assert.equal(layout.visible,true,`${width}×${height}: panel and HUD must fit inside the stage`);
      assert.equal(layout.scoreOverlap,false,`${width}×${height}: HUD columns overlap`);
      assert.equal(layout.overflow,false,`${width}×${height}: horizontal overflow`);
      const controls=await page.locator('.nm-run-controls').evaluate(el=>[...el.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>{
        const r=b.getBoundingClientRect();return {inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,w:r.width,h:r.height};
      }));
      assert.ok(controls.every(b=>b.inside&&b.w>=44&&b.h>=44),`${width}×${height}: thumb controls must fit and have 44px targets`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Start run',exact:true}).click();
    await page.evaluate(()=>{__testRunner.next=100;});
    assert.equal(await page.locator('.nm-run-controls button').count(),3,'only Duck, Pause and Jump');
    const order=await page.locator('.nm-run-controls button').evaluateAll(buttons=>buttons.map(b=>({label:b.getAttribute('aria-label')||b.textContent,x:b.getBoundingClientRect().x})));
    assert.deepEqual(order.map(b=>b.label),['Duck','Pause','Jump']);
    assert.ok(order[0].x<order[1].x&&order[1].x<order[2].x,'Duck is left, Pause centered, Jump right');
    const jump=await page.locator('.nm-run-a').boundingBox(),duck=await page.locator('.nm-run-b').boundingBox();
    await page.mouse.move(jump.x+jump.width/2,jump.y+jump.height/2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>__testRunner.jumpHeld),true,'A holds jump');
    await page.mouse.move(10,10);await page.mouse.up();
    assert.equal(await page.evaluate(()=>__testRunner.jumpHeld),false,'releasing outside A still releases jump');
    await page.mouse.move(duck.x+duck.width/2,duck.y+duck.height/2);await page.mouse.down();
    await page.keyboard.down('ArrowDown');await page.mouse.up();
    assert.equal(await page.evaluate(()=>__testRunner.duck),true,'releasing one input must not cancel another held duck input');
    await page.keyboard.up('ArrowDown');assert.equal(await page.evaluate(()=>__testRunner.duck),false);
    await page.mouse.move(duck.x+duck.width/2,duck.y+duck.height/2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>__testRunner.duck),true,'the red B button ducks');
    await page.keyboard.press('KeyP');
    assert.equal(await page.evaluate(()=>__testRunner.duck),false,'pause releases held controls');
    assert.equal(await page.locator('.nm-run-controls .is-held').count(),0);
    await page.mouse.up();await page.getByRole('button',{name:'Resume',exact:true}).last().click();
    if(engine==='chromium'){
      const cdp=await page.context().newCDPSession(page);
      const first={x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:1},second={x:duck.x+duck.width/2,y:duck.y+duck.height/2,id:2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,second]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[first]});
      assert.equal(await page.evaluate(()=>__testRunner.duck),true,'duck stays held when the jump thumb lifts');
      assert.equal(await page.evaluate(()=>__testRunner.jumpHeld),false,'lifting jump releases it independently');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      assert.equal(await page.evaluate(()=>__testRunner.duck),false,'OS gesture cancellation clears held buttons');
      await cdp.detach();
    }
    for(const [time,level,kind,notice] of [[12,2,'bird_high','High birds'],[25,3,'bird_laser','Glowing beak'],[45,4,'bird_wave','Diving birds'],[70,5,'shooting_star','Shooting stars']]){
      const spawned=await page.evaluate(time=>{
        const g=__testRunner;g.time=time-.01;g.obstacles=[];g.tokens=[];g.next=0;g.y=0;g.vy=0;g.update(1/30);
        return {kind:g.obstacles[0]?.kind||g.tokens[0]?.kind,speed:g.speed};
      },time);
      assert.equal(spawned.kind,kind,'first encounter teaches the newly unlocked type');
      await page.waitForFunction(level=>document.querySelector('.nm-run').dataset.level===String(level),level);
      assert.match(await page.locator('.nm-run-milestone').textContent(),new RegExp(notice));
      assert.equal(await page.locator('.nm-run-milestone').isVisible(),true);
      assert.equal(await page.locator('.nm-run-score b').nth(2).textContent(),String(level));
    }
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const paused=await page.evaluate(()=>__testRunner.time);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>__testRunner.time),paused,'pause freezes progression');
    await page.setViewportSize({width:568,height:320});
    await page.getByRole('button',{name:'Resume',exact:true}).last().click();
    await page.waitForFunction(()=>__testRunner.time>70.05);
    assert.equal(await page.locator('.nm-run').getAttribute('data-level'),'5','rotation/resume keeps the level');
    await page.evaluate(()=>{
      const g=__testRunner;g.obstacles=[];g.tokens=[];g.next=100;g.y=0;g.vy=0;
      g.tokens.push({kind:'shooting_star',x:94,y:180,startX:94,startY:180,slope:0,value:3});
    });
    await page.waitForFunction(()=>__testRunner.stars===3);
    assert.match(await page.locator('.nm-run-milestone').textContent(),/\+75/);
    assert.equal(await page.locator('.nm-run-score b').nth(1).textContent(),'3');
    await page.evaluate(()=>{const g=__testRunner;g.obstacles=[];g.spawn('bird_low').x=80;});
    await page.getByRole('button',{name:'Run again',exact:true}).waitFor();
    assert.match(await page.locator('.nm-run-panel p').textContent(),/3 stars · level 5/);
    await page.getByRole('button',{name:'Run again',exact:true}).click();
    assert.equal(await page.locator('.nm-run').getAttribute('data-level'),'1');
    assert.equal(await page.locator('.nm-run-score b').nth(1).textContent(),'0');
    assert.equal(await page.locator('.nm-run-milestone').isVisible(),false,'previous unlock/bonus notice clears on restart');
    await page.getByRole('button',{name:'Exit',exact:true}).click();
    assert.equal(await page.locator('.nm-run').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
