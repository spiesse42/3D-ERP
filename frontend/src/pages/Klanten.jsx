import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

function KlantModal({ klant, onClose, onSaved }) {
  const [form, setForm] = useState(klant || {
    naam:'', voornaam:'', email:'', telefoon:'', gsm:'',
    straat:'', huisnummer:'', postcode:'', gemeente:'',
    btw_nummer:'', type:'particulier', notities:''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    try {
      const payload = { ...form, gemeente: form.gemeente ? form.gemeente.toUpperCase() : '' };
      if (klant?.id) await api.put(`/klanten/${klant.id}`, payload);
      else await api.post('/klanten', payload);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:520 }}>
        <div className="modal-header">
          <h2>{klant?.id ? 'Klant bewerken' : 'Nieuwe klant'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* Type */}
        <div className="form-group">
          <label>Type klant</label>
          <div style={{ display:'flex', gap:8 }}>
            {['particulier','zakelijk'].map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={`btn${form.type === t ? ' primary' : ''}`}
                style={{ flex:1, textTransform:'capitalize' }}>
                {t === 'particulier' ? '👤 Particulier' : '🏢 Zakelijk'}
              </button>
            ))}
          </div>
        </div>

        {/* Naam */}
        <div className="form-row">
          <div className="form-group">
            <label>Voornaam</label>
            <input value={form.voornaam || ''} onChange={e => set('voornaam', e.target.value)} placeholder="Voornaam" />
          </div>
          <div className="form-group">
            <label>Naam / Bedrijfsnaam *</label>
            <input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Naam" />
          </div>
        </div>

        {/* Adres */}
        <div className="form-row">
          <div className="form-group" style={{ flex:2 }}>
            <label>Straat</label>
            <input value={form.straat || ''} onChange={e => set('straat', e.target.value)} placeholder="Straatnaam" />
          </div>
          <div className="form-group" style={{ flex:1 }}>
            <label>Nr</label>
            <input value={form.huisnummer || ''} onChange={e => set('huisnummer', e.target.value)} placeholder="Nr" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex:1 }}>
            <label>Postcode</label>
            <input value={form.postcode || ''} onChange={e => set('postcode', e.target.value)} placeholder="0000" />
          </div>
          <div className="form-group" style={{ flex:2 }}>
            <label>Gemeente</label>
            <input value={form.gemeente || ''} onChange={e => set('gemeente', e.target.value)} placeholder="Gemeente" />
          </div>
        </div>

        {/* Contact */}
        <div className="form-row">
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Telefoon</label>
            <input value={form.telefoon || ''} onChange={e => set('telefoon', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>GSM</label>
            <input value={form.gsm || ''} onChange={e => set('gsm', e.target.value)} />
          </div>
          {form.type === 'zakelijk' && (
            <div className="form-group">
              <label>BTW-nummer</label>
              <input value={form.btw_nummer || ''} onChange={e => set('btw_nummer', e.target.value)} placeholder="BE0123456789" />
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Notities</label>
          <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

export default function Klanten() {
  const [klanten, setKlanten] = useState([]);
  const [modal, setModal] = useState(null);
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => api.get('/klanten').then(setKlanten);
  useEffect(() => { load(); }, []);

  const filtered = klanten.filter(k => {
    const matchZoek = !zoek ||
      k.naam.toLowerCase().includes(zoek.toLowerCase()) ||
      (k.voornaam||'').toLowerCase().includes(zoek.toLowerCase()) ||
      (k.email||'').toLowerCase().includes(zoek.toLowerCase());
    const matchType = !filter || k.type === filter;
    return matchZoek && matchType;
  });

  async function del(id) {
    if (!confirm('Klant verwijderen? Jobs blijven bewaard.')) return;
    await api.delete(`/klanten/${id}`);
    load();
  }

  function volledigAdres(k) {
    const delen = [k.straat, k.huisnummer, k.postcode, k.gemeente].filter(Boolean);
    return delen.length ? delen.join(' ') : '—';
  }

  return (
    <div>
      <div className="page-header">
        <h1>Klanten</h1>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="">Alle types</option>
            <option value="particulier">👤 Particulier</option>
            <option value="zakelijk">🏢 Zakelijk</option>
          </select>
          <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoeken..." style={{ width:200 }} />
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe klant</button>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty">Geen klanten gevonden</div>
        : <div className="card" style={{ padding:0 }}>
            <table>
              <thead>
                <tr><th>Naam</th><th>Type</th><th>Adres</th><th>Tel / GSM</th><th>E-mail</th><th>BTW</th><th>Jobs</th><th>Acties</th></tr>
              </thead>
              <tbody>
                {filtered.map(k => (
                  <tr key={k.id} style={{ cursor:'pointer' }} onClick={() => setModal(k)}>
                    <td>
                      <div style={{ fontWeight:500 }}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</div>
                      {k.type === 'zakelijk' && k.btw_nummer && (
                        <div style={{ fontSize:11, color:'var(--muted)' }}>BTW: {k.btw_nummer}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${k.type === 'zakelijk' ? 'gepland' : 'voltooid'}`}>
                        {k.type === 'zakelijk' ? '🏢 Zakelijk' : '👤 Particulier'}
                      </span>
                    </td>
                    <td style={{ color:'var(--muted)', fontSize:12 }}>{volledigAdres(k)}</td>
                    <td style={{ fontSize:12 }}>
                      {k.telefoon && <div>{k.telefoon}</div>}
                      {k.gsm && <div style={{ color:'var(--muted)' }}>{k.gsm}</div>}
                      {!k.telefoon && !k.gsm && <span style={{ color:'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize:12 }}>
                      {k.email || <span style={{ color:'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>
                      {k.btw_nummer || '—'}
                    </td>
                    <td>{k.aantal_jobs}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => setModal(k)}>✏</button>
                        <button className="btn danger" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => del(k.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }

      {modal !== null && (
        <KlantModal
          klant={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
