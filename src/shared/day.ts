import type { ChipType, Difficulty, Level } from './types';

export const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01 UTC. All of Gatecrash's calendar maths uses this. */
export const utcDayIndex = (ms: number): number => Math.floor(ms / MS_PER_DAY);

/** ISO date (YYYY-MM-DD) for a UTC day index. */
export const isoDate = (dayIndex: number): string =>
  new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10);

/** 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday. */
export const weekdayOf = (dayIndex: number): number =>
  (((dayIndex + 4) % 7) + 7) % 7;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const weekdayName = (dayIndex: number): string =>
  WEEKDAY_NAMES[weekdayOf(dayIndex)] ?? '';

/** e.g. "Wed 25 Nov". */
export const shortDate = (dayIndex: number): string => {
  const d = new Date(dayIndex * MS_PER_DAY);
  const month = MONTHS[d.getUTCMonth()] ?? '';
  return `${weekdayName(dayIndex).slice(0, 3)} ${d.getUTCDate()} ${month}`;
};

/** Day 1 is the day the app was installed (the epoch). */
export const dayNumber = (dayIndex: number, epochIndex: number): number =>
  dayIndex - epochIndex + 1;

export const dayIndexOf = (day: number, epochIndex: number): number =>
  epochIndex + day - 1;

/** Milliseconds until the next UTC midnight. */
export const msUntilNextDay = (ms: number): number =>
  (utcDayIndex(ms) + 1) * MS_PER_DAY - ms;

type Span = readonly [min: number, max: number];

export type DaySpec = {
  difficulty: Difficulty;
  inputs: number;
  sockets: Span;
  bulbs: Span;
  decoys: Span;
  /** Two-wire chips the generator may use. FLIP is always allowed. */
  chips: readonly ChipType[];
  maxFlips: number;
  /** Fewest columns of sockets; 1 allows boards where every chip drives a bulb. Default 2. */
  minColumns?: number;
  /** Boards must have at least this many FLIP sockets. Leave out for no minimum. */
  minFlips?: number;
  /** Reject boards with more distinct winning placements than this. */
  maxSolutions: number;
  /** Reject boards with fewer legal placements than this (too easy to brute-force). */
  minCandidates: number;
};

const BASIC: readonly ChipType[] = ['AND', 'OR', 'XOR'];
const ALL: readonly ChipType[] = ['AND', 'OR', 'XOR', 'NAND', 'NOR'];

const SPECS: Readonly<Record<Difficulty, DaySpec>> = {
  easy: {
    difficulty: 'easy',
    inputs: 2,
    sockets: [3, 4],
    bulbs: [1, 2],
    decoys: [0, 0],
    chips: BASIC,
    maxFlips: 1,
    maxSolutions: 2,
    minCandidates: 6,
  },
  medium: {
    difficulty: 'medium',
    inputs: 3,
    sockets: [4, 5],
    bulbs: [1, 2],
    decoys: [0, 0],
    chips: BASIC,
    maxFlips: 1,
    maxSolutions: 2,
    minCandidates: 20,
  },
  hard: {
    difficulty: 'hard',
    inputs: 3,
    sockets: [5, 6],
    bulbs: [2, 2],
    decoys: [1, 2],
    chips: BASIC,
    maxFlips: 2,
    maxSolutions: 3,
    minCandidates: 60,
  },
  overclock: {
    difficulty: 'overclock',
    inputs: 4,
    sockets: [6, 7],
    bulbs: [2, 3],
    decoys: [1, 2],
    chips: ALL,
    maxFlips: 2,
    maxSolutions: 3,
    minCandidates: 150,
  },
};

/** Easy and medium use the same recipe every day; hard grows into Overclock on Sundays. */
export const difficultyFor = (dayIndex: number, level: Level): Difficulty =>
  level === 'hard' && weekdayOf(dayIndex) === 0 ? 'overclock' : level;

export const specFor = (difficulty: Difficulty): DaySpec => SPECS[difficulty];

