import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM printers ORDER BY id').all());
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { naam, type, ha_entity_prefix, kwh_entity, machine_kost_per_uur, heeft_bmcu, actief } = req.body;
  db.prepare(`UPDATE printers SET naam=?,type=?,ha_entity_prefix=?,kwh_entity=?,
    machine_kost_per_uur=?,heeft_bmcu=?,actief=? WHERE id=?`)
    .run(naam, type, ha_entity_prefix||null, kwh_entity||null,
      machine_kost_per_uur, heeft_bmcu?1:0, actief?1:0, req.params.id);
  res.json({ ok: true });
});

export default r;
