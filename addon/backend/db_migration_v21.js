export function migrateDbV21(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(printers)").all().map(c => c.name);

    if (!cols.includes('gem_verbruik_watt')) {
      db.prepare("ALTER TABLE printers ADD COLUMN gem_verbruik_watt REAL").run();
      console.log('Migratie v21: gem_verbruik_watt toegevoegd aan printers');
    }

    const bestaat = db.prepare("SELECT id FROM printers WHERE naam = ?").get('AnyCubic Kobra S1 Pro');
    if (!bestaat) {
      db.prepare(`
        INSERT INTO printers (naam, type, ha_entity_prefix, kwh_entity, watt_entity, machine_kost_per_uur, heeft_bmcu, actief, gem_verbruik_watt)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run('AnyCubic Kobra S1 Pro', 'FDM', null, null, null, 0.31, 1, 1, 300);
      console.log('Migratie v21: AnyCubic Kobra S1 Pro toegevoegd (cloud-only, geen live monitoring)');
    }
  } catch (e) {
    console.error('Migratie v21 fout:', e.message);
  }
}
