// Migratie v44: kolom `werkbon_regel_aantal` op jobs — hoeveel stuks van het
// totale aantal van de gekoppelde werkbon-regel deze ENE printopdracht dekt.
// Een werkbon-regel (bv. 150× "Fuzzy Bubble Letters") wordt vaak in
// meerdere batches geprint (job van 3 stuks, later een job van 5 stuks,
// enz.) — elke job koppelt aan dezelfde werkbon-regel (werkbon_regel_index,
// zie migratie v42), maar zonder een aantal-per-job kan je geen voortgang
// tonen ("83 van de 150 al gepland"). Nullable: een job zonder werkbon-
// koppeling (of een oude, al gekoppelde job van vóór deze migratie) heeft
// gewoon geen aantal geregistreerd.
export function migrateDbV44(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(jobs)").all().map(c => c.name);
    if (!cols.includes('werkbon_regel_aantal')) {
      db.prepare("ALTER TABLE jobs ADD COLUMN werkbon_regel_aantal INTEGER").run();
      console.log('Migratie v44: werkbon_regel_aantal toegevoegd aan jobs');
    }
  } catch (e) { console.error('Migratie v44 fout:', e.message); }
}
