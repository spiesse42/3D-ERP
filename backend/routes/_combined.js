import { Router } from 'express';
import { getDb } from '../db.js';

// --- BETALINGEN ---
export const betalingen = Router();

betalingen.post('/', (req, res) => {
  const db = getDb();
  const { offerte_id, bedrag, methode, betaald_op, referentie } = req.body;
  if (!offerte_id || !bedrag) return res.status(400).json({ error: 'offerte_id en bedrag zijn verplicht' });
  const result = db.prepare(
    'INSERT INTO betalingen (offerte_id,bedrag,methode,status,betaald_op,referentie) VALUES (?,?,?,?,?,?)'
  ).run(offerte_id, bedrag, methode||'overschrijving', 'betaald', betaald_op||new Date().toISOString(), referentie||null);
  const offerte = db.prepare('SELECT * FROM offertes WHERE id = ?').get(offerte_id);
  const betaald = db.prepare('SELECT COALESCE(SUM(bedrag),0) as s FROM betalingen WHERE offerte_id = ? AND status = ?')
    .get(offerte_id, 'betaald').s;
  if (betaald >= offerte.totaal) {
    db.prepare('UPDATE offertes SET status = ? WHERE id = ?').run('betaald', offerte_id);
  }
  res.status(201).json({ id: result.lastInsertRowid });
});

// --- TARIEVEN ---
export const tarieven = Router();

tarieven.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM tarieven ORDER BY sleutel').all());
});

tarieven.put('/:sleutel', (req, res) => {
  const db = getDb();
  const { waarde } = req.body;
  db.prepare('UPDATE tarieven SET waarde = ? WHERE sleutel = ?').run(waarde, req.params.sleutel);
  res.json({ ok: true });
});

// --- HOME ASSISTANT ---
export const ha = Router();

const HA_URL   = process.env.HA_URL   || 'http://supervisor/core';
const HA_TOKEN = process.env.HA_TOKEN || '';

async function haGet(path) {
  const res = await fetch(`${HA_URL}/api/${path}`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' }
  });
  return res.json();
}

ha.get('/state/:entity', async (req, res) => {
  try {
    const data = await haGet(`states/${req.params.entity}`);
    res.json({ entity_id: data.entity_id, state: data.state, attributes: data.attributes });
  } catch (e) {
    res.status(502).json({ error: 'HA niet bereikbaar', detail: e.message });
  }
});

ha.get('/printer-status', async (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE actief = 1').all();
  const results = await Promise.all(printers.map(async p => {
    let kwh = null, status = null;
    try {
      if (p.kwh_entity) {
        const s = await haGet(`states/${p.kwh_entity}`);
        kwh = parseFloat(s.state) || null;
      }
      if (p.ha_entity_prefix) {
        const s = await haGet(`states/${p.ha_entity_prefix}print_status`);
        status = s.state;
      }
    } catch {}
    return { id: p.id, naam: p.naam, kwh, status };
  }));
  res.json(results);
});

// --- RAPPORTAGE ---
export const rapportage = Router();

rapportage.get('/dashboard', (req, res) => {
  const db = getDb();
  const omzet_maand = db.prepare(`
    SELECT strftime('%Y-%m', voltooid_op) as maand, COUNT(*) as jobs,
      ROUND(SUM(jk.verkoopprijs),2) as omzet, ROUND(SUM(jk.totaal_kost),2) as kost,
      ROUND(SUM(jk.kwh_verbruikt),2) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid' AND j.voltooid_op IS NOT NULL
    GROUP BY maand ORDER BY maand DESC LIMIT 12
  `).all();

  const stock = db.prepare(`
    SELECT ft.materiaal, ROUND(SUM(r.gewicht_gram_huidig),0) as gram_totaal,
      ROUND(SUM(r.gewicht_gram_huidig/1000*ft.inkoop_prijs_per_kg),2) as waarde_eur
    FROM filament_rollen r JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE r.actief = 1 GROUP BY ft.materiaal
  `).all();

  const openstaand = db.prepare(`
    SELECT COUNT(*) as c, ROUND(SUM(totaal),2) as bedrag FROM offertes
    WHERE status IN ('concept','verstuurd','goedgekeurd')
  `).get();

  const jobs_status = db.prepare(`
    SELECT status, COUNT(*) as c FROM jobs GROUP BY status
  `).all();

  res.json({ omzet_maand, stock, openstaand, jobs_status });
});

rapportage.get('/csv/jobs', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT j.id, j.naam, j.status, k.naam as klant, p.naam as printer,
      j.print_uren_werkelijk, jk.materiaal_kost, jk.energie_kost, jk.machine_kost,
      jk.arbeid_kost, jk.bmcu_slijtage, jk.verkoopprijs, jk.kwh_verbruikt,
      j.aangemaakt_op, j.voltooid_op
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    ORDER BY j.aangemaakt_op DESC
  `).all();
  const headers = Object.keys(rows[0] || {}).join(';');
  const lines = rows.map(r => Object.values(r).map(v => v ?? '').join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jobs-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send([headers, ...lines].join('\n'));
});
