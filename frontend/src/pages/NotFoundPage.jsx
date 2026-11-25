import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useApiResource';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-300/80">Error 404</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-50">This page could not be found</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          The page may have moved, or the link may be incomplete. Nothing was changed on your account.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to={isAuthenticated ? '/app' : '/'} className="btn-primary">
            <Icon name="arrowLeft" size={14} /> {isAuthenticated ? 'Back to dashboard' : 'Back to home'}
          </Link>
          {isAuthenticated && <Link to="/app/documents" className="btn-ghost">My documents</Link>}
        </div>
      </div>
    </div>
  );
}
