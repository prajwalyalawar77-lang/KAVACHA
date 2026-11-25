import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApiResource, useDocumentTitle } from '../../../hooks/useApiResource';
import Icon from '../../../components/Icon';
import { DownloadButton } from '../../../components/AuthImage';
import {
  Alert, EmptyState, ErrorState, Gauge, KeyValue, LoadingBlock, Note, PageHeader, Panel, Pill, RiskBadge,
  ScoreLegend, Segmented, Spinner, StatusBadge,
} from '../../../components/ui';
import { api } from '../../../services/api';
import { cx, fmtNumber } from '../../../utils/format';

function useBlobUrl(path, params) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const key = params ? JSON.stringify(params) : '';
  useEffect(() => {
    let active = true;
    let url = null;
    setSrc(null);
    setFailed(false);
    setLoading(true);
    if (!path) {
      setLoading(false);
      return undefined;
    }
    api.blob(path, params)
      .then((result) => {
        if (!active) {
          URL.revokeObjectURL(result.url);
          return;
        }
        url = result.url;
        setSrc(result.url);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return { src, failed, loading };
}

function ImagePane({ path, params, alt, boxes = [], selectedId, onSelect, showBoxes = true, badge, footer }) {
  const { src, failed, loading } = useBlobUrl(path, params);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{badge}</span>
        {footer}
      </div>
      <div className="relative flex flex-1 items-center justify-center bg-navy-950/60 p-3">
        {loading && <div className="flex h-64 w-full items-center justify-center"><Spinner size={24} /></div>}
        {failed && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-500">
            <Icon name="eye" size={22} />
            <span className="text-[11px]">Image unavailable for this variant</span>
          </div>
        )}
        {src && (
          <div className="relative inline-block max-w-full">
            <img src={src} alt={alt} className="block h-auto max-h-[68vh] w-full max-w-full object-contain" />
            {showBoxes && boxes.map((box, index) => {
              const active = selectedId === box.id;
              const tone = box.score >= 0.6 ? 'border-rose-400 bg-rose-400/10 text-rose-200'
                : box.score >= 0.35 ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-accent-400 bg-accent-400/10 text-accent-200';
              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => onSelect?.(box)}
                  title={box.label || box.reason || `Region ${index + 1}`}
                  className={cx(
                    'absolute rounded-sm border-2 text-left transition hover:bg-white/10',
                    tone,
                    active && 'ring-2 ring-white/70 ring-offset-0',
                  )}
                  style={{
                    left: `${Math.max(0, Math.min(1, box.x)) * 100}%`,
                    top: `${Math.max(0, Math.min(1, box.y)) * 100}%`,
                    width: `${Math.max(0.01, Math.min(1, box.w)) * 100}%`,
                    height: `${Math.max(0.01, Math.min(1, box.h)) * 100}%`,
                  }}
                >
                  <span className="absolute -left-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-current bg-navy-950 font-mono text-[8px] leading-none">
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ForensicViewerPage() {
  const { documentId } = useParams();
  const id = Number(documentId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [variant, setVariant] = useState(searchParams.get('variant') || 'overlay');
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const { data: document, loading, error, reload } = useApiResource(`/documents/${id}`, undefined, { enabled: Number.isFinite(id) });
  useDocumentTitle(document ? `Forensics · ${document.original_filename}` : 'Forensic viewer');

  const tampering = document?.tampering;
  const regions = tampering?.regions || [];
  const indicators = tampering?.indicators || [];
  const artifacts = document?.artifacts || {};
  const selected = useMemo(() => regions.find((region) => region.id === selectedId) || null, [regions, selectedId]);

  const variantOptions = useMemo(() => [
    { value: 'original', label: 'Original' },
    { value: 'overlay', label: 'ELA overlay', disabled: !artifacts.overlay },
    { value: 'heatmap', label: 'Heatmap', disabled: !artifacts.heatmap },
    { value: 'redacted', label: 'Redacted', disabled: !document?.redacted },
  ], [artifacts.overlay, artifacts.heatmap, document?.redacted]);

  useEffect(() => {
    if (variant === 'overlay' && document && !artifacts.overlay) setVariant('original');
    if (variant === 'heatmap' && document && !artifacts.heatmap) setVariant('original');
    if (variant === 'redacted' && document && !document.redacted) setVariant('original');
  }, [artifacts.heatmap, artifacts.overlay, document, variant]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (variant === 'overlay') next.delete('variant');
    else next.set('variant', variant);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  if (loading && !document) return <LoadingBlock label="Loading forensic artefacts…" />;
  if (error && !document) {
    return (
      <div>
        <PageHeader eyebrow="Forensic viewer" title="Document unavailable" backTo="/app/documents" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!document) return null;

  const analysed = Boolean(tampering);
  const previewPath = `/documents/${document.id}/preview`;
  const variantAvailable = variant === 'original' || (variant === 'overlay' && artifacts.overlay)
    || (variant === 'heatmap' && artifacts.heatmap) || (variant === 'redacted' && document.redacted);
  const rightParams = { variant: variantAvailable ? variant : 'original' };

  return (
    <div>
      <PageHeader
        eyebrow="AI document forensics · page 1"
        title={document.original_filename}
        subtitle="Side-by-side inspection of the original page and the analysed artefacts. Highlighted regions are candidates for human review, not confirmed manipulation."
        backTo={`/app/documents/${document.id}`}
        actions={
          <>
            <Link to={`/app/documents/${document.id}/verification`} className="btn-ghost"><Icon name="check" size={14} /> Verification</Link>
            <Link to={`/app/documents/${document.id}/risk`} className="btn-secondary"><Icon name="gauge" size={14} /> Risk</Link>
            <DownloadButton path={previewPath} params={rightParams} filename={`kavacha-${document.id}-${rightParams.variant}.png`} label="Download view" />
          </>
        }
      />

      {!analysed ? (
        <Panel>
          <EmptyState
            icon="scan"
            title="No forensic artefacts yet"
            description="Run analysis to generate the ELA heatmap, overlay and suspicious-region candidates for page 1."
            action={<Link to={`/app/documents/${document.id}`} className="btn-primary btn-sm">Open analysis</Link>}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={variantOptions.map((option) => ({
                  ...option,
                  label: option.disabled ? `${option.label} (n/a)` : option.label,
                }))}
                value={variant}
                onChange={(value) => {
                  if (variantOptions.find((option) => option.value === value)?.disabled) return;
                  setVariant(value);
                }}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-navy-950/60 px-3 py-1.5 text-[11px] text-slate-300">
                <input type="checkbox" className="h-3 w-3 accent-cyan-400" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                Region highlights
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RiskBadge category={document.risk?.category} score={document.risk?.score} showScore size="sm" />
              <Pill tone="slate">{fmtNumber(regions.length)} region{regions.length === 1 ? '' : 's'}</Pill>
              <Pill tone="slate">{fmtNumber(indicators.length)} indicator{indicators.length === 1 ? '' : 's'}</Pill>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="grid lg:grid-cols-2">
              <ImagePane
                badge="Original · as uploaded"
                path={previewPath}
                params={{ variant: 'original' }}
                alt="Original uploaded document page"
                footer={<span className="font-mono text-[9px] text-slate-500">SHA {document.sha256?.slice(0, 10)}…</span>}
              />
              <div className="border-t border-white/[0.08] lg:border-l lg:border-t-0">
                <ImagePane
                  badge={`Analysed · ${rightParams.variant}`}
                  path={previewPath}
                  params={rightParams}
                  alt="Analysed document page with highlighted regions"
                  boxes={regions}
                  selectedId={selectedId}
                  onSelect={(box) => setSelectedId(box.id)}
                  showBoxes={showBoxes}
                  footer={<span className="font-mono text-[9px] text-slate-500">page 1 only</span>}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-rose-400 bg-rose-400/20" /> high attention</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-amber-400 bg-amber-400/20" /> medium</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-accent-400 bg-accent-400/20" /> low</span>
                <span>Boxes are candidate regions ordered by score.</span>
              </div>
              <p className="font-mono text-[9px] text-slate-600">
                {tampering.image_size ? `${tampering.image_size.width}×${tampering.image_size.height}` : 'baseline forensics'} · {tampering.engine_version}
              </p>
            </div>
          </div>

          {selected && (
            <Panel className="mt-4" title={`Region ${selected.id} · ${selected.label || 'candidate region'}`} subtitle={selected.reason} icon="target">
              <div className="grid gap-3 sm:grid-cols-4">
                <KeyValue columns={1} dense items={[{ label: 'Attention score', mono: true, value: Number(selected.score || 0).toFixed(3) }]} />
                <KeyValue columns={1} dense items={[{ label: 'Position', mono: true, value: `${(selected.x * 100).toFixed(1)}%, ${(selected.y * 100).toFixed(1)}%` }]} />
                <KeyValue columns={1} dense items={[{ label: 'Size', mono: true, value: `${(selected.w * 100).toFixed(1)}% × ${(selected.h * 100).toFixed(1)}%` }]} />
                <KeyValue columns={1} dense items={[{ label: 'Sources', value: (selected.sources || []).join(', ') || '—' }]} />
              </div>
            </Panel>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Findings" subtitle="Every indicator includes its evidence and its limitations" icon="alert" padded={false}>
              {indicators.length ? (
                <ul className="divide-y divide-white/[0.06]">
                  {indicators.map((indicator) => (
                    <li key={indicator.code} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={indicator.severity} />
                        <span className="text-[12px] font-medium text-slate-200">{indicator.label}</span>
                        <span className="ml-auto font-mono text-[9px] text-slate-600">{indicator.code}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{indicator.detail}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(indicator.evidence || {}).map(([key, value]) => (
                          <span key={key} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-400">{key}: {String(value)}</span>
                        ))}
                        {(indicator.sources || []).map((source) => (
                          <span key={source} className="rounded border border-accent-400/20 bg-accent-400/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-accent-200">{source}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-10 text-center text-xs text-slate-500">No forensic indicators were raised for this page.</p>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Risk context" subtitle="Explainable score across all modules" icon="gauge">
                <div className="flex flex-col items-center">
                  <Gauge score={document.risk?.score || 0} category={document.risk?.category || 'unassessed'} confidence={document.risk?.confidence} size={180} />
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">{document.risk?.summary || 'No risk summary available.'}</p>
                  <div className="mt-3 w-full"><ScoreLegend thresholds={document.risk?.thresholds} /></div>
                  <Link to={`/app/documents/${document.id}/risk`} className="btn-ghost btn-sm mt-3">Open risk breakdown</Link>
                </div>
              </Panel>

              <Panel title="Candidate regions" subtitle="Click a region to inspect it" icon="target" padded={false}>
                {regions.length ? (
                  <ul className="max-h-[280px] divide-y divide-white/[0.05] overflow-y-auto">
                    {regions.map((region, index) => (
                      <li key={region.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(region.id)}
                          className={cx('flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.03]', selectedId === region.id && 'bg-accent-400/[0.06]')}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-[9px] text-slate-300">{index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] text-slate-200">{region.label || 'Candidate region'}</span>
                            <span className="block truncate text-[9.5px] text-slate-500">{(region.sources || []).join(' · ')}</span>
                          </span>
                          <span className={cx('font-mono text-[10px]', region.score >= 0.6 ? 'text-rose-300' : region.score >= 0.35 ? 'text-amber-300' : 'text-accent-300')}>
                            {Number(region.score || 0).toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-8 text-center text-xs text-slate-500">No candidate regions were detected.</p>
                )}
              </Panel>

              <Panel title="Limitations" subtitle="Read before drawing conclusions" icon="info">
                <ul className="space-y-1.5 text-[10.5px] leading-relaxed text-slate-400">
                  <li>Analysis covers page 1 of the document at up to 1600px.</li>
                  <li>Compression, scanning and design software can produce the same signals as editing.</li>
                  <li>Metadata and image statistics are indicators only; they never prove forgery.</li>
                  <li>Confirm findings against the issuing organisation and original records.</li>
                </ul>
                {tampering.notes && <Note className="mt-2">{tampering.notes}</Note>}
              </Panel>
            </div>
          </div>

          <Alert tone="info" title="Indicators, not accusations" className="mt-4">
            Highlighted regions and indicators identify areas that warrant human inspection. They do not establish that a
            document was altered or that any party acted fraudulently.
          </Alert>
        </>
      )}
    </div>
  );
}
