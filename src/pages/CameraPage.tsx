import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { loadOpenCV, type OpenCvModule } from '../lib/opencv/loadOpenCV';
import { processHelloOpenCvFrame } from '../lib/opencv/helloFrameProcessor';
import { segmentPiecesFromFrame, type PieceCandidate, type SegmentPiecesResult } from '../lib/opencv/segmentPieces';
import { filterAndExtractPieces, type ExtractedPiece } from '../lib/opencv/extractPieces';
import { classifyEdgeCornerMvp } from '../lib/opencv/classifyPieces';

type CameraStatus = 'idle' | 'starting' | 'live' | 'captured' | 'error';

function getMediaDevices(): MediaDevices | null {
  // Some environments (tests) may not define navigator.mediaDevices.
  const md = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  return md ?? null;
}

function formatError(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'Unknown error';
  return 'Unknown error';
}


function safeGet2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    // jsdom does not implement canvas; treat as unavailable in tests.
    return null;
  }
}

function useOverlayCanvas(
  overlayCanvasRef: RefObject<HTMLCanvasElement>,
  status: CameraStatus,
  debugText?: string,
  pieces?: PieceCandidate[],
  sourceSize?: { w: number; h: number },
  selectedPieceId?: number | null,
  classById?: Map<number, 'corner' | 'edge' | 'interior'>
) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const ctx = safeGet2DContext(canvas);
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resizeToElement = () => {
      const { clientWidth, clientHeight } = canvas;
      const w = Math.max(1, Math.floor(clientWidth * dpr));
      const h = Math.max(1, Math.floor(clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      resizeToElement();

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.clearRect(0, 0, w, h);

      // Subtle grid
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      // Crosshair
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const cx = w / 2;
      const cy = h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();

      // Status chip
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const label = status === 'captured' ? 'Captured' : status === 'live' ? 'Live' : status === 'starting' ? 'Starting…' : status === 'error' ? 'Error' : 'Idle';
      const padX = 10;
      const padY = 7;
      ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      const metrics = ctx.measureText(label);
      const boxW = Math.ceil(metrics.width + padX * 2);
      const boxH = 14 + padY * 2;
      ctx.fillRect(12, 12, boxW, boxH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, 12 + padX, 12 + padY + 14 - 2);

      // Optional debug text
      if (debugText) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        const lines = debugText.split('\n');
        const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const bh = lines.length * 16 + 10;
        ctx.fillRect(12, 12 + boxH + 10, Math.ceil(maxW) + 16, bh);
        ctx.fillStyle = '#ffffff';
        lines.forEach((l, i) => {
          ctx.fillText(l, 20, 12 + boxH + 10 + 18 + i * 16);
        });
      }

// Draw piece contours (segmentation result), mapped from source frame to viewport coordinates.
if (pieces && pieces.length > 0 && sourceSize && sourceSize.w > 0 && sourceSize.h > 0) {
  const scale = Math.min(w / sourceSize.w, h / sourceSize.h);
  const offX = (w - sourceSize.w * scale) / 2;
  const offY = (h - sourceSize.h * scale) / 2;

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00ff66';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  for (const p of pieces) {
    const isSelected = selectedPieceId != null && p.id === selectedPieceId;
    ctx.lineWidth = isSelected ? 3 : 2;
    const cls = classById?.get(p.id);
    ctx.strokeStyle = isSelected ? '#ffcc00' : cls === 'corner' ? '#ff5566' : cls === 'edge' ? '#33aaff' : '#00ff66';
    if (!p.contour || p.contour.length < 2) continue;

    ctx.beginPath();
    const p0 = p.contour[0];
    ctx.moveTo(p0.x * scale + offX, p0.y * scale + offY);
    for (let k = 1; k < p.contour.length; k++) {
      const pk = p.contour[k];
      ctx.lineTo(pk.x * scale + offX, pk.y * scale + offY);
    }
    ctx.closePath();
    ctx.stroke();

    // Label near bbox top-left
    const lx = p.bbox.x * scale + offX;
    const ly = p.bbox.y * scale + offY;
    const label = `#${p.id}`;
    const tw = ctx.measureText(label).width;
    ctx.fillRect(lx, Math.max(0, ly - 16), tw + 10, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, lx + 5, Math.max(12, ly - 4));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  }
}


      rafRef.current = window.requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => resizeToElement());
    ro.observe(canvas);

    rafRef.current = window.requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [overlayCanvasRef, status, debugText, pieces, sourceSize, selectedPieceId, classById]);
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // OpenCV input/output canvases (Step 3).
  const processingInputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  // OpenCV state (lazy-loaded on user action).
  const cvRef = useRef<OpenCvModule | null>(null);
  const processingTimerRef = useRef<number | null>(null);
  const cannyLowRef = useRef<number>(60);
  const cannyHighRef = useRef<number>(120);

