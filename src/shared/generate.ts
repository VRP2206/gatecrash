import { difficultyFor, isoDate, specFor, type DaySpec } from './day';
import { createRng, hashSeed, type Rng } from './rng';
import { evaluate, fullMask, inputMask, rowCount } from './sim';
import { solve } from './solve';
import {
  CHIP_TYPES,
  type ChipType,
  type Level,
  type Socket,
  type SolvedBoard,
  type Source,
} from './types';

const MAX_LAYERS = 3;
const MAX_PER_LAYER = 3;
const FLIP_CHANCE = 0.18;
const SKIP_CHANCE = 0.3;
const MAX_ATTEMPTS = 20_000;

/** Every way to split `sockets` into 2-3 columns of 1-3, ending in exactly `bulbs`. */
export const layerShapes = (sockets: number, bulbs: number): number[][] => {
  const shapes: number[][] = [];
  const walk = (left: number, shape: number[]): void => {
    if (left === bulbs && shape.length >= 1 && shape.length < MAX_LAYERS) {
      shapes.push([...shape, bulbs]);
    }
    if (shape.length >= MAX_LAYERS - 1) return;
    for (let n = 1; n <= MAX_PER_LAYER && left - n >= bulbs; n++) {
      walk(left - n, [...shape, n]);
    }
  };
  if (bulbs <= MAX_PER_LAYER) walk(sockets, []);
  return shapes;
};

type Node = { source: Source; layer: number; used: boolean };

const sameSource = (a: Source, b: Source): boolean =>
  a.kind === b.kind && a.index === b.index;

/** Build a random layered wiring, or null if some node ends up unused. */
const wire = (rng: Rng, inputs: number, shape: number[], spec: DaySpec) => {
  const nodes: Node[] = [];
  for (let i = 0; i < inputs; i++) {
    nodes.push({ source: { kind: 'in', index: i }, layer: 0, used: false });
  }
  const sockets: Socket[] = [];
  let flips = 0;

  const take = (pool: Node[], avoid?: Source): Node | undefined => {
    const open = pool.filter((n) => !avoid || !sameSource(n.source, avoid));
    if (open.length === 0) return undefined;
    const fresh = open.filter((n) => !n.used);
    const node = rng.pick(fresh.length > 0 ? fresh : open);
    node.used = true;
    return node;
  };

  for (let l = 0; l < shape.length; l++) {
    const layer = l + 1;
    const made: Node[] = [];
    const prev = nodes.filter((n) => n.layer === layer - 1);
    const skip = nodes.filter((n) => n.layer === layer - 2);
    for (let s = 0; s < (shape[l] ?? 0); s++) {
      const first = take(prev);
      if (!first) return null;
      let flip = flips < spec.maxFlips && rng.chance(FLIP_CHANCE);
      let second: Node | undefined;
      if (!flip) {
        const wantSkip = skip.length > 0 && rng.chance(SKIP_CHANCE);
        second =
          (wantSkip ? take(skip) : take(prev, first.source)) ??
          take(skip) ??
          take(prev, first.source);
        if (!second) {
          if (flips >= spec.maxFlips) return null;
          flip = true;
        }
      }
      if (flip) flips++;
      const sources = second ? [first.source, second.source] : [first.source];
      sockets.push({ layer, inputs: sources });
      made.push({
        source: { kind: 'socket', index: sockets.length - 1 },
        layer,
        used: false,
      });
    }
    nodes.push(...made);
  }

  const lastLayer = shape.length;
  if (nodes.some((n) => n.layer !== lastLayer && !n.used)) return null;
  return sockets;
};

/**
 * Order sockets inside each column by the average height of what feeds them,
 * so wires cross as little as possible. Returns re-indexed sockets.
 */
const untangle = (inputs: number, sockets: Socket[]): Socket[] => {
  const height = new Map<string, number>();
  const key = (s: Source): string => `${s.kind}${s.index}`;
  for (let i = 0; i < inputs; i++) {
    height.set(`in${i}`, inputs === 1 ? 0.5 : i / (inputs - 1));
  }
  const order: number[] = [];
  const layers = Math.max(...sockets.map((s) => s.layer));
  for (let layer = 1; layer <= layers; layer++) {
    const members = sockets
      .map((socket, index) => ({ socket, index }))
      .filter((m) => m.socket.layer === layer)
      .map((m) => {
        const hs = m.socket.inputs.map((s) => height.get(key(s)) ?? 0.5);
        return { ...m, bary: hs.reduce((a, b) => a + b, 0) / hs.length };
      })
      .sort((a, b) => a.bary - b.bary || a.index - b.index);
    members.forEach((m, row) => {
      order.push(m.index);
      height.set(
        `socket${m.index}`,
        members.length === 1 ? 0.5 : row / (members.length - 1)
      );
    });
  }
  const renamed = new Map<number, number>();
  order.forEach((old, now) => renamed.set(old, now));
  return order.map((old) => {
    const socket = sockets[old];
    if (!socket) throw new Error('untangle lost a socket');
    const sources = socket.inputs
      .map(
        (s): Source =>
          s.kind === 'in'
            ? s
            : { kind: 'socket', index: renamed.get(s.index) ?? s.index }
      )
      .sort((a, b) => (height.get(key(a)) ?? 0) - (height.get(key(b)) ?? 0));
    return { layer: socket.layer, inputs: sources };
  });
};

