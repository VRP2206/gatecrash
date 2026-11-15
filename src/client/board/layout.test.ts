import { describe, expect, it } from 'vitest';
import { utcDayIndex } from '../../shared/day';
import { generate } from '../../shared/generate';
import { TUTORIAL_BOARD } from '../../shared/tutorial';
import { PIN_LEN, SOCKET_H, layoutBoard, type Point } from './layout';

const EPOCH = utcDayIndex(Date.parse('2026-11-16T00:00:00Z'));

/** Does segment a-b pass through the inside of the rectangle? (Liang-Barsky) */
const crosses = (a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean => {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return false;
  }
  return true;
};

describe('board layout', () => {
  it('draws the practice board', () => {
    const layout = layoutBoard(TUTORIAL_BOARD);
    expect(layout.switches).toHaveLength(2);
    expect(layout.sockets).toHaveLength(2);
    expect(layout.bulbs).toHaveLength(2);
    expect(layout.wires).toHaveLength(6);
    expect(layout.junctions).toHaveLength(2);
  });

  it('keeps every part on the board and every wire out of every chip, for a year of boards', () => {
    for (let day = 1; day <= 365; day++) {
      const board = generate({ day, dayIndex: EPOCH + day - 1 });
      const layout = layoutBoard(board);
      const label = `day ${day}`;
      const half = layout.socketW / 2;

      for (const p of [...layout.switches, ...layout.sockets, ...layout.bulbs]) {
        expect(p.x, label).toBeGreaterThan(10);
        expect(p.x, label).toBeLessThan(layout.width - 10);
        expect(p.y, label).toBeGreaterThan(SOCKET_H / 2);
        expect(p.y, label).toBeLessThan(layout.height - SOCKET_H / 2);
      }
      // Sockets in one column never touch.
      layout.sockets.forEach((a, i) =>
        layout.sockets.forEach((b, j) => {
          if (i < j && Math.abs(a.x - b.x) < 1) {
            expect(Math.abs(a.y - b.y), label).toBeGreaterThan(SOCKET_H + 4);
          }
        })
      );
      // Columns leave a real gap for wiring.
      const xs = [...new Set(layout.sockets.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect((xs[i] ?? 0) - (xs[i - 1] ?? 0) - layout.socketW - PIN_LEN * 2, label).toBeGreaterThan(22);
      }
      for (const wire of layout.wires) {
        expect(wire.points.length, label).toBeGreaterThanOrEqual(2);
        for (const p of wire.points) {
          expect(p.y, `${label} ${wire.key}`).toBeGreaterThan(2);
          expect(p.y, `${label} ${wire.key}`).toBeLessThan(layout.height - 2);
        }
        for (let s = 1; s < wire.points.length; s++) {
          const a = wire.points[s - 1];
          const b = wire.points[s];
          if (!a || !b) continue;
          expect(b.x, `${label} ${wire.key} runs backwards`).toBeGreaterThanOrEqual(a.x - 0.01);
          layout.sockets.forEach((c, index) => {
            const hit = crosses(a, b, c.x - half + 1, c.y - SOCKET_H / 2 + 1, c.x + half - 1, c.y + SOCKET_H / 2 - 1);
            expect(hit, `${label}: wire ${wire.key} crosses socket ${index}`).toBe(false);
          });
        }
      }
    }
  });
});
