// ═══════════════════════════════════════════════════════════════════════
// WERKBONNEN — het facturatiedocument, losgekoppeld van de printopdracht
// ═══════════════════════════════════════════════════════════════════════
//
// Een werkbon ontstaat uit een goedgekeurde offerte (zie offertes_v2.js
// POST /:id/maak-werkbon) en draagt ALLE regeltypes (ontwerp/aanpassing/
// printen/extra/artikel) + de volledige facturatiestatus-lifecycle die
// voorheen op jobs.status stond. Een 'printen'-regel kan 0, 1 of meerdere
// printopdrachten (jobs) koppelen — een mislukte poging en een geslaagde
// herprint op een andere printer horen zo allebei bij dezelfde werkbon-
// regel, i.p.v. twee onverklaarbare, losse rijen in Jobs.
//
// De regels-berekening (twee-pas, incl. handmatig_bedrag-override) is
// bewust een eigen kopie van dezelfde logica in offertes_v2.js — zelfde
// conventie als elders in deze app (bv. getalOfDefault/getBedrijfsgegevens
// in kosten.js). "Gebruik gemeten data" (zie POST .../gebruik-gemeten-data
// hieronder) hergebruikt daardoor gewoon het bestaande handmatig_bedrag-
// mechanisme: de werkelijke, bereikende kostprijs van de gekoppelde
// printopdracht wordt 1x als eindbedrag overgenomen — geen aparte, tweede
// rekenmotor nodig voor "werkelijk vs. geschat".
import { Router } from 'express';
import { getDb } from '../db.js';
import { LOGO_DATA_URI } from '../lib/logo.js';
import { renderHtmlNaarPdf } from '../lib/pdf.js';
import { sendPdfEmail } from '../email.js';
// Zelfde gedeelde rekenmotor als offertes_v2.js (zie backend/lib/regelmotor.js)
// — gebruikt voor een standalone werkbon (POST /, zonder offerte). Onder een
// alias, want dit bestand heeft hieronder al een EIGEN valideerRegels()
// (bewust een andere, kleinere validatie — enkel handmatig_bedrag, geen
// aantal-check — die werkt op reeds-bevroren regels bij PUT /:id). Beide
// blijven naast elkaar bestaan i.p.v. de bestaande PUT-validatie te wijzigen.
import { berekenOfferteRegels, valideerRegels as valideerNieuweRegels } from '../lib/regelmotor.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(row => [row.sleutel, row.waarde]));
}

