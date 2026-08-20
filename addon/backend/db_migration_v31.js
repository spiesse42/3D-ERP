// Migratie v31: kalibratie verhuist van artikelniveau (filament type) naar
// voorraadniveau (filament type + kleur) — kleur wordt toegekend bij de
// voorraad/rol en bepaalt mee de kalibratiewaarden (pigment beïnvloedt flow,
// temperatuur enz.). Alle rollen van hetzelfde type+kleur delen 1 kalibratieset.
// Bestaande kalibraties (zonder kleur-onderscheid) blijven behouden als de
// "algemene" set voor dat type (kleur = '').
export function migrateDbV31(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(filament_kalibraties)").all().map(c => c.name);
    if (cols.includes('kleur')) {
      console.log('Migratie v31: kolom kleur al aanwezig in filament_kalibraties');
      return;
    }

    db.exec(`
      CREATE TABLE filament_kalibraties_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE CASCADE,
        kleur TEXT NOT NULL DEFAULT '',
        printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
        flow_ratio REAL,
        max_volumetric_speed REAL,
        nozzle_temp_eerste_laag REAL,
        nozzle_temp_overige_lagen REAL,
        bed_temp_eerste_laag REAL,
        bed_temp_overige_lagen REAL,
        pressure_advance REAL,
        retractie_lengte REAL,
        retractie_snelheid REAL,
        notities TEXT,
        bijgewerkt_op TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(filament_type_id, kleur, printer_id)
      );

      INSERT INTO filament_kalibraties_new
        (id, filament_type_id, kleur, printer_id, flow_ratio, max_volumetric_speed,
         nozzle_temp_eerste_laag, nozzle_temp_overige_lagen, bed_temp_eerste_laag, bed_temp_overige_lagen,
         pressure_advance, retractie_lengte, retractie_snelheid, notities, bijgewerkt_op)
      SELECT id, filament_type_id, '', printer_id, flow_ratio, max_volumetric_speed,
         nozzle_temp_eerste_laag, nozzle_temp_overige_lagen, bed_temp_eerste_laag, bed_temp_overige_lagen,
         pressure_advance, retractie_lengte, retractie_snelheid, notities, bijgewerkt_op
      FROM filament_kalibraties;

      DROP TABLE filament_kalibraties;
      ALTER TABLE filament_kalibraties_new RENAME TO filament_kalibraties;

      CREATE INDEX IF NOT EXISTS idx_kalibratie_type    ON filament_kalibraties(filament_type_id);
      CREATE INDEX IF NOT EXISTS idx_kalibratie_printer ON filament_kalibraties(printer_id);
      CREATE INDEX IF NOT EXISTS idx_kalibratie_kleur    ON filament_kalibraties(filament_type_id, kleur);
    `);
    console.log('Migratie v31: kalibratie verplaatst naar type+kleur (voorraadniveau)');
  } catch (e) {
    console.error('Migratie v31 fout:', e.message);
  }
}
