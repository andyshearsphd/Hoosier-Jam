// Hoosier Jam: procedural pixel art (players, ball, Fieldhouse floor and stands)
'use strict';
const ART = (() => {
  const OUTLINE = '#140c1c';
  const MINI = {
    '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111',
    '4':'101101111001001','5':'111100111001111','6':'111100111101111','7':'111001001001001',
    '8':'111101111101111','9':'111101111001111',':':'000010000010000','-':'000000111000000',' ':'000000000000000'
  };
  function miniText(g, str, x, y, color, px = 1) {
    g.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const m = MINI[str[i]] || MINI[' '];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (m[r * 3 + c] === '1') g.fillRect(x + (i * 4 + c) * px, y + r * px, px, px);
    }
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  // seeded random so the arena looks the same each load
  let seed = 1234567;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  const SKIN = {
    light: ['#f1c9a2', '#c99872'], tan: ['#dba26a', '#a9744a'], medium: ['#b47c4c', '#835631'],
    brown: ['#8c5b35', '#633f20'], dark: ['#5f3b21', '#3f2513']
  };
  const HAIR = { black: '#1d1512', brown: '#5b3719', blond: '#e6c461', red: '#b14a1e', gray: '#9a9a9a' };

  // ---------- Player sprites ----------
  const SW = 28, SH = 60;
  const POSES = {
    stand:  { legs: [[12, 12, 11, 55], [15, 15, 16, 55]], back: [10, 9, 30, 9, 35], front: [17, 18, 30, 18, 35] },
    r0:     { legs: [[12, 9, 6, 54], [15, 19, 21, 55]], back: [10, 15, 29, 21, 31], front: [17, 12, 30, 7, 33] },
    r1:     { legs: [[12, 13, 12, 55], [15, 17, 14, 52]], back: [10, 10, 30, 12, 35], front: [17, 18, 30, 17, 35] },
    r2:     { legs: [[12, 15, 18, 55], [15, 13, 9, 54]], back: [10, 9, 30, 7, 33], front: [17, 20, 29, 21, 31] },
    r3:     { legs: [[12, 14, 11, 52], [15, 15, 16, 55]], back: [10, 10, 30, 12, 35], front: [17, 18, 30, 17, 35] },
    jump:   { legs: [[12, 11, 10, 55], [15, 17, 15, 53]], back: [11, 13, 16, 15, 9], front: [17, 18, 16, 18, 9] },
    dunk:   { legs: [[12, 10, 8, 54], [15, 18, 16, 52]], back: [11, 19, 18, 22, 11], front: [17, 21, 17, 24, 10] },
    block:  { legs: [[12, 12, 11, 55], [15, 15, 16, 55]], back: [11, 12, 14, 13, 5], front: [17, 17, 14, 17, 5] },
    defend: { legs: [[12, 10, 8, 55], [15, 18, 20, 55]], back: [10, 6, 26, 3, 22], front: [17, 22, 26, 25, 22] },
    steal:  { legs: [[12, 9, 6, 54], [15, 19, 21, 55]], back: [10, 9, 30, 9, 35], front: [17, 21, 30, 26, 32] },
  };
  const DRIB_ARM = [17, 20, 30, 22, 34];

  function buildFrame(look, pose, dribble, flip) {
    const grid = new Array(SW * SH).fill(null);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < SW && y < SH) grid[y * SW + x] = c; };
    const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
    const [skin, skinD] = SKIN[look.skin] || SKIN.tan;
    const hair = HAIR[look.hairColor] || HAIR.black;
    const jer = look.jersey, jerD = shade(jer, -0.3), trim = look.trim, shorts = look.shorts || jer;
    const P = POSES[pose];

    const leg = (L, dark) => {
      const [hx, kx, fx, fy] = L;
      const ky = Math.round((43 + fy) / 2 - 1);
      const sk = dark ? skinD : skin;
      const sockTop = fy - 4;
      const seg = (x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) {
          const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
          const x = x0 + (x1 - x0) * t;
          const col = y >= sockTop ? (y === sockTop + 1 || y === sockTop + 3 ? jer : '#f2f2f2') : sk;
          rect(Math.round(x) - 1, y, Math.round(x) + 1, y, col);
        }
      };
      seg(hx, 43, kx, ky); seg(kx, ky, fx, fy);
      const shoe = dark ? '#cfcfd6' : '#f7f7f7';
      rect(fx - 2, fy + 1, fx + 3, fy + 3, shoe);
      rect(fx - 2, fy + 4, fx + 3, fy + 4, '#6a6a74');
      set(fx + 3, fy + 1, null);
    };
    const arm = (A, dark) => {
      const [sx, ex, ey, hx, hy] = A;
      const sk = dark ? skinD : skin;
      const line = (x0, y0, x1, y1) => {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
        for (let i = 0; i <= n; i++) { const t = i / n; rect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), Math.round(x0 + (x1 - x0) * t) + 1, Math.round(y0 + (y1 - y0) * t) + 1, sk); }
      };
      line(sx, 24, ex, ey); line(ex, ey, hx, hy);
      rect(hx - 1, hy - 1, hx + 1, hy + 1, sk);
    };

    arm(P.back, true);
    leg(P.legs[0], true);
    // torso / jersey (tank top)
    rect(10, 23, 17, 36, jer);
    rect(9, 26, 9, 36, trim); rect(18, 26, 18, 36, trim);
    rect(10, 23, 10, 36, jerD);
    set(13, 23, trim); set(14, 23, trim); set(13, 24, trim); set(14, 24, trim);
    rect(9, 36, 18, 36, trim);
    // shorts
    rect(9, 37, 18, 42, shorts);
    rect(9, 37, 18, 37, trim);
    rect(9, 38, 9, 42, trim); rect(18, 38, 18, 42, trim);
    rect(10, 38, 10, 42, shade(shorts, -0.3));
    leg(P.legs[1], false);
    // neck + head
    rect(12, 21, 15, 22, skinD);
    const headRows = [[11, 16], [10, 17], [9, 18], [9, 18], [9, 18], [9, 18], [9, 18], [9, 18], [9, 18], [10, 17], [11, 16]];
    headRows.forEach(([a, b], i) => rect(a, 10 + i, b, 10 + i, skin));
    rect(9, 13, 11, 18, skinD);
    set(12, 14, skinD); set(12, 15, skinD);
    set(19, 15, skin); set(19, 16, skin); set(19, 17, skinD);
    set(16, 14, '#1a1010'); set(16, 15, '#1a1010'); set(17, 14, '#ffffff');
    set(17, 18, '#7a2a2a'); set(18, 18, '#7a2a2a');
    // hair
    const hs = look.hair;
    if (hs === 'afro') {
      for (let y = 4; y <= 17; y++) for (let x = 4; x <= 21; x++) {
        const dx = (x - 12.5) / 8, dy = (y - 11) / 7;
        if (dx * dx + dy * dy <= 1 && !(x >= 14 && y >= 13)) set(x, y, (x + y) % 5 === 0 ? shade(hair, 0.15) : hair);
      }
      rect(14, 12, 18, 12, hair);
    } else if (hs === 'flattop') {
      rect(10, 6, 17, 11, hair); rect(9, 12, 11, 14, hair); rect(10, 6, 17, 6, shade(hair, 0.2));
    } else if (hs === 'mullet') {
      rect(10, 9, 17, 11, hair); rect(9, 10, 11, 21, hair); rect(8, 15, 9, 22, hair); rect(17, 12, 18, 12, hair);
    } else if (hs === 'parted') {
      rect(10, 9, 18, 11, hair); rect(9, 11, 11, 15, hair); rect(17, 12, 18, 12, hair); set(13, 9, shade(hair, 0.3));
    } else if (hs === 'bald') {
      set(14, 11, shade(skin, 0.35)); set(15, 11, shade(skin, 0.35));
    } else { // short
      rect(10, 9, 17, 11, hair); rect(9, 11, 11, 14, hair);
    }
    if (look.stache) rect(16, 17, 18, 17, hair);
    if (look.headband) rect(9, 12, 18, 12, look.headband);
    set(15, 13, hair); set(16, 13, hair); set(17, 13, hair);
    // front arm last
    arm(dribble ? DRIB_ARM : P.front, false);

    // mirror for left-facing frames, then stamp the jersey number so it always reads correctly
    if (flip) {
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW / 2; x++) {
        const a = y * SW + x, b = y * SW + (SW - 1 - x); const t = grid[a]; grid[a] = grid[b]; grid[b] = t;
      }
    }
    const num = String(look.num);
    const nw = num.length * 4 - 1;
    const nx = flip ? (SW - 1 - 14) - Math.floor(nw / 2) : 14 - Math.floor(nw / 2);
    for (let i = 0; i < num.length; i++) {
      const m = MINI[num[i]];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (m[r * 3 + c] === '1') set(nx + i * 4 + c, 27 + r, look.numColor || trim);
    }
    // outline pass
    const out = grid.slice();
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (grid[y * SW + x]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < SW && yy < SH && grid[yy * SW + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * SW + x] = OUTLINE;
    }
    const c = mk(SW, SH), g = c.getContext('2d');
    for (let i = 0; i < out.length; i++) if (out[i]) { g.fillStyle = out[i]; g.fillRect(i % SW, (i / SW) | 0, 1, 1); }
    return c;
  }

  function buildPlayerSprites(look) {
    const out = {};
    for (const [side, flip] of [['R', false], ['L', true]]) {
      const f = {};
      for (const p of Object.keys(POSES)) f[p] = buildFrame(look, p, false, flip);
      for (const p of ['stand', 'r0', 'r1', 'r2', 'r3']) f[p + 'D'] = buildFrame(look, p, true, flip);
      out[side] = f;
    }
    return out;
  }

  // ---------- Ball ----------
  const balls = {};
  function ball(r) {
    r = Math.max(2, Math.min(7, Math.round(r)));
    if (balls[r]) return balls[r];
    const d = r * 2 + 3, c = mk(d, d), g = c.getContext('2d');
    const cx = d / 2, cy = d / 2;
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dd = dx * dx + dy * dy;
      if (dd <= (r + 1) * (r + 1)) {
        let col = '#e2722c';
        if (dd > r * r) col = OUTLINE;
        else if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) col = '#5a2a10';
        else if (dx < -r * 0.2 && dy < -r * 0.2) col = '#f4a060';
        else if (dx > r * 0.3 && dy > r * 0.3) col = '#b8541c';
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
    }
    return (balls[r] = c);
  }

  // ---------- Court floor (top-down texture, 8 px per foot) ----------
  const PPF = 8, TX0 = -24, TX1 = 118, TZ0 = -4, TZ1 = 52;
  function buildFloor() {
    seed = 99991;
    const W = (TX1 - TX0) * PPF, H = (TZ1 - TZ0) * PPF;
    const c = mk(W, H), g = c.getContext('2d');
    const X = x => (x - TX0) * PPF, Z = z => (z - TZ0) * PPF;
    // end-zone bleachers seen from above, beyond the baselines
    g.fillStyle = '#5c5f69'; g.fillRect(0, 0, W, H);
    for (let x = TX0; x < TX1; x += 1.6) {
      g.fillStyle = (Math.round(x / 1.6) % 2) ? '#878a95' : '#9fa2ab';
      g.fillRect(X(x), 0, 0.8 * PPF, H);
    }
    for (let i = 0; i < 1800; i++) {
      const left = srand() < 0.5;
      const x = left ? TX0 + srand() * 16 : 102 + srand() * 16;
      const z = TZ0 + srand() * (TZ1 - TZ0);
      g.fillStyle = ['#c8202f', '#ffffff', '#1f4fb8', '#f2c230', '#5b2d8e', '#333', '#7a6a5a'][Math.floor(srand() * 7)];
      g.fillRect(Math.round(X(x)), Math.round(Z(z)), 4, 4);
    }
    // wall bases at the ends
    g.fillStyle = '#efedf1'; g.fillRect(X(-8), 0, 2 * PPF, H); g.fillRect(X(100), 0, 2 * PPF, H);
    g.fillStyle = '#5b2d8e'; g.fillRect(X(-7.4), 0, 0.6 * PPF, H); g.fillRect(X(101), 0, 0.6 * PPF, H);
    // maple floor
    const fx0 = X(-6), fx1 = X(100);
    g.fillStyle = '#dcb274'; g.fillRect(fx0, 0, fx1 - fx0, H);
    for (let y = 0; y < H; y += 4) {
      g.fillStyle = srand() < 0.5 ? 'rgba(120,70,20,0.07)' : 'rgba(255,240,200,0.07)';
      g.fillRect(fx0, y, fx1 - fx0, 3);
      g.fillStyle = 'rgba(90,50,10,0.10)'; g.fillRect(fx0, y + 3, fx1 - fx0, 1);
      for (let x = fx0 + srand() * 60; x < fx1; x += 40 + srand() * 90) { g.fillStyle = 'rgba(90,50,10,0.18)'; g.fillRect(x, y, 1, 3); }
    }
    const LINE = '#2b1838', lw = 2;
    // stained arcs (inside the three-point line) and lanes
    const arc3 = (rimX, dir) => {
      g.beginPath();
      const a = Math.acos(-5.25 / 19.75);
      if (dir > 0) g.arc(X(rimX), Z(25), 19.75 * PPF, -a, a);
      else g.arc(X(rimX), Z(25), 19.75 * PPF, Math.PI - a, Math.PI + a);
      return g;
    };
    g.fillStyle = 'rgba(150,80,25,0.22)';
    arc3(5.25, 1); g.closePath(); g.fill();
    arc3(88.75, -1); g.closePath(); g.fill();
    g.fillStyle = 'rgba(120,55,15,0.20)';
    g.fillRect(X(0), Z(19), 19 * PPF, 12 * PPF); g.fillRect(X(75), Z(19), 19 * PPF, 12 * PPF);
    // lines
    g.strokeStyle = LINE; g.lineWidth = lw;
    g.strokeRect(X(0), Z(0), 94 * PPF, 50 * PPF);
    g.beginPath(); g.moveTo(X(47), Z(0)); g.lineTo(X(47), Z(50)); g.stroke();
    g.strokeRect(X(0), Z(19), 19 * PPF, 12 * PPF); g.strokeRect(X(75), Z(19), 19 * PPF, 12 * PPF);
    g.beginPath(); g.arc(X(19), Z(25), 6 * PPF, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.arc(X(75), Z(25), 6 * PPF, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.setLineDash([6, 6]);
    g.beginPath(); g.arc(X(19), Z(25), 6 * PPF, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.arc(X(75), Z(25), 6 * PPF, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.setLineDash([]);
    arc3(5.25, 1).stroke(); arc3(88.75, -1).stroke();
    // center bearcat (original design), stretched in depth so it reads in perspective
    g.save(); g.translate(X(47), Z(25)); g.scale(1, 1.7); drawCat(g, 5.2 * PPF); g.restore();
    // floor lettering
    const word = (txt, x, z, col) => {
      const img = FONT.render(txt, 3, col, '#f4efe6', null);
      g.save(); g.imageSmoothingEnabled = false;
      const w = img.width * 1.1, h = img.height * 1.7;
      g.drawImage(img, X(x) - w / 2, Z(z) - h / 2, w, h); g.restore();
    };
    word('MUNCIE', 31, 46.3, '#5b2d8e');
    word('BEARCATS', 63, 46.3, '#5b2d8e');
    word('NCC', 13, 25, '#2b1838'); word('NCC', 81, 25, '#2b1838');
    return { canvas: c, PPF, TX0, TX1, TZ0, TZ1 };
  }

  // Original bearcat face for center court (not a copy of any real logo)
  function drawCat(g, R) {
    const P = '#5b2d8e', PD = '#2a1240', PL = '#8456c4';
    g.lineJoin = 'round';
    const face = () => {
      g.beginPath();
      g.moveTo(-R * 1.05, -R * 0.15);
      g.lineTo(-R * 1.0, -R * 1.15); g.lineTo(-R * 0.45, -R * 0.62);
      g.quadraticCurveTo(0, -R * 0.82, R * 0.45, -R * 0.62);
      g.lineTo(R * 1.0, -R * 1.15); g.lineTo(R * 1.05, -R * 0.15);
      g.lineTo(R * 1.35, R * 0.15); g.lineTo(R * 0.95, R * 0.35);
      g.quadraticCurveTo(R * 0.6, R * 0.95, 0, R * 1.0);
      g.quadraticCurveTo(-R * 0.6, R * 0.95, -R * 0.95, R * 0.35);
      g.lineTo(-R * 1.35, R * 0.15);
      g.closePath();
    };
    face(); g.fillStyle = P; g.fill(); g.lineWidth = R * 0.09; g.strokeStyle = PD; g.stroke();
    // inner ears
    g.fillStyle = PL;
    g.beginPath(); g.moveTo(-R * 0.88, -R * 0.9); g.lineTo(-R * 0.55, -R * 0.62); g.lineTo(-R * 0.85, -R * 0.45); g.fill();
    g.beginPath(); g.moveTo(R * 0.88, -R * 0.9); g.lineTo(R * 0.55, -R * 0.62); g.lineTo(R * 0.85, -R * 0.45); g.fill();
    // brow + eyes
    g.fillStyle = '#f2d64b';
    g.beginPath(); g.moveTo(-R * 0.62, -R * 0.2); g.lineTo(-R * 0.15, -R * 0.08); g.lineTo(-R * 0.25, R * 0.08); g.lineTo(-R * 0.6, R * 0.0); g.fill();
    g.beginPath(); g.moveTo(R * 0.62, -R * 0.2); g.lineTo(R * 0.15, -R * 0.08); g.lineTo(R * 0.25, R * 0.08); g.lineTo(R * 0.6, R * 0.0); g.fill();
    g.fillStyle = PD;
    g.fillRect(-R * 0.42, -R * 0.12, R * 0.1, R * 0.16); g.fillRect(R * 0.32, -R * 0.12, R * 0.1, R * 0.16);
    // muzzle
    g.fillStyle = PL; g.beginPath(); g.ellipse(0, R * 0.42, R * 0.45, R * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = PD; g.beginPath(); g.moveTo(-R * 0.14, R * 0.18); g.lineTo(R * 0.14, R * 0.18); g.lineTo(0, R * 0.32); g.fill();
    // open mouth with fangs
    g.fillStyle = '#2a0f20'; g.beginPath(); g.ellipse(0, R * 0.6, R * 0.3, R * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(-R * 0.2, R * 0.47); g.lineTo(-R * 0.1, R * 0.47); g.lineTo(-R * 0.15, R * 0.68); g.fill();
    g.beginPath(); g.moveTo(R * 0.2, R * 0.47); g.lineTo(R * 0.1, R * 0.47); g.lineTo(R * 0.15, R * 0.68); g.fill();
    // whiskers
    g.strokeStyle = '#ffffff'; g.lineWidth = R * 0.04;
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      g.beginPath(); g.moveTo(s * R * 0.4, R * (0.4 + k * 0.1)); g.lineTo(s * R * 1.05, R * (0.3 + k * 0.2)); g.stroke();
    }
  }

  // ---------- Far stands (vertical wall behind the far sideline) ----------
  // world x from SX0 to SX1, drawn at scale SS px/ft, height SHT px
  const SX0 = -40, SX1 = 134;
  function buildStands(SS, SHT, colA, colB) {
    const W = Math.round((SX1 - SX0) * SS);
    const frames = [];
    for (let f = 0; f < 2; f++) {
      seed = 4242;
      const c = mk(W, SHT), g = c.getContext('2d');
      const X = x => (x - SX0) * SS;
      // roof
      g.fillStyle = '#1f1d26'; g.fillRect(0, 0, W, 28);
      g.fillStyle = '#2c2a35'; for (let x = 0; x < W; x += 9) g.fillRect(x, 0, 1, 28);
      g.fillStyle = '#7a7782';
      g.fillRect(0, 3, W, 2); g.fillRect(0, 21, W, 2);
      for (let x = 0; x < W; x += 26) {
        for (let i = 0; i < 18; i++) { g.fillRect(x + i * 13 / 18, 4 + i, 1, 1); g.fillRect(x + 26 - i * 13 / 18, 4 + i, 1, 1); }
      }
      g.fillStyle = '#fff3c4';
      for (let x = 12; x < W; x += 52) g.fillRect(x, 24, 4, 2);
      // bleachers
      const top = 28, bot = 94;
      g.fillStyle = '#8f929c'; g.fillRect(0, top, W, bot - top);
      for (let y = top; y < bot; y += 5) { g.fillStyle = '#b9bcc4'; g.fillRect(0, y, W, 1); g.fillStyle = '#7c7f89'; g.fillRect(0, y + 4, W, 1); }
      const aisles = [];
      for (let x = 60; x < W; x += 150) aisles.push(x);
      const mid = X(47);
      const palettes = {
        A: [colA.primary, colA.primary, colA.secondary, colA.primary, '#d8d8d8'],
        B: [colB.primary, colB.primary, colB.secondary, colB.primary, '#d8d8d8'],
        N: ['#5b2d8e', '#3d3d48', '#8a7a62', '#4a6a8a', '#d0d0d0', '#6a3a3a']
      };
      const skins = ['#f1c9a2', '#dba26a', '#b47c4c', '#8c5b35', '#5f3b21'];
      for (let y = top + 4; y < bot; y += 5) {
        const dens = 0.5 + 0.4 * (y - top) / (bot - top);
        for (let x = 1; x < W - 2; x += 3) {
          if (aisles.some(a => x > a - 4 && x < a + 6)) continue;
          if (srand() > dens) continue;
          const side = Math.abs(x - mid) < 20 ? 'N' : (x < mid ? 'A' : 'B');
          const pal = srand() < 0.75 ? palettes[side] : palettes.N;
          const shirt = pal[Math.floor(srand() * pal.length)];
          const up = f === 1 && srand() < 0.55 ? 1 : 0;
          g.fillStyle = shirt; g.fillRect(x, y - 2 - up, 2, 2);
          g.fillStyle = skins[Math.floor(srand() * 5)]; g.fillRect(x, y - 4 - up, 2, 2);
          if (up && srand() < 0.5) { g.fillStyle = shirt; g.fillRect(x - 1, y - 6, 1, 2); }
        }
      }
      for (const a of aisles) {
        g.fillStyle = '#5b2d8e'; g.fillRect(a - 3, top, 2, bot - top); g.fillRect(a + 5, top, 2, bot - top);
        g.fillStyle = '#a9acb4'; for (let y = top; y < bot; y += 3) g.fillRect(a - 1, y, 6, 1);
      }
      // tunnel openings
      for (const tx of [X(-6), X(100)]) {
        g.fillStyle = '#5b2d8e'; g.fillRect(tx - 9, 58, 18, 14);
        g.fillStyle = '#cfe3ff'; g.fillRect(tx - 7, 60, 14, 12);
      }
      // banners hanging from the trusses
      const banner = (bx, col, w = 12, h = 22) => {
        g.fillStyle = '#555'; g.fillRect(bx + 2, 20, 1, 4); g.fillRect(bx + w - 3, 20, 1, 4);
        g.fillStyle = OUTLINE; g.fillRect(bx - 1, 23, w + 2, h + 2);
        g.fillStyle = col; g.fillRect(bx, 24, w, h);
        g.fillStyle = '#ffffff';
        g.fillRect(bx + 2, 27, w - 4, 1); g.fillRect(bx + 3, 30, w - 6, 1); g.fillRect(bx + 2, 34, w - 4, 2); g.fillRect(bx + 3, 39, w - 6, 1);
      };
      const bannerXs = [X(-2), X(4), X(10), X(16), X(78), X(84), X(90), X(96)];
      bannerXs.forEach((bx, i) => banner(Math.round(bx), i % 4 === 2 ? '#b0283a' : '#4a2580'));
      for (const px of [X(28), X(32), X(62), X(66)]) {
        g.fillStyle = OUTLINE; g.beginPath(); g.moveTo(px - 4, 22); g.lineTo(px + 4, 22); g.lineTo(px, 38); g.fill();
        g.fillStyle = px < mid ? '#4a2580' : '#b0283a'; g.beginPath(); g.moveTo(px - 3, 23); g.lineTo(px + 3, 23); g.lineTo(px, 35); g.fill();
      }
      // lower wall: white with purple trim, wood panelling across the middle
      g.fillStyle = '#5b2d8e'; g.fillRect(0, bot, W, 3);
      g.fillStyle = '#e9e7ec'; g.fillRect(0, bot + 3, W, SHT - bot - 3);
      g.fillStyle = '#c4c1c9'; g.fillRect(0, SHT - 2, W, 2);
      for (let x = 8; x < W; x += 34) { if (x > X(18) && x < X(76)) continue; g.fillStyle = '#5b2d8e'; g.fillRect(x, bot + 6, 7, SHT - bot - 8); g.fillStyle = '#3e1d66'; g.fillRect(x + 5, bot + 11, 1, 2); }
      const w0 = X(18), w1 = X(76);
      g.fillStyle = '#c27a35'; g.fillRect(w0, bot + 3, w1 - w0, SHT - bot - 3);
      for (let x = w0; x < w1; x += 18) { g.fillStyle = '#8e5420'; g.fillRect(x, bot + 3, 1, SHT - bot - 3); g.fillStyle = '#d99a52'; g.fillRect(x + 1, bot + 3, 1, SHT - bot - 3); }
      g.fillStyle = '#3e2a1a'; g.fillRect(X(45.5), bot + 4, X(48.5) - X(45.5), SHT - bot - 5);
      g.fillStyle = '#5b2d8e'; g.fillRect(w0, bot + 3, w1 - w0, 1);
      frames.push(c);
    }
    return { frames, SX0, SX1, SS };
  }

  return { buildPlayerSprites, ball, buildFloor, buildStands, miniText, shade, SW, SH, SKIN, HAIR, OUTLINE, mk };
})();