function getalOfDefault(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function getBedrijfsgegevens(db) {
  const rows = db.prepare(`
    SELECT sleutel, waarde FROM instellingen
    WHERE sleutel IN ('bedrijf_naam','bedrijf_btw','bedrijf_adres','bedrijf_email','bedrijf_iban')
  `).all();
  const map = Object.fromEntries(rows.map(row => [row.sleutel, row.waarde]));
  return {
    naam: map.bedrijf_naam || '', btw: map.bedrijf_btw || '', adres: map.bedrijf_adres || '',
    email: map.bedrijf_email || '', iban: map.bedrijf_iban || '',
  };
}

const REGEL_TYPE_LABELS = {
  ontwerp: 'Ontwerp + digitaal bestand aanleveren',
  aanpassing: 'Aanpassing op bestaand ontwerp/bestand',
  printen: 'Printen',
  extra: 'Extra kosten/dienst',
  artikel: 'Artikel',
};

const STATUSSEN = ['in te plannen', 'gepland', 'bezig', 'voltooid', 'gecontroleerd', 'gefactureerd', 'betaald', 'gefaald', 'geannuleerd'];

// Regeltypes die een telbaar aantal fysieke stuks voorstellen (in
// tegenstelling tot 'ontwerp'/'aanpassing'/'extra', die diensten/eenmalige
// kosten zijn) — zelfde conventie als LEVERBARE_TYPES in pakbonnen.js. Enkel
// deze regeltypes kunnen een printopdracht koppelen/aanmaken en tonen een
// "X van de Y gepland"-voortgang.
const LEVERBARE_TYPES = ['printen', 'artikel'];

function volgendWerkbonVolgnummer(db) {
  const jaar = new Date().getFullYear();
  const sleutel = `werkbon_volgnummer_teller_${jaar}`;
  const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
  const teller = (rij ? parseInt(rij.waarde) || 0 : 0) + 1;
  db.prepare(`
    INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)
    ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde
  `).run(sleutel, String(teller));
  return `WB-${jaar}-${String(teller).padStart(4, '0')}`;
}

// Zelfde validatie als offertes_v2.js valideerRegels() — een werkbon-regel
// kan enkel via handmatig_bedrag aangepast worden, geen andere velden.
function valideerRegels(regels) {
  const GELDIGE_TYPES = ['ontwerp', 'aanpassing', 'printen', 'extra', 'artikel'];
  for (const regel of (regels || [])) {
    if (!GELDIGE_TYPES.includes(regel?.type)) return `Ongeldig regeltype: "${regel?.type}"`;
    if (regel.handmatig_bedrag !== undefined && regel.handmatig_bedrag !== null && regel.handmatig_bedrag !== '') {
      const n = parseFloat(regel.handmatig_bedrag);
      if (!Number.isFinite(n) || n < 0) return `Handmatig bedrag moet 0 of hoger zijn (regel "${regel.object_naam || regel.type}")`;
    }
  }
  return null;
}

// Zelfde twee-pas berekening als offertes_v2.js berekenOfferteRegels() —
// regels dragen hun bedrag al bevroren (_berekend, overgenomen van de
// offerte bij het aanmaken van de werkbon); enkel de marge/BTW-splitsing en
// een eventuele handmatig_bedrag-override worden hier herrekend.
function berekenWerkbonRegels(regels) {
  let subtotaal_marge = 0, subtotaal_vast = 0;
  // De marge_pct van een werkbon ligt al vast bij het aanmaken (overgenomen
  // van de offerte) en wordt bewust NIET herberekend op basis van tijd —
  // anders zou "gebruik gemeten data" op 1 regel de marge van ALLE regels
  // kunnen doen verschuiven, wat een goedgekeurde offerteprijs zou wijzigen
  // zonder dat de klant dat ooit te zien kreeg. marge_pct wordt dus als
  // gegeven meegegeven i.p.v. hier herbepaald.
  return (marge_pct) => {
    const margeFactor = 1 + marge_pct / 100;
    subtotaal_marge = 0; subtotaal_vast = 0;
    const berekend = regels.map(regel => {
      let r = regel._berekend || { bedrag: 0, vaste_prijs: false, tijd_u: 0 };
      const override = parseFloat(regel.handmatig_bedrag);
      const heeftOverride = regel.handmatig_bedrag !== undefined && regel.handmatig_bedrag !== null
        && regel.handmatig_bedrag !== '' && Number.isFinite(override);
      if (heeftOverride) {
        r = { ...r, bedrag: r.vaste_prijs ? override : override / margeFactor, handmatig: true };
      } else if (r.handmatig) {
        r = { ...r, handmatig: false };
      }
      if (r.vaste_prijs) subtotaal_vast += r.bedrag; else subtotaal_marge += r.bedrag;
      return { ...regel, _berekend: r };
    });
    const verkoopprijs_basis = subtotaal_marge * margeFactor;
    const verkoopprijs = verkoopprijs_basis + subtotaal_vast;
    return {
      regels: berekend,
      subtotaal: Math.round((subtotaal_marge + subtotaal_vast) * 1000) / 1000,
      marge_pct,
      verkoopprijs_basis: Math.round(verkoopprijs_basis * 100) / 100,
      verkoopprijs: Math.round(verkoopprijs * 100) / 100,
    };
  };
}

function offerteRegelsUitRegels(berekening) {
  const margeFactor = 1 + (berekening.marge_pct || 0) / 100;
  return berekening.regels.map(regel => {
    const rr = regel._berekend || { bedrag: 0, vaste_prijs: false };
    const factor = rr.vaste_prijs ? 1 : margeFactor;
    const totaal = rr.bedrag * factor;
    const label = REGEL_TYPE_LABELS[regel.type] || regel.type;
    const naam = regel.object_naam ? `${label}: ${regel.object_naam}` : label;
    const aantal = (regel.type === 'printen' || regel.type === 'artikel') ? (parseInt(regel.aantal) || 1) : 1;
    return { omschrijving: naam, aantal, eenheidsprijs: aantal > 0 ? totaal / aantal : 0, totaal };
  });
}

function haalWerkbon(db, id) {
  return db.prepare(`
    SELECT w.*, k.naam as klant_naam, k.voornaam as klant_voornaam, k.email, k.straat,
      k.huisnummer, k.postcode, k.gemeente, k.btw_nummer, k.type as klant_type
    FROM werkbonnen w JOIN klanten k ON k.id = w.klant_id WHERE w.id = ?
  `).get(id);
}

// Gekoppelde printopdrachten per printen-regel — voor het koppel-widget in
// de UI. Inclusief job_kosten.verkoopprijs (indien al berekend) zodat
// "gebruik gemeten data" meteen het beschikbare bedrag kan tonen, en de
// werkelijk gebruikte materialen (voor weergave, niet voor herberekening).
function haalGekoppeldeJobs(db, werkbonId) {
  const jobs = db.prepare(`
    SELECT j.id, j.naam, j.status, j.werkbon_regel_index, j.werkbon_regel_aantal, j.print_uren_werkelijk,
      j.print_uren_geschat, j.voltooid_op, p.naam as printer_naam,
      jk.verkoopprijs, jk.kwh_verbruikt
    FROM jobs j
    LEFT JOIN printers p ON p.id = j.printer_id
    LEFT JOIN job_kosten jk ON jk.job_id = j.id
    WHERE j.werkbon_id = ?
    ORDER BY j.aangemaakt_op ASC
  `).all(werkbonId);
  const perRegel = new Map();
  for (const j of jobs) {
    const idx = j.werkbon_regel_index;
    if (idx == null) continue;
    if (!perRegel.has(idx)) perRegel.set(idx, []);
    perRegel.get(idx).push(j);
  }
  return perRegel;
}

// ── GET alle werkbonnen ─────────────────────────────────────────────────
r.get('/', (req, res) => {
  const db = getDb();
  const { status, klant_id, offerte_id } = req.query;
  let sql = `
    SELECT w.*, k.naam as klant_naam, k.voornaam as klant_voornaam
    FROM werkbonnen w JOIN klanten k ON k.id = w.klant_id WHERE 1=1
  `;
  const params = [];
  if (status)     { sql += ' AND w.status = ?';     params.push(status); }
  if (klant_id)   { sql += ' AND w.klant_id = ?';   params.push(klant_id); }
  if (offerte_id) { sql += ' AND w.offerte_id = ?'; params.push(offerte_id); }
  sql += ' ORDER BY w.aangemaakt_op DESC';
  res.json(db.prepare(sql).all(...params));
});

// ── POST nieuwe standalone werkbon (zonder offerte) ─────────────────────
// Voor productie die nooit een offertetraject doorloopt (bv. een vaste-
// prijs-bestelling zoals 150× "Fuzzy Bubble Letters" à €1,75/stuk) — zelfde
// regelmotor (berekenOfferteRegels/valideerRegels, zie backend/lib/
// regelmotor.js) als een offerte, enkel zonder offerte_id (NULL, het schema
// ondersteunt dat al sinds migratie v42).
r.post('/', (req, res) => {
  const db = getDb();
  const t = getTarieven(db);
  const { klant_id, regels = [], btw_pct = 0, geldig_tot, levertermijn, notities } = req.body;
  if (!klant_id) return res.status(400).json({ error: 'Klant is verplicht' });
  if (!Array.isArray(regels) || !regels.length) return res.status(400).json({ error: 'Een werkbon moet minstens 1 regel bevatten' });
  const regelFout = valideerNieuweRegels(regels);
  if (regelFout) return res.status(400).json({ error: regelFout });

  const ber = berekenOfferteRegels(db, regels, t);
  const btwPctNum = parseFloat(btw_pct) || 0;
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * btwPctNum) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;
  const volgnummer = volgendWerkbonVolgnummer(db);
  const object_naam = regels.map(r2 => r2.object_naam).filter(Boolean).join(', ') || null;

  const result = db.prepare(`
    INSERT INTO werkbonnen (
      offerte_id, klant_id, volgnummer, object_naam, regels_json,
      subtotaal, marge_pct, verkoopprijs_basis, verkoopprijs, btw_pct, btw_bedrag, totaal,
      status, geldig_tot, levertermijn, notities
    ) VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    klant_id, volgnummer, object_naam, JSON.stringify(ber.regels),
    ber.subtotaal, ber.marge_pct, ber.verkoopprijs_basis, ber.verkoopprijs,
    btwPctNum, btw_bedrag, totaal, 'in te plannen', geldig_tot || null, levertermijn || null, notities || null
  );
  res.status(201).json({ id: result.lastInsertRowid, volgnummer, ...ber, btw_bedrag, totaal });
});

// ── GET printen-regels die nog een printopdracht kunnen koppelen ───────
// Voor de koppel-widget vanuit een LOSSE printopdracht (Jobs-tab, tabblad
// Printopdrachten, kolom "Gekoppeld") — daar moet je net andersom kunnen
// zoeken: "bij welke werkbon-regel hoort deze print?". Enkel regels van
// nog-niet-afgesloten werkbonnen (een koppeling op een al gefactureerde/
// betaalde/geannuleerde werkbon zou de bevroren prijs toch nooit meer
// beïnvloeden). Bewust GEEN filter op "al gekoppeld" — 1 regel mag
// meerdere printopdrachten hebben (mislukte poging + herprint).
// Let op: deze route moet vóór GET /:id geregistreerd staan, anders vangt
// die "regels" op als :id.
r.get('/regels/koppelbaar', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT w.id as werkbon_id, w.volgnummer as werkbon_volgnummer, w.regels_json,
      k.naam as klant_naam, k.voornaam as klant_voornaam
    FROM werkbonnen w JOIN klanten k ON k.id = w.klant_id
    WHERE w.status NOT IN ('gefactureerd', 'betaald', 'geannuleerd')
    ORDER BY w.aangemaakt_op DESC
  `).all();
  const resultaat = [];
  for (const w of rows) {
    let regels = [];
    try { regels = JSON.parse(w.regels_json || '[]'); } catch { regels = []; }
    regels.forEach((regel, idx) => {
      if (!LEVERBARE_TYPES.includes(regel.type)) return;
      resultaat.push({
        werkbon_id: w.werkbon_id,
        werkbon_volgnummer: w.werkbon_volgnummer,
        klant_naam: w.klant_voornaam ? `${w.klant_voornaam} ${w.klant_naam}` : w.klant_naam,
        regel_index: idx,
        object_naam: regel.object_naam || null,
      });
    });
  }
  res.json(resultaat);
});

