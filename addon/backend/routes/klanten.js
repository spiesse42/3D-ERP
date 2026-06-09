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
  const { naam, email, telefoon, adres, btw_nummer, notities } = req.body;
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  const result = db.prepare(
    'INSERT INTO klanten (naam,email,telefoon,adres,btw_nummer,notities) VALUES (?,?,?,?,?,?)'
  ).run(naam, email||null, telefoon||null, adres||null, btw_nummer||null, notities||null);
  res.status(201).json({ id: result.lastInsertRowid });
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { naam, email, telefoon, adres, btw_nummer, notities } = req.body;
  db.prepare(
    'UPDATE klanten SET naam=?,email=?,telefoon=?,adres=?,btw_nummer=?,notities=? WHERE id=?'
  ).run(naam, email||null, telefoon||null, adres||null, btw_nummer||null, notities||null, req.params.id);
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM klanten WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
