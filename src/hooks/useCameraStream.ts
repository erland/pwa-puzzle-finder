import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CameraStatus } from '../types/overlay';

export type SourceSize = { w: number; h: number };

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

export type UseCameraStreamResult = {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
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

      // Clear any old captured frame (if present)
      // We avoid resizing here; captureFrame will size to the frame.
      setStatus('live');
    } catch (err) {
      stopStream();
      setStatus('error');
      setErrorMessage(formatError(err));
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
      setErrorMessage(formatError(err));
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return { videoRef, status, errorMessage, streamInfo, sourceSize, startCamera, stopStream, stopCamera, captureFrame, backToLive };
}
