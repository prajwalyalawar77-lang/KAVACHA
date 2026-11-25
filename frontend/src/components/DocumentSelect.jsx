import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../hooks/useApiResource';
import { DOC_KIND_LABELS } from '../utils/constants';
import { formatDate, cx } from '../utils/format';
import { Field, RiskBadge, Spinner } from './ui';

export function useDocumentOptions({ portal, status = 'analysed', perPage = 100 } = {}) {
  const params = useMemo(() => {
    const next = { per_page: perPage };
    if (status) next.status = status;
    if (portal) next.portal = portal;
    return next;
  }, [portal, status, perPage]);
  const { data, loading, error, reload } = useApiResource('/documents', params);
  const documents = data?.documents || [];
  return { documents, loading, error, reload };
}

export function DocumentSelect({
  label = 'Document',
  documents = [],
  loading = false,
  value,
  onChange,
  excludeIds = [],
  hint,
  placeholder = 'Select an analysed document…',
  required = false,
  className = '',
  disabled = false,
}) {
  const excluded = new Set(excludeIds.map(Number));
  const options = documents.filter((doc) => !excluded.has(Number(doc.id)));
  const selected = options.find((doc) => Number(doc.id) === Number(value));
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        <select
          className="select"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          disabled={disabled || loading}
          required={required}
        >
          <option value="">{loading ? 'Loading documents…' : placeholder}</option>
          {options.map((doc) => (
            <option key={doc.id} value={doc.id}>
              #{doc.id} · {doc.original_filename} · {DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind}
              {doc.risk?.score !== undefined ? ` · risk ${Math.round(doc.risk.score)}` : ''}
            </option>
          ))}
        </select>
        {loading && <Spinner size={13} className="absolute right-8 top-3" />}
      </div>
      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <RiskBadge category={selected.risk?.category || 'unassessed'} score={selected.risk?.score} size="sm" />
          <span>{DOC_KIND_LABELS[selected.doc_kind] || selected.doc_kind}</span>
          <span className="text-slate-600">·</span>
          <span>Uploaded {formatDate(selected.created_at)}</span>
          <Link to={`/app/documents/${selected.id}`} className="link ml-auto inline-flex items-center gap-1">
            Open
          </Link>
        </div>
      )}
      {!loading && !options.length && (
        <p className="mt-2 text-[11px] text-amber-300/90">
          No analysed documents available yet. Upload and analyse a document first.
        </p>
      )}
    </Field>
  );
}

export function DocumentLine({ doc, showKind = true, className = '' }) {
  if (!doc) return null;
  return (
    <span className={cx('flex min-w-0 items-center gap-2', className)}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400">
        <span className="font-mono text-[9px] uppercase">{(doc.mime_type || '').includes('pdf') ? 'PDF' : 'IMG'}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-slate-200">{doc.original_filename || doc.name}</span>
        {showKind && (
          <span className="block text-[10px] uppercase tracking-wider text-slate-500">
            {DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind || doc.kind}
          </span>
        )}
      </span>
    </span>
  );
}
