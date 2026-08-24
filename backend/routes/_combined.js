import { Router } from 'express';
import { getDb } from '../db.js';
import { haGet, haPost, haFetchRaw } from '../lib/ha.js';

// --- TARIEVEN ---
export const tarieven = Router();

tarieven.get('/', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM tarieven ORDER BY sleutel').all());
});

tarieven.put('/:sleutel', (req, res) => {
  try {
    const db = getDb();
    const waarde = parseFloat(req.body.waarde);
    if (!Number.isFinite(waarde)) return res.status(400).json({ error: 'Waarde moet een getal zijn' });
    const info = db.prepare('UPDATE tarieven SET waarde = ? WHERE sleutel = ?').run(waarde, req.params.sleutel);
    if (info.changes === 0) return res.status(404).json({ error: 'Tarief niet gevonden' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// Knop indrukken vanuit de printerkaart (pauzeer/hervat/annuleer). Bewust
// beperkt tot het "button"-domein — dit endpoint mag geen algemene achterpoort
// naar willekeurige HA-services worden.
ha.post('/press-button', async (req, res) => {
  const { entity_id } = req.body || {};
  if (!entity_id || !/^button\./.test(entity_id)) {
    return res.status(400).json({ error: 'entity_id moet een button.*-entiteit zijn' });
  }
  try {
    await haPost('services/button/press', { entity_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'HA niet bereikbaar', detail: e.message });
  }
});

// Live camerabeeld doorgeven (MJPEG-stream via HA's camera_proxy_stream) —
// zo blijft het HA-token in de backend en bereikt het nooit de browser.
ha.get('/camera-stream/:entity', async (req, res) => {
  const { entity } = req.params;
  if (!/^camera\./.test(entity)) {
    return res.status(400).json({ error: 'entity moet een camera.*-entiteit zijn' });
  }
  try {
    const upstream = await haFetchRaw(`camera_proxy_stream/${entity}`);
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const reader = upstream.body.getReader();
    req.on('close', () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
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
  // Alle afgewerkte statussen tellen mee voor omzet — niet enkel 'voltooid',
  // want een job die al gecontroleerd/gefactureerd/betaald is, is nog steeds
  // gerealiseerde omzet (voordien viel die hier onterecht uit weg).
  const omzet_maand = db.prepare(`
    SELECT strftime('%Y-%m', voltooid_op) as maand, COUNT(*) as jobs,
      ROUND(SUM(jk.verkoopprijs),2) as omzet, ROUND(SUM(jk.totaal_kost),2) as kost,
      ROUND(SUM(jk.kwh_verbruikt),2) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('voltooid','gecontroleerd','gefactureerd','betaald') AND j.voltooid_op IS NOT NULL
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
  // Zelfde correctie als bij omzet_maand: alle afgewerkte statussen meetellen,
  // anders verdwijnt het kWh-verbruik van een job zodra hij verder gaat dan 'voltooid'.
  const perDag = db.prepare(`
    SELECT strftime('%Y-%m-%d', j.voltooid_op) as dag,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('voltooid','gecontroleerd','gefactureerd','betaald') AND j.voltooid_op IS NOT NULL
    GROUP BY dag ORDER BY dag DESC LIMIT 30
  `).all();
  const perMaand = db.prepare(`
    SELECT strftime('%Y-%m', j.voltooid_op) as maand,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('voltooid','gecontroleerd','gefactureerd','betaald') AND j.voltooid_op IS NOT NULL
    GROUP BY maand ORDER BY maand DESC LIMIT 12
  `).all();
  const perJaar = db.prepare(`
    SELECT strftime('%Y', j.voltooid_op) as jaar,
      ROUND(SUM(jk.kwh_verbruikt), 3) as kwh
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('voltooid','gecontroleerd','gefactureerd','betaald') AND j.voltooid_op IS NOT NULL
    GROUP BY jaar ORDER BY jaar DESC
  `).all();
  res.json({ per_dag: perDag, per_maand: perMaand, per_jaar: perJaar });
});

// Drempels bijberoep: btw-vrijstelling (omzet) en sociale-bijdragen-vrijstelling
// (winst), beide verhoudingsgewijs verminderd in het kalenderjaar van de
// opgegeven startdatum. Bedragen en startdatum zijn instelbaar via de
// generieke instellingen-tabel (bedrijf_startdatum, drempel_omzet_jaar,
// drempel_winst_jaar) — geen harde codering, want deze bedragen/regels
// kunnen jaarlijks wijzigen. Enkel een richtwaarde, geen officiële berekening.
rapportage.get('/drempels', (req, res) => {
  const db = getDb();

  const instelling = (sleutel, standaard) => {
    const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
    return rij && rij.waarde !== '' ? rij.waarde : standaard;
  };

  const nu = new Date();
  const huidigJaar = nu.getFullYear();
  const startdatumStr = instelling('bedrijf_startdatum', null);
  const drempelOmzetJaar = parseFloat(instelling('drempel_omzet_jaar', '25000')) || 25000;
  const drempelWinstJaar = parseFloat(instelling('drempel_winst_jaar', '1922.16')) || 1922.16;

  const isSchrikkeljaar = (j) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
  const dagenInJaar = isSchrikkeljaar(huidigJaar) ? 366 : 365;

  let dagenActief = dagenInJaar;
  if (startdatumStr) {
    const start = new Date(startdatumStr + 'T00:00:00Z');
    if (!isNaN(start) && start.getUTCFullYear() === huidigJaar) {
      const eindJaar = new Date(Date.UTC(huidigJaar, 11, 31));
      dagenActief = Math.round((eindJaar - start) / 86400000) + 1;
    }
  }
  const ratio = Math.min(1, Math.max(0, dagenActief / dagenInJaar));

  const jaarFilter = String(huidigJaar);

  const omzetYtd = db.prepare(`
    SELECT ROUND(SUM(jk.verkoopprijs),2) as bedrag
    FROM jobs j JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.status IN ('voltooid','gecontroleerd','gefactureerd','betaald')
      AND j.voltooid_op IS NOT NULL AND strftime('%Y', j.voltooid_op) = ?
  `).get(jaarFilter).bedrag || 0;

  const materiaalYtd = db.prepare(`
    SELECT ROUND(SUM(bi.prijs_totaal),2) as bedrag
    FROM bestelling_items bi JOIN bestellingen b ON b.id = bi.bestelling_id
    WHERE b.besteld_op IS NOT NULL AND strftime('%Y', b.besteld_op) = ?
  `).get(jaarFilter).bedrag || 0;

  const uitgavenYtd = db.prepare(`
    SELECT ROUND(SUM(bedrag),2) as bedrag FROM uitgaven WHERE strftime('%Y', datum) = ?
  `).get(jaarFilter).bedrag || 0;

  const winstYtd = Math.round((omzetYtd - materiaalYtd - uitgavenYtd) * 100) / 100;
  const rond2 = (n) => Math.round(n * 100) / 100;

  res.json({
    jaar: huidigJaar,
    startdatum: startdatumStr,
    dagen_actief: dagenActief,
    dagen_in_jaar: dagenInJaar,
    omzet: { ytd: omzetYtd, drempel_vol: drempelOmzetJaar, drempel_prorated: rond2(drempelOmzetJaar * ratio) },
    winst: { ytd: winstYtd, drempel_vol: drempelWinstJaar, drempel_prorated: rond2(drempelWinstJaar * ratio) },
  });
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

  // Sinds de werkbon/printopdracht-ontkoppeling (zie sessie-notities deel 11)
  // leeft de facturatiestatus (gecontroleerd/gefactureerd/betaald) niet meer
  // op jobs.status — die kolom is voortaan een zuivere productiestatus. Deze
  // rapportage leest daarom nu de werkbonnen.
  const controle_facturatie = db.prepare(`
    SELECT w.*, k.naam as klant_naam, k.voornaam as klant_voornaam
    FROM werkbonnen w
    LEFT JOIN klanten k ON k.id = w.klant_id
    WHERE w.status IN ('gecontroleerd','gefactureerd')
      AND w.klant_id IS NOT NULL
      AND (w.betaald = 0 OR w.betaald IS NULL)
    ORDER BY w.aangemaakt_op DESC
  `).all();
  const controle_facturatie_totaal = Math.round(
    controle_facturatie.reduce((s, w) => s + (w.totaal || 0), 0) * 100
  ) / 100;

  res.json({ gepland, bezig, voltooid, controle_facturatie, controle_facturatie_totaal });
});

// Facturatie: volledige lijst (open / betaald / alles) t.b.v. de Financiën-pagina.
// Leest sinds de werkbon/printopdracht-ontkoppeling de werkbonnen i.p.v. jobs
// (zie toelichting bij controle_facturatie hierboven).
rapportage.get('/facturatie', (req, res) => {
  const db = getDb();
  const status = req.query.status || 'open'; // 'open' | 'betaald' | 'alles'

  let where = `w.status IN ('gecontroleerd','gefactureerd','betaald') AND w.klant_id IS NOT NULL`;
  if (status === 'open') where += ` AND (w.betaald = 0 OR w.betaald IS NULL)`;
  else if (status === 'betaald') where += ` AND w.betaald = 1`;

  const rows = db.prepare(`
    SELECT w.id, w.volgnummer, w.object_naam as naam, w.status, w.betaald, w.betaald_op, w.aangemaakt_op,
      k.id as klant_id, k.naam as klant_naam, k.voornaam as klant_voornaam,
      w.totaal
    FROM werkbonnen w
    LEFT JOIN klanten k ON k.id = w.klant_id
    WHERE ${where}
    ORDER BY w.aangemaakt_op DESC
  `).all();

  const totaal = Math.round(rows.reduce((s, r) => s + (r.totaal || 0), 0) * 100) / 100;
  res.json({ rows, totaal, aantal: rows.length });
});

// Financiën: inkomsten (kasstelsel — op betaaldatum) vs. materiaalkosten en
// overige uitgaven, per maand samengevoegd tot een saldo.
rapportage.get('/stats/financien', (req, res) => {
  const db = getDb();

  // Sinds de werkbon/printopdracht-ontkoppeling leeft de betaald-vlag op de
  // werkbon, niet meer op jobs (zie toelichting bij /facturatie hierboven).
  const inkomsten = db.prepare(`
    SELECT strftime('%Y-%m', betaald_op) as maand,
      ROUND(SUM(totaal), 2) as bedrag
    FROM werkbonnen
    WHERE betaald = 1 AND betaald_op IS NOT NULL
    GROUP BY maand
  `).all();

  const materiaalkosten = db.prepare(`
    SELECT strftime('%Y-%m', b.besteld_op) as maand,
      ROUND(SUM(bi.prijs_totaal), 2) as bedrag
    FROM bestelling_items bi JOIN bestellingen b ON b.id = bi.bestelling_id
    WHERE b.besteld_op IS NOT NULL AND bi.prijs_totaal IS NOT NULL
    GROUP BY maand
  `).all();

  const uitgaven = db.prepare(`
    SELECT strftime('%Y-%m', datum) as maand,
      ROUND(SUM(bedrag), 2) as bedrag
    FROM uitgaven
    GROUP BY maand
  `).all();

  // Per maand samenvoegen tot 1 rij
  const perMaand = new Map();
  const zetRij = (maand) => {
    if (!perMaand.has(maand)) {
      perMaand.set(maand, { maand, inkomsten: 0, materiaalkosten: 0, uitgaven: 0 });
    }
    return perMaand.get(maand);
  };
  inkomsten.forEach(r => { if (r.maand) zetRij(r.maand).inkomsten = r.bedrag || 0; });
  materiaalkosten.forEach(r => { if (r.maand) zetRij(r.maand).materiaalkosten = r.bedrag || 0; });
  uitgaven.forEach(r => { if (r.maand) zetRij(r.maand).uitgaven = r.bedrag || 0; });

  const rijen = [...perMaand.values()]
    .map(r => ({ ...r, saldo: Math.round((r.inkomsten - r.materiaalkosten - r.uitgaven) * 100) / 100 }))
    .sort((a, b) => b.maand.localeCompare(a.maand))
    .slice(0, 24);

  res.json(rijen);
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
