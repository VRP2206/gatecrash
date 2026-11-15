import { describe, expect, it } from 'vitest';
import { MS_PER_DAY } from '../shared/day';
import { solve } from '../shared/solve';
import { MAX_CHARGES, type Board, type FullPlacement } from '../shared/types';
import { createApp } from './app';
import { createGame, GameError } from './game';
import { caller, createFakeReddit, createFakeRedis } from './testing/fakes';

const START = Date.parse('2026-11-16T09:00:00Z'); // a Monday

const world = () => {
  const clock = { ms: START };
  const reddit = createFakeReddit();
  const ports = { redis: createFakeRedis(), reddit, now: () => clock.ms };
  const game = createGame(ports);
  return {
    clock,
    reddit,
    ports,
    game,
    nextDay: () => {
      clock.ms += MS_PER_DAY;
    },
  };
};

const answers = (board: Board): { win: FullPlacement; lose: FullPlacement } => {
  const { solutions } = solve(board);
  const win = solutions[0];
  if (!win) throw new Error('unsolvable board');
  // Any legal placement that is not a solution: rotate the tray until one fails.
  const wins = new Set(solutions.map((s) => s.join()));
  const lose = allPlacements(board).find((p) => !wins.has(p.join()));
  if (!lose) throw new Error('no losing placement');
  return { win, lose };
};

const allPlacements = (board: Board): FullPlacement[] => {
  const out: FullPlacement[] = [];
  const walk = (left: string[], placed: FullPlacement): void => {
    const socket = board.sockets[placed.length];
    if (!socket) {
      out.push([...placed]);
      return;
    }
    const seen = new Set<string>();
    left.forEach((chip, i) => {
      if (seen.has(chip)) return;
      seen.add(chip);
      const fits = (chip === 'NOT') === (socket.inputs.length === 1);
      const typed = board.tray.find((c) => c === chip);
      if (!fits || !typed) return;
      walk([...left.slice(0, i), ...left.slice(i + 1)], [...placed, typed]);
    });
  };
  walk([...board.tray], []);
  return out;
};

describe('daily post', () => {
  it('is created once per day with a results thread', async () => {
    const w = world();
    const first = await w.game.ensureDailyPost();
    const again = await w.game.ensureDailyPost();
    expect(first).toMatchObject({ day: 1, created: true });
    expect(again).toMatchObject({ day: 1, created: false, postId: first.postId });
    expect(w.reddit.posts).toHaveLength(1);
    expect(w.reddit.posts[0]?.title).toBe('Gatecrash #1 — Monday');
    expect(w.reddit.comments).toHaveLength(1);

    w.nextDay();
    const second = await w.game.ensureDailyPost();
    expect(second).toMatchObject({ day: 2, created: true });
    expect(w.reddit.posts[1]?.title).toBe('Gatecrash #2 — Tuesday');
  });

  it('does not double-post when two triggers race', async () => {
    const w = world();
    const made = await Promise.all([w.game.ensureDailyPost(), w.game.ensureDailyPost()]);
    expect(made.filter((m) => m.created)).toHaveLength(1);
    expect(w.reddit.posts).toHaveLength(1);
  });

  it('labels Sunday as Overclock', async () => {
    const w = world();
    w.clock.ms += 6 * MS_PER_DAY;
    await w.game.ensureDailyPost();
    expect(w.reddit.posts[0]?.title).toBe('Gatecrash #1 — Sunday Overclock');
  });
});

