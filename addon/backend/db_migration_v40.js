// Migratie v40 — tabel 'facturen' (aankoopfacturen + bonnetjes): bewaart het
// geüploade PDF/foto-bestand voortaan blijvend (voorheen enkel tijdelijk in
// het geheugen tijdens de Gemini-analyse, daarna weggegooid — zie
// backend/routes/facturen.js) samen met leverancier/datum/factuurnummer.
// Kolom factuur_id op filament_rollen en uitgaven koppelt elk voorraadartikel
// resp. elke uitgave terug naar het aankoopbewijs waar het vandaan komt —
// enkel intern gebruikt (nooit afgedrukt op offerte/werkbon), puur voor
// traceerbaarheid/boekhouding.
export function migrateDbV40(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facturen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leverancier TEXT,
      factuurnummer TEXT,
      datum TEXT,
      type TEXT NOT NULL DEFAULT 'factuur' CHECK (type IN ('factuur','bonnetje')),
      bestandsnaam TEXT,
      bestandspad TEXT,
      mimetype TEXT,
      totaal_bedrag REAL,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const rolKolommen = db.prepare("PRAGMA table_info(filament_rollen)").all().map(c => c.name);
  if (!rolKolommen.includes('factuur_id')) {
    db.prepare("ALTER TABLE filament_rollen ADD COLUMN factuur_id INTEGER REFERENCES facturen(id) ON DELETE SET NULL").run();
    console.log('Migratie v40: factuur_id toegevoegd aan filament_rollen');
  }

  const uitgKolommen = db.prepare("PRAGMA table_info(uitgaven)").all().map(c => c.name);
  if (!uitgKolommen.includes('factuur_id')) {
    db.prepare("ALTER TABLE uitgaven ADD COLUMN factuur_id INTEGER REFERENCES facturen(id) ON DELETE SET NULL").run();
    console.log('Migratie v40: factuur_id toegevoegd aan uitgaven');
  }

  console.log("Migratie v40: tabel 'facturen' aangemaakt (indien nog niet aanwezig)");
}
