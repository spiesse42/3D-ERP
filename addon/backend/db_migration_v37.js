// Migratie v37 — arbeid_per_uur toegevoegd aan offertes_v2. Wordt bij het
// aanmaken/bewerken van een offerte bevroren op het op dat moment geldende
// tarief, zodat de PDF nadien altijd dezelfde bedragen toont, ook als het
// algemene arbeidstarief in Instellingen later wijzigt.
export function migrateDbV37(db) {
  const cols = db.prepare("PRAGMA table_info(offertes_v2)").all().map(c => c.name);
  if (!cols.includes('arbeid_per_uur')) {
    db.prepare("ALTER TABLE offertes_v2 ADD COLUMN arbeid_per_uur REAL").run();
    console.log('Migratie v37: arbeid_per_uur toegevoegd aan offertes_v2');
  }
}
