// Migratie v45: kolom `voorraad_aantal` op filament_types — simpele,
// manueel bijgehouden stuks-teller voor de nieuwe categorie 'product'
// (afgewerkte, kant-en-klare producten die de gebruiker verkoopt, bv.
// "Fuzzy Bubble Letter"). Filament trackt voorraad al via de aparte
// filament_rollen-tabel (gram-gebaseerd, met rollen/lotnummers) — dat past
// niet bij "ik heb er nog 12 stuks van dit product", dus geen rollen-model
// hier. Bewust GEEN automatische afboeking bij verkoop/levering: de
// gebruiker past dit getal gewoon zelf aan wanneer hij dat wil.
// NOT NULL DEFAULT 0 zodat bestaande rijen (filament/dienst/overig/...) een
// bruikbare, ondubbelzinnige waarde krijgen i.p.v. NULL.
export function migrateDbV45(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(filament_types)").all().map(c => c.name);
    if (!cols.includes('voorraad_aantal')) {
      db.prepare("ALTER TABLE filament_types ADD COLUMN voorraad_aantal REAL NOT NULL DEFAULT 0").run();
      console.log('Migratie v45: voorraad_aantal toegevoegd aan filament_types');
    }
  } catch (e) { console.error('Migratie v45 fout:', e.message); }
}
