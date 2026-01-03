# Puzzle Finder (PWA)

Puzzle Finder helps you locate **corner** and **edge** jigsaw puzzle pieces using your device camera and on-screen highlighting.

This repo currently contains:

- **Step 1:** PWA scaffold + baseline UI.
- **Step 2:** Camera stream + canvas overlay.
- **Step 3:** OpenCV "Hello" frame processor (live edge preview).

Next steps will add puzzle piece segmentation and corner/edge classification.

## Development

```bash
pnpm install
pnpm dev
```

(You can use npm/yarn if you prefer.)

## Build

```bash
pnpm build
pnpm preview
```

## GitHub Pages base path

This project is preconfigured to be served from:

- `/pwa-puzzle-finder/`

Make sure the repository name stays `pwa-puzzle-finder` (or update `vite.config.ts` accordingly).

## What’s implemented so far

- PWA manifest + service worker (auto-updating).
- Home + Help screens with MVP scope and usage guidance.
- Hash-based routing (works on GitHub Pages without extra 404 handling).


## Testing

```bash
npm test
```

Other useful commands:

```bash
npm run test:watch
npm run test:coverage
```

Tests live in `__tests__` folders next to the code they test.

See `docs/testing-strategy.md` and `docs/manual-test-checklist.md` for practical guidance (automated + manual).
