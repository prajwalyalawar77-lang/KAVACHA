import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Small data-fetching hook around the KAVACHA API envelope.
 * Returns the unwrapped `data` plus pagination `meta`.
 */
export function useApiResource(path, params, options = {}) {
  const { enabled = true, initial = null, deps = [] } = options;
  const [data, setData] = useState(initial);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const paramsKey = params ? JSON.stringify(params) : '';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (overrides) => {
      if (!path || !enabled) {
        setLoading(false);
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(path, overrides !== undefined ? overrides : params);
        if (!mounted.current) return response;
        setData(response.data);
        setMeta(response.meta);
        return response;
      } catch (err) {
        if (mounted.current) setError(err);
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, enabled, paramsKey, ...deps],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return { data, meta, loading, error, reload: load, setData };
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · KAVACHA` : 'KAVACHA · Document Trust & Fraud Intelligence';
  }, [title]);
}

export function usePolling(callback, delayMs, active = true) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!active || !delayMs) return undefined;
    const timer = setInterval(() => saved.current?.(), delayMs);
    return () => clearInterval(timer);
  }, [delayMs, active]);
}

export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
