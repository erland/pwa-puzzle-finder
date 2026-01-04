# Puzzle Finder (PWA)

A Progressive Web App that uses your camera + OpenCV.js to segment and extract jigsaw puzzle pieces, classify them (MVP rule-based), and render helpful overlays. Designed to run on GitHub Pages under `/pwa-puzzle-finder/`.

## What it does (current MVP)

- Live camera preview with an overlay canvas
- “Hello OpenCV” frame processor (edge preview)
- Piece segmentation (foreground vs background) + contour filtering
- Per-piece extraction (cropped previews + metadata)
- Edge/corner classification (rule-based MVP)
- Near-real-time mode (throttled processing loop)
- Optional Worker pipeline for heavy vision work
- Quality guidance + clear error states (lighting/motion/contrast hints)

## Docs

- v1 functional spec: `docs/specification.md`
- v1 compliance checklist: `docs/v1-compliance-checklist.md`
- Current implementation plan: `docs/development-plan-v1.md`

## Run locally

```bash
npm install
npm run dev
```

Then open the app at:

- `http://localhost:5173/pwa-puzzle-finder/`

Preview the production build:

```bash
npm run build
npm run preview
```

- `http://localhost:4173/pwa-puzzle-finder/`

## Notes on OpenCV

- OpenCV is loaded from `public/vendor/opencv/opencv.js` (copied automatically by `scripts/copy-opencv.mjs` on `prebuild` / `postinstall`).
- OpenCV assets are **not precached** by the service worker (too large). They are fetched on-demand and runtime-cached.

## Troubleshooting

- **Camera permissions**: make sure your browser allows camera access for the localhost origin.
- **Wrong paths**: this project is configured for the base path `/pwa-puzzle-finder/`. If you change the repository name or hosting path, update:
  - `vite.config.ts` (`BASE`)
  - `public/manifest.webmanifest` (start_url / scope / icon paths)
- **Service worker odd behavior while developing**: the app disables SW in dev mode to avoid install loops. If you previously installed the PWA, you may need to unregister the SW in DevTools → Application.

## Release checklist

See `docs/release-checklist.md`.
