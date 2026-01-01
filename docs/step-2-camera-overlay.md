# Step 2 — Camera stream + canvas overlay (no OpenCV yet)

This step introduces:
- Live camera stream
- Canvas overlay aligned with the camera view
- Capture-frame mode (freeze the frame for later analysis)

## Where it lives
- UI: `src/pages/CameraPage.tsx`
- Overlay drawing: implemented as a small hook inside `CameraPage.tsx` for now
- Styles: `src/styles.css` (`.cameraViewport`, `.cameraOverlay`, etc.)

## Notes
- The overlay is currently a **grid + crosshair + status** label.
- The capture feature draws the current video frame into a canvas and pauses the video.
- No computer vision is included in this step.
