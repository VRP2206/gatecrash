# Gatecrash — Claude Code build plan

Entry for **Reddit's Game of the Day Hackathon** (Devpost: redditgameofday2026.devpost.com).
Working title "Gatecrash"; rename freely, nothing below depends on it.

> How to use this file: put it at the repo root as `PLAN.md`. Start each Claude Code
> session with "Read PLAN.md and CLAUDE.md, then do Phase N". One phase per session
> (or less). Tick the checkboxes as you go so the next session knows where things stand.

---

## 1. Hard facts (from the official rules — do not drift from these)

| Item | Value |
|---|---|
| Submission deadline | Tue 8 Dec 2026, 6:00 pm PT = **Wed 9 Dec, 10:00 am MYT**. Target: submit by Tue 8 Dec, 8 pm MYT. |
| Judging | 9–16 Dec. The demo post must keep working, free and unrestricted, the whole time. |
| Platform | Must be built on **Devvit Web** and run as an interactive post on Reddit. Not on Reddit = cannot place. |
| Judging criteria (equal weight) | Delightful UX, Polish, Reddity, Daily Content. Tie-break order is the same. |
| Stage 1 gate | Pass/fail: fits the "daily game" theme and actually uses the platform. |
| Required to submit | App listing link (`developers.reddit.com/apps/{app-name}`), demo post link in a **public subreddit with < 200 members**, text description, `README.md` at repo root describing the game and how to play. |
| Optional | Demo video under 1 minute (public YouTube/Vimeo), public repo link, developer feedback survey ($200 Feedback Award, separate from the project prize). |
| Do NOT | Submit the app for publishing/App Review. Upload + playtest only. |
| IP | Everything original or properly licensed (fonts, sounds, art). No third-party game IP. |
| Prizes | $15k Best Daily Game, 10 × $1k Honourable Mentions. (The $6k "Ported" prize needs an existing game you own — not applicable.) |

What judges said they do **not** want: obvious AI look (unstyled generic components, UI overflowing
the viewport), games *about* Reddit, and over-seen genres (trivia, clones, space shooters,
platformers, collaborative storytelling).

---

## 2. The game

**One-line pitch:** A daily circuit puzzle. A small board has empty sockets; drop the right
logic chips into them so the bulbs light in the target pattern — using as few "power-ons" as you can.

### Core loop (target: 1–3 minutes)
1. Open today's post. Splash shows game name, day number, date, your streak, a Play button.
2. The board: 2–4 input switches on the left, 3–7 empty sockets wired together, 1–3 bulbs on the right.
   A **target card** shows, for each input combination, which bulbs should be lit.
3. A **tray** holds today's chips (AND, OR, XOR, NOT, later NAND/NOR). Tap a chip, tap a socket.
4. Press **Power**. The board runs every input combination with an animated signal flowing down
   the wires; each row of the target card gets a tick or a cross.
5. All rows ticked = solved. Each Power press costs one of **5 battery charges**. Out of charges =
   board "blows a fuse", solution is revealed, streak is kept only if solved.
6. **Result card** (single screen): charges used, time, streak, where you sit on today's
   histogram, and one clear next step (share to comments / join the subreddit / play the archive).

No jargon on screen. Chips are shown by *behaviour* (a tiny looping 2-in/1-out animation on each
chip), not by the words "XOR gate". A player who has never seen a logic gate must be able to play.

### Difficulty curve (weekly rhythm = reason to come back)
| Day | Inputs | Sockets | Bulbs | Tray |
|---|---|---|---|---|
| Mon–Tue | 2 | 3 | 1 | exact chips |
| Wed–Thu | 3 | 4–5 | 1–2 | exact chips |
| Fri–Sat | 3 | 5–6 | 2 | exact + 1–2 decoys |
| Sun ("Overclock") | 4 | 6–7 | 2–3 | decoys, NAND/NOR allowed |

### Reddit layer (this is the "Reddity" score — treat it as core, not garnish)
- **One post per day**, created automatically by the scheduler, titled `Gatecrash #N — <weekday name>`.
- **Share to comments**: opt-in button on the result card posts a spoiler-free result line
  (e.g. `Gatecrash #12 ⚡⚡▫▫▫ 0:48`) to that day's thread.
