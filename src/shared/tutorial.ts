import type { Board } from './types';

/**
 * The practice board: two switches, two sockets, two bulbs, two chips.
 * BOTH belongs on top and EITHER below; the other way round fails the live row.
 */
export const TUTORIAL_BOARD: Board = {
  day: 0,
  date: '',
  level: 'easy',
  difficulty: 'easy',
  inputs: 2,
  sockets: [
    { layer: 1, inputs: [{ kind: 'in', index: 0 }, { kind: 'in', index: 1 }] },
    { layer: 1, inputs: [{ kind: 'in', index: 0 }, { kind: 'in', index: 1 }] },
  ],
  bulbs: [0, 1],
  tray: ['AND', 'OR'],
  target: [0b1000, 0b1110],
  probeRow: 0b10,
};
