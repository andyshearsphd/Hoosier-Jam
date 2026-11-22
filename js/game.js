// Hoosier Jam: game engine, AI, rendering, screens and touch controls
'use strict';
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const H = 270;
  let W = 560;

  // ---------- projection (side view from the near sideline, NBA Jam style) ----------
  const S0 = 8.2, SK = 0.065, FY0 = 124, SL = 2.75;
  const sAt = z => S0 + z * SK;
  let camX = 47, shake = 0;
  const proj = (x, y, z) => { const s = sAt(z); return [W / 2 + (x - camX) * s, FY0 + z * SL - y * s, s]; };

  const RIMX = [5.25, 88.75], RIM_Y = 10, RIM_Z = 25, BOARD_X = [4, 90];
  const GRAV = 40, BGRAV = 32;
  const QTR_LEN = 180, OT_LEN = 60;
  const CPU_ACC = 0.97;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hyp = Math.hypot;
  const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const params = new URLSearchParams(location.search);
  const AUTO = params.has('auto');

  // ---------- assets ----------
  const floor = ART.buildFloor();
  let stands = null;
  let sprites = [[], []];
  function buildTeamArt() {
    stands = ART.buildStands(sAt(-4), Math.round(FY0 - 4 * SL), TEAMS[0], TEAMS[1]);
    sprites = TEAMS.map(t => t.players.map(p => ART.buildPlayerSprites({
      jersey: t.jersey, trim: t.trim, shorts: t.shorts, numColor: t.numColor, num: p.num,
      skin: p.skin, hair: p.hair, hairColor: p.hairColor, stache: p.stache, headband: p.headband
    })));
  }
  buildTeamArt();

  // ---------- state ----------
  let screen = 'title';     // title, team, pick, play, qend, final
  let paused = false;
  let ui = [];
  let time = 0;
  const match = {
    human: 0, q: 1, clock: QTR_LEN, shot: 24, score: [0, 0], dir: [1, -1], phase: 'tip', phaseT: 0,
    picks: [[0, 1], [0, 1]], tipWinner: 0, stats: [[0, 0, 0], [0, 0, 0]], buzzer: false, pickMode: 'pre'
  };
  let players = [];
  const ball = { x: 47, y: 3, z: 25, vx: 0, vy: 0, vz: 0, state: 'loose', holder: null, lastTeam: 0, shot: null, pass: null, dribPhase: 0, trail: [] };
  let callouts = [], particles = [], crowdHype = 0, netShake = [0, 0];
  let pickSel = [];

  // ---------- players ----------
  function makePlayer(team, slot, rosterIdx, human) {
    const d = TEAMS[team].players[rosterIdx];
    return {
      team, slot, ri: rosterIdx, d, r: d.r, h: d.h, spr: sprites[team][rosterIdx], human,
      x: 47, z: 25, y: 0, vx: 0, vz: 0, vy: 0, face: 1, state: 'run', t: 0, turbo: 100, usingTurbo: false,
      anim: 0, stealT: 0, stealCd: 0, jumpCd: 0, noGrab: 0, inboundT: 0, fire: false, streak: 0, stun: 0,
      dunk: null, spin: 0,
      ai: { think: 0, laneZ: rnd(-6, 6), spotX: d.r.thr >= 6 ? rnd(21, 23) : rnd(12, 17), spotZ: 0, cutT: rnd(3, 6), cutting: 0, jumpAt: -1, relVy: 0, forceShoot: false, wantPass: false }
    };
  }
  const mateOf = p => players.find(o => o !== p && o.team === p.team);
  const oppsOf = p => players.filter(o => o.team !== p.team);
  const attackRim = team => match.dir[team] > 0 ? RIMX[1] : RIMX[0];
  const defRim = team => attackRim(1 - team);
  const possTeam = () => ball.holder ? ball.holder.team : ball.lastTeam;
  const humanP = () => players.find(p => p.human);
  const speedOf = p => 12 + p.r.spd * 0.65;
  const reachOf = p => p.y + p.h * 1.33;
  const onGround = p => p.state === 'run';

  function setupPlayers() {
    players = [];
    for (let t = 0; t < 2; t++) match.picks[t].forEach((ri, slot) => players.push(makePlayer(t, slot, ri, !AUTO && t === match.human && slot === 0)));
  }

  // ---------- callouts / fx ----------
  function callout(text, color = '#f7c531', big = false) { callouts.push({ text, color, t: 0, big }); if (callouts.length > 2) callouts.shift(); }
  function burst(x, y, z, n, colors, spd = 8) {
    for (let i = 0; i < n; i++) particles.push({ x, y, z, vx: rnd(-spd, spd), vy: rnd(0, spd * 1.4), vz: rnd(-spd, spd) * 0.4, life: rnd(0.4, 0.9), t: 0, c: pick(colors), g: 20 });
  }

  // ---------- possession setup ----------
  function giveBall(p) {
    ball.holder = p; ball.state = 'held'; ball.shot = null; ball.pass = null; ball.lastTeam = p.team;
    p.noGrab = 0;
  }
  function setupPossession(team) {
    const dirO = match.dir[team];
    const off = players.filter(p => p.team === team), def = players.filter(p => p.team !== team);
    const ownBase = dirO > 0 ? 0 : 94;
    off[0].x = ownBase + dirO * 10; off[0].z = 25;
    off[1].x = ownBase + dirO * 22; off[1].z = 10;
    def[0].x = 47 - dirO * 2; def[0].z = 28;
    def[1].x = 47 + dirO * 4; def[1].z = 14;
    players.forEach(p => { p.y = 0; p.vx = p.vz = p.vy = 0; p.state = 'run'; p.face = match.dir[p.team]; p.turbo = 100; });
    giveBall(off[0]);
    ball.x = off[0].x; ball.z = off[0].z; ball.y = 3;
    match.shot = 24;
    camX = off[0].x + dirO * 12;
  }

  function startGame() {
    match.q = 1; match.score = [0, 0]; match.stats = [[0, 0, 0], [0, 0, 0]];
    match.dir = [1, -1];
    setupPlayers();
    callouts = []; particles = [];
    startTip();
    screen = 'play';
  }

  function startTip() {
    match.phase = 'tip'; match.phaseT = 0; match.clock = match.q <= 4 ? QTR_LEN : OT_LEN; match.shot = 24;
    const jumper = t => {
      const team = players.filter(p => p.team === t);
      const h = team.find(p => p.human);
      return h || team.reduce((a, b) => (b.h > a.h ? b : a));
    };
    for (let t = 0; t < 2; t++) {
      const j = jumper(t), mate = mateOf(j), dirT = match.dir[t];
      j.x = 47 - dirT * 1.5; j.z = 25; j.face = dirT;
      mate.x = 47 - dirT * 9; mate.z = t === 0 ? 12 : 38; mate.face = dirT;
      j.isJumper = true; mate.isJumper = false;
    }
    players.forEach(p => { p.y = 0; p.vx = p.vz = p.vy = 0; p.state = 'run'; p.turbo = 100; p.ai.jumpAt = -1; });
    ball.holder = null; ball.state = 'tip'; ball.x = 47; ball.z = 25; ball.y = 7; ball.vx = ball.vz = 0; ball.vy = 16.5;
    camX = 47;
    callout(match.q > 4 ? 'OVERTIME!' : 'TIP OFF!', '#ffffff');
    SFX.whistle();
  }

  function startQuarter() {
    match.q++;
    const half2 = match.q === 3 || match.q === 4;
    match.dir = half2 ? [-1, 1] : [1, -1];
    match.clock = match.q <= 4 ? QTR_LEN : OT_LEN;
    match.buzzer = false;
    players.forEach(p => { p.fire = false; p.streak = 0; });
    if (match.q > 4) { startTip(); return; }
    const team = match.q === 4 ? match.tipWinner : 1 - match.tipWinner;
    setupPossession(team);
    match.phase = 'live';
    callout(['', '1ST QUARTER', '2ND QUARTER', '3RD QUARTER', '4TH QUARTER'][match.q], '#ffffff');
    SFX.whistle();
  }

  // ---------- actions ----------
  function passBall(from, to) {
    if (!to) return;
    const lead = 0.22;
    const tx = to.x + to.vx * lead, tz = to.z + to.vz * lead;
    const dist = hyp(tx - ball.x, tz - ball.z);
    const T = Math.max(0.14, dist / 44);
    ball.holder = null; ball.state = 'pass';
    ball.vx = (tx - ball.x) / T; ball.vz = (tz - ball.z) / T;
    ball.vy = (4.8 - ball.y + 0.5 * BGRAV * T * T) / T;
    ball.pass = { from, to, t: 0, T, checked: new Set() };
    ball.lastTeam = from.team;
    from.noGrab = 0.25;
    from.face = Math.sign(tx - from.x) || from.face;
    SFX.pass();
  }

  function dunkRange(p) { return 4 + p.r.dnk * 0.9; }

  function startShot(p, turbo) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    const d = hyp(p.x - rimX, p.z - RIM_Z);
    const inFront = (rimX - p.x) * dirT > -1.5;
    if ((turbo || p.fire) && d <= dunkRange(p) && d > 2.5 && inFront && (p.turbo > 5 || p.fire)) return startDunk(p, d);
    if (d < 7.5) return startLayup(p);
    p.state = 'shoot'; p.t = 0; p.vy = 14 + p.r.dnk * 0.15; p.vx *= 0.15; p.vz *= 0.15;
    p.face = Math.sign(rimX - p.x) || p.face;
    if (!p.human) p.ai.relVy = Math.random() < 0.12 ? rnd(-9, -6) : rnd(-2.5, 3);
  }
  function startLayup(p) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    p.state = 'layup'; p.t = 0; p.vy = 12.5;
    const tx = rimX - dirT * 1.6, tz = RIM_Z + (p.z - RIM_Z) * 0.3;
    p.vx = (tx - p.x) / 0.55; p.vz = (tz - p.z) / 0.55;
    p.face = Math.sign(rimX - p.x) || p.face;
  }
  function startDunk(p, d) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    const ex = rimX - dirT * 1.1, ez = RIM_Z + (p.z > RIM_Z ? 0.6 : -0.6);
    p.state = 'dunk'; p.t = 0;
    // a defender standing between the dunker and the rim can stuff it
    let contest = null;
    for (const o of oppsOf(p)) {
      if (o.state === 'down') continue;
      const toRim = hyp(o.x - rimX, o.z - RIM_Z);
      if (d2(o, p) < 4.5 && toRim < d + 1) { contest = o; break; }
    }
    p.dunk = { sx: p.x, sz: p.z, ex, ez, T: 0.42 + d * 0.045, arc: 2.5 + d * 0.22, endY: Math.max(1, 10.9 - (p.h * 1.33 + 0.6)), spin: d > 9 && Math.random() < 0.55, contest };
    p.face = Math.sign(rimX - p.x) || p.face;
    if (!p.fire) p.turbo = Math.max(0, p.turbo - 12);
    p.spin = 0;
  }

  function releaseShot(p, forceTiming) {
    if (ball.holder !== p) return;
    p.queuedRelease = false;
    const layup = p.state === 'layup';
    const rimX = attackRim(p.team);
    const bx = p.x + p.face * 0.4, by = p.y + p.h + 1.0, bz = p.z;
    const d = hyp(p.x - rimX, p.z - RIM_Z);
    const three = !layup && d > 19.75;
    let prob;
    if (layup) prob = 0.72 + p.r.sht * 0.015;
    else if (three) prob = 0.16 + p.r.thr * 0.033 - Math.max(0, d - 22) * 0.035;
    else prob = 0.42 + p.r.sht * 0.025 - Math.max(0, d - 8) * 0.011;
    let timing = 'ok';
    if (!layup) {
      const a = Math.abs(p.vy);
      timing = forceTiming || (a <= 3 ? 'perfect' : a <= 7 ? 'ok' : 'bad');
      prob += timing === 'perfect' ? 0.08 : timing === 'bad' ? -0.16 : 0;
    }
    let contest = 0;
    for (const o of oppsOf(p)) {
      const dd = d2(o, p);
      if (dd < 5.5 && o.state !== 'down') contest = Math.max(contest, (5.5 - dd) / 5.5 * (o.y > 0.6 ? 1 : 0.6) * (0.7 + o.r.blk * 0.04));
    }
    prob -= contest * 0.3;
    if (p.fire) prob = Math.max(prob, three ? 0.82 : 0.9);
    if (!p.human && p.team !== match.human) prob *= CPU_ACC;
    prob = clamp(prob, 0.03, 0.96);
    const made = Math.random() < prob;
    let tx = rimX, ty = RIM_Y, tz = RIM_Z;
    if (!made) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.95, 1.5);
      tx += Math.cos(a) * r; tz += Math.sin(a) * r * 0.8; ty = 10.15;
    }
    const T = layup ? 0.42 : 0.7 + d * 0.027;
    ball.holder = null; ball.state = 'shot';
    ball.x = bx; ball.y = by; ball.z = bz;
    ball.vx = (tx - bx) / T; ball.vz = (tz - bz) / T; ball.vy = (ty - by + 0.5 * BGRAV * T * T) / T;
    ball.shot = { made, T, t: 0, three, shooter: p, rimX, team: p.team, d, checked: new Set(), layup };
    ball.lastTeam = p.team;
    p.noGrab = 0.4;
  }

  function trySteal(p) {
    if (p.stealCd > 0) return;
    p.stealCd = 0.55; p.stealT = 0.25;
    const h = ball.holder;
    if (!h || h.team === p.team || ball.state !== 'held') return;
    if (d2(p, h) > 3.8 || h.state !== 'run' || h.inboundT > 0) return;
    const chance = 0.1 + p.r.stl * 0.032;
    if (Math.random() < chance) {
      giveBall(p); h.stun = 0.35; match.shot = 24;
      callout(pick(['STOLEN!', 'PICKED CLEAN!', 'THE PICKPOCKET!']), '#7fe0ff');
      SFX.steal();
    }
  }
  function tryShove(p) {
    if (p.stealCd > 0) return;
    p.stealCd = 0.8; p.stealT = 0.25;
    let best = null, bd = 4.2;
    for (const o of oppsOf(p)) { const dd = d2(o, p) - (o === ball.holder ? 1 : 0); if (dd < bd && o.state !== 'down') { bd = dd; best = o; } }
    if (!p.fire) p.turbo = Math.max(0, p.turbo - 18);
    if (!best || Math.random() > 0.75) return;
    const nx = (best.x - p.x) || p.face, nz = best.z - p.z, nl = hyp(nx, nz) || 1;
    best.state = 'down'; best.t = 1.25; best.vx = nx / nl * 12; best.vz = nz / nl * 12; best.vy = 0;
    best.dunk = null;
    if (ball.holder === best) {
      ball.holder = null; ball.state = 'loose'; ball.vx = nx / nl * 6 + rnd(-3, 3); ball.vz = rnd(-4, 4); ball.vy = 7; ball.y = best.y + 4;
      best.noGrab = 0.8;
    }
    SFX.shove();
  }
  function jump(p) {
    if (!onGround(p) || p.jumpCd > 0) return;
    p.state = 'air'; p.vy = 13.5 + p.r.blk * 0.35; p.jumpCd = 0.55;
  }

  // ---------- scoring ----------
  function score(p, pts, kind) {
    const t = p.team;
    match.score[t] += pts;
    match.kinds = match.kinds || {}; const kk = kind + pts; match.kinds[kk] = (match.kinds[kk] || 0) + 1;
    match.stats[t][p.ri] += pts;
    p.streak++;
    for (const o of players) if (o.team !== t) { o.streak = 0; if (o.fire) { o.fire = false; } }
    if (!p.fire && p.streak === 2) callout('HEATING UP...', '#ff9a3c');
    else if (!p.fire && p.streak >= 3) { p.fire = true; callout('RED HOT!', '#ff4a1c', true); SFX.fire(); }
    else if (kind === 'dunk') callout(pick(['SLAM!', 'JAM IT!', 'BOOM SHAKE!', 'THROWN DOWN!', 'TOMAHAWK!', 'WITH AUTHORITY!', 'MONSTER JAM!']), '#ffffff', true);
    else if (pts === 3) callout(ball.shot && ball.shot.d > 25 ? 'FROM THE PARKING LOT!' : pick(['FROM DOWNTOWN!', 'BOMBS AWAY!', 'SPLASH!', 'GOOD FROM WAY OUT!']), '#f7c531', true);
    else if (Math.random() < 0.35) callout(pick(['NOTHING BUT NET!', 'COUNT IT!', 'BUCKETS!']), '#f7c531');
    if (match.clock <= 0) callout('AT THE BUZZER!', '#ff4a1c', true);
    crowdHype = pts === 3 || kind === 'dunk' ? 2.2 : 1.2;
    SFX.crowd(pts === 3 || kind === 'dunk');
    match.phase = 'dead'; match.phaseT = 1.15; match.inboundTeam = 1 - t; match.scoredRim = attackRim(t);
  }

  function inbound(team) {
    const rimX = match.scoredRim;
    const base = rimX < 47 ? 0 : 94, inward = rimX < 47 ? 1 : -1;
    const tm = players.filter(p => p.team === team);
    const r = tm.reduce((a, b) => (Math.abs(b.x - rimX) < Math.abs(a.x - rimX) ? b : a));
    r.x = base + inward * 1.5; r.z = 25 + rnd(-6, 6); r.state = 'run'; r.y = 0; r.vx = r.vz = 0; r.stun = 0;
    r.dunk = null;
    giveBall(r); r.inboundT = 0.45;
    ball.x = r.x; ball.z = r.z; ball.y = 3;
    match.shot = 24;
    match.phase = 'live';
  }

  // ---------- input ----------
  const input = { mx: 0, mz: 0, shoot: false, pass: false, turbo: false, pShoot: false, pPass: false };
  const keys = new Set();
  window.addEventListener('keydown', e => {
    keys.add(e.code);
    if (e.code === 'KeyP' || e.code === 'Escape') { if (screen === 'play') paused = !paused; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    SFX.unlock();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));

  const elControls = document.getElementById('controls');
  const elBase = document.getElementById('stickBase'), elKnob = document.getElementById('stickKnob');
  const elBtn = { shoot: document.getElementById('bShoot'), pass: document.getElementById('bPass'), turbo: document.getElementById('bTurbo') };
  const elPause = document.getElementById('pauseBtn');
  const touches = new Map();
  let stickId = null, stickOrigin = null, stickVec = [0, 0];

  function defaultStickPos() {
    const vh = window.innerHeight;
    return [Math.max(95, window.innerWidth * 0.12), vh - 100];
  }
  function placeStick(x, y) { elBase.style.left = x + 'px'; elBase.style.top = y + 'px'; }
  function setKnob(dx, dy) { elKnob.style.transform = `translate(${dx}px, ${dy}px)`; }
  function btnHit(x, y) {
    const hits = [];
    for (const k in elBtn) {
      const r = elBtn[k].getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 * 1.12;
      if (hyp(x - cx, y - cy) <= rad) hits.push(k);
    }
    return hits;
  }
  function onDown(e) {
    SFX.unlock();
    if (e.target === elPause) return;
    e.preventDefault();
    if (screen === 'play' && !paused) {
      if (e.clientX < window.innerWidth * 0.45 && stickId === null) {
        stickId = e.pointerId;
        const [dx, dy] = defaultStickPos();
        stickOrigin = [clamp(e.clientX, 70, window.innerWidth * 0.45), clamp(e.clientY, 70, window.innerHeight - 64)];
        if (hyp(e.clientX - dx, e.clientY - dy) < 70) stickOrigin = [dx, dy];
        placeStick(stickOrigin[0], stickOrigin[1]);
        moveStick(e.clientX, e.clientY);
      } else {
        const hits = btnHit(e.clientX, e.clientY);
        touches.set(e.pointerId, { hits, turboLatch: hits.includes('turbo') });
      }
      return;
    }
    uiTap(e.clientX, e.clientY);
  }
  function moveStick(x, y) {
    let dx = x - stickOrigin[0], dy = y - stickOrigin[1];
    const L = hyp(dx, dy), max = 46;
    if (L > max) { dx *= max / L; dy *= max / L; }
    setKnob(dx, dy);
    const m = Math.min(1, L / max);
    stickVec = L < 8 ? [0, 0] : [dx / (L || 1) * m, dy / (L || 1) * m];
  }
  function onMove(e) {
    if (e.pointerId === stickId) { e.preventDefault(); moveStick(e.clientX, e.clientY); return; }
    const t = touches.get(e.pointerId);
    if (t) { t.hits = btnHit(e.clientX, e.clientY); if (t.hits.includes('turbo')) t.turboLatch = true; }
  }
  function onUp(e) {
    if (e.pointerId === stickId) { stickId = null; stickVec = [0, 0]; setKnob(0, 0); placeStick(...defaultStickPos()); }
    touches.delete(e.pointerId);
  }
  window.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'dblclick']) {
    document.addEventListener(ev, e => { if (e.target !== elPause) e.preventDefault(); }, { passive: false });
  }
  elPause.addEventListener('pointerdown', e => { e.stopPropagation(); if (screen === 'play') { paused = !paused; SFX.blip(); } });

  function readInput() {
    let shoot = false, pass = false, turbo = false;
    for (const t of touches.values()) {
      if (t.hits.includes('shoot')) shoot = true;
      if (t.hits.includes('pass')) pass = true;
      if (t.turboLatch || t.hits.includes('turbo')) turbo = true;
    }
    let mx = stickVec[0], mz = stickVec[1];
    const k = c => keys.has(c);
    if (k('ArrowLeft') || k('KeyA')) mx = -1;
    if (k('ArrowRight') || k('KeyD')) mx = 1;
    if (k('ArrowUp') || k('KeyW')) mz = -1;
    if (k('ArrowDown') || k('KeyS')) mz = 1;
    if (k('Space') || k('KeyJ')) shoot = true;
    if (k('KeyK')) pass = true;
    if (k('ShiftLeft') || k('ShiftRight') || k('KeyL')) turbo = true;
    const L = hyp(mx, mz); if (L > 1) { mx /= L; mz /= L; }
    const it = {
      mx, mz, turbo,
      shootPress: shoot && !input.shoot, shootHeld: shoot, shootRelease: !shoot && input.shoot,
      passPress: pass && !input.pass
    };
    input.shoot = shoot; input.pass = pass; input.turbo = turbo;
    for (const kk in elBtn) elBtn[kk].classList.toggle('down', kk === 'shoot' ? shoot : kk === 'pass' ? pass : turbo);
    return it;
  }
  let lblCache = '';
  function updateButtonLabels() {
    const h = humanP(); if (!h) return;
    let s = 'SHOOT', p = 'PASS';
    const off = ball.holder && ball.holder.team === h.team;
    if (!off) { s = 'JUMP'; p = input.turbo ? 'SHOVE' : 'STEAL'; }
    const key = s + p;
    if (key !== lblCache) { elBtn.shoot.textContent = s; elBtn.pass.textContent = p; lblCache = key; }
  }

  // ---------- AI ----------
  function blankIntent() { return { mx: 0, mz: 0, turbo: false, shootPress: false, shootHeld: false, shootRelease: false, passPress: false }; }
  function moveTo(it, p, tx, tz, slow = 1.5) {
    const dx = tx - p.x, dz = tz - p.z, L = hyp(dx, dz);
    if (L < 0.5) return L;
    const m = Math.min(1, L / slow);
    it.mx = dx / L * m; it.mz = dz / L * m;
    return L;
  }
  function openness(p) { let m = 99; for (const o of oppsOf(p)) if (o.state !== 'down') m = Math.min(m, d2(o, p)); return m; }

  function aiIntent(p, dt) {
    const it = blankIntent();
    const A = p.ai;
    if (p.state === 'shoot') { if (ball.holder === p && p.vy <= A.relVy) it.shootRelease = true; else it.shootHeld = true; return it; }
    if (!onGround(p)) return it;
    if (match.phase === 'tip') {
      if (p.isJumper && A.jumpAt < 0 && ball.vy < 5) A.jumpAt = rnd(0.02, 0.3);
      if (A.jumpAt >= 0) { A.jumpAt -= dt; if (A.jumpAt <= 0) { A.jumpAt = -1; it.shootPress = true; } }
      return it;
    }
    if (match.phase === 'dead') {
      // jog toward the other end while the ball is inbounded
      const inb = match.inboundTeam === p.team;
      const tx = inb ? 47 - match.dir[p.team] * 6 : defRim(p.team) + (defRim(p.team) < 47 ? 14 : -14);
      moveTo(it, p, tx, RIM_Z + (p.slot ? 9 : -9));
      return it;
    }
    if (match.phase !== 'live') return it;
    A.think -= dt;
    const deciding = A.think <= 0;
    if (deciding) A.think = rnd(0.12, 0.26);
    const team = p.team, dirT = match.dir[team];
    const aRim = attackRim(team), dRim = defRim(team);
    const mate = mateOf(p), opps = oppsOf(p);
    const holder = ball.holder;
    const myMan = opps.find(o => o.slot === p.slot) || opps[0];

    if (A.jumpAt >= 0) { A.jumpAt -= dt; if (A.jumpAt <= 0) { A.jumpAt = -1; it.shootPress = true; return it; } }

    if (holder !== p) A.hadBall = false;
    if (holder === p) {
      if (!A.hadBall) {
        A.hadBall = true;
        A.plan = Math.random() < p.r.thr * 0.055 ? 'pull' : 'drive';
        A.pullAng = rnd(-1.1, 1.1);
      }
      if (p.inboundT > 0) { moveTo(it, p, p.x + dirT * 5, p.z); return it; }
      const d = hyp(p.x - aRim, p.z - RIM_Z);
      const open = openness(p);
      if (A.forceShoot) { A.forceShoot = false; it.shootPress = true; it.turbo = d <= dunkRange(p) && p.turbo > 10; return it; }
      if (A.wantPass && mate) { A.wantPass = false; it.passPress = true; return it; }
      if (deciding) {
        const mOpen = mate ? openness(mate) : 0;
        if (match.shot < 2.5 && d < 30) { it.shootPress = true; it.turbo = d <= dunkRange(p); return it; }
        const blockerAhead = opps.some(o => o.state !== 'down' && (o.x - p.x) * dirT > -0.5 && d2(o, p) < 5 && hyp(o.x - aRim, o.z - RIM_Z) < d + 1);
        if (d <= dunkRange(p) && d > 3 && (p.turbo > 15 || p.fire) && Math.random() < (blockerAhead ? 0.1 : 0.45 + p.r.dnk * 0.03)) { it.shootPress = true; it.turbo = true; return it; }
        if (blockerAhead && d < 16 && d > 7 && Math.random() < 0.1 + p.r.sht * 0.015) { it.shootPress = true; return it; }
        if (d < 7 && Math.random() < 0.55) { it.shootPress = true; return it; }
        if (d < 19.5 && d > 8 && open > 5 && Math.random() < 0.06 + p.r.sht * 0.02) { it.shootPress = true; return it; }
        if (d >= 20 && d < 24.5 && open > 4.5 && Math.random() < p.r.thr * 0.03 + (p.fire ? 0.15 : 0)) { it.shootPress = true; return it; }
        if (mate && !mate.human && mOpen > 6 && mate.r.thr >= 6 && hyp(mate.x - aRim, mate.z - RIM_Z) > 20 && Math.random() < 0.08) { it.passPress = true; return it; }
        if (mate && open < 4 && mOpen > 6 && Math.random() < 0.12) { it.passPress = true; return it; }
        if (mate && mate.human && mOpen > 5 && Math.random() < 0.05) { it.passPress = true; return it; }
        if (Math.random() < 0.1) A.laneZ = rnd(-9, 9);
      }
      let tx = aRim - dirT * 1.5, tz = RIM_Z + A.laneZ * Math.min(1, d / 18);
      if (A.plan === 'pull') {
        const px = aRim - dirT * Math.cos(A.pullAng) * 22, pz = RIM_Z + Math.sin(A.pullAng) * 21;
        if (hyp(p.x - px, p.z - pz) < 2.5 || (d < 23.5 && d > 20)) {
          if (deciding && (open > 3.5 || Math.random() < 0.25)) { it.shootPress = true; return it; }
          if (deciding && Math.random() < 0.15) A.plan = 'drive';
        }
        if (A.plan === 'pull') { moveTo(it, p, px, pz); it.turbo = p.turbo > 40 && hyp(p.x - px, p.z - pz) > 10; return it; }
      }
      for (const o of opps) {
        const ahead = (o.x - p.x) * dirT;
        if (ahead > 0 && ahead < 6 && Math.abs(o.z - p.z) < 3) tz += (p.z < o.z ? -7 : 7);
      }
      moveTo(it, p, tx, clamp(tz, 3, 47));
      it.turbo = (p.turbo > 35 && d > 8 && d < 34 && open > 3) || p.fire;
      return it;
    }

    if (holder && holder.team === team) {
      // off-ball offense
      A.cutT -= dt;
      if (A.cutT <= 0) { A.cutting = 1.4; A.cutT = rnd(3.5, 7); A.spotZ = rnd(-1, 1) < 0 ? -1 : 1; }
      let tx, tz;
      if (A.cutting > 0) { A.cutting -= dt; tx = aRim - dirT * 4; tz = RIM_Z + A.spotZ * 4; }
      else { tx = aRim - dirT * A.spotX; tz = holder.z < RIM_Z ? 40 : 10; }
      if (d2(p, holder) < 7) tz += p.z < holder.z ? -5 : 5;
      moveTo(it, p, tx, clamp(tz, 3, 47));
      it.turbo = d2(p, { x: tx, z: tz }) > 14 && p.turbo > 50;
      return it;
    }

    if (holder && holder.team !== team) {
      // defense
      const man = myMan;
      const gx = dRim - man.x, gz = RIM_Z - man.z, gl = hyp(gx, gz) || 1;
      let tx, tz;
      if (man === holder) {
        tx = man.x + gx / gl * 3; tz = man.z + gz / gl * 3;
        const dd = d2(p, man);
        if (deciding && dd < 3.8 && man.state === 'run') {
          if (p.turbo > 30 && Math.random() < 0.025) { it.passPress = true; it.turbo = true; return it; }
          if (Math.random() < 0.05 + p.r.stl * 0.013) { it.passPress = true; return it; }
        }
        if ((man.state === 'shoot' || man.state === 'layup') && dd < 6.5 && A.jumpAt < 0 && Math.random() < 0.5 + p.r.blk * 0.04) A.jumpAt = rnd(0.04, 0.2);
        if (man.state === 'dunk' && hyp(p.x - dRim, p.z - RIM_Z) < 8 && A.jumpAt < 0 && Math.random() < 0.3 + p.r.blk * 0.05) A.jumpAt = Math.max(0.01, man.dunk.T - man.t - 0.35);
      } else {
        const sag = hyp(holder.x - dRim, holder.z - RIM_Z) < 14 ? 0.5 : 0.25;
        tx = man.x + gx / gl * 6; tz = man.z + gz / gl * 6;
        tx += (holder.x - tx) * sag * 0.5; tz += (holder.z - tz) * sag * 0.5;
        if (holder.state === 'dunk' && hyp(p.x - dRim, p.z - RIM_Z) < 8 && A.jumpAt < 0 && Math.random() < 0.25 + p.r.blk * 0.05) A.jumpAt = Math.max(0.01, holder.dunk.T - holder.t - 0.35);
      }
      const L = moveTo(it, p, tx, tz, 1);
      it.turbo = (L > 9 && p.turbo > 20) || (man === holder && man.usingTurbo && p.turbo > 5 && L > 1.5);
      if (L < 1.2) p.face = Math.sign(man.x - p.x) || p.face;
      return it;
    }

    // loose ball, shot or pass in flight
    if (ball.state === 'shot') {
      const r = ball.shot.rimX;
      const offense = ball.shot.team === team;
      const tx = r + (r < 47 ? 1 : -1) * (offense ? 7 : 5), tz = RIM_Z + (p.slot ? -5 : 5);
      moveTo(it, p, tx, tz);
      for (const o of opps) if (o === ball.shot.shooter && d2(p, o) < 6 && ball.shot.t < 0.2 && A.jumpAt < 0 && Math.random() < 0.02 + p.r.blk * 0.01) A.jumpAt = 0.01;
      return it;
    }
    if (ball.state === 'pass') {
      const pt = ball.pass.to;
      if (pt.team !== team) {
        // jump the passing lane a little
        const lx = (ball.x + pt.x) / 2, lz = (ball.z + pt.z) / 2;
        if (hyp(lx - p.x, lz - p.z) < 6) moveTo(it, p, lx, lz, 1);
      }
      return it;
    }
    if (ball.state === 'loose' || ball.state === 'tip') {
      const tt = Math.max(0, Math.min(0.6, ball.vy > 0 ? ball.vy / BGRAV + 0.2 : 0.2));
      const px = ball.x + ball.vx * tt, pz = ball.z + ball.vz * tt;
      const mine = [p, mate].filter(Boolean);
      const chaser = mine.reduce((a, b) => (hyp(b.x - px, b.z - pz) < hyp(a.x - px, a.z - pz) ? b : a));
      if (chaser === p) {
        const L = moveTo(it, p, px, pz, 0.6);
        it.turbo = L > 4 && p.turbo > 10;
        const hd = hyp(ball.x - p.x, ball.z - p.z);
        if (hd < 3 && ball.y > p.h * 1.25 && ball.y < p.h * 1.33 + 3.6 && ball.vy < 3 && Math.random() < 0.3) it.shootPress = true;
      } else {
        moveTo(it, p, dRim + (dRim < 47 ? 1 : -1) * 14, RIM_Z + (p.slot ? -6 : 6));
      }
      return it;
    }
    return it;
  }

  // ---------- apply intents ----------
  function applyIntent(p, it, dt) {
    p.stealCd -= dt; p.jumpCd -= dt; p.noGrab -= dt; p.inboundT -= dt; p.stealT -= dt; p.stun -= dt;
    if (p.state === 'down') return;
    // turbo meter
    const moving = Math.abs(it.mx) + Math.abs(it.mz) > 0.2;
    p.usingTurbo = it.turbo && moving && (p.turbo > 0 || p.fire);
    if (p.usingTurbo && !p.fire) p.turbo = Math.max(0, p.turbo - 32 * dt);
    else if (!it.turbo) p.turbo = Math.min(100, p.turbo + 13 * dt);
    if (p.fire) p.turbo = 100;

    if (onGround(p) && p.stun <= 0) {
      const sp = speedOf(p) * (p.usingTurbo ? 1.45 : 1) * (ball.holder === p ? 0.95 : 1);
      const tx = it.mx * sp, tz = it.mz * sp * 0.92;
      const k = Math.min(1, dt * 11);
      p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
      if (Math.abs(p.vx) > 1) p.face = Math.sign(p.vx);
      else if (ball.holder === p) p.face = Math.sign(attackRim(p.team) - p.x) || p.face;
    } else if (onGround(p)) { p.vx *= 0.8; p.vz *= 0.8; }

    if (match.phase === 'tip') {
      p.vx = p.vz = 0;
      if (it.shootPress && p.isJumper) jump(p);
      return;
    }
    if (match.phase !== 'live') return;

    const holder = ball.holder;
    if (holder === p) {
      if (onGround(p) && p.inboundT <= 0) {
        if (it.passPress) passBall(p, mateOf(p));
        else if (it.shootPress) startShot(p, it.turbo);
      }
      if (p.state === 'shoot' && !p.queuedRelease) {
        // a quick tap on the way up releases at the top of the jump (no perfect-timing bonus)
        if (it.shootRelease && p.vy > 3) p.queuedRelease = true;
        else if (it.shootRelease || p.vy < -7.5) releaseShot(p);
      }
    } else if (holder && holder.team === p.team) {
      if (p.human) {
        if (it.passPress && holder.state === 'run') holder.ai.wantPass = true;
        if (it.shootPress && holder.state === 'run') holder.ai.forceShoot = true;
      }
    } else {
      if (it.passPress) { if (it.turbo && (p.turbo > 10 || p.fire)) tryShove(p); else trySteal(p); }
      if (it.shootPress) jump(p);
    }
  }

  // ---------- simulation ----------
  function updatePlayer(p, dt) {
    p.t += dt;
    switch (p.state) {
      case 'run':
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.anim += hyp(p.vx, p.vz) * dt * 0.42;
        break;
      case 'air': case 'shoot': case 'layup':
        p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= GRAV * dt; p.y += p.vy * dt;
        if (p.state === 'layup') { p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2; if (p.t > 0.3 && ball.holder === p) releaseShot(p); }
        if (p.state === 'shoot' && p.queuedRelease && p.vy <= 1 && ball.holder === p) { p.queuedRelease = false; releaseShot(p, 'ok'); }
        if (p.y <= 0) {
          const wasShooting = p.state === 'shoot' || p.state === 'layup';
          p.y = 0; p.vy = 0; p.state = 'run'; p.vx *= 0.3; p.vz *= 0.3;
          if (wasShooting && ball.holder === p && match.phase === 'live') releaseShot(p);
        }
        break;
      case 'dunk': {
        const D = p.dunk, u = Math.min(1, p.t / D.T);
        p.x = D.sx + (D.ex - D.sx) * u; p.z = D.sz + (D.ez - D.sz) * u;
        p.y = D.endY * u + D.arc * 4 * u * (1 - u);
        p.spin = D.spin ? u * Math.PI * 2 : 0;
        if (u >= 1) finishDunk(p);
        break;
      }
      case 'hang':
        if (p.t > 0.4) { p.state = 'air'; p.vy = 0; p.vx = -match.dir[p.team] * 3; p.vz = 0; p.t = 0; }
        break;
      case 'down':
        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 4; p.vz *= 1 - dt * 4;
        if (p.y > 0) { p.vy -= GRAV * dt; p.y = Math.max(0, p.y + p.vy * dt); }
        if (p.t > 1.25) { p.state = 'run'; p.t = 0; p.y = 0; p.stun = 0.15; }
        break;
    }
    p.x = clamp(p.x, -3, 97); p.z = clamp(p.z, -1.5, 51.5);
  }

  function finishDunk(p) {
    const rimX = attackRim(p.team);
    let blocked = false;
    for (const o of oppsOf(p)) {
      if (o.state === 'air' && hyp(o.x - rimX, o.z - RIM_Z) < 4 && reachOf(o) + 0.5 > 10.2 && Math.random() < 0.08 + o.r.blk * 0.035) { blocked = o; break; }
    }
    const ct = p.dunk.contest;
    if (!blocked && ct && ct.state !== 'down' && Math.random() < 0.22 + ct.r.blk * 0.035) blocked = ct;
    p.dunk = null; p.spin = 0;
    if (blocked) {
      p.state = 'air'; p.vy = 0; p.vx = -match.dir[p.team] * 4; p.vz = 0; p.t = 0;
      ball.holder = null; ball.state = 'loose'; ball.vx = -match.dir[p.team] * rnd(10, 16); ball.vy = rnd(3, 7); ball.vz = rnd(-5, 5);
      ball.lastTeam = blocked.team; p.noGrab = 0.6;
      callout(pick(['REJECTED!', 'DENIED!', 'GET THAT OUTTA HERE!']), '#7fe0ff', true);
      SFX.block(); shake = 0.25;
      return;
    }
    p.state = 'hang'; p.t = 0; p.vx = p.vz = 0;
    ball.holder = null; ball.state = 'dead'; ball.x = rimX; ball.z = RIM_Z; ball.y = 9.6; ball.vx = ball.vz = 0; ball.vy = -14;
    netShake[rimX < 47 ? 0 : 1] = 0.5;
    shake = 0.35;
    SFX.dunk();
    burst(rimX, 10, RIM_Z, 18, ['#ffffff', '#f7c531', '#ff8a3c'], 9);
    ball.shot = { d: 0 };
    score(p, 2, 'dunk');
  }

  function grabCheck() {
    if (ball.state !== 'loose' && ball.state !== 'tip') return;
    let best = null, bd = 99;
    for (const p of players) {
      if (p.state === 'down' || p.state === 'dunk' || p.noGrab > 0 || p.stun > 0) continue;
      if (ball.state === 'tip' && p.isJumper) continue;
      const hd = hyp(ball.x - p.x, ball.z - p.z);
      const reach = reachOf(p) + 0.6;
      if (hd < (p.y > 0.3 ? 2.6 : 2.2) && ball.y <= reach && ball.y >= p.y - 0.5 && hd < bd) { bd = hd; best = p; }
    }
    if (best) {
      if (best.team !== ball.lastTeam || ball.reb) match.shot = 24;
      ball.reb = false;
      giveBall(best);
    }
  }

  function updateBall(dt) {
    const b = ball;
    b.trail.unshift([b.x, b.y, b.z]); if (b.trail.length > 8) b.trail.pop();
    if (b.state === 'held') {
      const p = b.holder;
      if (p.state === 'dunk') { b.x = p.x + p.face * 1.1; b.y = p.y + p.h * 1.33 + 0.3; b.z = p.z + 0.2; }
      else if (p.state !== 'run' && p.state !== 'down') { b.x = p.x + p.face * 0.35; b.y = p.y + p.h + 0.9; b.z = p.z + 0.1; }
      else {
        const sp = hyp(p.vx, p.vz);
        b.dribPhase += dt * (6 + sp * 0.25);
        const ph = Math.abs(Math.sin(b.dribPhase));
        const prevY = b.y;
        b.x = p.x + p.face * 1.15; b.z = p.z + 0.3; b.y = 0.45 + ph * 2.6;
        if (prevY > 0.9 && b.y <= 0.9 && Math.abs(p.x - camX) < 40 && Math.random() < 0.7) SFX.dribble();
      }
      return;
    }
    if (b.state === 'shot') {
      const s = b.shot;
      s.t += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= BGRAV * dt; b.y += b.vy * dt;
      // blocks early in the flight
      if (s.t < 0.38 && !s.layup || (s.layup && s.t < 0.25)) {
        for (const o of players) {
          if (o.team === s.team || o.state !== 'air' || s.checked.has(o)) continue;
          const hd = hyp(o.x - b.x, o.z - b.z), hand = reachOf(o) + 0.4;
          if (hd < 2.6 && Math.abs(hand - b.y) < 1.8) {
            s.checked.add(o);
            if (Math.random() < 0.18 + o.r.blk * 0.05) {
              b.state = 'loose'; b.vx = (b.x - o.x >= 0 ? 1 : -1) * rnd(8, 14); b.vy = rnd(2, 6); b.vz = rnd(-6, 6);
              b.lastTeam = o.team; s.shooter.noGrab = 0.4;
              callout(pick(['REJECTED!', 'DENIED!', 'GET THAT OUTTA HERE!', 'SWAT!']), '#7fe0ff', true);
              SFX.block(); shake = 0.2;
              return;
            }
          }
        }
      }
      if (s.t >= s.T) {
        if (s.made) {
          b.x = s.rimX; b.z = RIM_Z; b.y = 9.7; b.vx = b.vz = 0; b.vy = -6; b.state = 'dead';
          netShake[s.rimX < 47 ? 0 : 1] = 0.45;
          SFX.swish();
          if (s.shooter.fire) burst(s.rimX, 10, RIM_Z, 14, ['#ff4a1c', '#ffb02e', '#fff1a0'], 7);
          score(s.shooter, s.three ? 3 : 2, s.layup ? 'layup' : 'jumper');
        } else {
          const nx = b.x - s.rimX, nz = b.z - RIM_Z, L = hyp(nx, nz) || 1;
          const out = rnd(5, 11);
          b.vx = nx / L * out - (s.rimX < 47 ? -1 : 1) * rnd(1, 4);
          b.vz = nz / L * out * 0.8 + rnd(-2, 2);
          b.vy = rnd(7, 13);
          b.state = 'loose'; b.reb = true;
          match.kinds = match.kinds || {}; const mk = 'miss' + (s.layup ? 'L' : s.three ? '3' : '2'); match.kinds[mk] = (match.kinds[mk] || 0) + 1;
          if ((s.rimX < 47 && nx < 0) || (s.rimX > 47 && nx > 0)) SFX.board(); else SFX.rim();
          netShake[s.rimX < 47 ? 0 : 1] = 0.15;
        }
        if (match.clock <= 0) { match.buzzerDone = true; }
      }
      return;
    }
    if (b.state === 'pass') {
      const P = b.pass;
      P.t += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= BGRAV * dt; b.y += b.vy * dt;
      for (const o of players) {
        if (o.team === P.from.team || P.checked.has(o) || o.state === 'down') continue;
        if (hyp(o.x - b.x, o.z - b.z) < 1.7 && b.y < reachOf(o) + 0.5) {
          P.checked.add(o);
          if (Math.random() < 0.22 + o.r.stl * 0.04) {
            giveBall(o); match.shot = 24; callout('INTERCEPTED!', '#7fe0ff'); SFX.steal(); return;
          }
        }
      }
      const to = P.to;
      if (to.state !== 'down' && hyp(to.x - b.x, to.z - b.z) < 2.2 && b.y < reachOf(to) + 0.8) { giveBall(to); return; }
      if (P.t > P.T + 0.35) { b.state = 'loose'; }
      if (b.y < 0.45) { b.y = 0.45; b.vy = Math.abs(b.vy) * 0.5; b.state = 'loose'; }
      return;
    }
    // loose / dead / tip physics
    const px = b.x;
    b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= BGRAV * dt; b.y += b.vy * dt;
    if (b.state === 'dead') {
      // stays under the basket it went through
      b.vx *= 0.9; b.vz *= 0.9;
    }
    for (let i = 0; i < 2; i++) {
      const bx = BOARD_X[i];
      if ((px - bx) * (b.x - bx) < 0 && b.y > 9 && b.y < 13.5 && Math.abs(b.z - RIM_Z) < 3) { b.x = bx + (i === 0 ? 0.05 : -0.05); b.vx *= -0.55; SFX.board(); }
    }
    if (b.y < 0.45) {
      b.y = 0.45;
      if (Math.abs(b.vy) > 2) { if (Math.abs(b.vy) > 4 && Math.abs(b.x - camX) < 40) SFX.bounce(); b.vy = -b.vy * 0.62; }
      else b.vy = 0;
      b.vx *= 0.86; b.vz *= 0.86;
    }
    if (b.x < -7 || b.x > 101) { b.x = clamp(b.x, -7, 101); b.vx *= -0.5; }
    if (b.z < -3 || b.z > 53) { b.z = clamp(b.z, -3, 53); b.vz *= -0.5; }
    if (b.state === 'tip') {
      if (b.vy < 0 && b.y < 11.2) {
        const jumpers = players.filter(p => p.isJumper);
        const cont = jumpers.filter(p => reachOf(p) + 0.8 >= b.y);
        let win = null;
        if (cont.length === 1) win = cont[0];
        else if (cont.length === 2) win = reachOf(cont[0]) + rnd(0, 1.2) > reachOf(cont[1]) + rnd(0, 1.2) ? cont[0] : cont[1];
        else if (b.y < 8.2) win = pick(jumpers);
        if (win) {
          match.tipWinner = win.team;
          match.phase = 'live';
          b.state = 'held'; b.holder = win;
          passBall(win, mateOf(win));
        }
      }
    }
  }

  function separate() {
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (a.state === 'dunk' || b.state === 'dunk') continue;
      const dx = b.x - a.x, dz = (b.z - a.z) * 1.4, L = hyp(dx, dz);
      if (L < 1.7 && L > 0.001) {
        // the ball handler gives way to a set defender (body blocking)
        let wa = 0.5, wb = 0.5;
        if (ball.holder === a && b.team !== a.team) { wa = 0.85; wb = 0.15; }
        else if (ball.holder === b && a.team !== b.team) { wa = 0.15; wb = 0.85; }
        const push = 1.7 - L;
        a.x -= dx / L * push * wa; b.x += dx / L * push * wb; a.z -= dz / L * push * wa * 0.6; b.z += dz / L * push * wb * 0.6;
      }
    }
  }

  function step(dt) {
    time += dt;
    crowdHype = Math.max(0, crowdHype - dt);
    shake = Math.max(0, shake - dt);
    netShake = netShake.map(v => Math.max(0, v - dt));
    for (const c of callouts) c.t += dt;
    callouts = callouts.filter(c => c.t < 1.5);
    for (const q of particles) { q.t += dt; q.x += q.vx * dt; q.z += q.vz * dt; q.vy -= q.g * dt; q.y = Math.max(0, q.y + q.vy * dt); }
    particles = particles.filter(q => q.t < q.life);

    if (screen === 'title') { camX = 47 + Math.sin(time * 0.25) * 22; return; }
    if (screen !== 'play' || paused) return;

    const hIt = readInput();
    for (const p of players) applyIntent(p, p.human ? hIt : aiIntent(p, dt), dt);
    for (const p of players) updatePlayer(p, dt);
    separate();
    updateBall(dt);
    grabCheck();
    if (ball.holder && ball.holder.fire && Math.random() < 0.7) particles.push({ x: ball.x, y: ball.y, z: ball.z, vx: rnd(-1, 1), vy: rnd(2, 5), vz: 0, life: rnd(0.2, 0.45), t: 0, c: pick(['#ff4a1c', '#ffb02e', '#fff1a0']), g: -4 });
    if (ball.state === 'shot' && ball.shot.shooter.fire) particles.push({ x: ball.x, y: ball.y, z: ball.z, vx: rnd(-1, 1), vy: rnd(0, 2), vz: 0, life: 0.35, t: 0, c: pick(['#ff4a1c', '#ffb02e', '#fff1a0']), g: -2 });

    // clocks and phases
    if (match.phase === 'live') {
      match.clock = Math.max(0, match.clock - dt);
      if (ball.state !== 'shot') match.shot -= dt;
      if (match.clock <= 0 && !match.buzzer) {
        match.buzzer = true; SFX.buzzer();
        if (ball.state === 'shot') match.buzzerDone = false; else { match.phase = 'over'; match.phaseT = 1.4; }
      } else if (match.buzzer && ball.state !== 'shot' && match.phase === 'live') { match.phase = 'over'; match.phaseT = 1.4; }
      if (match.phase === 'live' && match.shot <= 0 && ball.state !== 'shot') {
        SFX.whistle(); callout('SHOT CLOCK!', '#ff6a6a');
        const t = 1 - possTeam();
        const tm = players.filter(p => p.team === t);
        const r = tm.reduce((a, b) => (d2(b, ball) < d2(a, ball) ? b : a));
        players.forEach(p => { if (p.state !== 'run') { p.state = 'run'; p.y = 0; p.dunk = null; } });
        giveBall(r); r.inboundT = 0.6; match.shot = 24;
      }
    } else if (match.phase === 'dead') {
      match.phaseT -= dt;
      if (match.clock <= 0 && match.buzzer) { match.phase = 'over'; match.phaseT = 1.4; }
      else if (match.phaseT <= 0) inbound(match.inboundTeam);
    } else if (match.phase === 'over') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) endQuarter();
    }

    // camera
    let tx = ball.x;
    if (ball.holder) tx = ball.holder.x + match.dir[ball.holder.team] * 7;
    if (match.phase === 'tip') tx = 47;
    camX += (tx - camX) * Math.min(1, dt * 3.5);
    const half = (W / 2) / sAt(50);
    camX = clamp(camX, half - 8, 94 - half + 8);
    updateButtonLabels();
  }

  function endQuarter() {
    const q = match.q;
    if (q >= 4 && match.score[0] !== match.score[1]) { screen = 'final'; SFX.crowd(true); }
    else screen = 'qend';
    elControls.classList.remove('on'); elPause.classList.remove('on');
  }

  // ---------- rendering ----------
  function drawFloor() {
    const tex = floor.canvas, ppf = floor.PPF;
    const y0 = Math.floor(FY0 + floor.TZ0 * SL);
    for (let ry = y0; ry < H; ry++) {
      const z = (ry + 0.5 - FY0) / SL;
      if (z > floor.TZ1 - 0.2) break;
      const s = sAt(z);
      const sy = Math.floor((z - floor.TZ0) * ppf);
      const dx = W / 2 + (floor.TX0 - camX) * s;
      ctx.drawImage(tex, 0, sy, tex.width, 1, dx, ry, (floor.TX1 - floor.TX0) * s, 1);
    }
  }
  function drawStands() {
    const st = stands, img = st.frames[crowdHype > 0 && Math.floor(time * 8) % 2 ? 1 : 0];
    const dx = Math.round(W / 2 + (st.SX0 - camX) * st.SS);
    ctx.drawImage(img, dx, 0);
    // hanging scoreboard with the live score
    const sx = Math.round(W / 2 + (47 - camX) * st.SS);
    if (sx > -40 && sx < W + 40) {
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(sx - 14, 0, 1, 30); ctx.fillRect(sx + 13, 0, 1, 30);
      ctx.fillStyle = ART.OUTLINE; ctx.fillRect(sx - 26, 29, 52, 22);
      ctx.fillStyle = '#16161c'; ctx.fillRect(sx - 25, 30, 50, 20);
      const m = Math.floor(match.clock / 60), s = Math.floor(match.clock % 60);
      ART.miniText(ctx, String(match.score[0]).padStart(2, ' '), sx - 23, 33, '#ff3b2f');
      ART.miniText(ctx, String(match.score[1]).padStart(2, ' '), sx + 16, 33, '#ff3b2f');
      ART.miniText(ctx, m + ':' + String(s).padStart(2, '0'), sx - 8, 33, '#ffcc33');
      ART.miniText(ctx, String(match.q > 4 ? 0 : match.q), sx - 1, 42, '#4cff6a');
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(sx - 23, 40, 8, 1); ctx.fillRect(sx + 15, 40, 8, 1);
    }
  }
  function drawBasketFrame(i) {
    const bx = BOARD_X[i], dirIn = i === 0 ? 1 : -1;
    const [tx, ty, s] = proj(bx, 13.5, RIM_Z);
    if (tx < -60 || tx > W + 60) return;
    const back = proj(bx - dirIn * 3, 13.5, RIM_Z);
    ctx.strokeStyle = '#6f6c78'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty); ctx.lineTo(tx - 4, 0); ctx.moveTo(tx + 4, ty); ctx.lineTo(tx + 4, 0);
    ctx.moveTo(back[0], back[1] - 6); ctx.lineTo(back[0], 0);
    ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#8e8b96';
    ctx.beginPath();
    for (let y = ty; y > 0; y -= 18) { ctx.moveTo(tx - 4, y); ctx.lineTo(tx + 4, y - 18); ctx.moveTo(tx + 4, y); ctx.lineTo(tx - 4, y - 18); }
    ctx.moveTo(tx, ty - 4); ctx.lineTo(back[0], back[1] - 6);
    ctx.stroke();
  }
  function drawBasket(i, front) {
    const bx = BOARD_X[i], rx = RIMX[i], dirIn = i === 0 ? 1 : -1;
    const [cx, cy, s] = proj(bx, 9, RIM_Z);
    if (cx < -80 || cx > W + 80) return;
    const bw = 3.0 * s, bh = 3.5 * s;
    const skew = (bx - camX) * 0.02 * s;
    if (!front) {
      // glass backboard, slightly turned toward the camera
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.moveTo(-bw / 2 + skew, -bh); ctx.lineTo(bw / 2 + skew, -bh); ctx.lineTo(bw / 2, 0); ctx.lineTo(-bw / 2, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(210,235,255,0.35)'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#e0452a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-bw * 0.2 + skew * 0.4, -bh * 0.55, bw * 0.4, bh * 0.4);
      ctx.restore();
    }
    const [rcx, rcy, rs] = proj(rx, RIM_Y, RIM_Z);
    const rw = 1.5 * rs, rh = 0.55 * rs;
    const sh = netShake[i] > 0 ? Math.sin(time * 60) * netShake[i] * 3 : 0;
    // net
    if (front) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      const nb = 1.5 * rs;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(rcx + k * rw / 5, rcy + rh / 3);
        ctx.lineTo(rcx + k * rw / 8 + sh * 0.5, rcy + nb + sh);
      }
      for (let r = 1; r <= 3; r++) {
        const yy = rcy + nb * r / 3.3 + sh * r / 3, ww = rw / 2 * (1 - r * 0.14);
        ctx.moveTo(rcx - ww, yy); ctx.lineTo(rcx + ww, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = '#f06a1c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(rcx, rcy, rw / 2, rh / 2, 0, 0, Math.PI); ctx.stroke();
    } else {
      ctx.strokeStyle = '#b8481a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(rcx, rcy, rw / 2, rh / 2, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#9a9aa4'; ctx.fillRect(Math.min(cx, rcx - dirIn * rw / 2), rcy - 1, Math.abs(rcx - dirIn * rw / 2 - cx), 2);
    }
  }

  function frameFor(p) {
    if (p.state === 'dunk') return 'dunk';
    if (p.state === 'hang') return 'block';
    if (p.state === 'shoot' || p.state === 'layup') return 'jump';
    if (p.state === 'air') return 'block';
    if (p.state === 'down') return 'stand';
    if (p.stealT > 0) return 'steal';
    const hasBall = ball.holder === p;
    const sp = hyp(p.vx, p.vz);
    if (sp > 1.5) return 'r' + (Math.floor(p.anim) % 4) + (hasBall ? 'D' : '');
    if (hasBall) return 'standD';
    const h = ball.holder;
    if (h && h.team !== p.team && d2(h, p) < 9) return 'defend';
    return 'stand';
  }

  function drawPlayer(p) {
    const [sx, sy, s] = proj(p.x, p.y, p.z);
    if (sx < -60 || sx > W + 60) return;
    const k = s * p.h / 50;
    const img = p.spr[p.face < 0 ? 'L' : 'R'][frameFor(p)];
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (p.state === 'down') {
      ctx.translate(0, -2 * k);
      ctx.rotate(-p.face * Math.PI / 2 * Math.min(1, p.t * 5));
    }
    if (p.spin) { ctx.translate(0, -30 * k); ctx.rotate(p.spin * p.face); ctx.translate(0, 30 * k); }
    ctx.scale(k, k);
    ctx.drawImage(img, -14, -60);
    ctx.restore();
    if (p.fire && Math.random() < 0.5) particles.push({ x: p.x + rnd(-0.6, 0.6), y: p.y + rnd(0, p.h), z: p.z, vx: 0, vy: rnd(2, 5), vz: 0, life: 0.3, t: 0, c: pick(['#ff4a1c', '#ffb02e']), g: -3 });
    if (p.human) {
      const hy = sy - (p.h * 1.12) * s - 10;
      const col = TEAMS[p.team].primary;
      ctx.fillStyle = ART.OUTLINE; ctx.beginPath(); ctx.moveTo(sx - 5, hy - 1); ctx.lineTo(sx + 5, hy - 1); ctx.lineTo(sx, hy + 6); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(sx - 3, hy); ctx.lineTo(sx + 3, hy); ctx.lineTo(sx, hy + 4); ctx.fill();
      FONT.draw(ctx, 'P1', sx, hy - 9, { align: 'center', color: '#fff', outline: col });
    }
  }
  function drawShadow(x, z, w, a = 0.33) {
    const [sx, sy, s] = proj(x, 0, z);
    ctx.fillStyle = `rgba(30,15,5,${a})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, w * s / 2, w * s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawBall() {
    const [sx, sy, s] = proj(ball.x, ball.y, ball.z);
    const img = ART.ball(0.42 * s);
    ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2));
  }

  function drawWorld() {
    ctx.fillStyle = '#121016'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(Math.round(rnd(-2, 2)), Math.round(rnd(-2, 2)));
    drawStands();
    drawFloor();
    drawBasketFrame(0); drawBasketFrame(1);
    if (screen !== 'title' && players.length) {
      for (const p of players) drawShadow(p.x, p.z, 2.4, p.y > 0 ? 0.22 : 0.33);
      if (ball.state !== 'held' || ball.holder.state === 'run') drawShadow(ball.x, ball.z, 1.0, 0.28);
    }
    const objs = [];
    objs.push({ z: RIM_Z - 0.01, f: () => drawBasket(0, false) }, { z: RIM_Z - 0.01, f: () => drawBasket(1, false) });
    if (screen !== 'title') {
      for (const p of players) objs.push({ z: p.z, f: () => drawPlayer(p) });
      objs.push({ z: ball.z + (ball.holder ? 0.4 : 0), f: drawBall });
    }
    objs.sort((a, b) => a.z - b.z);
    for (const o of objs) o.f();
    drawBasket(0, true); drawBasket(1, true);
    for (const q of particles) {
      const [sx, sy, s] = proj(q.x, q.y, q.z);
      ctx.globalAlpha = 1 - q.t / q.life;
      ctx.fillStyle = q.c; const sz = Math.max(1, Math.round(s * 0.3)); ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(10,6,18,0.82)'; ctx.fillRect(0, 0, W, 27);
    ctx.fillStyle = '#5b2d8e'; ctx.fillRect(0, 27, W, 1);
    for (let t = 0; t < 2; t++) {
      const T = TEAMS[t], right = t === 1;
      const x0 = right ? W - 4 : 4;
      FONT.draw(ctx, T.full + (t === match.human ? ' (P1)' : ''), x0, 3, { align: right ? 'right' : 'left', color: T.primary === '#1f4fb8' ? '#8fb4ff' : '#ff8a8a' });
      FONT.draw(ctx, String(match.score[t]), right ? W - 4 : 4, 12, { scale: 2, align: right ? 'right' : 'left', color: '#ffffff', shadow: '#000' });
      const tm = players.filter(p => p.team === t);
      tm.forEach((p, i) => {
        const nx = right ? W - 42 - i * 60 - 52 : 42 + i * 60;
        FONT.draw(ctx, p.d.name.slice(0, 8), nx, 12, { color: p.fire ? '#ff9a3c' : '#e8e8f0' });
        ctx.fillStyle = '#333'; ctx.fillRect(nx, 21, 50, 3);
        ctx.fillStyle = p.fire ? '#ff4a1c' : p.turbo > 30 ? '#f7c531' : '#d04030';
        ctx.fillRect(nx, 21, Math.round(50 * p.turbo / 100), 3);
      });
    }
    const m = Math.floor(Math.ceil(match.clock) / 60), s = Math.ceil(match.clock) % 60;
    FONT.draw(ctx, m + ':' + String(s).padStart(2, '0'), W / 2, 3, { scale: 2, align: 'center', color: '#ffcc33', shadow: '#000' });
    const qn = match.q > 4 ? 'OT' : ['', '1ST', '2ND', '3RD', '4TH'][match.q];
    const sc = Math.max(0, Math.ceil(match.shot));
    FONT.draw(ctx, qn + '  :' + String(sc).padStart(2, '0'), W / 2, 19, { align: 'center', color: sc <= 5 ? '#ff6a6a' : '#cfcfe0' });
  }

  function drawCallouts() {
    callouts.forEach((c, i) => {
      if (c.t > 1.2 && Math.floor(c.t * 12) % 2) return;
      const sc = c.big ? (c.t < 0.08 ? 4 : 3) : 2;
      const y = 62 + i * 26 - (c.t < 0.1 ? 4 : 0);
      FONT.draw(ctx, c.text, W / 2, y, { scale: sc, align: 'center', color: c.color, outline: '#1a0a2a', shadow: '#000' });
    });
  }

  // ---------- UI helpers ----------
  function button(x, y, w, h, label, onTap, opt = {}) {
    const on = opt.enabled !== false;
    ctx.fillStyle = ART.OUTLINE; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = on ? (opt.color || '#5b2d8e') : '#444'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y + h - 2, w, 2);
    FONT.draw(ctx, label, x + w / 2, y + h / 2 - (opt.scale || 1) * 3.5, { align: 'center', scale: opt.scale || 1, color: on ? '#fff' : '#888', shadow: '#000' });
    if (on) ui.push({ x, y, w, h, onTap });
  }
  function uiTap(cx, cy) {
    const r = cv.getBoundingClientRect();
    const x = (cx - r.left) / r.width * W, y = (cy - r.top) / r.height * H;
    for (let i = ui.length - 1; i >= 0; i--) {
      const b = ui[i];
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) { SFX.select(); b.onTap(); return; }
    }
  }
  function dim(a = 0.6) { ctx.fillStyle = `rgba(8,4,16,${a})`; ctx.fillRect(0, 0, W, H); }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;

  function drawLogo(cx, y) {
    const draw = (txt, yy, sc, col) => FONT.draw(ctx, txt, cx, yy, { scale: sc, align: 'center', color: col, outline: '#2a0f4a', shadow: '#000' });
    draw('HOOSIER', y, 6, '#f7c531');
    ctx.save();
    const jy = y + 46;
    draw('JAM', jy, 9, '#ff5a1f');
    ctx.globalAlpha = 0.35; FONT.draw(ctx, 'JAM', cx, jy, { scale: 9, align: 'center', color: '#fff1a0' }); ctx.globalAlpha = 1;
    FONT.draw(ctx, 'JAM', cx, jy + 4, { scale: 9, align: 'center', color: '#ff5a1f' });
    ctx.restore();
    const bimg = ART.ball(9);
    ctx.drawImage(bimg, cx + 88, jy + 18);
  }

  function renderTitle() {
    drawWorld();
    dim(0.45);
    drawLogo(W / 2, 26);
    FONT.draw(ctx, 'THE MUNCIE SECTIONAL', W / 2, 150, { scale: 2, align: 'center', color: '#ffffff', shadow: '#2a0f4a' });
    FONT.draw(ctx, 'LIVE FROM THE FIELDHOUSE', W / 2, 168, { align: 'center', color: '#c9b3ff', shadow: '#000' });
    if (Math.floor(time * 2) % 2 === 0) FONT.draw(ctx, 'TAP TO START', W / 2, 196, { scale: 2, align: 'center', color: '#f7c531', outline: '#000' });
    if (isIOS && !standalone()) {
      FONT.draw(ctx, 'FOR FULL SCREEN: TAP SHARE, THEN ADD TO HOME SCREEN', W / 2, 238, { align: 'center', color: '#ffffff', shadow: '#000' });
      FONT.draw(ctx, 'AND OPEN HOOSIER JAM FROM YOUR HOME SCREEN', W / 2, 249, { align: 'center', color: '#ffffff', shadow: '#000' });
    }
    ui.push({ x: 0, y: 0, w: W, h: H, onTap: () => { goFullscreen(); screen = 'team'; } });
    button(W - 78, 6, 72, 16, SFX.isMuted() ? 'SOUND OFF' : 'SOUND ON', () => SFX.setMuted(!SFX.isMuted()), { color: '#333' });
  }

  function renderTeam() {
    drawWorld(); dim(0.7);
    FONT.draw(ctx, 'CHOOSE YOUR TEAM', W / 2, 14, { scale: 2, align: 'center', color: '#f7c531', outline: '#000' });
    const cw = Math.min(230, W / 2 - 24);
    TEAMS.forEach((T, i) => {
      const x = i === 0 ? W / 2 - cw - 10 : W / 2 + 10, y = 42, h = 190;
      ctx.fillStyle = ART.OUTLINE; ctx.fillRect(x - 3, y - 3, cw + 6, h + 6);
      ctx.fillStyle = T.primary; ctx.fillRect(x, y, cw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + 34, cw, h - 34);
      ctx.fillStyle = T.secondary; ctx.fillRect(x, y + 32, cw, 3);
      FONT.draw(ctx, T.full, x + cw / 2, y + 10, { scale: 2, align: 'center', color: '#fff', shadow: '#000' });
      T.players.forEach((pd, j) => {
        const img = sprites[i][j][i === 0 ? 'R' : 'L'].stand, sc = 1.35, px = x + cw / 2 + (j - 1) * 64;
        ctx.save(); ctx.translate(px, y + 138); ctx.scale(sc, sc); ctx.drawImage(img, -14, -60); ctx.restore();
        FONT.draw(ctx, pd.name, px, y + 146, { align: 'center', color: '#fff', shadow: '#000' });
      });
      FONT.draw(ctx, 'TAP TO PICK', x + cw / 2, y + h - 18, { align: 'center', color: '#f7c531', shadow: '#000' });
      ui.push({ x, y, w: cw, h, onTap: () => { match.human = i; pickSel = []; match.pickMode = 'pre'; screen = 'pick'; } });
    });
    button(8, 8, 50, 16, 'BACK', () => { screen = 'title'; }, { color: '#333' });
  }

  const RLAB = [['spd', 'SPEED'], ['sht', '2 PT'], ['thr', '3 PT'], ['dnk', 'DUNKS'], ['blk', 'BLOCKS'], ['stl', 'STEALS']];
  function feet(h) { const inches = Math.round(h * 12); return Math.floor(inches / 12) + "'" + (inches % 12) + '"'; }
  function renderPick() {
    drawWorld(); dim(0.75);
    const T = TEAMS[match.human];
    const half = match.pickMode === 'half';
    FONT.draw(ctx, half ? 'HALFTIME: PICK YOUR 2' : 'PICK YOUR 2 PLAYERS', W / 2, 8, { scale: 2, align: 'center', color: '#f7c531', outline: '#000' });
    FONT.draw(ctx, 'FIRST PICK IS YOU. SECOND PICK IS YOUR CPU TEAMMATE.', W / 2, 26, { align: 'center', color: '#cfcfe0' });
    const cw = Math.min(160, (W - 40) / 3), gap = 8, tot = cw * 3 + gap * 2, x0 = (W - tot) / 2;
    T.players.forEach((pd, j) => {
      const x = x0 + j * (cw + gap), y = 40, h = 182;
      const si = pickSel.indexOf(j);
      ctx.fillStyle = si >= 0 ? '#f7c531' : ART.OUTLINE; ctx.fillRect(x - 3, y - 3, cw + 6, h + 6);
      ctx.fillStyle = '#1d1430'; ctx.fillRect(x, y, cw, h);
      ctx.fillStyle = T.primary; ctx.fillRect(x, y, cw, 4);
      const img = sprites[match.human][j].R.stand;
      ctx.save(); ctx.translate(x + 26, y + 84); ctx.scale(1.25, 1.25); ctx.drawImage(img, -14, -60); ctx.restore();
      FONT.draw(ctx, '"' + pd.nick + '"', x + 52, y + 10, { color: '#f7c531' });
      FONT.draw(ctx, pd.name, x + 52, y + 20, { scale: 1, color: '#fff' });
      FONT.draw(ctx, '#' + pd.num + '  ' + feet(pd.h), x + 52, y + 31, { color: '#cfcfe0' });
      if (si >= 0) {
        const tag = si === 0 ? 'YOU' : 'TEAMMATE';
        ctx.fillStyle = si === 0 ? '#d8342c' : '#2a62c9'; ctx.fillRect(x + 52, y + 44, FONT.width(tag) + 6, 11);
        FONT.draw(ctx, tag, x + 55, y + 46, { color: '#fff' });
      }
      RLAB.forEach(([k, lab], r) => {
        const ry = y + 96 + r * 13;
        FONT.draw(ctx, lab, x + 6, ry, { color: '#cfcfe0' });
        const bw = cw - 58;
        for (let n = 0; n < 10; n++) {
          ctx.fillStyle = n < pd.r[k] ? (pd.r[k] >= 8 ? '#4cff6a' : pd.r[k] >= 5 ? '#f7c531' : '#ff6a4a') : '#3a3050';
          ctx.fillRect(x + 50 + n * (bw / 10), ry, bw / 10 - 1, 7);
        }
      });
      ui.push({ x, y, w: cw, h, onTap: () => {
        const i = pickSel.indexOf(j);
        if (i >= 0) pickSel.splice(i, 1); else if (pickSel.length < 2) pickSel.push(j); else { pickSel[1] = j; }
      } });
    });
    const ready = pickSel.length === 2;
    button(W / 2 - 60, H - 38, 120, 24, half ? 'START 3RD QTR' : 'TIP OFF!', () => {
      match.picks[match.human] = pickSel.slice();
      const cpu = 1 - match.human;
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      match.picks[cpu] = order.slice(0, 2);
      if (half) { setupPlayers(); startQuarter(); screen = 'play'; }
      else startGame();
      elControls.classList.add('on'); elPause.classList.add('on');
    }, { enabled: ready, color: '#d8342c', scale: 1 });
    if (!half) button(8, H - 34, 50, 18, 'BACK', () => { screen = 'team'; }, { color: '#333' });
  }

  function statsBlock(y) {
    for (let t = 0; t < 2; t++) {
      const T = TEAMS[t], x = t === 0 ? W / 2 - 150 : W / 2 + 20;
      FONT.draw(ctx, T.full, x, y, { color: T.primary === '#1f4fb8' ? '#8fb4ff' : '#ff8a8a' });
      T.players.forEach((pd, j) => {
        FONT.draw(ctx, pd.name, x, y + 14 + j * 11, { color: '#e8e8f0' });
        FONT.draw(ctx, match.stats[t][j] + ' PTS', x + 120, y + 14 + j * 11, { align: 'right', color: '#f7c531' });
      });
    }
  }
  function renderQEnd() {
    drawWorld(); dim(0.72);
    const q = match.q;
    const title = q === 2 ? 'HALFTIME' : q >= 4 ? 'END OF REGULATION' : 'END OF ' + ['', '1ST', '2ND', '3RD'][q] + ' QUARTER';
    FONT.draw(ctx, q > 4 ? 'END OF OVERTIME' : title, W / 2, 24, { scale: 2, align: 'center', color: '#f7c531', outline: '#000' });
    FONT.draw(ctx, TEAMS[0].name + ' ' + match.score[0] + '   ' + TEAMS[1].name + ' ' + match.score[1], W / 2, 54, { scale: 2, align: 'center', color: '#fff', shadow: '#000' });
    if (q >= 4) FONT.draw(ctx, 'TIED UP! WE ARE GOING TO OVERTIME', W / 2, 76, { align: 'center', color: '#ff9a3c' });
    statsBlock(100);
    if (Math.floor(time * 2) % 2 === 0) FONT.draw(ctx, q === 2 ? 'TAP TO MAKE HALFTIME SUBS' : 'TAP TO CONTINUE', W / 2, H - 30, { scale: 2, align: 'center', color: '#f7c531', outline: '#000' });
    ui.push({ x: 0, y: 0, w: W, h: H, onTap: () => {
      if (q === 2) { match.pickMode = 'half'; pickSel = match.picks[match.human].slice(); screen = 'pick'; return; }
      startQuarter(); screen = 'play'; elControls.classList.add('on'); elPause.classList.add('on');
    } });
  }
  function renderFinal() {
    drawWorld(); dim(0.72);
    const w = match.score[0] > match.score[1] ? 0 : 1;
    FONT.draw(ctx, 'FINAL', W / 2, 14, { scale: 3, align: 'center', color: '#f7c531', outline: '#000' });
    FONT.draw(ctx, TEAMS[0].name + ' ' + match.score[0] + '   ' + TEAMS[1].name + ' ' + match.score[1], W / 2, 46, { scale: 2, align: 'center', color: '#fff', shadow: '#000' });
    FONT.draw(ctx, TEAMS[w].full + ' WIN!', W / 2, 68, { scale: 2, align: 'center', color: w === match.human ? '#4cff6a' : '#ff6a6a', shadow: '#000' });
    statsBlock(96);
    button(W / 2 - 130, H - 42, 120, 24, 'REMATCH', () => { pickSel = []; match.pickMode = 'pre'; screen = 'pick'; }, { color: '#d8342c' });
    button(W / 2 + 10, H - 42, 120, 24, 'NEW GAME', () => { screen = 'title'; }, { color: '#5b2d8e' });
  }
  function renderPause() {
    dim(0.6);
    FONT.draw(ctx, 'PAUSED', W / 2, 50, { scale: 3, align: 'center', color: '#f7c531', outline: '#000' });
    button(W / 2 - 70, 100, 140, 24, 'RESUME', () => { paused = false; }, { color: '#d8342c' });
    button(W / 2 - 70, 134, 140, 24, SFX.isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => SFX.setMuted(!SFX.isMuted()), { color: '#333' });
    button(W / 2 - 70, 168, 140, 24, 'QUIT GAME', () => { paused = false; screen = 'title'; elControls.classList.remove('on'); elPause.classList.remove('on'); }, { color: '#5b2d8e' });
    FONT.draw(ctx, 'LEFT THUMB: MOVE   RIGHT THUMB: SHOOT, PASS, TURBO', W / 2, 210, { align: 'center', color: '#cfcfe0' });
    FONT.draw(ctx, 'HOLD TURBO + SHOOT NEAR THE RIM TO DUNK. SLIDE FROM TURBO ONTO SHOOT.', W / 2, 222, { align: 'center', color: '#cfcfe0' });
    FONT.draw(ctx, 'ON DEFENSE: STEAL, JUMP TO BLOCK, TURBO + STEAL TO SHOVE.', W / 2, 234, { align: 'center', color: '#cfcfe0' });
    FONT.draw(ctx, 'RELEASE SHOOT AT THE TOP OF YOUR JUMP FOR BEST ACCURACY.', W / 2, 246, { align: 'center', color: '#cfcfe0' });
  }

  function render() {
    ui = [];
    ctx.imageSmoothingEnabled = false;
    if (screen === 'title') return renderTitle();
    if (screen === 'team') return renderTeam();
    if (screen === 'pick') return renderPick();
    if (screen === 'qend') return renderQEnd();
    if (screen === 'final') return renderFinal();
    elControls.classList.toggle('on', !paused);
    drawWorld();
    drawHUD();
    drawCallouts();
    if (paused) renderPause();
  }

  // ---------- fullscreen + sizing ----------
  function goFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { window.screen.orientation && window.screen.orientation.lock && window.screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
      else if (el.webkitRequestFullscreen && !isIOS) el.webkitRequestFullscreen();
    } catch (e) {}
  }
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    W = Math.round(clamp(H * vw / vh, 420, 640));
    cv.width = W; cv.height = H;
    let cw = vw, ch = vw * H / W;
    if (ch > vh) { ch = vh; cw = vh * W / H; }
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.style.left = (vw - cw) / 2 + 'px'; cv.style.top = (vh - ch) / 2 + 'px';
    placeStick(...defaultStickPos());
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  elBtn.shoot.style.cssText = 'right: calc(20px + env(safe-area-inset-right)); bottom: calc(24px + env(safe-area-inset-bottom));';
  elBtn.pass.style.cssText = 'right: calc(128px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom));';
  elBtn.turbo.style.cssText = 'right: calc(58px + env(safe-area-inset-right)); bottom: calc(126px + env(safe-area-inset-bottom));';

  // ---------- main loop ----------
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt * (window.HJ_SPEED || 1);
    let n = 0;
    while (acc >= STEP && n < 12) { step(STEP); acc -= STEP; n++; }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') paused = true; });

  if (AUTO) {
    match.human = 0; match.picks = [[0, 1], [1, 2]];
    startGame(); elControls.classList.add('on'); elPause.classList.add('on');
  }
  window.HJ = { match, ball, get players() { return players; }, get screen() { return screen; }, set screen(v) { screen = v; }, startQuarter, step, setupPlayers, startGame, get paused() { return paused; }, set paused(v) { paused = v; } };
})();
