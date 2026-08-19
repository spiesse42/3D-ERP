// Migratie v28: tabel 'custom_kleuren' — door de gebruiker zelf toegevoegde
// kleuren (via HEX/RGB-code ingave), zodat deze blijvend gekozen kunnen
// worden naast het vaste kleurenpalet (zie frontend/src/lib/kleuren.js).
export function migrateDbV28(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_kleuren (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT,
      hex TEXT NOT NULL UNIQUE,
      aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log('Migratie v28: tabel custom_kleuren aangemaakt');
}
