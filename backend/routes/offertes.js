import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
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
  } = data;

  const arbeid_per_uur = t.arbeid_per_uur || 15;
  const kwh_prijs = t.kwh_prijs || 0.35;
  const faalfactor = 1 + (t.faalfactor_pct || 10) / 100;
  const bmcu = is_multicolor ? (t.bmcu_per_job || 0.10) : 0;

  const totale_tijd_u = parseInt(geschatte_tijd_u) + parseInt(geschatte_tijd_min) / 60;

  // Materiaal
  const materiaal_kost = (parseFloat(geschat_gewicht_g) / 1000) * parseFloat(filament_prijs_per_kg) * faalfactor * parseInt(aantal);

  // Energie (schatting op basis van wattage)
  const kwh_schat = (printer_watt / 1000) * totale_tijd_u * parseInt(aantal);
  const energie_kost_schat = kwh_schat * kwh_prijs;

  // Machine (intern)
  const machine_kost = totale_tijd_u * (t.machine_per_uur || 0.13) * parseInt(aantal);

  // Arbeid
  const totale_voorb = parseInt(voorbereiding_min);
  const totale_nab = parseInt(nabewerking_min);
  const arbeid_kost = ((totale_voorb + totale_nab) / 60 * arbeid_per_uur)
    + (parseInt(ontwerp_min) / 60 * parseFloat(ontwerp_tarief))
    + (parseInt(nabewerking_extra_min) / 60 * parseFloat(nabewerking_extra_tarief));

  // Extra
  const extra_totaal = parseFloat(extra_per_stuk) * parseInt(aantal) + parseFloat(extra_eenmalig);

  const subtotaal = materiaal_kost + energie_kost_schat + machine_kost + arbeid_kost + extra_totaal + bmcu;

  // Marge
  const marge_grens = t.marge_grens_uur || 4;
  const marge_pct = totale_tijd_u >= marge_grens ? (t.marge_groot_pct || 10) : (t.marge_klein_pct || 18);
  const verkoopprijs = subtotaal * (1 + marge_pct / 100);

  return {
    materiaal_kost: Math.round(materiaal_kost * 1000) / 1000,
    energie_kost_schat: Math.round(energie_kost_schat * 1000) / 1000,
    machine_kost: Math.round(machine_kost * 1000) / 1000,
    arbeid_kost: Math.round(arbeid_kost * 1000) / 1000,
    extra_totaal: Math.round(extra_totaal * 1000) / 1000,
    subtotaal: Math.round(subtotaal * 1000) / 1000,
    marge_pct,
    verkoopprijs: Math.round(verkoopprijs * 100) / 100,
  };
}

