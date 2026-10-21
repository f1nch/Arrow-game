import { Arrow, DX, DY, Dir, Level } from './levelGen';

export const MAX_HEARTS = 3;
const NONE = -1;

export type TapResult =
  | { kind: 'none' }
  | { kind: 'exit'; arrow: number; head: number; dir: Dir }
  | { kind: 'blocked'; arrow: number; head: number; dir: Dir; blocker: number };

export interface BoardOptions {
  /** Mistakes don't cost hearts (used by the tutorial). */
  forgiving?: boolean;
}

export class Board {
  readonly width: number;
  readonly height: number;
  readonly arrows: Arrow[];
  /** Cells that were part of the shape at the start (for the ghost outline). */
  readonly shape: boolean[];
  /** Which arrow covers each cell, or -1. */
  readonly owner: Int16Array;
  readonly forgiving: boolean;
  hearts = MAX_HEARTS;
  left: number;

  constructor(level: Level, { forgiving = false }: BoardOptions = {}) {
    this.width = level.width;
    this.height = level.height;
    this.arrows = level.arrows;
    this.shape = level.shape;
    this.forgiving = forgiving;
    this.owner = new Int16Array(level.width * level.height).fill(NONE);
    level.arrows.forEach((a, k) => a.path.forEach((i) => (this.owner[i] = k)));
    this.left = level.arrows.length;
  }

  get won(): boolean {
    return this.left === 0;
  }

  get lost(): boolean {
    return this.hearts <= 0;
  }

  alive(arrow: number): boolean {
    return this.owner[this.arrows[arrow].path[0]] === arrow;
  }

  /** First occupied cell in front of an arrow's head, or -1 when the way is clear. */
  blockerOf(arrow: number): number {
    const { dir, path } = this.arrows[arrow];
    let x = (path[0] % this.width) + DX[dir];
    let y = Math.floor(path[0] / this.width) + DY[dir];
    while (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      const j = y * this.width + x;
      if (this.owner[j] !== NONE) return j;
      x += DX[dir];
      y += DY[dir];
    }
    return -1;
  }

  tap(x: number, y: number): TapResult {
    if (this.won || this.lost) return { kind: 'none' };
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return { kind: 'none' };
    const arrow = this.owner[y * this.width + x];
    if (arrow === NONE) return { kind: 'none' };
    const { dir, path } = this.arrows[arrow];
    const blocker = this.blockerOf(arrow);
    if (blocker !== -1) {
      if (!this.forgiving) this.hearts--;
      return { kind: 'blocked', arrow, head: path[0], dir, blocker };
    }
    for (const i of path) this.owner[i] = NONE;
    this.left--;
    return { kind: 'exit', arrow, head: path[0], dir };
  }

  /** An arrow that can leave right now, or -1. */
  hint(): number {
    for (let k = 0; k < this.arrows.length; k++) {
      if (this.alive(k) && this.blockerOf(k) === -1) return k;
    }
    return -1;
  }
}
