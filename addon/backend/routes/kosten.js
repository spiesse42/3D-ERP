import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
}

r.post('/bereken/:jobId', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, p.machine_kost_per_uur, p.heeft_bmcu
    FROM jobs j JOIN printers p ON p.id = j.printer_id
    WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });

  const t = getTarieven(db);
  const { kwh_prijs, arbeid_per_uur, machine_per_uur, faalfactor_pct, winstmarge_pct, bmcu_per_job } = t;

  const materialen = db.prepare(`
    SELECT jm.gram_gebruikt, ft.inkoop_prijs_per_kg
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.jobId);

  const { kwh_verbruikt = 0 } = req.body;
  const uren = job.print_uren_werkelijk || job.print_uren_geschat || 0;

  const materiaal_kost = materialen.reduce((sum, m) =>
    sum + (m.gram_gebruikt / 1000) * m.inkoop_prijs_per_kg, 0);
  const energie_kost   = kwh_verbruikt * kwh_prijs;
  const machine_kost   = uren * (machine_per_uur || job.machine_kost_per_uur);
  const arbeid_kost    = uren * arbeid_per_uur;
  const bmcu_slijtage  = (job.is_multicolor && job.heeft_bmcu) ? bmcu_per_job : 0;

  const subtotaal  = materiaal_kost + energie_kost + machine_kost + arbeid_kost + bmcu_slijtage;
  const met_faal   = subtotaal * (1 + faalfactor_pct / 100);
  const verkoopprijs = met_faal * (1 + winstmarge_pct / 100);

  const kosten = {
    job_id:         parseInt(req.params.jobId),
    materiaal_kost: Math.round(materiaal_kost * 100) / 100,
    energie_kost:   Math.round(energie_kost   * 100) / 100,
    machine_kost:   Math.round(machine_kost   * 100) / 100,
    arbeid_kost:    Math.round(arbeid_kost    * 100) / 100,
    bmcu_slijtage:  Math.round(bmcu_slijtage  * 100) / 100,
    faalfactor_pct,
    winstmarge_pct,
    totaal_kost:    Math.round(met_faal        * 100) / 100,
    verkoopprijs:   Math.round(verkoopprijs    * 100) / 100,
    kwh_verbruikt,
  };

  db.prepare(`
    INSERT INTO job_kosten
      (job_id,materiaal_kost,energie_kost,machine_kost,arbeid_kost,bmcu_slijtage,
       faalfactor_pct,winstmarge_pct,totaal_kost,verkoopprijs,kwh_verbruikt,berekend_op)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      materiaal_kost=excluded.materiaal_kost, energie_kost=excluded.energie_kost,
      machine_kost=excluded.machine_kost, arbeid_kost=excluded.arbeid_kost,
      bmcu_slijtage=excluded.bmcu_slijtage, faalfactor_pct=excluded.faalfactor_pct,
      winstmarge_pct=excluded.winstmarge_pct, totaal_kost=excluded.totaal_kost,
      verkoopprijs=excluded.verkoopprijs, kwh_verbruikt=excluded.kwh_verbruikt,
      berekend_op=datetime('now')
  `).run(kosten.job_id, kosten.materiaal_kost, kosten.energie_kost, kosten.machine_kost,
         kosten.arbeid_kost, kosten.bmcu_slijtage, kosten.faalfactor_pct, kosten.winstmarge_pct,
         kosten.totaal_kost, kosten.verkoopprijs, kosten.kwh_verbruikt);

  res.json(kosten);
});

r.get('/job/:jobId', (req, res) => {
  const k = getDb().prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!k) return res.status(404).json({ error: 'Geen kostprijsberekening gevonden' });
  res.json(k);
});

export default r;
