import { useEffect, useMemo, useReducer, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
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
import { CameraControlsCard, CameraIntroCard, CameraViewport, V1Controls } from '../components/camera';
import type { PieceClass } from '../lib/vision/scanModel';
import { v1SensitivityToParams, type V1Sensitivity } from '../lib/vision/v1Sensitivity';
import {
  cameraPageReducer,
  createInitialCameraPageState,
  type CameraPageState
} from './cameraPageReducer';

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
  classById?: Map<number, PieceClass>,
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

  const [state, dispatch] = useReducer(cameraPageReducer, undefined, () => createInitialCameraPageState(isTestEnv));

  const setStateKey = <K extends keyof CameraPageState>(key: K, value: CameraPageState[K]) => {
    dispatch({ type: 'set', key, value } as any);
  };

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
  const cannyLowRef = useRef<number>(state.cannyLow);
  const cannyHighRef = useRef<number>(state.cannyHigh);

  const {
    opencvStatus,
    opencvBuildInfoLine,
    opencvError,
    isProcessing,
    cannyLow,
    cannyHigh,
    minAreaRatio,
    morphKernel,
    segStatus,
    segError,
    segPieces,
    segDebug,
    segResult,
    frameQuality,
    extractStatus,
    extractError,
    extractDebug,
    classifyDebug,
    extractedPieces,
    selectedPieceId,
    overlaySource,
    overlayTapToSelect,
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
    overlayUseClassColors,
    liveModeEnabled,
    livePipeline,
    liveFps,
    liveStatus,
    liveInfo,
    liveError,
    useWorker,
    workerStatus,
    workerError,
    filterMinSolidity,
    filterMaxAspect,
    filterBorderMargin,
    filterPadding,
    filterMaxPieces
  } = state;

  const setOpenCvStatus = (v: CameraPageState['opencvStatus']) => setStateKey('opencvStatus', v);
  const setOpenCvBuildInfoLine = (v: string) => setStateKey('opencvBuildInfoLine', v);
  const setOpenCvError = (v: string) => setStateKey('opencvError', v);
  const setIsProcessing = (v: boolean) => setStateKey('isProcessing', v);
  const setCannyLow = (v: number) => setStateKey('cannyLow', v);
  const setCannyHigh = (v: number) => setStateKey('cannyHigh', v);

  const setMinAreaRatio = (v: number) => setStateKey('minAreaRatio', v);
  const setMorphKernel = (v: number) => setStateKey('morphKernel', v);
  const setSegStatus = (v: CameraPageState['segStatus']) => setStateKey('segStatus', v);
  const setSegError = (v: string) => setStateKey('segError', v);
  const setSegPieces = (v: PieceCandidate[]) => setStateKey('segPieces', v);
  const setSegDebug = (v: string) => setStateKey('segDebug', v);
  const setSegResult = (v: SegmentPiecesResult | null) => setStateKey('segResult', v);
  const setFrameQuality = (v: FrameQuality | null) => setStateKey('frameQuality', v);

  const setExtractStatus = (v: CameraPageState['extractStatus']) => setStateKey('extractStatus', v);
  const setExtractError = (v: string) => setStateKey('extractError', v);
  const setExtractDebug = (v: string) => setStateKey('extractDebug', v);
  const setClassifyDebug = (v: string) => setStateKey('classifyDebug', v);
  const setExtractedPieces = (v: ExtractedPiece[]) => setStateKey('extractedPieces', v);
  const setSelectedPieceId = (v: number | null) => setStateKey('selectedPieceId', v);

  const setOverlaySource = (v: CameraPageState['overlaySource']) => setStateKey('overlaySource', v);
  const setOverlayTapToSelect = (v: boolean) => setStateKey('overlayTapToSelect', v);
  const setOverlayShowGrid = (v: boolean) => setStateKey('overlayShowGrid', v);
  const setOverlayShowCrosshair = (v: boolean) => setStateKey('overlayShowCrosshair', v);
  const setOverlayShowStatusChip = (v: boolean) => setStateKey('overlayShowStatusChip', v);
  const setOverlayShowDebugText = (v: boolean) => setStateKey('overlayShowDebugText', v);
  const setOverlayShowContours = (v: boolean) => setStateKey('overlayShowContours', v);
  const setOverlayShowBBoxes = (v: boolean) => setStateKey('overlayShowBBoxes', v);
  const setOverlayShowLabels = (v: boolean) => setStateKey('overlayShowLabels', v);
  const setOverlayLabelMode = (v: CameraPageState['overlayLabelMode']) => setStateKey('overlayLabelMode', v);
  const setOverlayOpacity = (v: number) => setStateKey('overlayOpacity', v);
  const setOverlayLineWidth = (v: number) => setStateKey('overlayLineWidth', v);
  const setOverlayUseClassColors = (v: boolean) => setStateKey('overlayUseClassColors', v);

  const setLiveModeEnabled = (v: boolean) => setStateKey('liveModeEnabled', v);
  const setLivePipeline = (v: CameraPageState['livePipeline']) => setStateKey('livePipeline', v);
  const setLiveFps = (v: number) => setStateKey('liveFps', v);
  const setLiveStatus = (v: CameraPageState['liveStatus']) => setStateKey('liveStatus', v);
  const setLiveInfo = (v: string) => setStateKey('liveInfo', v);
  const setLiveError = (v: string) => setStateKey('liveError', v);

  const setUseWorker = (v: boolean) => setStateKey('useWorker', v);
  const setWorkerStatus = (v: CameraPageState['workerStatus']) => setStateKey('workerStatus', v);
  const setWorkerError = (v: string) => setStateKey('workerError', v);

  const setFilterMinSolidity = (v: number) => setStateKey('filterMinSolidity', v);
  const setFilterMaxAspect = (v: number) => setStateKey('filterMaxAspect', v);
  const setFilterBorderMargin = (v: number) => setStateKey('filterBorderMargin', v);
  const setFilterPadding = (v: number) => setStateKey('filterPadding', v);
  const setFilterMaxPieces = (v: number) => setStateKey('filterMaxPieces', v);

  // v1 UI state (UI-2)
  const isDebug = useMemo(() => {
    // Support both query-before-hash (e.g. ?debug=1#/) and query-inside-hash (e.g. #/?debug=1)
    // since HashRouter commonly uses the latter in local dev.
    try {
      const fromSearch = new URLSearchParams(window.location.search).get('debug');
      if (fromSearch) return fromSearch === '1';

      const hash = window.location.hash || '';
      const q = hash.indexOf('?');
      if (q >= 0) {
        const fromHash = new URLSearchParams(hash.slice(q + 1)).get('debug');
        return fromHash === '1';
      }
    } catch {
      // ignore
    }
    return false;
  }, []);
  const [v1ShowCorners, setV1ShowCorners] = useState(true);
  const [v1ShowEdges, setV1ShowEdges] = useState(true);
  const [v1ShowNonEdge, setV1ShowNonEdge] = useState(false);
  const [v1Sensitivity, setV1Sensitivity] = useState<V1Sensitivity>('medium');

  // Processing presets
  const LIVE_TARGET_WIDTH = 640;
  const CAPTURE_TARGET_WIDTH = 1024;

  // v1 mode should "just work" without requiring debug toggles.
  // We keep these settings user-configurable in debug mode, but in v1 mode
  // we enable near-real-time processing by default (only while in live camera mode).
  useEffect(() => {
    if (isDebug) return;
    // Enable live processing and run the full pipeline so the v1 toggles have effect.
    // In captured review mode we freeze results (single high-quality capture pass).
    setLiveModeEnabled(status === 'live');
    setLivePipeline('classify');
    // Prefer extracted/classified pieces for overlay.
    setOverlaySource('extracted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDebug, status]);


  const applyV1SensitivityPreset = (level: V1Sensitivity) => {
    // Single user-facing control → stable internal thresholds (pure + unit tested).
    const p = v1SensitivityToParams(level);
    setCannyLow(p.cannyLow);
    setCannyHigh(p.cannyHigh);
    setMinAreaRatio(p.minAreaRatio);
    setMorphKernel(p.morphKernelSize);
    setFilterMinSolidity(p.minSolidity);
    setFilterMaxAspect(p.maxAspectRatio);
  };

  useEffect(() => {
    applyV1SensitivityPreset(v1Sensitivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v1Sensitivity]);

  // Avoid a confusing "blank overlay" in v1 mode when classification finds only non-edge pieces.
  // If we have detections but none are classified as corner/edge, automatically enable Non-edge.
  useEffect(() => {
    if (isDebug) return;
    if (v1ShowNonEdge) return;
    if (status !== 'live' && status !== 'captured') return;
    if (!extractedPieces.length) return;
    const hasCorner = extractedPieces.some((p) => p.classification === 'corner');
    const hasEdge = extractedPieces.some((p) => p.classification === 'edge');
    if (!hasCorner && !hasEdge) {
      setV1ShowNonEdge(true);
    }
  }, [isDebug, v1ShowNonEdge, status, extractedPieces]);

  const classById = useMemo(() => {
    const m = new Map<number, PieceClass>();
    for (const p of extractedPieces) {
      if (p.classification) m.set(p.id, p.classification);
    }
    return m;
  }, [extractedPieces]);
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


useEffect(() => {
  cannyLowRef.current = cannyLow;
}, [cannyLow]);

useEffect(() => {
  cannyHighRef.current = cannyHigh;
}, [cannyHigh]);

const overlayPieces: PieceCandidate[] = useMemo(() => {
  const allowClass = (cls: PieceClass | undefined) => {
    if (!cls) return true;
    if (cls === 'corner') return v1ShowCorners;
    if (cls === 'edge') return v1ShowEdges;
    // nonEdge + unknown are treated as "Non-edge" in v1.
    return v1ShowNonEdge;
  };

  // In v1 mode, prefer extracted pieces (so we can filter by corner/edge) when available.
  const preferExtracted = !isDebug;
  if ((preferExtracted || overlaySource === 'extracted') && extractedPieces.length > 0) {
    const filtered = extractedPieces.filter((p) => allowClass(p.classification));
    return filtered.map((p) => ({
      id: p.id,
      areaPx: p.areaPxProcessed,
      bbox: p.bboxSource,
      contour: p.contourSource
    }));
  }

  // Fall back to segmented candidates if extraction isn't available yet.
  return segPieces;
}, [overlaySource, extractedPieces, segPieces, v1ShowCorners, v1ShowEdges, v1ShowNonEdge, isDebug]);

// In v1 UI mode we hide the "debuggy" overlay decorations like the grid/crosshair/chip.
const overlayOptions: OverlayOptions = useMemo(
  () => ({
    showGrid: isDebug ? overlayShowGrid : false,
    showCrosshair: isDebug ? overlayShowCrosshair : false,
    showStatusChip: isDebug ? overlayShowStatusChip : false,
    showDebugText: isDebug ? overlayShowDebugText : false,
    showContours: overlayShowContours,
    showBBoxes: overlayShowBBoxes,
    showLabels: overlayShowLabels,
    labelMode: overlayLabelMode,
    opacity: overlayOpacity,
    lineWidth: overlayLineWidth,
    useClassificationColors: overlayUseClassColors
  }),
  [
    isDebug,
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
  liveTargetWidth: LIVE_TARGET_WIDTH,
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
  cannyLow,
  cannyHigh,
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

const extractPiecesNowWithResult = async (): Promise<{ pieces: ExtractedPiece[]; seg: SegmentPiecesResult } | null> => {
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

    return { pieces, seg };
  } catch (err) {
    setExtractStatus('error');
    setExtractError(formatError(err));
    return null;
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

// Wrapper used by debug controls (CameraControlsCard) which expects Promise<void>
const extractPiecesNow = async (): Promise<void> => {
  await extractPiecesNowWithResult();
};

const classifyPiecesNowWithResult = async (piecesOverride?: ExtractedPiece[]): Promise<ExtractedPiece[] | null> => {
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

    setIsProcessing(true);

    const piecesToClassify = piecesOverride ?? extractedPieces;
    if (!piecesToClassify.length) throw new Error('Extract pieces first');

    const { pieces, debug } = classifyEdgeCornerMvp({
      cv,
      processedFrameCanvas: inputCanvas,
      pieces: piecesToClassify,
      options: {
        cannyLow,
        cannyHigh
      }
    });

    setExtractedPieces(pieces);
    setClassifyDebug(debug);
    return pieces;
  } catch (e) {
    setSegError(`Classification error: ${formatError(e)}`);
    return null;
  } finally {
    setIsProcessing(false);
  }
};

// Wrapper used by debug controls (CameraControlsCard) which expects Promise<void>
const classifyPiecesNow = async (): Promise<void> => {
  await classifyPiecesNowWithResult();
};



  
  const captureSeqRef = useRef(0);

  const runHighQualityCapturePass = async (): Promise<
    | { segCount: number; classifiedPieces: ExtractedPiece[] }
    | null
  > => {
    // Last-request-wins semantics for rapid repeated captures.
    captureSeqRef.current += 1;
    const mySeq = captureSeqRef.current;

    try {
      setSegError('');
      setSegDebug('');
      setExtractError('');
      setExtractDebug('');
      setClassifyDebug('');
      setSegStatus('running');
      setExtractStatus('idle');
      setIsProcessing(true);

      const still = stillCanvasRef.current;
      const inputCanvas = processingInputCanvasRef.current;
      const outputCanvas = processedCanvasRef.current;
      if (!still || !inputCanvas || !outputCanvas) throw new Error('Missing capture/processing canvases.');

      // Prefer worker for responsiveness.
      if (useWorker) {
        if (!workerClientRef.current) {
          workerClientRef.current = new VisionWorkerClient(appBasePath);
        }
        const initRes = workerStatus === 'ready' ? { ok: true } : await workerClientRef.current.init();
        if (!initRes.ok) throw new Error((initRes as any).error ?? 'Failed to init vision worker.');

        const ctx = safeGet2DContext(inputCanvas);
        if (!ctx) throw new Error('2D context not available.');

        const sourceW = still.width;
        const sourceH = still.height;
        if (!sourceW || !sourceH) throw new Error('Captured frame not ready.');

        const targetWidth = Math.min(CAPTURE_TARGET_WIDTH, sourceW);
        const scale = targetWidth / sourceW;
        const pw = Math.max(1, Math.round(sourceW * scale));
        const ph = Math.max(1, Math.round(sourceH * scale));

        inputCanvas.width = pw;
        inputCanvas.height = ph;
        ctx.drawImage(still, 0, 0, pw, ph);
        const img = ctx.getImageData(0, 0, pw, ph);

        const res = await workerClientRef.current.process({
          pipeline: 'classify',
          width: pw,
          height: ph,
          sourceWidth: sourceW,
          sourceHeight: sourceH,
          scaleToSource: sourceW / pw,
          buffer: img.data.buffer,
          segOptions: {
            minAreaRatio,
            blurKernelSize: 7,
            morphKernelSize: morphKernel
          },
          extractOptions: {
            borderMarginPx: filterBorderMargin,
            paddingPx: filterPadding,
            minSolidity: filterMinSolidity,
            maxAspectRatio: filterMaxAspect,
            maxPieces: filterMaxPieces
          },
          classifyOptions: {
            cannyLow,
            cannyHigh,
            uncertainMarginRatio: 0.10
          }
        } as any);

        // If a newer capture started while we were running, ignore this result.
        if (captureSeqRef.current !== mySeq) return null;

        const segCount = (res.segmentation?.pieces?.length ?? 0) as number;
        const classifiedPieces = (res.classified?.pieces ?? []) as ExtractedPiece[];

        setSegPieces((res.segmentation?.pieces ?? []) as any);
        setSegResult((res.segmentation as any) ?? null);
        setFrameQuality(((res.segmentation as any)?.quality ?? null) as any);
        setSegStatus('done');

        setExtractedPieces(classifiedPieces as any);
        setExtractStatus('done');
        setExtractDebug(res.extracted?.debug ?? '');
        setClassifyDebug(res.classified?.debug ?? '');

        // Clear preview canvas (worker does not render mask preview)
        safeGet2DContext(outputCanvas)?.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

        return { segCount, classifiedPieces };
      } else {
        const cv: OpenCvModule = await ensureOpenCvReady();

        const seg = segmentPiecesFromFrame({
          cv,
          source: still,
          inputCanvas,
          outputCanvas,
          options: {
            targetWidth: CAPTURE_TARGET_WIDTH,
            minAreaRatio,
            morphKernelSize: morphKernel
          }
        });

        if (captureSeqRef.current !== mySeq) return null;

        setSegPieces(seg.pieces);
        setSegResult(seg);
        setFrameQuality(seg.quality ?? null);
        setSegStatus('done');
        setSegDebug(
          [
            `Segmentation: ${seg.pieces.length} piece(s)`,
            `Contours: ${seg.debug.contoursFound}`,
            `Proc: ${seg.debug.processedWidth}×${seg.debug.processedHeight}${seg.debug.inverted ? ' (inverted)' : ''}`
          ].join('\n')
        );

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

        const classified = classifyEdgeCornerMvp({
          cv,
          processedFrameCanvas: inputCanvas,
          pieces,
          options: {
            cannyLow,
            cannyHigh
          }
        });

        if (captureSeqRef.current !== mySeq) return null;

        setExtractedPieces(classified.pieces);
        setExtractStatus('done');
        setExtractDebug(debug);
        setClassifyDebug(classified.debug);

        return { segCount: seg.pieces.length, classifiedPieces: classified.pieces };
      }
    } catch (e) {
      if (captureSeqRef.current === mySeq) {
        setSegStatus('error');
        setSegError(`Capture analysis error: ${formatError(e)}`);
      }
      return null;
    } finally {
      if (captureSeqRef.current === mySeq) {
        setIsProcessing(false);
      }
    }
  };

  const captureAndAnalyze = async () => {
    // v1: Freeze the frame and run a single high-quality pass.
    setOverlaySource('extracted');
    camera.captureFrame(stillCanvasRef.current);
    // Freeze live scanning while in captured review mode.
    setLiveModeEnabled(false);

    const res = await runHighQualityCapturePass();
    if (!res) return;

    // Auto-enable Non-edge if we found pieces but none classified as corner/edge.
    const hasCorner = res.classifiedPieces.some((p) => p.classification === 'corner');
    const hasEdge = res.classifiedPieces.some((p) => p.classification === 'edge');
    if (!hasCorner && !hasEdge && res.segCount > 0) {
      setV1ShowNonEdge(true);
    }
  };

  const rescanCaptured = async () => {
    if (status !== 'captured') return;
    // v1: Re-run the high quality pass on the already captured frame.
    setOverlaySource('extracted');
    setLiveModeEnabled(false);

    const res = await runHighQualityCapturePass();
    if (!res) return;

    // Auto-enable Non-edge if we found pieces but none classified as corner/edge.
    const hasCorner = res.classifiedPieces.some((p) => p.classification === 'corner');
    const hasEdge = res.classifiedPieces.some((p) => p.classification === 'edge');
    if (!hasCorner && !hasEdge && res.segCount > 0) {
      setV1ShowNonEdge(true);
    }
  };

  const stopCamera = () => {
    camera.stopCamera();
    setLiveModeEnabled(false);
    setSegPieces([]);
    setSegStatus('idle');
    setSegError('');
    setSegDebug('');
    setSegResult(null);
    setFrameQuality(null);
    setExtractedPieces([]);
    setExtractStatus('idle');
    setExtractError('');
    setExtractDebug('');
    setClassifyDebug('');
  };

  const qualityStatus = useMemo(() => frameQualityToStatus(frameQuality), [frameQuality]);
  const qualityGuidance = useMemo(
    () => guidanceFromFrameQuality(frameQuality, { piecesFound: segPieces.length, maxPieces: filterMaxPieces }),
    [frameQuality, segPieces.length, filterMaxPieces]
  );

  return (
    <>
      {/*
        Hidden processing canvases used by the OpenCV pipeline.
        These must exist even when the debug controls are hidden (v1 UI),
        otherwise capture/analyze will silently do nothing.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -10000,
          top: -10000,
          width: 1,
          height: 1,
          overflow: 'hidden'
        }}
      >
        <canvas ref={processingInputCanvasRef} />
        <canvas ref={processedCanvasRef} />
      </div>

      <CameraIntroCard />

      <CameraViewport
        videoRef={videoRef}
        stillCanvasRef={stillCanvasRef}
        overlayCanvasRef={overlayCanvasRef}
        status={status}
        errorMessage={errorMessage}
        onOverlayPointerDown={handleOverlayPointerDown}
      />

      <V1Controls
        status={status}
        streamInfo={streamInfo ?? ''}
        onStartCamera={() => void startCamera()}
        onStopCamera={stopCamera}
        onCaptureAndAnalyze={() => void captureAndAnalyze()}
        onBackToLive={() => void camera.backToLive()}
        onRescan={() => void rescanCaptured()}
        isProcessing={isProcessing}
        showCorners={v1ShowCorners}
        setShowCorners={setV1ShowCorners}
        showEdges={v1ShowEdges}
        setShowEdges={setV1ShowEdges}
        showNonEdge={v1ShowNonEdge}
        setShowNonEdge={setV1ShowNonEdge}
        sensitivity={v1Sensitivity}
        setSensitivity={setV1Sensitivity}
      />

      {isDebug && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Debug controls</summary>
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
        </details>
      )}
    </>
  );
}