import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDocumentTitle, usePolling } from '../hooks/useApiResource';
import AuthImage from '../components/AuthImage';
import Icon from '../components/Icon';
import {
  Alert, CheckList, CheckSummary, CopyButton, ErrorState, Gauge, KeyValue, LoadingBlock, Modal, Note, PageHeader,
  Panel, Pill, ProgressBar, ProgressPipeline, RiskBadge, ScoreLegend, StatusBadge,
} from '../components/ui';
import { api } from '../services/api';
import { DOC_KIND_LABELS } from '../utils/constants';
import { cx, formatDateTime, fmtNumber, timeAgo } from '../utils/format';

const FIELD_LABELS = {
  gstin: 'GSTIN',
  gstins: 'GSTINs',
  pan: 'PAN',
  pans: 'PANs',
  ifsc: 'IFSC',
  bank_account: 'Bank account',
  bank_name: 'Bank name',
  invoice_number: 'Invoice number',
  invoice_date: 'Invoice date',
  amount: 'Amount',
  total_amount: 'Total amount',
  taxable_amount: 'Taxable amount',
  tax_amount: 'Tax amount',
  vendor_name: 'Vendor',
  buyer_name: 'Buyer',
  po_number: 'PO number',
  salary_amount: 'Salary',
  emails: 'Email addresses',
  phones: 'Phone numbers',
  hsn_codes: 'HSN codes',
  place_of_supply: 'Place of supply',
  irn: 'Invoice reference number',
  expiry_date: 'Expiry date',
  dates: 'Detected dates',
  amounts: 'Detected amounts',
  tax_rates: 'Tax rates',
};

function pretty(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, val]) => `${key}: ${val}`).join(' · ');
  }
  return String(value);
}

