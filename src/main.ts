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

function startLevel(n: number): void {
  progress.current = n;
  saveProgress(progress);
  board = new Board(generateLevel(n));
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
  sfx.win();
  showOverlay(`
    <h2>Level ${n} cleared!</h2>
    <p>${board.hearts === MAX_HEARTS ? 'Perfect — no hearts lost.' : 'Nice work.'}</p>
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

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cell = renderer.cellAt(board, e.clientX - rect.left, e.clientY - rect.top);
  if (!cell) return;
  const res = board.tap(cell.x, cell.y);
  const now = performance.now();
  if (res.kind === 'exit') {
    renderer.addFlyer(board, res.index, res.dir, now);
    sfx.exit();
    if (board.won) setTimeout(showWin, 450);
  } else if (res.kind === 'blocked') {
    renderer.addBump(board, res.index, res.dir, res.blocker, now);
    sfx.bump();
    heartsEl.classList.remove('shake');
    void heartsEl.offsetWidth;
    heartsEl.classList.add('shake');
    if (board.lost) setTimeout(showLose, 400);
  }
  updateHud();
});

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
