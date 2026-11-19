import { describe, expect, it } from 'vitest';
import {
  ENDLESS_CHARGES,
  STAGE_LENGTH,
  STEPS,
  endlessScore,
  endlessSpec,
  freshRun,
  gainedToday,
  generateEndless,
  msUntilNextWeek,
  nextStep,
  powerRun,
  rollRun,
  stageOf,
  stageStart,
  stepAt,
  switchesAt,
  weekIndexOf,
  weekStartDay,
} from './endless';
import { MS_PER_DAY, utcDayIndex, weekdayOf } from './day';
import { rowCount } from './sim';
import { solve } from './solve';
import type { ChipType, FullPlacement, SolvedBoard } from './types';

const MONDAY = utcDayIndex(Date.parse('2026-11-16T00:00:00Z'));
const WEEK = weekIndexOf(MONDAY);

/** Any legal placement that is not a solution. */
const wrongFor = (board: SolvedBoard): FullPlacement => {
  const wins = new Set(solve(board, 99).solutions.map((s) => s.join()));
  const walk = (left: ChipType[], placed: ChipType[]): ChipType[] | null => {
    if (placed.length === board.sockets.length) return wins.has(placed.join()) ? null : placed;
    const wires = board.sockets[placed.length]?.inputs.length ?? 2;
    for (const chip of new Set(left)) {
      if ((chip === 'NOT') !== (wires === 1)) continue;
      const rest = [...left];
      rest.splice(rest.indexOf(chip), 1);
      const found = walk(rest, [...placed, chip]);
      if (found) return found;
    }
    return null;
  };
  const found = walk([...board.tray], []);
  if (!found) throw new Error('every placement wins');
  return found;
};

describe('endless calendar', () => {
  it('starts weeks on Monday UTC', () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekStartDay(WEEK)).toBe(MONDAY);
    expect(weekIndexOf(MONDAY - 1)).toBe(WEEK - 1);
    expect(weekIndexOf(MONDAY + 6)).toBe(WEEK);
    expect(weekIndexOf(MONDAY + 7)).toBe(WEEK + 1);
    expect(msUntilNextWeek((MONDAY + 6) * MS_PER_DAY + 1000)).toBe(MS_PER_DAY - 1000);
  });
});

