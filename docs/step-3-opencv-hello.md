# Step 3 — OpenCV.js/WASM + “Hello OpenCV” frame processor

This step adds:

- **OpenCV.js/WASM** (lazy-loaded) via the `opencv-js-wasm` package.
- A minimal **“Hello OpenCV”** processor that shows a **live Canny edge preview**.
- A small **OpenCV panel** in the Camera page:
  - Start/stop processing
  - Adjust Canny thresholds (low/high)

## How it works (high level)

1. The user starts the camera (video stream).
2. When the user starts OpenCV processing:
   - OpenCV is loaded on-demand (keeps the initial bundle small).
   - Every ~120 ms a frame is drawn to a hidden input canvas.
   - OpenCV reads the canvas and runs:

      - RGBA → GRAY
      - Canny(gray)
      - GRAY → RGBA
      - Render result into the processed preview canvas

## How to try it

1. `npm install`
2. `npm run dev`
3. Open the **Camera** page
4. Click **Start camera**
5. Click **Start OpenCV processing**

You should see a live edge preview in the processed canvas.

## Notes

- This is intentionally a “hello world” pipeline. In later steps we will replace the edge preview with:
  - puzzle-piece segmentation
  - contour analysis
  - corner/edge classification
  - overlay highlights (boxes/markers) in the overlay canvas

## PWA caching note
- OpenCV bundles are **excluded from precache** (too large for Workbox default limits) and are cached on-demand via **runtime caching**.
