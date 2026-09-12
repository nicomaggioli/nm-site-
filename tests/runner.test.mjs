import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner,PLAYER_X,GROUND,difficultyAt} from '../js/nm-run-engine.mjs';
const advance=(g,seconds)=>{for(let n=0;n<seconds*120;n++)g.update(1/120);};
const fresh=()=>{const g=new Runner({random:()=>.5});g.start();g.next=100;return g;};
test('a low bird ends a run and freezes the score',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X+4;g.update(1/120);assert.equal(g.state,'hit');const score=g.score;advance(g,2);assert.equal(g.state,'over');assert.equal(g.score,score);});
test('a held jump clears a low-flying bird and lands without clipping it',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X+98;g.jump();advance(g,.9);assert.equal(g.state,'running');assert.equal(g.y,0);});
test('a high bird hits a standing runner but allows ducking underneath',()=>{const standing=fresh();standing.spawn('bird_high').x=PLAYER_X;standing.update(1/120);assert.equal(standing.state,'hit');const ducking=fresh();ducking.setDuck(true);ducking.spawn('bird_high').x=PLAYER_X;advance(ducking,1);assert.equal(ducking.state,'running');});
test('ducking cannot avoid a low bird',()=>{const g=fresh();g.setDuck(true);g.spawn('bird_low').x=PLAYER_X;g.update(1/120);assert.equal(g.state,'hit');});
test('stars award points once and are removed after collection',()=>{const g=fresh();g.tokens.push({x:PLAYER_X+22,y:GROUND-30,collected:false});g.update(1/120);assert.equal(g.stars,1);assert.equal(g.tokens.length,0);const score=g.score;advance(g,.01);assert.equal(g.stars,1);assert.ok(score>=25);});
test('pause stops distance and physics and clears held controls',()=>{const g=fresh();g.jump();advance(g,.1);g.setDuck(true);g.pause();const y=g.y,d=g.distance;advance(g,10);assert.equal(g.y,y);assert.equal(g.distance,d);assert.equal(g.duck,false);assert.equal(g.jumpHeld,false);g.resume();advance(g,.1);assert.ok(g.distance>d);});
test('restarting discards prior obstacles, stars and held input',()=>{const g=fresh();g.spawn('bird_low').x=PLAYER_X;g.update(1/120);advance(g,1);g.stars=3;g.setDuck(true);g.start();assert.equal(g.state,'running');assert.equal(g.stars,0);assert.equal(g.score,0);assert.equal(g.obstacles.length,0);assert.equal(g.duck,false);});
test('resizing preserves the active run and keeps physics independent of viewport',()=>{const a=fresh(),b=fresh();a.jump();b.jump();advance(a,.1);advance(b,.1);b.width=420;advance(a,.2);advance(b,.2);assert.equal(a.y,b.y);assert.equal(a.distance,b.distance);});

test('the first encounters teach low birds before introducing high birds',()=>{
  const low=new Runner({random:()=>.99});low.start();advance(low,2);assert.equal(low.obstacles[0].kind,'bird_low');
  const high=fresh();high.time=13;high.random=()=>.99;high.next=0;high.update(1/120);assert.equal(high.obstacles[0].kind,'bird_high');
});

test('a high bird carries a star underneath that the ducking player collects safely',()=>{
  const g=fresh();g.time=13;g.random=()=>.99;g.next=0;g.update(1/120);
  const bird=g.obstacles[0],star=g.tokens[0];
  assert.equal(bird.kind,'bird_high');assert.equal(star.duck,true);
  assert.ok(star.y-12>g.obstacleBox(bird).y+g.obstacleBox(bird).h);
  const shift=bird.x-(PLAYER_X+100);bird.x-=shift;star.x-=shift;
  g.next=100;g.setDuck(true);advance(g,.8);
  assert.equal(g.state,'running');assert.equal(g.stars,1);assert.equal(g.tokens.length,0);
});

test('duck stars reward crouching, and a bird hit cannot award a star',()=>{
  for(const collide of [false,true]){
    const g=fresh();g.tokens.push({x:PLAYER_X+22,y:GROUND-24,duck:true,collected:false});
    if(collide)g.spawn('bird_high').x=PLAYER_X;
    g.update(1/120);assert.equal(g.stars,0);assert.equal(g.state,collide?'hit':'running');
  }
});

test('difficulty increases continuously, introduces new encounters, and stays bounded',()=>{
  const times=[0,12,25,45,70,105,300,3600];let lastSpeed=0,lastRecovery=2,lastLevel=0;
  for(const t of times){const d=difficultyAt(t);assert.ok(d.speed>lastSpeed&&d.speed<=360);assert.ok(d.recovery<=lastRecovery&&d.recovery>=.85);assert.ok(d.level>lastLevel);lastSpeed=d.speed;lastRecovery=d.recovery;lastLevel=d.level;}
  for(const [time,kind] of [[0,'bird_low'],[12,'bird_high'],[25,'plane'],[45,'balloon'],[70,'shooting_star']]){
    const g=fresh();g.time=time;g.next=0;g.update(1/120);
    assert.ok(kind==='shooting_star'?g.tokens.some(s=>s.kind===kind):g.obstacles.some(o=>o.kind===kind));
    assert.ok(Math.abs(difficultyAt(time+.001).speed-difficultyAt(Math.max(0,time-.001)).speed)<.01);
  }
});

