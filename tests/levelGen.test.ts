import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { DX, DY, Level, SCALE, generateDaily, generateLevel, numberShape } from '../src/levelGen';

/** Clears a level by tapping heads in the generated order; returns the board. */
function playSolution(level: Level): Board {
  const board = new Board(level);
  level.arrows.forEach(({ path }, k) => {
    const res = board.tap(path[0] % level.width, Math.floor(path[0] / level.width));
    expect(res.kind, `arrow ${k}`).toBe('exit');
  });
  return board;
}

/** Every shape cell belongs to exactly one arrow, and tails are connected. */
function expectValidArrows(level: Level): void {
  const seen = new Array<number>(level.shape.length).fill(0);
  for (const { dir, path } of level.arrows) {
    path.forEach((i) => seen[i]++);
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const b = path[k];
      const dist = Math.abs((a % level.width) - (b % level.width)) + Math.abs(Math.floor(a / level.width) - Math.floor(b / level.width));
      expect(dist).toBe(1);
    }
    if (path.length > 1) {
      // The cell right behind the head continues the line.
      expect(path[1]).toBe(path[0] - DX[dir] - DY[dir] * level.width);
    }
  }
  expect(seen).toEqual(level.shape.map((on) => (on ? 1 : 0)));
}

describe('generateLevel', () => {
  it('draws the level number as its shape', () => {
    for (const n of [1, 7, 10, 42, 108]) {
      const level = generateLevel(n);
      expect(level.shape).toEqual(numberShape(n, SCALE).filled);
      expectValidArrows(level);
    }
  });

  it('is the same every time for a level', () => {
    expect(generateLevel(57)).toEqual(generateLevel(57));
  });

  it('makes different boards for different levels', () => {
    expect(generateLevel(11).arrows).not.toEqual(generateLevel(17).arrows);
  });

  it('every level 0-500 can be cleared', () => {
    for (let n = 0; n <= 500; n++) {
      const board = playSolution(generateLevel(n));
      expect(board.won, `level ${n}`).toBe(true);
      expect(board.hearts).toBe(3);
    }
  });

  it('never gets stuck: any free arrow can be taken next', () => {
    for (const n of [9, 10, 64]) {
      const board = new Board(generateLevel(n));
      while (!board.won) {
        // Take the last free arrow instead of the first, to stray from the solution order.
        let pick = -1;
        board.arrows.forEach((_, k) => {
          if (board.alive(k) && board.blockerOf(k) === -1) pick = k;
        });
        expect(pick, `level ${n}`).not.toBe(-1);
        const head = board.arrows[pick].path[0];
        board.tap(head % board.width, Math.floor(head / board.width));
      }
    }
  });

  it('uses long arrows on every level except the tutorial', () => {
    const avg = (n: number) => {
      const { arrows } = generateLevel(n);
      return arrows.reduce((t, a) => t + a.path.length, 0) / arrows.length;
    };
    for (const n of [1, 7, 10, 42, 250]) expect(avg(n), `level ${n}`).toBeGreaterThan(2.5);
    expect(avg(0)).toBe(1);
  });

  it('keeps the tutorial small', () => {
    const level = generateLevel(0);
    expect(level.arrows.length).toBeLessThanOrEqual(20);
    expectValidArrows(level);
  });
});

describe('generateDaily', () => {
  it('can clear every day of a year', () => {
    for (let d = 0; d < 366; d++) {
      const date = new Date(2028, 0, 1 + d);
      const level = generateDaily(date);
      expectValidArrows(level);
      expect(playSolution(level).won, date.toDateString()).toBe(true);
    }
  });

  it('changes from day to day', () => {
    expect(generateDaily(new Date(2026, 9, 21)).arrows).not.toEqual(generateDaily(new Date(2026, 9, 22)).arrows);
  });
});
