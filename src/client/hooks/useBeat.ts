import { useEffect, useState } from 'react';

/** A slow shared tick (0, 1, 2, 3, 0, ...) that drives the chip glyphs. */
export const useBeat = (periodMs = 900): number => {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const id = window.setInterval(
      () => setBeat((b) => (b + 1) % 4),
      calm ? periodMs * 2.5 : periodMs
    );
    return () => window.clearInterval(id);
  }, [periodMs]);
  return beat;
};
