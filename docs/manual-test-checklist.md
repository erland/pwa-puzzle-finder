# Manual test checklist

Use this list whenever changing camera/OpenCV/worker behavior.

## Setup

- Run `npm run build` and `npm run preview`.
- Open the camera route:
  - `http://localhost:4173/pwa-puzzle-finder/#/camera`

Tip: open DevTools → **Network** and enable “Disable cache” while debugging.

## Camera basic

1. Click **Start camera**.
   - Expected: permission prompt (first time), video starts.
   - UI status should become **live**.
2. Click **Capture frame**.
   - Expected: freezes to captured frame, overlay still visible.
3. Click **Back to live**.
   - Expected: video resumes.
4. Click **Stop camera**.
   - Expected: video stops, UI returns to idle.

## OpenCV processing (main thread)

1. Start camera.
2. Click **Start OpenCV processing**.
   - Expected: OpenCV status becomes **running**.
   - Processed preview updates.
3. Adjust **Canny low/high**.
   - Expected: processed preview changes.

## Segmentation + extraction

1. Start camera.
2. Click **Segment pieces**.
   - Expected: candidates appear (contours and/or labels).
3. Click **Extract pieces**.
   - Expected: fewer but more accurate pieces; selection works.

## Near-real-time mode

1. Start camera.
2. Enable **live processing** (without worker).
   - Expected: overlay updates at selected fps.
   - No “live error” message.
3. Increase fps to 2–3.
   - Expected: UI remains responsive.

## Worker mode

1. Start camera.
2. Enable **Use worker**.
   - Expected: Worker status transitions **loading → ready**.
3. Enable **live processing**.
   - Expected: overlay updates similar to non-worker mode.
   - No “OpenCV load timeout (cv not available)”.

If worker shows ready but overlay never updates:

- In DevTools → **Network**, verify `workers/vision-worker.js` loads (200/304).
- Verify `vendor/opencv/opencv.js` loads.
- In DevTools → **Application**, unregister service worker (during debugging) and reload.

## Quality guidance

With live processing enabled:

- Move the camera to create **motion blur**.
  - Expected: guidance suggests stabilizing / lowering fps.
- Point the camera at a mostly empty background.
  - Expected: guidance notes low foreground.
- Fill the view with pieces.
  - Expected: guidance becomes more positive and indicates pieces found.

## Error states

- Deny camera permission.
  - Expected: clear error message and recovery hint.
- Start live processing without starting camera.
  - Expected: message tells you to start camera first.

