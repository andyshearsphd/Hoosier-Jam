// Hoosier Jam: tiny synthesized sound effects (no audio files)
'use strict';
const SFX = (() => {
  let ac = null, master = null, muted = false;
  try { muted = localStorage.getItem('hj_muted') === '1'; } catch (e) {}
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function setMuted(m) { muted = m; try { localStorage.setItem('hj_muted', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 0.5; }
  const now = () => ac.currentTime;
  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!ac || muted) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = now() + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, vol = 0.3, f0 = 1000, q = 1, type = 'bandpass', delay = 0, attack = 0.005) {
    if (!ac || muted) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = now() + delay;
    s.buffer = noiseBuf; f.type = type; f.frequency.value = f0; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  return {
    unlock, setMuted, isMuted: () => muted,
    dribble: () => { tone(90, 0.08, 'sine', 0.35, -30); noise(0.04, 0.08, 400, 2); },
    bounce: () => { tone(110, 0.1, 'sine', 0.3, -40); },
    swish: () => { noise(0.25, 0.25, 3500, 0.8, 'highpass', 0, 0.03); },
    rim: () => { tone(620, 0.25, 'triangle', 0.18); tone(930, 0.18, 'square', 0.06); },
    board: () => { tone(180, 0.12, 'square', 0.12, -60); noise(0.06, 0.15, 900, 1); },
    dunk: () => { tone(70, 0.4, 'sawtooth', 0.35, -40); noise(0.35, 0.35, 600, 0.7, 'lowpass'); },
    pass: () => { tone(500, 0.05, 'square', 0.08, 300); },
    steal: () => { tone(880, 0.06, 'square', 0.12); tone(1320, 0.08, 'square', 0.1, 0, 0.06); },
    block: () => { tone(160, 0.2, 'square', 0.25, -80); noise(0.15, 0.25, 500, 1); },
    shove: () => { noise(0.18, 0.3, 300, 1); tone(120, 0.15, 'square', 0.15, -60); },
    buzzer: () => { tone(210, 0.9, 'sawtooth', 0.22); tone(214, 0.9, 'square', 0.12); },
    whistle: () => { tone(2600, 0.35, 'sine', 0.12, 80); },
    crowd: (big) => { noise(big ? 1.8 : 1.0, big ? 0.22 : 0.12, 1200, 0.5, 'bandpass', 0, 0.25); },
    fire: () => { tone(300, 0.5, 'sawtooth', 0.15, 600); noise(0.5, 0.15, 2000, 0.6); },
    blip: () => { tone(660, 0.05, 'square', 0.1); },
    select: () => { tone(523, 0.06, 'square', 0.12); tone(784, 0.1, 'square', 0.12, 0, 0.06); },
  };
})();
