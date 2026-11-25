import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Icon from '../components/Icon';
import { Alert, Field, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { ORG_TYPES, ROLE_LABELS } from '../utils/constants';
import { useDocumentTitle } from '../hooks/useApiResource';
import { cx } from '../utils/format';

const emptyOrg = { name: '', org_type: 'Manufacturing', gstin: '', pan: '', address: '', email: '', phone: '', website: '' };

export default function RoleSelectPage() {
  useDocumentTitle('Choose your portal');
  const { user, selectRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [role, setRole] = useState(user?.role === 'industrial' ? 'industrial' : 'public');
  const [organisation, setOrganisation] = useState(emptyOrg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.organisation_id) return;
    api
      .get('/organisations/current')
      .then(({ data }) => {
        if (data.organisation) {
          setOrganisation({
            name: data.organisation.name || '',
            org_type: data.organisation.org_type || 'Manufacturing',
            gstin: data.organisation.gstin || '',
            pan: data.organisation.pan || '',
            address: data.organisation.address || '',
            email: data.organisation.email || '',
            phone: data.organisation.phone || '',
            website: data.organisation.website || '',
          });
        }
      })
      .catch(() => {});
  }, [user?.organisation_id]);

  const setOrg = (key, value) => setOrganisation((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (role === 'industrial' && !organisation.name.trim()) {
      setError(new Error('Organisation name is required for the industrial portal.'));
      return;
    }
    setBusy(true);
    try {
      await selectRole(role === 'industrial' ? { role, organisation } : { role });
      toast.success(`Portal switched to ${ROLE_LABELS[role]}.`);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (user?.role === 'admin') {
    return (
      <AuthLayout title="Administrator workspace" subtitle="Administrator accounts already have access to every portal." badge="Role selection">
        <Alert tone="info" title="No portal switch needed">
          Administrators can open the industrial, public-safety and fraud-intelligence modules from the sidebar.
        </Alert>
        <div className="mt-5 flex gap-2">
          <Link to="/app" className="btn-primary btn-sm">Open dashboard</Link>
          <Link to="/app/admin" className="btn-ghost btn-sm">Admin console</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose your workspace"
      subtitle="Industrial accounts unlock suppliers, purchase orders and organisation dashboards. Public accounts focus on personal documents and privacy."
      footer={
        <Link to="/app" className="font-medium text-accent-300 hover:text-accent-200">
          Keep my current workspace
        </Link>
      }
      badge="Portal selection"
    >
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="neutral">
          Current role: <span className="font-medium text-slate-200">{ROLE_LABELS[user?.role]}</span>. Switching updates
          server-side permissions immediately.
        </Alert>
        {error && <Alert tone="danger" title="Could not switch portal">{error.message}</Alert>}
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: 'public', title: 'Public / Individual', icon: 'user', points: ['Offer letters & certificates', 'PII redaction', 'Private history'] },
            { value: 'industrial', title: 'Industrial / Enterprise', icon: 'factory', points: ['Supplier onboarding', 'Invoice & PO checks', 'Organisation dashboard'] },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={cx(
                'rounded-xl border p-4 text-left transition',
                role === option.value
                  ? 'border-accent-400/50 bg-accent-400/10 shadow-glow-sm'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              )}
            >
              <Icon name={option.icon} size={18} className={role === option.value ? 'text-accent-300' : 'text-slate-400'} />
              <p className="mt-2 text-[12px] font-semibold text-slate-100">{option.title}</p>
              <ul className="mt-2 space-y-1">
                {option.points.map((point) => (
                  <li key={point} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-slate-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {role === 'industrial' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <Icon name="building" size={13} /> Organisation details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Organisation name" className="sm:col-span-2">
                <input className="input" value={organisation.name} onChange={(event) => setOrg('name', event.target.value)} required />
              </Field>
              <Field label="Type">
                <select className="select" value={organisation.org_type} onChange={(event) => setOrg('org_type', event.target.value)}>
                  {ORG_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="GSTIN">
                <input className="input uppercase" maxLength={15} value={organisation.gstin} onChange={(event) => setOrg('gstin', event.target.value.toUpperCase())} />
              </Field>
              <Field label="PAN">
                <input className="input uppercase" maxLength={10} value={organisation.pan} onChange={(event) => setOrg('pan', event.target.value.toUpperCase())} />
              </Field>
              <Field label="Phone">
                <input className="input" value={organisation.phone} onChange={(event) => setOrg('phone', event.target.value)} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className="textarea min-h-[60px]" value={organisation.address} onChange={(event) => setOrg('address', event.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="swap" size={15} />}
          {busy ? 'Switching…' : `Continue as ${role === 'industrial' ? 'industrial' : 'public'} user`}
        </button>
      </form>
    </AuthLayout>
  );
}
