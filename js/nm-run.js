/* ── sketch to shelf ───────────────────────────────────────────────────────
   The footer easter egg: a pixel runner, in the spirit of the dinosaur you
   get when the internet is gone. Click the point cloud at the bottom of the
   homepage (or long-press the copyright line, or open /#run) and a runner
   sets off along the production line. One button: jump. Down: slide.

   The world is the footer's own sentence. The ground is a factory floor and
   the signposts that pass are the real stages -- TECH PACK, SAMPLE,
   PRODUCTION, FREIGHT, CUSTOMS, SHELF -- then RUN 2 and round again. The
   obstacles are the real hazards: crates, a roll of leather on end, a
   forklift coming the other way, a REJECTED tag hanging at head height that
   you slide under. Reach the shelf and the world inverts for a stretch,
   the way the dinosaur's night falls. Clip anything and a RETURNED stamp
   comes down. Metres is the score.

   Everything is drawn from bitmaps in this file -- the runner, the crates,
   a 3x5 font -- onto a canvas a few hundred pixels wide and 72 tall, then
   scaled up with image-rendering:pixelated. No image files, no libraries,
   and the whole frame is a handful of drawImage calls, so a phone runs it
   at 60 without noticing. White on the site's black, orange for one thing
   only: his shoes.

   Self-contained like the rest of the nm-* scripts: a fixed layer on
   <body>, nothing touching React or the RSC payload, no bundle patch. */
