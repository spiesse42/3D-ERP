export function migrateDbV22(db) {
  try {
    const biCols = db.prepare("PRAGMA table_info(bestelling_items)").all().map(c => c.name);
    if (!biCols.includes('ontvangen_aantal')) {
      db.prepare("ALTER TABLE bestelling_items ADD COLUMN ontvangen_aantal REAL NOT NULL DEFAULT 0").run();
      console.log('Migratie v22: ontvangen_aantal toegevoegd aan bestelling_items');
    }

    const frCols = db.prepare("PRAGMA table_info(filament_rollen)").all().map(c => c.name);
    if (!frCols.includes('bestelling_item_id')) {
      db.prepare("ALTER TABLE filament_rollen ADD COLUMN bestelling_item_id INTEGER REFERENCES bestelling_items(id) ON DELETE SET NULL").run();
      console.log('Migratie v22: bestelling_item_id toegevoegd aan filament_rollen');
    }

    // Bestaande, reeds-ontvangen items (oude 1-op-1 vlag) consistent zetten:
    // ontvangen_aantal = aantal (of 1 als er geen aantal geregistreerd stond)
    db.prepare(`
      UPDATE bestelling_items
      SET ontvangen_aantal = COALESCE(aantal, 1)
      WHERE ontvangen = 1 AND ontvangen_aantal = 0
    `).run();

    // Terugkoppeling leggen voor bestaande rollen die al gekoppeld waren via het oude
    // (enkelvoudige) filament_rol_id-veld op bestelling_items
    db.prepare(`
      UPDATE filament_rollen
      SET bestelling_item_id = (
        SELECT bi.id FROM bestelling_items bi WHERE bi.filament_rol_id = filament_rollen.id
      )
      WHERE bestelling_item_id IS NULL
        AND EXISTS (SELECT 1 FROM bestelling_items bi WHERE bi.filament_rol_id = filament_rollen.id)
    `).run();
  } catch (e) {
    console.error('Migratie v22 fout:', e.message);
  }
}
