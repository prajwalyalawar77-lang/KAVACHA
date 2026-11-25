import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { RISK, STATUS } from '../utils/constants';
import { cx, titleCase } from '../utils/format';

export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={cx('card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Panel({ title, subtitle, icon, action, children, className = '', bodyClassName = '', padded = true }) {
  return (
    <section className={cx('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-300">
                <Icon name={icon} size={16} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="panel-title">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cx(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions, backTo, backLabel = 'Back' }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fadeUp">
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-accent-200">
            <Icon name="arrowLeft" size={14} />
            {backLabel}
          </Link>
        )}
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-300/90">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES = {
  accent: 'border-accent-400/20 bg-accent-400/10 text-accent-300',
  emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  orange: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  rose: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  slate: 'border-white/10 bg-white/5 text-slate-300',
};

export function StatCard({ label, value, hint, icon = 'chart', tone = 'accent', to, footer }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 truncate font-mono text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className={cx('kpi-icon shrink-0', STAT_TONES[tone])}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      {(hint || footer) && <div className="mt-3 text-xs leading-relaxed text-slate-400">{hint || footer}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="card card-hover block p-5">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

export function RiskBadge({ category, score, size = 'md', showScore = false }) {
  const meta = RISK[category] || RISK.unassessed;
  return (
    <span
      className={cx(
        'badge',
        meta.bg,
        meta.border,
        meta.text,
        size === 'sm' && 'px-2 py-0.5 text-[10px]',
        size === 'lg' && 'px-3 py-1 text-xs',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
      {showScore && score !== null && score !== undefined && (
        <span className="font-mono opacity-80">· {Math.round(score)}/100</span>
      )}
    </span>
  );
}

export function StatusBadge({ status, label }) {
  const meta = STATUS[status] || {
    label: label || titleCase(status),
    tone: 'text-slate-300 bg-slate-400/10 border-slate-400/20',
  };
  return <span className={cx('badge', meta.tone)}>{label || meta.label}</span>;
}

export function Pill({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'border-white/10 bg-white/5 text-slate-300',
    accent: 'border-accent-400/25 bg-accent-400/10 text-accent-200',
    emerald: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    rose: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  };
  return <span className={cx('badge', tones[tone], className)}>{children}</span>;
}

const ALERT_TONES = {
  info: 'border-sky-400/25 bg-sky-400/[0.07] text-sky-100',
  success: 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100',
  warning: 'border-amber-400/25 bg-amber-400/[0.07] text-amber-100',
  danger: 'border-rose-400/25 bg-rose-400/[0.07] text-rose-100',
  neutral: 'border-white/10 bg-white/[0.04] text-slate-300',
};
const ALERT_ICONS = { info: 'info', success: 'check', warning: 'alert', danger: 'alert', neutral: 'info' };

export function Alert({ tone = 'info', title, children, icon, className = '', dismissible = false, onDismiss }) {
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5 text-xs leading-relaxed', ALERT_TONES[tone], className)}>
      <Icon name={icon || ALERT_ICONS[tone]} size={16} className="mt-0.5 shrink-0 opacity-90" />
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 text-[12px] font-semibold">{title}</p>}
        <div className="opacity-90">{children}</div>
      </div>
      {dismissible && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function Note({ children, icon = 'info', className = '' }) {
  return (
    <p className={cx('flex items-start gap-2 text-[11px] leading-relaxed text-slate-500', className)}>
      <Icon name={icon} size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ size = 18, className = '' }) {
  return (
    <svg
      className={cx('animate-spin text-accent-300', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingBlock({ label = 'Loading…', className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16 text-slate-400', className)}>
      <Spinner size={26} />
      <p className="text-xs tracking-wide">{label}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 4, className = '' }) {
  return (
    <div className={cx('space-y-2.5', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'file', title, message, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = '' }) {
  return (
    <div className={cx('card border-rose-400/20 p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 text-rose-300">
          <Icon name="alert" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-200">Something went wrong</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{error?.message || 'Unable to load this data.'}</p>
          {error?.details?.problems && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
              {error.details.problems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-ghost btn-sm mt-3">
              <Icon name="refresh" size={13} /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Gauge({ score = 0, category = 'unassessed', size = 190, label = 'Risk score', confidence }) {
  const meta = RISK[category] || RISK.unassessed;
  const radius = 52;
  const circumference = Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, (Number(score) || 0) / 100));
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 130 76" className="w-full overflow-visible">
        <path
          d="M13 66a52 52 0 0 1 104 0"
          fill="none"
          stroke="rgba(148,163,184,0.14)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d="M13 66a52 52 0 0 1 104 0"
          fill="none"
          stroke={meta.hex}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 900ms ease' }}
        />
        <text x="65" y="60" textAnchor="middle" className="fill-white font-mono" style={{ fontSize: 26, fontWeight: 700 }}>
          {Math.round(Number(score) || 0)}
        </text>
        <text x="65" y="72" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 7, letterSpacing: 1 }}>
          / 100
        </text>
      </svg>
      <div className="-mt-1 flex flex-col items-center">
        <span className={cx('text-xs font-semibold uppercase tracking-[0.14em]', meta.text)}>{meta.label}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
        {confidence !== undefined && confidence !== null && (
          <span className="mt-1 text-[10px] text-slate-400">Confidence {(confidence * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, wide = false, icon = 'layers' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-navy-950/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative my-auto w-full animate-fadeUp rounded-2xl border border-white/10 bg-charcoal-900/95 shadow-card',
          wide ? 'max-w-4xl' : 'max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-400/20 bg-accent-400/10 text-accent-300">
              <Icon name={icon} size={17} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-navy-950/50 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cx('tab', active === tab.key && 'tab-active')}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 font-mono text-[10px] opacity-70">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items, columns = 2, className = '', dense = false }) {
  return (
    <dl className={cx('grid gap-x-6', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2', className)}>
      {items.filter(Boolean).map((item) => (
        <div
          key={item.label}
          className={cx('border-b border-white/[0.06] py-2.5', dense && 'py-1.5', item.wide && 'sm:col-span-2')}
        >
          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</dt>
          <dd className={cx('mt-1 break-words text-[13px] text-slate-200', item.mono && 'font-mono text-[12px]', item.className)}>
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-slate-500">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value = 0, tone = 'accent', className = '', showLabel = false }) {
  const tones = { accent: 'bg-accent-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400' };
  return (
    <div className={className}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cx('h-full rounded-full transition-all duration-700', tones[tone] || tones.accent)}
          style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }}
        />
      </div>
      {showLabel && <p className="mt-1 text-right text-[10px] text-slate-500">{Math.round(Number(value) || 0)}%</p>}
    </div>
  );
}

export function ProgressPipeline({ steps = [], orientation = 'vertical', className = '' }) {
  const stateStyle = {
    done: { icon: 'check', ring: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
    active: { icon: 'refresh', ring: 'border-accent-400/50 bg-accent-400/10 text-accent-300 animate-pulse' },
    pending: { icon: 'clock', ring: 'border-white/10 bg-white/5 text-slate-500' },
    failed: { icon: 'alert', ring: 'border-rose-400/40 bg-rose-400/10 text-rose-300' },
  };
  if (orientation === 'horizontal') {
    return (
      <ol className={cx('grid gap-2 sm:grid-cols-2 xl:grid-cols-6', className)}>
        {steps.map((step, index) => {
          const style = stateStyle[step.state] || stateStyle.pending;
          return (
            <li key={step.code || index} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="flex items-center gap-2">
                <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]', style.ring)}>
                  {step.state === 'active' ? <Spinner size={11} /> : <Icon name={style.icon} size={11} />}
                </span>
                <span className={cx('text-[11px] font-medium', step.state === 'pending' ? 'text-slate-500' : 'text-slate-200')}>
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className={cx('space-y-1', className)}>
      {steps.map((step, index) => {
        const style = stateStyle[step.state] || stateStyle.pending;
        const last = index === steps.length - 1;
        return (
          <li key={step.code || index} className="relative flex gap-3 pb-3 last:pb-0">
            {!last && <span className="absolute left-[13px] top-7 h-[calc(100%-1.4rem)] w-px bg-white/10" />}
            <span className={cx('relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', style.ring)}>
              {step.state === 'active' ? <Spinner size={12} /> : <Icon name={style.icon} size={12} />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cx('text-xs font-medium', step.state === 'pending' ? 'text-slate-500' : 'text-slate-200')}>{step.label}</p>
              {step.detail && <p className="mt-0.5 text-[10px] text-slate-500">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CopyButton({ value, label = 'Copy', className = '', onCopied }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      setCopied(true);
      onCopied?.();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked in insecure contexts */
    }
  };
  return (
    <button type="button" onClick={copy} className={cx('btn-ghost btn-sm', className)}>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {copied ? 'Copied' : label}
    </button>
  );
}

export function Pagination({ page = 1, pages = 1, total = 0, onChange, className = '' }) {
  if (!pages) return null;
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <p className="text-[11px] text-slate-500">
        Page {page} of {pages} · {total} record{total === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <Icon name="arrowLeft" size={12} /> Prev
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <Icon name="arrowRight" size={12} />
        </button>
      </div>
    </div>
  );
}

export function CheckList({ checks = [], compact = false, emptyText = 'No checks in this category.' }) {
  const [openCode, setOpenCode] = useState(null);
  if (!checks.length) return <p className="py-6 text-center text-xs text-slate-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-white/[0.06]">
      {checks.map((check) => {
        const expanded = openCode === check.code;
        const hasDetails = check.details && Object.keys(check.details || {}).length > 0;
        return (
          <li key={check.code || check.id} className="py-2.5">
            <button
              type="button"
              onClick={() => hasDetails && setOpenCode(expanded ? null : check.code)}
              className={cx('flex w-full items-start gap-3 text-left', !hasDetails && 'cursor-default')}
            >
              <span className="mt-0.5 shrink-0">
                <StatusBadge status={check.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-slate-200">{check.name}</span>
                  {check.category && (
                    <span className="rounded border border-white/10 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-500">
                      {titleCase(check.category)}
                    </span>
                  )}
                </span>
                {!compact && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{check.message}</span>}
              </span>
              {hasDetails && (
                <Icon name="chevronDown" size={14} className={cx('mt-1 shrink-0 text-slate-500 transition', expanded && 'rotate-180')} />
              )}
            </button>
            {expanded && hasDetails && (
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-white/10 bg-navy-950/80 p-3 font-mono text-[10.5px] leading-relaxed text-slate-400">
                {JSON.stringify(check.details, null, 2)}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CheckSummary({ counts = {} }) {
  const order = [
    ['passed', 'Passed', 'text-emerald-300'],
    ['failed', 'Failed', 'text-rose-300'],
    ['warning', 'Warnings', 'text-amber-300'],
    ['skipped', 'Skipped', 'text-slate-400'],
    ['unverified', 'Unverified', 'text-sky-300'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {order.map(([key, label, tone]) => (
        <div key={key} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <p className={cx('font-mono text-xl font-semibold', tone)}>{counts[key] ?? 0}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={cx('inline-flex rounded-xl border border-white/10 bg-navy-950/60 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition',
            value === option.value ? 'bg-accent-400/15 text-accent-200' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function InlineStat({ label, value, tone = 'text-slate-200' }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cx('mt-0.5 font-mono text-sm font-semibold', tone)}>{value}</p>
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-[10.5px] text-rose-300">{error}</span>}
    </label>
  );
}

export function ScoreLegend({ thresholds }) {
  const t = thresholds || { medium: 30, high: 60, critical: 80 };
  const items = useMemo(
    () => [
      { range: `0–${t.medium}`, meta: RISK.low },
      { range: `${t.medium + 1}–${t.high}`, meta: RISK.medium },
      { range: `${t.high + 1}–${t.critical}`, meta: RISK.high },
      { range: `${t.critical + 1}–100`, meta: RISK.critical },
    ],
    [t],
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.range} className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-400">
          <span className={cx('h-1.5 w-1.5 rounded-full', item.meta.dot)} />
          <span className="font-mono">{item.range}</span>
          <span className="text-slate-500">{item.meta.label.replace(' risk', '')}</span>
        </span>
      ))}
    </div>
  );
}
