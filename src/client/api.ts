import type {
  ArchiveResponse,
  EndlessLeaderboardResponse,
  EndlessPowerResponse,
  EndlessView,
  ErrorResponse,
  InitResponse,
  JoinResponse,
  LeaderboardResponse,
  PowerResponse,
  ResultResponse,
  ShareResponse,
  SplashResponse,
  StartResponse,
} from '../shared/api';
import type { FullPlacement, Level } from '../shared/types';

/** A failed request, with a message that is safe to show the player. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const OFFLINE = 'Could not reach the bench. Check your connection and try again.';

const call = async <T>(path: string, body?: unknown): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'offline', OFFLINE);
  }
  if (!res.ok) {
    let problem: Partial<ErrorResponse> = {};
    try {
      problem = await res.json();
    } catch {
      // not JSON: fall back to the generic message
    }
    throw new ApiError(res.status, problem.error ?? 'server', problem.message ?? OFFLINE);
  }
  const data: T = await res.json();
  return data;
};

const query = (path: string, params: Record<string, string | number | null>): string => {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
};

export const api = {
  init: (day: number | null, level: Level | null) =>
    call<InitResponse>(query('/api/init', { day, level })),
  splash: () => call<SplashResponse>('/api/splash'),
  start: (day: number, level: Level) => call<StartResponse>('/api/start', { day, level }),
  power: (day: number, level: Level, placement: FullPlacement) =>
    call<PowerResponse>('/api/power', { day, level, placement }),
  result: (day: number, level: Level) =>
    call<ResultResponse>(query('/api/result', { day, level })),
  share: (day: number, level: Level) => call<ShareResponse>('/api/share', { day, level }),
  join: () => call<JoinResponse>('/api/join', {}),
  forget: () => call<{ ok: true }>('/api/forget', {}),
  tutorialDone: () => call<{ ok: true }>('/api/tutorial-done', {}),
  archive: () => call<ArchiveResponse>('/api/archive'),
  leaderboard: (scope: 'day' | 'streak', day: number | null, level: Level) =>
    call<LeaderboardResponse>(query('/api/leaderboard', { scope, day, level })),
  endless: () => call<EndlessView>('/api/endless'),
  endlessPower: (level: number, placement: FullPlacement) =>
    call<EndlessPowerResponse>('/api/endless/power', { level, placement }),
  endlessLeaders: (scope: 'day' | 'week') =>
    call<EndlessLeaderboardResponse>(query('/api/endless/leaderboard', { scope })),
};

export const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : OFFLINE;
