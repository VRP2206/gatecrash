/*
 * npm run endless — play endless mode so a person does not have to.
 *
 *   1. A bot climbs levels 1-150 over HTTP against the real routes, checking
 *      every board clears and every stage refills, and prints the curve.
 *   2. A headless phone (360x640) plays the first stages through the real UI,
 *      fails tests, blows a fuse, then jumps to later stages. Every board must
 *      fit the screen. Screenshots land in docs/shots/endless/.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import type { EndlessPowerResponse, EndlessView } from '../src/shared/api';
import { STEPS, endlessSpec, stageStart, stepAt } from '../src/shared/endless';
import { solve } from '../src/shared/solve';
import { CHIP_INFO, type Board, type ChipType, type FullPlacement } from '../src/shared/types';
import { startDevServer } from './dev/server';

const OUT = path.resolve('docs/shots/endless');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const problems: string[] = [];

/** Legal placements that do not solve the board, up to `limit`. */
const wrongOnes = (board: Board, limit: number): FullPlacement[] => {
  const wins = new Set(solve(board, 99).solutions.map((s) => s.join()));
  const out: FullPlacement[] = [];
  const walk = (left: ChipType[], placed: ChipType[]): void => {
    if (out.length >= limit) return;
    if (placed.length === board.sockets.length) {
      if (!wins.has(placed.join())) out.push(placed);
      return;
    }
    const wires = board.sockets[placed.length]?.inputs.length ?? 2;
    for (const chip of new Set(left)) {
      if (CHIP_INFO[chip].arity !== wires) continue;
      const rest = [...left];
      rest.splice(rest.indexOf(chip), 1);
      walk(rest, [...placed, chip]);
    }
  };
  walk([...board.tray], []);
  return out;
};

const winFor = (board: Board): FullPlacement => {
  const win = solve(board).solutions[0];
  if (!win) throw new Error(`level ${board.day} has no solution`);
  return win;
};

// ---------- 1. the bot climb ------------------------------------------------

const botClimb = async (url: string, top: number) => {
  const headers = { cookie: 'gc_user=bot', 'content-type': 'application/json' };
  const view = async (): Promise<EndlessView> => (await fetch(`${url}/api/endless`, { headers })).json();
  const power = async (level: number, placement: FullPlacement): Promise<EndlessPowerResponse> =>
    (await fetch(`${url}/api/endless/power`, { method: 'POST', headers, body: JSON.stringify({ level, placement }) })).json();

  type Tally = { from: number; boards: number; sockets: number; tray: number; ways: number; ms: number };
  const stages = new Map<number, Tally>();
  let now = await view();
  while (now.level <= top) {
    const { level, board } = now;
    const started = performance.now();
    const { solutions, candidates } = solve(board, 99);
    const win = solutions[0];
    if (!win) {
      problems.push(`bot: level ${level} has no solution`);
      break;
    }
    const spec = endlessSpec(level);
    if (board.inputs !== spec.inputs) problems.push(`bot: level ${level} has ${board.inputs} switches`);
    // Burn one charge on the third board of each stage, to prove the refill at the next.
    if (level === stageStart(level) + 2) {
      const miss = wrongOnes(board, 1)[0];
      if (miss) {
        const failed = await power(level, miss);
        if (failed.outcome !== 'failed' || failed.view.burned !== 1) {
          problems.push(`bot: level ${level} wrong test gave ${failed.outcome}, burned ${failed.view.burned}`);
        }
      }
    }
    const result = await power(level, win);
    if (result.outcome !== 'cleared' || result.view.level !== level + 1) {
      problems.push(`bot: level ${level} did not clear (${result.outcome})`);
      break;
    }
    if (result.view.level === stageStart(result.view.level) && result.view.burned !== 0) {
      problems.push(`bot: charges not refilled entering level ${result.view.level}`);
    }
    const key = stepAt(level).from;
    const t = stages.get(key) ?? { from: level, boards: 0, sockets: 0, tray: 0, ways: 0, ms: 0 };
    t.boards++;
    t.sockets += board.sockets.length;
    t.tray += board.tray.length;
    t.ways += candidates;
    t.ms += performance.now() - started;
    stages.set(key, t);
    now = result.view;
  }
  console.log(`Bot climbed to level ${now.level - 1} (best ${now.best}, today +${now.today}).`);
  console.log('levels     switches  sockets  chips in tray  ways to seat them  what is new');
  for (const [key, t] of [...stages].sort((a, b) => a[0] - b[0])) {
    const to = t.from + t.boards - 1;
    const sw = endlessSpec(key).inputs;
    const note = STEPS.find((s) => s.from === key)?.note ?? '';
    console.log(
      `${`${t.from}-${to}`.padEnd(10)} ${String(sw).padEnd(9)} ${(t.sockets / t.boards).toFixed(1).padEnd(8)} ${(t.tray / t.boards).toFixed(1).padEnd(14)} ${String(Math.round(t.ways / t.boards)).padEnd(18)} ${note}`
    );
  }
  if (now.best !== top) problems.push(`bot: expected best ${top}, got ${now.best}`);
};

// ---------- 2. the phone ----------------------------------------------------

