/*
 * The inline post: what people see in the feed. Plain TypeScript, no React, so
 * it paints at once. The day and date come from data stamped on the post; the
 * streak and progress arrive from one small request afterwards.
 */
import './theme/base.css';
import './theme/splash.css';

import type { SplashResponse } from '../shared/api';
import { DIFFICULTY_LABEL, difficultyFor, shortDate } from '../shared/day';
import { formatTime } from '../shared/score';
import { openGame, postDay } from './platform';

const el = (id: string): HTMLElement | null => document.getElementById(id);

const setMeta = (day: number, dayIndex: number): void => {
  const meta = el('meta');
  if (meta) {
    meta.textContent = `#${day} · ${shortDate(dayIndex)} · ${DIFFICULTY_LABEL[difficultyFor(dayIndex)]}`;
  }
};

const stamped = postDay();
if (stamped) setMeta(stamped.day, stamped.dayIndex);

const play = el('play');
play?.addEventListener('click', (event) => {
  if (!openGame(event)) {
    // Outside Reddit (local preview) there is no expanded mode: open the game page.
    window.location.assign('game.html');
  }
});

const apply = (info: SplashResponse): void => {
  setMeta(info.day, info.dayIndex);
  const streak = el('streak');
  const note = el('note');
  if (streak && info.streak > 0) {
    streak.hidden = false;
    streak.textContent = `Streak ${info.streak}`;
  }
  if (!play || !note) return;
  if (info.status === 'solved') {
    play.textContent = 'See report';
    note.textContent = `Cleared with ${info.charges} ${info.charges === 1 ? 'charge' : 'charges'} in ${formatTime(info.seconds)}`;
  } else if (info.status === 'fused') {
    play.textContent = 'See report';
    note.textContent = 'Fuse blown. A new board arrives at midnight UTC';
  } else if (info.status === 'playing') {
    play.textContent = 'Continue';
    note.textContent = `${5 - info.charges} of 5 charges left`;
  }
};

fetch('/api/splash')
  .then((res) => (res.ok ? res.json() : null))
  .then((info: SplashResponse | null) => {
    if (info) apply(info);
  })
  .catch(() => undefined); // the static splash is already complete without it
