// backend/routes/facturen.js — factuur/bonnetje (PDF of foto) uploaden en
// laten uitlezen via de Gemini API, zodat de gevonden regels nadien in de
// Artikelen-tab gekoppeld kunnen worden aan een artikeltype (voorraad
// aanvullen) of een uitgave. Het bestand zelf wordt daarna ook blijvend
// bewaard (map 'aankoopfacturen' in de persistente /data-map van de addon —
// zelfde patroon als de back-up-archiefmap in reset.js/auto_backup.js), zodat
// je het origineel later kan terugvinden/downloaden via het "Aankoopfacturen"-
// overzicht, en elk voorraadartikel/elke uitgave die eruit ontstaat een
// traceerbare koppeling (factuur_id) krijgt naar dat bewijsstuk.
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = Router();

// Zelfde DB_PATH-conventie als db.js/reset.js/auto_backup.js — in productie
// (addon/run.sh) is dit /data/erp.db, dus de map hieronder komt in de
// persistente /data-mount terecht en overleeft een addon-herbouw.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'erp.db');
const AANKOOPFACTUREN_DIR = path.join(path.dirname(DB_PATH), 'aankoopfacturen');
fs.mkdirSync(AANKOOPFACTUREN_DIR, { recursive: true });

// PDF's (facturen) én foto's (bonnetjes, bv. met de telefoon gefotografeerd)
// worden allebei ondersteund — Gemini kan zowel een PDF als een afbeelding
// rechtstreeks als 'inline_data' analyseren.
const TOEGESTANE_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, TOEGESTANE_MIMETYPES.includes(file.mimetype)),
});

// Nieuwste model eerst; bij aanhoudende overbelasting (503) valt de route
// terug op een ouder, stabieler model dat minder onder druk staat — voor het
// uitlezen van factuurregels is dat verschil in praktijk verwaarloosbaar.
const GEMINI_MODELLEN = ['gemini-3.7-flash', 'gemini-2.5-flash'];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    leverancier: { type: 'STRING' },
    datum: { type: 'STRING', description: 'Factuur-/aankoopdatum, formaat YYYY-MM-DD indien af te leiden' },
    factuurnummer: { type: 'STRING', description: 'Factuur- of ticketnummer indien vermeld op het document, anders lege string' },
    regels: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          omschrijving:  { type: 'STRING' },
          aantal:        { type: 'NUMBER' },
          eenheid_gok:   { type: 'STRING', description: "beste gok: 'stuk', 'gram' of 'ml'" },
          eenheidsprijs: { type: 'NUMBER' },
          totaal:        { type: 'NUMBER' },
        },
        required: ['omschrijving', 'aantal', 'totaal'],
      },
    },
  },
  required: ['regels'],
};

const PROMPT = `Dit is een factuur of kasticket/bonnetje van een aankoop (mogelijk een foto). Lijst alle effectief aangekochte artikelen (regels) op.
Geef per regel: omschrijving, aantal, je beste gok voor de eenheid (stuk/gram/ml), eenheidsprijs en totaalprijs van die regel.
Belangrijk voor "aantal": geef dit altijd in de eenheid die je zelf koos bij "eenheid_gok". Bv. een rol filament van 1kg → eenheid_gok "gram", aantal 1000 (niet 1). Een fles lijm van 500ml → eenheid_gok "ml", aantal 500. Losse stuks (bv. 5 sleutelhangers) → eenheid_gok "stuk", aantal 5.
Negeer enkel subtotalen, btw-samenvattingen, kortingen en het eindtotaal zelf. Regels zoals "verpakking en verzending", "verzendkosten" of andere leveringskosten zijn WEL gewone regels om op te nemen (zet eenheid_gok dan op "stuk", aantal 1) — behandel elke rij die in de artikeltabel van de factuur staat als een op te nemen regel, tenzij het duidelijk een samenvattende/totaalregel is.
Geef ook de naam van de leverancier/winkel, de factuur- of aankoopdatum (YYYY-MM-DD) indien zichtbaar, en het factuur- of ticketnummer indien vermeld (anders lege string).
Antwoord uitsluitend met JSON volgens het opgegeven schema, geen extra tekst.`;

function getGeminiKey(db) {
  const row = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'gemini_api_key'").get();
  return row?.waarde || '';
}

const wachten = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gemini geeft bij drukte af en toe een tijdelijke 503 (overbelast) of 429
// (rate limit) terug — dat is geen echte fout, gewoon even opnieuw proberen
// lost het meestal op. Andere foutcodes (bv. 400/401/403) hebben geen zin om
// te herhalen, die geven we meteen door.
async function probeerModel(apiKey, model, body, pogingen = 3) {
  let laatsteRes;
  for (let poging = 1; poging <= pogingen; poging++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }
    );
    if (res.ok || ![503, 429].includes(res.status) || poging === pogingen) return res;
    laatsteRes = res;
    await wachten(1000 * poging); // 1s, 2s, ...
  }
  return laatsteRes;
}

// Loopt de modellenlijst af (nieuwste eerst) — pas bij aanhoudende 503/429 op
// het huidige model schakelt hij door naar het volgende, stabielere model.
async function geminiGenerateContent(apiKey, body) {
  let laatsteRes;
  for (const model of GEMINI_MODELLEN) {
    const res = await probeerModel(apiKey, model, body);
    if (res.ok || ![503, 429].includes(res.status)) return res;
    laatsteRes = res;
  }
  return laatsteRes;
}

