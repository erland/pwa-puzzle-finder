# Puzzle Finder — Development Plan (v1 MVP, PWA)

> Status: Step 1–4 are implemented in the repository scaffold.


This plan describes how I (as an LLM) would implement **Puzzle Finder** step-by-step as a **PWA** using **video + canvas overlay** and **OpenCV.js/WASM**.  
Each step is designed to be implementable in one sweep and **testable** before moving on.

---

## 0. Guiding principles
- **MVP first:** reliable corner/edge highlighting under good conditions (flat surface, non-overlapping pieces, decent lighting, preferably plain background).
- **Fail safe:** when uncertain, classify as *Unknown* rather than a false edge/corner.
- **Performance-aware:** analyze fewer frames per second; keep UI responsive; prefer background processing when needed.
- **Testability:** core algorithms are unit-testable with static images/fixtures and deterministic outputs.

---

## 1) Project scaffold + PWA baseline
### Deliverables
- Repository scaffold with:
  - App shell (single-page)
  - PWA manifest + icons placeholders
  - Basic routing (optional)
  - Minimal styling system (simple)
- “About/Help” screen with usage guidance (plain background, spacing, lighting).

### Acceptance checks
- App loads on desktop and mobile.
- “Install” prompt works where supported.
- Lighthouse PWA checks are mostly green (excluding camera permission prompts).

---

## 2) Camera pipeline (video) + canvas overlay (no OpenCV yet)
### Implementation outline
- Create a **CameraView** screen that:
  - Requests camera permission.
  - Shows live `<video>` element.
  - Places a same-size `<canvas>` absolutely on top (overlay).
- Add controls:
  - Start/Stop camera
  - Capture frame (freeze)
  - Back to live
- Overlay demo:
  - Draw a static crosshair/grid
  - Show FPS/debug text (optional)

### Acceptance checks
- Live video appears on iPhone/Android/desktop.
- Canvas overlay aligns perfectly with the video across orientation changes.
- Capture freezes the frame and keeps overlay in sync.

---

## 3) Add OpenCV.js/WASM and a “Hello OpenCV” frame processor
### Implementation outline
- Load OpenCV.js/WASM and expose a readiness state:
  - “Loading computer vision engine…” placeholder
- Implement a **single-frame processor**:
  - Read pixels from the video (or captured frame) into an ImageData
  - Convert to OpenCV Mat
  - Perform a simple transform (e.g., grayscale + Canny edges)
  - Render the processed output to a debug canvas (optional)

### Acceptance checks
- OpenCV loads reliably on:
  - Desktop Chrome
  - iOS Safari
- Pressing “Analyze” produces an edge-detected preview for a captured frame.
- No memory growth when analyzing repeatedly (basic leak check).

---

## 4) Piece segmentation (separate pieces from background)
> Goal: build a robust-enough segmentation for MVP conditions (plain/contrasting background).

### Implementation outline (captured-frame first)
- Input: captured frame image.
- Steps (tunable parameters):
  1. Downscale to a working resolution (e.g., 720p or less).
  2. Convert to HSV (or grayscale depending on results).
  3. Apply blur to reduce noise.
  4. Create a binary mask of “likely piece pixels”:
     - thresholding strategy (initially simple; add adaptive option)
  5. Morphological cleanup:
     - open/close to remove small holes/noise
  6. Find connected components / contours.

- Add a debug mode to show:
  - original, mask, contours overlay
  - parameter values

### Acceptance checks
- On a plain background with separated pieces, the mask highlights pieces well.
- Contours are detected for most pieces without merging too many into one blob.
- Debug visuals help understand failures.

---

## 5) Contour filtering + per-piece extraction
### Implementation outline
- Filter contours by:
  - area (min/max)
  - contour solidity / convexity heuristics (optional)
- For each remaining contour:
  - Approximate polygon / simplify curve
  - Compute bounding box + rotated bounding box
  - Extract key measurements (perimeter, area, hull, etc.)
- Create an internal `DetectedPiece` structure:
  - id
  - contour points
  - bbox
  - confidence metrics (segmentation quality, contour sanity)

### Acceptance checks
- With ~20–100 pieces in view, the app lists a reasonable count.
- False positives (tiny noise blobs) are mostly filtered out.

---

## 6) Edge/corner classification (MVP rule-based)
> We only need to identify **straight outer sides**.

### Classification approach (v1)
For each piece contour:
- Compute **convex hull** and/or simplified polygon representation.
- Identify candidate “straight segments” on the outer boundary:
  - Fit lines to boundary segments (RANSAC or segment-by-segment fit).
  - Measure straightness via distance-to-line error and segment length.
