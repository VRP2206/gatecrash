import { useMemo } from 'react';
import { telemetry } from '@devvit/analytics/client/reddit';

/*
 * Devvit Journeys: start on the first chip placed, progress on every Power,
 * end when the board is solved or the fuse blows. Telemetry must never break
 * the game, so every call swallows its own failures. Until the app is
 * allowlisted the server answers with a "denied" receipt and nothing is recorded.
 */
export type Journey = {
  ready(): void;
  start(): void;
  progress(fraction: number, action: string): void;
  end(win: boolean, score: number): void;
};

const quiet = (run: () => Promise<unknown>): void => {
  try {
    run().catch(() => undefined);
  } catch {
    // ignored on purpose
  }
};

const SILENT: Journey = {
  ready: () => undefined,
  start: () => undefined,
  progress: () => undefined,
  end: () => undefined,
};

export const useJourney = (enabled: boolean): Journey =>
  useMemo(() => {
    if (!enabled) return SILENT;
    let started = false;
    let ended = false;
    return {
      ready: () => quiet(() => telemetry.appReady()),
      start: () => {
        if (started) return;
        started = true;
        quiet(() => telemetry.startJourney());
      },
      progress: (fraction, action) => {
        if (ended) return;
        started = true;
        quiet(() =>
          telemetry.progress({ progress: Math.min(1, Math.max(0, fraction)), action })
        );
      },
      end: (win, score) => {
        if (ended) return;
        ended = true;
        quiet(() => telemetry.endJourney({ complete: true, game: { win, score } }));
      },
    };
  }, [enabled]);