- **Streak flair**: subreddit user flair updated to the current streak tier (e.g. "Apprentice · 7").
- **Daily histogram**: how many players solved in 1/2/3/4/5 charges or blew the fuse.
- **Leaderboards**: today (fewest charges, then time) and all-time streak.
- **Archive**: past boards are playable from the result card; they don't affect streaks.
- **Join prompt**: one subscribe button on the result card, never mid-game.
- **Devvit Journeys** events for start / progress / complete (see §6 — needs allowlisting).

### Stretch (only after Phase 5 is green)
- **Workshop**: players build a board in an editor; submissions are validated by the solver;
  the most-upvoted valid board becomes next Saturday's "Community Board" with the author credited.
  This is the single strongest Reddity feature — do it if there is time, cut it without guilt if not.
- Live "N people solving right now" counter via realtime.
- Subtle sound (own or CC0 only), with a mute toggle that defaults to muted.

### Open design question — resolve in Phase 2 by playing it
Is "mentally simulate, then spend a charge" fun, or frustrating? Tuning knobs, in order of preference:
(a) let the player flip input switches and see wire states for the **first row only** for free;
(b) raise charges to 6; (c) show which *bulb* was wrong, not just which row.
Pick by playtesting with 3 people who don't study CS. Record the decision here:
**Provisional (15 Nov, not yet playtested with people): (a) + (c).** One fixed "live" row of the
test card is wired to the bench for free: the board shows its signals and bulb verdicts as chips
move. Power then shows a tick or cross per *bulb* on every row, and any tested row can be tapped to
see it on the board. Charges stay at 5. Confirm or change after the Phase 2 playtest; the live row
is `probeRow` in `src/shared/generate.ts`.

---

## 3. Stack and architecture

Verify everything in this section against the live docs before writing code — Devvit moves fast.
Start from `https://developers.reddit.com/docs/llms.txt` and the config schema at
`https://developers.reddit.com/schema/config-file.v1.json`.

- **Scaffold:** official React template (`developers.reddit.com/new` → React, or
  `github.com/reddit/devvit-template-react`): Vite + React + TypeScript + Tailwind + an HTTP server (Express or Hono).
- **Node:** 22.2+.
- **Rendering:** plain React + SVG for the board (no game engine — it is a static board with
  animated strokes; SVG keeps it crisp and tiny). CSS/SVG animation for signal flow.
- **Config:** `devvit.json` (app metadata, post entry points, permissions, scheduler tasks, menu items).
- **Client SDK:** `@devvit/web/client`. **Server SDK:** `@devvit/web/server` (redis, reddit, context, realtime, scheduler).
- **Platform limits to design around:** client-callable endpoints must start with `/api/`;
  platform-invoked ones (scheduler, menu, triggers) live under `/internal/`; 30 s max request,
  4 MB request payload, 10 MB response; no long-lived server state — everything in Redis;
  Redis is scoped per installation and keys cannot be listed, so keep explicit index keys.

### Layout
```
src/
  shared/          # pure TypeScript, zero platform imports, 100% unit-tested
    types.ts       # Board, Socket, Chip, Placement, RowResult, DayState
    rng.ts         # seeded PRNG (mulberry32 or similar)
    sim.ts         # simulate(board, placement) -> outputs per input row
    generate.ts    # generate(dayNumber, difficulty) -> Board
    solve.ts       # enumerate placements; count solutions; used by generator + Workshop
    day.ts         # UTC day number <-> date, difficulty for weekday
    score.ts       # result line, ranking key
  server/
    index.ts       # routes only; thin adapters over shared/
    store.ts       # every Redis read/write lives here
    reddit.ts      # post creation, comment, flair
  client/
    main.tsx, App.tsx
    screens/       # Splash, Play, Result, Archive, HowTo
    board/         # BoardSvg, Wire, SocketView, ChipView, Bulb, TargetCard, Tray
    hooks/         # useDay, usePower, useJourney
    theme/         # tokens.css — colours, type scale, motion; nothing hard-coded elsewhere
```
`shared/` is the heart. The client simulates locally for animation; the server re-simulates to
award credit. There is no hidden information in a board (target is public), so the server's job
is authoritative **counting** (charges, time, streak), not secrecy.

