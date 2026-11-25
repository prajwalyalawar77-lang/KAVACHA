import { Link } from 'react-router-dom';
import Icon, { Logo } from '../components/Icon';

const HIGHLIGHTS = [
  { icon: 'scan', title: 'Forensic analysis', text: 'Heatmaps, copy-move and typography indicators with an original-vs-analysed viewer.' },
  { icon: 'check', title: 'Smart verification', text: 'GSTIN checksums, invoice arithmetic and cross-document consistency.' },
  { icon: 'network', title: 'Fraud intelligence', text: 'Duplicate DNA, repeated identifiers and supplier relationship graphs.' },
  { icon: 'gauge', title: 'Explainable risk', text: 'Every score shows which checks passed, failed, or could not be completed.' },
];

export default function AuthLayout({ title, subtitle, children, footer, badge = 'Secure access' }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-grid opacity-25" />
      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-12">
        <div className="hidden flex-col justify-center lg:flex">
          <Link to="/" className="mb-10 inline-flex w-fit">
            <Logo withText size={42} />
          </Link>
          <span className="mb-4 w-fit rounded-full border border-accent-400/25 bg-accent-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-200">
            {badge}
          </span>
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-tight tracking-tight text-white">
            Document trust intelligence for the real world.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
            KAVACHA analyses a document once and runs forensics, verification, fraud intelligence and explainable risk
            checks together — for industry, finance, public institutions and individuals.
          </p>
          <ul className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="card p-4">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-300">
                  <Icon name={item.icon} size={15} />
                </span>
                <p className="text-[12px] font-semibold text-slate-100">{item.title}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{item.text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-2 text-[10.5px] text-slate-500">
            <Icon name="lock" size={13} />
            JWT authentication · role-based access · audited actions · documents never served publicly
          </div>
        </div>

        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="mb-6 flex lg:hidden">
            <Link to="/">
              <Logo withText size={38} />
            </Link>
          </div>
          <div className="card relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-accent-500/10 blur-2xl" />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
              {subtitle && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </div>
          </div>
          {footer && <div className="mt-5 text-center text-xs text-slate-400">{footer}</div>}
          <p className="mt-6 text-center text-[10px] leading-relaxed text-slate-600">
            By continuing you acknowledge that automated findings are indicators, not proof of forgery, and that risk
            scores use configurable demonstration thresholds.
          </p>
        </div>
      </div>
    </div>
  );
}
