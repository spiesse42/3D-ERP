export function migrateDbV20(db) {
  // Check of de nieuwe statussen al mogelijk zijn (idempotent, zelfde patroon als v13)
  try {
    const testJob = db.prepare("SELECT id FROM jobs LIMIT 1").get();
    if (testJob) {
      const savepoint = db.prepare("SAVEPOINT v20test");
      const rollback = db.prepare("ROLLBACK TO SAVEPOINT v20test");
      const release = db.prepare("RELEASE SAVEPOINT v20test");
      try {
        savepoint.run();
        db.prepare("UPDATE jobs SET status = 'offerte' WHERE id = ?").run(testJob.id);
        rollback.run();
        release.run();
        // Statussen kloppen al — enkel de kolommen nog controleren/toevoegen
        const cols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
        if (!cols.includes('offerte_nummer')) {
          db.prepare("ALTER TABLE jobs ADD COLUMN offerte_nummer TEXT").run();
          console.log('Migratie v20: offerte_nummer toegevoegd aan jobs');
        }
        if (!cols.includes('geldig_tot')) {
          db.prepare("ALTER TABLE jobs ADD COLUMN geldig_tot TEXT").run();
          console.log('Migratie v20: geldig_tot toegevoegd aan jobs');
        }
        console.log('Migratie v20: statussen al beschikbaar');
        return;
      } catch (e) {
        rollback.run();
        release.run();
      }
    }

    // Tabel-rebuild: FK's tijdelijk uit (kan niet binnen een transactie gewijzigd
    // worden, dus moet vóór de transactie) + alles in één transactie. Zonder dit
    // faalt DROP TABLE jobs zodra een andere tabel (bv. offertes_v2.job_id) nog
    // naar bestaande jobs verwijst, en blijft de migratie bij elke herstart hangen.
    const fkWasAan = db.pragma('foreign_keys', { simple: true });
    db.pragma('foreign_keys = OFF');
    try {
      const rebuild = db.transaction(() => {
        // Nieuwe tabel met uitgebreide CHECK + nieuwe kolommen
        db.prepare(`
          CREATE TABLE IF NOT EXISTS jobs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            klant_id INTEGER REFERENCES klanten(id) ON DELETE SET NULL,
            printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE RESTRICT,
            naam TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'gepland'
              CHECK (status IN ('offerte','verstuurd','goedgekeurd','gepland','bezig','voltooid','gecontroleerd','gefactureerd','betaald','gefaald','geannuleerd')),
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
          )
        `).run();

        db.prepare(`
          INSERT INTO jobs_new SELECT
            id, klant_id, printer_id, naam, status, stl_bestandsnaam,
            print_uren_geschat, print_uren_werkelijk, is_multicolor, aantal_kleuren,
            aangemaakt_op, gestart_op, voltooid_op, notities,
            offerte_id, klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat,
            NULL, NULL
          FROM jobs
        `).run();

        db.prepare("DROP TABLE jobs").run();
        db.prepare("ALTER TABLE jobs_new RENAME TO jobs").run();

        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_klant ON jobs(klant_id)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer_id)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)").run();
      });
      rebuild();
    } finally {
      if (fkWasAan) db.pragma('foreign_keys = ON');
    }

    console.log('Migratie v20: statussen offerte/verstuurd/goedgekeurd + offerte_nummer/geldig_tot toegevoegd aan jobs');
  } catch (e) {
    console.error('Migratie v20 fout:', e.message);
  }
}
