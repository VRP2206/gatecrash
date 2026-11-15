import { useCallback, useEffect, useState } from 'react';
import { messageOf } from '../api';

type Loaded<T> = { key: string; data: T | null; error: string | null };

/**
 * Fetch something keyed by `key`. Changing the key or calling `retry` starts
 * again; until the new answer lands `data` and `error` are both null (loading).
 */
export const useLoad = <T>(key: string, load: () => Promise<T>) => {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: '', data: null, error: null });
  const want = `${key}#${attempt}`;

  useEffect(() => {
    let live = true;
    load()
      .then((data) => {
        if (live) setLoaded({ key: want, data, error: null });
      })
      .catch((cause: unknown) => {
        if (live) setLoaded({ key: want, data: null, error: messageOf(cause) });
      });
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `want` is what identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  const current = loaded.key === want;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const patch = useCallback(
    (change: (data: T) => T) =>
      setLoaded((now) => (now.data ? { ...now, data: change(now.data) } : now)),
    []
  );
  return {
    data: current ? loaded.data : null,
    error: current ? loaded.error : null,
    retry,
    patch,
  };
};
