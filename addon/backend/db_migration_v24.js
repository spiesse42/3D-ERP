export function migrateDbV24(db) {
  try {
    // V1-offertesysteem (offertes/offerte_regels/betalingen) is vervangen door
    // offertes_v2 en is nooit in productie gebruikt — definitief opruimen.
    // Volgorde: kind-tabellen eerst (betalingen/offerte_regels hebben FK's naar offertes).
    db.exec('DROP TABLE IF EXISTS betalingen');
    db.exec('DROP TABLE IF EXISTS offerte_regels');
    db.exec('DROP TABLE IF EXISTS offertes');
    console.log('Migratie v24: dode V1-offertetabellen (offertes/offerte_regels/betalingen) verwijderd');
  } catch (e) {
    console.error('Migratie v24 fout:', e.message);
  }
}
