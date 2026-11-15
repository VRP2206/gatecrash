import type { EndlessPowerResponse, EndlessView } from '../shared/api';
import { utcDayIndex } from '../shared/day';
import { generateEndless, powerRun, rollRun, viewOf, type EndlessRun } from '../shared/endless';
import { NEW_DAY_STATE, type DayState, type FullPlacement } from '../shared/types';
import { api } from './api';
import type { Session } from './session';

/** Where an endless climb is kept: on the server, or only in this browser. */
export type EndlessClient = {
  kind: 'remote' | 'local';
  load(): Promise<EndlessView>;
  power(level: number, placement: FullPlacement): Promise<EndlessPowerResponse>;
};

export const remoteEndless: EndlessClient = {
  kind: 'remote',
  load: api.endless,
  power: api.endlessPower,
};

const KEY = 'gatecrash:endless';

const read = (): EndlessRun | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const run: EndlessRun = JSON.parse(raw);
    return Number.isInteger(run.week) && Number.isInteger(run.level) && Array.isArray(run.attempts)
      ? run
      : null;
  } catch {
    return null;
  }
};

const write = (run: EndlessRun): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // private mode or full storage: the climb still works for this visit
  }
};

/** Same rules as the server, kept in the browser for logged-out players. No leaderboard. */
export const localEndless = (): EndlessClient => {
  let memory: EndlessRun | null = read();
  const current = (): EndlessRun => rollRun(memory, utcDayIndex(Date.now()));
  const boardFor = (run: EndlessRun) =>
    generateEndless({ week: run.week, level: run.level, retry: run.fuses });
  return {
    kind: 'local',
    async load() {
      const run = current();
      return viewOf(run, boardFor(run), Date.now());
    },
    async power(_level, placement) {
      const { run, rows, outcome } = powerRun(current(), boardFor(current()), placement);
      memory = run;
      write(run);
      return { rows, outcome, view: viewOf(run, boardFor(run), Date.now()) };
    },
  };
};

/**
 * One endless board dressed as a play-screen session. `onResult` hears where
 * each test leads: the same board, the next one, or the start of the stage.
 */
export const endlessSession = (
  client: EndlessClient,
  view: EndlessView,
  onResult: (next: EndlessView) => void
): Session => {
  let state: DayState = { ...NEW_DAY_STATE, status: 'playing', attempts: view.attempts };
  return {
    kind: client.kind,
    start: async () => state,
    power: async (placement) => {
      const result = await client.power(view.level, placement);
      onResult(result.view);
      state = {
        ...state,
        attempts: [...state.attempts, placement],
        status:
          result.outcome === 'cleared' ? 'solved' : result.outcome === 'fused' ? 'fused' : 'playing',
      };
      return state;
    },
  };
};