export default function AnalysisPage() {
  const { documentId } = useParams();
  const id = Number(documentId);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analysing, setAnalysing] = useState(false);

  const { data: document, loading, error, reload } = useApiResource(`/documents/${id}`, undefined, { enabled: Number.isFinite(id) });
  useDocumentTitle(document?.original_filename || 'Document analysis');

  const status = document?.status;
  const busy = status === 'uploaded' || status === 'processing';
  usePolling(reload, 4000, Boolean(busy) && !error);

  const canManage = user?.role === 'admin' || document?.owner_id === user?.id;

  const runAnalysis = async () => {
    setAnalysing(true);
    try {
      const { data } = await api.post(`/documents/${id}/analyse`, { language: document?.language || undefined });
      if (data?.document) reload();
      toast.success('Analysis finished', 'Review the updated forensic indicators and risk signals.');
    } catch (err) {
      toast.error('Analysis failed', err.message);
      reload();
    } finally {
      setAnalysing(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/documents/${id}`);
      toast.success('Document deleted', 'The file, OCR text and derived analysis were removed.');
      navigate('/app/documents', { replace: true });
    } catch (err) {
      toast.error('Could not delete the document', err.message);
      setDeleting(false);
    }
  };

  const generateReport = async () => {
    try {
      const { data } = await api.post('/reports', { document_id: id });
      toast.success('Verification report created', 'A share link, QR code and PDF are available in Reports.');
      reload();
      if (data?.share_url) navigate('/app/reports');
    } catch (err) {
      toast.error('Could not generate the report', err.message);
    }
  };

  if (loading && !document) {
    return <LoadingBlock label="Loading document analysis…" />;
  }
  if (error && !document) {
    return (
      <div>
        <PageHeader eyebrow="Document analysis" title="Document unavailable" backTo="/app/documents" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!document) return null;

  const risk = document.risk;
  const progress = document.progress;
  const ocr = document.ocr;
  const metadata = document.metadata;
  const tampering = document.tampering;
  const checks = document.checks || [];
  const alerts = document.alerts || [];
  const reports = document.reports || [];
  const fingerprint = document.fingerprint;
  const signals = (risk?.signals || []).slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const ocrFields = ocr?.fields && typeof ocr.fields === 'object' ? Object.entries(ocr.fields).filter(([, value]) => value !== null && value !== undefined && value !== '') : [];

  return (
    <div>
      <PageHeader
        eyebrow={`${document.portal === 'industrial' ? 'Industrial portal' : 'Public portal'} · ${DOC_KIND_LABELS[document.doc_kind] || document.doc_kind}`}
        title={document.original_filename}
        subtitle={`Uploaded ${formatDateTime(document.created_at)} · ${document.page_count || '—'} page(s) · SHA-256 ${document.sha256?.slice(0, 16)}…`}
        backTo="/app/documents"
        actions={
          <>
            <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost"><Icon name="scan" size={14} /> Forensics</Link>
            <Link to={`/app/documents/${document.id}/verification`} className="btn-ghost"><Icon name="check" size={14} /> Verification</Link>
            <Link to={`/app/documents/${document.id}/risk`} className="btn-secondary"><Icon name="gauge" size={14} /> Risk explainability</Link>
            {canManage && (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={14} /> Delete
              </button>
            )}
          </>
        }
      />

      {busy && (
        <div className="mb-4 card p-4">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="text-accent-100">{progress?.message || 'Analysis in progress…'}</span>
            <span className="font-mono text-accent-200">{progress?.percent ?? 0}%</span>
          </div>
          <ProgressBar value={progress?.percent || 0} />
          <p className="mt-2 text-[10px] text-slate-500">This page refreshes automatically. OCR and forensic analysis may take a few seconds per page.</p>
        </div>
      )}

      {progress?.error && status === 'failed' && (
        <Alert tone="danger" title="Analysis failed" className="mb-4">{progress.error}</Alert>
      )}
      {status === 'uploaded' && !busy && (
        <Alert tone="info" title="This document has not been analysed yet" className="mb-4">
          Run analysis to extract text, compute forensic indicators and generate an explainable risk assessment.
          <div className="mt-2">
            <button type="button" className="btn-primary btn-sm" onClick={runAnalysis} disabled={analysing}>
              {analysing ? 'Analysing…' : 'Run analysis'}
            </button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Panel title="Risk assessment" subtitle="Explainable, threshold-driven score — not a calibrated fraud probability" icon="gauge" action={<Link to={`/app/documents/${document.id}/risk`} className="btn-ghost btn-sm">Full breakdown</Link>}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Gauge score={risk?.score || 0} category={risk?.category || 'unassessed'} confidence={risk?.confidence} size={190} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge category={risk?.category} score={risk?.score} showScore size="md" />
                  <StatusBadge status={document.status === 'failed' ? 'failed_status' : document.status} />
                  {alerts.length > 0 && <Pill tone="amber">{alerts.length} alert{alerts.length === 1 ? '' : 's'}</Pill>}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                  {risk?.summary || (busy ? 'Analysis in progress…' : 'No risk assessment has been produced for this document yet.')}
                </p>
                {risk?.counts && <div className="mt-3"><CheckSummary counts={risk.counts} /></div>}
                {risk?.updated_at && <p className="mt-2 text-[10px] text-slate-500">Engine {risk.engine_version} · updated {timeAgo(risk.updated_at)}</p>}
              </div>
            </div>
            <div className="mt-3"><ScoreLegend thresholds={risk?.thresholds} /></div>
          </Panel>

          <Panel title="Analysis pipeline" subtitle="Each step records what ran, what was skipped and why" icon="layers">
            <ProgressPipeline steps={progress?.steps || []} orientation="horizontal" />
          </Panel>

          <Panel title="Top risk signals" subtitle="Weighted indicators raised by the rule engine" icon="alert" padded={false} action={risk ? <Link to={`/app/documents/${document.id}/risk`} className="btn-ghost btn-sm">All signals</Link> : null}>
            {signals.length ? (
              <ul className="divide-y divide-white/[0.06]">
                {signals.slice(0, 6).map((signal) => (
                  <li key={signal.code} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={signal.severity} />
                      <span className="text-[12px] font-medium text-slate-200">{signal.title}</span>
                      <span className="ml-auto font-mono text-[10px] text-slate-500">{signal.module} · weight {Number(signal.weight || 0).toFixed(1)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{signal.explanation}</p>
                    {signal.evidence && typeof signal.evidence === 'object' && Object.keys(signal.evidence).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(signal.evidence).slice(0, 4).map(([key, value]) => (
                          <span key={key} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-400">
                            {key}: {pretty(value).slice(0, 70)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                {busy ? 'Indicators will appear when analysis completes.' : 'No risk signals were raised for this document.'}
              </p>
            )}
          </Panel>

          {!!checks.length && (
            <Panel title="Verification checks" subtitle="Format validation and internal consistency — not external confirmation" icon="check" padded={false} action={<Link to={`/app/documents/${document.id}/verification`} className="btn-ghost btn-sm">Details</Link>}>
              <div className="px-5 pt-4"><CheckSummary counts={{
                passed: checks.filter((c) => c.status === 'passed').length,
                failed: checks.filter((c) => c.status === 'failed').length,
                warning: checks.filter((c) => c.status === 'warning').length,
                skipped: checks.filter((c) => c.status === 'skipped').length,
                unverified: checks.filter((c) => c.status === 'unverified').length,
              }} /></div>
              <div className="px-5 pb-3"><CheckList checks={checks.slice(0, 8)} compact /></div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Original preview" subtitle="Authenticated access only" icon="eye" padded={false}>
            <div className="p-3">
              <AuthImage path={`/documents/${document.id}/preview`} params={{ variant: 'original' }} alt={`Preview of ${document.original_filename}`} className="max-h-[360px] w-full rounded-lg border border-white/[0.07] object-contain" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost btn-sm"><Icon name="scan" size={12} /> Full viewer</Link>
                {document.artifacts?.heatmap && <Link to={`/app/documents/${document.id}/forensics?variant=heatmap`} className="btn-ghost btn-sm">Heatmap</Link>}
              </div>
            </div>
          </Panel>

          <Panel title="Document DNA" subtitle="Cryptographic and perceptual fingerprints" icon="fingerprint">
            <KeyValue
              columns={1}
              items={[
                { label: 'SHA-256', mono: true, value: <span className="inline-flex items-center gap-2 break-all">{document.sha256}<CopyButton value={document.sha256} /></span> },
                { label: 'dHash', mono: true, value: fingerprint?.dhash || '—' },
                { label: 'aHash', mono: true, value: fingerprint?.ahash || '—' },
                { label: 'Pixel dimensions', mono: true, value: fingerprint?.width ? `${fingerprint.width} × ${fingerprint.height}` : '—' },
                { label: 'File size', value: document.file_size ? `${(document.file_size / 1024).toFixed(1)} KB` : '—' },
              ]}
            />
            <Note className="mt-2">Identical or near-identical fingerprints indicate copies. They do not, by themselves, prove manipulation.</Note>
          </Panel>

          <Panel title="Extracted fields" subtitle={ocr ? `OCR engine ${ocr.engine} · ${ocr.language} · ${ocr.word_count || 0} words` : 'No OCR result'} icon="file">
            {ocrFields.length ? (
              <KeyValue columns={1} dense items={ocrFields.slice(0, 14).map(([key, value]) => ({ label: FIELD_LABELS[key] || key.replace(/_/g, ' '), value: pretty(value), mono: true }))} />
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">{busy ? 'Extracting text…' : 'No structured fields were extracted.'}</p>
            )}
            {ocr?.note && <Note className="mt-2">{ocr.note}</Note>}
          </Panel>

          <Panel title="Metadata" subtitle="PDF properties are indicative, never proof of forgery" icon="info">
            {metadata ? (
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'Title', value: metadata.title },
                  { label: 'Author', value: metadata.author },
                  { label: 'Creator', value: metadata.creator },
                  { label: 'Producer', value: metadata.producer },
                  { label: 'Created', value: metadata.creation_date },
                  { label: 'Modified', value: metadata.modification_date },
                  { label: 'PDF version', mono: true, value: metadata.pdf_version },
                  { label: 'Incremental updates', mono: true, value: metadata.incremental_updates ?? 0 },
                  { label: 'Digital signature', value: metadata.has_signature ? `Present (${metadata.signature_count})` : 'Not present' },
                ]}
              />
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">No metadata record.</p>
            )}
          </Panel>

          {tampering && (
            <Panel title="Forensic indicators" subtitle="Computed by the image-forensics baseline" icon="scan">
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'Pages analysed', mono: true, value: tampering.analysis_pages },
                  { label: 'ELA high-detail fraction', mono: true, value: tampering.ela_high_fraction != null ? Number(tampering.ela_high_fraction).toFixed(3) : '—' },
                  { label: 'Copy-move pairs', mono: true, value: tampering.copy_move_pairs ?? 0 },
                  { label: 'Noise outlier fraction', mono: true, value: tampering.noise_outlier_fraction != null ? Number(tampering.noise_outlier_fraction).toFixed(3) : '—' },
                  { label: 'Estimated quality', mono: true, value: tampering.estimated_quality ?? '—' },
                  { label: 'Suspicious regions', mono: true, value: (tampering.regions || []).length },
                ]}
              />
              <Note className="mt-2">Indicators highlight regions for human review. They do not confirm manipulation.</Note>
            </Panel>
          )}

          {!!alerts.length && (
            <Panel title="Fraud-intelligence alerts" subtitle="Generated from repeated identifiers and failed checks" icon="flag" padded={false}>
              <ul className="divide-y divide-white/[0.06]">
                {alerts.map((alert) => (
                  <li key={alert.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={alert.severity} />
                      <StatusBadge status={alert.status} />
                      <span className="ml-auto text-[9.5px] text-slate-500">{timeAgo(alert.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-200">{alert.title}</p>
                    <p className="text-[10px] leading-relaxed text-slate-500">{alert.description}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Verification reports" subtitle="Shareable links can be revoked at any time" icon="qr">
            {reports.length ? (
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div>
                      <p className="text-[11px] text-slate-200">Report #{report.id} · {report.valid ? 'valid' : 'expired'}</p>
                      <p className="text-[9.5px] text-slate-500">Created {formatDateTime(report.created_at)}</p>
                    </div>
                    <Link to="/app/reports" className="btn-ghost btn-sm">Manage</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-400">
                No verification report exists. A report summarises checks and the risk band for sharing with a third party.
                It is not a certificate of authenticity.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={generateReport}>Generate report</button>
              <button type="button" className="btn-ghost btn-sm" onClick={runAnalysis} disabled={analysing || busy}>{analysing ? 'Analysing…' : 'Re-run analysis'}</button>
            </div>
          </Panel>

          <Panel title="Actions" subtitle="Forensics, comparison and sharing" icon="sparkles">
            <div className="grid grid-cols-2 gap-2">
              <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost btn-sm justify-start"><Icon name="scan" size={12} /> Forensic viewer</Link>
              <Link to={`/app/documents/${document.id}/verification`} className="btn-ghost btn-sm justify-start"><Icon name="check" size={12} /> Verification</Link>
              <Link to={`/app/documents/${document.id}/risk`} className="btn-ghost btn-sm justify-start"><Icon name="gauge" size={12} /> Risk signals</Link>
              <Link to={`/app/compare?left=${document.id}`} className="btn-ghost btn-sm justify-start"><Icon name="compare" size={12} /> Compare</Link>
              {document.portal === 'public' && <Link to={`/app/safety?document=${document.id}`} className="btn-ghost btn-sm justify-start"><Icon name="lock" size={12} /> PII &amp; redaction</Link>}
              <Link to="/app/reports" className="btn-ghost btn-sm justify-start"><Icon name="qr" size={12} /> Reports</Link>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Securely delete this document?"
        description="The stored file, previews, OCR text, forensic artefacts, checks, alerts and reports will be permanently removed. This cannot be undone."
        icon="trash"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
            <button type="button" className="btn-danger" onClick={remove} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </>
        }
      >
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] leading-relaxed text-rose-200">
          {fmtNumber(document.checks?.length || 0)} checks · {alerts.length} alerts · {reports.length} reports will be removed.
        </div>
      </Modal>
    </div>
  );
}
