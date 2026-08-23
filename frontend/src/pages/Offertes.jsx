import { useState, useEffect, useCallback } from 'react';
import { api, BASE } from '../lib/api.js';
import KlantModal from '../components/KlantModal.jsx';

const STATUSSEN = ['concept','verstuurd','goedgekeurd','geannuleerd'];
const BTW_OPTIES = [0, 6, 21];

// Regeltypes van het herontwerp (vrije lijst diensten/objecten per offerte
// i.p.v. 1 vast hoofdobject + vaste opsplitsing object/arbeid/kosten) —
// zelfde labels als backend/routes/offertes_v2.js REGEL_TYPE_LABELS, zodat
// de offerte/PDF-regel "Dienstnaam: Objectnaam" er hier al identiek uitziet.
const REGEL_TYPE_OPTIES = [
  ['ontwerp', 'Ontwerp + digitaal bestand aanleveren'],
  ['aanpassing', 'Aanpassing op bestaand ontwerp/bestand'],
  ['printen', 'Printen'],
  ['extra', 'Extra kosten/dienst'],
  ['artikel', 'Artikel'],
];
const REGEL_TYPE_LABELS = Object.fromEntries(REGEL_TYPE_OPTIES);

function statusKleur(s) {
  return { concept:'#f59e0b', verstuurd:'#60a5fa', goedgekeurd:'#22c55e', geannuleerd:'#6b7280' }[s] || '#6b7280';
}

const eenheidLabel = e => e === 'stuk' ? 'stuk(s)' : e === 'ml' ? 'ml' : 'g';

function standaardGeldigTot() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

// Nieuwe regel met de juiste standaardwaarden per type — dezelfde defaults
// als de backend gebruikt als er niets wordt opgegeven.
function nieuweRegel(type, tarieven) {
  const base = { type, object_naam: '' };
  if (type === 'ontwerp') return { ...base, minuten: 0, tarief: tarieven.ontwerp_tarief || 15 };
  if (type === 'aanpassing') return { ...base, minuten: 0, tarief: tarieven.nabewerking_tarief || 15 };
  if (type === 'printen') return {
    ...base, printer_id: '', filament_type_id: '', filament_rol_id: '',
    geschat_gewicht_g: '', geschatte_tijd_u: 0, geschatte_tijd_min: 0,
    voorbereiding_min: tarieven.voorbereiding_min || 15, nabewerking_min: tarieven.nabewerking_min || 10,
    is_multicolor: false, filament_rollen: [], aantal: 1,
  };
  if (type === 'extra') return { ...base, filament_type_id: '', bedrag: 0 };
  if (type === 'artikel') return { ...base, filament_type_id: '', aantal: 1 };
  return base;
}

// ═══════════════════════════════════════════════════════════════════════
// REGELS-GEBASEERDE LIVE BEREKENING (client-mirror van de backend in
// offertes_v2.js — berekenRegel/berekenOfferteRegels/offerteRegelsUitRegels)
// zodat de preview tijdens het typen exact hetzelfde toont als wat er bij
// het opslaan zou berekend worden. Enkel gebruikt zolang de gebruiker actief
// aan het wijzigen is (dirty); een reeds opgeslagen offerte toont gewoon de
// bevroren waarden die de server meegaf (zie toonBevroren in OfferteModal).
// ═══════════════════════════════════════════════════════════════════════

function materiaalKostRegelClient(regel, allRollen, faalfactor) {
  const aantal = parseInt(regel.aantal) || 1;
  if (regel.is_multicolor && (regel.filament_rollen || []).some(fr => parseFloat(fr.gram) > 0)) {
    return regel.filament_rollen.reduce((s, fr) => {
      const rol = allRollen.find(r => r.id === parseInt(fr.filament_rol_id));
      const prijs = parseFloat(rol?.prijs_per_kg_effectief || rol?.inkoop_prijs_per_kg) || 0;
      const gram = parseFloat(fr.gram) || 0;
      return s + (gram / 1000) * prijs * faalfactor;
    }, 0) * aantal;
  }
  if (regel.filament_rol_id) {
    const rol = allRollen.find(r => r.id === parseInt(regel.filament_rol_id));
    const prijs = parseFloat(rol?.prijs_per_kg_effectief || rol?.inkoop_prijs_per_kg) || 0;
    if (prijs > 0) return (parseFloat(regel.geschat_gewicht_g) || 0) / 1000 * prijs * faalfactor * aantal;
  }
  return 0;
}

function printerWattClient(printer, tarieven) {
  if (!printer) return 120;
  if (printer.gem_verbruik_watt > 0) return printer.gem_verbruik_watt;
  return printer.naam?.toLowerCase().includes('ender') ? (tarieven.ender_watt || 150) : (tarieven.bambu_watt || 120);
}

