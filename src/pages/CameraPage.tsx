import { useEffect, useMemo, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { loadOpenCV, type OpenCvModule } from '../lib/opencv/loadOpenCV';
import { processHelloOpenCvFrame } from '../lib/opencv/helloFrameProcessor';
import { segmentPiecesFromFrame, type PieceCandidate, type SegmentPiecesResult } from '../lib/opencv/segmentPieces';
import { filterAndExtractPieces, type ExtractedPiece } from '../lib/opencv/extractPieces';
import { classifyEdgeCornerMvp } from '../lib/opencv/classifyPieces';
import { VisionWorkerClient } from '../lib/vision/visionWorkerClient';
import { frameQualityToStatus, guidanceFromFrameQuality, type FrameQuality } from '../lib/vision/quality';
import { pointInPolygon } from '../lib/overlay/geometry';
import { computeFitTransform, mapViewportToSourcePoint } from '../lib/overlay/coordinates';
import type { CameraStatus, OverlayOptions } from '../types/overlay';
import { drawOverlay } from '../lib/overlay/drawOverlay';
import { useCameraStream } from '../hooks/useCameraStream';
import { useVisionTick } from '../hooks/useVisionTick';
import { CameraControlsCard, CameraIntroCard, CameraViewport } from '../components/camera';

function getAppBasePath(): string {
  // Runtime base path used for loading assets under a non-root deploy (e.g. GitHub Pages).
  // Kept free of ESM-only syntax so Jest can parse this file.
  const baseTag = typeof document !== 'undefined' ? document.querySelector('base') : null;
  const href = baseTag?.getAttribute('href');
  if (href && href.length > 0) return href.endsWith('/') ? href : `${href}/`;

  if (typeof window !== 'undefined') {
    const p = window.location.pathname || '/';
    // If served from a known subpath, keep it.
    const m = p.match(/^(.*\/pwa-puzzle-finder\/)/);
    if (m) return m[1];
    // Otherwise, use the directory portion of the pathname.
    if (p.endsWith('/')) return p;
    return p.replace(/\/[^/]*$/, '/') || '/';
  }

  return '/';
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
  classById?: Map<number, 'corner' | 'edge' | 'interior'>,
  options?: OverlayOptions
) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const ctx = safeGet2DContext(canvas);
    if (!ctx) return;

    const opts: OverlayOptions = options ?? {
      showGrid: true,
      showCrosshair: true,
      showStatusChip: true,
      showDebugText: Boolean(debugText),
      showContours: true,
      showBBoxes: false,
      showLabels: true,
      labelMode: 'id+class',
      opacity: 0.9,
      lineWidth: 2,
      useClassificationColors: true
    };

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

      drawOverlay(ctx, {
        width: w,
        height: h,
        status,
        debugText,
        pieces,
        sourceSize,
        selectedPieceId,
        classById,
        options: opts
      });

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
  }, [overlayCanvasRef, status, debugText, pieces, sourceSize, selectedPieceId, classById, options]);
}

