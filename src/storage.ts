const KEY = 'number-arrows:progress';
const DAILY_KEY = 'number-arrows:daily';
const SETTINGS_KEY = 'number-arrows:settings';

export interface Progress {
  /** Highest numbered level the player may open. Level 0 (the tutorial) is always open. */
  unlocked: number;
  current: number;
}

export interface Daily {
  /** dateKey of the last completed daily challenge. */
  last: string;
  streak: number;
}

export interface Settings {
  sound: boolean;
  haptics: boolean;
  theme: string;
}

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    // Storage unavailable: start fresh.
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: this just won't persist.
  }
}

export function loadProgress(): Progress {
  const p = read<Progress>(KEY);
  // New players start on the tutorial.
  if (!p) return { unlocked: 1, current: 0 };
  const unlocked = Math.max(1, Math.floor(Number(p.unlocked)) || 1);
  const current = Math.min(unlocked, Math.max(0, Math.floor(Number(p.current)) || 0));
  return { unlocked, current };
}

export function saveProgress(p: Progress): void {
  write(KEY, p);
}

export function loadDaily(): Daily {
  const d = read<Daily>(DAILY_KEY);
  return { last: typeof d?.last === 'string' ? d.last : '', streak: Math.max(0, Number(d?.streak) || 0) };
}

export function saveDaily(d: Daily): void {
  write(DAILY_KEY, d);
}

export function loadSettings(): Settings {
  const s = read<Settings>(SETTINGS_KEY);
  return {
    sound: s?.sound !== false,
    haptics: s?.haptics !== false,
    theme: typeof s?.theme === 'string' ? s.theme : 'classic',
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