function berekenRegelClient(regel, tarieven, allRollen, printers, filamentTypes) {
  const t = tarieven;
  const aantal = parseInt(regel.aantal) || 1;

  if (regel.type === 'ontwerp' || regel.type === 'aanpassing') {
    const minuten = parseFloat(regel.minuten) || 0;
    const tarief = parseFloat(regel.tarief) || (regel.type === 'ontwerp' ? (t.ontwerp_tarief || 15) : (t.nabewerking_tarief || 15));
    return { bedrag: minuten / 60 * tarief, vaste_prijs: false, tijd_u: 0 };
  }

  if (regel.type === 'printen') {
    const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
    const printer = printers.find(p => p.id === parseInt(regel.printer_id));
    const watt = printerWattClient(printer, t);
    const machKost = printer?.machine_kost_per_uur > 0 ? printer.machine_kost_per_uur : (t.machine_per_uur || 0.13);
    const totU = (parseInt(regel.geschatte_tijd_u) || 0) + (parseInt(regel.geschatte_tijd_min) || 0) / 60;
    const materiaal = materiaalKostRegelClient(regel, allRollen, faalfactor);
    const energie = (watt / 1000) * totU * (t.kwh_prijs || 0.35) * aantal;
    const machine = totU * machKost * aantal;
    const arbeid = ((parseFloat(regel.voorbereiding_min) || 0) + (parseFloat(regel.nabewerking_min) || 0)) / 60 * (t.arbeid_per_uur || 15);
    const bmcu = regel.is_multicolor ? (t.bmcu_per_job || 0.10) : 0;
    return { bedrag: materiaal + energie + machine + arbeid + bmcu, vaste_prijs: false, tijd_u: totU * aantal, energie, watt };
  }

  if (regel.type === 'extra') {
    const ft = filamentTypes.find(f => f.id === parseInt(regel.filament_type_id));
    return { bedrag: parseFloat(regel.bedrag) || 0, vaste_prijs: !!ft?.vaste_prijs, tijd_u: 0 };
  }

  if (regel.type === 'artikel') {
    const ft = filamentTypes.find(f => f.id === parseInt(regel.filament_type_id));
    if (!ft) return { bedrag: 0, vaste_prijs: false, tijd_u: 0 };
    const deler = ft.eenheid === 'gram' ? 1000 : 1;
    return { bedrag: (aantal / deler) * (ft.inkoop_prijs_per_kg || 0), vaste_prijs: !!ft.vaste_prijs, tijd_u: 0 };
  }

  return { bedrag: 0, vaste_prijs: false, tijd_u: 0 };
}

function berekenOfferteRegelsClient(regels, tarieven, allRollen, printers, filamentTypes) {
  let margeSom = 0, vastSom = 0, tijdSom = 0;
  const berekend = (regels || []).map(regel => {
    const r = berekenRegelClient(regel, tarieven, allRollen, printers, filamentTypes);
    if (r.vaste_prijs) vastSom += r.bedrag; else margeSom += r.bedrag;
    tijdSom += r.tijd_u || 0;
    return { ...regel, _berekend: r };
  });
  const margeGrens = tarieven.marge_grens_uur || 4;
  const marge_pct = tijdSom >= margeGrens ? (tarieven.marge_groot_pct || 10) : (tarieven.marge_klein_pct || 18);
  const verkoopprijs_basis = margeSom * (1 + marge_pct / 100);
  const verkoopprijs = verkoopprijs_basis + vastSom;
  return { regels: berekend, marge_pct, verkoopprijs_basis, verkoopprijs };
}

// Klantgerichte regel-lijst — zelfde vorm/logica als backend's
// offerteRegelsUitRegels(), gebruikt voor zowel de live preview (modal) als
// de bevroren weergave (modal bij bewerken + detailpaneel in de hoofdlijst).
function offerteRegelsClientNieuw(berekening) {
  const margeFactor = 1 + (berekening.marge_pct || 0) / 100;
  // Een net toegevoegde regel zonder gekozen type (nog niet opslaanbaar, zie
  // save()'s validatie) hoort niet als lege "—"/€0.00-rij in de live preview
  // te verschijnen — pas zodra een type gekozen is, telt de regel mee.
  return (berekening.regels || []).filter(regel => regel.type).map(regel => {
    const r = regel._berekend || { bedrag: 0, vaste_prijs: false };
    const factor = r.vaste_prijs ? 1 : margeFactor;
    const totaal = r.bedrag * factor;
    const label = REGEL_TYPE_LABELS[regel.type] || regel.type || '—';
    const naam = regel.object_naam ? `${label}: ${regel.object_naam}` : label;
    const aantal = (regel.type === 'printen' || regel.type === 'artikel') ? (parseInt(regel.aantal) || 1) : 1;
    return { omschrijving: naam, aantal, eenheidsprijs: aantal > 0 ? totaal / aantal : 0, totaal };
  });
}

// Op moduleniveau gedefinieerd (niet binnen OfferteModal) — anders krijgen
// deze bij elke toetsaanslag een nieuwe component-identiteit, waardoor React
// het onderliggende <input> unmount/remount en de cursor/focus verloren gaat.
const Sec = ({ title, children }) => (
  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
    <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>{title}</p>
    {children}
  </div>
);

