export interface Theme {
  id: string;
  name: string;
  /** Unlocked by clearing this level (0 = always available). */
  unlock: number;
  /** CSS variables to override; classic uses the stylesheet defaults. */
  vars: Record<string, string>;
  /** Swatch colours for the settings picker: background, arrow. */
  swatch: [string, string];
}

const dark = (v: Record<string, string>) => ({ '--scheme': 'dark', 'color-scheme': 'dark', ...v });
const light = (v: Record<string, string>) => ({ '--scheme': 'light', 'color-scheme': 'light', ...v });

export const THEMES: Theme[] = [
  { id: 'classic', name: 'Classic', unlock: 0, vars: {}, swatch: ['#f6f4ef', '#9b3b2f'] },
  {
    id: 'ocean', name: 'Ocean', unlock: 10, swatch: ['#e6f2f7', '#0b5f8a'],
    vars: light({ '--bg': '#e6f2f7', '--surface': '#ffffff', '--text': '#0f2a3a', '--muted': '#5a7a8a', '--accent': '#0a84c6', '--arrow': '#0b5f8a', '--ghost': 'rgba(11, 95, 138, 0.1)' }),
  },
  {
    id: 'sunset', name: 'Sunset', unlock: 20, swatch: ['#fff1e6', '#c2410c'],
    vars: light({ '--bg': '#fff1e6', '--surface': '#ffffff', '--text': '#3a1f1a', '--muted': '#8a6a5f', '--accent': '#e8590c', '--arrow': '#c2410c', '--ghost': 'rgba(194, 65, 12, 0.1)' }),
  },
  {
    id: 'forest', name: 'Forest', unlock: 30, swatch: ['#eef5ea', '#276749'],
    vars: light({ '--bg': '#eef5ea', '--surface': '#ffffff', '--text': '#1d2e1a', '--muted': '#62765c', '--accent': '#2f855a', '--arrow': '#276749', '--ghost': 'rgba(39, 103, 73, 0.1)' }),
  },
  {
    id: 'neon', name: 'Neon', unlock: 40, swatch: ['#0b0b16', '#39ffd0'],
    vars: dark({ '--bg': '#0b0b16', '--surface': '#17172a', '--text': '#f0f0ff', '--muted': '#8a8ab0', '--accent': '#ff2bd6', '--arrow': '#39ffd0', '--ghost': 'rgba(57, 255, 208, 0.08)' }),
  },
  {
    id: 'candy', name: 'Candy', unlock: 50, swatch: ['#fff0f6', '#c2255c'],
    vars: light({ '--bg': '#fff0f6', '--surface': '#ffffff', '--text': '#3b1026', '--muted': '#8f5a72', '--accent': '#d6336c', '--arrow': '#c2255c', '--ghost': 'rgba(194, 37, 92, 0.1)' }),
  },
  {
    id: 'midnight', name: 'Midnight', unlock: 60, swatch: ['#0f172a', '#fbbf24'],
    vars: dark({ '--bg': '#0f172a', '--surface': '#1e293b', '--text': '#e2e8f0', '--muted': '#94a3b8', '--accent': '#fbbf24', '--arrow': '#fbbf24', '--ghost': 'rgba(251, 191, 36, 0.08)' }),
  },
];

const ALL_VARS = [...new Set(THEMES.flatMap((t) => Object.keys(t.vars)))];

export function isUnlocked(theme: Theme, unlockedLevel: number): boolean {
  return unlockedLevel > theme.unlock;
}

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Applies a theme by setting CSS variables on <html>. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const name of ALL_VARS) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars['--bg'] ?? getComputedStyle(root).getPropertyValue('--bg').trim());
}
