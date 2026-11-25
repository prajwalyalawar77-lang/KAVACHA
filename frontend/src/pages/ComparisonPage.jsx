import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import { useToast } from '../context/ToastContext';
import AuthImage from '../components/AuthImage';
import { DocumentSelect, useDocumentOptions } from '../components/DocumentSelect';
import Icon from '../components/Icon';
import {
  Alert, EmptyState, ErrorState, KeyValue, LoadingBlock, Note, PageHeader, Panel, Pill, RiskBadge, StatusBadge, Tabs,
} from '../components/ui';
import { api } from '../services/api';
import { cx, formatDate, fmtNumber } from '../utils/format';

const MATCH_STATUS = { exact: 'passed', similar: 'warning', mismatch: 'failed', missing: 'skipped' };
const CHANGE_TONE = { minor: 'emerald', substantive: 'amber', major: 'rose' };

function ComparisonResult({ result }) {
  const leftId = result.left?.id;
  const artifactName = useMemo(() => {
    const raw = result.visual?.image_path || '';
    return raw ? raw.split(/[\\/]/).pop().replace(/\.png$/i, '') : null;
  }, [result.visual]);
  const changedRows = (result.diff || []).filter((row) => row.type !== 'equal');
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? result.diff : result.diff.slice(0, 160);

  return (
    <div className="space-y-4">
      <Panel title="Comparison summary" subtitle={result.summary} icon="compare">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Text similarity</p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-slate-100">{(result.text_similarity * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Change level</p>
            <p className="mt-1"><Pill tone={CHANGE_TONE[result.change_level] || 'slate'}>{result.change_level}</Pill></p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Field consistency</p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-slate-100">{result.field_consistency != null ? `${(result.field_consistency * 100).toFixed(0)}%` : '—'}</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500">dHash distance</p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-slate-100">{result.fingerprint?.hamming_distance ?? '—'}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[result.left, result.right].map((doc) => (
            <Link key={doc.id} to={`/app/documents/${doc.id}`} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 hover:border-accent-400/20">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] text-slate-200">{doc.original_filename}</span>
                <span className="block font-mono text-[9px] text-slate-500">DNA {doc.sha256?.slice(0, 12)}…</span>
              </span>
              <RiskBadge category={doc.risk?.category} size="sm" />
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Panel title="Extracted field comparison" subtitle="Exact, fuzzy and normalised matching" icon="file" padded={false}>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr><th>Field</th><th>Left</th><th>Right</th><th>Match</th></tr>
              </thead>
              <tbody>
                {(result.fields || []).map((field) => (
                  <tr key={field.field}>
                    <td className="whitespace-nowrap text-[10.5px] text-slate-400">{field.label}</td>
                    <td className="max-w-[180px] break-words font-mono text-[10px] text-slate-300">{field.left ?? '—'}</td>
                    <td className="max-w-[180px] break-words font-mono text-[10px] text-slate-300">{field.right ?? '—'}</td>
                    <td><StatusBadge status={MATCH_STATUS[field.match] || field.match} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/[0.06] px-4 py-2">
            <Note>Matching is based on extracted values. OCR differences can create apparent mismatches — confirm against originals.</Note>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Metadata comparison" subtitle="Indicative only; not proof of forgery" icon="info">
            {(result.metadata || []).length ? (
              <KeyValue
                columns={1}
                dense
                items={(result.metadata || []).map((row) => ({
                  label: `${row.label}${row.same ? ' · same' : ' · differs'}`,
                  value: <span className={cx('font-mono text-[11px]', row.same ? 'text-slate-400' : 'text-amber-300')}>{String(row.left ?? '—')} → {String(row.right ?? '—')}</span>,
                }))}
              />
            ) : <p className="py-6 text-center text-xs text-slate-500">Metadata is unavailable for one or both documents.</p>}
          </Panel>

          <Panel title="Visual difference" subtitle="Page-1 render comparison" icon="eye">
            {result.visual?.available && artifactName && leftId ? (
              <>
                <AuthImage
                  path={`/documents/${leftId}/artifacts/${artifactName}`}
                  alt="Visual difference heatmap between the two documents"
                  className="max-h-[300px] rounded-xl border border-white/[0.07]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill tone="amber">{(result.visual.changed_fraction * 100).toFixed(1)}% changed pixels</Pill>
                  {result.visual.identical && <Pill tone="emerald">visually identical</Pill>}
                </div>
                <Note className="mt-2">{result.visual.note}</Note>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">{result.visual?.note || 'Visual comparison is unavailable.'}</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Text differences"
        subtitle={`${fmtNumber(changedRows.length)} changed, inserted or removed line(s)`}
        icon="layers"
        padded={false}
        action={result.diff.length > 160 ? (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</button>
        ) : null}
      >
        {rows.length ? (
          <div className="max-h-[480px] overflow-auto font-mono text-[10px]">
            {rows.map((row, index) => (
              <div
                key={index}
                className={cx(
                  'flex gap-2 border-b border-white/[0.04] px-3 py-1',
                  row.type === 'replace' && 'bg-amber-400/[0.05]',
                  row.type === 'delete' && 'bg-rose-400/[0.05]',
                  row.type === 'insert' && 'bg-emerald-400/[0.05]',
                )}
              >
                <span className="w-8 shrink-0 text-right text-slate-600">{row.left_line ?? ''}</span>
                <span className={cx('min-w-0 flex-1 break-words', row.type === 'delete' ? 'text-rose-300' : row.left ? 'text-slate-300' : 'text-slate-600')}>{row.left || '—'}</span>
                <span className="w-8 shrink-0 text-right text-slate-600">{row.right_line ?? ''}</span>
                <span className={cx('min-w-0 flex-1 break-words', row.type === 'insert' ? 'text-emerald-300' : row.right ? 'text-slate-300' : 'text-slate-600')}>{row.right || '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-xs text-slate-500">No textual differences were detected.</p>
        )}
        <div className="border-t border-white/[0.06] px-4 py-2"><Note>{result.note}</Note></div>
      </Panel>
    </div>
  );
}

function MultiResult({ result }) {
  return (
    <div className="space-y-4">
      <Panel title="Pairwise consistency" subtitle="Field agreement across selected documents" icon="network" padded={false}>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[620px]">
            <thead><tr><th>Left</th><th>Right</th><th>Consistency</th><th>Mismatched fields</th></tr></thead>
            <tbody>
              {(result.pairs || []).map((pair, index) => {
                const mismatches = (pair.fields || []).filter((field) => field.match === 'mismatch').map((field) => field.label);
                return (
                  <tr key={index}>
                    <td className="max-w-[200px] truncate text-[10.5px] text-slate-300">{pair.left.name}</td>
                    <td className="max-w-[200px] truncate text-[10.5px] text-slate-300">{pair.right.name}</td>
                    <td className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                          <div className={cx('h-full', pair.consistency >= 0.8 ? 'bg-emerald-400' : pair.consistency >= 0.5 ? 'bg-amber-400' : 'bg-rose-400')} style={{ width: `${Math.round(pair.consistency * 100)}%` }} />
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{(pair.consistency * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="max-w-[240px] break-words text-[10px] text-slate-500">{mismatches.join(', ') || 'None'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Cross-document inconsistencies" subtitle="Fields whose values differ between at least two documents" icon="alert" padded={false}>
        {(result.inconsistencies || []).length ? (
          <ul className="divide-y divide-white/[0.06]">
            {result.inconsistencies.map((row) => (
              <li key={row.field} className="px-4 py-3">
                <p className="text-[11.5px] font-medium text-slate-200">{row.label}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {row.values.map((value) => (
                    <Link key={`${row.field}-${value.document_id}`} to={`/app/documents/${value.document_id}`} className="rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] text-slate-300 hover:border-accent-400/30">
                      #{value.document_id}: {String(value.value)}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-10 text-center text-xs text-slate-500">No cross-document inconsistencies were detected in extracted fields.</p>}
        <div className="border-t border-white/[0.06] px-4 py-2"><Note>{result.note}</Note></div>
      </Panel>
    </div>
  );
}

export default function ComparisonPage() {
  useDocumentTitle('Document comparison');
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('pair');
  const [leftId, setLeftId] = useState(Number(searchParams.get('left')) || null);
  const [rightId, setRightId] = useState(Number(searchParams.get('right')) || null);
  const [multiIds, setMultiIds] = useState([]);
  const [result, setResult] = useState(null);
  const [multiResult, setMultiResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { documents, loading: docsLoading } = useDocumentOptions({ status: 'analysed', perPage: 100 });
  const { data: history, loading: historyLoading, reload: reloadHistory } = useApiResource('/verification/comparisons');

  useEffect(() => {
    setResult(null);
    setMultiResult(null);
    setError(null);
  }, [mode]);

  const toggleMulti = (id) => {
    setMultiIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 6) return current;
      return [...current, id];
    });
  };

  const comparePair = async () => {
    if (!leftId || !rightId || leftId === rightId) {
      setError('Choose two different analysed documents.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post('/verification/compare', { left_id: leftId, right_id: rightId });
      setResult(data);
      reloadHistory();
      toast.success('Comparison complete', data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const compareMulti = async () => {
    if (multiIds.length < 2) {
      setError('Select at least two documents.');
      return;
    }
    setBusy(true);
    setError(null);
    setMultiResult(null);
    try {
      const { data } = await api.post('/verification/multi', { document_ids: multiIds });
      setMultiResult(data);
      toast.success('Multi-document comparison complete', `${(data.pairs || []).length} pair(s) evaluated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Smart document verification"
        title="Document comparison"
        subtitle="Detect alterations between versions: text similarity, extracted-field consistency, metadata differences and pixel-level change on page 1."
        backTo="/app/documents"
        actions={<Link to="/app/documents" className="btn-ghost"><Icon name="history" size={14} /> History</Link>}
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={[{ key: 'pair', label: 'Two documents' }, { key: 'multi', label: 'Multiple documents' }]}
            active={mode}
            onChange={setMode}
          />
          <span className="text-[10px] text-slate-500">Only analysed documents can be compared.</span>
        </div>

        {mode === 'pair' ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
            <DocumentSelect label="Left / original" documents={documents} loading={docsLoading} value={leftId} onChange={setLeftId} excludeIds={rightId ? [rightId] : []} />
            <div className="flex justify-center pb-1">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => { const temp = leftId; setLeftId(rightId); setRightId(temp); }}
                title="Swap documents"
                aria-label="Swap documents"
              >
                <Icon name="swap" size={14} />
              </button>
            </div>
            <DocumentSelect label="Right / revised" documents={documents} loading={docsLoading} value={rightId} onChange={setRightId} excludeIds={leftId ? [leftId] : []} />
            <button type="button" className="btn-primary" onClick={comparePair} disabled={busy || !leftId || !rightId || leftId === rightId}>
              {busy ? 'Comparing…' : 'Compare'}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] text-slate-500">Select 2–6 analysed documents ({multiIds.length}/6 selected)</p>
              <button type="button" className="btn-primary btn-sm" onClick={compareMulti} disabled={busy || multiIds.length < 2}>{busy ? 'Comparing…' : 'Run comparison'}</button>
            </div>
            {docsLoading && <LoadingBlock label="Loading documents…" />}
            {!docsLoading && !documents.length && <p className="py-6 text-center text-xs text-slate-500">No analysed documents available.</p>}
            <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {documents.map((doc) => {
                const checked = multiIds.includes(doc.id);
                const disabled = !checked && multiIds.length >= 6;
                return (
                  <label key={doc.id} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5', checked ? 'border-accent-400/35 bg-accent-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]', disabled && 'cursor-not-allowed opacity-40')}>
                    <input type="checkbox" className="h-3 w-3 accent-cyan-400" checked={checked} disabled={disabled} onChange={() => toggleMulti(doc.id)} />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-300">{doc.original_filename}</span>
                    <RiskBadge category={doc.risk?.category} size="sm" />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      </Panel>

      {result && <ComparisonResult result={result} />}
      {multiResult && <MultiResult result={multiResult} />}

      {!result && !multiResult && (
        <div className="card">
          <EmptyState
            icon="compare"
            title="No comparison yet"
            description="Choose two versions of a document to see how text, fields, metadata and pixels changed. Differences indicate alteration candidates — confirm intent and author against originals."
          />
        </div>
      )}

      <Panel className="mt-4" title="Comparison history" subtitle="Stored for organisation accounts" icon="history" padded={false}>
        {historyLoading && !history && <LoadingBlock label="Loading history…" />}
        {!historyLoading && !(history?.comparisons || []).length && <p className="px-4 py-8 text-center text-xs text-slate-500">{history?.note || 'No saved comparisons yet.'}</p>}
        {!!(history?.comparisons || []).length && (
          <ul className="divide-y divide-white/[0.06]">
            {history.comparisons.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="w-28 shrink-0 font-mono text-[10px] text-slate-500">SIM {(row.similarity * 100).toFixed(0)}%</span>
                <Link to={`/app/documents/${row.base_document_id}`} className="max-w-[220px] truncate text-[10.5px] text-slate-300 hover:text-accent-200">{row.base_name || `Document #${row.base_document_id}`}</Link>
                <Icon name="arrowRight" size={11} className="text-slate-600" />
                <Link to={`/app/documents/${row.compared_document_id}`} className="max-w-[220px] truncate text-[10.5px] text-slate-300 hover:text-accent-200">{row.compared_name || `Document #${row.compared_document_id}`}</Link>
                <span className="ml-auto text-[9.5px] text-slate-500">{formatDate(row.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
