import { Router } from 'express';
import { getDb } from '../db.js';
import { sendPdfEmail } from '../email.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
}

// Bereken kostprijs met volledige v2 logica
r.post('/bereken/:jobId', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, p.machine_kost_per_uur, p.heeft_bmcu, p.naam as printer_naam
    FROM jobs j JOIN printers p ON p.id = j.printer_id
    WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });

  const t = getTarieven(db);
  const {
    kwh_prijs = 0.35,
    arbeid_per_uur = 15,
    faalfactor_pct = 10,
    winstmarge_pct = 10,
    bmcu_per_job = 0.10,
    marge_grens_uur = 4,
    marge_klein_pct = 18,
    marge_groot_pct = 10,
    voorbereiding_min = 15,
    nabewerking_min = 10,
  } = t;

  const {
    kwh_verbruikt = 0,
    ontwerp_min = 0,
    ontwerp_tarief = 15,
    nabewerking_extra_min = 0,
    nabewerking_extra_tarief = 15,
    extra_per_stuk = 0,
    extra_eenmalig = 0,
    aantal = 1,
    opmerking = '',
  } = req.body;

  const materialen = db.prepare(`
    SELECT jm.gram_gebruikt, ft.inkoop_prijs_per_kg
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.jobId);

  const uren = job.print_uren_werkelijk || job.print_uren_geschat || 0;

  // Materiaalkost
  const materiaal_kost = materialen.reduce((sum, m) =>
    sum + (m.gram_gebruikt / 1000) * m.inkoop_prijs_per_kg, 0) * (1 + faalfactor_pct / 100);

  // Energiekost
  const energie_kost = kwh_verbruikt * kwh_prijs;

  // Machinekost (intern, niet getoond)
  const machine_kost = uren * job.machine_kost_per_uur;

  // BMCU (intern, niet getoond)
  const bmcu_slijtage = (job.is_multicolor && job.heeft_bmcu) ? bmcu_per_job : 0;

  // Arbeid standaard voorbereiding + nabewerking
  const arbeid_voorbereiding = (voorbereiding_min / 60) * arbeid_per_uur;
  const arbeid_nabewerking = (nabewerking_min / 60) * arbeid_per_uur;

  // Arbeid regie (ontwerp + extra nabewerking)
  const arbeid_ontwerp = (ontwerp_min / 60) * ontwerp_tarief;
  const arbeid_nabewerking_extra = (nabewerking_extra_min / 60) * nabewerking_extra_tarief;

  const arbeid_totaal = arbeid_voorbereiding + arbeid_nabewerking + arbeid_ontwerp + arbeid_nabewerking_extra;

  // Extra kosten
  const extra_totaal = (extra_per_stuk * aantal) + extra_eenmalig;

  // Subtotaal voor marge
  const subtotaal = (materiaal_kost + energie_kost + machine_kost + bmcu_slijtage + arbeid_totaal + extra_totaal);

  // Marge automatisch op basis van printuren
  const marge_pct = uren >= marge_grens_uur ? marge_groot_pct : marge_klein_pct;
  const verkoopprijs = subtotaal * (1 + marge_pct / 100);

  const kosten = {
    job_id:                   parseInt(req.params.jobId),
    materiaal_kost:           Math.round(materiaal_kost * 1000) / 1000,
    energie_kost:             Math.round(energie_kost * 1000) / 1000,
    machine_kost:             Math.round(machine_kost * 1000) / 1000,
    bmcu_slijtage:            Math.round(bmcu_slijtage * 1000) / 1000,
    arbeid_voorbereiding:     Math.round(arbeid_voorbereiding * 1000) / 1000,
    arbeid_nabewerking:       Math.round(arbeid_nabewerking * 1000) / 1000,
    arbeid_ontwerp:           Math.round(arbeid_ontwerp * 1000) / 1000,
    arbeid_nabewerking_extra: Math.round(arbeid_nabewerking_extra * 1000) / 1000,
    arbeid_totaal:            Math.round(arbeid_totaal * 1000) / 1000,
    extra_per_stuk:           extra_per_stuk,
    extra_eenmalig:           extra_eenmalig,
    extra_totaal:             Math.round(extra_totaal * 1000) / 1000,
    faalfactor_pct,
    marge_pct,
    totaal_kost:              Math.round(subtotaal * 1000) / 1000,
    verkoopprijs:             Math.round(verkoopprijs * 100) / 100,
    kwh_verbruikt,
    aantal,
    opmerking,
    printer_naam:             job.printer_naam,
    job_naam:                 job.naam,
  };

  // Opslaan in db
  db.prepare(`
    INSERT INTO job_kosten
      (job_id, materiaal_kost, energie_kost, machine_kost, arbeid_kost, bmcu_slijtage,
       faalfactor_pct, winstmarge_pct, totaal_kost, verkoopprijs, kwh_verbruikt, berekend_op)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      materiaal_kost=excluded.materiaal_kost, energie_kost=excluded.energie_kost,
      machine_kost=excluded.machine_kost, arbeid_kost=excluded.arbeid_kost,
      bmcu_slijtage=excluded.bmcu_slijtage, faalfactor_pct=excluded.faalfactor_pct,
      winstmarge_pct=excluded.winstmarge_pct, totaal_kost=excluded.totaal_kost,
      verkoopprijs=excluded.verkoopprijs, kwh_verbruikt=excluded.kwh_verbruikt,
      berekend_op=datetime('now')
  `).run(
    kosten.job_id, kosten.materiaal_kost, kosten.energie_kost, kosten.machine_kost,
    kosten.arbeid_totaal, kosten.bmcu_slijtage, kosten.faalfactor_pct, kosten.marge_pct,
    kosten.totaal_kost, kosten.verkoopprijs, kosten.kwh_verbruikt
  );

  // Opmerking opslaan op job
  if (opmerking) {
    db.prepare('UPDATE jobs SET notities = ? WHERE id = ?').run(opmerking, req.params.jobId);
  }

  res.json(kosten);
});

r.get('/job/:jobId', (req, res) => {
  const k = getDb().prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!k) return res.status(404).json({ error: 'Geen kostprijsberekening gevonden' });
  res.json(k);
});

// PDF HTML genereren
function buildPdfHtml(kosten, klant) {
  const nu = new Date().toLocaleDateString('nl-BE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const toon = (v) => `€${(v||0).toFixed(2)}`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a1a; margin: 0; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #5b8dee; padding-bottom: 20px; margin-bottom: 28px; }
  .logo { font-size: 1.6rem; font-weight: 900; color: #5b8dee; letter-spacing: 2px; }
  .doc-info { text-align: right; color: #666; font-size: 0.85rem; }
  .doc-info .nr { font-size: 1.1rem; font-weight: bold; color: #1a1a1a; }
  .klant-box { background: #f8f9fa; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
  .klant-box h3 { margin: 0 0 6px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: #5b8dee; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #5b8dee; color: #fff; padding: 9px 12px; text-align: left; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; }
  td { padding: 9px 12px; border-bottom: 1px solid #eee; font-size: 0.88rem; }
  tr:nth-child(even) td { background: #f8f9fa; }
  .totaal-box { background: #0c0c0c; color: #fff; border-radius: 8px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; }
  .totaal-label { font-size: 0.85rem; color: #a0a0a0; }
  .totaal-bedrag { font-size: 2rem; font-weight: 900; color: #5b8dee; }
  .opmerking { margin-top: 18px; padding: 12px 16px; border-left: 4px solid #f59e0b; background: #fffbeb; border-radius: 4px; font-size: 0.88rem; color: #664400; }
  .footer { margin-top: 32px; border-top: 1px solid #eee; padding-top: 14px; font-size: 0.72rem; color: #999; text-align: center; }
  .tag { display: inline-block; background: #eff6ff; color: #5b8dee; border-radius: 4px; padding: 2px 7px; font-size: 0.75rem; font-weight: 600; margin-left: 6px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">▲ 3D PRINT ERP</div>
  <div class="doc-info">
    <div class="nr">KOSTPRIJSBEREKENING</div>
    <div>${nu}</div>
    <div>${kosten.printer_naam || ''}</div>
  </div>
</div>

${klant ? `<div class="klant-box"><h3>Klant</h3><p><strong>${klant.naam}</strong></p>${klant.email ? `<p>✉ ${klant.email}</p>` : ''}${klant.adres ? `<p>📍 ${klant.adres}</p>` : ''}${klant.btw_nummer ? `<p>BTW: ${klant.btw_nummer}</p>` : ''}</div>` : ''}

<p style="margin-bottom:16px;"><strong>Print:</strong> ${kosten.job_naam || '—'} &nbsp;|&nbsp; <strong>Aantal:</strong> ${kosten.aantal || 1}</p>

<table>
  <thead><tr><th>Post</th><th>Bedrag</th></tr></thead>
  <tbody>
    <tr><td>Materiaal <span class="tag">incl. ${kosten.faalfactor_pct}% faal</span></td><td>${toon(kosten.materiaal_kost)}</td></tr>
    <tr><td>Energie</td><td>${toon(kosten.energie_kost)}</td></tr>
    <tr><td>Voorbereiding (standaard)</td><td>${toon(kosten.arbeid_voorbereiding)}</td></tr>
    <tr><td>Nabewerking (standaard)</td><td>${toon(kosten.arbeid_nabewerking)}</td></tr>
    ${kosten.arbeid_ontwerp > 0 ? `<tr><td>Ontwerp (regie)</td><td>${toon(kosten.arbeid_ontwerp)}</td></tr>` : ''}
    ${kosten.arbeid_nabewerking_extra > 0 ? `<tr><td>Nabewerking extra (regie)</td><td>${toon(kosten.arbeid_nabewerking_extra)}</td></tr>` : ''}
    ${kosten.extra_totaal > 0 ? `<tr><td>Extra kosten</td><td>${toon(kosten.extra_totaal)}</td></tr>` : ''}
    <tr style="font-weight:600;"><td>Subtotaal</td><td>${toon(kosten.totaal_kost)}</td></tr>
    <tr><td>Winstmarge (${kosten.marge_pct}%)</td><td>${toon(kosten.verkoopprijs - kosten.totaal_kost)}</td></tr>
  </tbody>
</table>

<div class="totaal-box">
  <div class="totaal-label">VERKOOPPRIJS${kosten.aantal > 1 ? ` (${kosten.aantal}x — €${(kosten.verkoopprijs / kosten.aantal).toFixed(2)}/stuk)` : ''}</div>
  <div class="totaal-bedrag">€${(kosten.verkoopprijs||0).toFixed(2)}</div>
</div>

${kosten.opmerking ? `<div class="opmerking">📝 ${kosten.opmerking}</div>` : ''}

<div class="footer">3D Print ERP &nbsp;|&nbsp; ${nu} &nbsp;|&nbsp; Vrijgesteld van BTW — art. 56bis BTW-wetboek</div>
</body>
</html>`;
}

