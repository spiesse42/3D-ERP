import { useState, useEffect, useRef, useCallback } from 'react';
import { api, BASE } from '../lib/api.js';
import KlantModal from '../components/KlantModal.jsx';

const STATUSSEN = ['concept','verstuurd','goedgekeurd','geannuleerd'];
const BTW_OPTIES = [0, 6, 21];

function statusKleur(s) {
  return { concept:'#f59e0b', verstuurd:'#60a5fa', goedgekeurd:'#22c55e', geannuleerd:'#6b7280' }[s] || '#6b7280';
}

const eenheidLabel = e => e === 'stuk' ? 'stuk(s)' : e === 'ml' ? 'ml' : 'g';

// Stabiele string-state voor elk invoerveld — cursor springt nooit weg
function useField(init) {
  const [val, setVal] = useState(String(init ?? ''));
  const ref = useRef(false);
  return {
    val,
    props: {
      value: val,
      onChange: e => setVal(e.target.value),
      onFocus: () => { ref.current = true; },
      onBlur:  () => { ref.current = false; },
    },
    setExternal: v => { if (!ref.current) setVal(String(v ?? '')); },
    num: () => parseFloat(val.replace(',', '.')) || 0,
    int: () => parseInt(val) || 0,
  };
}

function berekenLive(form, tarieven, rollen, artikelenKost = 0) {
  if (!form.filament_rol_id || !form.geschat_gewicht_g) return null;

  const rol = rollen.find(r => r.id === parseInt(form.filament_rol_id));
  if (!rol) return null;

  const t = tarieven;
  const prijsPerKg = parseFloat(rol.prijs_per_kg_effectief || rol.inkoop_prijs_per_kg) || 0;
  const faal  = 1 + (t.faalfactor_pct || 10) / 100;
  const gram  = parseFloat(form.geschat_gewicht_g) || 0;
  const totU  = (parseInt(form.geschatte_tijd_u) || 0) + (parseInt(form.geschatte_tijd_min) || 0) / 60;
  const aantal = parseInt(form.aantal) || 1;
  const watt  = form.printer_watt || 120;

  // Machinekost: gebruik printer-specifieke kost indien beschikbaar
  const machKost = parseFloat(form.machine_kost_per_uur) || (t.machine_per_uur || 0.13);

  // Materiaal via rolprijs
  let mat = (gram / 1000) * prijsPerKg * faal * aantal;

  // Multicolor: som per kleur via gekozen rol
  if (form.is_multicolor && form.filament_rollen?.length > 0) {
    const multiMat = form.filament_rollen.reduce((s, fr) => {
      const r2 = rollen.find(r => r.id === parseInt(fr.filament_rol_id));
      const p2 = parseFloat(r2?.prijs_per_kg_effectief || r2?.inkoop_prijs_per_kg) || prijsPerKg;
      const g2 = parseFloat(fr.gram) || 0;
      return s + (g2 / 1000) * p2 * faal;
    }, 0) * aantal;
    if (form.filament_rollen.some(fr => fr.gram > 0)) mat = multiMat;
  }

  const ener  = (watt / 1000) * totU * (t.kwh_prijs || 0.35) * aantal;
  const mach  = totU * machKost * aantal;
  const voorb = parseFloat(form.voorbereiding_min) || 0;
  const nab   = parseFloat(form.nabewerking_min) || 0;
  const arb   = (voorb + nab) / 60 * (t.arbeid_per_uur || 15)
    + (parseInt(form.ontwerp_min) || 0) / 60 * (parseFloat(form.ontwerp_tarief) || 15)
    + (parseInt(form.nabewerking_extra_min) || 0) / 60 * (parseFloat(form.nabewerking_extra_tarief) || 15);
  const bmcu  = form.is_multicolor ? (t.bmcu_per_job || 0.10) : 0;
  const extra = (parseFloat(form.extra_per_stuk) || 0) * aantal + (parseFloat(form.extra_eenmalig) || 0);
  const artikelen = parseFloat(artikelenKost) || 0;

  const sub   = mat + ener + mach + arb + extra + bmcu + artikelen;
  const margeGrns = t.marge_grens_uur || 4;
  const marge = totU >= margeGrns ? (t.marge_groot_pct || 10) : (t.marge_klein_pct || 18);
  const vkp   = sub * (1 + marge / 100);

  return { mat, ener, mach, arb, extra, bmcu, artikelen, sub, marge, vkp, aantal, prijsPerKg };
}

