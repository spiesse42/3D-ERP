import { Router } from 'express';
import { getDb } from '../db.js';
import { sendPdfEmail } from '../email.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
}

function buildPdfHtml(kosten, klant, extraInfo = {}) {
  const nu = new Date().toLocaleDateString('nl-BE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const toon = v => `€${(v||0).toFixed(2)}`;
  const { voorbMin=15, nabMin=10, arbTarief=15, ontwerpMin=0, ontwerpTarief=15,
          nabExtraMin=0, nabExtraTarief=15, extraTotaal=0, extraOmschrijving='',
          aantal=1, matDetails=[], dienstDetails=[], btw=false } = extraInfo;
  const btwBedrag = btw ? (kosten.verkoopprijs||0) * 0.21 : 0;
  const totaalInclBtw = (kosten.verkoopprijs||0) + btwBedrag;

  const margeFactor = 1 + (kosten.winstmarge_pct || 0) / 100;
  const eenheidLabel = e => e === 'stuk' ? 'stuks' : e === 'ml' ? 'ml' : 'g';
  const matRijen = matDetails.map(m => {
    const deler = m.eenheid === 'gram' ? 1000 : 1;
    const aantalTxt = m.eenheid === 'stuk' ? Math.round(m.gram) : m.gram.toFixed(1);
    return `<tr><td>Materiaal — ${m.naam}</td><td>${aantalTxt} ${eenheidLabel(m.eenheid)}</td><td>${toon((m.gram/deler)*m.prijs*margeFactor)}</td></tr>`;
  }).join('');
  const dienstRijen = dienstDetails.map(d => {
    const aantalTxt = d.eenheid === 'stuk' ? Math.round(d.aantal) : d.aantal.toFixed(1);
    return `<tr><td>Dienst — ${d.naam}</td><td>${aantalTxt} ${eenheidLabel(d.eenheid)}</td><td>${toon(d.aantal*d.prijs_per_eenheid*margeFactor)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo{font-size:1.6rem;font-weight:900;color:#5b8dee;letter-spacing:2px}
  .klant{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .klant h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .totaal{background:#0c0c0c;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
  .totaal-bedrag{font-size:2rem;font-weight:900;color:#5b8dee}
  .opmerking{margin-top:18px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
</style></head><body>
<div class="header">
  <div class="logo">▲ 3D PRINT ERP</div>
  <div style="text-align:right;color:#666;font-size:.85rem">
    <div style="font-size:1.1rem;font-weight:bold">WERKBON</div>
    ${kosten.volgnummer ? `<div style="font-family:monospace;font-weight:600">${kosten.volgnummer}</div>` : ''}
    <div>${nu}</div>
    <div>${kosten.printer_naam||''}</div>
  </div>
</div>
${klant ? `<div class="klant"><h3>Klant</h3>
  <p><strong>${klant.voornaam ? klant.voornaam + ' ' : ''}${klant.naam}</strong></p>
  ${klant.straat ? `<p>${klant.straat} ${klant.huisnummer||''}, ${klant.postcode||''} ${klant.gemeente||''}</p>` : ''}
  ${klant.email ? `<p>✉ ${klant.email}</p>` : ''}
  ${klant.btw_nummer ? `<p>BTW: ${klant.btw_nummer}</p>` : ''}
</div>` : ''}
<p style="margin-bottom:16px"><strong>${kosten.type === 'dienst' ? 'Opdracht' : 'Print'}:</strong> ${kosten.job_naam||'—'} &nbsp;|&nbsp; <strong>Aantal:</strong> ${aantal}</p>
<table>
  <thead><tr><th>Post</th><th>Detail</th><th>Bedrag</th></tr></thead>
  <tbody>
    ${kosten.type === 'dienst' ? '' : (matRijen || `<tr><td>Materiaal</td><td>—</td><td>${toon(kosten.materiaal_kost*margeFactor)}</td></tr>`)}
    ${kosten.type === 'dienst' ? '' : `<tr><td>Energie</td><td>${kosten.kwh_verbruikt} kWh</td><td>${toon(kosten.energie_kost*margeFactor)}</td></tr>`}
    ${kosten.machine_kost > 0 ? `<tr><td>Machine</td><td>—</td><td>${toon(kosten.machine_kost*margeFactor)}</td></tr>` : ''}
    ${voorbMin > 0 ? `<tr><td>Voorbereiding</td><td>${voorbMin} min</td><td>${toon((voorbMin/60)*arbTarief*margeFactor)}</td></tr>` : ''}
    ${nabMin > 0 ? `<tr><td>Nabewerking</td><td>${nabMin} min</td><td>${toon((nabMin/60)*arbTarief*margeFactor)}</td></tr>` : ''}
    ${ontwerpMin > 0 ? `<tr><td>Ontwerp regie</td><td>${ontwerpMin} min</td><td>${toon((ontwerpMin/60)*ontwerpTarief*margeFactor)}</td></tr>` : ''}
    ${nabExtraMin > 0 ? `<tr><td>Nabewerking extra</td><td>${nabExtraMin} min</td><td>${toon((nabExtraMin/60)*nabExtraTarief*margeFactor)}</td></tr>` : ''}
    ${kosten.bmcu_slijtage > 0 ? `<tr><td>Multicolor (BMCU)</td><td>—</td><td>${toon(kosten.bmcu_slijtage*margeFactor)}</td></tr>` : ''}
    ${dienstRijen}
    ${extraTotaal > 0 ? `<tr><td>Extra${extraOmschrijving ? ' — '+extraOmschrijving : ''}</td><td>—</td><td>${toon(extraTotaal*margeFactor)}</td></tr>` : ''}
  </tbody>
</table>
<div class="totaal">
  <div style="font-size:.85rem;color:#a0a0a0">VERKOOPPRIJS${aantal > 1 ? ` (${aantal}× — €${((kosten.verkoopprijs||0)/aantal).toFixed(2)}/stuk)` : ''}</div>
  <div class="totaal-bedrag">€${(kosten.verkoopprijs||0).toFixed(2)}</div>
</div>
${btw ? `
<table style="margin-top:12px">
  <tbody>
    <tr><td colspan="2">BTW 21%</td><td>${toon(btwBedrag)}</td></tr>
    <tr style="font-weight:700;font-size:1.05rem"><td colspan="2">Totaal incl. BTW</td><td>€${totaalInclBtw.toFixed(2)}</td></tr>
  </tbody>
</table>` : ''}
${kosten.opmerking ? `<div class="opmerking">📝 ${kosten.opmerking}</div>` : ''}
<div class="footer">3D Print ERP &nbsp;|&nbsp; ${nu} &nbsp;|&nbsp; ${btw ? `BTW 21% inbegrepen &nbsp;|&nbsp; ${klant?.btw_nummer ? 'BTW: '+klant.btw_nummer : ''}` : 'Vrijgesteld van BTW — art. 56bis BTW-wetboek'}</div>
</body></html>`;
}

r.post('/bereken/:jobId', (req, res) => {
  const db = getDb();
  // LEFT JOIN — een 'dienst'-job (consultancy/ontwerp) heeft geen printer_id,
  // en moet dus ook zonder gekoppelde printer een berekening kunnen krijgen.
  const job = db.prepare(`
    SELECT j.*, p.machine_kost_per_uur, p.heeft_bmcu, p.naam as printer_naam
    FROM jobs j LEFT JOIN printers p ON p.id = j.printer_id WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });
  const machineKostPerUur = job.machine_kost_per_uur || 0;

  const t = getTarieven(db);
  const kwh_prijs = t.kwh_prijs || 0.35;
  const arbeid_per_uur = t.arbeid_per_uur || 15;
  const faalfactor_pct = t.faalfactor_pct || 10;
  const bmcu_per_job = t.bmcu_per_job || 0.10;
  const voorbereiding_min_default = t.voorbereiding_min || 15;
  const nabewerking_min_default = t.nabewerking_min || 10;
  const marge_grens_uur = t.marge_grens_uur || 4;
  const marge_klein_pct = t.marge_klein_pct || 18;
  const marge_groot_pct = t.marge_groot_pct || 10;

  const {
    kwh_verbruikt = 0,
    is_multicolor = job.is_multicolor,
    incl_voorbereiding = true,
    incl_nabewerking = true,
    voorbereiding_min = voorbereiding_min_default,
    nabewerking_min = nabewerking_min_default,
    extra_voorbereiding_min = 0,
    ontwerp_min = 0,
    ontwerp_tarief = t.ontwerp_tarief || 15,
    nabewerking_extra_min = 0,
    nabewerking_extra_tarief = t.nabewerking_tarief || 15,
    extra_per_stuk = 0,
    extra_eenmalig = 0,
    extra_omschrijving = '',
    aantal = 1,
    opmerking = '',
    print_uren = null,
  } = req.body;

  const uren = parseFloat(print_uren) || job.print_uren_werkelijk || job.print_uren_geschat || 0;

  if (print_uren != null) {
    try { db.prepare('UPDATE jobs SET print_uren_werkelijk = ? WHERE id = ?').run(parseFloat(print_uren), req.params.jobId); } catch {}
  }

  const materialen = db.prepare(`
    SELECT jm.gram_gebruikt, ft.merk, ft.materiaal, ft.categorie, ft.eenheid, r.kleur, r.id as rol_id,
      COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.jobId);

  const kostPerRegel = m => (m.gram_gebruikt / (m.eenheid === 'gram' ? 1000 : 1)) * m.prijs_per_kg_effectief;

  const filament_kost = materialen
    .filter(m => m.categorie === 'filament')
    .reduce((sum, m) => sum + kostPerRegel(m), 0) * (1 + faalfactor_pct / 100);

  const artikel_kost = materialen
    .filter(m => m.categorie !== 'filament')
    .reduce((sum, m) => sum + kostPerRegel(m), 0);

  const materiaal_kost = filament_kost + artikel_kost;

  const diensten = db.prepare(`
    SELECT jd.aantal, jd.prijs_per_eenheid
    FROM job_diensten jd
    WHERE jd.job_id = ?
  `).all(req.params.jobId);
  const diensten_kost = diensten.reduce((sum, d) => sum + d.aantal * d.prijs_per_eenheid, 0);

  const energie_kost = parseFloat(kwh_verbruikt) * kwh_prijs;
  const machine_kost = uren * machineKostPerUur;
  const bmcu_slijtage = (is_multicolor && job.heeft_bmcu) ? bmcu_per_job : 0;

  // Voorbereiding/nabewerking — waarden komen uit de modal (incl. eventuele extra)
  const totale_voorb_min = parseFloat(voorbereiding_min) || 0;
  const arbeid_voorbereiding = (totale_voorb_min / 60) * arbeid_per_uur;
  const arbeid_nabewerking = (parseFloat(nabewerking_min) || 0) / 60 * arbeid_per_uur;
  const arbeid_ontwerp = (parseFloat(ontwerp_min) / 60) * parseFloat(ontwerp_tarief);
  const arbeid_nabewerking_extra = (parseFloat(nabewerking_extra_min) / 60) * parseFloat(nabewerking_extra_tarief);
  const arbeid_totaal = arbeid_voorbereiding + arbeid_nabewerking + arbeid_ontwerp + arbeid_nabewerking_extra;

  const extra_totaal = (parseFloat(extra_per_stuk) * parseInt(aantal)) + parseFloat(extra_eenmalig);
  const subtotaal = materiaal_kost + energie_kost + machine_kost + bmcu_slijtage + arbeid_totaal + extra_totaal + diensten_kost;
  const marge_pct = uren >= marge_grens_uur ? marge_groot_pct : marge_klein_pct;
  const verkoopprijs = subtotaal * (1 + marge_pct / 100);

  const ro = v => Math.round(v * 1000) / 1000;
  const kosten = {
    job_id: parseInt(req.params.jobId),
    materiaal_kost: ro(materiaal_kost), filament_kost: ro(filament_kost), artikel_kost: ro(artikel_kost), diensten_kost: ro(diensten_kost), energie_kost: ro(energie_kost),
    machine_kost: ro(machine_kost), bmcu_slijtage: ro(bmcu_slijtage),
    arbeid_kost: ro(arbeid_totaal), arbeid_voorbereiding: ro(arbeid_voorbereiding),
    arbeid_nabewerking: ro(arbeid_nabewerking), arbeid_ontwerp: ro(arbeid_ontwerp),
    extra_totaal: ro(extra_totaal), faalfactor_pct, winstmarge_pct: marge_pct,
    totaal_kost: ro(subtotaal), verkoopprijs: Math.round(verkoopprijs * 100) / 100,
    kwh_verbruikt: parseFloat(kwh_verbruikt), aantal: parseInt(aantal) || 1,
    extra_per_stuk: parseFloat(extra_per_stuk) || 0, extra_eenmalig: parseFloat(extra_eenmalig) || 0,
    extra_omschrijving, voorbereiding_min: totale_voorb_min, nabewerking_min: parseFloat(nabewerking_min) || 0,
    ontwerp_min: parseFloat(ontwerp_min) || 0, ontwerp_tarief: parseFloat(ontwerp_tarief) || 15,
    nabewerking_extra_min: parseFloat(nabewerking_extra_min) || 0, nabewerking_extra_tarief: parseFloat(nabewerking_extra_tarief) || 15,
    opmerking, printer_naam: job.printer_naam, job_naam: job.naam,
  };

  db.prepare(`
    INSERT INTO job_kosten
      (job_id,materiaal_kost,energie_kost,machine_kost,arbeid_kost,bmcu_slijtage,
       faalfactor_pct,winstmarge_pct,totaal_kost,verkoopprijs,kwh_verbruikt,
       aantal,extra_per_stuk,extra_eenmalig,extra_omschrijving,
       voorbereiding_min,nabewerking_min,ontwerp_min,ontwerp_tarief,
       nabewerking_extra_min,nabewerking_extra_tarief,diensten_kost,berekend_op)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      materiaal_kost=excluded.materiaal_kost,energie_kost=excluded.energie_kost,
      machine_kost=excluded.machine_kost,arbeid_kost=excluded.arbeid_kost,
      bmcu_slijtage=excluded.bmcu_slijtage,faalfactor_pct=excluded.faalfactor_pct,
      winstmarge_pct=excluded.winstmarge_pct,totaal_kost=excluded.totaal_kost,
      verkoopprijs=excluded.verkoopprijs,kwh_verbruikt=excluded.kwh_verbruikt,
      aantal=excluded.aantal,extra_per_stuk=excluded.extra_per_stuk,
      extra_eenmalig=excluded.extra_eenmalig,extra_omschrijving=excluded.extra_omschrijving,
      voorbereiding_min=excluded.voorbereiding_min,nabewerking_min=excluded.nabewerking_min,
      ontwerp_min=excluded.ontwerp_min,ontwerp_tarief=excluded.ontwerp_tarief,
      nabewerking_extra_min=excluded.nabewerking_extra_min,nabewerking_extra_tarief=excluded.nabewerking_extra_tarief,
      diensten_kost=excluded.diensten_kost,
      berekend_op=datetime('now')
  `).run(kosten.job_id, kosten.materiaal_kost, kosten.energie_kost, kosten.machine_kost,
         kosten.arbeid_kost, kosten.bmcu_slijtage, kosten.faalfactor_pct, kosten.winstmarge_pct,
         kosten.totaal_kost, kosten.verkoopprijs, kosten.kwh_verbruikt,
         kosten.aantal, kosten.extra_per_stuk, kosten.extra_eenmalig, kosten.extra_omschrijving,
         kosten.voorbereiding_min, kosten.nabewerking_min, kosten.ontwerp_min, kosten.ontwerp_tarief,
         kosten.nabewerking_extra_min, kosten.nabewerking_extra_tarief, kosten.diensten_kost);

  if (opmerking) db.prepare('UPDATE jobs SET notities = ? WHERE id = ?').run(opmerking, req.params.jobId);

  res.json(kosten);
});

r.get('/job/:jobId', (req, res) => {
  const k = getDb().prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!k) return res.status(404).json({ error: 'Geen kostprijsberekening' });
  res.json(k);
});

r.get('/pdf/:jobId', (req, res) => {
  const db = getDb();
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!kosten) return res.status(404).json({ error: 'Geen berekening' });
  const job = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam, k.email, k.straat, k.huisnummer,
      k.postcode, k.gemeente, k.btw_nummer, p.naam as printer_naam
    FROM jobs j LEFT JOIN klanten k ON k.id = j.klant_id LEFT JOIN printers p ON p.id = j.printer_id WHERE j.id = ?
  `).get(req.params.jobId);

  const klant = job?.klant_id ? { naam:job.klant_naam, voornaam:job.voornaam, email:job.email,
    straat:job.straat, huisnummer:job.huisnummer, postcode:job.postcode, gemeente:job.gemeente, btw_nummer:job.btw_nummer } : null;

  const t = getTarieven(db);
  const volledigeKosten = { ...kosten, job_naam:job?.naam, printer_naam:job?.printer_naam, opmerking:job?.notities||'', volgnummer:job?.volgnummer||'', type:job?.type||'print', dienst_categorie:job?.dienst_categorie||'' };
  const klantType = job?.klant_id ? db.prepare('SELECT type FROM klanten WHERE id = ?').get(job.klant_id)?.type : null;
  const btwParam = req.query.btw;
  const btw = btwParam != null ? btwParam === '1' || btwParam === 'true' : klantType === 'zakelijk';
  const extraInfo = {
    voorbMin: kosten.voorbereiding_min ?? (t.voorbereiding_min||15),
    nabMin: kosten.nabewerking_min ?? (t.nabewerking_min||10),
    arbTarief: t.arbeid_per_uur||15,
    ontwerpMin: kosten.ontwerp_min || 0,
    ontwerpTarief: kosten.ontwerp_tarief || t.ontwerp_tarief || 15,
    nabExtraMin: kosten.nabewerking_extra_min || 0,
    nabExtraTarief: kosten.nabewerking_extra_tarief || t.nabewerking_tarief || 15,
    extraTotaal: (parseFloat(kosten.extra_per_stuk)||0) * (parseInt(kosten.aantal)||1) + (parseFloat(kosten.extra_eenmalig)||0),
    extraOmschrijving: kosten.extra_omschrijving || '',
    aantal: parseInt(req.query.aantal) || kosten.aantal || 1,
    btw,
    matDetails: db.prepare(`
      SELECT jm.gram_gebruikt as gram, ft.eenheid,
        COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END), ft.inkoop_prijs_per_kg) as prijs,
        ft.merk || ' ' || ft.materiaal || COALESCE(' ' || r.kleur, '') as naam
      FROM job_materialen jm JOIN filament_rollen r ON r.id = jm.filament_rol_id
      JOIN filament_types ft ON ft.id = r.filament_type_id WHERE jm.job_id = ?
    `).all(req.params.jobId),
    dienstDetails: db.prepare(`
      SELECT jd.aantal, jd.prijs_per_eenheid, ft.eenheid,
        ft.merk || ' ' || ft.materiaal as naam
      FROM job_diensten jd JOIN filament_types ft ON ft.id = jd.filament_type_id
      WHERE jd.job_id = ?
    `).all(req.params.jobId),
  };

  const html = buildPdfHtml(volledigeKosten, klant, extraInfo);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="werkbon-${(job?.naam||'print').replace(/\s+/g,'-')}.html"`);
  res.send(html);
});

