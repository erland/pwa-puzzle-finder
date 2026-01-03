import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { CameraStatus } from '../../types/overlay';
import type { FrameQuality, FrameQualityGuidanceItem, FrameQualityStatus } from '../../lib/vision/quality';
import type { ExtractedPiece } from '../../lib/opencv/extractPieces';
import type { SegmentPiecesResult, PieceCandidate } from '../../lib/opencv/segmentPieces';

export type LivePipeline = 'segment' | 'extract' | 'classify';
export type LiveStatus = 'idle' | 'running' | 'error';

export type CameraControlsCardProps = {
  // Camera controls
  status: CameraStatus;
  streamInfo: string;

  onStartCamera: () => void;
  onStopCamera: () => void;
  onCaptureFrame: () => void;
  onBackToLive: () => void;

  // Overlays
  overlaySource: 'segmented' | 'extracted';
  setOverlaySource: (v: 'segmented' | 'extracted') => void;

  selectedPieceId: number | null;
  setSelectedPieceId: (v: number | null) => void;

  overlayShowGrid: boolean;
  setOverlayShowGrid: (v: boolean) => void;
  overlayShowCrosshair: boolean;
  setOverlayShowCrosshair: (v: boolean) => void;
  overlayShowStatusChip: boolean;
  setOverlayShowStatusChip: (v: boolean) => void;
  overlayShowDebugText: boolean;
  setOverlayShowDebugText: (v: boolean) => void;
  overlayTapToSelect: boolean;
  setOverlayTapToSelect: (v: boolean) => void;
  overlayShowContours: boolean;
  setOverlayShowContours: (v: boolean) => void;
  overlayShowBBoxes: boolean;
  setOverlayShowBBoxes: (v: boolean) => void;
  overlayShowLabels: boolean;
  setOverlayShowLabels: (v: boolean) => void;

  overlayLabelMode: 'id' | 'id+class';
  setOverlayLabelMode: (v: 'id' | 'id+class') => void;

  overlayUseClassColors: boolean;
  setOverlayUseClassColors: (v: boolean) => void;

  overlayOpacity: number;
  setOverlayOpacity: (v: number) => void;

  overlayLineWidth: number;
  setOverlayLineWidth: (v: number) => void;

  // Live processing controls
  liveModeEnabled: boolean;
  setLiveModeEnabled: (v: boolean) => void;

  livePipeline: LivePipeline;
  setLivePipeline: (v: LivePipeline) => void;

  liveFps: number;
  setLiveFps: (v: number) => void;

  liveStatus: LiveStatus;
  liveInfo: string;

  liveError: string;

  // Worker
  useWorker: boolean;
  setUseWorker: (v: boolean) => void;
  workerStatus: 'idle' | 'loading' | 'ready' | 'error';
  workerError: string;

  // Quality
  frameQuality: FrameQuality | null;
  qualityStatus: FrameQualityStatus;
  qualityGuidance: FrameQualityGuidanceItem[];

  // Segmentation
  segPieces: PieceCandidate[];
  segResult: SegmentPiecesResult | null;
  segStatus: 'idle' | 'running' | 'done' | 'error';
  segError: string;
  segDebug: string;
  segmentPiecesNow: () => Promise<SegmentPiecesResult | null>;
  clearSegmentation: () => void;

  minAreaRatio: number;
  setMinAreaRatio: (v: number) => void;
  morphKernel: number;
  setMorphKernel: (v: number) => void;

  // Extraction / classification
  extractStatus: 'idle' | 'running' | 'done' | 'error';
  extractError: string;
  extractDebug: string;

  classifyDebug: string;

  extractPiecesNow: () => Promise<void>;
  classifyPiecesNow: () => Promise<void>;

  extractedPieces: ExtractedPiece[];
  setExtractedPieces: (v: ExtractedPiece[]) => void;

  setExtractStatus: Dispatch<SetStateAction<'idle' | 'running' | 'done' | 'error'>>;
  setExtractError: (v: string) => void;
  setExtractDebug: (v: string) => void;
  setClassifyDebug: (v: string) => void;

  // OpenCV hello processor
  opencvStatus: 'idle' | 'loading' | 'ready' | 'error';
  opencvError: string;
  opencvBuildInfoLine: string;
  opencvReady: boolean;

  isProcessing: boolean;
  onToggleHelloProcessing: () => void;

  cannyLow: number;
  setCannyLow: (v: number) => void;
  cannyHigh: number;
  setCannyHigh: (v: number) => void;

  processingInputCanvasRef: RefObject<HTMLCanvasElement>;
  processedCanvasRef: RefObject<HTMLCanvasElement>;

  // Extraction filters
  filterMaxPieces: number;
  setFilterMaxPieces: (v: number) => void;
  filterMinSolidity: number;
  setFilterMinSolidity: (v: number) => void;
  filterMaxAspect: number;
  setFilterMaxAspect: (v: number) => void;
  filterBorderMargin: number;
  setFilterBorderMargin: (v: number) => void;
  filterPadding: number;
  setFilterPadding: (v: number) => void;
};