describe('endless difficulty', () => {
  it('groups levels into stages of ten', () => {
    expect([1, 10, 11, 20, 21, 100, 101].map(stageOf)).toEqual([1, 1, 2, 2, 3, 10, 11]);
    expect([1, 10, 11, 25, 80, 101].map(stageStart)).toEqual([1, 1, 11, 21, 71, 101]);
  });

  it('adds switches at levels 26 and 76', () => {
    expect([1, 25, 26, 75, 76, 125, 126, 300].map(switchesAt)).toEqual([2, 2, 3, 3, 4, 4, 4, 4]);
  });

  it('steps up often, with a step at every stage start and every new switch', () => {
    const starts = STEPS.map((step) => step.from);
    expect(starts[0]).toBe(1);
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
    expect(starts).toContain(26);
    expect(starts).toContain(76);
    for (let level = 11; level <= 121; level += STAGE_LENGTH) expect(starts).toContain(level);
    starts.forEach((from, i) => {
      const next = starts[i + 1];
      if (next !== undefined) expect(next - from, `step at ${from}`).toBeLessThanOrEqual(10);
    });
    for (const step of STEPS) expect(step.recipes.length, `step at ${step.from}`).toBeGreaterThan(0);
  });

  it('finds the step for a level, and the one after it', () => {
    expect(stepAt(1).from).toBe(1);
    expect(stepAt(3).from).toBe(1);
    expect(stepAt(4).from).toBe(4);
    expect(stepAt(999).from).toBe(STEPS.at(-1)?.from);
    expect(nextStep(1)?.from).toBe(4);
    expect(nextStep(25)?.from).toBe(26);
    expect(nextStep(999)).toBeNull();
  });

  it('gets no easier from one step to the next while the switch count stays', () => {
    let last = { inputs: 0, median: 0, from: 0 };
    STEPS.forEach((step, i) => {
      const to = (STEPS[i + 1]?.from ?? step.from + 10) - 1;
      const ways: number[] = [];
      for (let week = WEEK; week < WEEK + 6; week++) {
        for (let level = step.from; level <= to; level++) {
          ways.push(solve(generateEndless({ week, level, retry: 0 }), 1).candidates);
        }
      }
      ways.sort((x, y) => x - y);
      const median = ways[Math.floor(ways.length / 2)] ?? 0;
      const inputs = switchesAt(step.from);
      if (inputs === last.inputs) {
        expect(median, `levels ${step.from}-${to} vs the step at ${last.from}`).toBeGreaterThanOrEqual(last.median);
      }
      last = { inputs, median, from: step.from };
    });
  });

  it('builds a solvable board for every level up to 200, the same one each time', () => {
    for (let level = 1; level <= 200; level++) {
      const board = generateEndless({ week: WEEK, level, retry: 0 });
      const spec = endlessSpec(level);
      const label = `level ${level}`;
      expect(board.inputs, label).toBe(switchesAt(level));
      expect(board.sockets.length, label).toBeGreaterThanOrEqual(spec.sockets[0]);
      expect(board.sockets.length, label).toBeLessThanOrEqual(spec.sockets[1]);
      expect(rowCount(board.inputs), label).toBeLessThanOrEqual(16);
      const { solutions } = solve(board, 9);
      expect(solutions.length, label).toBeGreaterThanOrEqual(1);
      expect(solutions.length, label).toBeLessThanOrEqual(spec.maxSolutions);
      if (level >= 60 && level % 20 === 0) {
        expect(generateEndless({ week: WEEK, level, retry: 0 })).toEqual(board);
        expect(generateEndless({ week: WEEK, level, retry: 1 })).not.toEqual(board);
        expect(generateEndless({ week: WEEK + 1, level, retry: 0 })).not.toEqual(board);
      }
    }
  });

  it('opens by matching chips to bulbs, with a different pair of chips from week to week', () => {
    const pairs = new Set<string>();
    for (let week = WEEK; week < WEEK + 10; week++) {
      for (let level = 1; level <= 3; level++) {
        const board = generateEndless({ week, level, retry: 0 });
        expect(board.sockets).toHaveLength(2);
        expect(board.sockets.every((s) => s.layer === 1)).toBe(true);
        expect(board.bulbs).toHaveLength(2);
        expect(board.tray).toHaveLength(2);
        expect(solve(board, 9).solutions).toHaveLength(1);
        pairs.add([...board.tray].sort().join());
      }
    }
    expect(pairs.size).toBe(3);
  });

  it('brings in one new thing at a time over the first stages', () => {
    const at = (level: number, week = WEEK) => generateEndless({ week, level, retry: 0 });
    // 4-6: three chips; level 4 keeps two sockets, so one chip is spare.
    expect(at(4).tray).toHaveLength(3);
    expect(at(4).sockets).toHaveLength(2);
    expect(at(5).tray).toHaveLength(3);
    // 7-10: chips feed chips.
    expect(Math.max(...at(7).sockets.map((s) => s.layer))).toBe(2);
    // 11: FLIP is on the board.
    for (let week = WEEK; week < WEEK + 5; week++) {
      expect(at(11, week).sockets.some((s) => s.inputs.length === 1)).toBe(true);
    }
    // 15: two bulbs.
    expect(at(15).bulbs).toHaveLength(2);
  });

  it('mixes shapes so the early levels do not repeat', () => {
    const trays = new Set<string>();
    const wirings = new Set<string>();
    for (let week = WEEK; week < WEEK + 10; week++) {
      for (let level = 1; level <= 20; level++) {
        const board = generateEndless({ week, level, retry: 0 });
        trays.add([...board.tray].sort().join());
        wirings.add(JSON.stringify([board.sockets, board.bulbs]));
      }
    }
    expect(trays.size).toBeGreaterThanOrEqual(15);
    expect(wirings.size).toBeGreaterThanOrEqual(30);
  });
});

