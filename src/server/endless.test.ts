import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from '../shared/day';
import { ENDLESS_CHARGES } from '../shared/endless';
import { solve } from '../shared/solve';
import type { Board, FullPlacement } from '../shared/types';
import { createApp } from './app';
import { createEndless } from './endless';
import { createGame, GameError } from './game';
import { caller, createFakeReddit, createFakeRedis } from './testing/fakes';

const START = Date.parse('2026-11-16T09:00:00Z'); // a Monday

const world = () => {
  const clock = { ms: START };
  const ports = { redis: createFakeRedis(), reddit: createFakeReddit(), now: () => clock.ms };
  return { clock, ports, endless: createEndless(ports), game: createGame(ports) };
};

const winFor = (board: Board): FullPlacement => {
  const win = solve(board).solutions[0];
  if (!win) throw new Error('unsolvable board');
  return win;
};

/** A legal placement that fails: the winning chips with two unlike ones swapped. */
const loseFor = (board: Board): FullPlacement => {
  const wins = new Set(solve(board, 99).solutions.map((s) => s.join()));
  const win = winFor(board);
  for (let i = 0; i < win.length; i++) {
    for (let j = i + 1; j < win.length; j++) {
      const a = win[i];
      const b = win[j];
      if (!a || !b || a === b || (a === 'NOT') !== (b === 'NOT')) continue;
      const swapped = [...win];
      swapped[i] = b;
      swapped[j] = a;
      if (!wins.has(swapped.join())) return swapped;
    }
  }
  throw new Error('no losing placement');
};

const climb = async (w: ReturnType<typeof world>, name: string, levels: number) => {
  for (let i = 0; i < levels; i++) {
    const view = await w.endless.view(caller(name));
    await w.endless.power(caller(name), view.level, winFor(view.board));
  }
};

describe('endless mode on the server', () => {
  it('needs a logged-in player', async () => {
    const w = world();
    await expect(w.endless.view(caller(null))).rejects.toBeInstanceOf(GameError);
  });

  it('starts at level 1 and never sends the answer', async () => {
    const w = world();
    const view = await w.endless.view(caller('ada'));
    expect(view).toMatchObject({ level: 1, stage: 1, burned: 0, best: 0, today: 0, attempts: [] });
    expect(view.board).not.toHaveProperty('solution');
    expect(view.endsInMs).toBe(7 * MS_PER_DAY - 9 * 3_600_000);
  });

  it('climbs through a stage, refilling charges at the next one', async () => {
    const w = world();
    const first = await w.endless.view(caller('ada'));
    // Level 4 is the first with more than one way to seat the chips.
    await climb(w, 'ada', 3);
    const fourth = await w.endless.view(caller('ada'));
    const missed = await w.endless.power(caller('ada'), 4, loseFor(fourth.board));
    expect(missed.outcome).toBe('failed');
    expect(missed.view).toMatchObject({ level: 4, burned: 1 });
    expect(missed.view.attempts).toHaveLength(1);
    await climb(w, 'ada', 7);
    const view = await w.endless.view(caller('ada'));
    expect(view).toMatchObject({ level: 11, stage: 2, burned: 0, best: 10, today: 10, record: 10 });
    expect(view.board).not.toEqual(first.board);
  });

  it('drops back to the stage start on new boards when the fuse blows', async () => {
    const w = world();
    await climb(w, 'ada', 13);
    const before = await w.endless.view(caller('ada'));
    expect(before.level).toBe(14);
    let last = await w.endless.power(caller('ada'), 14, loseFor(before.board));
    for (let i = 1; i < ENDLESS_CHARGES; i++) {
      // The client blocks repeats; the server simply charges for them.
      last = await w.endless.power(caller('ada'), 14, loseFor(before.board));
    }
    expect(last.outcome).toBe('fused');
    expect(last.view).toMatchObject({ level: 11, burned: 0, fuses: 1, best: 13 });
    await climb(w, 'ada', 2);
    expect((await w.endless.view(caller('ada'))).best).toBe(13);
  });

  it('rejects a test for a level the player is not on, and chips that do not fit', async () => {
    const w = world();
    const view = await w.endless.view(caller('ada'));
    await expect(w.endless.power(caller('ada'), 5, winFor(view.board))).rejects.toMatchObject({
      code: 'moved-on',
    });
    await expect(w.endless.power(caller('ada'), 1, ['NOR', 'NOR', 'NOR'])).rejects.toMatchObject({
      code: 'bad-placement',
    });
  });

  it('keeps a weekly board of height and a daily board of new levels', async () => {
    const w = world();
    await climb(w, 'ada', 6);
    w.clock.ms += 60_000;
    await climb(w, 'bob', 6);
    await climb(w, 'cy', 2);

    let week = await w.endless.leaderboard(caller('bob'), 'week');
    expect(week.rows.map((r) => [r.name, r.levels])).toEqual([['ada', 6], ['bob', 6], ['cy', 2]]);
    expect(week.rows[1]?.you).toBe(true);
    expect(week).toMatchObject({ rank: 2, total: 3 });

    // Next day: only today's gains count on the daily board; the weekly one keeps the height.
    w.clock.ms += MS_PER_DAY;
    await climb(w, 'cy', 5);
    w.clock.ms += 60_000;
    await climb(w, 'ada', 1);
    const day = await w.endless.leaderboard(caller('ada'), 'day');
    expect(day.rows.map((r) => [r.name, r.levels])).toEqual([['cy', 5], ['ada', 1]]);
    week = await w.endless.leaderboard(caller('ada'), 'week');
    expect(week.rows.map((r) => [r.name, r.levels])).toEqual([['cy', 7], ['ada', 7], ['bob', 6]]);
  });

  it('starts everyone over on Monday and keeps the record', async () => {
    const w = world();
    await climb(w, 'ada', 4);
    w.clock.ms += 7 * MS_PER_DAY;
    const view = await w.endless.view(caller('ada'));
    expect(view).toMatchObject({ level: 1, best: 0, today: 0, record: 4 });
    expect((await w.endless.leaderboard(caller('ada'), 'week')).rows).toEqual([]);
  });

  it('is erased with the rest of a player\'s data', async () => {
    const w = world();
    await climb(w, 'ada', 3);
    await w.game.forget(caller('ada'));
    expect((await w.endless.leaderboard(caller('ada'), 'week')).rows).toEqual([]);
    expect((await w.endless.view(caller('ada'))).record).toBe(0);
  });

  it('serves the routes', async () => {
    const w = world();
    const app = createApp(w.ports, () => caller('ada'));
    const view = await (await app.request('/api/endless')).json();
    expect(view.level).toBe(1);
    const res = await app.request('/api/endless/power', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 1, placement: winFor(view.board) }),
    });
    expect((await res.json()).outcome).toBe('cleared');
    const board = await (await app.request('/api/endless/leaderboard?scope=week')).json();
    expect(board.rows).toEqual([{ name: 'ada', levels: 1, you: true }]);
  });
});
