import { DIGIT_H, DIGIT_W, digitPixel } from './font';

/** 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const EMPTY = -1;

export interface Level {
  number: number;
  width: number;
  height: number;
  /** Arrow direction per cell (row-major), or EMPTY. */
  cells: Int8Array;
  /** One valid removal order (cell indices), used for tests and hints. */
  solution: number[];
}

export interface Shape {
  width: number;
  height: number;
  filled: boolean[];
}

/** Stroke thickness in cells, the same for every level. */
export const SCALE = 2;

/** Chance of picking the "hardest" arrow at each step of generation. */
export function hardnessFor(level: number): number {
  return Math.min(0.9, 0.15 + level / 150);
}

/** The level number drawn as a grid of filled cells. */
export function numberShape(level: number, scale: number): Shape {
  const text = String(level);
  const gap = scale;
  const width = text.length * DIGIT_W * scale + (text.length - 1) * gap;
  const height = DIGIT_H * scale;
  const filled = new Array<boolean>(width * height).fill(false);
  for (let d = 0; d < text.length; d++) {
    const ox = d * (DIGIT_W * scale + gap);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < DIGIT_W * scale; x++) {
        if (digitPixel(text[d], Math.floor(x / scale), Math.floor(y / scale))) {
          filled[y * width + ox + x] = true;
        }
      }
    }
  }
  return { width, height, filled };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Assigns arrow directions by peeling the shape from the outside in: each
 * step picks a remaining cell with a clear path to the edge. Playing the
 * peel order forward always clears the board, so every level is solvable.
 */
export function generateLevel(level: number): Level {
  const { width, height, filled } = numberShape(level, SCALE);
  const rng = mulberry32(Math.imul(level, 2654435761) ^ 0x9e3779b9);
  const hardness = hardnessFor(level);
  const remaining = filled.slice();
  const peeled = new Uint8Array(width * height);
  const cells = new Int8Array(width * height).fill(EMPTY);
  const solution: number[] = [];
  let left = remaining.filter(Boolean).length;

  while (left > 0) {
    // A cell can leave in a direction only if it is the outermost remaining
    // cell of its row/column on that side. Score = earlier arrows in its path.
    const options: { i: number; d: Dir; score: number }[] = [];
    const scan = (start: number, step: number, count: number, d: Dir) => {
      let score = 0;
      for (let k = 0, j = start; k < count; k++, j += step) {
        if (remaining[j]) {
          options.push({ i: j, d, score });
          return;
        }
        score += peeled[j];
      }
    };
    for (let y = 0; y < height; y++) {
      scan(y * width, 1, width, 3);
      scan(y * width + width - 1, -1, width, 1);
    }
    for (let x = 0; x < width; x++) {
      scan(x, width, height, 0);
      scan((height - 1) * width + x, -width, height, 2);
    }
    const best = Math.max(...options.map((o) => o.score));
    // Harder levels favour arrows that depend on many earlier arrows.
    const pool = rng() < hardness ? options.filter((o) => o.score === best) : options;
    const pick = pool[Math.floor(rng() * pool.length)];
    cells[pick.i] = pick.d;
    remaining[pick.i] = false;
    peeled[pick.i] = 1;
    solution.push(pick.i);
    left--;
  }

  return { number: level, width, height, cells, solution };
}
