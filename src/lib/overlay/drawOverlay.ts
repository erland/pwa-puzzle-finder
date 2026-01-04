import type { PieceCandidate } from '../opencv/segmentPieces';
import type { CameraStatus, OverlayOptions } from '../../types/overlay';
import { computeFitTransform } from './coordinates';
import type { PieceClass } from '../vision/scanModel';

export type DrawOverlayInput = {
  width: number;
  height: number;
  status: CameraStatus;
  debugText?: string;
  pieces?: PieceCandidate[];
  sourceSize?: { w: number; h: number };
  selectedPieceId?: number | null;
  classById?: Map<number, PieceClass>;
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

    // Make strokes and labels readable on both light/dark backgrounds.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const alpha = Math.max(0, Math.min(1, opts.opacity));

    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

    const roundedRect = (x: number, y: number, rw: number, rh: number, r: number) => {
      const rr = Math.max(0, Math.min(r, Math.min(rw, rh) / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + rw - rr, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + rr);
      ctx.lineTo(x + rw, y + rh - rr);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rr, y + rh);
      ctx.lineTo(x + rr, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    };

    const drawLabel = (x: number, y: number, text: string) => {
      const tw = ctx.measureText(text).width;
      const bw = tw + 14;
      const bh = 18;
      const px = Math.max(6, Math.min(w - (bw + 6), x));
      const py = Math.max(6, Math.min(h - (bh + 6), y));

      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha + 0.1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      roundedRect(px, py, bw, bh, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Text with subtle outline
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(text, px + 7, py + 13);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, px + 7, py + 13);
      ctx.restore();
    };

    const classToLabel = (cls: PieceClass | undefined) => {
      if (!cls) return undefined;
      if (cls === 'corner') return 'Corner';
      if (cls === 'edge') return 'Edge';
      if (cls === 'unknown') return 'Unknown';
      return 'Non-edge';
    };

    for (const p of pieces) {
      const isSelected = selectedPieceId != null && p.id === selectedPieceId;
      const cls = classById?.get(p.id);

      const baseColor = opts.useClassificationColors
        ? cls === 'corner'
          ? '#ff5566'
          : cls === 'edge'
            ? '#33aaff'
            : cls === 'unknown'
              ? '#cccccc'
              : '#00ff66'
        : '#00ff66';

      const strokeColor = isSelected ? '#ffcc00' : baseColor;
      const lw = isSelected ? Math.max(3, opts.lineWidth + 1) : Math.max(2, opts.lineWidth);
      const haloW = lw + 3;

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

        // Halo + main stroke
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha + 0.15);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = haloW;
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
      }

      // BBox
      if (opts.showBBoxes) {
        const bx = p.bbox.x * scale + offX;
        const by = p.bbox.y * scale + offY;
        const bw = p.bbox.width * scale;
        const bh = p.bbox.height * scale;

        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha + 0.15);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = haloW;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lw;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
      }

      // Marker at bbox center for corner/edge (helps quick scanning)
      if (cls === 'corner' || cls === 'edge' || cls === 'unknown') {
        const cx = (p.bbox.x + p.bbox.width / 2) * scale + offX;
        const cy = (p.bbox.y + p.bbox.height / 2) * scale + offY;
        const r = 5;
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha + 0.1);
        ctx.fillStyle = strokeColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        if (cls === 'corner') {
          // small square
          ctx.beginPath();
          ctx.rect(cx - r, cy - r, r * 2, r * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // small circle for edge/unknown
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Label (near bbox top-left)
      if (opts.showLabels) {
        const lx = p.bbox.x * scale + offX;
        const ly = p.bbox.y * scale + offY;

        const clsLabel = classToLabel(cls);
        const label =
          opts.labelMode === 'id'
            ? `#${p.id}`
            : opts.labelMode === 'class'
              ? cls === 'nonEdge'
                ? undefined
                : clsLabel
              : clsLabel
                ? `#${p.id} ${clsLabel}`
                : `#${p.id}`;

        if (label) drawLabel(lx, ly - 22, label);
      }
    }

    ctx.globalAlpha = 1;
  }
}
