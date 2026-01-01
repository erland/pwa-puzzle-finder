# Project scaffold + PWA baseline (Step 1)

This repository provides the baseline needed before adding camera + computer vision.

## Included
- PWA-ready build with service worker and manifest.
- GitHub Pages **base path** preconfigured as `/pwa-puzzle-finder/`.
- Simple in-app pages:
  - **Home**: MVP scope and checklist
  - **Help**: recommended setup and privacy note

## GitHub Pages note
- `vite.config.ts` sets `base: '/pwa-puzzle-finder/'` and the PWA manifest `start_url/scope` match this path.
- Routing uses a hash-based router to avoid 404 issues on GitHub Pages.

