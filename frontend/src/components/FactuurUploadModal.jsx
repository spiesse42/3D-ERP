// frontend/src/components/FactuurUploadModal.jsx — factuur (PDF) uploaden,
// laten uitlezen via Gemini (backend: /api/facturen/analyseer), en per regel
// kiezen: voorraad aanvullen (bestaand of nieuw artikeltype), registreren als
// kost (uitgaven, geen voorraad-impact), of negeren.
import { useState } from 'react';
import { api, BASE } from '../lib/api.js';

const CATEGORIEEN = [
  { waarde: 'filament',           label: '🧵 Filament' },
  { waarde: 'onderdeel',          label: '🔧 Onderdeel' },
  { waarde: 'verbruiksmateriaal', label: '🧪 Verbruiksmateriaal' },
  { waarde: 'overig',             label: '📦 Overig' },
];
const EENHEDEN = [
  { waarde: 'gram', label: 'gram (g)' },
  { waarde: 'stuk', label: 'stuk(s)' },
  { waarde: 'ml',   label: 'milliliter (ml)' },
];
const UITGAVEN_CATEGORIEEN = [
  'materiaal', 'energie', 'software', 'verzekering',
  'marketing', 'afschrijving', 'onderhoud', 'overig',
];

// Simpele woord-overlap match om een AI-herkende omschrijving alvast te
// koppelen aan een bestaand artikeltype — gebruiker kan dit altijd overrulen.
function gokType(omschrijving, types) {
  const woorden = (omschrijving || '').toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  if (!woorden.length || !types.length) return '';
  let beste = null, besteScore = 0;
  for (const t of types) {
    const label = `${t.merk} ${t.materiaal}`.toLowerCase();
    const score = woorden.filter(w => label.includes(w)).length;
    if (score > besteScore) { besteScore = score; beste = t; }
  }
  return besteScore > 0 ? beste.id : '';
}

function nieuweRegelState(r, types) {
  const eenheid = ['gram', 'stuk', 'ml'].includes(r.eenheid_gok) ? r.eenheid_gok : 'stuk';
  const typeId = gokType(r.omschrijving, types);
  return {
    omschrijving: r.omschrijving || '',
    aantal: r.aantal ?? '',
    totaal: r.totaal ?? '',
    actie: 'voorraad',
    typeId: typeId || 'nieuw',
    nieuwType: { merk: '', materiaal: r.omschrijving || '', categorie: 'overig', eenheid },
    kostCategorie: 'overig',
    negeer: false,
  };
}

