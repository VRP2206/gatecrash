import { describe, expect, it } from 'vitest';
import {
  chipOutput,
  evaluate,
  inputMask,
  inputOn,
  isSolved,
  simulate,
  validatePlacement,
} from './sim';
import type { Board, ChipType } from './types';

const table = (chip: ChipType): string =>
  [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ]
    .map(([a, b]) => (chipOutput(chip, a ?? false, b ?? false) ? '1' : '0'))
    .join('');

describe('chips', () => {
  it('have the right truth tables', () => {
    expect(table('AND')).toBe('0001');
    expect(table('OR')).toBe('0111');
    expect(table('XOR')).toBe('0110');
    expect(table('NAND')).toBe('1110');
    expect(table('NOR')).toBe('1000');
  });

  it('FLIP inverts its single wire', () => {
    expect(chipOutput('NOT', false, false)).toBe(true);
    expect(chipOutput('NOT', true, false)).toBe(false);
  });
});

describe('rows', () => {
  it('count in binary with the top switch most significant', () => {
    expect(inputOn(3, 0, 4)).toBe(true);
    expect(inputOn(3, 1, 4)).toBe(false);
    expect(inputOn(3, 2, 1)).toBe(true);
    expect(inputMask(2, 0)).toBe(0b1100);
    expect(inputMask(2, 1)).toBe(0b1010);
  });
});

// SW1,SW2 -> U1 ; SW1,SW2 -> U2 ; U1,U2 -> U3 -> bulb. With DIFFER, BOTH, EITHER this is OR.
const board: Board = {
  day: 1,
  date: '2026-11-16',
  level: 'easy',
  difficulty: 'easy',
  inputs: 2,
  sockets: [
    { layer: 1, inputs: [{ kind: 'in', index: 0 }, { kind: 'in', index: 1 }] },
    { layer: 1, inputs: [{ kind: 'in', index: 0 }, { kind: 'in', index: 1 }] },
    { layer: 2, inputs: [{ kind: 'socket', index: 0 }, { kind: 'socket', index: 1 }] },
  ],
  bulbs: [2],
  tray: ['AND', 'OR', 'XOR'],
  target: [0b1110],
  probeRow: 2,
};

describe('simulate', () => {
  it('marks every row of a winning placement', () => {
    const rows = simulate(board, ['XOR', 'AND', 'OR']);
    expect(rows.map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(rows.map((r) => r.bulbs[0])).toEqual([false, true, true, true]);
    expect(isSolved(board, ['XOR', 'AND', 'OR'])).toBe(true);
  });

  it('reports which rows fail', () => {
    const rows = simulate(board, ['OR', 'XOR', 'AND']);
    // (a|b) & (a^b) = a^b : wrong only when both are on.
    expect(rows.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(isSolved(board, ['OR', 'XOR', 'AND'])).toBe(false);
  });

  it('treats sockets downstream of a gap as dead', () => {
    const signals = evaluate(board, ['XOR', null, 'OR']);
    expect(signals.live).toEqual([true, false, false]);
    expect(isSolved(board, ['XOR', null, 'OR'])).toBe(false);
  });
});

describe('validatePlacement', () => {
  it('accepts a legal placement', () => {
    expect(validatePlacement(board, ['XOR', 'AND', 'OR'])).toBe(true);
  });
  it('rejects chips used more often than the tray has them', () => {
    expect(validatePlacement(board, ['XOR', 'XOR', 'OR'])).toBe(false);
  });
  it('rejects wrong lengths, unknown chips and bad fits', () => {
    expect(validatePlacement(board, ['XOR', 'AND'])).toBe(false);
    expect(validatePlacement(board, ['XOR', 'AND', 'NOPE'])).toBe(false);
    expect(validatePlacement(board, ['XOR', 'AND', null])).toBe(false);
    expect(
      validatePlacement({ ...board, tray: ['AND', 'OR', 'NOT'] }, ['NOT', 'AND', 'OR'])
    ).toBe(false);
  });
});
