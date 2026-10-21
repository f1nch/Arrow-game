import './style.css';
import { Board, MAX_HEARTS } from './board';
import { haptics, hapticsSupported, setHaptics } from './haptics';
import { Level, dateKey, generateDaily, generateLevel } from './levelGen';
import { Renderer } from './render';
import { setMuted, sfx } from './sound';
import { loadDaily, loadProgress, loadSettings, saveDaily, saveProgress, saveSettings } from './storage';
import { THEMES, applyTheme, isUnlocked, themeById } from './themes';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('board');
const levelLabel = $('level-label');
const heartsEl = $('hearts');
const leftEl = $('arrows-left');
const guideEl = $('guide');
const overlay = $('overlay');
const panel = $('panel');

const renderer = new Renderer(canvas);
const progress = loadProgress();
const daily = loadDaily();
const settings = loadSettings();
let board: Board;

/** What is being played: a numbered level (0 = tutorial) or the daily challenge. */
type Mode = { kind: 'level'; n: number } | { kind: 'daily'; date: Date };
let mode: Mode = { kind: 'level', n: progress.current };

function applySettings(): void {
  setMuted(!settings.sound);
  setHaptics(settings.haptics);
  const theme = themeById(settings.theme);
  applyTheme(isUnlocked(theme, progress.unlocked) ? theme : THEMES[0]);
  renderer.readTheme();
}

// Combos: arrows cleared in quick succession without a mistake.
const COMBO_MS = 2000;
const MILESTONES: Record<number, string> = { 5: 'Nice!', 10: 'Great!', 15: 'Amazing!', 20: 'Unstoppable!', 30: 'Legendary!' };
const comboEl = $('combo');
const comboText = $('combo-text');
const comboWord = $('combo-word');
let combo = 0;
let bestCombo = 0;
let lastExit = 0;
let comboTimer = 0;

function resetCombo(): void {
  combo = 0;
  comboWord.classList.remove('show');
  clearTimeout(comboTimer);
  comboEl.hidden = true;
}

function bumpCombo(now: number): void {
  combo = now - lastExit < COMBO_MS ? combo + 1 : 1;
  lastExit = now;
  bestCombo = Math.max(bestCombo, combo);
  clearTimeout(comboTimer);
  if (combo < 2) {
    comboEl.hidden = true;
    return;
  }
  comboText.textContent = `Combo ×${combo}`;
  comboEl.hidden = false;
  // Restart the draining bar animation.
  comboEl.classList.remove('live');
  void comboEl.offsetWidth;
  comboEl.classList.add('live');
  comboTimer = window.setTimeout(resetCombo, COMBO_MS);
}

// Tutorial (level 0): a few guided taps, and mistakes are free.
let tutorialStep = 0;
const isTutorial = () => mode.kind === 'level' && mode.n === 0;

function guide(text: string | null): void {
  guideEl.hidden = text === null;
  guideEl.textContent = text ?? '';
}

function tutorialEvent(event: 'start' | 'exit' | 'blocked'): void {
  if (!isTutorial()) return guide(null);
  const now = performance.now();
  const glow = () => {
    const k = board.hint();
    if (k !== -1) renderer.showHint(k, now, true);
  };
  if (event === 'start') {
    tutorialStep = 0;
    guide('Tap the glowing arrow. It slides out the way it points.');
    glow();
  } else if (event === 'exit' && tutorialStep === 0) {
    tutorialStep = 1;
    guide('Nice! An arrow can only leave if nothing is in its way. Tap the next glowing one.');
    glow();
  } else if (event === 'exit' && tutorialStep === 1) {
    tutorialStep = 2;
    renderer.clearHint();
    guide('Now clear the rest yourself. Quick taps in a row build a combo!');
  } else if (event === 'blocked') {
    guide('Blocked! Something is in its way. In real levels that costs a heart ♥ (not here, this is practice).');
  }
}

