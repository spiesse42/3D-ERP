// ═══════════════════════════════════════════════════════════════════════
// PAKBONNEN — leveringsbonnen voor een (deel)levering van een werkbon
// ═══════════════════════════════════════════════════════════════════════
//
// Een pakbon is GEEN facturatiedocument (geen bedragen, geen BTW) — puur een
// leveringsbewijs: wat is er meegegeven. Een werkbon kan 0, 1 of meerdere
// pakbonnen krijgen (elke deellevering een eigen volgnummer + PDF, zodat de
// leveringsgeschiedenis bewaard blijft).
//
// Elke pakbon-regel draagt aantal + omschrijving, met een optionele koppeling
// (werkbon_regel_index) terug naar de werkbon-regel waaruit ze is
// voorgesteld — enkel voor traceerbaarheid en de "nog te leveren"-berekening
// hieronder. Een regel zonder koppeling (handmatig toegevoegd, bv. een
// extraatje dat niet op de werkbon stond) heeft gewoon werkbon_regel_index =
// null. Regels/aantallen zijn op elk moment vrij aan te passen — bij het
// aanmaken EN nadien via PUT.
//
// Belangrijk: het aanmaken/bewerken van een pakbon wijzigt NOOIT de
// werkbon-regels of de job-koppeling zelf. Wat nog niet geleverd is, blijft
// gewoon op de werkbon (en dus op de eraan gekoppelde jobs) staan zoals het
// was — "nog te leveren" wordt hieronder steeds dynamisch herberekend
// (regel.aantal minus de som van alle bestaande pakbon-regels met diezelfde
// koppeling), geen aparte teller die uit sync kan raken.
import { Router } from 'express';
import { getDb } from '../db.js';
import { LOGO_DATA_URI } from '../lib/logo.js';
import { renderHtmlNaarPdf } from '../lib/pdf.js';
import { escapeHtml, escapeRecord } from '../lib/html.js';
import { sendPdfEmail } from '../email.js';

const r = Router();

const REGEL_TYPE_LABELS = {
  ontwerp: 'Ontwerp + digitaal bestand aanleveren',
  aanpassing: 'Aanpassing op bestaand ontwerp/bestand',
  printen: 'Printen',
  extra: 'Extra kosten/dienst',
  artikel: 'Artikel',
};

// Enkel fysieke, leverbare regeltypes komen in aanmerking voor een pakbon —
// diensten (ontwerp/aanpassing/extra) zijn niet iets dat je "levert".
const LEVERBARE_TYPES = ['printen', 'artikel'];

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

function volgendPakbonVolgnummer(db) {
  const jaar = new Date().getFullYear();
  const sleutel = `pakbon_volgnummer_teller_${jaar}`;
  const rij = db.prepare('SELECT waarde FROM instellingen WHERE sleutel = ?').get(sleutel);
  const teller = (rij ? parseInt(rij.waarde) || 0 : 0) + 1;
  db.prepare(`
    INSERT INTO instellingen (sleutel, waarde) VALUES (?,?)
    ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde
  `).run(sleutel, String(teller));
  return `PB-${jaar}-${String(teller).padStart(4, '0')}`;
}

function labelVoorRegel(regel) {
  const label = REGEL_TYPE_LABELS[regel.type] || regel.type;
  return regel.object_naam ? `${label}: ${regel.object_naam}` : label;
}

