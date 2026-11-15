import { Hono, type Context as HonoContext } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import type { ErrorResponse } from '../shared/api';
import { asLevel, type Level } from '../shared/types';
import { createEndless } from './endless';
import { createGame, GameError } from './game';
import type { Caller, Ports } from './ports';

type TaskResponse = { status: 'ok' };
type TriggerResponse = { status: 'success' | 'error'; message: string };

const readJson = async (c: HonoContext): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await c.req.json();
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return Object.fromEntries(Object.entries(body));
    }
  } catch {
    // fall through: an empty or malformed body is treated as {}
  }
  return {};
};

const dayParam = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const requireDay = (value: unknown): number => {
  const day = dayParam(value);
  if (day === null) throw new GameError(400, 'no-day', 'Missing board number.');
  return day;
};

const requireLevel = (value: unknown): Level => {
  const level = asLevel(value);
  if (!level) throw new GameError(400, 'no-level', 'Missing board level.');
  return level;
};

/**
 * All HTTP routes. `/api/*` is called by the client; `/internal/*` only by the
 * platform (scheduler, menu, triggers).
 */
export const createApp = (ports: Ports, getCaller: () => Caller): Hono => {
  const game = createGame(ports);
  const endless = createEndless(ports);
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof GameError) {
      return c.json<ErrorResponse>({ error: error.code, message: error.message }, error.status);
    }
    console.error(`${c.req.method} ${c.req.path} failed`, error);
    return c.json<ErrorResponse>(
      { error: 'server', message: 'Something went wrong on our side. Try again.' },
      500
    );
  });

  app.get('/api/init', async (c) =>
    c.json(
      await game.init(getCaller(), dayParam(c.req.query('day')), asLevel(c.req.query('level')))
    )
  );
  app.get('/api/splash', async (c) => c.json(await game.splash(getCaller())));
  app.post('/api/start', async (c) => {
    const body = await readJson(c);
    return c.json(await game.start(getCaller(), requireDay(body.day), requireLevel(body.level)));
  });
  app.post('/api/power', async (c) => {
    const body = await readJson(c);
    return c.json(await game.power(getCaller(), requireDay(body.day), requireLevel(body.level), body.placement));
  });
  app.get('/api/result', async (c) =>
    c.json(
      await game.result(
        getCaller(),
        dayParam(c.req.query('day')),
        requireLevel(c.req.query('level'))
      )
    )
  );
  app.post('/api/share', async (c) => {
    const body = await readJson(c);
    return c.json(await game.share(getCaller(), requireDay(body.day), requireLevel(body.level)));
  });
  app.post('/api/join', async (c) => c.json(await game.join(getCaller())));
  app.post('/api/forget', async (c) => c.json(await game.forget(getCaller())));
  app.post('/api/tutorial-done', async (c) => c.json(await game.tutorialDone(getCaller())));
  app.get('/api/archive', async (c) => c.json(await game.archive(getCaller())));
  app.get('/api/leaderboard', async (c) =>
    c.json(
      await game.leaderboard(
        getCaller(),
        c.req.query('scope') === 'streak' ? 'streak' : 'day',
        dayParam(c.req.query('day')),
        asLevel(c.req.query('level')) ?? 'easy'
      )
    )
  );

  app.get('/api/endless', async (c) => c.json(await endless.view(getCaller())));
  app.post('/api/endless/power', async (c) => {
    const body = await readJson(c);
    return c.json(await endless.power(getCaller(), requireDay(body.level), body.placement));
  });
  app.get('/api/endless/leaderboard', async (c) =>
    c.json(await endless.leaderboard(getCaller(), c.req.query('scope') === 'week' ? 'week' : 'day'))
  );

  app.post('/internal/scheduler/daily-post', async (c) => {
    const made = await game.ensureDailyPost();
    console.log(`daily post: day ${made.day} ${made.created ? 'created' : 'already there'}`);
    return c.json<TaskResponse>({ status: 'ok' });
  });

  app.post('/internal/menu/create-today', async (c) => {
    try {
      const made = await game.ensureDailyPost();
      if (!made.postId) {
        return c.json<UiResponse>({ showToast: "Today's board is being posted. Try again in a minute." });
      }
      return c.json<UiResponse>({ navigateTo: ports.reddit.postUrl(made.postId) });
    } catch (error) {
      console.error('create-today failed', error);
      return c.json<UiResponse>({ showToast: "Could not post today's board." });
    }
  });

  const onLifecycle = async (c: HonoContext) => {
    try {
      const made = await game.ensureDailyPost();
      return c.json<TriggerResponse>({
        status: 'success',
        message: `day ${made.day} ${made.created ? 'posted' : 'ready'}`,
      });
    } catch (error) {
      console.error('lifecycle trigger failed', error);
      return c.json<TriggerResponse>({ status: 'error', message: 'Could not post the board.' }, 400);
    }
  };
  app.post('/internal/triggers/on-app-install', onLifecycle);
  app.post('/internal/triggers/on-app-upgrade', onLifecycle);

  return app;
};