describe('playing', () => {
  it('serves the board without the answer and resolves the day from the post', async () => {
    const w = world();
    const { postId } = await w.game.ensureDailyPost();
    w.nextDay();
    await w.game.ensureDailyPost();
    const init = await w.game.init(caller('ada', postId), null);
    expect(init.day).toBe(1);
    expect(init.today).toBe(2);
    expect(init.board).not.toHaveProperty('solution');
    expect(init.state.status).toBe('new');
    expect((await w.game.init(caller('ada'), null)).day).toBe(2);
  });

  it('solves, records stats, streak, leaderboard and flair', async () => {
    const w = world();
    const ada = caller('ada');
    const { board } = await w.game.init(ada, null);
    const { win, lose } = answers(board);

    await w.game.start(ada, 1);
    w.clock.ms += 30_000;
    const miss = await w.game.power(ada, 1, lose);
    expect(miss.state.status).toBe('playing');
    expect(miss.chargesLeft).toBe(MAX_CHARGES - 1);
    expect(miss.rows.some((r) => !r.ok)).toBe(true);

    w.clock.ms += 18_000;
    const hit = await w.game.power(ada, 1, win);
    expect(hit.state.status).toBe('solved');
    expect(hit.rows.every((r) => r.ok)).toBe(true);

    const result = await w.game.result(ada, 1);
    expect(result.histogram).toEqual([0, 1, 0, 0, 0, 0]);
    expect(result.players).toBe(1);
    expect(result.rank).toBe(1);
    expect(result.streak).toEqual({ current: 1, best: 1, tier: 'Spark' });
    expect(result.shareLine).toBe('Gatecrash #1 ⚡⚡▫▫▫ 0:48');
    expect(w.reddit.flairs.get('ada')).toBe('Spark · 1');

    await expect(w.game.power(ada, 1, win)).rejects.toMatchObject({ code: 'finished' });
  });

  it('restores an unfinished game exactly', async () => {
    const w = world();
    const ada = caller('ada');
    const { board } = await w.game.init(ada, null);
    const { lose } = answers(board);
    await w.game.power(ada, 1, lose);
    const again = await w.game.init(ada, null);
    expect(again.state.status).toBe('playing');
    expect(again.state.attempts).toEqual([lose]);
  });

  it('blows the fuse after five misses and ends the streak', async () => {
    const w = world();
    const ada = caller('ada');
    const day1 = await w.game.init(ada, null);
    await w.game.power(ada, 1, answers(day1.board).win);
    w.nextDay();
    const day2 = await w.game.init(ada, null);
    const { lose } = answers(day2.board);
    for (let i = 0; i < MAX_CHARGES; i++) await w.game.power(ada, 2, lose);
    const result = await w.game.result(ada, 2);
    expect(result.state.status).toBe('fused');
    expect(result.histogram).toEqual([0, 0, 0, 0, 0, 1]);
    expect(result.rank).toBeNull();
    expect(result.streak.current).toBe(0);
    expect(result.streak.best).toBe(1);
    expect(result.shareLine).toBe('Gatecrash #2 ⚡⚡⚡⚡⚡ fuse blown');
  });

  it('rejects illegal placements and unknown days', async () => {
    const w = world();
    const ada = caller('ada');
    const { board } = await w.game.init(ada, null);
    const bad = board.sockets.map(() => 'NAND');
    await expect(w.game.power(ada, 1, bad)).rejects.toBeInstanceOf(GameError);
    await expect(w.game.power(ada, 1, 'nope')).rejects.toMatchObject({ code: 'bad-placement' });
    await expect(w.game.init(ada, 2)).rejects.toMatchObject({ code: 'no-such-day' });
    await expect(w.game.init(ada, 0)).rejects.toMatchObject({ code: 'no-such-day' });
  });

  it('keeps two players independent and shows both in the histogram', async () => {
    const w = world();
    const ada = caller('ada');
    const bob = caller('bob');
    const { board } = await w.game.init(ada, null);
    const { win, lose } = answers(board);
    await w.game.power(ada, 1, win);
    w.clock.ms += 5000;
    await w.game.power(bob, 1, lose);
    await w.game.power(bob, 1, win);
    const result = await w.game.result(bob, 1);
    expect(result.histogram).toEqual([1, 1, 0, 0, 0, 0]);
    expect(result.players).toBe(2);
    expect(result.rank).toBe(2);
    expect(result.ranked).toBe(2);
    expect((await w.game.result(ada, 1)).beat).toBe(100);

    const board1 = await w.game.leaderboard(bob, 'day', 1);
    expect(board1).toMatchObject({ scope: 'day', rank: 2, total: 2 });
    if (board1.scope === 'day') {
      expect(board1.rows.map((r) => [r.name, r.charges, r.you])).toEqual([
        ['ada', 1, false],
        ['bob', 2, true],
      ]);
    }
  });
});

describe('streaks and the archive', () => {
  it('extends across days, ignores archive plays, drops lapsed runs', async () => {
    const w = world();
    const ada = caller('ada');
    const bob = caller('bob');
    const solveToday = async (who: typeof ada, day: number) => {
      const { board } = await w.game.init(who, day);
      return w.game.power(who, day, answers(board).win);
    };

    await solveToday(ada, 1);
    w.nextDay();
    await solveToday(ada, 2);
    await solveToday(bob, 2);
    // Bob catches up on yesterday's board from the archive: no streak credit.
    const late = await solveToday(bob, 1);
    expect(late.state.live).toBe(false);
    expect((await w.game.result(bob, 1)).rank).toBeNull();
    expect((await w.game.result(bob, 2)).streak.current).toBe(1);
    expect((await w.game.result(ada, 2)).streak.current).toBe(2);
    expect(w.reddit.flairs.get('ada')).toBe('Spark · 2');

    let top = await w.game.leaderboard(ada, 'streak', null);
    expect(top.scope === 'streak' && top.rows.map((r) => [r.name, r.streak])).toEqual([
      ['ada', 2],
      ['bob', 1],
    ]);

    const archive = await w.game.archive(bob);
    expect(archive.days.map((d) => [d.day, d.status, d.charges])).toEqual([
      [2, 'solved', 1],
      [1, 'solved', 1],
    ]);

    // Two days later nobody has played: every run has lapsed.
    w.nextDay();
    w.nextDay();
    expect((await w.game.init(ada, null)).streak.current).toBe(0);
    top = await w.game.leaderboard(ada, 'streak', null);
    expect(top.rows).toEqual([]);
  });
});

