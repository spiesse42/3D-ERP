import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

// Opvolgnummer per kalenderjaar (formaat JJJJ-0001), teller bijgehouden in de
// generieke instellingen-tabel — atomisch genoeg omdat better-sqlite3 synchroon
// en single-threaded werkt (geen race condition tussen de select en de update).
function volgendVolgnummer(db) {
  const jaar = new Date().getFullYear();
  const sleutel = `volgnummer_teller_${jaar}`;
  const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
  const teller = (rij ? parseInt(rij.waarde) || 0 : 0) + 1;
  db.prepare(`
    INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)
    ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde
  `).run(sleutel, String(teller));
  return `${jaar}-${String(teller).padStart(4, '0')}`;
}

r.get('/', (req, res) => {
  const { status, klant_id, printer_id, volgnummer } = req.query;
  let sql = `
    SELECT j.*, k.naam as klant_naam, k.voornaam as klant_voornaam, p.naam as printer_naam,
      jk.verkoopprijs, jk.totaal_kost, jk.materiaal_kost, jk.energie_kost, jk.machine_kost, jk.arbeid_kost
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    WHERE 1=1
  `;
  const params = [];
  if (status)     { sql += ' AND j.status = ?';     params.push(status); }
  if (klant_id)   { sql += ' AND j.klant_id = ?';   params.push(klant_id); }
  if (printer_id) { sql += ' AND j.printer_id = ?'; params.push(printer_id); }
  if (volgnummer) { sql += ' AND j.volgnummer LIKE ?'; params.push(`%${volgnummer}%`); }
  sql += ' ORDER BY j.aangemaakt_op DESC';
  res.json(getDb().prepare(sql).all(...params));
});

// Reeds gebruikte dienst-categorieën — voor autocomplete-suggesties in het
// job-formulier (geen vaste lijst, de gebruiker bouwt die zelf op).
r.get('/dienst-categorieen', (req, res) => {
  const rows = getDb().prepare(
    "SELECT DISTINCT dienst_categorie FROM jobs WHERE dienst_categorie IS NOT NULL AND dienst_categorie != '' ORDER BY dienst_categorie"
  ).all();
  res.json(rows.map(r2 => r2.dienst_categorie));
});

r.get('/:id', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, k.naam as klant_naam, p.naam as printer_naam, p.heeft_bmcu,
      p.kwh_entity
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    WHERE j.id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Niet gevonden' });
  const materialen = db.prepare(`
    SELECT jm.*, r.gewicht_gram_huidig, r.kleur, r.aankoopprijs_eur, r.gewicht_gram_start,
      ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg, ft.categorie, ft.eenheid,
      COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.id);
  const diensten = db.prepare(`
    SELECT jd.*, ft.merk, ft.materiaal, ft.eenheid
    FROM job_diensten jd
    JOIN filament_types ft ON ft.id = jd.filament_type_id
    WHERE jd.job_id = ?
    ORDER BY jd.id
  `).all(req.params.id);
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.id);
  res.json({ ...job, materialen, diensten, kosten });
});

r.post('/', (req, res) => {
  const db = getDb();
  const { klant_id, printer_id, naam, type, dienst_categorie, stl_bestandsnaam, print_uren_geschat,
          is_multicolor, aantal_kleuren, notities, status, gestart_op, gewicht_geschat } = req.body;
  const jobType = type === 'dienst' ? 'dienst' : 'print';
  if (!naam) return res.status(400).json({ error: 'naam is verplicht' });
  if (jobType === 'print' && !printer_id) return res.status(400).json({ error: 'printer_id is verplicht voor een print-job' });
  const jobStatus  = status || 'in te plannen';
  const gestart    = gestart_op || (jobStatus === 'bezig' ? new Date().toISOString() : null);
  const volgnummer = volgendVolgnummer(db);
  const result = db.prepare(`
    INSERT INTO jobs (klant_id,printer_id,naam,type,dienst_categorie,volgnummer,stl_bestandsnaam,print_uren_geschat,is_multicolor,aantal_kleuren,notities,status,gestart_op,gewicht_geschat)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(klant_id||null, jobType === 'dienst' ? (printer_id||null) : printer_id, naam, jobType,
         dienst_categorie||null, volgnummer, stl_bestandsnaam||null,
         print_uren_geschat||null, is_multicolor?1:0, aantal_kleuren||1, notities||null,
         jobStatus, gestart, gewicht_geschat||null);
  res.status(201).json({ id: result.lastInsertRowid, volgnummer });
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { klant_id, printer_id, naam, type, dienst_categorie, status, stl_bestandsnaam, print_uren_geschat,
          print_uren_werkelijk, is_multicolor, aantal_kleuren, gestart_op, voltooid_op,
          notities, betaald, betaald_op } = req.body;
  const jobType = type === 'dienst' ? 'dienst' : 'print';
  if (jobType === 'print' && !printer_id) return res.status(400).json({ error: 'printer_id is verplicht voor een print-job' });
  db.prepare(`
    UPDATE jobs SET klant_id=?,printer_id=?,naam=?,type=?,dienst_categorie=?,status=?,stl_bestandsnaam=?,
      print_uren_geschat=?,print_uren_werkelijk=?,is_multicolor=?,aantal_kleuren=?,
      gestart_op=?,voltooid_op=?,notities=?,betaald=?,betaald_op=? WHERE id=?
  `).run(klant_id||null, jobType === 'dienst' ? (printer_id||null) : printer_id, naam, jobType,
         dienst_categorie||null, status||'gepland', stl_bestandsnaam||null,
         print_uren_geschat||null, print_uren_werkelijk||null, is_multicolor?1:0,
         aantal_kleuren||1, gestart_op||null, voltooid_op||null, notities||null,
         betaald?1:0, betaald_op||null, req.params.id);
  res.json({ ok: true });
});

