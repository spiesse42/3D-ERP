import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const OFFERTE_STATUSSEN = ['concept','verstuurd','goedgekeurd','gefactureerd','betaald','geannuleerd'];
const JOB_STATUSSEN     = ['gepland','bezig','voltooid','gefaald','geannuleerd'];

// ─── StatusBadge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

// ─── JobRij ──────────────────────────────────────────────────────────────────
function JobRij({ job, onStatusChange }) {
  const navigate = useNavigate();

  function ga() {
    navigate(`/jobs?highlight=${job.id}`);
  }

  return (
    <tr style={{ cursor: 'pointer' }} onClick={ga}>
      <td style={{ fontWeight: 500 }}>{job.naam}</td>
      <td>{job.klant_naam || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
      <td>{job.printer_naam}</td>
      <td onClick={e => e.stopPropagation()}>
        <select
          value={job.status}
          style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
          onChange={async e => {
            await api.patch(`/jobs/${job.id}/status`, { status: e.target.value });
            onStatusChange();
          }}
        >
          {JOB_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
        {job.aangemaakt_op ? new Date(job.aangemaakt_op).toLocaleDateString('nl-BE') : '—'}
      </td>
      <td style={{ color: 'var(--accent2)' }}>
        {job.verkoopprijs != null ? `€${job.verkoopprijs.toFixed(2)}` : '—'}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={ga}>→ Bekijk</button>
      </td>
    </tr>
  );
}

// ─── OfferteRij ──────────────────────────────────────────────────────────────
function OfferteRij({ offerte, onStatusChange }) {
  const navigate = useNavigate();

  function ga() {
    navigate('/offertes');
  }

  return (
    <tr style={{ cursor: 'pointer' }} onClick={ga}>
      <td style={{ fontWeight: 500 }}>{offerte.nummer}</td>
      <td>{offerte.klant_naam || '—'}</td>
      <td onClick={e => e.stopPropagation()}>
        <select
          value={offerte.status}
          style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
          onChange={async e => {
            await api.patch(`/offertes2/${offerte.id}/status`, { status: e.target.value });
            onStatusChange();
          }}
        >
          {OFFERTE_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{ color: 'var(--accent2)' }}>€{offerte.totaal?.toFixed(2) ?? '0.00'}</td>
      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
        {offerte.aangemaakt_op ? new Date(offerte.aangemaakt_op).toLocaleDateString('nl-BE') : '—'}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={ga}>→ Bekijk</button>
      </td>
    </tr>
  );
}

// ─── DetailSectie ─────────────────────────────────────────────────────────────
function DetailSectie({ actief, onRefresh }) {
  const [items, setItems]   = useState([]);
  const [laden, setLaden]   = useState(false);

  useEffect(() => {
    if (!actief) return;
    setLaden(true);
    setItems([]);

    const nu = new Date();
    const eersteVanMaand = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-01`;

    const laadData = async () => {
      try {
        if (actief === 'gepland') {
          const data = await api.get('/jobs?status=gepland');
          setItems(data);
        } else if (actief === 'jobs_maand') {
          const data = await api.get('/jobs?status=voltooid');
          const filtered = data.filter(j => j.voltooid_op && j.voltooid_op >= eersteVanMaand);
          setItems(filtered);
        } else if (actief === 'totaal_voltooid') {
          const data = await api.get('/jobs?status=voltooid');
          setItems(data);
        } else if (actief === 'kwh_maand') {
          const data = await api.get('/jobs?status=voltooid');
          const filtered = data.filter(j => j.voltooid_op && j.voltooid_op >= eersteVanMaand);
          setItems(filtered);
        } else if (actief === 'omzet') {
          const data = await api.get('/jobs?status=voltooid');
          setItems(data.filter(j => j.verkoopprijs != null));
        } else if (actief === 'openstaand') {
          const data = await api.get('/offertes2');
          setItems(data.filter(o => ['concept','verstuurd','goedgekeurd'].includes(o.status)));
        }
      } catch {}
      setLaden(false);
    };

    laadData();
  }, [actief]);

  if (!actief) return null;

  const isOfferte = actief === 'openstaand';

  const kolommen = isOfferte
    ? ['Nummer', 'Klant', 'Status', 'Totaal', 'Datum', '']
    : ['Naam', 'Klant', 'Printer', 'Status', 'Datum', 'Prijs', ''];

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>
        {actief === 'gepland'        && 'Geplande jobs'}
        {actief === 'jobs_maand'     && 'Jobs deze maand'}
        {actief === 'totaal_voltooid'&& 'Alle voltooide jobs'}
        {actief === 'kwh_maand'      && 'Jobs deze maand — energieverbruik'}
        {actief === 'omzet'          && 'Voltooide jobs met prijs'}
        {actief === 'openstaand'     && 'Openstaande offertes'}
        <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
          ({laden ? '…' : items.length})
        </span>
      </h2>

      {laden && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Laden...</p>}

      {!laden && items.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Geen records gevonden.</p>
      )}

      {!laden && items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>{kolommen.map((k, i) => <th key={i} style={{ textAlign: 'left' }}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {isOfferte
                ? items.map(o => <OfferteRij key={o.id} offerte={o} onStatusChange={() => { onRefresh(); }} />)
                : items.map(j => <JobRij key={j.id} job={j} onStatusChange={() => { onRefresh(); }} />)
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── KpiKaart ─────────────────────────────────────────────────────────────────
function KpiKaart({ id, label, waarde, sub, actief, onClick, kleur }) {
  return (
    <div
      className="stat-card"
      onClick={() => onClick(id)}
      style={{
        cursor: 'pointer',
        outline: actief ? '2px solid var(--accent)' : '2px solid transparent',
        background: actief ? 'var(--bg3)' : undefined,
        transition: 'outline 0.15s, background 0.15s',
      }}
    >
      <div className="label">{label}</div>
      <div className="value" style={{ color: kleur || undefined }}>{waarde}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function Statistieken() {
  const [data,    setData]    = useState(null);
  const [actief,  setActief]  = useState(null);

  const load = () => api.get('/rapportage/dashboard').then(setData).catch(() => {});

  useEffect(() => { load(); }, []);

  const maandData  = data?.omzet_maand?.[0];
  const jobsStatus = {};
  (data?.jobs_status || []).forEach(r => { jobsStatus[r.status] = r.c; });

  function toggleKaart(id) {
    setActief(v => v === id ? null : id);
  }

  const kaarten = [
    {
      id:    'gepland',
      label: 'Gepland',
      waarde: jobsStatus.gepland ?? 0,
      sub:   'in wachtrij',
    },
    {
      id:    'jobs_maand',
      label: 'Jobs deze maand',
      waarde: maandData?.jobs ?? '—',
      sub:   'voltooid',
    },
    {
      id:    'totaal_voltooid',
      label: 'Totaal voltooid',
      waarde: jobsStatus.voltooid ?? 0,
      sub:   'alle tijd',
    },
    {
      id:    'kwh_maand',
      label: 'kWh deze maand',
      waarde: maandData?.kwh?.toFixed(1) ?? '—',
      sub:   'verbruikt',
    },
    {
      id:    'omzet',
      label: 'Omzet deze maand',
      waarde: `€${maandData?.omzet?.toFixed(2) ?? '0.00'}`,
      sub:   'excl. BTW',
    },
    {
      id:    'openstaand',
      label: 'Openstaand',
      waarde: `€${data?.openstaand?.bedrag?.toFixed(2) ?? '0.00'}`,
      sub:   `${data?.openstaand?.c ?? 0} offertes`,
      kleur: 'var(--warn)',
    },
  ];

  return (
    <div>
      <div className="page-header"><h1>Statistieken</h1></div>

      {/* KPI kaarten */}
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        {kaarten.map(k => (
          <KpiKaart
            key={k.id}
            {...k}
            actief={actief === k.id}
            onClick={toggleKaart}
          />
        ))}
      </div>

      {/* Detail sectie */}
      <DetailSectie
        actief={actief}
        onRefresh={() => { load(); }}
      />

      {/* Omzet per maand tabel */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: '1rem' }}>Omzet per maand</h2>
        {(data?.omzet_maand || []).length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen voltooide jobs met kostprijs</p>
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

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <a className="btn" href="/api/rapportage/csv/jobs" download>↓ Jobs exporteren (CSV)</a>
      </div>
    </div>
  );
}
