// Migratie v36 — instelling voor de Gemini API-key, gebruikt om geüploade
// facturen (PDF) automatisch te laten uitlezen (leverancier, datum, regels)
// vanuit de Artikelen-tab.
export function migrateDbV36(db) {
  const bestaat = db.prepare(
    "SELECT 1 FROM instellingen WHERE sleutel = 'gemini_api_key'"
  ).get();
  if (!bestaat) {
    db.prepare(
      `INSERT INTO instellingen (sleutel, waarde, label) VALUES ('gemini_api_key', '', 'Gemini API-key (factuurherkenning)')`
    ).run();
    console.log('Migratie v36: gemini_api_key toegevoegd aan instellingen');
  }
}
