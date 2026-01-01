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
        <h2>Recommended setup</h2>
        <ul>
          <li><strong>Background:</strong> a plain mat/sheet (dark or light) that contrasts with the pieces</li>
          <li><strong>Lighting:</strong> bright, even light; avoid reflections from glossy pieces</li>
          <li><strong>Spacing:</strong> keep pieces separated; avoid overlap</li>
          <li><strong>Stability:</strong> keep the camera steady; move slowly</li>
        </ul>
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
