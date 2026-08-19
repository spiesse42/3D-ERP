export function migrateDbV26(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS filament_kalibraties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE CASCADE,
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
      UNIQUE(filament_type_id, printer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_kalibratie_type    ON filament_kalibraties(filament_type_id);
    CREATE INDEX IF NOT EXISTS idx_kalibratie_printer ON filament_kalibraties(printer_id);
  `);
  console.log('Migratie v26: filament_kalibraties aangemaakt (kalibratiewaarden per filament type + printer)');
}
