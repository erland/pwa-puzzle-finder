# Puzzle Finder — Functional Specification (v1 MVP)

## 1. Purpose
Puzzle Finder helps a person quickly locate **edge** and **corner** jigsaw puzzle pieces on a table by using a device camera and visual on-screen highlighting.

Version 1 (MVP) focuses on **identifying and highlighting corner/edge pieces** in a live camera view and/or from a captured frame. The product is designed so it can be extended later to support additional piece types and more advanced assistance.

## 2. Goals
### 2.1 MVP goals (v1)
- Detect individual puzzle pieces visible on a flat surface.
- Classify detected pieces as:
  - **Corner piece** (two approximately straight outer sides),
  - **Edge piece** (one approximately straight outer side),
  - **Non-edge/unknown** (everything else, including unclear cases).
- Overlay clear visual markers on top of the camera view to indicate where edge/corner pieces are located.
- Provide basic guidance to increase detection success (lighting, background, spacing).

### 2.2 Non-goals (v1)
- Solving the whole puzzle or suggesting exact placements on the board.
- Matching pieces to each other.
- Identifying interior pieces by image content (e.g., sky vs grass).
- Guaranteeing correct results under all conditions (e.g., heavy shadows, reflections, overlapping pieces).

## 3. Target users & scenarios
### 3.1 Primary user
- A person assembling a physical jigsaw puzzle who wants to quickly separate corner/edge pieces from the rest.

### 3.2 Typical scenarios
- **Start of a puzzle session:** The user spreads pieces out and uses the app to find edge/corner pieces to build the frame first.
- **Mid-session organization:** The user periodically re-scans to find remaining edge pieces.

## 4. Definitions
- **Piece detection:** Identifying the boundary of a single physical puzzle piece in the camera view.
- **Classification:** Determining whether a detected piece is corner, edge, or non-edge/unknown.
- **Overlay:** Visual highlights drawn on top of the camera view.

## 5. Assumptions & constraints
- Pieces are on a **flat surface**.
- Best results require:
  - Good, even lighting.
  - Minimal reflections.
  - Pieces not overlapping.
  - A reasonably contrasting background (recommended but not mandatory).
- The device must have a camera and allow the app to access it with user permission.

## 6. User experience overview (v1)
### 6.1 Primary flow: Live scanning
1. User opens the app and grants camera access.
2. App shows a live camera view with an overlay layer.
3. User points the camera at the table with puzzle pieces.
4. App highlights detected **corner** and **edge** pieces in real time (or near-real time).
5. User optionally filters view to show:
   - All detected pieces,
   - Only corners,
   - Only edges,
   - Both corners and edges (default).

### 6.2 Secondary flow: Capture frame + inspect
1. User taps **Capture**.
2. App freezes the current frame and runs a higher-quality analysis.
3. App shows results with zoom/pan.
4. User can review and optionally re-run analysis after adjusting settings.

### 6.3 Guidance flow: Improve detection
- If detection quality is low, the app shows tips such as:
  - “Increase lighting”
  - “Avoid shadows”
  - “Spread pieces apart”
  - “Use a plain background for better contrast”

## 7. Functional requirements (v1 MVP)

### 7.1 Camera & view
- FR-1: The app shall provide a camera view for scanning a tabletop.
- FR-2: The app shall request camera permission and clearly explain why it is needed.
- FR-3: The app shall provide an overlay layer aligned with the camera view for drawing highlights.
- FR-4: The app shall provide a “Capture frame” option to freeze and inspect a scan.

### 7.2 Detection & classification
- FR-5: The app shall attempt to detect individual puzzle pieces within the view.
- FR-6: For each detected piece, the app shall classify it as:
  - Corner / Edge / Non-edge (or Unknown).
- FR-7: The app shall highlight:
  - Corner pieces with a distinct marker,
  - Edge pieces with a distinct marker.
- FR-8: The app shall handle uncertain cases by marking them as **Unknown/Non-edge** rather than falsely labeling them as edge/corner.
- FR-9: The app shall provide a simple sensitivity control (e.g., “Low / Medium / High” or a slider) that can affect detection strictness.

### 7.3 Controls & filtering
- FR-10: The app shall provide toggles/filters to show:
  - Corners (on/off),
  - Edges (on/off),
  - Unknown/non-edge (optional, default off).
- FR-11: The app shall provide a “Re-scan” action (for captured frames) to re-run analysis.
- FR-12: The app shall provide a “Reset settings” action.