function begin(level: Level, seed: number, forgiving = false): void {
  board = new Board(level, { forgiving });
  resetCombo();
  bestCombo = 0;
  renderer.reset(seed);
  renderer.layout(board);
  hideOverlay();
  updateHud();
  tutorialEvent('start');
}

function startLevel(n: number): void {
  mode = { kind: 'level', n };
  progress.current = n;
  saveProgress(progress);
  begin(generateLevel(n), n, n === 0);
}

function startDaily(): void {
  const date = new Date();
  mode = { kind: 'daily', date };
  begin(generateDaily(date), date.getMonth() * 31 + date.getDate());
}

function restart(): void {
  if (mode.kind === 'daily') startDaily();
  else startLevel(mode.n);
}

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function title(): string {
  if (mode.kind === 'daily') return `Daily · ${shortDate(mode.date)}`;
  return mode.n === 0 ? 'Tutorial' : `Level ${mode.n}`;
}

function updateHud(): void {
  levelLabel.textContent = title();
  heartsEl.innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) =>
    `<span class="${i < board.hearts ? '' : 'lost'}">♥</span>`,
  ).join('');
  leftEl.textContent = board.left > 0 ? `${board.left} arrow${board.left === 1 ? '' : 's'} left` : '';
}

function showOverlay(html: string): void {
  panel.innerHTML = html;
  overlay.hidden = false;
}

function hideOverlay(): void {
  overlay.hidden = true;
}

function dayBefore(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
}

/** Today's daily state: done already, and the streak that is still alive. */
function dailyStatus(): { done: boolean; streak: number } {
  const today = new Date();
  if (daily.last === dateKey(today)) return { done: true, streak: daily.streak };
  if (daily.last === dateKey(dayBefore(today))) return { done: false, streak: daily.streak };
  return { done: false, streak: 0 };
}

function completeDaily(date: Date): void {
  const key = dateKey(date);
  if (daily.last === key) return;
  daily.streak = daily.last === dateKey(dayBefore(date)) ? daily.streak + 1 : 1;
  daily.last = key;
  saveDaily(daily);
}

function showWin(): void {
  const stars = Array.from({ length: MAX_HEARTS }, (_, i) =>
    `<span class="star ${i < board.hearts ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`,
  ).join('');
  const summary = `${board.hearts === MAX_HEARTS ? 'Perfect — no hearts lost!' : 'Nice work.'}${bestCombo >= 2 ? `<br>Best combo <strong>×${bestCombo}</strong>` : ''}`;

  if (mode.kind === 'daily') {
    completeDaily(mode.date);
    return showOverlay(`
      <div class="stars">${stars}</div>
      <h2>Daily challenge done!</h2>
      <p>${summary}<br>🔥 <strong>${daily.streak}-day streak</strong> — come back tomorrow.</p>
      <button class="big-btn" data-action="resume">Back to ${progress.current === 0 ? 'the tutorial' : `Level ${progress.current}`}</button>
      <button class="big-btn secondary" data-action="levels">All levels</button>
    `);
  }

  const n = mode.n;
  if (n === 0) {
    return showOverlay(`
      <div class="stars">${stars}</div>
      <h2>Tutorial complete!</h2>
      <p>You're ready. Every level is shaped like its number.</p>
      <button class="big-btn" data-action="next">Start Level 1 →</button>
    `);
  }

  const before = progress.unlocked;
  progress.unlocked = Math.max(progress.unlocked, n + 1);
  saveProgress(progress);
  const newTheme = THEMES.find((t) => t.unlock === n && before <= n);
  showOverlay(`
    <div class="stars">${stars}</div>
    <h2>Level ${n} cleared!</h2>
    <p>${summary}</p>
    ${newTheme ? `<div class="unlock">🎨 New theme unlocked: <strong>${newTheme.name}</strong><button class="chip-btn" data-theme="${newTheme.id}" data-then="win">Use it</button></div>` : ''}
    <button class="big-btn" data-action="next">Level ${n + 1} →</button>
    <button class="big-btn secondary" data-action="levels">All levels</button>
  `);
}

