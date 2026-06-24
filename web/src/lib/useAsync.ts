"use client";

import { useCallback, useEffect, useState } from "react";

interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

// Minimal data-loading hook: runs `fn` on mount and whenever `deps` change, exposing
// loading/error/data plus a `reload` to re-run on demand (e.g. after a mutation).
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: null });

  // fn is intentionally not in the dep list — callers pass an inline closure; deps drive reruns.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Something went wrong.";
          setState({ loading: false, error: message, data: null });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const cancel = run();
    return cancel;
  }, [run]);

  return { ...state, reload: run };
}
