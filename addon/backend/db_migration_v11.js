export function migrateDbV11(db) {
  const cols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
  if (!cols.includes('kwh_start')) {
    db.prepare("ALTER TABLE jobs ADD COLUMN kwh_start REAL").run();
    console.log('Migratie v11: kwh_start toegevoegd aan jobs');
  }
}
