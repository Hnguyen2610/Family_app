import { useCallback, useEffect, useState, type DependencyList } from 'react';

type AsyncState<T> = {
  data: T | null;
  isLoading: boolean;
  error: unknown;
};

/**
 * Shared fetch-on-mount/deps-change pattern: loading/error/data state plus a
 * cancellation guard against setting state after unmount.
 */
export function useAsync<T>(fetchFn: () => Promise<T>, deps: DependencyList = []): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, isLoading: true, error: null });
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));

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
