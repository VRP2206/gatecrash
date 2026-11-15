import type {
  EndlessLeaderboardResponse,
  EndlessPowerResponse,
  EndlessView,
} from '../shared/api';
import { MS_PER_DAY, utcDayIndex } from '../shared/day';
import {
  endlessScore,
  gainedToday,
  generateEndless,
  powerRun,
  rollRun,
  viewOf,
  weekStartDay,
  type EndlessRun,
} from '../shared/endless';
import { validatePlacement } from '../shared/sim';
import { GameError } from './game';
import type { Caller, Ports } from './ports';
import { createStore, type EndlessBoard } from './store';

const LEADERBOARD_ROWS = 10;

/** Endless mode: a weekly climb with its own daily and weekly leaderboards. */
export const createEndless = ({ redis, now }: Ports) => {
  const store = createStore(redis);

  const requireUser = (caller: Caller): string => {
    if (!caller.userId) throw new GameError(401, 'logged-out', 'Log in to save your climb.');
    return caller.userId;
  };

  const salt = () => store.ensureSalt(Math.random().toString(36).slice(2, 12));

  const boardFor = async (run: EndlessRun) =>
    generateEndless({ week: run.week, level: run.level, retry: run.fuses, salt: await salt() });

  /** The caller's run, rolled over to this week and day. */
  const current = async (uid: string): Promise<EndlessRun> =>
    rollRun(await store.getEndless(uid), utcDayIndex(now()));

  const boards = (run: EndlessRun): { week: EndlessBoard; day: EndlessBoard } => ({
    week: { kind: 'w', index: run.week },
    day: { kind: 'd', index: run.dayIndex },
  });

  return {
    async view(caller: Caller): Promise<EndlessView> {
      const uid = requireUser(caller);
      const run = await current(uid);
      return viewOf(run, await boardFor(run), now());
    },

    async power(caller: Caller, level: number, placement: unknown): Promise<EndlessPowerResponse> {
      const uid = requireUser(caller);
      const before = await current(uid);
      if (level !== before.level) {
        throw new GameError(409, 'moved-on', 'Your climb has moved on. Reload to catch up.');
      }
      const board = await boardFor(before);
      if (!Array.isArray(placement) || !validatePlacement(board, placement)) {
        throw new GameError(400, 'bad-placement', 'Those chips do not fit this board.');
      }
      const { run, rows, outcome } = powerRun(before, board, placement);
      await store.saveEndless(uid, run);
      if (outcome === 'cleared' && run.best > before.best) {
        if (caller.username) await store.rememberName(uid, caller.username);
        const at = now();
        const { week, day } = boards(run);
        await store.setEndlessScore(
          week,
          uid,
          endlessScore(run.best, at, weekStartDay(run.week) * MS_PER_DAY, 7 * MS_PER_DAY)
        );
        await store.setEndlessScore(
          day,
          uid,
          endlessScore(gainedToday(run), at, run.dayIndex * MS_PER_DAY, MS_PER_DAY)
        );
      }
      return { rows, outcome, view: viewOf(run, await boardFor(run), now()) };
    },

    async leaderboard(caller: Caller, scope: 'day' | 'week'): Promise<EndlessLeaderboardResponse> {
      const dayIndex = utcDayIndex(now());
      const board = boards(rollRun(null, dayIndex))[scope];
      const uid = caller.userId;
      const [top, place] = await Promise.all([
        store.topEndless(board, LEADERBOARD_ROWS),
        store.getEndlessRank(board, uid ?? ''),
      ]);
      const names = await store.getNames(top.map((r) => r.uid));
      return {
        scope,
        rank: place.rank,
        total: place.total,
        rows: top.map((row, i) => ({
          name: names[i] ?? 'someone',
          levels: Math.floor(row.score),
          you: row.uid === uid,
        })),
      };
    },

    /** Local harness only: put a player at a level, as if they had climbed there. */
    async jump(caller: Caller, level: number): Promise<EndlessView> {
      const uid = requireUser(caller);
      const run = await current(uid);
      const next = { ...run, level, burned: 0, attempts: [], best: Math.max(run.best, level - 1) };
      await store.saveEndless(uid, { ...next, record: Math.max(next.record, next.best) });
      return viewOf(next, await boardFor(next), now());
    },
  };
};

export type Endless = ReturnType<typeof createEndless>;