const [status, setStatus] = useState<CameraStatus>('idle');
const [errorMessage, setErrorMessage] = useState<string>('');

const [opencvStatus, setOpenCvStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
const [opencvBuildInfoLine, setOpenCvBuildInfoLine] = useState<string>('');
const [opencvError, setOpenCvError] = useState<string>('');
const [isProcessing, setIsProcessing] = useState<boolean>(false);

// Hello OpenCV tuning (we will replace these with domain-specific parameters later).
const [cannyLow, setCannyLow] = useState<number>(60);
const [cannyHigh, setCannyHigh] = useState<number>(120);

  // Segmentation tuning (piece vs background)
  const [minAreaRatio, setMinAreaRatio] = useState<number>(0.0015);
  const [morphKernel, setMorphKernel] = useState<number>(5);
  const [segStatus, setSegStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [segError, setSegError] = useState<string>('');
  const [segPieces, setSegPieces] = useState<PieceCandidate[]>([]);
  const [segDebug, setSegDebug] = useState<string>('');
const [segResult, setSegResult] = useState<SegmentPiecesResult | null>(null);

// Step 5: filtering + per-piece extraction (transparent previews)
const [extractStatus, setExtractStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
const [extractError, setExtractError] = useState<string>('');
const [extractDebug, setExtractDebug] = useState<string>('');
  const [classifyDebug, setClassifyDebug] = useState<string>('');
const [extractedPieces, setExtractedPieces] = useState<ExtractedPiece[]>([]);
  const classById = useMemo(() => {
    const m = new Map<number, 'corner' | 'edge' | 'interior'>();
    for (const p of extractedPieces) {
      if (p.classification) m.set(p.id, p.classification);
    }
    return m;
  }, [extractedPieces]);
const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);

const [filterMinSolidity, setFilterMinSolidity] = useState<number>(0.80);
const [filterMaxAspect, setFilterMaxAspect] = useState<number>(4.0);
const [filterBorderMargin, setFilterBorderMargin] = useState<number>(6);
const [filterPadding, setFilterPadding] = useState<number>(6);
const [filterMaxPieces, setFilterMaxPieces] = useState<number>(80);


const [streamInfo, setStreamInfo] = useState<string>('');
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

const mediaDevices = useMemo(() => getMediaDevices(), []);

useEffect(() => {
  cannyLowRef.current = cannyLow;
}, [cannyLow]);

useEffect(() => {
  cannyHighRef.current = cannyHigh;
}, [cannyHigh]);

useOverlayCanvas(overlayCanvasRef, status, streamInfo, segPieces, sourceSize, selectedPieceId, classById);

const stopHelloOpenCvProcessing = () => {
  if (processingTimerRef.current != null) {
    window.clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  setIsProcessing(false);
};

// Stop processing whenever we leave the live camera mode, and on unmount.
useEffect(() => {
  if (status !== 'live') stopHelloOpenCvProcessing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [status]);

useEffect(() => {
  return () => stopHelloOpenCvProcessing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const startHelloOpenCvProcessing = async () => {
  if (isProcessing) return;

  try {
    setOpenCvError('');
    if (!cvRef.current) {
      setOpenCvStatus('loading');
      const cv = await loadOpenCV();
      cvRef.current = cv;

      // Keep this lightweight: store just the first line of build info.
      const firstLine = String(cv.getBuildInformation?.() ?? '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean)[0];
      setOpenCvBuildInfoLine(firstLine ?? 'OpenCV loaded');
      setOpenCvStatus('ready');
    }

    const cv = cvRef.current;
    const video = videoRef.current;
    const inputCanvas = processingInputCanvasRef.current;
    const outputCanvas = processedCanvasRef.current;

    if (!cv || !video || !inputCanvas || !outputCanvas) {
      throw new Error('Missing video/canvas refs for OpenCV processing.');
    }

    // Run at a modest rate to keep CPU/battery reasonable on mobile.
    const tick = () => {
      try {
        processHelloOpenCvFrame({
          cv,
          video,
          inputCanvas,
          outputCanvas,
          options: {
            cannyLowThreshold: cannyLowRef.current,
            cannyHighThreshold: cannyHighRef.current,
            targetWidth: 640
          }
        });
      } catch (err) {
        // If OpenCV throws, stop processing and surface the error.
        stopHelloOpenCvProcessing();
        setOpenCvStatus('error');
        setOpenCvError(formatError(err));
      }
    };

    tick();
    processingTimerRef.current = window.setInterval(tick, 120);
    setIsProcessing(true);
  } catch (err) {
    stopHelloOpenCvProcessing();
    setOpenCvStatus('error');
    setOpenCvError(formatError(err));
  }
};

  const stopStream = () => {
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
    }
    streamRef.current = null;
    const v = videoRef.current as any;
    if (v) v.srcObject = null;
  };

  

const segmentPiecesNow = async (): Promise<SegmentPiecesResult | null> => {
  setSegError('');
  setSegDebug('');
  setSegStatus('running');

  try {
    if (opencvStatus === 'idle') {
      setOpenCvStatus('loading');
    }

    if (!cvRef.current) {
      const cv = await loadOpenCV();
      cvRef.current = cv;
      setOpenCvStatus('ready');

      const buildInfo: string | undefined = cv?.getBuildInformation?.();
      const firstLine = buildInfo
        ?.split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean)[0];
      setOpenCvBuildInfoLine(firstLine ?? 'OpenCV loaded');
    }

    const cv = cvRef.current;
    const inputCanvas = processingInputCanvasRef.current;
    const outputCanvas = processedCanvasRef.current;

    const video = videoRef.current;
    const still = stillCanvasRef.current;

    if (!cv || !inputCanvas || !outputCanvas) {
      throw new Error('Missing OpenCV/canvas refs.');
    }

    const source = status === 'captured' ? still : video;
    if (!source) {
      throw new Error('No frame source available (camera not started?).');
    }

    const result = segmentPiecesFromFrame({
      cv,
      source: source as any,
      inputCanvas,
      outputCanvas,
      options: {
        targetWidth: 640,
        minAreaRatio,
        morphKernelSize: morphKernel
      }
    });

    setSegPieces(result.pieces);
    setSegResult(result);

    // Any time we re-run segmentation, reset extraction so UI stays consistent.
    setExtractedPieces([]);
    setSelectedPieceId(null);
    setExtractStatus('idle');
    setExtractError('');
    setExtractDebug('');
    setSegDebug(
      [
        `Segmentation: ${result.pieces.length} piece(s)`,
        `Contours: ${result.debug.contoursFound}`,
        `Proc: ${result.debug.processedWidth}×${result.debug.processedHeight}${result.debug.inverted ? ' (inverted)' : ''}`
      ].join('\n')
    );
    setSegStatus('done');
    return result;
  } catch (err) {
    setSegStatus('error');
    setSegError(formatError(err));
    return null;
  }
};

const extractPiecesNow = async () => {
  setExtractError('');
  setExtractDebug('');
  setExtractStatus('running');

  try {
    if (opencvStatus === 'idle') {
      setOpenCvStatus('loading');
    }

    if (!cvRef.current) {
      const cv = await loadOpenCV();
      cvRef.current = cv;
      setOpenCvStatus('ready');

      const buildInfo: string | undefined = cv?.getBuildInformation?.();
      if (buildInfo) {
        setOpenCvBuildInfoLine(buildInfo.split('\n')[0] ?? '');
      }
    }

    const cv = cvRef.current;
    const inputCanvas = processingInputCanvasRef.current;
    if (!cv || !inputCanvas) {
      throw new Error('Missing OpenCV/canvas refs.');
    }

    // Ensure we have a current segmentation result to extract from.
    const seg = segResult ?? (await segmentPiecesNow());
    if (!seg || seg.pieces.length === 0) {
      throw new Error('No segmentation result available (segment pieces first).');
    }

    const { pieces, debug } = filterAndExtractPieces({
      cv,
      segmentation: seg,
      processedFrameCanvas: inputCanvas,
      options: {
        borderMarginPx: filterBorderMargin,
        paddingPx: filterPadding,
        minSolidity: filterMinSolidity,
        maxAspectRatio: filterMaxAspect,
        maxPieces: filterMaxPieces
      }
    });

    setExtractedPieces(pieces);
    setExtractDebug(debug);
    setExtractStatus('done');

    if (pieces.length > 0) {
      setSelectedPieceId(pieces[0].id);
    }
  } catch (err) {
    setExtractStatus('error');
    setExtractError(formatError(err));
  }
};

const clearSegmentation = () => {
  setSegPieces([]);
  setSegResult(null);
  setSegStatus('idle');
  setSegError('');
  setSegDebug('');

  setExtractedPieces([]);
  setSelectedPieceId(null);
  setExtractStatus('idle');
  setExtractError('');
  setExtractDebug('');
};
const startCamera = async () => {
    setErrorMessage('');
    if (!mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMessage('Camera access is not supported in this environment.');
      return;
    }

    setStatus('starting');
    try {
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;

      const v = videoRef.current as any;
      if (!v) {
        stopStream();
        setStatus('error');
        setErrorMessage('Video element not available.');
        return;
      }

      v.srcObject = stream;
      // iOS Safari requires these flags for inline playback.
      v.playsInline = true;
      v.muted = true;

      await v.play();

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      const w = settings?.width ?? v.videoWidth;
      const h = settings?.height ?? v.videoHeight;
      setStreamInfo(`Stream: ${w}×${h}`);
      setSourceSize({ w: Number(w) || v.videoWidth || 0, h: Number(h) || v.videoHeight || 0 });

      // Clear any old captured frame
      const still = stillCanvasRef.current;
      if (still) {
        const ctx = safeGet2DContext(still);
        if (ctx) ctx.clearRect(0, 0, still.width, still.height);
      }

      setStatus('live');
    } catch (err) {
      stopStream();
      setStatus('error');
      setErrorMessage(formatError(err));
    }
  };
const classifyPiecesNow = async () => {
  try {
    setSegError('');
    setClassifyDebug('');
    if (opencvStatus === 'idle') {
      setOpenCvStatus('loading');
    }

    if (!cvRef.current) {
      const cv = await loadOpenCV();
      cvRef.current = cv;
      setOpenCvStatus('ready');

      const buildInfo: string | undefined = cv?.getBuildInformation?.();
      if (buildInfo) setOpenCvBuildInfoLine(buildInfo.split('\n')[0] ?? '');
    }

    const cv = cvRef.current;
    const inputCanvas = processingInputCanvasRef.current;
    if (!cv || !inputCanvas) throw new Error('Missing OpenCV/canvas refs.');
    if (!segResult) throw new Error('Run segmentation first');
    if (!extractedPieces.length) throw new Error('Extract pieces first');

    setIsProcessing(true);

    const { pieces, debug } = classifyEdgeCornerMvp({
      cv,
      processedFrameCanvas: inputCanvas,
      pieces: extractedPieces
    });

    setExtractedPieces(pieces);
    setClassifyDebug(debug);
  } catch (e) {
    setSegError(`Classification error: ${formatError(e)}`);
  } finally {
    setIsProcessing(false);
  }
};



  const stopCamera = () => {
    stopStream();
    setStreamInfo('');
    setStatus('idle');
    setSegPieces([]);
    setSegStatus('idle');
    setSegError('');
    setSegDebug('');
  };

  const captureFrame = () => {
    const v = videoRef.current;
    const still = stillCanvasRef.current;
    if (!v || !still) return;

    const vw = v.videoWidth || 0;
    const vh = v.videoHeight || 0;
    if (vw === 0 || vh === 0) return;

    setSourceSize({ w: vw, h: vh });

    still.width = vw;
    still.height = vh;

    const ctx = safeGet2DContext(still);
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, vw, vh);
    v.pause();
    setStatus('captured');
  };

  const backToLive = async () => {
    const v = videoRef.current as any;
    if (!v) return;
    try {
      await v.play();
      setStatus('live');
    } catch (err) {
      setStatus('error');
      setErrorMessage(formatError(err));
    }
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="card">
        <h2>Camera</h2>
        <p className="muted">
          Step 3 implementation: live camera stream + canvas overlay + OpenCV "Hello" frame processor (edges preview).
        </p>
      </div>

      <div className="cameraStage card">
        <div className="cameraViewport" aria-label="Camera viewport">
          <video
            ref={videoRef}
            className={status === 'captured' ? 'hidden' : 'cameraLayer'}
            autoPlay
            playsInline
            muted
          />
          <canvas
            ref={stillCanvasRef}
            className={status === 'captured' ? 'cameraLayer' : 'hidden'}
            aria-label="Captured frame"
          />
          <canvas ref={overlayCanvasRef} className="cameraOverlay" aria-label="Overlay" />
        </div>

        {status === 'error' && (
          <div className="cameraError" role="alert">
            <strong>Camera error:</strong> {errorMessage}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Controls</h2>

        <div className="buttonRow">
          <button className="btn btnPrimary" onClick={startCamera} disabled={status === 'starting' || status === 'live' || status === 'captured'}>
            Start camera
          </button>
          <button className="btn btnDanger" onClick={stopCamera} disabled={status === 'idle'}>
            Stop camera
          </button>
          <button className="btn" onClick={captureFrame} disabled={status !== 'live'}>
            Capture frame
          </button>
          <button className="btn" onClick={backToLive} disabled={status !== 'captured'}>
            Back to live
          </button>
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
      onClick={isProcessing ? stopHelloOpenCvProcessing : startHelloOpenCvProcessing}
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
        disabled={!cvRef.current}
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
        disabled={!cvRef.current}
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
    </>
  );
}
