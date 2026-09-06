// Migratie v46 — onveranderlijke voorraadboekingen voor rollen.
export function migrateDbV46(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voorraad_mutaties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_rol_id INTEGER NOT NULL REFERENCES filament_rollen(id) ON DELETE RESTRICT,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      hoeveelheid_gram REAL NOT NULL,
      opmerking TEXT,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_voorraad_mutaties_rol ON voorraad_mutaties(filament_rol_id, aangemaakt_op);
    CREATE INDEX IF NOT EXISTS idx_voorraad_mutaties_job ON voorraad_mutaties(job_id);
  `);
}