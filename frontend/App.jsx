import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Jobs from './pages/Jobs.jsx';
import Klanten from './pages/Klanten.jsx';
import Filament from './pages/Filament.jsx';
import Bestellingen from './pages/Bestellingen.jsx';
import Offertes from './pages/Offertes.jsx';
import Financien from './pages/Financien.jsx';
import Statistieken from './pages/Statistieken.jsx';
import Instellingen from './pages/Instellingen.jsx';
import './App.css';

const NAV = [
  { to: '/',              icon: '⬛', label: 'Dashboard' },
  { to: '/jobs',          icon: '🖨',  label: 'Jobs' },
  { to: '/klanten',       icon: '👤', label: 'Klanten' },
  { to: '/filament',      icon: '🧵', label: 'Artikelen' },
  { to: '/bestellingen',  icon: '📦', label: 'Bestellingen' },
  { to: '/offertes',      icon: '📄', label: 'Offertes' },
  { to: '/financien',     icon: '💶', label: 'Financiën' },
  { to: '/statistieken',  icon: '📊', label: 'Statistieken' },
  { to: '/instellingen',  icon: '⚙',  label: 'Instellingen' },
];

function AutoSaveIndicator() {
  const [actief, setActief] = useState(false);

  useEffect(() => {
    const handler = () => {
      setActief(true);
      setTimeout(() => setActief(false), 3000);
    };
    window.addEventListener('erp-autosave', handler);
    return () => window.removeEventListener('erp-autosave', handler);
  }, []);

  if (!actief) return null;
  return (
    <div style={{
      position:'fixed', top:12, right:16, zIndex:9999,
      background:'var(--bg2)', border:'1px solid var(--accent2)',
      borderRadius:20, padding:'4px 12px', fontSize:11,
      color:'var(--accent2)', display:'flex', alignItems:'center', gap:6,
      boxShadow:'0 0 8px rgba(34,197,94,0.3)',
      animation:'fadeIn 0.2s ease'
    }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent2)', display:'inline-block' }} />
      Automatisch bewaard
    </div>
  );
}

const basename = window.location.pathname.replace(
  /\/(jobs|klanten|filament|bestellingen|offertes|financien|statistieken|instellingen).*$/, ''
);

export default function App() {
  return (
    <BrowserRouter basename={basename}>
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
        <AutoSaveIndicator />
        <main className="content">
          <Routes>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/jobs"          element={<Jobs />} />
            <Route path="/klanten"       element={<Klanten />} />
            <Route path="/filament"      element={<Filament />} />
            <Route path="/bestellingen"  element={<Bestellingen />} />
            <Route path="/offertes"      element={<Offertes />} />
            <Route path="/financien"     element={<Financien />} />
            <Route path="/statistieken"  element={<Statistieken />} />
            <Route path="/instellingen"  element={<Instellingen />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
