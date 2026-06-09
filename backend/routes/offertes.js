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
    SELECT o.*, k.naam as klant_naam
    FROM offertes o JOIN klanten k ON k.id = o.klant_id
    ORDER BY o.aangemaakt_op DESC
  `).all();
  res.json(rows);
});

r.get('/:id', (req, res) => {
  const db = getDb();
  const offerte = db.prepare(`
    SELECT o.*, k.naam as klant_naam, k.email, k.adres, k.btw_nummer
    FROM offertes o JOIN klanten k ON k.id = o.klant_id WHERE o.id = ?
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
    `).run(klant_id, nummer, btw_pct, Math.round(subtotaal*100)/100,
           btw_bedrag, totaal, geldig_tot||null, notities||null);
    const offerte_id = result.lastInsertRowid;
    for (const regel of regels) {
      db.prepare(`INSERT INTO offerte_regels (offerte_id,job_id,omschrijving,aantal,eenheidsprijs,regeltotaal)
        VALUES (?,?,?,?,?,?)`)
        .run(offerte_id, regel.job_id||null, regel.omschrijving,
             regel.aantal||1, regel.eenheidsprijs,
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
