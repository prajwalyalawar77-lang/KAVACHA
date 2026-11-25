export const ROLE_LABELS = {
  admin: 'Administrator',
  industrial: 'Industrial / Enterprise',
  public: 'Public / Individual',
};

export const DOC_KIND_LABELS = {
  invoice: 'Tax Invoice',
  purchase_order: 'Purchase Order',
  gst_certificate: 'GST Certificate',
  quality_certificate: 'Quality / ISO Certificate',
  contract: 'Contract',
  bank_letter: 'Bank Letter',
  supplier_document: 'Supplier Document',
  offer_letter: 'Job Offer Letter',
  salary_slip: 'Salary Slip',
  educational_certificate: 'Educational Certificate',
  rental_agreement: 'Rental Agreement',
  payment_receipt: 'Payment Receipt',
  identity_document: 'Identity Document',
  other: 'Other Document',
};

export const PORTALS = ['public', 'industrial'];

export const KINDS_BY_PORTAL = {
  industrial: [
    'invoice',
    'purchase_order',
    'gst_certificate',
    'quality_certificate',
    'contract',
    'bank_letter',
    'supplier_document',
    'other',
  ],
  public: [
    'offer_letter',
    'salary_slip',
    'educational_certificate',
    'rental_agreement',
    'payment_receipt',
    'identity_document',
    'other',
  ],
};

export const ORG_TYPES = [
  'Manufacturing',
  'Automobile',
  'Construction',
  'Pharmaceutical',
  'Logistics & Supply Chain',
  'Banking & Finance',
  'Government',
  'Education',
  'Other',
];

export const RISK = {
  low: {
    label: 'Low risk',
    hex: '#34d399',
    text: 'text-emerald-300',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    dot: 'bg-emerald-400',
    chart: 'rgba(52, 211, 153, 0.85)',
  },
  medium: {
    label: 'Medium risk',
    hex: '#fbbf24',
    text: 'text-amber-300',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/30',
    dot: 'bg-amber-400',
    chart: 'rgba(251, 191, 36, 0.85)',
  },
  high: {
    label: 'High risk',
    hex: '#fb923c',
    text: 'text-orange-300',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/30',
    dot: 'bg-orange-400',
    chart: 'rgba(251, 146, 60, 0.85)',
  },
  critical: {
    label: 'Critical risk',
    hex: '#f87171',
    text: 'text-rose-300',
    bg: 'bg-rose-400/10',
    border: 'border-rose-400/30',
    dot: 'bg-rose-400',
    chart: 'rgba(248, 113, 113, 0.85)',
  },
  unassessed: {
    label: 'Not assessed',
    hex: '#94a3b8',
    text: 'text-slate-300',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/25',
    dot: 'bg-slate-400',
    chart: 'rgba(148, 163, 184, 0.6)',
  },
};

