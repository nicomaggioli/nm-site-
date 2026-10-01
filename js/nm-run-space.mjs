// Space Run: the footer game as it appears under Night Sky (html[data-nm-theme="stars"]).
// The engine, timing, hit boxes and difficulty are Cloud Run's; only the words and pictures change.
// The stand-in pixel art is painted once into small canvases when the game opens; the loop only copies them.
import {GROUND,VIEW_HEIGHT} from './nm-run-engine.mjs?v=77fbd74b3a';

// Optional artwork. Each file replaces its stand-in when it loads and slices cleanly; a missing or
// unusable file falls back on its own (Cloud Run's runner, or the pixel art below). Magenta is keyed out.
export const SPACE_ART={
  run:'/media/runner/astronaut-run.png',         // 4x3 run cycle, the runner-ravi-stills.png layout
  actions:'/media/runner/astronaut-actions.png', // 4x4 poses, the runner-ravi-actions.png layout
  atlas:'/media/runner/space-atlas.png'          // sky-atlas.png cells: UFO frames at bird1/bird2, star, rock platform
};

export const SPACE_COPY={
  name:'Space Run',
  eyebrow:'You found it. Suit up.',
  ready:'Gravity’s optional.',
  tagline:'Jump low. Duck high. Catch stars.',
  paused:'Catch your breath out here.',
  busier:'The galaxy gets busier as you go.',
  // One per engine stage, in the engine's order.
  notices:['Jump low UFOs','High UFOs ahead. Duck!','Glowing UFO? Duck the laser!','Diving UFOs. Watch their height!','Shooting stars are worth 3!','Warp speed. Keep up!']
};

const TAU=Math.PI*2,TILE=960,LINE='#15131f';
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function noise(i,j,k){let h=Math.imul(i,374761393)^Math.imul(j,668265263)^Math.imul(k,1274126177);h=Math.imul(h^h>>>13,1103515245);return((h^h>>>16)>>>0)/4294967296;}
const wrapped=(v,period)=>((v%period)+period)%period;
function art(image,extra){return {image,left:0,top:0,width:image.width,height:image.height,...extra};}
// Paint a grid of p-pixel blocks; shade(i,j) returns a colour or nothing.
function pixels(cols,rows,p,shade){
  const c=surface(cols*p,rows*p),x=c.getContext('2d');
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const color=shade(i,j);if(color){x.fillStyle=color;x.fillRect(i*p,j*p,p,p);}}
  return c;
}
// A filled shape with a one-block dark outline.
function outlined(inside,fill,line=LINE){
  return (i,j)=>{if(inside(i,j))return fill(i,j);if(inside(i+1,j)||inside(i-1,j)||inside(i,j+1)||inside(i,j-1))return line;};
}

// Flying saucer, 46 x 28 px, the obstacle's full width. Silver hull, glass dome, rim lights.
// Two frames alternate the lights the way the birds alternate wing poses.
function ufoPart(i,j){
  const x=i-11,y=j+.5;
  if(y<=6.6&&(x/5.4)**2+((y-5.6)/5)**2<=1)return 'dome';
  if((x/10.6)**2+((y-8.2)/3.1)**2<=1)return 'hull';
  if(y>9&&(x/5.2)**2+((y-11.2)/2.2)**2<=1)return 'belly';
}
function ufoFrame(frame){
  const lit=frame===1?[3,11,19]:[7,15];
  return art(pixels(23,14,2,outlined((i,j)=>!!ufoPart(i,j),(i,j)=>{
    const part=ufoPart(i,j),x=i-11,y=j+.5;
    if(part==='dome'){
      const nx=x/5.4,ny=(y-5.6)/5;
      if(nx<-.15&&ny<-.25&&nx+ny>-1.3)return '#e6faff';
      return nx>.4?'#3f7f98':y>6?'#5d9fb6':'#7cc0d4';
    }
    if(part==='hull'){
      if(j===8&&i%4===3)return lit.includes(i)?(i===11?'#fff3d6':'#ffb48a'):'#4a4460';
      if(j===6&&i>=4&&i<=7)return '#ffffff';
      const ny=(y-8.2)/3.1;
      return ny<-.55?'#eceff6':ny<-.1?'#c4c8d7':ny<.45?'#9a9eb3':ny<.8?'#6e728b':'#4c4f68';
    }
    if(j===12&&i>=10&&i<=12)return frame===1?'#ffd6a3':'#d99c8a';
    return '#3a3c52';
  })));
}
export function ufoFrames(){return [ufoFrame(1),ufoFrame(2)];}