describe('endless run', () => {
  const play = (run = freshRun(WEEK, MONDAY)) => {
    const board = generateEndless({ week: run.week, level: run.level, retry: run.fuses });
    const win = solve(board).solutions[0];
    if (!win) throw new Error('unsolvable');
    return { board, win, lose: () => wrongFor(board) };
  };

  it('moves up on a clear, for free', () => {
    const run = freshRun(WEEK, MONDAY);
    const { board, win } = play(run);
    const result = powerRun(run, board, win);
    expect(result.outcome).toBe('cleared');
    expect(result.run).toMatchObject({ level: 2, best: 1, record: 1, burned: 0, attempts: [] });
  });

  it('burns a charge on a failed test and remembers the placement', () => {
    const run = { ...freshRun(WEEK, MONDAY), level: 14, best: 13 };
    const { board, lose } = play(run);
    const result = powerRun(run, board, lose());
    expect(result.outcome).toBe('failed');
    expect(result.run).toMatchObject({ level: 14, burned: 1, attempts: [expect.any(Array)] });
  });

  it('blows the fuse on the last charge: back to the stage start, on new boards', () => {
    const run = { ...freshRun(WEEK, MONDAY), level: 17, best: 16, burned: ENDLESS_CHARGES - 1 };
    const { board, lose } = play(run);
    const result = powerRun(run, board, lose());
    expect(result.outcome).toBe('fused');
    expect(result.run).toMatchObject({ level: 11, burned: 0, fuses: 1, best: 16, attempts: [] });
  });

  it('refills the charges when a new stage begins, and not before', () => {
    const mid = { ...freshRun(WEEK, MONDAY), level: 9, best: 8, burned: 3 };
    const a = play(mid);
    const ninth = powerRun(mid, a.board, a.win).run;
    expect(ninth).toMatchObject({ level: 10, burned: 3 });
    const b = play(ninth);
    expect(powerRun(ninth, b.board, b.win).run).toMatchObject({ level: 11, burned: 0, best: 10 });
  });

  it('does not count re-climbed levels as new ground', () => {
    const fallen = { ...freshRun(WEEK, MONDAY), level: 11, best: 16, fuses: 1 };
    const { board, win } = play(fallen);
    expect(powerRun(fallen, board, win).run.best).toBe(16);
  });

  it('starts over on a new week but keeps the record, and counts each day from its start', () => {
    const run = { ...freshRun(WEEK, MONDAY), level: 31, best: 30, record: 44, dayBase: 22 };
    expect(gainedToday(run)).toBe(8);
    const tuesday = rollRun(run, MONDAY + 1);
    expect(tuesday).toMatchObject({ level: 31, best: 30, dayBase: 30 });
    expect(gainedToday(tuesday)).toBe(0);
    expect(rollRun(run, MONDAY + 7)).toMatchObject({ week: WEEK + 1, level: 1, best: 0, record: 44 });
    expect(rollRun(null, MONDAY)).toEqual(freshRun(WEEK, MONDAY));
  });

  it('ranks more levels first and earlier arrivals ahead on a tie', () => {
    const start = MONDAY * MS_PER_DAY;
    const early = endlessScore(12, start + 1000, start, MS_PER_DAY);
    const late = endlessScore(12, start + 50_000_000, start, MS_PER_DAY);
    expect(early).toBeGreaterThan(late);
    expect(Math.floor(early)).toBe(12);
    expect(Math.floor(late)).toBe(12);
    expect(endlessScore(13, start + MS_PER_DAY, start, MS_PER_DAY)).toBeGreaterThan(early);
  });
});