export const STATUS = {
  passed: { label: 'Passed', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' },
  failed: { label: 'Failed', tone: 'text-rose-300 bg-rose-400/10 border-rose-400/25' },
  warning: { label: 'Warning', tone: 'text-amber-300 bg-amber-400/10 border-amber-400/25' },
  skipped: { label: 'Skipped', tone: 'text-slate-300 bg-slate-400/10 border-slate-400/20' },
  unverified: { label: 'Unverified', tone: 'text-sky-300 bg-sky-400/10 border-sky-400/25' },
  analysed: { label: 'Analysed', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' },
  processing: { label: 'Analysing', tone: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/25' },
  uploaded: { label: 'Uploaded', tone: 'text-slate-300 bg-slate-400/10 border-slate-400/20' },
  failed_status: { label: 'Failed', tone: 'text-rose-300 bg-rose-400/10 border-rose-400/25' },
  open: { label: 'Open', tone: 'text-amber-300 bg-amber-400/10 border-amber-400/25' },
  acknowledged: { label: 'Acknowledged', tone: 'text-sky-300 bg-sky-400/10 border-sky-400/25' },
  dismissed: { label: 'Dismissed', tone: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  pending: { label: 'Pending', tone: 'text-amber-300 bg-amber-400/10 border-amber-400/25' },
  verified: { label: 'Verified', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' },
  review_required: { label: 'Review required', tone: 'text-orange-300 bg-orange-400/10 border-orange-400/25' },
  flagged: { label: 'Flagged', tone: 'text-rose-300 bg-rose-400/10 border-rose-400/25' },
  info: { label: 'Info', tone: 'text-sky-300 bg-sky-400/10 border-sky-400/25' },
  low: { label: 'Low', tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' },
  medium: { label: 'Medium', tone: 'text-amber-300 bg-amber-400/10 border-amber-400/25' },
  high: { label: 'High', tone: 'text-orange-300 bg-orange-400/10 border-orange-400/25' },
  critical: { label: 'Critical', tone: 'text-rose-300 bg-rose-400/10 border-rose-400/25' },
};

export const ALERT_TYPE_LABELS = {
  duplicate_document: 'Exact duplicate document',
  duplicate_invoice: 'Duplicate invoice',
  repeated_invoice_number: 'Repeated invoice number',
  near_duplicate_document: 'Near-duplicate document',
  shared_bank_account: 'Shared bank account',
  shared_gstin: 'Shared GSTIN',
  supplier_risk: 'Supplier risk',
  amount_anomaly: 'Amount anomaly',
  user_report: 'User report',
  expiry: 'Document expiry',
};

export const MODULES = [
  {
    code: 'document-forensics',
    name: 'AI Document Forensics',
    tag: 'Module 01',
    icon: 'scan',
    summary:
      'OCR, error-level analysis, copy-move detection, noise and typography indicators with a visual forensic heatmap.',
    points: ['Original vs analysed viewer', 'Suspicious-region heatmap', 'PDF metadata & signature inspection'],
    to: '/app/documents',
  },
  {
    code: 'smart-verification',
    name: 'Smart Document Verification',
    tag: 'Module 02',
    icon: 'check',
    summary:
      'GSTIN/PAN/IFSC/account format checks, invoice arithmetic, duplicate detection and cross-document consistency.',
    points: ['GSTIN checksum validation', 'Invoice totals & tax maths', 'Field-level document comparison'],
    to: '/app/verify',
  },
  {
    code: 'fraud-intelligence',
    name: 'AI Fraud Intelligence',
    tag: 'Module 03',
    icon: 'network',
    summary:
      'Duplicate DNA matching, repeated identifiers, supplier risk profiles and an interactive relationship graph.',
    points: ['Exact & near-duplicate matching', 'Supplier trust profiles', 'Alert triage queue'],
    to: '/app/fraud',
  },
  {
    code: 'industrial-intelligence',
    name: 'Industrial Intelligence',
    tag: 'Module 04',
    icon: 'factory',
    summary:
      'Supplier onboarding, GST certificate screening, PO matching, vendor risk dashboards and expiry alerts.',
    points: ['Supplier verification against documents', 'Purchase-order reconciliation', 'Expiry monitoring'],
    to: '/app/industrial',
  },
  {
    code: 'public-safety',
    name: 'Public Safety Portal',
    tag: 'Module 05',
    icon: 'shield',
    summary:
      'Offer-letter and certificate screening, PII review, redaction and suspicious-document reporting for individuals.',
    points: ['Job-scam and urgency detection', 'Personal-information redaction', 'Privacy-first reports'],
    to: '/app/safety',
  },
  {
    code: 'risk-assessment',
    name: 'Explainable Risk Assessment',
    tag: 'Module 06',
    icon: 'gauge',
    summary:
      'Transparent weighted signals, configurable thresholds, confidence scoring and evidence-backed recommendations.',
    points: ['Why the score exists', 'Passed / failed / unverified checks', 'Evidence & next-step guidance'],
    to: '/app/risk',
  },
];

export const DEMO_ACCOUNTS = [
  { role: 'Industrial', email: 'ops@sunrise.example', label: 'Sunrise Manufacturing (industrial)' },
  { role: 'Public', email: 'priya@public.example', label: 'Priya Sharma (public)' },
  { role: 'Admin', email: 'admin@kavacha.demo', label: 'Platform administrator' },
];

export const DEMO_PASSWORD = 'Kavacha@2026';
