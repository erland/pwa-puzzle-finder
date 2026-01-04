import type { CameraStatus } from '../../types/overlay';
import type { V1Sensitivity } from '../../lib/vision/v1Sensitivity';

export type V1ControlsProps = {
  status: CameraStatus;
  streamInfo: string;

  // Core actions
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCaptureAndAnalyze: () => void;
  onBackToLive: () => void;

  // v1 display filters
  showCorners: boolean;
  setShowCorners: (v: boolean) => void;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  showNonEdge: boolean;
  setShowNonEdge: (v: boolean) => void;

  sensitivity: V1Sensitivity;
  setSensitivity: (v: V1Sensitivity) => void;
};

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
    streamInfo,
    onStartCamera,
    onStopCamera,
    onCaptureAndAnalyze,
    onBackToLive,
    showCorners,
    setShowCorners,
    showEdges,
    setShowEdges,
    showNonEdge,
    setShowNonEdge,
    sensitivity,
    setSensitivity
  } = props;

  const isCaptured = status === 'captured';
  const isLive = status === 'live';
  const isIdle = status === 'idle';
  const isError = status === 'error';

  return (
    <section className="card" aria-label="Scan controls">
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Scan</div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
            {isError ? 'Camera error' : isCaptured ? 'Captured frame' : isLive ? 'Live' : 'Camera off'}
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(isIdle || isError) && (
            <button type="button" className="btn btnPrimary" onClick={onStartCamera}>
              Start camera
            </button>
          )}
          {isLive && (
            <button type="button" className="btn btnPrimary" onClick={onCaptureAndAnalyze}>
              Capture
            </button>
          )}
          {isCaptured && (
            <button type="button" className="btn btnPrimary" onClick={onBackToLive}>
              Back to live
            </button>
          )}
          {!isIdle && (
            <button type="button" className="btn" onClick={onStopCamera}>
              Stop
            </button>
          )}
        </div>
      </div>

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