/**
 * Tiny synthesized table sounds (no assets): dice clatter + landing thunk.
 * Mute preference persists in localStorage.
 */

let ctx: AudioContext | null = null;
const KEY = 'showdown-muted';

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setMuted(m: boolean) {
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(duration: number, freq: number, gain: number) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

/** Short wooden tick for each tumble frame */
export function playTick() {
  noiseBurst(0.035, 1800 + Math.random() * 900, 0.18);
}

/** Heavier thunk when the die settles */
export function playLand() {
  noiseBurst(0.12, 520, 0.5);
  setTimeout(() => noiseBurst(0.05, 1400, 0.12), 70);
}

/** Crowd swell — soft for hits, bigger for extra-base hits and homers */
export function playCrowd(intensity: 'soft' | 'big' = 'soft') {
  const a = audio();
  if (!a) return;
  const dur = intensity === 'big' ? 2.2 : 1.1;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  const g = a.createGain();
  const peak = intensity === 'big' ? 0.22 : 0.09;
  const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

/** Low muted thud for outs */
export function playOut() {
  noiseBurst(0.09, 260, 0.35);
}
