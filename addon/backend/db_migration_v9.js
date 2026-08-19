export function migrateDbV9(db) {
  const cols = db.pragma('table_info(filament_rollen)').map(c => c.name);
  if (!cols.includes('kleur_hex')) {
    db.exec(`ALTER TABLE filament_rollen ADD COLUMN kleur_hex TEXT`);
    console.log('[migratie V9] kolom kleur_hex toegevoegd aan filament_rollen');
  }
}