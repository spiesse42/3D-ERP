import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const STATUS_VOLGORDE = ['concept','verstuurd','goedgekeurd','gefactureerd','betaald','geannuleerd'];

function statusKleur(s) {
  return { concept:'#f59e0b', verstuurd:'#60a5fa', goedgekeurd:'#34d399',
           gefactureerd:'#a78bfa', betaald:'#22c55e', geannuleerd:'#6b7280' }[s] || '#6b7280';
}

export default function Offertes() {
  const [offertes, setOffertes] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = () => api.get('/offertes').then(setOffertes);
  useEffect(() => { load(); }, []);

  async function updateStatus(id, status) {
    await api.patch(`/offertes/${id}/status`, { status });
    load();
    if (detail?.id === id) setDetail(d => ({ ...d, status }));
  }

  async function herhaal(id) {
    try {
      const r = await api.post(`/offertes/${id}/herhaal`, {});
      alert(`${r.bericht}\nNieuwe job ID: ${r.job_id} — ga naar Jobs om de kostprijs te berekenen.`);
    } catch(e) { alert(e.message); }
  }

  async function openDetail(id) {
    const d = await api.get(`/offertes/${id}`);
    setDetail(d);
  }

  async function del(id) {
    if (!confirm('Offerte verwijderen?')) return;
    await api.delete(`/offertes/${id}`);
    load();
    if (detail?.id === id) setDetail(null);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <p style={{ fontSize:12, color:'var(--muted)' }}>
          Offertes worden aangemaakt vanuit de kostprijsberekening bij een job.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail ? '1fr 1fr' : '1fr', gap:'1rem' }}>
        {/* Lijst */}
        <div>
          {offertes.length === 0
            ? <div className="empty">
                <p>Nog geen offertes</p>
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>
                  Ga naar Jobs → € Kost → bereken → klik "📋 Maak offerte"
                </p>
              </div>
            : <div className="card" style={{ padding:0 }}>
                <table>
                  <thead>
                    <tr><th>Nummer</th><th>Klant</th><th>Print</th><th>Status</th><th>Totaal</th><th>Acties</th></tr>
                  </thead>
                  <tbody>
                    {offertes.map(o => (
                      <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => openDetail(o.id)}>
                        <td style={{ fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{o.nummer}</td>
                        <td>{o.klant_voornaam ? `${o.klant_voornaam} ${o.klant_naam}` : o.klant_naam}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{o.job_naam || '—'}</td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:600, color: statusKleur(o.status),
                            background: statusKleur(o.status)+'22', padding:'2px 8px', borderRadius:20 }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ color:'var(--accent2)', fontWeight:500 }}>€{o.totaal?.toFixed(2)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="btn" style={{ fontSize:10, padding:'3px 7px' }}
                              onClick={() => herhaal(o.id)} title="Herhaalorder">🔄</button>
                            <button className="btn danger" style={{ fontSize:10, padding:'3px 7px' }}
                              onClick={() => del(o.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

        {/* Detail */}
        {detail && (
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontSize:16, fontWeight:700 }}>{detail.nummer}</h2>
              <button className="btn" onClick={() => setDetail(null)}>✕</button>
            </div>

            {/* Klantinfo */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'1rem', fontSize:13 }}>
              <div style={{ fontWeight:600 }}>
                {detail.klant_voornaam ? `${detail.klant_voornaam} ${detail.klant_naam}` : detail.klant_naam}
              </div>
              {detail.email && <div style={{ color:'var(--muted)' }}>✉ {detail.email}</div>}
            </div>

            {/* Status */}
            <div className="form-group">
              <label>Status</label>
              <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)}>
                {STATUS_VOLGORDE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Kostendetail uit snapshot */}
            {detail.kostprijs_snapshot && (() => {
              const snap = JSON.parse(detail.kostprijs_snapshot);
              return (
                <div style={{ fontSize:12, marginBottom:'1rem' }}>
                  <div style={{ fontWeight:600, marginBottom:6, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', fontSize:11 }}>Kostprijsdetail</div>
                  {[
                    ['Materiaal', snap.materiaal_kost],
                    ['Energie', snap.energie_kost],
                    ['Arbeid', snap.arbeid_kost],
                    ['Extra', snap.extra_totaal],
                  ].filter(([,v]) => v > 0).map(([label, val]) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ color:'var(--muted)' }}>{label}</span>
                      <span>€{(val||0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', color:'var(--muted)' }}>
                    <span>Subtotaal</span><span>€{snap.totaal_kost?.toFixed(2)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', color:'var(--muted)' }}>
                    <span>Marge ({snap.winstmarge_pct}%)</span>
                    <span>€{((snap.verkoopprijs||0)-(snap.totaal_kost||0)).toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Totalen */}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, color:'var(--muted)' }}>
              <span>Excl. BTW</span><span>€{detail.subtotaal?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, color:'var(--muted)' }}>
              <span>BTW {detail.btw_pct}%</span><span>€{detail.btw_bedrag?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', fontWeight:700, fontSize:18 }}>
              <span>Totaal</span>
              <span style={{ color:'var(--accent2)' }}>€{detail.totaal?.toFixed(2)}</span>
            </div>

            {detail.notities && (
              <div style={{ background:'#fffbeb', borderLeft:'3px solid #f59e0b', padding:'8px 12px', borderRadius:4, fontSize:12, color:'#664400', marginTop:8 }}>
                📝 {detail.notities}
              </div>
            )}

            <div style={{ marginTop:'1rem', display:'flex', gap:8 }}>
              <button className="btn" style={{ flex:1 }} onClick={() => herhaal(detail.id)}>
                🔄 Herhaalorder
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
