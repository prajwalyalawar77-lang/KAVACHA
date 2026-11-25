import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import Icon from '../../../components/Icon';
import {
  Alert, CheckList, CheckSummary, CopyButton, ErrorState, Field, Gauge, KeyValue, LoadingBlock, Note, PageHeader,
  Panel, Pill, ProgressBar, RiskBadge, ScoreLegend, StatusBadge, Tabs,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { formatDateTime, fmtNumber } from '../../../utils/format';

const SIGNAL_STATUSES = ['', 'failed', 'warning', 'skipped'];
const CHECK_TABS = [
  { key: 'failed', label: 'Failed' },
  { key: 'warning', label: 'Warnings' },
  { key: 'passed', label: 'Passed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'unverified', label: 'Unverified' },
];

function ThresholdEditor({ thresholds, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState({
    medium: thresholds?.medium ?? 30,
    high: thresholds?.high ?? 60,
    critical: thresholds?.critical ?? 80,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put('/risk/thresholds', {
        medium: Number(values.medium),
        high: Number(values.high),
        critical: Number(values.critical),
      });
      toast.success('Thresholds updated', data?.note || 'New analyses will use these bands.');
      onSaved?.(data?.thresholds);
    } catch (err) {
      toast.error('Could not update thresholds', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {['medium', 'high', 'critical'].map((key) => (
          <Field key={key} label={key}>
            <input
              type="number"
              min={1}
              max={99}
              className="input font-mono"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <button type="button" className="btn-secondary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Apply thresholds'}</button>
    </div>
  );
}

function ThresholdCard({ thresholds, admin, onSaved }) {
  const { data, loading, reload } = useApiResource('/risk/thresholds');
  const t = thresholds || data?.thresholds || { medium: 30, high: 60, critical: 80 };
  return (
    <Panel title="Risk bands" subtitle="Configurable demonstration thresholds — not calibrated probabilities" icon="gauge">
      <div className="rounded-xl border border-white/[0.07] bg-navy-950/50 px-4 py-3">
        <ScoreLegend thresholds={t} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {['medium', 'high', 'critical'].map((key) => (
            <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-1.5">
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{key} from</p>
              <p className="font-mono text-sm text-slate-200">{t[key]}</p>
            </div>
          ))}
        </div>
      </div>
      {data && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[9.5px] text-slate-500">
          <Pill tone="slate">engine {data.engine}</Pill>
          <Pill tone={data.ml_scorer ? 'emerald' : 'slate'}>ML scorer {data.ml_scorer ? 'available' : 'not configured'}</Pill>
          {loading && <span>refreshing…</span>}
        </div>
      )}
      {data?.note && <Note className="mt-2">{data.note}</Note>}
      {admin && (
        <details className="mt-3 rounded-xl border border-accent-400/20 bg-accent-400/[0.04] p-3">
          <summary className="cursor-pointer text-[11px] font-medium text-accent-200">Adjust thresholds (administrator)</summary>
          <div className="mt-2">
            <ThresholdEditor thresholds={t} onSaved={(saved) => { reload(); onSaved?.(saved); }} />
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-slate-500">Changes apply in this process and reset on restart; set RISK_*_THRESHOLD environment variables to persist.</p>
        </details>
      )}
    </Panel>
  );
}

function RiskPicker() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiResource('/documents', { status: 'analysed', per_page: 12, sort: 'risk', direction: 'desc' });
  return (
    <div>
      <PageHeader
        eyebrow="Explainable AI risk assessment"
        title="Risk assessment"
        subtitle="Every score is assembled from weighted, transparent signals. Missing checks reduce confidence instead of counting as passes."
        backTo="/app/dashboard"
        actions={<Link to="/app/documents" className="btn-ghost"><Icon name="history" size={14} /> History</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Analysed documents" subtitle="Open a document to see its full signal breakdown" icon="gauge" padded={false}>
          {loading && <LoadingBlock label="Loading documents…" />}
          {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
          {!loading && !(data?.documents || []).length && <p className="px-4 py-10 text-center text-xs text-slate-500">No analysed documents yet.</p>}
          <ul className="divide-y divide-white/[0.06]">
            {(data?.documents || []).map((doc) => (
              <li key={doc.id}>
                <Link to={`/app/documents/${doc.id}/risk`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-slate-200">{doc.original_filename}</span>
                    <span className="block text-[10px] text-slate-500">{doc.doc_kind?.replace(/_/g, ' ')} · {formatDateTime(doc.created_at)}</span>
                  </span>
                  <RiskBadge category={doc.risk?.category} score={doc.risk?.score} showScore size="sm" />
                  <Icon name="chevronRight" size={13} className="text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <ThresholdCard admin={user?.role === 'admin'} />
      </div>
    </div>
  );
}

export default function RiskAssessmentPage() {
  const { documentId } = useParams();
  const id = documentId ? Number(documentId) : null;
  const { user } = useAuth();
  const [signalFilter, setSignalFilter] = useState('');
  const [checkTab, setCheckTab] = useState('failed');
  const [thresholds, setThresholds] = useState(null);
  useDocumentTitle('Risk assessment');

  const { data, loading, error, reload } = useApiResource(id ? `/risk/${id}` : null, undefined, { enabled: Boolean(id) });

  const grouped = data?.checks_by_status || {};
  const signals = useMemo(() => {
    const rows = (data?.risk?.signals || []).slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
    return signalFilter ? rows.filter((signal) => signal.status === signalFilter) : rows;
  }, [data, signalFilter]);

  if (!id) return <RiskPicker />;
  if (loading && !data) return <LoadingBlock label="Loading risk assessment…" />;
  if (error && !data) {
    return (
      <div>
        <PageHeader eyebrow="Risk assessment" title="Assessment unavailable" backTo={`/app/documents/${id}`} />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;

  const { document, risk, checks = [], completion = {}, evidence = {}, integrity = {} } = data;
  const counts = risk?.counts || {};
  const thresholdSource = thresholds || risk?.thresholds;
  const forensicIndicators = evidence.forensic_indicators || [];
  const metadataIndicators = evidence.metadata_indicators || [];
  const openAlerts = evidence.alerts || [];
  const currentChecks = (grouped[checkTab] || []).map((check) => ({ ...check, status: checkTab, details: check.details || {} }));
  const duplicates = integrity.exact_duplicate_of || [];

  return (
    <div>
      <PageHeader
        eyebrow="Explainable AI risk assessment"
        title={document.original_filename}
        subtitle="Threshold-driven score with a full audit trail of contributing signals, completed checks and missing evidence."
        backTo={`/app/documents/${document.id}`}
        actions={
          <>
            <Link to={`/app/documents/${document.id}/verification`} className="btn-ghost"><Icon name="check" size={14} /> Verification</Link>
            <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost"><Icon name="scan" size={14} /> Forensics</Link>
            <Link to={`/app/reports`} className="btn-secondary"><Icon name="qr" size={14} /> Reports</Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Panel title="Assessment result" subtitle={risk?.summary} icon="gauge">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Gauge score={risk?.score || 0} category={risk?.category || 'unassessed'} confidence={risk?.confidence} size={200} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge category={risk?.category} score={risk?.score} showScore size="lg" />
                  {risk?.updated_at && <span className="text-[10px] text-slate-500">updated {formatDateTime(risk.updated_at)}</span>}
                </div>
                <div className="mt-3">
                  <CheckSummary counts={counts} />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Check completion</span>
                    <span className="font-mono">{completion.completed ?? 0}/{completion.total ?? 0}</span>
                  </div>
                  <ProgressBar value={completion.total ? (completion.completed / completion.total) * 100 : 0} tone="emerald" />
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    {completion.not_completed || 0} check(s) were skipped or unverified. Missing checks are not treated as passes.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone="slate">engine {risk?.engine_version || '—'}</Pill>
              <Pill tone="slate">{checks.length} checks</Pill>
              <Pill tone="slate">{signals.length} signals</Pill>
              {data.note && <span className="text-[9.5px] text-slate-500">{data.note}</span>}
            </div>
          </Panel>

          <Panel
            title="Contributing signals"
            subtitle="Sorted by weight; each signal cites its evidence"
            icon="alert"
            padded={false}
            action={
              <select className="select !w-auto !py-1 text-[10px]" value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)} aria-label="Filter signals">
                <option value="">All statuses</option>
                {SIGNAL_STATUSES.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            }
          >
            {signals.length ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[700px]">
                  <thead>
                    <tr><th>Signal</th><th>Module</th><th>Status</th><th>Severity</th><th className="text-right">Weight</th></tr>
                  </thead>
                  <tbody>
                    {signals.map((signal) => (
                      <tr key={signal.code}>
                        <td className="max-w-[360px]">
                          <p className="text-[11.5px] font-medium text-slate-200">{signal.title}</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{signal.explanation}</p>
                          {signal.evidence && Object.keys(signal.evidence).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(signal.evidence).slice(0, 5).map(([key, value]) => (
                                <span key={key} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                                  {key}: {(value && typeof value === 'object' ? JSON.stringify(value) : String(value)).slice(0, 60)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-[10px] text-slate-500">{signal.module}</td>
                        <td><StatusBadge status={signal.status} /></td>
                        <td><StatusBadge status={signal.severity} /></td>
                        <td className="text-right font-mono text-[11px] text-slate-300">{Number(signal.weight || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-xs text-slate-500">No signals match this filter.</p>
            )}
          </Panel>

          <Panel title="Checks by status" subtitle="Each check records what was evaluated and why" icon="check">
            <Tabs
              tabs={CHECK_TABS.map((tab) => ({ ...tab, count: (grouped[tab.key] || []).length }))}
              active={checkTab}
              onChange={setCheckTab}
            />
            <div className="mt-2">
              <CheckList checks={currentChecks} emptyText={`No ${CHECK_TABS.find((tab) => tab.key === checkTab)?.label.toLowerCase()} checks.`} />
            </div>
          </Panel>

          <Panel title="Evidence trail" subtitle="Raw indicators behind the score" icon="layers">
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Forensic indicators · {forensicIndicators.length}</p>
                {forensicIndicators.length ? (
                  <ul className="space-y-1">
                    {forensicIndicators.map((indicator) => (
                      <li key={indicator.code} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={indicator.severity} />
                          <span className="text-[11px] text-slate-200">{indicator.label}</span>
                          <span className="ml-auto font-mono text-[9px] text-slate-600">{indicator.code}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{indicator.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[10.5px] text-slate-500">No forensic indicators.</p>}
              </div>
              <div>
                <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Metadata indicators · {metadataIndicators.length}</p>
                {metadataIndicators.length ? (
                  <ul className="space-y-1">
                    {metadataIndicators.map((indicator, index) => (
                      <li key={indicator.code || index} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {indicator.severity && <StatusBadge status={indicator.severity} />}
                          <span className="text-[11px] text-slate-200">{indicator.label || indicator.code || `Indicator ${index + 1}`}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{indicator.detail || indicator.message || JSON.stringify(indicator)}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[10.5px] text-slate-500">No metadata indicators.</p>}
                <Note className="mt-1">Metadata irregularities are investigative hints, never proof of forgery.</Note>
              </div>
              <div>
                <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Open alerts · {openAlerts.length}</p>
                {openAlerts.length ? (
                  <ul className="space-y-1">
                    {openAlerts.map((alert) => (
                      <li key={alert.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-1.5">
                        <StatusBadge status={alert.severity} />
                        <span className="text-[11px] text-slate-200">{alert.title}</span>
                        <Link to="/app/fraud" className="ml-auto text-[10px] text-accent-300 hover:text-accent-200">Queue</Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[10.5px] text-slate-500">No open alerts.</p>}
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <ThresholdCard thresholds={thresholdSource} admin={user?.role === 'admin'} onSaved={setThresholds} />

          <Panel title="Recommendations" subtitle="Next steps generated from the signals" icon="sparkles">
            {(risk?.recommendations || []).length ? (
              <ul className="space-y-2">
                {risk.recommendations.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-300">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent-400/30 bg-accent-400/10 font-mono text-[8px] text-accent-200">{index + 1}</span>
                    {typeof item === 'string' ? item : item.text || JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            ) : <p className="py-4 text-center text-xs text-slate-500">No recommendations recorded.</p>}
          </Panel>

          <Panel title="Integrity" subtitle="Fingerprints and duplicate evidence" icon="fingerprint">
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'SHA-256', mono: true, value: <span className="inline-flex items-center gap-2 break-all">{integrity.sha256 || '—'}<CopyButton value={integrity.sha256 || ''} /></span> },
                { label: 'dHash', mono: true, value: integrity.dhash || '—' },
                { label: 'Exact duplicate alerts', mono: true, value: fmtNumber(duplicates.length) },
              ]}
            />
            {duplicates.length > 0 && (
              <ul className="mt-2 space-y-1">
                {duplicates.map((item, index) => (
                  <li key={index} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[9.5px] text-slate-400">
                    {Object.entries(item || {}).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}
                  </li>
                ))}
              </ul>
            )}
            <Note className="mt-2">A matching fingerprint identifies a copy; it does not establish who created or altered it.</Note>
          </Panel>

          <Panel title="How scoring works" subtitle="Transparent weights, no black box" icon="info">
            <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-400">
              <li>Rule weights from completed checks are combined into a 0–100 score.</li>
              <li>Failed and partial checks raise the score; passed checks do not lower it artificially.</li>
              <li>Skipped or unverified checks reduce confidence rather than counting as passes.</li>
              <li>Bands are configurable demonstration thresholds, not calibrated fraud probabilities.</li>
              <li>A trained ML scorer can replace the rule engine when validated; it is labelled accordingly.</li>
            </ul>
          </Panel>

          <Panel title="Continue" subtitle="Related views" icon="arrowRight">
            <div className="grid grid-cols-2 gap-2">
              <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost btn-sm justify-start"><Icon name="scan" size={12} /> Forensics</Link>
              <Link to={`/app/documents/${document.id}/verification`} className="btn-ghost btn-sm justify-start"><Icon name="check" size={12} /> Verification</Link>
              <Link to={`/app/compare?left=${document.id}`} className="btn-ghost btn-sm justify-start"><Icon name="compare" size={12} /> Compare</Link>
              <Link to="/app/reports" className="btn-ghost btn-sm justify-start"><Icon name="qr" size={12} /> Report</Link>
            </div>
          </Panel>
        </div>
      </div>

      <Alert tone="info" title="No certainty without evidence" className="mt-4">
        The score summarises available evidence. It is not a verdict. Confirm findings against the issuing organisation and
        original records before acting, and distinguish suspicious indicators from confirmed manipulation.
      </Alert>
    </div>
  );
}
