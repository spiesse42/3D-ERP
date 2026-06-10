export function migrateDbV2(db) {
  // Kleur op rollen
  try { db.exec('ALTER TABLE filament_rollen ADD COLUMN kleur TEXT'); } catch {}

  // Ender prefix
  try {
    db.prepare(`UPDATE printers SET ha_entity_prefix = 'sensor.ender_3_s1_pro_' WHERE naam = 'Ender 3 S1 Pro' AND (ha_entity_prefix IS NULL OR ha_entity_prefix = '')`).run();
  } catch {}

  // Nieuwe tarieven
  const nieuweT = [
    ['marge_grens_uur',    4,    'u',    'Margrens (uren)'],
    ['marge_klein_pct',   18,    '%',    'Marge kleine print (<grens)'],
    ['marge_groot_pct',   10,    '%',    'Marge grote print (>grens)'],
    ['voorbereiding_min', 15,    'min',  'Standaard voorbereiding'],
    ['nabewerking_min',   10,    'min',  'Standaard nabewerking'],
    ['ontwerp_tarief',    15,    'EUR/u','Ontwerp uurtarief'],
    ['nabewerking_tarief',15,    'EUR/u','Nabewerking regie uurtarief'],
  ];
  for (const [s, w, e, l] of nieuweT) {
    try {
      db.prepare('INSERT OR IGNORE INTO tarieven (sleutel,waarde,eenheid,label) VALUES (?,?,?,?)').run(s,w,e,l);
    } catch {}
  }
  console.log('Migratie v2 uitgevoerd');
}
