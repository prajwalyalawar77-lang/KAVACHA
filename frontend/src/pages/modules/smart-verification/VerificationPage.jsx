import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import { useToast } from '../../../context/ToastContext';
import Icon from '../../../components/Icon';
import {
  Alert, CheckList, CheckSummary, ErrorState, Field, LoadingBlock, Note, PageHeader, Panel, Pill, RiskBadge,
  StatusBadge,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { DOC_KIND_LABELS } from '../../../utils/constants';
import { cx, formatDateTime, fmtMoney } from '../../../utils/format';

const FIELD_ORDER = [
  ['invoice_number', 'Invoice number'],
  ['invoice_date', 'Invoice date'],
  ['vendor_name', 'Vendor / seller'],
  ['buyer_name', 'Buyer'],
  ['po_number', 'Purchase order number'],
  ['gstin', 'GSTIN'],
  ['pan', 'PAN'],
  ['bank_account', 'Bank account'],
  ['ifsc', 'IFSC'],
  ['bank_name', 'Bank name'],
  ['salary_amount', 'Salary amount'],
  ['expiry_date', 'Expiry date'],
  ['place_of_supply', 'Place of supply'],
  ['irn', 'Invoice reference number'],
  ['address', 'Address'],
];

function metaValue(meta) {
  if (!meta) return null;
  if (typeof meta === 'object' && 'value' in meta) return meta;
  return { value: meta, confidence: null, method: null, status: 'found' };
}

function ValidatorPlayground({ prefill = {} }) {
  const toast = useToast();
  const [values, setValues] = useState({ gstin: '', pan: '', ifsc: '', bank_account: '', invoice_number: '', ...prefill });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => String(value || '').trim()));
      if (!Object.keys(payload).length) {
        setError('Enter at least one value to validate.');
        setBusy(false);
        return;
      }
      const { data } = await api.post('/verification/validate', payload);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Identifier validator" subtitle="Offline format and checksum checks — no external lookup" icon="check">
      <form onSubmit={run} className="space-y-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="GSTIN"><input className="input font-mono" placeholder="29ABCDE1234F1Z5" value={values.gstin} onChange={(e) => setValues({ ...values, gstin: e.target.value.toUpperCase() })} /></Field>
          <Field label="PAN"><input className="input font-mono" placeholder="ABCDE1234F" value={values.pan} onChange={(e) => setValues({ ...values, pan: e.target.value.toUpperCase() })} /></Field>
          <Field label="IFSC"><input className="input font-mono" placeholder="HDFC0001234" value={values.ifsc} onChange={(e) => setValues({ ...values, ifsc: e.target.value.toUpperCase() })} /></Field>
          <Field label="Bank account"><input className="input font-mono" placeholder="123456789012" value={values.bank_account} onChange={(e) => setValues({ ...values, bank_account: e.target.value })} /></Field>
          <Field label="Invoice number" className="sm:col-span-2"><input className="input font-mono" placeholder="INV/2026/0042" value={values.invoice_number} onChange={(e) => setValues({ ...values, invoice_number: e.target.value })} /></Field>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="link text-[10.5px]" onClick={() => { setValues({ gstin: '', pan: '', ifsc: '', bank_account: '', invoice_number: '', ...prefill }); setResult(null); }}>
            Reset
          </button>
          <button type="submit" className="btn-secondary btn-sm" disabled={busy}>{busy ? 'Validating…' : 'Validate identifiers'}</button>
        </div>
      </form>

      {result && (
        <div className="mt-3 space-y-2">
          {Object.entries(result.results || {}).map(([key, value]) => (
            <div key={key} className={cx('rounded-lg border px-3 py-2', value.valid ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-rose-400/20 bg-rose-400/[0.05]')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{key.replace(/_/g, ' ')}</span>
                <span className="ml-auto"><StatusBadge status={value.valid ? 'passed' : 'failed'} /></span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-200">{value.value || '—'}</p>
              {(value.errors || []).length > 0 && <p className="mt-1 text-[10px] text-rose-300">{value.errors.join(' ')}</p>}
              {value.note && <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{value.note}</p>}
              {value.checks && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(value.checks).map(([checkKey, checkValue]) => (
                    <span key={checkKey} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{checkKey}: {String(checkValue)}</span>
                  ))}
                </div>
              )}
              {value.prefix_known !== undefined && (
                <p className="mt-1 text-[10px] text-slate-500">Known bank prefix: {value.prefix_known ? 'yes (syntactic list)' : 'not in local prefix list'}</p>
              )}
            </div>
          ))}
          {result.note && <Note>{result.note}</Note>}
        </div>
      )}
    </Panel>
  );
}

