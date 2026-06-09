import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Jobs from './pages/Jobs.jsx';
import Klanten from './pages/Klanten.jsx';
import Filament from './pages/Filament.jsx';
import Offertes from './pages/Offertes.jsx';
import Instellingen from './pages/Instellingen.jsx';
import './App.css';

const NAV = [
  { to: '/',            icon: '⬛', label: 'Dashboard' },
  { to: '/jobs',        icon: '🖨',  label: 'Jobs' },
  { to: '/klanten',     icon: '👤', label: 'Klanten' },
  { to: '/filament',    icon: '🧵', label: 'Filament' },
  { to: '/offertes',    icon: '📄', label: 'Offertes' },
  { to: '/instellingen',icon: '⚙',  label: 'Instellingen' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="sidebar">
          <div className="sidebar-brand">
            <span className="brand-icon">▲</span>
            <span className="brand-name">3D Print ERP</span>
          </div>
          <ul>
            {NAV.map(({ to, icon, label }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                  <span className="nav-icon">{icon}</span>
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/"             element={<Dashboard />} />
            <Route path="/jobs"         element={<Jobs />} />
            <Route path="/klanten"      element={<Klanten />} />
            <Route path="/filament"     element={<Filament />} />
            <Route path="/offertes"     element={<Offertes />} />
            <Route path="/instellingen" element={<Instellingen />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