export default function CameraPage() {
  const isTestEnv = (globalThis as any).process?.env?.NODE_ENV === 'test';
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const camera = useCameraStream();
  const videoRef = camera.videoRef;
  const status = camera.status;
  const errorMessage = camera.errorMessage;
  const streamInfo = camera.streamInfo;
  const sourceSize = camera.sourceSize;
  const startCamera = async () => {
    // Clear any old captured frame before starting the stream (matches previous behavior).
    const still = stillCanvasRef.current;
    if (still) {
      const ctx = safeGet2DContext(still);
      if (ctx) ctx.clearRect(0, 0, still.width, still.height);
    }
    await camera.startCamera();
  };

  // OpenCV input/output canvases (Step 3).
  const processingInputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // OpenCV state (lazy-loaded on user action).
  const cvRef = useRef<OpenCvModule | null>(null);
  const processingTimerRef = useRef<number | null>(null);
  const cannyLowRef = useRef<number>(60);
  const cannyHighRef = useRef<number>(120);


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
  const [frameQuality, setFrameQuality] = useState<FrameQuality | null>(null);

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

// Overlay settings (Step 7)
const [overlaySource, setOverlaySource] = useState<'segmented' | 'extracted'>('segmented');
const [overlayTapToSelect, setOverlayTapToSelect] = useState<boolean>(true);
const [overlayShowGrid, setOverlayShowGrid] = useState<boolean>(true);
const [overlayShowCrosshair, setOverlayShowCrosshair] = useState<boolean>(false);
const [overlayShowStatusChip, setOverlayShowStatusChip] = useState<boolean>(true);
const [overlayShowDebugText, setOverlayShowDebugText] = useState<boolean>(false);
const [overlayShowContours, setOverlayShowContours] = useState<boolean>(true);
const [overlayShowBBoxes, setOverlayShowBBoxes] = useState<boolean>(false);
const [overlayShowLabels, setOverlayShowLabels] = useState<boolean>(true);
const [overlayLabelMode, setOverlayLabelMode] = useState<'id' | 'id+class'>('id+class');
const [overlayOpacity, setOverlayOpacity] = useState<number>(0.9);
const [overlayLineWidth, setOverlayLineWidth] = useState<number>(2);
const [overlayUseClassColors, setOverlayUseClassColors] = useState<boolean>(true);

// Near-real-time mode (Step 8)
const [liveModeEnabled, setLiveModeEnabled] = useState<boolean>(false);
const [livePipeline, setLivePipeline] = useState<'segment' | 'extract' | 'classify'>('segment');
const [liveFps, setLiveFps] = useState<number>(2);
const [liveStatus, setLiveStatus] = useState<'idle' | 'running' | 'error'>('idle');
const [liveInfo, setLiveInfo] = useState<string>('');
const [liveError, setLiveError] = useState<string>('');

  // Worker offload (Step 9)
  const [useWorker, setUseWorker] = useState<boolean>(() => !isTestEnv);
  const [workerStatus, setWorkerStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workerError, setWorkerError] = useState<string>('');
  const workerClientRef = useRef<VisionWorkerClient | null>(null);
  const appBasePath = useMemo(() => getAppBasePath(), []);

  useEffect(() => {
    if (!useWorker) return;

    if (!workerClientRef.current) {
      workerClientRef.current = new VisionWorkerClient(appBasePath);
    }

    let cancelled = false;
    setWorkerStatus('loading');
    setWorkerError('');

    workerClientRef.current
      .init()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setWorkerStatus('ready');
        } else {
          setWorkerStatus('error');
          setWorkerError(res.error);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setWorkerStatus('error');
        setWorkerError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [useWorker, appBasePath]);




const [filterMinSolidity, setFilterMinSolidity] = useState<number>(0.80);
const [filterMaxAspect, setFilterMaxAspect] = useState<number>(4.0);
const [filterBorderMargin, setFilterBorderMargin] = useState<number>(6);
const [filterPadding, setFilterPadding] = useState<number>(6);
const [filterMaxPieces, setFilterMaxPieces] = useState<number>(80);



useEffect(() => {
  cannyLowRef.current = cannyLow;
}, [cannyLow]);

useEffect(() => {
  cannyHighRef.current = cannyHigh;
}, [cannyHigh]);

const overlayPieces: PieceCandidate[] = useMemo(() => {
  if (overlaySource === 'extracted' && extractedPieces.length > 0) {
    return extractedPieces.map((p) => ({
      id: p.id,
      areaPx: p.areaPxProcessed,
      bbox: p.bboxSource,
      contour: p.contourSource
    }));
  }
  return segPieces;
}, [overlaySource, extractedPieces, segPieces]);

const overlayOptions: OverlayOptions = useMemo(
  () => ({
    showGrid: overlayShowGrid,
    showCrosshair: overlayShowCrosshair,
    showStatusChip: overlayShowStatusChip,
    showDebugText: overlayShowDebugText,
    showContours: overlayShowContours,
    showBBoxes: overlayShowBBoxes,
    showLabels: overlayShowLabels,
    labelMode: overlayLabelMode,
    opacity: overlayOpacity,
    lineWidth: overlayLineWidth,
    useClassificationColors: overlayUseClassColors
  }),
  [
    overlayShowGrid,
    overlayShowCrosshair,
    overlayShowStatusChip,
    overlayShowDebugText,
    overlayShowContours,
    overlayShowBBoxes,
    overlayShowLabels,
    overlayLabelMode,
    overlayOpacity,
    overlayLineWidth,
    overlayUseClassColors
  ]
);

useOverlayCanvas(overlayCanvasRef, status, streamInfo, overlayPieces, sourceSize, selectedPieceId, classById, overlayOptions);

const handleOverlayPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
  if (!overlayTapToSelect) return;
  if (!sourceSize || sourceSize.w <= 0 || sourceSize.h <= 0) return;
  const canvas = overlayCanvasRef.current;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const w = rect.width;
  const h = rect.height;
  const t = computeFitTransform(w, h, sourceSize.w, sourceSize.h);

  const { x: sx, y: sy } = mapViewportToSourcePoint(x, y, t);

  // Find the smallest piece that contains the point.
  let best: PieceCandidate | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const p of overlayPieces) {
    const b = p.bbox;
    if (sx < b.x || sy < b.y || sx > b.x + b.width || sy > b.y + b.height) continue;
    const inPoly = p.contour && p.contour.length >= 3 ? pointInPolygon(sx, sy, p.contour) : true;
    if (!inPoly) continue;

    const area = b.width * b.height;
    if (area < bestArea) {
      best = p;
      bestArea = area;
    }
  }

  setSelectedPieceId(best ? best.id : null);
};


