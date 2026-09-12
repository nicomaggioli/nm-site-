import {Runner,GROUND,VIEW_HEIGHT,PLAYER_X,DUCK_HEIGHT} from './nm-run-engine.mjs?v=24df8d9907';

import {RUN_FRAME_COUNT,runFrame,drawStar,drawShootingStar,balloonArt} from './nm-run-motion.mjs?v=02eb725c39';

const RUN_SHEET='/media/runner/runner-ravi-stills.png?v=e41c2a3ee3';
const CHARACTER='/media/runner/runner-ravi-actions.png?v=3d2ee0f116';
const SKY='/media/runner/sky-atlas.png?v=ea731a709a';
// Each running frame is a complete character illustration.
// The previous sheet supplies idle, aerial, duck and reaction poses.
const POSES={idle:8,jump:9,duck:10,hit:11,dead:12};
const PIVOTS={idle:153,jump:144,duck:143,hit:145,dead:151};
const SKY_CELLS={bird1:[15,390,290,318],bird2:[330,400,280,315],plane:[640,405,300,305],star:[965,420,270,298],platform:[0,735,1254,470]};
function put(n,value){value=String(value);if(n.textContent!==value)n.textContent=value;}
let root=null,game=null,canvas,ctx,panel,action,heading,description,pauseButton,scoreLabel,bestLabel,starLabel,levelLabel,milestone,status;
let sprites=null,artPromise=null,raf=0,last=0,acc=0,best=0,announced='',saved=false,abort=null,resizeObserver=null;
let shownLevel=1,shownBonus=-1,bannerUntil=0;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
try {best=Number(localStorage.getItem('nm-cloud-run-best'))||0;}catch{}
function node(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;}
function button(text,cls,handler){const b=node('button','nm-run-btn '+(cls||''),text);b.type='button';b.addEventListener('click',handler);return b;}
function decodeImage(src){
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load sprite artwork'));image.src=src;});
}
function extract(image,rect){
  const [x,y,w,h]=rect,c=document.createElement('canvas');c.width=w;c.height=h;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,x,y,w,h,0,0,w,h);
  const data=cx.getImageData(0,0,w,h),p=data.data;let left=w,right=-1,top=h,bottom=-1;
  // Prepare both transparent and magenta-key artwork once, outside the loop.
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const k=(j*w+i)*4,r=p[k],g=p[k+1],b=p[k+2];
    if(r>155&&b>140&&g<125&&Math.min(r,b)-g>65)p[k+3]=0;
    if(p[k+3]>30){left=Math.min(left,i);right=Math.max(right,i);top=Math.min(top,j);bottom=Math.max(bottom,j);}
  }
  cx.putImageData(data,0,0);if(right<left)throw new Error('Empty sprite');
  const trimmed=document.createElement('canvas');trimmed.width=right-left+1;trimmed.height=bottom-top+1;
  trimmed.getContext('2d').drawImage(c,left,top,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);
  // Find a stable horizontal registration point without changing the artwork.
  let headLeft=w,headRight=-1;
  for(let j=top;j<top+trimmed.height*.28;j++)for(let i=left;i<=right;i++)if(p[(j*w+i)*4+3]>30){headLeft=Math.min(headLeft,i);headRight=Math.max(headRight,i);}
  return {image:trimmed,left,top,width:trimmed.width,height:trimmed.height,headX:(headLeft+headRight)/2};
}
function loadArt(){
  if(artPromise)return artPromise;
  artPromise=Promise.all([decodeImage(CHARACTER),decodeImage(SKY),decodeImage(RUN_SHEET)]).then(([character,sky,running])=>{
    const result={};
    Object.entries(POSES).forEach(([name,i])=>{
      const x=Math.floor(i%4*character.width/4),y=Math.floor(Math.floor(i/4)*character.height/4);
      const right=Math.floor((i%4+1)*character.width/4),bottom=Math.floor((Math.floor(i/4)+1)*character.height/4);
      result[name]={...extract(character,[x,y,right-x,bottom-y]),pivot:PIVOTS[name],baseline:282};
    });
    for(const [name,rect] of Object.entries(SKY_CELLS))result[name]=extract(sky,rect);
    result.balloon=balloonArt(()=>document.createElement('canvas'));
    const frames=[];
    for(let i=0;i<RUN_FRAME_COUNT;i++){
      const col=i%4,row=Math.floor(i/4),x=Math.floor(col*running.width/4),y=Math.floor(row*running.height/3);
      const right=Math.floor((col+1)*running.width/4),bottom=Math.floor((row+1)*running.height/3);
      frames.push(extract(running,[x,y,right-x,bottom-y]));
    }
    // All poses retain one scale. Registration moves the whole still only.
    const scale=60/Math.max(...frames.map(frame=>frame.height));
    const lift=[0,0,1,2,0,0,0,0,0,1,2,0];
    frames.forEach((frame,i)=>{result['run'+(i+1)]={...frame,pivot:frame.headX,baseline:frame.top+frame.height,scale,lift:lift[i]};});
    sprites=result;
  }).catch(error=>{artPromise=null;throw error;});return artPromise;
}
function say(text){if(text!==announced){status.textContent=text;announced=text;}}
function saveBest(){if(saved)return;saved=true;if(game.score>best){best=game.score;try{localStorage.setItem('nm-cloud-run-best',String(best));}catch{}}}
function sync(){
  if(!root)return;
  root.dataset.state=game.state;put(scoreLabel,String(game.score).padStart(5,'0'));
  put(bestLabel,String(Math.max(best,game.score)).padStart(5,'0'));put(starLabel,game.stars);
  put(levelLabel,game.level);root.dataset.level=game.level;
  if(game.state==='running'&&game.level!==shownLevel){
    shownLevel=game.level;bannerUntil=game.time+2.5;
    put(milestone,game.difficulty.notice);say(`Level ${game.level}. ${game.difficulty.notice}`);
  }
  if(game.state==='running'&&game.bonusTime>shownBonus){
    shownBonus=game.bonusTime;bannerUntil=game.time+1.6;
    put(milestone,'Shooting star! +75');say('Shooting star collected. 75 bonus points.');
  }
  milestone.hidden=game.state!=='running'||game.time>=bannerUntil;
  const state=game.state;panel.hidden=state==='running'||state==='hit';pauseButton.hidden=state==='ready'||state==='over'||state==='hit';
  put(pauseButton,state==='paused'?'Resume':'Pause');
  if(state==='ready'){heading.textContent='Sky’s the limit.';description.textContent='Jump low. Duck high. Catch stars.';action.textContent=sprites?'Start run':'Loading...';action.disabled=!sprites;}
  if(state==='paused'){heading.textContent='Paused.';description.textContent='Catch your breath up here.';action.textContent='Resume';action.disabled=false;say('Game paused. Choose Resume to continue.');}
  if(state==='over'){saveBest();heading.textContent='One more run?';description.textContent=`${game.score} points · ${game.stars} stars · level ${game.level}`;action.textContent='Run again';action.disabled=false;say(`Run over. ${game.score} points. ${game.stars} stars. Level ${game.level}. Best ${best}.`);}
}
function start(){if(!sprites)return;if(game.state==='paused')game.resume();else{game.reset();game.start();saved=false;shownLevel=1;shownBonus=-1;bannerUntil=0;}panel.hidden=true;canvas.focus({preventScroll:true});say('Running. Space or tap to jump. Down or Duck to crouch. The sky gets busier as you go.');sync();wake();}
function pause(){if(!game||game.state!=='running')return;game.pause();cancelAnimationFrame(raf);raf=0;acc=0;sync();draw();}
function togglePause(){if(game.state==='paused')start();else pause();}
function jump(){if(!sprites)return;if(game.state==='ready'||game.state==='over'||game.state==='paused')start();game.jump();wake();}
function duck(value){if(!game)return;game.setDuck(value);if(game.state==='running')wake();}
function layout(){if(!root)return;const width=canvas.parentElement.clientWidth;canvas.width=innerHeight<=520&&innerWidth>innerHeight?900:Math.max(420,Math.min(900,Math.round(width)));canvas.height=VIEW_HEIGHT;game.width=canvas.width;ctx.imageSmoothingEnabled=false;draw();}
function sprite(name,x,y,w,h){const s=sprites&&sprites[name];if(!s)return;ctx.drawImage(s.image,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function landscape(){
  const w=canvas.width,offset=reduce.matches?0:game.distance;
  const colors=game.level>=5?['#6873be','#d5e2fa']:['#639ede','#c5eafa'];
  const sky=ctx.createLinearGradient(0,0,0,VIEW_HEIGHT);sky.addColorStop(0,colors[0]);sky.addColorStop(1,colors[1]);ctx.fillStyle=sky;ctx.fillRect(0,0,w,VIEW_HEIGHT);
  if(!sprites)return;
  // The whole platform has a billowing silhouette, including its underside.
  // Overlapping cloud lobes make the track continuous without a flat slab.
  ctx.globalAlpha=.35;
  for(let i=-1;i<w/290+2;i++)sprite('platform',i*290-(offset*.08%290),67+(i%2+2)%2*22,160,52);
  ctx.globalAlpha=.6;
  for(let i=-1;i<w/380+2;i++)sprite('platform',i*380-(offset*.14%380)+150,137,225,72);
  ctx.globalAlpha=1;
  for(let i=-2;i<w/260+2;i++)sprite('platform',i*260-(offset%260),GROUND-18,560,115);
}
function draw(){
  if(!ctx||!game)return;landscape();
  for(const o of game.obstacles){
    if(o.kind==='plane'||o.kind==='balloon'){
      const r=game.obstacleBounds(o);sprite(o.kind,r.x,r.y,r.w,r.h);continue;
    }
    const frame=1+Math.floor(game.time*7)%2,s=sprites&&sprites['bird'+frame];
    if(s){const anchor=frame===1?[45,178]:[43,149],scale=.18;
      // Anchor the beak/body rather than the changing wing silhouette.
      sprite('bird'+frame,o.x+5+(s.left-anchor[0])*scale,GROUND-o.clearance-12+(s.top-anchor[1])*scale,s.width*scale,s.height*scale);
    }
  }
  for(const star of game.tokens)if(sprites){
    if(star.kind==='shooting_star')drawShootingStar(ctx,sprites.star,star,reduce.matches?0:game.time);
    else drawStar(ctx,sprites.star,star.x,star.y,reduce.matches?0:game.time);
  }
  let pose='idle';if(game.state==='hit')pose='hit';else if(game.state==='over')pose='dead';
  else if(game.y<0)pose='jump';else if(game.duck)pose='duck';else if(['running','paused'].includes(game.state))pose='run'+runFrame(game.distance);
  const s=sprites&&sprites[pose];
  if(s){
    const scale=s.scale||(pose==='duck'?DUCK_HEIGHT/s.height:64/sprites.idle.height);
    const baseline=['duck','dead','jump'].includes(pose)?s.top+s.height:s.baseline;
    sprite(pose,PLAYER_X+22+(s.left-s.pivot)*scale,GROUND+game.y-(s.lift||0)+(s.top-baseline)*scale,s.width*scale,s.height*scale);
  }
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
  if(root)return;game=new Runner();saved=false;announced='';shownLevel=1;shownBonus=-1;bannerUntil=0;abort=new AbortController();const signal=abort.signal;
  root=node('div','nm-run');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','nm-run-title');root.tabIndex=-1;
  const top=node('div','nm-run-top'),brand=node('div');brand.append(node('p','nm-run-eyebrow','You found it.'));const title=node('h2','','Cloud Run');title.id='nm-run-title';brand.append(title);top.append(brand,button('Exit','',closeGame));root.append(top);
  const stage=node('div','nm-run-stage');canvas=node('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Cloud Run playing field. Space or tap to jump; Down or Duck to crouch; P to pause; Escape to leave.');stage.append(canvas);ctx=canvas.getContext('2d');
  const scores=node('div','nm-run-scoreboard');
  for(const label of ['Score','Stars','Level','Best']){const item=node('span','nm-run-score',label),value=node('b','','00000');item.append(value);scores.append(item);if(label==='Score')scoreLabel=value;else if(label==='Best')bestLabel=value;else if(label==='Level')levelLabel=value;else starLabel=value;}stage.append(scores);
  milestone=node('div','nm-run-milestone');milestone.hidden=true;stage.append(milestone);
  panel=node('div','nm-run-panel');heading=node('h3');description=node('p');action=button('Loading...','pri',start);panel.append(heading,description,action);stage.append(panel);root.append(stage);
  const bottom=node('div','nm-run-bottom'),help=node('p','nm-run-help');help.innerHTML='<kbd>Space / ↑</kbd> jump <kbd>↓</kbd> duck<br>Hold jump to go higher.';bottom.append(help);
  const controls=node('div','nm-run-controls'),jumpButton=button('Jump','nm-run-touch',()=>{}),duckButton=button('Duck','nm-run-touch',()=>{});pauseButton=button('Pause','',togglePause);controls.append(duckButton,jumpButton,pauseButton);bottom.append(controls);root.append(bottom,node('p','nm-run-footnote','Made for a little daydream. Best saved on this device.'));
  status=node('div','nm-run-sr');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);document.body.append(root);
  document.documentElement.classList.add('nm-run-open');window.__nmLenis?.stop();window.dispatchEvent(new Event('nm:gamechange'));window.__nmDialog?.capture(root);
  touchControl(jumpButton,jump,()=>game?.releaseJump());touchControl(duckButton,()=>duck(true),()=>duck(false));touchControl(canvas,jump,()=>game?.releaseJump());
  document.addEventListener('keydown',press,{signal});document.addEventListener('keyup',release,{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},{signal});
  window.addEventListener('blur',()=>{pause();game?.releaseJump();duck(false);},{signal});
  window.addEventListener('resize',layout,{signal});resizeObserver=new ResizeObserver(layout);resizeObserver.observe(stage);
  layout();sync();
  loadArt().then(()=>{if(root){draw();sync();action.focus({preventScroll:true});}}).catch(error=>{if(root){heading.textContent='Still loading.';description.textContent='Check your connection, then try again.';action.textContent='Try again';action.disabled=false;action.onclick=()=>{closeGame();openGame();};say('Artwork could not load. Try again or return to the site.');}console.error('Cloud Run artwork:',error);});
}
export function closeGame(){
  if(!root)return;cancelAnimationFrame(raf);raf=0;abort.abort();resizeObserver?.disconnect();game.releaseJump();game.setDuck(false);
  saveBest();const closing=root;root=null;window.__nmDialog?.release(closing);closing.remove();document.documentElement.classList.remove('nm-run-open');window.__nmLenis?.start();window.dispatchEvent(new Event('nm:gamechange'));
  if(location.hash==='#run')history.replaceState(null,'',location.pathname+location.search);
  ctx=null;canvas=null;game=null;
}
