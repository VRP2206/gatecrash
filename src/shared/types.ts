/** Chip kinds. Players never see these names; see CHIP_INFO for the on-screen labels. */
export type ChipType = 'AND' | 'OR' | 'XOR' | 'NOT' | 'NAND' | 'NOR';

export const CHIP_TYPES: readonly ChipType[] = [
  'AND',
  'OR',
  'XOR',
  'NOT',
  'NAND',
  'NOR',
];

export type ChipInfo = {
  /** Plain-language name printed on the chip. */
  label: string;
  /** One-line behaviour description used in the legend and for screen readers. */
  blurb: string;
  arity: 1 | 2;
};

export const CHIP_INFO: Readonly<Record<ChipType, ChipInfo>> = {
  AND: { label: 'BOTH', blurb: 'On only when both wires are on.', arity: 2 },
  OR: { label: 'EITHER', blurb: 'On when at least one wire is on.', arity: 2 },
  XOR: { label: 'DIFFER', blurb: 'On when exactly one wire is on.', arity: 2 },
  NOT: { label: 'FLIP', blurb: 'Turns on into off, and off into on.', arity: 1 },
  NAND: { label: 'NOT BOTH', blurb: 'Off only when both wires are on.', arity: 2 },
  NOR: { label: 'NEITHER', blurb: 'On only when both wires are off.', arity: 2 },
};

/** Where a wire starts: an input switch or the output of an earlier socket. */
export type Source =
  | { kind: 'in'; index: number }
  | { kind: 'socket'; index: number };

export type Socket = {
  /** 1-based column of the socket. Inputs sit in column 0. */
  layer: number;
  /** One wire (FLIP only) or two wires (every other chip). */
  inputs: Source[];
};

export type Difficulty = 'easy' | 'medium' | 'hard' | 'overclock';

/**
 * A board is a layered DAG: inputs -> sockets -> bulbs.
 * Sockets are stored in evaluation order (every source index is lower than the
 * socket's own index) and, within a layer, top to bottom.
 *
 * Truth tables are bitmasks over input rows: bit r is the value on row r.
 * Row r sets input i to `(r >> (inputs - 1 - i)) & 1`, so rows read like
 * binary counting with the top switch as the most significant bit.
 */
export type Board = {
  day: number;
  /** ISO date (UTC) the board belongs to, e.g. 2026-11-25. */
  date: string;
  difficulty: Difficulty;
  inputs: number;
  sockets: Socket[];
  /** Socket index feeding each bulb. */
  bulbs: number[];
  /** Chips on offer today, in display order. */
  tray: ChipType[];
  /** Wanted truth table per bulb. */
  target: number[];
  /** The row the bench shows live, before any charge is spent. */
  probeRow: number;
};

/** A board plus the generator's own answer. Never sent to the client before the game ends. */
export type SolvedBoard = Board & { solution: ChipType[] };

/** One chip per socket, or null for an empty socket. */
export type Placement = (ChipType | null)[];
export type FullPlacement = ChipType[];

export type RowResult = {
  row: number;
  /** Actual bulb states on this row, one per bulb. */
  bulbs: boolean[];
  /** Whether each bulb matches the target on this row. */
  match: boolean[];
  ok: boolean;
};

export type GameStatus = 'new' | 'playing' | 'solved' | 'fused';

export const MAX_CHARGES = 5;

/** What the server remembers about one player on one day. */
export type DayState = {
  status: GameStatus;
  /** Every placement the player has powered, oldest first. */
  attempts: FullPlacement[];
  startedAt: number | null;
  endedAt: number | null;
  /** True when the board was started on its own day, so it counts for streaks and the leaderboard. */
  live: boolean;
};

export const NEW_DAY_STATE: DayState = {
  status: 'new',
  attempts: [],
  startedAt: null,
  endedAt: null,
  live: false,
};
