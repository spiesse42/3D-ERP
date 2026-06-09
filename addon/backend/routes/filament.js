import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

r.get('/types', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM filament_types ORDER BY merk, materiaal').all());
});

r.post('/types', (req, res) => {
  const db = getDb();
  const { merk, materiaal, kleur, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  if (!merk || !materiaal || !kleur || !inkoop_prijs_per_kg)
    return res.status(400).json({ error: 'Merk, materiaal, kleur en prijs zijn verplicht' });
  const result = db.prepare(
    'INSERT INTO filament_types (merk,materiaal,kleur,inkoop_prijs_per_kg,dichtheid_g_per_cm3,leverancier,notities) VALUES (?,?,?,?,?,?,?)'
  ).run(merk, materiaal, kleur, inkoop_prijs_per_kg, dichtheid_g_per_cm3||1.24, leverancier||null, notities||null);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/types/:id', (req, res) => {
  const db = getDb();
  const { merk, materiaal, kleur, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  db.prepare(
    'UPDATE filament_types SET merk=?,materiaal=?,kleur=?,inkoop_prijs_per_kg=?,dichtheid_g_per_cm3=?,leverancier=?,notities=? WHERE id=?'
  ).run(merk, materiaal, kleur, inkoop_prijs_per_kg, dichtheid_g_per_cm3||1.24, leverancier||null, notities||null, req.params.id);
  res.json({ ok: true });
});

r.delete('/types/:id', (req, res) => {
  getDb().prepare('DELETE FROM filament_types WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.get('/rollen', (req, res) => {
  const rows = getDb().prepare(`
    SELECT r.*, ft.merk, ft.materiaal, ft.kleur, ft.inkoop_prijs_per_kg,
      ROUND(r.gewicht_gram_huidig / 1000.0 * ft.inkoop_prijs_per_kg, 2) as restwaarde_eur
    FROM filament_rollen r
    JOIN filament_types ft ON ft.id = r.filament_type_id
    ORDER BY r.actief DESC, ft.merk
  `).all();
  res.json(rows);
});

r.post('/rollen', (req, res) => {
  const db = getDb();
  const { filament_type_id, gewicht_gram_start, locatie, gekocht_op } = req.body;
  if (!filament_type_id) return res.status(400).json({ error: 'filament_type_id is verplicht' });
  const gram = gewicht_gram_start || 1000;
  const result = db.prepare(
    'INSERT INTO filament_rollen (filament_type_id,gewicht_gram_start,gewicht_gram_huidig,locatie,gekocht_op) VALUES (?,?,?,?,?)'
  ).run(filament_type_id, gram, gram, locatie||null, gekocht_op||new Date().toISOString().split('T')[0]);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/rollen/:id', (req, res) => {
  const db = getDb();
  const { gewicht_gram_huidig, locatie, actief } = req.body;
  db.prepare('UPDATE filament_rollen SET gewicht_gram_huidig=?,locatie=?,actief=? WHERE id=?')
    .run(gewicht_gram_huidig, locatie||null, actief?1:0, req.params.id);
  res.json({ ok: true });
});

export default r;
