import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import Icon, { Logo } from './Icon';
import { Spinner } from './ui';

export function FullPageLoader({ label = 'Securing your session…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-950">
      <Logo size={52} />
      <Spinner size={22} />
      <p className="text-xs tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <div className="card p-8 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
            <Icon name="lock" size={24} />
          </span>
          <h1 className="text-lg font-semibold text-white">Workspace restricted</h1>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
            This module is limited to {roles.map((role) => ({ admin: 'administrators', industrial: 'industrial', public: 'public' })[role]).join(' and ')}{' '}
            accounts. Permissions are enforced by the KAVACHA API, not only in the interface.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/app" className="btn-primary btn-sm">
              Back to dashboard
            </Link>
            <Link to="/app/settings" className="btn-ghost btn-sm">
              Account settings
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

export function PublicOnly({ children }) {
  const { ready, isAuthenticated } = useAuth();
  if (!ready) return <FullPageLoader label="Loading KAVACHA…" />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return children;
}