function VerificationPicker() {
  const { data, loading, error, reload } = useApiResource('/documents', { status: 'analysed', per_page: 12, sort: 'created_at', direction: 'desc' });
  return (
    <div>
      <PageHeader
        eyebrow="Smart document verification"
        title="Verification"
        subtitle="Choose an analysed document to inspect its extracted fields, format checks and internal consistency."
        backTo="/app/dashboard"
        actions={<Link to="/app/compare" className="btn-secondary"><Icon name="compare" size={14} /> Compare versions</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Analysed documents" subtitle="OCR and extraction must have completed" icon="file" padded={false}>
          {loading && <LoadingBlock label="Loading documents…" />}
          {error && !loading && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
          {!loading && !(data?.documents || []).length && (
            <p className="px-4 py-10 text-center text-xs text-slate-500">No analysed documents yet. Upload a document first.</p>
          )}
          <ul className="divide-y divide-white/[0.06]">
            {(data?.documents || []).map((doc) => (
              <li key={doc.id}>
                <Link to={`/app/documents/${doc.id}/verification`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[9px] font-semibold text-slate-400">
                    {(doc.mime_type || '').includes('pdf') ? 'PDF' : 'IMG'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-slate-200">{doc.original_filename}</span>
                    <span className="block text-[10px] text-slate-500">{DOC_KIND_LABELS[doc.doc_kind] || doc.doc_kind} · {formatDateTime(doc.created_at)}</span>
                  </span>
                  <RiskBadge category={doc.risk?.category} size="sm" />
                  <Icon name="chevronRight" size={13} className="text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <ValidatorPlayground />
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { documentId } = useParams();
  const id = documentId ? Number(documentId) : null;
  useDocumentTitle('Smart verification');

  const { data, loading, error, reload } = useApiResource(id ? `/verification/${id}` : null, undefined, { enabled: Boolean(id) });

  if (!id) return <VerificationPicker />;
  if (loading && !data) return <LoadingBlock label="Loading verification results…" />;
  if (error && !data) {
    return (
      <div>
        <PageHeader eyebrow="Smart document verification" title="Verification unavailable" backTo={`/app/documents/${id}`} />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;

  const { document, checks = [], extracted = {}, supplier, ocr, note } = data;
  const counts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const fields = extracted.fields || {};
  const rows = FIELD_ORDER
    .map(([key, label]) => ({ key, label, meta: metaValue(fields[key]) }))
    .filter((row) => row.meta && row.meta.value !== null && row.meta.value !== undefined && row.meta.value !== '');
  const extraRows = Object.entries(fields)
    .filter(([key, value]) => !FIELD_ORDER.some(([known]) => known === key) && value && value.value !== null && value.value !== undefined && value.value !== '')
    .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), meta: metaValue(value) }));
  const allRows = [...rows, ...extraRows];
  const amounts = extracted.amounts || {};
  const amountRows = Object.entries(amounts).filter(([, value]) => value !== null && value !== undefined);
  const taxRates = extracted.tax_rates || {};
  const taxRateRows = Object.entries(taxRates).filter(([, value]) => value !== null && value !== undefined && value !== 0);
  const gstins = extracted.gstins || [];
  const prefill = {
    gstin: gstins[0] || '',
    pan: (extracted.pans || [])[0] || '',
    ifsc: extracted.ifsc || (extracted.ifscs || [])[0] || '',
    bank_account: extracted.bank_account || '',
    invoice_number: extracted.invoice_number || '',
  };

  return (
    <div>
      <PageHeader
        eyebrow={`Smart verification · ${DOC_KIND_LABELS[document.doc_kind] || document.doc_kind}`}
        title={document.original_filename}
        subtitle="Extracted fields and deterministic validation checks. External GST, bank and government lookups are not performed unless official APIs are configured."
        backTo={`/app/documents/${document.id}`}
        actions={
          <>
            <Link to={`/app/documents/${document.id}/forensics`} className="btn-ghost"><Icon name="scan" size={14} /> Forensics</Link>
            <Link to={`/app/compare?left=${document.id}`} className="btn-secondary"><Icon name="compare" size={14} /> Compare</Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RiskBadge category={document.risk?.category} score={document.risk?.score} showScore size="sm" />
        <Pill tone="slate">{checks.length} checks</Pill>
        <Pill tone="emerald">{counts.passed || 0} passed</Pill>
        <Pill tone="rose">{counts.failed || 0} failed</Pill>
        <Pill tone="amber">{counts.warning || 0} warnings</Pill>
        <Pill tone="slate">{counts.skipped || 0} skipped</Pill>
        {supplier && (
          <Link to={`/app/suppliers/${supplier.id}`} className="badge border-accent-400/25 bg-accent-400/10 text-accent-200">
            Supplier: {supplier.name}
          </Link>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Panel title="Extracted fields" subtitle={ocr ? `${ocr.engine} · ${ocr.language} · mean confidence ${ocr.mean_confidence != null ? Math.round(ocr.mean_confidence * 100) : '—'}%` : 'OCR output'} icon="file" padded={false}>
            {allRows.length ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[560px]">
                  <thead>
                    <tr><th>Field</th><th>Value</th><th>Confidence</th><th>Method</th></tr>
                  </thead>
                  <tbody>
                    {allRows.map((row) => (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap text-[11px] text-slate-400">{row.label}</td>
                        <td className="max-w-[260px] break-words font-mono text-[11px] text-slate-200">
                          {Array.isArray(row.meta.value) ? row.meta.value.join(', ') : String(row.meta.value)}
                        </td>
                        <td className="whitespace-nowrap font-mono text-[10px] text-slate-400">
                          {row.meta.confidence != null ? `${Math.round(Number(row.meta.confidence) * 100)}%` : '—'}
                        </td>
                        <td className="whitespace-nowrap text-[10px] text-slate-500">{row.meta.method || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-xs text-slate-500">No structured fields were extracted from this document.</p>
            )}
            <div className="border-t border-white/[0.06] px-4 py-2">
              <Note>Extraction is heuristic. Confirm low-confidence values against the original document.</Note>
            </div>
          </Panel>

          <Panel title="Amount reconciliation" subtitle="Arithmetic consistency is checked; tax treatment is not verified" icon="receipt">
            {amountRows.length || taxRateRows.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  {amountRows.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">{key.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-[11.5px] text-slate-200">{fmtMoney(value)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {taxRateRows.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">{key} rate</span>
                      <span className="font-mono text-[11.5px] text-slate-200">{value}%</span>
                    </div>
                  ))}
                  {extracted.hsn_codes?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                      <span className="text-[10.5px] uppercase tracking-wider text-slate-500">HSN</span>
                      {extracted.hsn_codes.map((code) => <span key={code} className="font-mono text-[10px] text-slate-300">{code}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">No monetary amounts were extracted.</p>
            )}
            <Note className="mt-3">GSTIN, IFSC and account checks are syntactic. They do not confirm registration, existence or ownership.</Note>
          </Panel>

          <Panel title="Validation checks" subtitle="Deterministic checks with their evidence" icon="check" padded={false}>
            <div className="px-4 pt-4"><CheckSummary counts={{ ...counts, unverified: counts.unverified || 0 }} /></div>
            <div className="px-4 pb-3"><CheckList checks={checks} /></div>
          </Panel>
        </div>

        <div className="space-y-4">
          <ValidatorPlayground key={document.id} prefill={prefill} />

          {supplier && (
            <Panel title="Linked supplier" subtitle="Matched during invoice intake" icon="building" action={<Link to={`/app/suppliers/${supplier.id}`} className="btn-ghost btn-sm">Open</Link>}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-slate-200">{supplier.name}</p>
                  <p className="font-mono text-[10px] text-slate-500">{supplier.gstin || 'No GSTIN'}</p>
                </div>
                <StatusBadge status={supplier.status} />
              </div>
            </Panel>
          )}

          <Panel title="Contact identifiers" subtitle="Extracted from the OCR text" icon="mail">
            <div className="space-y-2 text-[11px]">
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Emails</p>
                <p className="mt-0.5 break-all font-mono text-slate-300">{(extracted.emails || []).join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">Phone numbers</p>
                <p className="mt-0.5 break-all font-mono text-slate-300">{(extracted.phones || []).join(', ') || '—'}</p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-slate-500">GSTINs detected</p>
                <p className="mt-0.5 break-all font-mono text-slate-300">{gstins.join(', ') || '—'}</p>
              </div>
            </div>
          </Panel>

          {ocr?.note && <Alert tone="info" title="OCR note">{ocr.note}</Alert>}
          {note && <Note>{note}</Note>}

          <Panel title="Next steps" subtitle="Continue the investigation" icon="sparkles">
            <div className="grid grid-cols-2 gap-2">
              <Link to={`/app/documents/${document.id}/risk`} className="btn-ghost btn-sm justify-start"><Icon name="gauge" size={12} /> Risk breakdown</Link>
              <Link to={`/app/compare?left=${document.id}`} className="btn-ghost btn-sm justify-start"><Icon name="compare" size={12} /> Find alterations</Link>
              <Link to="/app/reports" className="btn-ghost btn-sm justify-start"><Icon name="qr" size={12} /> Create report</Link>
              <Link to="/app/documents" className="btn-ghost btn-sm justify-start"><Icon name="history" size={12} /> All documents</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
