import type { RefObject, PointerEventHandler } from 'react';
import type { CameraStatus } from '../../types/overlay';

export type CameraViewportProps = {
  videoRef: RefObject<HTMLVideoElement>;
  stillCanvasRef: RefObject<HTMLCanvasElement>;
  overlayCanvasRef: RefObject<HTMLCanvasElement>;
  status: CameraStatus;
  errorMessage: string;
  onOverlayPointerDown: PointerEventHandler<HTMLCanvasElement>;
};

export function CameraViewport(props: CameraViewportProps) {
  const { videoRef, stillCanvasRef, overlayCanvasRef, status, errorMessage, onOverlayPointerDown } = props;

  return (
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
            onPointerDown={onOverlayPointerDown}
          />
        </div>

        {status === 'error' && (
          <div className="cameraError" role="alert">
            <strong>Camera error:</strong> {errorMessage}
          </div>
        )}
      </div>
  );
}
