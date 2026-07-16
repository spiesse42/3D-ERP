import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

r.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM printers ORDER BY id').all());
});

r.get('/config', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE actief = 1 ORDER BY id').all();
  const tarieven = db.prepare("SELECT sleutel, waarde FROM tarieven WHERE sleutel IN ('kwh_prijs')").all();
  const kwh_prijs = tarieven.find(t => t.sleutel === 'kwh_prijs')?.waarde || 0.35;

  const config = printers.map(p => {
    const prefix = p.ha_entity_prefix || '';
    const isBambu = p.naam.toLowerCase().includes('bambu') || prefix.includes('a1mini');
    const isEnder = p.naam.toLowerCase().includes('ender') || prefix.includes('ender');

    let entities = {};
    if (isBambu && prefix) {
      entities = {
        status:      `${prefix}printstatus`,
        progress:    `${prefix}printvoortgang`,
        filename:    `${prefix}taaknaam`,
        remaining:   `${prefix}resterende_tijd`,
        layer_cur:   `${prefix}huidige_laag`,
        layer_tot:   `${prefix}hoeveelheid_lagen`,
        filament:    `${prefix}gewicht_van_print`,
        start:       `${prefix}starttijd`,
        bed_temp:    `${prefix}bedtemperatuur`,
        nozzle_temp: `${prefix}nozzle_temperatuur`,
        kwh:         p.kwh_entity || '',
        watt:        p.watt_entity || '',
      };
    } else if (isEnder && prefix) {
      entities = {
        status:      `${prefix}current_print_state`,
        progress:    `${prefix}progress`,
        filename:    `${prefix}filename`,
        remaining:   `${prefix}print_eta`,
        layer_cur:   `${prefix}current_layer`,
        layer_tot:   `${prefix}total_layer`,
        filament:    `${prefix}filament_used`,
        duration:    `${prefix}print_duration`,
        bed_temp:    `${prefix}bed_temperature`,
        nozzle_temp: `${prefix}extruder_temperature`,
        kwh:         p.kwh_entity || '',
        watt:        p.watt_entity || '',
      };
    }

    return {
      id:                  p.id,
      naam:                p.naam,
      type:                isBambu ? 'bambu' : isEnder ? 'ender' : 'generic',
      heeft_bmcu:          p.heeft_bmcu,
      machine_kost_per_uur: p.machine_kost_per_uur,
      ha_entity_prefix:    prefix,
      entities,
      kwh_prijs,
      gem_verbruik_watt:   p.gem_verbruik_watt,
      auto_job_aanmaken:   !!p.auto_job_aanmaken,
    };
  });

  res.json(config);
});

r.put('/:id', (req, res) => {
  const db = getDb();
  const { naam, type, ha_entity_prefix, kwh_entity, machine_kost_per_uur, heeft_bmcu, actief, gem_verbruik_watt } = req.body;
  db.prepare(`UPDATE printers SET naam=?,type=?,ha_entity_prefix=?,kwh_entity=?,
    machine_kost_per_uur=?,heeft_bmcu=?,actief=?,gem_verbruik_watt=? WHERE id=?`)
    .run(naam, type, ha_entity_prefix||null, kwh_entity||null,
      machine_kost_per_uur, heeft_bmcu?1:0, actief?1:0,
      (gem_verbruik_watt !== undefined && gem_verbruik_watt !== '') ? parseFloat(gem_verbruik_watt) : null,
      req.params.id);
  res.json({ ok: true });
});

// Lichte toggle voor auto-job-aanmaak — bedoeld om vanuit de printerkaart zelf
// snel te pauzeren/hervatten (bv. tijdens filament-kalibratie), zonder de volledige
// printer-instellingen te moeten opsturen.
r.patch('/:id/auto-job', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE printers SET auto_job_aanmaken = ? WHERE id = ?')
    .run(req.body.auto_job_aanmaken ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

export default r;
