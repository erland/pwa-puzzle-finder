import type { ExtractedPiece } from '../lib/opencv/extractPieces';
import type { PieceCandidate, SegmentPiecesResult } from '../lib/opencv/segmentPieces';
import type { FrameQuality } from '../lib/vision/quality';

export type OpenCvStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SegStatus = 'idle' | 'running' | 'done' | 'error';
export type ExtractStatus = 'idle' | 'running' | 'done' | 'error';
export type LivePipeline = 'segment' | 'extract' | 'classify';
export type LiveStatus = 'idle' | 'running' | 'error';
export type WorkerStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CameraPageState = {
  // OpenCV
  opencvStatus: OpenCvStatus;
  opencvBuildInfoLine: string;
  opencvError: string;
  isProcessing: boolean;
  cannyLow: number;
  cannyHigh: number;

  // Segmentation
  minAreaRatio: number;
  morphKernel: number;
  segStatus: SegStatus;
  segError: string;
  segPieces: PieceCandidate[];
  segDebug: string;
  segResult: SegmentPiecesResult | null;
  frameQuality: FrameQuality | null;

  // Extraction + classification
  extractStatus: ExtractStatus;
  extractError: string;
  extractDebug: string;
  classifyDebug: string;
  extractedPieces: ExtractedPiece[];
  selectedPieceId: number | null;

  // Overlay settings
  overlaySource: 'segmented' | 'extracted';
  overlayTapToSelect: boolean;
  overlayShowGrid: boolean;
  overlayShowCrosshair: boolean;
  overlayShowStatusChip: boolean;
  overlayShowDebugText: boolean;
  overlayShowContours: boolean;
  overlayShowBBoxes: boolean;
  overlayShowLabels: boolean;
  overlayLabelMode: 'id' | 'id+class' | 'class';
  overlayOpacity: number;
  overlayLineWidth: number;
  overlayUseClassColors: boolean;

  // Near-real-time mode
  liveModeEnabled: boolean;
  livePipeline: LivePipeline;
  liveFps: number;
  liveStatus: LiveStatus;
  liveInfo: string;
  liveError: string;

  // Worker offload
  useWorker: boolean;
  workerStatus: WorkerStatus;
  workerError: string;

  // Extraction filters
  filterMinSolidity: number;
  filterMaxAspect: number;
  filterBorderMargin: number;
  filterPadding: number;
  filterMaxPieces: number;
};

export type CameraPageAction =
  | { type: 'set'; key: keyof CameraPageState; value: CameraPageState[keyof CameraPageState] }
  | { type: 'patch'; patch: Partial<CameraPageState> }
  | { type: 'resetSegmentation' }
  | { type: 'resetExtraction' };

export function createInitialCameraPageState(isTestEnv: boolean): CameraPageState {
  return {
    // OpenCV
    opencvStatus: 'idle',
    opencvBuildInfoLine: '',
    opencvError: '',
    isProcessing: false,
    cannyLow: 60,
    cannyHigh: 120,

    // Segmentation
    minAreaRatio: 0.0015,
    morphKernel: 5,
    segStatus: 'idle',
    segError: '',
    segPieces: [],
    segDebug: '',
    segResult: null,
    frameQuality: null,

    // Extraction + classification
    extractStatus: 'idle',
    extractError: '',
    extractDebug: '',
    classifyDebug: '',
    extractedPieces: [],
    selectedPieceId: null,

    // Overlay settings
    overlaySource: 'segmented',
    overlayTapToSelect: true,
    overlayShowGrid: true,
    overlayShowCrosshair: false,
    overlayShowStatusChip: true,
    overlayShowDebugText: false,
    overlayShowContours: true,
    overlayShowBBoxes: false,
    overlayShowLabels: true,
    overlayLabelMode: 'id+class',
    overlayOpacity: 0.9,
    overlayLineWidth: 2,
    overlayUseClassColors: true,

    // Near-real-time mode
    liveModeEnabled: false,
    livePipeline: 'segment',
    liveFps: 2,
    liveStatus: 'idle',
    liveInfo: '',
    liveError: '',

    // Worker offload
    useWorker: !isTestEnv,
    workerStatus: 'idle',
    workerError: '',

    // Extraction filters
    filterMinSolidity: 0.8,
    filterMaxAspect: 4.0,
    filterBorderMargin: 6,
    filterPadding: 6,
    filterMaxPieces: 80
  };
}

export function cameraPageReducer(state: CameraPageState, action: CameraPageAction): CameraPageState {
  switch (action.type) {
    case 'set': {
      // Note: `value` is intentionally wide-typed; callers are responsible for correct pairing.
      return { ...state, [action.key]: action.value } as CameraPageState;
    }
    case 'patch':
      return { ...state, ...action.patch };
    case 'resetSegmentation':
      return {
        ...state,
        segPieces: [],
        segResult: null,
        segStatus: 'idle',
        segError: '',
        segDebug: '',
        frameQuality: null,
        // Reset extraction as well so the UI stays consistent.
        extractStatus: 'idle',
        extractError: '',
        extractDebug: '',
        classifyDebug: '',
        extractedPieces: [],
        selectedPieceId: null
      };
    case 'resetExtraction':
      return {
        ...state,
        extractStatus: 'idle',
        extractError: '',
        extractDebug: '',
        classifyDebug: '',
        extractedPieces: [],
        selectedPieceId: null
      };
    default:
      return state;
  }
}
