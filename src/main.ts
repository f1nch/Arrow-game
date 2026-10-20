import './style.css';
import { Board, MAX_HEARTS } from './board';
import { generateLevel } from './levelGen';
import { Renderer } from './render';
import { isMuted, setMuted, sfx } from './sound';
import { loadProgress, saveProgress } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('board');
const levelLabel = $('level-label');
const heartsEl = $('hearts');
const leftEl = $('arrows-left');
const overlay = $('overlay');
const panel = $('panel');
const soundBtn = $<HTMLButtonElement>('sound-btn');

const renderer = new Renderer(canvas);
const progress = loadProgress();
let board: Board;

// Combos: arrows cleared in quick succession without a mistake.
const COMBO_MS = 2000;
const MILESTONES: Record<number, string> = { 5: 'Nice!', 10: 'Great!', 15: 'Amazing!', 20: 'Unstoppable!', 30: 'Legendary!' };
const comboEl = $('combo');
const comboText = $('combo-text');
let combo = 0;
let bestCombo = 0;
let lastExit = 0;
let comboTimer = 0;

function resetCombo(): void {
  combo = 0;
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

function startLevel(n: number): void {
  progress.current = n;
  saveProgress(progress);
  board = new Board(generateLevel(n));
  resetCombo();
  bestCombo = 0;
  renderer.setLevel(n);
  renderer.layout(board);
  hideOverlay();
  updateHud();
}

function updateHud(): void {
  levelLabel.textContent = `Level ${progress.current}`;
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

function showWin(): void {
  const n = progress.current;
  progress.unlocked = Math.max(progress.unlocked, n + 1);
  saveProgress(progress);
  const stars = Array.from({ length: MAX_HEARTS }, (_, i) =>
    `<span class="star ${i < board.hearts ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`,
  ).join('');
  showOverlay(`
    <div class="stars">${stars}</div>
    <h2>Level ${n} cleared!</h2>
    <p>${board.hearts === MAX_HEARTS ? 'Perfect — no hearts lost!' : 'Nice work.'}${bestCombo >= 2 ? `<br>Best combo <strong>×${bestCombo}</strong>` : ''}</p>
    <button class="big-btn" data-action="next">Level ${n + 1} →</button>
    <button class="big-btn secondary" data-action="levels">All levels</button>
  `);
}

function showLose(): void {
  sfx.lose();
  showOverlay(`
    <h2>Out of hearts</h2>
    <p>Level ${progress.current} beat you this time.</p>
    <button class="big-btn" data-action="retry">Try again</button>
    <button class="big-btn secondary" data-action="levels">All levels</button>
  `);
}

function showLevels(): void {
  const last = Math.ceil((progress.unlocked + 1) / 20) * 20;
  const buttons = Array.from({ length: last }, (_, i) => {
    const n = i + 1;
    const cls = n === progress.current ? 'current' : '';
    return `<button class="${cls}" data-level="${n}" ${n > progress.unlocked ? 'disabled' : ''}>${n}</button>`;
  }).join('');
  showOverlay(`
    <h2>Levels</h2>
    <div class="level-grid">${buttons}</div>
    <button class="big-btn secondary" data-action="close">Close</button>
  `);
  panel.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

overlay.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('button');
  if (!target) {
    // Tapping the backdrop only closes non-blocking panels.
    if (e.target === overlay && !board.won && !board.lost) hideOverlay();
    return;
  }
  const level = target.dataset.level;
  if (level) return startLevel(Number(level));
  switch (target.dataset.action) {
    case 'next':
      return startLevel(progress.current + 1);
    case 'retry':
      return startLevel(progress.current);
    case 'levels':
      return showLevels();
    case 'close':
      return hideOverlay();
  }
});

function handleTap(sx: number, sy: number): void {
  const cell = renderer.cellAt(board, sx, sy);
  if (!cell) return;
  const res = board.tap(cell.x, cell.y);
  const now = performance.now();
  if (res.kind === 'exit') {
    renderer.addFlyer(board, res.index, res.dir, now);
    bumpCombo(now);
    renderer.burst(board, res.index, res.dir, combo, now);
    renderer.popup(board, res.index, combo >= 2 ? `×${combo}` : '+1', combo, now);
    sfx.exit(combo);
    const milestone = MILESTONES[combo] ?? (combo > 30 && combo % 10 === 0 ? 'Legendary!' : null);
    if (milestone) {
      renderer.showBanner(milestone, now);
      sfx.combo();
    }
    if (board.won) {
      resetCombo();
      renderer.showBanner(board.hearts === MAX_HEARTS ? 'Perfect!' : 'Cleared!', now);
      renderer.confetti(now);
      sfx.win();
      setTimeout(showWin, 1100);
    }
  } else if (res.kind === 'blocked') {
    renderer.addBump(board, res.index, res.dir, res.blocker, now);
    resetCombo();
    sfx.bump();
    heartsEl.classList.remove('shake');
    void heartsEl.offsetWidth;
    heartsEl.classList.add('shake');
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
$('hint-btn').addEventListener('click', () => {
  const i = board.hint();
  if (i !== -1) renderer.showHint(i, performance.now());
});
soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  soundBtn.textContent = isMuted() ? '🔇' : '🔊';
});

window.addEventListener('resize', () => renderer.layout(board));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderer.readTheme());

function frame(now: number): void {
  renderer.draw(board, now);
  requestAnimationFrame(frame);
}

startLevel(progress.current);
requestAnimationFrame(frame);
