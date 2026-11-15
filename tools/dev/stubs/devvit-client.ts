/*
 * Local stand-in for @devvit/web/client, used only by `npm run dev:local`.
 * Mirrors the handful of functions src/client/platform.ts imports.
 */
export const context = {
  subredditName: 'gatecrash_dev',
  postData: undefined as Record<string, unknown> | undefined,
};

export const requestExpandedMode = (_event: MouseEvent, entry: string): void => {
  window.location.assign(`${entry}.html`);
};

export const exitExpandedMode = (_event: MouseEvent): void => {
  window.location.assign('splash.html');
};

export const navigateTo = (url: string): void => {
  console.info('[dev] navigateTo', url);
  window.open(url, '_blank');
};

export const showToast = (toast: string | { text: string }): void => {
  const text = typeof toast === 'string' ? toast : toast.text;
  const node = document.createElement('div');
  node.textContent = text;
  node.setAttribute('data-dev-toast', '');
  node.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99;' +
    'padding:8px 14px;border-radius:999px;background:#fff;color:#111;font:600 13px system-ui;';
  document.body.append(node);
  window.setTimeout(() => node.remove(), 2500);
};

export const showLoginPrompt = (): void => {
  window.location.assign('/dev/as/ada');
};