const shot = async (page: Page, name: string, fit = false) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (!fit) return;
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    const out: string[] = [];
    if (el.scrollHeight > window.innerHeight + 1) out.push(`page is ${el.scrollHeight}px tall`);
    if (el.scrollWidth > window.innerWidth + 1) out.push(`page is ${el.scrollWidth}px wide`);
    for (const node of document.querySelectorAll('.page')) {
      if (node.scrollHeight > node.clientHeight + 1) out.push(`${node.className} scrolls`);
    }
    for (const node of document.querySelectorAll('.play > *, .tray-chip, .card-row')) {
      const r = node.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1 || r.left < -1) {
        out.push(`${node.className} leaves the viewport`);
      }
    }
    return out;
  });
  for (const o of over) problems.push(`${name}: ${o}`);
};

const place = async (page: Page, board: Board, placement: FullPlacement) => {
  for (let i = 0; i < board.sockets.length; i++) {
    const filled = await page.locator('.socket').nth(i).evaluate((n) => n.classList.contains('is-filled'));
    if (filled) await page.locator('.socket').nth(i).click();
  }
  for (let i = 0; i < placement.length; i++) {
    const chip = placement[i];
    if (!chip) continue;
    const inTray = page.locator(`.tray-chip[aria-label^="${CHIP_INFO[chip].label}:"]`);
    await inTray.click();
    if ((await page.locator('.tray-chip.is-held').count()) === 0) await inTray.click();
    await page.locator('.socket').nth(i).click();
  }
};

const power = async (page: Page) => {
  await page.locator('.btn-power').click();
  await page.waitForSelector('.board.is-running', { timeout: 5_000 }).catch(() => undefined);
  await page.locator('.zone-board').click(); // skip the replay
  await page.waitForSelector('.board:not(.is-running)', { timeout: 20_000 });
  await page.waitForTimeout(150);
};

