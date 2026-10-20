const KEY = 'number-arrows:progress';

export interface Progress {
  /** Highest level the player may open. */
  unlocked: number;
  current: number;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      const unlocked = Math.max(1, Math.floor(Number(p.unlocked)) || 1);
      const current = Math.min(unlocked, Math.max(1, Math.floor(Number(p.current)) || 1));
      return { unlocked, current };
    }
  } catch {
    // Storage unavailable: start fresh.
  }
  return { unlocked: 1, current: 1 };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Ignore: progress just won't persist.
  }
}
