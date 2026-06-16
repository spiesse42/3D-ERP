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

// Samengestelde sleutel — een rij/regel is altijd type + kleur, nooit enkel type
function regelKey(filamentTypeId, kleur) {
  return `${filamentTypeId}::${kleur || ''}`;
}

// ─── KleurKiezer — bestaande kleuren uit voorraad-historiek + nieuwe kleur toevoegen ──
function KleurKiezer({ filamentTypeId, kleur, onChange }) {
  const [bestaande, setBestaande] = useState([]);
  const [nieuw, setNieuw] = useState(false);

  useEffect(() => {
    if (!filamentTypeId) { setBestaande([]); return; }
    api.get(`/filament/types/${filamentTypeId}/kleuren`).then(rows => {
      setBestaande(rows);
      setNieuw(rows.length === 0);
    });
  }, [filamentTypeId]);

  if (!filamentTypeId) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
        Kleur <span style={{ fontWeight: 400 }}>optioneel</span>
      </label>

      {bestaande.length > 0 && !nieuw && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={() => onChange('', '')}
            style={{
              padding: '3px 8px', borderRadius: 20, fontSize: 11, color: 'var(--text)', cursor: 'pointer',
              border: !kleur ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: !kleur ? 'var(--bg3)' : 'transparent',
            }}>
            geen
          </button>
          {bestaande.map(k => (
            <button key={k.kleur} type="button" onClick={() => onChange(k.kleur, k.kleur_hex)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
                border: kleur === k.kleur ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: kleur === k.kleur ? 'var(--bg3)' : 'transparent',
                cursor: 'pointer', fontSize: 11, color: 'var(--text)'
              }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: k.kleur_hex || '#555', border: '1px solid rgba(255,255,255,0.2)' }} />
              {k.kleur}
            </button>
          ))}
        </div>
      )}

      {!nieuw ? (
        <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setNieuw(true)}>
          + Nieuwe kleur
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ flex: 1 }} value={kleur || ''} onChange={e => onChange(e.target.value, '')} placeholder="bv. Lavendel" autoFocus />
          {bestaande.length > 0 && (
            <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => { setNieuw(false); onChange('', ''); }}>
              Annuleer
            </button>
          )}
        </div>
      )}
    </div>
  );
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

