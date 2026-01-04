# Puzzle Finder — v1 Compliance Development Plan (from current codebase)

This plan describes how I (as an LLM) would incrementally refactor the current repo into a **production-ready v1** that complies with **`docs/specification.md`** (v1 MVP).

## Goals (from specification)
- **Camera is the main screen** with an aligned overlay (UI-1, FR-1..4).
- **Compact controls**: toggle corners, toggle edges, **single sensitivity control**, capture (UI-2, FR-9..12).
- **Captured-frame review** with **zoom/pan**, re-scan, back to live (UI-3, FR-11).
- **Clear permission explanation + recovery** (FR-2, AC-3).
- **Conservative classification**: corner/edge vs non-edge/unknown; avoid false positives (FR-6..8).
- **Result presentation**: readable overlay + summary counts (FR-13..15).
- **Quality feedback + actionable tips** and a help/onboarding screen (FR-16..18, EH-1..3).
- **No account, no uploads by default** (FR-19..21, AC-4).

## Non-goals (v1)
- Piece content understanding (sky/grass), sorting assistance, multi-scan tracking, cloud features.

## Working approach
Each step is sized to be implemented “in one sweep” and is independently testable. Prefer keeping intermediate/debug functionality **behind a `?debug=1` flag** (or a collapsed “Advanced” section) until we are ready to delete it.

---

## Step 0 — Baseline & v1 compliance checklist
**Outcome:** Clean baseline, measurable progress.

- Add a `docs/v1-compliance-checklist.md` that maps spec items to:
  - ✅ implemented
  - 🟡 partial
  - ❌ missing
  - Link to file(s) responsible
- Ensure `npm test` and `npm run build` are green (fix any drift first).
- Add a lightweight “smoke” test for the main route rendering (so route changes don’t regress silently).

**Done when**
- Build + tests pass.
- Checklist exists and is linked from README.

---

## Step 1 — Make Camera the main screen (UI-1)
**Outcome:** App opens directly into scanning.

- Change routing so **`/` renders `CameraPage`** (or a new `ScanPage` wrapper).
- Keep Help screen at `/help`.
- Remove/retire `HomePage` (or convert it to Help/About if you want an explicit landing page).
- Remove “v1 scaffold” header text and any “Step X implementation …” developer copy.

**Tests**
- Route test: `/` shows camera UI shell; `/help` shows onboarding.

**Done when**
- Opening the app goes straight to scanning (per UX 6.1).

---

## Step 2 — Replace “pipeline debug controls” with v1 compact controls (UI-2)
**Outcome:** Controls match v1 spec and are friendly.

Create a new component, e.g.:
- `src/components/camera/V1Controls.tsx`

Controls:
- Toggle **Corners**
- Toggle **Edges**
- (Optional, default off) Toggle **Non-edge/Unknown**
- **Sensitivity** (Low/Medium/High *or* a single slider)
- **Capture** button

Implementation notes:
- Keep existing stage buttons (segment/extract/classify), Canny sliders, morphology kernel, etc. **only under debug**:
  - query param `?debug=1`, and/or
  - collapsible “Advanced” panel

**Tests**
- Toggle tests: toggles update state and affect overlay filtering.
- Sensitivity control updates derived parameters (see Step 3).

**Done when**
- The default UI shows only the compact v1 controls.

---

## Step 3 — Normalize the “scan model” (shared result + conservative classification)
**Outcome:** A stable internal data model enables v1 UI/overlay/quality features.

Introduce (or formalize) a single result shape, e.g.:
- `src/lib/vision/types.ts`

Suggested types:
- `PieceClass = 'corner' | 'edge' | 'nonEdge' | 'unknown'`
- `DetectedPiece { id, contour/box, class, confidence?, diagnostics? }`
- `ScanResult { pieces[], counts, quality, tips[], debug? }`

Update classification so it is conservative (FR-8):
- If uncertain, label **`unknown`** (or `nonEdge`) rather than corner/edge.
- If you already compute heuristics, add a simple `confidence` (0..1) so quality feedback can reason about “low confidence”.

**Sensitivity mapping (FR-9)**
Map the single user control to a few internal thresholds (keep it predictable):
- Low sensitivity: stricter segmentation + stricter edge/corner thresholds (fewer false positives)
- High sensitivity: looser thresholds (find more pieces, risk more noise)

**Tests**
- Unit tests for `classifyPieces`:
  - known corner-ish => corner
  - known edge-ish => edge
  - ambiguous => unknown/nonEdge
- Unit tests for sensitivity mapping (stable outputs).

**Done when**
- Everything downstream consumes `ScanResult` (not ad-hoc arrays/state).

---

## Step 4 — Simplify the processing pipeline for v1 (live + capture)
**Outcome:** Live scanning feels responsive; capture runs higher-quality analysis (NFR-1, UX 6.1/6.2).

- Live mode:
  - Run at a throttled rate (e.g. 2–6 fps) and/or skip frames.
  - Prefer worker execution to avoid UI jank.
- Capture mode:
  - Freeze frame.
  - Run “high quality” analysis once (potentially more expensive).
