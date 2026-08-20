// backend/routes/facturen.js — factuur (PDF) uploaden en laten uitlezen via de
// Gemini API, zodat de gevonden regels nadien in de Artikelen-tab gekoppeld
// kunnen worden aan een artikeltype (voorraad aanvullen) of een uitgave.
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Pas aan indien Google het model-id ondertussen wijzigt — de rest van deze
// route hoeft dan niet te veranderen.
const GEMINI_MODEL = 'gemini-3.7-flash';

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
Negeer subtotalen, btw-regels, kortingen en het eindtotaal zelf — enkel de losse productregels.
Geef ook de naam van de leverancier/winkel en de factuur- of aankoopdatum (YYYY-MM-DD) indien zichtbaar.
Antwoord uitsluitend met JSON volgens het opgegeven schema, geen extra tekst.`;

function getGeminiKey(db) {
  const row = db.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'gemini_api_key'").get();
  return row?.waarde || '';
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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => '');
      return res.status(502).json({ error: `Gemini API-fout (${geminiRes.status})`, detail });
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
