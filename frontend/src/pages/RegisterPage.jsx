import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Icon from '../components/Icon';
import { Alert, Field, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ORG_TYPES } from '../utils/constants';
import { useDocumentTitle } from '../hooks/useApiResource';
import { cx } from '../utils/format';

const emptyOrg = {
  name: '',
  org_type: 'Manufacturing',
  gstin: '',
  pan: '',
  address: '',
  email: '',
  phone: '',
  website: '',
};

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [role, setRole] = useState('public');
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [organisation, setOrganisation] = useState(emptyOrg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setOrg = (key, value) => setOrganisation((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError(new Error('Passwords do not match.'));
      return;
    }
    if (role === 'industrial' && !organisation.name.trim()) {
      setError(new Error('Organisation name is required for industrial accounts.'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
        role,
      };
      if (role === 'industrial') payload.organisation = organisation;
      await register(payload);
      toast.success('Account created. Your workspace is ready.');
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your KAVACHA account"
      subtitle="Choose an individual account for personal documents, or an organisation account for suppliers, invoices and the industrial portal."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-accent-300 hover:text-accent-200">
            Sign in
          </Link>
        </>
      }
      badge="Onboarding"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'public', label: 'Public / Individual', icon: 'user', hint: 'Personal documents' },
            { value: 'industrial', label: 'Industrial / Enterprise', icon: 'factory', hint: 'Suppliers & invoices' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={cx(
                'rounded-xl border p-3 text-left transition',
                role === option.value
                  ? 'border-accent-400/50 bg-accent-400/10 shadow-glow-sm'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              )}
            >
              <Icon name={option.icon} size={16} className={role === option.value ? 'text-accent-300' : 'text-slate-400'} />
              <span className="mt-2 block text-[11px] font-semibold text-slate-100">{option.label}</span>
              <span className="block text-[9.5px] text-slate-500">{option.hint}</span>
            </button>
          ))}
        </div>

        {error && <Alert tone="danger" title="Could not create account">{error.message}</Alert>}
        {error?.details?.problems && (
          <ul className="list-disc space-y-1 pl-5 text-[11px] text-rose-300/90">
            {error.details.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input className="input" value={form.full_name} onChange={(event) => set('full_name', event.target.value)} placeholder="Ananya Rao" required />
          </Field>
          <Field label="Email">
            <input type="email" className="input" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="you@company.example" required />
          </Field>
          <Field label="Phone (optional)">
            <input className="input" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+91 98450 12345" />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Password" hint="At least 8 characters with a letter and a number.">
            <input type="password" className="input" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm password">
            <input type="password" className="input" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} autoComplete="new-password" required />
          </Field>
        </div>

        {role === 'industrial' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <Icon name="building" size={13} /> Organisation profile
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Organisation name" className="sm:col-span-2">
                <input className="input" value={organisation.name} onChange={(event) => setOrg('name', event.target.value)} required />
              </Field>
              <Field label="Organisation type">
                <select className="select" value={organisation.org_type} onChange={(event) => setOrg('org_type', event.target.value)}>
                  {ORG_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="GSTIN (optional)" hint="Format validated locally; no government lookup is performed.">
                <input className="input uppercase" maxLength={15} value={organisation.gstin} onChange={(event) => setOrg('gstin', event.target.value.toUpperCase())} placeholder="29ABCDE1234F1ZX" />
              </Field>
              <Field label="PAN (optional)">
                <input className="input uppercase" maxLength={10} value={organisation.pan} onChange={(event) => setOrg('pan', event.target.value.toUpperCase())} placeholder="ABCDE1234F" />
              </Field>
              <Field label="Organisation email">
                <input type="email" className="input" value={organisation.email} onChange={(event) => setOrg('email', event.target.value)} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <textarea className="textarea min-h-[64px]" value={organisation.address} onChange={(event) => setOrg('address', event.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="shield" size={15} />}
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-500">
        Administrator accounts are provisioned separately. You can switch between public and industrial portals later in
        settings.
      </p>
    </AuthLayout>
  );
}
