export function migrateDbV10(db) {
  const cols = db.pragma('table_info(jobs)').map(c => c.name);
  if (!cols.includes('betaald')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN betaald INTEGER NOT NULL DEFAULT 0`);
    console.log('[migratie V10] kolom betaald toegevoegd aan jobs');
  }
  if (!cols.includes('betaald_op')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN betaald_op TEXT`);
    console.log('[migratie V10] kolom betaald_op toegevoegd aan jobs');
  }
}