// ── GET 1 werkbon (incl. gekoppelde printopdrachten per regel) ─────────
r.get('/:id', (req, res) => {
  const db = getDb();
  const w = haalWerkbon(db, req.params.id);
  if (!w) return res.status(404).json({ error: 'Niet gevonden' });
  let regels = [];
  try { regels = JSON.parse(w.regels_json || '[]'); } catch { regels = []; }
  const perRegel = haalGekoppeldeJobs(db, w.id);
  // aantal_gepland: som van werkbon_regel_aantal van alle gekoppelde jobs die
  // geen mislukte/geannuleerde poging zijn (die tellen niet mee — zelfde
  // principe als elders in de app, bv. de werkbon-status-afleiding in
  // db_migration_v42.js) — enkel zinvol voor leverbare (telbare) regeltypes.
  regels = regels.map((regel, i) => {
    const gekoppeld = perRegel.get(i) || [];
    const out = { ...regel, gekoppelde_jobs: gekoppeld };
    if (LEVERBARE_TYPES.includes(regel.type)) {
      out.aantal_gepland = gekoppeld
        .filter(j => !['gefaald', 'geannuleerd'].includes(j.status))
        .reduce((s, j) => s + (j.werkbon_regel_aantal || 0), 0);
    }
    return out;
  });
  res.json({ ...w, regels });
});

