const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

test('service previews handle desktop selection, touch expansion and breakpoint changes without duplicate listeners', () => {
  const desktop=new EventTarget();desktop.matches=true;
  let intersection,focused;
  const items=Array.from({length:6},(_,index)=>{
    const attributes={},panelAttributes={},classes=new Set();
    const image={loading:'lazy'};
    const panel={setAttribute:(key,value)=>panelAttributes[key]=value,querySelector:()=>image};
    const button=new EventTarget();
    button.setAttribute=(key,value)=>attributes[key]=value;
    button.focus=()=>{focused=index;button.dispatchEvent(new Event('focus'));};
    return {attributes,panelAttributes,image,button,classes,
      classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
      querySelector:selector=>selector==='button'?button:panel};
  });
  const section={dataset:{},querySelectorAll:()=>items};
  const document={getElementById:()=>section};
  function IntersectionObserver(callback){intersection=callback;this.observe=()=>{};this.disconnect=()=>{};}
  const context={window:{IntersectionObserver},document,matchMedia:()=>desktop,IntersectionObserver};
  vm.runInNewContext(script('nm-services.js'),context);
  const open=()=>items.map((item,index)=>item.classes.has('is-open')?index:-1).filter(index=>index>=0);
  let pointerPosition=0;
  const move=(index,type,position=++pointerPosition)=>{const event=new Event('pointermove');Object.assign(event,{pointerType:type,clientX:100,clientY:position});items[index].button.dispatchEvent(event);};
  assert.deepEqual(open(),[0]);
  assert.equal(items.every(item=>item.image.loading==='lazy'),true,'do not eagerly fetch showcase images at page load');
  intersection([{isIntersecting:true}]);
  assert.equal(items.every(item=>item.image.loading==='eager'),true);
  for(const index of [5,2,1,4,0]){move(index,'mouse');assert.deepEqual(open(),[index]);}
  move(3,'mouse',pointerPosition);assert.deepEqual(open(),[0],'layout changes beneath a stationary pointer must not switch panels');
  items[3].button.dispatchEvent(Object.assign(new Event('pointerenter'),{pointerType:'mouse'}));
  assert.deepEqual(open(),[0],'expanding a row must not trigger a hover selection loop');
  move(3,'touch');assert.deepEqual(open(),[0],'touch hover must not select a panel before a tap');
  items[0].button.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key:'ArrowDown'}));
  assert.equal(focused,1);assert.deepEqual(open(),[1]);
  desktop.matches=false;desktop.dispatchEvent(new Event('change'));
  assert.deepEqual(open(),[1]);
  items[3].button.dispatchEvent(new Event('click'));
  assert.deepEqual(open(),[1,3],'opening a lower phone panel must not collapse content above it');
  items[3].button.dispatchEvent(new Event('click'));assert.deepEqual(open(),[1]);
  vm.runInNewContext(script('nm-services.js'),context);
  items[3].button.dispatchEvent(new Event('click'));
  assert.deepEqual(open(),[1,3],'repeated initialization must not toggle a panel twice');
  desktop.matches=true;desktop.dispatchEvent(new Event('change'));assert.deepEqual(open(),[3]);
  items.forEach((item,index)=>{
    assert.equal(item.attributes['aria-expanded'],String(index===3));
    assert.equal(item.panelAttributes['aria-hidden'],String(index!==3));
  });
});

function scheduler(hasReact) {
  const window = new EventTarget(), document = new EventTarget(), tasks = [];
  document.readyState = 'loading';
  document.querySelector = s => hasReact && s.startsWith('script') ? {} : null;
  const context = {window, document, history:{}, location:{hash:''}, console:{error(){}},
    setTimeout: fn => tasks.push(fn), requestAnimationFrame:fn => tasks.push(fn)};
  vm.runInNewContext(script('nm-sync.js'), context);
  return {window, document, location:context.location, flush(){while(tasks.length)tasks.shift()();}};
}

test('homepage extensions wait for hydration and initialize once across repeated events', () => {
  const env = scheduler(true); let runs = 0;
  env.window.__nmReady(() => runs++);
  env.document.dispatchEvent(new Event('DOMContentLoaded')); env.flush();
  assert.equal(runs, 0);
  env.window.dispatchEvent(new Event('nm:hydrated')); env.flush();
  assert.equal(runs, 1);
  for(let n=0;n<10;n++)env.window.dispatchEvent(new Event('nm:hydrated'));
  env.window.dispatchEvent(new Event('scroll')); env.flush();
  assert.equal(runs, 1);
  env.window.__nmReady(() => runs++); assert.equal(runs, 2);
});

