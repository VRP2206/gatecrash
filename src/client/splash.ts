/*
 * The inline post: what people see in the feed. Plain TypeScript, no React, so
 * it paints at once. The day and date come from data stamped on the post; the
 * streak and progress arrive from one small request afterwards.
 */
import './theme/base.css';
import './theme/splash.css';

import type { SplashResponse } from '../shared/api';
import { shortDate } from '../shared/day';
import { LEVEL_LABEL } from '../shared/types';
import { openGame, postDay } from './platform';

const el = (id: string): HTMLElement | null => document.getElementById(id);

const setMeta = (day: number, dayIndex: number): void => {
  const meta = el('meta');
  if (meta) meta.textContent = `#${day} · ${shortDate(dayIndex)} · three boards`;
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
  const levels = el('levels');
  if (streak && info.streak > 0) {
    streak.hidden = false;
    streak.textContent = `Streak ${info.streak}`;
  }
  if (levels) {
    levels.hidden = false;
    levels.replaceChildren(
      ...info.levels.map((l) => {
        const item = document.createElement('li');
        item.className = `splash-level is-${l.status}`;
        const mark =
          l.status === 'solved' ? `${l.charges}⚡` : l.status === 'fused' ? '✕' : l.status === 'playing' ? '…' : '';
        item.textContent = mark ? `${LEVEL_LABEL[l.level]} ${mark}` : LEVEL_LABEL[l.level];
        return item;
      })
    );
  }
  if (!play || !note) return;
  const done = info.levels.filter((l) => l.status === 'solved' || l.status === 'fused').length;
  const started = info.levels.some((l) => l.status !== 'new');
  if (done === info.levels.length) {
    play.textContent = 'See reports';
    note.textContent = 'All three done. New boards arrive at midnight UTC';
  } else if (started) {
    play.textContent = 'Continue';
    note.textContent = `${done} of ${info.levels.length} boards done today`;
  }
};

fetch('/api/splash')
  .then((res) => (res.ok ? res.json() : null))
  .then((info: SplashResponse | null) => {
    if (info) apply(info);
  })
  .catch(() => undefined); // the static splash is already complete without it