### Board model
- A board is a DAG: inputs → sockets → bulbs. Each socket has 1 or 2 input wires (from inputs or
  earlier sockets) and a fixed arity (1 = NOT only, 2 = binary chips).
- Layout is by column (layer), so wires only run left to right — easy to draw, easy to read.
- **Generation:** seed = hash(dayNumber, server salt). Build a random layered DAG for the day's
  difficulty, fill it with random chips (the reference solution), compute the target table,
  then build the tray = solution chips (+ decoys).
- **Reject and regenerate** when: any bulb is constant across all rows; any socket doesn't affect
  any bulb; the board is solvable with fewer distinct deductions than intended (e.g. every
  placement works); solution count (up to swapping identical chips) is not exactly 1 on Mon–Thu
  or more than 3 on Fri–Sun. Any placement that satisfies the target is accepted as a win.
- Search space is tiny (≤ 7 sockets, ≤ 6 chip types) — brute force is fine.

### Redis keys (all access through `store.ts`)
```
board:{day}                 JSON Board (generated once, then immutable)
post:{day} / day:{postId}   day <-> postId mapping
u:{uid}:d:{day}             hash: charges, startedAt, solvedAt, placements, status
u:{uid}:streak              hash: current, best, lastSolvedDay
stats:{day}                 hash: c1..c5, fused, players
lb:{day}                    zset: score = charges*100000 + seconds, member = uid
lb:streak                   zset: score = current streak
meta:latestDay              number
```

### API
```
GET  /api/init            -> { day, board, state, streak, username }   (day resolved from post context)
POST /api/start           -> stamps startedAt (idempotent)
POST /api/power           { placement } -> { rows: RowResult[], chargesLeft, status }
GET  /api/result          -> { stats, rank, streak, shareLine }
POST /api/share           -> posts the result comment (explicit user action only)
GET  /api/archive         -> list of past days + own status
GET  /api/leaderboard     ?scope=day|streak
POST /internal/scheduler/daily-post     cron 00:00 UTC: generate board, create post, store mapping
POST /internal/menu/create-today        moderator menu item: same as above, on demand (for testing)
POST /internal/on-app-install           create day 1 post, set up flair templates
```
Server rules: reject `/api/power` if status is final; validate the placement against the tray
(no chip used more times than supplied); compute time server-side from `startedAt`.

---

## 4. Phases

> **Status, 15 Nov 2026.** Code for Phases 1–4 and most of Phase 5 is written and passes
> `npm run check`; it has been exercised only in the local harness (`npm run dev:local`,
> `npm run shots`), **never on Reddit**. Ticked boxes mean "built and tested locally". Still open:
> everything marked Human, the first real `devvit playtest` (scaffold-runs-in-subreddit, phone
> check, two-account check, turning the cron on), the human playtest, difficulty calibration from
> real data, the fresh-eyes judge review, and Phase 6. Deviations from this plan: Mon–Tue boards
> use 3–4 sockets and 1–2 bulbs (the fixed 3/1 spec gave near-identical boards on consecutive
> days); Mon–Thu allow up to 2 winning arrangements (mirror-image pairs are common); Tailwind was
> dropped in favour of plain CSS on `tokens.css`; wires may skip at most one column. Stretch goals
> (Workshop, realtime counter, sound) are not built.

Dates assume evenings + weekends. Each phase ends with something uploaded and playable.
**Rule for every phase:** `npm run check` (typecheck + lint + tests) passes before moving on,
and the game is opened on a real phone in the Reddit app at least once.

### Phase 0 — Setup (Sat 14 – Sun 15 Nov)
- [ ] Human: join the hackathon on Devpost; create Devvit account; create a public test subreddit (keep it < 200 members).
- [ ] Human: **ask in the Devvit Discord / r/Devvit to be allowlisted for Journeys** and how journey-map
      approval works for hackathon apps. Do this on day 1 — it has a human in the loop.
