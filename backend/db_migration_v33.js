// Migratie v33: 'diensten' op een werkbon (bv. verzendkosten NL/BE) — los van
// voorraad, geprijsd op TYPE-niveau met een per-job overschrijfbare prijs én
// aantal (in tegenstelling tot de bestaande Artikelen-sectie, die voorraad
// afboekt via filament_rollen en geen prijsoverschrijving toelaat).
export function migrateDbV33(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_diensten (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        filament_type_id INTEGER NOT NULL REFERENCES filament_types(id),
        aantal REAL NOT NULL CHECK (aantal > 0),
        prijs_per_eenheid REAL NOT NULL CHECK (prijs_per_eenheid >= 0),
        aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_job_diensten_job ON job_diensten(job_id);
    `);
    console.log('Migratie v33: tabel job_diensten aangemaakt');

    const cols = db.prepare("PRAGMA table_info(job_kosten)").all().map(c => c.name);
    if (!cols.includes('diensten_kost')) {
      db.exec("ALTER TABLE job_kosten ADD COLUMN diensten_kost REAL NOT NULL DEFAULT 0");
      console.log('Migratie v33: diensten_kost toegevoegd aan job_kosten');
    }
  } catch (e) {
    console.error('Migratie v33 fout:', e.message);
  }
}
