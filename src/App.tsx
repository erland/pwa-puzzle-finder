import React from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import HelpPage from './pages/HelpPage';
import CameraPage from './pages/CameraPage';

function TopNav() {
  const linkStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 10 };
  const active: React.CSSProperties = { ...linkStyle, background: '#1e1e2a', border: '1px solid #2a2a3a' };

  return (
    <div className="header">
      <div className="brand">
        <h1>Puzzle Finder</h1>
        <span className="badge">v1 MVP scaffold</span>
      </div>
      <nav className="nav">
        <NavLink to="/" end style={({ isActive }) => (isActive ? active : linkStyle)}>Home</NavLink>
        <NavLink to="/camera" style={({ isActive }) => (isActive ? active : linkStyle)}>Camera</NavLink>
        <NavLink to="/help" style={({ isActive }) => (isActive ? active : linkStyle)}>Help</NavLink>
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
