import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type PointerEventHandler,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import type { CameraStatus } from '../../types/overlay';

export type CameraViewportProps = {
  videoRef: RefObject<HTMLVideoElement>;
  stillCanvasRef: RefObject<HTMLCanvasElement>;
  overlayCanvasRef: RefObject<HTMLCanvasElement>;
  status: CameraStatus;
  errorMessage: string;
  onOverlayPointerDown: PointerEventHandler<HTMLCanvasElement>;
};

type Transform = { scale: number; tx: number; ty: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function clampTransform(t: Transform, w: number, h: number): Transform {
  const s = clamp(t.scale, 1, 5);
  if (s <= 1.0001) return { scale: 1, tx: 0, ty: 0 };
  // Keep content at least covering the viewport.
  const minTx = w * (1 - s);
  const minTy = h * (1 - s);
  return {
    scale: s,
    tx: clamp(t.tx, minTx, 0),
    ty: clamp(t.ty, minTy, 0)
  };
}

function viewportToContentPoint(x: number, y: number, t: Transform) {
  return { cx: (x - t.tx) / t.scale, cy: (y - t.ty) / t.scale };
}

export function CameraViewport(props: CameraViewportProps) {
  const { videoRef, stillCanvasRef, overlayCanvasRef, status, errorMessage, onOverlayPointerDown } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<
    | {
        id1: number;
        id2: number;
        dist0: number;
        centerX: number;
        centerY: number;
        contentX: number;
        contentY: number;
        scale0: number;
      }
    | null
  >(null);

  const isReview = status === 'captured';

  // Reset transform when leaving review mode.
  useEffect(() => {
    if (!isReview) {
      setTransform({ scale: 1, tx: 0, ty: 0 });
      pointersRef.current.clear();
      panRef.current = null;
      pinchRef.current = null;
    }
  }, [isReview]);

  const getViewportSize = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, []);

  const applyTransform = useCallback(
    (next: Transform) => {
      const { w, h } = getViewportSize();
      if (w <= 0 || h <= 0) {
        setTransform(next);
        return;
      }
      setTransform(clampTransform(next, w, h));
    },
    [getViewportSize]
  );

  const zoomAround = useCallback(
    (vx: number, vy: number, nextScale: number) => {
      setTransform((prev) => {
        const { w, h } = getViewportSize();
        const clampedScale = clamp(nextScale, 1, 5);
        if (w <= 0 || h <= 0) return { scale: clampedScale, tx: prev.tx, ty: prev.ty };
        const { cx, cy } = viewportToContentPoint(vx, vy, prev);
        const next: Transform = {
          scale: clampedScale,
          tx: vx - cx * clampedScale,
          ty: vy - cy * clampedScale
        };
        return clampTransform(next, w, h);
      });
    },
    [getViewportSize]
  );

  const onStillPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isReview) return;
      const el = viewportRef.current;
      if (!el) return;

      // Use pointer capture so pan/zoom works even if pointer leaves the canvas.
      try {
        (e.currentTarget as any).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const points = Array.from(pointersRef.current.entries());
      if (points.length === 1) {
        panRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        pinchRef.current = null;
      } else if (points.length >= 2) {
        const [p1, p2] = points;
        const dx = p2[1].x - p1[1].x;
        const dy = p2[1].y - p1[1].y;
        const dist0 = Math.hypot(dx, dy) || 1;
        const centerX = (p1[1].x + p2[1].x) / 2;
        const centerY = (p1[1].y + p2[1].y) / 2;
        const rect = el.getBoundingClientRect();
        const vx = centerX - rect.left;
        const vy = centerY - rect.top;
        const { cx, cy } = viewportToContentPoint(vx, vy, transform);
        pinchRef.current = {
          id1: p1[0],
          id2: p2[0],
          dist0,
          centerX: vx,
          centerY: vy,
          contentX: cx,
          contentY: cy,
          scale0: transform.scale
        };
        panRef.current = null;
      }
    },
    [isReview, transform, viewportToContentPoint]
  );

  const onStillPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isReview) return;
      const el = viewportRef.current;
      if (!el) return;

      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const points = Array.from(pointersRef.current.entries());
      if (points.length >= 2 && pinchRef.current) {
        const p1 = pointersRef.current.get(pinchRef.current.id1);
        const p2 = pointersRef.current.get(pinchRef.current.id2);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = dist / pinchRef.current.dist0;
        const nextScale = pinchRef.current.scale0 * ratio;

        const { w, h } = getViewportSize();
        if (w <= 0 || h <= 0) return;

        const clampedScale = clamp(nextScale, 1, 5);
        const next: Transform = {
          scale: clampedScale,
          tx: pinchRef.current.centerX - pinchRef.current.contentX * clampedScale,
          ty: pinchRef.current.centerY - pinchRef.current.contentY * clampedScale
        };
        setTransform(clampTransform(next, w, h));
        return;
      }

      if (panRef.current && panRef.current.id === e.pointerId) {
        const dx = e.clientX - panRef.current.lastX;
        const dy = e.clientY - panRef.current.lastY;
        panRef.current.lastX = e.clientX;
        panRef.current.lastY = e.clientY;
        applyTransform({ ...transform, tx: transform.tx + dx, ty: transform.ty + dy });
      }
    },
    [applyTransform, getViewportSize, isReview, transform]
  );

  const onStillPointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isReview) return;
    pointersRef.current.delete(e.pointerId);
    if (panRef.current?.id === e.pointerId) panRef.current = null;
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }, [isReview]);

  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!isReview) return;
      // Prevent page scrolling while zooming.
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.08 : 1 / 1.08;
      zoomAround(vx, vy, transform.scale * factor);
    },
    [isReview, transform.scale, zoomAround]
  );

  const onDoubleClick = useCallback(() => {
    if (!isReview) return;
    setTransform({ scale: 1, tx: 0, ty: 0 });
  }, [isReview]);

  const transformStyle = useMemo(() => {
    if (!isReview) return undefined;
    return {
      transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
      transformOrigin: '0 0'
    } as const;
  }, [isReview, transform.scale, transform.tx, transform.ty]);

  return (
      <div className="cameraStage card">
        <div
          ref={viewportRef}
          className={isReview ? 'cameraViewport cameraReview' : 'cameraViewport'}
          aria-label="Camera viewport"
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
        >
          <div className="cameraTransform" style={transformStyle}>
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
              onPointerDown={onStillPointerDown}
              onPointerMove={onStillPointerMove}
              onPointerUp={onStillPointerUp}
              onPointerCancel={onStillPointerUp}
            />
            <canvas
              ref={overlayCanvasRef}
              className="cameraOverlay"
              aria-label="Overlay"
              onPointerDown={onOverlayPointerDown}
            />
          </div>
        </div>

        {status === 'error' && (
          <div className="cameraError" role="alert">
            <strong>Camera error:</strong> {errorMessage}
          </div>
        )}
      </div>
  );
}