### 7.4 Result presentation
- FR-13: Each highlighted piece shall be visually outlined (e.g., contour/box) and optionally labeled (“Corner”, “Edge”).
- FR-14: The overlay shall remain readable in both bright and dim environments (e.g., with a subtle outline/halo).
- FR-15: The app shall display a small summary count:
  - Number of detected corners,
  - Number of detected edges,
  - (Optional) total detected pieces.

### 7.5 Guidance & quality feedback
- FR-16: The app shall show detection quality feedback when results are poor (e.g., “Low confidence scan”).
- FR-17: The app shall present actionable tips to improve results (lighting, contrast, spacing).
- FR-18: The app shall provide a short onboarding/help screen explaining:
  - What the app does,
  - How to arrange pieces for best results,
  - What corner/edge classification means.

### 7.6 Privacy & data handling (functional)
- FR-19: The app shall allow the user to use the core feature without requiring account creation.
- FR-20: By default, images/video used for detection shall not be uploaded or shared.
- FR-21: If any optional sharing/export is introduced later, it must be off by default and clearly explained.

## 8. Non-functional requirements (v1 MVP)

### 8.1 Performance
- NFR-1: Live scanning should feel responsive. If full analysis is too heavy for real-time, the app may:
  - Analyze fewer frames per second, and/or
  - Offer “Capture + analyze” as the high-accuracy path.
- NFR-2: The app should avoid excessive device heating and battery drain during extended scanning.

### 8.2 Reliability
- NFR-3: The app shall degrade gracefully on lower-performance devices (e.g., reduced update frequency).
- NFR-4: The app shall provide clear error states for:
  - Camera permission denied,
  - Camera unavailable,
  - Analysis failed.

### 8.3 Accessibility & usability
- NFR-5: The app shall support large text / dynamic text sizing where applicable.
- NFR-6: The app shall provide color-independent cues where possible (e.g., labels or different shapes) to support color-vision deficiencies.
- NFR-7: Key actions shall be usable with one hand on a phone-sized device.

### 8.4 Internationalization (optional in v1)
- NFR-8: The app should be designed so text can be translated easily (even if only one language ships in v1).

## 9. UI requirements (v1 MVP)
- UI-1: Camera view as the main screen, with overlay highlights.
- UI-2: A compact control panel with:
  - Toggle corners,
  - Toggle edges,
  - Sensitivity control,
  - Capture button.
- UI-3: A captured-frame review screen with:
  - Zoom/pan,
  - Re-scan,
  - Back to live view.
- UI-4: A help/onboarding screen with simple diagrams or instructions.

## 10. Error handling & edge cases (v1)
- EH-1: If pieces overlap heavily, the app shall warn the user that results may be inaccurate.
- EH-2: If the scene is too dark/bright or blurry, the app shall warn and suggest corrective steps.
- EH-3: If no pieces are detected, the app shall suggest:
  - Improve contrast/background,
  - Move closer/farther,
  - Increase light,
  - Spread pieces out.

## 11. Acceptance criteria (v1 MVP)
A v1 release is acceptable when:
- AC-1: On a well-lit table with non-overlapping pieces, the app consistently highlights corner and edge pieces in a way that users find helpful for sorting.
- AC-2: Users can toggle corners/edges visibility and capture a frame for more accurate analysis.
- AC-3: The app handles permission denial and camera errors with clear messages and a recovery path.
- AC-4: No account is required; no images are uploaded by default.

## 12. Future extensions (out of scope for v1)
The following are explicitly planned as potential later versions:

### 12.1 Better piece understanding
- Identify **inner pieces** with higher confidence.
- Detect **piece orientation** (rotation) and indicate which side is straight/outer.
- Detect and label **tabs/slots** count and arrangement.

### 12.2 Sorting & organization support
- Provide a “shopping list” of how many edge pieces remain.
- Suggest physical sorting bins (e.g., “Put corners here”) with on-screen guidance.

### 12.3 Assisted assembly
- Suggest likely neighbors for an edge piece based on contour matching.
- Provide a “build the frame” mode to propose an ordering of edges.
- Offer an optional “scan the box image” reference to support matching by image content.

### 12.4 Multi-scan and tracking
- Track pieces across multiple scans and avoid double-counting.
- Allow exporting a scan result (e.g., a marked-up image) for reference.

### 12.5 Optional cloud features (opt-in)
- Improved detection using remote processing (explicit opt-in).
- Cross-device sync of scan sessions (optional).

---

**Document status:** Draft functional specification for v1 MVP.
