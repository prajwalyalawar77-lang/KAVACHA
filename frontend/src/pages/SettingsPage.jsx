import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import Icon from '../components/Icon';
import { Alert, Field, LoadingBlock, Note, PageHeader, Panel, Pill } from '../components/ui';
import { api } from '../services/api';
import { ORG_TYPES, ROLE_LABELS } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';

function AccountSummary() {
  const { user, capabilities } = useAuth();
  if (!user) return null;
  return (
    <Panel title="Account" subtitle="Your identity on this KAVACHA instance" icon="user">
      <dl className="space-y-2 text-[11.5px]">
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="truncate font-mono text-slate-200">{user.email}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Role</dt><dd><Pill tone="accent">{ROLE_LABELS[user.role] || user.role}</Pill></dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Organisation</dt><dd className="truncate text-slate-200">{user.organisation?.name || '—'}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Member since</dt><dd className="text-slate-200">{formatDate(user.created_at)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Last login</dt><dd className="text-slate-200">{user.last_login_at ? formatDateTime(user.last_login_at) : '—'}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Document retention</dt><dd className="font-mono text-slate-200">{user.retention_days} days</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {capabilities?.is_admin && <Pill tone="rose">Administrator</Pill>}
        {capabilities?.can_use_industrial && <Pill tone="accent">Industrial tools</Pill>}
        {capabilities?.can_use_public && <Pill tone="emerald">Public portal</Pill>}
      </div>
    </Panel>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim() });
      toast.success('Profile saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Profile" subtitle="Display name and contact number" icon="settings">
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Full name">
          <input className="input" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Phone" hint="Optional. Used only for your own account record.">
          <input className="input" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
        </Field>
        {error && <p className="text-[11px] text-rose-300">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy || !fullName.trim()}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setProblems([]);
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password', { current_password: current, new_password: next });
      toast.success('Password updated');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err.message);
      setProblems(err.details?.problems || []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Password" subtitle="Minimum 8 characters with a letter and a number" icon="shield">
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Current password">
          <input type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password">
            <input type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </Field>
        </div>
        {error && <p className="text-[11px] text-rose-300">{error}</p>}
        {!!problems.length && (
          <ul className="list-disc space-y-0.5 pl-4 text-[10.5px] text-amber-300">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        <button type="submit" className="btn-primary" disabled={busy || !current || !next}>
          {busy ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </Panel>
  );
}

function PrivacyForm() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(user?.retention_days ?? 30);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ retention_days: Number(days) });
      toast.success('Retention preference saved', 'Applies to future cleanup runs.');
    } catch (err) {
      toast.error('Could not save the preference', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Privacy & retention" subtitle="How long your documents are kept" icon="lock">
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Retention period" hint="Between 1 and 365 days. Cleanup removes stored files and database rows for expired documents.">
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={365} value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
              aria-label="Retention days"
            />
            <span className="w-16 text-right font-mono text-[12px] text-accent-200">{days}d</span>
          </div>
        </Field>
        <button type="submit" className="btn-ghost" disabled={busy || Number(days) === Number(user?.retention_days)}>
          {busy ? 'Saving…' : 'Save preference'}
        </button>
      </form>
      <div className="mt-3">
        <Note>Documents are private by default and served only through authenticated API endpoints. There are no public file URLs.</Note>
      </div>
    </Panel>
  );
}

function OrganisationForm() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApiResource('/organisations/current');
  const org = data?.organisation;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    if (!form && (org || data)) {
      setForm({
        name: org?.name || '', org_type: org?.org_type || 'Other',
        gstin: org?.gstin || '', pan: org?.pan || '',
        address: org?.address || '', phone: org?.phone || '',
        email: org?.email || '', website: org?.website || '',
      });
    }
  }, [org, data, form]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setWarnings([]);
    try {
      const { data: payload } = await api.put('/organisations/current', form);
      setData((previous) => ({ ...previous, ...payload }));
      setWarnings(payload.warnings || []);
      toast.success('Organisation profile saved');
    } catch (err) {
      toast.error('Could not save the organisation', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !form) return <LoadingBlock label="Loading organisation…" />;
  if (error && !form) return <Alert tone="danger" title="Organisation unavailable">{error.message}</Alert>;
  if (!form) return null;

  return (
    <Panel
      title="Organisation profile"
      subtitle={data?.members ? `${data.members} active member${data.members === 1 ? '' : 's'}` : 'Shared by all industrial members'}
      icon="building"
      action={<button type="button" className="btn-ghost btn-sm" onClick={reload} disabled={loading}>Reload</button>}
    >
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organisation name *">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={255} />
          </Field>
          <Field label="Sector">
            <select className="select" value={form.org_type} onChange={(e) => set('org_type', e.target.value)}>
              {ORG_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="GSTIN" hint="Format/checksum validated only — no government lookup.">
            <input className="input font-mono uppercase" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} />
          </Field>
          <Field label="PAN">
            <input className="input font-mono uppercase" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} maxLength={10} />
          </Field>
          <Field label="Contact email">
            <input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={255} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} maxLength={32} />
          </Field>
        </div>
        <Field label="Registered address">
          <textarea className="input min-h-[70px]" value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={500} />
        </Field>
        <Field label="Website">
          <input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} maxLength={255} placeholder="https://…" />
        </Field>
        {!!warnings.length && (
          <Alert tone="warning" title="Format validation warnings">
            <ul className="list-disc space-y-0.5 pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </Alert>
        )}
        <button type="submit" className="btn-primary" disabled={busy || !form.name.trim()}>
          {busy ? 'Saving…' : 'Save organisation'}
        </button>
      </form>
    </Panel>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Profile & settings');
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        eyebrow="Your account"
        title="Profile & settings"
        subtitle="Manage your identity, password, retention preferences and organisation profile. Permission checks are enforced by the API."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <AccountSummary />
          <PrivacyForm />
        </div>
        <div className="space-y-4">
          <ProfileForm />
          <PasswordForm />
          {user?.role === 'industrial' && <OrganisationForm />}
          {user?.role !== 'admin' && (
            <Panel title="Account type" subtitle="Switch between the public and industrial experiences" icon="layers">
              <p className="text-[11.5px] text-slate-400">
                You are currently on the <span className="text-slate-200">{ROLE_LABELS[user?.role] || user?.role}</span> experience.
                Switching to an industrial account creates or reuses an organisation profile; switching back to public removes the link.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/select-role" className="btn-ghost"><Icon name="arrowRight" size={13} /> Change account type</Link>
                {user?.role === 'industrial' && <Link to="/app/industrial" className="btn-ghost">Industrial overview</Link>}
                {user?.role === 'public' && <Link to="/app/safety" className="btn-ghost">Public safety portal</Link>}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
