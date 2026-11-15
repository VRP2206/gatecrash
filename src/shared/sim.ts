import {
  CHIP_INFO,
  type Board,
  type ChipType,
  type FullPlacement,
  type Placement,
  type RowResult,
  type Source,
} from './types';

export const rowCount = (inputs: number): number => 1 << inputs;
export const fullMask = (inputs: number): number => (1 << rowCount(inputs)) - 1;

/** Value of input `index` on row `row`. The top switch is the most significant bit. */
export const inputOn = (inputs: number, index: number, row: number): boolean =>
  ((row >> (inputs - 1 - index)) & 1) === 1;

/** Truth table of one input switch across every row, as a bitmask. */
export const inputMask = (inputs: number, index: number): number => {
  let mask = 0;
  for (let row = 0; row < rowCount(inputs); row++) {
    if (inputOn(inputs, index, row)) mask |= 1 << row;
  }
  return mask;
};

/** Apply a chip to whole truth tables at once. `b` is ignored by FLIP. */
export const applyChip = (
  chip: ChipType,
  a: number,
  b: number,
  full: number
): number => {
  switch (chip) {
    case 'AND':
      return a & b;
    case 'OR':
      return a | b;
    case 'XOR':
      return a ^ b;
    case 'NOT':
      return ~a & full;
    case 'NAND':
      return ~(a & b) & full;
    case 'NOR':
      return ~(a | b) & full;
  }
};

/** Single-wire version of applyChip, used by chip glyphs and tests. */
export const chipOutput = (chip: ChipType, a: boolean, b: boolean): boolean =>
  applyChip(chip, a ? 1 : 0, b ? 1 : 0, 1) === 1;

export const chipFits = (chip: ChipType, wires: number): boolean =>
  CHIP_INFO[chip].arity === wires;

export type Signals = {
  /** Truth table of every input switch. */
  inputs: number[];
  /** Truth table of every socket output; 0 for sockets that are empty or starved. */
  sockets: number[];
  /** Whether each socket has a chip and every upstream socket does too. */
  live: boolean[];
};

/**
 * Evaluate a (possibly partial) placement over all rows.
 * `override` forces one socket's output, which the generator uses to test dependence.
 */
export const evaluate = (
  board: Pick<Board, 'inputs' | 'sockets'>,
  placement: Placement,
  override?: { socket: number; mask: number }
): Signals => {
  const full = fullMask(board.inputs);
  const inputs: number[] = [];
  for (let i = 0; i < board.inputs; i++) inputs.push(inputMask(board.inputs, i));

  const sockets: number[] = [];
  const live: boolean[] = [];
  const read = (source: Source): { mask: number; live: boolean } =>
    source.kind === 'in'
      ? { mask: inputs[source.index] ?? 0, live: true }
      : {
          mask: sockets[source.index] ?? 0,
          live: live[source.index] ?? false,
        };

  board.sockets.forEach((socket, index) => {
    if (override && override.socket === index) {
      sockets.push(override.mask & full);
      live.push(true);
      return;
    }
    const chip = placement[index] ?? null;
    const first = socket.inputs[0];
    const second = socket.inputs[1];
    const a = first ? read(first) : { mask: 0, live: false };
    const b = second ? read(second) : { mask: 0, live: true };
    if (chip === null || !chipFits(chip, socket.inputs.length) || !a.live || !b.live) {
      sockets.push(0);
      live.push(false);
      return;
    }
    sockets.push(applyChip(chip, a.mask, b.mask, full));
    live.push(true);
  });

  return { inputs, sockets, live };
};

/** Truth table per bulb for a complete placement. */
export const bulbMasks = (
  board: Pick<Board, 'inputs' | 'sockets' | 'bulbs'>,
  placement: Placement
): number[] => {
  const signals = evaluate(board, placement);
  return board.bulbs.map((socket) => signals.sockets[socket] ?? 0);
};

export const isComplete = (
  board: Pick<Board, 'sockets'>,
  placement: Placement
): placement is FullPlacement =>
  placement.length === board.sockets.length &&
  placement.every((chip) => chip !== null && chip !== undefined);

/** Run every input row and compare against the target card. */
export const simulate = (board: Board, placement: Placement): RowResult[] => {
  const masks = bulbMasks(board, placement);
  const rows: RowResult[] = [];
  for (let row = 0; row < rowCount(board.inputs); row++) {
    const bulbs = masks.map((mask) => ((mask >> row) & 1) === 1);
    const match = bulbs.map(
      (on, bulb) => on === ((((board.target[bulb] ?? 0) >> row) & 1) === 1)
    );
    rows.push({ row, bulbs, match, ok: match.every(Boolean) });
  }
  return rows;
};

export const isSolved = (board: Board, placement: Placement): boolean => {
  if (!isComplete(board, placement)) return false;
  const masks = bulbMasks(board, placement);
  return masks.every((mask, bulb) => mask === board.target[bulb]);
};

/**
 * Check a placement is legal for this board: right length, chips fit their
 * sockets, and no chip is used more often than the tray supplies it.
 */
export const validatePlacement = (
  board: Pick<Board, 'sockets' | 'tray'>,
  placement: readonly unknown[]
): placement is FullPlacement => {
  if (placement.length !== board.sockets.length) return false;
  const left = new Map<string, number>();
  for (const chip of board.tray) left.set(chip, (left.get(chip) ?? 0) + 1);
  for (let i = 0; i < placement.length; i++) {
    const chip = placement[i];
    const socket = board.sockets[i];
    if (typeof chip !== 'string' || !socket) return false;
    const remaining = left.get(chip) ?? 0;
    if (remaining <= 0) return false;
    left.set(chip, remaining - 1);
    if (!(chip in CHIP_INFO)) return false;
    const info = Object.entries(CHIP_INFO).find(([name]) => name === chip)?.[1];
    if (!info || info.arity !== socket.inputs.length) return false;
  }
  return true;
};
