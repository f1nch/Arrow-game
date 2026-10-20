import { Board } from './board';
import { DX, DY, Dir, EMPTY } from './levelGen';

const FLY_MS = 450;
const BUMP_MS = 320;
const FLASH_MS = 400;
const HINT_MS = 1600;

interface Flyer { x: number; y: number; dir: Dir; start: number }
interface Bump { index: number; dir: Dir; reach: number; blocker: number; start: number }

interface Theme { bg: string; ghost: string; arrow: string; danger: string; hint: string }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 0;
  private ox = 0;
  private oy = 0;
  private cssW = 0;
  private cssH = 0;
  private flyers: Flyer[] = [];
  private bump: Bump | null = null;
  private hint: { index: number; start: number } | null = null;
  private theme!: Theme;
  private hue = 200;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.readTheme();
  }

  readTheme(): void {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const dark = v('--scheme') === 'dark';
    this.theme = {
      bg: v('--bg'),
      ghost: dark ? `hsla(${this.hue}, 40%, 60%, 0.12)` : `hsla(${this.hue}, 50%, 45%, 0.1)`,
      arrow: dark ? `hsl(${this.hue}, 70%, 68%)` : `hsl(${this.hue}, 65%, 38%)`,
      danger: v('--danger'),
      hint: v('--hint'),
    };
  }

  setLevel(level: number): void {
    this.hue = (level * 47 + 200) % 360;
    this.flyers = [];
    this.bump = null;
    this.hint = null;
    this.readTheme();
  }

  /** Fit the board to the canvas size. Call on resize and level change. */
  layout(board: Board): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cell = Math.min(64, Math.floor(Math.min(rect.width / (board.width + 2), rect.height / (board.height + 2))));
    this.ox = (rect.width - this.cell * board.width) / 2;
    this.oy = (rect.height - this.cell * board.height) / 2;
  }

  cellAt(board: Board, px: number, py: number): { x: number; y: number } | null {
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
    return { x, y };
  }

  addFlyer(board: Board, index: number, dir: Dir, now: number): void {
    this.flyers.push({ x: index % board.width, y: Math.floor(index / board.width), dir, start: now });
    if (this.hint?.index === index) this.hint = null;
  }

  addBump(board: Board, index: number, dir: Dir, blocker: number, now: number): void {
    const dist = Math.abs((blocker % board.width) - (index % board.width)) + Math.abs(Math.floor(blocker / board.width) - Math.floor(index / board.width));
    this.bump = { index, dir, reach: dist - 1 + 0.2, blocker, start: now };
  }

  showHint(index: number, now: number): void {
    this.hint = { index, start: now };
  }

  draw(board: Board, now: number): void {
    const { ctx, cell, theme } = this;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Ghost of the number, so the shape stays visible as arrows leave.
    ctx.fillStyle = theme.ghost;
    for (let i = 0; i < board.shape.length; i++) {
      if (!board.shape[i]) continue;
      const [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
      roundRect(ctx, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
      ctx.fill();
    }

    if (this.hint && now - this.hint.start > HINT_MS) this.hint = null;
    if (this.hint) {
      const t = (now - this.hint.start) / HINT_MS;
      const i = this.hint.index;
      const [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
      ctx.strokeStyle = theme.hint;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
      ctx.lineWidth = Math.max(2, cell * 0.08);
      roundRect(ctx, px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.22);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const bump = this.bump && now - this.bump.start < Math.max(BUMP_MS, FLASH_MS) ? this.bump : null;
    if (!bump) this.bump = null;

    for (let i = 0; i < board.cells.length; i++) {
      const d = board.cells[i];
      if (d === EMPTY) continue;
      let [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
      let color = theme.arrow;
      if (bump && bump.index === i) {
        const t = Math.min(1, (now - bump.start) / BUMP_MS);
        const off = Math.sin(t * Math.PI) * bump.reach * cell;
        px += DX[d] * off;
        py += DY[d] * off;
        color = theme.danger;
      } else if (bump && bump.blocker === i && now - bump.start < FLASH_MS) {
        color = theme.danger;
      }
      this.drawArrow(px, py, d as Dir, color, 1);
    }

    const travel = (board.width + board.height + 4) * cell;
    this.flyers = this.flyers.filter((f) => now - f.start < FLY_MS);
    for (const f of this.flyers) {
      const t = (now - f.start) / FLY_MS;
      const off = t * t * travel;
      const [px, py] = this.pos(f.x, f.y);
      this.drawArrow(px + DX[f.dir] * off, py + DY[f.dir] * off, f.dir, theme.arrow, 1 - t);
    }
  }

  private pos(x: number, y: number): [number, number] {
    return [this.ox + x * this.cell, this.oy + y * this.cell];
  }

  private drawArrow(px: number, py: number, dir: Dir, color: string, alpha: number): void {
    const { ctx, cell } = this;
    const s = cell / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px + s, py + s);
    ctx.rotate((dir * Math.PI) / 2);
    // Drawn pointing up; rotation turns it to face its direction.
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.62);
    ctx.lineTo(0, -s * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.7);
    ctx.lineTo(s * 0.5, -s * 0.05);
    ctx.lineTo(-s * 0.5, -s * 0.05);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.12;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
