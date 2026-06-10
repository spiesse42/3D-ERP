import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT k.*, COUNT(j.id) as aantal_jobs
    FROM klanten k
    LEFT JOIN jobs j ON j.klant_id = k.id
    GROUP BY k.id ORDER BY k.naam
  `).all();
  res.json(rows);
});

r.get('/:id', (req, res) => {
  const db = getDb();
  const klant = db.prepare('SELECT * FROM klanten WHERE id = ?').get(req.params.id);
  if (!klant) return res.status(404).json({ error: 'Niet gevonden' });
  const jobs = db.prepare('SELECT * FROM jobs WHERE klant_id = ? ORDER BY aangemaakt_op DESC').all(req.params.id);
  res.json({ ...klant, jobs });
});

r.post('/', (req, res) => {
  const db = getDb();
  const { naam, voornaam, email, telefoon, gsm, straat, huisnummer, postcode, gemeente, btw_nummer, type, notities, adres } = req.body;
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });

  // Controleer welke kolommen bestaan
  const cols = db.prepare("PRAGMA table_info(klanten)").all().map(c => c.name);
  const hasVoornaam = cols.includes('voornaam');
  const hasStraat = cols.includes('straat');
  const hasPostcode = cols.includes('postcode');
  const hasGsm = cols.includes('gsm');
  const hasType = cols.includes('type');

  try {
    if (hasVoornaam && hasStraat) {
      const result = db.prepare(`
        INSERT INTO klanten (naam,voornaam,email,telefoon,gsm,straat,huisnummer,postcode,gemeente,btw_nummer,type,notities)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(naam, voornaam||null, email||null, telefoon||null, gsm||null,
             straat||null, huisnummer||null, postcode||null, gemeente||null,
             btw_nummer||null, type||'particulier', notities||null);
      return res.status(201).json({ id: result.lastInsertRowid });
    } else {
      // Fallback voor oude db structuur
      const result = db.prepare(
        'INSERT INTO klanten (naam,email,telefoon,adres,btw_nummer,notities) VALUES (?,?,?,?,?,?)'
      ).run(naam, email||null, telefoon||null, adres||straat||null, btw_nummer||null, notities||null);
      return res.status(201).json({ id: result.lastInsertRowid });
    }
  } catch(e) {
    console.error('Klant aanmaken fout:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { naam, voornaam, email, telefoon, gsm, straat, huisnummer, postcode, gemeente, btw_nummer, type, notities, adres } = req.body;

  const cols = db.prepare("PRAGMA table_info(klanten)").all().map(c => c.name);
  const hasVoornaam = cols.includes('voornaam');
  const hasStraat = cols.includes('straat');

  try {
    if (hasVoornaam && hasStraat) {
      db.prepare(`
        UPDATE klanten SET naam=?,voornaam=?,email=?,telefoon=?,gsm=?,straat=?,huisnummer=?,
        postcode=?,gemeente=?,btw_nummer=?,type=?,notities=? WHERE id=?
      `).run(naam, voornaam||null, email||null, telefoon||null, gsm||null,
             straat||null, huisnummer||null, postcode||null, gemeente||null,
             btw_nummer||null, type||'particulier', notities||null, req.params.id);
    } else {
      db.prepare('UPDATE klanten SET naam=?,email=?,telefoon=?,adres=?,btw_nummer=?,notities=? WHERE id=?')
        .run(naam, email||null, telefoon||null, adres||straat||null, btw_nummer||null, notities||null, req.params.id);
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('Klant bijwerken fout:', e.message);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM klanten WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
