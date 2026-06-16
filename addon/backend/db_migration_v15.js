export function migrateDbV15(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leveranciers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      website TEXT,
      notities TEXT,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bestellingen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leverancier_id INTEGER NOT NULL REFERENCES leveranciers(id) ON DELETE RESTRICT,
      referentie TEXT,
      status TEXT NOT NULL DEFAULT 'besteld'
        CHECK (status IN ('besteld','deels_ontvangen','ontvangen')),
      besteld_op TEXT NOT NULL DEFAULT (date('now')),
      ontvangen_op TEXT,
      notities TEXT
    );

    CREATE TABLE IF NOT EXISTS bestelling_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bestelling_id INTEGER NOT NULL REFERENCES bestellingen(id) ON DELETE CASCADE,
      filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE RESTRICT,
      aantal REAL,
      prijs_totaal REAL,
      ontvangen INTEGER NOT NULL DEFAULT 0,
      ontvangen_op TEXT,
      filament_rol_id INTEGER REFERENCES filament_rollen(id) ON DELETE SET NULL,
      notities TEXT
    );

    CREATE TABLE IF NOT EXISTS te_bestellen_handmatig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE CASCADE,
      notitie TEXT,
      toegevoegd_op TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bestelling_items_bestelling ON bestelling_items(bestelling_id);
    CREATE INDEX IF NOT EXISTS idx_bestellingen_leverancier    ON bestellingen(leverancier_id);
  `);
  console.log('Migratie v15: leveranciers, bestellingen, bestelling_items, te_bestellen_handmatig aangemaakt');
}
