import type { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';

/*
 * Devvit Journeys routes for the browser telemetry client
 * (@devvit/analytics/client/reddit posts to /api/telemetry/journey/*).
 * The SDK ships these as an Express router; this is the same contract on Hono.
 * Until the app is allowlisted every call returns a "denied" receipt, which is fine.
 */

const UNKNOWN = {
  status: 'JOURNEY_RECEIPT_UNSPECIFIED',
  message: 'Unknown: Telemetry recording status could not be confirmed.',
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const mountTelemetry = (app: Hono): void => {
  const base = '/api/telemetry/journey';

  const guard = async (run: () => Promise<object>): Promise<Response> => {
    try {
      return Response.json(await run());
    } catch (error) {
      console.warn('telemetry failed', error);
      return Response.json({ receipt: UNKNOWN });
    }
  };

  const body = async (req: Request): Promise<Record<string, unknown>> => {
    try {
      const parsed: unknown = await req.json();
      return typeof parsed === 'object' && parsed !== null
        ? Object.fromEntries(Object.entries(parsed))
        : {};
    } catch {
      return {};
    }
  };

  app.post(`${base}/start`, () => guard(() => telemetry.startJourney()));
  app.post(`${base}/app-ready`, () => guard(() => telemetry.appReady()));
  app.post(`${base}/progress`, async (c) => {
    const b = await body(c.req.raw);
    const progress = typeof b.progress === 'number' ? Math.min(1, Math.max(0, b.progress)) : 0;
    return guard(() =>
      telemetry.journeyProgress({
        journeyId: text(b.journeyId),
        progress,
        action: text(b.action),
        actionDetails: text(b.actionDetails),
      })
    );
  });
  app.post(`${base}/interaction`, async (c) => {
    const b = await body(c.req.raw);
    return guard(() =>
      telemetry.journeyInteraction({
        journeyId: text(b.journeyId),
        action: text(b.action),
        actionDetails: text(b.actionDetails),
      })
    );
  });
  app.post(`${base}/end`, async (c) => {
    const b = await body(c.req.raw);
    const game =
      typeof b.game === 'object' && b.game !== null ? Object.fromEntries(Object.entries(b.game)) : null;
    return guard(() =>
      telemetry.endJourney({
        journeyId: text(b.journeyId),
        complete: b.complete === true,
        ...(game
          ? { game: { win: game.win === true, score: typeof game.score === 'number' ? game.score : 0 } }
          : {}),
      })
    );
  });
};
