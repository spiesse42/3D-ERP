// Migratie v29: onderscheid 'print' vs 'dienst' jobs (consultancy/ontwerp,
// niet gebonden aan een printer) + een doorlopend opvolgnummer per job
// (formaat JJJJ-0001, reset per kalenderjaar), zichtbaar op de werkbon en
// opzoekbaar in Jobs. printer_id wordt hierbij nullable (enkel nog verplicht
// voor type='print', afgedwongen in de backend-route, niet in de database).
export function migrateDbV29(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
    if (cols.includes('type') && cols.includes('volgnummer')) {
      console.log('Migratie v29: kolommen al aanwezig');
      return;
    }

    // Tabel-rebuild: FK's tijdelijk uit (kan niet binnen een transactie gewijzigd
    // worden, dus moet vóór de transactie) + alles in één transactie. Zonder dit
    // faalt DROP TABLE jobs zodra een andere tabel (bv. offertes_v2.job_id) nog
    // naar bestaande jobs verwijst, en blijft de migratie bij elke herstart hangen.
    const fkWasAan = db.pragma('foreign_keys', { simple: true });
    db.pragma('foreign_keys = OFF');
    try {
      const rebuild = db.transaction(() => {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS jobs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            klant_id INTEGER REFERENCES klanten(id) ON DELETE SET NULL,
            printer_id INTEGER REFERENCES printers(id) ON DELETE RESTRICT,
            naam TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'print' CHECK (type IN ('print','dienst')),
            dienst_categorie TEXT,
            volgnummer TEXT UNIQUE,
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
          INSERT INTO jobs_new (
            id, klant_id, printer_id, naam, type, dienst_categorie, volgnummer, status, stl_bestandsnaam,
            print_uren_geschat, print_uren_werkelijk, is_multicolor, aantal_kleuren,
            aangemaakt_op, gestart_op, voltooid_op, notities,
            offerte_id, klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat,
            offerte_nummer, geldig_tot
          )
          SELECT
            id, klant_id, printer_id, naam, 'print', NULL, NULL, status, stl_bestandsnaam,
            print_uren_geschat, print_uren_werkelijk, is_multicolor, aantal_kleuren,
            aangemaakt_op, gestart_op, voltooid_op, notities,
            offerte_id, klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat,
            offerte_nummer, geldig_tot
          FROM jobs
        `).run();

        db.prepare("DROP TABLE jobs").run();
        db.prepare("ALTER TABLE jobs_new RENAME TO jobs").run();

        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_klant ON jobs(klant_id)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer_id)").run();
        db.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)").run();
        db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_volgnummer ON jobs(volgnummer)").run();
      });
      rebuild();
    } finally {
      if (fkWasAan) db.pragma('foreign_keys = ON');
    }

    // Bestaande jobs krijgen alsnog een opvolgnummer, op basis van hun
    // aanmaakjaar en aanmaakvolgorde — zo blijven ook oudere jobs opzoekbaar.
    // De teller per jaar wordt bijgehouden in instellingen (volgnummer_teller_<jaar>),
    // zodat nieuw aangemaakte jobs er gewoon op verder tellen.
    const bestaande = db.prepare("SELECT id, aangemaakt_op FROM jobs ORDER BY aangemaakt_op ASC, id ASC").all();
    const tellerPerJaar = {};
    const instellingGet = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = ?");
    const instellingSet = db.prepare(`
      INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)
      ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde
    `);
    const zetVolgnummer = db.prepare("UPDATE jobs SET volgnummer = ? WHERE id = ?");

    for (const job of bestaande) {
      const jaar = (job.aangemaakt_op || '').slice(0, 4) || String(new Date().getFullYear());
      if (tellerPerJaar[jaar] == null) {
        const rij = instellingGet.get(`volgnummer_teller_${jaar}`);
        tellerPerJaar[jaar] = rij ? parseInt(rij.waarde) || 0 : 0;
      }
      tellerPerJaar[jaar] += 1;
      zetVolgnummer.run(`${jaar}-${String(tellerPerJaar[jaar]).padStart(4, '0')}`, job.id);
    }
    for (const [jaar, teller] of Object.entries(tellerPerJaar)) {
      instellingSet.run(`volgnummer_teller_${jaar}`, String(teller));
    }

    console.log('Migratie v29: type/dienst_categorie/volgnummer toegevoegd aan jobs, printer_id nullable gemaakt, opvolgnummers toegekend');
  } catch (e) {
    console.error('Migratie v29 fout:', e.message);
  }
}
