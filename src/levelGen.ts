import { DIGIT_H, DIGIT_W, digitPixel } from './font';

/** 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

/** An arrow covering one or more cells. path[0] is the head; the rest trails behind it. */
export interface Arrow {
  dir: Dir;
  path: number[];
}

export interface Level {
  width: number;
  height: number;
  /** Cells that are part of the drawn shape (row-major). */
  shape: boolean[];
  /** Listed in a valid clearing order, so playing them in order always wins. */
  arrows: Arrow[];
}

export interface Shape {
  width: number;
  height: number;
  filled: boolean[];
}

/** Stroke thickness in cells, the same for every level. */
export const SCALE = 3;

/** Chance of picking the "hardest" arrow at each step of generation. */
export function hardnessFor(level: number): number {
  return Math.min(0.95, 0.4 + level / 80);
}

/** Lines of digits drawn as a grid of filled cells; each line is centred. */
export function digitsShape(lines: string[], scale: number): Shape {
  const gap = scale;
  const lineW = (t: string) => t.length * DIGIT_W * scale + (t.length - 1) * gap;
  const width = Math.max(...lines.map(lineW));
  const height = lines.length * DIGIT_H * scale + (lines.length - 1) * gap;
  const filled = new Array<boolean>(width * height).fill(false);
  lines.forEach((text, row) => {
    const oy = row * (DIGIT_H * scale + gap);
    const left = Math.floor((width - lineW(text)) / 2);
    for (let d = 0; d < text.length; d++) {
      const ox = left + d * (DIGIT_W * scale + gap);
      for (let y = 0; y < DIGIT_H * scale; y++) {
        for (let x = 0; x < DIGIT_W * scale; x++) {
          if (digitPixel(text[d], Math.floor(x / scale), Math.floor(y / scale))) {
            filled[(oy + y) * width + ox + x] = true;
          }
        }
      }
    }
  });
  return { width, height, filled };
}

/** The level number drawn as a grid of filled cells. */
export function numberShape(level: number, scale: number): Shape {
  return digitsShape([String(level)], scale);
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

interface GenOptions {
  seed: number;
  hardness: number;
  /** Grow arrows into lines of 3–6 cells instead of single cells. */
  long: boolean;
}

/**
 * Builds arrows by peeling the shape from the outside in: each step picks a
 * remaining cell with a clear path to the edge as an arrow head (and, for
 * long arrows, grows a tail behind it). Playing the peel order forward always
 * clears the board, so every level is solvable.
 */
export function generate({ width, height, filled }: Shape, { seed, hardness, long }: GenOptions): Level {
  const rng = mulberry32(seed);
  const remaining = filled.slice();
  const peeled = new Uint8Array(width * height);
  const arrows: Arrow[] = [];
  let left = remaining.filter(Boolean).length;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const take = (i: number) => {
    remaining[i] = false;
    peeled[i] = 1;
    left--;
  };

  while (left > 0) {
    // A cell can leave in a direction only if it is the outermost remaining
    // cell of its row/column on that side. Score = earlier arrows in its path.
    let options: { i: number; d: Dir; score: number }[] = [];
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
    const behind = (o: { i: number; d: Dir }) => {
      const x = (o.i % width) - DX[o.d];
      const y = Math.floor(o.i / width) - DY[o.d];
      return inside(x, y) && remaining[y * width + x] ? y * width + x : -1;
    };
    if (long) {
      // Prefer heads that have room for a tail, so few arrows end up single.
      const withTail = options.filter((o) => behind(o) !== -1);
      if (withTail.length > 0 && rng() < 0.9) options = withTail;
    }
    const best = Math.max(...options.map((o) => o.score));
    // Harder levels favour arrows that depend on many earlier arrows.
    const pool = rng() < hardness ? options.filter((o) => o.score === best) : options;
    const pick = pool[Math.floor(rng() * pool.length)];
    const path = [pick.i];
    const tail = long ? behind(pick) : -1;
    take(pick.i);
    if (tail !== -1) {
      // The first tail cell sits straight behind the head so the head points
      // along the line; after that the tail wanders through the shape.
      const want = 3 + Math.floor(rng() * 4);
      let cur = tail;
      path.push(cur);
      take(cur);
      while (path.length < want) {
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        const next = [0, 1, 2, 3]
          .map((d) => [cx + DX[d], cy + DY[d]])
          .filter(([x, y]) => inside(x, y) && remaining[y * width + x])
          .map(([x, y]) => y * width + x);
        if (next.length === 0) break;
        cur = next[Math.floor(rng() * next.length)];
        path.push(cur);
        take(cur);
      }
    }
    arrows.push({ dir: pick.d, path });
  }

  return { width, height, shape: filled, arrows };
}

export function generateLevel(level: number): Level {
  // Level 0 is the tutorial: a small, gentle "0".
  if (level === 0) return generate(numberShape(0, 1), { seed: 0x5eed, hardness: 0.1, long: false });
  return generate(numberShape(level, SCALE), {
    seed: Math.imul(level, 2654435761) ^ 0x9e3779b9,
    hardness: hardnessFor(level),
    long: true,
  });
}

/** "YYYY-MM-DD" in the player's local time. */
export function dateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Today's daily challenge: the month stacked over the day, with long arrows. */
export function generateDaily(date: Date): Level {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const seed = Number(dateKey(date).replace(/-/g, ''));
  return generate(digitsShape([mm, dd], 2), { seed: Math.imul(seed, 2246822519), hardness: 0.75, long: true });
}