function showLose(): void {
  sfx.lose();
  showOverlay(`
    <h2>Out of hearts</h2>
    <p>${title()} beat you this time.</p>
    <button class="big-btn" data-action="retry">Try again</button>
    <button class="big-btn secondary" data-action="levels">All levels</button>
  `);
}

function showLevels(): void {
  const { done, streak } = dailyStatus();
  const last = Math.ceil((progress.unlocked + 1) / 20) * 20;
  const current = mode.kind === 'level' ? mode.n : -1;
  const buttons = Array.from({ length: last + 1 }, (_, n) => {
    const cls = n === current ? 'current' : '';
    const label = n === 0 ? '<span title="Tutorial">0</span>' : n;
    return `<button class="${cls}" data-level="${n}" ${n > progress.unlocked ? 'disabled' : ''}>${label}</button>`;
  }).join('');
  showOverlay(`
    <button class="daily-card" data-action="daily">
      <span class="daily-title">📅 Daily challenge · ${shortDate(new Date())}</span>
      <span class="daily-sub">${done ? '✓ Done today' : 'Play today\'s date'}${streak > 0 ? ` · 🔥 ${streak}-day streak` : ''}</span>
    </button>
    <h2>Levels</h2>
    <div class="level-grid">${buttons}</div>
    <button class="big-btn secondary" data-action="close">Close</button>
  `);
  panel.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

function showSettings(): void {
  const toggle = (action: string, label: string, on: boolean, note = '', disabled = false) => `
    <button class="setting" data-action="${action}" ${disabled ? 'disabled' : ''}>
      <span><strong>${label}</strong>${note ? `<small>${note}</small>` : ''}</span>
      <span class="switch ${on && !disabled ? 'on' : ''}"></span>
    </button>`;
  const themes = THEMES.map((t) => {
    const open = isUnlocked(t, progress.unlocked);
    const cls = t.id === settings.theme ? 'current' : '';
    return `<button class="theme ${cls}" data-theme="${t.id}" data-then="settings" ${open ? '' : 'disabled'}>
      <span class="swatch" style="background:${t.swatch[0]};color:${t.swatch[1]}">➜</span>
      <span>${open ? t.name : `🔒 Level ${t.unlock}`}</span>
    </button>`;
  }).join('');
  showOverlay(`
    <h2>Settings</h2>
    ${toggle('toggle-sound', 'Sound', settings.sound)}
    ${toggle('toggle-haptics', 'Vibration', settings.haptics, hapticsSupported ? 'Buzz on taps and mistakes' : 'Not supported on this device', !hapticsSupported)}
    <h3>Themes</h3>
    <p class="hint-text">A new theme unlocks every 10 levels.</p>
    <div class="theme-grid">${themes}</div>
    <button class="big-btn secondary" data-action="close">Close</button>
  `);
}

overlay.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('button');
  if (!target) {
    // Tapping the backdrop only closes non-blocking panels.
    if (e.target === overlay && !board.won && !board.lost) hideOverlay();
    return;
  }
  const { level, theme, then } = target.dataset;
  if (level) return startLevel(Number(level));
  if (theme) {
    settings.theme = theme;
    saveSettings(settings);
    applySettings();
    if (then === 'settings') showSettings();
    else target.replaceWith(Object.assign(document.createElement('span'), { textContent: ' ✓' }));
    return;
  }
  switch (target.dataset.action) {
    case 'next':
      return startLevel(mode.kind === 'level' ? mode.n + 1 : progress.current);
    case 'retry':
      return restart();
    case 'resume':
      return startLevel(progress.current);
    case 'daily':
      return startDaily();
    case 'levels':
      return showLevels();
    case 'close':
      return hideOverlay();
    case 'toggle-sound':
      settings.sound = !settings.sound;
      break;
    case 'toggle-haptics':
      settings.haptics = !settings.haptics;
      if (settings.haptics) haptics.exit();
      break;
    default:
      return;
  }
  saveSettings(settings);
  applySettings();
  showSettings();
});

