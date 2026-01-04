import type { CameraStatus } from '../../types/overlay';
import type { CameraErrorKind } from '../../hooks/useCameraStream';
import type { V1Sensitivity } from '../../lib/vision/v1Sensitivity';
import type { ScanCounts } from '../../lib/vision/scanModel';
import type { FrameQualityGuidanceItem, FrameQualityStatus, GuidanceLevel } from '../../lib/vision/quality';

export type V1ControlsProps = {
  status: CameraStatus;
  errorKind?: CameraErrorKind;
  errorMessage?: string;
  streamInfo: string;

  // Core actions
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCaptureAndAnalyze: () => void;
  onBackToLive: () => void;
  onRescan: () => void;

  /** True while a scan pass is in progress (capture analysis). */
  busy?: boolean;

  counts?: {
    total: ScanCounts;
    visible: ScanCounts;
  } | null;

  // v1 display filters
  showCorners: boolean;
  setShowCorners: (v: boolean) => void;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  showNonEdge: boolean;
  setShowNonEdge: (v: boolean) => void;

  sensitivity: V1Sensitivity;
  setSensitivity: (v: V1Sensitivity) => void;

  // Guidance / quality feedback (v1)
  qualityStatus?: FrameQualityStatus;
  guidanceItems?: FrameQualityGuidanceItem[];
};

function rankGuidanceLevel(l: GuidanceLevel): number {
  if (l === 'bad') return 3;
  if (l === 'warn') return 2;
  if (l === 'good') return 1;
  return 0;
}

function guidanceTitle(items: FrameQualityGuidanceItem[] | undefined): string {
  if (!items || items.length === 0) return '';
  const worst = items.reduce<GuidanceLevel>((acc, it) => (rankGuidanceLevel(it.level) > rankGuidanceLevel(acc) ? it.level : acc), 'info');
  if (worst === 'bad') return 'Low confidence scan';
  if (worst === 'warn') return 'Scan may be unreliable';
  return 'Tips';
}

function ToggleButton(props: { label: string; pressed: boolean; onToggle: () => void }) {
  const { label, pressed, onToggle } = props;
  return (
    <button
      type="button"
      className={pressed ? 'btn btnPrimary' : 'btn'}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

export function V1Controls(props: V1ControlsProps) {
  const {
    status,
    errorKind,
    errorMessage,
    streamInfo,
    onStartCamera,
    onStopCamera,
    onCaptureAndAnalyze,
    onBackToLive,
    onRescan,
    busy,
    counts,
    showCorners,
    setShowCorners,
    showEdges,
    setShowEdges,
    showNonEdge,
    setShowNonEdge,
    sensitivity,
    setSensitivity,
    guidanceItems
  } = props;

  const isCaptured = status === 'captured';
  const isLive = status === 'live';
  const isIdle = status === 'idle';
  const isError = status === 'error';

  const isBusy = Boolean(busy);

  const actionable = (guidanceItems ?? []).filter((g) => g.level === 'warn' || g.level === 'bad');
  // Prefer showing the most severe + first few items.
  const sortedActionable = actionable
    .slice()
    .sort((a, b) => rankGuidanceLevel(b.level) - rankGuidanceLevel(a.level));
  const topTips = sortedActionable.slice(0, 3);
  const showGuidance = topTips.length > 0 && (isLive || isCaptured);

  return (
    <section className="card" aria-label="Scan controls">
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Scan</div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
            {isError ? 'Camera error' : isCaptured ? 'Captured frame' : isLive ? 'Live' : 'Camera off'}
          </div>

          {(isIdle || isError) && (
            <div className="muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35 }}>
              {isError ? (
                <>
                  {errorMessage ?? 'An unexpected camera error occurred.'}
                  {errorKind === 'permission_denied' && (
                    <div style={{ marginTop: 6, opacity: 0.92 }}>
                      Tip: Open your browser/site settings for this page and set <strong>Camera</strong> to <strong>Allow</strong>.
                    </div>
                  )}
                </>
              ) : (
                <>
                  When you tap <strong>Start camera</strong>, your browser will ask for permission. Video is processed locally on your device — nothing is uploaded.
                  <span style={{ marginLeft: 6 }}>
                    <a href="#/help">Learn more</a>
                  </span>
                </>
              )}
            </div>
          )}

          {counts && counts.total.total > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.92 }} aria-label="Scan counts">
              <span style={{ fontWeight: 700 }}>Corners:</span> {counts.total.corners}
              <span style={{ marginLeft: 10, fontWeight: 700 }}>Edges:</span> {counts.total.edges}
              {counts.total.nonEdge + counts.total.unknown > 0 && (
                <>
                  <span style={{ marginLeft: 10, fontWeight: 700 }}>Others:</span> {counts.total.nonEdge + counts.total.unknown}
                </>
              )}
              {counts.visible.total !== counts.total.total && (
                <span style={{ marginLeft: 10, opacity: 0.75 }}>
                  Showing {counts.visible.total}/{counts.total.total}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(isIdle || isError) && (
            <button type="button" className="btn btnPrimary" onClick={onStartCamera} disabled={isBusy}>
              {isError ? 'Try again' : 'Start camera'}
            </button>
          )}
          {isLive && (
            <button type="button" className="btn btnPrimary" onClick={onCaptureAndAnalyze} disabled={isBusy}>
              Capture
            </button>
          )}
          {isCaptured && (
            <>
              <button type="button" className="btn btnPrimary" onClick={onRescan} disabled={isBusy}>
                Re-scan
              </button>
              <button type="button" className="btn" onClick={onBackToLive} disabled={isBusy}>
                Back to live
              </button>
            </>
          )}
          {!isIdle && (
            <button type="button" className="btn" onClick={onStopCamera} disabled={isBusy}>
              Stop
            </button>
          )}
        </div>
      </div>

      {showGuidance && (
        <div
          role="status"
          aria-label="Scan guidance"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(42, 49, 70, 0.95)',
            background: 'rgba(255,255,255,0.03)'
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{guidanceTitle(topTips)}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.95 }}>
            {topTips.map((g) => (
              <li key={g.key}>{g.message}</li>
            ))}
          </ul>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            See <a href="#/help">Help</a> for setup tips.
          </div>
        </div>
      )}

      <div style={{ height: 12 }} />

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <ToggleButton
          label="Corners"
          pressed={showCorners}
          onToggle={() => setShowCorners(!showCorners)}
        />
        <ToggleButton label="Edges" pressed={showEdges} onToggle={() => setShowEdges(!showEdges)} />
        <ToggleButton
          label="Non-edge"
          pressed={showNonEdge}
          onToggle={() => setShowNonEdge(!showNonEdge)}
        />

        <div style={{ flex: 1 }} />

        <label className="row" style={{ gap: 8 }}>
          <span style={{ opacity: 0.85, fontSize: 12, fontWeight: 700 }}>Sensitivity</span>
          <select
            aria-label="Sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as V1Sensitivity)}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(42, 49, 70, 0.95)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '10px 12px',
              fontWeight: 700
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {streamInfo && (
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }} aria-label="Stream info">
          {streamInfo}
        </div>
      )}
    </section>
  );
}