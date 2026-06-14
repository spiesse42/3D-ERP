export function migrateDbV12(db) {
  const cols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
  if (!cols.includes('gewicht_geschat')) {
    db.prepare("ALTER TABLE jobs ADD COLUMN gewicht_geschat REAL").run();
    console.log('Migratie v12: gewicht_geschat toegevoegd aan jobs');
  }
}
