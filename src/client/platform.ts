/*
 * The only file that talks to the Devvit client SDK. Everything is wrapped so a
 * missing capability (old client, local dev) degrades quietly instead of throwing.
 */
import {
  context,
  exitExpandedMode,
  navigateTo,
  requestExpandedMode,
  showLoginPrompt,
  showToast,
} from '@devvit/web/client';

const attempt = (run: () => void): boolean => {
  try {
    run();
    return true;
  } catch (error) {
    console.warn('platform call failed', error);
    return false;
  }
};

/** Open the full game. Must be called straight from a click handler. */
export const openGame = (event: MouseEvent): boolean =>
  attempt(() => requestExpandedMode(event, 'game'));

export const closeGame = (event: MouseEvent): boolean =>
  attempt(() => exitExpandedMode(event));

export const toast = (text: string): void => {
  attempt(() => showToast(text));
};

export const openUrl = (url: string): void => {
  attempt(() => navigateTo(url));
};

export const promptLogin = (): void => {
  attempt(() => showLoginPrompt());
};

/** Day info stamped on the post when it was created, readable without a server call. */
export const postDay = (): { day: number; dayIndex: number } | null => {
  try {
    const data = context.postData;
    const day = data?.day;
    const dayIndex = data?.dayIndex;
    return typeof day === 'number' && typeof dayIndex === 'number' ? { day, dayIndex } : null;
  } catch {
    return null;
  }
};

export const subredditName = (): string | null => {
  try {
    return context.subredditName ?? null;
  } catch {
    return null;
  }
};
