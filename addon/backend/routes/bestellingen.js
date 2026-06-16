import { Router } from 'express';
import { getDb } from '../db.js';
import { nextLotnummer } from './filament.js';
const r = Router();

// ── Leveranciers (CRUD) ───────────────────────────────────────────────────

r.get('/leveranciers', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM leveranciers ORDER BY naam').all());
});

r.post('/leveranciers', (req, res) => {
  const db = getDb();
  const { naam, website, notities } = req.body;
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  const result = db.prepare('INSERT INTO leveranciers (naam, website, notities) VALUES (?,?,?)')
    .run(naam, website || null, notities || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/leveranciers/:id', (req, res) => {
  const db = getDb();
  const { naam, website, notities } = req.body;
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  db.prepare('UPDATE leveranciers SET naam=?, website=?, notities=? WHERE id=?')
    .run(naam, website || null, notities || null, req.params.id);
  res.json({ ok: true });
});

r.delete('/leveranciers/:id', (req, res) => {
  const db = getDb();
  try {
    const gekoppeld = db.prepare('SELECT COUNT(*) as n FROM bestellingen WHERE leverancier_id = ?').get(req.params.id);
    if (gekoppeld.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: ${gekoppeld.n} bestelling(en) gekoppeld aan deze leverancier.` });
    const info = db.prepare('DELETE FROM leveranciers WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Leverancier niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Te bestellen overzicht — automatisch (laag op voorraad) + manueel, per artikeltype ──
// Let op: dit is een NIEUW endpoint naast het bestaande /api/filament/te-bestellen
// (dat blijft ongewijzigd voor het Dashboard-widget, per-rol). Dit endpoint groepeert per
// artikeltype, specifiek voor de bestel-flow hieronder.

r.get('/te-bestellen-overzicht', (req, res) => {
  try {
    const db = getDb();

    const automatisch = db.prepare(`
      SELECT ft.id as filament_type_id, ft.merk, ft.materiaal, ft.categorie, ft.eenheid,
        r.kleur, r.kleur_hex,
        COUNT(*) as aantal_laag_rollen,
        MIN(r.gewicht_gram_huidig) as laagste_voorraad
      FROM filament_rollen r
      JOIN filament_types ft ON ft.id = r.filament_type_id
      WHERE r.actief = 1
        AND r.gewicht_gram_huidig < COALESCE(
          ft.min_voorraad,
          CASE WHEN r.gewicht_gram_start <= 200 THEN 50 ELSE 100 END
        )
      GROUP BY ft.id, r.kleur
    `).all();

    const handmatig = db.prepare(`
      SELECT tb.id as handmatig_id, tb.notitie, tb.toegevoegd_op, tb.kleur, tb.kleur_hex,
        ft.id as filament_type_id, ft.merk, ft.materiaal, ft.categorie, ft.eenheid
      FROM te_bestellen_handmatig tb
      JOIN filament_types ft ON ft.id = tb.filament_type_id
    `).all();

    const sleutel = (typeId, kleur) => `${typeId}::${kleur || ''}`;
    const map = new Map();
    for (const a of automatisch) {
      map.set(sleutel(a.filament_type_id, a.kleur), {
        filament_type_id: a.filament_type_id, merk: a.merk, materiaal: a.materiaal,
        categorie: a.categorie, eenheid: a.eenheid, kleur: a.kleur, kleur_hex: a.kleur_hex,
        automatisch: true, laagste_voorraad: a.laagste_voorraad, aantal_laag_rollen: a.aantal_laag_rollen,
        handmatig: false, handmatig_id: null, notitie: null
      });
    }
    for (const h of handmatig) {
      const key = sleutel(h.filament_type_id, h.kleur);
      const bestaand = map.get(key);
      if (bestaand) {
        bestaand.handmatig = true;
        bestaand.handmatig_id = h.handmatig_id;
        bestaand.notitie = h.notitie;
        if (!bestaand.kleur_hex && h.kleur_hex) bestaand.kleur_hex = h.kleur_hex;
      } else {
        map.set(key, {
          filament_type_id: h.filament_type_id, merk: h.merk, materiaal: h.materiaal,
          categorie: h.categorie, eenheid: h.eenheid, kleur: h.kleur, kleur_hex: h.kleur_hex,
          automatisch: false, laagste_voorraad: null, aantal_laag_rollen: 0,
          handmatig: true, handmatig_id: h.handmatig_id, notitie: h.notitie
        });
      }
    }

    res.json(Array.from(map.values()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/te-bestellen-handmatig', (req, res) => {
  const db = getDb();
  try {
    const { filament_type_id, kleur, kleur_hex, notitie } = req.body;
    if (!filament_type_id) return res.status(400).json({ error: 'filament_type_id is verplicht' });
    const bestaat = db.prepare(
      "SELECT id FROM te_bestellen_handmatig WHERE filament_type_id = ? AND COALESCE(kleur,'') = COALESCE(?,'')"
    ).get(filament_type_id, kleur || null);
    if (bestaat) return res.status(409).json({ error: 'Dit artikel (in deze kleur) staat al manueel op de "te bestellen"-lijst' });
    const result = db.prepare(
      'INSERT INTO te_bestellen_handmatig (filament_type_id, kleur, kleur_hex, notitie) VALUES (?,?,?,?)'
    ).run(filament_type_id, kleur || null, kleur_hex || null, notitie || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/te-bestellen-handmatig/:id', (req, res) => {
  const info = getDb().prepare('DELETE FROM te_bestellen_handmatig WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Niet gevonden' });
  res.json({ ok: true });
});

// ── Bestellingen ──────────────────────────────────────────────────────────

r.get('/', (req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT b.*, l.naam as leverancier_naam,
        (SELECT COUNT(*) FROM bestelling_items WHERE bestelling_id = b.id) as aantal_items,
        (SELECT COUNT(*) FROM bestelling_items WHERE bestelling_id = b.id AND ontvangen = 1) as aantal_ontvangen
      FROM bestellingen b
      JOIN leveranciers l ON l.id = b.leverancier_id
      ORDER BY (b.status = 'ontvangen'), b.besteld_op DESC
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const bestelling = db.prepare(`
      SELECT b.*, l.naam as leverancier_naam, l.website as leverancier_website
      FROM bestellingen b JOIN leveranciers l ON l.id = b.leverancier_id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!bestelling) return res.status(404).json({ error: 'Bestelling niet gevonden' });
    const items = db.prepare(`
      SELECT bi.*, ft.merk, ft.materiaal, ft.categorie, ft.eenheid
      FROM bestelling_items bi
      JOIN filament_types ft ON ft.id = bi.filament_type_id
      WHERE bi.bestelling_id = ?
      ORDER BY bi.ontvangen ASC, ft.merk
    `).all(req.params.id);
    res.json({ ...bestelling, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/', (req, res) => {
  const db = getDb();
  try {
    const { leverancier_id, referentie, notities, besteld_op, items } = req.body;
    if (!leverancier_id) return res.status(400).json({ error: 'leverancier_id is verplicht' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Minstens 1 item is verplicht' });

    const insertBestelling = db.prepare(
      'INSERT INTO bestellingen (leverancier_id, referentie, besteld_op, notities) VALUES (?,?,?,?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO bestelling_items (bestelling_id, filament_type_id, kleur, kleur_hex, aantal, prijs_totaal, notities) VALUES (?,?,?,?,?,?,?)'
    );
    const verwijderHandmatig = db.prepare(
      "DELETE FROM te_bestellen_handmatig WHERE filament_type_id = ? AND COALESCE(kleur,'') = COALESCE(?,'')"
    );

    const bestellingId = db.transaction(() => {
      const info = insertBestelling.run(
        leverancier_id, referentie || null,
        besteld_op || new Date().toISOString().split('T')[0],
        notities || null
      );
      const id = info.lastInsertRowid;
      for (const item of items) {
        if (!item.filament_type_id) throw new Error('Elk item heeft een filament_type_id nodig');
        insertItem.run(
          id, item.filament_type_id, item.kleur || null, item.kleur_hex || null,
          (item.aantal !== undefined && item.aantal !== '') ? parseFloat(item.aantal) : null,
          (item.prijs_totaal !== undefined && item.prijs_totaal !== '') ? parseFloat(item.prijs_totaal) : null,
          item.notities || null
        );
        verwijderHandmatig.run(item.filament_type_id, item.kleur || null);
      }
      return id;
    })();

    res.status(201).json({ id: bestellingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:id', (req, res) => {
  const { referentie, notities } = req.body;
  getDb().prepare('UPDATE bestellingen SET referentie=?, notities=? WHERE id=?')
    .run(referentie || null, notities || null, req.params.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const ontvangenItems = db.prepare('SELECT COUNT(*) as n FROM bestelling_items WHERE bestelling_id = ? AND ontvangen = 1').get(req.params.id);
    if (ontvangenItems.n > 0)
      return res.status(409).json({ error: 'Kan niet verwijderen: deze bestelling heeft al ontvangen items.' });
    const info = db.prepare('DELETE FROM bestellingen WHERE id = ?').run(req.params.id); // items vallen weg via ON DELETE CASCADE
    if (info.changes === 0) return res.status(404).json({ error: 'Bestelling niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Ontvangst: item regel-per-regel in voorraad steken ──────────────────────
// Maakt een nieuwe filament_rollen-rij aan (zoals "Nieuwe voorraad toevoegen") en
// koppelt die aan het bestelling_item. Werkt de status van de bestelling bij
// (deels_ontvangen / ontvangen) zodra alle items verwerkt zijn.

r.post('/bestelling-items/:id/ontvangen', (req, res) => {
  const db = getDb();
  try {
    const item = db.prepare('SELECT * FROM bestelling_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item niet gevonden' });
    if (item.ontvangen) return res.status(409).json({ error: 'Dit item is al ontvangen' });

    const { gewicht_gram_start, gewicht_gram_huidig, aankoopprijs_eur, kleur, kleur_hex, locatie, gekocht_op, lotnummer } = req.body;
    const startG = parseFloat(gewicht_gram_start);
    if (!startG || isNaN(startG) || startG <= 0) return res.status(400).json({ error: 'Aantal/gewicht is verplicht en moet groter zijn dan 0' });
    const huidigG = (gewicht_gram_huidig !== undefined && gewicht_gram_huidig !== '') ? (parseFloat(gewicht_gram_huidig) || startG) : startG;
    const prijs = (aankoopprijs_eur !== undefined && aankoopprijs_eur !== '') ? parseFloat(aankoopprijs_eur) : null;
    if (!prijs || isNaN(prijs) || prijs <= 0) return res.status(400).json({ error: 'Aankoopprijs is verplicht en moet groter zijn dan 0' });

    const lot = lotnummer || nextLotnummer(db, item.filament_type_id);
    const vandaag = new Date().toISOString().split('T')[0];

    const rolId = db.transaction(() => {
      const rolResult = db.prepare(
        'INSERT INTO filament_rollen (filament_type_id,kleur,kleur_hex,gewicht_gram_start,gewicht_gram_huidig,locatie,gekocht_op,aankoopprijs_eur,lotnummer) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        item.filament_type_id, kleur || null, kleur_hex || null, startG, huidigG,
        locatie || null, gekocht_op || vandaag, prijs, lot
      );
      const nieuweRolId = rolResult.lastInsertRowid;

      db.prepare('UPDATE bestelling_items SET ontvangen=1, ontvangen_op=?, filament_rol_id=? WHERE id=?')
        .run(vandaag, nieuweRolId, item.id);

      const telling = db.prepare(
        'SELECT COUNT(*) as totaal, SUM(ontvangen) as ontvangen FROM bestelling_items WHERE bestelling_id = ?'
      ).get(item.bestelling_id);
      const volledigOntvangen = telling.ontvangen === telling.totaal;
      db.prepare('UPDATE bestellingen SET status=?, ontvangen_op=? WHERE id=?')
        .run(volledigOntvangen ? 'ontvangen' : 'deels_ontvangen', volledigOntvangen ? vandaag : null, item.bestelling_id);

      return nieuweRolId;
    })();

    res.status(201).json({ ok: true, filament_rol_id: rolId, lotnummer: lot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
