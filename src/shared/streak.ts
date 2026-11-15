export type Streak = {
  current: number;
  best: number;
  /** Day number of the most recent live solve, or 0 if none. */
  lastSolvedDay: number;
};

export const NO_STREAK: Streak = { current: 0, best: 0, lastSolvedDay: 0 };

/**
 * Update a streak after solving any of the live boards for `day`.
 * Solving on the day after your last solve extends the run; a gap restarts it
 * at 1. A second solve on the same day changes nothing, and a blown fuse never
 * reaches this function: the run simply lapses if the day ends without a solve.
 */
export const advanceStreak = (streak: Streak, day: number): Streak => {
  if (day <= streak.lastSolvedDay) return streak;
  const current = streak.lastSolvedDay === day - 1 ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastSolvedDay: day };
};

/** The streak to show on `today`: a run only survives if it reached today or yesterday. */
export const visibleStreak = (streak: Streak, today: number): number =>
  streak.lastSolvedDay >= today - 1 ? streak.current : 0;

export type Tier = { name: string; from: number };

export const TIERS: readonly Tier[] = [
  { name: 'Spark', from: 1 },
  { name: 'Tinkerer', from: 3 },
  { name: 'Apprentice', from: 7 },
  { name: 'Technician', from: 14 },
  { name: 'Engineer', from: 30 },
  { name: 'Wizard', from: 60 },
];

export const tierFor = (streak: number): Tier | null => {
  let found: Tier | null = null;
  for (const tier of TIERS) if (streak >= tier.from) found = tier;
  return found;
};

/** User flair text for a streak, e.g. "Apprentice · 7". Empty when there is no streak. */
export const flairText = (streak: number): string => {
  const tier = tierFor(streak);
  return tier ? `${tier.name} · ${streak}` : '';
};
