export function migrateDbV5(db) {
  const cols = db.prepare("PRAGMA table_info(filament_rollen)").all().map(c => c.name);
  
  if (!cols.includes('aankoopprijs_eur')) {
    db.prepare("ALTER TABLE filament_rollen ADD COLUMN aankoopprijs_eur REAL").run();
    console.log('Migratie v5: aankoopprijs_eur toegevoegd aan filament_rollen');
  }
  
  if (!cols.includes('lotnummer')) {
    db.prepare("ALTER TABLE filament_rollen ADD COLUMN lotnummer TEXT").run();
    console.log('Migratie v5: lotnummer toegevoegd aan filament_rollen');
  }
}