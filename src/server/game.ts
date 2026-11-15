import type {
  ArchiveResponse,
  InitResponse,
  JoinResponse,
  LeaderboardResponse,
  PowerResponse,
  ResultResponse,
  ShareResponse,
  SplashResponse,
  StartResponse,
  StreakView,
} from '../shared/api';
import {
  dayIndexOf,
  dayNumber,
  difficultyFor,
  msUntilNextDay,
  utcDayIndex,
  weekdayName,
} from '../shared/day';
import { generate } from '../shared/generate';
import {
  beatPercent,
  rankScore,
  secondsTaken,
  shareLine,
  splitRankScore,
} from '../shared/score';
import { simulate, validatePlacement } from '../shared/sim';
import { advanceStreak, flairText, tierFor, visibleStreak, type Streak } from '../shared/streak';
import {
  MAX_CHARGES,
  NEW_DAY_STATE,
  type Board,
  type DayState,
  type SolvedBoard,
} from '../shared/types';
import type { Caller, Ports } from './ports';
import { createStore } from './store';

/** An error the client caused or can act on. Anything else becomes a 500. */
export class GameError extends Error {
  readonly status: 400 | 401 | 404 | 409;
  readonly code: string;
  constructor(status: 400 | 401 | 404 | 409, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ARCHIVE_DAYS = 60;
const LEADERBOARD_ROWS = 10;
const CLAIM_STALE_MS = 2 * 60_000;

const isFinal = (state: DayState): boolean =>
  state.status === 'solved' || state.status === 'fused';

const publicBoard = (board: SolvedBoard): Board => ({
  day: board.day,
  date: board.date,
  difficulty: board.difficulty,
  inputs: board.inputs,
  sockets: board.sockets,
  bulbs: board.bulbs,
  tray: board.tray,
  target: board.target,
  probeRow: board.probeRow,
});

const publicState = (state: DayState): DayState => ({
  status: state.status,
  attempts: state.attempts,
  startedAt: state.startedAt,
  endedAt: state.endedAt,
  live: state.live,
});

export const postTitle = (day: number, dayIndex: number): string =>
  `Gatecrash #${day} — ${weekdayName(dayIndex)}${
    difficultyFor(dayIndex) === 'overclock' ? ' Overclock' : ''
  }`;

export const THREAD_TEXT =
  '**Results thread.** Finished this board? Tap *Share result* in the game and your line lands here as a reply. ' +
  'Please keep solutions behind spoiler tags.';

export const createGame = ({ redis, reddit, now }: Ports) => {
  const store = createStore(redis);

  const calendar = async () => {
    const todayIndex = utcDayIndex(now());
    const epoch = await store.ensureEpoch(todayIndex);
    return { epoch, todayIndex, today: Math.max(1, dayNumber(todayIndex, epoch)) };
  };

  const boardFor = async (day: number, epoch: number): Promise<SolvedBoard> => {
    const existing = await store.getBoard(day);
    if (existing) return existing;
    const salt = await store.ensureSalt(Math.random().toString(36).slice(2, 12));
    return store.saveBoard(generate({ day, dayIndex: dayIndexOf(day, epoch), salt }));
  };

  /** Which board a request is about: an explicit day, else the post's day, else today. */
  const resolveDay = async (
    caller: Caller,
    requested: number | null,
    today: number
  ): Promise<number> => {
    if (requested !== null) {
      if (!Number.isInteger(requested) || requested < 1 || requested > today) {
        throw new GameError(404, 'no-such-day', 'That board does not exist yet.');
      }
      return requested;
    }
    const fromPost = caller.postId ? await store.getDayForPost(caller.postId) : null;
    return fromPost !== null && fromPost >= 1 && fromPost <= today ? fromPost : today;
  };

  const requireUser = (caller: Caller): string => {
    if (!caller.userId) {
      throw new GameError(401, 'logged-out', 'Log in to save your progress.');
    }
    return caller.userId;
  };

  const streakView = (streak: Streak, today: number): StreakView => {
    const current = visibleStreak(streak, today);
    return { current, best: streak.best, tier: tierFor(current)?.name ?? null };
  };

  const begin = async (caller: Caller, day: number, today: number): Promise<DayState> => {
    const uid = requireUser(caller);
    const state = await store.getDayState(uid, day);
    if (state.status !== 'new') return publicState(state);
    if (caller.username) await store.rememberName(uid, caller.username);
    const started: DayState = {
      ...NEW_DAY_STATE,
      status: 'playing',
      startedAt: now(),
      live: day === today,
    };
    await store.saveDayState(uid, day, started);
    await store.addPlayer(day);
    return started;
  };

  /** Book-keeping when a board ends: histogram, streak, leaderboard, flair. */
  const finish = async (caller: Caller, uid: string, day: number, state: DayState) => {
    const solved = state.status === 'solved';
    await store.addResult(day, solved ? state.attempts.length - 1 : 5);
    if (!state.live) return;
    const streak = advanceStreak(await store.getStreak(uid), day, solved);
    await store.saveStreak(uid, streak);
    if (!solved) return;
    await store.addDayScore(day, uid, rankScore(state.attempts.length, secondsTaken(state)));
    if (caller.username) {
      try {
        await reddit.setUserFlair(caller.username, flairText(streak.current));
      } catch (error) {
        // Flair is a nicety: needs mod rights the app may not have in every community.
        console.warn('flair update failed', error);
      }
    }
  };

  return {
    store,

    async init(caller: Caller, requested: number | null): Promise<InitResponse> {
      const { epoch, today } = await calendar();
      const day = await resolveDay(caller, requested, today);
      const board = await boardFor(day, epoch);
      const uid = caller.userId;
      const [state, streak, flags] = uid
        ? await Promise.all([
            store.getDayState(uid, day),
            store.getStreak(uid),
            store.getFlags(uid),
          ])
        : [NEW_DAY_STATE, null, { tutorial: false, joined: false }];
      if (uid && caller.username) await store.rememberName(uid, caller.username);
      return {
        day,
        today,
        dayIndex: dayIndexOf(day, epoch),
        board: publicBoard(board),
        state: publicState(state),
        streak: streak ? streakView(streak, today) : { current: 0, best: 0, tier: null },
        username: caller.username,
        loggedIn: uid !== null,
        tutorialDone: flags.tutorial,
        subreddit: caller.subreddit,
        nextInMs: msUntilNextDay(now()),
        now: now(),
      };
    },

    /** The little the inline post needs, in one cheap call. */
    async splash(caller: Caller): Promise<SplashResponse> {
      const { epoch, today } = await calendar();
      const day = await resolveDay(caller, null, today);
      const dayIndex = dayIndexOf(day, epoch);
      const uid = caller.userId;
      const [state, streak] = uid
        ? await Promise.all([store.getDayState(uid, day), store.getStreak(uid)])
        : [NEW_DAY_STATE, null];
      return {
        day,
        dayIndex,
        difficulty: difficultyFor(dayIndex),
        status: state.status,
        charges: state.attempts.length,
        seconds: secondsTaken(state),
        streak: streak ? visibleStreak(streak, today) : 0,
        loggedIn: uid !== null,
      };
    },

    async start(caller: Caller, requested: number): Promise<StartResponse> {
      requireUser(caller);
      const { today } = await calendar();
      const day = await resolveDay(caller, requested, today);
      return { state: await begin(caller, day, today) };
    },

    async power(caller: Caller, requested: number, placement: unknown): Promise<PowerResponse> {
      const uid = requireUser(caller);
      const { epoch, today } = await calendar();
      const day = await resolveDay(caller, requested, today);
      const board = await boardFor(day, epoch);
      const before = await begin(caller, day, today);
      if (isFinal(before)) {
        throw new GameError(409, 'finished', 'This board is already finished.');
      }
      if (!Array.isArray(placement) || !validatePlacement(board, placement)) {
        throw new GameError(400, 'bad-placement', 'Those chips do not fit this board.');
      }
      const rows = simulate(board, placement);
      const attempts = [...before.attempts, placement];
      const solved = rows.every((row) => row.ok);
      const out = !solved && attempts.length >= MAX_CHARGES;
      const state: DayState = {
        ...before,
        attempts,
        status: solved ? 'solved' : out ? 'fused' : 'playing',
        endedAt: solved || out ? now() : null,
      };
      await store.saveDayState(uid, day, state);
      if (isFinal(state)) await finish(caller, uid, day, state);
      return { rows, chargesLeft: MAX_CHARGES - attempts.length, state };
    },

    async result(caller: Caller, requested: number | null): Promise<ResultResponse> {
      const { today } = await calendar();
      const day = await resolveDay(caller, requested, today);
      const uid = caller.userId;
      const [state, stats, streak, flags, post, place] = await Promise.all([
        uid ? store.getDayState(uid, day) : { ...NEW_DAY_STATE, shared: false },
        store.getStats(day),
        uid ? store.getStreak(uid) : null,
        uid ? store.getFlags(uid) : { tutorial: false, joined: false },
        store.getPost(day),
        uid ? store.getDayRank(day, uid) : { rank: null, total: 0 },
      ]);
      const view = streak ? streakView(streak, today) : { current: 0, best: 0, tier: null };
      const bucket = state.status === 'solved' ? state.attempts.length - 1 : 5;
      return {
        day,
        state: publicState(state),
        histogram: stats.histogram,
        players: stats.players,
        rank: place.rank,
        ranked: place.total,
        beat: isFinal(state) ? beatPercent(stats.histogram, bucket) : 0,
        streak: view,
        shareLine: shareLine(day, state, state.live ? view.current : 0),
        shared: state.shared,
        canShare: uid !== null && isFinal(state) && post !== null,
        joined: flags.joined,
      };
    },

    /** Post the player's result line under the pinned results comment. Explicit tap only. */
    async share(caller: Caller, requested: number): Promise<ShareResponse> {
      const uid = requireUser(caller);
      const { today } = await calendar();
      const day = await resolveDay(caller, requested, today);
      const state = await store.getDayState(uid, day);
      if (!isFinal(state)) {
        throw new GameError(409, 'not-finished', 'Finish the board before sharing.');
      }
      const post = await store.getPost(day);
      if (!post) throw new GameError(404, 'no-post', 'This board has no thread to share to.');
      if (state.shared) return { shared: true, url: reddit.postUrl(post.postId) };
      let threadId = post.threadId;
      if (!threadId) {
        threadId = await reddit.createResultsThread(post.postId, THREAD_TEXT);
        await store.setThread(day, threadId);
      }
      const streak = state.live ? visibleStreak(await store.getStreak(uid), today) : 0;
      const { url } = await reddit.replyAsUser(threadId, shareLine(day, state, streak));
      await store.markShared(uid, day);
      return { shared: true, url: url ?? reddit.postUrl(post.postId) };
    },

    async join(caller: Caller): Promise<JoinResponse> {
      const uid = requireUser(caller);
      await reddit.subscribeCurrentUser();
      await store.setFlag(uid, 'joined');
      return { joined: true };
    },

    /** Delete everything stored about the caller, and clear the flair the game set. */
    async forget(caller: Caller): Promise<{ ok: true }> {
      const uid = requireUser(caller);
      await store.forgetUser(uid);
      if (caller.username) {
        try {
          await reddit.setUserFlair(caller.username, '');
        } catch (error) {
          console.warn('flair reset failed', error);
        }
      }
      return { ok: true };
    },

    async tutorialDone(caller: Caller): Promise<{ ok: true }> {
      if (caller.userId) await store.setFlag(caller.userId, 'tutorial');
      return { ok: true };
    },

    async archive(caller: Caller): Promise<ArchiveResponse> {
      const { epoch, today } = await calendar();
      const mine = caller.userId ? await store.getSummaries(caller.userId) : new Map();
      const days: ArchiveResponse['days'] = [];
      for (let day = today; day >= Math.max(1, today - ARCHIVE_DAYS + 1); day--) {
        const dayIndex = dayIndexOf(day, epoch);
        const summary = mine.get(day);
        days.push({
          day,
          dayIndex,
          difficulty: difficultyFor(dayIndex),
          status: summary?.status ?? 'new',
          charges: summary?.charges ?? 0,
        });
      }
      return { today, days };
    },

    async leaderboard(
      caller: Caller,
      scope: 'day' | 'streak',
      requested: number | null
    ): Promise<LeaderboardResponse> {
      const { today } = await calendar();
      const uid = caller.userId;
      if (scope === 'streak') {
        const [top, total] = await Promise.all([
          store.topStreaks(today, LEADERBOARD_ROWS),
          store.countStreaks(),
        ]);
        const names = await store.getNames(top.map((r) => r.uid));
        return {
          scope,
          total,
          rows: top.map((row, i) => ({
            name: names[i] ?? 'someone',
            streak: row.streak,
            you: row.uid === uid,
          })),
        };
      }
      const day = await resolveDay(caller, requested, today);
      const [top, place] = await Promise.all([
        store.topDayScores(day, LEADERBOARD_ROWS),
        uid ? store.getDayRank(day, uid) : store.getDayRank(day, ''),
      ]);
      const names = await store.getNames(top.map((r) => r.uid));
      return {
        scope,
        day,
        rank: place.rank,
        total: place.total,
        rows: top.map((row, i) => ({
          name: names[i] ?? 'someone',
          ...splitRankScore(row.score),
          you: row.uid === uid,
        })),
      };
    },

    /**
     * Make sure today's board has a post. Safe to call from the scheduler, the
     * install trigger and the moderator menu at the same time.
     */
    async ensureDailyPost(): Promise<{ day: number; postId: string | null; created: boolean }> {
      const { epoch, today, todayIndex } = await calendar();
      await boardFor(today, epoch);
      const existing = await store.getPost(today);
      if (existing) return { day: today, postId: existing.postId, created: false };
      if (!(await store.claimPostCreation(today, now(), CLAIM_STALE_MS))) {
        return { day: today, postId: null, created: false };
      }
      const { postId } = await reddit.createDailyPost({
        title: postTitle(today, todayIndex),
        day: today,
        dayIndex: todayIndex,
        fallback:
          `Gatecrash #${today} is a daily circuit puzzle: drop the right chips into the board so the bulbs match the test card. ` +
          'Open this post in the Reddit app or on new Reddit to play.',
      });
      await store.linkPost(today, postId);
      if ((await store.getLatestDay()) < today) await store.setLatestDay(today);
      try {
        await store.setThread(today, await reddit.createResultsThread(postId, THREAD_TEXT));
      } catch (error) {
        // The thread is recreated on the first share if this fails.
        console.warn('results thread failed', error);
      }
      return { day: today, postId, created: true };
    },
  };
};

export type Game = ReturnType<typeof createGame>;
