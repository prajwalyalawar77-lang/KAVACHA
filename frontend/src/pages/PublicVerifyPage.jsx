import { Link, useParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import Icon, { Logo } from '../components/Icon';
import {
  Alert, ErrorState, Gauge, LoadingBlock, Note, Panel, RiskBadge, StatusBadge,
} from '../components/ui';
import { formatDate, formatDateTime, fmtNumber, titleCase } from '../utils/format';

function InvalidLink({ reason }) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 text-rose-300">
          <Icon name="shield" size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-100">This verification link is not active</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
          {reason || 'The link may have been revoked, expired, or the document is no longer available.'}
        </p>
        <p className="mt-4 text-[10.5px] text-slate-500">
          Ask the document owner to generate a new verification report.
        </p>
        <Link to="/" className="btn-ghost mt-5 inline-flex">Back to KAVACHA</Link>
      </div>
    </div>
  );
}

export default function PublicVerifyPage() {
  const { token } = useParams();
  useDocumentTitle('Verify a document');
  const { data, loading, error, reload } = useApiResource(token ? `/reports/public/${encodeURIComponent(token)}` : null);

  if (loading && !data) return <div className="mx-auto max-w-5xl px-4 py-16"><LoadingBlock label="Checking the verification link…" /></div>;
  if (error && !data) {
    if (error.status === 404) return <div className="px-4 py-16"><InvalidLink reason={error.message} /></div>;
    return <div className="mx-auto max-w-xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>;
  }
  if (!data) return null;
  if (!data.valid) return <div className="px-4 py-16"><InvalidLink reason={data.reason} /></div>;

  const { document, risk, checks = [] } = data;
  const counts = risk?.counts || {};

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Logo withText size={34} />
        <span className="badge border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Verification link active
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent-300/80">Shared verification summary</p>
            <h1 className="mt-1.5 text-xl font-semibold text-slate-50">A document was analysed by KAVACHA</h1>
            <p className="mt-1 text-[11.5px] text-slate-400">
              {document?.kind} · {titleCase(document?.portal || '')} portal · analysed {formatDate(document?.analysed_at)}
            </p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Report created</dt>
                <dd className="mt-0.5 text-[11px] text-slate-200">{formatDateTime(data.created_at)}</dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Expires</dt>
                <dd className="mt-0.5 text-[11px] text-slate-200">{data.expires_at ? formatDateTime(data.expires_at) : 'No expiry'}</dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Document DNA</dt>
                <dd className="mt-0.5 truncate font-mono text-[10.5px] text-slate-300">{document?.dna_prefix || '—'}…</dd>
              </div>
            </dl>
          </div>

          {risk?.summary && (
            <Panel title="Assessment summary" icon="info">
              <p className="text-[12px] leading-relaxed text-slate-300">{risk.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <RiskBadge category={risk.category} score={risk.score} />
                <span className="badge border-white/10 bg-white/5 text-slate-300">
                  Confidence {Math.round((Number(risk.confidence) || 0) * 100)}%
                </span>
              </div>
            </Panel>
          )}

          <Panel title="Checks performed" subtitle={`${checks.length} checks recorded`} icon="check" padded={false}>
            {checks.length ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[480px]">
                  <thead><tr><th>Check</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
                  <tbody>
                    {checks.map((check, index) => (
                      <tr key={`${check.name}-${index}`}>
                        <td className="text-[11px] text-slate-200">{check.name}</td>
                        <td className="text-[10px] text-slate-400">{titleCase(check.category || '')}</td>
                        <td className="text-[10px] text-slate-400">{titleCase(check.severity || '')}</td>
                        <td><StatusBadge status={check.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-8 text-center text-xs text-slate-500">No check details were shared with this link.</p>}
          </Panel>

          <Panel title="What this link does not show" icon="lock">
            <ul className="space-y-1.5 text-[11.5px] text-slate-400">
              <li className="flex gap-2"><Icon name="x" size={12} className="mt-0.5 shrink-0 text-slate-500" /> The document image, owner identity and extracted personal data are never exposed publicly.</li>
              <li className="flex gap-2"><Icon name="x" size={12} className="mt-0.5 shrink-0 text-slate-500" /> A verification link is not proof of authenticity and can be revoked at any time.</li>
              <li className="flex gap-2"><Icon name="x" size={12} className="mt-0.5 shrink-0 text-slate-500" /> Scores are explainable indicators from completed checks, not calibrated fraud probabilities.</li>
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-col items-center">
              <Gauge score={risk?.score ?? 0} category={risk?.category || 'unassessed'} label="Risk score" confidence={risk?.confidence} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['Passed', counts.passed, 'text-emerald-300'],
                ['Warning', counts.warning, 'text-amber-300'],
                ['Failed', counts.failed, 'text-rose-300'],
                ['Not run', counts.skipped, 'text-slate-300'],
              ].map(([label, value, toneClass]) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-center">
                  <p className={`font-mono text-[15px] ${toneClass}`}>{fmtNumber(value || 0)}</p>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <Alert tone="warning" title="Not a certificate of authenticity">
            {data.disclaimer || 'This summary describes transparent checks performed on one document version. It does not prove that a supplier, invoice or certificate is genuine.'}
          </Alert>

          <Note>{data.notice || 'This public summary excludes the document image, extracted personal data and owner identity.'}</Note>

          <div className="text-center">
            <Link to="/login" className="btn-ghost inline-flex">Sign in to KAVACHA</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
