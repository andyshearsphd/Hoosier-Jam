// Hoosier Jam: shaded, muscled player figures (drawn live each frame)
// Units are feet for a 6.5 ft reference player; S is pixels per reference foot.
// Local frame: origin between the feet on the floor, +x is the way the player faces, y grows downward.
// Joint angles: 0 points straight down, positive swings forward (+x), PI points straight up.
'use strict';
const PUP = (() => {
  const OUT = '#120a18';
  const SKIN = {
    light: ['#ffe2c4', '#efbf98', '#b8805c'], tan: ['#f6c896', '#d69c66', '#96643a'],
    medium: ['#dca472', '#b37b4c', '#74492a'], brown: ['#b98458', '#8b5a35', '#56341b'],
    dark: ['#94643f', '#603c22', '#341e0f']
  };
  const HAIR = { black: '#1d1512', brown: '#5b3719', blond: '#e8c766', red: '#b8501f', gray: '#a0a0a8' };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  const dir = (a, L) => [Math.sin(a) * L, Math.cos(a) * L];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

  // Muscle-shaped limb outline between joints A and B.
  // prof: { a: radius at A, b: radius at B, p: [[t, radius on the + side, radius on the - side], ...] }
  // For a limb hanging straight down on a figure facing +x, the + side is the back of the limb.
  function smooth(g, pts) {
    for (let i = 1; i < pts.length - 1; i++) { const m = lerp2(pts[i], pts[i + 1], 0.5); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function limbPath(g, A, B, prof) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-3;
    const nx = -dy / L, ny = dx / L, ang = Math.atan2(dy, dx);
    const pts = [[0, prof.a, prof.a], ...prof.p, [1, prof.b, prof.b]];
    const plus = pts.map(([t, rp]) => [A[0] + dx * t + nx * rp, A[1] + dy * t + ny * rp]);
    const minus = pts.map(([t, , rm]) => [A[0] + dx * t - nx * rm, A[1] + dy * t - ny * rm]);
    g.moveTo(plus[0][0], plus[0][1]);
    smooth(g, plus);
    g.arc(B[0], B[1], prof.b, ang + Math.PI / 2, ang - Math.PI / 2, true);
    smooth(g, minus.slice().reverse());
    g.arc(A[0], A[1], prof.a, ang - Math.PI / 2, ang + Math.PI / 2, true);
    g.closePath();
  }
  // shading across a limb, lit from the front and above
  function limbFill(g, A, B, r, cols) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-3;
    let nx = -dy / L, ny = dx / L;
    if (nx * 0.55 + ny * -0.85 < 0) { nx = -nx; ny = -ny; }
    const m = lerp2(A, B, 0.4);
    const gr = g.createLinearGradient(m[0] + nx * r, m[1] + ny * r, m[0] - nx * r, m[1] - ny * r);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.38, cols[1]); gr.addColorStop(0.8, cols[2]); gr.addColorStop(1, shade(cols[2], -0.25));
    return gr;
  }

  const THIGH = { a: 0.44, b: 0.26, p: [[0.22, 0.47, 0.46], [0.5, 0.41, 0.42], [0.8, 0.31, 0.32]] };
  const SHIN = { a: 0.25, b: 0.14, p: [[0.22, 0.33, 0.22], [0.45, 0.28, 0.2], [0.78, 0.18, 0.15]] };
  const UPPER = { a: 0.3, b: 0.17, p: [[0.16, 0.33, 0.32], [0.5, 0.24, 0.26], [0.82, 0.19, 0.19]] };
  const FORE = { a: 0.18, b: 0.11, p: [[0.22, 0.21, 0.2], [0.6, 0.15, 0.14]] };
  const SHORTS = { a: 0.47, b: 0.43, p: [[0.5, 0.47, 0.46]] };
  const NECK = { a: 0.26, b: 0.23, p: [] };

  // Draws parts as one silhouette: outline pass first, then fills (and details).
  function group(g, parts, ow, flat) {
    g.fillStyle = OUT; g.strokeStyle = OUT; g.lineWidth = ow * 2; g.lineJoin = 'round';
    for (const p of parts) { g.beginPath(); p.path(g); g.fill(); g.stroke(); }
    for (const p of parts) {
      g.beginPath(); p.path(g);
      g.fillStyle = flat ? p.flat : (typeof p.fill === 'function' ? p.fill(g) : p.fill);
      g.fill();
      if (p.after && !flat) p.after(g);
    }
  }

  function draw(g, look, pose, S, face, opts = {}) {
    const flat = !!opts.flat;
    const sk = SKIN[look.skin] || SKIN.tan;
    const skD = sk.map(c => shade(c, -0.2));
    const jer = look.jersey, jerC = [shade(jer, 0.4), jer, shade(jer, -0.45)];
    const sho = look.shorts || jer, shoC = [shade(sho, 0.35), sho, shade(sho, -0.45)];
    const shoD = shoC.map(c => shade(c, -0.2));
    const trim = look.trim, accent = trim === '#ffffff' ? jer : trim;
    const hair = HAIR[look.hairColor] || HAIR.black;
    const ow = Math.max(0.55, S * 0.04);
    g.save();
    g.scale(face * S, S);
    const O = ow / S;

    const lean = pose.lean || 0, crouch = pose.crouch || 0;
    const ca = Math.cos(lean), sa = Math.sin(lean);
    const hip = [Math.sin(lean) * 0.35 - crouch * 0.25, -3.35 + crouch];
    const T = (u, v) => [hip[0] + u * ca + v * sa, hip[1] + u * sa - v * ca]; // u forward, v up the torso
    const sh = T(0.02, 2.0);
    const neckB = T(0.02, 2.15);
    const headC = add(neckB, [0.12 + Math.sin(lean) * 0.15 + (pose.head || 0) * 0.1, -0.55]);

    const legPts = (L, side) => {
      const h = add(hip, [side * 0.16, 0]);
      const knee = add(h, dir(L[0], 1.6));
      const shinA = L[0] - L[1];
      const ank = add(knee, dir(shinA, 1.52));
      return { h, knee, ank, shinA };
    };
    const armPts = (A, side) => {
      const s0 = T(side * 0.24, 1.92);
      const el = add(s0, dir(A[0], 1.2));
      const fa = A[0] + A[1];
      const wr = add(el, dir(fa, 1.02));
      return { s0, el, wr, fa };
    };

    const legParts = (lp, dark) => {
      const c = dark ? skD : sk, sc = dark ? shoD : shoC;
      const { h, knee, ank, shinA } = lp;
      const sockTop = lerp2(ank, knee, 0.5);
      const shortEnd = lerp2(h, knee, 0.42);
      const rot = Math.max(-0.6, Math.min(0.9, shinA * 0.6));
      return [
        { path: q => limbPath(q, h, knee, THIGH), fill: q => limbFill(q, h, knee, 0.42, c), flat: c[1] },
        { path: q => limbPath(q, knee, ank, SHIN), fill: q => limbFill(q, knee, ank, 0.28, c), flat: c[1],
          after: q => { // knee cap highlight
            q.fillStyle = 'rgba(255,255,255,0.12)'; q.beginPath(); q.ellipse(knee[0] + Math.cos(shinA) * 0.12, knee[1] - 0.02, 0.1, 0.16, -shinA, 0, Math.PI * 2); q.fill();
          } },
        { path: q => limbPath(q, sockTop, ank, { a: 0.21, b: 0.17, p: [] }), fill: dark ? '#d2d2dc' : '#f4f4f8', flat: '#e8e8ee',
          after: q => {
            q.strokeStyle = dark ? shade(accent, -0.25) : accent; q.lineWidth = 0.085;
            const ang = Math.atan2(ank[1] - sockTop[1], ank[0] - sockTop[0]) + Math.PI / 2;
            for (const f of [0.1, 0.28]) {
              const p = lerp2(sockTop, ank, f);
              q.beginPath(); q.moveTo(p[0] + Math.cos(ang) * 0.21, p[1] + Math.sin(ang) * 0.21); q.lineTo(p[0] - Math.cos(ang) * 0.21, p[1] - Math.sin(ang) * 0.21); q.stroke();
            }
          } },
        { path: q => {
            q.save(); q.translate(ank[0], ank[1]); q.rotate(-rot);
            q.moveTo(-0.3, -0.26); q.lineTo(0.12, -0.28); q.quadraticCurveTo(0.34, -0.2, 0.58, -0.06); q.quadraticCurveTo(0.72, 0.04, 0.68, 0.2); q.lineTo(-0.32, 0.22); q.closePath();
            q.restore();
          }, fill: dark ? '#d8d8e2' : '#fafafe', flat: '#ececf2',
          after: q => {
            q.save(); q.translate(ank[0], ank[1]); q.rotate(-rot);
            q.fillStyle = '#6a6a78'; q.fillRect(-0.32, 0.12, 1.0, 0.1);
            q.fillStyle = dark ? shade(accent, -0.25) : accent; q.beginPath(); q.moveTo(-0.15, -0.05); q.quadraticCurveTo(0.2, -0.16, 0.45, 0.02); q.lineTo(0.42, 0.07); q.quadraticCurveTo(0.2, -0.06, -0.15, 0.03); q.fill();
            q.restore();
          } },
        // short shorts over the top of the thigh
        { path: q => limbPath(q, add(h, [0, -0.15]), shortEnd, SHORTS), fill: q => limbFill(q, h, shortEnd, 0.47, sc), flat: sc[1],
          after: q => {
            q.strokeStyle = trim; q.lineWidth = 0.09;
            const ang = Math.atan2(shortEnd[1] - h[1], shortEnd[0] - h[0]) + Math.PI / 2;
            const p = lerp2(h, shortEnd, 0.93);
            q.beginPath(); q.moveTo(p[0] + Math.cos(ang) * 0.44, p[1] + Math.sin(ang) * 0.44); q.lineTo(p[0] - Math.cos(ang) * 0.44, p[1] - Math.sin(ang) * 0.44); q.stroke();
          } },
      ];
    };
    const armParts = (ap, dark) => {
      const c = dark ? skD : sk;
      const { s0, el, wr, fa } = ap;
      const handC = add(wr, dir(fa, 0.19));
      return [
        { path: q => limbPath(q, s0, el, UPPER), fill: q => limbFill(q, s0, el, 0.27, c), flat: c[1] },
        { path: q => limbPath(q, el, wr, FORE), fill: q => limbFill(q, el, wr, 0.18, c), flat: c[1] },
        { path: q => { q.ellipse(handC[0], handC[1], 0.14, 0.23, -fa, 0, Math.PI * 2); }, fill: c[1], flat: c[1] },
      ];
    };
    const lF = legPts(pose.legF, 1), lB = legPts(pose.legB, -1);
    const aF = armPts(pose.armF, 1), aB = armPts(pose.armB, -1);

    group(g, armParts(aB, true), O, flat);
    group(g, legParts(lB, true), O, flat);

    // torso with tank top
    const torsoPath = q => {
      const P = [T(0.5, -0.1), T(0.5, 0.35), T(0.54, 0.85), T(0.7, 1.3), T(0.82, 1.68), T(0.66, 2.04), T(0.22, 2.26),
        T(-0.24, 2.28), T(-0.66, 2.06), T(-0.74, 1.55), T(-0.52, 0.85), T(-0.5, 0.3), T(-0.5, -0.1)];
      q.moveTo(P[0][0], P[0][1]);
      smooth(q, P.concat([P[0]]));
    };
    const pelvisPath = q => {
      const P = [T(0.52, 0.38), T(0.54, -0.25), T(-0.5, -0.25), T(-0.5, 0.38)];
      q.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) q.lineTo(P[i][0], P[i][1]); q.closePath();
    };
    group(g, [
      { path: torsoPath, flat: jerC[1], fill: q => { const a = T(-0.5, 1), b = T(0.56, 1); const gr = q.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, jerC[2]); gr.addColorStop(0.55, jerC[1]); gr.addColorStop(1, jerC[0]); return gr; },
        after: q => {
          // skin at the scooped neckline, then trim
          q.fillStyle = sk[1];
          const n0 = T(-0.1, 2.2), n1 = T(0.2, 1.88), n2 = T(0.34, 2.08), n3 = T(0.1, 2.24);
          q.beginPath(); q.moveTo(n0[0], n0[1]); q.quadraticCurveTo(n1[0], n1[1], n2[0], n2[1]); q.lineTo(n3[0], n3[1]); q.closePath(); q.fill();
          q.strokeStyle = trim; q.lineWidth = 0.09;
          q.beginPath(); q.moveTo(n0[0], n0[1]); q.quadraticCurveTo(n1[0], n1[1], n2[0], n2[1]); q.stroke();
          const s1 = T(-0.68, 1.9), s2 = T(-0.5, 0.3);
          q.lineWidth = 0.07; q.beginPath(); q.moveTo(s1[0], s1[1]); q.lineTo(s2[0], s2[1]); q.stroke();
          // jersey fold shading
          q.strokeStyle = 'rgba(0,0,0,0.18)'; q.lineWidth = 0.05;
          const f1 = T(0.2, 0.6), f2 = T(0.05, 1.0); q.beginPath(); q.moveTo(f1[0], f1[1]); q.quadraticCurveTo(T(0.25, 0.8)[0], T(0.25, 0.8)[1], f2[0], f2[1]); q.stroke();
          // number, always readable
          const nc = T(0.04, 1.25);
          q.save(); q.translate(nc[0], nc[1]); q.scale(face / S, 1 / S); q.rotate(lean * face);
          q.font = `${Math.max(6, Math.round(0.82 * S))}px Anton, Impact, sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle';
          q.lineWidth = Math.max(1.5, 0.14 * S); q.strokeStyle = OUT; q.lineJoin = 'round';
          q.strokeText(String(look.num), 0, 0); q.fillStyle = look.numColor || trim; q.fillText(String(look.num), 0, 0);
          q.restore();
        } },
      { path: pelvisPath, flat: shoC[1], fill: q => { const a = T(-0.5, 0), b = T(0.5, 0); const gr = q.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, shoC[2]); gr.addColorStop(0.6, shoC[1]); gr.addColorStop(1, shoC[0]); return gr; },
        after: q => { q.strokeStyle = trim; q.lineWidth = 0.09; const a = T(-0.48, 0.34), b = T(0.5, 0.34); q.beginPath(); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); } },
    ], O, flat);

    group(g, legParts(lF, false), O, flat);

    // neck and head
    const [hx, hy] = headC;
    const hs = look.hair;
    const headParts = [];
    if (hs === 'afro') headParts.push({ path: q => q.arc(hx - 0.1, hy - 0.14, 0.72, 0, Math.PI * 2), fill: hair, flat: hair,
      after: q => { q.fillStyle = shade(hair, 0.2); for (let i = 0; i < 22; i++) { const a = i * 2.39, r = 0.12 + (i % 5) * 0.1; q.beginPath(); q.arc(hx - 0.1 + Math.cos(a) * r, hy - 0.12 + Math.sin(a) * r, 0.045, 0, Math.PI * 2); q.fill(); } } });
    if (hs === 'mullet') headParts.push({ path: q => { q.moveTo(hx - 0.2, hy - 0.25); q.quadraticCurveTo(hx - 0.6, hy, hx - 0.52, hy + 0.75); q.lineTo(hx - 0.18, hy + 0.66); q.closePath(); }, fill: hair, flat: hair });
    headParts.push({ path: q => limbPath(q, add(neckB, [0, 0.1]), [hx - 0.04, hy + 0.25], NECK), fill: q => limbFill(q, neckB, [hx, hy], 0.22, skD), flat: skD[1] });
    const HS = 1.13;
    const hz = (q, fn) => { q.save(); q.translate(hx, hy); q.scale(HS, HS); q.translate(-hx, -hy); fn(); q.restore(); };
    const headPath = q => hz(q, () => {
      q.moveTo(hx - 0.38, hy - 0.12);
      q.bezierCurveTo(hx - 0.36, hy - 0.62, hx + 0.3, hy - 0.66, hx + 0.36, hy - 0.2);   // skull to forehead
      q.quadraticCurveTo(hx + 0.42, hy - 0.08, hx + 0.39, hy - 0.02);                       // brow
      q.quadraticCurveTo(hx + 0.5, hy + 0.12, hx + 0.48, hy + 0.15);                        // nose
      q.lineTo(hx + 0.39, hy + 0.18);
      q.quadraticCurveTo(hx + 0.42, hy + 0.24, hx + 0.39, hy + 0.29);                       // lips
      q.quadraticCurveTo(hx + 0.4, hy + 0.42, hx + 0.27, hy + 0.47);                        // chin
      q.quadraticCurveTo(hx + 0.02, hy + 0.5, hx - 0.14, hy + 0.36);                        // jaw
      q.quadraticCurveTo(hx - 0.32, hy + 0.22, hx - 0.38, hy - 0.12);                       // back of head
      q.closePath();
    });
    headParts.push({ path: headPath, flat: sk[1],
      fill: q => { const gr = q.createRadialGradient(hx + 0.18, hy - 0.2, 0.05, hx, hy, 0.62); gr.addColorStop(0, sk[0]); gr.addColorStop(0.5, sk[1]); gr.addColorStop(1, sk[2]); return gr; },
      after: q => hz(q, () => {
        // ear
        q.fillStyle = sk[2]; q.beginPath(); q.ellipse(hx - 0.07, hy + 0.06, 0.08, 0.13, 0.1, 0, Math.PI * 2); q.fill();
        q.strokeStyle = shade(sk[2], -0.3); q.lineWidth = 0.03; q.beginPath(); q.arc(hx - 0.07, hy + 0.06, 0.05, -1.2, 1.4); q.stroke();
        // eye socket shade, eye, brow
        q.fillStyle = 'rgba(60,30,20,0.25)'; q.beginPath(); q.ellipse(hx + 0.26, hy - 0.02, 0.1, 0.06, 0, 0, Math.PI * 2); q.fill();
        q.fillStyle = '#f4f0ea'; q.beginPath(); q.ellipse(hx + 0.28, hy - 0.02, 0.06, 0.035, 0, 0, Math.PI * 2); q.fill();
        q.fillStyle = '#20140e'; q.beginPath(); q.arc(hx + 0.31, hy - 0.02, 0.03, 0, Math.PI * 2); q.fill();
        q.strokeStyle = shade(hair, -0.1); q.lineWidth = 0.055; q.lineCap = 'round';
        q.beginPath(); q.moveTo(hx + 0.17, hy - 0.11); q.quadraticCurveTo(hx + 0.28, hy - 0.14, hx + 0.37, hy - 0.1); q.stroke();
        // nostril, mouth, cheek shading
        q.fillStyle = shade(sk[2], -0.2); q.beginPath(); q.arc(hx + 0.42, hy + 0.14, 0.022, 0, Math.PI * 2); q.fill();
        q.strokeStyle = '#6a2a22'; q.lineWidth = 0.035; q.beginPath(); q.moveTo(hx + 0.3, hy + 0.25); q.lineTo(hx + 0.39, hy + 0.24); q.stroke();
        q.fillStyle = 'rgba(0,0,0,0.12)'; q.beginPath(); q.ellipse(hx + 0.06, hy + 0.3, 0.2, 0.12, 0.3, 0, Math.PI * 2); q.fill();
        if (look.stache) { q.fillStyle = hair; q.beginPath(); q.moveTo(hx + 0.27, hy + 0.2); q.quadraticCurveTo(hx + 0.37, hy + 0.15, hx + 0.43, hy + 0.21); q.lineTo(hx + 0.42, hy + 0.24); q.quadraticCurveTo(hx + 0.35, hy + 0.21, hx + 0.28, hy + 0.24); q.fill(); }
        // hair
        q.fillStyle = hair;
        if (hs === 'flattop') {
          q.beginPath(); q.moveTo(hx + 0.33, hy - 0.26); q.lineTo(hx + 0.32, hy - 0.78); q.lineTo(hx - 0.36, hy - 0.78); q.lineTo(hx - 0.4, hy - 0.05); q.lineTo(hx - 0.2, hy - 0.02); q.lineTo(hx - 0.12, hy - 0.28); q.closePath(); q.fill();
          q.fillStyle = shade(hair, 0.25); q.fillRect(hx - 0.36, hy - 0.79, 0.68, 0.06);
        } else if (hs === 'short' || hs === 'mullet' || hs === 'parted') {
          q.beginPath(); q.moveTo(hx + 0.36, hy - 0.22); q.bezierCurveTo(hx + 0.3, hy - 0.7, hx - 0.38, hy - 0.66, hx - 0.41, hy - 0.08);
          q.lineTo(hx - 0.2, hy - 0.02); q.quadraticCurveTo(hx - 0.14, hy - 0.26, hx + 0.08, hy - 0.3); q.quadraticCurveTo(hx + 0.24, hy - 0.3, hx + 0.36, hy - 0.22); q.fill();
          if (hs === 'parted') { q.beginPath(); q.moveTo(hx + 0.4, hy - 0.2); q.quadraticCurveTo(hx + 0.2, hy - 0.68, hx - 0.18, hy - 0.6); q.quadraticCurveTo(hx + 0.08, hy - 0.42, hx + 0.4, hy - 0.2); q.fill(); q.fillStyle = shade(hair, 0.35); q.fillRect(hx - 0.04, hy - 0.58, 0.2, 0.035); }
          q.fillStyle = shade(hair, 0.2); q.beginPath(); q.ellipse(hx - 0.02, hy - 0.5, 0.18, 0.05, -0.2, 0, Math.PI * 2); q.fill();
        } else if (hs === 'afro') {
          q.beginPath(); q.moveTo(hx + 0.38, hy - 0.22); q.quadraticCurveTo(hx + 0.26, hy - 0.52, hx - 0.1, hy - 0.52); q.lineTo(hx - 0.1, hy - 0.22); q.closePath(); q.fill();
        } else if (hs === 'bald') {
          q.fillStyle = 'rgba(255,255,255,0.4)'; q.beginPath(); q.ellipse(hx + 0.05, hy - 0.42, 0.15, 0.06, -0.3, 0, Math.PI * 2); q.fill();
        }
        if (look.headband) { q.strokeStyle = look.headband; q.lineWidth = 0.13; q.beginPath(); q.moveTo(hx + 0.37, hy - 0.25); q.quadraticCurveTo(hx, hy - 0.42, hx - 0.4, hy - 0.16); q.stroke(); }
      }) });
    group(g, headParts, O, flat);

    group(g, armParts(aF, false), O, flat);
    g.restore();
  }

  // ---------- poses ----------
  const P = {
    stand: (t = 0) => ({ lean: 0.06, crouch: 0.16 + Math.sin(t * 2) * 0.03, legF: [0.2, 0.32], legB: [-0.08, 0.28], armF: [0.22, 0.45], armB: [-0.1, 0.5] }),
    dribbleStand: (ph) => ({ lean: 0.16, crouch: 0.42, legF: [0.4, 0.75], legB: [-0.3, 0.55], armF: [0.55, 0.15 - 0.45 * Math.abs(Math.sin(ph))], armB: [0.5, 1.2] }),
    run: (ph, turbo, dribble) => {
      // natural running cycle: thigh swings mostly forward, knee folds during the swing, arms pump bent at the elbow
      const leg = a => [0.2 + 0.72 * Math.sin(a), 0.22 + 1.5 * Math.pow(Math.max(0, Math.cos(a - 0.25)), 1.3)];
      const arm = a => [-0.2 - 0.75 * Math.sin(a), 1.75 + 0.2 * Math.sin(a)];
      const pose = {
        lean: turbo ? 0.3 : 0.2, crouch: 0.16 + 0.12 * Math.cos(ph * 2),
        legF: leg(ph), legB: leg(ph + Math.PI),
        armF: arm(ph + Math.PI), armB: arm(ph),
        head: -0.3
      };
      if (turbo) { pose.legF[0] *= 1.15; pose.legB[0] *= 1.15; }
      if (dribble) pose.armF = [0.6, 0.1 - 0.45 * Math.abs(Math.sin(ph * 1.0))];
      return pose;
    },
    jump: () => ({ lean: -0.04, crouch: 0, legF: [0.4, 0.8], legB: [0.05, 0.45], armF: [2.75, 1.15], armB: [2.6, 1.3] }),
    shotFollow: () => ({ lean: -0.04, crouch: 0, legF: [0.3, 0.6], legB: [0.0, 0.3], armF: [2.55, 0.12], armB: [2.75, 0.45] }),
    block: () => ({ lean: -0.03, crouch: 0, legF: [0.2, 0.4], legB: [-0.1, 0.3], armF: [3.0, 0.1], armB: [2.85, 0.15] }),
    rebound: () => ({ lean: -0.03, crouch: 0, legF: [0.35, 0.7], legB: [0.0, 0.5], armF: [2.8, 0.35], armB: [2.6, 0.5] }),
    dunk: (u) => ({ lean: 0.2, crouch: 0, legF: [1.15, 1.8], legB: [0.25, 1.3], armF: [2.1 + u * 0.7, 0.25], armB: [1.4 + u * 0.6, 0.6] }),
    hang: () => ({ lean: -0.05, crouch: 0, legF: [0.25, 0.35], legB: [-0.1, 0.25], armF: [2.95, 0.05], armB: [2.85, 0.05] }),
    layup: () => ({ lean: 0.08, crouch: 0, legF: [1.35, 1.7], legB: [-0.25, 0.35], armF: [2.75, 0.25], armB: [0.9, 0.8] }),
    defend: (ph) => ({ lean: 0.22, crouch: 0.75, legF: [0.55, 1.0], legB: [-0.45, 0.85], armF: [1.35 + Math.sin(ph) * 0.25, 0.5], armB: [2.2 + Math.cos(ph) * 0.2, 0.5] }),
    steal: () => ({ lean: 0.45, crouch: 0.65, legF: [0.8, 1.1], legB: [-0.6, 0.5], armF: [1.5, 0.1], armB: [-0.5, 0.9] }),
    down: () => ({ lean: 0, crouch: 0, legF: [0.25, 0.4], legB: [-0.1, 0.25], armF: [1.6, 0.5], armB: [1.2, 0.6] }),
    celebrate: (ph) => ({ lean: -0.06, crouch: 0.12, legF: [0.12, 0.2], legB: [-0.1, 0.16], armF: [2.9, 0.3 + 0.3 * Math.sin(ph * 2)], armB: [0.1, 1.6] }),
  };
  const KEYS = ['lean', 'crouch', 'head'];
  // smooth blend from the previous drawn pose toward a new target
  function blend(cur, tgt, k) {
    if (!cur) return JSON.parse(JSON.stringify(tgt));
    for (const key of KEYS) cur[key] = (cur[key] || 0) + ((tgt[key] || 0) - (cur[key] || 0)) * k;
    for (const key of ['legF', 'legB', 'armF', 'armB']) for (let i = 0; i < 2; i++) cur[key][i] += (tgt[key][i] - cur[key][i]) * k;
    return cur;
  }

  return { draw, P, blend, SKIN, HAIR, shade, OUT };
})();
