import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

// Home Assistant entity-ID's horen altijd een domein te bevatten (bv. 'sensor.xxx').
// Voor het prefix-veld en de kWh/Watt-velden weten we dat het domein altijd
// 'sensor' is — dat vullen we dus zelf aan als iemand het vergeet te typen
// (bv. 'a1_0390..._' i.p.v. 'sensor.a1_0390..._'). Zonder deze correctie blijven
// alle daaruit opgebouwde entiteiten stil "unavailable", zonder duidelijke reden.
// Toegepast bij opslaan én bij elke config-ophaling (zelfherstellend, zelfde
// aanpak als elders in dit bestand/usePrinterData.js), zodat een al bestaande
// foutieve waarde ook zonder herbewaren meteen weer werkt.
function normalizeSensorId(waarde) {
  if (!waarde) return waarde;
  const trimmed = String(waarde).trim();
  if (!trimmed) return trimmed;
  return /^[a-z_]+\./.test(trimmed) ? trimmed : `sensor.${trimmed}`;
}

// Voor button-/camera-velden kunnen we het domein niet zelf raden (button./camera.
// kan niet uit sensor. afgeleid worden) — daar valideren we enkel dat er wél een
// domein in zit, zodat een duidelijke foutmelding komt i.p.v. een stil falende knop.
function valideerEntityId(waarde, veldnaam) {
  if (!waarde) return null;
  const trimmed = String(waarde).trim();
  if (trimmed && !/^[a-z_]+\./.test(trimmed)) {
    return `${veldnaam} moet een volledige HA entity-ID zijn, inclusief domein (bv. button.mijn_knop) — "${trimmed}" mist dat.`;
  }
  return null;
}

r.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM printers ORDER BY id').all());
});

r.get('/config', (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE actief = 1 ORDER BY id').all();
  const tarieven = db.prepare("SELECT sleutel, waarde FROM tarieven WHERE sleutel IN ('kwh_prijs')").all();
  const kwh_prijs = tarieven.find(t => t.sleutel === 'kwh_prijs')?.waarde || 0.35;

  const config = printers.map(p => {
    const prefix = normalizeSensorId(p.ha_entity_prefix) || '';
    const isBambu = p.naam.toLowerCase().includes('bambu') || prefix.includes('a1mini');
    const isEnder = p.naam.toLowerCase().includes('ender') || prefix.includes('ender');
    const isKobra = p.naam.toLowerCase().includes('kobra') || prefix.includes('kobra');

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
        kwh:         normalizeSensorId(p.kwh_entity) || '',
        watt:        normalizeSensorId(p.watt_entity) || '',
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
        kwh:         normalizeSensorId(p.kwh_entity) || '',
        watt:        normalizeSensorId(p.watt_entity) || '',
      };
    } else if (isKobra && prefix) {
      // Anycubic S1 MQTT Bridge (community HA-addon): print_state/print_layer/
      // material_usage zijn een rechtstreekse doorgave van wat de printer zelf
      // rapporteert. "done" = print voltooid, "free"/"stoped" = geen actieve job
      // (bevestigd via de broncode van de addon) — de exacte "actief printen"-
      // waarde (vermoedelijk "printing") wordt pas zeker bij een live test.
      entities = {
        status:      `${prefix}print_state`,
        progress:    `${prefix}print_progress`,
        filename:    `${prefix}print_filename`,
        remaining:   `${prefix}print_time_remaining`,   // minuten
        duration:    `${prefix}print_time_elapsed`,     // minuten
        layer_raw:   `${prefix}print_layer`,            // reeds "cur / tot"
        filament:    `${prefix}material_usage`,         // mm
        bed_temp:    `${prefix}hotbed_temperature`,
        nozzle_temp: `${prefix}nozzle_temperature`,
        kwh:         normalizeSensorId(p.kwh_entity) || '',
        watt:        normalizeSensorId(p.watt_entity) || '',
      };
    } else {
      // Onbekend/generiek type — geen kant-en-klare statusmapping, maar de
      // handmatig ingestelde kWh/Watt-entiteiten mogen nooit verloren gaan.
      entities = {
        kwh:  normalizeSensorId(p.kwh_entity) || '',
        watt: normalizeSensorId(p.watt_entity) || '',
      };
    }

    return {
      id:                  p.id,
      naam:                p.naam,
      type:                isBambu ? 'bambu' : isEnder ? 'ender' : isKobra ? 'kobra' : 'generic',
      heeft_bmcu:          p.heeft_bmcu,
      machine_kost_per_uur: p.machine_kost_per_uur,
      ha_entity_prefix:    prefix,
      entities,
      kwh_prijs,
      gem_verbruik_watt:   p.gem_verbruik_watt,
      auto_job_aanmaken:   !!p.auto_job_aanmaken,
      pause_entity:        p.pause_entity  || '',
      resume_entity:       p.resume_entity || '',
      cancel_entity:       p.cancel_entity || '',
      camera_entity:       p.camera_entity || '',
    };
  });

  res.json(config);
});

