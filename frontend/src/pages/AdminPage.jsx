import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDebounced, useDocumentTitle } from '../hooks/useApiResource';
import DocumentTable from '../components/DocumentTable';
import Icon from '../components/Icon';
import { BarChart, RiskDistributionChart } from '../components/Charts';
import {
  ErrorState, LoadingBlock, Note, PageHeader, Pagination, Panel, StatCard, StatusBadge, Tabs,
} from '../components/ui';
import { api } from '../services/api';
import { ROLE_LABELS } from '../utils/constants';
import { formatDate, formatDateTime, fmtNumber, timeAgo } from '../utils/format';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'organisations', label: 'Organisations' },
  { key: 'audit', label: 'Audit trail' },
];

function OverviewTab() {
  const { data, loading, error, reload } = useApiResource('/admin/overview');
  if (loading && !data) return <LoadingBlock label="Loading platform overview…" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const { users = {}, documents = {}, alerts = {}, risk = {}, monthly_documents = [] } = data;
  const distribution = risk.distribution || {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={fmtNumber(users.total)} icon="users" tone="accent" hint={`${fmtNumber(users.active)} active · ${fmtNumber(users.by_role?.industrial || 0)} industrial`} />
        <StatCard label="Organisations" value={fmtNumber(data.organisations)} icon="building" tone="slate" hint="Industrial accounts" />
        <StatCard label="Documents" value={fmtNumber(documents.total)} icon="file" tone="emerald" hint={`${fmtNumber(documents.analysed)} analysed · ${fmtNumber(documents.processing)} processing`} />
        <StatCard label="Open alerts" value={fmtNumber(alerts.open)} icon="flag" tone="rose" hint={`${fmtNumber(alerts.total)} total · ${fmtNumber(data.reports)} reports`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Monthly document intake" subtitle="Platform-wide uploads by month" icon="chart">
          {monthly_documents.length ? (
            <BarChart
              labels={monthly_documents.map((row) => row.month)}
              series={[{ label: 'Documents', data: monthly_documents.map((row) => row.documents), color: 'rgba(34,211,238,0.7)' }]}
              height={230}
            />
          ) : <p className="py-10 text-center text-xs text-slate-500">No documents uploaded yet.</p>}
        </Panel>
        <Panel title="Risk distribution" subtitle={`Average score ${risk.average_score ?? '—'}`} icon="gauge">
          <RiskDistributionChart distribution={distribution} height={180} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent documents" subtitle="Across all organisations" icon="layers" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">All</Link>}>
          <DocumentTable documents={data.recent_documents || []} showOwner compact />
        </Panel>
        <Panel title="Recent audit activity" subtitle="Security-relevant events" icon="audit" padded={false} action={<Link to="/app/admin?tab=audit" className="btn-ghost btn-sm">Full trail</Link>}>
          {(data.recent_audit || []).length ? (
            <ul className="divide-y divide-white/[0.06]">
              {data.recent_audit.map((log) => (
                <li key={log.id} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9.5px] text-accent-300">{log.action}</span>
                    <span className="ml-auto text-[9px] text-slate-500">{timeAgo(log.created_at)}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-400">{log.user_name || 'System'} · {log.entity_type || '—'} {log.entity_id ? `#${log.entity_id}` : ''}</p>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-8 text-center text-xs text-slate-500">No audit events recorded yet.</p>}
        </Panel>
      </div>
    </div>
  );
}

function UsersTab() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const params = useMemo(() => {
    const value = { page, per_page: 20 };
    if (debounced.trim()) value.q = debounced.trim();
    if (role) value.role = role;
    if (active) value.active = active;
    return value;
  }, [page, debounced, role, active]);

  const { data, meta, loading, error, reload } = useApiResource('/admin/users', params);
  const users = data?.users || [];
  useEffect(() => setPage(1), [debounced, role, active]);

  const update = async (user, payload) => {
    setBusyId(user.id);
    try {
      await api.patch(`/admin/users/${user.id}`, payload);
      toast.success('User updated', `${user.email} · ${Object.keys(payload).join(', ')}`);
      reload();
    } catch (err) {
      toast.error('Could not update the user', err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
          </div>
          <select className="select !w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role filter">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="select !w-auto" value={active} onChange={(e) => setActive(e.target.value)} aria-label="Active filter">
            <option value="">Any status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </Panel>

      <Panel padded={false}>
        {loading && !users.length && <LoadingBlock label="Loading users…" />}
        {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {!loading && !error && !users.length && <p className="px-4 py-10 text-center text-xs text-slate-500">No users match this view.</p>}
        {!!users.length && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[880px]">
              <thead>
                <tr><th>User</th><th>Role</th><th>Organisation</th><th>Documents</th><th>Last login</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="text-[12px] font-medium text-slate-200">{user.full_name}</p>
                      <p className="font-mono text-[9.5px] text-slate-500">{user.email}</p>
                    </td>
                    <td>
                      <select
                        className="select !w-auto !py-1 text-[10px]"
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(e) => update(user, { role: e.target.value })}
                        aria-label={`Role for ${user.email}`}
                      >
                        {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[160px] truncate text-[10.5px] text-slate-400">{user.organisation?.name || '—'}</td>
                    <td className="font-mono text-[10.5px] text-slate-300">{fmtNumber(user.document_count || 0)}</td>
                    <td className="whitespace-nowrap text-[10px] text-slate-400">{user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'}</td>
                    <td><StatusBadge status={user.is_active ? 'passed' : 'dismissed'} /></td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost btn-sm !py-0.5 !text-[9.5px]"
                        disabled={busyId === user.id}
                        onClick={() => update(user, { is_active: !user.is_active })}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <div className="border-t border-white/[0.06] px-4 pb-3"><Pagination page={meta.page} pages={meta.pages} total={meta.total} onChange={setPage} /></div>}
      </Panel>
      <Note>Role changes and deactivations are recorded in the audit trail. At least one active administrator must always remain.</Note>
    </div>
  );
}

function OrganisationsTab() {
  const { data, loading, error, reload } = useApiResource('/admin/organisations');
  const organisations = data?.organisations || [];
  return (
    <div>
      {loading && !data && <LoadingBlock label="Loading organisations…" />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {!loading && !organisations.length && <div className="card p-8 text-center text-xs text-slate-500">No organisations have been created yet.</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {organisations.map((org) => (
          <div key={org.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-slate-100">{org.name}</p>
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-slate-500">{org.org_type || 'Organisation'}</p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-300"><Icon name="building" size={15} /></span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-[8.5px] uppercase tracking-[0.14em] text-slate-500">Members</p>
                <p className="font-mono text-[12px] text-slate-200">{fmtNumber(org.member_count || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-[8.5px] uppercase tracking-[0.14em] text-slate-500">Documents</p>
                <p className="font-mono text-[12px] text-slate-200">{fmtNumber(org.document_count || 0)}</p>
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-[10px] text-slate-400">
              <p className="font-mono">GSTIN {org.gstin || '—'}</p>
              <p className="font-mono">PAN {org.pan || '—'}</p>
              <p className="truncate">{org.email || 'No contact email'}</p>
              <p className="truncate">{org.address || 'No address on record'}</p>
            </div>
            <p className="mt-2 text-[9px] text-slate-600">Created {formatDate(org.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const [action, setAction] = useState('');
  const debounced = useDebounced(action, 350);
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const value = { page, per_page: 30 };
    if (debounced.trim()) value.action = debounced.trim();
    if (entityType.trim()) value.entity_type = entityType.trim();
    return value;
  }, [page, debounced, entityType]);
  const { data, meta, loading, error, reload } = useApiResource('/admin/audit-logs', params);
  useEffect(() => setPage(1), [debounced, entityType]);
  const logs = data?.logs || [];

  return (
    <div className="space-y-4">
      <Panel bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Filter by action, e.g. document.delete" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter action" />
          </div>
          <input className="input !w-auto" placeholder="Entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Filter entity type" />
        </div>
      </Panel>
      <Panel padded={false}>
        {loading && !logs.length && <LoadingBlock label="Loading audit trail…" />}
        {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {!loading && !error && !logs.length && <p className="px-4 py-10 text-center text-xs text-slate-500">No audit entries match this filter.</p>}
        {!!logs.length && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th>Metadata</th></tr></thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap font-mono text-[10px] text-slate-400">{formatDateTime(log.created_at)}</td>
                    <td className="max-w-[160px] truncate text-[10.5px] text-slate-300">{log.user_name || 'System'}</td>
                    <td><span className="font-mono text-[10px] text-accent-300">{log.action}</span></td>
                    <td className="text-[10px] text-slate-400">{log.entity_type || '—'}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td className="font-mono text-[9.5px] text-slate-500">{log.ip_address || '—'}</td>
                    <td className="max-w-[260px]">
                      {log.meta && Object.keys(log.meta).length ? (
                        <details>
                          <summary className="cursor-pointer text-[9.5px] text-slate-500">view</summary>
                          <pre className="mt-1 max-w-[240px] overflow-auto whitespace-pre-wrap font-mono text-[8.5px] text-slate-500">{JSON.stringify(log.meta, null, 0)}</pre>
                        </details>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && <div className="border-t border-white/[0.06] px-4 pb-3"><Pagination page={meta.page} pages={meta.pages} total={meta.total} onChange={setPage} /></div>}
        {data?.note && <div className="border-t border-white/[0.06] px-4 py-2"><Note>{data.note}</Note></div>}
      </Panel>
    </div>
  );
}

export default function AdminPage() {
  useDocumentTitle('Administration');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Platform administration"
        title="Administration"
        subtitle="Platform health, user access, organisation records and a complete audit trail. Administrative access is enforced by the API."
        actions={<Link to="/app/settings" className="btn-ghost"><Icon name="settings" size={14} /> My settings</Link>}
      />
      <div className="mb-4">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'organisations' && <OrganisationsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