- [ ] Scaffold from the React template; `npm run dev` playtest shows the template post in the subreddit.
- [x] Claude: read the docs index, Devvit Rules, and the "how to build games for Reddit" guide; write
      `docs/platform-notes.md` with the exact current APIs for: custom post creation, splash/entry
      points, redis, scheduler cron, comments on behalf of a user, user flair, Journeys, realtime.
      Flag anything that needs special permission or approval.
- [x] Add Vitest, ESLint, Prettier, `npm run check`. Write `CLAUDE.md` (see §7).
- **Done when:** template runs in the subreddit and `platform-notes.md` has no "unknown" left on post creation, redis, scheduler.

### Phase 1 — Engine (Mon 16 – Thu 19 Nov)
- [x] `shared/types.ts`, `rng.ts`, `sim.ts`, `solve.ts`, `generate.ts`, `day.ts`, `score.ts`.
- [x] Tests: simulator truth tables for every chip; generator determinism (same day → same board);
      property test over 2,000 days: every board passes all reject rules and the reference solution wins.
- [x] CLI script `npm run board -- --day 12` prints an ASCII board + target + solution count, for eyeballing.
- [x] Script that prints difficulty stats over 60 days (sockets, solution count, tray size).
- **Done when:** 2,000-day property test is green and 10 printed boards look sane to a human.

### Phase 2 — Playable board (Fri 20 – Tue 24 Nov)
- [x] `BoardSvg` renders any board from Phase 1 responsively (portrait phone first, then desktop inline post).
- [x] Tap-chip-then-tap-socket placement; tap a filled socket to return the chip. No drag-and-drop required
      (add it later only if tap feels poor). Minimum touch target 44 px.
- [x] Power: row-by-row signal animation (skippable by tapping), ticks/crosses on the target card, charge meter.
- [x] Win and fuse states (local only for now, fake `/api` with in-memory state).
- [ ] **Playtest with 3 non-CS people. Resolve the open design question in §2 and write the answer down.**
- **Done when:** a first-time player solves a Monday board without being told anything.

### Phase 3 — Daily backbone (Wed 25 – Sat 28 Nov)
- [x] `store.ts`, real `/api/init`, `/api/start`, `/api/power`, `/api/result`.
- [x] Scheduler task creates the daily post at 00:00 UTC; moderator menu item to create one on demand.
- [x] Streak logic (UTC days; solving day N after solving N-1 extends; archive plays never count). Unit-test it.
- [x] Stats histogram + daily leaderboard written on completion.
- [x] Splash/entry screen: name, one-line description, day number + date, streak, Play. Nothing else.
- [x] Refreshing or reopening the post restores the exact in-progress state.
- [ ] **Turn the daily cron on and leave it on.** By judging there should be 10+ real days of posts.
- **Done when:** two accounts can play the same day independently and see each other in the histogram.

### Phase 4 — Reddit layer (Sun 29 Nov – Wed 2 Dec)
- [x] Result card: one screen, one primary action. Share-to-comments, Join, Archive as secondary.
- [x] Share comment (explicit tap only; show the exact text before posting).
- [x] Streak flair tiers; set on completion.
- [x] Archive screen.
- [x] Leaderboard screen (today / streak).
- [x] First-time onboarding: a 2-socket practice board with three contextual hints (pointing at tray,
      socket, Power). No wall of text. Stored per user; replayable from a "?" button.
- [x] Journeys instrumentation behind a `useJourney` hook: start on first chip placed, progress on each
      Power, end with complete=true/false. Must fail silently if the app isn't allowlisted yet.
- **Done when:** a new account goes splash → tutorial → solve → result → comment → flair without a dead end.

### Phase 5 — Polish (Thu 3 – Sun 6 Dec)
- [x] Visual identity pass (§5). Every screen fits the viewport with no scroll during play, on a small
      phone and in the desktop inline post.
- [x] Accessibility: contrast ≥ 4.5:1 for text; never colour-only (lit bulbs also change shape/glow, ticks
      vs crosses are different glyphs); `prefers-reduced-motion` shortens the signal animation; labelled controls.
