import { Link } from 'react-router-dom';
import Icon from './Icon';
import { RiskBadge, StatusBadge } from './ui';
import { DOC_KIND_LABELS } from '../utils/constants';
import { cx, formatDateTime, fmtNumber } from '../utils/format';

export default function DocumentTable({
  documents = [],
  showOwner = false,
  compact = false,
  empty,
  className = '',
  actionLabel = 'Analyse',
}) {
  if (!documents.length) return empty || null;
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            <th>Document</th>
            <th>Portal / type</th>
            {showOwner && <th>Owner</th>}
            <th>Risk</th>
            <th>Status</th>
            {!compact && <th>Uploaded</th>}
            <th className="text-right">Signals</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link to={`/app/documents/${doc.id}`} className="group flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[9px] font-semibold uppercase text-slate-400">
                    {(doc.mime_type || doc.mime || '').includes('pdf') ? 'PDF' : 'IMG'}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[260px] truncate text-[13px] font-medium text-slate-200 group-hover:text-accent-200">
                      {doc.original_filename || doc.name}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-500">
                      DNA {(doc.sha256 || '').slice(0, 12) || '—'}
                    </span>
                  </span>
                </Link>
              </td>
              <td>
                <span className="block text-[12px] text-slate-300">{DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind}</span>
                <span className="block text-[10px] uppercase tracking-wider text-slate-500">{doc.portal}</span>
              </td>
              {showOwner && <td className="text-[12px] text-slate-400">{doc.owner || '—'}</td>}
              <td>
                {doc.risk ? (
                  <div className="flex flex-col gap-1">
                    <RiskBadge category={doc.risk.category} size="sm" />
                    <span className="font-mono text-[10px] text-slate-500">{Math.round(doc.risk.score)}/100</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500">—</span>
                )}
              </td>
              <td>
                <StatusBadge status={doc.status === 'failed' ? 'failed_status' : doc.status} />
              </td>
              {!compact && <td className="whitespace-nowrap text-[11px] text-slate-400">{formatDateTime(doc.created_at)}</td>}
              <td>
                <div className="flex items-center justify-end gap-2 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1" title="Alerts">
                    <Icon name="flag" size={12} className={doc.alert_count ? 'text-amber-300' : 'text-slate-600'} />
                    {fmtNumber(doc.alert_count || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Reports">
                    <Icon name="qr" size={12} className={doc.report_count ? 'text-accent-300' : 'text-slate-600'} />
                    {fmtNumber(doc.report_count || 0)}
                  </span>
                </div>
              </td>
              <td className="text-right">
                <Link to={`/app/documents/${doc.id}`} className="btn-ghost btn-sm whitespace-nowrap">
                  {actionLabel}
                  <Icon name="chevronRight" size={12} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
