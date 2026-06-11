export function migrateDbV6(db) {
  const cols = db.prepare("PRAGMA table_info(offertes_v2)").all().map(c => c.name);

  if (!cols.includes('filament_rol_id')) {
    db.prepare("ALTER TABLE offertes_v2 ADD COLUMN filament_rol_id INTEGER REFERENCES filament_rollen(id) ON DELETE SET NULL").run();
    console.log('Migratie v6: filament_rol_id toegevoegd aan offertes_v2');
  }

  if (!cols.includes('filament_rollen_json')) {
    db.prepare("ALTER TABLE offertes_v2 ADD COLUMN filament_rollen_json TEXT").run();
    console.log('Migratie v6: filament_rollen_json toegevoegd aan offertes_v2');
  }
}
