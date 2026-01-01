import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import HelpPage from './pages/HelpPage';
import CameraPage from './pages/CameraPage';

function TopNav() {
  return (
    <div className="header">
      <div className="brand">
        <h1>Puzzle Finder</h1>
        <span className="badge">v1 MVP scaffold</span>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <NavLink to="/" className={({ isActive }) => `navLink${isActive ? ' navLinkActive' : ''}`}>Home</NavLink>
        <NavLink to="/camera" className={({ isActive }) => `navLink${isActive ? ' navLinkActive' : ''}`}>Camera</NavLink>
        <NavLink to="/help" className={({ isActive }) => `navLink${isActive ? ' navLinkActive' : ''}`}>Help</NavLink>
      </nav>
    </div>
  );
}


export default function App() {
  return (
    <HashRouter>
      <div className="container">
        <TopNav />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
