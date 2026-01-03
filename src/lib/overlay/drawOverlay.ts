import type { PieceCandidate } from '../opencv/segmentPieces';
import type { CameraStatus, OverlayOptions } from '../../types/overlay';
import { computeFitTransform } from './coordinates';

export type PieceClassification = 'corner' | 'edge' | 'interior';

export type DrawOverlayInput = {
  width: number;
  height: number;
  status: CameraStatus;
  debugText?: string;
  pieces?: PieceCandidate[];
  sourceSize?: { w: number; h: number };
  selectedPieceId?: number | null;
  classById?: Map<number, PieceClassification>;
  options: OverlayOptions;
};

export function drawOverlay(ctx: CanvasRenderingContext2D, input: DrawOverlayInput) {
  const {
    width: w,
    height: h,
    status,
    debugText,
    pieces,
    sourceSize,
    selectedPieceId,
    classById,
    options: opts
  } = input;

  ctx.clearRect(0, 0, w, h);
  
        let statusBoxH = 0;
  
        if (opts.showGrid) {
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
        }
  
        if (opts.showCrosshair) {
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
        }
  
        if (opts.showStatusChip) {
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
        statusBoxH = boxH;
        ctx.fillRect(12, 12, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, 12 + padX, 12 + padY + 14 - 2);
  
        // Optional debug text
        }
  
        if (opts.showDebugText && debugText) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
          const lines = debugText.split('\n');
          const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
          const bh = lines.length * 16 + 10;
          ctx.fillRect(12, 12 + statusBoxH + 10, Math.ceil(maxW) + 16, bh);
          ctx.fillStyle = '#ffffff';
          lines.forEach((l, i) => {
            ctx.fillText(l, 20, 12 + statusBoxH + 10 + 18 + i * 16);
          });
        }
  
  // Draw piece contours, mapped from source frame to viewport coordinates.
  if (opts.showContours && pieces && pieces.length > 0 && sourceSize && sourceSize.w > 0 && sourceSize.h > 0) {
    const { scale, offX, offY } = computeFitTransform(w, h, sourceSize.w, sourceSize.h);
  
    ctx.globalAlpha = Math.max(0, Math.min(1, opts.opacity));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  
    const drawLabel = (x: number, y: number, text: string) => {
      const tw = ctx.measureText(text).width;
      const px = Math.max(0, Math.min(w - (tw + 12), x));
      const py = Math.max(0, Math.min(h - 16, y));
      ctx.fillRect(px, py, tw + 12, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, px + 6, py + 12);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    };
  
    for (const p of pieces) {
      const isSelected = selectedPieceId != null && p.id === selectedPieceId;
      const cls = classById?.get(p.id);
  
      const baseColor = opts.useClassificationColors
        ? cls === 'corner'
          ? '#ff5566'
          : cls === 'edge'
            ? '#33aaff'
            : '#00ff66'
        : '#00ff66';
  
      ctx.strokeStyle = isSelected ? '#ffcc00' : baseColor;
      ctx.lineWidth = isSelected ? Math.max(3, opts.lineWidth + 1) : opts.lineWidth;
  
      // Contour
      if (p.contour && p.contour.length > 0) {
        ctx.beginPath();
        const p0 = p.contour[0];
        ctx.moveTo(p0.x * scale + offX, p0.y * scale + offY);
        for (let k = 1; k < p.contour.length; k++) {
          const pk = p.contour[k];
          ctx.lineTo(pk.x * scale + offX, pk.y * scale + offY);
        }
        ctx.closePath();
        ctx.stroke();
      }
  
      // BBox
      if (opts.showBBoxes) {
        const bx = p.bbox.x * scale + offX;
        const by = p.bbox.y * scale + offY;
        const bw = p.bbox.width * scale;
        const bh = p.bbox.height * scale;
        ctx.strokeRect(bx, by, bw, bh);
      }
  
      // Label (near bbox top-left)
      if (opts.showLabels) {
        const lx = p.bbox.x * scale + offX;
        const ly = p.bbox.y * scale + offY;
        const clsText = cls ? cls.toUpperCase() : '—';
        const label = opts.labelMode === 'id' ? `#${p.id}` : `#${p.id}  ${clsText}`;
        drawLabel(lx, ly - 18, label);
      }
    }
  
    ctx.globalAlpha = 1;
}
}
