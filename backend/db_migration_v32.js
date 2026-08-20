// Migratie v32: nieuwe status 'in te plannen' toegevoegd aan de jobflow, vóór
// 'gepland'. Wordt de nieuwe standaardstatus bij het aanmaken van een job —
// het opvolgnummer wordt nog steeds meteen bij aanmaak toegekend, ongeacht status.
export function migrateDbV32(db) {
  try {
    const testJob = db.prepare("SELECT id FROM jobs LIMIT 1").get();
    if (testJob) {
      try {
        db.prepare("SAVEPOINT v32test").run();
        db.prepare("UPDATE jobs SET status = 'in te plannen' WHERE id = ?").run(testJob.id);
        db.prepare("ROLLBACK TO SAVEPOINT v32test").run();
        db.prepare("RELEASE SAVEPOINT v32test").run();
        console.log('Migratie v32: status "in te plannen" al beschikbaar');
        return;
      } catch (e) {
        db.prepare("ROLLBACK TO SAVEPOINT v32test").run();
        db.prepare("RELEASE SAVEPOINT v32test").run();
      }
    }

    db.exec(`
      CREATE TABLE jobs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        klant_id INTEGER REFERENCES klanten(id) ON DELETE SET NULL,
        printer_id INTEGER REFERENCES printers(id) ON DELETE RESTRICT,
        naam TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'print' CHECK (type IN ('print','dienst')),
        dienst_categorie TEXT,
        volgnummer TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'in te plannen'
          CHECK (status IN ('in te plannen','offerte','verstuurd','goedgekeurd','gepland','bezig','voltooid','gecontroleerd','gefactureerd','betaald','gefaald','geannuleerd')),
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
        gewicht_geschat REAL,
        offerte_nummer TEXT,
        geldig_tot TEXT
      );

      INSERT INTO jobs_new SELECT * FROM jobs;

      DROP TABLE jobs;
      ALTER TABLE jobs_new RENAME TO jobs;

      CREATE INDEX IF NOT EXISTS idx_jobs_klant ON jobs(klant_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_volgnummer ON jobs(volgnummer);
    `);
    console.log('Migratie v32: status "in te plannen" toegevoegd aan jobs (nieuwe standaardstatus bij aanmaak)');
  } catch (e) {
    console.error('Migratie v32 fout:', e.message);
  }
}