test('static archive initializes without any React hydration event', () => {
  const env=scheduler(false); let runs=0;
  env.window.__nmReady(() => runs++); env.flush(); assert.equal(runs,0);
  env.document.dispatchEvent(new Event('DOMContentLoaded')); env.flush();
  assert.equal(runs,1);
});

test('leaving the footer hides its frozen canvas and returning to the hero restores rendering', () => {
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const bundleName=html.match(/nm-scenes-[a-f0-9]+\.js/)[0];
  const bundle=fs.readFileSync(path.join(root,'_next/static/chunks',bundleName),'utf8');
  const component=bundle.split('e.s(["GlobalCanvas",0,')[1].split('}],49317)')[0];
  const window=new EventTarget(),document=new EventTarget(),frames=new Map();
  const mobile={matches:false},state=[];
  let cursor=0,initialized=false,sequence=0,footerTop=5000,gameOpen=false;
  document.hidden=false;
  document.documentElement={classList:{contains:()=>gameOpen}};
  document.querySelector=selector=>selector.endsWith('h-svh')
    ?{offsetHeight:900}:{getBoundingClientRect:()=>({top:footerTop})};
  const context={document,scrollY:0,innerHeight:900,matchMedia:()=>mobile,
    addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window),
    requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),
    l:{useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value;}];},
      useEffect(effect){if(!initialized){initialized=true;effect();}},Suspense:'suspense'},
    t:{jsx:(type,props)=>({type,props})},d:'canvas',x:{config:{camera:{position:[0,0,1],fov:45}}},
    o:{NoToneMapping:0},f:{sceneTunnel:{Out:'scene'}}};
  const render=vm.runInNewContext('('+component+'})',context);
  const view=()=>{cursor=0;return render();};
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  view();flush();
  const verify=(visible)=>{
    const result=view();
    assert.equal(result.props.style.visibility,visible?'visible':'hidden');
    assert.equal(result.props.children.props.frameloop,visible?'always':'never');
  };
  verify(true);
  context.scrollY=5370;footerTop=0;window.dispatchEvent(new Event('scroll'));flush();verify(true);
  context.scrollY=3570;footerTop=1800;window.dispatchEvent(new Event('scroll'));flush();verify(false);
  context.scrollY=0;footerTop=5370;window.dispatchEvent(new Event('scroll'));flush();verify(true);
  gameOpen=true;window.dispatchEvent(new Event('nm:gamechange'));flush();verify(false);
  gameOpen=false;window.dispatchEvent(new Event('nm:gamechange'));flush();verify(true);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));verify(false);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));verify(true);
  mobile.matches=true;context.innerHeight=844;
  context.scrollY=5370;footerTop=0;window.dispatchEvent(new Event('resize'));flush();verify(true);
  assert.deepEqual(Array.from(view().props.children.props.dpr),[1,1.25]);
  gameOpen=true;window.dispatchEvent(new Event('nm:gamechange'));verify(false);
  gameOpen=false;window.dispatchEvent(new Event('nm:gamechange'));verify(true);
  footerTop=1800;context.scrollY=3570;window.dispatchEvent(new Event('scroll'));flush();verify(false);
  context.scrollY=0;footerTop=5370;window.dispatchEvent(new Event('scroll'));flush();verify(true);
});

test('one failed extension does not prevent the rest from initializing', () => {
  const env=scheduler(false); let ran=false;
  env.window.__nmReady(() => {throw new Error('expected test failure');});
  env.window.__nmReady(() => {ran=true;});
  env.document.dispatchEvent(new Event('DOMContentLoaded'));env.flush();
  assert.equal(ran,true);assert.equal(env.window.__nmSync.errors.length,1);
});

