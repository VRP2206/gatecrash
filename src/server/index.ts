import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, redis } from '@devvit/web/server';
import { createApp } from './app';
import { redditPort } from './reddit';
import { mountTelemetry } from './telemetry';

const app = createApp({ redis, reddit: redditPort, now: () => Date.now() }, () => ({
  postId: context.postId ?? null,
  userId: context.userId ?? null,
  username: context.username ?? null,
  subreddit: context.subredditName ?? null,
}));
mountTelemetry(app);

serve({ fetch: app.fetch, createServer, port: getServerPort() });