describe('sharing and joining', () => {
  it('posts the result line under the pinned thread, once', async () => {
    const w = world();
    const ada = caller('ada');
    await w.game.ensureDailyPost();
    const { board } = await w.game.init(ada, null);
    await expect(w.game.share(ada, 1)).rejects.toMatchObject({ code: 'not-finished' });
    await w.game.power(ada, 1, answers(board).win);
    expect((await w.game.result(ada, 1)).canShare).toBe(true);

    await w.game.share(ada, 1);
    await w.game.share(ada, 1);
    const replies = w.reddit.comments.filter((c) => c.as === 'user');
    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toBe('Gatecrash #1 ⚡▫▫▫▫ 0:00');
    expect(replies[0]?.parentId).toBe(w.reddit.comments[0]?.id);
    expect((await w.game.result(ada, 1)).shared).toBe(true);
  });

  it('cannot share a board that has no post', async () => {
    const w = world();
    const ada = caller('ada');
    const { board } = await w.game.init(ada, null);
    await w.game.power(ada, 1, answers(board).win);
    expect((await w.game.result(ada, 1)).canShare).toBe(false);
    await expect(w.game.share(ada, 1)).rejects.toMatchObject({ code: 'no-post' });
  });

  it('subscribes only when asked and remembers it', async () => {
    const w = world();
    const ada = caller('ada');
    expect((await w.game.result(ada, null)).joined).toBe(false);
    await w.game.join(ada);
    expect(w.reddit.subscribed).toBe(1);
    expect((await w.game.result(ada, null)).joined).toBe(true);
  });
});

describe('forgetting a player', () => {
  it('erases progress, streak, leaderboard places and flair, but not the day totals', async () => {
    const w = world();
    const ada = caller('ada');
    const bob = caller('bob');
    const { board } = await w.game.init(ada, null);
    await w.game.power(ada, 1, answers(board).win);
    await w.game.power(bob, 1, answers(board).win);
    expect((await w.game.leaderboard(bob, 'day', 1)).rows).toHaveLength(2);

    await w.game.forget(ada);
    const after = await w.game.init(ada, null);
    expect(after.state.status).toBe('new');
    expect(after.streak).toEqual({ current: 0, best: 0, tier: null });
    expect(w.reddit.flairs.get('ada')).toBe('');
    const day = await w.game.leaderboard(bob, 'day', 1);
    expect(day.rows.map((r) => r.name)).toEqual(['bob']);
    const streaks = await w.game.leaderboard(bob, 'streak', null);
    expect(streaks.rows.map((r) => r.name)).toEqual(['bob']);
    expect((await w.game.archive(ada)).days[0]?.status).toBe('new');
    expect((await w.game.result(bob, 1)).histogram).toEqual([2, 0, 0, 0, 0, 0]);
  });
});

describe('guests', () => {
  it('can load the board but not write', async () => {
    const w = world();
    const guest = caller(null);
    const init = await w.game.init(guest, null);
    expect(init.loggedIn).toBe(false);
    expect(init.board.sockets.length).toBeGreaterThan(0);
    await expect(w.game.start(guest, 1)).rejects.toMatchObject({ status: 401 });
    const result = await w.game.result(guest, 1);
    expect(result.canShare).toBe(false);
    expect((await w.game.archive(guest)).days).toHaveLength(1);
  });
});

describe('http', () => {
  it('maps routes, errors and platform hooks', async () => {
    const w = world();
    let who = caller('ada');
    const app = createApp(w.ports, () => who);
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await post('/internal/scheduler/daily-post', {})).status).toBe(200);
    expect(await (await post('/internal/menu/create-today', {})).json()).toEqual({
      navigateTo: 'https://reddit.example/post/t3_fake1',
    });
    expect((await post('/internal/triggers/on-app-install', {})).status).toBe(200);
    expect(w.reddit.posts).toHaveLength(1);

    const init = await (await app.request('/api/init')).json();
    expect(init.day).toBe(1);
    const splash = await (await app.request('/api/splash')).json();
    expect(splash).toMatchObject({ day: 1, status: 'new', difficulty: 'easy', loggedIn: true });

    expect((await post('/api/power', { placement: [] })).status).toBe(400);
    const bad = await post('/api/power', { day: 1, placement: ['AND'] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('bad-placement');
    expect((await app.request('/api/init?day=99')).status).toBe(404);

    const good = await post('/api/power', { day: 1, placement: answers(init.board).win });
    expect((await good.json()).state.status).toBe('solved');
    expect((await post('/api/share', { day: 1 })).status).toBe(200);
    expect((await app.request('/api/leaderboard?scope=streak')).status).toBe(200);
    expect((await app.request('/api/archive')).status).toBe(200);
    expect((await post('/api/tutorial-done', {})).status).toBe(200);

    who = caller(null);
    expect((await post('/api/start', { day: 1 })).status).toBe(401);
  });
});
