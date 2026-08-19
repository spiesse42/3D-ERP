export function migrateDbV7(db) {
  // 1. watt_entity kolom op printers
  const printerCols = db.prepare(`PRAGMA table_info(printers)`).all();
  if (!printerCols.find(c => c.name === 'watt_entity')) {
    db.exec(`ALTER TABLE printers ADD COLUMN watt_entity TEXT`);
    console.log('[V7] printers.watt_entity toegevoegd');

    // Automatisch invullen op basis van kwh_entity:
    // sensor.lsc_power_plug_fr_incl_power_meter_5_totaal_energieverbruik
    //   → sensor.lsc_power_plug_fr_incl_power_meter_5_vermogen
    db.exec(`
      UPDATE printers
      SET watt_entity = REPLACE(kwh_entity, '_totaal_energieverbruik', '_vermogen')
      WHERE kwh_entity IS NOT NULL
    `);
    console.log('[V7] watt_entity automatisch ingevuld op basis van kwh_entity');
  }

  // 2. energy_samples tabel
  db.exec(`
    CREATE TABLE IF NOT EXISTS energy_samples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      printer_id  INTEGER NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
      timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
      watt        REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_energy_samples_job ON energy_samples(job_id);
  `);
  console.log('[V7] energy_samples tabel aangemaakt');

  // 3. instellingen tabel voor tekst-waarden (token, url, enz.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS instellingen (
      sleutel  TEXT PRIMARY KEY,
      waarde   TEXT NOT NULL DEFAULT '',
      label    TEXT
    );
  `);
  console.log('[V7] instellingen tabel aangemaakt');

  // 4. ha_token in instellingen
  const bestaatToken = db.prepare(
    `SELECT 1 FROM instellingen WHERE sleutel = 'ha_token'`
  ).get();
  if (!bestaatToken) {
    db.prepare(
      `INSERT INTO instellingen (sleutel, waarde, label) VALUES ('ha_token', '', 'Home Assistant Token')`
    ).run();
    console.log('[V7] ha_token toegevoegd aan instellingen');
  }

  // 5. ha_url in instellingen (bv. http://192.168.0.105:8123)
  const bestaatUrl = db.prepare(
    `SELECT 1 FROM instellingen WHERE sleutel = 'ha_url'`
  ).get();
  if (!bestaatUrl) {
    db.prepare(
      `INSERT INTO instellingen (sleutel, waarde, label) VALUES ('ha_url', 'http://192.168.0.105:8123', 'Home Assistant URL')`
    ).run();
    console.log('[V7] ha_url toegevoegd aan instellingen');
  }

  // 6. Opruimen: ha_token en ha_url verwijderen uit tarieven als die er nog instaan
  //    (van de eerste versie van deze migratie)
  db.exec(`DELETE FROM tarieven WHERE sleutel IN ('ha_token', 'ha_url')`);
  console.log('[V7] ha_token/ha_url opgeruimd uit tarieven indien aanwezig');
}
