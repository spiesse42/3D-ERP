// Migratie v43: tabel 'pakbonnen' — leveringsbonnen voor (deel)leveringen van
// een werkbon. Losstaand van de werkbon zelf: een werkbon kan 0, 1 of
// meerdere pakbonnen krijgen (bv. eerst een deellevering, later de rest —
// elke deellevering krijgt zijn eigen volgnummer + PDF, zodat de
// leveringsgeschiedenis bewaard blijft).
//
// Elke pakbon draagt een eigen, vrij bewerkbare regels_json-snapshot: aantal +
// omschrijving, GEEN bedragen (een pakbon is geen facturatiedocument, dat
// blijft de werkbon/factuur). Elke regel heeft een optionele koppeling
// (werkbon_regel_index) terug naar de werkbon-regel waaruit ze is
// voorgesteld — puur voor traceerbaarheid en de "nog te leveren"-berekening
// (zie routes/pakbonnen.js). Een regel zonder koppeling (handmatig
// toegevoegd, bv. een extraatje dat niet op de werkbon stond) mag gewoon met
// werkbon_regel_index = null.
//
// Bewust GEEN wijziging aan werkbonnen of jobs hier: een pakbon aanmaken mag
// nooit de werkbon-regels of de job-koppeling zelf aanpassen — wat nog niet
// geleverd is, blijft gewoon zoals het was, en blijft dus gelinkt aan
// dezelfde werkbon/jobs. "Nog te leveren" wordt bij het opvragen steeds
// dynamisch herberekend (totaal op de werkbon-regel minus de som van alle
// bestaande pakbon-regels met diezelfde koppeling) — geen aparte, apart bij
// te houden telkolom die uit sync kan raken.
export function migrateDbV43(db) {
  try {
    const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pakbonnen'").get();
    if (tabel) {
      console.log('Migratie v43: al uitgevoerd (tabel pakbonnen bestaat al)');
      return;
    }
    db.exec(`
      CREATE TABLE pakbonnen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        werkbon_id INTEGER NOT NULL REFERENCES werkbonnen(id) ON DELETE CASCADE,
        volgnummer TEXT UNIQUE,
        regels_json TEXT NOT NULL DEFAULT '[]',
        notities TEXT,
        aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pakbonnen_werkbon ON pakbonnen(werkbon_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pakbonnen_volgnummer ON pakbonnen(volgnummer);
    `);
    console.log('Migratie v43: tabel pakbonnen aangemaakt');
  } catch (e) {
    console.error('Migratie v43 fout:', e.message);
  }
}
