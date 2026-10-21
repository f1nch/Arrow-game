import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { Level } from '../src/levelGen';

// 3x1 board: "→ ↑ ." ; the first arrow is blocked by the second.
function tiny(): Level {
  return {
    width: 3,
    height: 1,
    shape: [true, true, false],
    arrows: [
      { dir: 0, path: [1] },
      { dir: 1, path: [0] },
    ],
  };
}

// 3x2 board: a long arrow (head at 0, pointing up, tail at 3) and a single
// arrow at 4 pointing left, blocked by the long arrow's tail.
function withLong(): Level {
  return {
    width: 3,
    height: 2,
    shape: [true, false, false, true, true, false],
    arrows: [
      { dir: 0, path: [0, 3] },
      { dir: 3, path: [4] },
    ],
  };
}

describe('Board', () => {
  it('removes an arrow with a clear path', () => {
    const b = new Board(tiny());
    expect(b.tap(1, 0)).toEqual({ kind: 'exit', arrow: 0, head: 1, dir: 0 });
    expect(b.left).toBe(1);
  });

  it('costs a heart when blocked', () => {
    const b = new Board(tiny());
    expect(b.tap(0, 0)).toEqual({ kind: 'blocked', arrow: 1, head: 0, dir: 1, blocker: 1 });
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
    expect(new Board(tiny()).hint()).toBe(0);
  });

  it('moves a whole long arrow when any of its cells is tapped', () => {
    const b = new Board(withLong());
    expect(b.tap(1, 1)).toMatchObject({ kind: 'blocked', blocker: 3 });
    expect(b.tap(0, 1)).toMatchObject({ kind: 'exit', arrow: 0, head: 0 });
    expect(b.owner[3]).toBe(-1);
    expect(b.tap(1, 1)).toMatchObject({ kind: 'exit', arrow: 1 });
    expect(b.won).toBe(true);
  });

  it('does not cost hearts in forgiving mode', () => {
    const b = new Board(tiny(), { forgiving: true });
    b.tap(0, 0);
    expect(b.hearts).toBe(3);
  });
});
