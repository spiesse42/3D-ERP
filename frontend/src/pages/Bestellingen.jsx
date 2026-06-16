import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const STATUS_LABEL = {
  besteld: 'Besteld',
  deels_ontvangen: 'Deels ontvangen',
  ontvangen: 'Ontvangen',
};
const STATUS_BADGE = {
  besteld: 'gepland',
  deels_ontvangen: 'bezig',
  ontvangen: 'voltooid',
};

function eenheidLabel(eenheid) {
  if (eenheid === 'stuk') return 'stuk';
  if (eenheid === 'ml') return 'ml';
  return 'g';
}

// ─── LeverancierModal ──────────────────────────────────────────────────────
function LeverancierModal({ leverancier, onClose, onSaved }) {
  const [form, setForm] = useState(leverancier?.id ? { ...leverancier } : { naam: '', website: '', notities: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.naam) { alert('Naam is verplicht'); return; }
    try {
      if (leverancier?.id) await api.put(`/bestellingen/leveranciers/${leverancier.id}`, form);
      else await api.post('/bestellingen/leveranciers', form);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{leverancier?.id ? 'Leverancier bewerken' : 'Nieuwe leverancier'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label>Naam *</label>
          <input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="bv. Amazon" />
        </div>
        <div className="form-group">
          <label>Website <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
          <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="bv. amazon.com.be" />
        </div>
        <div className="form-group">
          <label>Notities <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
          <input value={form.notities || ''} onChange={e => set('notities', e.target.value)} placeholder="bv. accountgegevens, contactpersoon..." />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ─── BestelModal — leverancier kiezen + items bevestigen ──────────────────
function BestelModal({ items, leveranciers, onClose, onSaved, onNieuweLeverancier }) {
  const [leverancierId, setLeverancierId] = useState(leveranciers[0]?.id || '');
  const [referentie, setReferentie] = useState('');
  const [aantallen, setAantallen] = useState({});
  const [notities, setNotities] = useState('');

  async function bestel() {
    if (!leverancierId) { alert('Kies of maak eerst een leverancier'); return; }
    try {
      await api.post('/bestellingen', {
        leverancier_id: leverancierId,
        referentie: referentie || null,
        notities: notities || null,
        items: items.map(it => ({
          filament_type_id: it.filament_type_id,
          aantal: aantallen[it.filament_type_id] || null,
        })),
      });
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Bestelling aanmaken</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Leverancier *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ flex: 1 }} value={leverancierId} onChange={e => setLeverancierId(e.target.value)}>
              {leveranciers.length === 0 && <option value="">Geen leveranciers — maak er eerst één aan</option>}
              {leveranciers.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
            </select>
            <button className="btn" onClick={onNieuweLeverancier}>+ Nieuw</button>
          </div>
        </div>

        <div className="form-group">
          <label>Referentie / bestelnummer <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
          <input value={referentie} onChange={e => setReferentie(e.target.value)} placeholder="bv. order #12345" />
        </div>

        <div className="form-group">
          <label>Items in deze bestelling</label>
          <div className="card" style={{ padding: 8 }}>
            {items.map(it => (
              <div key={it.filament_type_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>{it.merk} {it.materiaal}</div>
                <input
                  style={{ width: 110 }}
                  placeholder={`aantal (${eenheidLabel(it.eenheid)})`}
                  value={aantallen[it.filament_type_id] || ''}
                  onChange={e => setAantallen(a => ({ ...a, [it.filament_type_id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Notities <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
          <input value={notities} onChange={e => setNotities(e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={bestel}>Bestelling plaatsen</button>
        </div>
      </div>
    </div>
  );
}

// ─── OntvangstModal — 1 item in voorraad steken ───────────────────────────
function OntvangstModal({ item, onClose, onSaved }) {
  const eenheid = item.eenheid || 'gram';
  const [startStr, setStartStr] = useState(item.aantal ? String(item.aantal) : '');
  const [prijsStr, setPrijsStr] = useState(item.prijs_totaal ? String(item.prijs_totaal) : '');
  const [kleur, setKleur] = useState('');
  const [locatie, setLocatie] = useState('');
  const [lotnummer, setLotnummer] = useState('');
  const [gekochtOp, setGekochtOp] = useState(new Date().toISOString().split('T')[0]);

  async function ontvang() {
    const start = parseFloat(startStr);
    const prijs = parseFloat(prijsStr);
    if (!start || start <= 0) { alert('Aantal/gewicht is verplicht en moet groter zijn dan 0'); return; }
    if (!prijs || prijs <= 0) { alert('Aankoopprijs is verplicht en moet groter zijn dan 0'); return; }
    try {
      await api.post(`/bestellingen/bestelling-items/${item.id}/ontvangen`, {
        gewicht_gram_start: start,
        gewicht_gram_huidig: start,
        aankoopprijs_eur: prijs,
        kleur: kleur || null,
        locatie: locatie || null,
        lotnummer: lotnummer || null,
        gekocht_op: gekochtOp,
      });
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Ontvangen — {item.merk} {item.materiaal}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{eenheid === 'gram' ? 'Startgewicht (g) *' : eenheid === 'ml' ? 'Volume (ml) *' : 'Aantal *'}</label>
            <input type="number" value={startStr} onChange={e => setStartStr(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Aankoopprijs (€) *</label>
            <input type="number" step="0.01" value={prijsStr} onChange={e => setPrijsStr(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Kleur <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
            <input value={kleur} onChange={e => setKleur(e.target.value)} placeholder="bv. Robijnrood" />
          </div>
          <div className="form-group">
            <label>Lotnummer <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel — auto indien leeg</span></label>
            <input value={lotnummer} onChange={e => setLotnummer(e.target.value)} placeholder="bv. Amazon 2024-06" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Locatie</label>
            <input value={locatie} onChange={e => setLocatie(e.target.value)} placeholder="bv. Rek A" />
          </div>
          <div className="form-group">
            <label>Aankoopdatum</label>
            <input type="date" value={gekochtOp} onChange={e => setGekochtOp(e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={ontvang}>In voorraad steken</button>
        </div>
      </div>
    </div>
  );
}

// ─── BestellingDetailModal ─────────────────────────────────────────────────
function BestellingDetailModal({ bestellingId, onClose, onChanged }) {
  const [bestelling, setBestelling] = useState(null);
  const [ontvangstItem, setOntvangstItem] = useState(null);

  function load() {
    api.get(`/bestellingen/${bestellingId}`).then(setBestelling);
  }
  useEffect(() => { load(); }, [bestellingId]);

  if (!bestelling) return null;

  return (
    <>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-header">
            <h2>Bestelling bij {bestelling.leverancier_naam}</h2>
            <button className="btn" onClick={onClose}>✕</button>
          </div>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
            {bestelling.referentie && <div>Referentie: {bestelling.referentie}</div>}
            <div style={{ marginBottom: 6 }}>Besteld op: {bestelling.besteld_op}</div>
            <span className={`badge ${STATUS_BADGE[bestelling.status]}`}>{STATUS_LABEL[bestelling.status]}</span>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Artikel</th><th>Aantal</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {bestelling.items.map(it => (
                  <tr key={it.id}>
                    <td>{it.merk} {it.materiaal}</td>
                    <td>{it.aantal != null ? `${it.aantal} ${eenheidLabel(it.eenheid)}` : '—'}</td>
                    <td>
                      {it.ontvangen
                        ? <span className="badge voltooid">Ontvangen</span>
                        : <span className="badge gepland">Open</span>}
                    </td>
                    <td>
                      {!it.ontvangen && (
                        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setOntvangstItem(it)}>
                          Ontvangen → in voorraad
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Sluiten</button>
          </div>
        </div>
      </div>

      {ontvangstItem && (
        <OntvangstModal
          item={ontvangstItem}
          onClose={() => setOntvangstItem(null)}
          onSaved={() => { setOntvangstItem(null); load(); onChanged(); }}
        />
      )}
    </>
  );
}

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────
export default function Bestellingen() {
  const [weergave, setWeergave]       = useState('te-bestellen'); // te-bestellen | lopend | leveranciers
  const [overzicht, setOverzicht]     = useState([]);
  const [leveranciers, setLeveranciers] = useState([]);
  const [bestellingen, setBestellingen] = useState([]);
  const [alleTypes, setAlleTypes]     = useState([]);
  const [geselecteerd, setGeselecteerd] = useState(new Set());
  const [bestelModal, setBestelModal] = useState(false);
  const [leverancierModal, setLeverancierModal] = useState(null);
  const [detailId, setDetailId]       = useState(null);
  const [handmatigType, setHandmatigType] = useState('');

  function load() {
    api.get('/bestellingen/te-bestellen-overzicht').then(setOverzicht);
    api.get('/bestellingen/leveranciers').then(setLeveranciers);
    api.get('/bestellingen').then(setBestellingen);
    api.get('/filament/types').then(setAlleTypes);
  }
  useEffect(() => { load(); }, []);

  function toggleSelectie(id) {
    setGeselecteerd(s => {
      const nieuw = new Set(s);
      if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id);
      return nieuw;
    });
  }

  async function voegHandmatigToe() {
    if (!handmatigType) return;
    try {
      await api.post('/bestellingen/te-bestellen-handmatig', { filament_type_id: handmatigType });
      setHandmatigType('');
      load();
    } catch (e) { alert(e.message); }
  }

  async function verwijderHandmatig(handmatigId) {
    try {
      await api.delete(`/bestellingen/te-bestellen-handmatig/${handmatigId}`);
      load();
    } catch (e) { alert(e.message); }
  }

  async function verwijderLeverancier(l) {
    if (!confirm(`Leverancier "${l.naam}" verwijderen?`)) return;
    try {
      await api.delete(`/bestellingen/leveranciers/${l.id}`);
      load();
    } catch (e) { alert(e.message); }
  }

  const geselecteerdeItems = overzicht.filter(o => geselecteerd.has(o.filament_type_id));

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem' }}>
        {[
          { key: 'te-bestellen', label: 'Te bestellen' },
          { key: 'lopend',       label: 'Lopende bestellingen' },
          { key: 'leveranciers', label: 'Leveranciers' },
        ].map(w => (
          <button key={w.key} className={`btn${weergave === w.key ? ' primary' : ''}`} onClick={() => setWeergave(w.key)}>
            {w.label}
          </button>
        ))}
      </div>

      {/* ── Te bestellen ── */}
      {weergave === 'te-bestellen' && (
        <>
          <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <select style={{ flex: 1 }} value={handmatigType} onChange={e => setHandmatigType(e.target.value)}>
              <option value="">+ Artikeltype manueel toevoegen aan "te bestellen"...</option>
              {alleTypes.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
            </select>
            <button className="btn" onClick={voegHandmatigToe} disabled={!handmatigType}>Toevoegen</button>
          </div>

          {overzicht.length === 0
            ? <div className="empty">Niets te bestellen — alle voorraad zit boven de drempel</div>
            : <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th></th><th>Artikel</th><th>Reden</th><th></th></tr></thead>
                  <tbody>
                    {overzicht.map(o => (
                      <tr key={o.filament_type_id}>
                        <td>
                          <input type="checkbox" checked={geselecteerd.has(o.filament_type_id)} onChange={() => toggleSelectie(o.filament_type_id)} />
                        </td>
                        <td>{o.merk} {o.materiaal}</td>
                        <td style={{ fontSize: 11 }}>
                          {o.automatisch && <span className="badge geannuleerd" style={{ marginRight: 6 }}>laag op voorraad</span>}
                          {o.handmatig && <span className="badge bezig">manueel{o.notitie ? `: ${o.notitie}` : ''}</span>}
                        </td>
                        <td>
                          {o.handmatig && (
                            <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => verwijderHandmatig(o.handmatig_id)}>
                              Vlag wegnemen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }

          {geselecteerd.size > 0 && (
            <div style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={() => setBestelModal(true)}>
                Bestelling aanmaken ({geselecteerd.size} item{geselecteerd.size > 1 ? 's' : ''})
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Lopende bestellingen ── */}
      {weergave === 'lopend' && (
        bestellingen.length === 0
          ? <div className="empty">Nog geen bestellingen geplaatst</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Leverancier</th><th>Referentie</th><th>Besteld op</th><th>Items</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {bestellingen.map(b => (
                    <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(b.id)}>
                      <td style={{ fontWeight: 500 }}>{b.leverancier_naam}</td>
                      <td style={{ color: 'var(--muted)' }}>{b.referentie || '—'}</td>
                      <td>{b.besteld_op}</td>
                      <td>{b.aantal_ontvangen}/{b.aantal_items}</td>
                      <td><span className={`badge ${STATUS_BADGE[b.status]}`}>{STATUS_LABEL[b.status]}</span></td>
                      <td><button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}>Openen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* ── Leveranciers ── */}
      {weergave === 'leveranciers' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="btn primary" onClick={() => setLeverancierModal({})}>+ Nieuwe leverancier</button>
          </div>
          {leveranciers.length === 0
            ? <div className="empty">Nog geen leveranciers</div>
            : <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>Naam</th><th>Website</th><th>Notities</th><th>Acties</th></tr></thead>
                  <tbody>
                    {leveranciers.map(l => (
                      <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setLeverancierModal(l)}>
                        <td style={{ fontWeight: 500 }}>{l.naam}</td>
                        <td style={{ color: 'var(--muted)' }}>{l.website || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{l.notities || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setLeverancierModal(l)}>✏</button>
                            <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => verwijderLeverancier(l)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </>
      )}

      {bestelModal && (
        <BestelModal
          items={geselecteerdeItems}
          leveranciers={leveranciers}
          onClose={() => setBestelModal(false)}
          onNieuweLeverancier={() => setLeverancierModal({})}
          onSaved={() => { setBestelModal(false); setGeselecteerd(new Set()); load(); }}
        />
      )}

      {leverancierModal !== null && (
        <LeverancierModal
          leverancier={leverancierModal?.id ? leverancierModal : null}
          onClose={() => setLeverancierModal(null)}
          onSaved={() => { setLeverancierModal(null); load(); }}
        />
      )}

      {detailId && (
        <BestellingDetailModal
          bestellingId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
