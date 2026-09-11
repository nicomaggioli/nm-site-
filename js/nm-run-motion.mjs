// Complete illustrated poses advance in order; no body-part assembly.
export const RUN_FRAME_COUNT=12;
export const runFrame=distance=>1+Math.floor(distance*RUN_FRAME_COUNT/112)%RUN_FRAME_COUNT;

// A constant collection area, with a visual turn around the star's vertical axis.
export function drawStar(ctx,art,x,y,time) {
  const turn=time*Math.PI*1.8,width=Math.max(3,22*Math.abs(Math.cos(turn)));
  ctx.save();ctx.translate(Math.round(x),Math.round(y));
  if(Math.cos(turn)<0)ctx.scale(-1,1);
  ctx.drawImage(art.image,-width/2,-12,width,24);ctx.restore();
}
