import { useState } from 'react';
import { api } from '../lib/api.js';

// Gedeeld klant-formulier — zelfde velden/validatie/stijl overal in de ERP
// (Klanten-tab én rechtstreeks vanuit Offertes). 1 bron van waarheid: wijzig
// hier, en elke plek die deze modal gebruikt krijgt automatisch dezelfde
// velden.
export default function KlantModal({ klant, onClose, onSaved }) {
  const [form, setForm] = useState(klant || {
    naam:'', voornaam:'', bedrijfsnaam:'', email:'', telefoon:'', gsm:'',
    straat:'', huisnummer:'', postcode:'', gemeente:'',
    btw_nummer:'', type:'particulier', notities:''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.naam) return alert('Naam is verplicht');
    try {
      const payload = { ...form, gemeente: form.gemeente ? form.gemeente.toUpperCase() : '' };
      let id = klant?.id;
      if (id) await api.put(`/klanten/${id}`, payload);
      else { const r = await api.post('/klanten', payload); id = r.id; }
      // Geef het volledige, opgeslagen record terug — zodat een aanroeper
      // (bv. het offerteformulier) de nieuwe klant meteen kan selecteren.
      onSaved({ ...payload, id });
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Venster sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal" style={{ width:540 }}>
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
            <label>Naam *</label>
            <input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Familienaam" />
          </div>
        </div>

        {/* Bedrijfsnaam — alleen zakelijk */}
        {form.type === 'zakelijk' && (
          <div className="form-group">
            <label>Bedrijfsnaam</label>
            <input value={form.bedrijfsnaam || ''} onChange={e => set('bedrijfsnaam', e.target.value)} placeholder="Bedrijfsnaam" />
          </div>
        )}

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
