import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner,PLAYER_X,GROUND,difficultyAt,KINDS,LASER_CHARGE} from '../js/nm-run-engine.mjs';
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
  for(const [time,kind] of [[0,'bird_low'],[12,'bird_high'],[25,'bird_laser'],[45,'bird_wave'],[70,'shooting_star']]){
    const g=fresh();g.time=time;g.next=0;g.update(1/120);
    assert.ok(kind==='shooting_star'?g.tokens.some(s=>s.kind===kind):g.obstacles.some(o=>o.kind===kind));
    assert.ok(Math.abs(difficultyAt(time+.001).speed-difficultyAt(Math.max(0,time-.001)).speed)<.01);
  }
});

test('only bird hazards remain in every difficulty pool',()=>{
  assert.deepEqual(Object.keys(KINDS).sort(),['bird_high','bird_laser','bird_low','bird_wave']);
  for(const t of [0,12,25,45,70,105,3600])assert.ok(difficultyAt(t).pool.every(k=>k.startsWith('bird_')||k==='shooting_star'));
});

test('laser birds charge visibly before firing; the beam hits standing players and clears ducking ones',()=>{
  for(const duck of [false,true]){
    const g=fresh();g.width=420;g.time=25;g.setDuck(duck);const bird=g.spawn('bird_laser');bird.x=350;
    advance(g,LASER_CHARGE-.02);assert.equal(g.state,'running');
    assert.ok(g.laser(bird).charge>0);assert.equal(g.laser(bird).active,false);
    advance(g,.05);assert.equal(g.laser(bird).active,true);
    assert.equal(g.state,duck?'running':'hit');
    assert.ok(bird.x>g.playerBox().x+g.playerBox().w,'beam, rather than the body, reaches the player');
    if(duck){assert.ok(g.laser(bird).box.y+g.laser(bird).box.h<g.playerBox().y);advance(g,2);assert.equal(g.state,'running');}
  }
});

test('laser warnings start on screen and preserve a full warning at every speed and width',()=>{
  for(const width of [420,900])for(const time of [25,180,3600]){
    const g=fresh();g.width=width;g.time=time;g.update(1/120);g.setDuck(true);g.encounter('bird_laser');
    const bird=g.obstacles[0];let warningAt=null;
    while(bird.x>0){
      g.update(1/120);
      if(bird.chargeAge!==null&&warningAt===null){warningAt=g.time;assert.ok(bird.x+5<=width-12);}
      if(g.laser(bird)?.active){assert.ok(g.time-warningAt>=LASER_CHARGE-1/120);break;}
    }
    assert.ok(warningAt!==null);assert.equal(g.state,'running');
  }
});

test('diving birds move between low and high paths, and the collision body follows their visible position',()=>{
  const g=fresh(),bird=g.spawn('bird_wave');bird.phase=0;
  bird.age=Math.PI/2/2.3;const high=g.obstacleBox(bird);
  bird.age=3*Math.PI/2/2.3;const low=g.obstacleBox(bird);
  assert.ok(low.y-high.y>55);
  for(let t=0;t<3;t+=.05){bird.age=t;const r=g.obstacleBounds(bird),box=g.obstacleBox(bird);assert.equal(box.y,r.y+12);}
  // At the bottom of the dive ducking fails; the high pass clears a duck.
  for(const [age,expected] of [[Math.PI/2/2.3,'running'],[3*Math.PI/2/2.3,'hit']]){
    const test=fresh();test.setDuck(true);const o=test.spawn('bird_wave');o.phase=0;o.age=age;o.x=PLAYER_X;
    test.update(1/120);assert.equal(test.state,expected);
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

test('pausing freezes the difficulty clock, bird motion, laser charging and shooting stars; restart resets unlocks',()=>{
  const g=fresh();g.time=75;g.update(1/120);g.spawn('bird_wave');const laser=g.spawn('bird_laser');laser.chargeAge=.3;g.encounter('shooting_star');
  g.pause();const snapshot=JSON.stringify([g.time,g.level,g.speed,g.obstacles,g.tokens]);advance(g,30);
  assert.equal(JSON.stringify([g.time,g.level,g.speed,g.obstacles,g.tokens]),snapshot);
  g.reset();assert.equal(g.level,1);assert.equal(g.time,0);assert.equal(g.introduced,-1);assert.equal(g.bonusTime,-1);
});

function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function pilot(g){
  const p=g.playerBox();
  const ahead=g.obstacles.filter(o=>{const b=g.obstacleBox(o);return b.x+b.w>=p.x;}).sort((a,b)=>a.x-b.x)[0];
  const arrival=ahead?(g.obstacleBox(ahead).x-(p.x+p.w))/g.speed:Infinity;
  const close=ahead&&(arrival<=.28||(ahead.kind==='bird_laser'&&g.laser(ahead)));
  let action=ahead?.action;
  if(close&&action==='time'&&!ahead.plannedAction){
    let min=Infinity;
    for(let t=Math.max(0,arrival);t<=Math.max(0,arrival)+.02+55/g.speed;t+=.01)min=Math.min(min,g.birdClearance(ahead,ahead.age+t));
    ahead.plannedAction=min>=42?'duck':'jump';
  }
  if(action==='time')action=ahead.plannedAction;
  g.setDuck(!!(close&&action==='duck'&&g.y===0));
  if(close&&action==='jump'&&g.y===0)g.jump();
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
    assert.deepEqual([...kinds].sort(),['bird_high','bird_laser','bird_low','bird_wave']);
    assert.ok(g.stars>30);assert.ok(g.level>10);assert.ok(minGap>.8,`recovery gap ${minGap}`);
  }
});

test('every diving phase offers a timed jump or duck on phone and desktop at maximum speed',()=>{
  for(const width of [420,900])for(let phase=0;phase<Math.PI*2;phase+=.15){
    const g=fresh();g.width=width;g.time=3600;g.update(1/120);const bird=g.spawn('bird_wave');bird.phase=phase;
    for(let frame=0;frame<400;frame++){pilot(g);g.update(1/120);assert.equal(g.state,'running',`phase ${phase}, width ${width}, age ${bird.age}`);}
  }
});
