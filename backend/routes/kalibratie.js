import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

const VELDEN = [
  'flow_ratio', 'max_volumetric_speed',
  'nozzle_temp_eerste_laag', 'nozzle_temp_overige_lagen',
  'bed_temp_eerste_laag', 'bed_temp_overige_lagen',
  'pressure_advance', 'retractie_lengte', 'retractie_snelheid',
];

function naarGetal(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// GET alle kalibraties voor 1 filament type — 1 rij per actieve printer
// (ook printers zonder kalibratie worden meegegeven, met lege velden, zodat de
// UI meteen een invulbare rij per printer kan tonen)
r.get('/type/:filamentTypeId', (req, res) => {
  try {
    // Let op: geen "k.*" hier — k.printer_id/k.filament_type_id zouden anders de
    // hieronder gealiaste p.id/route-param overschrijven zodra ze null zijn
    // (LEFT JOIN zonder match), waardoor printers zonder kalibratie een kapotte
    // printer_id terugkrijgen.
    const rows = getDb().prepare(`
      SELECT p.id as printer_id, p.naam as printer_naam,
        k.id, k.flow_ratio, k.max_volumetric_speed,
        k.nozzle_temp_eerste_laag, k.nozzle_temp_overige_lagen,
        k.bed_temp_eerste_laag, k.bed_temp_overige_lagen,
        k.pressure_advance, k.retractie_lengte, k.retractie_snelheid,
        k.notities, k.bijgewerkt_op
      FROM printers p
      LEFT JOIN filament_kalibraties k
        ON k.printer_id = p.id AND k.filament_type_id = ?
      WHERE p.actief = 1
      ORDER BY p.id
    `).all(req.params.filamentTypeId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT (upsert) — 1 kalibratieset voor een combinatie filament type + printer
r.put('/', (req, res) => {
  const db = getDb();
  const { filament_type_id, printer_id, notities } = req.body;
  if (!filament_type_id || !printer_id) {
    return res.status(400).json({ error: 'filament_type_id en printer_id zijn verplicht' });
  }
  const waarden = Object.fromEntries(VELDEN.map(v => [v, naarGetal(req.body[v])]));

  try {
    db.prepare(`
      INSERT INTO filament_kalibraties
        (filament_type_id, printer_id, ${VELDEN.join(', ')}, notities, bijgewerkt_op)
      VALUES
        (?, ?, ${VELDEN.map(() => '?').join(', ')}, ?, datetime('now'))
      ON CONFLICT(filament_type_id, printer_id) DO UPDATE SET
        ${VELDEN.map(v => `${v}=excluded.${v}`).join(', ')},
        notities=excluded.notities,
        bijgewerkt_op=excluded.bijgewerkt_op
    `).run(filament_type_id, printer_id, ...VELDEN.map(v => waarden[v]), notities || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM filament_kalibraties WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
