import type { DaySpec } from './day';
import { MS_PER_DAY } from './day';
import { generateFrom } from './generate';
import { simulate } from './sim';
import type { EndlessView } from './api';
import type { Board, ChipType, FullPlacement, RowResult, SolvedBoard } from './types';

/*
 * Endless mode: one climb per week. Level 1 is trivial and the boards grow a
 * step at a time (see STEPS). Charges come in stages of ten levels. A failed
 * test burns one of the stage's charges; a test that
 * clears the board is free. Burn them all and the fuse blows: back to the
 * first level of the stage, on fresh boards. A new stage refills the charges.
 */

export const STAGE_LENGTH = 10;
export const ENDLESS_CHARGES = 5;

/** 1 for levels 1-10, 2 for 11-20, and so on. */
export const stageOf = (level: number): number => Math.floor((level - 1) / STAGE_LENGTH) + 1;
export const stageStart = (level: number): number => (stageOf(level) - 1) * STAGE_LENGTH + 1;

/** Weeks run Monday to Sunday, UTC. 1970-01-01 was a Thursday. */
export const weekIndexOf = (dayIndex: number): number => Math.floor((dayIndex + 3) / 7);
export const weekStartDay = (weekIndex: number): number => weekIndex * 7 - 3;
export const msUntilNextWeek = (ms: number): number => {
  const week = weekIndexOf(Math.floor(ms / MS_PER_DAY));
  return weekStartDay(week + 1) * MS_PER_DAY - ms;
};

/** Switches on the board: 2 up to level 25, 3 up to level 75, then 4. */
export const switchesAt = (level: number): number => (level <= 25 ? 2 : level <= 75 ? 3 : 4);

