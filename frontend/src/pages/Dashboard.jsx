import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [printers, setPrinters] = useState([]);

  useEffect(() => {
    api.get('/rapportage/dashboard').then(setData).catch(() => {});
    api.get('/ha/printer-status').then(setPrinters).catch(() => {});
  }, []);

  const jobsStatus = {};
  (data?.jobs_status || []).forEach(r => { jobsStatus[r.status] = r.c; });
  const maandData = data?.omzet_maand?.[0];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {new Date().toLocaleDateString('nl-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="label">Jobs deze maand</div>
          <div className="value">{maandData?.jobs ?? '—'}</div>
          <div className="sub">voltooid</div>
        </div>
        <div className="stat-card">
          <div className="label">Omzet deze maand</div>
          <div className="value">€{maandData?.omzet?.toFixed(2) ?? '0.00'}</div>
          <div className="sub">excl. BTW</div>
        </div>
        <div className="stat-card">
          <div className="label">Bezig</div>
          <div className="value" style={{ color: 'var(--accent2)' }}>{jobsStatus.bezig ?? 0}</div>
          <div className="sub">actieve jobs</div>
        </div>
        <div className="stat-card">
          <div className="label">Openstaand</div>
          <div className="value" style={{ color: 'var(--warn)' }}>€{data?.openstaand?.bedrag?.toFixed(2) ?? '0.00'}</div>
          <div className="sub">{data?.openstaand?.c ?? 0} offertes</div>
        </div>
        <div className="stat-card">
          <div className="label">kWh deze maand</div>
          <div className="value">{maandData?.kwh?.toFixed(1) ?? '—'}</div>
          <div className="sub">verbruikt</div>
        </div>
        <div className="stat-card">
          <div className="label">Gepland</div>
          <div className="value">{jobsStatus.gepland ?? 0}</div>
          <div className="sub">in wachtrij</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>Printer status (live HA)</h2>
          {printers.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Geen data van Home Assistant</p>
            : printers.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 500 }}>{p.naam}</span>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                  {p.status && <span style={{ color: p.status === 'printing' ? 'var(--accent2)' : 'var(--muted)' }}>{p.status}</span>}
                  {p.kwh != null && <span>{p.kwh.toFixed(2)} kWh</span>}
                </div>
              </div>
            ))
          }
        </div>

        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>Filamentstock</h2>
          {(data?.stock || []).length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Geen stock geregistreerd</p>
            : (data?.stock || []).map(s => (
              <div key={s.materiaal} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{s.materiaal}</span>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                  <span>{s.gram_totaal}g</span>
                  <span>€{s.waarde_eur}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>Omzet laatste maanden</h2>
        {(data?.omzet_maand || []).length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen voltooide jobs met kostprijs</p>
          : <table>
              <thead>
                <tr>
                  <th>Maand</th><th>Jobs</th><th>Omzet</th><th>Kost</th><th>Marge</th><th>kWh</th>
                </tr>
              </thead>
              <tbody>
                {data.omzet_maand.map(m => (
                  <tr key={m.maand}>
                    <td>{m.maand}</td>
                    <td>{m.jobs}</td>
                    <td>€{m.omzet?.toFixed(2)}</td>
                    <td>€{m.kost?.toFixed(2)}</td>
                    <td style={{ color: 'var(--accent2)' }}>
                      {m.omzet > 0 ? `${Math.round((m.omzet - m.kost) / m.omzet * 100)}%` : '—'}
                    </td>
                    <td>{m.kwh?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