r.post('/email/:jobId', async (req, res) => {
  const db = getDb();
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!kosten) return res.status(404).json({ error: 'Geen berekening' });
  const job = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam, k.email, k.straat, k.huisnummer,
      k.postcode, k.gemeente, k.btw_nummer, p.naam as printer_naam
    FROM jobs j LEFT JOIN klanten k ON k.id = j.klant_id LEFT JOIN printers p ON p.id = j.printer_id WHERE j.id = ?
  `).get(req.params.jobId);
  const { to, extra_velden = {} } = req.body;
  const emailTo = to || job?.email || process.env.SMTP_FROM;
  const t = getTarieven(db);
  const klant = job?.klant_id ? { naam:job.klant_naam, voornaam:job.voornaam, email:job.email, straat:job.straat, huisnummer:job.huisnummer, postcode:job.postcode, gemeente:job.gemeente, btw_nummer:job.btw_nummer } : null;
  const volledigeKosten = { ...kosten, job_naam:job?.naam, printer_naam:job?.printer_naam, opmerking:job?.notities||'', volgnummer:job?.volgnummer||'', type:job?.type||'print', dienst_categorie:job?.dienst_categorie||'' };
  const klantTypeEmail = job?.klant_id ? db.prepare('SELECT type FROM klanten WHERE id = ?').get(job.klant_id)?.type : null;
  const btwEmail = extra_velden.btw != null ? !!extra_velden.btw : klantTypeEmail === 'zakelijk';
  const btwBedragEmail = btwEmail ? (kosten.verkoopprijs||0) * 0.21 : 0;
  const extraInfo = {
    voorbMin: kosten.voorbereiding_min ?? (t.voorbereiding_min||15),
    nabMin: kosten.nabewerking_min ?? (t.nabewerking_min||10),
    arbTarief: t.arbeid_per_uur||15,
    ontwerpMin: kosten.ontwerp_min || 0,
    ontwerpTarief: kosten.ontwerp_tarief || t.ontwerp_tarief || 15,
    nabExtraMin: kosten.nabewerking_extra_min || 0,
    nabExtraTarief: kosten.nabewerking_extra_tarief || t.nabewerking_tarief || 15,
    extraTotaal: (parseFloat(kosten.extra_per_stuk)||0) * (parseInt(extra_velden.aantal || kosten.aantal)||1) + (parseFloat(kosten.extra_eenmalig)||0),
    extraOmschrijving: kosten.extra_omschrijving || '',
    aantal: extra_velden.aantal || kosten.aantal || 1,
    btw: btwEmail,
    matDetails: db.prepare(`SELECT jm.gram_gebruikt as gram, ft.eenheid, COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END), ft.inkoop_prijs_per_kg) as prijs, ft.merk || ' ' || ft.materiaal || COALESCE(' ' || r.kleur, '') as naam FROM job_materialen jm JOIN filament_rollen r ON r.id = jm.filament_rol_id JOIN filament_types ft ON ft.id = r.filament_type_id WHERE jm.job_id = ?`).all(req.params.jobId),
    dienstDetails: db.prepare(`SELECT jd.aantal, jd.prijs_per_eenheid, ft.eenheid, ft.merk || ' ' || ft.materiaal as naam FROM job_diensten jd JOIN filament_types ft ON ft.id = jd.filament_type_id WHERE jd.job_id = ?`).all(req.params.jobId),
  };
  const pdfHtml = buildPdfHtml(volledigeKosten, klant, extraInfo);
  try {
    await sendPdfEmail({ to: emailTo, subject: `Werkbon — ${job?.naam||'print'}`,
      html: `<p>Beste${klant ? ` ${klant.voornaam||''} ${klant.naam}` : ''},</p><p>Hierbij de werkbon voor <strong>${job?.naam||'uw print'}</strong>.</p><p>Verkoopprijs: <strong>€${(kosten.verkoopprijs||0).toFixed(2)}</strong>${btwEmail ? `<br>BTW 21%: <strong>€${btwBedragEmail.toFixed(2)}</strong><br>Totaal incl. BTW: <strong>€${((kosten.verkoopprijs||0)+btwBedragEmail).toFixed(2)}</strong>` : ''}</p><p>Met vriendelijke groeten,<br>3D Print ERP</p>`,
      pdfHtml, filename: `werkbon-${(job?.naam||'print').replace(/\s+/g,'-')}.html` });
    res.json({ ok: true, to: emailTo });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
