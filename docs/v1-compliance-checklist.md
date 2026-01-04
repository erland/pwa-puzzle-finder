# Puzzle Finder — v1 Compliance Checklist

This document tracks **v1 MVP** compliance against `docs/specification.md`.

Legend:
- ✅ Implemented
- 🟡 Partially implemented / needs polish
- ❌ Missing
- 🔶 Requires manual verification (acceptance criteria)

Last updated: 2026-01-04

---

## Functional requirements

| ID | Requirement | Status | Evidence / notes |
|---|---|---:|---|
| FR-1 | Provide a camera view for scanning | ✅ | `src/pages/CameraPage.tsx`, `src/hooks/useCameraStream.ts` |
| FR-2 | Request camera permission and explain why | 🟡 | Permission request exists, but explanation UX is minimal. `src/pages/CameraPage.tsx` |
| FR-3 | Overlay layer aligned with camera view | ✅ | Overlay utilities: `src/lib/overlay/*`, rendered via `CameraViewport` |
| FR-4 | “Capture frame” option to freeze and inspect | ✅ | `CameraPage` has “Capture frame” + captured state |
| FR-5 | Detect individual puzzle pieces | 🟡 | Segmentation/extraction pipeline exists; needs v1 UX integration. `src/lib/opencv/*` |
| FR-6 | Classify each piece as corner/edge/non-edge/unknown | 🟡 | Classifier exists, but currently uses `interior` rather than explicit `unknown/non-edge`. `src/lib/opencv/classifyPieces.ts` |
| FR-7 | Highlight corner and edge pieces with distinct markers | 🟡 | Overlay exists; ensure distinct, readable markers in v1 UI. `src/lib/overlay/drawOverlay.ts` |
| FR-8 | Uncertain cases → Unknown/Non-edge (avoid false labels) | ❌ | Needs explicit unknown/non-edge handling + conservative rules. `src/lib/opencv/classifyPieces.ts` |
| FR-9 | Simple sensitivity control (Low/Med/High or slider) | ❌ | Many advanced params exist; needs a single simplified control. `src/pages/cameraPageReducer.ts`, `src/components/camera/CameraControlsCard.tsx` |
| FR-10 | Filters: corners/edges toggles (+ optional unknown) | ❌ | Needs v1 filter toggles and consistent filtering logic in overlay + counts |
| FR-11 | “Re-scan” for captured frames | 🟡 | Pipeline can be re-run, but v1 “Re-scan” UX in review mode not implemented |
| FR-12 | “Reset settings” action | ❌ | Needs one-shot reset for v1 controls |
| FR-13 | Outline each highlighted piece, optional label | 🟡 | Outline exists; labels and v1 polish still needed. `src/lib/overlay/drawOverlay.ts` |
| FR-14 | Overlay remains readable (halo/outline) | 🟡 | Partial; ensure robust readability on bright/dim backgrounds |
| FR-15 | Show summary counts (corners/edges/optional total) | ❌ | Needs UI counts based on current scan results |
| FR-16 | Show quality feedback when results are poor | 🟡 | Quality heuristics exist; integrate into v1 UX. `src/lib/vision/quality.ts` |
| FR-17 | Present actionable tips (lighting/contrast/spacing) | 🟡 | Tip strings exist; surface them in v1. `src/lib/vision/quality.ts` |
| FR-18 | Help/onboarding screen | ✅ | `src/pages/HelpPage.tsx` (diagrams optional; can be improved) |
| FR-19 | Core feature without account creation | ✅ | No auth/account flows present |
| FR-20 | No upload/sharing of images by default | ✅ | No network upload paths found in current codebase |
| FR-21 | Future sharing/export must be opt-in | 🟡 | No sharing exists yet; keep this as a guardrail for future work |

---

## Non-functional requirements

| ID | Requirement | Status | Evidence / notes |
|---|---|---:|---|
| NFR-1 | Live scanning feels responsive (throttle ok) | 🟡 | Live loop is throttled + in-flight guarded. Capture uses a single higher-quality pass. `src/hooks/useVisionTick.ts`, `src/pages/CameraPage.tsx` |
| NFR-2 | Avoid heating/battery drain | 🟡 | No explicit constraints; keep throttling and avoid heavy loops |
| NFR-3 | Degrade gracefully on lower-performance devices | 🟡 | Worker pipeline exists; confirm fallback behavior. `src/lib/vision/*` |
| NFR-4 | Clear error states (permission denied, unavailable, analysis failed) | 🟡 | Some errors shown; needs v1-friendly copy + recovery actions |
| NFR-5 | Support large text/dynamic sizing where applicable | 🟡 | General layout OK; verify with browser zoom / OS text settings |
| NFR-6 | Color-independent cues where possible | 🟡 | Ensure labels/shape cues exist in v1 overlay |
| NFR-7 | Key actions usable one-handed on phone | 🟡 | Needs v1 compact controls + layout validation |
| NFR-8 | Designed for easy translation (optional) | 🟡 | Strings are embedded; consider centralizing later (optional for v1) |

---

## UI requirements

| ID | Requirement | Status | Evidence / notes |
|---|---|---:|---|
| UI-1 | Camera view as the main screen | ✅ | `/` renders `CameraPage`. Legacy `/camera` redirects to `/`. `src/App.tsx` |
| UI-2 | Compact panel: toggles + sensitivity + capture | 🟡 | Implemented v1 compact controls (`V1Controls`) and hid debug pipeline controls behind `?debug=1`. Still needs wording/polish to match spec exactly. `src/components/camera/V1Controls.tsx`, `src/pages/CameraPage.tsx` |
| UI-3 | Captured review screen with zoom/pan + re-scan + back | 🟡 | Review mode supports pan/zoom on captured frame and a dedicated Re-scan action. Uses DOM transform so overlay stays aligned. `src/components/camera/CameraViewport.tsx`, `src/components/camera/V1Controls.tsx`, `src/pages/CameraPage.tsx` |
| UI-4 | Help/onboarding with simple diagrams/instructions | 🟡 | Help exists; diagrams are optional but recommended for clarity |

---

## Error handling & edge cases

| ID | Requirement | Status | Evidence / notes |
|---|---|---:|---|
| EH-1 | Warn when heavy overlap → results may be inaccurate | 🟡 | Heuristic warnings exist (foreground ratio / “too much foreground”). `src/lib/vision/quality.ts` |
| EH-2 | Warn for too dark/bright/blurry + suggest steps | ✅ | Implemented via quality guidance. `src/lib/vision/quality.ts` |
| EH-3 | If no pieces detected → suggest fixes | ✅ | Implemented via guidanceFromFrameQuality. `src/lib/vision/quality.ts` |

---

## Acceptance criteria

These must be validated by running the app on real devices / real puzzle pieces.

| ID | Acceptance criterion | Status | Evidence / notes |
|---|---|---:|---|
| AC-1 | On a well-lit table, consistently highlights edge/corner pieces usefully | 🔶 | Requires manual testing on representative setups |
| AC-2 | Users can toggle corners/edges and capture for more accurate analysis | ❌ | Toggle UI and capture-review UX still needed |
| AC-3 | Permission denial + camera errors have clear messages + recovery path | 🟡 | Basic error exists; recovery UX needs v1 polish |
| AC-4 | No account required; no uploads by default | ✅ | No auth or upload flows present |

---

## Notes / next actions
- When implementing v1 UI, keep any developer pipeline controls behind a **debug toggle** (e.g. `?debug=1`) until you’re ready to remove them.
- Update this checklist as each step of the v1 plan is implemented.
