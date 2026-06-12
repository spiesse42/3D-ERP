export function migrateDbV8(db) {
  const cols = db.pragma('table_info(klanten)').map(c => c.name);
  if (!cols.includes('bedrijfsnaam')) {
    db.exec(`ALTER TABLE klanten ADD COLUMN bedrijfsnaam TEXT`);
    console.log('[migratie V8] kolom bedrijfsnaam toegevoegd aan klanten');
  }
}