import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import HelpPage from './pages/HelpPage';
import CameraPage from './pages/CameraPage';

function TopNav() {
  return (
    <div className="header">
      <div className="brand">
        <h1>Puzzle Finder</h1>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <NavLink to="/" className={({ isActive }) => `navLink${isActive ? ' navLinkActive' : ''}`}>Scan</NavLink>
        <NavLink to="/help" className={({ isActive }) => `navLink${isActive ? ' navLinkActive' : ''}`}>Help</NavLink>
      </nav>
    </div>
  );
}


export default function App() {
  return (
    <HashRouter
      // Opt into React Router v7 behavior early to avoid noisy test warnings.
      // See: https://reactrouter.com/v6/upgrading/future
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <div className="container">
        <TopNav />
        <Routes>
          {/* v1: camera scanning is the primary entry point */}
          <Route path="/" element={<CameraPage />} />

          {/* Keep legacy route working for older links/bookmarks */}
          <Route path="/camera" element={<Navigate to="/" replace />} />
          <Route path="/help" element={<HelpPage />} />

          {/* Unknown routes return to the main scan experience */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
