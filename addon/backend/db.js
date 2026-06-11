import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateDb } from './db_migration.js';
import { migrateDbV2 } from './db_migration_v2.js';
import { migrateDbV3 } from './db_migration_v3.js';
import { migrateDbV4 } from './db_migration_v4.js';
import { migrateDbV5 } from './db_migration_v5.js';
import { migrateDbV6 } from './db_migration_v6.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'erp.db');

let db;

export function getDb() {
  if (!db) throw new Error('Database niet geïnitialiseerd');
  return db;
}

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'FDM',
      ha_entity_prefix TEXT,
      kwh_entity TEXT,
      machine_kost_per_uur REAL NOT NULL DEFAULT 0.13,
      heeft_bmcu INTEGER NOT NULL DEFAULT 0,
      actief INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS klanten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      email TEXT,
      telefoon TEXT,
      adres TEXT,
      btw_nummer TEXT,
      notities TEXT,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS filament_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merk TEXT NOT NULL,
      materiaal TEXT NOT NULL,
      inkoop_prijs_per_kg REAL NOT NULL,
      dichtheid_g_per_cm3 REAL NOT NULL DEFAULT 1.24,
      leverancier TEXT,
      notities TEXT
    );

    CREATE TABLE IF NOT EXISTS filament_rollen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE RESTRICT,
      kleur TEXT,
      gewicht_gram_start REAL NOT NULL DEFAULT 1000.0,
      gewicht_gram_huidig REAL NOT NULL DEFAULT 1000.0,
      locatie TEXT,
      gekocht_op TEXT NOT NULL DEFAULT (date('now')),
      actief INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klant_id INTEGER REFERENCES klanten(id) ON DELETE SET NULL,
      printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
      naam TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'gepland'
        CHECK (status IN ('gepland','bezig','voltooid','gefaald','geannuleerd')),
      stl_bestandsnaam TEXT,
      print_uren_geschat REAL,
      print_uren_werkelijk REAL,
      is_multicolor INTEGER NOT NULL DEFAULT 0,
      aantal_kleuren INTEGER NOT NULL DEFAULT 1,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
      gestart_op TEXT,
      voltooid_op TEXT,
      notities TEXT
    );

    CREATE TABLE IF NOT EXISTS job_materialen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      filament_rol_id INTEGER NOT NULL REFERENCES filament_rollen(id) ON DELETE RESTRICT,
      gram_gebruikt REAL NOT NULL CHECK (gram_gebruikt > 0)
    );

    CREATE TABLE IF NOT EXISTS job_kosten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
      materiaal_kost REAL NOT NULL DEFAULT 0,
      energie_kost REAL NOT NULL DEFAULT 0,
      machine_kost REAL NOT NULL DEFAULT 0,
      arbeid_kost REAL NOT NULL DEFAULT 0,
      bmcu_slijtage REAL NOT NULL DEFAULT 0,
      faalfactor_pct REAL NOT NULL DEFAULT 10,
      winstmarge_pct REAL NOT NULL DEFAULT 10,
      totaal_kost REAL NOT NULL DEFAULT 0,
      verkoopprijs REAL NOT NULL DEFAULT 0,
      kwh_verbruikt REAL NOT NULL DEFAULT 0,
      berekend_op TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offertes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klant_id INTEGER NOT NULL REFERENCES klanten(id) ON DELETE RESTRICT,
      nummer TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'concept'
        CHECK (status IN ('concept','verstuurd','goedgekeurd','gefactureerd','betaald','geannuleerd')),
      subtotaal REAL NOT NULL DEFAULT 0,
      btw_pct REAL NOT NULL DEFAULT 21,
      btw_bedrag REAL NOT NULL DEFAULT 0,
      totaal REAL NOT NULL DEFAULT 0,
      geldig_tot TEXT,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
      notities TEXT
    );

    CREATE TABLE IF NOT EXISTS offerte_regels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offerte_id INTEGER NOT NULL REFERENCES offertes(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      omschrijving TEXT NOT NULL,
      aantal INTEGER NOT NULL DEFAULT 1,
      eenheidsprijs REAL NOT NULL,
      regeltotaal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS betalingen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offerte_id INTEGER NOT NULL REFERENCES offertes(id) ON DELETE RESTRICT,
      bedrag REAL NOT NULL,
      methode TEXT NOT NULL DEFAULT 'overschrijving'
        CHECK (methode IN ('overschrijving','cash','payconiq','paypal','andere')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','betaald','gedeeltelijk','terugbetaald')),
      betaald_op TEXT,
      referentie TEXT
    );

    CREATE TABLE IF NOT EXISTS tarieven (
      sleutel TEXT PRIMARY KEY,
      waarde REAL NOT NULL,
      eenheid TEXT,
      label TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_klant     ON jobs(klant_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_printer   ON jobs(printer_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status    ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_job_mat_job    ON job_materialen(job_id);
    CREATE INDEX IF NOT EXISTS idx_offerte_regels ON offerte_regels(offerte_id);
    CREATE INDEX IF NOT EXISTS idx_betalingen     ON betalingen(offerte_id);
  `);

  // Migraties
  migrateDb(db);
  migrateDbV2(db);
  migrateDbV3(db);
  migrateDbV4(db);
  migrateDbV5(db);
 migrateDbV6(db);

  const printerCount = db.prepare('SELECT COUNT(*) as c FROM printers').get().c;
  if (printerCount === 0) {
    db.prepare(`INSERT INTO printers (naam,type,ha_entity_prefix,kwh_entity,machine_kost_per_uur,heeft_bmcu,actief) VALUES (?,?,?,?,?,?,?)`)
      .run('Ender 3 S1 Pro','FDM',null,'sensor.lsc_power_plug_fr_incl_power_meter_5_totaal_energieverbruik',0.13,0,1);
    db.prepare(`INSERT INTO printers (naam,type,ha_entity_prefix,kwh_entity,machine_kost_per_uur,heeft_bmcu,actief) VALUES (?,?,?,?,?,?,?)`)
      .run('Bambu A1 Mini','FDM','sensor.a1mini_0300da611800680_','sensor.lsc_power_plug_fr_incl_power_meter_6_totaal_energieverbruik',0.13,1,1);
  }

  const tarievenCount = db.prepare('SELECT COUNT(*) as c FROM tarieven').get().c;
  if (tarievenCount === 0) {
    const ins = db.prepare('INSERT INTO tarieven (sleutel,waarde,eenheid,label) VALUES (?,?,?,?)');
    ins.run('kwh_prijs',        0.35,  'EUR/kWh', 'Elektriciteitsprijs');
    ins.run('arbeid_per_uur',  15.00,  'EUR/u',   'Arbeidskost');
    ins.run('faalfactor_pct',  10.00,  '%',        'Faalfactor');
    ins.run('winstmarge_pct',  10.00,  '%',        'Winstmarge');
    ins.run('bmcu_per_job',     0.10,  'EUR',      'BMCU slijtage per multicolor job');
  }

  const filamentCount = db.prepare('SELECT COUNT(*) as c FROM filament_types').get().c;
  if (filamentCount === 0) {
    const ins = db.prepare('INSERT INTO filament_types (merk,materiaal,inkoop_prijs_per_kg,dichtheid_g_per_cm3,leverancier) VALUES (?,?,?,?,?)');
    ins.run('Elegoo',   'Rapid PLA+', 16.00, 1.24, 'Amazon');
    ins.run('Tinmorry', 'PETG-Eco',   20.00, 1.27, 'Amazon');
    ins.run('Bambu',    'PLA Basic',  22.00, 1.24, 'Bambu Lab');
    ins.run('Cailab',   'PLA+ Bio',   26.00, 1.24, 'Cailab');
  }

  console.log('Database geïnitialiseerd:', DB_PATH);
}