- Add cancellation/“last request wins” semantics so rapid changes don’t pile up worker jobs.

Keep the implementation internal:
- The user should not choose “segment/extract/classify pipelines” in v1.

**Tests**
- Hook/unit tests: `useVisionTick` or equivalent emits results at a bounded rate.
- Worker client tests for cancellation/ordering (you already have some in `src/lib/vision/__tests__`).

**Done when**
- Live results update smoothly and capture analysis is noticeably “stronger”.

---

## Step 5 — Captured-frame review with zoom/pan + re-scan (UI-3, FR-11)
**Outcome:** The review screen matches the spec.

- Create `CapturedReview` UI state:
  - `mode: 'live' | 'review'`
  - stored captured bitmap/frame
  - stored `ScanResult`
- Implement zoom/pan:
  - Pointer drag => pan
  - Wheel / pinch => zoom (basic pinch support is OK for v1)
  - Keep overlay aligned with the transformed image
- Buttons:
  - **Re-scan** (runs analysis again using current sensitivity/toggles)
  - **Back to live**

**Tests**
- Component tests: entering review mode shows zoom/pan container + buttons.
- Reducer tests (if using reducer): actions `capture`, `rescan`, `backToLive`.

**Done when**
- Review mode is usable on desktop + mobile and overlay stays aligned.

---

## Step 6 — Result presentation: readable overlay + labels + counts (FR-13..15)
**Outcome:** Output is understandable at a glance.

Overlay updates:
- Outline each piece (contour or bounding box).
- Distinct marker/visual style for corner vs edge.
- Optional label text (“Corner”, “Edge”) (could be off by default if cluttered).
- Halo/outline so it’s readable on bright/dim backgrounds (FR-14).

UI updates:
- Show **summary counts** (corners, edges, optional total) in the compact panel or a small HUD.

Filtering:
- Apply toggles to the overlay and to the summary counts consistently.

**Tests**
- Overlay logic unit tests (pure functions) for filtering and counts.
- Snapshot-style test for summary panel text.

**Done when**
- You can toggle corners/edges and see counts update reliably.

---

## Step 7 — Guidance & quality feedback (FR-16..18, EH-1..3)
**Outcome:** When results are bad, users get clear guidance.

- Reuse/extend `src/lib/vision/quality.ts` to produce:
  - `quality.level: good | ok | poor`
  - `quality.reasons: string[]`
  - `tips: string[]` (lighting, shadows, spacing, background, overlap)
- Display:
  - A compact banner (e.g. “Low confidence scan”) with 1–3 actionable tips.
- Add “no pieces detected” guidance (EH-3).
- Add “heavy overlap” warning (EH-1).

Help/onboarding (UI-4 / FR-18):
- Update `HelpPage` to:
  - What the app does
  - How to arrange pieces (lighting, spread, background)
  - What corner/edge means
  - (Optional) simple inline SVG diagrams

**Tests**
- Unit tests for `quality.ts` outputs on representative inputs.
- Render test: poor quality shows banner + tips.

**Done when**
- Bad scans give actionable guidance without opening the debug UI.

---

## Step 8 — Permission UX + error recovery (FR-2, AC-3)
**Outcome:** Camera permission and failures are handled politely.

- Before requesting permission, show a short explanation:
  - “We need camera access to detect edges/corners locally on your device.”
- On denial:
  - Show “Permission denied” message with steps to re-enable in browser settings.
  - Provide a “Try again” button (re-request if possible).
- On camera stream failure:
  - Show a clear error and recovery path.

**Tests**
- Mock `getUserMedia` permission denied => friendly message rendered.
- Error path test for camera failure.

**Done when**
- A non-technical user can understand what happened and what to do.

---

## Step 9 — Production hardening & remove v1-irrelevant intermediate features
**Outcome:** “Production build” quality: smaller surface area, fewer knobs, less confusion.

- Ensure debug-only UI is hidden unless explicitly enabled.
- Remove “Step scaffold” copy entirely.
- Prune unused state fields in `cameraPageReducer` (keep only v1 needs + internal params).
- Confirm no network upload paths exist (AC-4):
  - no API calls
  - no analytics by default (unless explicitly intended)

**Tests**
- Build size sanity check (optional): avoid shipping large debug assets unnecessarily.
- Grep check: no accidental fetch/upload to external endpoints.

**Done when**
- Default UI contains only v1 functionality and is hard to “get lost” in.

---

## Step 10 — v1 acceptance pass + release checklist
**Outcome:** Verified compliance against AC-1..AC-4.

- Update `docs/manual-test-checklist.md` to a v1-focused checklist:
  - Live scanning looks responsive
  - Toggles work
  - Capture + review zoom/pan works
  - Re-scan works
  - Permission denial handled
  - No uploads; no account requirement
- Run a final pass against `docs/v1-compliance-checklist.md` and mark all spec items.

**Done when**
- All acceptance criteria are met and documented.

---

## Definition of done (v1)
- Meets AC-1..AC-4 in `docs/specification.md`.
- Default UI matches UI-1..UI-4.
- Tests/build green; debug UI is hidden by default.
- Help/onboarding explains how to get good results.