// PDF endpoint (geeft HTML terug als download)
r.get('/pdf/:jobId', (req, res) => {
  const db = getDb();
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!kosten) return res.status(404).json({ error: 'Geen berekening gevonden' });
  const job = db.prepare('SELECT j.*, k.naam as klant_naam, k.email, k.adres, k.btw_nummer FROM jobs j LEFT JOIN klanten k ON k.id = j.klant_id WHERE j.id = ?').get(req.params.jobId);
  const klant = job?.klant_id ? { naam: job.klant_naam, email: job.email, adres: job.adres, btw_nummer: job.btw_nummer } : null;

  // Voeg extra velden toe vanuit request query
  const volledigeKosten = {
    ...kosten,
    job_naam: job?.naam,
    printer_naam: db.prepare('SELECT naam FROM printers WHERE id = ?').get(job?.printer_id)?.naam,
    arbeid_voorbereiding: parseFloat(req.query.arb_voorb) || 3.75,
    arbeid_nabewerking: parseFloat(req.query.arb_nab) || 2.50,
    arbeid_ontwerp: parseFloat(req.query.arb_ontw) || 0,
    arbeid_nabewerking_extra: parseFloat(req.query.arb_nab_extra) || 0,
    extra_totaal: parseFloat(req.query.extra_totaal) || 0,
    marge_pct: kosten.winstmarge_pct,
    opmerking: job?.notities || '',
    aantal: parseInt(req.query.aantal) || 1,
  };

  const html = buildPdfHtml(volledigeKosten, klant);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kostprijs-${job?.naam?.replace(/\s+/g,'-') || req.params.jobId}.html"`);
  res.send(html);
});

