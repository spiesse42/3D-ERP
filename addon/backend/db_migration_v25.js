export function migrateDbV25(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(printers)").all().map(c => c.name);
    if (!cols.includes('auto_job_aanmaken')) {
      db.prepare("ALTER TABLE printers ADD COLUMN auto_job_aanmaken INTEGER NOT NULL DEFAULT 0").run();
      console.log('Migratie v25: auto_job_aanmaken toegevoegd aan printers');
    }
  } catch (e) {
    console.error('Migratie v25 fout:', e.message);
  }
}
