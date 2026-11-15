# Platform notes

What Gatecrash relies on in Devvit, checked on 15 Nov 2026 against the live docs
(`https://developers.reddit.com/docs/llms.txt`), the config schema
(`https://developers.reddit.com/schema/config-file.v1.json`) and the type definitions of the
installed SDK (`@devvit/web` 0.15.3). Re-check before upgrading the SDK.

Status key: **verified in types/docs** = read in the docs and compiles against the SDK types.
**Not yet run on Reddit** = nobody has exercised it in a real subreddit yet (needs `devvit login`).

## Things that need a human or an approval

| Thing | Why | What happens until then |
|---|---|---|
| `devvit login`, first `devvit upload`, picking the app name | Browser login as the developer. The name in `devvit.json` (`gatecrash-daily`) must be free and 3–20 chars. | Nothing runs on Reddit. `npm run dev:local` works without it. |
| Journeys allowlist + journey-map approval | Server-side allowlist. | Every telemetry call returns a `JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED` receipt. The game ignores receipts, so nothing breaks. |
| Comment / subscribe **as the user** for everyone | Needs the app version to be approved. | In playtest, `runAs: 'USER'` acts as the app account unless the caller is the app owner (then it is the owner). Good enough for the demo; say so in the Devpost text. |
| User flair | The app account must be a moderator with flair rights. Installing an app normally grants this. | `setUserFlair` failure is caught and logged; the tier still shows in the report. |
| Pinning the results comment | Same: needs mod rights (`comment.distinguish(true)`). | Caught; the thread works unpinned. |
| Do not `devvit publish` | Hackathon rule. | `npm run upload` only uploads. |

## Custom posts and entry points

- `devvit.json` → `post.dir` = `dist/client`, `post.entrypoints.default` = `splash.html`
  (`inline: true`, `height: "tall"` = 512 px; width varies about 288–880 px) and
  `post.entrypoints.game` = `game.html`.
- The Vite plugin `devvit()` from `@devvit/start/vite` finds `src/client/<entry>` and builds the
  client into `dist/client` and the server into `dist/server/index.cjs` (CommonJS is required).
- Create a post: `reddit.submitCustomPost({ title, entry: 'default', subredditName, postData, textFallback, styles })`.
  `postData` is ≤ 2 KB JSON and readable on the client as `context.postData` with no server call —
  the splash uses it to show the day and date instantly. `styles.backgroundColor(Dark)` is `#RRGGBBAA`
  and is what shows while the web view loads.
- Inline rules that the splash must respect (they are review criteria): tap/click only, no scroll
  traps (`touch-action: none`, `overscroll-behavior: none`, wheel/touchmove `preventDefault`, inner
  scrolling), first content in under a second, expanded mode only from a user action.
- Expand: `requestExpandedMode(event, 'game')` from `@devvit/web/client`, called synchronously in a
  trusted click handler. `exitExpandedMode(event)` goes back. `getWebViewMode()` reads the mode.
- No `window.alert`, no `window.location` navigation (use `navigateTo`), no inline `<script>` in HTML.

## Server

- Hono app served with `serve({ fetch, createServer, port: getServerPort() })`
  (`createServer`, `getServerPort`, `context`, `redis`, `reddit`, `scheduler` from `@devvit/web/server`).
- `context` gives `postId`, `userId` (undefined when logged out), `username`, `subredditName`, `postData`.
- Client-callable routes must start with `/api/`; platform-invoked ones with `/internal/`.
- Limits: 30 s per request, 4 MB request, 10 MB response, no long-lived state between requests.

## Redis

- `permissions.redis: true`. Scoped per installation. Keys cannot be listed, hence the explicit
  index keys documented at the top of `src/server/store.ts`.
- Used commands (all in the SDK types): `get`, `set` (with `{ nx: true }`), `del`, `incrBy`, `hGet`,
  `hGetAll`, `hMGet`, `hSet`, `hSetNX`, `hIncrBy`, `hDel`, `zAdd`, `zRange` (`{ by: 'rank', reverse }`),
  `zRank`, `zCard`, `zRem`.
