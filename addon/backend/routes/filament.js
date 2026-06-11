import { Router } from 'express';
import { getDb } from '../db.js';
const r = Router();

r.get('/types', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM filament_types ORDER BY merk, materiaal').all());
});

r.post('/types', (req, res) => {
  const db = getDb();
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  if (!merk || !materiaal || !inkoop_prijs_per_kg)
    return res.status(400).json({ error: 'Merk, materiaal en prijs zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  if (isNaN(prijs) || prijs <= 0)
    return res.status(400).json({ error: 'Prijs moet een positief getal zijn' });
  const result = db.prepare(
    'INSERT INTO filament_types (merk,materiaal,inkoop_prijs_per_kg,dichtheid_g_per_cm3,leverancier,notities) VALUES (?,?,?,?,?,?)'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3)||1.24, leverancier||null, notities||null);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/types/:id', (req, res) => {
  const db = getDb();
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  if (!merk || !materiaal || !inkoop_prijs_per_kg)
    return res.status(400).json({ error: 'Merk, materiaal en prijs zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  if (isNaN(prijs) || prijs <= 0)
    return res.status(400).json({ error: 'Prijs moet een positief getal zijn' });
  db.prepare(
    'UPDATE filament_types SET merk=?,materiaal=?,inkoop_prijs_per_kg=?,dichtheid_g_per_cm3=?,leverancier=?,notities=? WHERE id=?'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3)||1.24, leverancier||null, notities||null, req.params.id);
  res.json({ ok: true });
});

r.delete('/types/:id', (req, res) => {
  const db = getDb();
  const gekoppeld = db.prepare('SELECT COUNT(*) as n FROM filament_rollen WHERE filament_type_id = ?').get(req.params.id);
  if (gekoppeld.n > 0)
    return res.status(409).json({ error: `Kan niet verwijderen: ${gekoppeld.n} rol(len) gekoppeld aan dit type. Verwijder eerst de rollen.` });
  db.prepare('DELETE FROM filament_types WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

r.get('/rollen', (req, res) => {
  const rows = getDb().prepare(`
    SELECT r.*,
      ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg,
      ROUND(
        r.gewicht_gram_huidig / 1000.0 *
        COALESCE(r.aankoopprijs_eur / (r.gewicht_gram_start / 1000.0), ft.inkoop_prijs_per_kg),
        2
      ) as restwaarde_eur,
      COALESCE(r.aankoopprijs_eur / (r.gewicht_gram_start / 1000.0), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
    FROM filament_rollen r
    JOIN filament_types ft ON ft.id = r.filament_type_id
    ORDER BY r.actief DESC, ft.merk
  `).all();
  res.json(rows);
});

r.post('/rollen', (req, res) => {
  const db = getDb();
  const { filament_type_id, kleur, gewicht_gram_start, locatie, gekocht_op, aankoopprijs_eur, lotnummer } = req.body;
  if (!filament_type_id) return res.status(400).json({ error: 'filament_type_id is verplicht' });
  const gram = parseFloat(gewicht_gram_start) || 1000;
  const prijs = aankoopprijs_eur ? parseFloat(aankoopprijs_eur) : null;
  const result = db.prepare(
    'INSERT INTO filament_rollen (filament_type_id,kleur,gewicht_gram_start,gewicht_gram_huidig,locatie,gekocht_op,aankoopprijs_eur,lotnummer) VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    filament_type_id, kleur||null, gram, gram,
    locatie||null, gekocht_op||new Date().toISOString().split('T')[0],
    prijs, lotnummer||null
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/rollen/:id', (req, res) => {
  const db = getDb();
  const { filament_type_id, gewicht_gram_start, gewicht_gram_huidig, kleur, locatie, actief, aankoopprijs_eur, lotnummer } = req.body;
  const prijs = aankoopprijs_eur ? parseFloat(aankoopprijs_eur) : null;
  db.prepare(
    `UPDATE filament_rollen 
     SET filament_type_id=?, gewicht_gram_start=?, gewicht_gram_huidig=?,
         kleur=?, locatie=?, actief=?, aankoopprijs_eur=?, lotnummer=?
     WHERE id=?`
  ).run(
    filament_type_id,
    parseFloat(gewicht_gram_start) || 1000,
    parseFloat(gewicht_gram_huidig) ?? parseFloat(gewicht_gram_start) ?? 1000,
    kleur||null, locatie||null, actief ? 1 : 0,
    prijs, lotnummer||null,
    req.params.id
  );
  res.json({ ok: true });
});

export default r;