function buildOfferteHtml(offerte, klant, berekening, filamentType, printer) {
  const nu = new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const totaleUren = (offerte.geschatte_tijd_u || 0) + (offerte.geschatte_tijd_min || 0) / 60;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo{font-size:1.6rem;font-weight:900;color:#5b8dee;letter-spacing:2px}
  .doc-nr{font-size:1.1rem;font-weight:bold}
  .klant{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .klant h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:20px;font-size:.9rem}
  .info-item{padding:6px 0;border-bottom:1px solid #eee}
  .info-label{font-size:.75rem;color:#666;margin-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .totaal{background:#0c0c0c;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
  .totaal-label{color:#a0a0a0;font-size:.85rem}
  .totaal-bedrag{font-size:2rem;font-weight:900;color:#5b8dee}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
  .tag{font-size:.72rem;color:#5b8dee;background:#eff6ff;padding:2px 7px;border-radius:4px;margin-left:6px}
  .opmerking{margin-top:16px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
  .schatting{font-size:.72rem;color:#999;font-style:italic}
</style>
</head>
<body>
<div class="header">
  <div class="logo">▲ 3D PRINT ERP</div>
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

<div class="info-grid">
  <div class="info-item">
    <div class="info-label">Object</div>
    <div>${offerte.object_naam || '—'}${offerte.object_link ? ` <a href="${offerte.object_link}" style="color:#5b8dee;font-size:.8rem">(link)</a>` : ''}</div>
  </div>
  <div class="info-item">
    <div class="info-label">Printer</div>
    <div>${printer?.naam || '—'}</div>
  </div>
  <div class="info-item">
    <div class="info-label">Filament</div>
    <div>${filamentType ? `${filamentType.merk} ${filamentType.materiaal}` : '—'}</div>
  </div>
  <div class="info-item">
    <div class="info-label">Geschatte printtijd</div>
    <div>${offerte.geschatte_tijd_u || 0}u ${offerte.geschatte_tijd_min || 0}min</div>
  </div>
  <div class="info-item">
    <div class="info-label">Gewicht (slicer)</div>
    <div>${offerte.geschat_gewicht_g || 0}g ${offerte.is_multicolor ? '<span class="tag">multicolor</span>' : ''}</div>
  </div>
  <div class="info-item">
    <div class="info-label">Aantal</div>
    <div>${offerte.aantal || 1} stuk(s)</div>
  </div>
</div>

<table>
  <thead><tr><th>Post</th><th>Detail</th><th>Bedrag</th></tr></thead>
  <tbody>
    <tr><td>Materiaal <span class="schatting">(incl. faalfactor)</span></td><td>${offerte.geschat_gewicht_g}g × ${offerte.aantal}x</td><td>€${berekening.materiaal_kost.toFixed(2)}</td></tr>
    <tr><td>Energie <span class="schatting">(schatting)</span></td><td>${totaleUren.toFixed(2)}u × ${offerte.aantal}x</td><td>€${berekening.energie_kost_schat.toFixed(2)}</td></tr>
    <tr><td>Voorbereiding</td><td>${offerte.voorbereiding_min} min</td><td>€${((offerte.voorbereiding_min / 60) * (berekening.arbeid_per_uur || 15)).toFixed(2)}</td></tr>
    <tr><td>Nabewerking</td><td>${offerte.nabewerking_min} min</td><td>€${((offerte.nabewerking_min / 60) * (berekening.arbeid_per_uur || 15)).toFixed(2)}</td></tr>
    ${offerte.ontwerp_min > 0 ? `<tr><td>Ontwerp regie</td><td>${offerte.ontwerp_min} min</td><td>€${((offerte.ontwerp_min / 60) * offerte.ontwerp_tarief).toFixed(2)}</td></tr>` : ''}
    ${offerte.nabewerking_extra_min > 0 ? `<tr><td>Nabewerking extra</td><td>${offerte.nabewerking_extra_min} min</td><td>€${((offerte.nabewerking_extra_min / 60) * offerte.nabewerking_extra_tarief).toFixed(2)}</td></tr>` : ''}
    ${berekening.extra_totaal > 0 ? `<tr><td>Extra${offerte.extra_omschrijving ? ' — ' + offerte.extra_omschrijving : ''}</td><td>—</td><td>€${berekening.extra_totaal.toFixed(2)}</td></tr>` : ''}
    <tr style="font-weight:600"><td colspan="2">Subtotaal</td><td>€${berekening.subtotaal.toFixed(2)}</td></tr>
    <tr><td colspan="2">Winstmarge (${berekening.marge_pct}%)</td><td>€${(berekening.verkoopprijs - berekening.subtotaal).toFixed(2)}</td></tr>
  </tbody>
</table>

<div class="totaal">
  <div>
    <div class="totaal-label">VERKOOPPRIJS ${offerte.aantal > 1 ? `(${offerte.aantal}× — €${(berekening.verkoopprijs / offerte.aantal).toFixed(2)}/stuk)` : '(schatting)'}</div>
  </div>
  <div class="totaal-bedrag">€${berekening.verkoopprijs.toFixed(2)}</div>
</div>

${offerte.notities ? `<div class="opmerking">📝 ${offerte.notities}</div>` : ''}
<div class="footer">Offerte ${offerte.nummer} &nbsp;|&nbsp; ${nu} &nbsp;|&nbsp; Geldig ${offerte.geldig_tot || '30 dagen'} &nbsp;|&nbsp; Vrijgesteld van BTW — art. 56bis BTW-wetboek</div>
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
      ft.inkoop_prijs_per_kg
    FROM offertes_v2 o
    JOIN klanten k ON k.id = o.klant_id
    LEFT JOIN printers p ON p.id = o.printer_id
    LEFT JOIN filament_types ft ON ft.id = o.filament_type_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(offerte);
});

// POST nieuwe offerte
r.post('/', (req, res) => {
  const db = getDb();
  const t = getTarieven(db);
  const {
    klant_id, object_naam, object_link, printer_id, filament_type_id,
    geschat_gewicht_g, geschatte_tijd_u = 0, geschatte_tijd_min = 0,
    voorbereiding_min, nabewerking_min, ontwerp_min = 0, ontwerp_tarief,
    nabewerking_extra_min = 0, nabewerking_extra_tarief,
    is_multicolor = 0, extra_per_stuk = 0, extra_eenmalig = 0,
    extra_omschrijving, aantal = 1, btw_pct = 21, geldig_tot, notities,
  } = req.body;

  if (!klant_id) return res.status(400).json({ error: 'Klant is verplicht' });

  // Filamentprijs ophalen
  let filament_prijs_per_kg = 0;
  if (filament_type_id) {
    const ft = db.prepare('SELECT inkoop_prijs_per_kg FROM filament_types WHERE id = ?').get(filament_type_id);
    filament_prijs_per_kg = ft?.inkoop_prijs_per_kg || 0;
  }

  // Printer wattage
  let printer_watt = 120;
  if (printer_id) {
    const p = db.prepare('SELECT naam FROM printers WHERE id = ?').get(printer_id);
    printer_watt = p?.naam?.toLowerCase().includes('ender') ? (t.ender_watt || 150) : (t.bambu_watt || 120);
  }

  const berData = {
    geschat_gewicht_g: parseFloat(geschat_gewicht_g) || 0,
    geschatte_tijd_u: parseInt(geschatte_tijd_u) || 0,
    geschatte_tijd_min: parseInt(geschatte_tijd_min) || 0,
    voorbereiding_min: parseInt(voorbereiding_min) || (t.voorbereiding_min || 15),
    nabewerking_min: parseInt(nabewerking_min) || (t.nabewerking_min || 10),
    ontwerp_min: parseInt(ontwerp_min) || 0,
    ontwerp_tarief: parseFloat(ontwerp_tarief) || (t.ontwerp_tarief || 15),
    nabewerking_extra_min: parseInt(nabewerking_extra_min) || 0,
    nabewerking_extra_tarief: parseFloat(nabewerking_extra_tarief) || (t.nabewerking_tarief || 15),
    is_multicolor: parseInt(is_multicolor) || 0,
    extra_per_stuk: parseFloat(extra_per_stuk) || 0,
    extra_eenmalig: parseFloat(extra_eenmalig) || 0,
    aantal: parseInt(aantal) || 1,
    filament_prijs_per_kg,
    printer_watt,
  };

  const ber = berekenOfferte(berData, t);
  const btw_bedrag = Math.round(ber.verkoopprijs * btw_pct) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;
  const nummer = nextNummer(db);

  const result = db.prepare(`
    INSERT INTO offertes_v2 (
      klant_id, nummer, object_naam, object_link, printer_id, filament_type_id,
      geschat_gewicht_g, geschatte_tijd_u, geschatte_tijd_min,
      voorbereiding_min, nabewerking_min, ontwerp_min, ontwerp_tarief,
      nabewerking_extra_min, nabewerking_extra_tarief, is_multicolor,
      extra_per_stuk, extra_eenmalig, extra_omschrijving, aantal,
      materiaal_kost, energie_kost_schat, arbeid_kost, machine_kost, extra_totaal,
      subtotaal, marge_pct, verkoopprijs, btw_pct, btw_bedrag, totaal,
      geldig_tot, notities
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    klant_id, nummer, object_naam||null, object_link||null, printer_id||null, filament_type_id||null,
    berData.geschat_gewicht_g, berData.geschatte_tijd_u, berData.geschatte_tijd_min,
    berData.voorbereiding_min, berData.nabewerking_min, berData.ontwerp_min, berData.ontwerp_tarief,
    berData.nabewerking_extra_min, berData.nabewerking_extra_tarief, berData.is_multicolor,
    berData.extra_per_stuk, berData.extra_eenmalig, extra_omschrijving||null, berData.aantal,
    ber.materiaal_kost, ber.energie_kost_schat, ber.arbeid_kost, ber.machine_kost, ber.extra_totaal,
    ber.subtotaal, ber.marge_pct, ber.verkoopprijs, btw_pct, btw_bedrag, totaal,
    geldig_tot||null, notities||null
  );

  res.status(201).json({ id: result.lastInsertRowid, nummer, ...ber });
});

// PATCH status
r.patch('/:id/status', (req, res) => {
  getDb().prepare('UPDATE offertes_v2 SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// POST maak werkbon job van offerte
r.post('/:id/maak-job', (req, res) => {
  const db = getDb();
  const offerte = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?').get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });
  if (!offerte.printer_id) return res.status(400).json({ error: 'Offerte heeft geen printer — bewerk de offerte eerst' });

  const totaleUren = (offerte.geschatte_tijd_u || 0) + (offerte.geschatte_tijd_min || 0) / 60;

  const result = db.prepare(`
    INSERT INTO jobs (klant_id, printer_id, naam, status, print_uren_geschat, is_multicolor, notities, offerte_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    offerte.klant_id, offerte.printer_id,
    offerte.object_naam || `Job van offerte ${offerte.nummer}`,
    'gepland', totaleUren, offerte.is_multicolor,
    `Werkbon van offerte ${offerte.nummer}`, offerte.id
  );

  // Koppel job aan offerte
  db.prepare('UPDATE offertes_v2 SET job_id = ?, status = ? WHERE id = ?')
    .run(result.lastInsertRowid, 'goedgekeurd', offerte.id);

  res.status(201).json({ job_id: result.lastInsertRowid });
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
  const printer = offerte.printer_id ? db.prepare('SELECT naam FROM printers WHERE id = ?').get(offerte.printer_id) : null;
  const ft = offerte.filament_type_id ? db.prepare('SELECT * FROM filament_types WHERE id = ?').get(offerte.filament_type_id) : null;
  const t = getTarieven(db);
  const ber = { materiaal_kost: offerte.materiaal_kost, energie_kost_schat: offerte.energie_kost_schat,
    arbeid_kost: offerte.arbeid_kost, machine_kost: offerte.machine_kost, extra_totaal: offerte.extra_totaal,
    subtotaal: offerte.subtotaal, marge_pct: offerte.marge_pct, verkoopprijs: offerte.verkoopprijs,
    arbeid_per_uur: t.arbeid_per_uur || 15 };

  const html = buildOfferteHtml(offerte, klant, ber, ft, printer);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="offerte-${offerte.nummer}.html"`);
  res.send(html);
});

// DELETE
r.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM offertes_v2 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
