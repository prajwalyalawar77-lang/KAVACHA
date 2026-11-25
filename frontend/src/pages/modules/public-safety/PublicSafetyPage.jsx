import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import { useToast } from '../../../context/ToastContext';
import AuthImage, { DownloadButton } from '../../../components/AuthImage';
import { DocumentSelect, useDocumentOptions } from '../../../components/DocumentSelect';
import Icon from '../../../components/Icon';
import { RiskDistributionChart } from '../../../components/Charts';
import {
  Alert, EmptyState, ErrorState, LoadingBlock, Modal, Note, PageHeader, Panel, Pill, RiskBadge, StatCard, StatusBadge,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { cx, fmtNumber, timeAgo } from '../../../utils/format';

const PII_LABELS = {
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  ifsc: 'IFSC code',
  bank_account: 'Bank account',
  card: 'Payment card',
  phone: 'Phone number',
  email: 'Email address',
  gstin: 'GSTIN',
};

const REPORT_REASONS = [
  'Fake job offer',
  'Deposit or processing fee requested',
  'Certificate appears altered',
  'Rental scam',
  'Salary slip discrepancy',
  'Payment receipt discrepancy',
  'Other',
];

export default function PublicSafetyPage() {
  useDocumentTitle('Public safety portal');
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const initialDocument = Number(searchParams.get('document')) || null;

  const { data: overview, loading, error, reload: reloadOverview } = useApiResource('/public/overview');
  const { documents, loading: docsLoading } = useDocumentOptions({ portal: 'public', status: 'analysed', perPage: 100 });
  const { data: reportsData, loading: reportsLoading, reload: reloadReports } = useApiResource('/public/reports');

  const [documentId, setDocumentId] = useState(initialDocument);
  const [scan, setScan] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [redacting, setRedacting] = useState(false);
  const [redaction, setRedaction] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!documentId && documents.length) setDocumentId(documents[0].id);
  }, [documents, documentId]);

  useEffect(() => {
    setScan(null);
    setRedaction(null);
    setSelectedTypes([]);
    setActionError(null);
  }, [documentId]);

  const detections = scan?.detections || [];
  const typeGroups = useMemo(() => {
    const groups = new Map();
    detections.forEach((detection) => {
      const entry = groups.get(detection.type) || { type: detection.type, label: PII_LABELS[detection.type] || detection.label || detection.type, count: 0, maxConfidence: 0 };
      entry.count += 1;
      entry.maxConfidence = Math.max(entry.maxConfidence, Number(detection.confidence) || 0);
      groups.set(detection.type, entry);
    });
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [detections]);

  const counts = overview?.counts || {};
  const reports = reportsData?.reports || [];

  const runScan = async () => {
    if (!documentId) return;
    setScanBusy(true);
    setActionError(null);
    setRedaction(null);
    try {
      const { data } = await api.get(`/public/documents/${documentId}/pii`);
      setScan(data);
      setSelectedTypes((data.detections || []).map((detection) => detection.type).filter((value, index, array) => array.indexOf(value) === index));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setScanBusy(false);
    }
  };

  const toggleType = (type) => {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  };

  const runRedaction = async () => {
    if (!documentId || !selectedTypes.length) return;
    setRedacting(true);
    setActionError(null);
    try {
      const { data } = await api.post(`/public/documents/${documentId}/redact`, { types: selectedTypes });
      setRedaction(data);
      toast.success('Redacted copy created', `${data.detection_count} region(s) covered. Verify the copy before sharing.`);
      reloadOverview();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRedacting(false);
    }
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!documentId) return;
    setReportBusy(true);
    try {
      await api.post('/public/reports', {
        document_id: documentId,
        reason: reportReason,
        description: reportDescription,
      });
      toast.success('Report submitted', 'The report is queued for review. No personal document is published.');
      setReportOpen(false);
      setReportDescription('');
      reloadReports();
      reloadOverview();
    } catch (err) {
      toast.error('Could not submit the report', err.message);
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Public document safety"
        title="Public safety portal"
        subtitle="Scan personal documents for sensitive identifiers, produce a redacted copy before sharing, and report suspicious documents to the review queue."
        actions={
          <>
            <Link to="/app/upload" className="btn-ghost"><Icon name="upload" size={14} /> Upload</Link>
            <button type="button" className="btn-secondary" onClick={() => setReportOpen(true)} disabled={!documentId}>
              <Icon name="flag" size={14} /> Report a document
            </button>
          </>
        }
      />

      {loading && !overview && <LoadingBlock label="Loading safety overview…" />}
      {error && !overview && <ErrorState error={error} onRetry={reloadOverview} />}

      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Your documents" value={fmtNumber(counts.documents)} icon="file" tone="accent" hint={`${fmtNumber(counts.analysed)} analysed`} to="/app/documents" />
          <StatCard label="Redacted copies" value={fmtNumber(counts.redacted_copies)} icon="eye" tone="emerald" hint="Page-1 image with regions covered" />
          <StatCard label="Open reports" value={fmtNumber(counts.open_alerts)} icon="flag" tone="amber" hint="Submitted for review" />
          <StatCard label="Retention" value={`${fmtNumber(overview.retention_days)}d`} icon="clock" tone="slate" hint="Adjust in profile settings" to="/app/settings" />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Panel title="Personal-information scan" subtitle="Pattern-based detection — review every result before relying on it" icon="scan">
            <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr] sm:items-end">
              <DocumentSelect label="Document" documents={documents} loading={docsLoading} value={documentId} onChange={setDocumentId} />
              <button type="button" className="btn-primary" onClick={runScan} disabled={!documentId || scanBusy}>
                {scanBusy ? 'Scanning…' : 'Scan for personal information'}
              </button>
            </div>

            {actionError && <Alert tone="danger" className="mt-3">{actionError}</Alert>}

            {scan && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="accent">{fmtNumber(scan.count)} detection{scan.count === 1 ? '' : 's'}</Pill>
                  <span className="text-[10.5px] text-slate-500">Detected in OCR text and word boxes</span>
                </div>
                {detections.length ? (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {typeGroups.map((group) => (
                        <label key={group.type} className={cx('flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 transition', selectedTypes.includes(group.type) ? 'border-accent-400/35 bg-accent-400/[0.07]' : 'border-white/[0.07] bg-white/[0.02]')}>
                          <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-cyan-400" checked={selectedTypes.includes(group.type)} onChange={() => toggleType(group.type)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[11.5px] font-medium text-slate-200">{group.label}</span>
                              <span className="font-mono text-[10px] text-slate-400">{group.count}</span>
                            </span>
                            <span className="mt-0.5 block text-[9.5px] text-slate-500">max confidence {Math.round(group.maxConfidence * 100)}%</span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-navy-950/40">
                      {detections.slice(0, 12).map((detection, index) => (
                        <div key={`${detection.type}-${index}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                          <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{PII_LABELS[detection.type] || detection.type}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-300">{detection.masked || '••••'}</span>
                          <span className="font-mono text-[9.5px] text-slate-500">{detection.confidence != null ? `${Math.round(Number(detection.confidence) * 100)}%` : ''}</span>
                        </div>
                      ))}
                      {detections.length > 12 && <p className="px-3 py-2 text-[10px] text-slate-500">+{detections.length - 12} more detection(s) — all selected types will be redacted.</p>}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-500">Redaction covers detected regions with black boxes on page 1.</p>
                      <button type="button" className="btn-primary btn-sm" onClick={runRedaction} disabled={redacting || !selectedTypes.length}>
                        <Icon name="eye" size={12} /> {redacting ? 'Redacting…' : `Redact ${selectedTypes.length} type${selectedTypes.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                    {scan.note && <Note className="mt-2">{scan.note}</Note>}
                  </>
                ) : (
                  <div className="mt-3">
                    <EmptyState icon="check" title="No personal information detected" description="The pattern scanner found no Aadhaar, PAN, account, card, phone or email patterns. Manual review is still recommended." />
                  </div>
                )}
              </div>
            )}
          </Panel>

          {redaction && (
            <Panel title="Redacted copy" subtitle="Verify all sensitive regions are covered before sharing" icon="eye">
              <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
                <AuthImage
                  path={`/documents/${documentId}/preview`}
                  params={{ variant: 'redacted' }}
                  alt="Redacted document preview"
                  className="max-h-[340px] rounded-xl border border-white/[0.07]"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="emerald">{redaction.detection_count} region(s) redacted</Pill>
                    <RiskBadge category={redaction.document?.risk?.category} size="sm" />
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">{redaction.note}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <DownloadButton path={`/public/documents/${documentId}/redacted-text`} filename={`kavacha-redacted-${documentId}.txt`} label="Download redacted text" />
                    <Link to={`/app/documents/${documentId}/forensics?variant=redacted`} className="btn-ghost btn-sm">Open viewer</Link>
                  </div>
                  <details className="mt-3 rounded-xl border border-white/[0.07] bg-navy-950/40 p-3">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-300">Redacted OCR text preview</summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">{redaction.redacted_text}</pre>
                  </details>
                </div>
              </div>
              <Alert tone="warning" title="Check the copy" className="mt-3">
                Automated redaction can miss or over-cover content. Inspect the redacted image and text before sending
                anything to a third party.
              </Alert>
            </Panel>
          )}

          <Panel title="My reports" subtitle="Suspicious documents submitted for review" icon="flag" padded={false}>
            {reportsLoading && !reportsData && <LoadingBlock label="Loading reports…" />}
            {!reportsLoading && !reports.length && <p className="px-4 py-8 text-center text-xs text-slate-500">You have not reported any documents yet.</p>}
            {!!reports.length && (
              <ul className="divide-y divide-white/[0.06]">
                {reports.map((report) => (
                  <li key={report.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={report.severity} />
                      <StatusBadge status={report.status} />
                      <span className="ml-auto text-[9.5px] text-slate-500">{timeAgo(report.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-200">{report.title}</p>
                    <p className="text-[10px] leading-relaxed text-slate-500">{report.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Risk overview" subtitle="Documents in the public portal" icon="gauge">
            <RiskDistributionChart distribution={overview?.risk_distribution || {}} height={190} />
          </Panel>

          <Panel title="Safety checklist" subtitle="Practical steps before you pay or share" icon="shield">
            <ul className="space-y-2">
              {(overview?.safety_tips || []).map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-300">
                  <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-400/80" />
                  {tip}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Privacy commitments" subtitle="How your documents are handled" icon="lock">
            <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-400">
              {(overview?.privacy || []).map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </Panel>

          <Panel title="Recent documents" subtitle="Only your account can access these" icon="file" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">All</Link>}>
            {(overview?.recent_documents || []).length ? (
              <ul className="divide-y divide-white/[0.05]">
                {overview.recent_documents.map((doc) => (
                  <li key={doc.id}>
                    <Link to={`/app/documents/${doc.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{doc.original_filename}</span>
                      <RiskBadge category={doc.risk?.category} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-8 text-center text-xs text-slate-500">No documents yet.</p>}
          </Panel>

          {overview?.disclaimer && <Note>{overview.disclaimer}</Note>}
        </div>
      </div>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a suspicious document"
        description="Your report is added to the platform review queue. Personal documents are never published."
        icon="flag"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setReportOpen(false)} disabled={reportBusy}>Cancel</button>
            <button type="submit" form="report-form" className="btn-secondary" disabled={reportBusy || !documentId}>{reportBusy ? 'Submitting…' : 'Submit report'}</button>
          </>
        }
      >
        <form id="report-form" onSubmit={submitReport} className="space-y-3">
          <div>
            <span className="label">Document</span>
            <DocumentSelect documents={documents} loading={docsLoading} value={documentId} onChange={setDocumentId} label={null} placeholder="Choose a document…" />
          </div>
          <div>
            <span className="label">Reason</span>
            <select className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </select>
          </div>
          <div>
            <span className="label">What happened?</span>
            <textarea
              className="textarea"
              rows={4}
              maxLength={2000}
              placeholder="Describe the request, the amounts involved and any contact details used. Do not include Aadhaar or account numbers in this description."
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
            />
            <p className="mt-1 text-right font-mono text-[9.5px] text-slate-500">{reportDescription.length}/2000</p>
          </div>
          <Alert tone="info" title="What happens next">
            Administrators review reports alongside risk signals. A report does not by itself establish that a document is forged.
          </Alert>
        </form>
      </Modal>
    </div>
  );
}
