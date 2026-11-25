import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { MODULES, RISK } from '../utils/constants';
import { useDocumentTitle } from '../hooks/useApiResource';

const CAPABILITIES = [
  { value: '06', label: 'Integrated modules', icon: 'layers' },
  { value: '03', label: 'Access roles', icon: 'users' },
  { value: 'PDF · JPG · PNG', label: 'Supported uploads', icon: 'file' },
  { value: 'EN + ಕನ್ನಡ', label: 'OCR languages', icon: 'globe' },
];

const PROBLEMS = [
  {
    icon: 'receipt',
    title: 'Invoice manipulation',
    text: 'Altered totals, duplicated invoice numbers and mismatched GSTINs slip through manual accounts-payable review.',
  },
  {
    icon: 'building',
    title: 'Supplier impostors',
    text: 'Onboarding a new vendor means checking certificates, bank details and identity across several disconnected files.',
  },
  {
    icon: 'briefcase',
    title: 'Fake offers & certificates',
    text: 'Students and job applicants receive offer letters and certificates that look official but contain tampering signs.',
  },
  {
    icon: 'home',
    title: 'Rental & payment fraud',
    text: 'Tenants and consumers are asked to pay before signing, with receipts and agreements that were edited after the fact.',
  },
];

const STEPS = [
  { icon: 'upload', title: 'Upload', text: 'PDF, JPG, JPEG or PNG is validated by extension, magic bytes and a parser probe before storage.' },
  { icon: 'lock', title: 'Secure store', text: 'Files are stored privately with a SHA-256 DNA fingerprint. Uploaded files are never executed.' },
  { icon: 'scan', title: 'OCR & metadata', text: 'Text is extracted with PyMuPDF and Tesseract; metadata, fonts and signature fields are inspected.' },
  { icon: 'eye', title: 'Visual forensics', text: 'ELA, copy-move, noise, blockiness and typography indicators are computed on page renders.' },
  { icon: 'check', title: 'Verification & fraud', text: 'GSTIN checksums, invoice arithmetic, duplicates, repeated identifiers and anomalies are evaluated.' },
  { icon: 'gauge', title: 'Explainable risk', text: 'Weighted evidence produces a score with confidence, failed checks and next-step recommendations.' },
];

const INDUSTRIES = [
  { icon: 'factory', name: 'Manufacturing', text: 'Vendor onboarding, PO-to-invoice matching, GST certificate expiry.' },
  { icon: 'briefcase', name: 'Automobile', text: 'Component supplier checks and contract version comparison.' },
  { icon: 'building', name: 'Construction', text: 'Contractor documents, licences and payment-receipt review.' },
  { icon: 'shield', name: 'Pharmaceutical', text: 'Quality certificates and supplier compliance screening.' },
  { icon: 'network', name: 'Logistics', text: 'Consignment paperwork, bank details and invoice duplicates.' },
  { icon: 'bank', name: 'Banking & finance', text: 'Loan-file document consistency and tamper indicators.' },
  { icon: 'audit', name: 'Government', text: 'Tender documents, licences and record consistency checks.' },
  { icon: 'graduation', name: 'Education', text: 'Certificate screening and application-document review.' },
];

const PUBLIC_BENEFITS = [
  { icon: 'briefcase', title: 'Job applicants', text: 'Screen offer letters for upfront-fee requests, free email domains and inconsistent logos.' },
  { icon: 'graduation', title: 'Students', text: 'Check certificates for visual inconsistencies before submitting them.' },
  { icon: 'home', title: 'Tenants', text: 'Compare two versions of a rental agreement and spot changed clauses.' },
  { icon: 'user', title: 'Freelancers', text: 'Review client contracts and payment receipts without technical knowledge.' },
  { icon: 'target', title: 'Consumers', text: 'Redact Aadhaar, PAN and account numbers before sharing documents.' },
  { icon: 'receipt', title: 'Small businesses', text: 'Spot duplicate receipts and arithmetic mismatches in expense claims.' },
];

