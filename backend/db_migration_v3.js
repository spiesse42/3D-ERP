export function migrateDbV3(db) {
  // Kleur op rollen
  try { db.exec('ALTER TABLE filament_rollen ADD COLUMN kleur TEXT'); } catch {}

  // Ender prefix fix
  try {
    db.prepare(`UPDATE printers SET ha_entity_prefix = 'sensor.ender_3_s1_pro_'
      WHERE naam = 'Ender 3 S1 Pro' AND (ha_entity_prefix IS NULL OR ha_entity_prefix = '')`).run();
  } catch {}

  // Klanten uitbreiden
  const klantenCols = [
    ['voornaam', 'TEXT'],
    ['straat', 'TEXT'],
    ['huisnummer', 'TEXT'],
    ['postcode', 'TEXT'],
    ['gemeente', 'TEXT'],
    ['type', "TEXT DEFAULT 'particulier'"],
    ['gsm', 'TEXT'],
  ];
  for (const [col, def] of klantenCols) {
    try { db.exec(`ALTER TABLE klanten ADD COLUMN ${col} ${def}`); } catch {}
  }

  // Offertes uitbreiden
  try { db.exec('ALTER TABLE offertes ADD COLUMN job_id INTEGER REFERENCES jobs(id)'); } catch {}
  try { db.exec('ALTER TABLE offertes ADD COLUMN kostprijs_snapshot TEXT'); } catch {}

  // Alle tarieven
  const alle = [
    ['kwh_prijs',          0.35,  'EUR/kWh', 'Elektriciteitsprijs'],
    ['arbeid_per_uur',    15.00,  'EUR/u',   'Arbeidskost'],
    ['faalfactor_pct',    10.00,  '%',       'Faalfactor'],
    ['winstmarge_pct',    10.00,  '%',       'Winstmarge'],
    ['bmcu_per_job',       0.10,  'EUR',     'BMCU slijtage per multicolor job'],
    ['marge_grens_uur',    4,     'u',       'Margrens (uren)'],
    ['marge_klein_pct',   18,     '%',       'Marge kleine print (<grens)'],
    ['marge_groot_pct',   10,     '%',       'Marge grote print (>grens)'],
    ['voorbereiding_min', 15,     'min',     'Standaard voorbereiding'],
    ['nabewerking_min',   10,     'min',     'Standaard nabewerking'],
    ['ontwerp_tarief',    15,     'EUR/u',   'Ontwerp uurtarief'],
    ['nabewerking_tarief',15,     'EUR/u',   'Nabewerking regie uurtarief'],
  ];
  for (const [s, w, e, l] of alle) {
    try {
      db.prepare('INSERT OR IGNORE INTO tarieven (sleutel,waarde,eenheid,label) VALUES (?,?,?,?)').run(s,w,e,l);
    } catch {}
  }

  console.log('Migratie v3 uitgevoerd');
}
