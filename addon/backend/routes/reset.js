import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';

const r = express.Router();

const DB_PATH     = process.env.DB_PATH || path.join(process.cwd(), 'erp.db');
const ARCHIEF_DIR  = path.join(path.dirname(DB_PATH), 'archief');

// Tabellen die geleegd worden bij een jaarreset — in veilige volgorde
// (kind-tabellen eerst, zodat FK-restricties niet in de weg zitten).
// klanten, leveranciers, printers, tarieven, instellingen en filament_types
// (materiaal-catalogus) blijven altijd behouden.
const TABELLEN_LEEGMAKEN = [
  'energy_samples',
  'job_kosten',
  'job_materialen',
  'jobs',
  'offertes_v2',
  'bestelling_items',
  'bestellingen',
  'te_bestellen_handmatig',
  'filament_rollen',
];

const MAX_BACKUPS = 20; // handmatig + automatisch samen; jaarreset-archieven tellen hier niet in mee

function bestaatTabel(db, naam) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(naam);
}

// Niet-destructieve backup — enkel db.backup(), geen tabellen worden geleegd.
// Wordt gebruikt door zowel de "Backup nu"-knop (type='handmatig') als de
// automatische-backup-timer (type='automatisch'). Aparte prefix ('backup_')
// t.o.v. de jaarreset-archieven ('archief_') zodat ze nooit door elkaar lopen.
export async function maakBackup(type = 'handmatig') {
  const db = getDb();
  fs.mkdirSync(ARCHIEF_DIR, { recursive: true });

  const nu = new Date();
  const datum = nu.toISOString().slice(0, 10);
  const tijd  = nu.toISOString().slice(11, 16).replace(':', '');
  let bestandsnaam = `backup_${datum}_${tijd}_${type}.db`;
  let volledigPad = path.join(ARCHIEF_DIR, bestandsnaam);
  let teller = 2;
  while (fs.existsSync(volledigPad)) {
    bestandsnaam = `backup_${datum}_${tijd}_${type}_${teller}.db`;
    volledigPad = path.join(ARCHIEF_DIR, bestandsnaam);
    teller++;
  }
  await db.backup(volledigPad);

  // Enkel de laatste MAX_BACKUPS backup_*-bestanden bijhouden (oudste eerst opruimen)
  const backups = fs.readdirSync(ARCHIEF_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .map(f => ({ naam: f, mtime: fs.statSync(path.join(ARCHIEF_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const oud of backups.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(ARCHIEF_DIR, oud.naam));
  }

  return bestandsnaam;
}

// POST /api/reset/nieuw-jaar — archiveert de volledige database en maakt
// vervolgens de transactie-/stocktabellen leeg. Instellingen blijven staan.
r.post('/nieuw-jaar', async (req, res) => {
  if (req.body?.bevestiging !== 'RESET') {
    return res.status(400).json({ error: 'Bevestiging ontbreekt of onjuist.' });
  }

  const db = getDb();

  try {
    // 1. Archiveren — volledige, consistente kopie van de huidige database
    //    (db.backup() respecteert WAL, in tegenstelling tot een ruwe file-copy)
    fs.mkdirSync(ARCHIEF_DIR, { recursive: true });
    const datum = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    let bestandsnaam = `archief_${datum}.db`;
    let volledigPad = path.join(ARCHIEF_DIR, bestandsnaam);
    let teller = 2;
    while (fs.existsSync(volledigPad)) {
      bestandsnaam = `archief_${datum}_${teller}.db`;
      volledigPad = path.join(ARCHIEF_DIR, bestandsnaam);
      teller++;
    }
    await db.backup(volledigPad);

    // 2. Leegmaken — in transactie, zodat het alles-of-niets gebeurt
    const leegmaken = db.transaction(() => {
      for (const tabel of TABELLEN_LEEGMAKEN) {
        if (!bestaatTabel(db, tabel)) continue;
        db.prepare(`DELETE FROM ${tabel}`).run();
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tabel);
      }
    });
    leegmaken();

    res.json({
      ok: true,
      archiefBestand: bestandsnaam,
      leeggemaakt: TABELLEN_LEEGMAKEN,
    });
  } catch (e) {
    console.error('Jaarreset fout:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reset/backup — niet-destructieve backup op aanvraag ("Backup nu")
r.post('/backup', async (req, res) => {
  try {
    const bestandsnaam = await maakBackup('handmatig');
    res.json({ ok: true, bestand: bestandsnaam });
  } catch (e) {
    console.error('Backup fout:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reset/download/:bestand — archief- of backup-bestand downloaden
r.get('/download/:bestand', (req, res) => {
  const naam = req.params.bestand;
  // Enkel bestanden die exact het verwachte patroon volgen mogen gedownload worden
  if (!/^(archief|backup)_\d{4}-\d{2}-\d{2}(_\d{4})?(_(handmatig|automatisch))?(_\d+)?\.db$/.test(naam)) {
    return res.status(400).json({ error: 'Ongeldige bestandsnaam.' });
  }
  const volledigPad = path.join(ARCHIEF_DIR, naam);
  if (!fs.existsSync(volledigPad)) {
    return res.status(404).json({ error: 'Bestand niet gevonden.' });
  }
  res.download(volledigPad, naam);
});

// GET /api/reset/archieven — lijst van bestaande archief-/backupbestanden
// (nieuwste eerst), met type zodat de frontend jaarreset-archieven en
// handmatige/automatische backups apart kan tonen.
r.get('/archieven', (req, res) => {
  fs.mkdirSync(ARCHIEF_DIR, { recursive: true });
  const bestanden = fs.readdirSync(ARCHIEF_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(ARCHIEF_DIR, f));
      let type = 'jaarreset';
      if (f.startsWith('backup_')) {
        type = f.includes('_automatisch') ? 'automatisch' : 'handmatig';
      }
      return { bestand: f, type, aangemaakt: stat.mtime.toISOString(), grootte: stat.size };
    })
    .sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));
  res.json(bestanden);
});

export default r;
