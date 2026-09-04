import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, BASE } from '../lib/api.js';
import { KLEUREN, kleurHex, alleKleuren, normaliseerHexInvoer, registreerCustomKleuren } from '../lib/kleuren.js';
import KleurDot from '../components/KleurDot.jsx';
import FactuurUploadModal from '../components/FactuurUploadModal.jsx';

function eenheidSuffix(eenheid) {
  if (eenheid === 'stuk') return ' stuk';
  if (eenheid === 'ml') return ' ml';
  return 'g';
}

function eenheidPrijsLabel(eenheid) {
  if (eenheid === 'stuk') return 'stuk';
  if (eenheid === 'ml') return 'ml';
  return 'kg';
}

function groepSleutel(filamentTypeId, kleur) {
  return `${filamentTypeId}::${kleur || ''}`;
}

function VoorraadBalk({ huidig, start }) {
  const pct = Math.min(100, Math.round((huidig / (start || 1000)) * 100));
  const kleur = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur, borderRadius: 2, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

// ─── GroepDetailModal — alle individuele rollen van 1 type+kleur ──────────
function GroepDetailModal({ groep, rollen, onClose, onEditRol, onNieuweRol, onToggleActief, onDeleteRol, onKalibratie }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KleurDot kleur={groep.kleur} hex={groep.kleur_hex} size={16} />
            {groep.merk} {groep.materiaal}{groep.kleur ? ` — ${groep.kleur}` : ''}
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={onNieuweRol}>+ Rol toevoegen</button>
          {(groep.categorie || 'filament') === 'filament' && (
            <button className="btn" onClick={onKalibratie} title="Kalibratie voor dit type + deze kleur">🎛 Kalibratie</button>
          )}
        </div>

        {rollen.length === 0
          ? <div className="empty">Geen rollen meer in deze groep</div>
          : <div className="card" style={{ padding: 0 }}>
              {rollen.map(r => (
                <div key={r.id} onClick={() => onEditRol(r)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: r.actief ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.lotnummer || '—'}</span>
                    <span className={`badge ${r.actief ? 'bezig' : 'geannuleerd'}`}>{r.actief ? 'actief' : 'leeg'}</span>
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    {parseFloat(r.gewicht_gram_huidig).toFixed(0)}{eenheidSuffix(r.eenheid)}
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}> / {parseFloat(r.gewicht_gram_start).toFixed(0)}{eenheidSuffix(r.eenheid)}</span>
                  </div>
                  <VoorraadBalk huidig={r.gewicht_gram_huidig} start={r.gewicht_gram_start} />

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12 }}>
                    <span>€{parseFloat(r.prijs_per_kg_effectief || r.inkoop_prijs_per_kg).toFixed(2)}/{eenheidPrijsLabel(r.eenheid)}</span>
                    <span style={{ color: 'var(--accent2)' }}>rest: €{r.restwaarde_eur}</span>
                    {r.locatie && <span style={{ color: 'var(--muted)' }}>{r.locatie}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onEditRol(r)}>✏</button>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onToggleActief(r)}>
                      {r.actief ? 'Leeg' : 'Heractiveer'}
                    </button>
                    <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onDeleteRol(r)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
        }

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}