const SECURITY = [
  { icon: 'key', title: 'JWT authentication', text: 'Short-lived bearer tokens with server-side role checks.' },
  { icon: 'users', title: 'Role-based access', text: 'Admin, industrial and public capabilities enforced by the API.' },
  { icon: 'lock', title: 'Password hashing', text: 'Werkzeug PBKDF2 hashes; passwords are never stored in plain text.' },
  { icon: 'file', title: 'File validation', text: 'Extension, magic-byte and parser checks; size and page limits.' },
  { icon: 'eye', title: 'Private documents', text: 'No public document URLs. Previews require an authenticated request.' },
  { icon: 'audit', title: 'Audit logging', text: 'Security-relevant actions are recorded with user and timestamp.' },
  { icon: 'clock', title: 'Rate limiting', text: 'Auth and API endpoints are throttled to reduce abuse.' },
  { icon: 'trash', title: 'Secure deletion', text: 'Deleting a document removes the file, previews, OCR text and analysis.' },
];

const RISK_BANDS = ['low', 'medium', 'high', 'critical'];

export default function LandingPage() {
  useDocumentTitle('Document Trust & Fraud Intelligence');
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid bg-grid opacity-30 mask-fade-b" />
        <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-accent-500/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
          <div className="animate-fadeUp">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-400/25 bg-accent-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-200">
              <Icon name="spark" size={12} />
              AI document trust &amp; fraud intelligence
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[56px]">
              One document.
              <br />
              <span className="bg-gradient-to-r from-accent-200 via-accent-300 to-emerald-300 bg-clip-text text-transparent">
                Multiple checks.
              </span>
              <br />
              Complete trust.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              KAVACHA analyses PDFs and images for tampering indicators, verifies business identifiers with transparent
              rules and explains document risk with evidence — in one secure workspace built for industry, finance,
              institutions and the public.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/register" className="btn-primary">
                Create a free account
                <Icon name="arrowRight" size={15} />
              </Link>
              <a href="#modules" className="btn-ghost">
                Explore the six modules
              </a>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              {CAPABILITIES.map((item) => (
                <div key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-3">
                  <Icon name={item.icon} size={15} className="text-accent-300" />
                  <p className="mt-2 truncate font-mono text-sm font-semibold text-white">{item.value}</p>
                  <p className="text-[9.5px] uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-start gap-2 text-[10.5px] leading-relaxed text-slate-500">
              <Icon name="info" size={13} className="mt-0.5 shrink-0" />
              KAVACHA reports suspicious indicators, not confirmed manipulation. External GST, bank or government
              verification runs only when authorised integrations are configured.
            </p>
          </div>

          <div className="animate-fadeUp lg:pl-4">
            <div className="relative mx-auto max-w-xl">
              <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-tr from-accent-500/15 via-transparent to-emerald-400/10 blur-xl" />
              <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-charcoal-900/80 shadow-card backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-accent-400/30 bg-accent-400/10 text-accent-300">
                      <Icon name="scan" size={12} />
                    </span>
                    <p className="text-[11px] font-semibold text-slate-200">Forensic viewer</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                    Illustrative interface
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <div className="rounded-xl border border-white/[0.07] bg-white p-3">
                    <p className="text-[7px] font-bold tracking-[0.18em] text-slate-500">ORIGINAL</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="h-1.5 w-2/3 rounded bg-slate-300" />
                      <div className="h-1 w-full rounded bg-slate-200" />
                      <div className="h-1 w-5/6 rounded bg-slate-200" />
                      <div className="mt-3 h-1 w-full rounded bg-slate-200" />
                      <div className="h-1 w-4/5 rounded bg-slate-200" />
                      <div className="mt-3 h-1 w-1/2 rounded bg-slate-200" />
                      <div className="h-1 w-2/3 rounded bg-slate-200" />
                    </div>
                  </div>
                  <div className="relative overflow-hidden rounded-xl border border-accent-400/20 bg-navy-950 p-3">
                    <p className="text-[7px] font-bold tracking-[0.18em] text-accent-300/80">ANALYSED</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="h-1.5 w-2/3 rounded bg-slate-600" />
                      <div className="h-1 w-full rounded bg-slate-700" />
                      <div className="h-1 w-5/6 rounded bg-slate-700" />
                      <div className="mt-3 h-1 w-full rounded bg-slate-700" />
                      <div className="h-1 w-4/5 rounded bg-slate-700" />
                      <div className="mt-3 h-1 w-1/2 rounded bg-slate-700" />
                      <div className="h-1 w-2/3 rounded bg-slate-700" />
                    </div>
                    <div className="absolute left-[58%] top-[16%] h-[16%] w-[34%] rounded border border-rose-400/80 bg-rose-400/20" />
                    <div className="absolute left-[18%] top-[60%] h-[12%] w-[46%] rounded border border-amber-300/80 bg-amber-300/20" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-10 animate-scanline bg-gradient-to-b from-accent-400/25 to-transparent" />
                  </div>
                </div>
                <div className="mx-3 mb-3 rounded-xl border border-white/[0.07] bg-navy-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">Risk assessment</p>
                    <span className="badge border-amber-400/30 bg-amber-400/10 text-amber-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Example band
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" />
                  </div>
                  <div className="mt-2 flex justify-between text-[8px] uppercase tracking-wider text-slate-500">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                    <span>Critical</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    {['Passed', 'Failed', 'Unverified'].map((label) => (
                      <div key={label} className="rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5">
                        <p className="text-[8px] uppercase tracking-wider text-slate-500">{label}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-300">check</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" id="problem">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">The problem</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Documents are trusted faster than they are checked.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              A single edited number can move money, approve a vendor or convince someone to pay a deposit. KAVACHA
              brings forensic, format and consistency checks into a single evidence trail — with clear limits on what
              automation can prove.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((problem) => (
              <div key={problem.title} className="card card-hover p-5">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
                  <Icon name={problem.icon} size={17} />
                </span>
                <h3 className="text-sm font-semibold text-slate-100">{problem.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">{problem.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="modules" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">Six modules</p>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                One analysis. Six intelligence layers.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Upload once. Independent checks run together, and the explainable risk engine combines only the
                evidence that was actually produced.
              </p>
            </div>
            <Link to="/register" className="btn-ghost btn-sm w-fit">
              Try it with a document
              <Icon name="arrowRight" size={13} />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((module) => (
              <article key={module.code} className="card card-hover group relative overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-accent-500/5 blur-xl transition group-hover:bg-accent-500/10" />
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-400/20 bg-accent-400/10 text-accent-300">
                    <Icon name={module.icon} size={18} />
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">{module.tag}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-white">{module.name}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">{module.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {module.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-[10.5px] text-slate-400">
                      <Icon name="check" size={11} className="mt-0.5 shrink-0 text-emerald-400/80" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/login"
                  className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-300 transition hover:gap-2.5 hover:text-accent-200"
                >
                  Open module <Icon name="arrowRight" size={12} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-white/[0.06] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">How it works</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              From upload to evidence-backed report.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Every stage is logged and reproducible. If a check cannot run, it is marked skipped or unverified — never
              counted as a pass.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/25 bg-accent-400/10 font-mono text-[11px] font-bold text-accent-200">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
                    <Icon name={step.icon} size={15} />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-100">{step.title}</h3>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">Forensic viewer</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              See exactly where the document looks wrong.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              The original document sits beside the analysed render. Suspicious blocks are highlighted with severity and
              a plain-language explanation, so reviewers know what to inspect — and what automation cannot conclude.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Left: original upload. Right: heatmap with normalised suspicious regions.',
                'Clickable regions with evidence such as noise outliers or copy-move pairs.',
                'Error-level, blockiness, blur and typography indicators in one view.',
                'Findings are indicators for manual review — never automatic proof of forgery.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                    <Icon name="check" size={11} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link to="/register" className="btn-secondary btn-sm">
                Analyse a document
              </Link>
              <Link to="/login" className="btn-ghost btn-sm">
                Sign in to the demo
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-accent-500/10 to-transparent blur-2xl" />
            <div className="relative grid gap-3 rounded-2xl border border-white/10 bg-charcoal-900/70 p-4 shadow-card sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-white p-3">
                <p className="text-[7px] font-bold tracking-[0.2em] text-slate-500">ORIGINAL DOCUMENT</p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 w-3/4 rounded bg-slate-300" />
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-11/12 rounded bg-slate-200" />
                  <div className="mt-4 h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-4/5 rounded bg-slate-200" />
                  <div className="mt-4 h-1.5 w-1/2 rounded bg-slate-200" />
                  <div className="h-1.5 w-2/3 rounded bg-slate-200" />
                  <div className="mt-4 h-6 w-24 rounded bg-slate-300" />
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-accent-400/25 bg-navy-950 p-3">
                <p className="text-[7px] font-bold tracking-[0.2em] text-accent-300/80">ANALYSED · HEATMAP</p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 w-3/4 rounded bg-slate-600" />
                  <div className="h-1.5 w-full rounded bg-slate-700" />
                  <div className="h-1.5 w-11/12 rounded bg-slate-700" />
                  <div className="mt-4 h-1.5 w-full rounded bg-slate-700" />
                  <div className="h-1.5 w-4/5 rounded bg-slate-700" />
                  <div className="mt-4 h-1.5 w-1/2 rounded bg-slate-700" />
                  <div className="h-6 w-24 rounded bg-slate-700" />
                </div>
                <div className="absolute right-3 top-10 h-[18%] w-[42%] rounded border border-rose-400/80 bg-rose-400/20">
                  <span className="absolute -top-4 left-0 rounded bg-rose-500/90 px-1 py-0.5 text-[6.5px] font-semibold text-white">
                    region 1
                  </span>
                </div>
                <div className="absolute bottom-6 left-6 h-[14%] w-[48%] rounded border border-amber-300/80 bg-amber-300/20">
                  <span className="absolute -top-4 right-0 rounded bg-amber-400/90 px-1 py-0.5 text-[6.5px] font-semibold text-navy-950">
                    region 2
                  </span>
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 animate-scanline bg-gradient-to-b from-accent-400/25 to-transparent" />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-white/[0.07] bg-navy-950/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-wider text-slate-500">
                  <span className="badge border-amber-400/25 bg-amber-400/10 text-amber-200">Indicator · medium</span>
                  <span>Noise-texture inconsistency in a highlighted block</span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                  Highlighted areas are candidates for manual inspection. A localised anomaly may have a benign cause such
                  as compression or rescanning.
                </p>
              </div>
            </div>
            <p className="mt-2 text-center text-[9.5px] uppercase tracking-[0.18em] text-slate-600">
              Illustrative interface · not a real analysis result
            </p>
          </div>
        </div>
      </section>

      <section id="industries" className="scroll-mt-24 border-y border-white/[0.06] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">Industry applications</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Built for document-heavy organisations.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Organisation accounts unlock the industrial portal, supplier management, purchase-order matching and
              certificate expiry monitoring.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((industry) => (
              <div key={industry.name} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-accent-400/25 hover:bg-white/[0.035]">
                <Icon name={industry.icon} size={17} className="text-accent-300" />
                <h3 className="mt-3 text-[12.5px] font-semibold text-slate-100">{industry.name}</h3>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{industry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="public" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">Public benefits</p>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                A safety check for everyday documents.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                The public portal is designed for people without technical knowledge: upload, read plain-language
                findings, redact personal information and download a report. Documents are private to the account and
                can be deleted at any time.
              </p>
              <ul className="mt-6 grid gap-2 text-[11.5px] text-slate-300 sm:grid-cols-2">
                {['No technical setup', 'Privacy-first analysis', 'Redaction preview', 'Downloadable report', 'Suspicious-document reporting', 'Clear non-accusatory language'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Icon name="check" size={12} className="text-emerald-400/80" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="btn-secondary btn-sm mt-7">
                Open the public portal
                <Icon name="arrowRight" size={13} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PUBLIC_BENEFITS.map((item) => (
                <div key={item.title} className="card p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-300">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <h3 className="mt-2.5 text-[12px] font-semibold text-slate-100">{item.title}</h3>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-24 border-y border-white/[0.06] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-300/90">Security &amp; privacy</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Documents stay private. Claims stay honest.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Permissions are enforced on the server, not just in the interface. Files are validated before storage,
              never executed and never served from public URLs.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <Icon name={item.icon} size={16} className="text-accent-300" />
                <h3 className="mt-3 text-[12px] font-semibold text-slate-100">{item.title}</h3>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                <Icon name="alert" size={14} /> Known limitations
              </p>
              <div className="flex flex-wrap gap-3">
                {RISK_BANDS.map((band) => (
                  <span key={band} className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${RISK[band].dot}`} />
                    {RISK[band].label}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Risk bands (0–30 low, 31–60 medium, 61–80 high, 81–100 critical) are configurable demonstration thresholds,
              not calibrated fraud probabilities. Metadata anomalies do not prove forgery. Duplicate identifiers can have
              legitimate explanations. KAVACHA never labels a supplier as fraudulent from an anomaly alone, and QR
              verification links are summaries — not authenticity certificates.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-accent-400/20 bg-gradient-to-br from-accent-500/15 via-navy-900 to-navy-950 p-8 shadow-glow sm:p-12">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent-400/15 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Verify the next document before it costs you.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Create an industrial or public account, upload a PDF or image and walk through forensics, verification,
                fraud intelligence and an explainable risk report.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/register" className="btn-primary">
                Create account
              </Link>
              <Link to="/login" className="btn-ghost">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
