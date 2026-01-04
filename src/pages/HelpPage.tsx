export default function HelpPage() {
  return (
    <>
      <div className="card">
        <h2>How to use Puzzle Finder (v1 MVP)</h2>
        <p className="muted">
          Version 1 focuses on finding <strong>corner</strong> and <strong>edge</strong> pieces. For best results,
          arrange pieces on a flat surface with good contrast and lighting.
        </p>
      </div>

      <div className="card">
        <h2>What is a corner vs edge?</h2>
        <p className="muted">
          A <strong>corner</strong> piece has <strong>two</strong> straight outer sides. An <strong>edge</strong> piece has
          <strong> one</strong> straight outer side. Everything else is treated as <strong>non-edge/unknown</strong>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ padding: 12, border: '1px solid rgba(42, 49, 70, 0.95)', borderRadius: 16, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Corner</div>
            <svg viewBox="0 0 120 80" width="100%" height="80" aria-label="Corner diagram">
              <path d="M20 15 H70 Q78 15 80 23 V30 Q80 36 86 38 H95 Q105 38 105 48 V60 Q105 65 100 65 H20 Q15 65 15 60 V20 Q15 15 20 15 Z" fill="none" stroke="currentColor" strokeWidth="4" />
              <path d="M20 15 H65" stroke="currentColor" strokeWidth="6" />
              <path d="M15 20 V60" stroke="currentColor" strokeWidth="6" />
            </svg>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Two straight sides.
            </div>
          </div>

          <div style={{ padding: 12, border: '1px solid rgba(42, 49, 70, 0.95)', borderRadius: 16, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Edge</div>
            <svg viewBox="0 0 120 80" width="100%" height="80" aria-label="Edge diagram">
              <path d="M20 18 H100 Q105 18 105 23 V32 Q105 38 98 40 H90 Q84 42 84 48 V58 Q84 64 78 64 H20 Q15 64 15 59 V23 Q15 18 20 18 Z" fill="none" stroke="currentColor" strokeWidth="4" />
              <path d="M20 18 H100" stroke="currentColor" strokeWidth="6" />
            </svg>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              One straight side.
            </div>
          </div>

          <div style={{ padding: 12, border: '1px solid rgba(42, 49, 70, 0.95)', borderRadius: 16, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Non-edge / Unknown</div>
            <svg viewBox="0 0 120 80" width="100%" height="80" aria-label="Non-edge diagram">
              <path d="M22 20 Q30 10 40 20 Q52 32 62 20 Q72 8 82 20 Q92 34 100 20 Q108 6 108 24 V56 Q108 70 92 62 Q80 56 72 66 Q62 76 54 66 Q44 56 34 66 Q20 78 15 56 V28 Q15 12 22 20 Z" fill="none" stroke="currentColor" strokeWidth="4" />
            </svg>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              No clear straight outer side (or uncertain).
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Recommended setup</h2>
        <ul>
          <li><strong>Background:</strong> a plain mat/sheet (dark or light) that contrasts with the pieces</li>
          <li><strong>Lighting:</strong> bright, even light; avoid reflections from glossy pieces</li>
          <li><strong>Spacing:</strong> keep pieces separated; avoid overlap</li>
          <li><strong>Stability:</strong> keep the camera steady; move slowly</li>
        </ul>
      </div>

      <div className="card">
        <h2>Troubleshooting</h2>
        <ul>
          <li><strong>No pieces detected:</strong> move closer, increase contrast, and spread pieces apart.</li>
          <li><strong>Overlapping pieces:</strong> results may be wrong — separate pieces so their outlines are clear.</li>
          <li><strong>Too dark / too bright:</strong> adjust lighting and reduce shadows or glare.</li>
          <li><strong>Blurry:</strong> hold still and let the camera focus before capturing.</li>
        </ul>
        <p className="muted">
          Tip: if live scanning struggles, use <strong>Capture</strong> and then <strong>Re-scan</strong> on the frozen frame.
        </p>
      </div>

      <div className="card">
        <h2>Camera permission</h2>
        <p className="muted">
          Puzzle Finder needs camera access to detect edges/corners locally on your device. If you denied permission,
          re-enable it in your browser settings and try again.
        </p>
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <p className="muted">
          The core feature is intended to run locally on your device. No account is required.
          (Any future optional sharing/upload features must be clearly opt-in.)
        </p>
      </div>
    </>
  );
}
