export function migrateDbV4(db) {
  // Klanten uitbreiden
  for (const [col, def] of [
    ['voornaam', 'TEXT'], ['straat', 'TEXT'], ['huisnummer', 'TEXT'],
    ['postcode', 'TEXT'], ['gemeente', 'TEXT'], ['gsm', 'TEXT'],
    ["type", "TEXT DEFAULT 'particulier'"],
  ]) {
    try { db.exec(`ALTER TABLE klanten ADD COLUMN ${col} ${def}`); } catch {}
  }

  // Offertes v2 tabel
  db.exec(`
    CREATE TABLE IF NOT EXISTS offertes_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klant_id INTEGER NOT NULL REFERENCES klanten(id) ON DELETE RESTRICT,
      nummer TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'concept'
        CHECK (status IN ('concept','verstuurd','goedgekeurd','geannuleerd')),
      object_naam TEXT,
      object_link TEXT,
      printer_id INTEGER REFERENCES printers(id),
      filament_type_id INTEGER REFERENCES filament_types(id),
      geschat_gewicht_g REAL,
      geschatte_tijd_u INTEGER DEFAULT 0,
      geschatte_tijd_min INTEGER DEFAULT 0,
      voorbereiding_min INTEGER DEFAULT 15,
      nabewerking_min INTEGER DEFAULT 10,
      ontwerp_min INTEGER DEFAULT 0,
      ontwerp_tarief REAL DEFAULT 15,
      nabewerking_extra_min INTEGER DEFAULT 0,
      nabewerking_extra_tarief REAL DEFAULT 15,
      is_multicolor INTEGER DEFAULT 0,
      extra_per_stuk REAL DEFAULT 0,
      extra_eenmalig REAL DEFAULT 0,
      extra_omschrijving TEXT,
      aantal INTEGER DEFAULT 1,
      materiaal_kost REAL DEFAULT 0,
      energie_kost_schat REAL DEFAULT 0,
      arbeid_kost REAL DEFAULT 0,
      machine_kost REAL DEFAULT 0,
      extra_totaal REAL DEFAULT 0,
      subtotaal REAL DEFAULT 0,
      marge_pct REAL DEFAULT 18,
      verkoopprijs REAL DEFAULT 0,
      btw_pct REAL DEFAULT 21,
      btw_bedrag REAL DEFAULT 0,
      totaal REAL DEFAULT 0,
      notities TEXT,
      geldig_tot TEXT,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
      job_id INTEGER REFERENCES jobs(id)
    )
  `);

  // Jobs uitbreiden
  try { db.exec('ALTER TABLE jobs ADD COLUMN offerte_id INTEGER REFERENCES offertes_v2(id)'); } catch {}
  try { db.exec('ALTER TABLE jobs ADD COLUMN klant_id_cached INTEGER'); } catch {}

  // Tarieven
  const alle = [
    ['kwh_prijs', 0.35, 'EUR/kWh', 'Elektriciteitsprijs'],
    ['arbeid_per_uur', 15.00, 'EUR/u', 'Arbeidskost'],
    ['faalfactor_pct', 10.00, '%', 'Faalfactor'],
    ['winstmarge_pct', 10.00, '%', 'Winstmarge'],
    ['bmcu_per_job', 0.10, 'EUR', 'BMCU slijtage per multicolor job'],
    ['marge_grens_uur', 4, 'u', 'Margrens (uren)'],
    ['marge_klein_pct', 18, '%', 'Marge kleine print (<grens)'],
    ['marge_groot_pct', 10, '%', 'Marge grote print (>grens)'],
    ['voorbereiding_min', 15, 'min', 'Standaard voorbereiding'],
    ['nabewerking_min', 10, 'min', 'Standaard nabewerking'],
    ['ontwerp_tarief', 15, 'EUR/u', 'Ontwerp uurtarief'],
    ['nabewerking_tarief', 15, 'EUR/u', 'Nabewerking regie uurtarief'],
    ['bambu_watt', 120, 'W', 'Bambu A1 Mini gemiddeld vermogen'],
    ['ender_watt', 150, 'W', 'Ender 3 S1 Pro gemiddeld vermogen'],
  ];
  for (const [s, w, e, l] of alle) {
    try {
      db.prepare('INSERT OR IGNORE INTO tarieven (sleutel,waarde,eenheid,label) VALUES (?,?,?,?)').run(s, w, e, l);
    } catch {}
  }

  // Ender prefix fix
  try {
    db.prepare(`UPDATE printers SET ha_entity_prefix = 'sensor.ender_3_s1_pro_'
      WHERE naam = 'Ender 3 S1 Pro' AND (ha_entity_prefix IS NULL OR ha_entity_prefix = '')`).run();
  } catch {}

  console.log('Migratie v4 uitgevoerd');
}
