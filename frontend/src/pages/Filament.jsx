import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState(type || { merk: '', materiaal: 'PLA+', inkoop_prijs_per_kg: '', dichtheid_g_per_cm3: 1.24, leverancier: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    try {
      if (type?.id) await api.put(`/filament/types/${type.id}`, form);
      else await api.post('/filament/types', form);
      onSaved();
    } catch (e) { alert(e.message); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{type?.id ? 'Filamenttype bewerken' : 'Nieuw filamenttype'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Merk *</label><input value={form.merk} onChange={e => set('merk', e.target.value)} placeholder="bv. Elegoo" /></div>
          <div className="form-group"><label>Materiaal *</label><input value={form.materiaal} onChange={e => set('materiaal', e.target.value)} placeholder="bv. PLA+" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Prijs/kg (€) *</label><input type="number" step="0.01" value={form.inkoop_prijs_per_kg} onChange={e => set('inkoop_prijs_per_kg', e.target.value)} /></div>
          <div className="form-group"><label>Dichtheid (g/cm³)</label><input type="number" step="0.01" value={form.dichtheid_g_per_cm3} onChange={e => set('dichtheid_g_per_cm3', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Leverancier</label><input value={form.leverancier || ''} onChange={e => set('leverancier', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

function RolModal({ types, onClose, onSaved }) {
  const [form, setForm] = useState({ filament_type_id: types[0]?.id || '', kleur: '', gewicht_gram_start: 1000, locatie: '', gekocht_op: new Date().toISOString().split('T')[0] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    try { await api.post('/filament/rollen', form); onSaved(); }
    catch (e) { alert(e.message); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Nieuwe rol toevoegen</h2><button className="btn" onClick={onClose}>✕</button></div>
        <div className="form-group">
          <label>Filamenttype *</label>
          <select value={form.filament_type_id} onChange={e => set('filament_type_id', e.target.value)}>
            {types.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Kleur *</label><input value={form.kleur} onChange={e => set('kleur', e.target.value)} placeholder="bv. Wit" /></div>
          <div className="form-group"><label>Startgewicht (g)</label><input type="number" value={form.gewicht_gram_start} onChange={e => set('gewicht_gram_start', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Locatie</label><input value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="bv. Rek A" /></div>
          <div className="form-group"><label>Aankoopdatum</label><input type="date" value={form.gekocht_op} onChange={e => set('gekocht_op', e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

export default function Filament() {
  const [types, setTypes] = useState([]);
  const [rollen, setRollen] = useState([]);
  const [tab, setTab] = useState('rollen');
  const [typeModal, setTypeModal] = useState(null);
  const [rolModal, setRolModal] = useState(false);

  const load = () => {
    api.get('/filament/types').then(setTypes);
    api.get('/filament/rollen').then(setRollen);
  };
  useEffect(() => { load(); }, []);

  async function toggleRol(rol) {
    await api.put(`/filament/rollen/${rol.id}`, { ...rol, actief: rol.actief ? 0 : 1 });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Filament</h1>
        <div style={{ display:'flex', gap:8 }}>
          {tab === 'types'  && <button className="btn primary" onClick={() => setTypeModal({})}>+ Nieuw type</button>}
          {tab === 'rollen' && <button className="btn primary" onClick={() => setRolModal(true)}>+ Nieuwe rol</button>}
        </div>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:'1.25rem' }}>
        {['rollen','types'].map(t => (
          <button key={t} className={`btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'rollen' ? 'Rollen op voorraad' : 'Filamenttypes'}
          </button>
        ))}
      </div>

      {tab === 'rollen' && (
        rollen.length === 0 ? <div className="empty">Geen rollen geregistreerd</div> :
        <div className="card" style={{ padding:0 }}>
          <table>
            <thead><tr><th>Type</th><th>Kleur</th><th>Huidig gewicht</th><th>Restwaarde</th><th>Locatie</th><th>Status</th><th>Acties</th></tr></thead>
            <tbody>
              {rollen.map(r => (
                <tr key={r.id} style={{ opacity: r.actief ? 1 : 0.5 }}>
                  <td>
                    <div style={{ fontWeight:500 }}>{r.merk} {r.materiaal}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>€{r.inkoop_prijs_per_kg?.toFixed(2)}/kg</div>
                  </td>
                  <td>{r.kleur || <span style={{ color:'var(--muted)' }}>—</span>}</td>
                  <td>
                    <div>{r.gewicht_gram_huidig}g</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>van {r.gewicht_gram_start}g</div>
                  </td>
                  <td style={{ color:'var(--accent2)' }}>€{r.restwaarde_eur}</td>
                  <td style={{ color:'var(--muted)' }}>{r.locatie || '—'}</td>
                  <td><span className={`badge ${r.actief ? 'bezig' : 'geannuleerd'}`}>{r.actief ? 'actief' : 'leeg'}</span></td>
                  <td>
                    <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => toggleRol(r)}>
                      {r.actief ? 'Markeer leeg' : 'Heractiveer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'types' && (
        types.length === 0 ? <div className="empty">Geen filamenttypes</div> :
        <div className="card" style={{ padding:0 }}>
          <table>
            <thead><tr><th>Merk</th><th>Materiaal</th><th>Prijs/kg</th><th>Dichtheid</th><th>Leverancier</th><th>Acties</th></tr></thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:500 }}>{t.merk}</td>
                  <td>{t.materiaal}</td>
                  <td>€{t.inkoop_prijs_per_kg?.toFixed(2)}</td>
                  <td style={{ color:'var(--muted)' }}>{t.dichtheid_g_per_cm3} g/cm³</td>
                  <td style={{ color:'var(--muted)' }}>{t.leverancier || '—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => setTypeModal(t)}>✏</button>
                      <button className="btn danger" style={{ fontSize:11, padding:'4px 8px' }} onClick={async () => { if(confirm('Verwijderen?')) { await api.delete(`/filament/types/${t.id}`); load(); }}}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {typeModal !== null && <TypeModal type={typeModal?.id ? typeModal : null} onClose={() => setTypeModal(null)} onSaved={() => { setTypeModal(null); load(); }} />}
      {rolModal && <RolModal types={types} onClose={() => setRolModal(false)} onSaved={() => { setRolModal(false); load(); }} />}
    </div>
  );
}
