import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

const CATEGORIEEN = [
  'materiaal', 'energie', 'software', 'verzekering',
  'marketing', 'afschrijving', 'onderhoud', 'overig',
];

function valideer(body) {
  const { categorie, bedrag } = body;
  if (!categorie || !CATEGORIEEN.includes(categorie)) {
    return 'Ongeldige of ontbrekende categorie';
  }
  const bedragNum = parseFloat(bedrag);
  if (isNaN(bedragNum) || bedragNum <= 0) {
    return 'Bedrag moet groter zijn dan 0';
  }
  return null;
}

// GET /api/uitgaven?van=YYYY-MM-DD&tot=YYYY-MM-DD
r.get('/', (req, res) => {
  try {
    const { van, tot } = req.query;
    let sql = 'SELECT * FROM uitgaven WHERE 1=1';
    const params = [];
    if (van) { sql += ' AND datum >= ?'; params.push(van); }
    if (tot) { sql += ' AND datum <= ?'; params.push(tot); }
    sql += ' ORDER BY datum DESC, id DESC';
    res.json(getDb().prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/', (req, res) => {
  const fout = valideer(req.body);
  if (fout) return res.status(400).json({ error: fout });
  try {
    const { datum, categorie, omschrijving, bedrag, terugkerend, factuur_id } = req.body;
    // factuur_id: interne koppeling naar de aankoopfactuur/het bonnetje
    // waaruit deze uitgave ontstond (zie backend/routes/facturen.js) — enkel
    // voor traceerbaarheid/boekhouding in het systeem, verschijnt nergens op
    // documenten die naar klanten gaan.
    const factuurId = (factuur_id !== undefined && factuur_id !== '' && factuur_id != null) ? parseInt(factuur_id) : null;
    const result = getDb().prepare(`
      INSERT INTO uitgaven (datum, categorie, omschrijving, bedrag, terugkerend, factuur_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      datum || new Date().toISOString().slice(0, 10),
      categorie,
      omschrijving || null,
      parseFloat(bedrag),
      terugkerend ? 1 : 0,
      factuurId,
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:id', (req, res) => {
  const fout = valideer(req.body);
  if (fout) return res.status(400).json({ error: fout });
  try {
    const { datum, categorie, omschrijving, bedrag, terugkerend } = req.body;
    getDb().prepare(`
      UPDATE uitgaven SET datum=?, categorie=?, omschrijving=?, bedrag=?, terugkerend=?
      WHERE id=?
    `).run(
      datum || new Date().toISOString().slice(0, 10),
      categorie,
      omschrijving || null,
      parseFloat(bedrag),
      terugkerend ? 1 : 0,
      req.params.id,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM uitgaven WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
