import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { EMPTY, Level } from '../src/levelGen';

// 3x1 board: "→ ↑ ." ; the first arrow is blocked by the second.
function tiny(): Level {
  const cells = new Int8Array([1, 0, EMPTY]);
  return { number: 0, width: 3, height: 1, cells, solution: [1, 0] };
}

describe('Board', () => {
  it('removes an arrow with a clear path', () => {
    const b = new Board(tiny());
    expect(b.tap(1, 0)).toEqual({ kind: 'exit', index: 1, dir: 0 });
    expect(b.left).toBe(1);
  });

  it('costs a heart when blocked', () => {
    const b = new Board(tiny());
    expect(b.tap(0, 0)).toEqual({ kind: 'blocked', index: 0, dir: 1, blocker: 1 });
    expect(b.hearts).toBe(2);
    expect(b.left).toBe(2);
  });

  it('ignores empty cells and taps outside', () => {
    const b = new Board(tiny());
    expect(b.tap(2, 0).kind).toBe('none');
    expect(b.tap(5, 5).kind).toBe('none');
  });

  it('wins when cleared and loses at zero hearts', () => {
    const b = new Board(tiny());
    b.tap(1, 0);
    b.tap(0, 0);
    expect(b.won).toBe(true);

    const l = new Board(tiny());
    l.tap(0, 0);
    l.tap(0, 0);
    l.tap(0, 0);
    expect(l.lost).toBe(true);
    expect(l.tap(1, 0).kind).toBe('none');
  });

  it('hints at a free arrow', () => {
    expect(new Board(tiny()).hint()).toBe(1);
  });
});