export function CameraControlsCard(props: CameraControlsCardProps) {
  const {
    status,
    streamInfo,
    onStartCamera,
    onStopCamera,
    onCaptureFrame,
    onBackToLive,

    overlaySource,
    setOverlaySource,
    selectedPieceId,
    setSelectedPieceId,

    overlayShowGrid,
    setOverlayShowGrid,
    overlayShowCrosshair,
    setOverlayShowCrosshair,
    overlayShowStatusChip,
    setOverlayShowStatusChip,
    overlayShowDebugText,
    setOverlayShowDebugText,
    overlayTapToSelect,
    setOverlayTapToSelect,
    overlayShowContours,
    setOverlayShowContours,
    overlayShowBBoxes,
    setOverlayShowBBoxes,
    overlayShowLabels,
    setOverlayShowLabels,
    overlayLabelMode,
    setOverlayLabelMode,
    overlayUseClassColors,
    setOverlayUseClassColors,
    overlayOpacity,
    setOverlayOpacity,
    overlayLineWidth,
    setOverlayLineWidth,

    liveModeEnabled,
    setLiveModeEnabled,
    livePipeline,
    setLivePipeline,
    liveFps,
    setLiveFps,
    liveStatus,
    liveInfo,
    liveError,

    useWorker,
    setUseWorker,
    workerStatus,
    workerError,

    frameQuality,
    qualityStatus,
    qualityGuidance,

    segPieces,
    segResult,
    segStatus,
    segError,
    segDebug,
    segmentPiecesNow,
    clearSegmentation,
    minAreaRatio,
    setMinAreaRatio,
    morphKernel,
    setMorphKernel,

    extractStatus,
    extractError,
    extractDebug,
    classifyDebug,
    extractPiecesNow,
    classifyPiecesNow,
    extractedPieces,
    setExtractedPieces,
    setExtractStatus,
    setExtractError,
    setExtractDebug,
    setClassifyDebug,

    opencvStatus,
    opencvError,
    opencvBuildInfoLine,
    opencvReady,
    isProcessing,
    onToggleHelloProcessing,
    cannyLow,
    setCannyLow,
    cannyHigh,
    setCannyHigh,
    processingInputCanvasRef,
    processedCanvasRef,

    filterMaxPieces,
    setFilterMaxPieces,
    filterMinSolidity,
    setFilterMinSolidity,
    filterMaxAspect,
    setFilterMaxAspect,
    filterBorderMargin,
    setFilterBorderMargin,
    filterPadding,
    setFilterPadding,
  } = props;

  return (
      <div className="card">
        <h2>Controls</h2>

        <div className="buttonRow">
          <button className="btn btnPrimary" onClick={onStartCamera} disabled={status === 'starting' || status === 'live' || status === 'captured'}>
            Start camera
          </button>
          <button className="btn btnDanger" onClick={onStopCamera} disabled={status === 'idle'}>
            Stop camera
          </button>
          <button className="btn" onClick={onCaptureFrame} disabled={status !== 'live'}>
            Capture frame
          </button>
          <button className="btn" onClick={onBackToLive} disabled={status !== 'captured'}>
            Back to live
          </button>
</div>


        <div className="opencvPanel" aria-label="Overlays panel" style={{ marginTop: 12 }}>
          <div className="row">
            <strong>Overlays</strong>
            <span className="muted" style={{ marginLeft: 10 }}>
              Source: <strong>{overlaySource}</strong>
              {selectedPieceId != null ? (
                <>
                  {' '}
                  · Selected: <strong>#{selectedPieceId}</strong>
                </>
              ) : null}
            </span>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
            <label className="selectField">
              <span className="muted">Source</span>
              <select
                value={overlaySource}
                onChange={(e) => {
                  setOverlaySource(e.target.value as 'segmented' | 'extracted');
                  setSelectedPieceId(null);
                }}
              >
                <option value="segmented">Segmented</option>
                <option value="extracted">Extracted</option>
              </select>
            </label>

            <label className="checkboxField">
              <input
                type="checkbox"
                checked={overlayTapToSelect}
                onChange={(e) => setOverlayTapToSelect(e.target.checked)}
              />
              <span className="muted">Tap to select</span>
            </label>

            <label className="checkboxField">
              <input type="checkbox" checked={overlayShowContours} onChange={(e) => setOverlayShowContours(e.target.checked)} />
              <span className="muted">Contours</span>
            </label>

            <label className="checkboxField">
              <input type="checkbox" checked={overlayShowBBoxes} onChange={(e) => setOverlayShowBBoxes(e.target.checked)} />
              <span className="muted">BBoxes</span>
            </label>

            <label className="checkboxField">
              <input type="checkbox" checked={overlayShowLabels} onChange={(e) => setOverlayShowLabels(e.target.checked)} />
              <span className="muted">Labels</span>
            </label>

            <label className="selectField">
              <span className="muted">Label mode</span>
              <select
                value={overlayLabelMode}
                onChange={(e) => setOverlayLabelMode(e.target.value as 'id' | 'id+class')}
              >
                <option value="id">ID</option>
                <option value="id+class">ID + class</option>
              </select>
            </label>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
            <label className="checkboxField">
              <input type="checkbox" checked={overlayShowGrid} onChange={(e) => setOverlayShowGrid(e.target.checked)} />
              <span className="muted">Grid</span>
            </label>

            <label className="checkboxField">
              <input
                type="checkbox"
                checked={overlayShowCrosshair}
                onChange={(e) => setOverlayShowCrosshair(e.target.checked)}
              />
              <span className="muted">Crosshair</span>
            </label>

            <label className="checkboxField">
              <input
                type="checkbox"
                checked={overlayShowStatusChip}
                onChange={(e) => setOverlayShowStatusChip(e.target.checked)}
              />
              <span className="muted">Status chip</span>
            </label>

            <label className="checkboxField">
              <input
                type="checkbox"
                checked={overlayShowDebugText}
                onChange={(e) => setOverlayShowDebugText(e.target.checked)}
              />
              <span className="muted">Debug text</span>
            </label>

            <label className="checkboxField">
              <input
                type="checkbox"
                checked={overlayUseClassColors}
                onChange={(e) => setOverlayUseClassColors(e.target.checked)}
              />
              <span className="muted">Class colors</span>
            </label>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
            <label className="rangeField">
              <span className="muted">Opacity</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              />
              <span className="mono">{overlayOpacity.toFixed(2)}</span>
            </label>

            <label className="rangeField">
              <span className="muted">Line width</span>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={overlayLineWidth}
                onChange={(e) => setOverlayLineWidth(Number(e.target.value))}
              />
              <span className="mono">{overlayLineWidth}</span>
            </label>

            <button className="btn" onClick={() => setSelectedPieceId(null)} disabled={selectedPieceId == null}>
              Clear selection
            </button>
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            Tip: Tap a piece on the overlay to select it. Use &quot;Segmented&quot; to inspect raw segmentation candidates
            and &quot;Extracted&quot; to inspect filtered/extracted pieces.
          </p>
        </div>


<div className="opencvPanel" aria-label="Near-real-time panel" style={{ marginTop: 12 }}>
  <div className="row">
    <strong>Near-real-time</strong>
    <span className="muted" style={{ marginLeft: 10 }}>
      Status: <strong>{liveModeEnabled ? liveStatus : 'idle'}</strong>
    </span>
  </div>

  <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
    <label className="checkboxField">
      <input type="checkbox" checked={liveModeEnabled} onChange={(e) => setLiveModeEnabled(e.target.checked)} />
      <span className="muted">Enable live processing</span>
    </label>

    <label className="checkboxField">
      <input type="checkbox" checked={useWorker} onChange={(e) => setUseWorker(e.target.checked)} />
      <span className="muted">Use worker</span>
    </label>
    <span className="muted" style={{ marginLeft: 6 }}>
      Worker: <strong>{workerStatus}</strong>
      {workerError ? <span style={{ marginLeft: 8 }}>({workerError})</span> : null}
    </span>

    <label className="rangeField" style={{ minWidth: 220 }}>
      <span className="muted">Rate (fps)</span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={liveFps}
        onChange={(e) => setLiveFps(Number(e.target.value))}
        disabled={!liveModeEnabled}
      />
      <span className="mono">{liveFps}</span>
    </label>

    <label className="rangeField" style={{ minWidth: 260 }}>
      <span className="muted">Pipeline</span>
      <select
        value={livePipeline}
        onChange={(e) => setLivePipeline(e.target.value as any)}
        disabled={!liveModeEnabled}
        className="select"
      >
        <option value="segment">Segmentation</option>
        <option value="extract">Segmentation + extraction</option>
        <option value="classify">Segmentation + extraction + classify</option>
      </select>
      <span className="mono" />
    </label>

    <button className="btn" onClick={() => setLiveModeEnabled(false)} disabled={!liveModeEnabled}>
      Stop live mode
    </button>
  </div>

  {liveInfo && (
    <p className="muted" style={{ marginTop: 10 }}>
      {liveInfo}
    </p>
  )}

  {liveError && (
    <p className="muted" style={{ marginTop: 10 }}>
      Live error: <strong>{liveError}</strong>
    </p>
  )}

  <p className="muted" style={{ marginTop: 10 }}>
    Tip: start at 1–3 fps for stability. Higher rates may cause battery drain and dropped frames on mobile.
  </p>
</div>

	<div className="opencvPanel" aria-label="Quality panel" style={{ marginTop: 12 }}>
	  <div className="row">
	    <strong>Quality</strong>
	    <span className="muted" style={{ marginLeft: 10 }}>
	      Status: <strong>{qualityStatus}</strong>
	    </span>
	  </div>

	  {!frameQuality && (
	    <p className="muted" style={{ marginTop: 10 }}>
	      Run segmentation/extraction (or enable live processing) to get lighting/focus guidance.
	    </p>
	  )}

	  {frameQuality && (
	    <>
	      <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
	        <span className="mono">mean {frameQuality.mean.toFixed(0)}</span>
	        <span className="mono">contrast {frameQuality.std.toFixed(0)}</span>
	        {typeof frameQuality.lapVar === 'number' && <span className="mono">sharp {frameQuality.lapVar.toFixed(0)}</span>}
	        {typeof frameQuality.motion === 'number' && <span className="mono">motion {frameQuality.motion.toFixed(0)}</span>}
	        {(() => {
	          const fg = frameQuality.foregroundRatio ?? frameQuality.fgRatio;
	          return typeof fg === 'number' ? <span className="mono">fg {(fg * 100).toFixed(1)}%</span> : null;
	        })()}
	        <span className="mono">pieces {segPieces.length}</span>
	      </div>

	      {qualityGuidance.length === 0 ? (
	        <p className="muted" style={{ marginTop: 10 }}>
	          Looks good. For best results: keep pieces separated, avoid glare, and hold the camera steady.
	        </p>
	      ) : (
	        <ul style={{ marginTop: 10, paddingLeft: 18 }}>
	          {qualityGuidance.map((g) => (
	            <li key={g.key} className={g.level === 'bad' ? 'textBad' : g.level === 'warn' ? 'textWarn' : 'muted'}>
	              {g.message}
	            </li>
	          ))}
	        </ul>
	      )}

	      {(status === 'error' || workerStatus === 'error' || liveError) && (
	        <div style={{ marginTop: 10 }}>
	          <p className="muted">
	            If things look stuck: try reloading, toggling <strong>Use worker</strong>, or stopping/starting the camera.
	          </p>
	        </div>
	      )}
	    </>
	  )}
	</div>

<div className="opencvPanel" aria-label="OpenCV panel">
  <div className="row">
    <strong>OpenCV</strong>
    <span className="muted" style={{ marginLeft: 10 }}>
      Status: <strong>{opencvStatus}</strong>
      {opencvBuildInfoLine ? <> · {opencvBuildInfoLine}</> : null}
    </span>
  </div>

  <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
    <button className="btn"
      onClick={onToggleHelloProcessing}
      disabled={status !== 'live' && !isProcessing}
    >
      {isProcessing ? 'Stop OpenCV processing' : 'Start OpenCV processing'}
    </button>

    <label className="rangeField">
      <span className="muted">Canny low</span>
      <input
        type="range"
        min={0}
        max={255}
        value={cannyLow}
        disabled={!opencvReady}
        onChange={(e) => setCannyLow(Number(e.target.value))}
      />
      <span className="mono">{cannyLow}</span>
    </label>

    <label className="rangeField">
      <span className="muted">Canny high</span>
      <input
        type="range"
        min={0}
        max={255}
        value={cannyHigh}
        disabled={!opencvReady}
        onChange={(e) => setCannyHigh(Number(e.target.value))}
      />
      <span className="mono">{cannyHigh}</span>
    </label>
  </div>

  <div className="processedViewport" style={{ marginTop: 12 }}>
    <canvas ref={processedCanvasRef} className="processedCanvas" aria-label="Processed preview" />
  </div>

  {/* Hidden input canvas used for OpenCV processing (read by cv.imread). */}
  <canvas ref={processingInputCanvasRef} className="hidden" aria-hidden="true" />

  {opencvError ? (
    <p className="cameraError" role="alert" style={{ marginTop: 12 }}>
      OpenCV error: {opencvError}
    </p>
  ) : null}

  <p className="muted" style={{ marginTop: 10 }}>
    Tip: Start camera first, then start OpenCV processing to see a live edge preview.
  </p>
</div>



<div className="opencvPanel" aria-label="Segmentation panel" style={{ marginTop: 12 }}>
  <div className="row">
    <strong>Segmentation</strong>
    <span className="muted" style={{ marginLeft: 10 }}>
      State: <strong>{segStatus}</strong>
      {segPieces.length ? <> · Pieces: <strong>{segPieces.length}</strong></> : null}
    </span>
  </div>

  <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
    <button className="btn btnPrimary" onClick={segmentPiecesNow} disabled={(status !== 'live' && status !== 'captured') || opencvStatus === 'loading' || isProcessing}>
      Segment pieces
    </button>
    <button className="btn" onClick={clearSegmentation} disabled={segPieces.length === 0 && segStatus === 'idle'}>
      Clear
    </button>

    <label className="rangeField">
      <span className="muted">Min area</span>
      <input
        type="range"
        min={0.0005}
        max={0.01}
        step={0.0005}
        value={minAreaRatio}
        onChange={(e) => setMinAreaRatio(Number(e.target.value))}
        disabled={segStatus === 'running'}
      />
      <span className="mono">{minAreaRatio.toFixed(4)}</span>
    </label>

    <label className="rangeField">
      <span className="muted">Morph k</span>
      <input
        type="range"
        min={3}
        max={15}
        step={2}
        value={morphKernel}
        onChange={(e) => setMorphKernel(Number(e.target.value))}
        disabled={segStatus === 'running'}
      />
      <span className="mono">{morphKernel}</span>
    </label>
  </div>

  {segError ? (
    <p className="cameraError" role="alert" style={{ marginTop: 12 }}>
      Segmentation error: {segError}
    </p>
  ) : null}

  {segDebug ? (
    <p className="muted" style={{ marginTop: 10, whiteSpace: 'pre-line' }}>
      {segDebug}
    </p>
  ) : (
    <p className="muted" style={{ marginTop: 10 }}>
      Tip: Use a plain, contrasting background and avoid overlapping pieces for best results.
    </p>
  )}

<div className="opencvPanel" aria-label="Pieces panel" style={{ marginTop: 12 }}>
  <div className="row">
    <strong>Per-piece extraction</strong>
    <span className="muted" style={{ marginLeft: 10 }}>
      State: <strong>{extractStatus}</strong>
      {extractedPieces.length ? <> · Extracted: <strong>{extractedPieces.length}</strong></> : null}
      {selectedPieceId != null ? <> · Selected: <strong>#{selectedPieceId}</strong></> : null}
    </span>
  </div>

  <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
    <button
      className="btn btnPrimary"
      onClick={extractPiecesNow}
      disabled={(status !== 'live' && status !== 'captured') || !segResult || segStatus === 'running' || extractStatus === 'running' || isProcessing}
    >
      Extract pieces
    </button>

    <button
      className="btn"
      onClick={classifyPiecesNow}
      disabled={opencvStatus === 'loading' || isProcessing || extractedPieces.length === 0}
    >
      Classify edges/corners
    </button>

    <button
      className="btn"
      onClick={() => {
        setExtractedPieces([]);
        setSelectedPieceId(null);
        setExtractStatus('idle');
        setExtractError('');
        setExtractDebug('');
        setClassifyDebug('');
      }}
      disabled={extractedPieces.length === 0 && extractStatus === 'idle'}
    >
      Clear
    </button>

    <label className="rangeField">
      <span className="muted">Min solidity</span>
      <input
        type="range"
        min={0.5}
        max={0.98}
        step={0.01}
        value={filterMinSolidity}
        onChange={(e) => setFilterMinSolidity(Number(e.target.value))}
        disabled={extractStatus === 'running'}
      />
      <span className="mono">{filterMinSolidity.toFixed(2)}</span>
    </label>

    <label className="rangeField">
      <span className="muted">Max aspect</span>
      <input
        type="range"
        min={1}
        max={8}
        step={0.25}
        value={filterMaxAspect}
        onChange={(e) => setFilterMaxAspect(Number(e.target.value))}
        disabled={extractStatus === 'running'}
      />
      <span className="mono">{filterMaxAspect.toFixed(2)}</span>
    </label>

    <label className="rangeField">
      <span className="muted">Border margin</span>
      <input
        type="range"
        min={0}
        max={30}
        step={1}
        value={filterBorderMargin}
        onChange={(e) => setFilterBorderMargin(Number(e.target.value))}
        disabled={extractStatus === 'running'}
      />
      <span className="mono">{filterBorderMargin}px</span>
    </label>

    <label className="rangeField">
      <span className="muted">Padding</span>
      <input
        type="range"
        min={0}
        max={30}
        step={1}
        value={filterPadding}
        onChange={(e) => setFilterPadding(Number(e.target.value))}
        disabled={extractStatus === 'running'}
      />
      <span className="mono">{filterPadding}px</span>
    </label>

    <label className="rangeField">
      <span className="muted">Max pieces</span>
      <input
        type="range"
        min={10}
        max={200}
        step={10}
        value={filterMaxPieces}
        onChange={(e) => setFilterMaxPieces(Number(e.target.value))}
        disabled={extractStatus === 'running'}
      />
      <span className="mono">{filterMaxPieces}</span>
    </label>
  </div>

  {extractError ? (
    <p className="cameraError" role="alert" style={{ marginTop: 12 }}>
      Extraction error: {extractError}
    </p>
  ) : null}

  {extractDebug ? (
    <p className="muted" style={{ marginTop: 10, whiteSpace: 'pre-line' }}>
      {extractDebug}
    </p>
  ) : (
    <p className="muted" style={{ marginTop: 10 }}>
      Tip: If pieces are missing, try adjusting &quot;Min area&quot; (segmentation) first, then relax solidity/aspect filters.
    </p>
  )}


{classifyDebug ? (
  <p className="muted" style={{ marginTop: 10, whiteSpace: 'pre-line' }}>
    {classifyDebug}
  </p>
) : null}

  {extractedPieces.length ? (
    <div className="pieceGrid" style={{ marginTop: 12 }}>
      {extractedPieces.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pieceThumb ${selectedPieceId === p.id ? 'selected' : ''}`}
          onClick={() => setSelectedPieceId(p.id)}
          title={`#${p.id} · solidity ${p.solidity.toFixed(2)} · aspect ${p.aspectRatio.toFixed(2)}`}
        >
          <img className="pieceImg" src={p.previewUrl} alt={`Piece ${p.id}`} />
          <div className="pieceMeta">
            <span className="mono">#{p.id}</span>
            <span className="muted">{Math.round(p.solidity * 100)}%</span>
            {p.classification ? (
              <span className={`badge badge_${p.classification}`}>{p.classification}</span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  ) : null}
</div>

</div>
<p className="muted" style={{ marginTop: 12 }}>

          Status: <strong>{status}</strong>
          {streamInfo ? <> · {streamInfo}</> : null}
        </p>

        <p className="muted">
          Tip: For later computer vision steps, a plain contrasting background and non-overlapping pieces will improve results.
        </p>
      </div>
  );
}