test('videos defer bytes, use the phone source, and pause a late play promise after hiding', async () => {
  const window=new EventTarget(), document=new EventTarget(), tasks=new Map();
  const reduce=new EventTarget(),mobile=new EventTarget();
  reduce.matches=false;mobile.matches=true;document.hidden=false;window.scrollY=0;
  let sequence=0, intersection, resolvePlay, plays=0;
  const attributes={};
  const video={dataset:{src:'/desktop.mp4',mobileSrc:'/phone.mp4'},paused:true,isConnected:true,
    set src(value){attributes.src=value;},getAttribute:k=>attributes[k],load(){},
    pause(){this.paused=true;},play(){plays++;return new Promise(resolve=>{resolvePlay=()=>{this.paused=false;resolve();};});}};
  document.querySelectorAll=()=>[video];document.querySelector=()=>({offsetHeight:800});
  function IntersectionObserver(callback){intersection=callback;this.observe=()=>{};}
  window.IntersectionObserver=IntersectionObserver;
  const context={window,document,console,navigator:{},innerHeight:800,IntersectionObserver,
    matchMedia:q=>q.includes('reduced-motion')?reduce:mobile,
    requestAnimationFrame:fn=>{tasks.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>tasks.delete(id)};
  function flush(){const current=[...tasks.values()];tasks.clear();current.forEach(fn=>fn());}
  vm.runInNewContext(script('nm-video.js'),context);
  intersection([{target:video,isIntersecting:true}]);flush();
  assert.equal(attributes.src,undefined);assert.equal(plays,0);
  window.scrollY=400;window.dispatchEvent(new Event('scroll'));flush();
  assert.equal(attributes.src,'/phone.mp4');assert.equal(plays,1);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  resolvePlay();await Promise.resolve();assert.equal(video.paused,true);
  document.hidden=false;reduce.matches=true;document.dispatchEvent(new Event('visibilitychange'));flush();
  assert.equal(plays,1);
});


test('About deep links resolve after custom sections mount even before Lenis is ready', () => {
  const env=scheduler(true);let destination;
  env.location.hash='#about';env.window.scrollY=700;
  env.window.scrollTo=options=>{destination=options.top;};
  env.window.__nmReady(()=>{
    env.document.querySelector=selector=>selector==='#about'?{getBoundingClientRect:()=>({top:1500})}:null;
  });
  env.window.dispatchEvent(new Event('nm:hydrated'));env.flush();
  assert.equal(destination,2200);
});

test('responsive menu updates keep the game dialog isolated and restore prior focus on exit',()=>{
  const document=new EventTarget(),window={};let observe;
  const make=()=>({inert:false,isConnected:true,tagName:'DIV',contains(n){return n===this;},querySelectorAll(){return [];},focus(){document.activeElement=this;},closest(){return null;}});
  const page=make(),trigger=make(),dialog=make();document.body={children:[page,dialog]};document.activeElement=trigger;
  document.querySelector=selector=>selector.includes('.nm-run')?dialog:null;
  function MutationObserver(callback){observe=callback;this.observe=()=>{};}
  vm.runInNewContext(script('nm-trap.js'),{window,document,MutationObserver,Array,getComputedStyle:()=>({})});
  assert.equal(page.inert,true);assert.equal(document.activeElement,dialog);
  observe([{target:{matches:()=>true}}]);
  assert.equal(page.inert,true);assert.equal(document.activeElement,dialog);
  window.__nmDialog.release(dialog);
  assert.equal(page.inert,false);assert.equal(document.activeElement,trigger);
});


test('repeated gallery scroll cycles preserve page height and restore the initial projection', () => {
  const window = new EventTarget(), tasks = new Map(), reduce = new EventTarget();
  let id = 0, measurements = 0;
  window.scrollY = 0; reduce.matches = false;
  const hero = {get offsetHeight(){measurements++; return 900;}};
  const grid = {style:{}}, ring = {style:{}};
  const nodes = [];
  const makeNode = () => { const node = {style:{},dataset:{},setAttribute(){},appendChild(){},prepend(){}}; nodes.push(node); return node; };
  const section = {style:{},dataset:{},get offsetHeight(){measurements++;return 1500;},
    before(){},querySelector:s=>s==='.index-feature'?grid:ring};
  const rootClasses = new Set();
  const document = {documentElement:{classList:{toggle:(name,on)=>on?rootClasses.add(name):rootClasses.delete(name)}},
    getElementById:()=>section,querySelector:()=>hero,createElement:makeNode};
  vm.runInNewContext(script('nm-home-scroll.js'), {window,document,matchMedia:()=>reduce,
    requestAnimationFrame:fn=>{tasks.set(++id,fn);return id;}});
  const flush=()=>{const pending=[...tasks.values()];tasks.clear();pending.forEach(fn=>fn());};
  const initialTransform=grid.style.transform;
  for(let cycle=0;cycle<4;cycle++)for(const y of [450,899,900,5370,900,899,450,0]){
    window.scrollY=y;window.dispatchEvent(new Event('scroll'));flush();
    const pinned=y<900;
    assert.equal(section.dataset.nmPinned,String(pinned));
    assert.equal(rootClasses.has('nm-past-hero'),!pinned,'hero captions must stay out of later sections');
    assert.equal(nodes[0].style.marginTop,'-900px');
    assert.equal(nodes[0].style.height,'2400px','the sticky runway must remain constant throughout scrolling');
    assert.equal(section.style.position,undefined,'scrolling must not switch positioning modes');
    assert.equal(ring.style.display,pinned?'':'none');
    if(y===0)assert.equal(grid.style.transform,initialTransform);
  }
  const before=measurements;
  window.scrollY=400;window.dispatchEvent(new Event('scroll'));flush();
  assert.equal(measurements,before,'scrolling must not remeasure layout');
  reduce.matches=true;reduce.dispatchEvent(new Event('change'));flush();
  assert.equal(grid.style.transform,'');assert.equal(ring.style.display,'none');
  assert.equal(nodes[0].style.height,'2400px');
  assert.equal(nodes.length,2,'scroll cycles must not create additional containers');
});

test('site previews follow the row under the cursor during momentum scrolling and recover without re-entry', () => {
  const window = new EventTarget(), document = new EventTarget(), enabled = new EventTarget();
  const frames = new Map(), classes = new Set(), images = [];
  let nextFrame = 0, hit = null, peek;
  enabled.matches = true;
  class Image {
    constructor() { images.push(this); }
    decode() { return Promise.resolve(); }
    replaceWith(image) { peek.image = image; }
  }
  const host = {textContent:''};
  document.createElement = () => (peek = {style:{},isConnected:true,image:new Image(),
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},
    querySelector:s=>s==='img'?peek.image:host});
  document.body = {appendChild(){}};
  const row = name => ({href:'https://'+name+'.com/',getAttribute:()=>'/'+name+'.webp',closest(){return this;}});
  const spectra=row('spectra'), alares=row('alares');
  document.querySelectorAll=()=>[spectra,alares];document.getElementById=()=>null;
  document.elementFromPoint=()=>hit;
  vm.runInNewContext(script('nm-sites.js'), {window,document,Image,navigator:{},innerWidth:1440,innerHeight:900,
    matchMedia:()=>enabled,setTimeout:fn=>fn(),requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;}});
  const flush=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
  const pointer=(type,extra={})=>{const event=new Event(type);Object.assign(event,{clientX:700,clientY:400,pointerType:'mouse'},extra);document.dispatchEvent(event);flush();};
  hit=spectra;pointer('pointerover');
  assert.equal(classes.has('is-on'),true);assert.equal(peek.image.src,'/spectra.webp');
  for(let i=0;i<8;i++) {window.dispatchEvent(new Event('scroll'));flush();assert.equal(classes.has('is-on'),true);}
  hit=alares;window.dispatchEvent(new Event('scroll'));flush();
  assert.equal(peek.image.src,'/alares.webp','a stationary cursor must preview the newly scrolled row');
  hit=null;window.dispatchEvent(new Event('scroll'));flush();assert.equal(classes.has('is-on'),false);
  hit=spectra;pointer('pointermove');assert.equal(classes.has('is-on'),true);
  assert.equal(images.length,3,'switching rows must reuse the two warmed images');
  window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('scroll'));flush();
  assert.equal(classes.has('is-on'),false,'background scrolling must not resurrect the preview');
  pointer('pointermove');assert.equal(classes.has('is-on'),true);
  pointer('pointerout',{relatedTarget:null});window.dispatchEvent(new Event('scroll'));flush();assert.equal(classes.has('is-on'),false);
  pointer('pointermove',{pointerType:'touch'});assert.equal(classes.has('is-on'),false);
  pointer('pointermove');enabled.matches=false;enabled.dispatchEvent(new Event('change'));flush();
  assert.equal(classes.has('is-on'),false,'the preview must turn off at the mobile breakpoint');
});


