const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/nm-intro-surface.js'), 'utf8');

function environment({phone=true, reduced=false, fail=false, responsive=false}={}) {
  const window = new EventTarget(), frames = new Map(), canvases = [], loaded = [], classes = new Set();
  const mobile = new EventTarget(), reduce = new EventTarget();
  mobile.matches = phone; reduce.matches = reduced;
  let width=390, height=1312, sequence=0, clock=0, invalidations=0, appended=0;
  window.devicePixelRatio=3;
  window.__nmMade=()=>{invalidations++;};
  const cells=Array.from({length:7},(_,i)=>{
    const media=i<5?{poster:'/poster-'+i+'.webp'}:{src:'/photo-'+i+'.webp'};
    if(responsive&&i>=5)Object.assign(media,{
      srcset:'/phone-'+i+'.webp 768w',currentSrc:'',
      decode(){return Promise.resolve().then(()=>{this.currentSrc='/phone-'+i+'.webp';});}
    });
    return {
      querySelector:()=>media,
      getBoundingClientRect:()=>({left:(i%2)*width/2*.12,top:370+Math.floor(i/2)*height/4*.12,
        width:width/2*.12,height:height/4*.12})
    };
  });
  const tiles=Array.from({length:112},(_,i)=>({style:{gridArea:`${1+Math.floor(i/15)} / ${1+i%15} / ${2+Math.floor(i/15)} / ${2+i%15}`},
    querySelector:()=>({src:'/tile-'+(i%33)+'.webp'})}));
  const ring={querySelectorAll:()=>tiles};
  const grid={get offsetWidth(){return width;},get offsetHeight(){return height;},
    getBoundingClientRect:()=>({left:0,top:370,width:width*.12,height:height*.12}),querySelectorAll:()=>cells};
  const section={querySelector:s=>s==='.index-feature'?grid:ring,prepend(){appended++;},
    classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}};
  const document={getElementById:()=>section,createElement:()=>{
    const calls=[];
    const ctx={drawImage:(...args)=>calls.push(args),setTransform(){},fillRect(){}};
    const canvas={width:300,height:150,style:{},getContext:()=>ctx,setAttribute(){},calls};
    canvases.push(canvas);return canvas;
  }};
  class Image {
    constructor(){loaded.push(this);this.naturalWidth=640;this.naturalHeight=480;}
    decode(){return fail?Promise.reject(new Error('Image failed')):Promise.resolve();}
  }
  const context={window,document,Image,matchMedia:q=>q.includes('reduced-motion')?reduce:mobile,
    performance:{now:()=>clock+=2},requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;}};
  vm.runInNewContext(source,context);
  return {window,canvases,loaded,classes,mobile,reduce,context,
    get invalidations(){return invalidations;},get appended(){return appended;},
    resize(w,h){width=w;height=h;window.dispatchEvent(new Event('resize'));},
    async settle(){for(let i=0;i<180;i++){const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());await Promise.resolve();}}
  };
}

test('phone zoom draws two cached layers, has bounded textures, and restores live media', async()=>{
  const env=environment();await env.settle();
  assert.equal(env.invalidations,1);
  assert.equal(env.loaded.length,40,'duplicate ring photos share their decode');
  assert.equal(env.canvases.length,3);
  const [view,core,ring]=env.canvases;
  assert.equal(core.calls.length,7);assert.equal(ring.calls.length,112);
  assert.ok(core.width<=2048&&core.height<=2048&&ring.width<=2048&&ring.height<=2048);
  for(const p of [0,.1,.2,.3,.4,.5,.6,.7,.8,.9])env.window.__nmIntroSurface(p,844);
  assert.equal(view.calls.length,20,'each scroll frame draws at most two cached images');
  assert.equal(core.calls.length,7);assert.equal(ring.calls.length,112,'scrolling never rebuilds the collage');
  assert.equal(view.width,585);assert.equal(view.height,1266,'3x displays use a bounded 1.5x surface');
  env.window.__nmIntroSurface(.9,844);assert.equal(view.calls.length,20,'unchanged progress does no work');
  assert.equal(env.classes.has('nm-intro-cached'),true);
  assert.equal(env.window.__nmIntroSurface(1,844),false);
  assert.equal(view.hidden,true);assert.equal(env.classes.size,0,'real links and videos return after the intro');
  env.window.__nmIntroSurface(0,844);assert.equal(view.hidden,false);assert.equal(view.calls.length,22);
});

test('rotation rebuilds the cache once, toolbar changes do not, and desktop releases it', async()=>{
  const env=environment();await env.settle();
  const oldCore=env.canvases[1],oldRing=env.canvases[2];
  env.resize(390,1312);await env.settle();
  assert.equal(env.invalidations,1);assert.equal(env.canvases.length,3);
  env.resize(844,900);await env.settle();
  assert.equal(env.invalidations,2);assert.equal(env.canvases.length,5);
  assert.equal(oldCore.width,1);assert.equal(oldRing.width,1,'old buffers are released on rotation');
  env.window.__nmIntroSurface(.2,390);assert.equal(env.canvases[0].hidden,false);
  env.mobile.matches=false;env.mobile.dispatchEvent(new Event('change'));await env.settle();
  assert.equal(env.classes.size,0);assert.equal(env.canvases[3].width,1);assert.equal(env.canvases[4].width,1);
  assert.equal(env.window.__nmIntroSurface(0,1080),false);
  vm.runInNewContext(source,env.context);assert.equal(env.appended,1,'initialization is idempotent');
});

test('failed images and reduced motion retain the original content', async()=>{
  const failed=environment({fail:true});await failed.settle();
  assert.equal(failed.window.__nmIntroSurface(.3,844),false);
  assert.equal(failed.classes.size,0);assert.equal(failed.canvases[0].hidden,true);
  for(const options of [{reduced:true},{phone:false}]){
    const env=environment(options);await env.settle();
    assert.equal(env.loaded.length,0);assert.equal(env.window.__nmIntroSurface(0,844),false);
  }
});

test('responsive images finish source selection before the collage copies them', async()=>{
  const env=environment({responsive:true});await env.settle();
  const sources=env.loaded.map(image=>image.src);
  assert.ok(sources.includes('/phone-5.webp'));
  assert.ok(sources.includes('/phone-6.webp'));
  assert.ok(!sources.includes('/photo-5.webp'));
  assert.ok(!sources.includes('/photo-6.webp'),'an initially empty currentSrc must not download the large fallback');
  assert.equal(env.loaded.length,40,'responsive sources retain the shared decode cache');
  assert.equal(env.window.__nmIntroSurface(.5,844),true);
});
