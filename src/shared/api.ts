import type { Difficulty } from './types';
import type { Board, DayState, FullPlacement, GameStatus, RowResult } from './types';
import type { Histogram } from './score';

export type StreakView = {
  /** Run still alive today (0 if it lapsed). */
  current: number;
  best: number;
  /** Flair tier name for the current run, or null. */
  tier: string | null;
};

export type InitResponse = {
  /** The board being played. */
  day: number;
  /** The newest board. `day < today` means an archive board. */
  today: number;
  /** UTC day index of `day`, for showing its date. */
  dayIndex: number;
  board: Board;
  state: DayState;
  streak: StreakView;
  username: string | null;
  loggedIn: boolean;
  tutorialDone: boolean;
  subreddit: string | null;
  /** Milliseconds until the next board. */
  nextInMs: number;
  /** Server clock, so the client can run a timer from `state.startedAt`. */
  now: number;
};

export type SplashResponse = {
  day: number;
  dayIndex: number;
  difficulty: Difficulty;
  status: GameStatus;
  charges: number;
  seconds: number;
  streak: number;
  loggedIn: boolean;
};

export type StartRequest = { day: number };
export type StartResponse = { state: DayState };

export type PowerRequest = { day: number; placement: FullPlacement };
export type PowerResponse = {
  rows: RowResult[];
  chargesLeft: number;
  state: DayState;
};

export type ResultResponse = {
  day: number;
  state: DayState;
  histogram: Histogram;
  /** How many people have opened this board. */
  players: number;
  /** 1-based place on the day's leaderboard, or null (archive play, fuse, guest). */
  rank: number | null;
  ranked: number;
  /** Share of finished players this result beat, 0-100. */
  beat: number;
  streak: StreakView;
  shareLine: string;
  shared: boolean;
  /** False when the day has no post to comment on, or the player is logged out. */
  canShare: boolean;
  joined: boolean;
};

export type ShareRequest = { day: number };
export type ShareResponse = { shared: true; url: string | null };
export type JoinResponse = { joined: true };

export type ArchiveDay = {
  day: number;
  dayIndex: number;
  difficulty: Difficulty;
  status: GameStatus;
  charges: number;
};
export type ArchiveResponse = { today: number; days: ArchiveDay[] };

export type DayLeader = {
  name: string;
  charges: number;
  seconds: number;
  you: boolean;
};
export type StreakLeader = { name: string; streak: number; you: boolean };
export type LeaderboardResponse =
  | { scope: 'day'; day: number; rows: DayLeader[]; rank: number | null; total: number }
  | { scope: 'streak'; rows: StreakLeader[]; total: number };

export type ErrorResponse = { error: string; message: string };
