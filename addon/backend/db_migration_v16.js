export function migrateDbV16(db) {
  const tbCols = db.prepare("PRAGMA table_info(te_bestellen_handmatig)").all().map(c => c.name);
  if (!tbCols.includes('kleur')) {
    db.prepare("ALTER TABLE te_bestellen_handmatig ADD COLUMN kleur TEXT").run();
    console.log('Migratie v16: kleur toegevoegd aan te_bestellen_handmatig');
  }
  if (!tbCols.includes('kleur_hex')) {
    db.prepare("ALTER TABLE te_bestellen_handmatig ADD COLUMN kleur_hex TEXT").run();
    console.log('Migratie v16: kleur_hex toegevoegd aan te_bestellen_handmatig');
  }

  const biCols = db.prepare("PRAGMA table_info(bestelling_items)").all().map(c => c.name);
  if (!biCols.includes('kleur')) {
    db.prepare("ALTER TABLE bestelling_items ADD COLUMN kleur TEXT").run();
    console.log('Migratie v16: kleur toegevoegd aan bestelling_items');
  }
  if (!biCols.includes('kleur_hex')) {
    db.prepare("ALTER TABLE bestelling_items ADD COLUMN kleur_hex TEXT").run();
    console.log('Migratie v16: kleur_hex toegevoegd aan bestelling_items');
  }
}
