// Hoosier Jam: game engine, AI, rendering, screens and touch controls
'use strict';
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const H = 300;
  let W = 640;

  // ---------- court + projection (side view from the near sideline) ----------
  const CL = ARENA.CL, MID = ARENA.MID;
  const S0 = 12, SK = 0.08, FY0 = 124, SL = 3.3;
  const sAt = z => S0 + z * SK;
  let camX = MID, camY = 0, shake = 0;
  const proj = (x, y, z) => { const s = sAt(z); return [W / 2 + (x - camX) * s, FY0 + z * SL - y * s, s]; };
  const RIMX = [5.25, CL - 5.25], RIM_Y = 10, RIM_Z = 25, BOARD_X = [4, CL - 4];
  const GRAV = 62, BGRAV = 42;
  const QTR_LEN = 180, OT_LEN = 60;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hyp = Math.hypot;
  const d2 = (a, b) => hyp(a.x - b.x, a.z - b.z);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const params = new URLSearchParams(location.search);
  const AUTO = params.has('auto');

  // ---------- assets ----------
  // built once the arcade font has loaded (the floor lettering and banners use it)
  let floor = null, stands = null;
  const STAND_H = Math.round(FY0 - 4 * SL);
  function buildArena() { floor = ARENA.buildFloor(); stands = ARENA.buildStands(sAt(-4), STAND_H, TEAMS[0], TEAMS[1]); }
  const lookFor = (t, p) => ({ jersey: t.jersey, trim: t.trim, shorts: t.shorts, numColor: t.numColor, num: p.num,
    skin: p.skin, hair: p.hair, hairColor: p.hairColor, stache: p.stache, headband: p.headband });
  let looks = TEAMS.map(t => t.players.map(p => lookFor(t, p)));
  // your school wears home whites (TEAMS[0]); the CPU wears its road colors (TEAMS[1]); the crowd takes both sides' colors
  function setMatchup(mine, opp) {
    TEAMS[0] = makeTeam(SCHOOLS[mine], true); TEAMS[1] = makeTeam(SCHOOLS[opp], false);
    looks = TEAMS.map(t => t.players.map(p => lookFor(t, p)));
    if (floor) stands = ARENA.buildStands(sAt(-4), STAND_H, TEAMS[0], TEAMS[1]);
  }

  // ---------- state ----------
  let screen = 'title';     // title, team, pick, play, qend, final
  let paused = false;
  let ui = [];
  let time = 0;
  const match = {
    human: 0, q: 1, clock: QTR_LEN, shot: 24, score: [0, 0], dir: [1, -1], phase: 'tip', phaseT: 0,
    picks: [[0, 1], [0, 1]], tipWinner: 0, stats: null, qs: [[], []], buzzer: false, pickMode: 'pre', kinds: {}
  };
  let players = [];
  const ball = { x: MID, y: 3, z: 25, vx: 0, vy: 0, vz: 0, state: 'loose', holder: null, lastTeam: 0, shot: null, pass: null, dribPhase: 0 };
  let callouts = [], particles = [], crowdHype = 0, netShake = [0, 0];
  let pickSel = [];
  const newStats = () => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });
  const resetStats = () => { match.stats = [0, 1].map(() => [0, 1, 2].map(newStats)); match.qs = [[], []]; };
  resetStats();
  const st = p => match.stats[p.team][p.ri];

  // ---------- players ----------
  function makePlayer(team, slot, ri, human) {
    const d = TEAMS[team].players[ri];
    return {
      team, slot, ri, d, r: d.r, h: d.h, look: looks[team][ri], human,
      x: MID, z: 25, y: 0, vx: 0, vz: 0, vy: 0, face: 1, state: 'run', t: 0, turbo: 100, usingTurbo: false,
      anim: 0, stealT: 0, stealCd: 0, jumpCd: 0, noGrab: 0, inboundT: 0, fire: false, streak: 0, stun: 0, celebT: 0,
      dunk: null, spin: 0, queuedRelease: false,
      ai: { think: 0, laneZ: rnd(-6, 6), spotX: d.r.thr >= 6 ? rnd(20.5, 22) : rnd(11, 15), spotZ: 0, cutT: rnd(2.5, 5), cutting: 0, jumpAt: -1, relVy: 0, forceShoot: false, wantPass: false, plan: 'drive', hadBall: false, pullAng: 0 }
    };
  }
  const mateOf = p => players.find(o => o !== p && o.team === p.team);
  const oppsOf = p => players.filter(o => o.team !== p.team);
  const attackRim = team => match.dir[team] > 0 ? RIMX[1] : RIMX[0];
  const defRim = team => attackRim(1 - team);
  const possTeam = () => ball.holder ? ball.holder.team : ball.lastTeam;
  const humanP = () => players.find(p => p.human);
  const speedOf = p => 16 + p.r.spd * 0.9;
  const reachOf = p => p.y + p.h * 1.33;
  const onGround = p => p.state === 'run';
  const isCPUteam = t => AUTO ? false : t !== match.human;

  function setupPlayers() {
    players = [];
    for (let t = 0; t < 2; t++) match.picks[t].forEach((ri, slot) => players.push(makePlayer(t, slot, ri, !AUTO && t === match.human && slot === 0)));
  }

  // difficulty: the CPU eases off when it is ahead, like the arcade did
  function shotMod(team) {
    if (AUTO) return 1;
    const lead = match.score[team] - match.score[1 - team];
    if (isCPUteam(team)) return 0.86 - clamp(lead * 0.014, -0.06, 0.24);
    return 1.05 + clamp(-lead * 0.01, 0, 0.12);
  }

  // ---------- fx ----------
  function callout(text, fill = 'gold', big = false) { callouts.push({ text, fill, t: 0, big }); if (callouts.length > 2) callouts.shift(); }
  function burst(x, y, z, n, colors, spd = 8) {
    for (let i = 0; i < n; i++) particles.push({ x, y, z, vx: rnd(-spd, spd), vy: rnd(0, spd * 1.4), vz: rnd(-spd, spd) * 0.4, life: rnd(0.4, 0.9), t: 0, c: pick(colors), g: 24 });
  }

  // ---------- possession ----------
  function giveBall(p) { ball.holder = p; ball.state = 'held'; ball.shot = null; ball.pass = null; ball.lastTeam = p.team; p.noGrab = 0; p.astFrom = null; p.pickedUp = false; }
  function setupPossession(team) {
    const dirO = match.dir[team];
    const off = players.filter(p => p.team === team), def = players.filter(p => p.team !== team);
    const ownBase = dirO > 0 ? 0 : CL;
    off[0].x = ownBase + dirO * 8; off[0].z = 25;
    off[1].x = ownBase + dirO * 18; off[1].z = 10;
    def[0].x = MID - dirO * 2; def[0].z = 28;
    def[1].x = MID + dirO * 4; def[1].z = 14;
    players.forEach(p => { p.y = 0; p.vx = p.vz = p.vy = 0; p.state = 'run'; p.face = match.dir[p.team]; p.turbo = 100; p.dunk = null; });
    giveBall(off[0]);
    ball.x = off[0].x; ball.z = off[0].z; ball.y = 3;
    match.shot = 24;
    camX = off[0].x + dirO * 10;
  }
  function startGame() {
    match.q = 1; match.score = [0, 0]; resetStats(); match.kinds = {};
    match.dir = [1, -1]; match.buzzer = false;
    setupPlayers();
    callouts = []; particles = [];
    startTip();
    screen = 'play';
  }
  function startTip() {
    match.phase = 'tip'; match.phaseT = 0; match.clock = match.q <= 4 ? QTR_LEN : OT_LEN; match.shot = 24; match.buzzer = false;
    for (let t = 0; t < 2; t++) {
      const team = players.filter(p => p.team === t);
      const j = team.find(p => p.human) || team.reduce((a, b) => (b.h > a.h ? b : a));
      const mate = mateOf(j), dirT = match.dir[t];
      j.x = MID - dirT * 1.4; j.z = 25; j.face = dirT;
      mate.x = MID - dirT * 8; mate.z = t === 0 ? 13 : 37; mate.face = dirT;
      j.isJumper = true; mate.isJumper = false;
    }
    players.forEach(p => { p.y = 0; p.vx = p.vz = p.vy = 0; p.state = 'run'; p.turbo = 100; p.ai.jumpAt = -1; p.dunk = null; });
    ball.holder = null; ball.state = 'tip'; ball.x = MID; ball.z = 25; ball.y = 7; ball.vx = ball.vz = 0; ball.vy = 18;
    camX = MID;
    callout(match.q > 4 ? 'OVERTIME!' : 'TIP OFF!', 'white');
    SFX.whistle();
  }
  function startQuarter() {
    match.q++;
    match.dir = (match.q === 3 || match.q === 4) ? [-1, 1] : [1, -1];
    match.clock = match.q <= 4 ? QTR_LEN : OT_LEN;
    match.buzzer = false;
    players.forEach(p => { p.fire = false; p.streak = 0; });
    if (match.q > 4) { startTip(); return; }
    setupPossession(match.q === 4 ? match.tipWinner : 1 - match.tipWinner);
    match.phase = 'live';
    callout(['', '1ST QUARTER', '2ND QUARTER', '3RD QUARTER', '4TH QUARTER'][match.q], 'white');
    SFX.whistle();
  }

  // ---------- actions ----------
  function passBall(from, to) {
    if (!to) return;
    const tx = to.x + to.vx * 0.18, tz = to.z + to.vz * 0.18;
    const dist = hyp(tx - ball.x, tz - ball.z);
    const T = Math.max(0.12, dist / 58);
    ball.holder = null; ball.state = 'pass';
    ball.vx = (tx - ball.x) / T; ball.vz = (tz - ball.z) / T;
    ball.vy = (4.8 - ball.y + 0.5 * BGRAV * T * T) / T;
    ball.pass = { from, to, t: 0, T, checked: new Set() };
    ball.lastTeam = from.team;
    from.noGrab = 0.22;
    from.face = Math.sign(tx - from.x) || from.face;
    SFX.pass();
  }
  const dunkRange = p => 5 + p.r.dnk * 0.95;
  const GATHER = 0.16; // let go of SHOOT sooner than this for a pump fake

  // Pump fake: ball up to the chin and back with no jump. Nearby CPU defenders may bite and leave their feet.
  function pumpFake(p) {
    p.fakeT = 0.36; p.pickedUp = true; // dribble is dead now: pass or shoot
    p.face = Math.sign(attackRim(p.team) - p.x) || p.face;
    let bit = false;
    for (const o of oppsOf(p)) {
      if (!onGround(o) || o.human || o.stun > 0) continue;
      const dd = d2(o, p);
      if (dd > 7) continue;
      const chance = clamp(0.62 - o.r.blk * 0.03 - (dd > 4.5 ? 0.15 : 0), 0.2, 0.6);
      if (Math.random() < chance) {
        o.ai.jumpAt = -1; o.jumpCd = 0;
        jump(o); o.bitFake = true; bit = true;
      }
    }
    if (bit) callout(pick(['FAKED HIM OUT!', 'UP FAKE!', 'BIT ON THE FAKE!']), 'ice');
  }

  function startShot(p, turbo) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    const d = hyp(p.x - rimX, p.z - RIM_Z);
    const inFront = (rimX - p.x) * dirT > -1.5;
    if ((turbo || p.fire) && d <= dunkRange(p) && d > 2.5 && inFront && (p.turbo > 5 || p.fire)) return startDunk(p, d);
    if (d < 7.5) return startLayup(p);
    p.state = 'shoot'; p.t = 0; p.vy = 17 + p.r.dnk * 0.15; p.vx *= 0.1; p.vz *= 0.1; p.queuedRelease = false;
    p.face = Math.sign(rimX - p.x) || p.face;
    if (!p.human) p.ai.relVy = Math.random() < 0.12 ? rnd(-11, -7) : rnd(-3, 3.5);
  }
  function startLayup(p) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    p.state = 'layup'; p.t = 0; p.vy = 15;
    const tx = rimX - dirT * 1.6, tz = RIM_Z + (p.z - RIM_Z) * 0.3;
    p.vx = (tx - p.x) / 0.45; p.vz = (tz - p.z) / 0.45;
    p.face = Math.sign(rimX - p.x) || p.face;
  }
  function startDunk(p, d) {
    const rimX = attackRim(p.team), dirT = match.dir[p.team];
    let contest = null;
    for (const o of oppsOf(p)) {
      if (o.state === 'down') continue;
      if (d2(o, p) < 4.5 && hyp(o.x - rimX, o.z - RIM_Z) < d + 1) { contest = o; break; }
    }
    const ex = rimX - dirT * 1.1, ez = RIM_Z + (p.z > RIM_Z ? 0.6 : -0.6);
    p.state = 'dunk'; p.t = 0; st(p).fga++;
    // pick the dunk: longer takeoffs get the fancy stuff, high flyers get the 720 and the free throw line
    const big = p.r.dnk >= 7;
    const pool = d > 10.5 ? (big ? ['soar', 'soar', 'spin360', 'spin720', 'flip', 'windmill'] : ['spin360', 'windmill', 'flip', 'basic'])
      : d > 8 ? ['spin360', 'windmill', 'tomahawk', 'flip', 'basic', big ? 'spin720' : 'tomahawk']
      : ['basic', 'tomahawk', 'windmill', 'basic'];
    const type = pick(pool), turns = type === 'spin360' ? 1 : type === 'spin720' ? 2 : 0;
    let T = 0.38 + d * 0.035 + turns * 0.12, arc = 3 + d * 0.3 + turns * 0.8;
    if (type === 'soar') { T = 0.55 + d * 0.05; arc = 5 + d * 0.38; }
    if (type === 'flip') { T += 0.1; arc += 1; }
    p.dunk = { sx: p.x, sz: p.z, ex, ez, T, arc, endY: Math.max(1, 10.9 - (p.h * 1.33 + 0.4)), type, turns, contest };
    p.face = Math.sign(rimX - p.x) || p.face;
    if (!p.fire) p.turbo = Math.max(0, p.turbo - 10);
    p.spin = 0;
  }

  function releaseShot(p, forceTiming) {
    if (ball.holder !== p) return;
    p.queuedRelease = false;
    const layup = p.state === 'layup';
    const rimX = attackRim(p.team);
    const bx = p.x + p.face * 0.5, by = p.y + p.h * 1.12 + 0.5, bz = p.z;
    const d = hyp(p.x - rimX, p.z - RIM_Z);
    const three = !layup && d > 19.75;
    let prob;
    if (layup) prob = 0.7 + p.r.sht * 0.015;
    else if (three) prob = 0.18 + p.r.thr * 0.033 - Math.max(0, d - 22) * 0.035;
    else prob = 0.42 + p.r.sht * 0.025 - Math.max(0, d - 8) * 0.011;
    if (!layup) {
      const a = Math.abs(p.vy);
      const timing = forceTiming || (a <= 6.5 ? 'perfect' : a <= 12 ? 'ok' : 'bad');
      prob += timing === 'perfect' ? 0.09 : timing === 'bad' ? -0.15 : 0;
    }
    let contest = 0;
    for (const o of oppsOf(p)) {
      const dd = d2(o, p);
      // a defender who just bit on a pump fake can barely contest the shot
      const faked = o.bitAt && time - o.bitAt < 1.6 ? 0.25 : 1;
      if (dd < 5.5 && o.state !== 'down') contest = Math.max(contest, (5.5 - dd) / 5.5 * (o.y > 0.6 ? 1 : 0.6) * (0.7 + o.r.blk * 0.04) * faked);
    }
    prob -= contest * 0.3;
    prob *= shotMod(p.team);
    if (p.fire) prob = Math.max(prob, three ? 0.82 : 0.9);
    prob = clamp(prob, 0.03, 0.96);
    if (three && d > 30) prob = 0.02; // heaves go in about 1 in 50, on fire or not
    const made = Math.random() < prob;
    let tx = rimX, ty = RIM_Y, tz = RIM_Z;
    if (!made) { const a = rnd(0, Math.PI * 2), r = rnd(0.95, 1.5); tx += Math.cos(a) * r; tz += Math.sin(a) * r * 0.8; ty = 10.15; }
    const T = layup ? 0.36 : 0.6 + d * 0.022;
    ball.holder = null; ball.state = 'shot';
    ball.x = bx; ball.y = by; ball.z = bz;
    ball.vx = (tx - bx) / T; ball.vz = (tz - bz) / T; ball.vy = (ty - by + 0.5 * BGRAV * T * T) / T;
    ball.shot = { made, T, t: 0, three, shooter: p, rimX, team: p.team, d, checked: new Set(), layup };
    st(p).fga++; if (three) st(p).tpa++;
    ball.lastTeam = p.team;
    p.noGrab = 0.35;
  }

  function trySteal(p) {
    if (p.stealCd > 0) return;
    p.stealCd = p.human ? 0.45 : 1.6; p.stealT = 0.22;
    const h = ball.holder;
    if (!h || h.team === p.team || ball.state !== 'held') return;
    if (d2(p, h) > 4 || h.state !== 'run' || h.inboundT > 0) return;
    let chance = 0.04 + p.r.stl * 0.02;
    if (p.human) chance += 0.12;
    if (h.human) chance *= 0.6;
    if (Math.random() < chance) {
      giveBall(p); h.stun = 0.3; match.shot = 24; st(p).stl++;
      callout(pick(['STOLEN!', 'PICKED CLEAN!', 'PICKPOCKET!']), 'ice');
      SFX.steal();
    }
  }
  function tryShove(p) {
    if (p.stealCd > 0) return;
    p.stealCd = 0.7; p.stealT = 0.22;
    let best = null, bd = 4.4;
    for (const o of oppsOf(p)) { const dd = d2(o, p) - (o === ball.holder ? 1 : 0); if (dd < bd && o.state !== 'down') { bd = dd; best = o; } }
    if (!p.fire) p.turbo = Math.max(0, p.turbo - 16);
    if (!best || Math.random() > (p.human ? 0.85 : 0.65)) return;
    const nx = (best.x - p.x) || p.face, nz = best.z - p.z, nl = hyp(nx, nz) || 1;
    best.state = 'down'; best.t = 0; best.vx = nx / nl * 16; best.vz = nz / nl * 16; best.vy = 0; best.dunk = null;
    if (ball.holder === best) {
      ball.holder = null; ball.state = 'loose'; ball.vx = nx / nl * 8 + rnd(-3, 3); ball.vz = rnd(-4, 4); ball.vy = 9; ball.y = best.y + 4;
      best.noGrab = 0.8;
    }
    SFX.shove();
  }
  function jump(p) {
    if (!onGround(p) || p.jumpCd > 0) return;
    const h = ball.holder;
    if (h && h.team !== p.team && h.fakeT > 0 && d2(h, p) < 7) p.bitAt = time;
    if (p.human && h && h.team !== p.team && h.fakeT > 0 && d2(h, p) < 7) callout(pick(['FAKED HIM OUT!', 'BIT ON THE FAKE!', 'UP FAKE!']), 'red');
    p.state = 'air'; p.t = 0; p.vy = 17 + p.r.blk * 0.45; p.jumpCd = 0.45;
  }

  // ---------- scoring ----------
  const DUNK_CALLS = {
    basic: ['SLAM!', 'JAM IT!', 'BOOM SHAKE!', 'THROWN DOWN!', 'WITH AUTHORITY!', 'MONSTER JAM!'],
    tomahawk: ['TOMAHAWK!', 'HAMMER DOWN!'], windmill: ['WINDMILL!', 'WINDMILL JAM!'],
    spin360: ['360 JAM!', 'SPIN CYCLE!'], spin720: ['720!!', 'DOUBLE SPIN!'],
    flip: ['HEAD OVER HEELS!', 'FLIP JAM!'], soar: ['FROM THE FREE THROW LINE!', 'AIR MUNCIE!', 'LOOK AT THAT HANG TIME!'],
  };
  function score(p, pts, kind, dtype) {
    const t = p.team;
    match.score[t] += pts;
    const S_ = st(p); S_.pts += pts; S_.fgm++; if (pts === 3) S_.tpm++;
    match.qs[t][match.q - 1] = (match.qs[t][match.q - 1] || 0) + pts;
    if (p.astFrom && p.astFrom.team === t && p.astFrom !== p && time - p.astT < 5) st(p.astFrom).ast++;
    p.astFrom = null;
    const kk = kind + pts; match.kinds[kk] = (match.kinds[kk] || 0) + 1;
    p.streak++; p.celebT = 1.1;
    for (const o of players) if (o.team !== t) { o.streak = 0; o.fire = false; }
    if (!p.fire && p.streak === 2) callout('HEATING UP...', 'fire');
    else if (!p.fire && p.streak >= 3 && !players.some(o => o.team !== t && o.fire)) { p.fire = true; callout("HE'S RED HOT!", 'fire', true); SFX.fire(); }
    else if (kind === 'dunk') callout(pick(DUNK_CALLS[dtype] || DUNK_CALLS.basic), dtype && dtype !== 'basic' ? 'gold' : 'white', true);
    else if (pts === 3) callout(ball.shot && ball.shot.d > 25 ? 'FROM THE PARKING LOT!' : pick(['FROM DOWNTOWN!', 'BOMBS AWAY!', 'SPLASH!', 'GOOD FROM WAY OUT!']), 'gold', true);
    else if (Math.random() < 0.35) callout(pick(['NOTHING BUT NET!', 'COUNT IT!', 'BUCKETS!']), 'gold');
    if (match.clock <= 0) callout('AT THE BUZZER!', 'fire', true);
    crowdHype = pts === 3 || kind === 'dunk' ? 2.2 : 1.2;
    SFX.crowd(pts === 3 || kind === 'dunk');
    match.phase = 'dead'; match.phaseT = 0.45; match.inboundTeam = 1 - t; match.scoredRim = attackRim(t); match.inb = null;
  }
  // NBA Jam style inbound after a basket (automatic): the nearest player on the other team grabs the ball,
  // carries it out past the baseline, pauses a half beat, and passes in to his teammate standing nearby.
  const inInb = p => match.inb && (p === match.inb.who || p === match.inb.recv);
  // NBA Jam hyper sprint: inbound players who are far from where they need to be fly there
  function inbSpeed(p) {
    const I = match.inb;
    if (!I || match.phase !== 'dead') return 1;
    let tx, tz;
    if (p === I.who && I.stage === 'fetch') { tx = ball.x; tz = ball.z; }
    else if (p === I.who && I.stage === 'carry') { tx = I.spot[0]; tz = I.spot[1]; }
    else if (p === I.recv) { tx = I.rspot[0]; tz = I.rspot[1]; }
    else return 1;
    const dd = hyp(p.x - tx, p.z - tz);
    return dd > 25 ? 2.4 : dd > 12 ? 1.8 : 1.3;
  }
  function updateInbound(dt) {
    if (match.phaseT > 0) return;
    let I = match.inb;
    if (!I) {
      const tm = players.filter(p => p.team === match.inboundTeam);
      const hum = tm.find(p => p.human);
      // on your team, the CPU teammate always takes it out and passes it in to you
      const who = hum ? mateOf(hum) : tm.reduce((a, b) => (d2(b, ball) < d2(a, ball) ? b : a));
      const recv = mateOf(who);
      const base = match.scoredRim < MID ? 0 : CL, inward = match.scoredRim < MID ? 1 : -1, side = Math.random() < 0.5 ? -1 : 1;
      I = match.inb = { stage: 'fetch', who, recv, inward, t: 0, pt: 0,
        spot: [base - inward * 0.55, RIM_Z + side * 4], rspot: [base + inward * 8, RIM_Z - side * 4] };
    }
    I.t += dt;
    const w = I.who;
    if (I.stage === 'fetch') {
      if (w.state === 'run' && hyp(w.x - ball.x, w.z - ball.z) < 2.2 && ball.y < 4) {
        ball.holder = w; ball.state = 'held'; ball.lastTeam = w.team; ball.shot = null; ball.pass = null;
        I.stage = 'carry';
      } else if (I.t > 4) { ball.x = w.x; ball.z = w.z; ball.y = 3; ball.holder = w; ball.state = 'held'; I.stage = 'carry'; }
    } else if (I.stage === 'carry') {
      if (hyp(w.x - I.spot[0], w.z - I.spot[1]) < 0.8 || I.t > 6) { I.stage = 'pause'; I.pt = 0; }
    } else if (I.stage === 'pause') {
      w.face = I.inward;
      I.pt += dt;
      const ready = hyp(I.recv.x - I.rspot[0], I.recv.z - I.rspot[1]) < 3 || I.t > 6;
      if (I.pt >= 0.3 && ready) {
        match.inb = null; match.phase = 'live'; match.shot = 24;
        passBall(w, I.recv); ball.pass.inbound = true;
      }
    }
  }

  // ---------- input ----------
  const input = { shoot: false, pass: false, turbo: false };
  const latch = { shoot: false, pass: false };
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (!keys.has(e.code)) { if (e.code === 'Space' || e.code === 'KeyJ') { latch.shoot = true; input.shootAt = performance.now(); } if (e.code === 'KeyK') latch.pass = true; }
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
  let stickId = null, stickOrigin = [0, 0], stickVec = [0, 0];

  const defaultStickPos = () => [Math.max(100, window.innerWidth * 0.13), window.innerHeight - 105];
  const placeStick = (x, y) => { elBase.style.left = x + 'px'; elBase.style.top = y + 'px'; };
  const setKnob = (dx, dy) => { elKnob.style.transform = `translate(${dx}px, ${dy}px)`; };
  // generous hit zones: the right half of the screen snaps to the nearest button
  function btnZone(x, y) {
    if (x < window.innerWidth * 0.5) return [];
    const list = [];
    for (const k in elBtn) {
      const r = elBtn[k].getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      list.push({ k, d: hyp(x - cx, y - cy) / rad });
    }
    list.sort((a, b) => a.d - b.d);
    if (list[0].d > 2.2) return [];
    const hits = [list[0].k];
    if (list[1].d < 1.08) hits.push(list[1].k); // thumb on the seam presses both
    return hits;
  }
  function moveStick(x, y) {
    let dx = x - stickOrigin[0], dy = y - stickOrigin[1];
    const L = hyp(dx, dy), max = 38;
    if (L > max) { stickOrigin[0] += dx * (1 - max / L); stickOrigin[1] += dy * (1 - max / L); placeStick(stickOrigin[0], stickOrigin[1]); dx = x - stickOrigin[0]; dy = y - stickOrigin[1]; }
    const L2 = hyp(dx, dy);
    setKnob(dx, dy);
    const m = Math.min(1, L2 / 30);
    stickVec = L2 < 5 ? [0, 0] : [dx / L2 * m, dy / L2 * m];
  }
  function pressStart(id, x, y) {
    SFX.unlock();
    if (screen === 'play' && !paused) {
      const r = cv.getBoundingClientRect(), cx = (x - r.left) / r.width * W, cy = (y - r.top) / r.height * H;
      if (cy < 36 && Math.abs(cx - W / 2) < 50) { paused = true; SFX.blip(); return; } // tap the game clock to pause
      if (x < window.innerWidth * 0.5) {
        if (stickId === null) { stickId = id; stickOrigin = [x, y]; placeStick(x, y); setKnob(0, 0); stickVec = [0, 0]; }
        return;
      }
      const hits = btnZone(x, y);
      touches.set(id, { hits, turboLatch: hits.includes('turbo') });
      if (hits.includes('shoot')) { latch.shoot = true; input.shootAt = performance.now(); }
      if (hits.includes('pass')) latch.pass = true;
      return;
    }
    uiTap(x, y);
  }
  function pressMove(id, x, y) {
    if (id === stickId) { moveStick(x, y); return; }
    const t = touches.get(id);
    if (t) {
      const hits = btnZone(x, y);
      if (hits.includes('shoot') && !t.hits.includes('shoot')) { latch.shoot = true; input.shootAt = performance.now(); }
      if (hits.includes('pass') && !t.hits.includes('pass')) latch.pass = true;
      t.hits = hits; if (hits.includes('turbo')) t.turboLatch = true;
    }
  }
  function pressEnd(id) {
    if (id === stickId) { stickId = null; stickVec = [0, 0]; setKnob(0, 0); placeStick(...defaultStickPos()); }
    touches.delete(id);
  }
  const onTouch = fn => e => {
    if (e.target === elPause) return;
    e.preventDefault();
    for (const t of e.changedTouches) fn(t.identifier, t.clientX, t.clientY);
  };
  document.addEventListener('touchstart', onTouch(pressStart), { passive: false });
  document.addEventListener('touchmove', onTouch(pressMove), { passive: false });
  document.addEventListener('touchend', onTouch(pressEnd), { passive: false });
  document.addEventListener('touchcancel', onTouch(pressEnd), { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  // mouse (desktop testing)
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.target !== elPause) pressStart('m', e.clientX, e.clientY); });
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && e.buttons) pressMove('m', e.clientX, e.clientY); });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') pressEnd('m'); });
  const togglePause = e => { e.preventDefault(); e.stopPropagation(); if (screen === 'play') { paused = !paused; SFX.blip(); } };
  elPause.addEventListener('touchstart', togglePause, { passive: false });
  elPause.addEventListener('mousedown', togglePause);

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
      shootPress: latch.shoot || (shoot && !input.shoot),
      shootHeld: shoot,
      shootRelease: (!shoot && input.shoot) || (latch.shoot && !shoot),
      passPress: latch.pass || (pass && !input.pass)
    };
    latch.shoot = latch.pass = false;
    input.shoot = shoot; input.pass = pass; input.turbo = turbo;
    elBtn.shoot.classList.toggle('down', shoot); elBtn.pass.classList.toggle('down', pass); elBtn.turbo.classList.toggle('down', turbo);
    return it;
  }
  let lblCache = '';
  function updateButtonLabels() {
    const h = humanP(); if (!h) return;
    let s = 'SHOOT', p = 'PASS';
    const off = ball.holder ? ball.holder.team === h.team : (ball.state === 'pass' || ball.state === 'shot') && ball.lastTeam === h.team;
    if (!off) { s = 'JUMP'; p = input.turbo ? 'SHOVE' : 'STEAL'; }
    else if (ball.holder && ball.holder !== h) { p = 'CALL'; }
    const key = s + p;
    if (key !== lblCache) { elBtn.shoot.textContent = s; elBtn.pass.textContent = p; lblCache = key; }
  }

  // ---------- AI ----------
  const blankIntent = () => ({ mx: 0, mz: 0, turbo: false, shootPress: false, shootHeld: false, shootRelease: false, passPress: false });
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
      if (p.isJumper && A.jumpAt < 0 && ball.vy < 6) A.jumpAt = rnd(0.02, isCPUteam(p.team) ? 0.32 : 0.15);
      if (A.jumpAt >= 0) { A.jumpAt -= dt; if (A.jumpAt <= 0) { A.jumpAt = -1; it.shootPress = true; } }
      return it;
    }
    if (match.phase === 'dead') {
      const I = match.inb;
      if (I && p === I.who) {
        if (I.stage === 'fetch') { moveTo(it, p, ball.x, ball.z, 0.4); it.turbo = true; }
        else if (I.stage === 'carry') { moveTo(it, p, I.spot[0], I.spot[1], 0.6); it.turbo = true; }
        return it;
      }
      if (I && p === I.recv) { moveTo(it, p, I.rspot[0], I.rspot[1], 1.2); it.turbo = hyp(p.x - I.rspot[0], p.z - I.rspot[1]) > 3; return it; }
      const inb = match.inboundTeam === p.team;
      const tx = inb ? MID - match.dir[p.team] * 4 : defRim(p.team) + (defRim(p.team) < MID ? 12 : -12);
      moveTo(it, p, tx, RIM_Z + (p.slot ? 9 : -9));
      return it;
    }
    if (match.phase !== 'live') return it;
    A.think -= dt;
    const deciding = A.think <= 0;
    if (deciding) A.think = rnd(0.1, 0.22);
    const team = p.team, dirT = match.dir[team];
    const aRim = attackRim(team), dRim = defRim(team);
    const mate = mateOf(p), opps = oppsOf(p);
    const holder = ball.holder;
    const helper = mate && mate.human; // CPU teammate of the human player
    let myMan = opps.find(o => o.slot === p.slot) || opps[0];

    if (A.jumpAt >= 0) { A.jumpAt -= dt; if (A.jumpAt <= 0) { A.jumpAt = -1; it.shootPress = true; return it; } }

    if (holder !== p) A.hadBall = false;
    if (holder === p) {
      if (!A.hadBall) {
        A.hadBall = true; A.fakes = 0; A.plan = Math.random() < p.r.thr * 0.05 ? 'pull' : 'drive'; A.pullAng = rnd(-1.1, 1.1);
        // pick a route to the rim for this trip: attack a wing, the corner, the baseline, the top, or straight in
        const sd = Math.random() < 0.5 ? -1 : 1;
        const routes = [[[19, 15 * sd]], [[16, 17 * sd], [4, 20 * sd]], [[18, 14 * sd], [3, 9 * sd]], [[23, 0], [12, 7 * sd]], [[20, 13 * sd], [17, -12 * sd]], []];
        A.wps = pick(routes).map(([dx, dz]) => [aRim - dirT * dx, RIM_Z + dz]).filter(([wx]) => (wx - p.x) * dirT > 2);
        A.laneZ = rnd(-9, 9);
      }
      if (p.inboundT > 0) { moveTo(it, p, p.x + dirT * 5, p.z); return it; }
      const d = hyp(p.x - aRim, p.z - RIM_Z);
      const open = openness(p);
      if (A.forceShoot) { A.forceShoot = false; it.shootPress = true; it.turbo = d <= dunkRange(p) && p.turbo > 10; return it; }
      if (A.wantPass && mate) { A.wantPass = false; it.passPress = true; return it; }
      // a defender bit on the pump fake: shoot over him
      if (p.fakeT <= 0.05 && d < 24 && opps.some(o => o.state === 'air' && d2(o, p) < 7 && o.vy < 6)) { it.shootPress = true; return it; }
      // end of the quarter or shot clock: chuck it from wherever he is
      if (p.fakeT <= 0 && (match.clock < 2.2 || match.shot < 1.4)) { it.shootPress = true; it.turbo = d <= dunkRange(p); return it; }
      // dribble is dead: pass or shoot, no walking
      if (p.pickedUp && p.fakeT <= 0) {
        if (!deciding) return it;
        const mOpen = mate ? openness(mate) : 0;
        if (mate && mOpen > 5 && open < 4 && Math.random() < 0.6) it.passPress = true; else if (Math.random() < 0.7) it.shootPress = true;
        return it;
      }
      if (deciding) {
        // pump fake a close defender now and then (more often against the human)
        if ((A.fakes || 0) < 2 && p.fakeT <= 0 && d > 9 && d < 23) {
          const near = opps.find(o => onGround(o) && d2(o, p) < 5.5 && (o.x - p.x) * dirT > -1);
          if (near && Math.random() < (near.human ? 0.16 : 0.07)) { A.fakes = (A.fakes || 0) + 1; it.fake = true; return it; }
        }
        const mOpen = mate ? openness(mate) : 0;
        const blockerAhead = opps.some(o => o.state !== 'down' && (o.x - p.x) * dirT > -0.5 && d2(o, p) < 5 && hyp(o.x - aRim, o.z - RIM_Z) < d + 1);
        if (match.shot < 2.5 && d < 30) { it.shootPress = true; it.turbo = d <= dunkRange(p); return it; }
        if (d <= dunkRange(p) && d > 3 && (p.turbo > 15 || p.fire) && Math.random() < (blockerAhead ? 0.1 : 0.45 + p.r.dnk * 0.03)) { it.shootPress = true; it.turbo = true; return it; }
        if (blockerAhead && d < 16 && d > 7 && Math.random() < 0.1 + p.r.sht * 0.015) { it.shootPress = true; return it; }
        if (d < 7 && Math.random() < 0.55) { it.shootPress = true; return it; }
        if (d < 19.5 && d > 8 && open > 5 && Math.random() < 0.06 + p.r.sht * 0.02) { it.shootPress = true; return it; }
        if (d >= 20 && d < 24.5 && open > 4.5 && Math.random() < p.r.thr * 0.03 + (p.fire ? 0.15 : 0)) { it.shootPress = true; return it; }
        if (mate && open < 4 && mOpen > 6 && Math.random() < 0.12) { it.passPress = true; return it; }
        if (helper && mOpen > 4.5 && Math.random() < 0.07) { it.passPress = true; return it; }
        if (mate && !mate.human && mOpen > 6 && mate.r.thr >= 6 && hyp(mate.x - aRim, mate.z - RIM_Z) > 20 && Math.random() < 0.08) { it.passPress = true; return it; }
        if (Math.random() < 0.1) A.laneZ = rnd(-9, 9);
      }
      if (A.plan === 'pull') {
        const px = aRim - dirT * Math.cos(A.pullAng) * 21.5, pz = RIM_Z + Math.sin(A.pullAng) * 20.5;
        if (hyp(p.x - px, p.z - pz) < 2.5 || (d < 23.5 && d > 20)) {
          if (deciding && (open > 3.5 || Math.random() < 0.25)) { it.shootPress = true; return it; }
          if (deciding && Math.random() < 0.15) A.plan = 'drive';
        }
        if (A.plan === 'pull') { moveTo(it, p, px, pz); it.turbo = p.turbo > 40 && hyp(p.x - px, p.z - pz) > 10; return it; }
      }
      let tx = aRim - dirT * 1.5, tz = RIM_Z + A.laneZ * Math.min(1, d / 18);
      if (A.wps && A.wps.length) {
        const [wx, wz] = A.wps[0];
        if (hyp(p.x - wx, p.z - wz) < 3.5 || (p.x - wx) * dirT > 1) { A.wps.shift(); A.laneZ = (p.z > RIM_Z ? -1 : 1) * rnd(2, 8); } // crossover at the turn
        else { tx = wx; tz = wz; }
      }
      for (const o of opps) { const ahead = (o.x - p.x) * dirT; if (ahead > 0 && ahead < 6 && Math.abs(o.z - p.z) < 3) tz += (p.z < o.z ? -7 : 7); }
      moveTo(it, p, tx, clamp(tz, 3, 47));
      it.turbo = (p.turbo > 35 && d > 8 && d < 34 && open > 3) || p.fire;
      return it;
    }

    if (holder && holder.team === team) {
      // off-ball offense: keep moving, cut, and get open for the ball handler
      A.cutT -= dt;
      if (A.cutT <= 0) { A.cutting = 1.2; A.cutT = rnd(2.5, 5); A.spotZ = Math.random() < 0.5 ? -1 : 1; }
      let tx, tz;
      const hd = hyp(holder.x - aRim, holder.z - RIM_Z);
      A.spotT = (A.spotT || 0) - dt;
      if (A.spotT <= 0 || !A.spot) {
        const shooter = p.r.thr >= 6;
        const spots = shooter ? [[20, 15], [20, -15], [3, 21], [3, -21], [23, 0], [13, 8], [13, -8]]
                              : [[13, 8], [13, -8], [6, 12], [6, -12], [16, 15], [16, -15], [3, 18], [3, -18]];
        const opts = spots.map(([dx, dz]) => [aRim - dirT * dx, RIM_Z + dz]).filter(([sx, sz]) => hyp(sx - holder.x, sz - holder.z) > 9);
        const away = opts.filter(([, sz]) => (sz - RIM_Z) * (holder.z - RIM_Z) <= 0);
        A.spot = pick(away.length && Math.random() < 0.7 ? away : (opts.length ? opts : [[aRim - dirT * 15, RIM_Z]]));
        A.spotT = rnd(1.3, 2.8);
      }
      if (A.cutting > 0) { A.cutting -= dt; tx = aRim - dirT * 4; tz = RIM_Z + A.spotZ * 4; }
      else { tx = A.spot[0]; tz = A.spot[1]; }
      if (hd > 30) tx = holder.x + dirT * 12; // run the floor ahead of the ball
      if (d2(p, holder) < 7) tz += p.z < holder.z ? -5 : 5;
      const L = moveTo(it, p, tx, clamp(tz, 3, 47));
      it.turbo = L > 10 && p.turbo > 40;
      return it;
    }

    if (holder && holder.team !== team) {
      // defense; the human's teammate switches onto the ball if the human is out of the play
      const hum = helper ? mate : null;
      if (hum && holder !== myMan && d2(hum, holder) > 8 && d2(p, holder) < d2(hum, holder)) myMan = holder;
      if (hum && holder === myMan && d2(hum, holder) < 4 && d2(p, holder) > 4) myMan = opps.find(o => o !== holder) || myMan;
      const man = myMan;
      const gx = dRim - man.x, gz = RIM_Z - man.z, gl = hyp(gx, gz) || 1;
      let tx, tz;
      const cpuD = isCPUteam(team);
      if (man === holder) {
        tx = man.x + gx / gl * 3; tz = man.z + gz / gl * 3;
        const dd = d2(p, man);
        if (deciding && dd < 3.8 && man.state === 'run') {
          if (p.turbo > 30 && Math.random() < (cpuD ? 0.012 : 0.03)) { it.passPress = true; it.turbo = true; return it; }
          if (Math.random() < (cpuD ? 0.01 + p.r.stl * 0.003 : 0.014 + p.r.stl * 0.004)) { it.passPress = true; return it; }
        }
        if ((man.state === 'shoot' || man.state === 'layup') && dd < 6.5 && A.jumpAt < 0 && Math.random() < (cpuD ? 0.35 : 0.5) + p.r.blk * 0.04) A.jumpAt = rnd(cpuD ? 0.1 : 0.04, cpuD ? 0.28 : 0.18);
        if (man.state === 'dunk' && hyp(p.x - dRim, p.z - RIM_Z) < 8 && A.jumpAt < 0 && Math.random() < 0.3 + p.r.blk * 0.05) A.jumpAt = Math.max(0.01, man.dunk.T - man.t - 0.3);
      } else {
        const sag = hyp(holder.x - dRim, holder.z - RIM_Z) < 14 ? 0.5 : 0.25;
        tx = man.x + gx / gl * 6; tz = man.z + gz / gl * 6;
        tx += (holder.x - tx) * sag * 0.5; tz += (holder.z - tz) * sag * 0.5;
        if (holder.state === 'dunk' && hyp(p.x - dRim, p.z - RIM_Z) < 8 && A.jumpAt < 0 && Math.random() < 0.25 + p.r.blk * 0.05) A.jumpAt = Math.max(0.01, holder.dunk.T - holder.t - 0.3);
      }
      const L = moveTo(it, p, tx, tz, 1);
      it.turbo = (L > 8 && p.turbo > 20) || (man === holder && man.usingTurbo && p.turbo > 5 && L > 1.5);
      if (L < 1.2) p.face = Math.sign(man.x - p.x) || p.face;
      return it;
    }

    if (ball.state === 'shot') {
      const r = ball.shot.rimX, offense = ball.shot.team === team;
      moveTo(it, p, r + (r < MID ? 1 : -1) * (offense ? 7 : 5), RIM_Z + (p.slot ? -5 : 5));
      for (const o of opps) if (o === ball.shot.shooter && d2(p, o) < 6 && ball.shot.t < 0.15 && A.jumpAt < 0 && Math.random() < 0.02 + p.r.blk * 0.01) A.jumpAt = 0.01;
      return it;
    }
    if (ball.state === 'pass') {
      const pt = ball.pass.to;
      if (pt.team !== team) { const lx = (ball.x + pt.x) / 2, lz = (ball.z + pt.z) / 2; if (hyp(lx - p.x, lz - p.z) < 6) moveTo(it, p, lx, lz, 1); }
      return it;
    }
    if (ball.state === 'loose' || ball.state === 'tip') {
      const tt = clamp(ball.vy > 0 ? ball.vy / BGRAV + 0.15 : 0.15, 0, 0.5);
      const px = ball.x + ball.vx * tt, pz = ball.z + ball.vz * tt;
      const others = [p, mate].filter(Boolean);
      let chaser = others.reduce((a, b) => (hyp(b.x - px, b.z - pz) < hyp(a.x - px, a.z - pz) ? b : a));
      if (helper && chaser === mate && hyp(mate.x - px, mate.z - pz) > 2.5) chaser = p; // don't wait on the human
      if (chaser === p) {
        const L = moveTo(it, p, px, pz, 0.6);
        it.turbo = L > 4 && p.turbo > 10;
        const hd = hyp(ball.x - p.x, ball.z - p.z);
        if (hd < 3 && ball.y > p.h * 1.25 && ball.y < p.h * 1.33 + 3.6 && ball.vy < 3 && Math.random() < 0.3) it.shootPress = true;
      } else moveTo(it, p, dRim + (dRim < MID ? 1 : -1) * 12, RIM_Z + (p.slot ? -6 : 6));
      return it;
    }
    return it;
  }

  // ---------- apply intents ----------
  function applyIntent(p, it, dt) {
    p.fakeT = Math.max(0, (p.fakeT || 0) - dt);
    if (ball.holder !== p) { p.gather = null; p.pickedUp = false; }
    p.stealCd -= dt; p.jumpCd -= dt; p.noGrab -= dt; p.inboundT -= dt; p.stealT -= dt; p.stun -= dt; p.celebT -= dt;
    if (p.state === 'down') return;
    const moving = Math.abs(it.mx) + Math.abs(it.mz) > 0.2;
    p.usingTurbo = it.turbo && moving && (p.turbo > 0 || p.fire);
    if (p.usingTurbo && !p.fire && !inInb(p)) p.turbo = Math.max(0, p.turbo - 30 * dt);
    else if (!it.turbo) p.turbo = Math.min(100, p.turbo + 16 * dt);
    if (p.fire) p.turbo = 100;

    if (onGround(p) && p.stun <= 0) {
      const sp = speedOf(p) * (p.usingTurbo ? 1.4 : 1) * (ball.holder === p ? 0.96 : 1) * inbSpeed(p);
      const pivot = ball.holder === p && (p.gather != null || p.fakeT > 0 || p.pickedUp);
      const tx = pivot ? 0 : it.mx * sp, tz = pivot ? 0 : it.mz * sp * 0.85;
      const k = Math.min(1, dt * 18);
      p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
      if (Math.abs(p.vx) > 1.5) p.face = Math.sign(p.vx);
      else if (ball.holder === p) p.face = Math.sign(attackRim(p.team) - p.x) || p.face;
    } else if (onGround(p)) { p.vx *= 0.8; p.vz *= 0.8; }

    if (match.phase === 'tip') { p.vx = p.vz = 0; if (it.shootPress && p.isJumper) jump(p); return; }
    if (match.phase !== 'live') return;

    const holder = ball.holder;
    if (holder === p) {
      if (onGround(p) && p.inboundT <= 0) {
        if (it.fake && p.gather == null && p.fakeT <= 0) pumpFake(p);
        else if (it.passPress && p.gather == null) { passBall(p, mateOf(p)); p.fakeT = 0; }
        else if (it.shootPress && p.gather == null && p.fakeT < 0.15) {
          const d = hyp(p.x - attackRim(p.team), p.z - RIM_Z);
          const dunkable = (it.turbo || p.fire) && d <= dunkRange(p) && (p.turbo > 5 || p.fire);
          // the human gathers first: a quick tap is a pump fake, holding goes up for the shot
          if (p.human && !dunkable && d >= 7.5) { p.gather = 0; p.fakeT = 0; p.gatherAt = input.shootAt || performance.now(); }
          else startShot(p, it.turbo);
        }
        if (p.gather != null && ball.holder === p) {
          p.gather += dt;
          // timed against the real clock, so a frame hiccup can't turn a tap into a shot
          const held = (performance.now() - p.gatherAt) / 1000;
          if (!it.shootHeld && held < GATHER) { p.gather = null; pumpFake(p); }
          else if (held >= GATHER && p.gather >= GATHER * 0.5) { p.gather = null; startShot(p, false); }
        }
      }
      // hold SHOOT to rise; the ball goes when you let go (best at the top of the jump)
      if (p.state === 'shoot' && (it.shootRelease || p.vy < -13)) releaseShot(p);
    } else if (holder && holder.team === p.team) {
      if (p.human) {
        if (it.passPress) holder.ai.wantPass = true;
        if (it.shootPress) holder.ai.forceShoot = true;
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
        p.anim += hyp(p.vx, p.vz) * dt * 0.5;
        break;
      case 'air': case 'shoot': case 'layup':
        p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= GRAV * dt; p.y += p.vy * dt;
        if (p.state === 'layup') { p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2; if (p.t > 0.26 && ball.holder === p) releaseShot(p); }
        if (p.y <= 0) {
          const wasShooting = p.state === 'shoot' || p.state === 'layup';
          p.y = 0; p.vy = 0; p.state = 'run'; p.vx *= 0.3; p.vz *= 0.3;
          if (p.bitFake) { p.bitFake = false; p.stun = 0.4; }
          if (wasShooting && ball.holder === p && match.phase === 'live') releaseShot(p);
        }
        break;
      case 'dunk': {
        const D = p.dunk, u = Math.min(1, p.t / D.T);
        p.x = D.sx + (D.ex - D.sx) * u; p.z = D.sz + (D.ez - D.sz) * u;
        p.y = D.endY * u + D.arc * 4 * u * (1 - u);
        let e = clamp((u - 0.08) / 0.8, 0, 1); e = e * e * (3 - 2 * e);
        p.spin = D.type === 'flip' ? e * Math.PI * 2 : 0;          // head over heels
        p.hturn = D.turns ? e * D.turns * Math.PI * 2 : 0;          // 360 or 720 body spin
        p.dunkE = e;
        if (u >= 1) finishDunk(p);
        break;
      }
      case 'hang':
        if (p.t > 0.35) { p.state = 'air'; p.vy = 0; p.vx = -match.dir[p.team] * 3; p.vz = 0; p.t = 0; }
        break;
      case 'down':
        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 5; p.vz *= 1 - dt * 5;
        if (p.y > 0) { p.vy -= GRAV * dt; p.y = Math.max(0, p.y + p.vy * dt); }
        if (p.t > 1.1) { p.state = 'run'; p.t = 0; p.y = 0; p.stun = 0.12; }
        break;
    }
    p.x = clamp(p.x, -0.8, CL + 0.8); p.z = clamp(p.z, -1.2, 51.2);
  }

  function finishDunk(p) {
    const rimX = attackRim(p.team);
    let blocked = false;
    for (const o of oppsOf(p)) {
      if (o.state === 'air' && hyp(o.x - rimX, o.z - RIM_Z) < 4 && reachOf(o) + 0.5 > 10.2 && Math.random() < 0.05 + o.r.blk * 0.025 + (o.human ? 0.12 : 0)) { blocked = o; break; }
    }
    const ct = p.dunk.contest, dtype = p.dunk.type;
    p.hturn = 0;
    if (!blocked && ct && ct.state !== 'down' && Math.random() < (isCPUteam(p.team) ? 0.22 : 0.1) + ct.r.blk * 0.02) blocked = ct;
    p.dunk = null; p.spin = 0;
    if (blocked) {
      p.state = 'air'; p.vy = 0; p.vx = -match.dir[p.team] * 4; p.vz = 0; p.t = 0;
      ball.holder = null; ball.state = 'loose'; ball.vx = -match.dir[p.team] * rnd(12, 18); ball.vy = rnd(3, 8); ball.vz = rnd(-5, 5);
      ball.lastTeam = blocked.team; p.noGrab = 0.5; st(blocked).blk++;
      callout(pick(['REJECTED!', 'DENIED!', 'STUFFED!', 'GET THAT OUTTA HERE!']), 'ice', true);
      SFX.block(); shake = 0.25;
      return;
    }
    p.state = 'hang'; p.t = 0; p.vx = p.vz = 0;
    ball.holder = null; ball.state = 'dead'; ball.x = rimX; ball.z = RIM_Z; ball.y = 9.6; ball.vx = (rimX < MID ? 1 : -1) * 1.5; ball.vz = 0; ball.vy = -16;
    netShake[rimX < MID ? 0 : 1] = 0.5;
    shake = 0.35;
    SFX.dunk();
    burst(rimX, 10, RIM_Z, 22, ['#ffffff', '#ffd23c', '#ff8a3c'], 10);
    ball.shot = { d: 0 };
    score(p, 2, 'dunk', dtype);
  }

  function grabCheck() {
    if (ball.state !== 'loose' && ball.state !== 'tip') return;
    let best = null, bd = 99;
    for (const p of players) {
      if (p.state === 'down' || p.state === 'dunk' || p.noGrab > 0 || p.stun > 0) continue;
      if (ball.state === 'tip' && p.isJumper) continue;
      const hd = hyp(ball.x - p.x, ball.z - p.z);
      if (hd < (p.y > 0.3 ? 2.8 : 2.4) && ball.y <= reachOf(p) + 0.7 && ball.y >= p.y - 0.5 && hd < bd) { bd = hd; best = p; }
    }
    if (best) {
      if (best.team !== ball.lastTeam || ball.reb) match.shot = 24;
      const wasReb = ball.reb;
      ball.reb = false;
      giveBall(best);
      if (wasReb) st(best).reb++;
    }
  }

  function updateBall(dt) {
    const b = ball;
    if (b.state === 'held') {
      const p = b.holder;
      if (p.state === 'dunk') {
        const ty = p.dunk.type, k = p.h / 6.5, turn = Math.cos(p.hturn || 0);
        if ((ty === 'windmill' || ty === 'tomahawk' || ty === 'soar') && p.pose) {
          // ball rides the hand through the arm swing
          const a = p.pose.armF[0];
          b.x = p.x + p.face * turn * Math.sin(a) * 2.45 * k; b.y = p.y + p.h * 0.83 - Math.cos(a) * 2.45 * k; b.z = p.z + 0.2;
        } else {
          // keep the ball in his hands, even mid-flip or mid-spin
          const cy = p.h * 0.49, ox = p.face * 1.1 * turn, oy = p.h * 1.28 - cy, a = -(p.spin || 0) * p.face;
          b.x = p.x + ox * Math.cos(a) - oy * Math.sin(a); b.y = p.y + cy + ox * Math.sin(a) + oy * Math.cos(a); b.z = p.z + 0.2;
        }
      }
      else if (p.state !== 'run' && p.state !== 'down') { b.x = p.x + p.face * 0.45; b.y = p.y + p.h * 1.14 + 0.4; b.z = p.z + 0.1; }
      else if (p.gather != null || p.fakeT > 0 || p.pickedUp) {
        const u = p.gather != null ? Math.min(1, p.gather / GATHER) : p.fakeT > 0 ? 1 - Math.abs(p.fakeT - 0.18) / 0.18 : 0.3;
        b.x = p.x + p.face * (0.85 - 0.3 * u) * p.h / 6.5; b.y = p.h * (0.6 + 0.42 * u); b.z = p.z + 0.4;
      }
      else if (match.phase === 'dead') { b.x = p.x + p.face * 0.75 * p.h / 6.5; b.y = p.h * 0.6; b.z = p.z + 0.4; }
      else {
        const sp = hyp(p.vx, p.vz);
        b.dribPhase += dt * (7.5 + sp * 0.22);
        const ph = Math.abs(Math.sin(b.dribPhase));
        const prevY = b.y;
        b.x = p.x + p.face * 1.3 * p.h / 6.5; b.z = p.z + 0.4; b.y = 0.4 + ph * p.h * 0.46;
        if (prevY > 0.9 && b.y <= 0.9 && Math.abs(p.x - camX) < 30) SFX.dribble();
      }
      return;
    }
    if (b.state === 'shot') {
      const s = b.shot;
      s.t += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= BGRAV * dt; b.y += b.vy * dt;
      if (s.t < (s.layup ? 0.22 : 0.32)) {
        for (const o of players) {
          if (o.team === s.team || o.state !== 'air' || s.checked.has(o)) continue;
          const hd = hyp(o.x - b.x, o.z - b.z), hand = reachOf(o) + 0.4;
          if (hd < 2.8 && Math.abs(hand - b.y) < 2) {
            s.checked.add(o);
            if (Math.random() < 0.06 + o.r.blk * 0.03 + (o.human ? 0.15 : 0) - (isCPUteam(o.team) ? 0.03 : 0)) {
              b.state = 'loose'; b.vx = (b.x - o.x >= 0 ? 1 : -1) * rnd(10, 16); b.vy = rnd(2, 7); b.vz = rnd(-6, 6);
              b.lastTeam = o.team; s.shooter.noGrab = 0.35; st(o).blk++;
              callout(pick(['REJECTED!', 'DENIED!', 'GET THAT OUTTA HERE!', 'SWAT!']), 'ice', true);
              SFX.block(); shake = 0.2;
              return;
            }
          }
        }
      }
      if (s.t >= s.T) {
        if (s.made) {
          b.x = s.rimX; b.z = RIM_Z; b.y = 9.7; b.vx = (s.rimX < MID ? 1 : -1) * 1.5; b.vz = 0; b.vy = -7; b.state = 'dead';
          netShake[s.rimX < MID ? 0 : 1] = 0.45;
          SFX.swish();
          if (s.shooter.fire) burst(s.rimX, 10, RIM_Z, 16, ['#ff4a1c', '#ffb02e', '#fff1a0'], 8);
          score(s.shooter, s.three ? 3 : 2, s.layup ? 'layup' : 'jumper');
        } else {
          const nx = b.x - s.rimX, nz = b.z - RIM_Z, L = hyp(nx, nz) || 1;
          const out = rnd(6, 12);
          b.vx = nx / L * out - (s.rimX < MID ? -1 : 1) * rnd(1, 4);
          b.vz = nz / L * out * 0.8 + rnd(-2, 2);
          b.vy = rnd(8, 15);
          b.state = 'loose'; b.reb = true;
          const mk = 'miss' + (s.layup ? 'L' : s.three ? '3' : '2'); match.kinds[mk] = (match.kinds[mk] || 0) + 1;
          if ((s.rimX < MID && nx < 0) || (s.rimX > MID && nx > 0)) SFX.board(); else SFX.rim();
          netShake[s.rimX < MID ? 0 : 1] = 0.15;
        }
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
          if (Math.random() < (isCPUteam(o.team) ? 0.02 : o.human ? 0.12 : 0.04) + o.r.stl * 0.012) { giveBall(o); st(o).stl++; match.shot = 24; callout('INTERCEPTED!', 'ice'); SFX.steal(); return; }
        }
      }
      const to = P.to;
      if (to.state !== 'down') {
        // steer toward the receiver's hands
        const rem = Math.max(0.05, P.T - P.t);
        const hx = to.x + to.face * 0.6, hz = to.z, hy = to.y + to.h * 0.75;
        b.vx = (hx - b.x) / rem; b.vz = (hz - b.z) / rem; b.vy = (hy - b.y) / rem + 0.5 * BGRAV * rem;
        if (hyp(to.x - b.x, to.z - b.z) < 2.4 && Math.abs(b.y - hy) < 3) { giveBall(to); if (!P.inbound) { to.astFrom = P.from; to.astT = time; } return; }
        if (P.t > P.T + 0.6) { giveBall(to); if (!P.inbound) { to.astFrom = P.from; to.astT = time; } return; }
      } else if (P.t > P.T + 0.3) b.state = 'loose';
      if (b.y < 0.45) { b.y = 0.45; b.vy = Math.abs(b.vy) * 0.5; if (to.state === 'down') b.state = 'loose'; }
      return;
    }
    const px = b.x;
    b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= BGRAV * dt; b.y += b.vy * dt;
    if (b.state === 'dead') { b.vx *= 0.98; b.vz *= 0.98; }
    for (let i = 0; i < 2; i++) {
      const bx = BOARD_X[i];
      if ((px - bx) * (b.x - bx) < 0 && b.y > 9 && b.y < 13.5 && Math.abs(b.z - RIM_Z) < 3) { b.x = bx + (i === 0 ? 0.05 : -0.05); b.vx *= -0.55; SFX.board(); }
    }
    if (b.y < 0.45) {
      b.y = 0.45;
      if (Math.abs(b.vy) > 2) { if (Math.abs(b.vy) > 4 && Math.abs(b.x - camX) < 30) SFX.bounce(); b.vy = -b.vy * 0.62; } else b.vy = 0;
      b.vx *= 0.86; b.vz *= 0.86;
    }
    if (b.x < -2.5 || b.x > CL + 2.5) { b.x = clamp(b.x, -2.5, CL + 2.5); b.vx *= -0.5; }
    if (b.z < -2.5 || b.z > 52.5) { b.z = clamp(b.z, -2.5, 52.5); b.vz *= -0.5; }
    if (b.state === 'tip' && b.vy < 0 && b.y < 11.6) {
      const jumpers = players.filter(p => p.isJumper);
      const cont = jumpers.filter(p => reachOf(p) + 0.8 >= b.y);
      let win = null;
      if (cont.length === 1) win = cont[0];
      else if (cont.length === 2) win = reachOf(cont[0]) + rnd(0, 1.2) > reachOf(cont[1]) + rnd(0, 1.2) ? cont[0] : cont[1];
      else if (b.y < 8.2) win = pick(jumpers);
      if (win) { match.tipWinner = win.team; match.phase = 'live'; b.state = 'held'; b.holder = win; passBall(win, mateOf(win)); }
    }
  }

  function separate() {
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (a.state === 'dunk' || b.state === 'dunk') continue;
      const dx = b.x - a.x, dz = (b.z - a.z) * 1.4, L = hyp(dx, dz);
      if (L < 1.8 && L > 0.001) {
        let wa = 0.5, wb = 0.5;
        if (ball.holder === a && b.team !== a.team) { wa = 0.85; wb = 0.15; }
        else if (ball.holder === b && a.team !== b.team) { wa = 0.15; wb = 0.85; }
        const push = 1.8 - L;
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
    callouts = callouts.filter(c => c.t < 1.4);
    for (const q of particles) { q.t += dt; q.x += q.vx * dt; q.z += q.vz * dt; q.vy -= q.g * dt; q.y = Math.max(0, q.y + q.vy * dt); }
    particles = particles.filter(q => q.t < q.life);

    if (screen === 'title') { camX = MID + Math.sin(time * 0.3) * 18; return; }
    if (screen !== 'play' || paused) return;

    const hIt = readInput();
    for (const p of players) applyIntent(p, p.human && !inInb(p) ? hIt : aiIntent(p, dt), dt);
    for (const p of players) updatePlayer(p, dt);
    separate();
    for (const p of players) p.pose = PUP.blend(p.pose, poseFor(p), p.state === 'run' && hyp(p.vx, p.vz) > 2 ? 0.5 : 0.3);
    updateBall(dt);
    grabCheck();
    if (ball.holder && ball.holder.fire && Math.random() < 0.8) particles.push({ x: ball.x, y: ball.y, z: ball.z, vx: rnd(-1, 1), vy: rnd(2, 6), vz: 0, life: rnd(0.2, 0.45), t: 0, c: pick(['#ff4a1c', '#ffb02e', '#fff1a0']), g: -4 });
    if (ball.state === 'shot' && ball.shot.shooter.fire) particles.push({ x: ball.x, y: ball.y, z: ball.z, vx: rnd(-1, 1), vy: rnd(0, 2), vz: 0, life: 0.35, t: 0, c: pick(['#ff4a1c', '#ffb02e', '#fff1a0']), g: -2 });

    if (match.phase === 'live') {
      match.clock = Math.max(0, match.clock - dt);
      if (ball.state !== 'shot') match.shot -= dt;
      if (match.clock <= 0 && !match.buzzer) {
        match.buzzer = true; SFX.buzzer();
        if (ball.state !== 'shot') { match.phase = 'over'; match.phaseT = 1.4; }
      } else if (match.buzzer && ball.state !== 'shot' && match.phase === 'live') { match.phase = 'over'; match.phaseT = 1.4; }
      if (match.phase === 'live' && match.shot <= 0 && ball.state !== 'shot') {
        SFX.whistle(); callout('SHOT CLOCK!', 'red');
        const t = 1 - possTeam();
        const tm = players.filter(p => p.team === t);
        const r = tm.reduce((a, b) => (d2(b, ball) < d2(a, ball) ? b : a));
        players.forEach(p => { if (p.state !== 'run') { p.state = 'run'; p.y = 0; p.dunk = null; } });
        giveBall(r); r.inboundT = 0.5; match.shot = 24;
      }
    } else if (match.phase === 'dead') {
      match.phaseT -= dt;
      if (match.clock <= 0 && match.buzzer) { match.phase = 'over'; match.phaseT = 1.4; }
      else updateInbound(dt);
    } else if (match.phase === 'over') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) endQuarter();
    }

    let tx = ball.x;
    if (ball.holder) tx = ball.holder.x + match.dir[ball.holder.team] * 6;
    if (match.phase === 'tip') tx = MID;
    camX += (tx - camX) * Math.min(1, dt * 5);
    // tilt the camera up to keep a high-flying dunker on screen
    let ty = 0;
    for (const p of players) if (p.state === 'dunk' || p.state === 'hang') {
      const [, hy] = proj(p.x, p.y + p.h * 1.3, p.z);
      ty = Math.max(ty, 48 - hy);
    }
    camY += (Math.min(ty, 90) - camY) * Math.min(1, dt * (ty > camY ? 7 : 3));
    const half = (W / 2) / sAt(50);
    camX = clamp(camX, half - 1.5, CL - half + 1.5);
    updateButtonLabels();
  }

  function endQuarter() {
    if (match.q >= 4 && match.score[0] !== match.score[1]) { screen = 'final'; SFX.crowd(true); }
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
      ctx.drawImage(tex, 0, Math.floor((z - floor.TZ0) * ppf), tex.width, 1, W / 2 + (floor.TX0 - camX) * s, ry, (floor.TX1 - floor.TX0) * s, 1);
    }
    // overhead light glare on the varnish
    const gl = ctx.createLinearGradient(0, y0, 0, H);
    gl.addColorStop(0, 'rgba(255,250,235,0.16)'); gl.addColorStop(0.35, 'rgba(255,250,235,0.03)'); gl.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = gl; ctx.fillRect(0, y0, W, H - y0);
    for (let lx = -20; lx < CL + 20; lx += 14) {
      const [sx] = proj(lx, 0, 10);
      if (sx < -30 || sx > W + 30) continue;
      const g2 = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0);
      g2.addColorStop(0, 'rgba(255,255,240,0)'); g2.addColorStop(0.5, 'rgba(255,255,240,0.07)'); g2.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g2; ctx.fillRect(sx - 14, y0, 28, 70);
    }
  }
  function led(str, x, y, col, align) {
    ctx.save(); ctx.font = '11px Anton, sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.shadowColor = col; ctx.shadowBlur = 4; ctx.fillStyle = col; ctx.fillText(str, x, y); ctx.restore();
  }
  function drawStands() {
    const img = stands.frames[crowdHype > 0 && Math.floor(time * 8) % 2 ? 1 : 0];
    ctx.drawImage(img, Math.round(W / 2 + (stands.SX0 - camX) * stands.SS), 0);
    // hanging scoreboard with the live score
    const sx = Math.round(W / 2 + (MID - camX) * stands.SS);
    if (sx > -60 && sx < W + 60) {
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(sx - 20, 0, 2, 34); ctx.fillRect(sx + 18, 0, 2, 34);
      ctx.fillStyle = '#100818'; ctx.fillRect(sx - 38, 33, 76, 32);
      const bg = ctx.createLinearGradient(0, 34, 0, 64); bg.addColorStop(0, '#26262e'); bg.addColorStop(1, '#101014');
      ctx.fillStyle = bg; ctx.fillRect(sx - 37, 34, 74, 30);
      const m = Math.floor(Math.ceil(match.clock) / 60), s = Math.ceil(match.clock) % 60;
      led(String(match.score[0]), sx - 24, 38, '#ff3b2f', 'center');
      led(String(match.score[1]), sx + 24, 38, '#ff3b2f', 'center');
      led(m + ':' + String(s).padStart(2, '0'), sx, 38, '#ffcc33', 'center');
      led(match.q > 4 ? 'OT' : String(match.q), sx, 51, '#4cff6a', 'center');
      ctx.fillStyle = '#c8c8d0'; ctx.font = '6px Anton, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('HOME', sx - 24, 54); ctx.fillText('VISITOR', sx + 24, 54);
    }
  }
  function drawBasketFrame(i) {
    const bx = BOARD_X[i], dirIn = i === 0 ? 1 : -1;
    const [tx, ty] = proj(bx, 13.6, RIM_Z);
    if (tx < -80 || tx > W + 80) return;
    const back = proj(bx - dirIn * 3, 13.6, RIM_Z);
    ctx.strokeStyle = '#5d5a66'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx - 6, ty); ctx.lineTo(tx - 6, 0); ctx.moveTo(tx + 6, ty); ctx.lineTo(tx + 6, 0);
    ctx.moveTo(back[0], back[1] - 8); ctx.lineTo(back[0], 0);
    ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#8e8b96';
    ctx.beginPath();
    for (let y = ty; y > 0; y -= 22) { ctx.moveTo(tx - 6, y); ctx.lineTo(tx + 6, y - 22); ctx.moveTo(tx + 6, y); ctx.lineTo(tx - 6, y - 22); }
    ctx.moveTo(tx, ty - 6); ctx.lineTo(back[0], back[1] - 8);
    ctx.stroke();
  }
  function drawBasket(i, front) {
    const bx = BOARD_X[i], rx = RIMX[i], dirIn = i === 0 ? 1 : -1;
    const [cx, cy, s] = proj(bx, 9, RIM_Z);
    if (cx < -100 || cx > W + 100) return;
    const bw = 3.2 * s, bh = 3.6 * s;
    const skew = clamp((bx - camX) * 0.015, -0.4, 0.4) * s;
    const [rcx, rcy, rs] = proj(rx, RIM_Y, RIM_Z);
    const rw = 1.5 * rs, rh = 0.5 * rs;
    const sh = netShake[i] > 0 ? Math.sin(time * 60) * netShake[i] * 3 : 0;
    if (!front) {
      ctx.save(); ctx.translate(cx, cy);
      ctx.beginPath(); ctx.moveTo(-bw / 2 + skew, -bh); ctx.lineTo(bw / 2 + skew, -bh); ctx.lineTo(bw / 2, 0); ctx.lineTo(-bw / 2, 0); ctx.closePath();
      const gg = ctx.createLinearGradient(-bw / 2, -bh, bw / 2, 0);
      gg.addColorStop(0, 'rgba(235,245,255,0.5)'); gg.addColorStop(0.5, 'rgba(190,220,255,0.22)'); gg.addColorStop(1, 'rgba(235,245,255,0.45)');
      ctx.fillStyle = gg; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2;
      ctx.strokeRect(-bw * 0.2 + skew * 0.35, -bh * 0.52, bw * 0.4, bh * 0.38);
      ctx.fillStyle = '#5b2d8e'; ctx.fillRect(-bw / 2, -2, bw, 4);
      ctx.restore();
      ctx.strokeStyle = '#b8481a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(rcx, rcy, rw / 2, rh / 2, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#9a9aa4'; ctx.fillRect(Math.min(cx, rcx - dirIn * rw / 2), rcy - 1.5, Math.abs(rcx - dirIn * rw / 2 - cx), 3);
      return;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1;
    const nb = 1.6 * rs;
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) { ctx.moveTo(rcx + k * rw / 7, rcy + rh / 3); ctx.lineTo(rcx + k * rw / 11 + sh * 0.5, rcy + nb + sh); }
    for (let r = 1; r <= 3; r++) { const yy = rcy + nb * r / 3.3 + sh * r / 3, ww = rw / 2 * (1 - r * 0.14); ctx.moveTo(rcx - ww, yy); ctx.lineTo(rcx + ww, yy); }
    ctx.stroke();
    ctx.strokeStyle = '#ff6a1c'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(rcx, rcy, rw / 2, rh / 2, 0, 0, Math.PI); ctx.stroke();
  }

  function poseFor(p) {
    const P = PUP.P;
    switch (p.state) {
      case 'dunk': {
        const u = Math.min(1, p.t / p.dunk.T), e = p.dunkE || 0, pz = P.dunk(u);
        const ty = p.dunk.type;
        if (ty === 'windmill') { pz.armF = [Math.PI + e * Math.PI * 2, 0.1]; pz.armB = [1.2, 0.8]; }
        else if (ty === 'tomahawk') { const a = 3.9 - 1.6 * u * u; pz.armF = [a, 0.25]; pz.armB = [a - 0.25, 0.35]; }
        else if (ty === 'soar') { pz.legF = [1.25, 0.35]; pz.legB = [-0.7, 0.6]; pz.armF = [1.9 + 0.8 * u, 0.1]; pz.armB = [-0.9, 0.5]; pz.lean = 0.15; }
        return pz;
      }
      case 'hang': return P.hang();
      case 'shoot': return ball.holder === p ? P.jump() : P.shotFollow();
      case 'layup': return P.layup();
      case 'air': return ball.holder === p ? P.jump() : (ball.state === 'loose' ? P.rebound() : P.block());
      case 'down': return P.down();
    }
    if (p.stealT > 0) return P.steal();
    const hasBall = ball.holder === p;
    if (hasBall && p.gather != null) return P.fake(Math.min(1, p.gather / GATHER));
    if (hasBall && p.fakeT > 0) return P.fake(Math.max(0, 1 - Math.abs(p.fakeT - 0.18) / 0.18));
    if (hasBall && p.pickedUp && match.phase === 'live') return P.fake(0.3); // dribble picked up: ball held at the chest
    if (hasBall && match.phase === 'dead') {
      // carrying the dead ball out of bounds with both hands
      const pz = hyp(p.vx, p.vz) > 2 ? P.run(p.anim, true, false) : P.stand(time);
      pz.armF = [1.25, 0.55]; pz.armB = [1.1, 0.65];
      return pz;
    }
    const sp = hyp(p.vx, p.vz);
    if (sp > 2) return P.run(p.anim, p.usingTurbo, hasBall);
    if (hasBall) return P.dribbleStand(ball.dribPhase);
    if (p.celebT > 0 && match.phase === 'dead') return P.celebrate(time * 6);
    const h = ball.holder;
    if (h && h.team !== p.team && d2(h, p) < 10) return P.defend(time * 5);
    return P.stand(time + p.slot * 2);
  }

  function drawPlayer(p, reflect) {
    const [sx, sy, s] = proj(p.x, p.y, p.z);
    if (sx < -80 || sx > W + 80) return;
    const S = s * p.h / 6.5;
    const pose = p.pose || poseFor(p);
    ctx.save();
    if (reflect) {
      const fy = proj(p.x, 0, p.z)[1];
      ctx.globalAlpha = 0.16;
      ctx.translate(Math.round(sx), fy + (fy - sy) * 0.55);
      ctx.scale(1, -0.55);
    } else ctx.translate(Math.round(sx), Math.round(sy));
    if (p.state === 'down') { ctx.translate(0, -0.5 * S); ctx.rotate(-p.face * Math.PI / 2 * Math.min(1, p.t * 6)); }
    if (p.spin) { ctx.translate(0, -3.2 * S); ctx.rotate(p.spin * p.face); ctx.translate(0, 3.2 * S); }
    if (p.hturn) { const c = Math.cos(p.hturn); ctx.scale(Math.abs(c) < 0.24 ? 0.24 * Math.sign(c || 1) : c, 1); } // body spinning around
    PUP.draw(ctx, p.look, pose, S, p.face, { flat: reflect });
    ctx.restore();
    if (reflect) return;
    if (p.fire && Math.random() < 0.6) particles.push({ x: p.x + rnd(-0.6, 0.6), y: p.y + rnd(0, p.h), z: p.z, vx: 0, vy: rnd(2, 6), vz: 0, life: 0.3, t: 0, c: pick(['#ff4a1c', '#ffb02e']), g: -3 });
    if (p.human) {
      const hy = sy - p.h * 1.08 * s - 14;
      ctx.fillStyle = '#100818'; ctx.beginPath(); ctx.moveTo(sx - 6, hy - 1); ctx.lineTo(sx + 6, hy - 1); ctx.lineTo(sx, hy + 7); ctx.fill();
      ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.moveTo(sx - 4, hy); ctx.lineTo(sx + 4, hy); ctx.lineTo(sx, hy + 5); ctx.fill();
      TXT.draw(ctx, 'P1', sx, hy - 13, { size: 11, align: 'center', fill: 'gold', shadow: false });
    }
  }
  function drawShadow(x, z, w, a = 0.33) {
    const [sx, sy, s] = proj(x, 0, z);
    ctx.fillStyle = `rgba(30,15,5,${a})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, w * s / 2, w * s * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawBall(reflect) {
    const [sx, sy, s] = proj(ball.x, ball.y, ball.z);
    const img = ARENA.ball(0.42 * s);
    if (reflect) {
      const fy = proj(ball.x, 0, ball.z)[1];
      ctx.globalAlpha = 0.18; ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(fy + (fy - sy) * 0.55 - img.height / 2)); ctx.globalAlpha = 1;
      return;
    }
    ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height / 2));
  }

  function drawWorld() {
    ctx.fillStyle = '#121016'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(Math.round(rnd(-3, 3)), Math.round(rnd(-3, 3)));
    if (camY > 0.5) {
      ctx.translate(0, Math.round(camY));
      const rg = ctx.createLinearGradient(0, -camY, 0, 0); rg.addColorStop(0, '#0c0b10'); rg.addColorStop(1, '#15131b');
      ctx.fillStyle = rg; ctx.fillRect(-10, -camY - 4, W + 20, camY + 6);
    }
    drawStands();
    drawFloor();
    drawBasketFrame(0); drawBasketFrame(1);
    const inGame = screen !== 'title' && players.length;
    if (inGame) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, FY0 - 4 * SL, W, H); ctx.clip();
      for (const p of players) drawPlayer(p, true);
      drawBall(true);
      ctx.restore();
      for (const p of players) drawShadow(p.x, p.z, 2.6, p.y > 0 ? 0.2 : 0.34);
      if (ball.state !== 'held' || ball.holder.state === 'run') drawShadow(ball.x, ball.z, 1.0, 0.28);
    }
    const objs = [{ z: RIM_Z - 0.01, f: () => drawBasket(0, false) }, { z: RIM_Z - 0.01, f: () => drawBasket(1, false) }];
    if (inGame) {
      for (const p of players) objs.push({ z: p.z, f: () => drawPlayer(p, false) });
      objs.push({ z: ball.z + (ball.holder ? 0.5 : 0), f: () => drawBall(false) });
    }
    objs.sort((a, b) => a.z - b.z);
    for (const o of objs) o.f();
    drawBasket(0, true); drawBasket(1, true);
    for (const q of particles) {
      const [sx, sy, s] = proj(q.x, q.y, q.z);
      ctx.globalAlpha = 1 - q.t / q.life;
      ctx.fillStyle = q.c; const sz = Math.max(2, Math.round(s * 0.28)); ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    const hg = ctx.createLinearGradient(0, 0, 0, 34);
    hg.addColorStop(0, 'rgba(8,4,16,0.92)'); hg.addColorStop(1, 'rgba(8,4,16,0.55)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 34);
    for (let t = 0; t < 2; t++) {
      const T = TEAMS[t], right = t === 1;
      ctx.fillStyle = T.primary; ctx.fillRect(right ? W - 150 : 0, 0, 150, 3);
      TXT.draw(ctx, String(match.score[t]), right ? W - 6 : 6, 3, { size: 24, align: right ? 'right' : 'left', fill: 'white' });
      TXT.draw(ctx, T.full + (t === match.human && !AUTO ? '  P1' : ''), right ? W - 44 : 44, 2, { size: 10, align: right ? 'right' : 'left', fill: t === match.human ? 'gold' : 'white', shadow: false });
      players.filter(p => p.team === t).forEach((p, i) => {
        const nx = right ? W - 44 - (i + 1) * 64 + 4 : 44 + i * 64;
        TXT.draw(ctx, p.d.name, nx, 14, { size: 9, fill: p.fire ? 'fire' : '#e8e8f0', shadow: false, strokeW: 2 });
        ctx.fillStyle = '#2a2a33'; ctx.fillRect(nx, 27, 56, 4);
        const tg = ctx.createLinearGradient(nx, 0, nx + 56, 0);
        if (p.fire) { tg.addColorStop(0, '#ff4a1c'); tg.addColorStop(1, '#ffd23c'); } else { tg.addColorStop(0, '#d8342c'); tg.addColorStop(1, '#4cff6a'); }
        ctx.fillStyle = tg; ctx.fillRect(nx, 27, Math.round(56 * p.turbo / 100), 4);
      });
    }
    const m = Math.floor(Math.ceil(match.clock) / 60), s = Math.ceil(match.clock) % 60;
    TXT.draw(ctx, m + ':' + String(s).padStart(2, '0'), W / 2, 1, { size: 20, align: 'center', fill: 'gold' });
    const qn = match.q > 4 ? 'OT' : ['', '1ST', '2ND', '3RD', '4TH'][match.q];
    const sc = Math.max(0, Math.ceil(match.shot));
    TXT.draw(ctx, qn + '   :' + String(sc).padStart(2, '0'), W / 2, 23, { size: 9, align: 'center', fill: sc <= 5 ? 'red' : 'white', shadow: false, strokeW: 2 });
  }

  function drawCallouts() {
    callouts.forEach((c, i) => {
      if (c.t > 1.15 && Math.floor(c.t * 12) % 2) return;
      const pop = c.t < 0.12 ? 1 + (0.12 - c.t) * 3 : 1;
      const size = Math.round((c.big ? 38 : 24) * pop);
      TXT.draw(ctx, c.text, W / 2, 66 + i * 40 - size * 0.15, { size, align: 'center', fill: c.fill, strokeW: size * 0.14 });
    });
  }

  // ---------- UI ----------
  function button(x, y, w, h, label, onTap, opt = {}) {
    const on = opt.enabled !== false;
    ctx.fillStyle = '#100818'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    const c = on ? (opt.color || '#5b2d8e') : '#444';
    bg.addColorStop(0, PUP.shade(c, 0.3)); bg.addColorStop(0.5, c); bg.addColorStop(1, PUP.shade(c, -0.35));
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    TXT.draw(ctx, label, x + w / 2, y + h / 2 - (opt.size || 12) * 0.62, { size: opt.size || 12, align: 'center', fill: on ? 'white' : '#888' });
    if (on) ui.push({ x, y, w, h, onTap });
  }
  function uiTap(cx, cy) {
    const r = cv.getBoundingClientRect();
    const x = (cx - r.left) / r.width * W, y = (cy - r.top) / r.height * H;
    for (let i = ui.length - 1; i >= 0; i--) {
      const b = ui[i];
      if (x >= b.x - 5 && x <= b.x + b.w + 5 && y >= b.y - 5 && y <= b.y + b.h + 5) { SFX.select(); b.onTap(); return; }
    }
  }
  function dim(a = 0.6) { ctx.fillStyle = `rgba(8,4,16,${a})`; ctx.fillRect(0, 0, W, H); }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;

  function drawFigure(look, pose, x, y, S, face) { ctx.save(); ctx.translate(x, y); PUP.draw(ctx, look, pose, S, face); ctx.restore(); }

  function renderTitle() {
    drawWorld();
    dim(0.5);
    drawFigure(looks[0][0], PUP.P.dunk(0.7), W * 0.18, 262, 13, 1);
    drawFigure(looks[1][0], PUP.P.block(), W * 0.82, 262, 13, -1);
    TXT.draw(ctx, 'HOOSIER', W / 2, 14, { size: 64, align: 'center', fill: 'gold', strokeW: 9 });
    TXT.draw(ctx, 'JAM', W / 2, 74, { size: 96, align: 'center', fill: 'fire', strokeW: 12 });
    const bimg = ARENA.ball(13); ctx.drawImage(bimg, W / 2 + 74, 128 - Math.abs(Math.sin(time * 4)) * 10);
    TXT.draw(ctx, 'THE MUNCIE SECTIONAL', W / 2, 188, { size: 20, align: 'center', fill: 'white' });
    TXT.draw(ctx, 'LIVE FROM THE FIELDHOUSE', W / 2, 213, { size: 12, align: 'center', fill: 'purple' });
    if (Math.floor(time * 2) % 2 === 0) TXT.draw(ctx, 'TAP TO START', W / 2, 236, { size: 22, align: 'center', fill: 'gold' });
    if (isIOS && !standalone()) TXT.draw(ctx, 'FOR FULL SCREEN: TAP SHARE, ADD TO HOME SCREEN, THEN OPEN HOOSIER JAM FROM YOUR HOME SCREEN', W / 2, 278, { size: 9, align: 'center', fill: 'white', strokeW: 2 });
    ui.push({ x: 0, y: 0, w: W, h: H, onTap: () => { goFullscreen(); screen = 'team'; } });
    button(W - 86, 6, 80, 20, SFX.isMuted() ? 'SOUND OFF' : 'SOUND ON', () => SFX.setMuted(!SFX.isMuted()), { color: '#333', size: 10 });
  }

  // ---------- school picker: choose your school, then your opponent ----------
  const teamSel = { mine: null, opp: null };
  function schoolTile(i, x, y, w, h, tag) {
    const S_ = SCHOOLS[i];
    const sel = tag != null;
    ctx.fillStyle = sel ? (tag === 'YOU' ? '#ffd23c' : '#ff5a4a') : '#100818'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, PUP.shade(S_.road.jersey, 0.15)); bg.addColorStop(1, PUP.shade(S_.road.jersey, -0.55));
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    S_.colors.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x + 6 + k * 14, y + h - 12, 12, 6); });
    ctx.fillStyle = S_.road.trim; ctx.fillRect(x, y, w, 3);
    TXT.draw(ctx, S_.city, x + w / 2, y + 7, { size: 15, align: 'center', fill: 'white', strokeW: 2.5 });
    TXT.draw(ctx, S_.mascot, x + w / 2, y + 27, { size: 10, align: 'center', fill: S_.road.trim === '#ffffff' || S_.road.trim === '#151515' ? '#e8e8f0' : S_.road.trim, shadow: false, strokeW: 2 });
    // team strength: 1 to 5 stars from the average rating
    const stars = Math.round((teamRating(S_) - 4.6) / 0.35);
    for (let k = 0; k < 5; k++) TXT.draw(ctx, '★', x + w - 52 + k * 9.5, y + h - 16, { size: 9, fill: k < clamp(stars, 1, 5) ? 'gold' : '#4a4060', shadow: false, strokeW: 1.5, italic: false });
    if (sel) {
      ctx.fillStyle = tag === 'YOU' ? '#d8342c' : '#2a2a33'; const tw = TXT.width(ctx, tag, 10) + 10;
      ctx.fillRect(x + w - tw - 2, y + 4, tw, 14); TXT.draw(ctx, tag, x + w - tw + 3, y + 5, { size: 10, fill: 'white', shadow: false, strokeW: 1.5 });
    }
  }
  function renderTeam() {
    drawWorld(); dim(0.74);
    const step = teamSel.mine == null ? 1 : 2;
    TXT.draw(ctx, step === 1 ? 'CHOOSE YOUR SCHOOL' : 'CHOOSE YOUR OPPONENT', W / 2, 4, { size: 24, align: 'center', fill: 'gold' });
    TXT.draw(ctx, step === 1 ? 'YOU WEAR THE HOME WHITES' : 'THE CPU WEARS ITS ROAD COLORS', W / 2, 32, { size: 10, align: 'center', fill: 'white', shadow: false, strokeW: 2 });
    const cols = 5, gap = 8, tw = Math.min(120, (W - 24 - gap * (cols - 1)) / cols), th = 74;
    const x0 = (W - (tw * cols + gap * (cols - 1))) / 2, y0 = 50;
    SCHOOLS.forEach((S_, i) => {
      const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + gap + 2);
      const tag = teamSel.mine === i && teamSel.opp === i ? 'BOTH' : teamSel.mine === i ? 'YOU' : teamSel.opp === i ? 'CPU' : null;
      schoolTile(i, x, y, tw, th, tag);
      ui.push({ x, y, w: tw, h: th, onTap: () => { if (step === 1) teamSel.mine = i; else teamSel.opp = i; } });
    });
    // matchup bar
    const by = y0 + 2 * (th + gap + 2) + 4;
    if (teamSel.mine != null) {
      const m = SCHOOLS[teamSel.mine], o = teamSel.opp != null ? SCHOOLS[teamSel.opp] : null;
      TXT.draw(ctx, m.city + ' ' + m.mascot + '  VS  ' + (o ? o.city + ' ' + o.mascot : '?'), W / 2, by, { size: 16, align: 'center', fill: 'white' });
      if (o) TXT.draw(ctx, o.blurb, W / 2, by + 21, { size: 10, align: 'center', fill: '#c9b3ff', shadow: false, strokeW: 2 });
    } else TXT.draw(ctx, 'TAP A SCHOOL', W / 2, by + 4, { size: 14, align: 'center', fill: '#c9b3ff' });
    const ready = teamSel.mine != null && teamSel.opp != null;
    button(W - 150, H - 36, 140, 28, 'NEXT: PLAYERS', () => {
      setMatchup(teamSel.mine, teamSel.opp);
      match.human = 0; pickSel = []; match.pickMode = 'pre'; screen = 'pick';
    }, { enabled: ready, color: '#d8342c', size: 13 });
    button(10, H - 36, 70, 28, 'BACK', () => {
      if (teamSel.opp != null) teamSel.opp = null; else if (teamSel.mine != null) teamSel.mine = null; else screen = 'title';
    }, { color: '#333', size: 12 });
    if (step === 2) button(90, H - 36, 96, 28, 'RANDOM', () => { teamSel.opp = Math.floor(Math.random() * SCHOOLS.length); }, { color: '#5b2d8e', size: 12 });
  }

  const RLAB = [['spd', 'SPEED'], ['sht', '2 PT'], ['thr', '3 PT'], ['dnk', 'DUNKS'], ['blk', 'BLOCKS'], ['stl', 'STEALS']];
  const feet = h => { const inches = Math.round(h * 12); return Math.floor(inches / 12) + "'" + (inches % 12) + '"'; };
  function renderPick() {
    drawWorld(); dim(0.78);
    const T = TEAMS[match.human], half = match.pickMode === 'half';
    TXT.draw(ctx, half ? 'HALFTIME: PICK YOUR 2' : 'PICK YOUR 2 PLAYERS', W / 2, 4, { size: 24, align: 'center', fill: 'gold' });
    TXT.draw(ctx, 'FIRST PICK IS YOU. SECOND PICK IS YOUR CPU TEAMMATE.', W / 2, 33, { size: 10, align: 'center', fill: 'white', shadow: false, strokeW: 2 });
    const cw = Math.min(196, (W - 40) / 3), gap = 10, x0 = (W - (cw * 3 + gap * 2)) / 2;
    T.players.forEach((pd, j) => {
      const x = x0 + j * (cw + gap), y = 52, h = 196;
      const si = pickSel.indexOf(j);
      ctx.fillStyle = si >= 0 ? '#ffd23c' : '#100818'; ctx.fillRect(x - 3, y - 3, cw + 6, h + 6);
      const bg = ctx.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#2a1d44'); bg.addColorStop(1, '#140c22');
      ctx.fillStyle = bg; ctx.fillRect(x, y, cw, h);
      ctx.fillStyle = T.primary; ctx.fillRect(x, y, cw, 4);
      drawFigure(looks[match.human][j], PUP.P.stand(), x + 34, y + 108, 13.5 * pd.h / 6.5, 1);
      TXT.draw(ctx, '"' + pd.nick + '"', x + 62, y + 10, { size: 11, fill: 'gold', shadow: false, strokeW: 2 });
      TXT.draw(ctx, pd.name, x + 62, y + 26, { size: 15, fill: 'white', shadow: false, strokeW: 2 });
      TXT.draw(ctx, '#' + pd.num + '   ' + feet(pd.h), x + 62, y + 46, { size: 11, fill: '#cfcfe0', shadow: false, strokeW: 2 });
      if (si >= 0) {
        const tag = si === 0 ? 'YOU' : 'TEAMMATE';
        ctx.fillStyle = si === 0 ? '#d8342c' : '#2a62c9'; ctx.fillRect(x + 62, y + 64, TXT.width(ctx, tag, 11) + 12, 16);
        TXT.draw(ctx, tag, x + 66, y + 65, { size: 11, fill: 'white', shadow: false, strokeW: 2 });
      }
      RLAB.forEach(([k, lab], r) => {
        const ry = y + 114 + r * 13;
        TXT.draw(ctx, lab, x + 8, ry - 1, { size: 9, fill: '#cfcfe0', shadow: false, strokeW: 1.5, italic: false });
        const bw = cw - 62;
        for (let n = 0; n < 10; n++) {
          ctx.fillStyle = n < pd.r[k] ? (pd.r[k] >= 8 ? '#4cff6a' : pd.r[k] >= 5 ? '#ffd23c' : '#ff6a4a') : '#3a3050';
          ctx.fillRect(x + 54 + n * (bw / 10), ry, bw / 10 - 1.5, 8);
        }
      });
      ui.push({ x, y, w: cw, h, onTap: () => {
        const i = pickSel.indexOf(j);
        if (i >= 0) pickSel.splice(i, 1); else if (pickSel.length < 2) pickSel.push(j); else pickSel[1] = j;
      } });
    });
    button(W / 2 - 75, H - 42, 150, 30, half ? 'START 3RD QTR' : 'TIP OFF!', () => {
      match.picks[match.human] = pickSel.slice();
      match.picks[1 - match.human] = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, 2);
      if (half) { setupPlayers(); startQuarter(); screen = 'play'; } else startGame();
      elControls.classList.add('on'); elPause.classList.add('on');
    }, { enabled: pickSel.length === 2, color: '#d8342c', size: 16 });
    if (!half) button(8, H - 38, 60, 24, 'BACK', () => { screen = 'team'; }, { color: '#333', size: 11 });
  }

  // ---------- box score ----------
  function lineScore(y) {
    const nq = Math.max(4, match.q);
    const colW = 34, tx0 = 150, x0 = W / 2 - (tx0 + (Math.max(4, nq) + 1) * colW) / 2 + 8, tx = x0 + tx0;
    const head = ['1', '2', '3', '4'].concat(nq > 4 ? Array.from({ length: nq - 4 }, (_, i) => nq > 5 ? 'OT' + (i + 1) : 'OT') : []);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 - 8, y - 3, 150 + (head.length + 1) * colW + 16, 50);
    head.forEach((h, i) => TXT.draw(ctx, h, tx + i * colW, y, { size: 10, align: 'center', fill: '#b8b8c8', shadow: false, strokeW: 1.5, italic: false }));
    TXT.draw(ctx, 'T', tx + head.length * colW, y, { size: 10, align: 'center', fill: 'gold', shadow: false, strokeW: 1.5, italic: false });
    for (let t = 0; t < 2; t++) {
      const yy = y + 14 + t * 16;
      TXT.draw(ctx, TEAMS[t].full, x0, yy, { size: 12, fill: t === match.human ? 'gold' : 'white', shadow: false, strokeW: 2 });
      head.forEach((h, i) => { const v = match.qs[t][i]; const played = i < match.q; TXT.draw(ctx, played ? String(v || 0) : '-', tx + i * colW, yy, { size: 12, align: 'center', fill: 'white', shadow: false, strokeW: 2, italic: false }); });
      TXT.draw(ctx, String(match.score[t]), tx + head.length * colW, yy, { size: 12, align: 'center', fill: 'gold', shadow: false, strokeW: 2, italic: false });
    }
  }
  function boxScore(y) {
    const sc = Math.min(1, (W - 10) / 612);
    ctx.save(); ctx.translate(W / 2 - 300 * sc, y); ctx.scale(sc, sc);
    const x0 = 6; y = 0;
    const cols = [['PTS', 150], ['REB', 192], ['AST', 234], ['STL', 276], ['BLK', 318], ['FG', 372], ['FG%', 430], ['3PT', 488], ['3P%', 546]];
    const pct = (m, a) => a ? Math.round(m / a * 100) + '%' : '-';
    let yy = y;
    for (let t = 0; t < 2; t++) {
      const T = TEAMS[t];
      ctx.fillStyle = PUP.shade(T.primary, -0.45); ctx.fillRect(x0 - 6, yy - 2, 600, 14);
      TXT.draw(ctx, T.full, x0, yy, { size: 10, fill: 'white', shadow: false, strokeW: 1.5 });
      cols.forEach(([h, cx]) => TXT.draw(ctx, h, x0 + cx, yy, { size: 10, align: 'center', fill: 'gold', shadow: false, strokeW: 1.5, italic: false }));
      yy += 15;
      const tot = newStats();
      const active = players.filter(p => p.team === t).map(p => p.ri);
      T.players.forEach((pd, j) => {
        const S_ = match.stats[t][j];
        for (const k in tot) tot[k] += S_[k];
        const vals = [S_.pts, S_.reb, S_.ast, S_.stl, S_.blk, S_.fgm + '-' + S_.fga, pct(S_.fgm, S_.fga), S_.tpm + '-' + S_.tpa, pct(S_.tpm, S_.tpa)];
        TXT.draw(ctx, pd.name + (active.includes(j) ? '' : ' (BENCH)'), x0 + 6, yy, { size: 10, fill: active.includes(j) ? '#f0f0f6' : '#9a9aaa', shadow: false, strokeW: 1.5, italic: false });
        vals.forEach((v, i) => TXT.draw(ctx, String(v), x0 + cols[i][1], yy, { size: 10, align: 'center', fill: 'white', shadow: false, strokeW: 1.5, italic: false }));
        yy += 13;
      });
      const tv = [tot.pts, tot.reb, tot.ast, tot.stl, tot.blk, tot.fgm + '-' + tot.fga, pct(tot.fgm, tot.fga), tot.tpm + '-' + tot.tpa, pct(tot.tpm, tot.tpa)];
      TXT.draw(ctx, 'TEAM', x0 + 6, yy, { size: 10, fill: 'gold', shadow: false, strokeW: 1.5, italic: false });
      tv.forEach((v, i) => TXT.draw(ctx, String(v), x0 + cols[i][1], yy, { size: 10, align: 'center', fill: 'gold', shadow: false, strokeW: 1.5, italic: false }));
      yy += 19;
    }
    ctx.restore();
  }
  function renderQEnd() {
    drawWorld(); dim(0.82);
    const q = match.q;
    const title = q > 4 ? 'END OF OVERTIME' : q === 2 ? 'HALFTIME' : q >= 4 ? 'END OF REGULATION' : 'END OF THE ' + ['', '1ST', '2ND', '3RD'][q] + ' QUARTER';
    TXT.draw(ctx, title + (q >= 4 ? ': TIED, HEADED TO OVERTIME' : ''), W / 2, 2, { size: 20, align: 'center', fill: 'gold' });
    lineScore(32);
    boxScore(90);
    if (Math.floor(time * 2) % 2 === 0) TXT.draw(ctx, q === 2 ? 'TAP TO MAKE HALFTIME SUBS' : 'TAP TO CONTINUE', W / 2, H - 22, { size: 14, align: 'center', fill: 'gold' });
    ui.push({ x: 0, y: 0, w: W, h: H, onTap: () => {
      if (q === 2) { match.pickMode = 'half'; pickSel = match.picks[match.human].slice(); screen = 'pick'; return; }
      startQuarter(); screen = 'play'; elControls.classList.add('on'); elPause.classList.add('on');
    } });
  }
  function renderFinal() {
    drawWorld(); dim(0.82);
    const w = match.score[0] > match.score[1] ? 0 : 1;
    TXT.draw(ctx, 'FINAL:  ' + TEAMS[w].full + ' WIN!', W / 2, 2, { size: 20, align: 'center', fill: w === match.human ? 'green' : 'red' });
    lineScore(32);
    boxScore(90);
    button(W / 2 - 150, H - 30, 130, 24, 'REMATCH', () => { pickSel = []; match.pickMode = 'pre'; screen = 'pick'; }, { color: '#d8342c', size: 13 });
    button(W / 2 + 20, H - 30, 130, 24, 'NEW GAME', () => { screen = 'title'; }, { color: '#5b2d8e', size: 13 });
  }
  function renderPause() {
    dim(0.65);
    TXT.draw(ctx, 'PAUSED', W / 2, 40, { size: 40, align: 'center', fill: 'gold' });
    button(W / 2 - 80, 98, 160, 28, 'RESUME', () => { paused = false; }, { color: '#d8342c', size: 14 });
    button(W / 2 - 80, 134, 160, 28, SFX.isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => SFX.setMuted(!SFX.isMuted()), { color: '#333', size: 14 });
    button(W / 2 - 80, 170, 160, 28, 'EXIT TO TITLE', () => { paused = false; screen = 'title'; elControls.classList.remove('on'); elPause.classList.remove('on'); }, { color: '#5b2d8e', size: 14 });
    const lines = ['LEFT THUMB: MOVE.  RIGHT THUMB: SHOOT, PASS, TURBO.', 'HOLD TURBO AND HIT SHOOT NEAR THE RIM TO DUNK.', 'DEFENSE: STEAL, JUMP TO BLOCK, TURBO + STEAL TO SHOVE.', 'HOLD SHOOT TO JUMP, LET GO AT THE TOP. TAP SHOOT TO PUMP FAKE.'];
    lines.forEach((l, i) => TXT.draw(ctx, l, W / 2, 212 + i * 15, { size: 10, align: 'center', fill: 'white', shadow: false, strokeW: 2 }));
  }

  function render() {
    ui = [];
    ctx.imageSmoothingEnabled = true;
    if (screen === 'title') return renderTitle();
    if (screen === 'team') return renderTeam();
    if (screen === 'pick') return renderPick();
    if (screen === 'qend') return renderQEnd();
    if (screen === 'final') return renderFinal();
    elControls.classList.toggle('on', !paused);
    const pl = paused ? 'RESUME' : 'II PAUSE'; if (elPause.textContent !== pl) elPause.textContent = pl;
    drawWorld();
    drawHUD();
    drawCallouts();
    if (paused) renderPause();
  }

  // ---------- fullscreen + sizing ----------
  function goFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { window.screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
    } catch (e) {}
  }
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    W = Math.round(clamp(H * vw / vh, 460, 700));
    cv.width = W; cv.height = H;
    let cw = vw, ch = vw * H / W;
    if (ch > vh) { ch = vh; cw = vh * W / H; }
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.style.left = (vw - cw) / 2 + 'px'; cv.style.top = (vh - ch) / 2 + 'px';
    placeStick(...defaultStickPos());
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();
  elBtn.shoot.style.cssText = 'right: calc(18px + env(safe-area-inset-right)); bottom: calc(22px + env(safe-area-inset-bottom));';
  elBtn.pass.style.cssText = 'right: calc(124px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom));';
  elBtn.turbo.style.cssText = 'right: calc(52px + env(safe-area-inset-right)); bottom: calc(124px + env(safe-area-inset-bottom));';

  // ---------- main loop ----------
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt * (window.HJ_SPEED || 1);
    let n = 0;
    while (acc >= STEP && n < 40) { step(STEP); acc -= STEP; n++; }
    if (n >= 40) acc = 0;
    render();
    requestAnimationFrame(frame);
  }
  TXT.ready.then(() => { buildArena(); stands = ARENA.buildStands(sAt(-4), STAND_H, TEAMS[0], TEAMS[1]); last = performance.now(); requestAnimationFrame(frame); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') paused = true; });

  if (AUTO) {
    const a2 = Math.floor(Math.random() * SCHOOLS.length); let b2 = Math.floor(Math.random() * SCHOOLS.length);
    setMatchup(a2, b2); match.human = 0; match.picks = [[0, 1], [1, 2]]; startGame(); elControls.classList.add('on'); elPause.classList.add('on'); }
  window.HJ = { stepN: n => { for (let i = 0; i < n; i++) step(1 / 60); }, setMatchup, match, ball, get players() { return players; }, get screen() { return screen; }, set screen(v) { screen = v; }, startQuarter, setupPlayers, startGame, get paused() { return paused; }, set paused(v) { paused = v; } };
})();
