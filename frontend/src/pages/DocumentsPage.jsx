import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiResource, useDebounced, useDocumentTitle } from '../hooks/useApiResource';
import DocumentTable from '../components/DocumentTable';
import Icon from '../components/Icon';
import {
  EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, Panel, Segmented, Spinner,
} from '../components/ui';
import { DOC_KIND_LABELS, KINDS_BY_PORTAL, PORTALS, RISK } from '../utils/constants';
import { fmtNumber } from '../utils/format';

const SORTS = [
  { key: 'created_at:desc', label: 'Newest first' },
  { key: 'created_at:asc', label: 'Oldest first' },
  { key: 'risk:desc', label: 'Highest risk' },
  { key: 'risk:asc', label: 'Lowest risk' },
  { key: 'filename:asc', label: 'Filename A–Z' },
  { key: 'status:asc', label: 'Status' },
];

const STATUSES = ['uploaded', 'processing', 'analysed', 'failed'];

export default function DocumentsPage() {
  useDocumentTitle('Document history');
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebounced(search, 350);

  const portal = searchParams.get('portal') || '';
  const kind = searchParams.get('kind') || '';
  const status = searchParams.get('status') || '';
  const risk = searchParams.get('risk') || '';
  const sort = searchParams.get('sort') || 'created_at';
  const direction = searchParams.get('direction') || 'desc';
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const page = Number(searchParams.get('page') || 1);

  const update = (patch, { resetPage = true } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    });
    if (resetPage && !('page' in patch)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const current = searchParams.get('q') || '';
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const params = useMemo(() => {
    const value = { page, per_page: 12, sort, direction };
    if (portal) value.portal = portal;
    if (kind) value.kind = kind;
    if (status) value.status = status;
    if (risk) value.risk = risk;
    if (debouncedSearch.trim()) value.q = debouncedSearch.trim();
    if (dateFrom) value.date_from = dateFrom;
    if (dateTo) value.date_to = dateTo;
    return value;
  }, [page, sort, direction, portal, kind, status, risk, debouncedSearch, dateFrom, dateTo]);

  const { data, meta, loading, error, reload } = useApiResource('/documents', params);
  const documents = data?.documents || [];
  const activeFilters = [portal, kind, status, risk, dateFrom, dateTo, debouncedSearch].filter(Boolean).length;
  const kinds = portal ? KINDS_BY_PORTAL[portal] : Object.keys(DOC_KIND_LABELS);

  return (
    <div>
      <PageHeader
        eyebrow="Document intelligence"
        title="Document history"
        subtitle="Every uploaded document with its fingerprint, risk band and investigative signals. Access is limited to documents your role permits."
        actions={
          <>
            <Link to="/app/compare" className="btn-ghost"><Icon name="compare" size={15} /> Compare</Link>
            <Link to="/app/upload" className="btn-primary"><Icon name="upload" size={15} /> Upload</Link>
          </>
        }
      />

      <Panel className="mb-4" bodyClassName="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search by filename or SHA-256 digest"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search documents"
            />
            {loading && search && <Spinner size={13} className="absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          <Segmented
            options={[{ value: '', label: 'All portals' }, ...PORTALS.map((p) => ({ value: p, label: p === 'public' ? 'Public' : 'Industrial' }))]}
            value={portal}
            onChange={(value) => update({ portal: value, kind: '' })}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <select className="select" value={kind} onChange={(e) => update({ kind: e.target.value })} aria-label="Document type">
            <option value="">All document types</option>
            {kinds.map((item) => (
              <option key={item} value={item}>{DOC_KIND_LABELS[item] || item}</option>
            ))}
          </select>
          <select className="select" value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select className="select" value={risk} onChange={(e) => update({ risk: e.target.value })} aria-label="Risk category">
            <option value="">Any risk band</option>
            {Object.entries(RISK).filter(([key]) => key !== 'unassessed').map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
          <select
            className="select"
            value={`${sort}:${direction}`}
            onChange={(e) => {
              const [nextSort, nextDirection] = e.target.value.split(':');
              update({ sort: nextSort, direction: nextDirection });
            }}
            aria-label="Sort"
          >
            {SORTS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(e) => update({ date_from: e.target.value })} aria-label="From date" />
            <span className="text-[10px] text-slate-600">→</span>
            <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(e) => update({ date_to: e.target.value })} aria-label="To date" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500">
          <p>
            {meta ? `${fmtNumber(meta.total)} document${meta.total === 1 ? '' : 's'} match this view` : 'Loading…'}
            {activeFilters ? ` · ${activeFilters} active filter${activeFilters === 1 ? '' : 's'}` : ''}
          </p>
          {activeFilters > 0 && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setSearch('');
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </Panel>

      <Panel padded={false}>
        {loading && !documents.length && <LoadingBlock label="Retrieving your documents…" />}
        {error && !loading && <div className="p-5"><ErrorState error={error} onRetry={reload} /></div>}
        {!loading && !error && documents.length === 0 && (
          <div className="p-6">
            <EmptyState
              icon="file"
              title={activeFilters ? 'No documents match these filters' : 'No documents yet'}
              description={activeFilters ? 'Adjust the search or clear filters to see more documents.' : 'Upload a PDF, JPG or PNG to start OCR, forensic analysis and risk assessment.'}
              action={<Link to={activeFilters ? '/app/documents' : '/app/upload'} className="btn-primary btn-sm">{activeFilters ? 'Reset filters' : 'Upload a document'}</Link>}
            />
          </div>
        )}
        {!!documents.length && (
          <DocumentTable documents={documents} showOwner={user?.role === 'admin'} />
        )}
        {meta && meta.pages > 1 && (
          <div className="border-t border-white/[0.06] px-5 pb-4">
            <Pagination page={meta.page} pages={meta.pages} total={meta.total} onChange={(next) => update({ page: String(next) }, { resetPage: false })} />
          </div>
        )}
      </Panel>
    </div>
  );
}
