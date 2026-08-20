// backend/routes/facturen.js — factuur (PDF) uploaden en laten uitlezen via de
// Gemini API, zodat de gevonden regels nadien in de Artikelen-tab gekoppeld
// kunnen worden aan een artikeltype (voorraad aanvullen) of een uitgave.
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Nieuwste model eerst; bij aanhoudende overbelasting (503) valt de route
// terug op een ouder, stabieler model dat minder onder druk staat — voor het
// uitlezen van factuurregels is dat verschil in praktijk verwaarloosbaar.
const GEMINI_MODELLEN = ['gemini-3.7-flash', 'gemini-2.5-flash'];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    leverancier: { type: 'STRING' },
    datum: { type: 'STRING', description: 'Factuur-/aankoopdatum, formaat YYYY-MM-DD indien af te leiden' },
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

const PROMPT = `Dit is een factuur of kasticket van een aankoop. Lijst alle effectief aangekochte artikelen (regels) op.
Geef per regel: omschrijving, aantal, je beste gok voor de eenheid (stuk/gram/ml), eenheidsprijs en totaalprijs van die regel.
Belangrijk voor "aantal": geef dit altijd in de eenheid die je zelf koos bij "eenheid_gok". Bv. een rol filament van 1kg → eenheid_gok "gram", aantal 1000 (niet 1). Een fles lijm van 500ml → eenheid_gok "ml", aantal 500. Losse stuks (bv. 5 sleutelhangers) → eenheid_gok "stuk", aantal 5.
Negeer enkel subtotalen, btw-samenvattingen, kortingen en het eindtotaal zelf. Regels zoals "verpakking en verzending", "verzendkosten" of andere leveringskosten zijn WEL gewone regels om op te nemen (zet eenheid_gok dan op "stuk", aantal 1) — behandel elke rij die in de artikeltabel van de factuur staat als een op te nemen regel, tenzij het duidelijk een samenvattende/totaalregel is.
Geef ook de naam van de leverancier/winkel en de factuur- of aankoopdatum (YYYY-MM-DD) indien zichtbaar.
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

r.post('/analyseer', upload.single('factuur'), async (req, res) => {
  const db = getDb();
  try {
    const apiKey = getGeminiKey(db);
    if (!apiKey) {
      return res.status(400).json({ error: 'Geen Gemini API-key ingesteld — voeg deze eerst toe bij Instellingen.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand ontvangen (veldnaam "factuur")' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Enkel PDF-bestanden worden ondersteund' });
    }

    const body = {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: req.file.buffer.toString('base64') } },
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
      regels: Array.isArray(parsed.regels) ? parsed.regels : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;
