import { isSolved } from '../shared/sim';
import {
  MAX_CHARGES,
  NEW_DAY_STATE,
  type Board,
  type DayState,
  type FullPlacement,
  type Level,
} from '../shared/types';
import { api } from './api';

/** Where a game's progress is kept: on the server, or only in this browser. */
export type Session = {
  kind: 'remote' | 'local';
  start(): Promise<DayState>;
  power(placement: FullPlacement): Promise<DayState>;
};

export const remoteSession = (day: number, level: Level): Session => ({
  kind: 'remote',
  start: async () => (await api.start(day, level)).state,
  power: async (placement) => (await api.power(day, level, placement)).state,
});

const read = (key: string): DayState | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const state: DayState = JSON.parse(raw);
    return Array.isArray(state.attempts) ? state : null;
  } catch {
    return null;
  }
};

const write = (key: string, state: DayState): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // private mode or full storage: the game still works for this visit
  }
};

export const guestKey = (day: number, level: Level): string =>
  `gatecrash:guest:${day}:${level}`;

export const readGuestState = (day: number, level: Level): DayState =>
  read(guestKey(day, level)) ?? NEW_DAY_STATE;

/**
 * Same rules as the server, kept in the browser. Used for logged-out players
 * (saved to localStorage) and for the practice board (not saved at all).
 */
export const localSession = (board: Board, storageKey: string | null): Session => {
  let state: DayState = (storageKey && read(storageKey)) || NEW_DAY_STATE;
  const save = (next: DayState): DayState => {
    state = next;
    if (storageKey) write(storageKey, next);
    return next;
  };
  return {
    kind: 'local',
    async start() {
      if (state.status !== 'new') return state;
      return save({ ...state, status: 'playing', startedAt: Date.now() });
    },
    async power(placement) {
      if (state.status === 'solved' || state.status === 'fused') return state;
      const attempts = [...state.attempts, placement];
      const solved = isSolved(board, placement);
      const out = !solved && attempts.length >= MAX_CHARGES;
      return save({
        ...state,
        attempts,
        status: solved ? 'solved' : out ? 'fused' : 'playing',
        startedAt: state.startedAt ?? Date.now(),
        endedAt: solved || out ? Date.now() : null,
      });
    },
  };
};
