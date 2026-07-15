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

function bestaatTabel(db, naam) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(naam);
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

// GET /api/reset/download/:bestand — archiefbestand downloaden
r.get('/download/:bestand', (req, res) => {
  const naam = req.params.bestand;
  // Enkel bestanden die exact het verwachte patroon volgen mogen gedownload worden
  if (!/^archief_\d{4}-\d{2}-\d{2}(_\d+)?\.db$/.test(naam)) {
    return res.status(400).json({ error: 'Ongeldige bestandsnaam.' });
  }
  const volledigPad = path.join(ARCHIEF_DIR, naam);
  if (!fs.existsSync(volledigPad)) {
    return res.status(404).json({ error: 'Archiefbestand niet gevonden.' });
  }
  res.download(volledigPad, naam);
});

// GET /api/reset/archieven — lijst van bestaande archiefbestanden (nieuwste eerst)
r.get('/archieven', (req, res) => {
  fs.mkdirSync(ARCHIEF_DIR, { recursive: true });
  const bestanden = fs.readdirSync(ARCHIEF_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse();
  res.json(bestanden);
});

export default r;
