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
    await shot(page, '04-practice-wrong-row', true);
    await power(page);
    await shot(page, '05-practice-failed', true);
    await place(page, TUTORIAL_BOARD, ['AND', 'OR']);
    await power(page);
    await shot(page, '06-practice-solved', true);
    await page.locator('.btn-report').click();

    // The day's three boards
    await page.waitForSelector('.levels');
    await shot(page, '07-levels');
    await page.locator('.level').nth(0).click();
    await page.waitForSelector('.play:not(.is-coach)');
    const init: InitResponse = await page.evaluate(() =>
      fetch('/api/init?level=easy').then((r) => r.json())
    );
    const win = solve(init.board).solutions[0];
    if (!win) throw new Error('no solution');
    await shot(page, '08-easy-empty', true);

    // Flip a switch by hand: the row on the card follows it.
    const sw = page.locator('.switch').nth(0);
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    if ((await sw.getAttribute('aria-checked')) === before) problems.push('tapping a switch did not flip it');
    await sw.click();

    // Drag the first chip of the answer from the tray onto socket 1.
    const firstChip = win[0];
    if (!firstChip) throw new Error('empty solution');
    const from = await page.locator(`.tray-chip[aria-label^="${CHIP_INFO[firstChip].label}:"]`).boundingBox();
    const to = await page.locator('.socket').nth(0).boundingBox();
    if (!from || !to) throw new Error('nothing to drag');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 30, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await shot(page, '09-dragging', true);
    await page.mouse.up();
    const seated = await page.locator('.socket').nth(0).getAttribute('aria-label');
    if (!seated?.includes(CHIP_INFO[firstChip].label)) problems.push(`drag did not seat the chip: ${seated}`);

    await place(page, init.board, wrongFor(init.board, win));
    await page.locator('.btn-power').click();
    await page.waitForSelector('.board:not(.is-running)', { timeout: 20_000 });
    await shot(page, '10-easy-failed', true);
    await get('/dev/seed?n=37&level=easy');
    await place(page, init.board, win);
    await power(page);
    await shot(page, '11-easy-solved', true);
    await page.locator('.btn-report').click();
    await page.waitForSelector('.slip');
    await page.waitForTimeout(700);
    await shot(page, '12-report');
    await page.getByRole('button', { name: 'Share result' }).click();
    await shot(page, '13-report-confirm-share');
    await page.getByRole('button', { name: 'Post as me' }).click();
    await page.waitForTimeout(500);
    await shot(page, '14-report-shared');
    await page.getByRole('button', { name: 'Leaders' }).click();
    await page.waitForSelector('.ranks, .notice');
    await shot(page, '15-leaders');
    await page.getByRole('button', { name: 'Back' }).click();

    // Medium, straight from the report
    await page.getByRole('button', { name: 'Play Medium' }).click();
    await page.waitForSelector('.play');
    const medium: InitResponse = await page.evaluate(() =>
      fetch('/api/init?level=medium').then((r) => r.json())
    );
    const mediumWin = solve(medium.board).solutions[0];
    if (!mediumWin) throw new Error('no solution');
    await place(page, medium.board, wrongFor(medium.board, mediumWin));
    await shot(page, '16-medium-filled', true);
    await page.getByRole('button', { name: "All of today's boards" }).click();
    await page.waitForSelector('.levels');
    await shot(page, '17-levels-one-done');
    await page.goto(`${server.url}/splash.html`);
    await shot(page, '18-splash-in-progress');

    // Walk forward to Sunday for the largest board, and blow its fuse.
    let today: InitResponse = init;
    for (let guard = 0; guard < 8; guard++) {
      await get('/dev/advance?days=1');
      today = (await get('/api/init?level=hard')) as InitResponse;
      if (weekdayOf(today.dayIndex) === 0) break;
    }
    await page.goto(`${server.url}/game.html`);
    await page.waitForSelector('.levels');
    await page.locator('.level').nth(2).click();
    await page.waitForSelector('.play');
    const big = today.board;
    const bigWin = solve(big).solutions[0];
    if (!bigWin) throw new Error('no solution');
    await shot(page, '19-overclock-empty', true);
    await place(page, big, wrongFor(big, bigWin));
    await page.locator('.btn-power').click();
    await page.waitForTimeout(500);
    await page.locator('.zone-board').click(); // skip the replay
    await page.waitForSelector('.board:not(.is-running)');
    await shot(page, '20-overclock-failed', true);
    await page.getByRole('button', { name: 'How to play' }).click();
    await shot(page, '21-howto');
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
    await page.getByRole('button', { name: 'All boards' }).click();
    await page.waitForSelector('.levels');
    await page.getByRole('button', { name: 'Past boards' }).click();
    await page.waitForSelector('.days');
    await shot(page, '22-archive');
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
    await wide.waitForSelector('.levels');
    await wide.locator('.level').nth(2).click();
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
