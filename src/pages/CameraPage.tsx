import { useEffect, useMemo, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { loadOpenCV, type OpenCvModule } from '../lib/opencv/loadOpenCV';
import { processHelloOpenCvFrame } from '../lib/opencv/helloFrameProcessor';
import { segmentPiecesFromFrame, type PieceCandidate, type SegmentPiecesResult } from '../lib/opencv/segmentPieces';
import { filterAndExtractPieces, type ExtractedPiece } from '../lib/opencv/extractPieces';
import { classifyEdgeCornerMvp } from '../lib/opencv/classifyPieces';
import { VisionWorkerClient, type VisionPipeline } from '../lib/vision/visionWorkerClient';
import { frameQualityToStatus, guidanceFromFrameQuality, type FrameQuality } from '../lib/vision/quality';
import { pointInPolygon } from '../lib/overlay/geometry';
import { computeFitTransform, mapViewportToSourcePoint } from '../lib/overlay/coordinates';
import type { CameraStatus, OverlayOptions } from '../types/overlay';
import { drawOverlay } from '../lib/overlay/drawOverlay';
import { useCameraStream } from '../hooks/useCameraStream';

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
  // Near-real-time pipeline timer (Step 8)
  const liveTimerRef = useRef<number | null>(null);
  const liveInFlightRef = useRef<boolean>(false);
  const liveTickCountRef = useRef<number>(0);
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

const stopLiveProcessing = () => {
  if (liveTimerRef.current != null) {
    window.clearInterval(liveTimerRef.current);
    liveTimerRef.current = null;
  }
  liveInFlightRef.current = false;
  setLiveStatus('idle');
  setLiveInfo('');
  setLiveError('');
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

const runLivePipelineOnce = async () => {
  const video = videoRef.current;
  const still = stillCanvasRef.current;
  const inputCanvas = processingInputCanvasRef.current;
  const outputCanvas = processedCanvasRef.current;

  if (!inputCanvas || !outputCanvas) throw new Error('Missing OpenCV canvases.');
  const source = status === 'captured' ? still : video;
  if (!source) throw new Error('No frame source available.');

    // Worker path: run the selected pipeline off the main thread.
    if (useWorker) {
      if (!workerClientRef.current) {
        workerClientRef.current = new VisionWorkerClient(appBasePath);
      }

      const initRes = workerStatus === 'ready' ? { ok: true } : await workerClientRef.current.init();
      if (!initRes.ok) throw new Error((initRes as any).error ?? 'Failed to init vision worker.');

      const ctx = safeGet2DContext(inputCanvas);
      if (!ctx) throw new Error('2D context not available.');

      const sourceW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const sourceH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
      if (!sourceW || !sourceH) throw new Error('Source dimensions not ready.');

      const targetWidth = 640;
      const scale = sourceW > targetWidth ? targetWidth / sourceW : 1;
      const pw = Math.max(1, Math.round(sourceW * scale));
      const ph = Math.max(1, Math.round(sourceH * scale));

      if (inputCanvas.width !== pw) inputCanvas.width = pw;
      if (inputCanvas.height !== ph) inputCanvas.height = ph;

      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(source as any, 0, 0, pw, ph);

      const img = ctx.getImageData(0, 0, pw, ph);

      const pipeline = livePipeline as VisionPipeline;
      const res = await workerClientRef.current.process({
        pipeline,
        width: pw,
        height: ph,
        sourceWidth: sourceW,
        sourceHeight: sourceH,
        scaleToSource: sourceW / pw,
        buffer: img.data.buffer,
        segOptions: {
          minAreaRatio,
          blurKernelSize: 5,
          morphKernelSize: morphKernel
        },
        extractOptions: {
          borderMarginPx: filterBorderMargin,
          paddingPx: filterPadding,
          minSolidity: filterMinSolidity,
          maxAspectRatio: filterMaxAspect,
          maxPieces: filterMaxPieces
        }
      });

setSegPieces((res.segmentation?.pieces ?? []) as any);
const seg = res.segmentation as any;
	setSegResult((seg as any) ?? null);
	setFrameQuality(((seg as any)?.quality ?? null) as any);
if (seg?.debug) {
  setSegDebug(
    [
      `Segmentation: ${(seg.pieces?.length ?? 0)} piece(s)`,
      `Contours: ${seg.debug.contoursFound ?? '?'}`,
      `Proc: ${seg.debug.processedWidth ?? '?'}×${seg.debug.processedHeight ?? '?'}${seg.debug.inverted ? ' (inverted)' : ''}`
    ].join('\n')
  );
} else {
  setSegDebug(`Segmentation: ${(seg?.pieces?.length ?? 0)} piece(s)`);
}
if (pipeline !== 'segment') {
        setExtractedPieces((res.extracted?.pieces ?? []) as any);
        setExtractDebug(res.extracted?.debug ?? '');
      }

      if (pipeline === 'classify') {
        setExtractedPieces((res.classified?.pieces ?? []) as any);
        setClassifyDebug(res.classified?.debug ?? '');
      }

      // The worker currently does not render the segmentation preview mask; clear the preview canvas.
      const outCtx = safeGet2DContext(outputCanvas);
      outCtx?.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

      setLiveInfo(`Worker: ${pipeline} • pieces: ${res.segmentation?.pieces?.length ?? 0}`);
      return;
    }

  const cv = await ensureOpenCvReady();

  const t0 = performance.now();

  const seg = segmentPiecesFromFrame({
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

  setSegPieces(seg.pieces);
  setSegResult(seg);
	setFrameQuality(seg.quality ?? null);
  setSegStatus('done');
  setSegError('');
  setSegDebug(
    [
      `Segmentation: ${seg.pieces.length} piece(s)`,
      `Contours: ${seg.debug.contoursFound}`,
      `Proc: ${seg.debug.processedWidth}×${seg.debug.processedHeight}${seg.debug.inverted ? ' (inverted)' : ''}`
    ].join('\n')
  );

  let extracted: ExtractedPiece[] = [];

  if (livePipeline === 'segment') {
    setExtractedPieces([]);
    setExtractStatus('idle');
    setExtractError('');
    setExtractDebug('');
    setClassifyDebug('');
  } else {
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

    extracted = pieces;

    setExtractedPieces(pieces);
    setExtractStatus('done');
    setExtractError('');
    setExtractDebug(`Extracted: ${pieces.length}
${debug}`);
if (livePipeline === 'classify') {
      const classified = classifyEdgeCornerMvp({
        cv,
        processedFrameCanvas: inputCanvas,
        pieces
      });
      setExtractedPieces(classified.pieces);
      setClassifyDebug(classified.debug);
    }
  }

  const dt = performance.now() - t0;
  liveTickCountRef.current += 1;
  setLiveInfo(
    [
      `Tick #${liveTickCountRef.current}`,
      `Pipeline: ${livePipeline}`,
      `Seg: ${seg.pieces.length}`,
      livePipeline === 'segment' ? '' : `Extract: ${extracted.length}`,
      `Time: ${dt.toFixed(0)} ms`
    ]
      .filter(Boolean)
      .join(' · ')
  );
};

useEffect(() => {
  if (!liveModeEnabled) {
    stopLiveProcessing();
    return;
  }

  if (processingTimerRef.current != null) {
    stopHelloOpenCvProcessing();
  }

  if (status !== 'live' && status !== 'captured') {
    return;
  }

  const intervalMs = Math.max(200, Math.round(1000 / Math.max(0.5, liveFps)));
  setLiveStatus('running');
  setLiveError('');

  const tick = async () => {
    if (liveInFlightRef.current) return;
    if (!liveModeEnabled) return;
    if (document.hidden) return;
    if (status !== 'live' && status !== 'captured') return;

    const v = videoRef.current;
    if (status === 'live' && (!v || (v.videoWidth || 0) === 0)) return;

    liveInFlightRef.current = true;
    try {
      await runLivePipelineOnce();
    } catch (e) {
      setLiveStatus('error');
      setLiveError(formatError(e));
    } finally {
      liveInFlightRef.current = false;
    }
  };

  tick();
  liveTimerRef.current = window.setInterval(tick, intervalMs);

  return () => {
    stopLiveProcessing();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [liveModeEnabled, liveFps, livePipeline, status, minAreaRatio, morphKernel, filterBorderMargin, filterPadding, filterMinSolidity, filterMaxAspect, filterMaxPieces]);


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
    stopLiveProcessing();
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
          <canvas
            ref={overlayCanvasRef}
            className="cameraOverlay"
            aria-label="Overlay"
            onPointerDown={handleOverlayPointerDown}
          />
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
          <button className="btn" onClick={() => camera.captureFrame(stillCanvasRef.current)} disabled={status !== 'live'}>
            Capture frame
          </button>
          <button className="btn" onClick={() => void camera.backToLive()} disabled={status !== 'captured'}>
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