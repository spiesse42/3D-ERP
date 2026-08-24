// Migratie v42: werkbon (facturatiedocument) losgekoppeld van printopdracht
// (fysieke printer-uitvoering). Vóór deze migratie droeg één `jobs`-rij drie
// rollen tegelijk: (1) printer-uitvoering, (2) werkbon/PDF, (3) facturatie-
// status. Dat klopte enkel zolang een werkbon exact 1 print was — sinds een
// offerte meerdere regeltypes (ontwerp/aanpassing/printen/extra/artikel) kan
// combineren niet meer (zie sessie-notities deel 11 voor het volledige
// ontwerpvoorstel dat hieraan voorafging, incl. de "2 jobs voor 1 print"- en
// "ontwerp-only offerte kan geen werkbon krijgen"-knelpunten).
//
// Nieuwe tabel `werkbonnen` neemt (2) en (3) over: alle regeltypes, eigen
// volgnummer (WB-JJJJ-XXXX), en de volledige facturatiestatus-lifecycle die
// voorheen op jobs.status stond. `jobs` behoudt enkel (1) en krijgt een
// koppeling (werkbon_id + werkbon_regel_index) naar de printen-regel die ze
// invult. Bestaande jobs met een oude facturatiestatus (gecontroleerd/
// gefactureerd/betaald) worden hier naar 'voltooid' herleid — dat is voortaan
// een zuivere productiestatus.
//
// LET OP: de status-CHECK op jobs blijft bewust EXACT dezelfde lijst als
// migratie v32 (alle oude waarden, incl. de niet meer gebruikte 'offerte'/
// 'verstuurd'/'goedgekeurd' uit de allereerste job-lifecycle) — enkel de
// applicatie
// (jobs.js, Jobs.jsx) biedt vanaf nu enkel nog de productiestatussen aan.
// Reden: migratie v13/v20/v32 detecteren "ben ik al uitgevoerd?" door zelf
// een testupdate met een oude statuswaarde te proberen — een striktere CHECK
// hier zou die oudere migraties bij een volgende herstart laten denken dat ze
// NIET zijn uitgevoerd, met een destructieve her-rebuild (en verlies van
// type/volgnummer/werkbon_id e.d.) tot gevolg. Dat woog niet op tegen het
// (louter cosmetische) voordeel van een strengere CHECK.
// Eén printen-regel kan voortaan 0, 1 of meerdere gekoppelde jobs hebben
// (bv. een mislukte poging + een geslaagde herprint op een andere printer).
//
// Bestaande jobs die vandaag al als werkbon dienden (offerte_id gezet, zoals
// werkbon nr25 uit de aanleiding van dit ontwerp) worden hier automatisch
// gesplitst: 1 nieuwe werkbon-rij per offerte, met de bevroren offerte-
// bedragen en -regels, en elke bijhorende job blijft gewoon bestaan als de
// daaraan gekoppelde printopdracht — geen data gaat verloren.
export function migrateDbV42(db) {
  try {
    const jobCols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
    if (jobCols.includes('werkbon_id')) {
      console.log('Migratie v42: al uitgevoerd (werkbon_id bestaat al op jobs)');
      return;
    }

    const STATUS_ORDER = ['in te plannen', 'gepland', 'bezig', 'voltooid', 'gecontroleerd', 'gefactureerd', 'betaald'];

    // FK's tijdelijk uit (kan niet binnen een transactie gewijzigd worden,
    // dus moet vóór de transactie) + alles in één transactie — zelfde
    // patroon als v29/v32, nu uitgebreid met de werkbon-datamigratie zodat
    // dit geheel atomair is (geen dubbele werkbonnen bij een gedeeltelijke
    // mislukking en herstart).
    const fkWasAan = db.pragma('foreign_keys', { simple: true });
    db.pragma('foreign_keys = OFF');
    let aantalWerkbonnen = 0;
    try {
      const migreer = db.transaction(() => {
        // ── Stap 1: tabel werkbonnen ────────────────────────────────────
        db.exec(`
          CREATE TABLE IF NOT EXISTS werkbonnen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            offerte_id INTEGER REFERENCES offertes_v2(id) ON DELETE SET NULL,
            klant_id INTEGER NOT NULL REFERENCES klanten(id) ON DELETE RESTRICT,
            volgnummer TEXT UNIQUE,
            object_naam TEXT,
            regels_json TEXT NOT NULL DEFAULT '[]',
            subtotaal REAL NOT NULL DEFAULT 0,
            marge_pct REAL NOT NULL DEFAULT 0,
            verkoopprijs_basis REAL NOT NULL DEFAULT 0,
            verkoopprijs REAL NOT NULL DEFAULT 0,
            btw_pct REAL NOT NULL DEFAULT 0,
            btw_bedrag REAL NOT NULL DEFAULT 0,
            totaal REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'in te plannen'
              CHECK (status IN ('in te plannen','gepland','bezig','voltooid','gecontroleerd','gefactureerd','betaald','gefaald','geannuleerd')),
            betaald INTEGER NOT NULL DEFAULT 0,
            betaald_op TEXT,
            geldig_tot TEXT,
            levertermijn TEXT,
            notities TEXT,
            aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_werkbonnen_klant ON werkbonnen(klant_id);
          CREATE INDEX IF NOT EXISTS idx_werkbonnen_offerte ON werkbonnen(offerte_id);
          CREATE INDEX IF NOT EXISTS idx_werkbonnen_status ON werkbonnen(status);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_werkbonnen_volgnummer ON werkbonnen(volgnummer);
        `);

        // ── Stap 2: bestaande jobs met offerte_id groeperen — VOOR de
        // status-CHECK op jobs vernauwd wordt (anders faalt straks de
        // rebuild op een rij die nog 'gecontroleerd'/'gefactureerd'/
        // 'betaald' is). ─────────────────────────────────────────────
        const oudeJobs = db.prepare(`
          SELECT id, offerte_id, status, betaald, betaald_op
          FROM jobs WHERE offerte_id IS NOT NULL ORDER BY offerte_id, id
        `).all();

        const groepen = new Map(); // offerte_id -> jobs[]
        for (const j of oudeJobs) {
          if (!groepen.has(j.offerte_id)) groepen.set(j.offerte_id, []);
          groepen.get(j.offerte_id).push(j);
        }

        function volgendWerkbonVolgnummer(jaar) {
          const sleutel = `werkbon_volgnummer_teller_${jaar}`;
          const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
          const teller = (rij ? parseInt(rij.waarde) || 0 : 0) + 1;
          db.prepare(`
            INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)
            ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde
          `).run(sleutel, String(teller));
          return `WB-${jaar}-${String(teller).padStart(4, '0')}`;
        }

        const offerteStmt = db.prepare('SELECT * FROM offertes_v2 WHERE id = ?');
        const werkbonInsert = db.prepare(`
          INSERT INTO werkbonnen (
            offerte_id, klant_id, volgnummer, object_naam, regels_json,
            subtotaal, marge_pct, verkoopprijs_basis, verkoopprijs, btw_pct, btw_bedrag, totaal,
            status, betaald, betaald_op, geldig_tot, levertermijn, notities, aangemaakt_op
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        // job.id -> { werkbon_id, werkbon_regel_index, status }
        const jobUpdates = new Map();

        for (const [offerteId, jobsInGroep] of groepen) {
          const offerte = offerteStmt.get(offerteId);
          if (!offerte) continue; // offerte intussen verwijderd — jobs blijven gewoon los bestaan

          // Mislukte/geannuleerde pogingen tellen niet mee — de werkbon is
          // pas zo ver gevorderd als de MINST gevorderde échte poging.
          const relevant = jobsInGroep.filter(j => STATUS_ORDER.includes(j.status));
          let werkbonStatus = 'gepland';
          if (relevant.length) {
            werkbonStatus = relevant.reduce((min, j) =>
              STATUS_ORDER.indexOf(j.status) < STATUS_ORDER.indexOf(min) ? j.status : min, relevant[0].status);
          }
          const werkbonBetaald = relevant.length > 0 && relevant.every(j => j.betaald);
          // Enkel een betaald_op invullen als de werkbon ALS GEHEEL betaald is
          // — anders geeft een individueel betaalde job (bv. een oude
          // deelfactuur) een misleidende datum bij een nog openstaande werkbon.
          const werkbonBetaaldOp = werkbonBetaald
            ? (jobsInGroep.map(j => j.betaald_op).filter(Boolean).sort().slice(-1)[0] || null)
            : null;

          let regels = [];
          try { regels = offerte.regels_json ? JSON.parse(offerte.regels_json) : []; } catch { regels = []; }
          if (!regels.length) {
            // Zeer oude offerte zonder regels_json (van vóór het regels-
            // herontwerp) — bewaar op zijn minst het totaalbedrag als 1
            // printen-regel, zodat er niets zoek raakt.
            regels = [{
              type: 'printen', object_naam: offerte.object_naam || '',
              _berekend: { bedrag: offerte.verkoopprijs || 0, vaste_prijs: false, tijd_u: 0 },
            }];
          }

          const jaar = (offerte.aangemaakt_op || '').slice(0, 4) || String(new Date().getFullYear());
          const volgnummer = volgendWerkbonVolgnummer(jaar);

          const result = werkbonInsert.run(
            offerteId, offerte.klant_id, volgnummer, offerte.object_naam, JSON.stringify(regels),
            offerte.subtotaal || 0, offerte.marge_pct || 0,
            offerte.verkoopprijs || 0, offerte.verkoopprijs || 0,
            offerte.btw_pct ?? 0, offerte.btw_bedrag || 0, offerte.totaal || 0,
            werkbonStatus, werkbonBetaald ? 1 : 0, werkbonBetaaldOp,
            offerte.geldig_tot || null, offerte.levertermijn || null,
            offerte.notities || null, offerte.aangemaakt_op || new Date().toISOString()
          );
          const werkbonId = result.lastInsertRowid;
          aantalWerkbonnen++;

          // Printen-regel-indices op volgorde — de oude /maak-job-route
          // maakte in principe 1 job per printen-regel, in diezelfde
          // volgorde. Maar dat viel soms samen: een mislukte poging kreeg
          // een nieuwe job voor DEZELFDE regel (precies het "2 jobs voor 1
          // print"-knelpunt uit de aanleiding van deze migratie), dus er
          // kunnen méér jobs dan printen-regels in een groep zitten. Daarom
          // een lopende wijzer die enkel opschuift naar de volgende regel
          // ná een job die NIET mislukt/geannuleerd is — een mislukte poging
          // "verbruikt" geen regel, dus de eerstvolgende job (de herprint)
          // blijft aan diezelfde regel gekoppeld in plaats van te verwezen
          // naar (of voorbij) de volgende regel.
          const printenIndices = regels.map((rg, i) => rg.type === 'printen' ? i : -1).filter(i => i >= 0);
          let regelPtr = 0;
          jobsInGroep.forEach((j) => {
            const regelIdx = printenIndices.length
              ? printenIndices[Math.min(regelPtr, printenIndices.length - 1)]
              : null;
            // Een oude facturatiestatus betekent sowieso dat er klaar
            // geprint was — die info verhuist naar de werkbon hierboven.
            const nieuweStatus = ['gecontroleerd', 'gefactureerd', 'betaald'].includes(j.status) ? 'voltooid' : j.status;
            jobUpdates.set(j.id, {
              werkbon_id: werkbonId,
              werkbon_regel_index: regelIdx,
              status: nieuweStatus,
            });
            const mislukt = ['gefaald', 'geannuleerd'].includes(j.status);
            if (!mislukt && regelPtr < printenIndices.length - 1) regelPtr++;
          });
        }

        // ── Stap 3: jobs met een oude facturatiestatus naar 'voltooid'
        // herleiden — dat is voortaan een zuivere productiestatus (die info
        // verhuisde hierboven al naar de nieuwe werkbon). De CHECK op jobs
        // blijft ongewijzigd toegestaan (zie toelichting bovenaan dit
        // bestand), dus dit is hier puur data-opschoning, geen vereiste. ──
        const zetStatus = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
        for (const [jobId, upd] of jobUpdates) zetStatus.run(upd.status, jobId);
        // Jobs zonder offerte_id (dus niet in jobUpdates) kunnen evengoed
        // een oude facturatiestatus dragen (handmatig gezet) — ook die
        // herleiden.
        db.prepare(`UPDATE jobs SET status = 'voltooid' WHERE status IN ('gecontroleerd','gefactureerd','betaald')`).run();

        // ── Stap 4: jobs-tabel herbouwen — zelfde status-CHECK als voorheen
        // (zie toelichting bovenaan) + nieuw: werkbon_id/werkbon_regel_index. ──
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
            geldig_tot TEXT,
            werkbon_id INTEGER REFERENCES werkbonnen(id) ON DELETE SET NULL,
            werkbon_regel_index INTEGER
          );

          INSERT INTO jobs_new (
            id, klant_id, printer_id, naam, type, dienst_categorie, volgnummer, status,
            stl_bestandsnaam, print_uren_geschat, print_uren_werkelijk, is_multicolor,
            aantal_kleuren, aangemaakt_op, gestart_op, voltooid_op, notities, offerte_id,
            klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat, offerte_nummer, geldig_tot
          )
          SELECT
            id, klant_id, printer_id, naam, type, dienst_categorie, volgnummer, status,
            stl_bestandsnaam, print_uren_geschat, print_uren_werkelijk, is_multicolor,
            aantal_kleuren, aangemaakt_op, gestart_op, voltooid_op, notities, offerte_id,
            klant_id_cached, betaald, betaald_op, kwh_start, gewicht_geschat, offerte_nummer, geldig_tot
          FROM jobs;

          DROP TABLE jobs;
          ALTER TABLE jobs_new RENAME TO jobs;

          CREATE INDEX IF NOT EXISTS idx_jobs_klant ON jobs(klant_id);
          CREATE INDEX IF NOT EXISTS idx_jobs_printer ON jobs(printer_id);
          CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_volgnummer ON jobs(volgnummer);
          CREATE INDEX IF NOT EXISTS idx_jobs_werkbon ON jobs(werkbon_id);
        `);

        const zetKoppeling = db.prepare('UPDATE jobs SET werkbon_id = ?, werkbon_regel_index = ? WHERE id = ?');
        for (const [jobId, upd] of jobUpdates) zetKoppeling.run(upd.werkbon_id, upd.werkbon_regel_index, jobId);
      });
      migreer();
    } finally {
      if (fkWasAan) db.pragma('foreign_keys = ON');
    }

    console.log(`Migratie v42: ${aantalWerkbonnen} bestaande werkbon(nen) aangemaakt uit offerte-jobs, jobs-tabel herbouwd (pure productiestatus + werkbon-koppeling)`);
  } catch (e) {
    console.error('Migratie v42 fout:', e.message);
  }
}