export default function FactuurUploadModal({ types, onClose, onDone }) {
  const [stap, setStap] = useState('upload'); // upload | laden | controle | opslaan
  const [bestand, setBestand] = useState(null);
  const [fout, setFout] = useState('');
  const [leverancier, setLeverancier] = useState('');
  const [datum, setDatum] = useState('');
  const [regels, setRegels] = useState([]);

  async function analyseer() {
    if (!bestand) { setFout('Kies eerst een PDF-bestand'); return; }
    setFout('');
    setStap('laden');
    try {
      const fd = new FormData();
      fd.append('factuur', bestand);
      const res = await fetch(`${BASE}/facturen/analyseer`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLeverancier(data.leverancier || '');
      setDatum(data.datum || new Date().toISOString().split('T')[0]);
      setRegels((data.regels || []).map(r => nieuweRegelState(r, types)));
      setStap('controle');
    } catch (e) {
      setFout(e.message);
      setStap('upload');
    }
  }

  function setRegel(i, patch) {
    setRegels(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setNieuwType(i, patch) {
    setRegels(rs => rs.map((r, idx) => idx === i ? { ...r, nieuwType: { ...r.nieuwType, ...patch } } : r));
  }

  async function bevestig() {
    setFout('');
    setStap('opslaan');
    try {
      for (const r of regels) {
        if (r.negeer) continue;
        const aantal = parseFloat(r.aantal) || 0;
        const totaal = parseFloat(r.totaal) || 0;
        if (r.actie === 'voorraad') {
          if (aantal <= 0) throw new Error(`Aantal ontbreekt/ongeldig bij "${r.omschrijving}"`);
          let filamentTypeId = r.typeId;
          if (filamentTypeId === 'nieuw') {
            if (!r.nieuwType.merk || !r.nieuwType.materiaal) {
              throw new Error(`Vul merk/leverancier en omschrijving in voor het nieuwe type "${r.omschrijving}"`);
            }
            const created = await api.post('/filament/types', {
              merk: r.nieuwType.merk,
              materiaal: r.nieuwType.materiaal,
              categorie: r.nieuwType.categorie,
              eenheid: r.nieuwType.eenheid,
              inkoop_prijs_per_kg: r.nieuwType.eenheid === 'gram' ? (totaal / aantal) * 1000 : (totaal / aantal),
              leverancier: leverancier || null,
            });
            filamentTypeId = created.id;
          }
          await api.post('/filament/rollen', {
            filament_type_id: filamentTypeId,
            gewicht_gram_start: aantal,
            gewicht_gram_huidig: aantal,
            aankoopprijs_eur: totaal || null,
            gekocht_op: datum || undefined,
          });
        } else if (r.actie === 'kost') {
          await api.post('/uitgaven', {
            datum: datum || undefined,
            categorie: r.kostCategorie,
            omschrijving: `${r.omschrijving}${leverancier ? ' — ' + leverancier : ''}`,
            bedrag: totaal || aantal,
          });
        }
      }
      onDone();
    } catch (e) {
      setFout(e.message);
      setStap('controle');
    }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && stap !== 'opslaan' && confirm('Venster sluiten? Niet-opgeslagen wijzigingen gaan verloren.')) onClose();
    }}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h2>📄 Factuur inlezen</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {stap === 'upload' && (
          <>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Upload een PDF-factuur — de regels worden automatisch herkend (via Gemini) en je koppelt ze nadien zelf aan je voorraad.
            </p>
            <div className="form-group">
              <label>PDF-factuur</label>
              <input type="file" accept="application/pdf" onChange={e => setBestand(e.target.files?.[0] || null)} />
            </div>
            {fout && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{fout}</div>}
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>Annuleer</button>
              <button className="btn primary" onClick={analyseer}>Analyseren</button>
            </div>
          </>
        )}

        {stap === 'laden' && (
          <p style={{ fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>Factuur wordt uitgelezen...</p>
        )}

        {(stap === 'controle' || stap === 'opslaan') && (
          <>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Leverancier</label>
                <input value={leverancier} onChange={e => setLeverancier(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
              </div>
            </div>

            {regels.length === 0 && <div className="empty">Geen regels herkend</div>}

            {regels.map((r, i) => (
              <div key={i} className="card" style={{ marginBottom: 10, opacity: r.negeer ? 0.5 : 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <input
                    style={{ flex: 2 }}
                    value={r.omschrijving}
                    onChange={e => setRegel(i, { omschrijving: e.target.value })}
                  />
                  <input
                    type="number" style={{ width: 80 }} placeholder="aantal"
                    value={r.aantal} onChange={e => setRegel(i, { aantal: e.target.value })}
                  />
                  <input
                    type="number" style={{ width: 90 }} placeholder="totaal €"
                    value={r.totaal} onChange={e => setRegel(i, { totaal: e.target.value })}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={r.negeer} onChange={e => setRegel(i, { negeer: e.target.checked })} />
                    negeer
                  </label>
                </div>

                {!r.negeer && (
                  <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {['voorraad', 'kost'].map(a => (
                        <button
                          key={a}
                          type="button"
                          className={`btn${r.actie === a ? ' primary' : ''}`}
                          style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={() => setRegel(i, { actie: a })}
                        >
                          {a === 'voorraad' ? '📦 Voorraad aanvullen' : '💶 Kost (geen voorraad)'}
                        </button>
                      ))}
                    </div>

                    {r.actie === 'voorraad' && (
                      <div>
                        <select
                          value={r.typeId}
                          onChange={e => setRegel(i, { typeId: e.target.value === 'nieuw' ? 'nieuw' : parseInt(e.target.value) })}
                          style={{ fontSize: 12, marginBottom: 6 }}
                        >
                          <option value="nieuw">+ Nieuw artikeltype aanmaken...</option>
                          {types.map(t => (
                            <option key={t.id} value={t.id}>{t.merk} {t.materiaal} ({t.eenheid})</option>
                          ))}
                        </select>

                        {r.typeId === 'nieuw' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input
                              placeholder="Merk/Leverancier" style={{ width: 150, fontSize: 12 }}
                              value={r.nieuwType.merk} onChange={e => setNieuwType(i, { merk: e.target.value })}
                            />
                            <input
                              placeholder="Materiaal/Omschrijving" style={{ width: 180, fontSize: 12 }}
                              value={r.nieuwType.materiaal} onChange={e => setNieuwType(i, { materiaal: e.target.value })}
                            />
                            <select
                              style={{ fontSize: 12 }}
                              value={r.nieuwType.categorie} onChange={e => setNieuwType(i, { categorie: e.target.value })}
                            >
                              {CATEGORIEEN.map(c => <option key={c.waarde} value={c.waarde}>{c.label}</option>)}
                            </select>
                            <select
                              style={{ fontSize: 12 }}
                              value={r.nieuwType.eenheid} onChange={e => setNieuwType(i, { eenheid: e.target.value })}
                            >
                              {EENHEDEN.map(e => <option key={e.waarde} value={e.waarde}>{e.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {r.actie === 'kost' && (
                      <select
                        style={{ fontSize: 12 }}
                        value={r.kostCategorie} onChange={e => setRegel(i, { kostCategorie: e.target.value })}
                      >
                        {UITGAVEN_CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </>
                )}
              </div>
            ))}

            {fout && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{fout}</div>}

            <div className="modal-footer">
              <button className="btn" onClick={onClose} disabled={stap === 'opslaan'}>Annuleer</button>
              <button className="btn primary" onClick={bevestig} disabled={stap === 'opslaan'}>
                {stap === 'opslaan' ? 'Bezig...' : 'Bevestigen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
