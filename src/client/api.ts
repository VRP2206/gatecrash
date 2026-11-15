import type {
  ArchiveResponse,
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
import type { FullPlacement } from '../shared/types';

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

const withDay = (path: string, day: number | null): string =>
  day === null ? path : `${path}${path.includes('?') ? '&' : '?'}day=${day}`;

export const api = {
  init: (day: number | null) => call<InitResponse>(withDay('/api/init', day)),
  splash: () => call<SplashResponse>('/api/splash'),
  start: (day: number) => call<StartResponse>('/api/start', { day }),
  power: (day: number, placement: FullPlacement) =>
    call<PowerResponse>('/api/power', { day, placement }),
  result: (day: number) => call<ResultResponse>(withDay('/api/result', day)),
  share: (day: number) => call<ShareResponse>('/api/share', { day }),
  join: () => call<JoinResponse>('/api/join', {}),
  tutorialDone: () => call<{ ok: true }>('/api/tutorial-done', {}),
  archive: () => call<ArchiveResponse>('/api/archive'),
  leaderboard: (scope: 'day' | 'streak', day: number | null) =>
    call<LeaderboardResponse>(withDay(`/api/leaderboard?scope=${scope}`, day)),
};

export const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : OFFLINE;