- Transactions (`watch`/`multi`/`exec`) exist but are not used: the only race that matters (two
  triggers creating the daily post) is guarded with `hSetNX` in `claimPostCreation`.

## Scheduler

- `devvit.json` → `scheduler.tasks.<name> = { endpoint: "/internal/...", cron }`. Five-part cron, UTC.
- Cron tasks in `devvit.json` are (re)scheduled on install and on upgrade. Limit: 10 recurring jobs
  per installation.
- Gatecrash has `daily-post` at `0 0 * * *` and `daily-post-retry` at minute 20 of every hour. Both
  call the same idempotent endpoint, so a failed midnight run heals itself within the hour.
- Handler returns `{ status: 'ok' }`.

## Menu items and triggers

- `menu.items[]` with `location: "subreddit"`, `forUserType: "moderator"`, `endpoint`. The handler
  returns a `UiResponse` (`navigateTo` or `showToast`).
- `triggers.onAppInstall` / `onAppUpgrade` → `/internal/triggers/...`; both make sure today's post exists.

## Acting as the user

- `permissions.reddit.asUser: ["SUBMIT_COMMENT", "SUBSCRIBE_TO_SUBREDDIT"]`.
- `reddit.submitComment({ id, text, runAs: 'USER' })`; `reddit.subscribeToCurrentSubreddit()`.
- Rules we follow (Devvit Rules → "User action requirements"): only from an explicit tap; show the
  exact text and say it is posted from the player's account before posting; score comments are
  replies to one stickied comment; never gate play on sharing or joining; sharing, joining and
  playing are separate buttons.
- There is no API to ask whether the user already subscribed; we remember our own "joined" flag.
- `canRunAsUser(event)` exists in `@devvit/web/client` but is marked experimental; not used.

## Flair

- `reddit.setUserFlair({ subredditName, username, text })`. Empty `text` clears it. No flair
  templates are needed for plain text flair.

## Journeys (telemetry)

- `permissions.journeys: true`, package `@devvit/analytics`.
- Client: `telemetry` from `@devvit/analytics/client/reddit` (`appReady`, `startJourney`, `progress`,
  `interaction`, `endJourney`); it posts to `/api/telemetry/journey/*` and manages the journey id.
- Server: the SDK only ships an **Express** router (`createTelemetryRouter`). We use Hono, so
  `src/server/telemetry.ts` re-implements the same five routes on top of the server `telemetry` client.
- Our map: `App.Ready` when the board is interactive; `Journey.Start` on the first chip placed;
  `Journey.Progress` on each Power (`progress = charges used / 5`); `Journey.End` with
  `complete: true`, `game.win`, `game.score = charges left + 1`.
- Do not start a journey on load, and no usernames or free text in `action` fields.

## Realtime

- `permissions.realtime: true`, `connectRealtime` on the client, `realtime.send(channel, msg)` on the
  server. Not used: the "N people solving now" counter was a stretch goal and is not built.

## Logged-out players

- `context.userId` is undefined. The board still loads; progress is kept in `localStorage` and the
  report shows a "Log in to keep a streak" button (`showLoginPrompt()`), never a wall.
- `localStorage` is cleared when a new app version is installed, so guest progress is best-effort.

## Data and deletion (Devvit Rules → privacy)

- Stored per player: Reddit user id, username (for leaderboards), per-day attempts/timestamps,
  streak, two flags. Nothing else, nothing leaves Redis.
- Players can erase all of it from the How to play screen (`POST /api/forget`), which also clears
  the flair the game set.
- **Gap to close before any real publish:** there is no automatic clean-up when a Reddit account is
  deleted, and no key expiry. The rules recommend expiring user data within 30 days or handling
  deletion events.

## Testing

- `@devvit/test` (Vitest harness with in-memory Redis/Reddit) exists. We do not use it yet: the
  server is written against small port types, and `src/server/testing/fakes.ts` implements them for
  both the unit tests and `npm run dev:local`. Worth adding one `@devvit/test` run of `store.ts` to
  confirm our fake matches the real Redis semantics (especially `zRange` and `set nx`).
