export default function HomePage() {
  return (
    <>
      <div className="card">
        <h2>Welcome</h2>
        <p className="muted">
          This is the MVP scaffold. Next steps will add: camera access, a canvas overlay, and OpenCV-based detection.
        </p>
      </div>

<div className="card">
  <h2>Try the camera overlay</h2>
  <p className="muted">
    Step 2 is now available: live camera stream with a canvas overlay (no OpenCV yet).
  </p>
  <div className="buttonRow">
    <a href="#/camera">Go to Camera</a>
  </div>
</div>
      <div className="card">
        <h2>MVP scope (v1)</h2>
        <ul>
          <li>Identify <strong>corner</strong> pieces (two straight outer sides)</li>
          <li>Identify <strong>edge</strong> pieces (one straight outer side)</li>
          <li>Highlight results on top of the camera view</li>
          <li>Prefer <em>Unknown</em> over false positives</li>
        </ul>
      </div>

      <div className="card">
        <h2>Quick checklist for best results</h2>
        <ul>
          <li>Use a plain, contrasting background if possible</li>
          <li>Spread pieces apart (no overlap)</li>
          <li>Even lighting; avoid glare and harsh shadows</li>
          <li>Use captured-frame mode for best accuracy (later)</li>
        </ul>
      </div>
    </>
  );
}
