let enabled = true;

export const hapticsSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function setHaptics(value: boolean): void {
  enabled = value;
}

function buzz(pattern: number | number[]): void {
  if (!enabled || !hapticsSupported) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw before the first user gesture.
  }
}

export const haptics = {
  exit: () => buzz(8),
  combo: () => buzz([12, 40, 12]),
  bump: () => buzz([35, 40, 35]),
  win: () => buzz([20, 50, 20, 50, 60]),
};
