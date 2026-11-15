import { emptyHistogram, type Histogram } from '../shared/score';
import { NO_STREAK, type Streak } from '../shared/streak';
import {
  CHIP_TYPES,
  NEW_DAY_STATE,
  type ChipType,
  type DayState,
  type FullPlacement,
  type GameStatus,
  type SolvedBoard,
} from '../shared/types';
import type { RedisLike } from './ports';

/*
 * Every Redis read and write in Gatecrash lives in this file.
 *
 *   meta                      hash: epoch (UTC day index of day 1), salt, latestDay
 *   board:{day}               JSON SolvedBoard, written once and never changed
 *   post:{day}                hash: postId, threadId (the pinned results comment), claim
 *   day:{postId}              day number for a post
 *   u:{uid}:d:{day}           hash: status, attempts, startedAt, endedAt, live, shared
 *   u:{uid}:days              hash: day -> "<status>:<charges>" (one read for the archive)
 *   u:{uid}:streak            hash: current, best, lastSolvedDay
 *   u:{uid}:flags             hash: tutorial, joined
 *   stats:{day}               hash: c1..c5, fused, players
 *   lb:{day}                  zset: score = charges*100000 + seconds, member = uid
 *   lb:streak                 zset: score = current streak, member = uid
 *   streak:last               hash: uid -> last solved day (to drop lapsed runs from lb:streak)
 *   names                     hash: uid -> username
 */

const num = (value: string | undefined | null, fallback = 0): number => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const STATUSES: readonly GameStatus[] = ['new', 'playing', 'solved', 'fused'];
const asStatus = (value: string | undefined): GameStatus =>
  STATUSES.find((s) => s === value) ?? 'new';

const asChip = (value: unknown): ChipType | null =>
  CHIP_TYPES.find((c) => c === value) ?? null;

const parseAttempts = (raw: string | undefined): FullPlacement[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const attempts: FullPlacement[] = [];
    for (const entry of parsed) {
      if (!Array.isArray(entry)) return [];
      const chips: ChipType[] = [];
      for (const item of entry) {
        const chip = asChip(item);
        if (!chip) return [];
        chips.push(chip);
      }
      attempts.push(chips);
    }
    return attempts;
  } catch {
    return [];
  }
};

export type DaySummary = { status: GameStatus; charges: number };
export type PostLink = { postId: string; threadId: string | null };

