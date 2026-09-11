const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

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
