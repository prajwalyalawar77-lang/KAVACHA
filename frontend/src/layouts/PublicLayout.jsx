import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon, { Logo } from '../components/Icon';
import { cx } from '../utils/format';

export default function PublicLayout() {
  const { isAuthenticated, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const links = [
    { href: '/#modules', label: 'Modules' },
    { href: '/#how-it-works', label: 'How it works' },
    { href: '/#industries', label: 'Industries' },
    { href: '/#security', label: 'Security & privacy' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-navy-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="KAVACHA home">
            <Logo withText size={37} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-100">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <>
                <Link to="/app" className="btn-secondary btn-sm">
                  <Icon name="dashboard" size={14} /> Open workspace
                </Link>
                <button type="button" onClick={handleLogout} className="btn-ghost btn-sm">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary btn-sm">
                  Create account
                  <Icon name="arrowRight" size={14} />
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle menu"
          >
            <Icon name={open ? 'x' : 'menu'} size={17} />
          </button>
        </div>
        {open && (
          <div className="border-t border-white/10 bg-navy-950/95 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
              {isAuthenticated ? (
                <>
                  <Link to="/app" className="btn-primary btn-sm w-full">
                    Open workspace
                  </Link>
                  <button type="button" onClick={handleLogout} className="btn-ghost btn-sm w-full">
                    Sign out ({user?.full_name})
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost btn-sm w-full">
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-primary btn-sm w-full">
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.06] bg-navy-950">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
          <div>
            <Logo withText size={34} />
            <p className="mt-4 max-w-sm text-[11.5px] leading-relaxed text-slate-500">
              KAVACHA helps organisations and individuals inspect documents for tampering indicators, verify
              identifiers with transparent rules and understand risk with explainable evidence.
            </p>
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-[10.5px] leading-relaxed text-amber-200/80">
              Findings are indicators, not proof of forgery. Risk bands are configurable demonstration thresholds.
              External GST, bank or government verification is only performed when authorised APIs are configured.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Platform</p>
            <ul className="mt-3 space-y-2 text-[12px] text-slate-400">
              <li><a className="hover:text-accent-200" href="/#modules">Six intelligence modules</a></li>
              <li><a className="hover:text-accent-200" href="/#how-it-works">How verification works</a></li>
              <li><a className="hover:text-accent-200" href="/#industries">Industry applications</a></li>
              <li><Link className="hover:text-accent-200" to="/login">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trust</p>
            <ul className="mt-3 space-y-2 text-[12px] text-slate-400">
              <li><a className="hover:text-accent-200" href="/#security">Security & privacy</a></li>
              <li><a className="hover:text-accent-200" href="/#public">Public safety</a></li>
              <li><a className="hover:text-accent-200" href="/#modules">Explainable risk</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/[0.05] px-4 py-4 text-center text-[10px] text-slate-600 sm:px-6 lg:px-8">
          KAVACHA · One Document. Multiple Checks. Complete Trust. · Built for SYNAPSE 2.0 demonstration.
        </div>
      </footer>
    </div>
  );
}

export function PublicHeading({ eyebrow, title, subtitle, center = false }) {
  return (
    <div className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">{eyebrow}</p>}
      <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-sm leading-relaxed text-slate-400">{subtitle}</p>}
    </div>
  );
}

export { PublicHeading as SectionHeading };
