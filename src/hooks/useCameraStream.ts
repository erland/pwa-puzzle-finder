import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CameraStatus } from '../types/overlay';

export type SourceSize = { w: number; h: number };

export type CameraErrorKind =
  | 'none'
  | 'permission_denied'
  | 'not_supported'
  | 'no_camera'
  | 'in_use'
  | 'constraints'
  | 'unknown';

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

function classifyGetUserMediaError(err: unknown): { kind: CameraErrorKind; message: string } {
  // DOMException.name is the most reliable signal across browsers.
  const anyErr = err as any;
  const name: string | undefined = anyErr?.name;
  const msg = formatError(err);

  const lowerName = (name ?? '').toLowerCase();

  if (lowerName.includes('notallowed') || lowerName.includes('security')) {
    return {
      kind: 'permission_denied',
      message:
        'Camera permission was denied. Please allow camera access for this site in your browser settings, then try again.'
    };
  }

  if (lowerName.includes('notfound') || lowerName.includes('devicesnotfound')) {
    return {
      kind: 'no_camera',
      message: 'No camera was found on this device.'
    };
  }

  if (lowerName.includes('notreadable') || lowerName.includes('trackstarterror')) {
    return {
      kind: 'in_use',
      message: 'The camera could not be started (it may already be in use by another app). Close other apps and try again.'
    };
  }

  if (lowerName.includes('overconstrained') || lowerName.includes('constraintnotsatisfied')) {
    return {
      kind: 'constraints',
      message: 'The camera could not satisfy the requested constraints. Try a different camera or lower resolution.'
    };
  }

  // Fallback: if the message strongly hints permission denial.
  if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')) {
    return { kind: 'permission_denied', message: msg };
  }

  return { kind: 'unknown', message: msg };
}

function safeGet2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    // jsdom does not implement canvas; treat as unavailable in tests.
    return null;
  }
}

export type UseCameraStreamResult = {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  errorKind: CameraErrorKind;
  errorMessage: string;
  streamInfo: string;
  sourceSize: SourceSize;
  startCamera: () => Promise<void>;
  stopStream: () => void;
  stopCamera: () => void;
  captureFrame: (stillCanvas: HTMLCanvasElement | null) => void;
  backToLive: () => Promise<void>;
};

export function useCameraStream(): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorKind, setErrorKind] = useState<CameraErrorKind>('none');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [streamInfo, setStreamInfo] = useState<string>('');
  const [sourceSize, setSourceSize] = useState<SourceSize>({ w: 0, h: 0 });

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
    }
    streamRef.current = null;

    const v = videoRef.current as any;
    if (v) v.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    const mediaDevices = getMediaDevices();
    setErrorMessage('');
    setErrorKind('none');

    if (!mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorKind('not_supported');
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

      // Clear any old captured frame (if present)
      // We avoid resizing here; captureFrame will size to the frame.
      setStatus('live');
    } catch (err) {
      stopStream();
      const info = classifyGetUserMediaError(err);
      setStatus('error');
      setErrorKind(info.kind);
      setErrorMessage(info.message);
    }
  }, [stopStream]);

  const stopCamera = useCallback(() => {
    stopStream();
    setStreamInfo('');
    setStatus('idle');
    // Preserve previous error message behavior (only cleared on start).
  }, [stopStream]);

  const captureFrame = useCallback((stillCanvas: HTMLCanvasElement | null) => {
    const v = videoRef.current;
    const still = stillCanvas;
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
  }, []);

  const backToLive = useCallback(async () => {
    const v = videoRef.current as any;
    if (!v) return;
    try {
      await v.play();
      setStatus('live');
    } catch (err) {
      setStatus('error');
      setErrorKind('unknown');
      setErrorMessage(formatError(err));
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return { videoRef, status, errorKind, errorMessage, streamInfo, sourceSize, startCamera, stopStream, stopCamera, captureFrame, backToLive };
}
