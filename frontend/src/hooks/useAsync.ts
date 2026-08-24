import { useCallback, useEffect, useState, type DependencyList } from 'react';

type AsyncState<T> = {
  data: T | null;
  isLoading: boolean;
  error: unknown;
};

/**
 * Shared "fetch on mount/deps-change" pattern: loading/error/data state + cancellation guard
 * against setting state after unmount. Replaces the hand-rolled
 * useState(data)+useState(loading)+useState(error)+useEffect(cancelled-flag) boilerplate
 * repeated across several components (WeatherBadge, etc).
 */
export function useAsync<T>(fetchFn: () => Promise<T>, deps: DependencyList = []): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, isLoading: true, error: null });
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Only show isLoading on the first fetch (no data yet) — a refetch() after data has
    // already loaded stays silent, matching how the hand-rolled versions this replaces
    // behaved (they only ever set isLoading on mount, not on their imperative refetch calls
    // after a create/update/delete).
    setState((prev) => ({ ...prev, isLoading: prev.data === null }));

    fetchFn()
      .then((data) => {
        if (!cancelled) setState({ data, isLoading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState((prev) => ({ ...prev, isLoading: false, error }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refetchTick]);

  const refetch = useCallback(() => setRefetchTick((tick) => tick + 1), []);

  return { ...state, refetch };
}