(function () {
  'use strict';

  /* ── config ──────────────────────────────────────────────────────────── */
  /* Lead capture posts to Formspree once an endpoint is pasted here; until
     then the form opens a pre-filled mail, which lands the lead anyway. */
  var CAPTURE_ENDPOINT = '';
  var MAIL = 'nicomaggioli@gmail.com';
  var SHARE_URL = 'https://nicomaggioli.com/#run';

  var H = 72, GROUND = 60, RUN_X = 20;        /* logical pixels */
  var PX_PER_M = 8;                            /* metres are the score */
  var STAGES = ['TECH PACK', 'SAMPLE', 'PRODUCTION', 'FREIGHT', 'CUSTOMS', 'SHELF'];
  var STAGE_M = 250;                           /* a signpost every 250 m */
  var V0 = 70, V_PER_M = 0.06, VMAX = 160;     /* logical px/s */
  /* a tap clears a crate (apex 19px), a held jump is long and high (apex
     30, 0.73s in the air) -- room to land past the far edge of a triple
     crate with time to spare. The first version cleared a lone crate with
     three pixels to spare, which read as a trap, not a game. */
  var JUMP_V = -160, G_HOLD = 360, G_DROP = 600;   /* held: apex 35, 0.78s in the air */
  var WHITE = '#ffffff', ORANGE = '#FF7820', DIM = '#6e6e6e', BLACK = '#0a0a0a';

  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce || !window.requestAnimationFrame) return;
  function phone() { try { return matchMedia('(max-width:767px)').matches; } catch (e) { return false; } }
  function coarse() { try { return matchMedia('(hover:none)').matches; } catch (e) { return false; } }

  /* ── sprites ─────────────────────────────────────────────────────────── */
  /* '.' empty  '#' ink  'o' orange  '-' dim */
  var S = {
    run1: ['.....####.....','....######....','....######....','....######....','.....####.....','......##......','....######....','...##.####.##.','..##..####..##','..#...####....','......####....','......####....','.....##.##....','....##...##...','...##.....##..','..##......oo..','.##...........','oo............'],
    run2: ['.....####.....','....######....','....######....','....######....','.....####.....','......##......','....######....','...#.####.#...','...#.####.#...','...#.####.#...','......####....','......####....','.....####.....','.....##.##....','.....##..##...','.....##...oo..','.....##.......','.....oo.......'],
    run3: ['.....####.....','....######....','....######....','....######....','.....####.....','......##......','....######....','.##.####.##...','##..####..##..','....####...#..','....####......','....####......','....##.##.....','...##...##....','..##.....##...','..oo......##..','...........##.','...........oo.'],
    jump: ['.....####.....','....######....','....######....','....######....','.....####.....','..#...##...#..','..#.######.#..','..##.####.##..','...#.####.#...','.....####.....','.....####.....','.....####.....','....##.##.....','...##..##.....','..##...##.....','.oo....oo.....'],
    duck: ['..............####..','.............######.','.............######.','.............######.','..............####..','......###########...','....#############.#.','..##......###.....#.','oo.........oo....##.'],
    crate: ['############','#..........#','#.#......#.#','#..#....#..#','#...#..#...#','#....##....#','#....##....#','#...#..#...#','#..#....#..#','#.#......#.#','#..........#','############'],
    crateSmall: ['########','#......#','#.#..#.#','#..##..#','#..##..#','#.#..#.#','#......#','########'],
    roll: ['.######.','#..oo..#','#.o..o.#','#..oo..#','#......#','########','#......#','#......#','#......#','#......#','#......#','#......#','#......#','#......#','#......#','#......#','#......#','.######.'],
    tag: ['.............#..............','.............#..............','............###.............','############.#.#############','#..........................#','#..........................#','#..........................#','#..........................#','#..........................#','#..........................#','############################'],
    fork: ['..................##......','...#########......##......','...#.......#......##......','...#.......#......##......','...#.......#......##......','...#.......########.......','...#..###..#......##......','...#..#.#..#......##......','.###############..##......','.#.............#..##......','.#.............#..##......','.###############..##......','..###.......###...##......','.#...#.....#...#..########','.#.o.#.....#.o.#..##......','..###.......###...........'],
    cloud: ['....####....','..########..','############','.##########.'],
    post: ['##','##','##','##','##','##','##','##'],
    box: ['..######..','.#......#.','##########','#........#','#...oo...#','#........#','##########']
  };
  var FONT = {
    A:['.#.','#.#','###','#.#','#.#'], B:['##.','#.#','##.','#.#','##.'], C:['.##','#..','#..','#..','.##'],
    D:['##.','#.#','#.#','#.#','##.'], E:['###','#..','##.','#..','###'], F:['###','#..','##.','#..','#..'],
    G:['.##','#..','#.#','#.#','.##'], H:['#.#','#.#','###','#.#','#.#'], I:['###','.#.','.#.','.#.','###'],
    J:['..#','..#','..#','#.#','.#.'], K:['#.#','#.#','##.','#.#','#.#'], L:['#..','#..','#..','#..','###'],
    M:['#.#','###','###','#.#','#.#'], N:['##.','#.#','#.#','#.#','#.#'], O:['.#.','#.#','#.#','#.#','.#.'],
    P:['##.','#.#','##.','#..','#..'], Q:['.#.','#.#','#.#','.#.','..#'], R:['##.','#.#','##.','#.#','#.#'],
    S:['.##','#..','.#.','..#','##.'], T:['###','.#.','.#.','.#.','.#.'], U:['#.#','#.#','#.#','#.#','.#.'],
    V:['#.#','#.#','#.#','#.#','.#.'], W:['#.#','#.#','###','###','#.#'], X:['#.#','#.#','.#.','#.#','#.#'],
    Y:['#.#','#.#','.#.','.#.','.#.'], Z:['###','..#','.#.','#..','###'],
    0:['.#.','#.#','#.#','#.#','.#.'], 1:['.#.','##.','.#.','.#.','###'], 2:['##.','..#','.#.','#..','###'],
    3:['##.','..#','.#.','..#','##.'], 4:['#.#','#.#','###','..#','..#'], 5:['###','#..','##.','..#','##.'],
    6:['.##','#..','###','#.#','.#.'], 7:['###','..#','.#.','.#.','.#.'], 8:['.#.','#.#','.#.','#.#','.#.'],
    9:['.#.','#.#','###','..#','##.'],
    ' ':['...','...','...','...','...'], '.':['...','...','...','...','.#.'], '-':['...','...','###','...','...'],
    '·':['...','...','.#.','...','...'], ':':['...','.#.','...','.#.','...'], '!':['.#.','.#.','.#.','...','.#.'],
    '↓':['.#.','.#.','.#.','###','.#.'], '↑':['.#.','###','.#.','.#.','.#.']
  };

  /* Each bitmap is rendered once per palette (normal, inverted) to a tiny
     canvas; a frame is then a handful of drawImage calls at 1:1. */
  var cache = {};
  function sprite(name, inv) {
    var k = name + (inv ? '!' : '');
    if (cache[k]) return cache[k];
    var rows = S[name], w = rows[0].length, h = rows.length;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d');
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var ch = rows[j][i]; if (ch === '.') continue;
      x.fillStyle = ch === 'o' ? ORANGE : ch === '-' ? DIM : (inv ? BLACK : WHITE);
      x.fillRect(i, j, 1, 1);
    }
    return (cache[k] = c);
  }
  function text(ctx, str, x, y, color, scale) {
    scale = scale || 1;
    ctx.fillStyle = color;
    var cx = x, s = String(str).toUpperCase();
    for (var n = 0; n < s.length; n++) {
      var g = FONT[s[n]] || FONT[' '];
      for (var j = 0; j < 5; j++) for (var i = 0; i < 3; i++) if (g[j][i] === '#') ctx.fillRect(cx + i * scale, y + j * scale, scale, scale);
      cx += 4 * scale;
    }
    return cx - x - scale;                          /* width drawn */
  }
  function textW(str, scale) { return String(str).length * 4 * (scale || 1) - (scale || 1); }

  /* ── state ───────────────────────────────────────────────────────────── */
  var root = null, cv = null, ctx = null, hint = null, card = null, leave = null, title = null;
  var state = 'idle';                     /* idle | intro | playing | dead | over | paused */
  var W = 240, SC = 3;                    /* logical width, css scale */
  var t = 0, dist = 0, v = V0, best = 0, newBest = false;
  var runner = { y: 0, vy: 0, ground: true, duck: false, frame: 0, anim: 0, hold: false };
  var obs = [], clouds = [], marks = [], signs = [];
  var nextObs = 0, nextCloud = 0, nextMark = 0, nextSign = 0, inv = false, flash = 0, lastHundred = 0;
  var raf = 0, lastT = 0, acc = 0, deadT = 0, result = null;
  var inerted = [], lastFocus = null, objURL = null, snap = null;
  var keys = {};

  try { best = parseFloat(localStorage.getItem('nm-run-best')) || 0; } catch (e) {}

  function stageAt(m) {
    var i = Math.floor(m / STAGE_M), lap = Math.floor(i / STAGES.length), s = STAGES[i % STAGES.length];
    return lap ? 'RUN ' + (lap + 1) + ' · ' + s : s;
  }
  function stageShort(m) { return STAGES[Math.floor(m / STAGE_M) % STAGES.length]; }

  /* ── layout ──────────────────────────────────────────────────────────── */
  /* Integer scale only, so every logical pixel is a crisp block. The strip
     is as wide as the screen allows at that scale, up to 320 logical px. */
  function layout() {
    var aw = Math.max(200, (root.clientWidth || innerWidth) - 32);
    SC = aw >= 1000 ? 4 : aw >= 640 ? 3 : 2;
    W = Math.min(320, Math.floor(aw / SC));
    cv.width = W; cv.height = H;
    cv.style.width = (W * SC) + 'px'; cv.style.height = (H * SC) + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  /* ── world ───────────────────────────────────────────────────────────── */
  function reset() {
    t = 0; dist = 0; v = V0; inv = false; flash = 0; lastHundred = 0; newBest = false; result = null;
    runner.y = 0; runner.vy = 0; runner.ground = true; runner.duck = false; runner.frame = 1; runner.anim = 0;
    obs = []; signs = []; marks = []; clouds = [];
    nextObs = W * 0.9; nextSign = 0; nextMark = 0; nextCloud = 0;
    for (var i = 0; i < 3; i++) clouds.push({ x: Math.random() * W, y: 6 + Math.random() * 18 });
    for (var j = 0; j < 10; j++) marks.push({ x: Math.random() * W, w: 1 + (Math.random() * 3 | 0) });
  }

  /* Obstacle kinds unlock with distance. Tags need the slide, which needs a
     key, so on touch screens they never come -- the roll comes instead. */
  function pick(m) {
    var pool = [['crateSmall', 1], ['crate', 1]];
    if (m > 150) pool.push(['crate2', 1]);
    if (m > 250) pool.push(['roll', 1]);
    if (m > 400) pool.push(['crate3', 0.8]);
    if (m > 550) pool.push([coarse() ? 'roll' : 'tag', 1.2]);
    if (m > 700) pool.push(['stack', 0.8]);
    if (m > 900) pool.push(['fork', 0.9]);
    var sum = 0, i; for (i = 0; i < pool.length; i++) sum += pool[i][1];
    var r = Math.random() * sum;
    for (i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) return pool[i][0]; }
    return 'crate';
  }
  function spawn(kind) {
    var o = { kind: kind, x: W + 4, vx: 0, parts: [] };
    var c = S.crate, cs = S.crateSmall;
    if (kind === 'crateSmall') o.parts.push({ s: 'crateSmall', dx: 0, dy: -cs.length });
    else if (kind === 'crate') o.parts.push({ s: 'crate', dx: 0, dy: -c.length });
    else if (kind === 'crate2') { o.parts.push({ s: 'crate', dx: 0, dy: -c.length }); o.parts.push({ s: 'crate', dx: c[0].length, dy: -c.length }); }
    else if (kind === 'crate3') { for (var i = 0; i < 3; i++) o.parts.push({ s: 'crate', dx: i * c[0].length, dy: -c.length }); }
    else if (kind === 'stack') { o.parts.push({ s: 'crate', dx: 0, dy: -c.length }); o.parts.push({ s: 'crateSmall', dx: 2, dy: -c.length - cs.length }); }
    else if (kind === 'roll') o.parts.push({ s: 'roll', dx: 0, dy: -S.roll.length });
    else if (kind === 'tag') o.parts.push({ s: 'tag', dx: 0, dy: -(12 + S.tag.length), hang: true });
    else if (kind === 'fork') { o.parts.push({ s: 'fork', dx: 0, dy: -S.fork.length }); o.vx = -40; }
    /* one box around the parts, inset two pixels so a graze is not a hit --
       the dinosaur is generous the same way, and it is why it feels fair */
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    o.parts.forEach(function (p) { var sp = S[p.s]; x0 = Math.min(x0, p.dx); x1 = Math.max(x1, p.dx + sp[0].length); y0 = Math.min(y0, p.dy); y1 = Math.max(y1, p.dy + sp.length); });
    o.bx = x0 + 2; o.bw = x1 - x0 - 4; o.by = y0 + 2; o.bh = y1 - y0 - 3;
    o.w = x1 - x0;
    obs.push(o);
  }

  function step(dt) {
    t += dt;
    var m = dist / PX_PER_M;
    v = Math.min(VMAX, V0 + m * V_PER_M);
    var dx = v * dt;
    dist += dx;

    /* runner */
    var r = runner;
    if (r.ground) {
      r.anim += dt * (8 + v / 30);
      r.frame = [0, 1, 2, 1][Math.floor(r.anim) % 4];
      if (keys.jump && !r.duck) { r.vy = JUMP_V; r.ground = false; r.hold = true; }
      r.duck = !!keys.duck;
    }
    if (!r.ground) {
      r.duck = false;
      var g = (r.hold && keys.jump && r.vy < 0) ? G_HOLD : G_DROP;
      if (keys.duck) g += 500;                    /* down in the air: drop fast, like the dino */
      r.vy += g * dt; r.y += r.vy * dt;
      if (r.y >= 0) { r.y = 0; r.vy = 0; r.ground = true; r.hold = false; r.duck = !!keys.duck; }
    }
    if (!keys.jump) r.hold = false;

    /* world scroll */
    var i, o;
    for (i = obs.length - 1; i >= 0; i--) { o = obs[i]; o.x -= dx - o.vx * dt; if (o.x + o.w < -4) obs.splice(i, 1); }
    for (i = signs.length - 1; i >= 0; i--) { signs[i].x -= dx; if (signs[i].x < -60) signs.splice(i, 1); }
    for (i = marks.length - 1; i >= 0; i--) { marks[i].x -= dx; if (marks[i].x < -4) marks.splice(i, 1); }
    for (i = clouds.length - 1; i >= 0; i--) { clouds[i].x -= dx * 0.25; if (clouds[i].x < -14) clouds.splice(i, 1); }

    /* spawning. The gap is time, not pixels, so it scales with speed: a
       jump's airtime is fixed, so what matters is seconds to the next box. */
    nextObs -= dx;
    if (nextObs <= 0) {
      var kind = pick(m);
      spawn(kind);
      /* the gap tightens with distance, never below the airtime of a jump
         plus a moment to land -- past that it stops being a game */
      var tight = Math.min(1, m / 2500);
      var secs = (1.1 - 0.25 * tight) + Math.random() * (1.1 - 0.5 * tight);
      if (kind === 'tag' || kind === 'fork') secs += 0.5;
      nextObs = v * secs + obs[obs.length - 1].w;
    }
    nextMark -= dx; if (nextMark <= 0) { marks.push({ x: W + 2, w: 1 + (Math.random() * 3 | 0) }); nextMark = 12 + Math.random() * 40; }
    nextCloud -= dx * 0.25; if (nextCloud <= 0) { clouds.push({ x: W + 2, y: 6 + Math.random() * 18 }); nextCloud = 60 + Math.random() * 120; }
    var stageIdx = Math.floor(m / STAGE_M);
    if (stageIdx >= nextSign) { signs.push({ x: W + 2, text: stageAt(m), idx: stageIdx }); nextSign = stageIdx + 1; }
    /* the shelf: the world inverts for the length of that stage */
    inv = stageShort(m) === 'SHELF';

    /* score flash every hundred */
    var hundred = Math.floor(m / 100);
    if (hundred > lastHundred) { lastHundred = hundred; flash = 0.9; }
    if (flash > 0) flash -= dt;

    /* collide */
    var rx, ry, rw, rh;
    if (r.duck) { rx = RUN_X + 3; rw = 14; rh = 7; ry = GROUND - 7; }
    else { rx = RUN_X + 4; rw = 6; rh = 16; ry = GROUND - 17 + r.y; }
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      var ox = o.x + o.bx, oy = GROUND + o.by, ow = o.bw, oh = o.bh;
      if (rx < ox + ow && rx + rw > ox && ry < oy + oh && ry + rh > oy) { die(); return; }
    }
  }

  /* ── draw ────────────────────────────────────────────────────────────── */
  function draw() {
    var ink = inv ? BLACK : WHITE, bg = inv ? '#f2f2f2' : BLACK;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    var i, o;
    for (i = 0; i < clouds.length; i++) ctx.drawImage(sprite('cloud', inv), Math.round(clouds[i].x), Math.round(clouds[i].y));
    /* ground: a line, and the dashes beneath it that give the speed away */
    ctx.fillStyle = ink; ctx.fillRect(0, GROUND, W, 1);
    ctx.fillStyle = inv ? '#9a9a9a' : DIM;
    for (i = 0; i < marks.length; i++) ctx.fillRect(Math.round(marks[i].x), GROUND + 3 + (i % 3), marks[i].w, 1);
    for (i = 0; i < signs.length; i++) {
      var sx = Math.round(signs[i].x);
      ctx.drawImage(sprite('post', inv), sx, GROUND - 8);
      text(ctx, signs[i].text, sx - 2, GROUND - 15, ink);
    }
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      for (var p = 0; p < o.parts.length; p++) {
        var part = o.parts[p], x = Math.round(o.x + part.dx), y = GROUND + part.dy;
        if (part.hang) { ctx.fillStyle = ink; ctx.fillRect(x + 13, 0, 1, y); text(ctx, 'REJECTED', x + 2, y + 4, ORANGE); }
        ctx.drawImage(sprite(part.s, inv), x, y);
      }
    }
    /* the runner */
    var r = runner, name = state === 'dead' ? 'jump' : !r.ground ? 'jump' : r.duck ? 'duck' : ['run1', 'run2', 'run3'][r.frame];
    var sp = sprite(name, inv);
    ctx.drawImage(sp, RUN_X, GROUND - sp.height + (r.duck ? 0 : Math.round(r.y)));
    /* score, top right, the dinosaur's way */
    var m = Math.floor(dist / PX_PER_M), ms = String(m); while (ms.length < 5) ms = '0' + ms;
    var bs = String(Math.floor(best)); while (bs.length < 5) bs = '0' + bs;
    var right = W - 4;
    if (!(flash > 0 && Math.floor(flash * 8) % 2)) text(ctx, ms, right - textW(ms), 4, ink);
    if (best > 0) text(ctx, 'HI ' + bs, right - textW(ms) - 8 - textW('HI ' + bs), 4, inv ? '#9a9a9a' : DIM);
    /* the stamp */
    if (state === 'dead' || state === 'over') {
      var s = 2, w = textW('RETURNED', s);
      ctx.fillStyle = bg; ctx.fillRect((W - w) / 2 - 4, 22, w + 8, 14);
      text(ctx, 'RETURNED', Math.round((W - w) / 2), 24, ORANGE, s);
    }
    if (state === 'intro') {
      var msg = coarse() ? 'TAP TO RUN' : 'SPACE TO RUN  ↓ TO SLIDE';
      text(ctx, msg, Math.round((W - textW(msg)) / 2), 24, ink);
    }
    if (state === 'paused') { var pm = 'PAUSED'; text(ctx, pm, Math.round((W - textW(pm)) / 2), 24, ink); }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - lastT) / 1000) || 0; lastT = now;
    if (state === 'playing') {
      acc += dt;
      while (acc >= 1 / 120 && state === 'playing') { step(1 / 120); acc -= 1 / 120; }
    } else if (state === 'dead') {
      deadT += dt; if (deadT > 0.9) over();
    } else if (state === 'intro') {
      runner.anim += dt * 6; runner.frame = 1;
    }
    draw();
  }

  /* ── run ─────────────────────────────────────────────────────────────── */
  function intro() {
    reset();
    state = 'intro';
    if (card) { card.remove(); card = null; }
    hint.textContent = coarse() ? 'Tap to jump · Leave is top right' : 'Space or ↑ to jump · ↓ to slide · Esc to leave';
  }
  function start() { if (state !== 'intro' && state !== 'over') return; if (state === 'over') intro(); state = 'playing'; acc = 0; lastT = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
  function die() {
    state = 'dead'; deadT = 0;
    var m = Math.floor(dist / PX_PER_M);
    result = { m: m, stage: stageAt(m), short: stageShort(m) };
    if (m > best) { best = m; newBest = true; try { localStorage.setItem('nm-run-best', String(best)); } catch (e) {} }
    snap = { obs: obs.map(function (o) { return { x: o.x, parts: o.parts }; }), signs: signs.slice(), marks: marks.slice(), clouds: clouds.slice(), inv: inv, ry: runner.y, duck: runner.duck };
  }
  function over() { state = 'over'; draw(); cancelAnimationFrame(raf); raf = 0; buildCard(); }
  function pause() { if (state !== 'playing') return; state = 'paused'; draw(); }
  function resume() { if (state !== 'paused') return; state = 'playing'; lastT = performance.now(); acc = 0; }

  /* ── input ───────────────────────────────────────────────────────────── */
  function press(what) {
    if (state === 'intro') { start(); if (what === 'jump') keys.jump = true; return; }
    if (state === 'paused') { resume(); return; }
    if (state === 'over') { intro(); start(); return; }
    keys[what] = true;
  }
  function release(what) { keys[what] = false; }
  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    var inCard = e.target && e.target.closest && e.target.closest('.nm-run-card');
    if (inCard) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); if (!e.repeat) press('jump'); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); press('duck'); }
    else if (/^(PageUp|PageDown|Home|End)$/.test(e.key)) e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') release('jump');
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') release('duck');
  }
  function onDown(e) {
    if (e.target.closest && e.target.closest('.nm-run-card, .nm-run-leave')) return;
    if (e.button !== undefined && e.button !== 0) return;
    press('jump');
  }
  function onUp(e) { release('jump'); }
  function onHide() { if (document.hidden) pause(); }
  function onResize() { if (!root) return; layout(); if (!raf) draw(); }
  /* the card is the one thing that scrolls; the page never does */
  function block(e) { e.stopPropagation(); if (e.target.closest && e.target.closest('.nm-run-card')) return; e.preventDefault(); }

  /* ── the card ────────────────────────────────────────────────────────── */
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function buildCard() {
    if (card) card.remove();
    card = el('div', 'nm-run-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Your run');
    card.appendChild(el('span', 'nm-run-lbl nm-run-eye', 'Sketch to shelf'));
    card.appendChild(el('h2', null, result.m + ' m'));
    var sub = el('p', 'nm-run-sub');
    sub.innerHTML = 'Returned at <b>' + result.stage + '</b>.';
    card.appendChild(sub);
    card.appendChild(el('span', 'nm-run-lbl nm-run-best' + (newBest ? ' is-new' : ''), newBest ? 'New best' : 'Best ' + Math.floor(best) + ' m'));
    var row = el('div', 'nm-run-row');
    var again = el('button', 'nm-run-btn pri', 'Again'); again.type = 'button';
    var share = el('button', 'nm-run-btn', 'Share'); share.type = 'button';
    var lv = el('button', 'nm-run-btn', 'Leave'); lv.type = 'button';
    again.addEventListener('click', function () { intro(); start(); });
    share.addEventListener('click', function () { doShare(share); });
    lv.addEventListener('click', close);
    row.appendChild(again); row.appendChild(share); row.appendChild(lv);
    card.appendChild(row);
    var fb = el('div', 'nm-run-share'); fb.id = 'nm-run-share'; card.appendChild(fb);
    card.appendChild(buildAsk());
    root.appendChild(card);
    requestAnimationFrame(function () { card.classList.add('is-on'); again.focus(); });
  }

  /* Under the result, never in front of it: the share is what brings the
     next person here, and the offer is what the game was about. */
  function buildAsk() {
    var ask = el('div', 'nm-run-ask');
    ask.appendChild(el('span', 'nm-run-lbl nm-run-eye', 'From the sketch, to the shelf'));
    ask.appendChild(el('h3', null, 'Got a sketch? I’ll get it to the shelf.'));
    ask.appendChild(el('p', null, 'Brand, product, packaging, the factory, the launch. Leave an email and I’ll tell you what I’d do with it.'));
    var form = el('form', 'nm-run-form'); form.noValidate = true;
    var email = el('input'); email.type = 'email'; email.name = 'email'; email.required = true; email.placeholder = 'you@…'; email.autocomplete = 'email'; email.setAttribute('aria-label', 'Email');
    var tel = el('input'); tel.type = 'tel'; tel.name = 'phone'; tel.placeholder = 'Or a number, and I’ll text'; tel.autocomplete = 'tel'; tel.setAttribute('aria-label', 'Phone, optional');
    var send = el('button', 'nm-run-btn', 'Send'); send.type = 'submit';
    var ok = el('div', 'nm-run-ok'), err = el('div', 'nm-run-err');
    ok.setAttribute('role', 'status'); ok.tabIndex = -1; err.setAttribute('role', 'alert');
    form.appendChild(email); form.appendChild(tel); form.appendChild(send); form.appendChild(ok); form.appendChild(err);
    ask.appendChild(form);
    ask.appendChild(el('p', 'nm-run-fine', 'No list. No tracking. One reply, from me.'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.classList.remove('is-on');
      var e = email.value.trim(), tl = tel.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { err.textContent = 'That email doesn’t look right.'; err.classList.add('is-on'); email.focus(); return; }
      var summary = result.m + ' m, returned at ' + result.stage;
      if (!CAPTURE_ENDPOINT) {
        var body = 'Email: ' + e + (tl ? '\nPhone: ' + tl : '') + '\n\n' + summary + '.\n\nI have something in mind:\n\n';
        location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Sketch to shelf · ' + result.m + ' m') + '&body=' + encodeURIComponent(body);
        ok.textContent = 'Your mail app should be open with a note ready. Hit send and it’s done.'; ok.classList.add('is-on'); ok.focus();
        return;
      }
      send.disabled = true; send.textContent = 'Sending…';
      fetch(CAPTURE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: e, phone: tl, run: summary, page: location.href, _subject: 'Sketch to shelf · ' + e }) })
      .then(function (r) { if (!r.ok) throw new Error('bad status');
        ok.textContent = 'Got it. I’ll reply once, from me.'; ok.classList.add('is-on'); ok.focus();
        form.querySelectorAll('input,button').forEach(function (n) { n.hidden = true; }); })
      .catch(function () { send.disabled = false; send.textContent = 'Send';
        err.innerHTML = 'Didn’t send. Email me directly: <a href="mailto:' + MAIL + '" style="color:#fff">' + MAIL + '</a>'; err.classList.add('is-on'); });
    });
    return ask;
  }

  /* ── share ───────────────────────────────────────────────────────────── */
  /* The moment it went wrong, redrawn big: your runner, the stage sign, the
     crate that got you, the metres. Pixel scene at 6x, the site's mono for
     the rest. */
  function cardBlob() {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = BLACK; x.fillRect(0, 0, 1200, 630);
    var lw = 200, lh = 56, sc = 6;
    var sceneCv = document.createElement('canvas'); sceneCv.width = lw; sceneCv.height = lh;
    var s = sceneCv.getContext('2d'); s.imageSmoothingEnabled = false;
    var g = 46, i, ink = WHITE;
    s.fillStyle = ink; s.fillRect(0, g, lw, 1);
    s.fillStyle = DIM; for (i = 0; i < 14; i++) s.fillRect((i * 37 + 9) % lw, g + 3 + (i % 3), 1 + (i % 3), 1);
    s.drawImage(sprite('cloud', false), 30, 6); s.drawImage(sprite('cloud', false), 140, 12);
    /* the sign for the stage reached, then the thing that got you, then him */
    s.drawImage(sprite('post', false), 120, g - 8); text(s, result.short, 118, g - 15, ink);
    var got = snap && snap.obs.length ? snap.obs.reduce(function (a, o) { return (o.x > RUN_X - 30 && (a == null || o.x < a.x)) ? o : a; }, null) : null;
    if (got) for (i = 0; i < got.parts.length; i++) { var p = got.parts[i]; var px = 62 + p.dx, py = g + p.dy; if (p.hang) { s.fillStyle = ink; s.fillRect(px + 13, 0, 1, py); text(s, 'REJECTED', px + 2, py + 4, ORANGE); } s.drawImage(sprite(p.s, false), px, py); }
    s.drawImage(sprite('jump', false), 28, g - 18 - 6);
    x.drawImage(sceneCv, 0, 0, lw, lh, 0, 130, lw * sc, lh * sc);
    /* metres, in the pixel font, big */
    var ms = result.m + ' M', mw = textW(ms, 9);
    text(x, ms, 60, 492, WHITE, 9);
    x.fillStyle = ORANGE; x.beginPath(); x.arc(64, 62, 6, 0, 6.2832); x.fill();
    var mono = '500 17px "Geist Mono", ui-monospace, monospace';
    try { x.letterSpacing = '0.14em'; } catch (e) {}
    x.fillStyle = 'rgba(255,255,255,0.62)'; x.font = mono; x.textBaseline = 'middle';
    x.fillText('SKETCH TO SHELF', 84, 62);
    x.textAlign = 'right'; x.fillText('NICOMAGGIOLI.COM/#RUN', 1140, 62);
    x.textBaseline = 'alphabetic';
    x.fillText('RETURNED AT ' + result.stage.toUpperCase() + ' · YOUR TURN', 1140, 570);
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, 'image/png'); });
  }
  function doShare(btn) {
    btn.disabled = true;
    var ready = document.fonts && document.fonts.load ? document.fonts.load('500 17px "Geist Mono"').catch(function () {}) : Promise.resolve();
    ready.then(cardBlob).then(function (blob) {
      var txt = 'I got it ' + result.m + ' m, to ' + result.stage.toLowerCase() + '. Your turn.';
      var file = null; try { file = new File([blob], 'sketch-to-shelf.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Sketch to shelf', text: txt, url: SHARE_URL }).catch(function (e) { if (e && e.name !== 'AbortError') fallback(blob, txt); });
      }
      fallback(blob, txt);
    }).catch(function () { fallback(null, 'I got it ' + result.m + ' m. Your turn.'); }).then(function () { btn.disabled = false; });
  }
  function fallback(blob, txt) {
    var box = document.getElementById('nm-run-share'); if (!box) return;
    box.innerHTML = ''; if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }
    if (blob) { objURL = URL.createObjectURL(blob); var im = el('img'); im.src = objURL; im.alt = 'Your run, ' + result.m + ' m'; box.appendChild(im); }
    var row = el('div', 'nm-run-row'); row.style.marginTop = '10px';
    if (blob) { var save = el('a', 'nm-run-btn', 'Save image'); save.href = objURL; save.download = 'sketch-to-shelf.png'; row.appendChild(save); }
    var copy = el('button', 'nm-run-btn', 'Copy link'); copy.type = 'button';
    copy.addEventListener('click', function () {
      var s = txt + ' ' + SHARE_URL, done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, done); else done();
    });
    row.appendChild(copy); box.appendChild(row); box.classList.add('is-on');
  }

  /* ── open / close ────────────────────────────────────────────────────── */
  function build() {
    root = el('div', 'nm-run'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Sketch to shelf'); root.tabIndex = -1;
    leave = el('button', 'nm-run-btn nm-run-leave', 'Leave'); leave.type = 'button'; leave.title = 'Esc'; leave.addEventListener('click', close);
    root.appendChild(leave);
    title = el('h2', 'nm-run-title', 'Sketch to shelf.');
    root.appendChild(title);
    cv = el('canvas'); cv.setAttribute('aria-label', 'A pixel runner on the production line'); root.appendChild(cv);
    ctx = cv.getContext('2d');
    hint = el('div', 'nm-run-lbl nm-run-hint', ''); root.appendChild(hint);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('wheel', block, { passive: false });
    root.addEventListener('touchmove', block, { passive: false });
  }
  function open() {
    if (root) return;
    build();
    document.body.appendChild(root);
    lastFocus = document.activeElement;
    inerted = [].slice.call(document.body.children).filter(function (n) { return n !== root && !n.inert; });
    inerted.forEach(function (n) { n.inert = true; });
    root.focus({ preventScroll: true });
    document.documentElement.classList.add('nm-run-open');
    layout(); intro();
    lastT = performance.now(); acc = 0;
    raf = requestAnimationFrame(frame);
    requestAnimationFrame(function () { if (root) root.classList.add('is-in'); });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', pause);
    window.addEventListener('resize', onResize);
  }
  function close() {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0; state = 'idle'; keys = {};
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('blur', pause);
    window.removeEventListener('resize', onResize);
    inerted.forEach(function (n) { n.inert = false; }); inerted = [];
    document.documentElement.classList.remove('nm-run-open');
    if (objURL) { URL.revokeObjectURL(objURL); objURL = null; }
    var r = root; root = null; card = null;
    r.classList.remove('is-in');
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); cv = null; ctx = null; snap = null; }, 380);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
    if (location.hash === '#run') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  }

  /* ── doors ───────────────────────────────────────────────────────────── */
  function footer() { return document.querySelector('section.h-lvh.relative'); }
  /* the cloud is WebGL, so "a click on it" is a press and release without
     travel in the middle of the footer while it is on screen, on nothing
     that is a link -- listened for on the document in the capture phase,
     which leaves the footer's own horizontal drag alone (a drag travels) */
  var down = null;
  document.addEventListener('pointerdown', function (e) {
    down = null;
    if (root || e.button !== 0 || phone()) return;
    if (e.target.closest && e.target.closest('a,button,input,textarea,select,[role="button"],.text-footer-tagline,footer')) return;
    var s = footer(); if (!s) return;
    var r = s.getBoundingClientRect();
    if (r.top > innerHeight * 0.5 || r.bottom < innerHeight * 0.5) return;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (Math.abs(e.clientX - cx) > r.width * 0.36 || Math.abs(e.clientY - cy) > r.height * 0.32) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!down) return; var d = down; down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 450) open();
  }, true);
  /* the copyright line, long-pressed, on any device */
  var pressTimer = 0;
  function isDoor(tg) { var p = tg && tg.closest && tg.closest('footer p'); return p && /©/.test(p.textContent) ? p : null; }
  document.addEventListener('pointerdown', function (e) {
    var p = isDoor(e.target); if (!p || root) return;
    p.classList.add('nm-run-door'); clearTimeout(pressTimer);
    pressTimer = setTimeout(function () { pressTimer = 0; open(); }, 650);
  }, true);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { document.addEventListener(ev, function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; } }, true); });
  document.addEventListener('contextmenu', function (e) { if (pressTimer && isDoor(e.target)) e.preventDefault(); }, true);
  /* #run: what the share card links to. Waits until React has hidden and
     then revealed the wordmark (the export ships it visible, so the first
     "visible" means nothing), and parks the page on the footer. */
  function revealed() { var h = document.querySelector('header'); var wm = h && h.querySelector('a[href="/"], .wordmark'); return !wm || parseFloat(getComputedStyle(wm).opacity) >= 1; }
  function viaHash() {
    if (location.hash !== '#run' || root) return;
    var tries = 0, seenHidden = false;
    (function wait() {
      var r = revealed(); if (!r) seenHidden = true;
      var s = footer();
      var laidOut = !!s && s.getBoundingClientRect().top + window.scrollY > window.innerHeight;
      if ((seenHidden && r && laidOut) || tries++ > 100) {
        if (s) { try { window.scrollTo(0, s.offsetTop); } catch (e) {} }
        setTimeout(open, 250);
      } else setTimeout(wait, 100);
    })();
  }
  if (document.readyState === 'complete') viaHash(); else window.addEventListener('load', viaHash);
  window.addEventListener('hashchange', viaHash);

  window.__nmRun = {
    open: open, close: close, press: press, release: release,
    state: function () { return { state: state, m: dist / PX_PER_M, v: v, y: runner.y, ground: runner.ground, duck: runner.duck, obs: obs.map(function (o) { return { kind: o.kind, x: o.x, w: o.w, h: o.bh, top: GROUND + o.by }; }), W: W, sc: SC }; }
  };
})();
