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

export function balloonArt(makeCanvas) {
  // Native pixel artwork, built once alongside the existing sprite atlas.
  const image=makeCanvas();image.width=40;image.height=62;
  const c=image.getContext('2d');
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const ink='#283d69',edge='#425b89';
  [[12,0,16,2],[6,2,28,4],[2,6,36,6],[0,12,40,16],[2,28,36,6],[6,34,28,4],[10,38,20,4],[14,42,12,4]].forEach(r=>rect(...r,ink));
  [[12,2,16,2],[6,6,28,2],[4,8,32,20],[6,28,28,6],[10,34,20,4],[14,38,12,4]].forEach(r=>rect(...r,'#ed7855'));
  rect(8,8,6,22,'#f5b966');rect(14,4,10,32,'#ffe5a1');rect(16,36,8,6,'#efb763');
  rect(24,8,8,22,'#d94e4c');rect(26,30,4,4,'#b74e58');rect(4,12,4,14,'#ffc982');
  rect(12,6,4,4,'#fff3cf');rect(16,4,8,4,'#fff3cf');rect(6,10,2,8,'#ffe3ad');
  rect(10,40,2,10,ink);rect(28,40,2,10,ink);rect(12,48,2,5,edge);rect(26,48,2,5,edge);
  rect(12,52,16,10,ink);rect(14,54,12,6,'#c58b52');rect(14,54,12,2,'#ffe0a0');rect(18,56,2,4,'#8b5d4b');rect(24,56,2,4,'#8b5d4b');
  return {image,width:40,height:62};
}