export const createStore = (redis: RedisLike) => {
  const dayKey = (uid: string, day: number): string => `u:${uid}:d:${day}`;

  return {
    // --- installation ---------------------------------------------------
    async getEpoch(): Promise<number | null> {
      const raw = await redis.hGet('meta', 'epoch');
      return raw === undefined ? null : num(raw);
    },
    /** Set day 1's date once; later calls keep the first value. Returns the epoch in force. */
    async ensureEpoch(dayIndex: number): Promise<number> {
      await redis.hSetNX('meta', 'epoch', String(dayIndex));
      return num(await redis.hGet('meta', 'epoch'), dayIndex);
    },
    async ensureSalt(candidate: string): Promise<string> {
      await redis.hSetNX('meta', 'salt', candidate);
      return (await redis.hGet('meta', 'salt')) ?? candidate;
    },
    async getLatestDay(): Promise<number> {
      return num(await redis.hGet('meta', 'latestDay'));
    },
    async setLatestDay(day: number): Promise<void> {
      await redis.hSet('meta', { latestDay: String(day) });
    },

    // --- boards and posts -----------------------------------------------
    async getBoard(day: number): Promise<SolvedBoard | null> {
      const raw = await redis.get(`board:${day}`);
      if (!raw) return null;
      // Boards are only ever written by saveBoard below.
      const board: SolvedBoard = JSON.parse(raw);
      return board;
    },
    /** Store a board unless one exists already; returns the board in force. */
    async saveBoard(board: SolvedBoard): Promise<SolvedBoard> {
      await redis.set(`board:${board.day}`, JSON.stringify(board), { nx: true });
      const raw = await redis.get(`board:${board.day}`);
      if (!raw) return board;
      const stored: SolvedBoard = JSON.parse(raw);
      return stored;
    },
    async getPost(day: number): Promise<PostLink | null> {
      const hash = await redis.hGetAll(`post:${day}`);
      if (!hash.postId) return null;
      return { postId: hash.postId, threadId: hash.threadId || null };
    },
    /**
     * Take the right to create the day's post, so the scheduler, the install
     * trigger and the menu item cannot each make one. A claim that never
     * produced a post expires after `staleMs` and can be taken again.
     */
    async claimPostCreation(day: number, now: number, staleMs: number): Promise<boolean> {
      const key = `post:${day}`;
      if ((await redis.hSetNX(key, 'claim', String(now))) === 1) return true;
      const hash = await redis.hGetAll(key);
      if (hash.postId || now - num(hash.claim) < staleMs) return false;
      await redis.hSet(key, { claim: String(now) });
      return true;
    },
    async linkPost(day: number, postId: string): Promise<void> {
      await redis.hSet(`post:${day}`, { postId });
      await redis.set(`day:${postId}`, String(day));
    },
    async setThread(day: number, threadId: string): Promise<void> {
      await redis.hSet(`post:${day}`, { threadId });
    },
    async getDayForPost(postId: string): Promise<number | null> {
      const raw = await redis.get(`day:${postId}`);
      return raw === undefined ? null : num(raw);
    },

    // --- one player, one day --------------------------------------------
    async getDayState(uid: string, day: number): Promise<DayState & { shared: boolean }> {
      const hash = await redis.hGetAll(dayKey(uid, day));
      if (!hash.status) return { ...NEW_DAY_STATE, shared: false };
      return {
        status: asStatus(hash.status),
        attempts: parseAttempts(hash.attempts),
        startedAt: hash.startedAt ? num(hash.startedAt) : null,
        endedAt: hash.endedAt ? num(hash.endedAt) : null,
        live: hash.live === '1',
        shared: hash.shared === '1',
      };
    },
    async saveDayState(uid: string, day: number, state: DayState): Promise<void> {
      await redis.hSet(dayKey(uid, day), {
        status: state.status,
        attempts: JSON.stringify(state.attempts),
        startedAt: state.startedAt === null ? '' : String(state.startedAt),
        endedAt: state.endedAt === null ? '' : String(state.endedAt),
        live: state.live ? '1' : '0',
      });
      await redis.hSet(`u:${uid}:days`, {
        [String(day)]: `${state.status}:${state.attempts.length}`,
      });
    },
    async markShared(uid: string, day: number): Promise<void> {
      await redis.hSet(dayKey(uid, day), { shared: '1' });
    },
    async getSummaries(uid: string): Promise<Map<number, DaySummary>> {
      const hash = await redis.hGetAll(`u:${uid}:days`);
      const out = new Map<number, DaySummary>();
      for (const [day, value] of Object.entries(hash)) {
        const [status, charges] = value.split(':');
        out.set(num(day), { status: asStatus(status), charges: num(charges) });
      }
      return out;
    },

    // --- streaks ----------------------------------------------------------
    async getStreak(uid: string): Promise<Streak> {
      const hash = await redis.hGetAll(`u:${uid}:streak`);
      if (!hash.current) return NO_STREAK;
      return {
        current: num(hash.current),
        best: num(hash.best),
        lastSolvedDay: num(hash.lastSolvedDay),
      };
    },
    async saveStreak(uid: string, streak: Streak): Promise<void> {
      await redis.hSet(`u:${uid}:streak`, {
        current: String(streak.current),
        best: String(streak.best),
        lastSolvedDay: String(streak.lastSolvedDay),
      });
      if (streak.current > 0) {
        await redis.zAdd('lb:streak', { member: uid, score: streak.current });
        await redis.hSet('streak:last', { [uid]: String(streak.lastSolvedDay) });
      } else {
        await redis.zRem('lb:streak', [uid]);
      }
    },
    /** Longest live runs, best first. Lapsed runs are pruned as they are found. */
    async topStreaks(today: number, limit: number): Promise<{ uid: string; streak: number }[]> {
      const rows = await redis.zRange('lb:streak', 0, limit * 3 - 1, {
        by: 'rank',
        reverse: true,
      });
      if (rows.length === 0) return [];
      const last = await redis.hMGet(
        'streak:last',
        rows.map((r) => r.member)
      );
      const alive: { uid: string; streak: number }[] = [];
      const lapsed: string[] = [];
      rows.forEach((row, i) => {
        if (num(last[i]) >= today - 1) alive.push({ uid: row.member, streak: row.score });
        else lapsed.push(row.member);
      });
      if (lapsed.length > 0) await redis.zRem('lb:streak', lapsed);
      return alive.slice(0, limit);
    },
    async countStreaks(): Promise<number> {
      return redis.zCard('lb:streak');
    },

    // --- per-day stats ------------------------------------------------------
    async addPlayer(day: number): Promise<void> {
      await redis.hIncrBy(`stats:${day}`, 'players', 1);
    },
    /** `bucket` 0-4 = solved in 1-5 charges, 5 = blew the fuse. */
    async addResult(day: number, bucket: number): Promise<void> {
      await redis.hIncrBy(`stats:${day}`, bucket >= 5 ? 'fused' : `c${bucket + 1}`, 1);
    },
    async getStats(day: number): Promise<{ histogram: Histogram; players: number }> {
      const hash = await redis.hGetAll(`stats:${day}`);
      const histogram = emptyHistogram();
      for (let i = 0; i < 5; i++) histogram[i] = num(hash[`c${i + 1}`]);
      histogram[5] = num(hash.fused);
      return { histogram, players: num(hash.players) };
    },
    async addDayScore(day: number, uid: string, score: number): Promise<void> {
      await redis.zAdd(`lb:${day}`, { member: uid, score });
    },
    async getDayRank(day: number, uid: string): Promise<{ rank: number | null; total: number }> {
      const [rank, total] = await Promise.all([
        redis.zRank(`lb:${day}`, uid),
        redis.zCard(`lb:${day}`),
      ]);
      return { rank: rank === undefined ? null : rank + 1, total };
    },
    async topDayScores(day: number, limit: number): Promise<{ uid: string; score: number }[]> {
      const rows = await redis.zRange(`lb:${day}`, 0, limit - 1, { by: 'rank' });
      return rows.map((r) => ({ uid: r.member, score: r.score }));
    },

    // --- people -------------------------------------------------------------
    async rememberName(uid: string, name: string): Promise<void> {
      await redis.hSet('names', { [uid]: name });
    },
    async getNames(uids: string[]): Promise<(string | null)[]> {
      if (uids.length === 0) return [];
      return redis.hMGet('names', uids);
    },
    async getFlags(uid: string): Promise<{ tutorial: boolean; joined: boolean }> {
      const hash = await redis.hGetAll(`u:${uid}:flags`);
      return { tutorial: hash.tutorial === '1', joined: hash.joined === '1' };
    },
    async setFlag(uid: string, flag: 'tutorial' | 'joined'): Promise<void> {
      await redis.hSet(`u:${uid}:flags`, { [flag]: '1' });
    },
  };
};

export type Store = ReturnType<typeof createStore>;
