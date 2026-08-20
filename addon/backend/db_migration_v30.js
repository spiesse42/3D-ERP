// Migratie v30: extra artikelen (bv. verzendkosten, ringetjes, ander niet-
// filament materiaal uit voorraad) kunnen toevoegen aan een offerte. Net als
// het hoofd-filament van een offerte wordt dit op TYPE-niveau geprijsd (niet
// op een specifieke rol/batch) — een offerte is een vrijblijvende schatting,
// er wordt dus geen voorraad gereserveerd of afgeboekt.
export function migrateDbV30(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(offertes_v2)").all().map(c => c.name);
    if (!cols.includes('artikelen_kost')) {
      db.exec("ALTER TABLE offertes_v2 ADD COLUMN artikelen_kost REAL NOT NULL DEFAULT 0");
      console.log('Migratie v30: artikelen_kost toegevoegd aan offertes_v2');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS offerte_artikelen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offerte_id INTEGER NOT NULL REFERENCES offertes_v2(id) ON DELETE CASCADE,
        filament_type_id INTEGER NOT NULL REFERENCES filament_types(id),
        aantal REAL NOT NULL CHECK (aantal > 0),
        aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_offerte_artikelen_offerte ON offerte_artikelen(offerte_id);
    `);
    console.log('Migratie v30: tabel offerte_artikelen aangemaakt');
  } catch (e) {
    console.error('Migratie v30 fout:', e.message);
  }
}