/** True when the bulbs' combined behaviour changes with every input switch. */
const everyInputMatters = (inputs: number, target: number[]): boolean => {
  for (let i = 0; i < inputs; i++) {
    const bit = 1 << (inputs - 1 - i);
    let matters = false;
    for (let row = 0; row < rowCount(inputs) && !matters; row++) {
      if (row & bit) continue;
      matters = target.some(
        (mask) => ((mask >> row) & 1) !== ((mask >> (row | bit)) & 1)
      );
    }
    if (!matters) return false;
  }
  return true;
};

const sortTray = (tray: ChipType[]): ChipType[] =>
  [...tray].sort((a, b) => CHIP_TYPES.indexOf(a) - CHIP_TYPES.indexOf(b));

/** The row the switches start on: alternating on, off, on, off from the top. */
export const probeRowFor = (inputs: number): number => {
  let row = 0;
  for (let i = 0; i < inputs; i++) {
    if (i % 2 === 0) row |= 1 << (inputs - 1 - i);
  }
  return row;
};

const tryBoard = (
  rng: Rng,
  spec: DaySpec
): Omit<SolvedBoard, 'day' | 'date' | 'level'> | null => {
  const socketCount = rng.range(spec.sockets[0], spec.sockets[1]);
  const bulbCount = rng.range(spec.bulbs[0], spec.bulbs[1]);
  const shapes = layerShapes(socketCount, bulbCount);
  if (shapes.length === 0) return null;
  const shape = rng.pick(shapes);

  const wired = wire(rng, spec.inputs, shape, spec);
  if (!wired) return null;
  const sockets = untangle(spec.inputs, wired);

  const solution: ChipType[] = sockets.map((socket) =>
    socket.inputs.length === 1 ? 'NOT' : rng.pick(spec.chips)
  );
  const bulbs: number[] = [];
  sockets.forEach((socket, index) => {
    if (socket.layer === shape.length) bulbs.push(index);
  });

  const full = fullMask(spec.inputs);
  const shell = { inputs: spec.inputs, sockets };
  const signals = evaluate(shell, solution);
  const target = bulbs.map((socket) => signals.sockets[socket] ?? 0);

  // No wire may be stuck on or off, and no chip may just pass a wire through.
  for (let i = 0; i < sockets.length; i++) {
    const mask = signals.sockets[i] ?? 0;
    if (mask === 0 || mask === full) return null;
    const socket = sockets[i];
    if (!socket || socket.inputs.length === 1) continue;
    for (const source of socket.inputs) {
      const from =
        source.kind === 'in'
          ? inputMask(spec.inputs, source.index)
          : (signals.sockets[source.index] ?? 0);
      if (mask === from || mask === (~from & full)) return null;
    }
  }
  // Bulbs must differ from each other and from a bare switch, and each must
  // be on (and off) for at least a quarter of the rows.
  const quarter = rowCount(spec.inputs) / 4;
  for (let a = 0; a < target.length; a++) {
    const mask = target[a] ?? 0;
    let on = 0;
    for (let row = 0; row < rowCount(spec.inputs); row++) on += (mask >> row) & 1;
    if (on < quarter || rowCount(spec.inputs) - on < quarter) return null;
    for (let b = a + 1; b < target.length; b++) {
      const other = target[b] ?? 0;
      if (mask === other || mask === (~other & full)) return null;
    }
    for (let i = 0; i < spec.inputs; i++) {
      if (mask === inputMask(spec.inputs, i)) return null;
    }
  }
  if (!everyInputMatters(spec.inputs, target)) return null;
  // Every socket must be able to change at least one bulb.
  for (let i = 0; i < sockets.length; i++) {
    const flipped = evaluate(shell, solution, {
      socket: i,
      mask: ~(signals.sockets[i] ?? 0) & full,
    });
    const changed = bulbs.some(
      (socket, bulb) => (flipped.sockets[socket] ?? 0) !== target[bulb]
    );
    if (!changed) return null;
  }

  const decoys = rng.range(spec.decoys[0], spec.decoys[1]);
  const tray = [...solution];
  for (let i = 0; i < decoys; i++) tray.push(rng.pick(spec.chips));

  const board = {
    difficulty: spec.difficulty,
    inputs: spec.inputs,
    sockets,
    bulbs,
    tray: sortTray(tray),
    target,
    probeRow: probeRowFor(spec.inputs),
    solution,
  };
  const { solutions, candidates } = solve(board, spec.maxSolutions + 1);
  if (solutions.length < 1 || solutions.length > spec.maxSolutions) return null;
  if (candidates < spec.minCandidates) return null;
  return board;
};

export type GenerateOptions = {
  /** Sequential board number shown to players. */
  day: number;
  /** UTC day index the board is for; sets the date (and Sunday's larger hard board). */
  dayIndex: number;
  level: Level;
  /** Per-installation salt so different communities get different boards. */
  salt?: string;
};

/** The first board a seed produces for a recipe, or null if the recipe never works out. */
export const generateFrom = (
  seed: string,
  spec: DaySpec
): Omit<SolvedBoard, 'day' | 'date' | 'level'> | null => {
  const rng = createRng(hashSeed(seed));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board = tryBoard(rng, spec);
    if (board) return board;
  }
  return null;
};

/** Deterministically build the board for a day: same options, same board. */
export const generate = ({ day, dayIndex, level, salt = '' }: GenerateOptions): SolvedBoard => {
  const spec = specFor(difficultyFor(dayIndex, level));
  const board = generateFrom(`gatecrash:${salt}:${day}:${dayIndex}:${level}`, spec);
  if (!board) throw new Error(`no board found for day ${day} ${level}`);
  return { day, date: isoDate(dayIndex), level, ...board };
};
