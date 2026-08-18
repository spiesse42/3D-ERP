import { Router } from 'express';
import { getDb } from '../db.js';
import { haGet } from '../lib/ha.js';

// --- TARIEVEN ---
export const tarieven = Router();

tarieven.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM tarieven ORDER BY sleutel').all());
});

tarieven.put('/:sleutel', (req, res) => {
  const db = getDb();
  const { waarde } = req.body;
  db.prepare('UPDATE tarieven SET waarde = ? WHERE sleutel = ?').run(waarde, req.params.sleutel);
  res.json({ ok: true });
});

// --- INSTELLINGEN (tekst-waarden: token, url, ...) ---
export const instellingen = Router();

instellingen.get('/', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT sleutel, waarde, label FROM instellingen ORDER BY sleutel').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

instellingen.put('/:sleutel', (req, res) => {
  try {
    const db = getDb();
    const { waarde } = req.body;
    if (waarde === undefined) return res.status(400).json({ error: 'waarde is verplicht' });
    const rij = db.prepare('SELECT 1 FROM instellingen WHERE sleutel = ?').get(req.params.sleutel);
    if (rij) {
      db.prepare('UPDATE instellingen SET waarde = ? WHERE sleutel = ?').run(String(waarde), req.params.sleutel);
    } else {
      db.prepare('INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)').run(req.params.sleutel, String(waarde));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- HOME ASSISTANT ---
export const ha = Router();

ha.get('/test', async (req, res) => {
  try {
    const data = await haGet('');
    res.json({ ok: true, message: data?.message || 'API Online' });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'HA niet bereikbaar', detail: e.message });
  }
});

ha.get('/state/:entity', async (req, res) => {
  try {
    const data = await haGet(`states/${req.params.entity}`);
    res.json({ entity_id: data.entity_id, state: data.state, attributes: data.attributes });
  } catch (e) {
    res.status(502).json({ error: 'HA niet bereikbaar', detail: e.message });
  }
});

ha.get('/printer-status', async (req, res) => {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE actief = 1').all();
  const results = await Promise.all(printers.map(async p => {
    let kwh = null, watt = null, status = null;
    try {
      if (p.kwh_entity) {
        const s = await haGet(`states/${p.kwh_entity}`);
        kwh = parseFloat(s.state) || null;
      }
      if (p.watt_entity) {
        const s = await haGet(`states/${p.watt_entity}`);
        watt = parseFloat(s.state) || null;
      }
      if (p.ha_entity_prefix) {
        const s = await haGet(`states/${p.ha_entity_prefix}print_status`);
        status = s.state;
      }
    } catch {}
    return { id: p.id, naam: p.naam, kwh, watt, status };
  }));
  res.json(results);
});

// --- RAPPORTAGE ---
export const rapportage = Router();

rapportage.get('/dashboard', (req, res) => {
  const db = getDb();
  const omzet_maand = db.prepare(`
    SELECT strftime('%Y-%m', voltooid_op) as maand, COUNT(*) as jobs,
      ROUND(SUM(jk.verkoopprijs),2) as omzet, ROUND(SUM(jk.totaal_kost),2) as kost,
      ROUND(SUM(jk.kwh_verbruikt),2) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid' AND j.voltooid_op IS NOT NULL
    GROUP BY maand ORDER BY maand DESC LIMIT 12
  `).all();

  const stock = db.prepare(`
    SELECT ft.materiaal, ROUND(SUM(r.gewicht_gram_huidig),0) as gram_totaal,
      ROUND(SUM(r.gewicht_gram_huidig/1000*ft.inkoop_prijs_per_kg),2) as waarde_eur
    FROM filament_rollen r JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE r.actief = 1 AND (ft.categorie IS NULL OR ft.categorie = 'filament') GROUP BY ft.materiaal
  `).all();

  const openstaand = db.prepare(`
    SELECT COUNT(*) as c, ROUND(SUM(totaal),2) as bedrag FROM offertes_v2
    WHERE status IN ('concept','verstuurd','goedgekeurd')
  `).get();

  const jobs_status = db.prepare(`
    SELECT status, COUNT(*) as c FROM jobs GROUP BY status
  `).all();

  res.json({ omzet_maand, stock, openstaand, jobs_status });
});

// Statistieken: top 10 filament + kleur
rapportage.get('/stats/filament', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ft.merk, ft.materiaal, fr.kleur,
      COUNT(jm.id) as aantal_jobs,
      ROUND(SUM(jm.gram_gebruikt), 0) as gram_totaal
    FROM job_materialen jm
    JOIN filament_rollen fr ON fr.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = fr.filament_type_id
    WHERE (ft.categorie IS NULL OR ft.categorie = 'filament')
    GROUP BY ft.id, fr.kleur
    ORDER BY gram_totaal DESC
    LIMIT 10
  `).all();
  res.json(rows);
});

// Statistieken: jobs per printer
rapportage.get('/stats/jobs-per-printer', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.naam as printer, COUNT(j.id) as totaal,
      SUM(CASE WHEN j.status = 'voltooid' THEN 1 ELSE 0 END) as voltooid,
      SUM(CASE WHEN j.status = 'gefaald'  THEN 1 ELSE 0 END) as gefaald
    FROM jobs j
    JOIN printers p ON p.id = j.printer_id
    GROUP BY j.printer_id
    ORDER BY totaal DESC
  `).all();
  res.json(rows);
});

// Statistieken: jobs per maand
rapportage.get('/stats/jobs-per-maand', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', aangemaakt_op) as maand,
      COUNT(*) as totaal,
      SUM(CASE WHEN status = 'voltooid'    THEN 1 ELSE 0 END) as voltooid,
      SUM(CASE WHEN status = 'gefaald'     THEN 1 ELSE 0 END) as gefaald,
      SUM(CASE WHEN status = 'geannuleerd' THEN 1 ELSE 0 END) as geannuleerd
    FROM jobs
    WHERE aangemaakt_op IS NOT NULL
    GROUP BY maand
    ORDER BY maand DESC
    LIMIT 24
  `).all();
  res.json(rows);
});

// Statistieken: kWh per dag/maand/jaar
rapportage.get('/stats/kwh', (req, res) => {
  const db = getDb();
  const perDag = db.prepare(`
    SELECT strftime('%Y-%m-%d', j.voltooid_op) as dag,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid' AND j.voltooid_op IS NOT NULL
    GROUP BY dag ORDER BY dag DESC LIMIT 30
  `).all();
  const perMaand = db.prepare(`
    SELECT strftime('%Y-%m', j.voltooid_op) as maand,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid' AND j.voltooid_op IS NOT NULL
    GROUP BY maand ORDER BY maand DESC LIMIT 12
  `).all();
  const perJaar = db.prepare(`
    SELECT strftime('%Y', j.voltooid_op) as jaar,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid' AND j.voltooid_op IS NOT NULL
    GROUP BY jaar ORDER BY jaar DESC
  `).all();
  res.json({ per_dag: perDag, per_maand: perMaand, per_jaar: perJaar });
});

// Dashboard: operationele data
rapportage.get('/dashboard/operationeel', (req, res) => {
  const db = getDb();
  const gepland = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam as klant_voornaam, p.naam as printer_naam
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    WHERE j.status = 'gepland'
    ORDER BY j.aangemaakt_op ASC
  `).all();

  const bezig = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam as klant_voornaam, p.naam as printer_naam
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    WHERE j.status = 'bezig'
    ORDER BY j.gestart_op ASC
  `).all();

  const voltooid = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam as klant_voornaam, p.naam as printer_naam,
      jk.verkoopprijs
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status = 'voltooid'
    ORDER BY j.voltooid_op DESC
    LIMIT 20
  `).all();

  const controle_facturatie = db.prepare(`
    SELECT j.*, k.naam as klant_naam, k.voornaam as klant_voornaam, p.naam as printer_naam,
      jk.verkoopprijs
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('gecontroleerd','gefactureerd')
      AND j.klant_id IS NOT NULL
      AND (j.betaald = 0 OR j.betaald IS NULL)
    ORDER BY j.voltooid_op DESC
  `).all();

  res.json({ gepland, bezig, voltooid, controle_facturatie });
});

rapportage.get('/csv/jobs', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT j.id, j.naam, j.status, k.naam as klant, p.naam as printer,
      j.print_uren_werkelijk, jk.materiaal_kost, jk.energie_kost, jk.machine_kost,
      jk.arbeid_kost, jk.bmcu_slijtage, jk.verkoopprijs, jk.kwh_verbruikt,
      j.aangemaakt_op, j.voltooid_op
    FROM jobs j
    LEFT JOIN klanten k ON k.id = j.klant_id
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    ORDER BY j.aangemaakt_op DESC
  `).all();
  const headers = Object.keys(rows[0] || {}).join(';');
  const lines = rows.map(r => Object.values(r).map(v => v ?? '').join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jobs-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send([headers, ...lines].join('\n'));
});
