import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Icon from '../components/Icon';
import { Alert, Field, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../utils/constants';
import { useDocumentTitle } from '../hooks/useApiResource';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Signed in as ${user.full_name}.`);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (account) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <AuthLayout
      title="Sign in to KAVACHA"
      subtitle="Use your account to upload documents, review forensic findings and generate verification reports."
      footer={
        <>
          New to KAVACHA?{' '}
          <Link to="/register" className="font-medium text-accent-300 hover:text-accent-200">
            Create an account
          </Link>
        </>
      }
      badge="Secure access"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger" title="Sign-in failed">{error.message}</Alert>}
        <Field label="Email address">
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.example"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="input pr-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-200"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="lock" size={15} />}
          {busy ? 'Signing in…' : 'Sign in securely'}
        </button>
      </form>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Demo accounts</p>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Seeded accounts for the SYNAPSE 2.0 walkthrough. Password: <span className="font-mono text-slate-300">{DEMO_PASSWORD}</span>
        </p>
        <div className="mt-2.5 space-y-1">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => useDemo(account)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-white/10 hover:bg-white/5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-slate-200">{account.label}</span>
                <span className="block truncate font-mono text-[10px] text-slate-500">{account.email}</span>
              </span>
              <span className="badge shrink-0 border-accent-400/20 bg-accent-400/10 text-accent-200">{account.role}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
        <Icon name="shield" size={12} />
        Tokens are stored locally and expire automatically.
      </p>
    </AuthLayout>
  );
}
