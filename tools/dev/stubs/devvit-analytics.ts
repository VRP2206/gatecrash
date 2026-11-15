/* Local stand-in for @devvit/analytics/client/reddit: logs instead of sending. */
const receipt = { status: 'JOURNEY_RECEIPT_DENIED_NOT_ALLOWLISTED', message: 'dev stub' };
const log = (name: string, detail?: unknown) => {
  console.debug('[dev] journey', name, detail ?? '');
  return Promise.resolve({ receipt });
};

export const telemetry = {
  appReady: () => log('app-ready'),
  startJourney: () => log('start').then((r) => ({ ...r, journeyId: 'dev' })),
  progress: (input: unknown) => log('progress', input),
  interaction: (input: unknown) => log('interaction', input),
  endJourney: (input: unknown) => log('end', input),
};