- Count how many **distinct long straight segments** exist.
  - If ~2 ⇒ **Corner**
  - If ~1 ⇒ **Edge**
  - Else ⇒ **Unknown**
- Confidence scoring:
  - degrade confidence if contour is noisy, too small, blurred, partially out of frame.

### Acceptance checks
- On a simple test setup:
  - corners highlighted correctly most of the time
  - edge pieces highlighted reasonably
  - uncertain pieces usually remain Unknown
- Add at least 10–20 test photos to a local fixtures folder and validate stability.

---

## 7) Rendering overlays + UX controls
### Implementation outline
- On top of the live video (or captured frame), draw:
  - Outline of detected pieces
  - Distinct marker for edge vs corner (e.g., label + different outline style)
- Add UI controls:
  - toggles: Edges / Corners / Unknown (optional)
  - sensitivity: Low/Medium/High (maps to thresholds)
  - “Quality tips” banner if confidence is low
  - summary counts (corners, edges, total detected)

### Acceptance checks
- Overlay is legible and stable with zoom/orientation changes.
- Turning toggles on/off updates overlay immediately.
- Summary counts match visible markers.

---

## 8) Near-real-time mode (process live video at limited rate)
### Implementation outline
- Keep two modes:
  1. **High-quality** analysis on captured frame (default reliable path)
  2. **Live** analysis at limited FPS (e.g., 3–8 analyses/second)
- For live mode:
  - sample frames periodically
  - reuse intermediate buffers where possible
  - optionally analyze at lower resolution
- Stabilize results:
  - simple temporal smoothing (e.g., keep last N detections and fade)

### Acceptance checks
- Live mode feels responsive and does not freeze the UI.
- Device does not overheat quickly in a 3–5 minute test.
- Captured-frame mode remains the “best accuracy” path.

---

## 9) Move heavy vision work off the main thread (Worker)
### Implementation outline
- Offload OpenCV processing to a Web Worker:
  - send ImageData (or transferable buffer) from main thread
  - receive detections (contours simplified to reduce payload)
- Keep UI thread focused on:
  - video display
  - overlay drawing
  - interaction

### Acceptance checks
- UI remains smooth during analysis.
- No crashes due to memory/transfer size.
- Worker lifecycle handled (start/stop on navigation).

---

## 10) Quality guidance + error states
### Implementation outline
- Implement clear states:
  - camera permission denied
  - OpenCV load failed
  - no pieces detected
  - scan confidence low
- Provide actionable tips:
  - “Use a plain background”
  - “Spread pieces apart”
  - “Improve lighting”
  - “Avoid glare”

### Acceptance checks
- All errors show a human-readable message with a recovery action.
- Tips appear when confidence is low, not constantly.

---

## 11) Testing strategy (practical, automated + manual)
### Automated tests (core logic)
- Unit tests for:
  - contour filtering rules
  - straight-segment detection
  - classification (edge/corner/unknown)
- Use fixture images:
  - store several “known good” and “known hard” photos
  - tests assert approximate counts and classifications (tolerant thresholds)

### Manual tests
- iPhone Safari:
  - permission flow
  - orientation changes
  - performance in live mode
- Android Chrome:
  - same checks
- Desktop:
  - basic webcam

### Acceptance checks
- Test suite runs deterministically for fixtures.
- Manual checklist passes on at least one iPhone and one Android device.

---

## 12) Polish + release
### Implementation outline
- Performance tuning:
  - default to captured-frame analysis
  - reduce working resolution on low-end devices
- Basic analytics-free privacy note:
  - “No uploads by default”
- Prepare release build + deployment
- Versioning and changelog

### Acceptance checks
- Installation works (PWA).
- App is usable offline for the shell (camera still requires permissions and active device access).
- v1 acceptance criteria from the functional spec are met under recommended conditions.

---

## Appendix A — Suggested internal module boundaries
- `camera/` — permission, stream management, capture frame
- `overlay/` — draw primitives, labels, scaling math
- `vision/` — OpenCV loading, Mats, segmentation, contours
- `classifier/` — straight-side detection + edge/corner classification
- `worker/` — background processing interface
- `fixtures/` — test images for unit tests

---

## Appendix B — Practical MVP constraints to document in Help
- Use a plain contrasting background if possible.
- Avoid overlapping pieces.
- Ensure even light; avoid glare/shadows.
- Keep the camera steady; use captured-frame mode for best results.