r.post('/', (req, res) => {
  const db = getDb();
  const { naam, type, ha_entity_prefix, kwh_entity, watt_entity, machine_kost_per_uur, heeft_bmcu, gem_verbruik_watt,
    pause_entity, resume_entity, cancel_entity, camera_entity } = req.body;
  if (!naam || !naam.trim()) return res.status(400).json({ error: 'Naam is verplicht' });
  const entityFouten = [
    valideerEntityId(pause_entity, 'Pauzeer-knop entity'),
    valideerEntityId(resume_entity, 'Hervat-knop entity'),
    valideerEntityId(cancel_entity, 'Annuleer-knop entity'),
    valideerEntityId(camera_entity, 'Camera entity'),
  ].filter(Boolean);
  if (entityFouten.length) return res.status(400).json({ error: entityFouten.join(' ') });
  try {
    const result = db.prepare(`
      INSERT INTO printers (naam,type,ha_entity_prefix,kwh_entity,watt_entity,machine_kost_per_uur,heeft_bmcu,actief,gem_verbruik_watt,
        pause_entity,resume_entity,cancel_entity,camera_entity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      naam.trim(), type || 'FDM', normalizeSensorId(ha_entity_prefix) || null, normalizeSensorId(kwh_entity) || null, normalizeSensorId(watt_entity) || null,
      (machine_kost_per_uur !== undefined && machine_kost_per_uur !== '') ? parseFloat(machine_kost_per_uur) : 0.13,
      heeft_bmcu ? 1 : 0, 1,
      (gem_verbruik_watt !== undefined && gem_verbruik_watt !== '') ? parseFloat(gem_verbruik_watt) : null,
      pause_entity || null, resume_entity || null, cancel_entity || null, camera_entity || null
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { naam, type, ha_entity_prefix, kwh_entity, watt_entity, machine_kost_per_uur, heeft_bmcu, actief, gem_verbruik_watt,
      pause_entity, resume_entity, cancel_entity, camera_entity } = req.body;
    if (!naam || !naam.trim()) return res.status(400).json({ error: 'Naam is verplicht' });
    const machineKost = (machine_kost_per_uur !== undefined && machine_kost_per_uur !== '') ? parseFloat(machine_kost_per_uur) : 0.13;
    if (!Number.isFinite(machineKost) || machineKost < 0) return res.status(400).json({ error: 'Machinekost per uur moet een getal (0 of hoger) zijn' });
    const entityFouten = [
      valideerEntityId(pause_entity, 'Pauzeer-knop entity'),
      valideerEntityId(resume_entity, 'Hervat-knop entity'),
      valideerEntityId(cancel_entity, 'Annuleer-knop entity'),
      valideerEntityId(camera_entity, 'Camera entity'),
    ].filter(Boolean);
    if (entityFouten.length) return res.status(400).json({ error: entityFouten.join(' ') });
    const result = db.prepare(`UPDATE printers SET naam=?,type=?,ha_entity_prefix=?,kwh_entity=?,watt_entity=?,
      machine_kost_per_uur=?,heeft_bmcu=?,actief=?,gem_verbruik_watt=?,
      pause_entity=?,resume_entity=?,cancel_entity=?,camera_entity=? WHERE id=?`)
      .run(naam.trim(), type, normalizeSensorId(ha_entity_prefix)||null, normalizeSensorId(kwh_entity)||null, normalizeSensorId(watt_entity)||null,
        machineKost, heeft_bmcu?1:0, actief?1:0,
        (gem_verbruik_watt !== undefined && gem_verbruik_watt !== '') ? parseFloat(gem_verbruik_watt) : null,
        pause_entity || null, resume_entity || null, cancel_entity || null, camera_entity || null,
        req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Printer niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// Archiveren/heractiveren i.p.v. verwijderen — een printer die ooit gebruikt
// is (jobs, offertes, werkbonnen) mag niet zomaar uit de database verdwijnen
// (historische documenten/rapportage moeten de naam kunnen blijven tonen).
// 'actief=0' laat de printer verdwijnen uit nieuwe selectielijsten (frontend-
// filter, zie regelEditor.jsx/Jobs.jsx/Werkbonnen.jsx) terwijl GET / en
// GET /config 'm gewoon nog teruggeven voor bestaande koppelingen.
r.patch('/:id/actief', (req, res) => {
  const db = getDb();
  const info = db.prepare('UPDATE printers SET actief = ? WHERE id = ?')
    .run(req.body.actief ? 1 : 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Printer niet gevonden' });
  res.json({ ok: true });
});

// Enkel echt verwijderen als de printer nergens (meer) aan gekoppeld is —
// zelfde patroon als filament.js's DELETE /types/:id. jobs.printer_id heeft
// bovendien een DB-constraint (ON DELETE RESTRICT) die dit sowieso zou
// blokkeren, maar we checken hier zelf eerst voor een duidelijke foutmelding
// i.p.v. een rauwe SQLite-constraintfout. offertes_v2.printer_id heeft geen
// DB-constraint maar wordt hier ook gecheckt zodat een offerte niet stilzwijgend
// naar een verdwenen printer blijft verwijzen.
r.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const inJobs = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE printer_id = ?').get(req.params.id);
    if (inJobs.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: ${inJobs.n} job(s) gekoppeld aan deze printer. Markeer de printer als inactief in plaats van te verwijderen.` });
    const inOffertes = db.prepare('SELECT COUNT(*) as n FROM offertes_v2 WHERE printer_id = ?').get(req.params.id);
    if (inOffertes.n > 0)
      return res.status(409).json({ error: `Kan niet verwijderen: printer gebruikt in ${inOffertes.n} offerte(s). Markeer de printer als inactief in plaats van te verwijderen.` });
    const info = db.prepare('DELETE FROM printers WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Printer niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
