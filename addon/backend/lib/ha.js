// backend/lib/ha.js — gedeelde Home Assistant API-helpers.
// Voorheen woordelijk gedupliceerd in sampler.js en routes/_combined.js;
// hier samengevoegd zodat de url/token-logica maar op 1 plek staat en niet
// meer apart kan gaan afwijken tussen de twee bestanden.
import { getDb } from '../db.js';

export function getHaConfig() {
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

export async function haGet(path) {
  const { url, token } = getHaConfig();
  const res = await fetch(`${url}/api/${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`HA HTTP ${res.status}`);
  return res.json();
}

export function haGetState(entity) {
  return haGet(`states/${entity}`);
}
