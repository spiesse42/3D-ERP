import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

function KlantModal({ klant, onClose, onSaved }) {
  const [form, setForm] = useState(klant || { naam: '', email: '', telefoon: '', adres: '', btw_nummer: '', notities: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    try {
      if (klant?.id) await api.put(`/klanten/${klant.id}`, form);
      else await api.post('/klanten', form);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{klant?.id ? 'Klant bewerken' : 'Nieuwe klant'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label>Naam *</label>
          <input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Naam of bedrijfsnaam" />
        </div>
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
        <div className="form-group">
          <label>Adres</label>
          <input value={form.adres || ''} onChange={e => set('adres', e.target.value)} />
        </div>
        <div className="form-group">
          <label>BTW-nummer</label>
          <input value={form.btw_nummer || ''} onChange={e => set('btw_nummer', e.target.value)} placeholder="BE0123456789" />
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

  const load = () => api.get('/klanten').then(setKlanten);
  useEffect(() => { load(); }, []);

  const filtered = klanten.filter(k =>
    k.naam.toLowerCase().includes(zoek.toLowerCase()) ||
    (k.email || '').toLowerCase().includes(zoek.toLowerCase())
  );

  async function del(id) {
    if (!confirm('Klant verwijderen? Jobs blijven bewaard.')) return;
    await api.delete(`/klanten/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Klanten</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoeken..." style={{ width: 200 }} />
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe klant</button>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty">Geen klanten gevonden</div>
        : <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Naam</th><th>E-mail</th><th>Telefoon</th><th>BTW</th><th>Jobs</th><th>Acties</th></tr>
              </thead>
              <tbody>
                {filtered.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 500 }}>{k.naam}</td>
                    <td style={{ color: 'var(--muted)' }}>{k.email || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{k.telefoon || '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{k.btw_nummer || '—'}</td>
                    <td>{k.aantal_jobs}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setModal(k)}>✏</button>
                        <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del(k.id)}>✕</button>
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
