export function migrateDbV23(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(filament_types)").all().map(c => c.name);
    if (!cols.includes('generiek')) {
      db.prepare("ALTER TABLE filament_types ADD COLUMN generiek INTEGER NOT NULL DEFAULT 0").run();
      console.log('Migratie v23: generiek toegevoegd aan filament_types');
    }

    // Generieke plaatshouders — te gebruiken bij het bestellen wanneer het exacte
    // merk nog niet gekend is (bv. impulsaankoop). Bij ontvangst kies je dan het
    // effectieve merk/type (bestaand of nieuw aan te maken).
    const generieken = [
      { merk: 'Generiek', materiaal: 'PLA' },
      { merk: 'Generiek', materiaal: 'PETG' },
      { merk: 'Generiek', materiaal: 'ASA' },
    ];
    const insert = db.prepare(`
      INSERT INTO filament_types (merk, materiaal, inkoop_prijs_per_kg, dichtheid_g_per_cm3, categorie, eenheid, generiek, notities)
      VALUES (?,?,0,1.24,'filament','gram',1,'Generieke plaatshouder — bij ontvangst effectief merk/type kiezen of aanmaken')
    `);
    for (const g of generieken) {
      const bestaat = db.prepare('SELECT id FROM filament_types WHERE merk = ? AND materiaal = ?').get(g.merk, g.materiaal);
      if (!bestaat) {
        insert.run(g.merk, g.materiaal);
        console.log(`Migratie v23: generiek type "${g.merk} ${g.materiaal}" aangemaakt`);
      }
    }
  } catch (e) {
    console.error('Migratie v23 fout:', e.message);
  }
}
