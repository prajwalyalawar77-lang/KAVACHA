import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon, { Logo } from '../components/Icon';
import NotificationsMenu from '../components/NotificationsMenu';
import { cx, initials, titleCase } from '../utils/format';
import { ROLE_LABELS } from '../utils/constants';

const SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/app/upload', label: 'Upload document', icon: 'upload' },
      { to: '/app/documents', label: 'Document history', icon: 'history' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/app/verify', label: 'Smart verification', icon: 'check' },
      { to: '/app/fraud', label: 'Fraud intelligence', icon: 'network', roles: ['admin', 'industrial'] },
      { to: '/app/risk', label: 'Risk assessment', icon: 'gauge' },
      { to: '/app/compare', label: 'Document comparison', icon: 'compare' },
      { to: '/app/reports', label: 'Verification reports', icon: 'qr' },
    ],
  },
  {
    label: 'Workspaces',
    items: [
      { to: '/app/industrial', label: 'Industrial portal', icon: 'factory', roles: ['admin', 'industrial'] },
      { to: '/app/safety', label: 'Public safety portal', icon: 'shield', roles: ['admin', 'public'] },
      { to: '/app/suppliers', label: 'Supplier management', icon: 'building', roles: ['admin', 'industrial'] },
    ],
  },
  {
    label: 'Administration',
    items: [{ to: '/app/admin', label: 'Admin console', icon: 'audit', roles: ['admin'] }],
  },
];

function findLabel(pathname) {
  for (const section of SECTIONS) {
    for (const item of section.items) {
      if (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (pathname.startsWith('/app/documents/')) return 'AI analysis';
        return item.label;
      }
    }
  }
  if (pathname.startsWith('/app/documents')) return 'Documents';
  if (pathname.startsWith('/app/suppliers/')) return 'Supplier profile';
  if (pathname.startsWith('/app/settings')) return 'Profile & settings';
  return 'Workspace';
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenu) return undefined;
    const onClick = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userMenu]);

  const allowed = (item) => !item.roles || item.roles.includes(user?.role);
  const currentLabel = findLabel(location.pathname);
  const org = user?.organisation;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[70px] shrink-0 items-center border-b border-white/[0.06] px-5">
        <Link to="/app" aria-label="KAVACHA dashboard">
          <Logo withText size={36} />
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {SECTIONS.map((section) => {
          const items = section.items.filter(allowed);
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <p className="mb-2 px-3 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => cx('nav-link', isActive && 'nav-link-active')}
                    >
                      <Icon name={item.icon} size={16} className="shrink-0 opacity-80" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 space-y-3 border-t border-white/[0.06] p-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-400/15 font-mono text-[10px] font-bold text-accent-200">
              {initials(org?.name || user?.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium text-slate-200">{org?.name || user?.full_name}</p>
              <p className="truncate text-[9.5px] uppercase tracking-wider text-slate-500">
                {ROLE_LABELS[user?.role] || 'Account'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-1 text-[9.5px] text-slate-600">
          <Icon name="lock" size={11} />
          <span>JWT · RBAC · audit-logged</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[258px] border-r border-white/[0.06] bg-navy-900/70 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] animate-fadeUp border-r border-white/10 bg-navy-900 shadow-card">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Close menu"
            >
              <Icon name="x" size={16} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[258px]">
        <header className="sticky top-0 z-30 flex h-[70px] items-center gap-3 border-b border-white/[0.06] bg-navy-950/75 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 lg:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" size={17} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <span className="hidden sm:inline">KAVACHA</span>
              <span className="hidden sm:inline text-slate-700">/</span>
              <span className="text-accent-300/80">Workspace</span>
            </p>
            <p className="truncate text-sm font-semibold text-slate-100">{currentLabel}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/app/upload" className="btn-secondary btn-sm hidden sm:inline-flex">
              <Icon name="upload" size={13} />
              Upload
            </Link>
            <NotificationsMenu />
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenu((value) => !value)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-1 pl-1 pr-2 transition hover:border-accent-400/30"
                aria-label="Account menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500/30 to-navy-800 font-mono text-[10px] font-bold text-accent-100">
                  {initials(user?.full_name)}
                </span>
                <Icon name="chevronDown" size={13} className="text-slate-500" />
              </button>
              {userMenu && (
                <div className="absolute right-0 top-11 z-50 w-60 animate-fadeUp overflow-hidden rounded-2xl border border-white/10 bg-charcoal-900/95 shadow-card backdrop-blur-xl">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="truncate text-xs font-semibold text-white">{user?.full_name}</p>
                    <p className="truncate text-[10.5px] text-slate-400">{user?.email}</p>
                    <span className="badge mt-2 border-accent-400/25 bg-accent-400/10 text-accent-200">
                      {ROLE_LABELS[user?.role] || titleCase(user?.role)}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <Link to="/app/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white">
                      <Icon name="settings" size={14} /> Profile & settings
                    </Link>
                    <Link to="/select-role" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white">
                      <Icon name="swap" size={14} /> Switch portal / role
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      <Icon name="logout" size={14} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-white/[0.05] px-6 py-4 text-[10px] leading-relaxed text-slate-600">
          KAVACHA findings are automated indicators, not proof of forgery. Risk bands are configurable demonstration
          thresholds. External GST, bank or government lookups are only performed when authorised integrations are configured.
        </footer>
      </div>
    </div>
  );
}
