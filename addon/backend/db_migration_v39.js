// Migratie v39 — vast_prijs_totaal toegevoegd aan job_kosten: het deel van de
// verkoopprijs dat afkomstig is van "vaste prijs, geen marge, incl. BTW"
// diensten (bv. verzendkosten via job_diensten, zie migratie v33) — bevroren
// bewaard bij elke /kosten/bereken, zodat de PDF/e-mail nadien altijd BTW
// enkel op het marge-gebaseerde deel berekent, ook als de vaste_prijs-vlag
// van het onderliggende artikeltype later nog verandert. Zelfde principe als
// artikelen_vast_kost bij offertes (migratie v38).
export function migrateDbV39(db) {
  const cols = db.prepare("PRAGMA table_info(job_kosten)").all().map(c => c.name);
  if (!cols.includes('vast_prijs_totaal')) {
    db.prepare("ALTER TABLE job_kosten ADD COLUMN vast_prijs_totaal REAL NOT NULL DEFAULT 0").run();
    console.log('Migratie v39: vast_prijs_totaal toegevoegd aan job_kosten');
  }
}
