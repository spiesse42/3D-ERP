import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

// Aanvaardt "#RRGGBB", "RRGGBB", "rgb(r,g,b)" of "r,g,b" en geeft altijd
// een genormaliseerde "#rrggbb" terug, of null bij een ongeldige invoer.
function normaliseerHex(input) {
  if (!input) return null;
  const s = String(input).trim();

  const hexMatch = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (hexMatch) return `#${hexMatch[1].toLowerCase()}`;

  const rgbMatch = s.match(/^rgb\(?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
  if (rgbMatch) {
    const [r1, g1, b1] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(Number);
    if ([r1, g1, b1].some(v => v > 255)) return null;
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
  }

  return null;
}

r.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT id, naam, hex FROM custom_kleuren ORDER BY aangemaakt_op').all();
  res.json(rows);
});

r.post('/', (req, res) => {
  const db = getDb();
  const hex = normaliseerHex(req.body.hex ?? req.body.waarde);
  if (!hex) return res.status(400).json({ error: 'Ongeldige kleurcode — gebruik #RRGGBB of rgb(r,g,b)' });
  const naam = (req.body.naam || '').trim() || null;

  const bestaande = db.prepare('SELECT id, naam, hex FROM custom_kleuren WHERE hex = ?').get(hex);
  if (bestaande) {
    if (naam && !bestaande.naam) db.prepare('UPDATE custom_kleuren SET naam = ? WHERE id = ?').run(naam, bestaande.id);
    return res.json({ id: bestaande.id, naam: naam || bestaande.naam, hex });
  }

  const result = db.prepare('INSERT INTO custom_kleuren (naam, hex) VALUES (?,?)').run(naam, hex);
  res.status(201).json({ id: result.lastInsertRowid, naam, hex });
});

export default r;
