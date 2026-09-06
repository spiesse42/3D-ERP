import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { migrateDb } from './db_migration.js';
import { migrateDbV2 } from './db_migration_v2.js';
import { migrateDbV3 } from './db_migration_v3.js';
import { migrateDbV4 } from './db_migration_v4.js';
import { migrateDbV5 } from './db_migration_v5.js';
import { migrateDbV6 } from './db_migration_v6.js';
import { migrateDbV7 } from './db_migration_v7.js';
import { migrateDbV8 } from './db_migration_v8.js';
import { migrateDbV9 } from './db_migration_v9.js';
import { migrateDbV10 } from './db_migration_v10.js';
import { migrateDbV11 } from './db_migration_v11.js';
import { migrateDbV12 } from './db_migration_v12.js';
import { migrateDbV13 } from './db_migration_v13.js';
import { migrateDbV14 } from './db_migration_v14.js';
import { migrateDbV15 } from './db_migration_v15.js';
import { migrateDbV16 } from './db_migration_v16.js';
import { migrateDbV17 } from './db_migration_v17.js';
import { migrateDbV18 } from './db_migration_v18.js';
import { migrateDbV19 } from './db_migration_v19.js';
import { migrateDbV20 } from './db_migration_v20.js';
import { migrateDbV21 } from './db_migration_v21.js';
import { migrateDbV22 } from './db_migration_v22.js';
import { migrateDbV23 } from './db_migration_v23.js';
import { migrateDbV24 } from './db_migration_v24.js';
import { migrateDbV25 } from './db_migration_v25.js';
import { migrateDbV26 } from './db_migration_v26.js';
import { migrateDbV27 } from './db_migration_v27.js';
import { migrateDbV28 } from './db_migration_v28.js';
import { migrateDbV29 } from './db_migration_v29.js';
import { migrateDbV30 } from './db_migration_v30.js';
import { migrateDbV31 } from './db_migration_v31.js';
import { migrateDbV32 } from './db_migration_v32.js';
import { migrateDbV33 } from './db_migration_v33.js';
import { migrateDbV34 } from './db_migration_v34.js';
import { migrateDbV35 } from './db_migration_v35.js';
import { migrateDbV36 } from './db_migration_v36.js';
import { migrateDbV37 } from './db_migration_v37.js';
import { migrateDbV38 } from './db_migration_v38.js';
import { migrateDbV39 } from './db_migration_v39.js';
import { migrateDbV40 } from './db_migration_v40.js';
import { migrateDbV41 } from './db_migration_v41.js';
import { migrateDbV42 } from './db_migration_v42.js';
import { migrateDbV43 } from './db_migration_v43.js';
import { migrateDbV44 } from './db_migration_v44.js';
import { migrateDbV45 } from './db_migration_v45.js';
import { migrateDbV46 } from './db_migration_v46.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'erp.db');

let db;

export function getDb() {
  if (!db) throw new Error('Database niet geïnitialiseerd');
  return db;
}

export async function initDb() {
  const bestondAl = fs.existsSync(DB_PATH);
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
  `);

  // Migraties worden exact één keer geregistreerd. Bij de eerste overgang
  // van een bestaande installatie maken we eerst een consistente SQLite-backup.
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (versie INTEGER PRIMARY KEY, uitgevoerd_op TEXT NOT NULL DEFAULT (datetime('now')))");
  const alGemigreerd = db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c > 0;
  if (!alGemigreerd && bestondAl) {
    const preMigratie = DB_PATH + '.pre-migratie-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
    await db.backup(preMigratie);
    console.log('Veiligheidskopie vóór migraties:', preMigratie);
  }
  const geregistreerd = db.prepare('SELECT 1 FROM schema_migrations WHERE versie = ?');
  const markeer = db.prepare('INSERT INTO schema_migrations (versie) VALUES (?)');
  const voerUit = (versie, fn) => { if (!geregistreerd.get(versie)) { fn(db); markeer.run(versie); } };
  voerUit(1, migrateDb);
  voerUit(2, migrateDbV2);
  voerUit(3, migrateDbV3);
  voerUit(4, migrateDbV4);
  voerUit(5, migrateDbV5);
  voerUit(6, migrateDbV6);
  voerUit(7, migrateDbV7);
  voerUit(8, migrateDbV8);
  voerUit(9, migrateDbV9);
  voerUit(10, migrateDbV10);
  voerUit(11, migrateDbV11);
  voerUit(12, migrateDbV12);
  voerUit(13, migrateDbV13);
  voerUit(14, migrateDbV14);
  voerUit(15, migrateDbV15);
  voerUit(16, migrateDbV16);
  voerUit(17, migrateDbV17);
  voerUit(18, migrateDbV18);
  voerUit(19, migrateDbV19);
  voerUit(20, migrateDbV20);
  voerUit(21, migrateDbV21);
  voerUit(22, migrateDbV22);
  voerUit(23, migrateDbV23);
  voerUit(24, migrateDbV24);
  voerUit(25, migrateDbV25);
  voerUit(26, migrateDbV26);
  voerUit(27, migrateDbV27);
  voerUit(28, migrateDbV28);
  voerUit(29, migrateDbV29);
  voerUit(30, migrateDbV30);
  voerUit(31, migrateDbV31);
  voerUit(32, migrateDbV32);
  voerUit(33, migrateDbV33);
  voerUit(34, migrateDbV34);
  voerUit(35, migrateDbV35);
  voerUit(36, migrateDbV36);
  voerUit(37, migrateDbV37);
  voerUit(38, migrateDbV38);
  voerUit(39, migrateDbV39);
  voerUit(40, migrateDbV40);
  voerUit(41, migrateDbV41);
  voerUit(42, migrateDbV42);
  voerUit(43, migrateDbV43);
  voerUit(44, migrateDbV44);
  voerUit(45, migrateDbV45);
  voerUit(46, migrateDbV46);

  // Per printer op naam controleren (i.p.v. "tabel is leeg") — zo blokkeert een
  // migratie die zelf al een printer toevoegt (bv. v21, AnyCubic) niet de seed
  // van de andere standaardprinters op een verse installatie.
  if (!db.prepare('SELECT id FROM printers WHERE naam = ?').get('Ender 3 S1 Pro')) {
    db.prepare(`INSERT INTO printers (naam,type,ha_entity_prefix,kwh_entity,machine_kost_per_uur,heeft_bmcu,actief) VALUES (?,?,?,?,?,?,?)`)
      .run('Ender 3 S1 Pro','FDM',null,'sensor.lsc_power_plug_fr_incl_power_meter_5_totaal_energieverbruik',0.13,0,1);
  }
  if (!db.prepare('SELECT id FROM printers WHERE naam = ?').get('Bambu A1 Mini')) {
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
