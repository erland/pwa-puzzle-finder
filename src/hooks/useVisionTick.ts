import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { CameraStatus } from '../types/overlay';
import type { OpenCvModule } from '../lib/opencv/loadOpenCV';
import { VisionWorkerClient, type VisionPipeline } from '../lib/vision/visionWorkerClient';
import { segmentPiecesFromFrame, type PieceCandidate, type SegmentPiecesResult } from '../lib/opencv/segmentPieces';
import { filterAndExtractPieces, type ExtractedPiece } from '../lib/opencv/extractPieces';
import { classifyEdgeCornerMvp } from '../lib/opencv/classifyPieces';
import type { FrameQuality } from '../lib/vision/quality';

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

export type LivePipelineMode = 'segment' | 'extract' | 'classify';

export interface UseVisionTickParams {
  enabled: boolean;
  liveFps: number;
  livePipeline: LivePipelineMode;
  /**
   * Downscale width used for live processing. Keep small to maintain responsiveness.
   * Capture/review can run a separate, higher-quality pass.
   */
  liveTargetWidth?: number;
  cameraStatus: CameraStatus;

  videoRef: RefObject<HTMLVideoElement>;
  stillCanvasRef: RefObject<HTMLCanvasElement | null>;
  processingInputCanvasRef: RefObject<HTMLCanvasElement | null>;
  processedCanvasRef: RefObject<HTMLCanvasElement | null>;

  // If Hello-OpenCV demo processing is active, live mode should stop it (matches previous behavior).
  processingTimerRef?: MutableRefObject<number | null>;
  stopHelloOpenCvProcessing?: () => void;

  // Worker offload
  useWorker: boolean;
  appBasePath: string;
  workerClientRef: MutableRefObject<VisionWorkerClient | null>;
  workerStatus: 'idle' | 'loading' | 'ready' | 'error';

  // Vision parameters
  minAreaRatio: number;
  morphKernel: number;
  cannyLow: number;
  cannyHigh: number;
  filterBorderMargin: number;
  filterPadding: number;
  filterMinSolidity: number;
  filterMaxAspect: number;
  filterMaxPieces: number;

  // OpenCV access (for main-thread path)
  ensureOpenCvReady: () => Promise<OpenCvModule>;

  // Live status outputs
  setLiveStatus: (v: 'idle' | 'running' | 'error') => void;
  setLiveInfo: (v: string) => void;
  setLiveError: (v: string) => void;

  // Segmentation outputs
  setSegStatus: (v: 'idle' | 'running' | 'done' | 'error') => void;
  setSegError: (v: string) => void;
  setSegPieces: (v: PieceCandidate[]) => void;
  setSegDebug: (v: string) => void;
  setSegResult: (v: SegmentPiecesResult | null) => void;
  setFrameQuality: (v: FrameQuality | null) => void;

  // Extraction + classification outputs
  setExtractStatus: (v: 'idle' | 'running' | 'done' | 'error') => void;
  setExtractError: (v: string) => void;
  setExtractDebug: (v: string) => void;
  setExtractedPieces: (v: ExtractedPiece[]) => void;
  setClassifyDebug: (v: string) => void;
}

/**
 * Near-real-time vision processing loop (Step 8).
 * Owns the interval + in-flight guard, and runs the selected pipeline once per tick.
 * Intended to be a behavior-preserving extraction of logic previously living in CameraPage.tsx.
 */
export function useVisionTick(params: UseVisionTickParams) {
  const {
    enabled,
    liveFps,
    livePipeline,
    liveTargetWidth,
    cameraStatus,
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
  } = params;

  const liveTimerRef = useRef<number | null>(null);
  const liveInFlightRef = useRef<boolean>(false);
  const liveTickCountRef = useRef<number>(0);

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

  useEffect(() => {
    if (!enabled) {
      stopLiveProcessing();
      return;
    }

    if (processingTimerRef?.current != null) {
      stopHelloOpenCvProcessing?.();
    }

    if (cameraStatus !== 'live' && cameraStatus !== 'captured') {
      return;
    }

    const intervalMs = Math.max(200, Math.round(1000 / Math.max(0.5, liveFps)));
    setLiveStatus('running');
    setLiveError('');

    const runLivePipelineOnce = async () => {
      const video = videoRef.current;
      const still = stillCanvasRef.current;
      const inputCanvas = processingInputCanvasRef.current;
      const outputCanvas = processedCanvasRef.current;

      if (!inputCanvas || !outputCanvas) throw new Error('Missing OpenCV canvases.');
      const source = cameraStatus === 'captured' ? still : video;
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

        const targetWidth = liveTargetWidth ?? 640;
        const scale = targetWidth / sourceW;
        const pw = Math.max(1, Math.round(sourceW * scale));
        const ph = Math.max(1, Math.round(sourceH * scale));

        inputCanvas.width = pw;
        inputCanvas.height = ph;
        ctx.drawImage(source as any, 0, 0, pw, ph);
        const img = ctx.getImageData(0, 0, pw, ph);

        const pipeline: VisionPipeline = livePipeline === 'segment' ? 'segment' : livePipeline === 'extract' ? 'extract' : 'classify';

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
          },
          classifyOptions: {
            cannyLow,
            cannyHigh,
            // Conservative unknown bucket when close to the minimum edge threshold.
            uncertainMarginRatio: 0.10
          }
        } as any);

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
          setSegDebug('');
        }
        setSegStatus('done');
        setSegError('');

        if (pipeline === 'segment') {
          setExtractedPieces([]);
          setExtractStatus('idle');
          setExtractError('');
          setExtractDebug('');
          setClassifyDebug('');
        }

        if (pipeline === 'extract') {
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

      // Main-thread path: use OpenCV directly.
      const cv: OpenCvModule = await ensureOpenCvReady();
      const t0 = performance.now();

      setSegStatus('running');
      setSegError('');
      setSegDebug('');

        const seg = segmentPiecesFromFrame({
        cv,
        source: source as any,
        inputCanvas,
        outputCanvas,
        options: {
            targetWidth: liveTargetWidth ?? 640,
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
        setExtractDebug(`Extracted: ${pieces.length}\n${debug}`);

        if (livePipeline === 'classify') {
          const classified = classifyEdgeCornerMvp({
            cv,
            processedFrameCanvas: inputCanvas,
            pieces,
            options: {
              cannyLow,
              cannyHigh
            }
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

    const tick = async () => {
      if (liveInFlightRef.current) return;
      if (!enabled) return;
      if (document.hidden) return;
      if (cameraStatus !== 'live' && cameraStatus !== 'captured') return;

      const v = videoRef.current;
      if (cameraStatus === 'live' && (!v || (v.videoWidth || 0) === 0)) return;

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
  }, [
    enabled,
    liveFps,
    livePipeline,
    liveTargetWidth,
    cameraStatus,
    useWorker,
    appBasePath,
    workerStatus,
    minAreaRatio,
    morphKernel,
    cannyLow,
    cannyHigh,
    filterBorderMargin,
    filterPadding,
    filterMinSolidity,
    filterMaxAspect,
    filterMaxPieces
  ]);
}
