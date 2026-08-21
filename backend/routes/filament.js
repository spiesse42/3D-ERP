import { Router } from 'express';
import { getDb } from '../db.js';
const r = Router();

// Genereer automatisch lotnummer: MERK-MAT-001
export function nextLotnummer(db, filament_type_id) {
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
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities,
          categorie, eenheid, marge_pct, min_voorraad, vaste_prijs } = req.body;
  if (!merk || !materiaal) return res.status(400).json({ error: 'Merk en materiaal zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  // prijs is optioneel — 0 toegestaan
  const result = db.prepare(
    'INSERT INTO filament_types (merk,materiaal,inkoop_prijs_per_kg,dichtheid_g_per_cm3,leverancier,notities,categorie,eenheid,marge_pct,min_voorraad,vaste_prijs) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3) || 1.24, leverancier || null, notities || null,
        categorie || 'filament', eenheid || 'gram',
        (marge_pct !== undefined && marge_pct !== '') ? parseFloat(marge_pct) : null,
        (min_voorraad !== undefined && min_voorraad !== '') ? parseFloat(min_voorraad) : null,
        vaste_prijs ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/types/:id', (req, res) => {
  const db = getDb();
  const { merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, leverancier, notities,
          categorie, eenheid, marge_pct, min_voorraad, vaste_prijs } = req.body;
  if (!merk || !materiaal) return res.status(400).json({ error: 'Merk en materiaal zijn verplicht' });
  const prijs = parseFloat(inkoop_prijs_per_kg);
  if (isNaN(prijs) || prijs <= 0) return res.status(400).json({ error: 'Prijs moet een positief getal zijn' });
  db.prepare(
    'UPDATE filament_types SET merk=?,materiaal=?,inkoop_prijs_per_kg=?,dichtheid_g_per_cm3=?,leverancier=?,notities=?,categorie=?,eenheid=?,marge_pct=?,min_voorraad=?,vaste_prijs=? WHERE id=?'
  ).run(merk, materiaal, prijs, parseFloat(dichtheid_g_per_cm3) || 1.24, leverancier || null, notities || null,
        categorie || 'filament', eenheid || 'gram',
        (marge_pct !== undefined && marge_pct !== '') ? parseFloat(marge_pct) : null,
        (min_voorraad !== undefined && min_voorraad !== '') ? parseFloat(min_voorraad) : null,
        vaste_prijs ? 1 : 0,
        req.params.id);
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

// GET bestaande kleuren voor een type — voor de kleurkiezer bij bestellen.
// Voor generieke plaatshouder-types (bv. "Generiek PLA") heeft het type zelf
// nooit eigen voorraad (die wordt bij ontvangst altijd naar een échte merk/type
// omgezet) — daarom tonen we dan alle kleuren uit de volledige filament-voorraad,
// ongeacht merk, als suggestie.
r.get('/types/:id/kleuren', (req, res) => {
  try {
    const db = getDb();
    const type = db.prepare('SELECT generiek, categorie FROM filament_types WHERE id = ?').get(req.params.id);
    if (!type) return res.status(404).json({ error: 'Type niet gevonden' });

    const rows = type.generiek
      ? db.prepare(`
          SELECT DISTINCT fr.kleur, fr.kleur_hex FROM filament_rollen fr
          JOIN filament_types ft ON ft.id = fr.filament_type_id
          WHERE ft.categorie = ? AND fr.kleur IS NOT NULL AND fr.kleur != ''
          ORDER BY fr.kleur
        `).all(type.categorie)
      : db.prepare(`
          SELECT DISTINCT kleur, kleur_hex FROM filament_rollen
          WHERE filament_type_id = ? AND kleur IS NOT NULL AND kleur != ''
          ORDER BY kleur
        `).all(req.params.id);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET/PUT het vaste kleurenpalet van een artikeltype (bv. "AnyCubic PETG" is
// enkel in een vaste reeks kleuren verkrijgbaar). Leeg palet = geen beperking,
// de voorraadkleurkiezer gebruikt dan gewoon het globale palet + eigen kleuren.
r.get('/types/:id/kleurenpalet', (req, res) => {
  try {
    const rows = getDb().prepare(
      'SELECT id, naam, hex FROM filament_type_kleuren WHERE filament_type_id = ? ORDER BY volgorde, id'
    ).all(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/types/:id/kleurenpalet', (req, res) => {
  const db = getDb();
  const { kleuren } = req.body;
  if (!Array.isArray(kleuren)) return res.status(400).json({ error: 'kleuren moet een lijst zijn' });
  const type = db.prepare('SELECT id FROM filament_types WHERE id = ?').get(req.params.id);
  if (!type) return res.status(404).json({ error: 'Type niet gevonden' });

  const schoon = kleuren
    .map(k => ({ naam: (k.naam || '').trim(), hex: k.hex || null }))
    .filter(k => k.naam);

  const vervang = db.transaction(() => {
    db.prepare('DELETE FROM filament_type_kleuren WHERE filament_type_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO filament_type_kleuren (filament_type_id, naam, hex, volgorde) VALUES (?,?,?,?)');
    schoon.forEach((k, i) => insert.run(req.params.id, k.naam, k.hex, i));
  });
  try {
    vervang();
    res.json({ ok: true, aantal: schoon.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rollen ───────────────────────────────────────────────────────────────────

r.get('/rollen', (req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT r.*,
        ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg, ft.eenheid, ft.categorie, ft.marge_pct,
        ROUND(
          r.gewicht_gram_huidig *
          COALESCE(
            r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0),
            ft.inkoop_prijs_per_kg / (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END)
          ),
          2
        ) as restwaarde_eur,
        COALESCE(
          r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END),
          ft.inkoop_prijs_per_kg
        ) as prijs_per_kg_effectief
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
        ft.merk, ft.materiaal, ft.inkoop_prijs_per_kg, ft.eenheid,
        COALESCE(
          r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END),
          ft.inkoop_prijs_per_kg
        ) as prijs_per_kg_effectief
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
    const { filament_type_id, kleur, kleur_hex, gewicht_gram_start, locatie, gekocht_op, aankoopprijs_eur, lotnummer, factuur_id } = req.body;
    if (!filament_type_id) return res.status(400).json({ error: 'filament_type_id is verplicht' });
    const gram = parseFloat(gewicht_gram_start);
    if (!gram || isNaN(gram) || gram <= 0) return res.status(400).json({ error: 'Aantal/gewicht is verplicht en moet groter zijn dan 0' });
    const huidigGram = (req.body.gewicht_gram_huidig !== undefined && req.body.gewicht_gram_huidig !== '')
      ? (parseFloat(req.body.gewicht_gram_huidig) || gram)
      : gram;
    const prijsRaw = (aankoopprijs_eur !== undefined && aankoopprijs_eur !== '') ? parseFloat(aankoopprijs_eur) : null;
    const prijs = (prijsRaw != null && !isNaN(prijsRaw) && prijsRaw > 0) ? prijsRaw : null;
    const lot   = lotnummer || nextLotnummer(db, filament_type_id);
    // factuur_id: interne koppeling naar de aankoopfactuur/het bonnetje
    // waaruit deze rol/dit artikel ontstond (zie backend/routes/facturen.js)
    // — enkel voor traceerbaarheid in het systeem, verschijnt nergens op
    // documenten die naar klanten gaan.
    const factuurId = (factuur_id !== undefined && factuur_id !== '' && factuur_id != null) ? parseInt(factuur_id) : null;
    const result = db.prepare(
      'INSERT INTO filament_rollen (filament_type_id,kleur,kleur_hex,gewicht_gram_start,gewicht_gram_huidig,locatie,gekocht_op,aankoopprijs_eur,lotnummer,factuur_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      filament_type_id, kleur || null, kleur_hex || null, gram, huidigGram,
      locatie || null, gekocht_op || new Date().toISOString().split('T')[0],
      prijs, lot, factuurId
    );
    res.status(201).json({ id: result.lastInsertRowid, lotnummer: lot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/rollen/:id', (req, res) => {
  const db = getDb();
  try {
    const { filament_type_id, gewicht_gram_start, gewicht_gram_huidig, kleur, kleur_hex, locatie, actief, aankoopprijs_eur, lotnummer, gekocht_op } = req.body;
    const startG = parseFloat(gewicht_gram_start);
    if (!startG || isNaN(startG) || startG <= 0) return res.status(400).json({ error: 'Aantal/gewicht is verplicht en moet groter zijn dan 0' });
    const huidigG = parseFloat(gewicht_gram_huidig) || startG;
    const prijsRaw = (aankoopprijs_eur !== undefined && aankoopprijs_eur !== '') ? parseFloat(aankoopprijs_eur) : null;
    const prijs   = (prijsRaw != null && !isNaN(prijsRaw) && prijsRaw > 0) ? prijsRaw : null;
    db.prepare(
      `UPDATE filament_rollen
       SET filament_type_id=?, gewicht_gram_start=?, gewicht_gram_huidig=?,
           kleur=?, kleur_hex=?, locatie=?, actief=?, aankoopprijs_eur=?, lotnummer=?, gekocht_op=?
       WHERE id=?`
    ).run(
      filament_type_id, startG, huidigG,
      kleur || null, kleur_hex || null, locatie || null, actief ? 1 : 0,
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

// GET artikelen onder minimum voorraad — voor 'Te bestellen' sectie
r.get('/te-bestellen', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT r.*,
        ft.merk, ft.materiaal, ft.categorie, ft.eenheid, ft.min_voorraad,
        COALESCE(
          r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END),
          ft.inkoop_prijs_per_kg
        ) as prijs_per_kg_effectief
      FROM filament_rollen r
      JOIN filament_types ft ON ft.id = r.filament_type_id
      WHERE r.actief = 1
        AND r.gewicht_gram_huidig < COALESCE(
          ft.min_voorraad,
          CASE WHEN r.gewicht_gram_start <= 200 THEN 50 ELSE 100 END
        )
      ORDER BY r.gewicht_gram_huidig ASC
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
