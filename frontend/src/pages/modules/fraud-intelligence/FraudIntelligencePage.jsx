import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import { useToast } from '../../../context/ToastContext';
import { BarChart, RiskDistributionChart } from '../../../components/Charts';
import Icon from '../../../components/Icon';
import {
  Alert, ErrorState, LoadingBlock, Note, PageHeader, Pagination, Panel, RiskBadge, StatCard, StatusBadge,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { ALERT_TYPE_LABELS } from '../../../utils/constants';
import { cx, fmtNumber, timeAgo } from '../../../utils/format';

const NODE_STYLE = {
  organisation: { fill: '#22d3ee', label: 'Organisation' },
  supplier: { fill: '#34d399', label: 'Supplier' },
  bank_account: { fill: '#fbbf24', label: 'Bank account' },
  gstin: { fill: '#a78bfa', label: 'GSTIN' },
  invoice: { fill: '#60a5fa', label: 'Invoice' },
  document: { fill: '#94a3b8', label: 'Document' },
  alert: { fill: '#f87171', label: 'Alert' },
};
const RING_ORDER = ['organisation', 'supplier', 'gstin', 'bank_account', 'invoice', 'document', 'alert'];
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

function GraphView({ nodes, edges }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [selected, setSelected] = useState(null);

  const presentTypes = useMemo(() => RING_ORDER.filter((type) => nodes.some((node) => node.type === type)), [nodes]);
  const visibleNodes = useMemo(() => nodes.filter((node) => !hidden.has(node.type)), [nodes, hidden]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const layout = useMemo(() => {
    const positions = new Map();
    const width = 820;
    const height = 560;
    const cx = width / 2;
    const cy = height / 2;
    presentTypes.forEach((type, ringIndex) => {
      const ringNodes = visibleNodes.filter((node) => node.type === type);
      if (!ringNodes.length) return;
      const radiusX = 95 + ringIndex * 52;
      const radiusY = (95 + ringIndex * 52) * 0.62;
      ringNodes.forEach((node, index) => {
        const angle = (-Math.PI / 2) + (index / ringNodes.length) * Math.PI * 2 + ringIndex * 0.35;
        positions.set(node.id, {
          x: cx + Math.cos(angle) * radiusX,
          y: cy + Math.sin(angle) * radiusY,
          node,
        });
      });
    });
    return { positions, width, height };
  }, [visibleNodes, presentTypes]);

  const selectedNode = selected ? nodes.find((node) => node.id === selected) : null;
  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    edges.forEach((edge) => {
      if (edge.source === selected) set.add(edge.target);
      if (edge.target === selected) set.add(edge.source);
    });
    return set;
  }, [selected, edges]);

  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {presentTypes.map((type) => {
          const count = nodes.filter((node) => node.type === type).length;
          const active = !hidden.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                const next = new Set(hidden);
                if (active) next.add(type); else next.delete(type);
                setHidden(next);
              }}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9.5px] transition',
                active ? 'border-white/15 bg-white/[0.05] text-slate-200' : 'border-white/[0.06] text-slate-600 line-through',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: NODE_STYLE[type]?.fill }} />
              {NODE_STYLE[type]?.label || type} · {count}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-navy-950/60">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-[420px] w-full" onClick={() => setSelected(null)} role="img" aria-label="Fraud intelligence relationship graph">
          <defs>
            <radialGradient id="graphGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.10)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0)" />
            </radialGradient>
          </defs>
          <rect width={layout.width} height={layout.height} fill="url(#graphGlow)" />
          {visibleEdges.map((edge, index) => {
            const from = layout.positions.get(edge.source);
            const to = layout.positions.get(edge.target);
            if (!from || !to) return null;
            const highlighted = neighbours && (edge.source === selected || edge.target === selected);
            return (
              <line
                key={`${edge.source}-${edge.target}-${edge.relation}-${index}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={highlighted ? 'rgba(226,232,240,0.65)' : 'rgba(148,163,184,0.18)'}
                strokeWidth={highlighted ? 1.4 : 0.8}
                strokeDasharray={edge.relation === 'raised' ? '3 3' : undefined}
              />
            );
          })}
          {[...layout.positions.values()].map(({ x, y, node }) => {
            const style = NODE_STYLE[node.type] || { fill: '#94a3b8', label: node.type };
            const radius = node.type === 'organisation' ? 11 : node.type === 'alert' ? 7 : node.type === 'document' ? 6 : 8;
            const dimmed = neighbours && !neighbours.has(node.id);
            const isSelected = selected === node.id;
            return (
              <g
                key={node.id}
                onClick={(event) => { event.stopPropagation(); setSelected(node.id); }}
                className="cursor-pointer"
                opacity={dimmed ? 0.25 : 1}
              >
                <circle cx={x} cy={y} r={radius + (isSelected ? 5 : 0)} fill={style.fill} fillOpacity={isSelected ? 0.35 : 0.18} stroke={style.fill} strokeWidth={isSelected ? 2 : 1} />
                <circle cx={x} cy={y} r={radius * 0.4} fill={style.fill} />
                {(node.type === 'organisation' || node.type === 'supplier' || node.type === 'alert' || isSelected) && (
                  <text x={x} y={y - radius - 6} textAnchor="middle" className="fill-slate-300" style={{ fontSize: 8.5 }}>
                    {String(node.label || '').slice(0, 24)}
                  </text>
                )}
                <title>{`${node.label} (${node.type})`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <Note>Click a node to trace its connections. Shared banks, GSTINs and copied documents are investigative leads, not proof of fraud.</Note>
        {selectedNode && (
          <div className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2.5 sm:w-64">
            <p className="text-[11px] font-medium text-slate-200">{selectedNode.label}</p>
            <p className="text-[9.5px] uppercase tracking-wider text-slate-500">{selectedNode.type}{selectedNode.risk != null ? ` · risk ${Math.round(selectedNode.risk)}` : ''}</p>
            <div className="mt-1 space-y-0.5">
              {Object.entries(selectedNode.meta || {}).map(([key, value]) => (
                <p key={key} className="truncate font-mono text-[9px] text-slate-400">{key}: {String(value)}</p>
              ))}
            </div>
            {selectedNode.type === 'document' && (
              <Link to={`/app/documents/${selectedNode.id.split(':')[1]}`} className="mt-1.5 inline-block text-[10px] font-medium text-accent-300 hover:text-accent-200">
                Open document →
              </Link>
            )}
            {selectedNode.type === 'supplier' && (
              <Link to={`/app/suppliers/${selectedNode.id.split(':')[1]}`} className="mt-1.5 inline-block text-[10px] font-medium text-accent-300 hover:text-accent-200">
                Open supplier →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FraudIntelligencePage() {
  useDocumentTitle('Fraud intelligence');
  const toast = useToast();
  const [alertStatus, setAlertStatus] = useState('open');
  const [alertSeverity, setAlertSeverity] = useState('');
  const [page, setPage] = useState(1);
  const [busyAlert, setBusyAlert] = useState(null);
  const [rescanning, setRescanning] = useState(false);

  const { data: overview, loading, error, reload: reloadOverview } = useApiResource('/fraud/overview');
  const { data: graph, loading: graphLoading } = useApiResource('/fraud/graph', { limit: 30 });
  const alertParams = useMemo(() => {
    const params = { page, per_page: 10 };
    if (alertStatus) params.status = alertStatus;
    if (alertSeverity) params.severity = alertSeverity;
    return params;
  }, [page, alertStatus, alertSeverity]);
  const { data: alertData, meta, loading: alertsLoading, error: alertsError, reload: reloadAlerts } = useApiResource('/fraud/alerts', alertParams);

  const counts = overview?.counts || {};
  const monthly = overview?.monthly || [];
  const severityCounts = overview?.alerts_by_severity || {};
  const typeCounts = overview?.alerts_by_type || {};

  const setStatus = async (alert, status) => {
    setBusyAlert(alert.id);
    try {
      await api.patch(`/fraud/alerts/${alert.id}`, { status });
      toast.success('Alert updated', `Marked as ${status}.`);
      reloadAlerts();
      reloadOverview();
    } catch (err) {
      toast.error('Could not update the alert', err.message);
    } finally {
      setBusyAlert(null);
    }
  };

  const rescan = async () => {
    setRescanning(true);
    try {
      const { data } = await api.post('/fraud/rescan', {});
      toast.success('Invoice rescan finished', `${data?.duplicates ?? 0} repeated invoice number group(s) flagged for reconciliation.`);
      reloadOverview();
      reloadAlerts();
    } catch (err) {
      toast.error('Rescan failed', err.message);
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="AI fraud intelligence"
        title="Fraud intelligence"
        subtitle="Correlate documents, suppliers, identifiers and alerts. Every item is an investigative indicator generated from submitted data — not a finding of fraud."
        actions={
          <>
            <Link to="/app/suppliers" className="btn-ghost"><Icon name="users" size={14} /> Suppliers</Link>
            <button type="button" className="btn-secondary" onClick={rescan} disabled={rescanning}>
              <Icon name="refresh" size={14} /> {rescanning ? 'Rescanning…' : 'Rescan invoices'}
            </button>
          </>
        }
      />

      {loading && !overview && <LoadingBlock label="Loading fraud intelligence…" />}
      {error && !overview && <ErrorState error={error} onRetry={reloadOverview} />}

      {overview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Documents in scope" value={fmtNumber(counts.documents)} icon="file" tone="accent" hint={`${fmtNumber(counts.analysed)} analysed`} />
            <StatCard label="Open alerts" value={fmtNumber(counts.open_alerts)} icon="flag" tone="rose" hint="Require triage or reconciliation" />
            <StatCard label="Duplicate flags" value={fmtNumber(counts.duplicate_flags)} icon="layers" tone="amber" hint="Exact or near-identical documents" />
            <StatCard label="Suppliers in scope" value={fmtNumber(overview.supplier_status?.total || 0)} icon="building" tone="slate" hint={`${fmtNumber(overview.supplier_status?.flagged || 0)} flagged for review`} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Six-month activity" subtitle="Documents, high-risk results and alerts generated" icon="chart">
              <BarChart
                labels={monthly.map((row) => row.month)}
                series={[
                  { label: 'Documents', data: monthly.map((row) => row.documents), color: 'rgba(34,211,238,0.7)' },
                  { label: 'High risk', data: monthly.map((row) => row.high_risk), color: 'rgba(251,146,60,0.75)' },
                  { label: 'Alerts', data: monthly.map((row) => row.alerts), color: 'rgba(248,113,113,0.7)' },
                ]}
                height={240}
              />
            </Panel>
            <div className="space-y-4">
              <Panel title="Risk distribution" subtitle="Assessed documents in scope" icon="gauge">
                <RiskDistributionChart distribution={overview.risk_distribution || {}} height={150} />
              </Panel>
              <Panel title="Alert mix" subtitle="By severity and type" icon="alert">
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES.map((severity) => (
                    <span key={severity} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9.5px] text-slate-300">
                      {severity}
                      <span className="font-mono text-slate-500">{severityCounts[severity] || 0}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-2 space-y-1">
                  {Object.entries(typeCounts).length ? Object.entries(typeCounts).map(([type, value]) => (
                    <div key={type} className="flex items-center justify-between text-[10.5px]">
                      <span className="text-slate-400">{ALERT_TYPE_LABELS[type] || type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-slate-300">{value}</span>
                    </div>
                  )) : <p className="py-3 text-[10.5px] text-slate-500">No alerts generated in this scope yet.</p>}
                </div>
              </Panel>
            </div>
          </div>

          <Panel className="mt-4" title="Relationship intelligence" subtitle="Suppliers, GSTINs, bank accounts, invoices and documents in one view" icon="network">
            {graphLoading && !graph ? (
              <LoadingBlock label="Building relationship graph…" />
            ) : graph && graph.nodes?.length ? (
              <GraphView nodes={graph.nodes} edges={graph.edges} />
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">No relationship data available yet. Onboard suppliers and upload documents to build the graph.</p>
            )}
            {graph?.disclaimer && <Note className="mt-2">{graph.disclaimer}</Note>}
          </Panel>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Alert queue"
              subtitle="Indicators requiring reconciliation against source records"
              icon="flag"
              padded={false}
              action={
                <div className="flex flex-wrap gap-1.5">
                  <select className="select !w-auto !py-1 text-[10px]" value={alertStatus} onChange={(e) => { setAlertStatus(e.target.value); setPage(1); }} aria-label="Alert status">
                    <option value="open">Open</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="">All statuses</option>
                  </select>
                  <select className="select !w-auto !py-1 text-[10px]" value={alertSeverity} onChange={(e) => { setAlertSeverity(e.target.value); setPage(1); }} aria-label="Alert severity">
                    <option value="">Any severity</option>
                    {SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                  </select>
                </div>
              }
            >
              {alertsLoading && !alertData && <LoadingBlock label="Loading alerts…" />}
              {alertsError && !alertsLoading && <div className="p-4"><ErrorState error={alertsError} onRetry={reloadAlerts} /></div>}
              {!alertsLoading && !(alertData?.alerts || []).length && <p className="px-4 py-10 text-center text-xs text-slate-500">No alerts match these filters.</p>}
              {!!(alertData?.alerts || []).length && (
                <ul className="divide-y divide-white/[0.06]">
                  {alertData.alerts.map((alert) => (
                    <li key={alert.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={alert.severity} />
                        <StatusBadge status={alert.status} />
                        <span className="text-[9.5px] uppercase tracking-wider text-slate-500">{ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}</span>
                        <span className="ml-auto text-[9.5px] text-slate-500">{timeAgo(alert.created_at)}</span>
                      </div>
                      <p className="mt-1 text-[12px] font-medium text-slate-200">{alert.title}</p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-400">{alert.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {alert.document_id && (
                          <Link to={`/app/documents/${alert.document_id}`} className="btn-ghost btn-sm !py-0.5 !text-[9.5px]">{alert.document_name || `Document #${alert.document_id}`}</Link>
                        )}
                        {alert.supplier_id && (
                          <Link to={`/app/suppliers/${alert.supplier_id}`} className="btn-ghost btn-sm !py-0.5 !text-[9.5px]">{alert.supplier_name || `Supplier #${alert.supplier_id}`}</Link>
                        )}
                        {alert.status === 'open' && (
                          <span className="ml-auto flex items-center gap-1.5">
                            <button type="button" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" disabled={busyAlert === alert.id} onClick={() => setStatus(alert, 'acknowledged')}>Acknowledge</button>
                            <button type="button" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" disabled={busyAlert === alert.id} onClick={() => setStatus(alert, 'dismissed')}>Dismiss</button>
                          </span>
                        )}
                        {alert.status !== 'open' && (
                          <button type="button" className="btn-ghost btn-sm ml-auto !py-0.5 !text-[9.5px]" disabled={busyAlert === alert.id} onClick={() => setStatus(alert, 'open')}>Reopen</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {meta && meta.pages > 1 && (
                <div className="border-t border-white/[0.06] px-4 pb-3">
                  <Pagination page={meta.page} pages={meta.pages} total={meta.total} onChange={setPage} />
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Highest-risk documents" subtitle="Ordered by current risk score" icon="alert" padded={false}>
                {(overview.top_documents || []).length ? (
                  <ul className="divide-y divide-white/[0.05]">
                    {overview.top_documents.map((doc) => (
                      <li key={doc.id}>
                        <Link to={`/app/documents/${doc.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-white/[0.03]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] text-slate-200">{doc.original_filename}</span>
                            <span className="block text-[9.5px] text-slate-500">{doc.doc_kind?.replace(/_/g, ' ')}</span>
                          </span>
                          <RiskBadge category={doc.risk?.category} score={doc.risk?.score} showScore size="sm" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">No analysed documents yet.</p>
                )}
              </Panel>

              <Panel title="Supplier verification status" subtitle="Onboarded records only" icon="building">
                {overview.supplier_status?.total ? (
                  <div className="space-y-1.5">
                    {['verified', 'pending', 'review_required', 'flagged'].map((key) => (
                      <div key={key} className="flex items-center gap-2">
                        <StatusBadge status={key} />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={cx('h-full rounded-full', key === 'verified' ? 'bg-emerald-400' : key === 'flagged' ? 'bg-rose-400' : key === 'review_required' ? 'bg-orange-400' : 'bg-amber-400')}
                            style={{ width: `${Math.round(((overview.supplier_status[key] || 0) / Math.max(1, overview.supplier_status.total)) * 100)}%` }}
                          />
                        </div>
                        <span className="w-6 text-right font-mono text-[10px] text-slate-400">{overview.supplier_status[key] || 0}</span>
                      </div>
                    ))}
                    <Link to="/app/suppliers" className="btn-ghost btn-sm mt-2">Manage suppliers</Link>
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-slate-500">No suppliers onboarded in this scope.</p>
                )}
              </Panel>

              <Alert tone="warning" title="Interpretation guardrails">
                Alerts highlight anomalies such as repeated invoice numbers or shared account details. Reconcile every alert
                with accounting records and the supplier before acting. KAVACHA does not label a supplier fraudulent based
                on an anomaly alone.
              </Alert>
            </div>
          </div>

          {overview.disclaimer && <Note className="mt-4">{overview.disclaimer}</Note>}
        </>
      )}
    </div>
  );
}