r.patch('/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const updates = { status };
  if (status === 'bezig')    updates.gestart_op  = new Date().toISOString();
  if (status === 'voltooid') updates.voltooid_op = new Date().toISOString();

  // 'betaald' is zowel een status-waarde als een apart betaald/betaald_op-veld
  // (dat laatste wordt ook los bewerkt via PATCH /:id/betaald). Hou ze gesynchroniseerd:
  // bij status -> 'betaald' de vlag+datum zetten, bij status weg van 'betaald' weer wissen.
  const betaald    = status === 'betaald' ? 1 : 0;
  const betaaldOpSql = status === 'betaald'
    ? `COALESCE(betaald_op, ?)`
    : `NULL`;
  const betaaldOpParam = status === 'betaald' ? new Date().toISOString() : null;

  // voltooid_op mag NIET verloren gaan zodra de status verder gaat dan 'voltooid'
  // (gecontroleerd/gefactureerd/betaald) — enkel overschrijven als deze patch de
  // status net NAAR 'voltooid' zet, anders de bestaande waarde behouden.
  const params = [status, updates.gestart_op || null];
  let sql = `UPDATE jobs SET status=?,gestart_op=COALESCE(?,gestart_op),`;
  if (status === 'voltooid') {
    sql += `voltooid_op=?,`;
    params.push(updates.voltooid_op);
  } else {
    sql += `voltooid_op=voltooid_op,`;
  }
  sql += `betaald=?,betaald_op=${betaaldOpSql} WHERE id=?`;
  params.push(betaald);
  if (status === 'betaald') params.push(betaaldOpParam);
  params.push(req.params.id);

  db.prepare(sql).run(...params);
  res.json({ ok: true });
});
r.patch('/:id/kwh_start', (req, res) => {
  const db = getDb();
  const { kwh_start } = req.body;
  if (kwh_start == null) return res.status(400).json({ error: 'kwh_start is verplicht' });
  db.prepare('UPDATE jobs SET kwh_start = ? WHERE id = ?').run(parseFloat(kwh_start), req.params.id);
  res.json({ ok: true });
});

