/*
 * npm run shots — walk every screen in a headless browser and save
 * screenshots to docs/shots/. Also fails if any play screen scrolls or
 * overflows at 360x640, which is the smallest size we promise to fit.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import type { InitResponse } from '../src/shared/api';
import { weekdayOf } from '../src/shared/day';
import { solve } from '../src/shared/solve';
import { CHIP_INFO, type Board, type FullPlacement } from '../src/shared/types';
import { TUTORIAL_BOARD } from '../src/shared/tutorial';
import { startDevServer } from './dev/server';

const OUT = path.resolve('docs/shots');
mkdirSync(OUT, { recursive: true });
const problems: string[] = [];

const shot = async (page: Page, name: string, fit = false) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (!fit) return;
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    const out: string[] = [];
    if (el.scrollHeight > window.innerHeight + 1) out.push(`page is ${el.scrollHeight}px tall`);
    if (el.scrollWidth > window.innerWidth + 1) out.push(`page is ${el.scrollWidth}px wide`);
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
  // Empty the board first, then seat each chip.
  for (let i = 0; i < board.sockets.length; i++) {
    const filled = await page.locator('.socket').nth(i).evaluate((n) => n.classList.contains('is-filled'));
    if (filled) await page.locator('.socket').nth(i).click();
  }
  for (let i = 0; i < placement.length; i++) {
    const chip = placement[i];
    if (!chip) continue;
    await page.locator(`.tray-chip[aria-label^="${CHIP_INFO[chip].label}:"]`).click();
    const held = await page.locator('.tray-chip.is-held').count();
    if (held === 0) await page.locator(`.tray-chip[aria-label^="${CHIP_INFO[chip].label}:"]`).click();
    await page.locator('.socket').nth(i).click();
  }
};

const wrongFor = (board: Board, win: FullPlacement): FullPlacement => {
  const wins = new Set(solve(board).solutions.map((s) => s.join()));
  for (let i = 0; i < win.length; i++) {
    for (let j = i + 1; j < win.length; j++) {
      const a = win[i];
      const b = win[j];
      if (!a || !b || a === b || (a === 'NOT') !== (b === 'NOT')) continue;
      const swapped = [...win];
      swapped[i] = b;
      swapped[j] = a;
      if (!wins.has(swapped.join())) return swapped;
    }
  }
  return win;
};

const power = async (page: Page) => {
  await page.locator('.btn-power').click();
  await page.waitForSelector('.board:not(.is-running)', { timeout: 20_000 });
};

const main = async () => {
  const server = await startDevServer(5183);
  const browser = await chromium.launch();
  const get = (p: string) => fetch(`${server.url}${p}`).then((r) => r.json());
  try {
    const phone = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    const page = await phone.newPage();
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });

    await page.goto(`${server.url}/dev/as/ada`);
    await shot(page, '01-splash');

    // Practice board
    await page.locator('#play').click();
    await page.waitForSelector('.play');
    await shot(page, '02-practice-start', true);
    await page.locator('.tray-chip').first().click();
    await shot(page, '03-practice-holding', true);
    await place(page, TUTORIAL_BOARD, ['OR', 'AND']);
    await shot(page, '04-practice-wrong-live-row', true);
    await power(page);
    await shot(page, '05-practice-failed', true);
    await place(page, TUTORIAL_BOARD, ['AND', 'OR']);
    await power(page);
    await shot(page, '06-practice-solved', true);
    await page.locator('.btn-report').click();

    // Today's board
    await page.waitForSelector('.play:not(.is-coach)');
    const init: InitResponse = await page.evaluate(() => fetch('/api/init').then((r) => r.json()));
    const win = solve(init.board).solutions[0];
    if (!win) throw new Error('no solution');
    await shot(page, '07-play-empty', true);
    await place(page, init.board, wrongFor(init.board, win));
    await shot(page, '08-play-filled', true);
    await page.locator('.btn-power').click();
    await page.waitForTimeout(900);
    await shot(page, '09-play-testing', true);
    await page.waitForSelector('.board:not(.is-running)', { timeout: 20_000 });
    await shot(page, '10-play-failed', true);
    await get('/dev/seed?n=37');
    await place(page, init.board, win);
    await power(page);
    await shot(page, '11-play-solved', true);
    await page.locator('.btn-report').click();
    await page.waitForSelector('.slip');
    await page.waitForTimeout(700);
    await shot(page, '12-report');
    await page.locator('.slip-btn').click();
    await shot(page, '13-report-confirm-share');
    await page.locator('.slip-btn').click();
    await page.waitForTimeout(500);
    await shot(page, '14-report-shared');
    await page.getByRole('button', { name: 'Leaders' }).click();
    await page.waitForSelector('.ranks, .notice');
    await shot(page, '15-leaders');
    await page.getByRole('tab', { name: 'Streaks' }).click();
    await shot(page, '16-leaders-streaks');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.goto(`${server.url}/splash.html`);
    await shot(page, '17-splash-solved');

    // Walk forward to Sunday for the largest board, blowing a fuse on the way.
    let today: InitResponse = init;
    for (let guard = 0; guard < 8; guard++) {
      await get('/dev/advance?days=1');
      today = (await get('/api/init')) as InitResponse;
      if (weekdayOf(today.dayIndex) === 0) break;
    }
    await page.goto(`${server.url}/game.html`);
    await page.waitForSelector('.play');
    const big = today.board;
    const bigWin = solve(big).solutions[0];
    if (!bigWin) throw new Error('no solution');
    await shot(page, '18-overclock-empty', true);
    await place(page, big, wrongFor(big, bigWin));
    await shot(page, '19-overclock-filled', true);
    await page.locator('.btn-power').click();
    await page.waitForTimeout(500);
    await page.locator('.zone-board').click(); // skip the replay
    await page.waitForSelector('.board:not(.is-running)');
    await shot(page, '20-overclock-failed', true);
    await page.getByRole('button', { name: 'How to play' }).click();
    await shot(page, '21-howto');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Past boards' }).click();
    await page.waitForSelector('.days');
    await shot(page, '22-archive');
    await page.getByRole('button', { name: 'Back' }).click();

    // Blow the fuse: four more distinct wrong placements.
    const wins = new Set(solve(big).solutions.map((s) => s.join()));
    const tried = new Set([wrongFor(big, bigWin).join()]);
    const pool: FullPlacement[] = [];
    const walk = (left: string[], placed: FullPlacement) => {
      if (pool.length > 40) return;
      const socket = big.sockets[placed.length];
      if (!socket) {
        if (!wins.has(placed.join()) && !tried.has(placed.join())) pool.push([...placed]);
        return;
      }
      const seen = new Set<string>();
      left.forEach((chip, i) => {
        const typed = big.tray.find((c) => c === chip);
        if (!typed || seen.has(chip) || (chip === 'NOT') !== (socket.inputs.length === 1)) return;
        seen.add(chip);
        walk([...left.slice(0, i), ...left.slice(i + 1)], [...placed, typed]);
      });
    };
    walk([...big.tray], []);
    for (const attempt of pool.slice(0, 4)) {
      await place(page, big, attempt);
      await page.locator('.btn-power').click();
      await page.waitForTimeout(300);
      await page.locator('.zone-board').click();
      await page.waitForSelector('.board:not(.is-running)');
    }
    await shot(page, '23-fuse-blown', true);
    await page.getByRole('button', { name: 'Show a fix' }).click();
    await shot(page, '24-fuse-fix', true);
    await page.locator('.btn-report').click();
    await page.waitForSelector('.slip');
    await page.waitForTimeout(700);
    await shot(page, '25-report-fuse');
    await phone.close();

    // Logged out
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const guestPage = await anon.newPage();
    await guestPage.goto(`${server.url}/dev/as/guest?to=/game.html`);
    await guestPage.waitForSelector('.play');
    await shot(guestPage, '26-guest-practice-390x844', true);
    await anon.close();

    // Desktop expanded modal
    const desk = await browser.newContext({ viewport: { width: 1120, height: 680 }, deviceScaleFactor: 1 });
    const wide = await desk.newPage();
    await wide.goto(`${server.url}/dev/as/bea?to=/splash.html`);
    await wide.setViewportSize({ width: 720, height: 512 });
    await shot(wide, '27-splash-desktop-inline');
    await wide.setViewportSize({ width: 1120, height: 680 });
    await wide.goto(`${server.url}/game.html`);
    await wide.waitForSelector('.play');
    await place(wide, TUTORIAL_BOARD, ['AND', 'OR']);
    await power(wide);
    await wide.locator('.btn-report').click();
    await wide.waitForSelector('.play:not(.is-coach)');
    await place(wide, big, wrongFor(big, bigWin));
    await shot(wide, '28-desktop-overclock', true);
    await desk.close();
  } finally {
    await browser.close();
    await server.close();
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Screens saved to ${OUT}; every play screen fits its viewport.`);
  }
};

await main();
