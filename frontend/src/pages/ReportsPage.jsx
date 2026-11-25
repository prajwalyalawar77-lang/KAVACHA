import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import AuthImage, { DownloadButton } from '../components/AuthImage';
import { DocumentSelect, useDocumentOptions } from '../components/DocumentSelect';
import Icon from '../components/Icon';
import {
  Alert, CopyButton, EmptyState, ErrorState, LoadingBlock, Modal, Note, PageHeader, Panel, Pill, RiskBadge, StatusBadge,
} from '../components/ui';
import { api } from '../services/api';
import { cx, formatDate, formatDateTime } from '../utils/format';

function reportState(report) {
  if (report.revoked_at) return { key: 'dismissed', label: 'Revoked', tone: 'rose' };
  if (!report.valid) return { key: 'skipped', label: 'Expired', tone: 'slate' };
  return { key: 'passed', label: 'Active', tone: 'emerald' };
}

function verifyBase() {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, host, port } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const publicHost = local ? `kavacha.localhost${port ? `:${port}` : ''}` : host;
  return `${protocol}//${publicHost}/verify`;
}

function shareLink(report) {
  if (!report) return '';
  return `${verifyBase()}/${report.report_token}`;
}

export default function ReportsPage() {
  useDocumentTitle('Verification reports');
  const toast = useToast();
  const { data, loading, error, reload } = useApiResource('/reports');
  const { documents, loading: docsLoading } = useDocumentOptions({ status: 'analysed', perPage: 100 });

  const [documentId, setDocumentId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [qrReport, setQrReport] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [filter, setFilter] = useState('all');

  const reports = data?.reports || [];
  const visible = useMemo(() => {
    if (filter === 'active') return reports.filter((report) => reportState(report).key === 'passed');
    if (filter === 'inactive') return reports.filter((report) => reportState(report).key !== 'passed');
    return reports;
  }, [reports, filter]);

  const create = async () => {
    if (!documentId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await api.post('/reports', { document_id: documentId, base_url: verifyBase() });
      setCreated(data);
      toast.success('Verification report generated', 'A share link, QR image and PDF are ready.');
      reload();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.post(`/reports/${revokeTarget.id}/revoke`, {});
      toast.success('Report revoked', 'The public verification link no longer resolves.');
      setRevokeTarget(null);
      if (created?.report?.id === revokeTarget.id) setCreated(null);
      reload();
    } catch (err) {
      toast.error('Could not revoke the report', err.message);
    } finally {
      setRevoking(false);
    }
  };

  const copy = async (value, label = 'Link copied') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.warning('Clipboard unavailable', 'Select the link and copy it manually.');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Verification reports"
        title="Shareable verification reports"
        subtitle="Reports summarise checks and the risk band for a document. They are not certificates of authenticity, and links can be revoked at any time."
        actions={<Link to="/app/documents" className="btn-ghost"><Icon name="history" size={14} /> Documents</Link>}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Generate a report" subtitle="Choose an analysed document" icon="qr">
          <div className="grid gap-2 sm:grid-cols-[1.8fr_1fr] sm:items-end">
            <DocumentSelect label="Document" documents={documents} loading={docsLoading} value={documentId} onChange={setDocumentId} />
            <button type="button" className="btn-primary" onClick={create} disabled={!documentId || creating}>{creating ? 'Generating…' : 'Generate report'}</button>
          </div>
          {createError && <Alert tone="danger" className="mt-3">{createError}</Alert>}

          {created?.report && (
            <div className="mt-4 rounded-xl border border-accent-400/25 bg-accent-400/[0.05] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="passed" />
                <p className="text-[12px] font-medium text-slate-100">{created.document?.original_filename || 'Verification report'}</p>
                <span className="ml-auto"><RiskBadge category={created.document?.risk?.category} size="sm" /></span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[112px_1fr]">
                <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-white/10 bg-white p-1">
                  <AuthImage path={`/reports/${created.report.id}/qr`} alt="Verification QR code" className="h-full w-full" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Share link</p>
                  <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-white/10 bg-navy-950/50 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-300">{shareLink(created.report)}</span>
                    <CopyButton value={shareLink(created.report)} label="Copy" />
                  </div>
                  <p className="mt-1 text-[9.5px] text-slate-500">Expires {created.report.expires_at ? formatDate(created.report.expires_at) : '—'} · QR identifies the report, it does not prove authenticity.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <DownloadButton path={`/reports/${created.report.id}/download`} filename={`kavacha-report-${created.report.id}.pdf`} label="Download PDF" />
                    <a href={shareLink(created.report)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><Icon name="external" size={12} /> Public view</a>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setRevokeTarget(created.report)}>Revoke</button>
                  </div>
                </div>
              </div>
              {created.notice && <Note className="mt-3">{created.notice}</Note>}
            </div>
          )}
        </Panel>

        <Panel title="Good to know" subtitle="How sharing works" icon="info">
          <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-400">
            <li>The public page shows extracted checks and the risk band only — never the original file or OCR text.</li>
            <li>Anyone with the link can view the report until it expires or you revoke it.</li>
            <li>Revoking invalidates the link and QR code immediately.</li>
            <li>Reports do not confirm that a document is authentic; they present evidence and limits.</li>
          </ul>
          <Alert tone="warning" title="Not a certificate" className="mt-3">
            Do not present the QR code as proof of authenticity. It identifies a KAVACHA report and should be read with
            the report's checks and disclaimer.
          </Alert>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Your reports"
        subtitle="Active, expired and revoked reports"
        icon="history"
        padded={false}
        action={
          <div className="flex gap-1">
            {[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cx('rounded-lg border px-2.5 py-1 text-[10px]', filter === item.key ? 'border-accent-400/35 bg-accent-400/10 text-accent-200' : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-slate-200')}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      >
        {loading && !data && <LoadingBlock label="Loading reports…" />}
        {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {!loading && !visible.length && (
          <div className="p-4">
            <EmptyState icon="qr" title={filter === 'all' ? 'No reports yet' : 'No reports in this view'} description="Generate a report to create a shareable link with checks and the risk band." />
          </div>
        )}
        {!!visible.length && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr><th>Document</th><th>Risk at issue</th><th>Status</th><th>Created</th><th>Expires</th><th>Link</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((report) => {
                  const state = reportState(report);
                  return (
                    <tr key={report.id}>
                      <td>
                        <Link to={`/app/documents/${report.document_id}`} className="text-[11.5px] font-medium text-slate-200 hover:text-accent-200">{report.document_name || `Document #${report.document_id}`}</Link>
                        <p className="font-mono text-[9px] text-slate-500">report #{report.id}</p>
                      </td>
                      <td><RiskBadge category={report.category} score={report.score} showScore size="sm" /></td>
                      <td><Pill tone={state.tone}>{state.label}</Pill></td>
                      <td className="whitespace-nowrap text-[10.5px] text-slate-400">{formatDateTime(report.created_at)}</td>
                      <td className="whitespace-nowrap text-[10.5px] text-slate-400">{report.expires_at ? formatDate(report.expires_at) : '—'}</td>
                      <td>
                        <button type="button" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" onClick={() => copy(shareLink(report))} disabled={!report.valid}>
                          <Icon name="copy" size={11} /> Copy
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" onClick={() => setQrReport(report)}>QR</button>
                          {report.valid && <DownloadButton path={`/reports/${report.id}/download`} filename={`kavacha-report-${report.id}.pdf`} label="PDF" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" />}
                          {report.valid && <button type="button" className="btn-ghost btn-sm !py-0.5 !text-[9.5px]" onClick={() => setRevokeTarget(report)}>Revoke</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={Boolean(qrReport)} onClose={() => setQrReport(null)} title="Report QR code" description="Scanning opens the public verification summary for this report." icon="qr">
        {qrReport && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-48 w-48 rounded-xl border border-white/10 bg-white p-2">
              <AuthImage path={`/reports/${qrReport.id}/qr`} alt="Verification QR code" className="h-full w-full" />
            </div>
            <div className="w-full rounded-lg border border-white/10 bg-navy-950/50 px-3 py-2 text-center">
              <p className="break-all font-mono text-[10px] text-slate-300">{shareLink(qrReport)}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => copy(shareLink(qrReport))}>Copy link</button>
              <a href={shareLink(qrReport)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Open public page</a>
            </div>
            <Note>The QR code identifies a report page. It is not a certificate of authenticity.</Note>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Revoke this report?"
        description="The share link and QR code will stop working immediately. You can generate a new report later."
        icon="lock"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>Cancel</button>
            <button type="button" className="btn-danger" onClick={revoke} disabled={revoking}>{revoking ? 'Revoking…' : 'Revoke report'}</button>
          </>
        }
      >
        {revokeTarget && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-200">
            {revokeTarget.document_name || `Document #${revokeTarget.document_id}`} · report #{revokeTarget.id}
          </div>
        )}
      </Modal>
    </div>
  );
}
