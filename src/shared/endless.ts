import type { DaySpec } from './day';
import { MS_PER_DAY } from './day';
import { generateFrom } from './generate';
import { simulate } from './sim';
import type { EndlessView } from './api';
import type { Board, ChipType, FullPlacement, RowResult, SolvedBoard } from './types';

/*
 * Endless mode: one climb per week. Level 1 is trivial and the boards grow in
 * stages of ten. A failed test burns one of the stage's charges; a test that
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

/** What a board looks like at each level. Every stage of ten is a step up. */
const recipeAt = (level: number): Recipe => {
  const stage = stageOf(level);
  const inputs = switchesAt(level);
  if (stage === 1) {
    // The first three boards have only one way to seat the chips: a warm-up.
    return { sockets: [2, 2], bulbs: [1, 1], decoys: [0, 0], chips: BASIC, maxFlips: 1, maxSolutions: 1, minCandidates: level <= 3 ? 1 : 2 };
  }
  if (stage === 2) {
    return { sockets: [3, 3], bulbs: [1, 2], decoys: [0, 0], chips: BASIC, maxFlips: 1, maxSolutions: 2, minCandidates: 3 };
  }
  if (stage === 3) {
    // Levels 26-30 add the third switch, so the board itself eases off.
    return inputs === 2
      ? { sockets: [3, 4], bulbs: [1, 2], decoys: [1, 1], chips: BASIC, maxFlips: 1, maxSolutions: 2, minCandidates: 6 }
      : { sockets: [3, 3], bulbs: [1, 1], decoys: [0, 0], chips: BASIC, maxFlips: 1, maxSolutions: 2, minCandidates: 3 };
  }
  if (stage === 4) {
    return { sockets: [4, 4], bulbs: [1, 2], decoys: [0, 0], chips: BASIC, maxFlips: 1, maxSolutions: 2, minCandidates: 8 };
  }
  if (stage === 5) {
    return { sockets: [4, 5], bulbs: [1, 2], decoys: [0, 1], chips: BASIC, maxFlips: 1, maxSolutions: 2, minCandidates: 16 };
  }
  if (stage === 6) {
    return { sockets: [5, 5], bulbs: [1, 2], decoys: [1, 1], chips: BASIC, maxFlips: 2, maxSolutions: 2, minCandidates: 30 };
  }
  if (stage === 7) {
    return { sockets: [5, 6], bulbs: [2, 2], decoys: [1, 2], chips: BASIC, maxFlips: 2, maxSolutions: 3, minCandidates: 60 };
  }
  if (stage === 8) {
    // Levels 76-80 add the fourth switch; this is where the hard boards begin.
    return inputs === 3
      ? { sockets: [6, 6], bulbs: [2, 2], decoys: [2, 2], chips: BASIC, maxFlips: 2, maxSolutions: 3, minCandidates: 90 }
      : { sockets: [5, 6], bulbs: [2, 2], decoys: [1, 1], chips: BASIC, maxFlips: 2, maxSolutions: 3, minCandidates: 60 };
  }
  if (stage === 9) {
    return { sockets: [6, 7], bulbs: [2, 3], decoys: [1, 2], chips: ALL, maxFlips: 2, maxSolutions: 3, minCandidates: 150 };
  }
  if (stage === 10) {
    return { sockets: [7, 7], bulbs: [2, 3], decoys: [2, 2], chips: ALL, maxFlips: 2, maxSolutions: 3, minCandidates: 250 };
  }
  if (stage === 11) {
    return { sockets: [7, 7], bulbs: [2, 3], decoys: [2, 3], chips: ALL, maxFlips: 2, maxSolutions: 2, minCandidates: 400 };
  }
  if (stage === 12) {
    return { sockets: [7, 8], bulbs: [2, 3], decoys: [3, 3], chips: ALL, maxFlips: 2, maxSolutions: 2, minCandidates: 600 };
  }
  return { sockets: [8, 8], bulbs: [2, 3], decoys: [3, 3], chips: ALL, maxFlips: 3, maxSolutions: 1, minCandidates: 600 };
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
