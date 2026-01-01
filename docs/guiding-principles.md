# Guiding principles (v1 MVP)

- **MVP first:** reliable corner/edge highlighting under recommended conditions (flat surface, non-overlapping pieces, decent lighting, preferably plain background).
- **Fail safe:** when uncertain, classify as *Unknown* rather than a false edge/corner.
- **Performance-aware:** analyze fewer frames per second; keep UI responsive; prefer background processing when needed.
- **Testability:** core algorithms should be unit-testable with static images/fixtures and deterministic outputs.