const F = ({ label, children, style }) => (
  <div className="form-group" style={{ marginBottom:0, ...style }}>
    <label style={{ fontSize:11 }}>{label}</label>
    {children}
  </div>
);

// ── Regeltype-specifieke velden ─────────────────────────────────────────
// Elk krijgt de regel + een onChange(patch) die de wijziging (dirty) in de
// bovenliggende regels-array van OfferteModal doorvoert.

function OntwerpAanpassingVelden({ regel, onChange, tarieven }) {
  const isOntwerp = regel.type === 'ontwerp';
  return (
    <div className="form-row">
      <F label={isOntwerp ? 'Ontwerptijd (min)' : 'Aanpassingstijd (min)'}>
        <input type="number" min="0" value={regel.minuten ?? ''} onChange={e => onChange({ minuten: e.target.value })} />
      </F>
      <F label="Tarief (€/u)">
        <input type="number" min="0" value={regel.tarief ?? (isOntwerp ? (tarieven.ontwerp_tarief || 15) : (tarieven.nabewerking_tarief || 15))}
          onChange={e => onChange({ tarief: e.target.value })} />
      </F>
    </div>
  );
}

// 'Printen'-regel — inhoudelijk 1-op-1 dezelfde velden/logica als de vroegere
// vaste "Filament"-sectie (incl. multicolor + kleur 2-3-4), nu herbruikbaar
// per regel zodat een offerte meerdere te printen objecten kan bevatten.
function PrintenVelden({ regel, onChange, onChangeSilent, printFilamentTypes, allRollen, printers, tarieven }) {
  const [rollenVoorType, setRollenVoorType] = useState([]);

  // Rollen laden bij wijziging van het filamenttype — zelfde AFGELEIDE
  // auto-select/reset als voorheen, nu via onChangeSilent zodat dit bij het
  // openen van een bestaande offerte niet als "gewijzigd" telt (zie de
  // toelichting bij set()/setSilent() in OfferteModal).
  useEffect(() => {
    if (!regel.filament_type_id) { setRollenVoorType([]); return; }
    api.get(`/filament/rollen/by-type/${regel.filament_type_id}`)
      .then(r => {
        setRollenVoorType(r);
        if (r.length === 1 && !regel.filament_rol_id) onChangeSilent({ filament_rol_id: r[0].id });
        else if (regel.filament_rol_id && !r.some(x => x.id === parseInt(regel.filament_rol_id))) onChangeSilent({ filament_rol_id: '' });
      })
      .catch(() => setRollenVoorType([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regel.filament_type_id]);

  const printer = printers.find(p => p.id === parseInt(regel.printer_id));
  const watt = printerWattClient(printer, tarieven);
  const totU = (parseInt(regel.geschatte_tijd_u) || 0) + (parseInt(regel.geschatte_tijd_min) || 0) / 60;
  const energie = (watt / 1000) * totU * (tarieven.kwh_prijs || 0.35) * (parseInt(regel.aantal) || 1);

  const gekozenRol = rollenVoorType.find(r => r.id === parseInt(regel.filament_rol_id));
  const stockWaarschuwing = gekozenRol && regel.geschat_gewicht_g
    ? parseFloat(regel.geschat_gewicht_g) > gekozenRol.gewicht_gram_huidig : false;

  function addKleur() {
    onChange({ filament_rollen: [...(regel.filament_rollen || []), { filament_type_id: regel.filament_type_id || '', filament_rol_id:'', gram:'' }] });
  }
  function setKleurVelden(i, patch) {
    const rollen = [...(regel.filament_rollen || [])];
    rollen[i] = { ...rollen[i], ...patch };
    onChange({ filament_rollen: rollen });
  }
  function removeKleur(i) {
    onChange({ filament_rollen: (regel.filament_rollen || []).filter((_, idx) => idx !== i) });
  }

  return (
    <>
      <div className="form-row" style={{ marginBottom:8 }}>
        <F label="Printer">
          <select value={regel.printer_id || ''} onChange={e => onChange({ printer_id: e.target.value })}>
            <option value="">— selecteer —</option>
            {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
          </select>
        </F>
        <F label="Aantal stuks">
          <input type="number" min="1" value={regel.aantal ?? 1} onChange={e => onChange({ aantal: e.target.value })} />
        </F>
      </div>

      <div className="form-row" style={{ marginBottom:8 }}>
        <F label="Filamenttype (hoofd)">
          <select value={regel.filament_type_id || ''} onChange={e => onChange({ filament_type_id: e.target.value, filament_rol_id: '' })}>
            <option value="">— selecteer type —</option>
            {printFilamentTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal}</option>)}
          </select>
        </F>
        <F label="Geschat gewicht (g)">
          <input type="number" step="0.1" value={regel.geschat_gewicht_g ?? ''} onChange={e => onChange({ geschat_gewicht_g: e.target.value })} placeholder="uit slicer" />
        </F>
      </div>

      {regel.filament_type_id && (
        <F label="Filamentrol *" style={{ marginBottom:8 }}>
          {rollenVoorType.length === 0
            ? <div style={{ fontSize:11, color:'var(--danger)', padding:'6px 0' }}>⚠ Geen actieve rollen van dit type in stock</div>
            : <select value={regel.filament_rol_id || ''} onChange={e => onChange({ filament_rol_id: e.target.value })}>
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
              ⚠ Onvoldoende stock: {gekozenRol.gewicht_gram_huidig}g resterend, {regel.geschat_gewicht_g}g nodig
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

      <div className="form-row" style={{ marginBottom:4 }}>
        <F label="Tijd — uren">
          <input type="number" min="0" value={regel.geschatte_tijd_u ?? 0} onChange={e => onChange({ geschatte_tijd_u: e.target.value })} />
        </F>
        <F label="Tijd — minuten">
          <input type="number" min="0" max="59" value={regel.geschatte_tijd_min ?? 0} onChange={e => onChange({ geschatte_tijd_min: e.target.value })} />
        </F>
      </div>
      {/* Elektriciteit wordt automatisch meegerekend op basis van
          printervermogen × tijd × kWh-prijs — geen apart invoerveld, wel
          hier zichtbaar zodat duidelijk is dat het meetelt. */}
      <div style={{ fontSize:10, color:'var(--accent2)', marginBottom:8 }}>
        ⚡ €{energie.toFixed(2)} elektriciteit ({watt}W × €{(tarieven.kwh_prijs || 0.35).toFixed(2)}/kWh)
      </div>

      <div className="form-row" style={{ marginBottom:8 }}>
        <F label="Voorbereiding (min)">
          <input type="number" min="0" value={regel.voorbereiding_min ?? (tarieven.voorbereiding_min || 15)} onChange={e => onChange({ voorbereiding_min: e.target.value })} />
        </F>
        <F label="Afwerking (min)">
          <input type="number" min="0" value={regel.nabewerking_min ?? (tarieven.nabewerking_min || 10)} onChange={e => onChange({ nabewerking_min: e.target.value })} />
        </F>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: regel.is_multicolor ? 8 : 0 }}>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!regel.is_multicolor} onChange={e => onChange({ is_multicolor: e.target.checked })} />
          Multicolor (BMCU +€{tarieven.bmcu_per_job || 0.10})
        </label>
      </div>

      {!!regel.is_multicolor && (
        <div style={{ marginTop:8, padding:'0.75rem', background:'var(--bg2)', borderRadius:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Filament per kleur</span>
            <button className="btn" style={{ fontSize:10, padding:'2px 8px' }} onClick={addKleur}>+ Kleur</button>
          </div>
          {(regel.filament_rollen || []).map((fr, i) => {
            const rollenVoorKleur = fr.filament_type_id
              ? allRollen.filter(r => r.filament_type_id === parseInt(fr.filament_type_id) && r.actief)
              : [];
            return (
              <div key={i} style={{ marginBottom:8, background:'var(--bg3)', borderRadius:6, padding:'6px 8px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:6, marginBottom:4 }}>
                  <select value={fr.filament_type_id || ''} onChange={e => setKleurVelden(i, { filament_type_id: e.target.value, filament_rol_id: '' })} style={{ fontSize:11 }}>
                    <option value="">— type —</option>
                    {printFilamentTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal}</option>)}
                  </select>
                  <button onClick={() => removeKleur(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer' }}>✕</button>
                </div>
                {fr.filament_type_id && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:6 }}>
                    <select value={fr.filament_rol_id || ''} onChange={e => setKleurVelden(i, { filament_rol_id: e.target.value })} style={{ fontSize:11 }}>
                      <option value="">— rol —</option>
                      {rollenVoorKleur.map(r => (
                        <option key={r.id} value={r.id}>{r.lotnummer || `Rol #${r.id}`} — {r.kleur || '?'} — {r.gewicht_gram_huidig}g</option>
                      ))}
                    </select>
                    <input type="number" placeholder="gram" value={fr.gram || ''} onChange={e => setKleurVelden(i, { gram: e.target.value })} style={{ fontSize:11 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// 'Extra kosten/dienst'-regel — vaste dienst kiezen (Filament-tab, categorie
// ≠ filament) vult omschrijving + bedrag automatisch in; manuele invoer
// blijft gewoon mogelijk/aanpasbaar daaronder voor iets unieks.
function ExtraVelden({ regel, onChange, artikelTypes }) {
  return (
    <>
      <F label="Kies vaste dienst (optioneel)" style={{ marginBottom:8 }}>
        <select value={regel.filament_type_id || ''} onChange={e => {
          const type = artikelTypes.find(f => f.id === parseInt(e.target.value));
          if (type) onChange({ filament_type_id: type.id, bedrag: type.inkoop_prijs_per_kg || 0, object_naam: regel.object_naam || `${type.merk} ${type.materiaal}`.trim() });
          else onChange({ filament_type_id: '' });
        }}>
          <option value="">— eigen invoer —</option>
          {artikelTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal} (€{(f.inkoop_prijs_per_kg || 0).toFixed(2)})</option>)}
        </select>
      </F>
      <F label="Bedrag (eenmalig, €)">
        <input type="number" min="0" step="0.01" value={regel.bedrag ?? 0} onChange={e => onChange({ bedrag: e.target.value })} />
      </F>
      <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:4 }}>
        Naam op de offerte vul je hierboven in bij "Objectnaam / omschrijving".
      </div>
    </>
  );
}

// 'Artikel'-regel — het bestaande artikelenmechanisme (voorheen los beheerd
// via offerte_artikelen/API-subroutes), nu gewoon 1 regel tussen de rest,
// zonder aparte opslag-stap.
function ArtikelVelden({ regel, onChange, artikelTypes }) {
  const type = artikelTypes.find(f => f.id === parseInt(regel.filament_type_id));
  return (
    <div className="form-row">
      <F label="Artikel">
        <select value={regel.filament_type_id || ''} onChange={e => {
          const t = artikelTypes.find(f => f.id === parseInt(e.target.value));
          onChange({ filament_type_id: e.target.value, object_naam: regel.object_naam || (t ? `${t.merk} ${t.materiaal}`.trim() : '') });
        }}>
          <option value="">— selecteer artikel —</option>
          {artikelTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal} — €{(f.inkoop_prijs_per_kg || 0).toFixed(2)}/{eenheidLabel(f.eenheid).replace('(s)','')}</option>)}
        </select>
      </F>
      <F label={type?.eenheid === 'gram' ? 'Gram' : 'Aantal'}>
        <input type="number" min="0.1" step="0.1" value={regel.aantal ?? 1} onChange={e => onChange({ aantal: e.target.value })} />
      </F>
    </div>
  );
}

// 1 kaart per regel — kiest bovenaan het type + objectnaam, toont daaronder
// de type-specifieke velden. bedrag (indien gekend) wordt rechtsboven getoond.
function RegelCard({ regel, index, onChange, onChangeSilent, onRemove, printFilamentTypes, artikelTypes, allRollen, printers, tarieven, bedrag }) {
  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden' }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'0.6rem 0.75rem', background:'rgba(91,141,238,.06)', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:11, color:'var(--muted)', width:14 }}>{index + 1}</span>
        <select value={regel.type || ''} onChange={e => onChange({ ...nieuweRegel(e.target.value, tarieven), object_naam: regel.object_naam })} style={{ flex:'0 0 230px', fontSize:12 }}>
          <option value="">— kies type —</option>
          {REGEL_TYPE_OPTIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input value={regel.object_naam || ''} onChange={e => onChange({ object_naam: e.target.value })}
          placeholder="Objectnaam / omschrijving" style={{ flex:1, fontSize:12 }} />
        {typeof bedrag === 'number' && <span style={{ fontSize:12, color:'var(--accent2)', whiteSpace:'nowrap', fontWeight:500 }}>€{bedrag.toFixed(2)}</span>}
        <button onClick={onRemove} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:15, lineHeight:1 }}>✕</button>
      </div>
      <div style={{ padding:'0.75rem 0.85rem' }}>
        {(regel.type === 'ontwerp' || regel.type === 'aanpassing') && <OntwerpAanpassingVelden regel={regel} onChange={onChange} tarieven={tarieven} />}
        {regel.type === 'printen' && <PrintenVelden regel={regel} onChange={onChange} onChangeSilent={onChangeSilent} printFilamentTypes={printFilamentTypes} allRollen={allRollen} printers={printers} tarieven={tarieven} />}
        {regel.type === 'extra' && <ExtraVelden regel={regel} onChange={onChange} artikelTypes={artikelTypes} />}
        {regel.type === 'artikel' && <ArtikelVelden regel={regel} onChange={onChange} artikelTypes={artikelTypes} />}
        {!regel.type && <div style={{ fontSize:11.5, color:'var(--muted)' }}>Kies eerst een type hierboven.</div>}
      </div>
    </div>
  );
}

// ── OfferteModal ──────────────────────────────────────────────────────────────
// Pop-up venster in dezelfde stijl/interactiepatroon als KlantModal en
// KostenModal (Werkbon) — i.p.v. een aparte volle pagina, zodat het
// offerteformulier overal in de app hetzelfde aanvoelt.
function OfferteModal({ offerte, klanten, printers, filamentTypes, allRollen, tarieven, onClose, onSaved, onKlantToegevoegd }) {
  const [form, setForm] = useState({
    klant_id: '', object_link: '',
    geldig_tot: standaardGeldigTot(), levertermijn: '3 weken',
    btw_pct: 21, notities: '',
    regels: [],
    ...offerte,
  });
  const [saving, setSaving] = useState(false);
  const [klantModal, setKlantModal] = useState(false);

  // "Bevroren tot je zelf wijzigt": bij het heropenen van een bestaande
  // offerte tonen we de opgeslagen waarden (identiek aan het detailvenster/
  // de PDF), i.p.v. meteen te herberekenen met de huidige tarieven/prijzen —
  // die kunnen intussen gewijzigd zijn. Pas zodra je zelf iets aanpast
  // schakelt de preview over naar de live herberekening. setSilent: wijzigt
  // het form ZONDER dirty te markeren — enkel voor puur afgeleide/hydratie-
  // effects (bv. rol-auto-select in PrintenVelden), nooit voor echte
  // gebruikersinvoer.
  const [dirty, setDirty] = useState(false);
  const setSilent = useCallback((k, v) => setForm(f => (f[k] === v ? f : { ...f, [k]: v })), []);
  const set = useCallback((k, v) => setForm(f => { if (f[k] === v) return f; setDirty(true); return { ...f, [k]: v }; }), []);
  const isEdit = !!form.id;

  // Extra artikelen/diensten (bv. verzendkosten) — alleen niet-filament
  // types, prijs op TYPE-niveau. Hoofdfilamenttype: omgekeerde filter, enkel
  // 'filament'-categorie. Zelfde filterconventie als elders (KostenModal.jsx,
  // PrinterCard.jsx).
  const artikelTypes = filamentTypes.filter(f => (f.categorie || 'filament') !== 'filament');
  const printFilamentTypes = filamentTypes.filter(f => (f.categorie || 'filament') === 'filament');

  function setRegelPatch(i, patch) {
    set('regels', (form.regels || []).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setRegelPatchSilent(i, patch) {
    setSilent('regels', (form.regels || []).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function voegRegelToe() {
    set('regels', [...(form.regels || []), nieuweRegel('', tarieven)]);
  }
  function verwijderRegel(i) {
    set('regels', (form.regels || []).filter((_, idx) => idx !== i));
  }

  const klantGekozen = klanten.find(k => k.id === parseInt(form.klant_id));
  const klantNaamGekozen = klantGekozen ? (klantGekozen.voornaam ? `${klantGekozen.voornaam} ${klantGekozen.naam}` : klantGekozen.naam) : '';

  const berekeningLive = berekenOfferteRegelsClient(form.regels || [], tarieven, allRollen, printers, filamentTypes);
  const toonBevroren = isEdit && !dirty;
  const berekeningPreview = toonBevroren ? { regels: form.regels || [], marge_pct: form.marge_pct } : berekeningLive;
  const previewRegels = offerteRegelsClientNieuw(berekeningPreview);
  const verkoopprijsPreview = toonBevroren ? (form.verkoopprijs || 0) : berekeningLive.verkoopprijs;
  const btwBedragPreview = toonBevroren ? (form.btw_bedrag || 0) : (berekeningLive.verkoopprijs_basis * (form.btw_pct || 0) / 100);

  async function save() {
    if (!form.klant_id) return alert('Selecteer een klant');
    const regels = form.regels || [];
    if (regels.length === 0) return alert('Voeg minstens 1 regel toe');
    for (const r of regels) {
      if (!r.type) return alert('Kies voor elke regel een type');
      if (r.type === 'printen' && !r.filament_rol_id) return alert('Selecteer voor elke "Printen"-regel een filamentrol');
      if (r.type === 'printen' && r.is_multicolor && (r.filament_rollen || []).some(fr => !fr.filament_rol_id))
        return alert('Selecteer voor elke kleur een filamentrol');
    }
    setSaving(true);
    try {
      const payload = {
        klant_id: form.klant_id, object_link: form.object_link || '',
        geldig_tot: form.geldig_tot, levertermijn: form.levertermijn,
        btw_pct: form.btw_pct, notities: form.notities,
        // _berekend is bevroren server-data, niet opnieuw opsturen — de
        // backend herberekent bij opslaan zelf op basis van de ruwe velden.
        regels: regels.map(({ _berekend, ...r }) => r),
      };
      if (form.id) {
        const r = await api.put(`/offertes2/${form.id}`, payload);
        onSaved({ ...form, ...r });
        onClose();
      } else {
        const r = await api.post('/offertes2', payload);
        setForm(f => ({ ...f, id: r.id, nummer: r.nummer }));
        onSaved({ ...form, ...r });
      }
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Offerte sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal" style={{ width:760, maxHeight:'93vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2 style={{ fontSize:14 }}>{isEdit ? `Offerte bewerken — ${form.nummer}` : 'Nieuwe offerte'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* KLANT & OFFERTE */}
        <Sec title="👤 Klant & offerte">
          <F label="Klant *" style={{ marginBottom:8 }}>
            <div style={{ display:'flex', gap:6 }}>
              <select value={form.klant_id} onChange={e => set('klant_id', e.target.value)} style={{ flex:1 }}>
                <option value="">— selecteer —</option>
                {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
              </select>
              <button type="button" className="btn" style={{ fontSize:11, padding:'0 8px' }}
                onClick={() => setKlantModal(true)} title="Nieuwe klant aanmaken">+ Nieuw</button>
            </div>
          </F>
          <div className="form-row" style={{ marginBottom:8 }}>
            <F label="Geldig tot">
              <input type="date" value={form.geldig_tot || ''} onChange={e => set('geldig_tot', e.target.value)} />
            </F>
            <F label="Levertermijn">
              <input value={form.levertermijn || ''} onChange={e => set('levertermijn', e.target.value)} placeholder="bv. 3 weken" />
            </F>
          </div>
          <F label="Link (Makerworld, Printables, referentie...)">
            <input value={form.object_link || ''} onChange={e => set('object_link', e.target.value)} placeholder="https://..." />
          </F>
        </Sec>

        {/* REGELS — diensten & objecten */}
        <Sec title="🧾 Regels — diensten & objecten">
          {(form.regels || []).map((regel, i) => {
            const berekend = berekeningPreview.regels?.[i]?._berekend;
            const margeFactor = 1 + (berekeningPreview.marge_pct || 0) / 100;
            const bedrag = berekend ? berekend.bedrag * (berekend.vaste_prijs ? 1 : margeFactor) : undefined;
            return (
              <RegelCard key={i} index={i} regel={regel}
                onChange={patch => setRegelPatch(i, patch)}
                onChangeSilent={patch => setRegelPatchSilent(i, patch)}
                onRemove={() => verwijderRegel(i)}
                printFilamentTypes={printFilamentTypes} artikelTypes={artikelTypes}
                allRollen={allRollen} printers={printers} tarieven={tarieven}
                bedrag={bedrag}
              />
            );
          })}
          {(form.regels || []).length === 0 && (
            <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:8 }}>Nog geen regels — voeg er hieronder een toe.</div>
          )}
          <button type="button" className="btn" style={{ width:'100%', border:'1px dashed var(--border)', background:'none', justifyContent:'center' }} onClick={voegRegelToe}>
            + Regel toevoegen
          </button>
        </Sec>

        {/* OFFERTE DETAILS */}
        <Sec title="📝 Offerte details">
          <F label="BTW %" style={{ marginBottom:8 }}>
            <select value={form.btw_pct} onChange={e => set('btw_pct', parseFloat(e.target.value))}>
              {BTW_OPTIES.map(b => <option key={b} value={b}>{b}%</option>)}
            </select>
          </F>
          <F label="Notities">
            <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
          </F>
        </Sec>

        {/* LIVE OFFERTE-PREVIEW — onderaan, letterlijk dezelfde
            offerteRegelsClientNieuw()-weergave als het detailvenster en de
            PDF. Wat je hier ziet is dus exact wat er straks bewaard/
            afgedrukt wordt. */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>
            📄 {toonBevroren ? 'Opgeslagen offerte' : 'Live offerte-preview'}
          </p>
          {toonBevroren && (
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
              Dit zijn de bewaarde waarden van deze offerte. Zodra je iets wijzigt, schakelt dit over naar een live herberekening met de huidige tarieven/prijzen.
            </p>
          )}
          {previewRegels.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12, margin:0 }}>Voeg minstens 1 regel toe</p>
            : <>
              {klantNaamGekozen && <div style={{ fontWeight:600, fontSize:12, marginBottom:10 }}>{klantNaamGekozen}</div>}
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left', color:'var(--muted)', fontSize:10, textTransform:'uppercase' }}>
                    <th style={{ padding:'2px 4px 6px 0' }}>Aantal</th>
                    <th style={{ padding:'2px 4px 6px' }}>Omschrijving</th>
                    <th style={{ padding:'2px 4px 6px', textAlign:'right' }}>Eenh.prijs</th>
                    <th style={{ padding:'2px 0 6px 4px', textAlign:'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRegels.map((r, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'4px 4px 4px 0' }}>{r.aantal}</td>
                      <td style={{ padding:'4px' }}>{r.omschrijving}</td>
                      <td style={{ padding:'4px', textAlign:'right' }}>€{r.eenheidsprijs.toFixed(2)}</td>
                      <td style={{ padding:'4px 0 4px 4px', textAlign:'right' }}>€{r.totaal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', fontWeight:700 }}>
                <span>Verkoopprijs</span>
                <span style={{ fontSize:22, color:'var(--accent2)' }}>€{verkoopprijsPreview.toFixed(2)}</span>
              </div>
              {form.btw_pct > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:'var(--muted)' }}>
                  <span>+ BTW {form.btw_pct}%</span>
                  <span>€{btwBedragPreview.toFixed(2)}</span>
                </div>
              )}
            </>
          }
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{isEdit ? 'Sluiten' : 'Annuleer'}</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Bezig...' : isEdit ? '💾 Bijwerken' : '📋 Offerte aanmaken'}
          </button>
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
  const [detail,       setDetail]       = useState(null);
  const [offerteModal, setOfferteModal] = useState(null); // null = dicht, {} = nieuw, object = bewerken
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
    setDetail(d); setJobStatus('');
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
      const n = r.job_ids?.length || 1;
      setJobStatus(n > 1 ? `✓ ${n} jobs aangemaakt — ga naar Jobs` : `✓ Job aangemaakt (ID: ${r.job_id}) — ga naar Jobs`);
      load();
      if (detail?.id === id) { const u = await api.get(`/offertes2/${id}`); setDetail(u); }
    } catch(e) { setJobStatus('✗ ' + e.message); }
  }

  async function del(id) {
    if (!confirm('Offerte verwijderen? De gekoppelde werkbon wordt ook verwijderd.')) return;
    try {
      await api.delete(`/offertes2/${id}`);
      load();
      if (detail?.id === id) setDetail(null);
    } catch(e) { alert(e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <button className="btn primary" onClick={() => setOfferteModal({})}>+ Nieuwe offerte</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail ? '1fr 380px' : '1fr', gap:'1rem' }}>
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

        {detail && (
          <div className="card" style={{ position:'sticky', top:0, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <h2 style={{ fontSize:15, fontWeight:700 }}>{detail.nummer}</h2>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn" style={{ fontSize:11 }} onClick={() => setOfferteModal({...detail})}>✏</button>
                <button className="btn" onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>

            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.65rem', marginBottom:'0.75rem', fontSize:13 }}>
              <div style={{ fontWeight:600 }}>{detail.klant_voornaam ? `${detail.klant_voornaam} ${detail.klant_naam}` : detail.klant_naam}</div>
              {detail.email && <div style={{ color:'var(--muted)', fontSize:12 }}>✉ {detail.email}</div>}
              {detail.object_naam && <div style={{ color:'var(--accent)', fontSize:12 }}>📦 {detail.object_naam}</div>}
              {detail.object_link && <a href={detail.object_link} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--accent)' }}>🔗 Link</a>}
              <div style={{ display:'flex', gap:12, marginTop:6, fontSize:11, color:'var(--muted)' }}>
                {detail.geldig_tot && <span>Geldig tot: {detail.geldig_tot}</span>}
                {detail.levertermijn && <span>Levertermijn: {detail.levertermijn}</span>}
              </div>
            </div>

            {/* 📄 Offerteregels — zelfde regel-indeling als op de PDF: aantal /
                omschrijving / eenheidsprijs / totaal. Bewust geen interne
                rekendetails (faalfactor, printer, machine-uurkost, ...). */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
              <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>📄 Offerteregels</p>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left', color:'var(--muted)', fontSize:10, textTransform:'uppercase' }}>
                    <th style={{ padding:'2px 4px 6px 0' }}>Aantal</th>
                    <th style={{ padding:'2px 4px 6px' }}>Omschrijving</th>
                    <th style={{ padding:'2px 4px 6px', textAlign:'right' }}>Eenh.prijs</th>
                    <th style={{ padding:'2px 0 6px 4px', textAlign:'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {offerteRegelsClientNieuw({ regels: detail.regels || [], marge_pct: detail.marge_pct }).map((r, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'4px 4px 4px 0' }}>{r.aantal}</td>
                      <td style={{ padding:'4px' }}>{r.omschrijving}</td>
                      <td style={{ padding:'4px', textAlign:'right' }}>€{r.eenheidsprijs.toFixed(2)}</td>
                      <td style={{ padding:'4px 0 4px 4px', textAlign:'right' }}>€{r.totaal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', fontWeight:700, fontSize:15 }}>
                <span>Verkoopprijs</span><span style={{ color:'var(--accent2)' }}>€{detail.verkoopprijs?.toFixed(2)}</span>
              </div>
              {detail.btw_pct > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--muted)' }}>
                  <span>+ BTW {detail.btw_pct}%</span>
                  <span>€{detail.btw_bedrag?.toFixed(2)}</span>
                </div>
              )}
            </div>

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
                <button className="btn primary" onClick={() => maakJob(detail.id)}>🔧 Maak werkbon job(s)</button>
              )}
              {detail.job_id && <div style={{ fontSize:12, color:'var(--accent2)', textAlign:'center' }}>✓ Werkbon job: #{detail.job_id}</div>}
            </div>
          </div>
        )}
      </div>

      {offerteModal !== null && (
        <OfferteModal
          offerte={offerteModal}
          klanten={klanten} printers={printers} filamentTypes={filamentTypes}
          allRollen={allRollen} tarieven={tarieven}
          onKlantToegevoegd={(k) => api.get('/klanten').then(setKlanten)}
          onSaved={async (updated) => {
            await load();
            if (detail && String(detail.id) === String(updated.id)) {
              const u = await api.get(`/offertes2/${updated.id}`); setDetail(u);
            }
          }}
          onClose={() => setOfferteModal(null)}
        />
      )}
    </div>
  );
}