// The walkable strip: flat top, lumpy cratered underside, grey-violet rock with peach specks.
// 480 x 96 px and seamless: every curve repeats a whole number of times across the tile.
export function rockTile(){
  const C=160,R=32,bottom=[];
  for(let i=0;i<C;i++){const u=i/C;bottom[i]=Math.round(16+4.5*Math.sin(TAU*2*u+1.3)+3*Math.sin(TAU*5*u+.4)+1.6*Math.sin(TAU*13*u+2.1)+(Math.sin(TAU*7*u+.8)>.8?2:0));}
  // Craters sit at varied depths inside the rock: [column, radius, depth through the face].
  const craters=[[12,3,.15],[31,1.3,.8],[44,2,.6],[69,3.6,.3],[88,1.2,.2],[99,2.2,.85],[124,2.8,.05],[146,1.8,.5]].map(([cx,r,depth])=>{
    const top=4+r*.72,room=Math.max(0,bottom[cx]-3-r*.72-top);return [cx+.5,top+room*depth,r];
  });
  const solid=(i,j)=>j>=0&&j<=bottom[wrapped(i,C)];
  return art(pixels(C,R,3,(i,j)=>{
    const b=bottom[i];
    if(!solid(i,j))return;
    if(j===b||!solid(i-1,j)||!solid(i+1,j))return LINE;
    if(j===0)return noise(i,0,1)<.14?'#8c86a9':'#a59fc0';
    if(j===1)return noise(i,1,2)<.05?'#e9b4a3':noise(i,1,3)<.1?'#a29cbc':'#bdb7d3';
    if(j===2)return '#ddd8eb';
    if(j<b-1)for(const [cx,cy,r] of craters){
      const dx=wrapped(i+.5-cx+C/2,C)-C/2,dy=(j+.5-cy)/.72,e=(dx*dx+dy*dy)/(r*r);
      if(e<=1)return dy<-.15*r?'#28233c':e>.5&&dy>.25*r?'#7b749d':'#433d60';
      if(e<=1.7)return dy<0?'#918ab0':'#352f4f';
    }
    const f=(j-3)/Math.max(1,b-3);
    if(f<.85&&noise(i,j,5)<.012)return noise(i,j,6)<.3?'#ffd9c4':'#e9b4a3';
    if(j>3&&j<b-2&&i%4!==3&&noise(i>>2,j,8)<.035)return '#3b3557';   // hairline cracks
    const v=f+((i+j)&1?.07:-.07)+(noise(i,j,4)-.5)*.1;
    return v<.3?'#6f6891':v<.58?'#58517b':v<.82?'#443e63':'#312b4b';
  }),{tile:true});
}

// Small far-off asteroids for the parallax layers.
function asteroid(n,seed){
  const rnd=seeded(seed),k1=rnd()*TAU,k2=rnd()*TAU,c=(n+2)/2,r=n/2,pit=[c+r*.25,c+r*.1,Math.max(1,r*.3)];
  const inside=(i,j)=>{const x=i+.5-c,y=j+.5-c,a=Math.atan2(y,x);return Math.hypot(x,y)<=r*(.84+.1*Math.sin(3*a+k1)+.06*Math.sin(5*a+k2));};
  return pixels(n+2,n+2,2,outlined(inside,(i,j)=>{
    if(Math.hypot(i+.5-pit[0],j+.5-pit[1])<=pit[2])return '#2e2944';
    const l=(c-i-.5+c-j-.5)/(r*1.4)+((i+j)&1?.08:-.08);
    return l>.45?'#9d97ba':l>.05?'#6f6891':l>-.4?'#4d4769':'#342f4e';
  }));
}

