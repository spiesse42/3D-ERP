export function migrateDbV17(db) {
  const cols = db.prepare("PRAGMA table_info(bestelling_items)").all().map(c => c.name);
  if (!cols.includes('verwacht_gewicht')) {
    db.prepare("ALTER TABLE bestelling_items ADD COLUMN verwacht_gewicht REAL").run();
    console.log('Migratie v17: verwacht_gewicht toegevoegd aan bestelling_items');
  }
}