// ── PUT bewerken (regels/handmatig_bedrag, geldig_tot, levertermijn, notities) ──
r.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Niet gevonden' });

  const regels = Array.isArray(req.body.regels) ? req.body.regels : JSON.parse(existing.regels_json || '[]');
  const regelFout = valideerRegels(regels);
  if (regelFout) return res.status(400).json({ error: regelFout });

  const ber = berekenWerkbonRegels(regels)(existing.marge_pct);
  const btw_pct = req.body.btw_pct != null ? parseFloat(req.body.btw_pct) || 0 : existing.btw_pct;
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * btw_pct) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;

  db.prepare(`
    UPDATE werkbonnen SET regels_json=?, subtotaal=?, verkoopprijs_basis=?, verkoopprijs=?,
      btw_pct=?, btw_bedrag=?, totaal=?, geldig_tot=?, levertermijn=?, notities=?
    WHERE id=?
  `).run(
    JSON.stringify(ber.regels), ber.subtotaal, ber.verkoopprijs_basis, ber.verkoopprijs,
    btw_pct, btw_bedrag, totaal,
    req.body.geldig_tot !== undefined ? req.body.geldig_tot || null : existing.geldig_tot,
    req.body.levertermijn !== undefined ? req.body.levertermijn || null : existing.levertermijn,
    req.body.notities !== undefined ? req.body.notities || null : existing.notities,
    req.params.id
  );
  res.json({ ok: true, ...ber, btw_bedrag, totaal });
});

