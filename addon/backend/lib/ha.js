// backend/lib/ha.js — gedeelde Home Assistant API-helpers.
// Voorheen woordelijk gedupliceerd in sampler.js en routes/_combined.js;
// hier samengevoegd zodat de url/token-logica maar op 1 plek staat en niet
// meer apart kan gaan afwijken tussen de twee bestanden.
import { getDb } from '../db.js';

export function getHaConfig() {
  try {
    const db = getDb();
    const urlRow   = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'ha_url'").get();
    return {
      url:   urlRow?.waarde   || process.env.HA_URL   || 'http://supervisor/core',
      // De add-onoptie heeft voorrang. De database-terugval is enkel voor
      // bestaande installaties tijdens de overgang; nieuwe tokens worden niet
      // meer door de webapp opgeslagen.
      // Een expliciet ingestelde add-on-token krijgt voorrang. Staat die
      // leeg, dan blijft een bestaande legacy-token bruikbaar; pas daarna
      // valt de add-on terug op de Supervisor-token voor lokale HA-toegang.
      token: process.env.HA_TOKEN_CONFIGURED === 'true'
        ? process.env.HA_TOKEN
        : db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'ha_token'").get()?.waarde || process.env.HA_TOKEN || '',
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

// POST-variant voor service calls (bv. button.press, light.toggle).
export async function haPost(path, body) {
  const { url, token } = getHaConfig();
  const res = await fetch(`${url}/api/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`HA HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// Rauwe fetch (geen JSON-parse) — nodig om bv. een MJPEG-camerastream 1-op-1
// door te geven aan de browser zonder het HA-token daarbij bloot te geven.
export async function haFetchRaw(path) {
  const { url, token } = getHaConfig();
  const res = await fetch(`${url}/api/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HA HTTP ${res.status}`);
  return res;
}