// ─── BestelModal — leverancier kiezen/aanmaken + artikelen (type + kleur) vrij samenstellen ──
function BestelModal({ items, alleTypes, leveranciers, onClose, onSaved, onLeveranciersChanged }) {
  const [regels, setRegels] = useState(items.map(it => ({
    filament_type_id: it.filament_type_id, merk: it.merk, materiaal: it.materiaal, eenheid: it.eenheid,
    kleur: it.kleur || '', kleur_hex: it.kleur_hex || '',
  })));
  const [extraTypeId, setExtraTypeId] = useState('');
  const [extraKleur, setExtraKleur] = useState('');
  const [extraKleurHex, setExtraKleurHex] = useState('');
  const [leverancierId, setLeverancierId] = useState('');
  const [nieuweLeverancierNaam, setNieuweLeverancierNaam] = useState('');
  const [referentie, setReferentie] = useState('');
  const [aantallen, setAantallen] = useState({});
  const [notities, setNotities] = useState('');

  useEffect(() => {
    if (!leverancierId && leveranciers.length > 0) setLeverancierId(String(leveranciers[0].id));
  }, [leveranciers]);

  function voegArtikelToe() {
    if (!extraTypeId) return;
    const t = alleTypes.find(x => String(x.id) === String(extraTypeId));
    if (!t) return;
    if (regels.some(r => regelKey(r.filament_type_id, r.kleur) === regelKey(extraTypeId, extraKleur))) {
      alert('Dit artikel in deze kleur staat al in de lijst');
      return;
    }
    setRegels(rs => [...rs, {
      filament_type_id: t.id, merk: t.merk, materiaal: t.materiaal, eenheid: t.eenheid,
      kleur: extraKleur, kleur_hex: extraKleurHex,
    }]);
    setExtraTypeId(''); setExtraKleur(''); setExtraKleurHex('');
  }

  function verwijderRegel(key) {
    setRegels(rs => rs.filter(r => regelKey(r.filament_type_id, r.kleur) !== key));
  }

  async function bestel() {
    if (regels.length === 0) { alert('Voeg minstens 1 artikel toe aan de bestelling'); return; }

    let gekozenLeverancierId = leverancierId;
    if (leverancierId === '__nieuw__') {
      if (!nieuweLeverancierNaam.trim()) { alert('Vul een naam in voor de nieuwe leverancier'); return; }
      try {
        const res = await api.post('/bestellingen/leveranciers', { naam: nieuweLeverancierNaam.trim() });
        gekozenLeverancierId = res.id;
        onLeveranciersChanged?.();
      } catch (e) { alert(e.message); return; }
    }
    if (!gekozenLeverancierId) { alert('Kies of maak eerst een leverancier'); return; }

    try {
      await api.post('/bestellingen', {
        leverancier_id: gekozenLeverancierId,
        referentie: referentie || null,
        notities: notities || null,
        items: regels.map(r => ({
          filament_type_id: r.filament_type_id,
          kleur: r.kleur || null,
          kleur_hex: r.kleur_hex || null,
          aantal: aantallen[regelKey(r.filament_type_id, r.kleur)] || null,
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
          <select value={leverancierId} onChange={e => setLeverancierId(e.target.value)}>
            <option value="">Kies een leverancier...</option>
            {leveranciers.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
            <option value="__nieuw__">+ Nieuwe leverancier...</option>
          </select>
          {leverancierId === '__nieuw__' && (
            <input style={{ marginTop: 6 }} value={nieuweLeverancierNaam}
              onChange={e => setNieuweLeverancierNaam(e.target.value)}
              placeholder="Naam nieuwe leverancier" autoFocus />
          )}
        </div>

        <div className="form-group">
          <label>Referentie / bestelnummer <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>optioneel</span></label>
          <input value={referentie} onChange={e => setReferentie(e.target.value)} placeholder="bv. order #12345" />
        </div>

        <div className="form-group">
          <label>Items in deze bestelling</label>
          <div className="card" style={{ padding: 8, marginBottom: 8 }}>
            {regels.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>Nog geen artikelen toegevoegd</div>
            )}
            {regels.map(it => {
              const key = regelKey(it.filament_type_id, it.kleur);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.kleur && <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.kleur_hex || '#555', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />}
                    {it.merk} {it.materiaal}{it.kleur ? ` — ${it.kleur}` : ''}
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                      Aantal ({eenheidLabel(it.eenheid)})
                    </label>
                    <input
                      style={{ width: 100 }}
                      value={aantallen[key] || ''}
                      onChange={e => setAantallen(a => ({ ...a, [key]: e.target.value }))}
                    />
                  </div>
                  <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => verwijderRegel(key)}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ flex: 1 }} value={extraTypeId} onChange={e => { setExtraTypeId(e.target.value); setExtraKleur(''); setExtraKleurHex(''); }}>
              <option value="">+ Artikel toevoegen aan deze bestelling...</option>
              {alleTypes.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
            </select>
          </div>
          {extraTypeId && (
            <>
              <KleurKiezer
                filamentTypeId={extraTypeId}
                kleur={extraKleur}
                onChange={(k, h) => { setExtraKleur(k); setExtraKleurHex(h); }}
              />
              <button className="btn primary" style={{ marginTop: 8 }} onClick={voegArtikelToe}>Toevoegen aan bestelling</button>
            </>
          )}
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
  const [kleur, setKleur] = useState(item.kleur || '');
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
        kleur_hex: item.kleur_hex || null,
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
          <h2>Ontvangen — {item.merk} {item.materiaal}{item.kleur ? ` (${item.kleur})` : ''}</h2>
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
                    <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {it.kleur && <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.kleur_hex || '#555', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />}
                      {it.merk} {it.materiaal}{it.kleur ? ` — ${it.kleur}` : ''}
                    </td>
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
  const [geselecteerd, setGeselecteerd] = useState(new Set()); // bevat regelKey(typeId, kleur)
  const [bestelModal, setBestelModal] = useState(false);
  const [leverancierModal, setLeverancierModal] = useState(null);
  const [detailId, setDetailId]       = useState(null);
  const [handmatigType, setHandmatigType] = useState('');
  const [handmatigKleur, setHandmatigKleur] = useState('');
  const [handmatigKleurHex, setHandmatigKleurHex] = useState('');

  function load() {
    api.get('/bestellingen/te-bestellen-overzicht').then(setOverzicht);
    api.get('/bestellingen/leveranciers').then(setLeveranciers);
    api.get('/bestellingen').then(setBestellingen);
    api.get('/filament/types').then(setAlleTypes);
  }
  useEffect(() => { load(); }, []);

  function toggleSelectie(key) {
    setGeselecteerd(s => {
      const nieuw = new Set(s);
      if (nieuw.has(key)) nieuw.delete(key); else nieuw.add(key);
      return nieuw;
    });
  }

  async function voegHandmatigToe() {
    if (!handmatigType) return;
    try {
      await api.post('/bestellingen/te-bestellen-handmatig', {
        filament_type_id: handmatigType,
        kleur: handmatigKleur || null,
        kleur_hex: handmatigKleurHex || null,
      });
      setHandmatigType(''); setHandmatigKleur(''); setHandmatigKleurHex('');
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

  const geselecteerdeItems = overzicht.filter(o => geselecteerd.has(regelKey(o.filament_type_id, o.kleur)));

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
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ flex: 1 }} value={handmatigType}
                onChange={e => { setHandmatigType(e.target.value); setHandmatigKleur(''); setHandmatigKleurHex(''); }}>
                <option value="">+ Artikeltype manueel toevoegen aan "te bestellen"...</option>
                {alleTypes.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
              </select>
              <button className="btn" onClick={voegHandmatigToe} disabled={!handmatigType}>Toevoegen</button>
            </div>
            {handmatigType && (
              <KleurKiezer
                filamentTypeId={handmatigType}
                kleur={handmatigKleur}
                onChange={(k, h) => { setHandmatigKleur(k); setHandmatigKleurHex(h); }}
              />
            )}
          </div>

          {overzicht.length === 0
            ? <div className="empty">Niets te bestellen — alle voorraad zit boven de drempel</div>
            : <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th></th><th>Artikel</th><th>Reden</th><th></th></tr></thead>
                  <tbody>
                    {overzicht.map(o => {
                      const key = regelKey(o.filament_type_id, o.kleur);
                      return (
                        <tr key={key}>
                          <td>
                            <input type="checkbox" checked={geselecteerd.has(key)} onChange={() => toggleSelectie(key)} />
                          </td>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {o.kleur && <span style={{ width: 10, height: 10, borderRadius: '50%', background: o.kleur_hex || '#555', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />}
                            {o.merk} {o.materiaal}{o.kleur ? ` — ${o.kleur}` : ''}
                          </td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }

          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setBestelModal(true)}>
              {geselecteerd.size > 0
                ? `Bestelling aanmaken (${geselecteerd.size} item${geselecteerd.size > 1 ? 's' : ''})`
                : '+ Nieuwe bestelling'}
            </button>
          </div>
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
          alleTypes={alleTypes}
          leveranciers={leveranciers}
          onClose={() => setBestelModal(false)}
          onLeveranciersChanged={load}
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
