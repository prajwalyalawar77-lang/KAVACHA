import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApiResource, useDocumentTitle } from '../hooks/useApiResource';
import Icon from '../components/Icon';
import { Alert, Field, Note, PageHeader, Panel, ProgressBar, ProgressPipeline, RiskBadge } from '../components/ui';
import { api } from '../services/api';
import { DOC_KIND_LABELS, KINDS_BY_PORTAL } from '../utils/constants';
import { cx, fileSize } from '../utils/format';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const MAX_MB = 25;

const PORTAL_COPY = {
  public: {
    label: 'Public / personal',
    hint: 'Job offers, certificates, rental agreements, receipts and other documents you received.',
  },
  industrial: {
    label: 'Industrial / business',
    hint: 'Invoices, purchase orders, GST documents, licences and supplier certificates.',
  },
};

const ANALYSIS_STEPS = [
  { code: 'stored', label: 'Secure storage + SHA-256 fingerprint' },
  { code: 'metadata_ocr', label: 'Metadata extraction and OCR (Tesseract)' },
  { code: 'forensics', label: 'Forensic indicators and tampering regions' },
  { code: 'verification', label: 'Format validation of GSTIN, PAN, IFSC and amounts' },
  { code: 'fraud', label: 'Fraud-intelligence correlation' },
  { code: 'risk', label: 'Explainable risk scoring' },
];

