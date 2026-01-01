# Step 4 — Piece segmentation (separate pieces from background)

This step adds an OpenCV-based segmentation pipeline that tries to separate puzzle pieces from a mostly-uniform background.

## What it does
- Produces a **binary mask preview** (white = piece, black = background)
- Finds **external contours**
- Filters by **minimum area** and returns:
  - contour polygon (reduced point count)
  - bounding box
  - approximate area
- Renders detected contours as an overlay on top of the camera viewport.

## Where it lives
- Segmentation pipeline: `src/lib/opencv/segmentPieces.ts`
- UI + controls: `src/pages/CameraPage.tsx`

## Current assumptions (v1)
- Pieces are on a relatively **plain background** (table, mat, paper)
- **Low overlap** between pieces
- Reasonably even lighting

## Next improvements
- Automatic background modeling / chroma key mode
- Shadow suppression
- Better contour splitting for touching pieces
- Extract per-piece cutouts (RGBA sprites) for later classification (edge/corner detection)


## Implementation note
This step uses `cv.matFromImageData()` (instead of `cv.imread`) to avoid relying on optional OpenCV.js helpers.
