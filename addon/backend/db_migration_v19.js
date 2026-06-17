export function migrateDbV19(db) {
  const cols = db.prepare("PRAGMA table_info(job_kosten)").all().map(c => c.name);

  if (!cols.includes('filament_kost')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN filament_kost REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v19: filament_kost toegevoegd aan job_kosten');
  }
  if (!cols.includes('artikel_kost')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN artikel_kost REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v19: artikel_kost toegevoegd aan job_kosten');
  }
}
