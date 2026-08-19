import { getDb } from './db.js';
import fs from 'fs';
import path from 'path';
import { maakBackup } from './routes/reset.js';

// ============================================================
// AUTO-BACKUP — controleert elk uur of het tijd is voor een nieuwe
// automatische backup, ingesteld via de generieke instellingen-tabel
// (backup_auto_actief, backup_auto_interval_uren). Geen aparte
// cron-library nodig: de addon draait sowieso continu, en de check
// gebeurt op basis van de bestandsdatum van de laatste automatische
// backup zelf — dat maakt het robuust tegen herstarts van de addon
// (bv. bij een update), zonder dubbele of overgeslagen backups.
// ============================================================
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // elk uur controleren
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'erp.db');
const ARCHIEF_DIR = path.join(path.dirname(DB_PATH), 'archief');

function leesInstelling(sleutel, standaard) {
  try {
    const rij = getDb().prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
    return rij ? rij.waarde : standaard;
  } catch {
    return standaard;
  }
}

function laatsteAutoBackupUrenGeleden() {
  if (!fs.existsSync(ARCHIEF_DIR)) return Infinity;
  const bestanden = fs.readdirSync(ARCHIEF_DIR)
    .filter(f => f.startsWith('backup_') && f.includes('_automatisch') && f.endsWith('.db'));
  if (bestanden.length === 0) return Infinity;
  const nieuwsteMs = Math.max(...bestanden.map(f => fs.statSync(path.join(ARCHIEF_DIR, f)).mtimeMs));
  return (Date.now() - nieuwsteMs) / (1000 * 60 * 60);
}

async function controleerAutoBackup() {
  try {
    const actief = leesInstelling('backup_auto_actief', '1');
    if (actief === '0') return;

    const intervalUren = parseFloat(leesInstelling('backup_auto_interval_uren', '24')) || 24;
    const urenGeleden = laatsteAutoBackupUrenGeleden();

    if (urenGeleden >= intervalUren) {
      const bestand = await maakBackup('automatisch');
      console.log(`[auto-backup] nieuwe automatische backup: ${bestand}`);
    }
  } catch (e) {
    console.error('[auto-backup] fout bij controle:', e.message);
  }
}

let autoBackupTimer = null;

export function startAutoBackup() {
  if (autoBackupTimer) return;
  // Meteen bij opstart controleren (vangt een gemiste periode op na herstart),
  // en daarna elk uur opnieuw.
  controleerAutoBackup();
  autoBackupTimer = setInterval(controleerAutoBackup, CHECK_INTERVAL_MS);
  console.log('[auto-backup] gestart — controle elk uur');
}
