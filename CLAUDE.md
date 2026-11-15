# Gatecrash — working agreement
- Read PLAN.md first. Work on one phase; don't start the next without being asked.
- Devvit APIs change. Before using any platform API, confirm it in docs/platform-notes.md or
  the live docs (https://developers.reddit.com/docs/llms.txt). Never guess an import or config key.
- src/shared is pure TypeScript: no platform, DOM, or Node imports. Every function there has tests.
- All Redis access goes through src/server/store.ts. All Reddit API calls through src/server/reddit.ts.
- Client-callable routes start with /api/. Platform-invoked routes live under /internal/.
- Styling uses tokens from src/client/theme/tokens.css only. No raw colours or magic numbers in components.
- Every screen must fit the viewport without scrolling during play. Check at 360x640 before calling UI done.
- Run `npm run check` before saying a task is finished. Report what you ran and what passed.
- Never run `devvit publish`. Upload and playtest only.
- Only original or openly licensed assets; record every font/sound/image and its licence in ASSETS.md.
- Log platform friction in docs/devvit-feedback.md as you hit it (used for the feedback survey).
- UI copy: short, plain, lower-key. No exclamation marks, no emoji in the interface.

## Commands
- `npm run check` — typecheck + lint + unit tests. Must pass before a task is done.
- `npm run dev:local` — the whole game against an in-memory Redis/Reddit at http://localhost:5173 (no Reddit login needed).
- `npm run dev` — `devvit playtest` in the real test subreddit (needs `npm run login` once).
- `npm run board -- --day 12 --count 5` — print boards as text. `npm run stats -- --days 60` — difficulty spread.
- `npm run shots` — screenshots of every screen at 360x640 and desktop into `docs/shots/`.

## Layout
- `src/shared` engine (types, rng, sim, solve, generate, day, score, streak) and the API types in `api.ts`.
- `src/server` `app.ts` builds the Hono routes from injected ports; `game.ts` holds the rules;
  `store.ts` is the only Redis user; `reddit.ts` the only Reddit API user; `index.ts` wires the real platform.
- `src/client` `splash.*` is the inline post (no React, loads fast); `game.*` is the expanded React app.
- `tools/dev` local harness: fake Redis, fake Reddit, stubbed `@devvit/web/client`.

## Conventions
- Type aliases over interfaces, named exports, no type casts.
- Chips are never called AND/OR/XOR on screen. Use the labels in `CHIP_INFO` (BOTH, EITHER, DIFFER, FLIP, NOT BOTH, NEITHER).
