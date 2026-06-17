export function migrateDbV18(db) {
  const cols = db.prepare("PRAGMA table_info(job_kosten)").all().map(c => c.name);

  if (!cols.includes('aantal')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN aantal INTEGER NOT NULL DEFAULT 1").run();
    console.log('Migratie v18: aantal toegevoegd aan job_kosten');
  }
  if (!cols.includes('extra_per_stuk')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN extra_per_stuk REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: extra_per_stuk toegevoegd aan job_kosten');
  }
  if (!cols.includes('extra_eenmalig')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN extra_eenmalig REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: extra_eenmalig toegevoegd aan job_kosten');
  }
  if (!cols.includes('extra_omschrijving')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN extra_omschrijving TEXT").run();
    console.log('Migratie v18: extra_omschrijving toegevoegd aan job_kosten');
  }
  if (!cols.includes('voorbereiding_min')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN voorbereiding_min REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: voorbereiding_min toegevoegd aan job_kosten');
  }
  if (!cols.includes('nabewerking_min')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN nabewerking_min REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: nabewerking_min toegevoegd aan job_kosten');
  }
  if (!cols.includes('ontwerp_min')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN ontwerp_min REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: ontwerp_min toegevoegd aan job_kosten');
  }
  if (!cols.includes('ontwerp_tarief')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN ontwerp_tarief REAL NOT NULL DEFAULT 15").run();
    console.log('Migratie v18: ontwerp_tarief toegevoegd aan job_kosten');
  }
  if (!cols.includes('nabewerking_extra_min')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN nabewerking_extra_min REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v18: nabewerking_extra_min toegevoegd aan job_kosten');
  }
  if (!cols.includes('nabewerking_extra_tarief')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN nabewerking_extra_tarief REAL NOT NULL DEFAULT 15").run();
    console.log('Migratie v18: nabewerking_extra_tarief toegevoegd aan job_kosten');
  }
}