test('layout and orientation changes refresh scroll ranges once per frame and clean up on unmount', () => {
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const bundle=fs.readFileSync(path.join(root,'_next/static/chunks',html.match(/nm-home-[a-f0-9]+\.js/)[0]),'utf8');
  const effect='() => {'+bundle.split('(0,u.useEffect)(()=>{window.__nmLenis=A;')[1].split('},[A]);let J=')[0];
  const window=new EventTarget(),frames=new Map();let next=0,refreshes=0,resizes=0,observer,disconnected=false;
  window.scrollY=0;
  const main={};
  class ResizeObserver {constructor(callback){observer=callback;}observe(node){assert.equal(node,main);}disconnect(){disconnected=true;}}
  const context={window,document:{querySelector:()=>main},Event,ResizeObserver,G(){},
    A:{resize(){resizes++;}},a:{ScrollTrigger:{refresh(){refreshes++;}}},
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
  const cleanup=vm.runInNewContext('('+effect+'})()',context);
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  flush();
  for(let n=0;n<12;n++){window.dispatchEvent(new Event('resize'));observer();}
  flush();assert.equal(refreshes,1);assert.equal(resizes,1);
  window.dispatchEvent(new Event('scroll'));flush();assert.equal(refreshes,1,'ordinary scrolling must not rebuild ranges');
  window.dispatchEvent(new Event('resize'));cleanup();flush();assert.equal(refreshes,1);assert.equal(disconnected,true);
  window.dispatchEvent(new Event('resize'));flush();assert.equal(refreshes,1);
});
