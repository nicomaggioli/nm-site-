import test from 'node:test';
import assert from 'node:assert/strict';
import {STRIDE,footAt,stridePose} from '../js/nm-run-motion.mjs';
const close=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
test('feet remain planted and travel at track speed through contact',()=>{
  for(let p=.02;p<.38;p+=.02){const a=footAt(p),b=footAt(p+.001);close(a.y,-4);close(b.x-a.x,-STRIDE*.001);}
});
test('foot position and velocity remain continuous at takeoff and loop wrap',()=>{
  const step=.00001;
  for(const p of [0,.4,1]){const before=footAt(p-step),at=footAt(p),after=footAt(p+step);
    close(before.x,after.x,.003);close(before.y,after.y,.003);
    close((at.x-before.x)/step,(after.x-at.x)/step,.1);close((at.y-before.y)/step,(after.y-at.y)/step,.1);
  }
});
test('leg segments keep their length through the complete stride',()=>{
  for(let i=0;i<240;i++)for(const {hip,knee,foot} of stridePose(i/240*STRIDE).legs){
    close(Math.hypot(knee.x-hip.x,knee.y-hip.y),12);
    close(Math.hypot(foot.x-knee.x,foot.y-knee.y),12);
  }
  assert.deepEqual(stridePose(0),stridePose(STRIDE));
});
