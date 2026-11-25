import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDebounced, useDocumentTitle } from '../hooks/useApiResource';
import Icon from '../components/Icon';
import {
  Alert, ErrorState, Field, LoadingBlock, Modal, Note, PageHeader, Pagination, Panel, StatusBadge,
} from '../components/ui';
import { api } from '../services/api';
import { cx, formatDate, fmtNumber } from '../utils/format';

const EMPTY_FORM = {
  name: '', gstin: '', pan: '', ifsc: '', bank_account: '', email: '', phone: '', address: '',
};

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'review_required', label: 'Review required' },
  { value: 'flagged', label: 'Flagged' },
];

function SupplierForm({ value, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <Field label="Supplier name *" className="sm:col-span-2">
        <input className="input" value={value.name} onChange={set('name')} placeholder="Registered supplier name" required />
      </Field>
      <Field label="GSTIN" hint="Validated structurally and with the GSTIN checksum.">
        <input className="input font-mono" value={value.gstin} onChange={(e) => onChange({ ...value, gstin: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" />
      </Field>
      <Field label="PAN">
        <input className="input font-mono" value={value.pan} onChange={(e) => onChange({ ...value, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
      </Field>
      <Field label="Bank account">
        <input className="input font-mono" value={value.bank_account} onChange={set('bank_account')} placeholder="9–18 digits" />
      </Field>
      <Field label="IFSC">
        <input className="input font-mono" value={value.ifsc} onChange={(e) => onChange({ ...value, ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" />
      </Field>
      <Field label="Email">
        <input type="email" className="input" value={value.email} onChange={set('email')} placeholder="accounts@supplier.example" />
      </Field>
      <Field label="Phone">
        <input className="input" value={value.phone} onChange={set('phone')} placeholder="+91 80 0000 0000" />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <textarea className="textarea" rows={2} value={value.address} onChange={set('address')} placeholder="Registered address" />
      </Field>
    </div>
  );
}

export default function SuppliersPage() {
  useDocumentTitle('Suppliers');
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const { data: orgData } = useApiResource('/admin/organisations', undefined, { enabled: isAdmin });
  const organisations = orgData?.organisations || [];
  const [orgId, setOrgId] = useState(null);
  const effectiveOrg = isAdmin ? orgId || organisations[0]?.id || null : null;

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const value = { page, per_page: 20 };
    if (debounced.trim()) value.q = debounced.trim();
    if (status) value.status = status;
    if (effectiveOrg) value.organisation_id = effectiveOrg;
    return value;
  }, [page, debounced, status, effectiveOrg]);

  const { data, meta, loading, error, reload } = useApiResource('/industrial/suppliers', params, { enabled: !isAdmin || Boolean(effectiveOrg) });
  const suppliers = data?.suppliers || [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => setPage(1), [debounced, status]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setWarnings([]);
    setFormOpen(true);
  };

  const openEdit = (supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name || '',
      gstin: supplier.gstin || '',
      pan: supplier.pan || '',
      ifsc: supplier.ifsc || '',
      bank_account: supplier.bank_account || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    });
    setFormError(null);
    setWarnings([]);
    setFormOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setFormError('Enter the supplier name.');
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      const payload = { ...form };
      if (effectiveOrg) payload.organisation_id = effectiveOrg;
      if (editing) {
        await api.patch(`/industrial/suppliers/${editing.id}`, payload);
        toast.success('Supplier updated');
        setFormOpen(false);
      } else {
        const { data: created } = await api.post('/industrial/suppliers', payload);
        setWarnings(created?.warnings || []);
        toast.success('Supplier added', 'Records begin as pending until verified against a document.');
        if (!(created?.warnings || []).length) setFormOpen(false);
      }
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Supplier management"
        title="Suppliers"
        subtitle="Onboard supplier records, validate identifiers and verify them against uploaded documents. External registry lookups are not performed unless configured."
        actions={
          <>
            {isAdmin && organisations.length > 0 && (
              <select className="select !w-auto" value={effectiveOrg || ''} onChange={(e) => setOrgId(Number(e.target.value))} aria-label="Organisation">
                {organisations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            )}
            <Link to="/app/industrial" className="btn-ghost"><Icon name="factory" size={14} /> Industrial portal</Link>
            <button type="button" className="btn-primary" onClick={openCreate} disabled={isAdmin && !effectiveOrg}>
              <Icon name="plus" size={14} /> Add supplier
            </button>
          </>
        }
      />

      <Panel padded={false} className="mb-4" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Search supplier name or GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppliers" />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatus(item.value)}
                className={cx('rounded-lg border px-2.5 py-1.5 text-[10.5px] transition', status === item.value ? 'border-accent-400/35 bg-accent-400/10 text-accent-200' : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-slate-200')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        {loading && !suppliers.length && <LoadingBlock label="Loading suppliers…" />}
        {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {!loading && !error && !suppliers.length && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-slate-500">No suppliers match this view. Add a supplier to begin onboarding and verification.</p>
          </div>
        )}
        {!!suppliers.length && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr><th>Supplier</th><th>Status</th><th>Trust</th><th>Invoices</th><th>Alerts</th><th>Last verified</th><th /></tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <Link to={`/app/suppliers/${supplier.id}`} className="text-[12px] font-medium text-slate-200 hover:text-accent-200">{supplier.name}</Link>
                      <p className="font-mono text-[9.5px] text-slate-500">{supplier.gstin || 'No GSTIN'} · {supplier.email || 'No email'}</p>
                    </td>
                    <td><StatusBadge status={supplier.status} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
                          <div className={cx('h-full', supplier.trust_score >= 75 ? 'bg-emerald-400' : supplier.trust_score >= 45 ? 'bg-amber-400' : 'bg-rose-400')} style={{ width: `${Math.max(0, Math.min(100, supplier.trust_score || 0))}%` }} />
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{supplier.trust_score ?? '—'}</span>
                      </div>
                    </td>
                    <td className="font-mono text-[10.5px] text-slate-300">{fmtNumber(supplier.invoice_count || 0)}</td>
                    <td className="font-mono text-[10.5px] text-slate-300">{fmtNumber(supplier.alert_count || 0)}</td>
                    <td className="text-[10.5px] text-slate-400">{supplier.last_verified_at ? formatDate(supplier.last_verified_at) : 'Never'}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(supplier)}>Edit</button>
                        <Link to={`/app/suppliers/${supplier.id}`} className="btn-ghost btn-sm">Open <Icon name="chevronRight" size={11} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.pages > 1 && (
          <div className="border-t border-white/[0.06] px-4 pb-3">
            <Pagination page={meta.page} pages={meta.pages} total={meta.total} onChange={setPage} />
          </div>
        )}
      </Panel>

      <Note className="mt-3">
        Trust scores summarise verification evidence and check outcomes. A low score is a prompt for review, not a finding of fraud.
      </Note>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add a supplier'}
        description={editing ? 'Update identifiers and contact details. Status changes come from verification, not manual edits.' : 'Records are created as pending. Verify against an analysed document to raise the trust score.'}
        icon={editing ? 'settings' : 'plus'}
        wide
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)} disabled={formBusy}>Cancel</button>
            <button type="submit" form="supplier-form" className="btn-primary" disabled={formBusy}>{formBusy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={submit} className="space-y-3">
          <SupplierForm value={form} onChange={setForm} />
          {formError && <Alert tone="danger">{formError}</Alert>}
          {!!warnings.length && (
            <Alert tone="warning" title="Structural validation warnings">
              <ul className="list-inside list-disc space-y-1">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </Alert>
          )}
          {editing && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <input type="checkbox" className="h-3.5 w-3.5 accent-cyan-400" checked={Boolean(form.mark_verified)} onChange={(e) => setForm({ ...form, mark_verified: e.target.checked })} />
              <span className="text-[11px] text-slate-300">Record a manual verification timestamp (does not change status)</span>
            </label>
          )}
          <Note>No government registry or bank API is queried. GSTIN, PAN, IFSC and account fields are validated locally for structure and checksum only.</Note>
        </form>
      </Modal>
    </div>
  );
}
