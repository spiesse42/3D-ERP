// Migratie v38:
// 1. Bedrijfsgegevens toegevoegd aan de generieke instellingen-tabel, zodat
//    ze getoond kunnen worden op offertes/werkbonnen/facturen (header/footer).
// 2. filament_types.vaste_prijs — boolean vlag: "vaste prijs, geen marge,
//    prijs is al incl. BTW" (bv. voor verzendkosten-artikelen). Standaard 0
//    (uit) voor alle bestaande rijen.
export function migrateDbV38(db) {
  const bedrijfsVelden = [
    ['bedrijf_naam',   '3D Plezier',                                   'Bedrijfsnaam'],
    ['bedrijf_btw',    'BE0543857422',                                 'BTW-nummer'],
    ['bedrijf_adres',  'Constant Vanden Berghestraat 14, 8700 AARSELE','Adres'],
    ['bedrijf_email',  '3dplezier@gmail.com',                          'E-mailadres'],
    ['bedrijf_iban',   'BE59 0020 3763 3126',                          'IBAN'],
  ];
  const bestaat = db.prepare('SELECT 1 FROM instellingen WHERE sleutel = ?');
  const insert  = db.prepare('INSERT INTO instellingen (sleutel, waarde, label) VALUES (?,?,?)');
  for (const [sleutel, waarde, label] of bedrijfsVelden) {
    if (!bestaat.get(sleutel)) {
      insert.run(sleutel, waarde, label);
      console.log(`[V38] ${sleutel} toegevoegd aan instellingen`);
    }
  }

  const cols = db.prepare("PRAGMA table_info(filament_types)").all().map(c => c.name);
  if (!cols.includes('vaste_prijs')) {
    db.prepare("ALTER TABLE filament_types ADD COLUMN vaste_prijs INTEGER NOT NULL DEFAULT 0").run();
    console.log('[V38] filament_types.vaste_prijs toegevoegd');
  }
}
