/*
 * npm run dev:local — the whole game on http://localhost:5173 with no Reddit.
 *
 * The real routes (src/server/app.ts) run against an in-memory Redis and a
 * fake Reddit; Vite serves the client with the Devvit client SDK stubbed.
 *
 *   /splash.html           the inline post          /game.html   the expanded game
 *   /dev/as/<name>         play as another user     /dev/as/guest  logged out
 *   /dev/advance?days=1    move the clock forward and run the daily scheduler
 *   /dev/seed?n=40&level=easy   add fake finished players to one of today's boards
 *   /dev/reddit            what the game asked Reddit to do
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import react from '@vitejs/plugin-react';
import { Hono } from 'hono';
import { createServer as createVite } from 'vite';
import { createApp } from '../../src/server/app';
import { createGame } from '../../src/server/game';
import type { Caller } from '../../src/server/ports';
import { createFakeReddit, createFakeRedis } from '../../src/server/testing/fakes';
import { MS_PER_DAY } from '../../src/shared/day';
import { createRng } from '../../src/shared/rng';
import { solve } from '../../src/shared/solve';
import { MAX_CHARGES, asLevel } from '../../src/shared/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../../src/client');

export type DevServer = { url: string; close: () => Promise<void> };

export const startDevServer = async (port = 5173): Promise<DevServer> => {
  const clock = { offset: 0 };
  const redis = createFakeRedis();
  const reddit = createFakeReddit();
  const ports = { redis, reddit, now: () => Date.now() + clock.offset };
  const who = new AsyncLocalStorage<Caller>();
  const guest: Caller = { postId: null, userId: null, username: null, subreddit: 'gatecrash_dev' };
  const api = createApp(ports, () => who.getStore() ?? guest);
  const game = createGame(ports);
  await game.ensureDailyPost();

  const dev = new Hono();
  dev.get('/dev/as/:name', (c) => {
    c.header('set-cookie', `gc_user=${c.req.param('name')}; Path=/`);
    return c.redirect(c.req.query('to') ?? '/splash.html');
  });
  dev.get('/dev/advance', async (c) => {
    clock.offset += Number(c.req.query('days') ?? '1') * MS_PER_DAY;
    const made = await game.ensureDailyPost();
    return c.json({ now: new Date(ports.now()).toISOString(), ...made });
  });
  dev.get('/dev/seed', async (c) => {
    const n = Number(c.req.query('n') ?? '30');
    const rng = createRng(n * 7919 + reddit.posts.length);
    const level = asLevel(c.req.query('level')) ?? 'easy';
    const init = await game.init(guest, null, level);
    const { solutions } = solve(init.board);
    const win = solutions[0];
    if (!win) return c.json({ error: 'no solution' }, 500);
    // A wrong placement: the solution with two different chips swapped, if legal.
    let lose = [...win];
    for (let i = 0; i < win.length && lose.join() === win.join(); i++) {
      for (let j = i + 1; j < win.length; j++) {
        const a = win[i];
        const b = win[j];
        if (!a || !b || a === b) continue;
        if ((a === 'NOT') !== (b === 'NOT')) continue;
        const swapped = [...win];
        swapped[i] = b;
        swapped[j] = a;
        if (!solutions.some((s) => s.join() === swapped.join())) lose = swapped;
      }
    }
    for (let p = 0; p < n; p++) {
      const name = `bench_${rng.int(9000) + 1000}_${p}`;
      const caller: Caller = { ...guest, userId: `t2_${name}`, username: name };
      const misses = Math.min(MAX_CHARGES, Math.floor(rng.next() * rng.next() * 6.5));
      await game.start(caller, init.day, level);
      const started = clock.offset;
      for (let m = 0; m < misses; m++) await game.power(caller, init.day, level, lose);
      clock.offset += (20 + rng.int(240)) * 1000;
      if (misses < MAX_CHARGES) await game.power(caller, init.day, level, win);
      clock.offset = started;
    }
    return c.json(await game.result(guest, init.day, level));
  });
  dev.get('/dev/reddit', (c) =>
    c.json({
      posts: reddit.posts,
      comments: reddit.comments,
      flairs: Object.fromEntries(reddit.flairs),
      subscribed: reddit.subscribed,
    })
  );
  dev.route('/', api);

  const vite = await createVite({
    configFile: false,
    root: clientRoot,
    appType: 'mpa',
    logLevel: 'warn',
    plugins: [react()],
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    resolve: {
      alias: {
        '@devvit/web/client': path.resolve(here, 'stubs/devvit-client.ts'),
        '@devvit/analytics/client/reddit': path.resolve(here, 'stubs/devvit-analytics.ts'),
      },
    },
  });

  const listener = getRequestListener(dev.fetch);
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/') {
      res.writeHead(302, { location: '/splash.html' }).end();
      return;
    }
    if (url.startsWith('/api/') || url.startsWith('/internal/') || url.startsWith('/dev/')) {
      const cookie = /gc_user=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'ada';
      const caller: Caller =
        cookie === 'guest' ? guest : { ...guest, userId: `t2_${cookie}`, username: cookie };
      void who.run(caller, () => listener(req, res));
      return;
    }
    vite.middlewares(req, res);
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    close: async () => {
      await vite.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startDevServer(Number(process.env.PORT ?? '5173'));
  console.log(`Gatecrash local bench: ${url}`);
  console.log('  /dev/as/<name>  /dev/as/guest  /dev/advance?days=1  /dev/seed?n=40  /dev/reddit');
}
