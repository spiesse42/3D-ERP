import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

function nextNummer(db) {
  const jaar = new Date().getFullYear();
  const last = db.prepare(`SELECT nummer FROM offertes WHERE nummer LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`OFF-${jaar}-%`);
  if (!last) return `OFF-${jaar}-001`;
  const n = parseInt(last.nummer.split('-')[2]) + 1;
  return `OFF-${jaar}-${String(n).padStart(3,'0')}`;
}

r.get('/', (req, res) => {
  const rows = getDb().prepare(`
    SELECT o.*, k.naam as klant_naam, k.voornaam as klant_voornaam,
      j.naam as job_naam
    FROM offertes o
    JOIN klanten k ON k.id = o.klant_id
    LEFT JOIN jobs j ON j.id = o.job_id
    ORDER BY o.aangemaakt_op DESC
  `).all();
  res.json(rows);
});

r.get('/:id', (req, res) => {
  const db = getDb();
  const offerte = db.prepare(`
    SELECT o.*, k.naam as klant_naam, k.voornaam as klant_voornaam,
      k.email, k.straat, k.huisnummer, k.postcode, k.gemeente, k.btw_nummer, k.type as klant_type,
      j.naam as job_naam
    FROM offertes o
    JOIN klanten k ON k.id = o.klant_id
    LEFT JOIN jobs j ON j.id = o.job_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!offerte) return res.status(404).json({ error: 'Niet gevonden' });
  const regels = db.prepare(`
    SELECT or2.*, j.naam as job_naam FROM offerte_regels or2
    LEFT JOIN jobs j ON j.id = or2.job_id WHERE or2.offerte_id = ?
    ORDER BY or2.id
  `).all(req.params.id);
  const betalingen = db.prepare('SELECT * FROM betalingen WHERE offerte_id = ? ORDER BY id').all(req.params.id);
  res.json({ ...offerte, regels, betalingen });
});

// Maak offerte van kostprijsberekening
r.post('/van-job/:jobId', (req, res) => {
  const db = getDb();
  const job = db.prepare(`
    SELECT j.*, k.id as klant_id, k.naam as klant_naam, k.voornaam as klant_voornaam
    FROM jobs j LEFT JOIN klanten k ON k.id = j.klant_id
    WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });
  if (!job.klant_id) return res.status(400).json({ error: 'Job heeft geen klant — koppel eerst een klant aan de job' });

  const kosten = db.prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!kosten) return res.status(400).json({ error: 'Bereken eerst de kostprijs' });

  const { btw_pct = 21, geldig_tot, notities } = req.body;
  const nummer = nextNummer(db);
  const subtotaal = kosten.verkoopprijs;
  const btw_bedrag = Math.round(subtotaal * btw_pct) / 100;
  const totaal = Math.round((subtotaal + btw_bedrag) * 100) / 100;

  const snapshot = JSON.stringify({
    ...kosten,
    job_naam: job.naam,
    printer_naam: db.prepare('SELECT naam FROM printers WHERE id = ?').get(job.printer_id)?.naam,
  });

  const insertOfferte = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO offertes (klant_id,job_id,nummer,btw_pct,subtotaal,btw_bedrag,totaal,geldig_tot,notities,kostprijs_snapshot)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(job.klant_id, job.id, nummer, btw_pct, subtotaal, btw_bedrag, totaal,
           geldig_tot||null, notities||null, snapshot);
    const offerte_id = result.lastInsertRowid;
    db.prepare(`
      INSERT INTO offerte_regels (offerte_id,job_id,omschrijving,aantal,eenheidsprijs,regeltotaal)
      VALUES (?,?,?,?,?,?)
    `).run(offerte_id, job.id, job.naam, 1, subtotaal, subtotaal);
    return offerte_id;
  });

  const id = insertOfferte();
  res.status(201).json({ id, nummer });
});

// Herhaalorder — nieuwe offerte op basis van bestaande, met actuele prijzen
r.post('/:id/herhaal', (req, res) => {
  const db = getDb();
  const origineel = db.prepare('SELECT * FROM offertes WHERE id = ?').get(req.params.id);
  if (!origineel) return res.status(404).json({ error: 'Niet gevonden' });

  const origJob = origineel.job_id
    ? db.prepare('SELECT * FROM jobs WHERE id = ?').get(origineel.job_id)
    : null;

  // Nieuwe job aanmaken als kopie
  let nieuweJobId = null;
  if (origJob) {
    const result = db.prepare(`
      INSERT INTO jobs (klant_id,printer_id,naam,status,stl_bestandsnaam,print_uren_geschat,is_multicolor,aantal_kleuren,notities)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(origJob.klant_id, origJob.printer_id, origJob.naam + ' (herhaal)',
           'gepland', origJob.stl_bestandsnaam, origJob.print_uren_geschat,
           origJob.is_multicolor, origJob.aantal_kleuren,
           'Herhaalorder van offerte ' + origineel.nummer);
    nieuweJobId = result.lastInsertRowid;
  }

  res.status(201).json({ job_id: nieuweJobId, bericht: 'Nieuwe job aangemaakt — bereken kostprijs opnieuw met actuele prijzen' });
});

r.post('/', (req, res) => {
  const db = getDb();
  const { klant_id, regels = [], btw_pct = 21, geldig_tot, notities } = req.body;
  if (!klant_id) return res.status(400).json({ error: 'klant_id is verplicht' });
  const nummer = nextNummer(db);
  const subtotaal = regels.reduce((s, regel) => s + (regel.aantal * regel.eenheidsprijs), 0);
  const btw_bedrag = Math.round(subtotaal * btw_pct) / 100;
  const totaal = Math.round((subtotaal + btw_bedrag) * 100) / 100;

  const insertOfferte = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO offertes (klant_id,nummer,btw_pct,subtotaal,btw_bedrag,totaal,geldig_tot,notities)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(klant_id, nummer, btw_pct, Math.round(subtotaal*100)/100, btw_bedrag, totaal, geldig_tot||null, notities||null);
    const offerte_id = result.lastInsertRowid;
    for (const regel of regels) {
      db.prepare(`INSERT INTO offerte_regels (offerte_id,job_id,omschrijving,aantal,eenheidsprijs,regeltotaal) VALUES (?,?,?,?,?,?)`)
        .run(offerte_id, regel.job_id||null, regel.omschrijving, regel.aantal||1, regel.eenheidsprijs,
             Math.round(regel.aantal * regel.eenheidsprijs * 100) / 100);
    }
    return offerte_id;
  });

  const id = insertOfferte();
  res.status(201).json({ id, nummer });
});

r.patch('/:id/status', (req, res) => {
  getDb().prepare('UPDATE offertes SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM offertes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
