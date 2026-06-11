import { Router } from 'express';
import { getDb } from '../db.js';
const r = Router();

// Genereer automatisch lotnummer: MERK-MAT-001
function nextLotnummer(db, filament_type_id) {
  const type = db.prepare('SELECT merk, materiaal FROM filament_types WHERE id = ?').get(filament_type_id);
  if (!type) return null;

  // Bouw prefix: eerste 4 tekens merk + eerste 3 tekens materiaal, hoofdletters, geen spaties
  const merkPart = type.merk.replace(/\s+/g, '').substring(0, 4).toUpperCase();
  const matPart  = type.materiaal.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const prefix   = `${merkPart}-${matPart}-`;

  // Zoek hoogste volgnummer voor dit type
  const bestaande = db.prepare(
    "SELECT lotnummer FROM filament_rollen WHERE filament_type_id = ? AND lotnummer LIKE ?"
  ).all(filament_type_id, `${prefix}%`);

  let maxNr = 0;
  for (const row of bestaande) {
    const deel = row.lotnummer?.replace(prefix, '');
    const nr   = parseInt(deel);
    if (!isNaN(nr) && nr > maxNr) maxNr = nr;
  }

  return `${prefix}${String(maxNr + 1).padStart(3, '0')}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

r.get('/types', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM filament_types ORDER BY merk, materiaal').all());
});

r.post('/types', (req, res) => {
  const db = getDb();
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  if (!merk || !materiaal) return res.status(400).json({ error: 'Merk en materiaal zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  if (isNaN(prijs) || prijs <= 0) return res.status(400).json({ error: 'Prijs moet een positief getal zijn' });
  const result = db.prepare(
    'INSERT INTO filament_types (merk,materiaal,inkoop_prijs_per_kg,dichtheid_g_per_cm3,leverancier,notities) VALUES (?,?,?,?,?,?)'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3) || 1.24, leverancier || null, notities || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/types/:id', (req, res) => {
  const db = getDb();
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities } = req.body;
  if (!merk || !materiaal) return res.status(400).json({ error: 'Merk en materiaal zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  if (isNaN(prijs) || prijs <= 0) return res.status(400).json({ error: 'Prijs moet een positief getal zijn' });
  db.prepare(
    'UPDATE filament_types SET merk=?,materiaal=?,inkoop_prijs_per_kg=?,dichtheid_g_per_cm3=?,leverancier=?,notities=? WHERE id=?'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3) || 1.24, leverancier || null, notities || null, req.params.id);
  res.json({ ok: true });
});

r.delete('/types/:id', (req, res) => {
  const db = getDb();
  try {
    const gekoppeld = db.prepare('SELECT COUNT(*) as n FROM filament_rollen WHERE filament_type_id = ?').get(req.params.id);
    if (gekoppeld.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: ${gekoppeld.n} rol(len) gekoppeld aan dit type. Verwijder eerst de rollen.` });
    const inOfferte = db.prepare('SELECT COUNT(*) as n FROM offertes_v2 WHERE filament_type_id = ?').get(req.params.id);
    if (inOfferte.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: type gebruikt in ${inOfferte.n} offerte(s).` });
    const info = db.prepare('DELETE FROM filament_types WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Type niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rollen ───────────────────────────────────────────────────────────────────

r.get('/rollen', (req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT r.*,
        ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg,
        ROUND(
          r.gewicht_gram_huidig / 1000.0 *
          COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start / 1000.0, 0), ft.inkoop_prijs_per_kg),
          2
        ) as restwaarde_eur,
        COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start / 1000.0, 0), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
      FROM filament_rollen r
      JOIN filament_types ft ON ft.id = r.filament_type_id
      ORDER BY r.actief DESC, ft.merk
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET rollen gefilterd op type — voor dropdown in offerte
r.get('/rollen/by-type/:type_id', (req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT r.*,
        ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg,
        COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start / 1000.0, 0), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
      FROM filament_rollen r
      JOIN filament_types ft ON ft.id = r.filament_type_id
      WHERE r.filament_type_id = ? AND r.actief = 1
      ORDER BY r.gewicht_gram_huidig DESC
    `).all(req.params.type_id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET voorgesteld lotnummer voor een type
r.get('/rollen/next-lot/:type_id', (req, res) => {
  try {
    const lot = nextLotnummer(getDb(), req.params.type_id);
    res.json({ lotnummer: lot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/rollen', (req, res) => {
  const db = getDb();
  try {
    const { filament_type_id, kleur, gewicht_gram_start, locatie, gekocht_op, aankoopprijs_eur, lotnummer } = req.body;
    if (!filament_type_id) return res.status(400).json({ error: 'filament_type_id is verplicht' });
    const gram  = parseFloat(gewicht_gram_start) || 1000;
    const prijs = (aankoopprijs_eur !== undefined && aankoopprijs_eur !== '') ? parseFloat(aankoopprijs_eur) : null;
    // Automatisch lotnummer als niet opgegeven
    const lot   = lotnummer || nextLotnummer(db, filament_type_id);
    const result = db.prepare(
      'INSERT INTO filament_rollen (filament_type_id,kleur,gewicht_gram_start,gewicht_gram_huidig,locatie,gekocht_op,aankoopprijs_eur,lotnummer) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      filament_type_id, kleur || null, gram, gram,
      locatie || null, gekocht_op || new Date().toISOString().split('T')[0],
      prijs, lot
    );
    res.status(201).json({ id: result.lastInsertRowid, lotnummer: lot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/rollen/:id', (req, res) => {
  const db = getDb();
  try {
    const { filament_type_id, gewicht_gram_start, gewicht_gram_huidig, kleur, locatie, actief, aankoopprijs_eur, lotnummer, gekocht_op } = req.body;
    const startG  = parseFloat(gewicht_gram_start) || 1000;
    const huidigG = parseFloat(gewicht_gram_huidig) ?? startG;
    const prijs   = (aankoopprijs_eur !== undefined && aankoopprijs_eur !== '') ? parseFloat(aankoopprijs_eur) : null;
    db.prepare(
      `UPDATE filament_rollen
       SET filament_type_id=?, gewicht_gram_start=?, gewicht_gram_huidig=?,
           kleur=?, locatie=?, actief=?, aankoopprijs_eur=?, lotnummer=?, gekocht_op=?
       WHERE id=?`
    ).run(
      filament_type_id, startG, huidigG,
      kleur || null, locatie || null, actief ? 1 : 0,
      prijs, lotnummer || null,
      gekocht_op || new Date().toISOString().split('T')[0],
      req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/rollen/:id', (req, res) => {
  const db = getDb();
  try {
    const inGebruik = db.prepare('SELECT COUNT(*) as n FROM job_materialen WHERE filament_rol_id = ?').get(req.params.id);
    if (inGebruik.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: rol is gebruikt in ${inGebruik.n} job(s).` });
    const info = db.prepare('DELETE FROM filament_rollen WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Rol niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
