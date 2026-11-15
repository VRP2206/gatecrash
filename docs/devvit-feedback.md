# Devvit feedback log

Running notes for the developer feedback survey. Each item: what happened, why it cost time, and a
concrete suggestion.

1. **Journeys server router is Express-only.** `@devvit/analytics/server/reddit` exports
   `createTelemetryRouter()` returning an `express.Router`, while the official React template is
   Hono. We had to read `router.js` and re-implement five routes. *Suggestion:* ship a
   framework-neutral `handleTelemetryRequest(request: Request): Promise<Response>` (or a Hono
   adapter), and mention the Hono case in the Journeys doc.
2. **The analytics server entry point bundles the Express router with the `telemetry` client.**
   Importing `telemetry` from `@devvit/analytics/server/reddit` also imports `router.js`, which
   imports Express. Our server bundle is about 2 MB; we have not measured how much of that is
   Express. *Suggestion:* export the client and the router from separate entry points.
3. **Template `AGENTS.md` mentions tRPC** (`trpc.ts`, "tRPC v11"), but the template has no tRPC.
   Confusing for anyone (or any coding agent) following it literally.
4. **Node version is stated two ways in the template.** `AGENTS.md` says "Node.js v22 serverless
   environment"; `package.json` `engines` requires `>=24`. *Suggestion:* say which is for local
   tooling and which is the runtime.
5. **`devvit.json` entry paths are documented two ways.** The template uses `"entry": "splash.html"`
   with `dir: dist/client`; the view-modes doc uses `"entry": "src/client/preview.html"`. We used
   the template form (it builds); it is unclear which is canonical.
6. **Schema says `permissions.reddit.asUser` is "not currently in use, please set scope to user
   instead"**, while the User Actions doc says `asUser` is required. We followed the doc.
7. **`postData` on the client is great** (day number with no round trip) but is easy to miss: it is
   only mentioned in the Post Data page, not in the launch-screen guide where it matters most.
8. **Local iteration needs a real subreddit.** There is no documented way to run the client against
   a local server, so we built our own harness (fake Redis + fake Reddit + stubbed client SDK).
   *Suggestion:* a `devvit dev --local` that serves the web view with `@devvit/test`'s in-memory
   backend would shorten the loop a lot, especially for UI work.
9. **Score-comment rule lives in two places** (User Actions doc and Devvit Rules) with slightly
   different wording; the "reply to a single stickied comment" requirement is easy to miss until
   review. A code sample that creates and pins the thread comment would help.
10. **No account-deletion trigger is listed** among the available triggers, yet the rules require
    removing a deleted account's data. *Suggestion:* document the expected pattern (TTL? a trigger?).
11. **`canRunAsUser` is exported but undocumented** (marked experimental in the types). Unclear
    whether apps should call it before a `runAs: 'USER'` action.

_Add to this list after the first real `devvit playtest` — nothing above covers the upload flow yet._
