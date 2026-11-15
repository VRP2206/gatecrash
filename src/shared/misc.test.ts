import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  dayNumber,
  difficultyFor,
  isoDate,
  msUntilNextDay,
  shortDate,
  utcDayIndex,
  weekdayName,
} from './day';
import { createRng, hashSeed } from './rng';
import {
  beatPercent,
  formatTime,
  rankScore,
  shareLine,
  splitRankScore,
} from './score';
import { solve } from './solve';
import { advanceStreak, flairText, NO_STREAK, visibleStreak } from './streak';

describe('day', () => {
  const mon = utcDayIndex(Date.parse('2026-11-16T00:00:00Z'));
  it('maps timestamps to UTC days', () => {
    expect(utcDayIndex(Date.parse('2026-11-16T23:59:59Z'))).toBe(mon);
    expect(utcDayIndex(Date.parse('2026-11-17T00:00:00Z'))).toBe(mon + 1);
    expect(isoDate(mon)).toBe('2026-11-16');
    expect(weekdayName(mon)).toBe('Monday');
    expect(shortDate(mon + 2)).toBe('Wed 18 Nov');
  });
  it('numbers days from the epoch', () => {
    expect(dayNumber(mon, mon)).toBe(1);
    expect(dayNumber(mon + 11, mon)).toBe(12);
    expect(dayIndexOf(12, mon)).toBe(mon + 11);
  });
  it('follows the weekly rhythm', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => difficultyFor(mon + d))).toEqual([
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
      'hard',
      'overclock',
    ]);
  });
  it('counts down to midnight UTC', () => {
    expect(msUntilNextDay(Date.parse('2026-11-16T23:00:00Z'))).toBe(3_600_000);
  });
});

describe('rng', () => {
  it('is repeatable and roughly uniform', () => {
    const a = createRng(hashSeed('x'));
    const b = createRng(hashSeed('x'));
    const seq = Array.from({ length: 20 }, () => a.int(1000));
    expect(Array.from({ length: 20 }, () => b.int(1000))).toEqual(seq);
    const c = createRng(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += c.next();
    expect(sum / 10_000).toBeGreaterThan(0.47);
    expect(sum / 10_000).toBeLessThan(0.53);
  });
  it('shuffles without losing items', () => {
    const r = createRng(1);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(r.range(3, 3)).toBe(3);
  });
});

describe('solve', () => {
  it('counts distinct placements, not chip swaps', () => {
    const result = solve({
      inputs: 2,
      sockets: [
        { layer: 1, inputs: [{ kind: 'in', index: 0 }, { kind: 'in', index: 1 }] },
        { layer: 2, inputs: [{ kind: 'socket', index: 0 }, { kind: 'in', index: 0 }] },
      ],
      bulbs: [1],
      tray: ['AND', 'AND', 'OR'],
      target: [0b1000],
    });
    // Legal fills: AND/AND, AND/OR, OR/AND. (a&b)&a and (a|b)&a ... only AND/AND and gives a&b.
    expect(result.candidates).toBe(3);
    expect(result.solutions).toEqual([['AND', 'AND']]);
  });
});

describe('score', () => {
  it('formats time', () => {
    expect(formatTime(48)).toBe('0:48');
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(999_999)).toBe('99:59');
  });
  it('ranks by charges, then time', () => {
    expect(rankScore(1, 500)).toBeLessThan(rankScore(2, 3));
    expect(rankScore(2, 3)).toBeLessThan(rankScore(2, 4));
    expect(splitRankScore(rankScore(3, 77))).toEqual({ charges: 3, seconds: 77 });
  });
  it('builds a spoiler-free share line', () => {
    const base = { startedAt: 1000, endedAt: 49_000 };
    expect(
      shareLine(12, { ...base, status: 'solved', attempts: [['AND'], ['OR']] })
    ).toBe('Gatecrash #12 ⚡⚡▫▫▫ 0:48');
    expect(
      shareLine(12, { ...base, status: 'solved', attempts: [['AND']] }, 7)
    ).toBe('Gatecrash #12 ⚡▫▫▫▫ 0:48 · streak 7');
    expect(
      shareLine(3, { ...base, status: 'fused', attempts: [[], [], [], [], []] })
    ).toBe('Gatecrash #3 ⚡⚡⚡⚡⚡ fuse blown');
  });
  it('places a result among other players', () => {
    expect(beatPercent([0, 0, 0, 0, 0, 0], 0)).toBe(0);
    expect(beatPercent([1, 0, 0, 0, 0, 0], 0)).toBe(0);
    expect(beatPercent([1, 2, 1, 0, 0, 1], 0)).toBe(100);
    expect(beatPercent([1, 2, 1, 0, 0, 1], 1)).toBe(50);
    expect(beatPercent([1, 2, 1, 0, 0, 1], 5)).toBe(0);
  });
});

describe('streak', () => {
  it('extends on consecutive live solves', () => {
    let s = advanceStreak(NO_STREAK, 4, true);
    expect(s).toEqual({ current: 1, best: 1, lastSolvedDay: 4 });
    s = advanceStreak(s, 5, true);
    s = advanceStreak(s, 6, true);
    expect(s).toEqual({ current: 3, best: 3, lastSolvedDay: 6 });
  });
  it('restarts after a gap and remembers the best run', () => {
    let s = { current: 5, best: 5, lastSolvedDay: 10 };
    s = advanceStreak(s, 12, true);
    expect(s).toEqual({ current: 1, best: 5, lastSolvedDay: 12 });
  });
  it('ends on a blown fuse', () => {
    const s = advanceStreak({ current: 5, best: 9, lastSolvedDay: 10 }, 11, false);
    expect(s).toEqual({ current: 0, best: 9, lastSolvedDay: 10 });
  });
  it('ignores days at or before the last solve', () => {
    const s = { current: 5, best: 5, lastSolvedDay: 10 };
    expect(advanceStreak(s, 10, true)).toBe(s);
    expect(advanceStreak(s, 3, false)).toBe(s);
  });
  it('only shows a run that is still alive', () => {
    const s = { current: 5, best: 5, lastSolvedDay: 10 };
    expect(visibleStreak(s, 10)).toBe(5);
    expect(visibleStreak(s, 11)).toBe(5);
    expect(visibleStreak(s, 12)).toBe(0);
  });
  it('names flair tiers', () => {
    expect(flairText(0)).toBe('');
    expect(flairText(1)).toBe('Spark · 1');
    expect(flairText(7)).toBe('Apprentice · 7');
    expect(flairText(75)).toBe('Wizard · 75');
  });
});

describe('tutorial board', () => {
  it('has exactly one answer and the swap fails the live row', async () => {
    const { TUTORIAL_BOARD } = await import('./tutorial');
    const { simulate } = await import('./sim');
    const result = solve(TUTORIAL_BOARD);
    expect(result.candidates).toBe(2);
    expect(result.solutions).toEqual([['AND', 'OR']]);
    const swapped = simulate(TUTORIAL_BOARD, ['OR', 'AND']);
    expect(swapped[TUTORIAL_BOARD.probeRow]?.ok).toBe(false);
  });
});