// ── PATCH status (facturatie-lifecycle — verhuisd van jobs.status) ──────
r.patch('/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!STATUSSEN.includes(status)) return res.status(400).json({ error: `Ongeldige status: "${status}"` });
  const betaald = status === 'betaald' ? 1 : 0;
  const betaaldOpSql = status === 'betaald' ? `COALESCE(betaald_op, ?)` : `NULL`;
  const params = [status];
  let sql = `UPDATE werkbonnen SET status=?,`;
  sql += `betaald=?,betaald_op=${betaaldOpSql} WHERE id=?`;
  params.push(betaald);
  if (status === 'betaald') params.push(new Date().toISOString());
  params.push(req.params.id);
  db.prepare(sql).run(...params);
  res.json({ ok: true });
});

r.patch('/:id/betaald', (req, res) => {
  const db = getDb();
  const betaald = req.body.betaald ? 1 : 0;
  const betaald_op = betaald ? new Date().toISOString() : null;
  db.prepare('UPDATE werkbonnen SET betaald=?, betaald_op=? WHERE id=?').run(betaald, betaald_op, req.params.id);
  res.json({ ok: true });
});

// ── Koppelen/ontkoppelen van printopdrachten aan een printen-regel ──────
r.post('/:id/regels/:idx/koppel', (req, res) => {
  const db = getDb();
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(req.params.id);
  if (!werkbon) return res.status(404).json({ error: 'Werkbon niet gevonden' });
  const idx = parseInt(req.params.idx);
  let regels = [];
  try { regels = JSON.parse(werkbon.regels_json || '[]'); } catch { regels = []; }
  if (!regels[idx] || !LEVERBARE_TYPES.includes(regels[idx].type)) {
    return res.status(400).json({ error: 'Enkel een "printen"- of "artikel"-regel kan een printopdracht koppelen' });
  }
  const { job_id, aantal } = req.body;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Printopdracht niet gevonden' });
  db.prepare('UPDATE jobs SET werkbon_id = ?, werkbon_regel_index = ?, werkbon_regel_aantal = ? WHERE id = ?')
    .run(werkbon.id, idx, aantal != null && aantal !== '' ? (parseInt(aantal) || null) : null, job_id);
  res.json({ ok: true });
});

