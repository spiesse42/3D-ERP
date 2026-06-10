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
          aantal=1, matDetails=[] } = extraInfo;

  const matRijen = matDetails.map(m =>
    `<tr><td>Materiaal — ${m.naam}</td><td>${m.gram.toFixed(1)}g</td><td>${toon((m.gram/1000)*m.prijs)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo{font-size:1.6rem;font-weight:900;color:#5b8dee;letter-spacing:2px}
  .doc-info{text-align:right;color:#666;font-size:.85rem}
  .nr{font-size:1.1rem;font-weight:bold;color:#1a1a1a}
  .klant-box{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:24px}
  .klant-box h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase;letter-spacing:1px}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .totaal-box{background:#0c0c0c;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
  .totaal-bedrag{font-size:2rem;font-weight:900;color:#5b8dee}
  .opmerking{margin-top:18px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
</style>
</head>
<body>
<div class="header">
  <div class="logo">▲ 3D PRINT ERP</div>
  <div class="doc-info">
    <div class="nr">KOSTPRIJSBEREKENING</div>
    <div>${nu}</div>
    <div>${kosten.printer_naam||''}</div>
  </div>
</div>
${klant ? `<div class="klant-box"><h3>Klant</h3>
  <p><strong>${klant.voornaam ? klant.voornaam + ' ' : ''}${klant.naam}</strong></p>
  ${klant.straat ? `<p>${klant.straat} ${klant.huisnummer||''}, ${klant.postcode||''} ${klant.gemeente||''}</p>` : ''}
  ${klant.email ? `<p>✉ ${klant.email}</p>` : ''}
  ${klant.btw_nummer ? `<p>BTW: ${klant.btw_nummer}</p>` : ''}
</div>` : ''}
<p style="margin-bottom:16px"><strong>Print:</strong> ${kosten.job_naam||'—'} &nbsp;|&nbsp; <strong>Aantal:</strong> ${aantal}</p>
<table>
  <thead><tr><th>Post</th><th>Detail</th><th>Bedrag</th></tr></thead>
  <tbody>
    ${matRijen || `<tr><td>Materiaal</td><td>—</td><td>${toon(kosten.materiaal_kost)}</td></tr>`}
    <tr><td>Energie</td><td>${kosten.kwh_verbruikt} kWh</td><td>${toon(kosten.energie_kost)}</td></tr>
    <tr><td>Voorbereiding</td><td>${voorbMin} min</td><td>${toon((voorbMin/60)*arbTarief)}</td></tr>
    <tr><td>Nabewerking</td><td>${nabMin} min</td><td>${toon((nabMin/60)*arbTarief)}</td></tr>
    ${ontwerpMin > 0 ? `<tr><td>Ontwerp regie</td><td>${ontwerpMin} min</td><td>${toon((ontwerpMin/60)*ontwerpTarief)}</td></tr>` : ''}
    ${nabExtraMin > 0 ? `<tr><td>Nabewerking extra</td><td>${nabExtraMin} min</td><td>${toon((nabExtraMin/60)*nabExtraTarief)}</td></tr>` : ''}
    ${extraTotaal > 0 ? `<tr><td>Extra${extraOmschrijving ? ' — '+extraOmschrijving : ''}</td><td>—</td><td>${toon(extraTotaal)}</td></tr>` : ''}
    <tr style="font-weight:600"><td colspan="2">Subtotaal</td><td>${toon(kosten.totaal_kost)}</td></tr>
    <tr><td colspan="2">Winstmarge (${kosten.winstmarge_pct}%)</td><td>${toon((kosten.verkoopprijs||0)-(kosten.totaal_kost||0))}</td></tr>
  </tbody>
</table>
<div class="totaal-box">
  <div>
    <div style="font-size:.85rem;color:#a0a0a0">VERKOOPPRIJS${aantal > 1 ? ` (${aantal}× — ${toon((kosten.verkoopprijs||0)/aantal)}/stuk)` : ''}</div>
  </div>
  <div class="totaal-bedrag">${toon(kosten.verkoopprijs)}</div>
</div>
${kosten.opmerking ? `<div class="opmerking">📝 ${kosten.opmerking}</div>` : ''}
<div class="footer">3D Print ERP &nbsp;|&nbsp; ${nu} &nbsp;|&nbsp; Vrijgesteld van BTW — art. 56bis BTW-wetboek</div>
</body></html>`;
}