// A distant ringed planet in muted peach and coral.
function planet(){
  const cx=22,cy=14,r=9.6;
  return pixels(44,28,2,(i,j)=>{
    const x=i+.5-cx,y=j+.5-cy,d=Math.hypot(x,y),ry=y-.16*x,e=(x/19.5)**2+(ry/4)**2;
    const ring=e<=1&&e>=.5;
    if(ring&&ry>0)return e>.8?'#7e76ad':'#a79ed0';
    if(d<=r){
      const l=(-x*.55-y*.75)/r+((i+j)&1?.07:-.07),band=wrapped(Math.floor((y+r)*.42+Math.sin(x*.5)*.3),3);
      return l<-.6?'#2f2135':l<-.32?'#4a3046':l<-.1?'#8a5a66':['#e3b3a0','#cf8f84','#ead6bf'][band];
    }
    if(ring)return '#5e578a';
  });
}

// A faint coral, peach and violet nebula in chunky ordered-dither blocks, seamless across TILE.
function nebula(){
  const P=4,C=TILE/P,R=56,c=surface(TILE,R*P),x=c.getContext('2d');
  const blobs=[[58,24,44,14,'#e3837a'],[92,31,28,9,'#e9b4a3'],[172,17,40,12,'#6e6bd6'],[206,28,22,8,'#e3837a']];
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],alpha=[0,.05,.09,.14,.19];
  for(let j=0;j<R;j++)for(let i=0;i<C;i++){
    let best=0,color='';
    for(const [bx,by,rx,ry,col] of blobs){
      const dx=wrapped(i-bx+C/2,C)-C/2,v=Math.exp(-((dx/rx)**2+((j-by)/ry)**2)*1.6)*(.75+.5*noise(i>>2,j>>2,9));
      if(v>best){best=v;color=col;}
    }
    const level=Math.min(4,Math.floor(best*3.4+(bayer[(j&3)*4+(i&3)]+.5)/16*.9));
    if(level>0){x.globalAlpha=alpha[level];x.fillStyle=color;x.fillRect(i*P,j*P,P,P);}
  }
  return c;
}

function starLayer(count,seed,bigShare){
  const c=surface(TILE,VIEW_HEIGHT),x=c.getContext('2d'),rnd=seeded(seed),colors=['#f4f8f0','#ede1cc','#bcd3e0','#e9b4a3'];
  for(let n=0;n<count;n++){
    const px=Math.floor(rnd()*TILE),py=Math.floor(rnd()*VIEW_HEIGHT),size=rnd()<bigShare?2:1;
    x.globalAlpha=.25+rnd()*.55;x.fillStyle=colors[Math.floor(rnd()*colors.length)];x.fillRect(px,py,size,size);
  }
  return c;
}
function twinklers(count,seed){
  const rnd=seeded(seed);
  return Array.from({length:count},()=>({x:Math.floor(rnd()*TILE),y:Math.floor(rnd()*(VIEW_HEIGHT-8))+4,rate:.7+rnd()*1.3,phase:rnd()*TAU,
    cross:rnd()<.35,color:['#ffffff','#ede1cc','#bcd3e0','#ffd9c4'][Math.floor(rnd()*4)]}));
}

// Distant asteroids are darkened toward the sky once, not drawn see-through, so they can pass in front of the planet.
function dimmed(image,amount){
  const c=surface(image.width,image.height),x=c.getContext('2d');
  x.drawImage(image,0,0);x.globalCompositeOperation='source-atop';x.globalAlpha=amount;x.fillStyle='#0a0918';x.fillRect(0,0,c.width,c.height);
  return c;
}

