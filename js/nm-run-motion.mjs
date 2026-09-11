// Continuous joint motion keeps the same body proportions throughout the stride.
export const STRIDE = 104;
const TAU = Math.PI*2;
const fract = n => n-Math.floor(n);
export function footAt(phase) {
  const p=fract(phase),contact=.4,front=20,back=front-STRIDE*contact;
  if(p<contact)return {x:front-STRIDE*p,y:-4,angle:0};
  const t=(p-contact)/(1-contact);
  // Match the contact velocity at both ends of recovery. No foot snap on wrap.
  const smooth=t*t*(3-2*t),tangent=2*t*t*t-3*t*t+t,lift=Math.sin(Math.PI*t)**2;
  return {x:back+(front-back)*smooth-STRIDE*(1-contact)*tangent,y:-4-17*lift,angle:.75*lift};
}
export function kneeBetween(hip,foot,length=17) {
  const dx=foot.x-hip.x,dy=foot.y-hip.y,d=Math.max(.001,Math.hypot(dx,dy));
  const bend=Math.sqrt(Math.max(0,length*length-d*d/4));
  return {x:(hip.x+foot.x)/2+dy/d*bend,y:(hip.y+foot.y)/2-dx/d*bend};
}
export function stridePose(distance) {
  const phase=fract(distance/STRIDE),hip={x:0,y:-24+1.2*Math.sin(phase*TAU*2)};
  const legs=[phase+.5,phase].map(p=>{const foot=footAt(p);return {hip,knee:kneeBetween(hip,foot),foot};});
  const arms=[phase+.5,phase].map((p,i)=>{
    const shoulder={x:i===0?1:-4,y:hip.y-19};
    const angle=-.6*Math.cos(p*TAU),forearm=angle+1.4;
    const elbow={x:shoulder.x+12*Math.sin(angle),y:shoulder.y+12*Math.cos(angle)};
    const hand={x:elbow.x+10*Math.sin(forearm),y:elbow.y+10*Math.cos(forearm)};
    return {shoulder,elbow,hand};
  });
  return {hip,legs,arms};
}
export function drawStride(ctx,rig,x,ground,distance) {
  const pose=stridePose(distance);
  function segment(part,a,b,width,rear=false){
    const source=rear?rig[part].dark:rig[part].image;
    ctx.save();ctx.translate(x+a.x,ground+a.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2);
    ctx.drawImage(source,-width/2,-1,width,Math.hypot(b.x-a.x,b.y-a.y)+2);ctx.restore();
  }
  function leg(i){const l=pose.legs[i];segment('thigh',l.hip,l.knee,8,i===0);segment('shin',l.knee,l.foot,7,i===0);
    ctx.save();ctx.translate(x+l.foot.x,ground+l.foot.y);ctx.rotate(l.foot.angle);ctx.drawImage(i===0?rig.shoe.dark:rig.shoe.image,-4,-2,13,6);ctx.restore();}
  function arm(i){const a=pose.arms[i];segment('upperArm',a.shoulder,a.elbow,6,i===0);segment('forearm',a.elbow,a.hand,5,i===0);}
  arm(0);leg(0);leg(1);
  const body=rig.body,bodyHeight=43,bodyWidth=body.width/body.height*bodyHeight;
  ctx.drawImage(body.image,Math.round(x-bodyWidth*.25),Math.round(ground+pose.hip.y-bodyHeight+2),Math.round(bodyWidth),bodyHeight);
  arm(1);
}