function handleTap(sx: number, sy: number): void {
  const cell = renderer.cellAt(board, sx, sy);
  if (!cell) return;
  const res = board.tap(cell.x, cell.y);
  const now = performance.now();
  if (res.kind === 'exit') {
    renderer.addFlyer(board, res.arrow, now);
    bumpCombo(now);
    renderer.burst(board, res.head, res.dir, combo, now);
    renderer.popup(board, res.head, combo >= 2 ? `×${combo}` : '+1', combo, now);
    sfx.exit(combo);
    haptics.exit();
    const milestone = MILESTONES[combo] ?? (combo > 30 && combo % 10 === 0 ? 'Legendary!' : null);
    if (milestone) {
      // Milestone word sits in the corner with the combo meter, off the board.
      comboWord.textContent = milestone;
      comboWord.classList.remove('show');
      void comboWord.offsetWidth;
      comboWord.classList.add('show');
      sfx.combo();
      haptics.combo();
    }
    tutorialEvent('exit');
    if (board.won) {
      resetCombo();
      guide(null);
      renderer.showBanner(board.hearts === MAX_HEARTS ? 'Perfect!' : 'Cleared!', now);
      renderer.confetti(now);
      sfx.win();
      haptics.win();
      setTimeout(showWin, 1100);
    }
  } else if (res.kind === 'blocked') {
    renderer.addBump(board, res.arrow, res.blocker, now);
    resetCombo();
    sfx.bump();
    haptics.bump();
    tutorialEvent('blocked');
    if (!board.forgiving) {
      heartsEl.classList.remove('shake');
      void heartsEl.offsetWidth;
      heartsEl.classList.add('shake');
    }
    if (board.lost) setTimeout(showLose, 400);
  }
  updateHud();
}

// Gestures: a quick single-finger touch taps, dragging pans, two fingers pinch-zoom.
const TAP_SLOP = 8;
const pointers = new Map<number, { x: number; y: number }>();
let tapStart: { x: number; y: number } | null = null;

function localPoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function pinchInfo(): { mid: { x: number; y: number }; dist: number } {
  const [a, b] = [...pointers.values()];
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  // Only a gesture that starts and stays as one finger counts as a tap.
  tapStart = pointers.size === 1 ? p : null;
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const p = localPoint(e);
  if (pointers.size === 2) {
    const before = pinchInfo();
    pointers.set(e.pointerId, p);
    const after = pinchInfo();
    if (before.dist > 0) renderer.zoomAt(after.dist / before.dist, after.mid.x, after.mid.y);
    renderer.panBy(after.mid.x - before.mid.x, after.mid.y - before.mid.y);
    return;
  }
  pointers.set(e.pointerId, p);
  if (pointers.size !== 1) return;
  if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > TAP_SLOP) tapStart = null;
  if (!tapStart) renderer.panBy(p.x - prev.x, p.y - prev.y);
});

function endPointer(e: PointerEvent, cancelled: boolean): void {
  if (!pointers.delete(e.pointerId)) return;
  if (!cancelled && tapStart && pointers.size === 0) handleTap(tapStart.x, tapStart.y);
  if (pointers.size === 0) tapStart = null;
}

canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = localPoint(e);
    renderer.zoomAt(Math.exp(-e.deltaY * 0.002), p.x, p.y);
  },
  { passive: false },
);

$('menu-btn').addEventListener('click', showLevels);
$('settings-btn').addEventListener('click', showSettings);
$('hint-btn').addEventListener('click', () => {
  const k = board.hint();
  if (k !== -1) renderer.showHint(k, performance.now());
});

window.addEventListener('resize', () => renderer.layout(board));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.readTheme());

function frame(now: number): void {
  renderer.draw(board, now);
  requestAnimationFrame(frame);
}

applySettings();
startLevel(progress.current);
requestAnimationFrame(frame);
