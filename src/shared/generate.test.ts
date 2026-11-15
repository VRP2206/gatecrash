import { describe, expect, it } from 'vitest';
import { difficultyFor, specFor, utcDayIndex } from './day';
import { generate, layerShapes } from './generate';
import { evaluate, fullMask, isSolved, rowCount, validatePlacement } from './sim';
import { solve } from './solve';
import { LEVELS, type Level } from './types';

const EPOCH = utcDayIndex(Date.parse('2026-11-16T00:00:00Z'));
const make = (day: number, salt = '', level: Level = 'hard') =>
  generate({ day, dayIndex: EPOCH + day - 1, level, salt });

describe('layerShapes', () => {
  it('ends in the bulb count and keeps columns small', () => {
    expect(layerShapes(3, 1)).toEqual([[1, 1, 1], [2, 1]]);
    for (const shape of layerShapes(7, 3)) {
      expect(shape.at(-1)).toBe(3);
      expect(shape.reduce((a, b) => a + b, 0)).toBe(7);
      expect(shape.length).toBeLessThanOrEqual(3);
      expect(Math.max(...shape)).toBeLessThanOrEqual(3);
    }
  });
});

describe('generate', () => {
  it('is deterministic for a day', () => {
    expect(make(12)).toEqual(make(12));
    expect(make(40)).toEqual(make(40));
  });

  it('changes with the salt', () => {
    const boards = new Set(
      ['a', 'b', 'c', 'd'].map((salt) => JSON.stringify(make(5, salt).sockets))
    );
    expect(boards.size).toBeGreaterThan(1);
  });

  it('passes every reject rule on 2,000 consecutive days', () => {
    for (let day = 1; day <= 2000; day++) {
     for (const level of LEVELS) {
      const board = make(day, '', level);
      const spec = specFor(difficultyFor(EPOCH + day - 1, level));
      const full = fullMask(board.inputs);
      const label = `day ${day} ${level}`;

      expect(board.level, label).toBe(level);
      expect(board.difficulty, label).toBe(spec.difficulty);
      expect(board.inputs, label).toBe(spec.inputs);
      expect(board.sockets.length, label).toBeGreaterThanOrEqual(spec.sockets[0]);
      expect(board.sockets.length, label).toBeLessThanOrEqual(spec.sockets[1]);
      expect(board.bulbs.length, label).toBeGreaterThanOrEqual(spec.bulbs[0]);
      expect(board.bulbs.length, label).toBeLessThanOrEqual(spec.bulbs[1]);
      const decoys = board.tray.length - board.sockets.length;
      expect(decoys, label).toBeGreaterThanOrEqual(spec.decoys[0]);
      expect(decoys, label).toBeLessThanOrEqual(spec.decoys[1]);
      expect(board.probeRow, label).toBeLessThan(rowCount(board.inputs));

      // Wires only run left to right, and at most one column is skipped.
      board.sockets.forEach((socket, index) => {
        expect([1, 2], label).toContain(socket.inputs.length);
        for (const source of socket.inputs) {
          const from = source.kind === 'in' ? 0 : board.sockets[source.index]?.layer;
          if (source.kind === 'socket') expect(source.index, label).toBeLessThan(index);
          expect(from, label).toBeLessThan(socket.layer);
          expect(socket.layer - (from ?? 0), label).toBeLessThanOrEqual(2);
        }
      });

      // The reference solution is legal and wins.
      expect(validatePlacement(board, board.solution), label).toBe(true);
      expect(isSolved(board, board.solution), label).toBe(true);

      // No constant bulb, and every socket can change a bulb.
      const signals = evaluate(board, board.solution);
      for (const mask of board.target) {
        expect(mask, label).not.toBe(0);
        expect(mask, label).not.toBe(full);
      }
      board.sockets.forEach((_, index) => {
        const flipped = evaluate(board, board.solution, {
          socket: index,
          mask: ~(signals.sockets[index] ?? 0) & full,
        });
        const changed = board.bulbs.some(
          (socket, bulb) => flipped.sockets[socket] !== board.target[bulb]
        );
        expect(changed, `${label} socket ${index}`).toBe(true);
      });

      // Few winning placements, plenty of losing ones.
      const { solutions, candidates } = solve(board);
      expect(solutions.length, label).toBeGreaterThanOrEqual(1);
      expect(solutions.length, label).toBeLessThanOrEqual(spec.maxSolutions);
      expect(candidates, label).toBeGreaterThanOrEqual(spec.minCandidates);
     }
    }
  }, 120_000);

  it('gives a day three different boards, with Overclock as Sunday\'s hard one', () => {
    const sunday = 7; // EPOCH is a Monday
    expect(LEVELS.map((l) => make(sunday, '', l).difficulty)).toEqual(['easy', 'medium', 'overclock']);
    expect(LEVELS.map((l) => make(1, '', l).difficulty)).toEqual(['easy', 'medium', 'hard']);
    expect(LEVELS.map((l) => make(1, '', l).inputs)).toEqual([2, 3, 3]);
  });
});
