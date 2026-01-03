# Release checklist

## Before release

- `npm test`
- `npm run build`
- `npm run preview` and verify:
  - App loads under `/pwa-puzzle-finder/`
  - Camera page works (permissions, start/stop/capture)
  - Overlays render (segmentation/extraction/classification)
  - Worker mode:
    - Worker becomes **ready**
    - Live processing shows overlays
    - No “OpenCV load timeout”
  - Error states show helpful messages:
    - Denied permissions
    - No camera device
    - OpenCV load failure
- DevTools checks:
  - No continuous console errors
  - Network: OpenCV asset loads once and is cached (subsequent reloads faster)
  - Application → Service Workers:
    - SW installs in production preview
    - No “trying to install” loops

## GitHub Pages deployment

This repo is configured for GitHub Pages under `/pwa-puzzle-finder/`.

Recommended approach:

1. Build in CI
2. Deploy `dist/` to GitHub Pages

If you use a GitHub Actions workflow, ensure:
- Node version is pinned (LTS)
- `npm ci`
- `npm run build`
- Upload `dist/` as artifact and deploy

## After release

- Bump `package.json` version and update `CHANGELOG.md`
- Tag the release in Git (`vX.Y.Z`)
- Smoke test the deployed URL (mobile + desktop)
