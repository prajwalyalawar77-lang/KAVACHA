import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import DocumentTable from '../../../components/DocumentTable';
import { DocumentSelect, useDocumentOptions } from '../../../components/DocumentSelect';
import Icon from '../../../components/Icon';
import { DoughnutChart, LineChart } from '../../../components/Charts';
import {
  Alert, ErrorState, LoadingBlock, Note, PageHeader, Panel, Segmented, StatCard, StatusBadge,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { DOC_KIND_LABELS } from '../../../utils/constants';
import { cx, fmtMoney, fmtNumber } from '../../../utils/format';

function ExpiryList({ title, rows, tone, emptyText }) {
  return (
    <div>
      <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title} · {rows.length}</p>
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/app/documents/${row.id}`} className={cx('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]', tone === 'rose' ? 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200 hover:bg-rose-400/10' : 'border-amber-400/20 bg-amber-400/[0.06] text-amber-200 hover:bg-amber-400/10')}>
                <span className="min-w-0">
                  <span className="block truncate">{row.name}</span>
                  <span className="block text-[9px] opacity-70">{DOC_KIND_LABELS[row.doc_kind] || row.doc_kind}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[10px]">{row.expiry_date}</span>
                  <span className="block text-[9px] opacity-80">{row.days_remaining < 0 ? `${Math.abs(row.days_remaining)}d overdue` : `${row.days_remaining}d left`}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-[10.5px] text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

export default function IndustrialPortalPage() {
  useDocumentTitle('Industrial portal');
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const { data: orgData } = useApiResource('/admin/organisations', undefined, { enabled: isAdmin });
  const organisations = orgData?.organisations || [];
  const [orgId, setOrgId] = useState(null);
  const effectiveOrg = isAdmin ? orgId || organisations[0]?.id || null : null;

  const [horizon, setHorizon] = useState(60);
  const [invoiceId, setInvoiceId] = useState(null);
  const [poId, setPoId] = useState(null);
  const [poResult, setPoResult] = useState(null);
  const [poBusy, setPoBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scopeParams = useMemo(() => (effectiveOrg ? { organisation_id: effectiveOrg } : {}), [effectiveOrg]);
  const { data, loading, error, reload } = useApiResource('/industrial/dashboard', scopeParams, { enabled: !isAdmin || Boolean(effectiveOrg) });
  const { data: expiry, loading: expiryLoading } = useApiResource('/industrial/expiry-alerts', { days: horizon, ...scopeParams }, { enabled: !isAdmin || Boolean(effectiveOrg) });
  const { documents: analysedDocs, loading: docsLoading } = useDocumentOptions({ portal: 'industrial', status: 'analysed', perPage: 100 });

  const counts = data?.counts || {};
  const monthly = data?.monthly || [];
  const supplierStatus = data?.supplier_status || {};
  const documentTypes = data?.document_types || [];

  const runPoCheck = async () => {
    if (!invoiceId || !poId) return;
    setPoBusy(true);
    setPoResult(null);
    try {
      const { data: result } = await api.post('/industrial/po-check', { invoice_id: invoiceId, po_id: poId });
      setPoResult(result);
      const failed = (result.checks || []).filter((check) => check.status === 'failed').length;
      if (failed) toast.warning('PO check found mismatches', `${failed} check(s) did not match. Reconcile against the original documents.`);
      else toast.success('PO check complete', 'Extracted values are consistent.');
    } catch (err) {
      toast.error('PO check failed', err.message);
    } finally {
      setPoBusy(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const { data: result } = await api.post('/industrial/expiry-scan', { horizon_days: horizon, ...scopeParams });
      toast.success('Expiry scan complete', `${result.notifications_created ?? 0} new notification(s) for ${result.scanned ?? 0} document(s) in the ${result.horizon_days}-day horizon.`);
      reload();
    } catch (err) {
      toast.error('Expiry scan failed', err.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Industrial document intelligence"
        title={isAdmin ? 'Industrial overview' : user?.organisation?.name || 'Industrial portal'}
        subtitle="Supplier onboarding, invoice and PO consistency, certificate expiry and risk review — with every score tied to evidence."
        actions={
          <>
            {isAdmin && organisations.length > 0 && (
              <select className="select !w-auto" value={effectiveOrg || ''} onChange={(e) => setOrgId(Number(e.target.value))} aria-label="Organisation">
                {organisations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            )}
            <Link to="/app/suppliers" className="btn-ghost"><Icon name="users" size={14} /> Suppliers</Link>
            <Link to="/app/fraud" className="btn-secondary"><Icon name="flag" size={14} /> Fraud intelligence</Link>
          </>
        }
      />

      {isAdmin && !effectiveOrg && organisations.length === 0 && (
        <Alert tone="info" title="No organisations yet">Create an industrial account or seed demo data to use the industrial workspace.</Alert>
      )}

      {loading && !data && <LoadingBlock label="Loading industrial dashboard…" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Documents in workspace" value={fmtNumber(counts.total_documents)} icon="file" tone="accent" hint={`${fmtNumber(counts.analysed)} analysed`} to="/app/documents?portal=industrial" />
            <StatCard label="Verified (low risk)" value={fmtNumber(counts.verified_low_risk)} icon="check" tone="emerald" hint="Threshold-derived bucket" to="/app/documents?risk=low" />
            <StatCard label="Requires review" value={fmtNumber((counts.requires_review || 0) + (counts.high_risk || 0))} icon="alert" tone="amber" hint={`${fmtNumber(counts.high_risk)} high or critical`} to="/app/documents?risk=high" />
            <StatCard label="Expiry attention" value={fmtNumber((counts.expiring_60d || 0) + (counts.expired || 0))} icon="calendar" tone="rose" hint={`${fmtNumber(counts.expired)} expired · ${fmtNumber(counts.expiring_60d)} within 60d`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            <Panel title="Verification trend" subtitle="Last six months of analysed documents" icon="chart">
              <LineChart
                labels={monthly.map((row) => row.month)}
                series={[
                  { label: 'Analysed', data: monthly.map((row) => row.analysed), color: '#22d3ee' },
                  { label: 'Verified (low)', data: monthly.map((row) => row.verified), color: '#34d399' },
                  { label: 'High risk', data: monthly.map((row) => row.high_risk), color: '#fb923c' },
                ]}
                height={240}
              />
            </Panel>
            <Panel title="Supplier status" subtitle="Behavioural status from verification evidence" icon="building" action={<Link to="/app/suppliers" className="btn-ghost btn-sm">Manage</Link>}>
              <div className="grid gap-3 sm:grid-cols-2">
                <DoughnutChart
                  labels={['Verified', 'Pending', 'Review', 'Flagged']}
                  values={['verified', 'pending', 'review_required', 'flagged'].map((key) => Number(supplierStatus[key] || 0))}
                  colors={['rgba(52,211,153,0.85)', 'rgba(251,191,36,0.8)', 'rgba(251,146,60,0.8)', 'rgba(248,113,113,0.8)']}
                  height={150}
                  centerValue={fmtNumber(supplierStatus.total || 0)}
                  centerLabel="suppliers"
                />
                <div className="space-y-1">
                  {['verified', 'pending', 'review_required', 'flagged'].map((key) => (
                    <div key={key} className="flex items-center justify-between text-[10.5px]">
                      <StatusBadge status={key} />
                      <span className="font-mono text-slate-300">{fmtNumber(supplierStatus[key] || 0)}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[9.5px] leading-relaxed text-slate-500">A supplier is never labelled fraudulent from an anomaly alone.</p>
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Recent documents" subtitle="Highest-risk analysed documents" icon="file" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">History</Link>}>
              <DocumentTable documents={data.top_documents || []} compact />
            </Panel>
            <div className="space-y-4">
              <Panel title="Document mix" subtitle="Analysed documents by type" icon="layers">
                {documentTypes.length ? (
                  <DoughnutChart
                    labels={documentTypes.map((row) => DOC_KIND_LABELS[row.kind] || row.kind)}
                    values={documentTypes.map((row) => row.count)}
                    colors={['rgba(34,211,238,0.8)', 'rgba(52,211,153,0.75)', 'rgba(251,191,36,0.75)', 'rgba(251,146,60,0.75)', 'rgba(167,139,250,0.75)', 'rgba(96,165,250,0.75)', 'rgba(148,163,184,0.6)']}
                    height={190}
                  />
                ) : <p className="py-8 text-center text-xs text-slate-500">No analysed documents yet.</p>}
              </Panel>
              <Panel title="Top suppliers by trust" subtitle="Heuristic trust scores with flags" icon="users" action={<Link to="/app/suppliers" className="btn-ghost btn-sm">List</Link>}>
                {(data.top_suppliers || []).length ? (
                  <ul className="space-y-1.5">
                    {data.top_suppliers.map((supplier) => (
                      <li key={supplier.id}>
                        <Link to={`/app/suppliers/${supplier.id}`} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 hover:border-accent-400/20">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] text-slate-200">{supplier.name}</span>
                            <span className="block truncate font-mono text-[9px] text-slate-500">{supplier.gstin || 'No GSTIN'}</span>
                          </span>
                          <StatusBadge status={supplier.status} />
                          <span className="font-mono text-[10px] text-slate-300">{supplier.trust_score ?? '—'}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="py-6 text-center text-xs text-slate-500">No suppliers with trust scores yet.</p>}
              </Panel>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Certificate expiry"
              subtitle="From extracted or entered expiry dates"
              icon="calendar"
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  <Segmented options={[{ value: 30, label: '30d' }, { value: 60, label: '60d' }, { value: 90, label: '90d' }, { value: 180, label: '180d' }]} value={horizon} onChange={setHorizon} />
                  <button type="button" className="btn-ghost btn-sm" onClick={runScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button>
                </div>
              }
            >
              {expiryLoading && !expiry ? (
                <LoadingBlock label="Loading expiry schedule…" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ExpiryList title="Expired" rows={expiry?.expired || []} tone="rose" emptyText="No expired documents." />
                  <ExpiryList title={`Expiring within ${expiry?.horizon_days || horizon} days`} rows={expiry?.expiring || []} tone="amber" emptyText="No upcoming expiries in this horizon." />
                </div>
              )}
              {expiry?.note && <Note className="mt-3">{expiry.note}</Note>}
            </Panel>

            <Panel title="Invoice ↔ purchase order check" subtitle="Compare extracted values across two analysed documents" icon="compare">
              <div className="grid gap-2 sm:grid-cols-2">
                <DocumentSelect label="Invoice" documents={analysedDocs} loading={docsLoading} value={invoiceId} onChange={setInvoiceId} excludeIds={poId ? [poId] : []} />
                <DocumentSelect label="Purchase order" documents={analysedDocs} loading={docsLoading} value={poId} onChange={setPoId} excludeIds={invoiceId ? [invoiceId] : []} />
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" className="btn-secondary btn-sm" onClick={runPoCheck} disabled={poBusy || !invoiceId || !poId || invoiceId === poId}>
                  {poBusy ? 'Checking…' : 'Run PO check'}
                </button>
              </div>
              {poResult && (
                <div className="mt-3 space-y-2">
                  {(poResult.checks || []).map((check) => (
                    <div key={check.code} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={check.status} />
                        <span className="text-[11px] font-medium text-slate-200">{check.label}</span>
                      </div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{check.message}</p>
                      {(check.invoice_value || check.po_value) && (
                        <div className="mt-1 flex flex-wrap gap-2 font-mono text-[9.5px] text-slate-500">
                          {check.invoice_value && <span>invoice: {typeof check.invoice_value === 'number' ? fmtMoney(check.invoice_value) : String(check.invoice_value)}</span>}
                          {check.po_value && <span>PO: {typeof check.po_value === 'number' ? fmtMoney(check.po_value) : String(check.po_value)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {poResult.note && <Note>{poResult.note}</Note>}
                </div>
              )}
              {!poResult && <p className="mt-3 text-[10px] text-slate-500">Matching compares extracted PO number, total, supplier name and date order. It does not confirm that the PO exists in any external system.</p>}
            </Panel>
          </div>

          {!!(data.recent_alerts || []).length && (
            <Panel title="Recent open alerts" subtitle="Indicators requiring reconciliation" icon="flag" padded={false} action={<Link to="/app/fraud" className="btn-ghost btn-sm">Queue</Link>}>
              <ul className="divide-y divide-white/[0.06]">
                {data.recent_alerts.map((alert) => (
                  <li key={alert.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <StatusBadge status={alert.severity} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{alert.title}</span>
                    {alert.document_id && <Link to={`/app/documents/${alert.document_id}`} className="text-[10px] text-accent-300 hover:text-accent-200">Document</Link>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {data.definitions && (
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(data.definitions).map(([key, text]) => (
                <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">{key.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          )}
          {data.disclaimer && <Note>{data.disclaimer}</Note>}
        </div>
      )}
    </div>
  );
}
