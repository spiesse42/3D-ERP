// ═══════════════════════════════════════════════════════════════════════
// REGELEDITOR — gedeelde client-rekenmotor + UI voor "regels" (ontwerp/
// aanpassing/printen/extra/artikel), oorspronkelijk opgesloten in
// Offertes.jsx maar generiek van aard: gebruikt door zowel OfferteModal als
// WerkbonModal (standalone werkbon, geen offerte). Client-mirror van de
// backend-rekenmotor in backend/lib/regelmotor.js (berekenRegel/
// berekenOfferteRegels/offerteRegelsUitRegels) zodat een live preview tijdens
// het typen exact hetzelfde toont als wat er bij het opslaan berekend wordt.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { api } from './api.js';

// Regeltypes van het herontwerp (vrije lijst diensten/objecten i.p.v. 1 vast
// hoofdobject + vaste opsplitsing object/arbeid/kosten) — zelfde labels als
// backend/routes/offertes_v2.js (via backend/lib/regelmotor.js)
// REGEL_TYPE_LABELS, zodat de offerte/werkbon/PDF-regel "Dienstnaam:
// Objectnaam" er hier al identiek uitziet.
export const REGEL_TYPE_OPTIES = [
  ['ontwerp', 'Ontwerp + digitaal bestand aanleveren'],
  ['aanpassing', 'Aanpassing op bestaand ontwerp/bestand'],
  ['printen', 'Printen'],
  ['extra', 'Extra kosten/dienst'],
  ['artikel', 'Artikel'],
];
export const REGEL_TYPE_LABELS = Object.fromEntries(REGEL_TYPE_OPTIES);

export const eenheidLabel = e => e === 'stuk' ? 'stuk(s)' : e === 'ml' ? 'ml' : 'g';

