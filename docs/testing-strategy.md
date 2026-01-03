# Testing strategy

This repo mixes **pure TypeScript logic** (easy to test) with **browser-only APIs** (camera, canvas, workers, OpenCV). The goal is to keep automated tests fast and deterministic while still validating the real camera/worker/OpenCV integration via a short manual checklist.

## Automated tests (Jest)

### What to cover with Jest

1. **Pure logic (unit tests)**
   - Frame quality scoring and guidance generation (`src/lib/vision/quality.ts`).
   - Worker protocol / client logic (`src/lib/vision/visionWorkerClient.ts`).
   - Any rule-based classification utilities that don’t depend on OpenCV runtime.

2. **React component behavior (component tests)**
   - Pages should render, show initial UI state, and respond to user actions.
   - Camera page tests should mock `navigator.mediaDevices.getUserMedia` and avoid relying on real canvas implementations.

3. **Integration boundaries (mocked)**
   - Worker message roundtrips should be tested with a mocked Worker implementation.
   - OpenCV and canvas work should remain *behind* thin wrappers so they can be mocked.

### Commands

- `npm test` – run full test suite once.
- `npm run test:watch` – watch mode.
- `npm run test:ci` – CI-friendly output.
- `npm run test:coverage` – generate coverage report.

### Test placement

Prefer colocating tests near the code:

- `src/lib/vision/__tests__/...`
- `src/lib/vision/__tests__/...`
- `src/pages/__tests__/...`

This keeps the purpose obvious and encourages unit tests for the “library” parts.

### Mocking guidelines

#### Canvas in Jest

JSDOM does not implement real 2D canvas contexts. Avoid testing pixel output. Instead:

- Prefer unit tests on functions that produce data structures (boxes, points, labels).
- If a component requires `getContext`, gate it with a safe wrapper or mock `HTMLCanvasElement.prototype.getContext` in the test.

#### Camera in Jest

Mock `navigator.mediaDevices.getUserMedia` to return a fake MediaStream with fake tracks:

- Provide a `getTracks()` method that returns objects with a `stop()` function.
- Tests should only assert that `getUserMedia` was called and that UI state updates.

#### Workers in Jest

Mock the `Worker` class:

- Capture `postMessage` calls.
- Trigger `onmessage` manually from the test.
- Use fake timers (`jest.useFakeTimers()`) to test timeouts deterministically.

#### `import.meta` in Jest

When code needs `import.meta.env.BASE_URL`, ensure the access is wrapped behind a small helper so Jest never parses `import.meta` directly. (This repo already includes such guards.)

### Flakiness rules

- Avoid timers and polling in tests unless you control them with fake timers.
- Avoid real network requests.
- Avoid relying on layout measurements (JSDOM doesn’t do layout).

## Manual testing

Automated tests cannot fully validate:

- Real camera permissions / device selection
- Real OpenCV runtime load performance
- Real worker execution performance

Use the manual checklist in `docs/manual-test-checklist.md` before shipping changes to the camera/vision pipeline.

## Suggested CI checks

At a minimum:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:ci`
4. `npm run build`

