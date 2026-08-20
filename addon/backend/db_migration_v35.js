// Migratie v35: printerbediening vanuit de ERP zelf — pauzeer/hervat/annuleer-
// knoppen en een live camerabeeld, rechtstreeks op de printerkaart. Elk veld is
// optioneel en printer-specifiek: enkel invullen wat je HA-integratie voor die
// printer effectief aanbiedt (bv. de Ender via Moonraker heeft mogelijk geen
// camera-entiteit, de Kobra wel via de Anycubic S1 MQTT Bridge).
export function migrateDbV35(db) {
  const kolommen = db.prepare("PRAGMA table_info(printers)").all().map(c => c.name);
  const toevoegen = [
    ['pause_entity',  "ALTER TABLE printers ADD COLUMN pause_entity TEXT"],
    ['resume_entity', "ALTER TABLE printers ADD COLUMN resume_entity TEXT"],
    ['cancel_entity', "ALTER TABLE printers ADD COLUMN cancel_entity TEXT"],
    ['camera_entity', "ALTER TABLE printers ADD COLUMN camera_entity TEXT"],
  ];
  for (const [naam, sql] of toevoegen) {
    if (!kolommen.includes(naam)) {
      db.exec(sql);
      console.log(`Migratie v35: ${naam} toegevoegd aan printers`);
    }
  }
}
