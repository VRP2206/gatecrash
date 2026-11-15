import { MAX_CHARGES, type DayState } from './types';

/** m:ss, capped at 99:59. */
export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.min(Math.floor(seconds), 99 * 60 + 59));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const secondsTaken = (state: Pick<DayState, 'startedAt' | 'endedAt'>): number =>
  state.startedAt !== null && state.endedAt !== null
    ? Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000))
    : 0;

/** Leaderboard key: fewest charges first, then fastest. Lower is better. */
export const rankScore = (charges: number, seconds: number): number =>
  charges * 100_000 + Math.min(Math.max(0, Math.floor(seconds)), 99_999);

export const splitRankScore = (score: number): { charges: number; seconds: number } => ({
  charges: Math.floor(score / 100_000),
  seconds: score % 100_000,
});

/**
 * Spoiler-free result line for the comment thread,
 * e.g. `Gatecrash #12 ⚡⚡▫▫▫ 0:48`.
 */
export const shareLine = (
  day: number,
  state: Pick<DayState, 'status' | 'attempts' | 'startedAt' | 'endedAt'>,
  streak = 0
): string => {
  const used = state.attempts.length;
  const meter = '⚡'.repeat(used) + '▫'.repeat(Math.max(0, MAX_CHARGES - used));
  const head = `Gatecrash #${day}`;
  const tail = streak >= 2 ? ` · streak ${streak}` : '';
  if (state.status === 'solved') {
    return `${head} ${meter} ${formatTime(secondsTaken(state))}${tail}`;
  }
  return `${head} ${'⚡'.repeat(MAX_CHARGES)} fuse blown`;
};

/** Histogram buckets: index 0-4 = solved in 1-5 charges, index 5 = blew the fuse. */
export type Histogram = [number, number, number, number, number, number];

export const emptyHistogram = (): Histogram => [0, 0, 0, 0, 0, 0];

export const histogramTotal = (h: Histogram): number =>
  h.reduce((a, b) => a + b, 0);

/**
 * Share of finished players this result beat outright (0-100).
 * `bucket` is 0-4 for a solve in 1-5 charges, 5 for a blown fuse.
 */
export const beatPercent = (h: Histogram, bucket: number): number => {
  const total = histogramTotal(h);
  if (total <= 1) return 0;
  let worse = 0;
  for (let i = bucket + 1; i < h.length; i++) worse += h[i] ?? 0;
  return Math.round((worse / (total - 1)) * 100);
};