r.delete('/:id/regels/:idx/koppel/:jobId', (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE jobs SET werkbon_id = NULL, werkbon_regel_index = NULL
    WHERE id = ? AND werkbon_id = ? AND werkbon_regel_index = ?
  `).run(req.params.jobId, req.params.id, parseInt(req.params.idx));
  res.json({ ok: true });
});

// Nieuwe printopdracht aanmaken vanuit een werkbon-regel — vooringevuld met
// de geschatte printer/gewicht/tijd van de regel, maar meteen als een eigen,
// vrij herplanbare rij (andere printer, andere status...), en meteen
// gekoppeld. Zelfde volgnummer-reeks als jobs.js POST /.
// Nieuwe printopdracht aanmaken vanuit een leverbare werkbon-regel ('printen'
// of 'artikel', zie LEVERBARE_TYPES) — dekt `aantal` stuks van de regel (niet
// per se de volledige regel, zie werkbon_regel_aantal), en accepteert
// optionele OVERRIDES bovenop de regel zelf. Een 'printen'-regel heeft al
// printer/tijd/gewicht-velden (die gelden dan als fallback, huidig gedrag
// blijft ongewijzigd als er niets wordt meegegeven); een 'artikel'-regel
// heeft die velden NIET (enkel geprijsd, geen productiedetails) — daar MOET
// de aanroeper minstens printer_id zelf meegeven.
r.post('/:id/regels/:idx/nieuwe-printopdracht', (req, res) => {
  const db = getDb();
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(req.params.id);
  if (!werkbon) return res.status(404).json({ error: 'Werkbon niet gevonden' });
  const idx = parseInt(req.params.idx);
  let regels = [];
  try { regels = JSON.parse(werkbon.regels_json || '[]'); } catch { regels = []; }
  const regel = regels[idx];
  if (!regel || !LEVERBARE_TYPES.includes(regel.type)) {
    return res.status(400).json({ error: 'Enkel een "printen"- of "artikel"-regel kan een printopdracht aanmaken' });
  }

  const aantalJob = parseInt(req.body.aantal) || 1;
  const printerId = req.body.printer_id || regel.printer_id;
  if (!printerId) return res.status(400).json({ error: 'Kies een printer voor deze printopdracht' });
  const isMulti = req.body.is_multicolor != null ? !!req.body.is_multicolor : !!regel.is_multicolor;
  const tijdU = req.body.geschatte_tijd_u != null ? req.body.geschatte_tijd_u : regel.geschatte_tijd_u;
  const tijdMin = req.body.geschatte_tijd_min != null ? req.body.geschatte_tijd_min : regel.geschatte_tijd_min;
  const gewichtG = req.body.geschat_gewicht_g != null ? req.body.geschat_gewicht_g : regel.geschat_gewicht_g;
  const filamentRolId = req.body.filament_rol_id != null ? req.body.filament_rol_id : regel.filament_rol_id;
  const filamentRollenInput = req.body.filament_rollen != null ? req.body.filament_rollen : regel.filament_rollen;

  const jaar = new Date().getFullYear();
  const sleutel = `volgnummer_teller_${jaar}`;
  const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
  const teller = (rij ? parseInt(rij.waarde) || 0 : 0) + 1;
  db.prepare(`INSERT INTO instellingen (sleutel, waarde) VALUES (?,?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde`).run(sleutel, String(teller));
  const volgnummer = `${jaar}-${String(teller).padStart(4, '0')}`;

  // BELANGRIJK: geschatte_tijd_u/-min/geschat_gewicht_g/elke fr.gram zijn
  // elders in de app PER-STUK-waarden (regelmotor.js berekenRegel()'s
  // 'printen'-tak vermenigvuldigt telkens met `aantal`) — deze job dekt
  // `aantalJob` stuks van de regel, dus hier zelf met aantalJob
  // vermenigvuldigen. Bewuste gedragswijziging t.o.v. voorheen (toen nam de
  // job de regel-waarden 1-op-1 over, alsof hij altijd 1 stuk dekte).
  const totaleUren = ((parseInt(tijdU) || 0) + (parseInt(tijdMin) || 0) / 60) * aantalJob;
  const filamentRollen = Array.isArray(filamentRollenInput) ? filamentRollenInput : [];
  const gewichtGeschat = isMulti
    ? filamentRollen.reduce((s, fr) => s + (parseFloat(fr.gram) || 0), 0) * aantalJob
    : (parseFloat(gewichtG) || 0) * aantalJob;

  const result = db.prepare(`
    INSERT INTO jobs (klant_id, printer_id, naam, type, volgnummer, status, print_uren_geschat,
      is_multicolor, gewicht_geschat, notities, offerte_id, werkbon_id, werkbon_regel_index, werkbon_regel_aantal)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    werkbon.klant_id, printerId, regel.object_naam || `Printopdracht voor ${werkbon.volgnummer}`,
    'print', volgnummer, 'in te plannen', totaleUren, isMulti ? 1 : 0, gewichtGeschat || null,
    `Printopdracht voor werkbon ${werkbon.volgnummer}`, werkbon.offerte_id, werkbon.id, idx, aantalJob
  );
  const jobId = result.lastInsertRowid;

  if (isMulti) {
    for (const fr of filamentRollen) {
      const gram = (parseFloat(fr.gram) || 0) * aantalJob;
      if (gram > 0 && fr.filament_rol_id) {
        db.prepare('INSERT INTO job_materialen (job_id, filament_rol_id, gram_gebruikt) VALUES (?,?,?)').run(jobId, fr.filament_rol_id, gram);
      }
    }
  } else if (filamentRolId && gewichtG > 0) {
    db.prepare('INSERT INTO job_materialen (job_id, filament_rol_id, gram_gebruikt) VALUES (?,?,?)').run(jobId, filamentRolId, gewichtGeschat);
  }

  res.status(201).json({ id: jobId, volgnummer });
});