const stopHelloOpenCvProcessing = () => {
  if (processingTimerRef.current != null) {
    window.clearInterval(processingTimerRef.current);
    processingTimerRef.current = null;
  }
  setIsProcessing(false);
};


const ensureOpenCvReady = async (): Promise<OpenCvModule> => {
  if (cvRef.current) return cvRef.current;

  setOpenCvError('');
  setOpenCvStatus('loading');
  const cv = await loadOpenCV();
  cvRef.current = cv;
  setOpenCvStatus('ready');

  const firstLine = String(cv.getBuildInformation?.() ?? '')
    .split('\n')
    .map((s: string) => s.trim())
    .filter(Boolean)[0];
  if (firstLine) setOpenCvBuildInfoLine(firstLine);
  return cv;
};


useVisionTick({
  enabled: liveModeEnabled,
  liveFps,
  livePipeline,
  cameraStatus: status,

  videoRef,
  stillCanvasRef,
  processingInputCanvasRef,
  processedCanvasRef,

  processingTimerRef,
  stopHelloOpenCvProcessing,

  useWorker,
  appBasePath,
  workerClientRef,
  workerStatus,

  minAreaRatio,
  morphKernel,
  filterBorderMargin,
  filterPadding,
  filterMinSolidity,
  filterMaxAspect,
  filterMaxPieces,

  ensureOpenCvReady,

  setLiveStatus,
  setLiveInfo,
  setLiveError,

  setSegStatus,
  setSegError,
  setSegPieces,
  setSegDebug,
  setSegResult,
  setFrameQuality,

  setExtractStatus,
  setExtractError,
  setExtractDebug,
  setExtractedPieces,
  setClassifyDebug
});




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
    camera.stopCamera();
    setSegPieces([]);
    setSegStatus('idle');
    setSegError('');
    setSegDebug('');
  };

  const qualityStatus = useMemo(() => frameQualityToStatus(frameQuality), [frameQuality]);
  const qualityGuidance = useMemo(
    () => guidanceFromFrameQuality(frameQuality, { piecesFound: segPieces.length, maxPieces: filterMaxPieces }),
    [frameQuality, segPieces.length, filterMaxPieces]
  );

  return (
    <>
      <CameraIntroCard />

      <CameraViewport
        videoRef={videoRef}
        stillCanvasRef={stillCanvasRef}
        overlayCanvasRef={overlayCanvasRef}
        status={status}
        errorMessage={errorMessage}
        onOverlayPointerDown={handleOverlayPointerDown}
      />

      <CameraControlsCard
        status={status}
        streamInfo={streamInfo ?? ''}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        onCaptureFrame={() => camera.captureFrame(stillCanvasRef.current)}
        onBackToLive={() => void camera.backToLive()}

        overlaySource={overlaySource}
        setOverlaySource={setOverlaySource}
        selectedPieceId={selectedPieceId}
        setSelectedPieceId={setSelectedPieceId}

        overlayShowGrid={overlayShowGrid}
        setOverlayShowGrid={setOverlayShowGrid}
        overlayShowCrosshair={overlayShowCrosshair}
        setOverlayShowCrosshair={setOverlayShowCrosshair}
        overlayShowStatusChip={overlayShowStatusChip}
        setOverlayShowStatusChip={setOverlayShowStatusChip}
        overlayShowDebugText={overlayShowDebugText}
        setOverlayShowDebugText={setOverlayShowDebugText}
        overlayTapToSelect={overlayTapToSelect}
        setOverlayTapToSelect={setOverlayTapToSelect}
        overlayShowContours={overlayShowContours}
        setOverlayShowContours={setOverlayShowContours}
        overlayShowBBoxes={overlayShowBBoxes}
        setOverlayShowBBoxes={setOverlayShowBBoxes}
        overlayShowLabels={overlayShowLabels}
        setOverlayShowLabels={setOverlayShowLabels}

        overlayLabelMode={overlayLabelMode}
        setOverlayLabelMode={setOverlayLabelMode}
        overlayUseClassColors={overlayUseClassColors}
        setOverlayUseClassColors={setOverlayUseClassColors}
        overlayOpacity={overlayOpacity}
        setOverlayOpacity={setOverlayOpacity}
        overlayLineWidth={overlayLineWidth}
        setOverlayLineWidth={setOverlayLineWidth}

        liveModeEnabled={liveModeEnabled}
        setLiveModeEnabled={setLiveModeEnabled}
        livePipeline={livePipeline}
        setLivePipeline={setLivePipeline}
        liveFps={liveFps}
        setLiveFps={setLiveFps}
        liveStatus={liveStatus}
        liveInfo={liveInfo}
        liveError={liveError}

        useWorker={useWorker}
        setUseWorker={setUseWorker}
        workerStatus={workerStatus}
        workerError={workerError}

        frameQuality={frameQuality}
        qualityStatus={qualityStatus}
        qualityGuidance={qualityGuidance}

        segPieces={segPieces}
        segResult={segResult}
        segStatus={segStatus}
        segError={segError}
        segDebug={segDebug}
        segmentPiecesNow={segmentPiecesNow}
        clearSegmentation={clearSegmentation}

        minAreaRatio={minAreaRatio}
        setMinAreaRatio={setMinAreaRatio}
        morphKernel={morphKernel}
        setMorphKernel={setMorphKernel}

        extractStatus={extractStatus}
        extractError={extractError}
        extractDebug={extractDebug}
        classifyDebug={classifyDebug}
        extractPiecesNow={extractPiecesNow}
        classifyPiecesNow={classifyPiecesNow}

        extractedPieces={extractedPieces}
        setExtractedPieces={setExtractedPieces}
        setExtractStatus={setExtractStatus}
        setExtractError={setExtractError}
        setExtractDebug={setExtractDebug}
        setClassifyDebug={setClassifyDebug}

        opencvStatus={opencvStatus}
        opencvError={opencvError}
        opencvBuildInfoLine={opencvBuildInfoLine ?? ''}
        opencvReady={!!cvRef.current}
        isProcessing={isProcessing}
        onToggleHelloProcessing={() =>
          void (isProcessing ? stopHelloOpenCvProcessing() : startHelloOpenCvProcessing())
        }

        cannyLow={cannyLow}
        setCannyLow={setCannyLow}
        cannyHigh={cannyHigh}
        setCannyHigh={setCannyHigh}
        processingInputCanvasRef={processingInputCanvasRef}
        processedCanvasRef={processedCanvasRef}

        filterMaxPieces={filterMaxPieces}
        setFilterMaxPieces={setFilterMaxPieces}
        filterMinSolidity={filterMinSolidity}
        setFilterMinSolidity={setFilterMinSolidity}
        filterMaxAspect={filterMaxAspect}
        setFilterMaxAspect={setFilterMaxAspect}
        filterBorderMargin={filterBorderMargin}
        setFilterBorderMargin={setFilterBorderMargin}
        filterPadding={filterPadding}
        setFilterPadding={setFilterPadding}
      />
    </>
  );
}