function parseRegels(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

// Elke pakbon-regel valideren: object_naam verplicht, aantal een positief
// geheel getal. werkbon_regel_index is optioneel (null bij een handmatig
// toegevoegde regel) maar moet, indien gezet, naar een bestaande regel van
// DEZE werkbon wijzen.
function valideerPakbonRegels(regels, werkbonRegels) {
  if (!Array.isArray(regels) || !regels.length) return 'Een pakbon moet minstens 1 regel bevatten';
  for (const regel of regels) {
    if (!regel.object_naam || !String(regel.object_naam).trim()) return 'Elke regel heeft een omschrijving nodig';
    const aantal = parseInt(regel.aantal);
    if (!Number.isFinite(aantal) || aantal <= 0) return `Aantal moet een geheel getal groter dan 0 zijn (regel "${regel.object_naam}")`;
    if (regel.werkbon_regel_index != null) {
      const idx = parseInt(regel.werkbon_regel_index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= werkbonRegels.length) {
        return `Ongeldige koppeling naar werkbon-regel (regel "${regel.object_naam}")`;
      }
    }
  }
  return null;
}

// "Nog te leveren"-overzicht voor 1 werkbon: per leverbare regel (printen/
// artikel) het totaal aantal, wat er al over eerdere pakbonnen verspreid
// staat, en wat er dus nog rest. Steeds vers berekend uit de bestaande
// pakbonnen — geen opgeslagen teller.
function berekenVoortgang(werkbonRegels, pakbonnenVanWerkbon) {
  const geleverdPerIndex = new Map();
  for (const pb of pakbonnenVanWerkbon) {
    for (const regel of parseRegels(pb.regels_json)) {
      if (regel.werkbon_regel_index == null) continue;
      const huidig = geleverdPerIndex.get(regel.werkbon_regel_index) || 0;
      geleverdPerIndex.set(regel.werkbon_regel_index, huidig + (parseInt(regel.aantal) || 0));
    }
  }
  return werkbonRegels
    .map((regel, idx) => ({ regel, idx }))
    .filter(({ regel }) => LEVERBARE_TYPES.includes(regel.type))
    .map(({ regel, idx }) => {
      const totaal = parseInt(regel.aantal) || 1;
      const geleverd = geleverdPerIndex.get(idx) || 0;
      return {
        werkbon_regel_index: idx,
        object_naam: labelVoorRegel(regel),
        aantal_totaal: totaal,
        aantal_geleverd: geleverd,
        aantal_resterend: Math.max(0, totaal - geleverd),
      };
    });
}

// ── GET pakbonnen + voortgang voor 1 werkbon ────────────────────────────
// Let op: moet vóór GET /:id geregistreerd staan.
r.get('/werkbon/:werkbonId', (req, res) => {
  const db = getDb();
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(req.params.werkbonId);
  if (!werkbon) return res.status(404).json({ error: 'Werkbon niet gevonden' });
  const werkbonRegels = parseRegels(werkbon.regels_json);
  const pakbonnen = db.prepare('SELECT * FROM pakbonnen WHERE werkbon_id = ? ORDER BY aangemaakt_op DESC').all(werkbon.id);
  const voortgang = berekenVoortgang(werkbonRegels, pakbonnen);
  res.json({
    pakbonnen: pakbonnen.map(pb => ({ ...pb, regels: parseRegels(pb.regels_json) })),
    voortgang,
  });
});

// ── POST nieuwe pakbon aanmaken ─────────────────────────────────────────
r.post('/', (req, res) => {
  const db = getDb();
  const { werkbon_id, regels, notities } = req.body;
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(werkbon_id);
  if (!werkbon) return res.status(404).json({ error: 'Werkbon niet gevonden' });
  const werkbonRegels = parseRegels(werkbon.regels_json);
  const fout = valideerPakbonRegels(regels, werkbonRegels);
  if (fout) return res.status(400).json({ error: fout });

  const schoneRegels = regels.map(rg => ({
    werkbon_regel_index: rg.werkbon_regel_index != null ? parseInt(rg.werkbon_regel_index) : null,
    object_naam: String(rg.object_naam).trim(),
    aantal: parseInt(rg.aantal),
  }));

  const volgnummer = volgendPakbonVolgnummer(db);
  const result = db.prepare(`
    INSERT INTO pakbonnen (werkbon_id, volgnummer, regels_json, notities)
    VALUES (?,?,?,?)
  `).run(werkbon.id, volgnummer, JSON.stringify(schoneRegels), notities || null);
  res.status(201).json({ id: result.lastInsertRowid, volgnummer });
});

// ── GET 1 pakbon (incl. werkbon/klant-info) ─────────────────────────────
function haalPakbonMetContext(db, id) {
  const pb = db.prepare('SELECT * FROM pakbonnen WHERE id = ?').get(id);
  if (!pb) return null;
  const werkbon = db.prepare(`
    SELECT w.*, k.naam as klant_naam, k.voornaam as klant_voornaam, k.email, k.straat,
      k.huisnummer, k.postcode, k.gemeente
    FROM werkbonnen w JOIN klanten k ON k.id = w.klant_id WHERE w.id = ?
  `).get(pb.werkbon_id);
  return { ...pb, regels: parseRegels(pb.regels_json), werkbon };
}

r.get('/:id', (req, res) => {
  const db = getDb();
  const pb = haalPakbonMetContext(db, req.params.id);
  if (!pb) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(pb);
});

// ── PUT bewerken (regels/notities) ──────────────────────────────────────
r.put('/:id', (req, res) => {
  const db = getDb();
  const bestaand = db.prepare('SELECT * FROM pakbonnen WHERE id = ?').get(req.params.id);
  if (!bestaand) return res.status(404).json({ error: 'Niet gevonden' });
  const werkbon = db.prepare('SELECT * FROM werkbonnen WHERE id = ?').get(bestaand.werkbon_id);
  const werkbonRegels = parseRegels(werkbon?.regels_json);
  const regels = Array.isArray(req.body.regels) ? req.body.regels : parseRegels(bestaand.regels_json);
  const fout = valideerPakbonRegels(regels, werkbonRegels);
  if (fout) return res.status(400).json({ error: fout });

  const schoneRegels = regels.map(rg => ({
    werkbon_regel_index: rg.werkbon_regel_index != null ? parseInt(rg.werkbon_regel_index) : null,
    object_naam: String(rg.object_naam).trim(),
    aantal: parseInt(rg.aantal),
  }));

  db.prepare('UPDATE pakbonnen SET regels_json=?, notities=? WHERE id=?').run(
    JSON.stringify(schoneRegels),
    req.body.notities !== undefined ? req.body.notities || null : bestaand.notities,
    req.params.id
  );
  res.json({ ok: true });
});

// ── DELETE ───────────────────────────────────────────────────────────────
r.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM pakbonnen WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── PDF (geen bedragen — enkel aantal + omschrijving) ───────────────────
function buildPakbonHtml(pakbon, klant, bedrijf = {}) {
  pakbon = { ...escapeRecord(pakbon), regels: (pakbon.regels || []).map(escapeRecord) }; klant = escapeRecord(klant); bedrijf = escapeRecord(bedrijf);
  const nu = new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const regelHtml = pakbon.regels.map(rg => `
    <tr><td>${rg.aantal}</td><td>${rg.object_naam}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #5b8dee;padding-bottom:20px;margin-bottom:28px}
  .logo img{height:64px;width:auto;display:block}
  .klant{background:#f8f9fa;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .klant h3{margin:0 0 6px;font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:#5b8dee}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{background:#5b8dee;color:#fff;padding:9px 12px;text-align:left;font-size:.78rem;text-transform:uppercase}
  th:first-child,td:first-child{text-align:right;width:70px}
  td{padding:9px 12px;border-bottom:1px solid #eee;font-size:.88rem}
  tr:nth-child(even) td{background:#f8f9fa}
  .footer{margin-top:32px;border-top:1px solid #eee;padding-top:14px;font-size:.72rem;color:#999;text-align:center}
  .opmerking{margin-top:16px;padding:12px 16px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:.88rem;color:#664400}
  .handtekening{margin-top:48px;display:flex;justify-content:space-between;gap:40px}
  .handtekening div{flex:1;border-top:1px solid #ccc;padding-top:6px;font-size:.72rem;color:#999}
  </style></head><body>
  <div class="header">
    <div><div class="logo"><img src="${LOGO_DATA_URI}" alt="3D Plezier"></div>
      ${bedrijf.naam || bedrijf.adres || bedrijf.email ? `<div style="margin-top:8px;font-size:.72rem;color:#888;line-height:1.5">
      ${bedrijf.naam ? `<strong>${bedrijf.naam}</strong><br>` : ''}${bedrijf.adres ? `${bedrijf.adres}<br>` : ''}
      ${bedrijf.email ? `${bedrijf.email}` : ''}</div>` : ''}</div>
    <div style="text-align:right;color:#666;font-size:.85rem">
      <div style="font-size:1.1rem;font-weight:bold">PAKBON</div>
      <div style="font-family:monospace;font-weight:600">${pakbon.volgnummer}</div>
      <div style="font-size:.72rem;color:#999">bij werkbon ${pakbon.werkbon?.volgnummer || ''}</div>
      <div>${nu}</div></div>
  </div>
  <div class="klant"><h3>Klant</h3>
    <strong>${klant.voornaam ? klant.voornaam + ' ' : ''}${klant.naam}</strong>
    ${klant.straat ? `<br>${klant.straat} ${klant.huisnummer || ''}, ${klant.postcode || ''} ${klant.gemeente || ''}` : ''}</div>
  <table><thead><tr><th>Aantal</th><th>Omschrijving</th></tr></thead>
    <tbody>${regelHtml}</tbody></table>
  ${pakbon.notities ? `<div class="opmerking">📝 ${pakbon.notities}</div>` : ''}
  <div class="handtekening"><div>Handtekening leverancier</div><div>Handtekening klant (voor ontvangst)</div></div>
  <div class="footer">${bedrijf.naam || '3D Print ERP'} &nbsp;|&nbsp; ${nu}</div>
  </body></html>`;
}

r.get('/:id/pdf', async (req, res) => {
  const db = getDb();
  const pb = haalPakbonMetContext(db, req.params.id);
  if (!pb || !pb.werkbon) return res.status(404).json({ error: 'Niet gevonden' });
  const klant = { naam: pb.werkbon.klant_naam, voornaam: pb.werkbon.klant_voornaam, straat: pb.werkbon.straat,
    huisnummer: pb.werkbon.huisnummer, postcode: pb.werkbon.postcode, gemeente: pb.werkbon.gemeente };
  const html = buildPakbonHtml(pb, klant, getBedrijfsgegevens(db));
  try {
    const pdfBuffer = await renderHtmlNaarPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pakbon-${pb.volgnummer}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    res.status(500).json({ error: `PDF genereren mislukt: ${e.message}` });
  }
});

r.post('/:id/email', async (req, res) => {
  const db = getDb();
  const pb = haalPakbonMetContext(db, req.params.id);
  if (!pb || !pb.werkbon) return res.status(404).json({ error: 'Niet gevonden' });
  const klant = { naam: pb.werkbon.klant_naam, voornaam: pb.werkbon.klant_voornaam, straat: pb.werkbon.straat,
    huisnummer: pb.werkbon.huisnummer, postcode: pb.werkbon.postcode, gemeente: pb.werkbon.gemeente };
  const html = buildPakbonHtml(pb, klant, getBedrijfsgegevens(db));
  const emailTo = req.body.to || pb.werkbon.email;
  if (!emailTo) return res.status(400).json({ error: 'Geen e-mailadres beschikbaar' });
  try {
    const pdfBuffer = await renderHtmlNaarPdf(html);
    await sendPdfEmail({
      to: emailTo, subject: `Pakbon ${pb.volgnummer}`,
      html: `<p>Beste ${escapeHtml(klant.voornaam || '')} ${escapeHtml(klant.naam)},</p><p>Hierbij pakbon <strong>${escapeHtml(pb.volgnummer)}</strong> bij werkbon ${escapeHtml(pb.werkbon.volgnummer)}.</p><p>Met vriendelijke groeten,<br>3D Print ERP</p>`,
      pdfBuffer, filename: `pakbon-${pb.volgnummer}.pdf`,
    });
    res.json({ ok: true, to: emailTo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