// "Gebruik gemeten data" — neemt de al-berekende verkoopprijs (job_kosten,
// gebaseerd op werkelijke tijd/kWh/materiaal via kosten.js) van de gekozen
// gekoppelde printopdracht over als handmatig_bedrag op de regel. Dat is
// een bewuste, herroepbare snapshot (zelfde ↺-knop als een gewone
// handmatige aanpassing) — geen live-gebonden koppeling.
r.post('/:id/regels/:idx/gebruik-gemeten-data', (req, res) => {
  const db = getDb();
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(req.params.id);
  if (!werkbon) return res.status(404).json({ error: 'Werkbon niet gevonden' });
  const idx = parseInt(req.params.idx);
  let regels = [];
  try { regels = JSON.parse(werkbon.regels_json || '[]'); } catch { regels = []; }
  if (!regels[idx] || regels[idx].type !== 'printen') {
    return res.status(400).json({ error: 'Enkel een "printen"-regel heeft gemeten data' });
  }
  const jobId = req.body.job_id;
  const kosten = db.prepare(`
    SELECT jk.verkoopprijs FROM job_kosten jk JOIN jobs j ON j.id = jk.job_id
    WHERE jk.job_id = ? AND j.werkbon_id = ? AND j.werkbon_regel_index = ?
  `).get(jobId, werkbon.id, idx);
  if (!kosten) return res.status(400).json({ error: 'Deze printopdracht heeft nog geen berekende kostprijs — bereken die eerst op de Jobs-pagina' });

  regels[idx] = { ...regels[idx], handmatig_bedrag: kosten.verkoopprijs };
  const ber = berekenWerkbonRegels(regels)(werkbon.marge_pct);
  const btw_bedrag = Math.round(ber.verkoopprijs_basis * (werkbon.btw_pct || 0)) / 100;
  const totaal = Math.round((ber.verkoopprijs + btw_bedrag) * 100) / 100;
  db.prepare(`
    UPDATE werkbonnen SET regels_json=?, subtotaal=?, verkoopprijs_basis=?, verkoopprijs=?, btw_bedrag=?, totaal=? WHERE id=?
  `).run(JSON.stringify(ber.regels), ber.subtotaal, ber.verkoopprijs_basis, ber.verkoopprijs, btw_bedrag, totaal, req.params.id);
  res.json({ ok: true, ...ber, btw_bedrag, totaal });
});