export default function UploadPage() {
  useDocumentTitle('Upload document');
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const defaultPortal = user?.role === 'industrial' ? 'industrial' : 'public';
  const [portal, setPortal] = useState(defaultPortal);
  const [docKind, setDocKind] = useState('other');
  const [language, setLanguage] = useState('eng');
  const [expiryDate, setExpiryDate] = useState('');
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const kinds = KINDS_BY_PORTAL[portal] || ['other'];
  const { data: recent } = useApiResource('/documents', { per_page: 4, sort: 'created_at', direction: 'desc' });

  const acceptFile = (candidate) => {
    setError(null);
    setResult(null);
    if (!candidate) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(candidate.type) && !/\.(pdf|jpe?g|png)$/i.test(candidate.name)) {
      setError('Only PDF, JPG and PNG files are accepted.');
      return;
    }
    if (candidate.size > MAX_MB * 1024 * 1024) {
      setError(`The file is ${fileSize(candidate.size)}. The maximum upload size is ${MAX_MB} MB.`);
      return;
    }
    setFile(candidate);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const onPortalChange = (next) => {
    setPortal(next);
    if (!KINDS_BY_PORTAL[next]?.includes(docKind)) setDocKind('other');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Attach a PDF, JPG or PNG file to continue.');
      return;
    }
    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append('portal', portal);
    form.append('doc_kind', docKind);
    form.append('file', file);
    form.append('language', language);
    form.append('auto_analyse', autoAnalyse ? 'true' : 'false');
    if (expiryDate) form.append('expiry_date', expiryDate);
    try {
      const { data } = await api.upload('/documents', form, (pct) => setProgress(pct));
      setResult(data);
      setFile(null);
      if (data.analysis_error) {
        toast.warning('Uploaded, but automatic analysis failed', data.analysis_error);
      } else {
        toast.success('Document uploaded', autoAnalyse ? 'Analysis finished — review the findings.' : 'You can start analysis from the document page.');
      }
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const summarised = useMemo(() => {
    if (!result?.document) return null;
    return result.document;
  }, [result]);

  return (
    <div>
      <PageHeader
        eyebrow="Secure intake"
        title="Upload a document"
        subtitle="Files stay private to your account. Uploaded content is never executed and is only served through authenticated endpoints."
        actions={<Link to="/app/documents" className="btn-ghost"><Icon name="history" size={15} /> Document history</Link>}
      />

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Panel title="New upload" subtitle="PDF, JPG or PNG · up to 25 MB per file" icon="upload">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(PORTAL_COPY)).map((key) => {
                const copy = PORTAL_COPY[key];
                const active = portal === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onPortalChange(key)}
                    className={cx(
                      'rounded-xl border p-3 text-left transition',
                      active
                        ? 'border-accent-400/40 bg-accent-400/[0.07] shadow-glow-sm'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15',
                    )}
                  >
                    <span className={cx('text-[12px] font-semibold', active ? 'text-accent-100' : 'text-slate-200')}>{copy.label}</span>
                    <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-500">{copy.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Document type" hint="Used to select checks and expected fields.">
                <select className="select" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>{DOC_KIND_LABELS[kind] || kind}</option>
                  ))}
                </select>
              </Field>
              <Field label="OCR language" hint="Kannada requires the Tesseract kan language pack.">
                <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="eng">English</option>
                  <option value="kan">Kannada</option>
                  <option value="eng+kan">English + Kannada</option>
                </select>
              </Field>
              <Field label="Expiry date" hint="Optional. Used for certificates and licences; extracted dates take precedence when available.">
                <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </Field>
              <div>
                <span className="label">Automatic analysis</span>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-cyan-400" checked={autoAnalyse} onChange={(e) => setAutoAnalyse(e.target.checked)} />
                  <span className="text-[11.5px] text-slate-300">Analyse as soon as the upload completes</span>
                </label>
                <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-500">Runs OCR, forensics, validation and risk scoring immediately.</span>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                'relative flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-6 text-center transition',
                dragging ? 'border-accent-400/70 bg-accent-400/[0.07]' : 'border-white/15 bg-white/[0.015] hover:border-white/25',
                file && 'border-emerald-400/40 bg-emerald-400/[0.04]',
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl border', file ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-accent-300')}>
                <Icon name={file ? 'check' : 'upload'} size={20} />
              </span>
              {file ? (
                <div>
                  <p className="max-w-[320px] truncate text-[12.5px] font-medium text-slate-200">{file.name}</p>
                  <p className="mt-1 text-[10.5px] text-slate-500">{fileSize(file.size)} · {file.type || 'unknown type'}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[12.5px] font-medium text-slate-200">Drag and drop a file here</p>
                  <p className="mt-1 text-[10.5px] text-slate-500">or choose one from your device</p>
                </div>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {file ? 'Choose a different file' : 'Browse files'}
              </button>
            </div>

            {error && <Alert tone="danger" title="Could not upload this file">{error}</Alert>}

            {uploading && (
              <div className="rounded-xl border border-accent-400/20 bg-accent-400/[0.05] p-3">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-accent-100">{progress >= 100 ? 'Server-side analysis running…' : 'Uploading securely…'}</span>
                  {progress < 100 && <span className="font-mono text-accent-200">{Math.round(progress)}%</span>}
                </div>
                <ProgressBar value={progress >= 100 ? 92 : progress} tone="accent" />
                {progress >= 100 && (
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    OCR and forensic analysis can take a few seconds per page. Keep this tab open.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <p className="text-[10px] text-slate-500">By uploading you confirm you have the right to process this document.</p>
              <button type="submit" className="btn-primary" disabled={uploading || !file}>
                <Icon name="upload" size={14} />
                {uploading ? 'Processing…' : 'Upload and analyse'}
              </button>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          {result && summarised ? (
            <Panel title="Upload complete" subtitle={summarised.original_filename} icon="check" className="border-emerald-400/20">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge category={summarised.risk?.category} size="sm" />
                <span className="text-[11px] text-slate-400">Keep in mind: risk bands are configurable demonstration thresholds.</span>
              </div>
              {result.analysis_error && (
                <Alert tone="warning" title="Automatic analysis failed" className="mt-3">
                  {result.analysis_error}
                </Alert>
              )}
              <div className="mt-4">
                <ProgressPipeline steps={ANALYSIS_STEPS.map((step) => ({ ...step, state: 'done' }))} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/app/documents/${summarised.id}`)}>
                  Open analysis <Icon name="arrowRight" size={12} />
                </button>
                <Link to={`/app/documents/${summarised.id}/forensics`} className="btn-ghost btn-sm">Forensic viewer</Link>
                <Link to={`/app/documents/${summarised.id}/verification`} className="btn-ghost btn-sm">Verification</Link>
              </div>
            </Panel>
          ) : (
            <Panel title="What happens next" subtitle="Six deterministic stages, each explainable" icon="sparkles">
              <ProgressPipeline steps={ANALYSIS_STEPS.map((step, index) => ({ ...step, state: uploading ? (index === 0 ? 'active' : 'pending') : 'pending' }))} />
              <Note className="mt-4">
                If OCR or a model is unavailable, the platform records the step as skipped or failed instead of inventing a
                result. External GST, bank and government checks are format validation only unless official APIs are configured.
              </Note>
            </Panel>
          )}

          <Panel title="Recent uploads" subtitle="Your latest documents" icon="history" padded={false} action={<Link to="/app/documents" className="btn-ghost btn-sm">View all</Link>}>
            {(recent?.documents || []).length ? (
              <ul className="divide-y divide-white/[0.05]">
                {recent.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link to={`/app/documents/${doc.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                      <span className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[8.5px] font-semibold text-slate-400">
                        {(doc.mime_type || '').includes('pdf') ? 'PDF' : 'IMG'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] text-slate-200">{doc.original_filename}</span>
                        <span className="block text-[9.5px] uppercase tracking-wider text-slate-500">{DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind}</span>
                      </span>
                      <RiskBadge category={doc.risk?.category} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-xs text-slate-500">No documents yet. Your uploads will appear here.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