// Op moduleniveau gedefinieerd (niet binnen OfferteFormulier) — anders krijgen
// deze bij elke toetsaanslag een nieuwe component-identiteit, waardoor React
// het onderliggende <input> unmount/remount en de cursor/focus verloren gaat.
const Sec = ({ title, children }) => (
  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.85rem', marginBottom:'0.85rem' }}>
    <p style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)', marginBottom:8 }}>{title}</p>
    {children}
  </div>
);

const F = ({ label, children, style }) => (
  <div className="form-group" style={{ marginBottom:0, ...style }}>
    <label style={{ fontSize:11 }}>{label}</label>
    {children}
  </div>
);

// ── OfferteFormulier ──────────────────────────────────────────────────────────
function OfferteFormulier({ initForm, klanten, printers, filamentTypes, allRollen, tarieven, onSaved, onCancel, onKlantToegevoegd }) {
  const [form, setForm] = useState({
    klant_id:'', printer_id: printers[0]?.id || '',
    filament_type_id:'', filament_rol_id:'',
    object_naam:'', object_link:'',
    geschat_gewicht_g:'',
    geschatte_tijd_u:0, geschatte_tijd_min:0,
    voorbereiding_min: tarieven.voorbereiding_min || 15,
    nabewerking_min: tarieven.nabewerking_min || 10,
    ontwerp_min:0, ontwerp_tarief: tarieven.ontwerp_tarief || 15,
    nabewerking_extra_min:0, nabewerking_extra_tarief: tarieven.nabewerking_tarief || 15,
    is_multicolor:false, filament_rollen:[],
    extra_per_stuk:0, extra_eenmalig:0, extra_omschrijving:'',
    aantal:1, btw_pct:21, geldig_tot:'', notities:'',
    machine_kost_per_uur: '',
    printer_watt: 120,
    ...initForm
  });
  const [saving, setSaving] = useState(false);
  const [rollenVoorType, setRollenVoorType] = useState([]);
  const [artikelen, setArtikelen] = useState(initForm.artikelen || []);
  const [artikelTypeId, setArtikelTypeId] = useState('');
  const [artikelAantal, setArtikelAantal] = useState('');
  const [klantModal, setKlantModal] = useState(false);
  const set = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  // Extra artikelen (bv. verzendkosten) — alleen niet-filament types, prijs op
  // TYPE-niveau net als het hoofdfilament: een offerte reserveert geen stock.
  const artikelTypes = filamentTypes.filter(f => (f.categorie || 'filament') !== 'filament');
  const artikelenKost = artikelen.reduce((som, a) => {
    const deler = a.eenheid === 'gram' ? 1000 : 1;
    return som + (parseFloat(a.aantal) / deler) * (parseFloat(a.inkoop_prijs_per_kg) || 0);
  }, 0);

  async function voegArtikelToe() {
    if (!artikelTypeId || !artikelAantal) return alert('Selecteer een artikel en geef een aantal op');
    try {
      const r = await api.post(`/offertes2/${form.id}/artikelen`, { filament_type_id: artikelTypeId, aantal: parseFloat(artikelAantal) });
      setArtikelen(r.artikelen);
      setArtikelTypeId(''); setArtikelAantal('');
    } catch(e) { alert(e.message); }
  }

  async function wijzigArtikelAantal(artikelId, nieuwAantal) {
    if (isNaN(nieuwAantal) || nieuwAantal <= 0) return;
    try {
      const r = await api.put(`/offertes2/${form.id}/artikelen/${artikelId}`, { aantal: nieuwAantal });
      setArtikelen(r.artikelen);
    } catch(e) { alert(e.message); }
  }

  async function verwijderArtikel(artikelId) {
    try {
      const r = await api.delete(`/offertes2/${form.id}/artikelen/${artikelId}`);
      setArtikelen(r.artikelen);
    } catch(e) { alert(e.message); }
  }

  // Lokale string-states voor alle numerieke velden
  const gewichtF    = useField(form.geschat_gewicht_g);
  const tijdUF      = useField(form.geschatte_tijd_u);
  const tijdMinF    = useField(form.geschatte_tijd_min);
  const voorbF      = useField(form.voorbereiding_min);
  const nabF        = useField(form.nabewerking_min);
  const ontwMinF    = useField(form.ontwerp_min);
  const ontwTarF    = useField(form.ontwerp_tarief);
  const nabExMinF   = useField(form.nabewerking_extra_min);
  const nabExTarF   = useField(form.nabewerking_extra_tarief);
  const aantalF     = useField(form.aantal);
  const extraStukF  = useField(form.extra_per_stuk);
  const extraEenF   = useField(form.extra_eenmalig);

  // Sync velden naar form
  useEffect(() => { set('geschat_gewicht_g',       gewichtF.num()); }, [gewichtF.val]);
  useEffect(() => { set('geschatte_tijd_u',         tijdUF.int());   }, [tijdUF.val]);
  useEffect(() => { set('geschatte_tijd_min',       tijdMinF.int()); }, [tijdMinF.val]);
  useEffect(() => { set('voorbereiding_min',        voorbF.num());   }, [voorbF.val]);
  useEffect(() => { set('nabewerking_min',          nabF.num());     }, [nabF.val]);
  useEffect(() => { set('ontwerp_min',              ontwMinF.int()); }, [ontwMinF.val]);
  useEffect(() => { set('ontwerp_tarief',           ontwTarF.num()); }, [ontwTarF.val]);
  useEffect(() => { set('nabewerking_extra_min',    nabExMinF.int());}, [nabExMinF.val]);
  useEffect(() => { set('nabewerking_extra_tarief', nabExTarF.num());}, [nabExTarF.val]);
  useEffect(() => { set('aantal',                   aantalF.int());  }, [aantalF.val]);
  useEffect(() => { set('extra_per_stuk',           extraStukF.num());}, [extraStukF.val]);
  useEffect(() => { set('extra_eenmalig',           extraEenF.num());}, [extraEenF.val]);

  // Laad rollen wanneer filamenttype wijzigt
  useEffect(() => {
    if (!form.filament_type_id) { setRollenVoorType([]); set('filament_rol_id', ''); return; }
    api.get(`/filament/rollen/by-type/${form.filament_type_id}`)
      .then(r => {
        setRollenVoorType(r);
        // Auto-select als er maar 1 rol is
        if (r.length === 1) set('filament_rol_id', r[0].id);
        else set('filament_rol_id', '');
      })
      .catch(() => setRollenVoorType([]));
  }, [form.filament_type_id]);

  // Printer wattage + machinekost bijwerken bij printerwijziging — het
  // gemiddeld verbruik dat per printer is ingesteld (Instellingen-tab, zelfde
  // waarde als KostenModal gebruikt voor de kWh-schatting) heeft voorrang;
  // enkel als dat niet is ingevuld, valt terug op de oude generieke tarieven.
  useEffect(() => {
    const p = printers.find(p => p.id === parseInt(form.printer_id));
    if (p) {
      set('machine_kost_per_uur', p.machine_kost_per_uur || 0.13);
      set('printer_watt', p.gem_verbruik_watt > 0
        ? p.gem_verbruik_watt
        : (p.naam?.toLowerCase().includes('ender') ? (tarieven.ender_watt || 150) : (tarieven.bambu_watt || 120)));
    }
  }, [form.printer_id]);

  const gekozenRol = rollenVoorType.find(r => r.id === parseInt(form.filament_rol_id));
  const stockWaarschuwing = gekozenRol && form.geschat_gewicht_g
    ? parseFloat(form.geschat_gewicht_g) > gekozenRol.gewicht_gram_huidig
    : false;

  const preview = berekenLive(form, tarieven, allRollen, artikelenKost);

  function addFilamentRol() {
    set('filament_rollen', [...(form.filament_rollen || []), { filament_type_id: form.filament_type_id || '', filament_rol_id: '', gram: '' }]);
  }

  function setRolField(i, k, v) {
    const rollen = [...(form.filament_rollen || [])];
    rollen[i] = { ...rollen[i], [k]: v };
    set('filament_rollen', rollen);
  }

  function removeRol(i) {
    set('filament_rollen', (form.filament_rollen || []).filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!form.klant_id) return alert('Selecteer een klant');
    if (!form.filament_rol_id) return alert('Selecteer een filamentrol');
    if (form.is_multicolor && form.filament_rollen.some(fr => !fr.filament_rol_id))
      return alert('Selecteer voor elke kleur een filamentrol');
    setSaving(true);
    try {
      let r;
      if (form.id) r = await api.put(`/offertes2/${form.id}`, form);
      else r = await api.post('/offertes2', form);
      onSaved({ ...form, ...r });
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 270px', gap:'1.25rem', alignItems:'start' }}>
      <div>
        {/* KLANT & OBJECT */}
        <Sec title="Klant & object">
          <div className="form-row" style={{ marginBottom:8 }}>
            <F label="Klant *">
              <div style={{ display:'flex', gap:6 }}>
                <select value={form.klant_id} onChange={e => set('klant_id', e.target.value)} style={{ flex:1 }}>
                  <option value="">— selecteer —</option>
                  {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
                </select>
                <button type="button" className="btn" style={{ fontSize:11, padding:'0 8px' }}
                  onClick={() => setKlantModal(true)} title="Nieuwe klant aanmaken">+ Nieuw</button>
              </div>
            </F>
            <F label="Printer">
              <select value={form.printer_id} onChange={e => set('printer_id', e.target.value)}>
                {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
              </select>
            </F>
          </div>
          <F label="Object naam" style={{ marginBottom:8 }}>
            <input value={form.object_naam || ''} onChange={e => set('object_naam', e.target.value)} placeholder="bv. Corgi hond..." />
          </F>
          <F label="Link (Makerworld, Printables...)">
            <input value={form.object_link || ''} onChange={e => set('object_link', e.target.value)} placeholder="https://..." />
          </F>
        </Sec>

        {/* SLICER DATA */}
        <Sec title="Slicer data">
          <div className="form-row" style={{ marginBottom:8 }}>
            <F label="Filamenttype (hoofd)">
              <select value={form.filament_type_id || ''} onChange={e => set('filament_type_id', e.target.value)}>
                <option value="">— selecteer type —</option>
                {filamentTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal}</option>)}
              </select>
            </F>
            <F label="Geschat gewicht (g)">
              <input type="number" step="0.1" {...gewichtF.props} placeholder="uit slicer" />
            </F>
          </div>

          {/* Roldropdown */}
          {form.filament_type_id && (
            <F label="Filamentrol *" style={{ marginBottom:8 }}>
              {rollenVoorType.length === 0
                ? <div style={{ fontSize:11, color:'var(--danger)', padding:'6px 0' }}>⚠ Geen actieve rollen van dit type in stock</div>
                : <select value={form.filament_rol_id || ''} onChange={e => set('filament_rol_id', e.target.value)}>
                    <option value="">— selecteer rol —</option>
                    {rollenVoorType.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.lotnummer || `Rol #${r.id}`} — {r.kleur || 'geen kleur'} — {r.gewicht_gram_huidig}g resterend — €{parseFloat(r.prijs_per_kg_effectief).toFixed(2)}/kg
                      </option>
                    ))}
                  </select>
              }
              {stockWaarschuwing && (
                <div style={{ fontSize:11, color:'var(--danger)', marginTop:4 }}>
                  ⚠ Onvoldoende stock: {gekozenRol.gewicht_gram_huidig}g resterend, {form.geschat_gewicht_g}g nodig
                </div>
              )}
              {gekozenRol && !stockWaarschuwing && (
                <div style={{ fontSize:11, color:'var(--accent2)', marginTop:4 }}>
                  ✓ {gekozenRol.gewicht_gram_huidig}g resterend — €{parseFloat(gekozenRol.prijs_per_kg_effectief).toFixed(2)}/kg
                  {gekozenRol.aankoopprijs_eur ? ` (aankoopprijs: €${parseFloat(gekozenRol.aankoopprijs_eur).toFixed(2)})` : ' (typeprijs)'}
                </div>
              )}
            </F>
          )}

          <div className="form-row" style={{ marginBottom:8 }}>
            <F label="Tijd — uren">
              <input type="number" min="0" {...tijdUF.props} />
            </F>
            <F label="Tijd — minuten">
              <input type="number" min="0" max="59" {...tijdMinF.props} />
            </F>
          </div>

          {/* Multicolor toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: form.is_multicolor ? 8 : 0 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.is_multicolor} onChange={e => set('is_multicolor', e.target.checked)} />
              Multicolor (BMCU +€{tarieven.bmcu_per_job || 0.10})
            </label>
          </div>

          {/* Multicolor rollen */}
          {form.is_multicolor && (
            <div style={{ marginTop:8, padding:'0.75rem', background:'var(--bg2)', borderRadius:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Filament per kleur</span>
                <button className="btn" style={{ fontSize:10, padding:'2px 8px' }} onClick={addFilamentRol}>+ Kleur</button>
              </div>
              {(form.filament_rollen || []).map((fr, i) => {
                const rollenVoorKleur = fr.filament_type_id
                  ? allRollen.filter(r => r.filament_type_id === parseInt(fr.filament_type_id) && r.actief)
                  : [];
                return (
                  <div key={i} style={{ marginBottom:8, background:'var(--bg3)', borderRadius:6, padding:'6px 8px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:6, marginBottom:4 }}>
                      <select value={fr.filament_type_id || ''} onChange={e => { setRolField(i, 'filament_type_id', e.target.value); setRolField(i, 'filament_rol_id', ''); }} style={{ fontSize:11 }}>
                        <option value="">— type —</option>
                        {filamentTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal}</option>)}
                      </select>
                      <button onClick={() => removeRol(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}>✕</button>
                    </div>
                    {fr.filament_type_id && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:6 }}>
                        <select value={fr.filament_rol_id || ''} onChange={e => setRolField(i, 'filament_rol_id', e.target.value)} style={{ fontSize:11 }}>
                          <option value="">— rol —</option>
                          {rollenVoorKleur.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.lotnummer || `Rol #${r.id}`} — {r.kleur || '?'} — {r.gewicht_gram_huidig}g
                            </option>
                          ))}
                        </select>
                        <input type="number" placeholder="gram" value={fr.gram || ''} onChange={e => setRolField(i, 'gram', e.target.value)} style={{ fontSize:11 }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Sec>

        {/* ARBEID */}
        <Sec title="Arbeid">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
            <F label="Voorbereiding (min)">
              <input type="number" min="0" {...voorbF.props} />
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                → €{(voorbF.num() / 60 * (tarieven.arbeid_per_uur || 15)).toFixed(2)}
              </div>
            </F>
            <F label="Nabewerking (min)">
              <input type="number" min="0" {...nabF.props} />
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                → €{(nabF.num() / 60 * (tarieven.arbeid_per_uur || 15)).toFixed(2)}
              </div>
            </F>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px', gap:6, marginBottom:6 }}>
            <F label="Ontwerp regie (min)">
              <input type="number" min="0" {...ontwMinF.props} />
            </F>
            <F label="Tarief (€/u)">
              <input type="number" {...ontwTarF.props} />
            </F>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:11, color:'var(--accent2)' }}>
              {ontwMinF.int() > 0 ? `€${(ontwMinF.int() / 60 * ontwTarF.num()).toFixed(2)}` : ''}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px', gap:6 }}>
            <F label="Nabewerking extra (min)">
              <input type="number" min="0" {...nabExMinF.props} />
            </F>
            <F label="Tarief (€/u)">
              <input type="number" {...nabExTarF.props} />
            </F>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:11, color:'var(--accent2)' }}>
              {nabExMinF.int() > 0 ? `€${(nabExMinF.int() / 60 * nabExTarF.num()).toFixed(2)}` : ''}
            </div>
          </div>
        </Sec>

        {/* EXTRA */}
        <Sec title="Extra kosten">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
            <F label="Aantal stuks">
              <input type="number" min="1" {...aantalF.props} />
            </F>
            <F label="Extra/stuk (€)">
              <input type="number" min="0" step="0.01" {...extraStukF.props} />
            </F>
            <F label="Extra eenmalig (€)">
              <input type="number" min="0" step="0.01" {...extraEenF.props} />
            </F>
          </div>
          <F label="Omschrijving extra">
            <input value={form.extra_omschrijving || ''} onChange={e => set('extra_omschrijving', e.target.value)} placeholder="bv. 20 ringetjes" />
          </F>
        </Sec>

        {/* EXTRA ARTIKELEN — bv. verzendkosten, uit voorraad (niet-filament types) */}
        <Sec title="📦 Extra artikelen">
          {!form.id
            ? <div style={{ fontSize:11, color:'var(--muted)' }}>
                Sla de offerte eerst op — daarna kan je hier extra artikelen zoals verzendkosten toevoegen.
              </div>
            : <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 90px auto', gap:6, alignItems:'end', marginBottom:8 }}>
                  <select value={artikelTypeId} onChange={e => setArtikelTypeId(e.target.value)} style={{ fontSize:12 }}>
                    <option value="">— selecteer artikel —</option>
                    {artikelTypes.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.merk} {f.materiaal} — €{(f.inkoop_prijs_per_kg || 0).toFixed(2)}/{eenheidLabel(f.eenheid).replace('(s)','')}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number" min="0.1" step="0.1"
                    placeholder={artikelTypes.find(f => f.id === parseInt(artikelTypeId))?.eenheid === 'gram' ? 'gram' : 'aantal'}
                    value={artikelAantal} onChange={e => setArtikelAantal(e.target.value)} style={{ fontSize:12 }}
                  />
                  <button className="btn primary" style={{ fontSize:11 }} onClick={voegArtikelToe}>+ Voeg toe</button>
                </div>

                {artikelTypes.length === 0 && (
                  <div style={{ fontSize:11, color:'var(--muted)' }}>
                    Geen extra artikelen beschikbaar — voeg eerst een type toe via de Artikelen-tab.
                  </div>
                )}

                {artikelen.map(a => {
                  const deler = a.eenheid === 'gram' ? 1000 : 1;
                  return (
                    <div key={a.id} style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px', marginBottom:4, fontSize:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:500, flex:1 }}>{a.merk} {a.materiaal}</span>
                        <input
                          type="number" min="0.1" step="0.1"
                          defaultValue={a.eenheid === 'stuk' ? Math.round(a.aantal) : a.aantal}
                          style={{ width:70, fontSize:12 }}
                          onBlur={e => wijzigArtikelAantal(a.id, parseFloat(e.target.value))}
                        />
                        <span style={{ color:'var(--muted)', minWidth:90, fontSize:11 }}>
                          {eenheidLabel(a.eenheid)} · €{((a.aantal / deler) * (a.inkoop_prijs_per_kg || 0)).toFixed(2)}
                        </span>
                        <button onClick={() => verwijderArtikel(a.id)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:12 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </>
          }
        </Sec>

        {/* OFFERTE DETAILS */}
        <Sec title="Offerte details">
          <div className="form-row" style={{ marginBottom:6 }}>
            <F label="Geldig tot">
              <input type="date" value={form.geldig_tot || ''} onChange={e => set('geldig_tot', e.target.value)} />
            </F>
            <F label="BTW %">
              <select value={form.btw_pct} onChange={e => set('btw_pct', parseFloat(e.target.value))}>
                {BTW_OPTIES.map(b => <option key={b} value={b}>{b}%</option>)}
              </select>
            </F>
          </div>
          <F label="Notities">
            <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
          </F>
        </Sec>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" style={{ flex:1 }} onClick={onCancel}>Annuleer</button>
          <button className="btn primary" style={{ flex:2 }} onClick={save} disabled={saving}>
            {saving ? 'Bezig...' : form.id ? '💾 Bijwerken' : '📋 Offerte aanmaken'}
          </button>
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <div style={{ position:'sticky', top:0 }}>
        <div className="card" style={{ padding:'1rem' }}>
          <h2 style={{ fontSize:13, fontWeight:600, marginBottom:'0.75rem' }}>📊 Live prijsoverzicht</h2>
          {!preview
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Selecteer filamenttype, rol en gewicht</p>
            : <>
              {[
                ['Materiaal', preview.mat],
                ['Energie', preview.ener],
                ['Machine', preview.mach],
                ['Arbeid', preview.arb],
                ...(preview.bmcu > 0 ? [['BMCU', preview.bmcu]] : []),
                ...(preview.extra > 0 ? [['Extra', preview.extra]] : []),
                ...(preview.artikelen > 0 ? [['Artikelen', preview.artikelen]] : []),
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <span style={{ color:'var(--muted)' }}>{label}</span>
                  <span>€{(val || 0).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
                <span>Subtotaal</span><span>€{preview.sub.toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
                <span>Marge ({preview.marge}%)</span><span>€{(preview.vkp - preview.sub).toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 2px', fontWeight:700 }}>
                <span style={{ fontSize:13 }}>Verkoopprijs{preview.aantal > 1 ? ` (${preview.aantal}×)` : ''}</span>
                <span style={{ fontSize:20, color:'var(--accent2)' }}>€{preview.vkp.toFixed(2)}</span>
              </div>
              {form.btw_pct > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', paddingTop:4 }}>
                  <span>+ BTW {form.btw_pct}%</span>
                  <span>€{(preview.vkp * form.btw_pct / 100).toFixed(2)}</span>
                </div>
              )}
              {preview.aantal > 1 && (
                <div style={{ textAlign:'right', fontSize:11, color:'var(--muted)' }}>€{(preview.vkp / preview.aantal).toFixed(2)}/stuk</div>
              )}
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:6, borderTop:'1px solid var(--border)', paddingTop:6 }}>
                Rolprijs: €{preview.prijsPerKg.toFixed(2)}/kg
              </div>
            </>
          }
        </div>
      </div>

      {klantModal && (
        <KlantModal
          onClose={() => setKlantModal(false)}
          onSaved={(nieuweKlant) => {
            setKlantModal(false);
            set('klant_id', nieuweKlant.id);
            onKlantToegevoegd?.(nieuweKlant);
          }}
        />
      )}
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────
export default function Offertes() {
  const [offertes,     setOffertes]     = useState([]);
  const [klanten,      setKlanten]      = useState([]);
  const [printers,     setPrinters]     = useState([]);
  const [filamentTypes,setFilamentTypes]= useState([]);
  const [allRollen,    setAllRollen]    = useState([]);
  const [tarieven,     setTarieven]     = useState({});
  const [view,         setView]         = useState('lijst');
  const [detail,       setDetail]       = useState(null);
  const [editForm,     setEditForm]     = useState(null);
  const [jobStatus,    setJobStatus]    = useState('');

  const load = () => api.get('/offertes2').then(setOffertes);

  useEffect(() => {
    load();
    api.get('/klanten').then(setKlanten);
    api.get('/printers').then(setPrinters);
    api.get('/filament/types').then(setFilamentTypes);
    api.get('/filament/rollen').then(setAllRollen);
    api.get('/tarieven').then(rows => setTarieven(Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]))));
  }, []);

  async function openDetail(id) {
    const d = await api.get(`/offertes2/${id}`);
    setDetail(d); setView('detail'); setJobStatus('');
  }

  async function updateStatus(id, status) {
    await api.patch(`/offertes2/${id}/status`, { status });
    load();
    if (detail?.id === id) setDetail(d => ({ ...d, status }));
  }

  async function maakJob(id) {
    setJobStatus('Bezig...');
    try {
      const r = await api.post(`/offertes2/${id}/maak-job`, {});
      setJobStatus(`✓ Job aangemaakt (ID: ${r.job_id}) — ga naar Jobs`);
      load();
      if (detail?.id === id) { const u = await api.get(`/offertes2/${id}`); setDetail(u); }
    } catch(e) { setJobStatus('✗ ' + e.message); }
  }

  async function del(id) {
    if (!confirm('Offerte verwijderen? De gekoppelde werkbon wordt ook verwijderd.')) return;
    try {
      await api.delete(`/offertes2/${id}`);
      load();
      if (view === 'detail') { setDetail(null); setView('lijst'); }
    } catch(e) { alert(e.message); }
  }

  if (view === 'nieuw' || (view === 'bewerk' && editForm)) {
    const isEdit = view === 'bewerk';
    return (
      <div>
        <div className="page-header">
          <h1>{isEdit ? `Offerte bewerken — ${editForm.nummer}` : 'Nieuwe offerte'}</h1>
          <button className="btn" onClick={() => isEdit ? setView('detail') : setView('lijst')}>← Terug</button>
        </div>
        <OfferteFormulier
          initForm={isEdit ? editForm : {}}
          klanten={klanten} printers={printers} filamentTypes={filamentTypes}
          allRollen={allRollen} tarieven={tarieven}
          onKlantToegevoegd={(k) => api.get('/klanten').then(setKlanten)}
          onSaved={async (updated) => {
            await load();
            if (isEdit) {
              const u = await api.get(`/offertes2/${editForm.id}`); setDetail(u); setView('detail');
            } else {
              // Meteen naar bewerk-modus met het echte id, zodat extra artikelen
              // (bv. verzendkosten) meteen na aanmaak toegevoegd kunnen worden.
              setEditForm(updated); setView('bewerk');
            }
          }}
          onCancel={() => isEdit ? setView('detail') : setView('lijst')}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <button className="btn primary" onClick={() => setView('nieuw')}>+ Nieuwe offerte</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail && view === 'detail' ? '1fr 380px' : '1fr', gap:'1rem' }}>
        <div>
          {offertes.length === 0
            ? <div className="empty"><p>Nog geen offertes</p><p style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>Klik op "+ Nieuwe offerte" om te starten</p></div>
            : <div className="card" style={{ padding:0 }}>
                <table>
                  <thead><tr><th>Nummer</th><th>Klant</th><th>Object</th><th>Status</th><th>Prijs</th><th>Datum</th><th></th></tr></thead>
                  <tbody>
                    {offertes.map(o => (
                      <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => openDetail(o.id)}>
                        <td style={{ fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{o.nummer}</td>
                        <td style={{ fontSize:13 }}>{o.klant_voornaam ? `${o.klant_voornaam} ${o.klant_naam}` : o.klant_naam}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{o.object_naam || '—'}</td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:600, color:statusKleur(o.status), background:statusKleur(o.status)+'22', padding:'2px 8px', borderRadius:20 }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ color:'var(--accent2)', fontWeight:500 }}>€{o.verkoopprijs?.toFixed(2)}</td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>{o.aangemaakt_op?.split('T')[0]}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <a className="btn" style={{ fontSize:10, padding:'3px 7px' }} href={`${BASE}/offertes2/${o.id}/pdf`} download title="PDF">↓</a>
                            <button className="btn danger" style={{ fontSize:10, padding:'3px 7px' }} onClick={() => del(o.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

        {detail && view === 'detail' && (
          <div className="card" style={{ position:'sticky', top:0, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <h2 style={{ fontSize:15, fontWeight:700 }}>{detail.nummer}</h2>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn" style={{ fontSize:11 }} onClick={() => { setEditForm({...detail}); setView('bewerk'); }}>✏</button>
                <button className="btn" onClick={() => { setDetail(null); setView('lijst'); }}>✕</button>
              </div>
            </div>

            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.65rem', marginBottom:'0.75rem', fontSize:13 }}>
              <div style={{ fontWeight:600 }}>{detail.klant_voornaam ? `${detail.klant_voornaam} ${detail.klant_naam}` : detail.klant_naam}</div>
              {detail.email && <div style={{ color:'var(--muted)', fontSize:12 }}>✉ {detail.email}</div>}
              {detail.object_naam && <div style={{ color:'var(--accent)', fontSize:12 }}>📦 {detail.object_naam}</div>}
              {detail.object_link && <a href={detail.object_link} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--accent)' }}>🔗 Link</a>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, fontSize:12, marginBottom:'0.75rem' }}>
              {[
                ['Printer', detail.printer_naam || '—'],
                ['Filament', detail.filament_merk ? `${detail.filament_merk} ${detail.filament_materiaal}` : '—'],
                ['Gewicht', detail.geschat_gewicht_g ? `${detail.geschat_gewicht_g}g` : '—'],
                ['Tijd', `${detail.geschatte_tijd_u || 0}u ${detail.geschatte_tijd_min || 0}min`],
                ['Aantal', detail.aantal || 1],
                ['Multicolor', detail.is_multicolor ? 'Ja' : 'Nee'],
              ].map(([l, v]) => (
                <div key={l} style={{ padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ color:'var(--muted)', fontSize:10 }}>{l}</div>
                  <div style={{ fontWeight:500 }}>{v}</div>
                </div>
              ))}
            </div>

            {[
              ['Materiaal', detail.materiaal_kost],
              ['Energie', detail.energie_kost_schat],
              ['Machine', detail.machine_kost],
              ['Arbeid', detail.arbeid_kost],
              ...(detail.extra_totaal > 0 ? [['Extra', detail.extra_totaal]] : []),
              ...(detail.artikelen_kost > 0 ? [['Artikelen', detail.artikelen_kost]] : []),
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                <span style={{ color:'var(--muted)' }}>{l}</span><span>€{(v || 0).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
              <span>Subtotaal</span><span>€{detail.subtotaal?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', fontWeight:700, fontSize:15, marginBottom: detail.btw_pct > 0 ? 0 : '0.75rem' }}>
              <span>Verkoopprijs</span><span style={{ color:'var(--accent2)' }}>€{detail.verkoopprijs?.toFixed(2)}</span>
            </div>
            {detail.btw_pct > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--muted)', marginBottom:'0.75rem' }}>
                <span>+ BTW {detail.btw_pct}%</span>
                <span>€{detail.btw_bedrag?.toFixed(2)}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom:'0.75rem' }}>
              <label style={{ fontSize:11 }}>Status</label>
              <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)}>
                {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {detail.notities && (
              <div style={{ background:'#fffbeb', borderLeft:'3px solid #f59e0b', padding:'7px 10px', borderRadius:4, fontSize:12, color:'#664400', marginBottom:'0.75rem' }}>
                📝 {detail.notities}
              </div>
            )}

            {jobStatus && <div style={{ fontSize:12, color: jobStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)', marginBottom:6 }}>{jobStatus}</div>}

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <a className="btn" style={{ textAlign:'center' }} href={`${BASE}/offertes2/${detail.id}/pdf`} download>↓ PDF downloaden</a>
              {!detail.job_id && detail.status !== 'geannuleerd' && (
                <button className="btn primary" onClick={() => maakJob(detail.id)}>🔧 Maak werkbon job</button>
              )}
              {detail.job_id && <div style={{ fontSize:12, color:'var(--accent2)', textAlign:'center' }}>✓ Werkbon job: #{detail.job_id}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