// Nieuwe regel met de juiste standaardwaarden per type — dezelfde defaults
// als de backend gebruikt als er niets wordt opgegeven.
export function nieuweRegel(type, tarieven) {
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
// backend/lib/regelmotor.js — berekenRegel/berekenOfferteRegels/
// offerteRegelsUitRegels) zodat de preview tijdens het typen exact hetzelfde
// toont als wat er bij het opslaan zou berekend worden. Enkel gebruikt
// zolang de gebruiker actief aan het wijzigen is (dirty); een reeds
// opgeslagen offerte/werkbon toont gewoon de bevroren waarden die de server
// meegaf (zie toonBevroren in OfferteModal/WerkbonModal).
// ═══════════════════════════════════════════════════════════════════════

export function materiaalKostRegelClient(regel, allRollen, faalfactor) {
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

export function printerWattClient(printer, tarieven) {
  if (!printer) return 120;
  if (printer.gem_verbruik_watt > 0) return printer.gem_verbruik_watt;
  return printer.naam?.toLowerCase().includes('ender') ? (tarieven.ender_watt || 150) : (tarieven.bambu_watt || 120);
}

export function berekenRegelClient(regel, tarieven, allRollen, printers, filamentTypes) {
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

// Twee doorgangen — zelfde reden/aanpak als de backend-tegenhanger
// berekenOfferteRegels(): de marge-drempel hangt af van de totale printtijd
// (onafhankelijk van een handmatige bedrag-aanpassing), dus eerst de
// natuurlijke waarde + tijd bepalen, dán de marge, en pas dáárna een
// eventuele handmatig_bedrag-override (= het EINDBEDRAG incl. marge, exact
// wat de gebruiker intypt) terugrekenen naar de waarde vóór marge.
export function berekenOfferteRegelsClient(regels, tarieven, allRollen, printers, filamentTypes) {
  const natuurlijk = (regels || []).map(regel => berekenRegelClient(regel, tarieven, allRollen, printers, filamentTypes));
  const tijdSom = natuurlijk.reduce((s, r) => s + (r.tijd_u || 0), 0);

  const margeGrens = tarieven.marge_grens_uur || 4;
  const marge_pct = tijdSom >= margeGrens ? (tarieven.marge_groot_pct || 10) : (tarieven.marge_klein_pct || 18);
  const margeFactor = 1 + marge_pct / 100;

  let margeSom = 0, vastSom = 0;
  const berekend = (regels || []).map((regel, i) => {
    let r = natuurlijk[i];
    const override = parseFloat(regel.handmatig_bedrag);
    const heeftOverride = regel.handmatig_bedrag !== undefined && regel.handmatig_bedrag !== null
      && regel.handmatig_bedrag !== '' && Number.isFinite(override);
    if (heeftOverride) {
      r = { ...r, bedrag: r.vaste_prijs ? override : override / margeFactor, handmatig: true };
    }
    if (r.vaste_prijs) vastSom += r.bedrag; else margeSom += r.bedrag;
    return { ...regel, _berekend: r };
  });

  const verkoopprijs_basis = margeSom * margeFactor;
  const verkoopprijs = verkoopprijs_basis + vastSom;
  return { regels: berekend, marge_pct, verkoopprijs_basis, verkoopprijs };
}

// Klantgerichte regel-lijst — zelfde vorm/logica als backend's
// offerteRegelsUitRegels(), gebruikt voor zowel de live preview (modal) als
// de bevroren weergave (modal bij bewerken + detailpaneel in de hoofdlijst).
export function offerteRegelsClientNieuw(berekening) {
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

// Op moduleniveau gedefinieerd (niet binnen een component) — anders krijgen
// deze bij elke toetsaanslag een nieuwe component-identiteit, waardoor React
// het onderliggende <input> unmount/remount en de cursor/focus verloren gaat.
export const F = ({ label, children, style }) => (
  <div className="form-group" style={{ marginBottom:0, ...style }}>
    <label style={{ fontSize:11 }}>{label}</label>
    {children}
  </div>
);

// ── Regeltype-specifieke velden ─────────────────────────────────────────
// Elk krijgt de regel + een onChange(patch) die de wijziging (dirty) in de
// bovenliggende regels-array van OfferteModal/WerkbonModal doorvoert.

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
// per regel zodat een offerte/werkbon meerdere te printen objecten kan
// bevatten.
function PrintenVelden({ regel, onChange, onChangeSilent, printFilamentTypes, allRollen, printers, tarieven }) {
  const [rollenVoorType, setRollenVoorType] = useState([]);

  // Rollen laden bij wijziging van het filamenttype — zelfde AFGELEIDE
  // auto-select/reset als voorheen, nu via onChangeSilent zodat dit bij het
  // openen van een bestaande offerte/werkbon niet als "gewijzigd" telt (zie
  // de toelichting bij set()/setSilent() in OfferteModal).
  useEffect(() => {
    if (!regel.filament_type_id) { setRollenVoorType([]); return; }
    let genegeerd = false;
    api.get(`/filament/rollen/by-type/${regel.filament_type_id}`)
      .then(r => {
        if (genegeerd) return; // filament_type_id is intussen alweer gewijzigd — dit antwoord is verouderd
        setRollenVoorType(r);
        if (r.length === 1 && !regel.filament_rol_id) onChangeSilent({ filament_rol_id: r[0].id });
        else if (regel.filament_rol_id && !r.some(x => x.id === parseInt(regel.filament_rol_id))) onChangeSilent({ filament_rol_id: '' });
      })
      .catch(() => { if (!genegeerd) setRollenVoorType([]); });
    return () => { genegeerd = true; };
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
        Naam op de offerte/werkbon vul je hierboven in bij "Objectnaam / omschrijving".
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
// de type-specifieke velden. Het eindbedrag (incl. marge, indien gekend)
// wordt rechtsboven getoond — en is hier zelf ook aanpasbaar: normaal staat
// hier gewoon het berekende bedrag, maar je kan er manueel overheen typen om
// een ander eindbedrag voor deze regel af te dwingen (bv. een ronde prijs of
// een uitzondering). Dat overschreven bedrag wordt vóór de marge-berekening
// "teruggerekend" zodat precies dit bedrag overal (preview/PDF/detail)
// getoond blijft — zie berekenOfferteRegelsClient()/berekenOfferteRegels()
// in de backend. BTW blijft er wél gewoon op berekend, dit is geen vaste-
// prijs-artikel. Een ↺-knopje verschijnt zodra er een override actief is, om
// terug te schakelen naar het berekende bedrag.
export function RegelCard({ regel, index, onChange, onChangeSilent, onRemove, printFilamentTypes, artikelTypes, allRollen, printers, tarieven, bedrag, handmatig }) {
  const bedragWeergave = regel.handmatig_bedrag ?? (typeof bedrag === 'number' ? bedrag.toFixed(2) : '');
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
        {typeof bedrag === 'number' && (
          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>€</span>
            <input
              type="number" min="0" step="0.01" value={bedragWeergave}
              onChange={e => onChange({ handmatig_bedrag: e.target.value })}
              title={handmatig ? 'Handmatig aangepast eindbedrag — klik ↺ om terug te zetten naar het berekende bedrag' : 'Berekend eindbedrag — pas eventueel manueel aan'}
              style={{ width:76, fontSize:12, fontWeight:500, textAlign:'right', color: handmatig ? 'var(--warn)' : 'var(--accent2)' }}
            />
            {handmatig && (
              <button type="button" onClick={() => onChange({ handmatig_bedrag: undefined })} title="Terug naar berekend bedrag"
                style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:13, lineHeight:1, padding:0 }}>↺</button>
            )}
          </div>
        )}
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
