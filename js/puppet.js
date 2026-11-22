// Hoosier Jam: shaded, jointed player figures (drawn live each frame)
// Units are feet for a 6.5 ft reference player; S is pixels per reference foot.
// Local frame: origin between the feet on the floor, +x is the way the player faces, y grows downward.
'use strict';
const PUP = (() => {
  const OUT = '#120a18';
  const SKIN = {
    light: ['#fbdcbc', '#eab993', '#b98563'], tan: ['#f0c08a', '#d49a62', '#9c6a3e'],
    medium: ['#d39a66', '#b0784a', '#7c5130'], brown: ['#b07a50', '#8a5a34', '#5e3a1e'],
    dark: ['#8a5c3c', '#5f3b21', '#3a2312']
  };
  const HAIR = { black: '#1d1512', brown: '#5b3719', blond: '#e8c766', red: '#b8501f', gray: '#a0a0a8' };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  const dir = (a, L) => [Math.sin(a) * L, Math.cos(a) * L];

  function capsulePath(g, ax, ay, bx, by, ra, rb) {
    const ang = Math.atan2(by - ay, bx - ax);
    g.moveTo(ax + Math.cos(ang + Math.PI / 2) * ra, ay + Math.sin(ang + Math.PI / 2) * ra);
    g.arc(ax, ay, ra, ang + Math.PI / 2, ang + Math.PI * 1.5);
    g.arc(bx, by, rb, ang - Math.PI / 2, ang + Math.PI / 2);
    g.closePath();
  }
  function limbGrad(g, ax, ay, bx, by, r, cols) {
    const ang = Math.atan2(by - ay, bx - ax), nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    // light from the upper left of the figure's own frame
    const sgn = (nx * -0.6 + ny * -0.8) > 0 ? 1 : -1;
    const gr = g.createLinearGradient(ax + nx * r * sgn, ay + ny * r * sgn, ax - nx * r * sgn, ay - ny * r * sgn);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.45, cols[1]); gr.addColorStop(1, cols[2]);
    return gr;
  }

  // Draws a group of shapes: dark outline pass first, then the fills, so each group reads as one silhouette.
  function group(g, parts, ow, flat) {
    g.fillStyle = OUT; g.strokeStyle = OUT; g.lineWidth = ow * 2; g.lineJoin = 'round';
    for (const p of parts) { g.beginPath(); p.path(g); g.fill(); g.stroke(); }
    for (const p of parts) {
      g.beginPath(); p.path(g);
      g.fillStyle = flat ? (Array.isArray(p.cols) ? p.cols[1] : p.cols) : (typeof p.fill === 'function' ? p.fill(g) : p.fill);
      g.fill();
      if (p.after) p.after(g);
    }
  }

  // pose: { lean, crouch, legF:[thigh, knee], legB:[thigh, knee], armF:[shoulder, elbow], armB:[shoulder, elbow] }
  function draw(g, look, pose, S, face, opts = {}) {
    const flat = !!opts.flat;
    const sk = SKIN[look.skin] || SKIN.tan;
    const skD = sk.map(c => shade(c, -0.18));
    const jer = look.jersey, jerC = [shade(jer, 0.35), jer, shade(jer, -0.4)];
    const sho = look.shorts || jer, shoC = [shade(sho, 0.3), sho, shade(sho, -0.4)];
    const trim = look.trim;
    const hair = HAIR[look.hairColor] || HAIR.black;
    const ow = Math.max(0.6, S * 0.045);
    g.save();
    g.scale(face * S, S);
    const O = ow / S;

    const lean = pose.lean || 0, crouch = pose.crouch || 0;
    const hip = [Math.sin(lean) * 0.4, -3.3 + crouch];
    const sh = [hip[0] + Math.sin(lean) * 2.15, hip[1] - Math.cos(lean) * 2.15];
    const neck = [sh[0] + 0.06, sh[1] - 0.22];
    const headC = [neck[0] + 0.08 + Math.sin(lean) * 0.2, neck[1] - 0.48];

    const legPts = (L, side) => {
      const h = [hip[0] + side * 0.12, hip[1]];
      const [tx, ty] = dir(L[0], 1.62); const knee = [h[0] + tx, h[1] + ty];
      const [sx, sy] = dir(L[0] - L[1], 1.52); const ank = [knee[0] + sx, knee[1] + sy];
      return { h, knee, ank, shinA: L[0] - L[1] };
    };
    const armPts = (A, side) => {
      const s0 = [sh[0] + side * 0.1, sh[1] + 0.12];
      const [ux, uy] = dir(A[0], 1.2); const el = [s0[0] + ux, s0[1] + uy];
      const [fx, fy] = dir(A[0] + A[1], 1.08); const hand = [el[0] + fx, el[1] + fy];
      return { s0, el, hand };
    };

    const legParts = (lp, dark) => {
      const c = dark ? skD : sk;
      const parts = [];
      const { h, knee, ank, shinA } = lp;
      parts.push({ path: q => capsulePath(q, h[0], h[1], knee[0], knee[1], 0.37, 0.26), cols: c, fill: q => limbGrad(q, h[0], h[1], knee[0], knee[1], 0.37, c) });
      parts.push({ path: q => capsulePath(q, knee[0], knee[1], ank[0], ank[1], 0.25, 0.17), cols: c, fill: q => limbGrad(q, knee[0], knee[1], ank[0], ank[1], 0.25, c) });
      // tube sock with team stripes
      const sockTop = [ank[0] + (knee[0] - ank[0]) * 0.5, ank[1] + (knee[1] - ank[1]) * 0.5];
      const sockC = dark ? ['#e4e4ec', '#cfcfda', '#a0a0b0'] : ['#ffffff', '#f2f2f6', '#c4c4d0'];
      parts.push({ path: q => capsulePath(q, sockTop[0], sockTop[1], ank[0], ank[1], 0.21, 0.18), cols: sockC, fill: q => limbGrad(q, sockTop[0], sockTop[1], ank[0], ank[1], 0.21, sockC),
        after: q => {
          q.strokeStyle = dark ? shade(jer, -0.2) : jer; q.lineWidth = 0.09;
          for (const f of [0.12, 0.3]) {
            const px = sockTop[0] + (ank[0] - sockTop[0]) * f, py = sockTop[1] + (ank[1] - sockTop[1]) * f;
            const ang = Math.atan2(ank[1] - sockTop[1], ank[0] - sockTop[0]) + Math.PI / 2;
            q.beginPath(); q.moveTo(px + Math.cos(ang) * 0.2, py + Math.sin(ang) * 0.2); q.lineTo(px - Math.cos(ang) * 0.2, py - Math.sin(ang) * 0.2); q.stroke();
          }
        } });
      // high-top shoe
      const rot = Math.max(-0.6, Math.min(0.9, shinA * 0.6));
      parts.push({ path: q => {
        q.save(); q.translate(ank[0], ank[1]); q.rotate(-rot);
        q.moveTo(-0.28, -0.22); q.lineTo(0.18, -0.24); q.quadraticCurveTo(0.62, -0.12, 0.66, 0.12); q.lineTo(0.62, 0.22); q.lineTo(-0.3, 0.22); q.closePath();
        q.restore();
      }, cols: ['#ffffff', '#f4f4f8', '#b8b8c6'], fill: dark ? '#d6d6e0' : '#f6f6fa',
        after: q => { q.save(); q.translate(ank[0], ank[1]); q.rotate(-rot); q.fillStyle = '#7a7a88'; q.fillRect(-0.3, 0.12, 0.92, 0.1); q.fillStyle = dark ? shade(trim === '#ffffff' ? jer : trim, -0.2) : (trim === '#ffffff' ? jer : trim); q.fillRect(-0.05, -0.08, 0.4, 0.08); q.restore(); } });
      return parts;
    };
    const armParts = (ap, dark) => {
      const c = dark ? skD : sk;
      const { s0, el, hand } = ap;
      return [
        { path: q => capsulePath(q, s0[0], s0[1], el[0], el[1], 0.23, 0.17), cols: c, fill: q => limbGrad(q, s0[0], s0[1], el[0], el[1], 0.23, c) },
        { path: q => capsulePath(q, el[0], el[1], hand[0], hand[1], 0.17, 0.13), cols: c, fill: q => limbGrad(q, el[0], el[1], hand[0], hand[1], 0.17, c) },
        { path: q => q.arc(hand[0], hand[1], 0.17, 0, Math.PI * 2), cols: c, fill: c[1] },
      ];
    };
    const lF = legPts(pose.legF, 1), lB = legPts(pose.legB, -1);
    const aF = armPts(pose.armF, 1), aB = armPts(pose.armB, -1);

    // back arm and back leg
    group(g, armParts(aB, true), O, flat);
    group(g, legParts(lB, true), O, flat);
    // torso: tank top
    const ca = Math.cos(lean), sa = Math.sin(lean);
    const T = (u, v) => [hip[0] + u * ca + v * sa, hip[1] + u * sa - v * ca]; // u across (forward), v up the torso
    const torso = q => {
      const p = [T(0.45, 0.0), T(0.5, 1.2), T(0.48, 2.0), T(0.2, 2.2), T(-0.25, 2.2), T(-0.45, 2.0), T(-0.42, 1.2), T(-0.42, 0.0)];
      q.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) q.lineTo(p[i][0], p[i][1]); q.closePath();
    };
    const shoulderCap = q => { q.arc(sh[0], sh[1] + 0.18, 0.3, 0, Math.PI * 2); };
    const shortsPath = q => {
      const p = [T(0.48, 0.35), T(0.5, -0.25), T(-0.44, -0.25), T(-0.44, 0.35)];
      q.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) q.lineTo(p[i][0], p[i][1]); q.closePath();
      for (const lp of [lB, lF]) capsulePath(q, lp.h[0], lp.h[1], lp.h[0] + (lp.knee[0] - lp.h[0]) * 0.42, lp.h[1] + (lp.knee[1] - lp.h[1]) * 0.42, 0.44, 0.42);
    };
    group(g, [
      { path: shoulderCap, cols: sk, fill: sk[1] },
      { path: shortsPath, cols: shoC, fill: q => { const gr = q.createLinearGradient(hip[0] - 0.5, 0, hip[0] + 0.5, 0); gr.addColorStop(0, shoC[2]); gr.addColorStop(0.55, shoC[1]); gr.addColorStop(1, shoC[0]); return gr; },
        after: q => { q.strokeStyle = trim; q.lineWidth = 0.1; q.beginPath(); const a = T(0.49, 0.3), b = T(0.49, -0.6); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke(); q.beginPath(); const c = T(-0.44, 0.3), d = T(0.48, 0.3); q.moveTo(c[0], c[1]); q.lineTo(d[0], d[1]); q.stroke(); } },
      { path: torso, cols: jerC, fill: q => { const gr = q.createLinearGradient(hip[0] - 0.5, 0, hip[0] + 0.6, 0); gr.addColorStop(0, jerC[2]); gr.addColorStop(0.5, jerC[1]); gr.addColorStop(1, jerC[0]); return gr; },
        after: q => {
          q.strokeStyle = trim; q.lineWidth = 0.1;
          q.beginPath(); let a = T(0.47, 1.95), b = T(0.47, 0.05); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.stroke();
          q.beginPath(); a = T(0.18, 2.17); b = T(0.32, 1.85); const c = T(0.46, 2.0); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]); q.lineTo(c[0], c[1]); q.stroke();
          // jersey number, always readable
          const nc = T(0.06, 1.2);
          q.save(); q.translate(nc[0], nc[1]); q.scale(face / S, 1 / S); q.rotate(lean * face);
          q.font = `${Math.max(6, Math.round(0.8 * S))}px Anton, Impact, sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle';
          q.lineWidth = Math.max(1.5, 0.14 * S); q.strokeStyle = OUT; q.lineJoin = 'round';
          q.strokeText(String(look.num), 0, 0); q.fillStyle = look.numColor || trim; q.fillText(String(look.num), 0, 0);
          q.restore();
        } },
    ], O, flat);
    // front leg
    group(g, legParts(lF, false), O, flat);
    // head
    const [hx, hy] = headC;
    const headParts = [];
    const hairStyle = look.hair;
    if (hairStyle === 'afro') headParts.push({ path: q => q.arc(hx - 0.08, hy - 0.12, 0.66, 0, Math.PI * 2), cols: hair, fill: hair,
      after: q => { q.fillStyle = shade(hair, 0.18); for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.2 + (i % 4) * 0.11; q.fillRect(hx - 0.08 + Math.cos(a) * r, hy - 0.12 + Math.sin(a) * r, 0.07, 0.07); } } });
    if (hairStyle === 'mullet') headParts.push({ path: q => { q.moveTo(hx - 0.2, hy - 0.2); q.lineTo(hx - 0.5, hy + 0.1); q.lineTo(hx - 0.48, hy + 0.72); q.lineTo(hx - 0.12, hy + 0.62); q.closePath(); }, cols: hair, fill: hair });
    headParts.push({ path: q => capsulePath(q, neck[0], neck[1] + 0.25, hx - 0.02, hy + 0.2, 0.2, 0.2), cols: sk, fill: sk[2] });
    headParts.push({ path: q => { q.ellipse(hx, hy, 0.4, 0.48, 0, 0, Math.PI * 2); q.moveTo(hx + 0.44, hy + 0.05); q.lineTo(hx + 0.5, hy + 0.17); q.lineTo(hx + 0.38, hy + 0.2); q.closePath(); }, cols: sk,
      fill: q => { const gr = q.createRadialGradient(hx + 0.12, hy - 0.15, 0.05, hx, hy, 0.55); gr.addColorStop(0, sk[0]); gr.addColorStop(0.55, sk[1]); gr.addColorStop(1, sk[2]); return gr; },
      after: q => {
        // ear, eye, brow, mouth
        q.fillStyle = sk[2]; q.beginPath(); q.ellipse(hx - 0.06, hy + 0.04, 0.09, 0.13, 0, 0, Math.PI * 2); q.fill();
        q.fillStyle = '#ffffff'; q.beginPath(); q.ellipse(hx + 0.25, hy - 0.04, 0.075, 0.055, 0, 0, Math.PI * 2); q.fill();
        q.fillStyle = '#1a1010'; q.beginPath(); q.ellipse(hx + 0.28, hy - 0.04, 0.045, 0.05, 0, 0, Math.PI * 2); q.fill();
        q.strokeStyle = shade(hair, -0.1); q.lineWidth = 0.06; q.beginPath(); q.moveTo(hx + 0.15, hy - 0.15); q.lineTo(hx + 0.36, hy - 0.13); q.stroke();
        q.strokeStyle = '#6a2a22'; q.lineWidth = 0.045; q.beginPath(); q.moveTo(hx + 0.24, hy + 0.27); q.lineTo(hx + 0.36, hy + 0.26); q.stroke();
        if (look.stache) { q.fillStyle = hair; q.fillRect(hx + 0.2, hy + 0.17, 0.22, 0.07); }
        // hair on top of the head
        q.fillStyle = hair;
        if (hairStyle === 'flattop') { q.fillRect(hx - 0.36, hy - 0.78, 0.7, 0.42); q.beginPath(); q.ellipse(hx - 0.12, hy - 0.2, 0.28, 0.3, 0, 0, Math.PI * 2); q.fill(); q.fillStyle = shade(hair, 0.25); q.fillRect(hx - 0.36, hy - 0.78, 0.7, 0.06); }
        else if (hairStyle === 'short' || hairStyle === 'mullet' || hairStyle === 'parted') {
          q.beginPath(); q.moveTo(hx + 0.38, hy - 0.2); q.quadraticCurveTo(hx + 0.2, hy - 0.62, hx - 0.15, hy - 0.56); q.quadraticCurveTo(hx - 0.5, hy - 0.4, hx - 0.42, hy + 0.08);
          q.lineTo(hx - 0.2, hy + 0.02); q.lineTo(hx - 0.12, hy - 0.22); q.quadraticCurveTo(hx + 0.12, hy - 0.3, hx + 0.38, hy - 0.2); q.fill();
          if (hairStyle === 'parted') { q.beginPath(); q.moveTo(hx + 0.4, hy - 0.16); q.quadraticCurveTo(hx + 0.1, hy - 0.6, hx - 0.2, hy - 0.55); q.lineTo(hx + 0.05, hy - 0.35); q.closePath(); q.fill(); q.fillStyle = shade(hair, 0.3); q.fillRect(hx - 0.02, hy - 0.52, 0.18, 0.04); }
        } else if (hairStyle === 'afro') {
          q.beginPath(); q.moveTo(hx + 0.4, hy - 0.22); q.quadraticCurveTo(hx + 0.25, hy - 0.5, hx - 0.1, hy - 0.5); q.lineTo(hx - 0.1, hy - 0.2); q.closePath(); q.fill();
        } else if (hairStyle === 'bald') {
          q.fillStyle = 'rgba(255,255,255,0.35)'; q.beginPath(); q.ellipse(hx + 0.05, hy - 0.32, 0.14, 0.07, -0.3, 0, Math.PI * 2); q.fill();
        }
        if (look.headband) { q.strokeStyle = look.headband; q.lineWidth = 0.13; q.beginPath(); q.moveTo(hx + 0.4, hy - 0.24); q.quadraticCurveTo(hx, hy - 0.36, hx - 0.42, hy - 0.16); q.stroke(); }
      } });
    group(g, headParts, O, flat);
    // front arm
    group(g, armParts(aF, false), O, flat);
    g.restore();
    // hand position in local pixels (for holding the ball)
    return { hand: [aF.hand[0] * S * face, aF.hand[1] * S], handB: [aB.hand[0] * S * face, aB.hand[1] * S] };
  }

  // ---------- pose library ----------
  const P = {
    stand: () => ({ lean: 0.03, crouch: 0.05, legF: [0.08, 0.1], legB: [-0.06, 0.1], armF: [0.12, 0.25], armB: [-0.08, 0.2] }),
    dribbleStand: (ph) => ({ lean: 0.1, crouch: 0.25, legF: [0.25, 0.45], legB: [-0.2, 0.35], armF: [0.7, -0.2 - 0.35 * Math.abs(Math.sin(ph))], armB: [-0.2, 0.5] }),
    run: (ph, turbo, dribble) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      const a = turbo ? 0.85 : 0.68;
      const pose = {
        lean: turbo ? 0.28 : 0.17, crouch: Math.abs(c) * 0.18,
        legF: [a * s, 0.2 + 1.2 * Math.max(0, c)], legB: [-a * s, 0.2 + 1.2 * Math.max(0, -c)],
        armF: [-0.75 * s, 1.1], armB: [0.75 * s, 1.1]
      };
      if (dribble) pose.armF = [0.75, -0.15 - 0.35 * Math.abs(Math.sin(ph * 1.0))];
      return pose;
    },
    jump: () => ({ lean: -0.05, crouch: 0, legF: [0.35, 0.7], legB: [-0.05, 0.35], armF: [2.75, 0.35], armB: [2.5, 0.55] }),
    shotFollow: () => ({ lean: -0.05, crouch: 0, legF: [0.3, 0.6], legB: [-0.05, 0.3], armF: [2.5, 0.0], armB: [2.2, 0.4] }),
    block: () => ({ lean: -0.02, crouch: 0, legF: [0.15, 0.3], legB: [-0.1, 0.2], armF: [3.0, 0.05], armB: [2.85, 0.1] }),
    dunk: (u) => ({ lean: 0.15, crouch: 0, legF: [1.1, 1.6], legB: [0.3, 1.2], armF: [2.2 + u * 0.6, 0.2], armB: [1.6 + u * 0.4, 0.5] }),
    hang: () => ({ lean: -0.05, crouch: 0, legF: [0.15, 0.15], legB: [-0.1, 0.1], armF: [2.9, 0], armB: [2.8, 0] }),
    layup: () => ({ lean: 0.05, crouch: 0, legF: [1.3, 1.5], legB: [-0.2, 0.3], armF: [2.75, 0.1], armB: [0.9, 0.6] }),
    defend: (ph) => ({ lean: 0.18, crouch: 0.55, legF: [0.45, 0.75], legB: [-0.45, 0.65], armF: [1.4 + Math.sin(ph) * 0.2, 0.35], armB: [-1.0, -0.3] }),
    steal: () => ({ lean: 0.4, crouch: 0.5, legF: [0.7, 0.9], legB: [-0.55, 0.4], armF: [1.45, 0.05], armB: [-0.6, 0.6] }),
    down: () => ({ lean: 0, crouch: 0, legF: [0.2, 0.3], legB: [-0.1, 0.2], armF: [1.6, 0.4], armB: [1.2, 0.5] }),
    celebrate: (ph) => ({ lean: -0.05, crouch: 0.1, legF: [0.1, 0.15], legB: [-0.1, 0.1], armF: [2.9, 0.1 + 0.2 * Math.sin(ph * 2)], armB: [-0.2, 0.4] }),
  };

  return { draw, P, SKIN, HAIR, shade, OUT };
})();
