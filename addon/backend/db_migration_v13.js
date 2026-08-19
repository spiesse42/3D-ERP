export function migrateDbV13(db) {
  // Nieuwe statussen toevoegen via een tijdelijke tabel (SQLite ondersteunt geen ALTER CHECK)
  try {
    // Controleer of de nieuwe statussen al mogelijk zijn door een test
    const testJob = db.prepare("SELECT id FROM jobs LIMIT 1").get();
    if (testJob) {
      // Probeer een update met nieuwe status (rollback direct)
      const savepoint = db.prepare("SAVEPOINT v13test");
      const rollback = db.prepare("ROLLBACK TO SAVEPOINT v13test");
      const release = db.prepare("RELEASE SAVEPOINT v13test");
      try {
        savepoint.run();
        db.prepare("UPDATE jobs SET status = 'gecontroleerd' WHERE id = ?").run(testJob.id);
        rollback.run();
        release.run();
        console.log('Migratie v13: statussen al beschikbaar');
        return;
      } catch(e) {
        rollback.run();
        release.run();
      }
    }

    // Maak nieuwe tabel met uitgebreide CHECK
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jobs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        klant_id INTEGER REFERENCES klanten(id) ON DELETE SET NULL,
        printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
        naam TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'gepland'
          CHECK (status IN ('gepland','bezig','voltooid','gecontroleerd','gefactureerd','betaald','gefaald','geannuleerd')),
        stl_bestandsnaam TEXT,
        print_uren_geschat REAL,
        print_uren_werkelijk REAL,
        is_multicolor INTEGER NOT NULL DEFAULT 0,
        aantal_kleuren INTEGER NOT NULL DEFAULT 1,
        aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
        gestart_op TEXT,
        voltooid_op TEXT,
        notities TEXT,
        offerte_id INTEGER,
        klant_id_cached INTEGER,
        betaald INTEGER NOT NULL DEFAULT 0,
        betaald_op TEXT,
        kwh_start REAL,
        gewicht_geschat REAL
      )
    `).run();

    // Kopieer data
    db.prepare(`
      INSERT INTO jobs_new SELECT
        id, klant_id, printer_id, naam, status, stl_bestandsnaam,
        print_uren_geschat, print_uren_werkelijk, is_multicolor, aantal_kleuren,
        aangemaakt_op, gestart_op, voltooid_op, notities,
        offerte_id, klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat
      FROM jobs
    `).run();

    db.prepare("DROP TABLE jobs").run();
    db.prepare("ALTER TABLE jobs_new RENAME TO jobs").run();

    // Herstel indexen
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_klant ON jobs(klant_id)").run();
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer_id)").run();
    db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)").run();

    console.log('Migratie v13: nieuwe statussen (gecontroleerd, gefactureerd, betaald) toegevoegd');
  } catch(e) {
    console.error('Migratie v13 fout:', e.message);
  }
}