const BASIC: readonly ChipType[] = ['AND', 'OR', 'XOR'];
const ALL: readonly ChipType[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR'];

type Recipe = Omit<DaySpec, 'difficulty' | 'inputs'>;

/**
 * One step of the climb: from level `from`, boards follow `recipes`, taking
 * turns level by level so neighbouring boards look different. The first
 * recipe shows off what is new, and `note` says what that is.
 */
export type Step = { from: number; note: string; recipes: readonly Recipe[] };

const r = (
  sockets: Recipe['sockets'],
  decoys: Recipe['decoys'],
  more: Partial<Recipe> = {}
): Recipe => ({
  sockets,
  decoys,
  bulbs: [1, 1],
  chips: BASIC,
  maxFlips: 1,
  maxSolutions: 2,
  minCandidates: 1,
  ...more,
});

/*
 * Two switches give only sixteen possible bulbs, so the early steps mix
 * shapes: one column (each chip lights its own bulb), then chains, then FLIP.
 */
const MATCH_TWO = r([2, 2], [0, 0], { minColumns: 1, bulbs: [2, 2], maxFlips: 0, maxSolutions: 1, minCandidates: 2 });
const MATCH_TWO_SPARE = r([2, 2], [1, 1], { minColumns: 1, bulbs: [2, 2], maxFlips: 0, maxSolutions: 1, minCandidates: 3 });
const MATCH_THREE = r([3, 3], [0, 0], { minColumns: 1, bulbs: [3, 3], maxFlips: 0, maxSolutions: 1, minCandidates: 2 });
const CHAIN_TWO_SPARE = r([2, 2], [1, 1], { maxFlips: 0, maxSolutions: 1, minCandidates: 3 });
const CHAIN_THREE = r([3, 3], [0, 0], { bulbs: [1, 2], maxFlips: 0, minCandidates: 3 });
const FLIP_THREE = r([3, 3], [1, 1], { bulbs: [1, 2], minFlips: 1, minCandidates: 4 });
const CHAIN_THREE_SPARE = r([3, 3], [1, 1], { bulbs: [1, 2], maxFlips: 0, maxSolutions: 1, minCandidates: 6 });
const TWO_BULBS = r([3, 3], [1, 1], { bulbs: [2, 2], minCandidates: 6 });
const THREE_OR_FOUR = r([3, 4], [1, 2], { bulbs: [1, 2], minCandidates: 8 });
const FOUR_SOCKETS = r([4, 4], [1, 2], { bulbs: [1, 2], minCandidates: 12 });

/**
 * The climb, step by step. Something changes every three to six levels; the
 * bigger jumps land on stage starts and on the new switches at 26 and 76,
 * where the boards ease off for a few levels while the card grows.
 */
export const STEPS: readonly Step[] = [
  // two switches: four rows on the card
  { from: 1, note: 'Each chip lights its own bulb. Match them to the card.', recipes: [MATCH_TWO] },
  { from: 4, note: 'Three chips in the tray. Sometimes one does not belong.', recipes: [MATCH_TWO_SPARE, MATCH_THREE] },
  { from: 7, note: 'Chips can feed other chips. Follow the wires.', recipes: [CHAIN_TWO_SPARE, CHAIN_THREE] },
  { from: 11, note: 'FLIP joins: it turns on into off, and off into on.', recipes: [FLIP_THREE, CHAIN_THREE_SPARE] },
  { from: 15, note: 'Two bulbs fed by one circuit.', recipes: [TWO_BULBS, THREE_OR_FOUR] },
  { from: 21, note: 'A fourth socket, and up to two spare chips.', recipes: [FOUR_SOCKETS, THREE_OR_FOUR] },
  // three switches: eight rows
  {
    from: 26,
    note: 'A third switch: eight rows on the card. The boards ease off for a while.',
    recipes: [
      r([3, 3], [0, 0], { minColumns: 1, bulbs: [3, 3], maxFlips: 0, maxSolutions: 1, minCandidates: 2 }),
      r([3, 3], [0, 0], { bulbs: [1, 2], minCandidates: 3 }),
    ],
  },
  {
    from: 31,
    note: 'Four sockets.',
    recipes: [
      r([4, 4], [0, 0], { bulbs: [1, 2], minCandidates: 8 }),
      r([3, 3], [1, 1], { bulbs: [1, 2], minCandidates: 6 }),
    ],
  },
  { from: 36, note: 'A spare chip again.', recipes: [r([4, 4], [1, 1], { bulbs: [1, 2], minCandidates: 12 })] },
  { from: 41, note: 'Up to five sockets.', recipes: [r([4, 5], [0, 1], { bulbs: [1, 2], minCandidates: 16 })] },
  { from: 46, note: 'A spare chip on every board.', recipes: [r([4, 5], [1, 1], { bulbs: [1, 2], minCandidates: 20 })] },
  { from: 51, note: 'Five sockets on every board.', recipes: [r([5, 5], [1, 1], { bulbs: [1, 2], maxFlips: 2, minCandidates: 30 })] },
  { from: 56, note: 'Two bulbs on every board.', recipes: [r([5, 5], [1, 1], { bulbs: [2, 2], maxFlips: 2, minCandidates: 40 })] },
  { from: 61, note: 'Up to six sockets and two spare chips.', recipes: [r([5, 6], [1, 2], { bulbs: [2, 2], maxFlips: 2, maxSolutions: 3, minCandidates: 60 })] },
  { from: 66, note: 'Six sockets on every board.', recipes: [r([6, 6], [1, 2], { bulbs: [2, 2], maxFlips: 2, maxSolutions: 3, minCandidates: 75 })] },
  { from: 71, note: 'Two spare chips on every board.', recipes: [r([6, 6], [2, 2], { bulbs: [2, 2], maxFlips: 2, maxSolutions: 3, minCandidates: 90 })] },
  // four switches: sixteen rows, and the hard boards
  { from: 76, note: 'A fourth switch: sixteen rows. The hard boards start here.', recipes: [r([5, 6], [1, 1], { bulbs: [2, 2], maxFlips: 2, maxSolutions: 3, minCandidates: 60 })] },
  { from: 81, note: 'NOT BOTH and NEITHER can turn up from here.', recipes: [r([6, 7], [1, 2], { bulbs: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 3, minCandidates: 150 })] },
  { from: 86, note: 'More ways to seat the chips.', recipes: [r([6, 7], [1, 2], { bulbs: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 3, minCandidates: 200 })] },
  { from: 91, note: 'Seven sockets on every board.', recipes: [r([7, 7], [2, 2], { bulbs: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 3, minCandidates: 250 })] },
  { from: 101, note: 'Fewer right answers per board.', recipes: [r([7, 7], [2, 3], { bulbs: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 2, minCandidates: 400 })] },
  { from: 111, note: 'Up to eight sockets.', recipes: [r([7, 8], [3, 3], { bulbs: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 2, minCandidates: 600 })] },
  { from: 121, note: 'One right answer per board from here on.', recipes: [r([8, 8], [3, 3], { bulbs: [2, 3], chips: ALL, maxFlips: 3, maxSolutions: 1, minCandidates: 600 })] },
];

/** The step a level belongs to. */
export const stepAt = (level: number): Step => {
  let step = STEPS[0];
  for (const s of STEPS) if (s.from <= level) step = s;
  if (!step) throw new Error('no steps');
  return step;
};

/** The next step after this level's, or null at the top of the table. */
export const nextStep = (level: number): Step | null => STEPS.find((s) => s.from > level) ?? null;

const recipeAt = (level: number): Recipe => {
  const { from, recipes } = stepAt(level);
  const recipe = recipes[(level - from) % recipes.length];
  if (!recipe) throw new Error(`no recipe for level ${level}`);
  return recipe;
};

export const endlessSpec = (level: number): DaySpec => {
  const inputs = switchesAt(level);
  return {
    difficulty: inputs === 2 ? 'easy' : inputs === 3 ? 'hard' : 'overclock',
    inputs,
    ...recipeAt(level),
  };
};

export type EndlessBoardOptions = {
  week: number;
  level: number;
  /** How many fuses the player has blown this week: a fall-back gets fresh boards. */
  retry: number;
  salt?: string;
};

/** Deterministically build one endless board. `day` on the board is the level number. */
export const generateEndless = ({ week, level, retry, salt = '' }: EndlessBoardOptions): SolvedBoard => {
  const spec = endlessSpec(level);
  const board = generateFrom(`gatecrash:endless:${salt}:${week}:${level}:${retry}`, spec);
  if (!board) throw new Error(`no endless board found for level ${level}`);
  return {
    day: level,
    date: '',
    level: spec.inputs === 2 ? 'easy' : spec.inputs === 3 ? 'medium' : 'hard',
    ...board,
  };
};

/** One player's climb. Lives on the server, or in the browser for logged-out players. */
export type EndlessRun = {
  week: number;
  /** Level being played, from 1. */
  level: number;
  /** Charges burned in the current stage. */
  burned: number;
  /** Fuses blown this week. */
  fuses: number;
  /** Failed placements on the current level. */
  attempts: FullPlacement[];
  /** Highest level cleared this week. */
  best: number;
  /** UTC day `dayBase` belongs to. */
  dayIndex: number;
  /** `best` as it stood when that day began; today's gain is best - dayBase. */
  dayBase: number;
  /** Highest level ever cleared. */
  record: number;
};

export const freshRun = (week: number, dayIndex: number, record = 0): EndlessRun => ({
  week,
  level: 1,
  burned: 0,
  fuses: 0,
  attempts: [],
  best: 0,
  dayIndex,
  dayBase: 0,
  record,
});

/** Bring a stored run up to date: a new week starts over, a new day resets the daily count. */
export const rollRun = (run: EndlessRun | null, dayIndex: number): EndlessRun => {
  const week = weekIndexOf(dayIndex);
  if (!run || run.week !== week) return freshRun(week, dayIndex, run?.record ?? 0);
  if (run.dayIndex !== dayIndex) return { ...run, dayIndex, dayBase: run.best };
  return run;
};

export const gainedToday = (run: EndlessRun): number => Math.max(0, run.best - run.dayBase);

export type EndlessOutcome = 'cleared' | 'failed' | 'fused';

/** Apply one Power press to a run. The placement must already be legal for the board. */
export const powerRun = (
  run: EndlessRun,
  board: SolvedBoard,
  placement: FullPlacement
): { run: EndlessRun; rows: RowResult[]; outcome: EndlessOutcome } => {
  const rows = simulate(board, placement);
  if (rows.every((row) => row.ok)) {
    const level = run.level + 1;
    const best = Math.max(run.best, run.level);
    return {
      rows,
      outcome: 'cleared',
      run: {
        ...run,
        level,
        attempts: [],
        burned: level === stageStart(level) ? 0 : run.burned,
        best,
        record: Math.max(run.record, best),
      },
    };
  }
  const burned = run.burned + 1;
  if (burned >= ENDLESS_CHARGES) {
    return {
      rows,
      outcome: 'fused',
      run: { ...run, level: stageStart(run.level), burned: 0, fuses: run.fuses + 1, attempts: [] },
    };
  }
  return { rows, outcome: 'failed', run: { ...run, burned, attempts: [...run.attempts, placement] } };
};

/** A board without the generator's answer. */
export const publicBoard = (board: SolvedBoard): Board => ({
  day: board.day,
  date: board.date,
  level: board.level,
  difficulty: board.difficulty,
  inputs: board.inputs,
  sockets: board.sockets,
  bulbs: board.bulbs,
  tray: board.tray,
  target: board.target,
  probeRow: board.probeRow,
});

/** What the client is shown of a run. */
export const viewOf = (run: EndlessRun, board: SolvedBoard, now: number): EndlessView => ({
  week: run.week,
  level: run.level,
  stage: stageOf(run.level),
  board: publicBoard(board),
  attempts: run.attempts,
  burned: run.burned,
  best: run.best,
  today: gainedToday(run),
  record: run.record,
  fuses: run.fuses,
  endsInMs: msUntilNextWeek(now),
});

/**
 * Leaderboard score: whole levels, plus a fraction that is larger the earlier
 * in the period the level was reached, so ties go to whoever got there first.
 */
export const endlessScore = (levels: number, now: number, periodStart: number, periodMs: number): number =>
  levels + 0.999 * (1 - Math.min(1, Math.max(0, (now - periodStart) / periodMs)));