// ─── TypeModal ───────────────────────────────────────────────────────────────
const CATEGORIEEN = [
  { waarde: 'filament',           label: '🧵 Filament' },
  { waarde: 'onderdeel',          label: '🔧 Onderdeel (sleutelhangers, ringetjes...)' },
  { waarde: 'verbruiksmateriaal', label: '🧪 Verbruiksmateriaal (lijm, schroeven...)' },
  { waarde: 'product',            label: '🏷️ Product (afgewerkt, kant-en-klaar)' },
  { waarde: 'dienst',             label: '🚚 Dienst (verzendkosten, ontwerp...) — geen voorraad' },
  { waarde: 'overig',             label: '📦 Overig' },
];
const EENHEDEN = [
  { waarde: 'gram', label: 'gram (g)' },
  { waarde: 'stuk', label: 'stuk(s)' },
  { waarde: 'ml',   label: 'milliliter (ml)' },
];

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState(type?.id ? { ...type } : {
    merk: '', materiaal: 'PLA+', inkoop_prijs_per_kg: '', dichtheid_g_per_cm3: 1.24, leverancier: '',
    categorie: 'filament', eenheid: 'gram', marge_pct: '', min_voorraad: '', vaste_prijs: 0, voorraad_aantal: 0
  });
  // Lokale strings zodat je ononderbroken kan typen
  const [prijsStr, setPrijsStr] = useState(String(form.inkoop_prijs_per_kg ?? ''));
  const [margeStr, setMargeStr] = useState(String(form.marge_pct ?? ''));
  const [minVoorraadStr, setMinVoorraadStr] = useState(String(form.min_voorraad ?? ''));
  const [voorraadStr, setVoorraadStr] = useState(String(form.voorraad_aantal ?? '0'));

  // Vast kleurenpalet voor dit type (optioneel) — als dit niet leeg is, mag bij
  // het aanmaken van voorraad van dit type enkel nog uit dit palet gekozen worden.
  const [palet,        setPalet]        = useState([]);
  const [paletGeladen, setPaletGeladen] = useState(false);
  const [paletNaam,    setPaletNaam]    = useState('');
  const [paletCode,    setPaletCode]    = useState('');
  const [paletFout,    setPaletFout]    = useState('');
  const [paletStatus,  setPaletStatus]  = useState('');
  const paletHex = normaliseerHexInvoer(paletCode);

  useEffect(() => {
    if (!type?.id) return;
    api.get(`/filament/types/${type.id}/kleurenpalet`).then(rows => { setPalet(rows); setPaletGeladen(true); });
  }, [type?.id]);

  function paletKleurToevoegen() {
    if (!paletNaam.trim()) { setPaletFout('Geef een naam op'); return; }
    if (paletCode && !paletHex) { setPaletFout('Ongeldige code — gebruik bv. #a855f7 of rgb(168,85,247), of laat leeg voor transparant'); return; }
    setPalet(p => [...p, { naam: paletNaam.trim(), hex: paletHex }]);
    setPaletNaam(''); setPaletCode(''); setPaletFout('');
  }

  function paletKleurVerwijderen(i) {
    setPalet(p => p.filter((_, idx) => idx !== i));
  }

  async function paletOpslaan() {
    try {
      await api.put(`/filament/types/${type.id}/kleurenpalet`, { kleuren: palet.map(k => ({ naam: k.naam, hex: k.hex })) });
      setPaletStatus('✓ Bewaard');
      setTimeout(() => setPaletStatus(''), 2500);
    } catch (e) { setPaletStatus('✗ ' + e.message); }
  }

  const isFilament = form.categorie === 'filament';
  const isProduct = form.categorie === 'product';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

 async function save() {
    if (!form.merk || !form.materiaal) { alert('Merk/naam en materiaal/omschrijving zijn verplicht'); return; }
    const prijs = parseFloat(prijsStr.replace(',', '.'));
    const marge = margeStr !== '' ? parseFloat(margeStr.replace(',', '.')) : null;
    const minVoorraad = minVoorraadStr !== '' ? parseFloat(minVoorraadStr.replace(',', '.')) : null;
    const voorraad = voorraadStr !== '' ? parseFloat(voorraadStr.replace(',', '.')) : 0;
    try {
      const payload = {
        ...form,
        inkoop_prijs_per_kg: (!isNaN(prijs) && prijs > 0) ? prijs : 0,
        marge_pct: (marge != null && !isNaN(marge)) ? marge : null,
        min_voorraad: (minVoorraad != null && !isNaN(minVoorraad)) ? minVoorraad : null,
        voorraad_aantal: (voorraad != null && !isNaN(voorraad)) ? voorraad : 0,
      };
      if (type?.id) await api.put(`/filament/types/${type.id}`, payload);
      else await api.post('/filament/types', payload);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Venster sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{type?.id ? 'Artikeltype bewerken' : 'Nieuw artikeltype'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Categorie *</label>
          <select value={form.categorie} onChange={e => {
            const v = e.target.value;
            set('categorie', v);
            // Standaard eenheid voor een nieuw 'product'-type is 'stuk' — enkel
            // automatisch overschakelen vanaf de nog-ongewijzigde 'gram'-default,
            // nooit een bewust gekozen eenheid overrulen.
            if (v === 'product' && form.eenheid === 'gram') set('eenheid', 'stuk');
          }}>
            {CATEGORIEEN.map(c => <option key={c.waarde} value={c.waarde}>{c.label}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{isFilament ? 'Merk *' : 'Merk/Leverancier *'}</label>
            <input value={form.merk} onChange={e => set('merk', e.target.value)} placeholder={isFilament ? 'bv. Elegoo' : 'bv. AliExpress'} />
          </div>
          <div className="form-group">
            <label>{isFilament ? 'Materiaal *' : 'Omschrijving *'}</label>
            <input value={form.materiaal} onChange={e => set('materiaal', e.target.value)} placeholder={isFilament ? 'bv. PLA+' : 'bv. Sleutelhanger rond 30mm'} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Eenheid *</label>
            <select value={form.eenheid} onChange={e => set('eenheid', e.target.value)}>
              {EENHEDEN.map(e => <option key={e.waarde} value={e.waarde}>{e.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Inkoopprijs (€/{form.eenheid === 'gram' ? 'kg' : form.eenheid === 'ml' ? 'ml' : 'stuk'}) *</label>
            <input value={prijsStr} onChange={e => setPrijsStr(e.target.value)} placeholder={form.eenheid === 'gram' ? 'bv. 18.00' : 'bv. 6.50'} />
          </div>
        </div>

        <div className="form-group">
          <label>Marge (%) <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>leeg = globale marge</span></label>
          <input value={margeStr} onChange={e => setMargeStr(e.target.value)} disabled={!!form.vaste_prijs}
            placeholder="bv. 30" style={form.vaste_prijs ? { opacity:0.5 } : undefined} />
        </div>

        {!isFilament && (
          <div className="form-group">
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.vaste_prijs}
                onChange={e => set('vaste_prijs', e.target.checked ? 1 : 0)} />
              Vaste prijs (geen marge, prijs is al incl. BTW)
            </label>
            <div style={{ color:'var(--muted)', fontWeight:400, fontSize:11, marginTop:2 }}>
              Bv. voor verzendkosten: de ingevoerde inkoopprijs wordt dan 1-op-1 als eindprijs gebruikt, zonder marge erbovenop.
            </div>
          </div>
        )}

        {isFilament && (
          <div className="form-group">
            <label>Dichtheid (g/cm³)</label>
            <input type="number" step="0.01" value={form.dichtheid_g_per_cm3}
              onChange={e => set('dichtheid_g_per_cm3', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label>Minimum voorraad <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>
            {isFilament ? 'leeg = automatisch 50g (≤200g rol) / 100g (≥1000g rol)' : 'drempel voor "Te bestellen"'}
          </span></label>
          <input value={minVoorraadStr} onChange={e => setMinVoorraadStr(e.target.value)} placeholder={isFilament ? 'optioneel' : 'bv. 10'} />
        </div>

        {isProduct && (
          <div className="form-group">
            <label>Voorraad (stuks) <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>
              manueel bij te houden — geen automatische afboeking bij verkoop/levering
            </span></label>
            <input value={voorraadStr} onChange={e => setVoorraadStr(e.target.value)} placeholder="bv. 20" />
          </div>
        )}

        <div className="form-group">
          <label>Leverancier</label>
          <input value={form.leverancier || ''} onChange={e => set('leverancier', e.target.value)} />
        </div>

        {/* Vast kleurenpalet — enkel mogelijk voor een al opgeslagen type */}
        <div className="form-group">
          <label>Kleurenpalet <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>optioneel — leeg = alle kleuren toegelaten bij voorraad</span></label>
          {!type?.id
            ? <div style={{ fontSize:11, color:'var(--muted)' }}>Sla dit type eerst op — daarna kan je hier een vast kleurenpalet instellen.</div>
            : !paletGeladen
              ? <div style={{ fontSize:11, color:'var(--muted)' }}>Laden...</div>
              : <>
                  {palet.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                      {palet.map((k, i) => (
                        <span key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:20, border:'1px solid var(--border)', fontSize:11 }}>
                          <KleurDot kleur={k.naam} hex={k.hex} size={10} />
                          {k.naam}
                          <button type="button" onClick={() => paletKleurVerwijderen(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', padding:0, marginLeft:2, fontSize:11 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
                    <span style={{ width:16, height:16, borderRadius:'50%', background: paletHex || 'repeating-linear-gradient(45deg, #fff, #fff 3px, #ccc 3px, #ccc 6px)', border:'1px solid rgba(255,255,255,0.2)', flexShrink:0 }} />
                    <input value={paletNaam} onChange={e => { setPaletNaam(e.target.value); setPaletFout(''); }} placeholder="naam, bv. Zwart" style={{ width:130 }} />
                    <input value={paletCode} onChange={e => { setPaletCode(e.target.value); setPaletFout(''); }} placeholder="#212721 (leeg = transparant)" style={{ width:190 }} />
                    <button type="button" className="btn" style={{ fontSize:11, padding:'3px 10px' }} onClick={paletKleurToevoegen}>+ Toevoegen</button>
                  </div>
                  {paletFout && <div style={{ color:'var(--danger)', fontSize:11, marginTop:4 }}>{paletFout}</div>}
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                    <button type="button" className="btn primary" style={{ fontSize:11 }} onClick={paletOpslaan}>Kleurenpalet opslaan</button>
                    {paletStatus && <span style={{ fontSize:11, color: paletStatus.startsWith('✓') ? 'var(--accent2)' : 'var(--danger)' }}>{paletStatus}</span>}
                  </div>
                </>
          }
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ─── KalibratieModal — Flow Ratio, Max Volumetric Speed enz., per printer ─────
// Op voorraadniveau (type + kleur) i.p.v. artikelniveau — kleur wordt bij de
// voorraad toegekend en bepaalt mee de kalibratiewaarden (pigment beïnvloedt
// flow/temperatuur), dus alle rollen van hetzelfde type+kleur delen 1 set.
const KALIBRATIE_VELDEN = [
  'flow_ratio', 'max_volumetric_speed',
  'nozzle_temp_eerste_laag', 'nozzle_temp_overige_lagen',
  'bed_temp_eerste_laag', 'bed_temp_overige_lagen',
  'pressure_advance', 'retractie_lengte', 'retractie_snelheid',
];

function KalibratieModal({ groep, onClose }) {
  const [rijen, setRijen] = useState([]);
  const [geladen, setGeladen] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const kleur = groep.kleur || '';

  useEffect(() => {
    api.get(`/kalibratie/type/${groep.filament_type_id}?kleur=${encodeURIComponent(kleur)}`).then(rows => {
      setRijen(rows.map(r => {
        const rij = { printer_id: r.printer_id, printer_naam: r.printer_naam, notities: r.notities ?? '' };
        KALIBRATIE_VELDEN.forEach(v => { rij[v] = r[v] ?? ''; });
        return rij;
      }));
      setGeladen(true);
    });
  }, [groep.filament_type_id, kleur]);

  function setVeld(printerId, veld, waarde) {
    setRijen(rs => rs.map(r => r.printer_id === printerId ? { ...r, [veld]: waarde } : r));
  }

  async function bewaarRij(rij) {
    try {
      await api.put('/kalibratie', { filament_type_id: groep.filament_type_id, kleur, printer_id: rij.printer_id, ...rij });
      setSavedId(rij.printer_id);
      setTimeout(() => setSavedId(null), 2500);
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 style={{ display:'flex', alignItems:'center', gap:8 }}>
            <KleurDot kleur={groep.kleur} hex={groep.kleur_hex} size={16} />
            🎛 Kalibratie — {groep.merk} {groep.materiaal}{groep.kleur ? ` — ${groep.kleur}` : ''}
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          Waarden uit je slicerprofiel (Bambu Studio, Orca Slicer, Klipper...), per printer — nozzle en hotend kunnen immers per toestel verschillen.
          {!groep.kleur && ' Dit is de algemene set (geen specifieke kleur toegekend).'}
        </p>

        {!geladen
          ? <p style={{ color: 'var(--muted)' }}>Laden...</p>
          : rijen.length === 0
            ? <div className="empty">Geen actieve printers gevonden</div>
            : rijen.map(rij => (
                <div key={rij.printer_id} className="card" style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{rij.printer_naam}</h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Flow Ratio</label>
                      <input type="number" step="0.01" value={rij.flow_ratio}
                        onChange={e => setVeld(rij.printer_id, 'flow_ratio', e.target.value)} placeholder="bv. 0.98" />
                    </div>
                    <div className="form-group">
                      <label>Max Volumetric Speed (mm³/s)</label>
                      <input type="number" step="0.1" value={rij.max_volumetric_speed}
                        onChange={e => setVeld(rij.printer_id, 'max_volumetric_speed', e.target.value)} placeholder="bv. 15" />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Nozzle temp — 1e laag (°C)</label>
                      <input type="number" value={rij.nozzle_temp_eerste_laag}
                        onChange={e => setVeld(rij.printer_id, 'nozzle_temp_eerste_laag', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Nozzle temp — overige lagen (°C)</label>
                      <input type="number" value={rij.nozzle_temp_overige_lagen}
                        onChange={e => setVeld(rij.printer_id, 'nozzle_temp_overige_lagen', e.target.value)} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Bed temp — 1e laag (°C)</label>
                      <input type="number" value={rij.bed_temp_eerste_laag}
                        onChange={e => setVeld(rij.printer_id, 'bed_temp_eerste_laag', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Bed temp — overige lagen (°C)</label>
                      <input type="number" value={rij.bed_temp_overige_lagen}
                        onChange={e => setVeld(rij.printer_id, 'bed_temp_overige_lagen', e.target.value)} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Pressure Advance / K-factor</label>
                      <input type="number" step="0.001" value={rij.pressure_advance}
                        onChange={e => setVeld(rij.printer_id, 'pressure_advance', e.target.value)} placeholder="bv. 0.045" />
                    </div>
                    <div className="form-group">
                      <label>Retractie lengte (mm)</label>
                      <input type="number" step="0.1" value={rij.retractie_lengte}
                        onChange={e => setVeld(rij.printer_id, 'retractie_lengte', e.target.value)} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Retractie snelheid (mm/s)</label>
                    <input type="number" step="1" value={rij.retractie_snelheid}
                      onChange={e => setVeld(rij.printer_id, 'retractie_snelheid', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label>Notities</label>
                    <input value={rij.notities} onChange={e => setVeld(rij.printer_id, 'notities', e.target.value)}
                      placeholder="bv. slicer-profielnaam" />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn primary" onClick={() => bewaarRij(rij)}>Opslaan</button>
                    {savedId === rij.printer_id && <span style={{ color: 'var(--accent2)', fontSize: 12 }}>✓ Bewaard</span>}
                  </div>
                </div>
              ))
        }

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}

// ─── RolModal ────────────────────────────────────────────────────────────────
function RolModal({ types, rol, onClose, onSaved }) {
  const isEdit = !!rol?.id;
  const initieelTypeId = rol?.filament_type_id || types[0]?.id || '';
  const initieelEenheid = types.find(t => t.id === parseInt(initieelTypeId))?.eenheid || 'gram';

  const [form, setForm] = useState(rol?.id ? {
    filament_type_id: rol.filament_type_id,
    kleur:              rol.kleur || '',
    kleur_hex:          rol.kleur_hex || '',
    gewicht_gram_start: rol.gewicht_gram_start,
    gewicht_gram_huidig: rol.gewicht_gram_huidig,
    locatie:            rol.locatie || '',
    gekocht_op:         rol.gekocht_op || new Date().toISOString().split('T')[0],
    actief:             rol.actief,
    aankoopprijs_eur:   rol.aankoopprijs_eur ?? '',
    lotnummer:          rol.lotnummer || '',
    } : {
    filament_type_id:   initieelTypeId,
    kleur:              rol?.kleur || '',
    kleur_hex:          rol?.kleur_hex || '',
    gewicht_gram_start: initieelEenheid === 'gram' ? 1000 : '',
    gewicht_gram_huidig: initieelEenheid === 'gram' ? 1000 : '',
    locatie:            '',
    gekocht_op:         new Date().toISOString().split('T')[0],
    actief:             1,
    aankoopprijs_eur:   '',
    lotnummer:          '',
  });

  // Lokale strings voor numerieke velden — cursor springt niet weg
  const [startStr,  setStartStr]  = useState(String(form.gewicht_gram_start));
  const [huidigStr, setHuidigStr] = useState(String(form.gewicht_gram_huidig));
  const [prijsStr,  setPrijsStr]  = useState(String(form.aankoopprijs_eur ?? ''));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const gekozenType  = types.find(t => t.id === parseInt(form.filament_type_id));
  const eenheid      = gekozenType?.eenheid || 'gram';
  const eenheidLabel = eenheid === 'stuk' ? 'stuk' : eenheid === 'ml' ? 'ml' : 'kg';
  const isFilamentCat = (gekozenType?.categorie || 'filament') === 'filament';
  const [kleurToggle, setKleurToggle] = useState(isFilamentCat || !!(form.kleur || form.kleur_hex));

  // Kleurenlijst (vast palet + eigen HEX/RGB-kleuren) + invoer voor een nieuwe eigen kleur
  const [kleurenLijst, setKleurenLijst] = useState(alleKleuren());
  const [nieuweKleurOpen, setNieuweKleurOpen] = useState(false);
  const [nieuweKleurCode, setNieuweKleurCode] = useState('');
  const [nieuweKleurNaam, setNieuweKleurNaam] = useState('');
  const [nieuweKleurFout, setNieuweKleurFout] = useState('');
  const nieuweKleurHex = normaliseerHexInvoer(nieuweKleurCode);

  // Sommige artikeltypes zijn maar in een vaste reeks kleuren verkrijgbaar
  // (bv. "AnyCubic PETG") — is er zo'n palet ingesteld voor het gekozen type,
  // dan mag je enkel daaruit kiezen (geen vrije tekst/eigen HEX meer).
  const [typePalet, setTypePalet] = useState([]);
  useEffect(() => {
    if (!form.filament_type_id) { setTypePalet([]); return; }
    let genegeerd = false;
    api.get(`/filament/types/${form.filament_type_id}/kleurenpalet`)
      .then(rows => { if (!genegeerd) setTypePalet(rows); })
      .catch(() => { if (!genegeerd) setTypePalet([]); });
    return () => { genegeerd = true; };
  }, [form.filament_type_id]);
  const heeftBeperktPalet = typePalet.length > 0;
  const gekozenKleurenLijst = heeftBeperktPalet ? typePalet : kleurenLijst;

  async function voegKleurToe() {
    if (!nieuweKleurHex) { setNieuweKleurFout('Ongeldige code — gebruik bv. #a855f7 of rgb(168,85,247)'); return; }
    try {
      const toegevoegd = await api.post('/kleuren', { hex: nieuweKleurHex, naam: nieuweKleurNaam.trim() || null });
      const verse = await api.get('/kleuren');
      registreerCustomKleuren(verse);
      setKleurenLijst([...KLEUREN, ...verse]);
      set('kleur_hex', toegevoegd.hex);
      set('kleur', toegevoegd.naam || form.kleur);
      setNieuweKleurOpen(false); setNieuweKleurCode(''); setNieuweKleurNaam(''); setNieuweKleurFout('');
    } catch (e) { setNieuweKleurFout(e.message); }
  }

  // Bij wisselen van artikeltype (enkel bij nieuwe voorraad) velden resetten naar een logische start
  function onTypeChange(id) {
    set('filament_type_id', id);
    if (!isEdit) {
      const t = types.find(x => x.id === parseInt(id));
      const nieuweEenheid = t?.eenheid || 'gram';
      if (nieuweEenheid === 'gram') {
        setStartStr('1000'); set('gewicht_gram_start', 1000);
        setHuidigStr('1000'); set('gewicht_gram_huidig', 1000);
      } else {
        setStartStr(''); set('gewicht_gram_start', '');
        setHuidigStr(''); set('gewicht_gram_huidig', '');
      }
    }
  }

  function setStandaard(gram) {
    setStartStr(String(gram));
    set('gewicht_gram_start', gram);
    if (!isEdit) {
      setHuidigStr(String(gram));
      set('gewicht_gram_huidig', gram);
    }
  }

  // Effectieve prijs per eenheid berekenen voor weergave
  const aankoopNum = parseFloat(prijsStr.replace(',', '.'));
  const startNum   = parseFloat(startStr) || 0;
  const prijsPerEenheid = (!isNaN(aankoopNum) && aankoopNum > 0 && startNum > 0)
    ? (eenheid === 'gram' ? aankoopNum / (startNum / 1000) : aankoopNum / startNum)
    : (gekozenType?.inkoop_prijs_per_kg || 0);

  const typeprijsTotaal = gekozenType
    ? (eenheid === 'gram'
        ? (gekozenType.inkoop_prijs_per_kg || 0) * startNum / 1000
        : (gekozenType.inkoop_prijs_per_kg || 0) * startNum)
    : 0;

  const prijsInfo = gekozenType ? (() => {
    if (!isNaN(aankoopNum) && aankoopNum > 0 && startNum > 0) {
      return `Aankoopprijs €${aankoopNum.toFixed(2)} = €${prijsPerEenheid.toFixed(2)}/${eenheidLabel} (typeprijs: €${(gekozenType.inkoop_prijs_per_kg || 0).toFixed(2)}/${eenheidLabel})`;
    }
    return `Typeprijs: €${(gekozenType.inkoop_prijs_per_kg || 0).toFixed(2)}/${eenheidLabel} (geen voorraadprijs ingevuld)`;
  })() : null;

  async function save() {
    const startG  = parseFloat(startStr)  || 0;
    const huidigG = parseFloat(huidigStr) || startG;
    const aankoopVal = prijsStr !== '' ? parseFloat(prijsStr.replace(',', '.')) : null;

    const payload = {
      ...form,
      gewicht_gram_start:  startG,
      gewicht_gram_huidig: huidigG,
      aankoopprijs_eur:    (!isNaN(aankoopVal) && aankoopVal > 0) ? aankoopVal : null,
    };

    try {
      if (isEdit) await api.put(`/filament/rollen/${rol.id}`, payload);
      else await api.post('/filament/rollen', payload);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Venster sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? 'Voorraad bewerken' : 'Nieuwe voorraad toevoegen'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* Artikeltype — altijd aanpasbaar */}
        <div className="form-group">
          <label>Artikeltype *</label>
          <select value={form.filament_type_id} onChange={e => onTypeChange(e.target.value)}>
            {types.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
          </select>
        </div>

        {/* Kleur instellen — bij niet-filament via vinkje */}
        {!isFilamentCat && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={kleurToggle} onChange={e => setKleurToggle(e.target.checked)} />
              Kleur instellen voor dit artikel
            </label>
          </div>
        )}

        {/* Kleur */}
        {(isFilamentCat || kleurToggle) && (
          <div className="form-group">
            <label>Kleur <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>
              {heeftBeperktPalet ? 'dit artikeltype heeft een vast kleurenpalet — kies hieronder' : 'optioneel'}
            </span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: kleurHex(form.kleur, form.kleur_hex), border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
              <input value={form.kleur} onChange={e => set('kleur', e.target.value)} placeholder="bv. Robijnrood, Lavendel..." disabled={heeftBeperktPalet} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {gekozenKleurenLijst.map((k, i) => (
                <button key={k.id ?? k.hex ?? i} type="button" onClick={() => { set('kleur_hex', k.hex); set('kleur', k.naam || form.kleur); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
                    border: form.kleur_hex === k.hex ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: form.kleur_hex === k.hex ? 'var(--bg3)' : 'transparent',
                    cursor: 'pointer', fontSize: 11, color: 'var(--text)'
                  }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: k.hex || 'repeating-linear-gradient(45deg, #fff, #fff 3px, #ccc 3px, #ccc 6px)', border: '1px solid rgba(255,255,255,0.2)' }} />
                  {k.naam || k.hex}
                </button>
              ))}
              {!heeftBeperktPalet && (
                <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setNieuweKleurOpen(o => !o)}>
                  + Eigen kleur
                </button>
              )}
            </div>

            {!heeftBeperktPalet && nieuweKleurOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: nieuweKleurHex || '#555', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                <input value={nieuweKleurCode} onChange={e => { setNieuweKleurCode(e.target.value); setNieuweKleurFout(''); }}
                  placeholder="#a855f7 of rgb(168,85,247)" style={{ width: 170 }} />
                <input value={nieuweKleurNaam} onChange={e => setNieuweKleurNaam(e.target.value)}
                  placeholder="naam (optioneel)" style={{ width: 130 }} />
                <button type="button" className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }}
                  disabled={!nieuweKleurHex} onClick={voegKleurToe}>Toevoegen</button>
                {nieuweKleurFout && <span style={{ color: 'var(--danger)', fontSize: 11, width: '100%' }}>{nieuweKleurFout}</span>}
              </div>
            )}
          </div>
        )}

        {/* Standaard rolgewicht — enkel relevant voor filament (gram) */}
        {eenheid === 'gram' && (
          <div className="form-group">
            <label>Standaard rolgewicht</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {[1000, 200].map(g => (
                <button key={g} className={`btn${parseFloat(startStr) === g ? ' primary' : ''}`}
                  style={{ flex: 1 }} onClick={() => setStandaard(g)}>
                  {g}g {g === 200 ? '(mini rol)' : '(standaard)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {prijsInfo && (
          <div style={{ fontSize: 11, color: 'var(--accent2)', marginBottom: 12 }}>💰 {prijsInfo}</div>
        )}

        {/* Aantal / gewicht / volume */}
        <div className="form-row">
          <div className="form-group">
            <label>{eenheid === 'gram' ? 'Startgewicht (g)' : eenheid === 'ml' ? 'Startvolume (ml)' : 'Aantal bij aankoop'}</label>
            <input type="number" value={startStr}
              onChange={e => {
                setStartStr(e.target.value);
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) {
                  set('gewicht_gram_start', n);
                  if (!isEdit) { setHuidigStr(e.target.value); set('gewicht_gram_huidig', n); }
                }
              }} />
          </div>
          <div className="form-group">
            <label>{eenheid === 'gram' ? 'Huidig gewicht (g)' : eenheid === 'ml' ? 'Huidig volume (ml)' : 'Huidig aantal'} {isEdit && <span style={{ color: 'var(--accent)', fontSize: 11 }}>← pas dit aan</span>}</label>
            <input type="number" value={huidigStr}
              onChange={e => {
                setHuidigStr(e.target.value);
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) set('gewicht_gram_huidig', n);
              }} />
          </div>
        </div>

        {/* Aankoopprijs + lotnummer */}
        <div className="form-row">
          <div className="form-group">
            <label>Aankoopprijs (€) <span style={{ color: 'var(--muted)', fontWeight: 400 }}>optioneel</span></label>
            <input
              type="number" step="0.01" min="0"
              value={prijsStr}
              placeholder={gekozenType ? `typeprijs: €${typeprijsTotaal.toFixed(2)}` : ''}
              onChange={e => setPrijsStr(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Lotnummer <span style={{ color: 'var(--muted)', fontWeight: 400 }}>optioneel</span></label>
            <input value={form.lotnummer} onChange={e => set('lotnummer', e.target.value)} placeholder="bv. Amazon 2024-06" />
          </div>
        </div>

        {/* Locatie + datum */}
        <div className="form-row">
          <div className="form-group">
            <label>Locatie</label>
            <input value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="bv. Rek A" />
          </div>
          <div className="form-group">
            <label>Aankoopdatum</label>
            <input type="date" value={form.gekocht_op} onChange={e => set('gekocht_op', e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────
export default function Filament() {
  const [types,     setTypes]     = useState([]);
  const [rollen,    setRollen]    = useState([]);
  const [facturen,  setFacturen]  = useState([]);
  const [tab,       setTab]       = useState('rollen');
  const [typeModal, setTypeModal] = useState(null);
  const [rolModal,  setRolModal]  = useState(null);
  const [groepModal, setGroepModal] = useState(null);
  const [kalibratieModal, setKalibratieModal] = useState(null);
  const [factuurModal, setFactuurModal] = useState(false);

  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight')) : null;
  const highlightRef = useRef(null);

  const load = () => {
    api.get('/filament/types').then(setTypes).catch(e => alert('Kon filamenttypes niet laden: ' + e.message));
    api.get('/filament/rollen').then(setRollen).catch(e => alert('Kon filamentrollen niet laden: ' + e.message));
    api.get('/facturen').then(setFacturen).catch(e => alert('Kon aankoopfacturen niet laden: ' + e.message));
  };

  async function verwijderFactuur(f) {
    if (!confirm(`Factuur/bonnetje van "${f.leverancier || 'onbekende leverancier'}" verwijderen? Het bestand wordt van de schijf verwijderd; gekoppelde voorraad/uitgaven blijven gewoon bestaan.`)) return;
    try {
      await api.delete(`/facturen/${f.id}`);
      load();
    } catch (e) { alert(e.message); }
  }
  useEffect(() => { load(); }, [tab]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, rollen]);

  // Rollen groeperen per (type, kleur) — 1 rij per combinatie i.p.v. 1 rij per rol
  const groepen = Object.values(
    rollen.reduce((acc, r) => {
      const key = groepSleutel(r.filament_type_id, r.kleur);
      if (!acc[key]) {
        acc[key] = {
          key, filament_type_id: r.filament_type_id, merk: r.merk, materiaal: r.materiaal,
          kleur: r.kleur, kleur_hex: r.kleur_hex, eenheid: r.eenheid, categorie: r.categorie,
          rollen: [], aantalActief: 0, aantalTotaal: 0,
          huidigTotaal: 0, startTotaal: 0, restwaardeTotaal: 0,
        };
      }
      const g = acc[key];
      g.rollen.push(r);
      g.aantalTotaal += 1;
      g.restwaardeTotaal += parseFloat(r.restwaarde_eur) || 0;
      if (r.actief) {
        g.aantalActief += 1;
        g.huidigTotaal += parseFloat(r.gewicht_gram_huidig) || 0;
        g.startTotaal += parseFloat(r.gewicht_gram_start) || 0;
      }
      return acc;
    }, {})
  ).sort((a, b) => (b.aantalActief > 0) - (a.aantalActief > 0) || a.merk.localeCompare(b.merk));

  // Bij binnenkomst via een highlight-link (vanuit Dashboard) automatisch de juiste groep openen
  useEffect(() => {
    if (highlightId && rollen.length > 0 && !groepModal) {
      const rolGevonden = rollen.find(r => r.id === highlightId);
      if (rolGevonden) {
        const key = groepSleutel(rolGevonden.filament_type_id, rolGevonden.kleur);
        const groep = groepen.find(g => g.key === key);
        if (groep) setGroepModal(groep);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, rollen]);

  async function toggleRol(rol) {
    try {
      await api.put(`/filament/rollen/${rol.id}`, { ...rol, actief: rol.actief ? 0 : 1 });
      load();
    } catch (e) { alert(e.message); }
  }

  async function deleteRol(rol) {
    if (!confirm(`Rol "${rol.merk} ${rol.materiaal} – ${rol.kleur || 'geen kleur'}" verwijderen?`)) return;
    try {
      await api.delete(`/filament/rollen/${rol.id}`);
      load();
    } catch (e) { alert(e.message); }
  }

  async function deleteType(t) {
    if (!confirm(`Type "${t.merk} ${t.materiaal}" verwijderen?`)) return;
    try {
      await api.delete(`/filament/types/${t.id}`);
      load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Artikelen</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setFactuurModal(true)}>📄 Factuur inlezen</button>
          {tab === 'types'  && <button className="btn primary" onClick={() => setTypeModal({})}>+ Nieuw type</button>}
          {tab === 'rollen' && <button className="btn primary" onClick={() => setRolModal({})}>+ Nieuwe voorraad</button>}
        </div>
      </div>

      {factuurModal && (
        <FactuurUploadModal
          types={types}
          onClose={() => setFactuurModal(false)}
          onDone={() => { setFactuurModal(false); load(); }}
        />
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem' }}>
        {['rollen', 'types', 'facturen'].map(t => (
          <button key={t} className={`btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'rollen' ? 'Voorraad' : t === 'types' ? 'Artikeltypes' : 'Aankoopfacturen'}
          </button>
        ))}
      </div>

      {/* ── Gegroepeerde voorraad-tabel (1 rij per type + kleur) ── */}
      {tab === 'rollen' && (
        groepen.length === 0
          ? <div className="empty">Geen rollen geregistreerd</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Kleur</th>
                    <th>Rollen</th>
                    <th>Voorraad</th>
                    <th>Restwaarde</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groepen.map(g => {
                    const isHighlighted = g.rollen.some(r => r.id === highlightId);
                    return (
                      <tr key={g.key} ref={isHighlighted ? highlightRef : null}
                        style={{
                          opacity: g.aantalActief > 0 ? 1 : 0.5, cursor: 'pointer',
                          outline: isHighlighted ? '2px solid var(--accent)' : undefined,
                          background: isHighlighted ? 'var(--bg3)' : undefined,
                        }}
                        onClick={() => setGroepModal(g)}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{g.merk} {g.materiaal}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <KleurDot kleur={g.kleur} hex={g.kleur_hex} size={14} />
                            <span>{g.kleur || <span style={{ color: 'var(--muted)' }}>—</span>}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {g.aantalTotaal} rol{g.aantalTotaal > 1 ? 'len' : ''}
                          {g.aantalActief !== g.aantalTotaal && (
                            <div style={{ color: 'var(--muted)', fontSize: 11 }}>{g.aantalActief} actief</div>
                          )}
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <div style={{ marginBottom: 4 }}>
                            {g.huidigTotaal.toFixed(0)}{eenheidSuffix(g.eenheid)}
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}> / {g.startTotaal.toFixed(0)}{eenheidSuffix(g.eenheid)}</span>
                          </div>
                          <VoorraadBalk huidig={g.huidigTotaal} start={g.startTotaal} />
                        </td>
                        <td style={{ color: 'var(--accent2)' }}>€{g.restwaardeTotaal.toFixed(2)}</td>
                        <td>
                          {g.aantalActief > 0
                            ? <span className="badge bezig">actief</span>
                            : <span className="badge geannuleerd">leeg</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {/* ── Types tabel ── */}
      {tab === 'types' && (
        types.length === 0
          ? <div className="empty">Geen artikeltypes</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Categorie</th><th>Merk/Leverancier</th><th>Materiaal/Omschrijving</th><th>Eenheid</th><th>Voorraad</th><th>Marge</th><th>Leverancier</th><th>Acties</th></tr>
		</thead>
                <tbody>
                  {types.map(t => {
                    const cat = CATEGORIEEN.find(c => c.waarde === (t.categorie || 'filament'));
                    const onderMinimum = t.categorie === 'product' && t.min_voorraad != null && (t.voorraad_aantal ?? 0) < t.min_voorraad;
                    return (
                    <tr key={t.id} style={{ cursor:'pointer' }} onClick={() => setTypeModal(t)}>
                      <td style={{ fontSize: 12 }}>{cat?.label || t.categorie}</td>
                      <td style={{ fontWeight: 500 }}>{t.merk}</td>
                      <td>{t.materiaal}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.eenheid || 'gram'}</td>
                      <td>
                        {t.categorie === 'product'
                          ? <span style={{ color: onderMinimum ? '#ef4444' : 'var(--text)', fontWeight: onderMinimum ? 700 : 400 }}>
                              {t.voorraad_aantal ?? 0} stuks
                            </span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{t.vaste_prijs ? <span style={{ color:'var(--accent2)' }}>vast, incl. BTW</span> : (t.marge_pct != null ? `${t.marge_pct}%` : <span style={{ fontStyle:'italic' }}>globaal</span>)}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.leverancier || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setTypeModal(t)}>✏</button>
                          <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteType(t)}>✕</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {tab === 'facturen' && (
        facturen.length === 0
          ? <div className="empty">Nog geen facturen/bonnetjes geüpload</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Type</th><th>Leverancier</th><th>Datum</th><th>Factuurnummer</th><th>Totaal</th><th>Gekoppeld</th><th>Acties</th></tr></thead>
                <tbody>
                  {facturen.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontSize: 12 }}>{f.type === 'bonnetje' ? '🧾 Bonnetje' : '📄 Factuur'}</td>
                      <td style={{ fontWeight: 500 }}>{f.leverancier || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{f.datum || '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{f.factuurnummer || '—'}</td>
                      <td>{f.totaal_bedrag != null ? `€${parseFloat(f.totaal_bedrag).toFixed(2)}` : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {f.aantal_rollen > 0 ? `${f.aantal_rollen}× voorraad` : ''}
                        {f.aantal_rollen > 0 && f.aantal_uitgaven > 0 ? ', ' : ''}
                        {f.aantal_uitgaven > 0 ? `${f.aantal_uitgaven}× uitgave` : ''}
                        {!f.aantal_rollen && !f.aantal_uitgaven ? '—' : ''}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {f.bestandspad
                            ? <a className="btn" style={{ fontSize: 11, padding: '4px 8px' }} href={`${BASE}/facturen/${f.id}/bestand`} target="_blank" rel="noopener noreferrer" title="Bekijken/downloaden">⬇</a>
                            : <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Bestand niet bewaard">—</span>}
                          <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => verwijderFactuur(f)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {typeModal !== null && (
        <TypeModal
          type={typeModal?.id ? typeModal : null}
          onClose={() => setTypeModal(null)}
          onSaved={() => { setTypeModal(null); load(); }}
        />
      )}
      {kalibratieModal !== null && (
        <KalibratieModal
          groep={kalibratieModal}
          onClose={() => setKalibratieModal(null)}
        />
      )}
      {rolModal !== null && (
        <RolModal
          types={types}
          rol={rolModal}
          onClose={() => setRolModal(null)}
          onSaved={() => { setRolModal(null); load(); }}
        />
      )}
      {groepModal !== null && (
        <GroepDetailModal
          groep={groepModal}
          rollen={rollen.filter(r => groepSleutel(r.filament_type_id, r.kleur) === groepModal.key)}
          onClose={() => setGroepModal(null)}
          onEditRol={r => { setGroepModal(null); setRolModal(r); }}
          onNieuweRol={() => { setGroepModal(null); setRolModal({ filament_type_id: groepModal.filament_type_id, kleur: groepModal.kleur, kleur_hex: groepModal.kleur_hex }); }}
          onToggleActief={toggleRol}
          onDeleteRol={deleteRol}
          onKalibratie={() => { setGroepModal(null); setKalibratieModal(groepModal); }}
        />
      )}
    </div>
  );
}