// Email endpoint
r.post('/email/:jobId', async (req, res) => {
  const db = getDb();
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!kosten) return res.status(404).json({ error: 'Geen berekening gevonden' });
  const job = db.prepare('SELECT j.*, k.naam as klant_naam, k.email, k.adres, k.btw_nummer FROM jobs j LEFT JOIN klanten k ON k.id = j.klant_id WHERE j.id = ?').get(req.params.jobId);

  const { to, extra_velden = {} } = req.body;
  const emailTo = to || job?.email || process.env.SMTP_FROM;

  const volledigeKosten = {
    ...kosten,
    job_naam: job?.naam,
    printer_naam: db.prepare('SELECT naam FROM printers WHERE id = ?').get(job?.printer_id)?.naam,
    arbeid_voorbereiding: extra_velden.arb_voorb || 3.75,
    arbeid_nabewerking: extra_velden.arb_nab || 2.50,
    arbeid_ontwerp: extra_velden.arb_ontw || 0,
    arbeid_nabewerking_extra: extra_velden.arb_nab_extra || 0,
    extra_totaal: extra_velden.extra_totaal || 0,
    marge_pct: kosten.winstmarge_pct,
    opmerking: job?.notities || '',
    aantal: extra_velden.aantal || 1,
  };

  const klant = job?.klant_id ? { naam: job.klant_naam, email: job.email, adres: job.adres, btw_nummer: job.btw_nummer } : null;
  const pdfHtml = buildPdfHtml(volledigeKosten, klant);

  try {
    await sendPdfEmail({
      to: emailTo,
      subject: `Kostprijsberekening — ${job?.naam || 'print'}`,
      html: `<p>Beste,</p><p>Hierbij de kostprijsberekening voor <strong>${job?.naam || 'uw print'}</strong>.</p><p>Totaal: <strong>€${(kosten.verkoopprijs||0).toFixed(2)}</strong></p><p>Met vriendelijke groeten,<br>3D Print ERP</p>`,
      pdfHtml,
      filename: `kostprijs-${job?.naam?.replace(/\s+/g,'-') || req.params.jobId}.html`,
    });
    res.json({ ok: true, to: emailTo });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