- [x] Loading, empty, and error states for every endpoint (first player of the day sees a sensible histogram).
- [ ] Performance: initial bundle small, no layout shift on load, fonts self-hosted and subset.
- [ ] Difficulty calibration from real play data: adjust the weekday table if Mon solve rate < 85% or Sun > 70%.
- [ ] Fresh-eyes review: run a separate Claude Code session with only the prompt "You are a hackathon judge;
      here is the judging rubric; open the app and list everything that looks unfinished or generic."
- [x] Devvit Rules compliance read-through against `platform-notes.md`.
- **Done when:** the judge-review session's "must fix" list is empty.

### Phase 6 — Submit (Mon 7 – Tue 8 Dec)
- [x] `README.md` at root: what it is, how to play (with screenshots), how daily generation works, how the
      Reddit features are used, tech notes, how to run locally.
- [ ] `devvit upload` the final build. **Do not publish.**
- [ ] Confirm subreddit is public and under 200 members; pin a "Start here" post linking today's board.
- [ ] Record a < 60 s video: open post → solve a board → result card → comment thread → flair. Upload public.
- [ ] Devpost: description, app listing link, subreddit + demo post links, video, repo link.
- [ ] Fill in the developer feedback survey with specific, actionable notes (keep a running
      `docs/devvit-feedback.md` from Phase 0 so this takes ten minutes).
- [ ] Submit by **Tue 8 Dec, 8 pm MYT**. Then leave the cron running and don't touch the app until 17 Dec.

### Cut order if time runs short
Workshop → realtime counter → sound → leaderboard screen → archive → flair. Never cut: daily post
automation, streaks, result card, share-to-comments, onboarding, viewport fit.

---

## 5. Visual identity (so it doesn't read as a template)

Direction: **a hobbyist's workbench at night.** Dark green-black PCB board, copper traces, warm
amber bulbs, cream silkscreen lettering. One display typeface with character for the title and
numbers (monospaced or engineering-stencil feel, open licence), one plain readable face for everything else.

- All colours, spacing, radii, and durations live in `theme/tokens.css`. No raw hex values in components.
- Traces are the animation: signal travels along the copper as a moving glow, not a generic progress bar.
- Chips look like chips (body, notch, legs), each with its own small behaviour glyph.
- Result card is a "test report" slip, not a modal with a gradient.
- No emoji in the UI itself (fine in the share line). No stock component library look: no default
  rounded-xl cards, no purple gradients, no centred-everything layout.
- Nothing Reddit-themed in the fiction. Reddit shows up through features, not artwork.

---

## 6. Risks and unknowns to verify early

| Risk | Action |
|---|---|
| Journeys requires app allowlisting and journey-map approval | Ask on day 1. Build behind a hook that no-ops on a denied receipt. Mention in README either way. |
| Posting a comment as the user may need a special permission or approval | Check in Phase 0. Fallback: app-account comment that tags the result, or copy-to-clipboard + open the comment box. |
| Setting user flair needs moderator-level app permissions | Check in Phase 0. Fallback: show streak tier in-app and in the share line only. |
| "Logic gates" sounds intimidating | Behaviour-first chips, tutorial board, gentle Mon–Tue. Validate with non-CS playtesters in Phase 2. |
| Trial-and-error instead of deduction | 5-charge limit + decoys later in the week; tune per §2 open question. |
| Empty community during judging (small subreddit) | Game is fully satisfying solo; histogram and leaderboard have dignified low-data states; invite friends to play daily from Phase 3 so threads aren't empty. |
| Similar games may already exist among past entries | Search r/GameOnReddit and past Devpost galleries for circuit/logic-gate dailies in Phase 0. If one exists, lean harder on Workshop + weekly rhythm as the differentiator. |
| Inline post viewport is small and varies | Design to the smallest size first; test in the Reddit mobile app, mobile web, and desktop every phase. |

---

## 7. CLAUDE.md starter (create in Phase 0)

```
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
```

---

## 8. Submission checklist (copy into the Devpost draft)

- [ ] App listing URL
- [ ] Public subreddit URL (< 200 members) + demo post URL
- [ ] Text description (features + how the daily loop and Reddit features work)
- [ ] README.md at repo root
- [ ] Video < 1 min, public
- [ ] Public repo URL
- [ ] Feedback survey submitted
- [ ] App uploaded, **not** published
- [ ] Daily cron still running; today's post exists
