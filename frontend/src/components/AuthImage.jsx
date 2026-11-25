import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from './Icon';
import { Spinner } from './ui';
import { cx } from '../utils/format';

export default function AuthImage({ path, params, alt = 'Document preview', className = '', onClick, children }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const paramsKey = params ? JSON.stringify(params) : '';

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setSrc(null);
    setFailed(false);
    setLoading(true);
    if (!path) {
      setLoading(false);
      return undefined;
    }
    api
      .blob(path, params)
      .then((result) => {
        if (!active) {
          URL.revokeObjectURL(result.url);
          return;
        }
        objectUrl = result.url;
        setSrc(result.url);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey]);

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('relative flex min-h-[120px] w-full items-center justify-center overflow-hidden', className)}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center bg-navy-950/60">
          <Spinner size={22} />
        </span>
      )}
      {failed && (
        <span className="flex flex-col items-center gap-2 px-4 py-10 text-center text-slate-500">
          <Icon name="eye" size={22} />
          <span className="text-[11px]">Preview unavailable</span>
        </span>
      )}
      {src && <img src={src} alt={alt} className="h-full w-full object-contain" />}
      {children}
    </Wrapper>
  );
}

export function DownloadButton({ path, filename, params, className = 'btn-ghost btn-sm', children, label = 'Download', onError }) {
  const [busy, setBusy] = useState(false);
  const resolved = useMemo(() => filename || 'kavacha-download', [filename]);
  const run = async () => {
    setBusy(true);
    try {
      await api.download(path, resolved, params);
    } catch (error) {
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy} className={className}>
      {busy ? <Spinner size={13} /> : <Icon name="download" size={13} />}
      {children || label}
    </button>
  );
}