// Stap 1: analyseren — puur lezen, niets wordt bewaard. Zo kost annuleren in
// de review-stap niets en blijft er geen wees-bestand achter.
r.post('/analyseer', upload.single('factuur'), async (req, res) => {
  const db = getDb();
  try {
    const apiKey = getGeminiKey(db);
    if (!apiKey) {
      return res.status(400).json({ error: 'Geen Gemini API-key ingesteld — voeg deze eerst toe bij Instellingen.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand ontvangen, of het bestandstype wordt niet ondersteund (enkel PDF of foto: jpg/png/webp/heic).' });
    }

    const body = {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: RESPONSE_SCHEMA,
      },
    };

    const geminiRes = await geminiGenerateContent(apiKey, body);

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => '');
      const uitleg = [503, 429].includes(geminiRes.status)
        ? ' — Gemini is tijdelijk overbelast, probeer het over een minuutje opnieuw.'
        : '';
      return res.status(502).json({ error: `Gemini API-fout (${geminiRes.status})${uitleg}`, detail });
    }

    const data = await geminiRes.json();
    const tekst = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!tekst) {
      return res.status(502).json({ error: 'Gemini gaf geen bruikbaar antwoord terug', detail: JSON.stringify(data).slice(0, 500) });
    }

    let parsed;
    try {
      parsed = JSON.parse(tekst);
    } catch {
      return res.status(502).json({ error: 'Antwoord van Gemini was geen geldige JSON', detail: tekst.slice(0, 500) });
    }

    res.json({
      leverancier: parsed.leverancier || '',
      datum: parsed.datum || '',
      factuurnummer: parsed.factuurnummer || '',
      regels: Array.isArray(parsed.regels) ? parsed.regels : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stap 2: bevestigen — bewaart het bestand blijvend + legt de factuur-rij aan.
// Wordt aangeroepen NA de review-stap, dus enkel als de gebruiker effectief
// bevestigt (bij annuleren op stap 1 wordt hier nooit iets geschreven).
r.post('/opslaan', upload.single('factuur'), (req, res) => {
  const db = getDb();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand ontvangen, of het bestandstype wordt niet ondersteund (enkel PDF of foto: jpg/png/webp/heic).' });
    }
    const { leverancier, datum, factuurnummer, type, totaal_bedrag } = req.body;
    const soort = type === 'bonnetje' ? 'bonnetje' : 'factuur';

    const insert = db.prepare(`
      INSERT INTO facturen (leverancier, factuurnummer, datum, type, bestandsnaam, mimetype, totaal_bedrag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      leverancier || null,
      factuurnummer || null,
      datum || null,
      soort,
      req.file.originalname || null,
      req.file.mimetype,
      totaal_bedrag != null && totaal_bedrag !== '' ? parseFloat(totaal_bedrag) : null,
    );
    const id = insert.lastInsertRowid;

    // Bestandsnaam op schijf: <id>-<opgeschoonde originele naam> — het id
    // maakt de naam altijd uniek, geen kans op overschrijven.
    const veiligeNaam = (req.file.originalname || 'bestand')
      .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')
      .slice(-100);
    const bestandsnaamOpSchijf = `${id}-${veiligeNaam}`;
    fs.writeFileSync(path.join(AANKOOPFACTUREN_DIR, bestandsnaamOpSchijf), req.file.buffer);
    db.prepare('UPDATE facturen SET bestandspad = ? WHERE id = ?').run(bestandsnaamOpSchijf, id);

    res.status(201).json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Overzicht van alle geüploade facturen/bonnetjes, met per rij hoeveel
// voorraadrollen/uitgaven eraan gekoppeld zijn (handig om te zien wat een
// upload allemaal teweeggebracht heeft).
r.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM filament_rollen fr WHERE fr.factuur_id = f.id) as aantal_rollen,
        (SELECT COUNT(*) FROM uitgaven u WHERE u.factuur_id = f.id) as aantal_uitgaven
      FROM facturen f
      ORDER BY COALESCE(f.datum, f.aangemaakt_op) DESC, f.id DESC
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Origineel bestand terug opvragen (bekijken/downloaden).
r.get('/:id/bestand', (req, res) => {
  try {
    const db = getDb();
    const factuur = db.prepare('SELECT * FROM facturen WHERE id = ?').get(req.params.id);
    if (!factuur || !factuur.bestandspad) return res.status(404).json({ error: 'Bestand niet gevonden' });
    const volledigPad = path.join(AANKOOPFACTUREN_DIR, factuur.bestandspad);
    if (!fs.existsSync(volledigPad)) return res.status(404).json({ error: 'Bestand niet (meer) aanwezig op schijf' });
    res.setHeader('Content-Type', factuur.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(factuur.bestandsnaam || factuur.bestandspad).replace(/"/g, '')}"`);
    fs.createReadStream(volledigPad).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Factuur verwijderen — bestand van schijf + rij uit de databank. Gekoppelde
// voorraadrollen/uitgaven blijven gewoon bestaan (factuur_id valt terug op
// NULL via ON DELETE SET NULL), enkel de traceerbaarheid naar dit bewijsstuk
// verdwijnt dan.
r.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const factuur = db.prepare('SELECT * FROM facturen WHERE id = ?').get(req.params.id);
    if (!factuur) return res.status(404).json({ error: 'Niet gevonden' });
    if (factuur.bestandspad) {
      const volledigPad = path.join(AANKOOPFACTUREN_DIR, factuur.bestandspad);
      fs.rm(volledigPad, { force: true }, () => {}); // best-effort, async, geen blokkerende fout als het al weg is
    }
    db.prepare('DELETE FROM facturen WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
