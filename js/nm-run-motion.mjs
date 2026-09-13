// Complete illustrated poses advance in order; no body-part assembly.
export const RUN_FRAME_COUNT=12;
// Two balanced steps: contact, compression, passing, flight.
// Skip the repeated wide kicks and the twisted, overlapping-foot pose.
export const RUN_SEQUENCE=[1,2,3,4,8,7,10,11];
export const runFrame=distance=>RUN_SEQUENCE[Math.floor(distance*RUN_SEQUENCE.length/140)%RUN_SEQUENCE.length];

// A constant collection area, with a visual turn around the star's vertical axis.
export function drawStar(ctx,art,x,y,time) {
  const turn=time*Math.PI*1.8,width=Math.max(3,22*Math.abs(Math.cos(turn)));
  ctx.save();ctx.translate(Math.round(x),Math.round(y));
  if(Math.cos(turn)<0)ctx.scale(-1,1);
  ctx.drawImage(art.image,-width/2,-12,width,24);ctx.restore();
}

export function drawShootingStar(ctx,art,star,time) {
  // A fixed pixel trail distinguishes the bonus from ordinary stars without
  // flashes, particles, or allocating images during play.
  ctx.save();
  for(let i=7;i>=1;i--){
    ctx.globalAlpha=(8-i)/10;
    ctx.fillStyle=i<3?'#fff4bb':'#ffcc54';
    ctx.fillRect(Math.round(star.x+i*8),Math.round(star.y-i*8*star.slope)-2,10,4);
  }
  ctx.restore();drawStar(ctx,art,star.x,star.y,time);
}

export function drawBirdSignal(ctx,bird,laser,clearance) {
  ctx.save();
  if(bird.kind==='bird_wave'){
    // Cyan guide marks show the vertical path without another animated sprite.
    ctx.fillStyle='#34738d';ctx.globalAlpha=.65;
    for(let y=GROUND_GUIDE_TOP;y<GROUND_GUIDE_BOTTOM;y+=10)ctx.fillRect(Math.round(bird.x+22),y,2,4);
    ctx.globalAlpha=1;ctx.fillStyle='#b0f6ff';
    ctx.fillRect(Math.round(bird.x+19),Math.round(212-clearance-24),8,3);
  }
  if(laser&&laser.x>0){
    const x=Math.round(laser.x),y=Math.round(laser.y);
    if(laser.active){
      ctx.fillStyle='#ee4265';ctx.fillRect(0,y-6,x,12);
      ctx.fillStyle='#ffb576';ctx.fillRect(0,y-3,x,6);
      ctx.fillStyle='#fff4cb';ctx.fillRect(0,y-1,x,2);
    }else{
      ctx.fillStyle='#d98533';ctx.globalAlpha=.45;
      for(let i=x-12;i>0;i-=14)ctx.fillRect(i,y-1,6,2);
      ctx.globalAlpha=1;
    }
    const size=3+Math.round(laser.charge*4);
    ctx.fillStyle=laser.active?'#fff4cb':'#ffce73';ctx.fillRect(x-size,y-size,size*2,size*2);
    ctx.fillStyle='#fff7d1';ctx.fillRect(x-2,y-2,4,4);
  }
  ctx.restore();
}
const GROUND_GUIDE_TOP=105,GROUND_GUIDE_BOTTOM=189;
