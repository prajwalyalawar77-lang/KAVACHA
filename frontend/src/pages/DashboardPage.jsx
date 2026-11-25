import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import DocumentTable from '../components/DocumentTable';
import Icon from '../components/Icon';
import { BarChart, DoughnutChart, LineChart, RiskDistributionChart } from '../components/Charts';
import {
  ErrorState, LoadingBlock, Note, PageHeader, Panel, RiskBadge, ScoreLegend, StatCard, StatusBadge,
} from '../components/ui';
import { cx, formatDate, fmtNumber, timeAgo } from '../utils/format';

function normalizePath(path) {
  if (!path) return '/app';
  return path
    .replace('/app/fraud-intelligence', '/app/fraud')
    .replace('/app/public-safety', '/app/safety')
    .replace('/app/history', '/app/documents');
}

function QuickActions({ actions = [] }) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.path + action.label}
          to={normalizePath(action.path)}
          className={action.kind === 'primary' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
        >
          {action.label}
          <Icon name="arrowRight" size={12} />
        </Link>
      ))}
    </div>
  );
}

function IndustrialDashboard({ data }) {
  const counts = data.counts || {};
  const monthly = data.monthly || [];
  const supplierStatus = data.supplier_status || {};
  const supplierLabels = ['verified', 'pending', 'review_required', 'flagged'];
  const documentTypes = data.document_types || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents analysed" value={fmtNumber(counts.total_documents)} icon="scan" tone="accent" hint={`${fmtNumber(counts.analysed)} completed analysis`} />
        <StatCard label="Verified (low risk)" value={fmtNumber(counts.verified_low_risk)} icon="check" tone="emerald" hint="Derived from configured risk thresholds" to="/app/documents?risk=low" />
        <StatCard label="Requires review" value={fmtNumber(counts.requires_review)} icon="alert" tone="amber" hint={`${fmtNumber(counts.high_risk)} high or critical`} to="/app/documents?risk=medium" />
        <StatCard label="Open alerts" value={fmtNumber(counts.open_alerts)} icon="flag" tone="rose" hint={`${fmtNumber(counts.expiring_60d)} certificates expiring in 60 days`} to="/app/fraud" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Monthly verification statistics" subtitle="Documents analysed, low-risk results and high-risk findings over six months" icon="chart">
          <LineChart
            labels={monthly.map((row) => row.month)}
            series={[
              { label: 'Analysed', data: monthly.map((row) => row.analysed), color: '#22d3ee' },
              { label: 'Verified (low)', data: monthly.map((row) => row.verified), color: '#34d399' },
              { label: 'High risk', data: monthly.map((row) => row.high_risk), color: '#fb923c' },
            ]}
            height={250}
          />
        </Panel>
        <Panel title="Supplier verification status" subtitle="Supplier records onboarded by this organisation" icon="building" action={<Link to="/app/suppliers" className="btn-ghost btn-sm">Manage</Link>}>
          <DoughnutChart
            labels={['Verified', 'Pending', 'Review required', 'Flagged']}
            values={supplierLabels.map((key) => Number(supplierStatus[key] || 0))}
            colors={['rgba(52,211,153,0.85)', 'rgba(251,191,36,0.8)', 'rgba(251,146,60,0.8)', 'rgba(248,113,113,0.8)']}
            height={180}
            centerValue={fmtNumber(supplierStatus.total || 0)}
            centerLabel="suppliers"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {supplierLabels.map((key) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <span className="text-[10px] text-slate-400">{key.replace('_', ' ')}</span>
                <span className="font-mono text-[11px] text-slate-200">{fmtNumber(supplierStatus[key] || 0)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent documents" subtitle="Latest uploads across the industrial portal" icon="file" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">All documents</Link>}>
          <DocumentTable documents={data.recent_documents || []} compact />
        </Panel>
        <div className="space-y-4">
          <Panel title="Document mix" subtitle="Types analysed by this organisation" icon="layers">
            {documentTypes.length ? (
              <DoughnutChart
                labels={documentTypes.map((row) => row.kind.replace(/_/g, ' '))}
                values={documentTypes.map((row) => row.count)}
                colors={['rgba(34,211,238,0.8)', 'rgba(52,211,153,0.75)', 'rgba(251,191,36,0.75)', 'rgba(251,146,60,0.75)', 'rgba(167,139,250,0.75)', 'rgba(148,163,184,0.6)']}
                height={190}
              />
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">No documents analysed yet.</p>
            )}
          </Panel>
          <Panel title="Certificate expiry" subtitle="Expiry dates extracted from documents or entered by you" icon="calendar" bodyClassName="space-y-2">
            {(data.expiring_documents || []).length === 0 && (data.expired_documents || []).length === 0 && (
              <p className="text-xs text-slate-500">No expiring or expired documents in the monitored set.</p>
            )}
            {(data.expired_documents || []).map((doc) => (
              <Link key={doc.id} to={`/app/documents/${doc.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[11px] text-rose-200 hover:bg-rose-400/10">
                <span className="truncate">{doc.original_filename}</span>
                <span className="shrink-0 font-mono text-[10px]">expired {formatDate(doc.expiry_date)}</span>
              </Link>
            ))}
            {(data.expiring_documents || []).map((doc) => (
              <Link key={doc.id} to={`/app/documents/${doc.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200 hover:bg-amber-400/10">
                <span className="truncate">{doc.original_filename}</span>
                <span className="shrink-0 font-mono text-[10px]">{formatDate(doc.expiry_date)}</span>
              </Link>
            ))}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top suppliers by exposure" subtitle="Trust scores are heuristic and evidence-based — not accusations" icon="users" padded={false} action={<Link to="/app/suppliers" className="btn-ghost btn-sm">Supplier list</Link>}>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr><th>Supplier</th><th>Status</th><th>Trust</th><th>Invoices</th></tr>
              </thead>
              <tbody>
                {(data.top_suppliers || []).map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <Link to={`/app/suppliers/${supplier.id}`} className="text-[12px] font-medium text-slate-200 hover:text-accent-200">
                        {supplier.name}
                      </Link>
                      <p className="font-mono text-[9.5px] text-slate-500">{supplier.gstin || 'No GSTIN on record'}</p>
                    </td>
                    <td><StatusBadge status={supplier.status} /></td>
                    <td><span className="font-mono text-[11px] text-slate-300">{supplier.trust_score ?? '—'}</span></td>
                    <td><span className="font-mono text-[11px] text-slate-300">{supplier.invoice_count ?? 0}</span></td>
                  </tr>
                ))}
                {!(data.top_suppliers || []).length && (
                  <tr><td colSpan={4} className="py-8 text-center text-xs text-slate-500">No suppliers onboarded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Recent fraud-intelligence alerts" subtitle="Indicators generated from submitted data, not findings of fraud" icon="flag" action={<Link to="/app/fraud" className="btn-ghost btn-sm">Open queue</Link>}>
          {(data.recent_alerts || []).length ? (
            <ul className="space-y-2">
              {data.recent_alerts.slice(0, 5).map((alert) => (
                <li key={alert.id}>
                  <Link to={`/app/documents/${alert.document_id}`} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-accent-400/20">
                    <span className={cx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', alert.severity === 'high' ? 'bg-orange-400' : alert.severity === 'critical' ? 'bg-rose-400' : 'bg-amber-400')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-medium text-slate-200">{alert.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">{alert.document_name} · {timeAgo(alert.created_at)}</span>
                    </span>
                    <StatusBadge status={alert.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-xs text-slate-500">No alerts generated. Alerts appear when duplicate or repeated identifiers are detected.</p>
          )}
        </Panel>
      </div>

      <Note>{data.disclaimer || 'Buckets are derived from configurable risk thresholds, not calibrated fraud probabilities.'}</Note>
    </div>
  );
}

function AdminDashboard({ data }) {
  const counts = data.counts || {};
  const usersByRole = data.users_by_role || {};
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active platform users" value={fmtNumber(counts.users)} icon="users" tone="accent" hint={`${fmtNumber(usersByRole.industrial)} industrial · ${fmtNumber(usersByRole.public)} public`} to="/app/admin" />
        <StatCard label="Organisations" value={fmtNumber(counts.organisations)} icon="building" tone="slate" hint="Industrial accounts with a profile" />
        <StatCard label="Documents on platform" value={fmtNumber(counts.documents)} icon="file" tone="emerald" hint="Across all portals" to="/app/documents" />
        <StatCard label="Open fraud alerts" value={fmtNumber(counts.open_alerts)} icon="flag" tone="rose" hint="Investigative indicators awaiting triage" to="/app/fraud" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Risk distribution" subtitle="All assessed documents on the platform" icon="gauge">
          <RiskDistributionChart distribution={data.risk_distribution || {}} height={220} />
          <div className="mt-3">
            <ScoreLegend />
          </div>
        </Panel>
        <Panel title="Users by role" subtitle="Role-based access is enforced by the API" icon="users">
          <BarChart
            labels={Object.keys(usersByRole).map((role) => role.charAt(0).toUpperCase() + role.slice(1))}
            series={[{ label: 'Users', data: Object.values(usersByRole), color: 'rgba(34,211,238,0.75)' }]}
            height={220}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/admin" className="btn-ghost btn-sm">Manage users</Link>
            <Link to="/app/admin?tab=audit" className="btn-ghost btn-sm">Audit logs</Link>
          </div>
        </Panel>
      </div>
      <Panel title="Recent platform documents" subtitle="Latest uploads across every tenant" icon="layers" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">All documents</Link>}>
        <DocumentTable documents={data.recent_documents || []} showOwner compact />
      </Panel>
      {!!(data.recent_alerts || []).length && (
        <Panel title="Recent alerts" subtitle="Review before drawing any conclusion" icon="flag">
          <ul className="space-y-2">
            {data.recent_alerts.slice(0, 6).map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <StatusBadge status={alert.severity} />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-200">{alert.title}</span>
                <span className="text-[10px] text-slate-500">{alert.document_name}</span>
                <StatusBadge status={alert.status} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function PublicDashboard({ data }) {
  const counts = data.counts || {};
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My documents" value={fmtNumber(counts.documents)} icon="file" tone="accent" hint={`${fmtNumber(counts.analysed)} analysed`} to="/app/documents" />
        <StatCard label="Redacted copies" value={fmtNumber(counts.redacted)} icon="eye" tone="emerald" hint="Sensitive fields covered before sharing" to="/app/safety" />
        <StatCard label="Open alerts" value={fmtNumber(counts.open_alerts)} icon="flag" tone="amber" hint="Suspicious-document reports you filed" />
        <StatCard label="Retention window" value={`${fmtNumber(data.retention_days)}d`} icon="clock" tone="slate" hint="Adjust in profile settings" to="/app/settings" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <Panel title="Personal risk overview" subtitle="Documents analysed through the public portal" icon="gauge">
          <RiskDistributionChart distribution={data.risk_distribution || {}} height={220} />
        </Panel>
        <Panel title="Recent documents" subtitle="Only your account can access these files and findings" icon="scan" padded={false} action={<Link to="/app/upload" className="btn-secondary btn-sm"><Icon name="upload" size={12} /> Upload</Link>}>
          <DocumentTable documents={data.recent_documents || []} compact />
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Safety checklist" subtitle="Before you share or act on a document" icon="shield">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-300">
            {[
              'Confirm the organisation through an independent phone number or website.',
              'Be wary of upfront fees, WhatsApp-only contact and shortened links.',
              'Redact Aadhaar, PAN and account numbers before forwarding a file.',
              'Download the verification report and store it with your records.',
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-400/80" />
                {tip}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/app/safety" className="btn-secondary btn-sm">Open safety portal</Link>
            <Link to="/app/compare" className="btn-ghost btn-sm">Compare two versions</Link>
          </div>
        </Panel>
        <Panel title="Privacy commitments" subtitle="How the public portal handles personal documents" icon="lock">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-slate-400">
            <li>Files are never executed and are only served through authenticated requests.</li>
            <li>Deleting a document wipes the stored file, previews, OCR text and derived analysis.</li>
            <li>Access is limited to your account and platform administrators for support.</li>
            <li>You control whether a verification report link is created or revoked.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiResource('/dashboard');

  const role = data?.role || user?.role;
  const org = data?.organisation || user?.organisation;
  const quickActions = (data?.quick_actions || []).map((action) => ({ ...action, path: normalizePath(action.path) }));

  return (
    <div>
      <PageHeader
        eyebrow={role === 'admin' ? 'Platform administration' : role === 'industrial' ? org?.name || 'Industrial workspace' : 'Personal workspace'}
        title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'there'}`}
        subtitle={
          role === 'admin'
            ? 'Monitor platform activity, risk distribution and the fraud-intelligence queue.'
            : role === 'industrial'
              ? 'Track supplier verification, document risk and certificate expiry across your organisation.'
              : 'Review your personal documents, redact sensitive information and generate verification reports.'
        }
        actions={
          <>
            <Link to="/app/upload" className="btn-primary">
              <Icon name="upload" size={15} /> Upload document
            </Link>
            <Link to="/app/documents" className="btn-ghost">
              <Icon name="history" size={15} /> History
            </Link>
          </>
        }
      />

      {!!quickActions.length && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Quick actions</span>
          <QuickActions actions={quickActions} />
        </div>
      )}

      {loading && <LoadingBlock label="Loading your workspace…" />}
      {error && !loading && <ErrorState error={error} onRetry={reload} />}
      {!loading && data && role === 'admin' && <AdminDashboard data={data} />}
      {!loading && data && role === 'industrial' && <IndustrialDashboard data={data} />}
      {!loading && data && role === 'public' && <PublicDashboard data={data} />}

      {!loading && data?.role === 'industrial' && (
        <div className="mt-6 card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-200">Risk bands used across this workspace</p>
              <p className="mt-1 max-w-xl text-[10.5px] leading-relaxed text-slate-500">
                Thresholds are configurable demonstration values. A low score does not certify authenticity; a high score
                flags evidence for review.
              </p>
              <div className="mt-2"><ScoreLegend /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge category="low" size="sm" />
              <RiskBadge category="medium" size="sm" />
              <RiskBadge category="high" size="sm" />
              <RiskBadge category="critical" size="sm" />
            </div>
          </div>
        </div>
      )}

      {!!(data?.definitions) && (
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {Object.entries(data.definitions).map(([key, text]) => (
            <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">{key.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      )}
      {data?.role === 'public' && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] text-slate-400">
            Retention preference: documents are kept for <span className="font-medium text-slate-200">{data.retention_days} days</span> under your retention setting.
          </p>
          <Link to="/app/settings" className="text-[11px] font-medium text-accent-300 hover:text-accent-200">Change retention</Link>
        </div>
      )}
    </div>
  );
}