// ── PDF ───────────────────────────────────────────────────────────────
function buildWerkbonHtml(werkbon, klant, berekening, regelRijen, bedrijf = {}) {
  const nu = new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const regelHtml = regelRijen.map(rg => `
    <tr><td>${rg.aantal}</td><td>${rg.omschrijving}</td><td>€${rg.eenheidsprijs.toFixed(2)}</td><td>€${rg.totaal.toFixed(2)}</td></tr>`).join('');
  // Vrijstellingsregel (art. 56bis BTW-wetboek) geldt voor alle klanten —
  // geen zakelijk/particulier-schakelaar, altijd 1 eindprijs.
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo img{height:64px;width:auto;display:block}
  .klant{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .klant h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase}
  th:nth-child(3),td:nth-child(3),th:last-child,td:last-child{text-align:right;width:110px}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .totaal{background:#0c0c0c;color:#fff;border-radius:8px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center}
  .totaal-bedrag{font-size:2rem;font-weight:900;color:#5b8dee}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
  .opmerking{margin-top:16px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
  </style></head><body>
  <div class="header">
    <div><div class="logo"><img src="${LOGO_DATA_URI}" alt="3D Plezier"></div>
      ${bedrijf.naam || bedrijf.adres || bedrijf.email || bedrijf.btw ? `<div style="margin-top:8px;font-size:.72rem;color:#888;line-height:1.5">
      ${bedrijf.naam ? `<strong>${bedrijf.naam}</strong><br>` : ''}${bedrijf.adres ? `${bedrijf.adres}<br>` : ''}
      ${bedrijf.email ? `${bedrijf.email}<br>` : ''}${bedrijf.btw ? `BTW: ${bedrijf.btw}` : ''}</div>` : ''}</div>
    <div style="text-align:right;color:#666;font-size:.85rem">
      <div style="font-size:1.1rem;font-weight:bold">WERKBON</div>
      <div style="font-family:monospace;font-weight:600">${werkbon.volgnummer}</div>
      <div>${nu}</div></div>
  </div>
  <div class="klant"><h3>Klant</h3>
    <strong>${klant.voornaam ? klant.voornaam + ' ' : ''}${klant.naam}</strong>
    ${klant.straat ? `<br>${klant.straat} ${klant.huisnummer || ''}, ${klant.postcode || ''} ${klant.gemeente || ''}` : ''}
    ${klant.email ? `<br>✉ ${klant.email}` : ''}${klant.btw_nummer ? `<br>BTW: ${klant.btw_nummer}` : ''}</div>
  <table><thead><tr><th>Aantal</th><th>Omschrijving</th><th>Eenheidsprijs</th><th>Totaal</th></tr></thead>
    <tbody>${regelHtml}</tbody></table>
  <div class="totaal"><div style="font-size:.85rem;color:#a0a0a0">TOTAAL</div>
    <div class="totaal-bedrag">€${werkbon.totaal.toFixed(2)}</div></div>
  ${werkbon.notities ? `<div class="opmerking">📝 ${werkbon.notities}</div>` : ''}
  <div class="footer">${bedrijf.naam || '3D Print ERP'} &nbsp;|&nbsp; ${nu} &nbsp;|&nbsp;
    Vrijgesteld van BTW — art. 56bis BTW-wetboek
    ${bedrijf.iban ? `<br>IBAN: ${bedrijf.iban}` : ''}</div>
  </body></html>`;
}

r.get('/:id/pdf', async (req, res) => {
  const db = getDb();
  const w = haalWerkbon(db, req.params.id);
  if (!w) return res.status(404).json({ error: 'Niet gevonden' });
  let regels = [];
  try { regels = JSON.parse(w.regels_json || '[]'); } catch { regels = []; }
  const berekening = { marge_pct: w.marge_pct, verkoopprijs: w.verkoopprijs, verkoopprijs_basis: w.verkoopprijs_basis, regels };
  const regelRijen = offerteRegelsUitRegels(berekening);
  const klant = { naam: w.klant_naam, voornaam: w.klant_voornaam, email: w.email, straat: w.straat,
    huisnummer: w.huisnummer, postcode: w.postcode, gemeente: w.gemeente, btw_nummer: w.btw_nummer, klant_type: w.klant_type };
  const html = buildWerkbonHtml(w, klant, berekening, regelRijen, getBedrijfsgegevens(db));
  try {
    const pdfBuffer = await renderHtmlNaarPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="werkbon-${w.volgnummer}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ error: `PDF genereren mislukt: ${e.message}` });
  }
});

r.post('/:id/email', async (req, res) => {
  const db = getDb();
  const w = haalWerkbon(db, req.params.id);
  if (!w) return res.status(404).json({ error: 'Niet gevonden' });
  let regels = [];
  try { regels = JSON.parse(w.regels_json || '[]'); } catch { regels = []; }
  const berekening = { marge_pct: w.marge_pct, verkoopprijs: w.verkoopprijs, verkoopprijs_basis: w.verkoopprijs_basis, regels };
  const regelRijen = offerteRegelsUitRegels(berekening);
  const klant = { naam: w.klant_naam, voornaam: w.klant_voornaam, email: w.email, straat: w.straat,
    huisnummer: w.huisnummer, postcode: w.postcode, gemeente: w.gemeente, btw_nummer: w.btw_nummer, klant_type: w.klant_type };
  const html = buildWerkbonHtml(w, klant, berekening, regelRijen, getBedrijfsgegevens(db));
  const { to } = req.body;
  const emailTo = to || w.email;
  try {
    const pdfBuffer = await renderHtmlNaarPdf(html);
    await sendPdfEmail({
      to: emailTo, subject: `Werkbon ${w.volgnummer}`,
      html: `<p>Beste ${klant.voornaam || ''} ${klant.naam},</p><p>Hierbij werkbon <strong>${w.volgnummer}</strong>.</p><p>Prijs: <strong>€${w.totaal.toFixed(2)}</strong></p><p>Met vriendelijke groeten,<br>3D Print ERP</p>`,
      pdfBuffer, filename: `werkbon-${w.volgnummer}.pdf`,
    });
    res.json({ ok: true, to: emailTo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE — printopdrachten blijven bestaan, enkel de koppeling verdwijnt ──
r.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE jobs SET werkbon_id = NULL, werkbon_regel_index = NULL WHERE werkbon_id = ?').run(req.params.id);
  db.prepare('DELETE FROM werkbonnen WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
