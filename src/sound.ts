let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, endFreq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // No audio support.
  }
}

export const sfx = {
  // Each combo step raises the pitch a semitone (capped at an octave).
  exit: (combo = 1) => {
    const f = 520 * Math.pow(2, Math.min(combo - 1, 12) / 12);
    tone(f, f * 1.8, 0.12, 'triangle', 0.15);
  },
  combo: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.12, 'square', 0.06, i * 0.05)),
  bump: () => tone(160, 70, 0.2, 'square', 0.12),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.15, i * 0.09)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.95, 0.22, 'sine', 0.15, i * 0.14)),
};
