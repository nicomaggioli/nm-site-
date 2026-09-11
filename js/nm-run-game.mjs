import {Runner,GROUND,PLAYER_X} from './nm-run-engine.mjs?v=0e5ca69f7d';

const ART='/media/runner/runner-atlas.png?v=aea3193824';
// Atlas rectangles retain the supplied sheet's pose order. Trimmed at draw time.
const CELLS={idle:[35,40,130,210],run1:[188,40,130,210],run2:[355,40,130,210],run3:[515,40,130,210],run4:[680,40,135,210],jump:[875,35,115,215],duck:[1025,75,120,180],land:[1200,45,110,210],hit:[1355,30,155,225],dead:[1560,150,185,105],crate:[65,410,105,110],barrel:[265,410,95,110],rock:[440,435,100,85],bush:[630,430,130,90],fence:[830,425,140,95],low:[1010,300,280,220],cactus:[1405,365,115,155],coin:[1610,430,85,90]};
function put(n,value){value=String(value);if(n.textContent!==value)n.textContent=value;}
let root=null,game=null,canvas,ctx,panel,action,heading,description,pauseButton,scoreLabel,bestLabel,coinLabel,status;
let sprites=null,artPromise=null,raf=0,last=0,acc=0,best=0,announced='',saved=false,abort=null,resizeObserver=null;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
try {best=Number(localStorage.getItem('nm-cloud-run-best'))||0;}catch{}
function node(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;}
function button(text,cls,handler){const b=node('button','nm-run-btn '+(cls||''),text);b.type='button';b.addEventListener('click',handler);return b;}
function loadArt(){
  if(artPromise)return artPromise;
  artPromise=new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      try{
        const result={};
        for(const [name,rect] of Object.entries(CELLS)){
          const [x,y,w,h]=rect,c=document.createElement('canvas');c.width=w;c.height=h;
          const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,x,y,w,h,0,0,w,h);
          const data=cx.getImageData(0,0,w,h),p=data.data;let left=w,right=-1,top=h,bottom=-1;
          // Chroma key is done once, never during the animation loop.
          for(let j=0;j<h;j++)for(let i=0;i<w;i++){
            const k=(j*w+i)*4,r=p[k],g=p[k+1],b=p[k+2];
            if(r>155&&b>140&&g<125&&Math.min(r,b)-g>65)p[k+3]=0;
            if(p[k+3]>30){left=Math.min(left,i);right=Math.max(right,i);top=Math.min(top,j);bottom=Math.max(bottom,j);}
          }
          cx.putImageData(data,0,0);
          if(right<left)throw new Error('Empty sprite: '+name);
          const trimmed=document.createElement('canvas');trimmed.width=right-left+1;trimmed.height=bottom-top+1;
          trimmed.getContext('2d').drawImage(c,left,top,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);
          result[name]=trimmed;
        }
        sprites=result;resolve();
      }catch(error){reject(error);}
    };
    image.onerror=()=>reject(new Error('Could not load sprite artwork'));image.src=ART;
  }).catch(error=>{artPromise=null;throw error;});return artPromise;
}
function say(text){if(text!==announced){status.textContent=text;announced=text;}}
function saveBest(){if(saved)return;saved=true;if(game.score>best){best=game.score;try{localStorage.setItem('nm-cloud-run-best',String(best));}catch{}}}
function sync(){
  if(!root)return;
  root.dataset.state=game.state;put(scoreLabel,String(game.score).padStart(5,'0'));
  put(bestLabel,String(Math.max(best,game.score)).padStart(5,'0'));put(coinLabel,game.coins);
  const state=game.state;panel.hidden=state==='running'||state==='hit';pauseButton.hidden=state==='ready'||state==='over'||state==='hit';
  put(pauseButton,state==='paused'?'Resume':'Pause');
  if(state==='ready'){heading.textContent='A little detour.';description.textContent='Jump the obstacles. Duck under LOW. Grab a few coins.';action.textContent=sprites?'Let’s run':'Loading…';action.disabled=!sprites;}
  if(state==='paused'){heading.textContent='Take a breather.';description.textContent='Your run is waiting right here.';action.textContent='Keep going';action.disabled=false;say('Game paused. Choose Keep going to resume.');}
  if(state==='over'){saveBest();heading.textContent='One more run?';description.textContent=`${game.score} points · ${game.coins} coins · best ${best}`;action.textContent='Run again';action.disabled=false;say(`Run over. ${game.score} points. ${game.coins} coins. Best ${best}.`);}
}
function start(){if(!sprites)return;if(game.state==='paused')game.resume();else{game.reset();game.start();saved=false;}panel.hidden=true;canvas.focus({preventScroll:true});say('Running. Space or tap to jump. Down or Duck to crouch.');sync();wake();}
function pause(){if(!game||game.state!=='running')return;game.pause();cancelAnimationFrame(raf);raf=0;acc=0;sync();draw();}
function togglePause(){if(game.state==='paused')start();else pause();}
function jump(){if(!sprites)return;if(game.state==='ready'||game.state==='over'||game.state==='paused')start();game.jump();wake();}
function duck(value){if(!game)return;game.setDuck(value);if(game.state==='running')wake();}
function layout(){if(!root)return;const width=canvas.parentElement.clientWidth;canvas.width=innerHeight<=520&&innerWidth>600?900:Math.max(420,Math.min(900,Math.round(width)));canvas.height=280;game.width=canvas.width;ctx.imageSmoothingEnabled=false;draw();}
function sprite(name,x,y,w,h){const s=sprites&&sprites[name];if(!s)return;ctx.drawImage(s,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function cloud(x,y,w,h,color){
  // Stepped edges match the pixel art without requiring a scenery download.
  ctx.fillStyle=color;
  ctx.fillRect(Math.round(x+w*.1),Math.round(y+h*.45),Math.round(w*.8),Math.round(h*.55));
  ctx.fillRect(Math.round(x),Math.round(y+h*.62),Math.round(w),Math.round(h*.24));
  ctx.fillRect(Math.round(x+w*.18),Math.round(y+h*.2),Math.round(w*.34),Math.round(h*.7));
  ctx.fillRect(Math.round(x+w*.3),Math.round(y),Math.round(w*.18),Math.round(h*.75));
  ctx.fillRect(Math.round(x+w*.52),Math.round(y+h*.3),Math.round(w*.26),Math.round(h*.6));
}
function landscape(){
  const w=canvas.width,offset=reduce.matches?0:game.distance;
  const sky=ctx.createLinearGradient(0,0,0,280);sky.addColorStop(0,'#5e9fde');sky.addColorStop(1,'#b5dcf5');ctx.fillStyle=sky;ctx.fillRect(0,0,w,280);
  // Distant cloud banks move slowly; the cloud underfoot moves with the run.
  for(let i=-1;i<w/235+2;i++){const x=i*235-(offset*.08%235)+20;cloud(x,61+(i%2+2)%2*21,104,27,'#d9edfb');}
  for(let i=-1;i<w/320+2;i++){const x=i*320-(offset*.17%320)+105;cloud(x,157+(i%2+2)%2*16,148,40,'#e7f4ff');}
  ctx.fillStyle='#e2eefc';ctx.fillRect(0,GROUND,w,18);
  // A level, readable collision surface; only the fluffy underside is irregular.
  ctx.fillStyle='#ffffff';ctx.fillRect(0,GROUND,w,7);
  for(let i=-1;i<w/68+2;i++){
    const x=Math.round(i*68-(offset%68));
    cloud(x,GROUND+2,87,27,i%2?'#f7fbff':'#ffffff');
    ctx.fillStyle='#c8ddef';ctx.fillRect(x+12,GROUND+25,39,4);ctx.fillRect(x+20,GROUND+29,29,4);
    ctx.fillStyle='#eaf4ff';ctx.fillRect(x+40,GROUND+25,28,6);
  }
  ctx.fillStyle='#ecf7ff';
  for(let i=-1;i<w/98+2;i++){const x=Math.round(i*98-(offset%98));ctx.fillRect(x,GROUND+3,18,2);}
}

function draw(){
  if(!ctx||!game)return;landscape();
  for(const o of game.obstacles)sprite(o.kind,o.x,GROUND-o.h,o.w,o.h);
  for(const coin of game.tokens)sprite('coin',coin.x-10,coin.y-11,20,23);
  let pose='idle';if(game.state==='hit')pose='hit';else if(game.state==='over')pose='dead';
  else if(game.y<0)pose='jump';else if(game.duck)pose='duck';else if(game.landed)pose='land';else if(game.state==='running'||game.state==='paused')pose='run'+(1+(Math.floor(game.time*11)%4));
  const s=sprites&&sprites[pose];
  if(s){const scale=64/sprites.idle.height,sw=s.width*scale,sh=s.height*scale;sprite(pose,PLAYER_X+22-sw/2,GROUND+game.y-sh,sw,sh);}
}
function frame(now){
  raf=0;if(!root||!['running','hit'].includes(game.state))return;
  acc+=Math.min(.05,(now-last)/1000);last=now;
  while(acc>=1/120){game.update(1/120);acc-=1/120;}
  draw();sync();if(['running','hit'].includes(game.state))raf=requestAnimationFrame(frame);
}
function wake(){if(!raf&&root&&['running','hit'].includes(game.state)){last=performance.now();acc=0;raf=requestAnimationFrame(frame);}}
function press(e){
  if(e.key==='Escape'){e.preventDefault();closeGame();return;}
  if(e.target.closest('button')&&(e.code==='Space'||e.code==='Enter'))return;
  if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();if(!e.repeat)jump();}
  if(e.code==='ArrowDown'){e.preventDefault();duck(true);}
  if(e.code==='KeyP'){e.preventDefault();if(!e.repeat)togglePause();}
}
function release(e){if(e.code==='Space'||e.code==='ArrowUp')game.releaseJump();if(e.code==='ArrowDown')duck(false);}
function touchControl(b,down,up){
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);down();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>b.addEventListener(type,up));
  b.addEventListener('click',e=>{if(e.detail===0){down();setTimeout(up,170);}});
}
export function openGame(){
  if(root)return;game=new Runner();saved=false;announced='';abort=new AbortController();const signal=abort.signal;
  root=node('div','nm-run');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','nm-run-title');root.tabIndex=-1;
  const top=node('div','nm-run-top'),brand=node('div');brand.append(node('p','nm-run-eyebrow','You found it.'));const title=node('h2','','Cloud Run.');title.id='nm-run-title';brand.append(title);top.append(brand,button('Back to the site ↗','',closeGame));root.append(top);
  const stage=node('div','nm-run-stage');canvas=node('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Cloud Run playing field. Space or tap to jump; Down or Duck to crouch; P to pause; Escape to leave.');stage.append(canvas);ctx=canvas.getContext('2d');
  const scores=node('div','nm-run-scoreboard');
  for(const label of ['Score','Coins','Best']){const item=node('span','nm-run-score',label),value=node('b','','00000');item.append(value);scores.append(item);if(label==='Score')scoreLabel=value;else if(label==='Best')bestLabel=value;else coinLabel=value;}stage.append(scores);
  panel=node('div','nm-run-panel');heading=node('h3');description=node('p');action=button('Loading…','pri',start);panel.append(heading,description,action);stage.append(panel);root.append(stage);
  const bottom=node('div','nm-run-bottom'),help=node('p','nm-run-help');help.innerHTML='<kbd>Space / ↑</kbd> jump &nbsp; <kbd>↓</kbd> duck<br>Or use the buttons. Hold jump to go higher.';bottom.append(help);
  const controls=node('div','nm-run-controls'),jumpButton=button('↑ Jump','nm-run-touch',()=>{}),duckButton=button('↓ Duck','nm-run-touch',()=>{});pauseButton=button('Pause','',togglePause);controls.append(duckButton,jumpButton,pauseButton);bottom.append(controls);root.append(bottom,node('p','nm-run-footnote','A little off the beaten path. High score stays on this device.'));
  status=node('div','nm-run-sr');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);document.body.append(root);
  document.documentElement.classList.add('nm-run-open');window.__nmLenis?.stop();window.dispatchEvent(new Event('nm:gamechange'));window.__nmDialog?.capture(root);
  touchControl(jumpButton,jump,()=>game?.releaseJump());touchControl(duckButton,()=>duck(true),()=>duck(false));touchControl(canvas,jump,()=>game?.releaseJump());
  document.addEventListener('keydown',press,{signal});document.addEventListener('keyup',release,{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},{signal});
  window.addEventListener('blur',()=>{pause();game?.releaseJump();duck(false);},{signal});
  window.addEventListener('resize',layout,{signal});resizeObserver=new ResizeObserver(layout);resizeObserver.observe(stage);
  layout();sync();
  loadArt().then(()=>{if(root){draw();sync();action.focus({preventScroll:true});}}).catch(error=>{if(root){heading.textContent='The trail is still loading.';description.textContent='Check your connection, then try again.';action.textContent='Try again';action.disabled=false;action.onclick=()=>{closeGame();openGame();};say('Artwork could not load. Try again or return to the site.');}console.error('Cloud Run artwork:',error);});
}
export function closeGame(){
  if(!root)return;cancelAnimationFrame(raf);raf=0;abort.abort();resizeObserver?.disconnect();game.releaseJump();game.setDuck(false);
  saveBest();const closing=root;root=null;window.__nmDialog?.release(closing);closing.remove();document.documentElement.classList.remove('nm-run-open');window.__nmLenis?.start();window.dispatchEvent(new Event('nm:gamechange'));
  if(location.hash==='#run')history.replaceState(null,'',location.pathname+location.search);
  ctx=null;canvas=null;game=null;
}
