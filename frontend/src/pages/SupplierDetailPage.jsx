import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import { useToast } from '../context/ToastContext';
import { DocumentSelect, useDocumentOptions } from '../components/DocumentSelect';
import Icon from '../components/Icon';
import {
  Alert, ErrorState, Gauge, KeyValue, LoadingBlock, Note, PageHeader, Panel, Pill, RiskBadge, StatCard, StatusBadge,
} from '../components/ui';
import { api } from '../services/api';
import { DOC_KIND_LABELS } from '../utils/constants';
import { cx, formatDate, formatDateTime, fmtMoney, fmtNumber, timeAgo } from '../utils/format';

function categoryFor(score) {
  if (score >= 81) return 'critical';
  if (score >= 61) return 'high';
  if (score >= 31) return 'medium';
  return 'low';
}

export default function SupplierDetailPage() {
  const { supplierId } = useParams();
  const id = Number(supplierId);
  const toast = useToast();
  const [verifyDocId, setVerifyDocId] = useState(null);
  const [verification, setVerification] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const { data, loading, error: loadError, reload } = useApiResource(`/industrial/suppliers/${id}`, undefined, { enabled: Number.isFinite(id) });
  const { documents, loading: docsLoading } = useDocumentOptions({ status: 'analysed', perPage: 100 });
  useDocumentTitle(data?.supplier ? `${data.supplier.name} · Supplier` : 'Supplier');

  if (loading && !data) return <LoadingBlock label="Loading supplier profile…" />;
  if (loadError && !data) {
    return (
      <div>
        <PageHeader eyebrow="Supplier management" title="Supplier unavailable" backTo="/app/suppliers" />
        <ErrorState error={loadError} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;

  const { supplier, profile, documents: linkedDocuments = [] } = data;
  const flags = profile?.flags || [];
  const alerts = profile?.alerts || [];

  const verify = async () => {
    if (!verifyDocId) return;
    setBusy(true);
    setError(null);
    try {
      const { data: result } = await api.post(`/industrial/suppliers/${id}/verify`, { document_id: verifyDocId });
      setVerification(result);
      toast.success('Verification recorded', `Match ratio ${(result.match_ratio * 100).toFixed(0)}% · status ${result.status.replace('_', ' ')}.`);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post(`/industrial/suppliers/${id}/refresh-profile`, {});
      toast.success('Profile refreshed', 'Risk and trust scores were recomputed from current evidence.');
      reload();
    } catch (err) {
      toast.error('Could not refresh the profile', err.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Supplier intelligence"
        title={supplier.name}
        subtitle={`${supplier.gstin || 'No GSTIN on record'} · ${supplier.email || 'no email'} · ${supplier.phone || 'no phone'}`}
        backTo="/app/suppliers"
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={refresh} disabled={refreshing}>
              <Icon name="refresh" size={14} /> {refreshing ? 'Refreshing…' : 'Refresh profile'}
            </button>
            <Link to="/app/fraud" className="btn-secondary"><Icon name="network" size={14} /> Relationship graph</Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trust score" value={`${profile?.trust_score ?? supplier.trust_score}/100`} icon="shield" tone="emerald" hint="100 − heuristic risk score" />
        <StatCard label="Invoices" value={fmtNumber(profile?.invoice_count || 0)} icon="receipt" tone="accent" hint={`Average ${fmtMoney(profile?.average_invoice || 0)}`} />
        <StatCard label="Invoice total" value={fmtMoney(profile?.invoice_total || 0)} icon="chart" tone="slate" hint="Across linked invoices" />
        <StatCard label="Failed checks" value={fmtNumber(profile?.failed_check_count || 0)} icon="alert" tone="amber" hint={`${fmtNumber(profile?.alert_count || 0)} open alert(s)`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Panel title="Supplier profile" subtitle={profile?.disclaimer} icon="building">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex flex-col items-center">
                <Gauge score={profile?.risk_score || 0} category={categoryFor(profile?.risk_score || 0)} size={170} label="Risk score" />
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={supplier.status} />
                  <span className="text-[9.5px] text-slate-500">last verified {supplier.last_verified_at ? formatDate(supplier.last_verified_at) : 'never'}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Flags ({flags.length})</p>
                {flags.length ? (
                  <ul className="mt-1 space-y-1">
                    {flags.map((flag) => (
                      <li key={flag.code} className="flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-2.5 py-1 text-[10.5px] text-amber-200">
                        <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                        {flag.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[10.5px] text-slate-400">No elevated indicators detected in current evidence.</p>
                )}
                {supplier.risk_summary && <Note className="mt-2">Latest summary: {supplier.risk_summary}</Note>}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'GSTIN', mono: true, value: supplier.gstin },
                  { label: 'PAN', mono: true, value: supplier.pan },
                  { label: 'Bank account', mono: true, value: supplier.bank_account ? `••••${String(supplier.bank_account).slice(-4)}` : null },
                  { label: 'IFSC', mono: true, value: supplier.ifsc },
                ]}
              />
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'Email', value: supplier.email },
                  { label: 'Phone', mono: true, value: supplier.phone },
                  { label: 'Created', value: formatDate(supplier.created_at) },
                  { label: 'Documents', mono: true, value: fmtNumber(profile?.document_count || 0) },
                ]}
              />
            </div>
            {supplier.address && <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[10.5px] leading-relaxed text-slate-400">{supplier.address}</p>}
          </Panel>

          <Panel title="Verify against a document" subtitle="Compare supplier identifiers with extracted document values" icon="check">
            <div className="grid gap-2 sm:grid-cols-[1.7fr_1fr] sm:items-end">
              <DocumentSelect label="Analysed document" documents={documents} loading={docsLoading} value={verifyDocId} onChange={setVerifyDocId} />
              <button type="button" className="btn-primary" onClick={verify} disabled={busy || !verifyDocId}>{busy ? 'Verifying…' : 'Verify supplier'}</button>
            </div>
            {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

            {verification ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="accent">match ratio {(verification.match_ratio * 100).toFixed(0)}%</Pill>
                  <StatusBadge status={verification.status} />
                  <span className="text-[10px] text-slate-500">Trust score updated to {verification.trust_score}</span>
                </div>
                <ul className="space-y-1.5">
                  {verification.comparisons.map((row) => (
                    <li key={row.code} className={cx('rounded-lg border px-3 py-2', row.match ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-rose-400/20 bg-rose-400/[0.04]')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.match ? 'passed' : 'failed'} />
                        <span className="text-[11px] font-medium text-slate-200">{row.label}</span>
                        <span className="ml-auto font-mono text-[9px] text-slate-500">weight {row.weight}</span>
                      </div>
                      <div className="mt-1 grid gap-1 font-mono text-[10px] text-slate-400 sm:grid-cols-2">
                        <span>document: {row.document_value ?? '—'}</span>
                        <span>profile: {row.supplier_value ?? '—'}</span>
                      </div>
                      <p className="mt-0.5 text-[9.5px] text-slate-500">{row.note}</p>
                    </li>
                  ))}
                </ul>
                <Note>{verification.note}</Note>
              </div>
            ) : (
              <Note className="mt-3">Verification compares GSTIN, bank account, IFSC and supplier name from extracted document fields. No external registry lookup is performed.</Note>
            )}
          </Panel>

          <Panel title="Linked documents" subtitle="Invoices and certificates attributed to this supplier" icon="file" padded={false}>
            {linkedDocuments.length ? (
              <ul className="divide-y divide-white/[0.06]">
                {linkedDocuments.map((doc) => (
                  <li key={doc.id}>
                    <Link to={`/app/documents/${doc.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] text-slate-200">{doc.name}</span>
                        <span className="block text-[9.5px] text-slate-500">{DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind} · {formatDateTime(doc.created_at)}</span>
                      </span>
                      <StatusBadge status={doc.status === 'failed' ? 'failed_status' : doc.status} />
                      <RiskBadge category={doc.risk?.category} score={doc.risk?.score} showScore size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-8 text-center text-xs text-slate-500">No documents are attributed to this supplier yet.</p>}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Open alerts" subtitle="Indicative leads linked to this supplier" icon="flag" padded={false}>
            {alerts.length ? (
              <ul className="divide-y divide-white/[0.06]">
                {alerts.map((alert) => (
                  <li key={alert.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={alert.severity} />
                      <span className="ml-auto text-[9.5px] text-slate-500">{timeAgo(alert.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-200">{alert.title}</p>
                    <p className="text-[10px] leading-relaxed text-slate-500">{alert.description}</p>
                </li>
                ))}
              </ul>
            ) : <p className="px-4 py-8 text-center text-xs text-slate-500">No open alerts for this supplier.</p>}
          </Panel>

          <Panel title="Evidence inputs" subtitle="What feeds the supplier risk score" icon="layers">
            <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-400">
              <li>Average risk score of linked documents.</li>
              <li>Failed verification checks across those documents.</li>
              <li>Open fraud-intelligence alerts, weighted by severity.</li>
              <li>Expired certificates and critical-risk documents.</li>
              <li>Shared bank account or GSTIN with another supplier.</li>
            </ul>
            <Note className="mt-2">Scores summarise evidence. They do not accuse the supplier of fraud and should be reconciled with contracts, invoices and registry records.</Note>
          </Panel>

          <Panel title="Actions" subtitle="Related workspaces" icon="sparkles">
            <div className="grid grid-cols-2 gap-2">
              <Link to="/app/suppliers" className="btn-ghost btn-sm justify-start"><Icon name="users" size={12} /> All suppliers</Link>
              <Link to="/app/fraud" className="btn-ghost btn-sm justify-start"><Icon name="network" size={12} /> Graph</Link>
              <Link to="/app/industrial" className="btn-ghost btn-sm justify-start"><Icon name="factory" size={12} /> Industrial</Link>
              <Link to="/app/compare" className="btn-ghost btn-sm justify-start"><Icon name="compare" size={12} /> Compare docs</Link>
            </div>
          </Panel>
        </div>
      </div>

      <Alert tone="warning" title="Interpretation" className="mt-4">
        Supplier profiling is heuristic and evidence-based. Never label a supplier fraudulent based only on an anomaly;
        confirm mismatches against the original documents and the supplier before taking action.
      </Alert>
    </div>
  );
}
