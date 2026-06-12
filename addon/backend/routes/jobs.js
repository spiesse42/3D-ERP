import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  const { status, klant_id, printer_id } = req.query;
  let sql = `
    SELECT j.*, k.naam as klant_naam, p.naam as printer_naam,
      jk.verkoopprijs, jk.totaal_kost
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
  sql += ' ORDER BY j.aangemaakt_op DESC';
  res.json(getDb().prepare(sql).all(...params));
});

r.get('/:id', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, k.naam as klant_naam, p.naam as printer_naam, p.heeft_bmcu
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    WHERE j.id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Niet gevonden' });
  const materialen = db.prepare(`
    SELECT jm.*, r.gewicht_gram_huidig, ft.merk, ft.materiaal, ft.kleur, ft.inkoop_prijs_per_kg
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.id);
  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.id);
  res.json({ ...job, materialen, kosten });
});

r.post('/', (req, res) => {
  const db = getDb();
  const { klant_id, printer_id, naam, stl_bestandsnaam, print_uren_geschat,
          is_multicolor, aantal_kleuren, notities, status, gestart_op } = req.body;
  if (!printer_id || !naam) return res.status(400).json({ error: 'printer_id en naam zijn verplicht' });
  const jobStatus  = status || 'gepland';
  const gestart    = gestart_op || (jobStatus === 'bezig' ? new Date().toISOString() : null);
  const result = db.prepare(`
    INSERT INTO jobs (klant_id,printer_id,naam,stl_bestandsnaam,print_uren_geschat,is_multicolor,aantal_kleuren,notities,status,gestart_op)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(klant_id||null, printer_id, naam, stl_bestandsnaam||null,
         print_uren_geschat||null, is_multicolor?1:0, aantal_kleuren||1, notities||null,
         jobStatus, gestart);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { klant_id, printer_id, naam, status, stl_bestandsnaam, print_uren_geschat,
          print_uren_werkelijk, is_multicolor, aantal_kleuren, gestart_op, voltooid_op,
          notities, betaald, betaald_op } = req.body;
  db.prepare(`
    UPDATE jobs SET klant_id=?,printer_id=?,naam=?,status=?,stl_bestandsnaam=?,
      print_uren_geschat=?,print_uren_werkelijk=?,is_multicolor=?,aantal_kleuren=?,
      gestart_op=?,voltooid_op=?,notities=?,betaald=?,betaald_op=? WHERE id=?
  `).run(klant_id||null, printer_id, naam, status||'gepland', stl_bestandsnaam||null,
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
  db.prepare(`UPDATE jobs SET status=?,gestart_op=COALESCE(?,gestart_op),voltooid_op=? WHERE id=?`)
    .run(status, updates.gestart_op||null, updates.voltooid_op||null, req.params.id);
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

export default r;
