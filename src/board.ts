import { DX, DY, Dir, EMPTY, Level } from './levelGen';

export const MAX_HEARTS = 3;

export type TapResult =
  | { kind: 'none' }
  | { kind: 'exit'; index: number; dir: Dir }
  | { kind: 'blocked'; index: number; dir: Dir; blocker: number };

export class Board {
  readonly width: number;
  readonly height: number;
  readonly cells: Int8Array;
  /** Cells that were part of the number at the start (for the ghost outline). */
  readonly shape: boolean[];
  hearts = MAX_HEARTS;
  left: number;

  constructor(level: Level) {
    this.width = level.width;
    this.height = level.height;
    this.cells = level.cells.slice();
    this.shape = Array.from(this.cells, (c) => c !== EMPTY);
    this.left = this.shape.filter(Boolean).length;
  }

  get won(): boolean {
    return this.left === 0;
  }

  get lost(): boolean {
    return this.hearts <= 0;
  }

  /** First arrow in the path of cell i, or -1 when the path is clear. */
  blockerOf(i: number): number {
    const d = this.cells[i];
    let x = (i % this.width) + DX[d];
    let y = Math.floor(i / this.width) + DY[d];
    while (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      const j = y * this.width + x;
      if (this.cells[j] !== EMPTY) return j;
      x += DX[d];
      y += DY[d];
    }
    return -1;
  }

  tap(x: number, y: number): TapResult {
    if (this.won || this.lost) return { kind: 'none' };
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return { kind: 'none' };
    const index = y * this.width + x;
    const dir = this.cells[index];
    if (dir === EMPTY) return { kind: 'none' };
    const blocker = this.blockerOf(index);
    if (blocker !== -1) {
      this.hearts--;
      return { kind: 'blocked', index, dir: dir as Dir, blocker };
    }
    this.cells[index] = EMPTY;
    this.left--;
    return { kind: 'exit', index, dir: dir as Dir };
  }

  /** An arrow that can leave right now, or -1. */
  hint(): number {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== EMPTY && this.blockerOf(i) === -1) return i;
    }
    return -1;
  }
}
