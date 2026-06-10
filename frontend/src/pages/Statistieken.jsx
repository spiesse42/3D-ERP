import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Statistieken() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/rapportage/dashboard').then(setData).catch(() => {});
  }, []);

  const maandData = data?.omzet_maand?.[0];
  const jobsStatus = {};
  (data?.jobs_status || []).forEach(r => { jobsStatus[r.status] = r.c; });

  return (
    <div>
      <div className="page-header"><h1>Statistieken</h1></div>

      <div className="stat-grid" style={{ marginBottom:'1.5rem' }}>
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
          <div className="label">Openstaand</div>
          <div className="value" style={{ color:'var(--warn)' }}>€{data?.openstaand?.bedrag?.toFixed(2) ?? '0.00'}</div>
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
        <div className="stat-card">
          <div className="label">Totaal voltooid</div>
          <div className="value">{jobsStatus.voltooid ?? 0}</div>
          <div className="sub">alle tijd</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>Omzet per maand</h2>
        {(data?.omzet_maand || []).length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>Nog geen voltooide jobs met kostprijs</p>
          : <table>
              <thead>
                <tr><th>Maand</th><th>Jobs</th><th>Omzet</th><th>Kost</th><th>Marge</th><th>kWh</th></tr>
              </thead>
              <tbody>
                {data.omzet_maand.map(m => (
                  <tr key={m.maand}>
                    <td>{m.maand}</td>
                    <td>{m.jobs}</td>
                    <td>€{m.omzet?.toFixed(2)}</td>
                    <td>€{m.kost?.toFixed(2)}</td>
                    <td style={{ color:'var(--accent2)' }}>
                      {m.omzet > 0 ? `${Math.round((m.omzet - m.kost) / m.omzet * 100)}%` : '—'}
                    </td>
                    <td>{m.kwh?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>

      <div style={{ marginTop:'1rem', display:'flex', justifyContent:'flex-end' }}>
        <a className="btn" href="/api/rapportage/csv/jobs" download>↓ Jobs exporteren (CSV)</a>
      </div>
    </div>
  );
}
