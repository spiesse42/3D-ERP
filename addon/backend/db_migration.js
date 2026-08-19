// Voeg kleur kolom toe aan filament_rollen als die nog niet bestaat
// en verwijder kleur uit filament_types (SQLite ondersteunt geen DROP COLUMN < v3.35)
// We lossen dit op door de kleur kolom te migreren en types view aan te passen

export function migrateDb(db) {
  // Voeg kleur toe aan rollen indien nog niet aanwezig
  try {
    db.exec('ALTER TABLE filament_rollen ADD COLUMN kleur TEXT');
    console.log('Migratie: kleur kolom toegevoegd aan filament_rollen');
  } catch (e) {
    // Kolom bestaat al — geen probleem
  }

  // Migreer bestaande kleur van types naar rollen (eenmalig)
  try {
    const rollen = db.prepare('SELECT r.id, ft.kleur FROM filament_rollen r JOIN filament_types ft ON ft.id = r.filament_type_id WHERE r.kleur IS NULL AND ft.kleur IS NOT NULL').all();
    for (const rol of rollen) {
      db.prepare('UPDATE filament_rollen SET kleur = ? WHERE id = ?').run(rol.kleur, rol.id);
    }
    if (rollen.length > 0) console.log(`Migratie: ${rollen.length} rollen kregen kleur`);
  } catch (e) {}
}
