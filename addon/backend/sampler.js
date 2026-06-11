import { Router } from 'express';
import { getDb } from './db.js';

// ============================================================
// HA helper (zelfstandige kopie — leest url+token uit instellingen)
// ============================================================
function getHaConfig() {
  try {
    const db = getDb();
    const urlRow   = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'ha_url'").get();
    const tokenRow = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'ha_token'").get();
    return {
      url:   urlRow?.waarde   || process.env.HA_URL   || 'http://supervisor/core',
      token: tokenRow?.waarde || process.env.HA_TOKEN || '',
    };
  } catch {
    return {
      url:   process.env.HA_URL   || 'http://supervisor/core',
      token: process.env.HA_TOKEN || '',
    };
  }
}

async function haGetState(entity) {
  const { url, token } = getHaConfig();
  const res = await fetch(`${url}/api/states/${entity}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`HA HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// SAMPLER — elke 30 sec watt opslaan voor jobs met status 'bezig'
// ============================================================
const SAMPLE_INTERVAL_MS = 30 * 1000;
let samplerTimer = null;

async function sampleOnce() {
  const db = getDb();

  // Actieve jobs met een printer die een watt_entity heeft
  const actieveJobs = db.prepare(`
    SELECT j.id AS job_id, j.printer_id, p.watt_entity, p.naam AS printer_naam
    FROM jobs j
    JOIN printers p ON p.id = j.printer_id
    WHERE j.status = 'bezig' AND p.watt_entity IS NOT NULL AND p.watt_entity != ''
  `).all();

  if (actieveJobs.length === 0) return;

  // Per unieke entity één keer HA bevragen (meerdere jobs op zelfde printer = zelfde meting)
  const entityWatts = {};
  for (const entity of [...new Set(actieveJobs.map(j => j.watt_entity))]) {
    try {
      const s = await haGetState(entity);
      const w = parseFloat(s.state);
      if (!isNaN(w) && w >= 0) entityWatts[entity] = w;
    } catch (e) {
      console.log(`[sampler] ${entity} niet leesbaar: ${e.message}`);
    }
  }

  const ins = db.prepare(
    'INSERT INTO energy_samples (job_id, printer_id, watt) VALUES (?,?,?)'
  );
  for (const job of actieveJobs) {
    const w = entityWatts[job.watt_entity];
    if (w !== undefined) ins.run(job.job_id, job.printer_id, w);
  }
}

export function startSampler() {
  if (samplerTimer) return;
  samplerTimer = setInterval(() => {
    sampleOnce().catch(e => console.log('[sampler] fout:', e.message));
  }, SAMPLE_INTERVAL_MS);
  console.log(`[sampler] gestart — interval ${SAMPLE_INTERVAL_MS / 1000}s`);
}

// ============================================================
// kWh-berekening uit samples (trapeziumregel)
// Gaten > 120s (server herstart, HA offline) tellen niet mee.
// ============================================================
const MAX_GAP_SEC = 120;

export function berekenJobEnergie(jobId) {
  const db = getDb();
  const samples = db.prepare(`
    SELECT watt, strftime('%s', timestamp) AS ts
    FROM energy_samples
    WHERE job_id = ?
    ORDER BY timestamp ASC
  `).all(jobId);

  if (samples.length === 0) {
    return { samples: 0, kwh: 0, gemiddeld_watt: 0, meetduur_uur: 0 };
  }
  if (samples.length === 1) {
    // Eén sample: neem aan dat die 1 interval geldig was
    const kwh = (samples[0].watt * (SAMPLE_INTERVAL_MS / 1000)) / 3600000;
    return { samples: 1, kwh, gemiddeld_watt: samples[0].watt, meetduur_uur: SAMPLE_INTERVAL_MS / 3600000 };
  }

  let joule = 0;       // wattseconden
  let meetSec = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.min(samples[i].ts - samples[i - 1].ts, MAX_GAP_SEC);
    if (dt <= 0) continue;
    const gemW = (samples[i].watt + samples[i - 1].watt) / 2;  // trapezium
    joule += gemW * dt;
    meetSec += dt;
  }

  const kwh = joule / 3600000;
  return {
    samples: samples.length,
    kwh,
    gemiddeld_watt: meetSec > 0 ? joule / meetSec : 0,
    meetduur_uur: meetSec / 3600,
  };
}

// ============================================================
// ROUTER — GET /api/energie/job/:id
// ============================================================
export const energie = Router();

energie.get('/job/:id', (req, res) => {
  try {
    const result = berekenJobEnergie(parseInt(req.params.id));
    res.json({
      job_id: parseInt(req.params.id),
      samples: result.samples,
      kwh: Math.round(result.kwh * 10000) / 10000,
      gemiddeld_watt: Math.round(result.gemiddeld_watt * 10) / 10,
      meetduur_uur: Math.round(result.meetduur_uur * 100) / 100,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
