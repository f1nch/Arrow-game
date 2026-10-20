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
  exit: () => tone(520 + Math.random() * 120, 980, 0.12, 'triangle', 0.15),
  bump: () => tone(160, 70, 0.2, 'square', 0.12),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.15, i * 0.09)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.95, 0.22, 'sine', 0.15, i * 0.14)),
};