r.patch('/:id/kwh_start_clear', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE jobs SET kwh_start = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.patch('/:id/betaald', (req, res) => {
  const db = getDb();
  const betaald = req.body.betaald ? 1 : 0;
  const betaald_op = betaald ? new Date().toISOString() : null;
  db.prepare(`UPDATE jobs SET betaald=?, betaald_op=? WHERE id=?`)
    .run(betaald, betaald_op, req.params.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    // Stap 1: verbreek koppeling job → offerte (circulaire referentie)
    db.prepare('UPDATE offertes_v2 SET job_id = NULL WHERE job_id = ?').run(req.params.id);
    // Stap 2: verwijder gerelateerde data
    db.prepare('DELETE FROM job_kosten WHERE job_id = ?').run(req.params.id);
    db.prepare('DELETE FROM job_materialen WHERE job_id = ?').run(req.params.id);
    // Stap 3: verwijder job zelf
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:id/materialen', (req, res) => {
  const db = getDb();
  const { filament_rol_id, gram_gebruikt } = req.body;
  if (!filament_rol_id || !gram_gebruikt) return res.status(400).json({ error: 'filament_rol_id en gram_gebruikt zijn verplicht' });
  const result = db.prepare(
    'INSERT INTO job_materialen (job_id,filament_rol_id,gram_gebruikt) VALUES (?,?,?)'
  ).run(req.params.id, filament_rol_id, gram_gebruikt);
  db.prepare('UPDATE filament_rollen SET gewicht_gram_huidig = gewicht_gram_huidig - ? WHERE id = ?')
    .run(gram_gebruikt, filament_rol_id);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/:jobId/materialen/:id', (req, res) => {
  const db = getDb();
  const { gram_gebruikt } = req.body;
  if (!gram_gebruikt || isNaN(parseFloat(gram_gebruikt))) return res.status(400).json({ error: 'gram_gebruikt is verplicht' });
  const mat = db.prepare('SELECT * FROM job_materialen WHERE id = ?').get(req.params.id);
  if (!mat) return res.status(404).json({ error: 'Niet gevonden' });
  const verschil = parseFloat(gram_gebruikt) - mat.gram_gebruikt;
  db.prepare('UPDATE job_materialen SET gram_gebruikt = ? WHERE id = ?').run(parseFloat(gram_gebruikt), req.params.id);
  db.prepare('UPDATE filament_rollen SET gewicht_gram_huidig = gewicht_gram_huidig - ? WHERE id = ?').run(verschil, mat.filament_rol_id);
  res.json({ ok: true });
});

r.delete('/:jobId/materialen/:id', (req, res) => {
  const db = getDb();
  const mat = db.prepare('SELECT * FROM job_materialen WHERE id = ?').get(req.params.id);
  if (mat) {
    db.prepare('UPDATE filament_rollen SET gewicht_gram_huidig = gewicht_gram_huidig + ? WHERE id = ?')
      .run(mat.gram_gebruikt, mat.filament_rol_id);
    db.prepare('DELETE FROM job_materialen WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// ── Diensten (bv. verzendkosten) — los van voorraad, geprijsd op typeniveau
// met een per-job overschrijfbare prijs én aantal. In tegenstelling tot
// materialen/artikelen hierboven wordt hier geen stock afgeboekt. ──────────

r.get('/:id/diensten', (req, res) => {
  const rows = getDb().prepare(`
    SELECT jd.*, ft.merk, ft.materiaal, ft.eenheid
    FROM job_diensten jd
    JOIN filament_types ft ON ft.id = jd.filament_type_id
    WHERE jd.job_id = ?
    ORDER BY jd.id
  `).all(req.params.id);
  res.json(rows);
});

r.post('/:id/diensten', (req, res) => {
  const db = getDb();
  const { filament_type_id, aantal } = req.body;
  if (!filament_type_id || !aantal || parseFloat(aantal) <= 0) {
    return res.status(400).json({ error: 'filament_type_id en aantal (> 0) zijn verplicht' });
  }
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });

  let prijs = parseFloat(req.body.prijs_per_eenheid);
  if (isNaN(prijs)) {
    const ft = db.prepare('SELECT inkoop_prijs_per_kg FROM filament_types WHERE id = ?').get(filament_type_id);
    if (!ft) return res.status(400).json({ error: 'Diensttype niet gevonden' });
    prijs = ft.inkoop_prijs_per_kg || 0;
  }
  const result = db.prepare(
    'INSERT INTO job_diensten (job_id, filament_type_id, aantal, prijs_per_eenheid) VALUES (?,?,?,?)'
  ).run(req.params.id, filament_type_id, parseFloat(aantal), prijs);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/:jobId/diensten/:id', (req, res) => {
  const db = getDb();
  const dienst = db.prepare('SELECT * FROM job_diensten WHERE id = ? AND job_id = ?').get(req.params.id, req.params.jobId);
  if (!dienst) return res.status(404).json({ error: 'Niet gevonden' });

  const nieuwAantal = req.body.aantal != null ? parseFloat(req.body.aantal) : dienst.aantal;
  const nieuwePrijs = req.body.prijs_per_eenheid != null ? parseFloat(req.body.prijs_per_eenheid) : dienst.prijs_per_eenheid;
  if (isNaN(nieuwAantal) || nieuwAantal <= 0) return res.status(400).json({ error: 'aantal moet groter dan 0 zijn' });
  if (isNaN(nieuwePrijs) || nieuwePrijs < 0) return res.status(400).json({ error: 'prijs mag niet negatief zijn' });

  db.prepare('UPDATE job_diensten SET aantal = ?, prijs_per_eenheid = ? WHERE id = ?')
    .run(nieuwAantal, nieuwePrijs, req.params.id);
  res.json({ ok: true });
});

r.delete('/:jobId/diensten/:id', (req, res) => {
  getDb().prepare('DELETE FROM job_diensten WHERE id = ? AND job_id = ?').run(req.params.id, req.params.jobId);
  res.json({ ok: true });
});

export default r;
