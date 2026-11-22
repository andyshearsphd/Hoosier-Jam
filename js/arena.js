// Hoosier Jam: the Muncie Fieldhouse (floor texture and far-side stands)
// High school court: 84 ft by 50 ft. Baskets 5.25 ft in from each baseline.
'use strict';
const ARENA = (() => {
  const CL = 84, MID = 42;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let seed = 1;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const PURPLE = '#5b2d8e', PURPLE_D = '#2a1240', PURPLE_L = '#8456c4';

  // ---------- floor (top-down texture) ----------
  const PPF = 10, TX0 = -20, TX1 = CL + 20, TZ0 = -4, TZ1 = 64;
  function buildFloor() {
    seed = 99991;
    const W = (TX1 - TX0) * PPF, H = (TZ1 - TZ0) * PPF;
    const c = mk(W, H), g = c.getContext('2d');
    const X = x => (x - TX0) * PPF, Z = z => (z - TZ0) * PPF;
    // end bleachers seen from above beyond the baselines
    g.fillStyle = '#4e515b'; g.fillRect(0, 0, W, H);
    for (let x = TX0; x < TX1; x += 1.4) { g.fillStyle = (Math.round(x / 1.4) % 2) ? '#7f828d' : '#9a9da7'; g.fillRect(X(x), 0, 0.7 * PPF, H); }
    const shirts = ['#c8202f', '#ffffff', '#1f4fb8', '#f2c230', PURPLE, '#333', '#7a6a5a', '#2e7d4f'];
    for (let i = 0; i < 2600; i++) {
      const left = srand() < 0.5;
      const x = left ? TX0 + srand() * 12 : CL + 8 + srand() * 12;
      const z = TZ0 + srand() * (TZ1 - TZ0);
      g.fillStyle = shirts[Math.floor(srand() * shirts.length)];
      g.fillRect(Math.round(X(x)), Math.round(Z(z)), 6, 5);
      g.fillStyle = ['#f1c9a2', '#c88a5a', '#7a4a28'][Math.floor(srand() * 3)];
      g.fillRect(Math.round(X(x)) + 1, Math.round(Z(z)) - 3, 4, 3);
    }
    g.fillStyle = '#efedf1'; g.fillRect(X(-8), 0, 2 * PPF, H); g.fillRect(X(CL + 6), 0, 2 * PPF, H);
    g.fillStyle = PURPLE; g.fillRect(X(-7.3), 0, 0.6 * PPF, H); g.fillRect(X(CL + 6.7), 0, 0.6 * PPF, H);
    // maple
    const fx0 = X(-6), fx1 = X(CL + 6), fz1 = Z(57);
    g.fillStyle = '#ddb478'; g.fillRect(fx0, 0, fx1 - fx0, fz1);
    for (let y = 0; y < fz1; y += 5) {
      g.fillStyle = srand() < 0.5 ? 'rgba(130,75,20,0.08)' : 'rgba(255,240,200,0.09)';
      g.fillRect(fx0, y, fx1 - fx0, 4);
      g.fillStyle = 'rgba(90,50,10,0.13)'; g.fillRect(fx0, y + 4, fx1 - fx0, 1);
      for (let x = fx0 + srand() * 80; x < fx1; x += 60 + srand() * 120) { g.fillStyle = 'rgba(90,50,10,0.22)'; g.fillRect(x, y, 1, 4); }
    }
    // near-side apron edge: purple base of the scorer's area
    g.fillStyle = PURPLE; g.fillRect(fx0, Z(55), fx1 - fx0, 0.5 * PPF);
    g.fillStyle = '#efedf1'; g.fillRect(fx0, Z(55.5), fx1 - fx0, 1.5 * PPF);
    g.fillStyle = '#2c2a33'; g.fillRect(0, Z(57), W, H - Z(57));
    // stained areas
    const R3 = 19.75, rimL = 5.25, rimR = CL - 5.25;
    const arc3 = (rimX, d) => { g.beginPath(); const a = Math.acos(-5.25 / R3); if (d > 0) g.arc(X(rimX), Z(25), R3 * PPF, -a, a); else g.arc(X(rimX), Z(25), R3 * PPF, Math.PI - a, Math.PI + a); };
    g.fillStyle = 'rgba(150,80,25,0.24)'; arc3(rimL, 1); g.closePath(); g.fill(); arc3(rimR, -1); g.closePath(); g.fill();
    g.fillStyle = 'rgba(115,50,12,0.22)'; g.fillRect(X(0), Z(19), 19 * PPF, 12 * PPF); g.fillRect(X(CL - 19), Z(19), 19 * PPF, 12 * PPF);
    // lines
    g.strokeStyle = '#2b1838'; g.lineWidth = 3;
    g.strokeRect(X(0), Z(0), CL * PPF, 50 * PPF);
    g.beginPath(); g.moveTo(X(MID), Z(0)); g.lineTo(X(MID), Z(50)); g.stroke();
    g.strokeRect(X(0), Z(19), 19 * PPF, 12 * PPF); g.strokeRect(X(CL - 19), Z(19), 19 * PPF, 12 * PPF);
    g.beginPath(); g.arc(X(19), Z(25), 6 * PPF, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.arc(X(CL - 19), Z(25), 6 * PPF, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.setLineDash([8, 8]);
    g.beginPath(); g.arc(X(19), Z(25), 6 * PPF, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.arc(X(CL - 19), Z(25), 6 * PPF, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.setLineDash([]);
    arc3(rimL, 1); g.stroke(); arc3(rimR, -1); g.stroke();
    // hash marks on the lane
    for (const bx of [0, CL]) for (const zz of [19, 31]) for (const off of [7, 8, 11, 14]) {
      const x = bx === 0 ? off : CL - off; g.beginPath(); g.moveTo(X(x), Z(zz)); g.lineTo(X(x), Z(zz + (zz === 19 ? -0.6 : 0.6))); g.stroke();
    }
    // center bearcat, stretched in depth so it reads in perspective
    g.save(); g.translate(X(MID), Z(25)); g.scale(1, 1.6); drawCat(g, 5.4 * PPF); g.restore();
    // floor lettering
    const word = (txt, x, z, size) => {
      g.save(); g.translate(X(x), Z(z)); g.scale(1, 1.55);
      g.font = `${size}px Anton, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = '#f4efe6'; g.strokeText(txt, 0, 0);
      g.fillStyle = PURPLE; g.fillText(txt, 0, 0); g.restore();
    };
    // reads left to right along the near sideline: MUNCIE CENTRAL BEARCATS
    word('MUNCIE', 18, 46.2, 42);
    word('CENTRAL', MID, 46.2, 42);
    word('BEARCATS', CL - 18, 46.2, 42);
    return { canvas: c, PPF, TX0, TX1, TZ0, TZ1 };
  }

  // Original bearcat face for center court (not a copy of any real logo)
  function drawCat(g, R) {
    g.lineJoin = 'round';
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
    const gr = g.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R * 1.3);
    gr.addColorStop(0, '#7a48b8'); gr.addColorStop(1, PURPLE);
    g.fillStyle = gr; g.fill(); g.lineWidth = R * 0.09; g.strokeStyle = PURPLE_D; g.stroke();
    g.fillStyle = PURPLE_L;
    g.beginPath(); g.moveTo(-R * 0.88, -R * 0.9); g.lineTo(-R * 0.55, -R * 0.62); g.lineTo(-R * 0.85, -R * 0.45); g.fill();
    g.beginPath(); g.moveTo(R * 0.88, -R * 0.9); g.lineTo(R * 0.55, -R * 0.62); g.lineTo(R * 0.85, -R * 0.45); g.fill();
    g.fillStyle = '#f2d64b';
    g.beginPath(); g.moveTo(-R * 0.62, -R * 0.2); g.lineTo(-R * 0.15, -R * 0.08); g.lineTo(-R * 0.25, R * 0.08); g.lineTo(-R * 0.6, R * 0.0); g.fill();
    g.beginPath(); g.moveTo(R * 0.62, -R * 0.2); g.lineTo(R * 0.15, -R * 0.08); g.lineTo(R * 0.25, R * 0.08); g.lineTo(R * 0.6, R * 0.0); g.fill();
    g.fillStyle = PURPLE_D;
    g.fillRect(-R * 0.42, -R * 0.12, R * 0.1, R * 0.16); g.fillRect(R * 0.32, -R * 0.12, R * 0.1, R * 0.16);
    g.fillStyle = PURPLE_L; g.beginPath(); g.ellipse(0, R * 0.42, R * 0.45, R * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = PURPLE_D; g.beginPath(); g.moveTo(-R * 0.14, R * 0.18); g.lineTo(R * 0.14, R * 0.18); g.lineTo(0, R * 0.32); g.fill();
    g.fillStyle = '#2a0f20'; g.beginPath(); g.ellipse(0, R * 0.6, R * 0.3, R * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(-R * 0.2, R * 0.47); g.lineTo(-R * 0.1, R * 0.47); g.lineTo(-R * 0.15, R * 0.68); g.fill();
    g.beginPath(); g.moveTo(R * 0.2, R * 0.47); g.lineTo(R * 0.1, R * 0.47); g.lineTo(R * 0.15, R * 0.68); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = R * 0.04;
    for (const s of [-1, 1]) for (const k of [0, 1]) { g.beginPath(); g.moveTo(s * R * 0.4, R * (0.4 + k * 0.1)); g.lineTo(s * R * 1.05, R * (0.3 + k * 0.2)); g.stroke(); }
  }

  // ---------- far stands (vertical wall behind the far sideline) ----------
  const SX0 = -30, SX1 = CL + 30;
  function buildStands(SS, SHT, colA, colB) {
    const W = Math.round((SX1 - SX0) * SS);
    const frames = [];
    const X = x => (x - SX0) * SS;
    const mid = X(MID);
    const roofH = Math.round(SHT * 0.24), bot = Math.round(SHT * 0.86);
    for (let f = 0; f < 2; f++) {
      seed = 4242;
      const c = mk(W, SHT), g = c.getContext('2d');
      // roof and trusses
      let gr = g.createLinearGradient(0, 0, 0, roofH);
      gr.addColorStop(0, '#15131b'); gr.addColorStop(1, '#2b2934');
      g.fillStyle = gr; g.fillRect(0, 0, W, roofH + 2);
      g.strokeStyle = '#8a8792'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 4); g.lineTo(W, 4); g.moveTo(0, roofH - 4); g.lineTo(W, roofH - 4); g.stroke();
      g.lineWidth = 1; g.strokeStyle = '#6e6b77';
      g.beginPath();
      for (let x = 0; x < W; x += 34) { g.moveTo(x, 4); g.lineTo(x + 17, roofH - 4); g.lineTo(x + 34, 4); }
      g.stroke();
      g.strokeStyle = '#3c3a45'; g.beginPath();
      for (let x = 8; x < W; x += 22) { g.moveTo(x, 0); g.lineTo(x + 30, roofH); } g.stroke();
      for (let x = 20; x < W; x += 68) {
        const lg = g.createRadialGradient(x + 3, roofH - 2, 1, x + 3, roofH - 2, 14);
        lg.addColorStop(0, 'rgba(255,246,210,0.9)'); lg.addColorStop(1, 'rgba(255,246,210,0)');
        g.fillStyle = lg; g.fillRect(x - 12, roofH - 16, 30, 20);
        g.fillStyle = '#fff6d2'; g.fillRect(x, roofH - 3, 6, 2);
      }
      // bleachers
      gr = g.createLinearGradient(0, roofH, 0, bot);
      gr.addColorStop(0, '#6c6f79'); gr.addColorStop(1, '#a3a6af');
      g.fillStyle = gr; g.fillRect(0, roofH, W, bot - roofH);
      const rowH = 7;
      for (let y = roofH + 2; y < bot; y += rowH) { g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, y, W, 1); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + rowH - 1, W, 1); }
      const aisles = []; for (let x = 70; x < W; x += 190) aisles.push(x);
      const palettes = {
        A: [colA.primary, colA.primary, colA.secondary, colA.primary, '#e0e0e0'],
        B: [colB.primary, colB.primary, colB.secondary, colB.primary, '#e0e0e0'],
        N: [PURPLE, '#3d3d48', '#8a7a62', '#4a6a8a', '#d8d8d8', '#6a3a3a', '#2e5e3e']
      };
      const skins = ['#f1c9a2', '#dba26a', '#b47c4c', '#8c5b35', '#5f3b21'];
      const hairs = ['#1d1512', '#5b3719', '#e6c461', '#3a2a1a', '#9a9a9a'];
      for (let y = roofH + rowH; y < bot + 2; y += rowH) {
        const depth = (y - roofH) / (bot - roofH);
        const dens = 0.55 + 0.4 * depth;
        for (let x = 2; x < W - 4; x += 5) {
          if (aisles.some(a => x > a - 6 && x < a + 9)) continue;
          if (srand() > dens) continue;
          const side = Math.abs(x - mid) < 30 ? 'N' : (x < mid ? 'A' : 'B');
          const pal = srand() < 0.78 ? palettes[side] : palettes.N;
          const shirt = pal[Math.floor(srand() * pal.length)];
          const up = f === 1 && srand() < 0.6 ? 2 : 0;
          const jx = x + Math.floor(srand() * 2);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(jx, y - 4 - up, 5, 5);
          g.fillStyle = shirt; g.fillRect(jx, y - 4 - up, 4, 4);
          g.fillStyle = skins[Math.floor(srand() * 5)]; g.fillRect(jx + 1, y - 7 - up, 3, 3);
          g.fillStyle = hairs[Math.floor(srand() * 5)]; g.fillRect(jx + 1, y - 8 - up, 3, 1);
          if (up && srand() < 0.6) { g.fillStyle = skins[Math.floor(srand() * 5)]; g.fillRect(jx - 1, y - 10, 1, 4); g.fillRect(jx + 4, y - 10, 1, 4); }
        }
      }
      for (const a of aisles) {
        g.fillStyle = PURPLE; g.fillRect(a - 4, roofH, 3, bot - roofH); g.fillRect(a + 7, roofH, 3, bot - roofH);
        g.fillStyle = '#b4b7bf'; for (let y = roofH; y < bot; y += 4) g.fillRect(a - 1, y, 8, 2);
      }
      // tunnel openings
      for (const tx of [X(-6), X(CL + 6)]) {
        g.fillStyle = PURPLE; g.fillRect(tx - 13, bot - 26, 26, 22);
        const tg = g.createLinearGradient(0, bot - 24, 0, bot - 4); tg.addColorStop(0, '#e8f2ff'); tg.addColorStop(1, '#9ab8e0');
        g.fillStyle = tg; g.fillRect(tx - 10, bot - 23, 20, 19);
      }
      // banners hanging from the trusses
      const banner = (bx, col, w, h, rows) => {
        g.fillStyle = '#555'; g.fillRect(bx + 3, roofH - 6, 1, 6); g.fillRect(bx + w - 4, roofH - 6, 1, 6);
        g.fillStyle = '#100818'; g.fillRect(bx - 1, roofH - 1, w + 2, h + 2);
        const bg = g.createLinearGradient(bx, 0, bx + w, 0); bg.addColorStop(0, col); bg.addColorStop(0.5, PURPLE_L === col ? col : shadeHex(col, 0.15)); bg.addColorStop(1, shadeHex(col, -0.3));
        g.fillStyle = bg; g.fillRect(bx, roofH, w, h);
        g.fillStyle = '#ffffff';
        g.font = `${Math.round(w * 0.28)}px Anton, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
        rows.forEach((t, i) => g.fillText(t, bx + w / 2, roofH + 3 + i * (w * 0.32)));
        g.fillStyle = col; g.beginPath(); g.moveTo(bx, roofH + h); g.lineTo(bx + w / 2, roofH + h + 5); g.lineTo(bx + w, roofH + h); g.fill();
      };
      const bw = Math.round(SS * 1.9), bh = Math.round(SHT * 0.26);
      // only years confirmed from Andy's Fieldhouse photos; the rest stay generic
      const yrs = [['STATE', 'CHAMPS', '1928'], ['STATE', 'CHAMPS', '1931'], ['STATE', 'RUNNER', 'UP'], ['SECT', 'CHAMPS', ''], ['REGION', 'CHAMPS', ''], ['STATE', 'RUNNER', 'UP'], ['STATE', 'CHAMPS', '1963'], ['SECT', 'CHAMPS', ''], ['REGION', 'CHAMPS', ''], ['SECT', 'CHAMPS', '']];
      const bxs = [-3, 0, 3, 6, 9, CL - 11, CL - 8, CL - 5, CL - 2, CL + 1];
      bxs.forEach((x, i) => banner(Math.round(X(x)), yrs[i][1] === 'RUNNER' ? '#b0283a' : '#4a2580', bw, bh, yrs[i]));
      // lower wall: white with purple trim, wood panelling across the middle
      g.fillStyle = PURPLE; g.fillRect(0, bot, W, 3);
      g.fillStyle = '#ebe9ee'; g.fillRect(0, bot + 3, W, SHT - bot - 3);
      g.fillStyle = '#c4c1c9'; g.fillRect(0, SHT - 2, W, 2);
      const w0 = X(14), w1 = X(CL - 14);
      for (let x = 10; x < W; x += 40) { if (x > w0 - 10 && x < w1) continue; g.fillStyle = PURPLE; g.fillRect(x, bot + 6, 9, SHT - bot - 8); g.fillStyle = '#3e1d66'; g.fillRect(x + 6, bot + 12, 2, 2); }
      const wg = g.createLinearGradient(0, bot, 0, SHT); wg.addColorStop(0, '#d48a40'); wg.addColorStop(1, '#a8622a');
      g.fillStyle = wg; g.fillRect(w0, bot + 3, w1 - w0, SHT - bot - 3);
      for (let x = w0; x < w1; x += 22) { g.fillStyle = '#7e4818'; g.fillRect(x, bot + 3, 1, SHT - bot - 3); g.fillStyle = '#e6a660'; g.fillRect(x + 1, bot + 3, 1, SHT - bot - 3); }
      g.fillStyle = '#3e2a1a'; g.fillRect(X(MID - 1.5), bot + 4, X(MID + 1.5) - X(MID - 1.5), SHT - bot - 5);
      g.fillStyle = PURPLE; g.fillRect(w0, bot + 3, w1 - w0, 1);
      frames.push(c);
    }
    return { frames, SX0, SX1, SS };
  }
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; gg *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
    return '#' + [r, gg, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  // ---------- ball ----------
  const balls = {};
  function ball(r) {
    r = Math.max(2, Math.min(9, Math.round(r)));
    if (balls[r]) return balls[r];
    const d = r * 2 + 4, c = mk(d, d), g = c.getContext('2d');
    const cx = d / 2, cy = d / 2;
    g.fillStyle = '#120a18'; g.beginPath(); g.arc(cx, cy, r + 1, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    gr.addColorStop(0, '#ffb070'); gr.addColorStop(0.5, '#e8702a'); gr.addColorStop(1, '#9a4010');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(50,20,5,0.85)'; g.lineWidth = Math.max(1, r * 0.14);
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
    g.beginPath(); g.arc(cx - r * 1.3, cy, r * 1.0, -0.8, 0.8); g.stroke();
    g.beginPath(); g.arc(cx + r * 1.3, cy, r * 1.0, Math.PI - 0.8, Math.PI + 0.8); g.stroke();
    return (balls[r] = c);
  }

  return { CL, MID, buildFloor, buildStands, ball, drawCat, shadeHex };
})();