const main = async () => {
  const server = await startDevServer(5187);
  const browser = await chromium.launch();
  try {
    await botClimb(server.url, 150);

    const phone = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    const page = await phone.newPage();
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    const current = (): Promise<EndlessView> => page.evaluate(() => fetch('/api/endless').then((r) => r.json()));
    const title = async () => (await page.locator('.bar-day').innerText()).replace(/\s+/g, ' ');

    await page.goto(`${server.url}/dev/as/eve?to=/game.html`);
    await page.evaluate(() => fetch('/api/tutorial-done', { method: 'POST', body: '{}' }));
    await page.goto(`${server.url}/game.html`);
    await page.waitForSelector('.levels');
    await shot(page, '01-level-list-with-endless');
    await page.locator('.level-endless').click();
    await page.waitForSelector('.endless');
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'endless') {
      problems.push('endless theme not applied');
    }
    await shot(page, '02-hub-new-climb', true);
    await page.locator('.climb-go').click();
    await page.waitForSelector('.play');
    await shot(page, '03-level-1-empty', true);

    // Climb through the UI. Stage 1 clean, with one failed test on level 4.
    let fuseShot = false;
    for (let guard = 0; guard < 60; guard++) {
      const view = await current();
      if (view.level > 14 && view.fuses > 0) break;
      if (!(await title()).toLowerCase().includes(`level ${view.level}`)) {
        problems.push(`header says "${await title()}" on level ${view.level}`);
      }
      if (view.fuses === 0) await shot(page, `06-early-level-${String(view.level).padStart(2, '0')}`, true);
      const misses =
        view.level === 4 && view.fuses === 0 ? 1 : view.level >= 11 && view.fuses === 0 ? 2 : 0;
      let fused = false;
      for (const wrong of wrongOnes(view.board, misses)) {
        await place(page, view.board, wrong);
        await power(page);
        if (view.level === 4) await shot(page, '05-level-4-failed-test', true);
        if ((await page.locator('.btn-report').count()) > 0) {
          // The fuse has blown: the board offers a fix and the way back.
          await shot(page, '09-fuse-blown', true);
          await page.getByText('Show a fix').click();
          await shot(page, '10-fuse-fix', true);
          fuseShot = true;
          fused = true;
          break;
        }
      }
      if (!fused) {
        await place(page, view.board, winFor(view.board));
        if (view.level === 2) await shot(page, '04-level-2-filled', true);
        await power(page);
        if (view.level === 1) await shot(page, '04-level-1-cleared', true);
        if (view.level === 10) await shot(page, '06-level-10-cleared-stage-done', true);
      }
      await page.locator('.btn-report').click();
      await page.waitForTimeout(120);
      const next = await current();
      if (view.level === 10) {
        if (next.level !== 11 || next.burned !== 0) problems.push(`stage 2 opened at ${next.level} with ${next.burned} burned`);
        await shot(page, '07-level-11-stage-2', true);
      }
      if (fused) {
        if (next.level !== 11 || next.burned !== 0 || next.fuses !== 1) {
          problems.push(`after the fuse: level ${next.level}, burned ${next.burned}, fuses ${next.fuses}`);
        }
        await shot(page, '11-back-at-stage-start', true);
      }
    }
    if (!fuseShot) problems.push('the fuse never blew in stage 2');
    const afterUi = await current();
    if (afterUi.best < 12) problems.push(`UI climb only reached ${afterUi.best}`);

    // Leave for the hub mid-stage, then come back.
    await page.locator('.icon-btn[aria-label="Endless overview"]').click();
    await page.waitForSelector('.endless');
    await shot(page, '12-hub-mid-climb', true);

    // Later stages: jump there, check the board fits, clear it through the UI.
    for (const level of [21, 26, 41, 61, 71, 76, 81, 95, 110, 125, 140]) {
      await page.evaluate((l) => fetch(`/dev/endless?level=${l}`), level);
      await page.goto(`${server.url}/game.html`);
      await page.waitForSelector('.levels');
      await page.locator('.level-endless').click();
      await page.waitForSelector('.endless');
      if (level === 76) await shot(page, '13-hub-level-76', true);
      await page.locator('.climb-go').click();
      await page.waitForSelector('.play');
      const view = await current();
      if (view.level !== level) problems.push(`jump to ${level} landed on ${view.level}`);
      const tag = String(level).padStart(3, '0');
      await shot(page, `20-level-${tag}-empty`, true);
      // Flip a switch by hand on the way.
      await page.locator('.switch').nth(0).click();
      await place(page, view.board, winFor(view.board));
      await shot(page, `20-level-${tag}-filled`, true);
      await power(page);
      await shot(page, `20-level-${tag}-cleared`, true);
      await page.locator('.btn-report').click();
      await page.waitForTimeout(150);
      const next = await current();
      if (next.level !== level + 1) problems.push(`level ${level} did not advance through the UI`);
      if (!(await title()).toLowerCase().includes(`level ${level + 1}`)) {
        problems.push(`after level ${level} the header says "${await title()}"`);
      }
    }

    // Leaderboards, with other climbers on them.
    await page.evaluate(() => fetch('/dev/endless-seed?n=14'));
    await page.locator('.icon-btn[aria-label="Endless overview"]').click();
    await page.waitForSelector('.endless');
    await page.getByRole('button', { name: 'Leaders' }).click();
    await page.waitForSelector('.ranks');
    await shot(page, '30-leaders-today');
    await page.getByRole('tab', { name: 'This week' }).click();
    await page.waitForTimeout(300);
    await page.waitForSelector('.ranks');
    await shot(page, '31-leaders-week');
    const rows = await page.locator('.rank').count();
    if (rows < 5) problems.push(`weekly leaderboard shows ${rows} rows`);
    if ((await page.locator('.rank.is-you').count()) !== 1) problems.push('player missing from the weekly leaderboard');

    // Back out: the daily boards get their own colours back.
    await page.locator('.icon-btn[aria-label="Back"]').click();
    await page.locator('.icon-btn[aria-label="Back to today\'s boards"]').click();
    await page.waitForSelector('.levels');
    if (await page.evaluate(() => document.documentElement.dataset.theme)) problems.push('endless theme leaked into the daily boards');

    // Logged out: the climb lives in the browser.
    await page.goto(`${server.url}/dev/as/guest?to=/game.html`);
    await page.evaluate(() => window.localStorage.setItem('gatecrash:practice-done', '1'));
    await page.goto(`${server.url}/game.html`);
    await page.waitForSelector('.levels');
    await page.locator('.level-endless').click();
    await page.waitForSelector('.endless');
    await page.locator('.climb-go').click();
    await page.waitForSelector('.play');
    for (let i = 0; i < 3; i++) {
      const run = await page.evaluate(() => window.localStorage.getItem('gatecrash:endless'));
      const level: number = run ? JSON.parse(run).level : 1;
      const week: number = run ? JSON.parse(run).week : -1;
      const { generateEndless, weekIndexOf } = await import('../src/shared/endless');
      const { utcDayIndex } = await import('../src/shared/day');
      const board = generateEndless({ week: week >= 0 ? week : weekIndexOf(utcDayIndex(Date.now())), level, retry: 0 });
      await place(page, board, winFor(board));
      await power(page);
      await page.locator('.btn-report').click();
      await page.waitForTimeout(120);
    }
    await page.locator('.icon-btn[aria-label="Endless overview"]').click();
    await page.waitForSelector('.endless');
    await shot(page, '40-guest-hub', true);
    const guest = await page.evaluate(() => window.localStorage.getItem('gatecrash:endless'));
    if (!guest || JSON.parse(guest).level !== 4) problems.push(`guest climb not saved: ${guest}`);

    // Desktop, for the wide layout.
    const desk = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const wide = await desk.newPage();
    await wide.goto(`${server.url}/dev/as/eve?to=/game.html`);
    await wide.waitForSelector('.levels');
    await wide.locator('.level-endless').click();
    await wide.waitForSelector('.endless');
    await wide.locator('.climb-go').click();
    await wide.waitForSelector('.play');
    await wide.waitForTimeout(400);
    await wide.screenshot({ path: path.join(OUT, '50-desktop-level.png') });
  } finally {
    await browser.close();
    await server.close();
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\nEndless mode played end to end; screenshots in ${OUT}. Every board fits 360x640.`);
};

await main();
