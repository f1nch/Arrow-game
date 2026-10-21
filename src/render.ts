import { Board } from './board';
import { DX, DY, Dir } from './levelGen';

const FLY_MS = 450;
const BUMP_MS = 320;
const FLASH_MS = 400;
const HINT_MS = 1600;
const POPUP_MS = 650;
const BANNER_MS = 1300;
const GRAVITY = 1800; // px/s² in screen space; scaled by cell size on the board

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Point = [number, number];
/** An arrow leaving the board; pts are cell centres from tail to head. */
interface Flyer { pts: Point[]; dir: Dir; start: number }
interface Bump { arrow: number; dir: Dir; reach: number; blocker: number; start: number }

/** A spark or confetti piece. Board particles use board pixels; screen ones ignore zoom. */
interface Particle {
  x: number; y: number; vx: number; vy: number;
  start: number; life: number; color: string; size: number;
  screen: boolean; spin: number;
}
interface Popup { x: number; y: number; text: string; start: number; size: number; color: string }
interface Banner { text: string; start: number; color: string }

interface Theme { bg: string; ghost: string; arrow: string; danger: string; hint: string }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 0;
  private ox = 0;
  private oy = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private boardW = 0;
  private boardH = 0;
  // View transform for pinch-zoom: screen = base * zoom + (tx, ty).
  private zoom = 1;
  private maxZoom = 1;
  private tx = 0;
  private ty = 0;
  private flyers: Flyer[] = [];
  private bump: Bump | null = null;
  private hint: { arrow: number; start: number; persistent: boolean } | null = null;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private banner: Banner | null = null;
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
    // Colour themes set --arrow/--ghost; the classic theme tints each level.
    this.theme = {
      bg: v('--bg'),
      ghost: v('--ghost') || (dark ? `hsla(${this.hue}, 40%, 60%, 0.12)` : `hsla(${this.hue}, 50%, 45%, 0.1)`),
      arrow: v('--arrow') || (dark ? `hsl(${this.hue}, 70%, 68%)` : `hsl(${this.hue}, 65%, 38%)`),
      danger: v('--danger'),
      hint: v('--hint'),
    };
  }

  /** Clear effects for a new board; seed picks the level's colour. */
  reset(seed: number): void {
    this.hue = (seed * 47 + 200) % 360;
    this.flyers = [];
    this.bump = null;
    this.hint = null;
    this.particles = [];
    this.popups = [];
    this.banner = null;
    this.readTheme();
  }

  /** Fit the board to the canvas size and reset zoom. Call on resize and level change. */
  layout(board: Board): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.cell = Math.min(64, Math.floor(Math.min(rect.width / (board.width + 2), rect.height / (board.height + 2))));
    this.ox = (rect.width - this.cell * board.width) / 2;
    this.oy = (rect.height - this.cell * board.height) / 2;
    this.boardW = this.cell * board.width;
    this.boardH = this.cell * board.height;
    this.maxZoom = Math.max(1, 56 / this.cell);
    this.zoom = 1;
    this.tx = 0;
    this.ty = 0;
  }

  /** Zoom by factor f, keeping screen point (sx, sy) fixed. */
  zoomAt(f: number, sx: number, sy: number): void {
    const z = Math.min(this.maxZoom, Math.max(1, this.zoom * f));
    this.tx = sx - ((sx - this.tx) * z) / this.zoom;
    this.ty = sy - ((sy - this.ty) * z) / this.zoom;
    this.zoom = z;
    this.clampPan();
  }

  panBy(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
    this.clampPan();
  }

  // Keep the board covering the middle of the screen so it can't be lost.
  private clampPan(): void {
    const z = this.zoom;
    const cx = this.cssW / 2;
    const cy = this.cssH / 2;
    this.tx = Math.min(cx - this.ox * z, Math.max(cx - (this.ox + this.boardW) * z, this.tx));
    this.ty = Math.min(cy - this.oy * z, Math.max(cy - (this.oy + this.boardH) * z, this.ty));
  }

  cellAt(board: Board, sx: number, sy: number): { x: number; y: number } | null {
    const px = (sx - this.tx) / this.zoom;
    const py = (sy - this.ty) / this.zoom;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= board.width || y >= board.height) return null;
    return { x, y };
  }

  addFlyer(board: Board, arrow: number, now: number): void {
    const { dir, path } = board.arrows[arrow];
    this.flyers.push({ pts: this.centres(board, path), dir, start: now });
    if (this.hint?.arrow === arrow) this.hint = null;
  }

  addBump(board: Board, arrow: number, blocker: number, now: number): void {
    const { dir, path } = board.arrows[arrow];
    const head = path[0];
    const dist = Math.abs((blocker % board.width) - (head % board.width)) + Math.abs(Math.floor(blocker / board.width) - Math.floor(head / board.width));
    this.bump = { arrow, dir, reach: dist - 1 + 0.2, blocker: board.owner[blocker], start: now };
  }

  /** Sparks where an arrow left. Bigger and more colourful as the combo grows. */
  burst(board: Board, index: number, dir: Dir, combo: number, now: number): void {
    if (reducedMotion()) return;
    const [px, py] = this.pos(index % board.width, Math.floor(index / board.width));
    const c = this.cell;
    const count = 6 + Math.min(combo, 12) * 2;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const speed = c * (2 + Math.random() * 4 + Math.min(combo, 10) * 0.3);
      this.particles.push({
        x: px + c / 2, y: py + c / 2,
        // Bias the spray backwards, away from where the arrow flew.
        vx: Math.cos(a) * speed - DX[dir] * c * 2,
        vy: Math.sin(a) * speed - DY[dir] * c * 2,
        start: now, life: 450 + Math.random() * 350,
        color: `hsl(${this.hue + Math.random() * 80 - 40 + combo * 12}, 90%, 60%)`,
        size: c * (0.08 + Math.random() * 0.1), screen: false, spin: 0,
      });
    }
  }

  /** Floating text above a cell, e.g. "+3". */
  popup(board: Board, index: number, text: string, combo: number, now: number): void {
    const [px, py] = this.pos(index % board.width, Math.floor(index / board.width));
    const size = this.cell * Math.min(1, 0.55 + combo * 0.04);
    // Start above the tapped cell so the number doesn't cover nearby arrows.
    this.popups.push({ x: px + this.cell / 2, y: py - this.cell * 1.5, text, start: now, size, color: `hsl(${(this.hue + combo * 25) % 360}, 85%, 55%)` });
  }

  /** Big centred message, used when a level is cleared. */
  showBanner(text: string, now: number): void {
    this.banner = { text, start: now, color: `hsl(${(this.hue + 180) % 360}, 85%, 55%)` };
  }

  /** Confetti across the whole screen for a level win. */
  confetti(now: number): void {
    if (reducedMotion()) return;
    for (let k = 0; k < 140; k++) {
      this.particles.push({
        x: Math.random() * this.cssW, y: -20 - Math.random() * this.cssH * 0.3,
        vx: (Math.random() - 0.5) * 240, vy: 100 + Math.random() * 300,
        start: now, life: 1800 + Math.random() * 900,
        color: `hsl(${Math.random() * 360}, 90%, 60%)`,
        size: 5 + Math.random() * 6, screen: true, spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  /** Highlight an arrow; a persistent hint stays until cleared (used by the tutorial). */
  showHint(arrow: number, now: number, persistent = false): void {
    this.hint = { arrow, start: now, persistent };
  }

  clearHint(): void {
    this.hint = null;
  }

  draw(board: Board, now: number): void {
    const { ctx, cell, theme, dpr, zoom } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * this.tx, dpr * this.ty);

    // Ghost of the number, so the shape stays visible as arrows leave.
    ctx.fillStyle = theme.ghost;
    for (let i = 0; i < board.shape.length; i++) {
      if (!board.shape[i]) continue;
      const [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
      roundRect(ctx, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
      ctx.fill();
    }

    if (this.hint && !this.hint.persistent && now - this.hint.start > HINT_MS) this.hint = null;
    if (this.hint && board.alive(this.hint.arrow)) {
      const t = (now - this.hint.start) / HINT_MS;
      ctx.strokeStyle = theme.hint;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
      ctx.lineWidth = Math.max(2, cell * 0.08);
      for (const i of board.arrows[this.hint.arrow].path) {
        const [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
        roundRect(ctx, px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const bump = this.bump && now - this.bump.start < Math.max(BUMP_MS, FLASH_MS) ? this.bump : null;
    if (!bump) this.bump = null;

    board.arrows.forEach(({ dir, path }, k) => {
      if (!board.alive(k)) return;
      let dx = 0;
      let dy = 0;
      let color = theme.arrow;
      if (bump && bump.arrow === k) {
        const t = Math.min(1, (now - bump.start) / BUMP_MS);
        const off = Math.sin(t * Math.PI) * bump.reach * cell;
        dx = DX[dir] * off;
        dy = DY[dir] * off;
        color = theme.danger;
      } else if (bump && bump.blocker === k && now - bump.start < FLASH_MS) {
        color = theme.danger;
      }
      const pts = this.centres(board, path).map(([x, y]): Point => [x + dx, y + dy]);
      this.drawSnake(pts, dir, color, 1);
    });

    const travel = (board.width + board.height + 4) * cell;
    this.flyers = this.flyers.filter((f) => now - f.start < FLY_MS);
    for (const f of this.flyers) {
      const t = (now - f.start) / FLY_MS;
      if (f.pts.length === 1) {
        // Fading trail behind a flying single arrow.
        const [hx, hy] = f.pts[0];
        for (let k = 3; k >= 0; k--) {
          const tt = Math.max(0, t - k * 0.05);
          const o = tt * tt * travel;
          this.drawSnake([[hx + DX[f.dir] * o, hy + DY[f.dir] * o]], f.dir, theme.arrow, (1 - t) * (k === 0 ? 1 : 0.18));
        }
      } else {
        // Long arrows slide along their own path, then straight out past the head.
        const [hx, hy] = f.pts[f.pts.length - 1];
        const track: Point[] = [...f.pts, [hx + DX[f.dir] * travel, hy + DY[f.dir] * travel]];
        const len = (f.pts.length - 1) * cell;
        const o = t * t * travel;
        this.drawSnake(slicePath(track, o, o + len), f.dir, theme.arrow, 1 - t * t);
      }
    }

    this.drawParticles(now, false);
    this.drawPopups(now);

    // Screen-space effects sit above the zoomed board.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawParticles(now, true);
    this.drawBanner(now);
  }

  private drawParticles(now: number, screen: boolean): void {
    const { ctx } = this;
    const g = screen ? GRAVITY * 0.25 : GRAVITY * (this.cell / 40);
    this.particles = this.particles.filter((p) => now - p.start < p.life);
    for (const p of this.particles) {
      if (p.screen !== screen) continue;
      const t = (now - p.start) / 1000;
      const k = (now - p.start) / p.life;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * g * t * t;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      if (screen) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.spin * t);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(now: number): void {
    const { ctx } = this;
    this.popups = this.popups.filter((p) => now - p.start < POPUP_MS);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const t = (now - p.start) / POPUP_MS;
      const pop = t < 0.2 ? easeOutBack(t / 0.2) : 1;
      ctx.globalAlpha = 0.9 * (t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6);
      ctx.font = `800 ${p.size * pop}px system-ui, sans-serif`;
      ctx.lineWidth = p.size * 0.18;
      ctx.strokeStyle = this.theme.bg;
      const y = p.y - t * this.cell * 2;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(now: number): void {
    const b = this.banner;
    if (!b) return;
    const t = (now - b.start) / BANNER_MS;
    if (t >= 1) {
      this.banner = null;
      return;
    }
    const { ctx } = this;
    const size = Math.min(64, this.cssW / 8);
    const pop = t < 0.25 ? easeOutBack(t / 0.25) : 1 + (t - 0.25) * 0.08;
    ctx.save();
    ctx.translate(this.cssW / 2, this.cssH * 0.18);
    ctx.rotate(-0.06);
    ctx.scale(pop, pop);
    ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = this.theme.bg;
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }

  private pos(x: number, y: number): [number, number] {
    return [this.ox + x * this.cell, this.oy + y * this.cell];
  }

  /** Cell centres for a path given head-first, returned tail-to-head. */
  private centres(board: Board, path: number[]): Point[] {
    const h = this.cell / 2;
    return path
      .map((i): Point => {
        const [px, py] = this.pos(i % board.width, Math.floor(i / board.width));
        return [px + h, py + h];
      })
      .reverse();
  }

  /**
   * Draws an arrow through points (tail to head) with its head facing dir.
   * A single point gets the classic short arrow inside its cell.
   */
  private drawSnake(pts: Point[], dir: Dir, color: string, alpha: number): void {
    const { ctx, cell } = this;
    const s = cell / 2;
    const [hx, hy] = pts[pts.length - 1];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.28;
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.translate(hx, hy);
    ctx.rotate((dir * Math.PI) / 2);
    // Drawn pointing up; rotation turns it to face its direction.
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.62);
      ctx.lineTo(0, -s * 0.1);
      ctx.stroke();
    }
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

/** The part of a polyline between distances a and b along it. */
function slicePath(pts: Point[], a: number, b: number): Point[] {
  const out: Point[] = [];
  let walked = 0;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1];
    const [x1, y1] = pts[k];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const at = (d: number): Point => {
      const f = seg === 0 ? 0 : (d - walked) / seg;
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    };
    if (out.length === 0 && a <= walked + seg) out.push(at(Math.max(a, walked)));
    if (out.length > 0) {
      if (b <= walked + seg) {
        out.push(at(b));
        return out;
      }
      out.push([x1, y1]);
    }
    walked += seg;
  }
  return out.length > 0 ? out : [pts[pts.length - 1]];
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
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
