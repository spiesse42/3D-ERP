export function migrateDbV14(db) {
  const cols = db.prepare("PRAGMA table_info(filament_types)").all().map(c => c.name);

  if (!cols.includes('categorie')) {
    db.prepare("ALTER TABLE filament_types ADD COLUMN categorie TEXT NOT NULL DEFAULT 'filament'").run();
    console.log('Migratie v14: categorie toegevoegd aan filament_types');
  }
  if (!cols.includes('eenheid')) {
    db.prepare("ALTER TABLE filament_types ADD COLUMN eenheid TEXT NOT NULL DEFAULT 'gram'").run();
    console.log('Migratie v14: eenheid toegevoegd aan filament_types');
  }
  if (!cols.includes('marge_pct')) {
    db.prepare("ALTER TABLE filament_types ADD COLUMN marge_pct REAL").run();
    console.log('Migratie v14: marge_pct toegevoegd aan filament_types');
  }
  if (!cols.includes('min_voorraad')) {
    db.prepare("ALTER TABLE filament_types ADD COLUMN min_voorraad REAL").run();
    console.log('Migratie v14: min_voorraad toegevoegd aan filament_types');
  }
}