let scene=null;
function prepare(){
  if(!scene){
    const rocks=[asteroid(7,1),asteroid(11,2),asteroid(15,4)];
    scene={far:starLayer(150,3,.04),near:starLayer(80,7,.3),twinkle:twinklers(28,11),nebula:nebula(),planet:planet(),
      rocks,distant:rocks.map(rock=>dimmed(rock,.55))};
  }
  return scene;
}
// Draw an image repeatedly across the stage, scrolled by shift.
function band(ctx,image,shift,y,w){const T=image.width;for(let x=-wrapped(shift,T);x<w;x+=T)ctx.drawImage(image,Math.round(x),y);}
// Each asteroid keeps its own index while scrolling, so nothing pops when the pattern repeats.
function drift(ctx,rocks,shift,spacing,ys,alpha,w){
  ctx.globalAlpha=alpha;
  for(let k=Math.floor(shift/spacing)-1;k*spacing-shift<w;k++){
    const rock=rocks[wrapped(k,rocks.length)],x=k*spacing+Math.floor(noise(k,0,21)*spacing*.5)-shift;
    ctx.drawImage(rock,Math.round(x),ys[wrapped(k,ys.length)]);
  }
  ctx.globalAlpha=1;
}

// The whole backdrop plus the platform. offset and time are 0 under reduced motion.
export function drawSpace(ctx,{w,offset,time,level,platform}){
  const s=prepare(),late=level>=5;
  const sky=ctx.createLinearGradient(0,0,0,VIEW_HEIGHT);
  sky.addColorStop(0,late?'#0b0716':'#06060c');sky.addColorStop(.62,late?'#1d1240':'#100f2a');sky.addColorStop(1,late?'#2c1a52':'#191641');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,VIEW_HEIGHT);
  ctx.globalAlpha=late?1:.8;band(ctx,s.nebula,offset*.02,24,w);ctx.globalAlpha=1;
  band(ctx,s.far,offset*.008,0,w);band(ctx,s.near,offset*.025,0,w);
  for(const star of s.twinkle){
    const x=Math.round(wrapped(star.x-offset*.025,TILE));if(x>w+2)continue;
    const glow=.55+.45*Math.sin(time*star.rate+star.phase);
    ctx.fillStyle=star.color;ctx.globalAlpha=glow;ctx.fillRect(x,star.y,2,2);
    if(star.cross){ctx.globalAlpha=glow*.45;ctx.fillRect(x-2,star.y,2,2);ctx.fillRect(x+2,star.y,2,2);ctx.fillRect(x,star.y-2,2,2);ctx.fillRect(x,star.y+2,2,2);}
  }
  ctx.globalAlpha=1;
  // The planet is the farthest object and barely moves. Asteroids drift faster, so they pass in front of it.
  // Their pattern starts just right of the planet, keeping it clear in the opening frame and under reduced motion.
  // Nearer asteroids float below the platform, clear of play.
  const home=w*.62,span=w+s.planet.width;
  ctx.drawImage(s.planet,Math.round(wrapped(home-offset*.006+s.planet.width,span)-s.planet.width),54);
  drift(ctx,s.distant,offset*.05-home-s.planet.width-40,290,[70,96,62,84],1,w);
  if(!platform)return;
  drift(ctx,s.rocks,offset*.3,330,[300,318,292],.7,w);
  if(platform.tile){band(ctx,platform.image,offset,GROUND-6,w);return;}
  // Supplied rock art: a strip whose ends join, laid end to end with its flat top at the runner's feet.
  const tall=Math.min(128,Math.round(480*platform.height/platform.width)),step=478;
  for(let x=-wrapped(offset,step);x<w;x+=step)ctx.drawImage(platform.image,Math.round(x),GROUND-6,480,tall);
}

// A saucer fills the obstacle's 46 px width, centred on it, its underside on the collider's lower edge.
export function drawUfo(ctx,s,scale,x,clearance){
  const w=Math.round(s.width*scale),h=Math.round(s.height*scale);
  ctx.drawImage(s.image,Math.round(x+23-w/2),Math.round(GROUND-clearance+2-h),w,h);
}
// One scale for both frames: at most the obstacle's 46 x 28 px.
export const ufoScale=(a,b)=>Math.min(46/Math.max(a.width,b.width),28/Math.max(a.height,b.height));
