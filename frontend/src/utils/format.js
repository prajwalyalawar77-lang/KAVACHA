export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function riskMeta(category) {
  return (
    {
      low: { label: 'Low risk', hex: '#34d399', className: 'text-emerald-300' },
      medium: { label: 'Medium risk', hex: '#fbbf24', className: 'text-amber-300' },
      high: { label: 'High risk', hex: '#fb923c', className: 'text-orange-300' },
      critical: { label: 'Critical risk', hex: '#f87171', className: 'text-rose-300' },
    }[category] || { label: 'Not assessed', hex: '#94a3b8', className: 'text-slate-300' }
  );
}

export function riskCategory(score, thresholds) {
  if (score === null || score === undefined) return 'unassessed';
  const t = thresholds || { medium: 30, high: 60, critical: 80 };
  if (score <= t.medium) return 'low';
  if (score <= t.high) return 'medium';
  if (score <= t.critical) return 'high';
  return 'critical';
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
}

export function fmtNumber(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString('en-IN', { maximumFractionDigits: digits });
}

export function fmtMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(value, digits = 0) {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return `${(number * 100).toFixed(digits)}%`;
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function shortHash(value, length = 12) {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function initials(name) {
  if (!name) return 'KA';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function humanDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function severityPosition(severity) {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 2;
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
