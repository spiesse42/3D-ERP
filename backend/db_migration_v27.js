// Migratie v27: tabel 'uitgaven' voor het Financiën-overzicht (algemene
// bedrijfskosten los van materiaalinkoop, die al via bestellingen loopt).
export function migrateDbV27(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uitgaven (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datum TEXT NOT NULL DEFAULT (date('now')),
      categorie TEXT NOT NULL
        CHECK (categorie IN ('materiaal','energie','software','verzekering','marketing','afschrijving','onderhoud','overig')),
      omschrijving TEXT,
      bedrag REAL NOT NULL CHECK (bedrag > 0),
      terugkerend INTEGER NOT NULL DEFAULT 0,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_uitgaven_datum ON uitgaven(datum);
  `);
  console.log('Migratie v27: tabel uitgaven aangemaakt');
}
