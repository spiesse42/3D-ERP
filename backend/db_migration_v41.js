// Migratie v41 — herontwerp offertes: regels_json + levertermijn op offertes_v2.
//
// regels_json bevat de nieuwe, vrij samen te stellen lijst diensten/objecten
// per offerte (ontwerp / aanpassing / printen / extra / artikel — zie
// offertes_v2.js voor de exacte vorm en de berekening per type). Zelfde
// opslagpatroon als het bestaande filament_rollen_json: gewoon een JSON-
// blob die bij het opslaan bevriest, geen aparte child-tabel nodig.
//
// Oudere offertes (aangemaakt vóór deze migratie) hebben regels_json = NULL
// en blijven werken via de bestaande losse velden (materiaal_kost, arbeid_kost,
// object_naam, ...) — de berekenings- en PDF-code in offertes_v2.js valt
// daar bewust op terug zodat niets van vroeger breekt.
//
// levertermijn: vrije tekst (bv. "3 weken"), standaard ingevuld door de
// frontend bij het aanmaken — hier enkel de kolom, geen DB-default nodig.
export function migrateDbV41(db) {
  const cols = db.prepare("PRAGMA table_info(offertes_v2)").all().map(c => c.name);

  if (!cols.includes('regels_json')) {
    db.prepare("ALTER TABLE offertes_v2 ADD COLUMN regels_json TEXT").run();
    console.log('Migratie v41: regels_json toegevoegd aan offertes_v2');
  }
  if (!cols.includes('levertermijn')) {
    db.prepare("ALTER TABLE offertes_v2 ADD COLUMN levertermijn TEXT").run();
    console.log('Migratie v41: levertermijn toegevoegd aan offertes_v2');
  }
}
