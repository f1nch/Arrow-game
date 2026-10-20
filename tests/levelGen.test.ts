import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { EMPTY, generateLevel, numberShape, scaleFor } from '../src/levelGen';

describe('generateLevel', () => {
  it('draws the level number as its shape', () => {
    for (const n of [1, 7, 42, 108, 1234]) {
      const level = generateLevel(n);
      const shape = numberShape(n, scaleFor(n));
      expect(Array.from(level.cells, (c) => c !== EMPTY)).toEqual(shape.filled);
    }
  });

  it('is the same every time for a level', () => {
    expect(Array.from(generateLevel(57).cells)).toEqual(Array.from(generateLevel(57).cells));
  });

  it('makes different boards for different levels', () => {
    expect(Array.from(generateLevel(11).cells)).not.toEqual(Array.from(generateLevel(17).cells));
  });

  it('every level 1-500 can be cleared by its solution', () => {
    for (let n = 1; n <= 500; n++) {
      const level = generateLevel(n);
      const board = new Board(level);
      for (const i of level.solution) {
        const res = board.tap(i % level.width, Math.floor(i / level.width));
        expect(res.kind, `level ${n}`).toBe('exit');
      }
      expect(board.won).toBe(true);
      expect(board.hearts).toBe(3);
    }
  });

  it('never gets stuck: any free arrow can be taken next', () => {
    for (const n of [9, 64, 250]) {
      const board = new Board(generateLevel(n));
      while (!board.won) {
        // Take the last free arrow instead of the first, to stray from the solution order.
        let pick = -1;
        for (let i = 0; i < board.cells.length; i++) {
          if (board.cells[i] !== EMPTY && board.blockerOf(i) === -1) pick = i;
        }
        expect(pick, `level ${n}`).not.toBe(-1);
        board.tap(pick % board.width, Math.floor(pick / board.width));
      }
    }
  });
});
