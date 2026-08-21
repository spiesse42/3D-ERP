import { Router } from 'express';
import { getDb } from '../db.js';
import { LOGO_DATA_URI } from '../lib/logo.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
}

// Bedrijfsgegevens (naam/BTW/adres/email/IBAN) voor op offerte/werkbon/factuur
// — instelbaar via Instellingen-tab, opgeslagen in de generieke instellingen-tabel.
function getBedrijfsgegevens(db) {
  const rows = db.prepare(`
    SELECT sleutel, waarde FROM instellingen
    WHERE sleutel IN ('bedrijf_naam','bedrijf_btw','bedrijf_adres','bedrijf_email','bedrijf_iban')
  `).all();
  const map = Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
  return {
    naam:  map.bedrijf_naam  || '',
    btw:   map.bedrijf_btw   || '',
    adres: map.bedrijf_adres || '',
    email: map.bedrijf_email || '',
    iban:  map.bedrijf_iban  || '',
  };
}

// Valt terug op de standaardwaarde enkel als er écht niets bruikbaars werd
// meegegeven — niet bij een bewust ingevulde 0 (bv. "geen voorbereidingstijd
// nodig"). Met een gewone `||`-fallback ging zo'n ingevulde 0 altijd verloren
// en werd bij elke volgende opslag/heropening stilzwijgend de standaardwaarde
// teruggezet.
function getalOfDefault(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function nextNummer(db) {
  const jaar = new Date().getFullYear();
  const last = db.prepare(`SELECT nummer FROM offertes_v2 WHERE nummer LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`OFF-${jaar}-%`);
  if (!last) return `OFF-${jaar}-001`;
  const n = parseInt(last.nummer.split('-')[2]) + 1;
  return `OFF-${jaar}-${String(n).padStart(3, '0')}`;
}

function berekenOfferte(data, t) {
  const {
    geschat_gewicht_g = 0,
    geschatte_tijd_u = 0,
    geschatte_tijd_min = 0,
    voorbereiding_min = t.voorbereiding_min || 15,
    nabewerking_min = t.nabewerking_min || 10,
    ontwerp_min = 0,
    ontwerp_tarief = t.ontwerp_tarief || 15,
    nabewerking_extra_min = 0,
    nabewerking_extra_tarief = t.nabewerking_tarief || 15,
    is_multicolor = 0,
    extra_per_stuk = 0,
    extra_eenmalig = 0,
    aantal = 1,
    filament_prijs_per_kg = 0,
    printer_watt = 120,
    artikelen_kost = 0,
    artikelen_vast_kost = 0,
    materiaal_kost_override = null,
  } = data;

  const arbeid_per_uur = t.arbeid_per_uur || 15;
  const kwh_prijs = t.kwh_prijs || 0.35;
  const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
  const bmcu = is_multicolor ? (t.bmcu_per_job || 0.10) : 0;

  const totale_tijd_u = parseInt(geschatte_tijd_u) + parseInt(geschatte_tijd_min) / 60;

  // Multicolor: bij opgegeven per-kleur rollen (materiaal_kost_override, zie
  // berekenMultiMateriaalKost) telt de som van de effectieve rolprijzen per
  // kleur — anders (single-kleur) de prijs van het hoofd-filamenttype.
  const materiaal_kost = materiaal_kost_override != null
    ? parseFloat(materiaal_kost_override)
    : (parseFloat(geschat_gewicht_g) / 1000) * parseFloat(filament_prijs_per_kg) * faalfactor * parseInt(aantal);
  const kwh_schat = (printer_watt / 1000) * totale_tijd_u * parseInt(aantal);
  const energie_kost_schat = kwh_schat * kwh_prijs;
  const machine_kost = totale_tijd_u * (t.machine_per_uur || 0.13) * parseInt(aantal);
  const arbeid_kost = ((parseInt(voorbereiding_min) + parseInt(nabewerking_min)) / 60 * arbeid_per_uur)
    + (parseInt(ontwerp_min) / 60 * parseFloat(ontwerp_tarief))
    + (parseInt(nabewerking_extra_min) / 60 * parseFloat(nabewerking_extra_tarief));
  const extra_totaal = parseFloat(extra_per_stuk) * parseInt(aantal) + parseFloat(extra_eenmalig);
  const subtotaal = materiaal_kost + energie_kost_schat + machine_kost + arbeid_kost + extra_totaal + bmcu + parseFloat(artikelen_kost || 0);

  const marge_grens = t.marge_grens_uur || 4;
  const marge_pct = totale_tijd_u >= marge_grens ? (t.marge_groot_pct || 10) : (t.marge_klein_pct || 18);
  // verkoopprijs_basis = alles waar marge op wordt toegepast (excl. de
  // vast-geprijsde artikelen — bv. verzendkosten — die krijgen bewust GEEN
  // marge en worden 1-op-1 als reeds-incl.-BTW eindprijs bijgeteld.
  const verkoopprijs_basis = subtotaal * (1 + marge_pct / 100);
  const verkoopprijs = verkoopprijs_basis + parseFloat(artikelen_vast_kost || 0);

  return {
    materiaal_kost: Math.round(materiaal_kost * 1000) / 1000,
    energie_kost_schat: Math.round(energie_kost_schat * 1000) / 1000,
    machine_kost: Math.round(machine_kost * 1000) / 1000,
    arbeid_kost: Math.round(arbeid_kost * 1000) / 1000,
    extra_totaal: Math.round(extra_totaal * 1000) / 1000,
    artikelen_kost: Math.round((parseFloat(artikelen_kost) || 0) * 1000) / 1000,
    artikelen_vast_kost: Math.round((parseFloat(artikelen_vast_kost) || 0) * 1000) / 1000,
    subtotaal: Math.round(subtotaal * 1000) / 1000,
    marge_pct,
    verkoopprijs_basis: Math.round(verkoopprijs_basis * 100) / 100,
    verkoopprijs: Math.round(verkoopprijs * 100) / 100,
  };
}

// Printer-wattage voor de energieschatting: het ingestelde gemiddeld verbruik
// per printer (Instellingen-tab) heeft voorrang — zelfde bron als KostenModal
// gebruikt voor de kWh-schatting bij printers zonder live meting. Enkel als
// dat niet is ingevuld, valt terug op de oude generieke Ender/Bambu-tarieven.
function bepaalPrinterWatt(p, t) {
  if (p?.gem_verbruik_watt > 0) return p.gem_verbruik_watt;
  return p?.naam?.toLowerCase().includes('ender') ? (t.ender_watt || 150) : (t.bambu_watt || 120);
}

// Effectieve prijs/kg van 1 specifieke filamentrol — zelfde COALESCE-formule
// als filament.js (/rollen, /rollen/by-type): aankoopprijs van de rol zelf
// als die gekend is, anders de typeprijs.
function haalRolEffectievePrijs(db, rolId) {
  const row = db.prepare(`
    SELECT COALESCE(
      r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END),
      ft.inkoop_prijs_per_kg
    ) as prijs_per_kg_effectief
    FROM filament_rollen r JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE r.id = ?
  `).get(rolId);
  return parseFloat(row?.prijs_per_kg_effectief) || 0;
}

// Materiaalkost voor multicolor-offertes: som per kleur van (gram/1000) ×
// effectieve rolprijs × faalfactor — zelfde berekening als de live preview
// in Offertes.jsx (berekenLive). Geeft null terug als er geen bruikbare
// per-kleur rollen zijn, zodat de aanroeper dan op de normale single-kleur
// berekening terugvalt.
function berekenMultiMateriaalKost(db, filamentRollen, faalfactor, aantal) {
  if (!Array.isArray(filamentRollen) || !filamentRollen.some(fr => parseFloat(fr.gram) > 0)) return null;
  const som = filamentRollen.reduce((s, fr) => {
    const gram = parseFloat(fr.gram) || 0;
    if (gram <= 0 || !fr.filament_rol_id) return s;
    return s + (gram / 1000) * haalRolEffectievePrijs(db, fr.filament_rol_id) * faalfactor;
  }, 0);
  return som * (parseInt(aantal) || 1);
}

// Bepaalt de materiaal_kost_override voor één offerte: bij multicolor de som
// per kleur (zie hierboven); anders — indien een specifieke rol gekozen is —
// de effectieve rolprijs van die rol i.p.v. de generieke typeprijs. Geeft
// null terug als er niets specifieks gekozen is, zodat de normale
// typeprijs-berekening in berekenOfferte() als fallback dient.
function bepaalMateriaalKostOverride(db, { is_multicolor, filament_rollen, filament_rol_id, geschat_gewicht_g, aantal }, faalfactor) {
  if (parseInt(is_multicolor)) {
    return berekenMultiMateriaalKost(db, filament_rollen, faalfactor, aantal);
  }
  if (filament_rol_id) {
    const prijs = haalRolEffectievePrijs(db, filament_rol_id);
    if (prijs > 0) {
      return (parseFloat(geschat_gewicht_g) / 1000) * prijs * faalfactor * (parseInt(aantal) || 1);
    }
  }
  return null;
}

// Prijs van 1 artikelregel — zelfde eenheid-logica als kosten.js (job-werkbon):
// 'gram' wordt per kg geprijsd (dus /1000), 'stuk'/'ml' rechtstreeks per eenheid.
function kostPerArtikelRegel(a) {
  const deler = a.eenheid === 'gram' ? 1000 : 1;
  return (parseFloat(a.aantal) / deler) * (parseFloat(a.inkoop_prijs_per_kg) || 0);
}

function haalArtikelen(db, offerteId) {
  return db.prepare(`
    SELECT oa.id, oa.filament_type_id, oa.aantal,
      ft.merk, ft.materiaal, ft.eenheid, ft.categorie, ft.inkoop_prijs_per_kg, ft.vaste_prijs
    FROM offerte_artikelen oa
    JOIN filament_types ft ON ft.id = oa.filament_type_id
    WHERE oa.offerte_id = ?
    ORDER BY oa.id
  `).all(offerteId);
}

// Splitst de artikelen in twee groepen: 'marge' (normale artikelen, krijgen
// de gewone offerte-marge zoals materiaal/arbeid) en 'vast' (vaste_prijs-
// artikelen zoals verzendkosten: geen marge, prijs is al incl. BTW en wordt
// 1-op-1 bij de verkoopprijs opgeteld).
function berekenArtikelenKost(db, offerteId) {
  return haalArtikelen(db, offerteId).reduce((som, a) => {
    if (a.vaste_prijs) som.vast += kostPerArtikelRegel(a);
    else som.marge += kostPerArtikelRegel(a);
    return som;
  }, { marge: 0, vast: 0 });
}

// Herberekent en bewaart de volledige offerte-totalen (bv. na een artikel toe
// te voegen/wijzigen/verwijderen) — zelfde berekening als POST/PUT, maar dan
// op basis van de reeds opgeslagen offerte-velden i.p.v. een nieuwe req.body.
function herbereken(db, offerteId) {
  const t = getTarieven(db);
  const offerte = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?').get(offerteId);
  if (!offerte) return null;

  let filament_prijs_per_kg = 0;
  if (offerte.filament_type_id) {
    const ft = db.prepare('SELECT inkoop_prijs_per_kg FROM filament_types WHERE id = ?').get(offerte.filament_type_id);
    filament_prijs_per_kg = ft?.inkoop_prijs_per_kg || 0;
  }
  let printer_watt = 120;
  if (offerte.printer_id) {
    const p = db.prepare('SELECT naam, gem_verbruik_watt FROM printers WHERE id = ?').get(offerte.printer_id);
    printer_watt = bepaalPrinterWatt(p, t);
  }

  const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
  let filament_rollen = [];
  try { filament_rollen = JSON.parse(offerte.filament_rollen_json || '[]'); } catch { filament_rollen = []; }
  const materiaal_kost_override = bepaalMateriaalKostOverride(db, { ...offerte, filament_rollen }, faalfactor);

  const artKost = berekenArtikelenKost(db, offerteId);
  const arbeid_per_uur = t.arbeid_per_uur || 15;
  const ber = berekenOfferte({ ...offerte, filament_prijs_per_kg, printer_watt, artikelen_kost: artKost.marge, artikelen_vast_kost: artKost.vast, materiaal_kost_override }, t);
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * (parseFloat(offerte.btw_pct) || 0)) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;

  db.prepare(`
    UPDATE offertes_v2 SET
      materiaal_kost=?, energie_kost_schat=?, arbeid_kost=?, machine_kost=?,
      extra_totaal=?, artikelen_kost=?, subtotaal=?, marge_pct=?, verkoopprijs=?,
      btw_bedrag=?, totaal=?, arbeid_per_uur=?
    WHERE id=?
  `).run(
    ber.materiaal_kost, ber.energie_kost_schat, ber.arbeid_kost, ber.machine_kost,
    ber.extra_totaal, ber.artikelen_kost + ber.artikelen_vast_kost, ber.subtotaal, ber.marge_pct, ber.verkoopprijs,
    btw_bedrag, totaal, arbeid_per_uur, offerteId
  );

  return { ...ber, btw_bedrag, totaal };
}

// Bouwt de nette, klantgerichte regel-lijst (aantal / omschrijving /
// eenheidsprijs / totaal) — dezelfde regels als de ERP-detailweergave
// gebruikt, zodat het venster in de app en het uiteindelijke document altijd
// exact hetzelfde tonen. Interne rekendetails (faalfactor, printer, aparte
// voorbereidings-/nabewerkingsminuten, machine-uurkost...) komen hier bewust
// niet in voor — dat is boekhouding, geen klantinformatie.
function offerteRegels(offerte, berekening, filamentType, artikelen = []) {
  const margeFactor = 1 + (berekening.marge_pct || 0) / 100;
  const aantal = offerte.aantal || 1;
  const eenheidLabel = e => e === 'stuk' ? 'stuks' : e === 'ml' ? 'ml' : 'g';
  const regels = [];

  // Hoofdregel: het printwerk zelf (materiaal + energie + machine + evt. BMCU)
  const printBasis = (berekening.materiaal_kost || 0) + (berekening.energie_kost_schat || 0)
    + (berekening.machine_kost || 0) + (berekening.bmcu || 0);
  const printOmschrijving = (offerte.object_naam || '3D-printwerk')
    + (filamentType ? ` (${filamentType.merk} ${filamentType.materiaal})` : '')
    + (offerte.is_multicolor ? ' — multicolor' : '');
  regels.push({
    omschrijving: printOmschrijving,
    aantal,
    eenheidsprijs: (printBasis / aantal) * margeFactor,
    totaal: printBasis * margeFactor,
  });

  // Arbeid — voorbereiding, nabewerking en eventuele ontwerp/regie samen als
  // 1 regel, zonder de onderliggende minuten/tarieven te tonen.
  if (berekening.arbeid_kost > 0) {
    regels.push({
      omschrijving: 'Voorbereiding, afwerking & ontwerp',
      aantal: 1,
      eenheidsprijs: berekening.arbeid_kost * margeFactor,
      totaal: berekening.arbeid_kost * margeFactor,
    });
  }

  // Extra kosten
  if (berekening.extra_totaal > 0) {
    regels.push({
      omschrijving: offerte.extra_omschrijving || 'Extra',
      aantal: 1,
      eenheidsprijs: berekening.extra_totaal * margeFactor,
      totaal: berekening.extra_totaal * margeFactor,
    });
  }

  // Extra artikelen (bv. verzendkosten). Vaste_prijs-artikelen krijgen bewust
  // GEEN marge — de ingevoerde prijs is al de (incl. BTW) eindprijs.
  for (const a of artikelen) {
    const deler = a.eenheid === 'gram' ? 1000 : 1;
    const aantalNum = parseFloat(a.aantal) || 0;
    const aantalTxt = a.eenheid === 'stuk' ? Math.round(aantalNum) : aantalNum.toFixed(1);
    const factor = a.vaste_prijs ? 1 : margeFactor;
    const artikelTotaal = (aantalNum / deler) * (a.inkoop_prijs_per_kg || 0) * factor;
    regels.push({
      omschrijving: `${a.merk || ''} ${a.materiaal || ''}`.trim(),
      aantal: `${aantalTxt} ${eenheidLabel(a.eenheid)}`,
      eenheidsprijs: aantalNum > 0 ? artikelTotaal / aantalNum : 0,
      totaal: artikelTotaal,
    });
  }

  return regels;
}

function buildOfferteHtml(offerte, klant, berekening, filamentType, artikelen = [], bedrijf = {}) {
  const nu = new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const regels = offerteRegels(offerte, berekening, filamentType, artikelen);
  const regelRijen = regels.map(r => `
    <tr>
      <td>${typeof r.aantal === 'number' ? r.aantal : r.aantal}</td>
      <td>${r.omschrijving}</td>
      <td>€${r.eenheidsprijs.toFixed(2)}</td>
      <td>€${r.totaal.toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo img{height:64px;width:auto;display:block}
  .doc-nr{font-size:1.1rem;font-weight:bold}
  .klant{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .klant h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  .object{margin-bottom:20px;font-size:.9rem;color:#444}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase}
  th:first-child,td:first-child{width:70px}
  th:nth-child(3),td:nth-child(3),th:last-child,td:last-child{text-align:right;width:110px}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .totaal{background:#0c0c0c;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
  .totaal-label{color:#a0a0a0;font-size:.85rem}
  .totaal-bedrag{font-size:2rem;font-weight:900;color:#5b8dee}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
  .opmerking{margin-top:16px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo"><img src="${LOGO_DATA_URI}" alt="3D Plezier"></div>
    ${bedrijf.naam || bedrijf.adres || bedrijf.email || bedrijf.btw ? `
    <div style="margin-top:8px;font-size:.72rem;color:#888;line-height:1.5">
      ${bedrijf.naam ? `<strong>${bedrijf.naam}</strong><br>` : ''}
      ${bedrijf.adres ? `${bedrijf.adres}<br>` : ''}
      ${bedrijf.email ? `${bedrijf.email}<br>` : ''}
      ${bedrijf.btw ? `BTW: ${bedrijf.btw}` : ''}
    </div>` : ''}
  </div>
  <div style="text-align:right;color:#666;font-size:.85rem">
    <div class="doc-nr">OFFERTE ${offerte.nummer}</div>
    <div>${nu}</div>
    ${offerte.geldig_tot ? `<div>Geldig tot: ${offerte.geldig_tot}</div>` : ''}
  </div>
</div>

<div class="klant">
  <h3>Klant</h3>
  <strong>${klant.voornaam ? klant.voornaam + ' ' : ''}${klant.naam}</strong>
  ${klant.straat ? `<br>${klant.straat} ${klant.huisnummer || ''}, ${klant.postcode || ''} ${klant.gemeente || ''}` : ''}
  ${klant.email ? `<br>✉ ${klant.email}` : ''}
  ${klant.btw_nummer ? `<br>BTW: ${klant.btw_nummer}` : ''}
</div>

${offerte.object_naam || offerte.object_link ? `
<div class="object">
  ${offerte.object_naam ? `<strong>${offerte.object_naam}</strong>` : ''}
  ${offerte.object_link ? ` <a href="${offerte.object_link}" style="color:#5b8dee;font-size:.85rem">(referentie)</a>` : ''}
</div>` : ''}

<table>
  <thead><tr><th>Aantal</th><th>Omschrijving</th><th>Eenheidsprijs</th><th>Totaal</th></tr></thead>
  <tbody>${regelRijen}</tbody>
</table>

<div class="totaal">
  <div>
    <div class="totaal-label">TOTAAL</div>
  </div>
  <div class="totaal-bedrag">€${berekening.verkoopprijs.toFixed(2)}</div>
</div>

${offerte.notities ? `<div class="opmerking">📝 ${offerte.notities}</div>` : ''}
<div class="footer">
  Vrijgesteld van BTW — art. 56bis BTW-wetboek
  ${bedrijf.iban ? `<br>IBAN: ${bedrijf.iban}` : ''}
</div>
</body></html>`;
}

// GET alle offertes
r.get('/', (req, res) => {
  const rows = getDb().prepare(`
    SELECT o.*, k.naam as klant_naam, k.voornaam as klant_voornaam,
      p.naam as printer_naam, ft.merk as filament_merk, ft.materiaal as filament_materiaal
    FROM offertes_v2 o
    JOIN klanten k ON k.id = o.klant_id
    LEFT JOIN printers p ON p.id = o.printer_id
    LEFT JOIN filament_types ft ON ft.id = o.filament_type_id
    ORDER BY o.aangemaakt_op DESC
  `).all();
  res.json(rows);
});

// GET één offerte
r.get('/:id', (req, res) => {
  const db = getDb();
  const offerte = db.prepare(`
    SELECT o.*, k.naam as klant_naam, k.voornaam as klant_voornaam,
      k.email, k.straat, k.huisnummer, k.postcode, k.gemeente, k.btw_nummer,
      p.naam as printer_naam, ft.merk as filament_merk, ft.materiaal as filament_materiaal,
      ft.inkoop_prijs_per_kg, fr.kleur as rol_kleur, fr.lotnummer as rol_lotnummer
    FROM offertes_v2 o
    JOIN klanten k ON k.id = o.klant_id
    LEFT JOIN printers p ON p.id = o.printer_id
    LEFT JOIN filament_types ft ON ft.id = o.filament_type_id
    LEFT JOIN filament_rollen fr ON fr.id = o.filament_rol_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });
  let filament_rollen = [];
  try { filament_rollen = JSON.parse(offerte.filament_rollen_json || '[]'); } catch { filament_rollen = []; }
  res.json({ ...offerte, filament_rollen, artikelen: haalArtikelen(db, req.params.id) });
});

// GET artikelen van een offerte
r.get('/:id/artikelen', (req, res) => {
  res.json(haalArtikelen(getDb(), req.params.id));
});

// POST artikel toevoegen aan offerte (bv. verzendkosten, ringetjes...)
r.post('/:id/artikelen', (req, res) => {
  const db = getDb();
  const { filament_type_id, aantal } = req.body;
  if (!filament_type_id || !aantal || parseFloat(aantal) <= 0) {
    return res.status(400).json({ error: 'filament_type_id en aantal (> 0) zijn verplicht' });
  }
  const offerte = db.prepare('SELECT id FROM offertes_v2 WHERE id = ?').get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Offerte niet gevonden' });
  db.prepare('INSERT INTO offerte_artikelen (offerte_id, filament_type_id, aantal) VALUES (?,?,?)')
    .run(req.params.id, filament_type_id, parseFloat(aantal));
  const berekening = herbereken(db, req.params.id);
  res.status(201).json({ artikelen: haalArtikelen(db, req.params.id), ...berekening });
});

// PUT artikel bijwerken (aantal aanpassen)
r.put('/:id/artikelen/:artikelId', (req, res) => {
  const db = getDb();
  const { aantal } = req.body;
  if (!aantal || parseFloat(aantal) <= 0) return res.status(400).json({ error: 'aantal (> 0) is verplicht' });
  db.prepare('UPDATE offerte_artikelen SET aantal = ? WHERE id = ? AND offerte_id = ?')
    .run(parseFloat(aantal), req.params.artikelId, req.params.id);
  const berekening = herbereken(db, req.params.id);
  res.json({ artikelen: haalArtikelen(db, req.params.id), ...berekening });
});

// DELETE artikel verwijderen
r.delete('/:id/artikelen/:artikelId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM offerte_artikelen WHERE id = ? AND offerte_id = ?').run(req.params.artikelId, req.params.id);
  const berekening = herbereken(db, req.params.id);
  res.json({ artikelen: haalArtikelen(db, req.params.id), ...berekening });
});

// POST nieuwe offerte
r.post('/', (req, res) => {
  const db = getDb();
  const t = getTarieven(db);
  const {
    klant_id, object_naam, object_link, printer_id, filament_type_id, filament_rol_id,
    geschat_gewicht_g, geschatte_tijd_u = 0, geschatte_tijd_min = 0,
    voorbereiding_min, nabewerking_min, ontwerp_min = 0, ontwerp_tarief,
    nabewerking_extra_min = 0, nabewerking_extra_tarief,
    is_multicolor = 0, extra_per_stuk = 0, extra_eenmalig = 0,
    extra_omschrijving, aantal = 1, btw_pct = 21, geldig_tot, notities,
    filament_rollen = [],
  } = req.body;

  if (!klant_id) return res.status(400).json({ error: 'Klant is verplicht' });

  let filament_prijs_per_kg = 0;
  if (filament_type_id) {
    const ft = db.prepare('SELECT inkoop_prijs_per_kg FROM filament_types WHERE id = ?').get(filament_type_id);
    filament_prijs_per_kg = ft?.inkoop_prijs_per_kg || 0;
  }

  let printer_watt = 120;
  if (printer_id) {
    const p = db.prepare('SELECT naam, gem_verbruik_watt FROM printers WHERE id = ?').get(printer_id);
    printer_watt = bepaalPrinterWatt(p, t);
  }

  const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
  const materiaal_kost_override = bepaalMateriaalKostOverride(
    db, { is_multicolor, filament_rollen, filament_rol_id, geschat_gewicht_g, aantal }, faalfactor
  );

  const berData = {
    geschat_gewicht_g: parseFloat(geschat_gewicht_g) || 0,
    geschatte_tijd_u: parseInt(geschatte_tijd_u) || 0,
    geschatte_tijd_min: parseInt(geschatte_tijd_min) || 0,
    voorbereiding_min: getalOfDefault(voorbereiding_min, t.voorbereiding_min || 15),
    nabewerking_min: getalOfDefault(nabewerking_min, t.nabewerking_min || 10),
    ontwerp_min: getalOfDefault(ontwerp_min, 0),
    ontwerp_tarief: getalOfDefault(ontwerp_tarief, t.ontwerp_tarief || 15),
    nabewerking_extra_min: getalOfDefault(nabewerking_extra_min, 0),
    nabewerking_extra_tarief: getalOfDefault(nabewerking_extra_tarief, t.nabewerking_tarief || 15),
    is_multicolor: parseInt(is_multicolor) || 0,
    extra_per_stuk: getalOfDefault(extra_per_stuk, 0),
    extra_eenmalig: getalOfDefault(extra_eenmalig, 0),
    aantal: parseInt(aantal) || 1,
    filament_prijs_per_kg,
    printer_watt,
    materiaal_kost_override,
  };

  const ber = berekenOfferte(berData, t);
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * (parseFloat(btw_pct) || 0)) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;
  const nummer = nextNummer(db);
  const arbeid_per_uur = t.arbeid_per_uur || 15;

  const result = db.prepare(`
    INSERT INTO offertes_v2 (
      klant_id, nummer, object_naam, object_link, printer_id, filament_type_id, filament_rol_id,
      geschat_gewicht_g, geschatte_tijd_u, geschatte_tijd_min,
      voorbereiding_min, nabewerking_min, ontwerp_min, ontwerp_tarief,
      nabewerking_extra_min, nabewerking_extra_tarief, is_multicolor, filament_rollen_json,
      extra_per_stuk, extra_eenmalig, extra_omschrijving, aantal,
      materiaal_kost, energie_kost_schat, arbeid_kost, machine_kost, extra_totaal,
      subtotaal, marge_pct, verkoopprijs, btw_pct, btw_bedrag, totaal,
      geldig_tot, notities, arbeid_per_uur
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    klant_id, nummer, object_naam||null, object_link||null, printer_id||null, filament_type_id||null, filament_rol_id||null,
    berData.geschat_gewicht_g, berData.geschatte_tijd_u, berData.geschatte_tijd_min,
    berData.voorbereiding_min, berData.nabewerking_min, berData.ontwerp_min, berData.ontwerp_tarief,
    berData.nabewerking_extra_min, berData.nabewerking_extra_tarief, berData.is_multicolor,
    berData.is_multicolor ? JSON.stringify(filament_rollen) : null,
    berData.extra_per_stuk, berData.extra_eenmalig, extra_omschrijving||null, berData.aantal,
    ber.materiaal_kost, ber.energie_kost_schat, ber.arbeid_kost, ber.machine_kost, ber.extra_totaal,
    ber.subtotaal, ber.marge_pct, ber.verkoopprijs, parseFloat(btw_pct)||0, btw_bedrag, totaal,
    geldig_tot||null, notities||null, arbeid_per_uur
  );

  res.status(201).json({ id: result.lastInsertRowid, nummer, ...ber, btw_bedrag, totaal });
});

// PUT update offerte — MOET voor export default staan!
r.put('/:id', (req, res) => {
  const db = getDb();
  const t = getTarieven(db);
  const existing = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Niet gevonden' });

  const data = { ...existing, ...req.body };

  let filament_prijs_per_kg = 0;
  if (data.filament_type_id) {
    const ft = db.prepare('SELECT inkoop_prijs_per_kg FROM filament_types WHERE id = ?').get(data.filament_type_id);
    filament_prijs_per_kg = ft?.inkoop_prijs_per_kg || 0;
  }

  let printer_watt = 120;
  if (data.printer_id) {
    const p = db.prepare('SELECT naam, gem_verbruik_watt FROM printers WHERE id = ?').get(data.printer_id);
    printer_watt = bepaalPrinterWatt(p, t);
  }

  const filament_rollen = Array.isArray(data.filament_rollen) ? data.filament_rollen : [];
  const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
  const materiaal_kost_override = bepaalMateriaalKostOverride(
    db, { is_multicolor: data.is_multicolor, filament_rollen, filament_rol_id: data.filament_rol_id, geschat_gewicht_g: data.geschat_gewicht_g, aantal: data.aantal }, faalfactor
  );

  const berData = {
    geschat_gewicht_g: parseFloat(data.geschat_gewicht_g) || 0,
    geschatte_tijd_u: parseInt(data.geschatte_tijd_u) || 0,
    geschatte_tijd_min: parseInt(data.geschatte_tijd_min) || 0,
    voorbereiding_min: getalOfDefault(data.voorbereiding_min, t.voorbereiding_min || 15),
    nabewerking_min: getalOfDefault(data.nabewerking_min, t.nabewerking_min || 10),
    ontwerp_min: getalOfDefault(data.ontwerp_min, 0),
    ontwerp_tarief: getalOfDefault(data.ontwerp_tarief, t.ontwerp_tarief || 15),
    nabewerking_extra_min: getalOfDefault(data.nabewerking_extra_min, 0),
    nabewerking_extra_tarief: getalOfDefault(data.nabewerking_extra_tarief, t.nabewerking_tarief || 15),
    is_multicolor: parseInt(data.is_multicolor) || 0,
    extra_per_stuk: getalOfDefault(data.extra_per_stuk, 0),
    extra_eenmalig: getalOfDefault(data.extra_eenmalig, 0),
    aantal: parseInt(data.aantal) || 1,
    filament_prijs_per_kg,
    printer_watt,
    materiaal_kost_override,
  };
  // Bewaar de artikelen-bijdrage (verzendkosten enz.) — anders zou het
  // hoofd-'Opslaan' hier de bijdrage van reeds toegevoegde artikelen wissen.
  // Gesplitst: 'marge' krijgt de gewone offerte-marge, 'vast' (vaste_prijs-
  // artikelen zoals verzendkosten) niet — zie berekenOfferte().
  const artKostPut = berekenArtikelenKost(db, req.params.id);
  berData.artikelen_kost = artKostPut.marge;
  berData.artikelen_vast_kost = artKostPut.vast;

  const ber = berekenOfferte(berData, t);
  const btw_pct = parseFloat(data.btw_pct) || 0;
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * btw_pct) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;
  const arbeid_per_uur = t.arbeid_per_uur || 15;

  db.prepare(`
    UPDATE offertes_v2 SET
      klant_id=?, object_naam=?, object_link=?, printer_id=?, filament_type_id=?, filament_rol_id=?,
      geschat_gewicht_g=?, geschatte_tijd_u=?, geschatte_tijd_min=?,
      voorbereiding_min=?, nabewerking_min=?, ontwerp_min=?, ontwerp_tarief=?,
      nabewerking_extra_min=?, nabewerking_extra_tarief=?, is_multicolor=?, filament_rollen_json=?,
      extra_per_stuk=?, extra_eenmalig=?, extra_omschrijving=?, aantal=?,
      materiaal_kost=?, energie_kost_schat=?, arbeid_kost=?, machine_kost=?,
      extra_totaal=?, artikelen_kost=?, subtotaal=?, marge_pct=?, verkoopprijs=?,
      btw_pct=?, btw_bedrag=?, totaal=?, geldig_tot=?, notities=?, arbeid_per_uur=?
    WHERE id=?
  `).run(
    data.klant_id, data.object_naam||null, data.object_link||null,
    data.printer_id||null, data.filament_type_id||null, data.filament_rol_id||null,
    berData.geschat_gewicht_g, berData.geschatte_tijd_u, berData.geschatte_tijd_min,
    berData.voorbereiding_min, berData.nabewerking_min, berData.ontwerp_min, berData.ontwerp_tarief,
    berData.nabewerking_extra_min, berData.nabewerking_extra_tarief, berData.is_multicolor,
    berData.is_multicolor ? JSON.stringify(filament_rollen) : null,
    berData.extra_per_stuk, berData.extra_eenmalig, data.extra_omschrijving||null, berData.aantal,
    ber.materiaal_kost, ber.energie_kost_schat, ber.arbeid_kost, ber.machine_kost, ber.extra_totaal,
    ber.artikelen_kost + ber.artikelen_vast_kost, ber.subtotaal, ber.marge_pct, ber.verkoopprijs, btw_pct, btw_bedrag, totaal,
    data.geldig_tot||null, data.notities||null, arbeid_per_uur, req.params.id
  );

  res.json({ ok: true, ...ber, btw_bedrag, totaal });
});

// PATCH status
r.patch('/:id/status', (req, res) => {
  getDb().prepare('UPDATE offertes_v2 SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// POST maak werkbon job van offerte — neemt ALLE relevante offertegegevens
// over (filament, arbeid, extra kosten, artikelen) zodat de Werkbon
// (KostenModal) bij het openen al volledig ingevuld staat i.p.v. leeg, en
// niets dubbel ingegeven moet worden.
r.post('/:id/maak-job', (req, res) => {
  const db = getDb();
  const offerte = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?').get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });
  if (!offerte.printer_id) return res.status(400).json({ error: 'Offerte heeft geen printer — bewerk de offerte eerst' });

  const totaleUren = (offerte.geschatte_tijd_u || 0) + (offerte.geschatte_tijd_min || 0) / 60;

  let filament_rollen = [];
  try { filament_rollen = JSON.parse(offerte.filament_rollen_json || '[]'); } catch { filament_rollen = []; }

  const gewichtGeschat = offerte.is_multicolor
    ? filament_rollen.reduce((s, fr) => s + (parseFloat(fr.gram) || 0), 0)
    : (offerte.geschat_gewicht_g || 0);

  try {
    const jobId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO jobs (klant_id, printer_id, naam, status, print_uren_geschat, is_multicolor, gewicht_geschat, notities, offerte_id)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        offerte.klant_id, offerte.printer_id,
        offerte.object_naam || `Job van offerte ${offerte.nummer}`,
        'gepland', totaleUren, offerte.is_multicolor, gewichtGeschat || null,
        `Werkbon van offerte ${offerte.nummer}`, offerte.id
      );
      const id = result.lastInsertRowid;

      // Arbeid/extra — 1-op-1 overname naar job_kosten (de echte materiaal-
      // /energie-/machinekost wordt door de Werkbon zelf herberekend zodra
      // die opent, op basis van de hieronder overgenomen materialen/diensten).
      db.prepare(`
        INSERT INTO job_kosten (
          job_id, aantal, voorbereiding_min, nabewerking_min,
          ontwerp_min, ontwerp_tarief, nabewerking_extra_min, nabewerking_extra_tarief,
          extra_per_stuk, extra_eenmalig, extra_omschrijving
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, offerte.aantal || 1, offerte.voorbereiding_min || 0, offerte.nabewerking_min || 0,
        offerte.ontwerp_min || 0, offerte.ontwerp_tarief || 15,
        offerte.nabewerking_extra_min || 0, offerte.nabewerking_extra_tarief || 15,
        offerte.extra_per_stuk || 0, offerte.extra_eenmalig || 0, offerte.extra_omschrijving || null
      );

      // Filament → job_materialen
      if (offerte.is_multicolor) {
        for (const fr of filament_rollen) {
          const gram = parseFloat(fr.gram);
          if (gram > 0 && fr.filament_rol_id) {
            db.prepare('INSERT INTO job_materialen (job_id, filament_rol_id, gram_gebruikt) VALUES (?,?,?)')
              .run(id, fr.filament_rol_id, gram);
          }
        }
      } else if (offerte.filament_rol_id && offerte.geschat_gewicht_g > 0) {
        db.prepare('INSERT INTO job_materialen (job_id, filament_rol_id, gram_gebruikt) VALUES (?,?,?)')
          .run(id, offerte.filament_rol_id, offerte.geschat_gewicht_g);
      }

      // Offerte-artikelen (bv. verzendkosten) → job_diensten, zelfde model
      // (prijs op typeniveau, geen voorraadreservering)
      for (const a of haalArtikelen(db, offerte.id)) {
        db.prepare('INSERT INTO job_diensten (job_id, filament_type_id, aantal, prijs_per_eenheid) VALUES (?,?,?,?)')
          .run(id, a.filament_type_id, a.aantal, a.inkoop_prijs_per_kg || 0);
      }

      db.prepare('UPDATE offertes_v2 SET job_id = ?, status = ? WHERE id = ?').run(id, 'goedgekeurd', offerte.id);
      return id;
    })();

    res.status(201).json({ job_id: jobId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET PDF
r.get('/:id/pdf', (req, res) => {
  const db = getDb();
  const offerte = db.prepare(`
    SELECT o.*, k.naam as klant_naam, k.voornaam, k.email, k.straat, k.huisnummer,
      k.postcode, k.gemeente, k.btw_nummer
    FROM offertes_v2 o JOIN klanten k ON k.id = o.klant_id WHERE o.id = ?
  `).get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });

  const klant = { naam: offerte.klant_naam, voornaam: offerte.voornaam, email: offerte.email,
    straat: offerte.straat, huisnummer: offerte.huisnummer, postcode: offerte.postcode,
    gemeente: offerte.gemeente, btw_nummer: offerte.btw_nummer };
  const ft = offerte.filament_type_id ? db.prepare('SELECT * FROM filament_types WHERE id = ?').get(offerte.filament_type_id) : null;
  const t = getTarieven(db);
  const ber = {
    materiaal_kost: offerte.materiaal_kost, energie_kost_schat: offerte.energie_kost_schat,
    arbeid_kost: offerte.arbeid_kost, machine_kost: offerte.machine_kost,
    bmcu: offerte.is_multicolor ? (t.bmcu_per_job || 0.10) : 0,
    extra_totaal: offerte.extra_totaal, subtotaal: offerte.subtotaal,
    marge_pct: offerte.marge_pct, verkoopprijs: offerte.verkoopprijs,
    // Bevroren tarief van bij het (laatst) opslaan van de offerte — zodat de
    // regels hier altijd optellen tot het getoonde totaal, ook als het
    // algemene arbeidstarief in Instellingen nadien wijzigt.
    arbeid_per_uur: offerte.arbeid_per_uur || t.arbeid_per_uur || 15
  };

  const html = buildOfferteHtml(offerte, klant, ber, ft, haalArtikelen(db, req.params.id), getBedrijfsgegevens(db));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="offerte-${offerte.nummer}.html"`);
  res.send(html);
});

// DELETE offerte — verbreek eerst alle koppelingen
r.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const offerte = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?').get(req.params.id);
    if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });

    // Als er een gekoppelde job is, verwijder die eerst (inclusief zijn koppelingen)
    if (offerte.job_id) {
      db.prepare('UPDATE offertes_v2 SET job_id = NULL WHERE id = ?').run(req.params.id);
      db.prepare('UPDATE jobs SET offerte_id = NULL WHERE id = ?').run(offerte.job_id);
      db.prepare('DELETE FROM job_kosten WHERE job_id = ?').run(offerte.job_id);
      db.prepare('DELETE FROM job_materialen WHERE job_id = ?').run(offerte.job_id);
      db.prepare('DELETE FROM jobs WHERE id = ?').run(offerte.job_id);
    }

    // Verwijder offerte zelf
    db.prepare('DELETE FROM offertes_v2 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