r.post('/bereken/:jobId', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, p.machine_kost_per_uur, p.heeft_bmcu, p.naam as printer_naam
    FROM jobs j JOIN printers p ON p.id = j.printer_id WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });

  const t = getTarieven(db);
  const kwh_prijs = t.kwh_prijs || 0.35;
  const arbeid_per_uur = t.arbeid_per_uur || 15;
  const faalfactor_pct = t.faalfactor_pct || 10;
  const bmcu_per_job = t.bmcu_per_job || 0.10;
  const voorbereiding_min = t.voorbereiding_min || 15;
  const nabewerking_min = t.nabewerking_min || 10;
  const marge_grens_uur = t.marge_grens_uur || 4;
  const marge_klein_pct = t.marge_klein_pct || 18;
  const marge_groot_pct = t.marge_groot_pct || 10;

  const {
    kwh_verbruikt = 0,
    is_multicolor = job.is_multicolor,
    extra_voorbereiding_min = 0,
    ontwerp_min = 0,
    ontwerp_tarief = t.ontwerp_tarief || 15,
    nabewerking_extra_min = 0,
    nabewerking_extra_tarief = t.nabewerking_tarief || 15,
    extra_per_stuk = 0,
    extra_eenmalig = 0,
    aantal = 1,
    opmerking = '',
    print_uren = null,
  } = req.body;

  // Printuren: gebruik override uit request, dan werkelijk, dan geschat
  const uren = parseFloat(print_uren) || job.print_uren_werkelijk || job.print_uren_geschat || 0;

  // Update printuren in job indien meegegeven
  if (print_uren != null) {
    try {
      db.prepare('UPDATE jobs SET print_uren_werkelijk = ? WHERE id = ?').run(parseFloat(print_uren), req.params.jobId);
    } catch {}
  }

  const materialen = db.prepare(`
    SELECT jm.gram_gebruikt, ft.inkoop_prijs_per_kg, ft.merk, ft.materiaal,
      r.kleur, r.id as rol_id
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.jobId);

  // Materiaalkost per rol
  const materiaal_kost = materialen.reduce((sum, m) =>
    sum + (m.gram_gebruikt / 1000) * m.inkoop_prijs_per_kg, 0) * (1 + faalfactor_pct / 100);

  const energie_kost = parseFloat(kwh_verbruikt) * kwh_prijs;
  const machine_kost = uren * job.machine_kost_per_uur; // intern
  const bmcu_slijtage = (is_multicolor && job.heeft_bmcu) ? bmcu_per_job : 0; // intern

  const totale_voorb_min = voorbereiding_min + parseFloat(extra_voorbereiding_min || 0);
  const arbeid_voorbereiding = (totale_voorb_min / 60) * arbeid_per_uur;
  const arbeid_nabewerking = (nabewerking_min / 60) * arbeid_per_uur;
  const arbeid_ontwerp = (parseFloat(ontwerp_min) / 60) * parseFloat(ontwerp_tarief);
  const arbeid_nabewerking_extra = (parseFloat(nabewerking_extra_min) / 60) * parseFloat(nabewerking_extra_tarief);
  const arbeid_totaal = arbeid_voorbereiding + arbeid_nabewerking + arbeid_ontwerp + arbeid_nabewerking_extra;

  const extra_totaal = (parseFloat(extra_per_stuk) * parseInt(aantal)) + parseFloat(extra_eenmalig);
  const subtotaal = materiaal_kost + energie_kost + machine_kost + bmcu_slijtage + arbeid_totaal + extra_totaal;

  const marge_pct = uren >= marge_grens_uur ? marge_groot_pct : marge_klein_pct;
  const verkoopprijs = subtotaal * (1 + marge_pct / 100);

  const ro = v => Math.round(v * 1000) / 1000;
  const kosten = {
    job_id:       parseInt(req.params.jobId),
    materiaal_kost: ro(materiaal_kost),
    energie_kost:   ro(energie_kost),
    machine_kost:   ro(machine_kost),
    bmcu_slijtage:  ro(bmcu_slijtage),
    arbeid_kost:    ro(arbeid_totaal),
    arbeid_voorbereiding: ro(arbeid_voorbereiding),
    arbeid_nabewerking:   ro(arbeid_nabewerking),
    arbeid_ontwerp:       ro(arbeid_ontwerp),
    arbeid_nabewerking_extra: ro(arbeid_nabewerking_extra),
    extra_totaal:   ro(extra_totaal),
    faalfactor_pct,
    winstmarge_pct: marge_pct,
    totaal_kost:    ro(subtotaal),
    verkoopprijs:   Math.round(verkoopprijs * 100) / 100,
    kwh_verbruikt:  parseFloat(kwh_verbruikt),
    aantal:         parseInt(aantal),
    opmerking,
    printer_naam:   job.printer_naam,
    job_naam:       job.naam,
  };

  db.prepare(`
    INSERT INTO job_kosten
      (job_id,materiaal_kost,energie_kost,machine_kost,arbeid_kost,bmcu_slijtage,
       faalfactor_pct,winstmarge_pct,totaal_kost,verkoopprijs,kwh_verbruikt,berekend_op)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      materiaal_kost=excluded.materiaal_kost,energie_kost=excluded.energie_kost,
      machine_kost=excluded.machine_kost,arbeid_kost=excluded.arbeid_kost,
      bmcu_slijtage=excluded.bmcu_slijtage,faalfactor_pct=excluded.faalfactor_pct,
      winstmarge_pct=excluded.winstmarge_pct,totaal_kost=excluded.totaal_kost,
      verkoopprijs=excluded.verkoopprijs,kwh_verbruikt=excluded.kwh_verbruikt,
      berekend_op=datetime('now')
  `).run(kosten.job_id, kosten.materiaal_kost, kosten.energie_kost, kosten.machine_kost,
         kosten.arbeid_kost, kosten.bmcu_slijtage, kosten.faalfactor_pct, kosten.winstmarge_pct,
         kosten.totaal_kost, kosten.verkoopprijs, kosten.kwh_verbruikt);

  if (opmerking) {
    db.prepare('UPDATE jobs SET notities = ? WHERE id = ?').run(opmerking, req.params.jobId);
  }

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
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    WHERE j.id = ?
  `).get(req.params.jobId);

  const klant = job?.klant_id ? {
    naam: job.klant_naam, voornaam: job.voornaam,
    email: job.email, straat: job.straat, huisnummer: job.huisnummer,
    postcode: job.postcode, gemeente: job.gemeente, btw_nummer: job.btw_nummer
  } : null;

  const t = getTarieven(db);
  const volledigeKosten = {
    ...kosten,
    job_naam: job?.naam,
    printer_naam: job?.printer_naam,
    opmerking: job?.notities || '',
  };

  const extraInfo = {
    voorbMin:         parseFloat(req.query.arb_voorb_min) || (t.voorbereiding_min||15),
    nabMin:           parseFloat(req.query.arb_nab_min) || (t.nabewerking_min||10),
    arbTarief:        t.arbeid_per_uur || 15,
    ontwerpMin:       parseFloat(req.query.ontwerp_min) || 0,
    ontwerpTarief:    t.ontwerp_tarief || 15,
    nabExtraMin:      parseFloat(req.query.nab_extra_min) || 0,
    nabExtraTarief:   t.nabewerking_tarief || 15,
    extraTotaal:      parseFloat(req.query.extra_totaal) || 0,
    extraOmschrijving: decodeURIComponent(req.query.extra_omschrijving || ''),
    aantal:           parseInt(req.query.aantal) || 1,
    matDetails: db.prepare(`
      SELECT jm.gram_gebruikt as gram,
        ft.inkoop_prijs_per_kg as prijs,
        ft.merk || ' ' || ft.materiaal || COALESCE(' ' || r.kleur, '') as naam
      FROM job_materialen jm
      JOIN filament_rollen r ON r.id = jm.filament_rol_id
      JOIN filament_types ft ON ft.id = r.filament_type_id
      WHERE jm.job_id = ?
    `).all(req.params.jobId),
  };

  const html = buildPdfHtml(volledigeKosten, klant, extraInfo);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kostprijs-${(job?.naam||'print').replace(/\s+/g,'-')}.html"`);
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

  const klant = job?.klant_id ? {
    naam: job.klant_naam, voornaam: job.voornaam, email: job.email,
    straat: job.straat, huisnummer: job.huisnummer, postcode: job.postcode,
    gemeente: job.gemeente, btw_nummer: job.btw_nummer
  } : null;

  const volledigeKosten = { ...kosten, job_naam: job?.naam, printer_naam: job?.printer_naam, opmerking: job?.notities||'' };
  const extraInfo = {
    voorbMin: (t.voorbereiding_min||15) + (extra_velden.extra_voorb_min||0),
    nabMin: t.nabewerking_min||10,
    arbTarief: t.arbeid_per_uur||15,
    ontwerpMin: extra_velden.ontwerp_min||0,
    ontwerpTarief: t.ontwerp_tarief||15,
    nabExtraMin: extra_velden.nab_extra_min||0,
    nabExtraTarief: t.nabewerking_tarief||15,
    extraTotaal: extra_velden.extra_totaal||0,
    extraOmschrijving: extra_velden.extra_omschrijving||'',
    aantal: extra_velden.aantal||1,
    matDetails: db.prepare(`
      SELECT jm.gram_gebruikt as gram, ft.inkoop_prijs_per_kg as prijs,
        ft.merk || ' ' || ft.materiaal || COALESCE(' ' || r.kleur, '') as naam
      FROM job_materialen jm
      JOIN filament_rollen r ON r.id = jm.filament_rol_id
      JOIN filament_types ft ON ft.id = r.filament_type_id WHERE jm.job_id = ?
    `).all(req.params.jobId),
  };

  const pdfHtml = buildPdfHtml(volledigeKosten, klant, extraInfo);

  try {
    await sendPdfEmail({
      to: emailTo,
      subject: `Kostprijsberekening — ${job?.naam||'print'}`,
      html: `<p>Beste${klant ? ` ${klant.voornaam||''} ${klant.naam}` : ''},</p>
             <p>Hierbij de kostprijsberekening voor <strong>${job?.naam||'uw print'}</strong>.</p>
             <p>Totaal: <strong>€${(kosten.verkoopprijs||0).toFixed(2)}</strong></p>
             <p>Met vriendelijke groeten,<br>3D Print ERP</p>`,
      pdfHtml,
      filename: `kostprijs-${(job?.naam||'print').replace(/\s+/g,'-')}.html`,
    });
    res.json({ ok: true, to: emailTo });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