test('paper planes hit a standing player and leave room to duck',()=>{
  for(const duck of [false,true]){const g=fresh();g.setDuck(duck);g.spawn('plane').x=PLAYER_X;g.update(1/120);assert.equal(g.state,duck?'running':'hit');}
});

test('balloons require a jump, with the same floating bounds used for drawing and collisions',()=>{
  for(const duck of [false,true]){const g=fresh();g.setDuck(duck);g.spawn('balloon').x=PLAYER_X;g.update(1/120);assert.equal(g.state,'hit');}
  for(const time of [45,180,3600]){
    const g=fresh();g.time=time;g.update(1/120);const o=g.spawn('balloon');
    o.x=g.playerBox().x+g.playerBox().w+g.speed*.28-5;g.jump();advance(g,.9);
    assert.equal(g.state,'running',`balloon is clearable at ${g.speed}px/s`);assert.equal(g.y,0);
    const r=g.obstacleBounds(o),hit=g.obstacleBox(o);assert.ok(hit.y>=r.y&&hit.y+hit.h<=r.y+r.h);
  }
});

test('shooting stars take a diagonal path, reward one 75-point catch, and occupy a hazard-free slot',()=>{
  const g=fresh();g.time=70;g.next=0;g.update(1/120);g.next=100;
  assert.equal(g.obstacles.length,0);const star=g.tokens[0],startY=star.y;
  advance(g,.2);assert.ok(star.y>startY);assert.equal(g.stars,0);
  star.x=PLAYER_X+22;star.startX=star.x;star.startY=GROUND-80;g.y=-70;g.vy=0;
  g.update(1/120);assert.equal(g.stars,3);assert.equal(g.tokens.length,0);assert.equal(g.bonusTime,g.time);
  const score=g.score;advance(g,.01);assert.equal(g.stars,3);assert.ok(score>=75);
});

test('pausing freezes the difficulty clock, balloons, and shooting stars; restart resets unlocks',()=>{
  const g=fresh();g.time=75;g.update(1/120);g.spawn('balloon');g.encounter('shooting_star');
  g.pause();const snapshot=JSON.stringify([g.time,g.level,g.speed,g.obstacles,g.tokens]);advance(g,30);
  assert.equal(JSON.stringify([g.time,g.level,g.speed,g.obstacles,g.tokens]),snapshot);
  g.reset();assert.equal(g.level,1);assert.equal(g.time,0);assert.equal(g.introduced,-1);assert.equal(g.bonusTime,-1);
});

function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function pilot(g){
  const p=g.playerBox();
  const ahead=g.obstacles.filter(o=>{const b=g.obstacleBox(o);return b.x+b.w>=p.x;}).sort((a,b)=>a.x-b.x)[0];
  const close=ahead&&(g.obstacleBox(ahead).x-(p.x+p.w))/g.speed<=.28;
  g.setDuck(!!(close&&ahead.action==='duck'&&g.y===0));
  if(close&&ahead.action==='jump'&&g.y===0)g.jump();
  // Shooting stars are optional, but also verify their jumps coexist with hazards.
  if(!close&&g.y===0&&g.tokens.some(s=>s.kind==='shooting_star'&&s.x>=p.x&&(s.x-9-(p.x+p.w))/g.speed<=.28))g.jump();
}

test('mixed encounters remain survivable through ten minutes at phone and desktop widths',()=>{
  for(const width of [420,900])for(const seed of [1,42,771]){
    const g=new Runner({width,random:seeded(seed)});g.start();const kinds=new Set();let minGap=Infinity,lastExit=-Infinity;
    const tracked=new Set();
    for(let frame=0;frame<600*120;frame++){
      pilot(g);g.update(1/120);
      assert.equal(g.state,'running',`width ${width}, seed ${seed}, time ${g.time.toFixed(2)}, ${g.obstacles.map(o=>o.kind+':'+o.x.toFixed(1))}`);
      for(const o of g.obstacles){kinds.add(o.kind);const b=g.obstacleBox(o),p=g.playerBox();
        if(b.x<p.x+p.w&&!tracked.has(o)){minGap=Math.min(minGap,g.time-lastExit);tracked.add(o);}
        if(b.x+b.w>=p.x&&b.x<p.x+p.w)lastExit=g.time;
      }
    }
    assert.deepEqual([...kinds].sort(),['balloon','bird_high','bird_low','plane']);
    assert.ok(g.stars>30);assert.ok(g.level>10);assert.ok(minGap>.8,`recovery gap ${minGap}`);
  }
});
