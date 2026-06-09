import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const STATUS_VOLGORDE = ['concept','verstuurd','goedgekeurd','gefactureerd','betaald','geannuleerd'];

function OfferteModal({ klanten, jobs, onClose, onSaved }) {
  const [klant_id, setKlantId] = useState('');
  const [btw_pct, setBtw] = useState(21);
  const [geldig_tot, setGeldig] = useState('');
  const [notities, setNotities] = useState('');
  const [regels, setRegels] = useState([{ omschrijving: '', aantal: 1, eenheidsprijs: '', job_id: null }]);

  function addRegel() { setRegels(r => [...r, { omschrijving: '', aantal: 1, eenheidsprijs: '', job_id: null }]); }
  function setRegel(i, k, v) { setRegels(r => r.map((x, idx) => idx === i ? { ...x, [k]: v } : x)); }
  function removeRegel(i) { setRegels(r => r.filter((_, idx) => idx !== i)); }

  function fillFromJob(i, jobId) {
    const job = jobs.find(j => j.id === parseInt(jobId));
    if (job) {
      setRegel(i, 'job_id', job.id);
      setRegel(i, 'omschrijving', job.naam);
      if (job.verkoopprijs) setRegel(i, 'eenheidsprijs', job.verkoopprijs);
    }
  }

  const subtotaal = regels.reduce((s, r) => s + ((r.aantal || 0) * (parseFloat(r.eenheidsprijs) || 0)), 0);
  const btw = subtotaal * btw_pct / 100;

  async function save() {
    if (!klant_id) return alert('Selecteer een klant');
    try {
      await api.post('/offertes', { klant_id: parseInt(klant_id), btw_pct, geldig_tot: geldig_tot || null, notities: notities || null, regels: regels.map(r => ({ ...r, eenheidsprijs: parseFloat(r.eenheidsprijs) || 0 })) });
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 600 }}>
        <div className="modal-header"><h2>Nieuwe offerte</h2><button className="btn" onClick={onClose}>✕</button></div>
        <div className="form-row">
          <div className="form-group">
            <label>Klant *</label>
            <select value={klant_id} onChange={e => setKlantId(e.target.value)}>
              <option value="">— selecteer klant —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>BTW %</label>
            <input type="number" value={btw_pct} onChange={e => setBtw(parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Geldig tot</label><input type="date" value={geldig_tot} onChange={e => setGeldig(e.target.value)} /></div>
          <div className="form-group"><label>Notities</label><input value={notities} onChange={e => setNotities(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Regels</p>
            <button className="btn" style={{ fontSize: 11 }} onClick={addRegel}>+ Regel</button>
          </div>
          {regels.map((regel, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <div>
                <select style={{ marginBottom: 4, fontSize: 12 }} value={regel.job_id || ''} onChange={e => fillFromJob(i, e.target.value)}>
                  <option value="">— koppel job (optioneel) —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.naam} {j.verkoopprijs ? `(€${j.verkoopprijs.toFixed(2)})` : ''}</option>)}
                </select>
                <input placeholder="Omschrijving *" value={regel.omschrijving} onChange={e => setRegel(i, 'omschrijving', e.target.value)} />
              </div>
              <input type="number" min="1" placeholder="Aantal" value={regel.aantal} onChange={e => setRegel(i, 'aantal', parseInt(e.target.value))} />
              <input type="number" step="0.01" placeholder="Prijs/stuk" value={regel.eenheidsprijs} onChange={e => setRegel(i, 'eenheidsprijs', e.target.value)} />
              <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => removeRegel(i)}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '1rem', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--muted)' }}>Subtotaal</span><span>€{subtotaal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--muted)' }}>BTW {btw_pct}%</span><span>€{btw.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16 }}>
            <span>Totaal</span><span style={{ color: 'var(--accent2)' }}>€{(subtotaal + btw).toFixed(2)}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Offerte aanmaken</button>
        </div>
      </div>
    </div>
  );
}

export default function Offertes() {
  const [offertes, setOffertes] = useState([]);
  const [klanten, setKlanten] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [modal, setModal] = useState(false);

  const load = () => api.get('/offertes').then(setOffertes);
  useEffect(() => {
    load();
    api.get('/klanten').then(setKlanten);
    api.get('/jobs').then(setJobs);
  }, []);

  async function updateStatus(id, status) {
    await api.patch(`/offertes/${id}/status`, { status });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <button className="btn primary" onClick={() => setModal(true)}>+ Nieuwe offerte</button>
      </div>

      {offertes.length === 0
        ? <div className="empty">Geen offertes</div>
        : <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Nummer</th><th>Klant</th><th>Status</th><th>Totaal</th><th>Aangemaakt</th><th>Acties</th></tr></thead>
              <tbody>
                {offertes.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{o.nummer}</td>
                    <td>{o.klant_naam}</td>
                    <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    <td style={{ color: 'var(--accent2)', fontWeight: 500 }}>€{o.totaal.toFixed(2)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{o.aangemaakt_op?.split('T')[0]}</td>
                    <td>
                      <select style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }} value={o.status} onChange={e => updateStatus(o.id, e.target.value)}>
                        {STATUS_VOLGORDE.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }

      {modal && (
        <OfferteModal
          klanten={klanten}
          jobs={jobs}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); load(); }}
        />
      )}
    </div>
  );
}
