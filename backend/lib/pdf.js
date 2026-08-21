// pdf.js — zet HTML (offerte/werkbon-sjablonen) om naar een ECHTE PDF via een
// headless Chromium, i.p.v. de gebruiker zelf een .html-bestand te laten
// downloaden en die dan handmatig via de browser-printdialoog als PDF op te
// slaan. Dat laatste voegde ongewenst de eigen kop-/voettekst van de browser
// toe (datum, bestandspad, paginanummer — zie screenshot-melding). Puppeteer
// se page.pdf() heeft `displayHeaderFooter` standaard al op false, dus zolang
// we die nooit expliciet aanzetten verschijnt zoiets nooit meer.
//
// We draaien op het systeem-Chromium dat in de Docker-image (addon/Dockerfile)
// via `apk add chromium` geïnstalleerd wordt — puppeteer-core zelf bundelt
// bewust GEEN eigen Chromium (dat zou de addon-image met >300MB doen groeien
// bovenop de systeem-versie).
import puppeteer from 'puppeteer-core';
import fs from 'fs';

// Kandidaat-paden voor het systeem-Chromium-binary — verschilt licht per
// Alpine-versie/package. PUPPETEER_EXECUTABLE_PATH (gezet in het Dockerfile)
// heeft altijd voorrang; de lijst hieronder is enkel een terugval voor lokaal
// draaien/debuggen zonder die env-var.
const KANDIDAAT_PADEN = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

function vindChromiumPad() {
  for (const p of KANDIDAAT_PADEN) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

let browserPromise = null;

// Eén gedeelde browserinstantie i.p.v. per PDF een nieuwe Chromium opstarten
// (kost >1s en flink wat geheugen) — enkel losse tabbladen (pages) per
// aanvraag, die we altijd sluiten na gebruik.
async function haalBrowser() {
  if (!browserPromise) {
    const executablePath = vindChromiumPad();
    if (!executablePath) {
      throw new Error(
        'Geen Chromium gevonden op dit systeem — controleer of "chromium" in addon/Dockerfile ' +
        'geïnstalleerd is (apk add chromium) en of de addon opnieuw gebouwd is na die wijziging.'
      );
    }
    browserPromise = puppeteer.launch({
      executablePath,
      headless: true,
      // --no-sandbox: nodig omdat de addon-container als root draait (geen
      // aparte gebruiker ingesteld in het Dockerfile/run.sh).
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).catch(e => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

// Zet een volledig HTML-document (met inline <style>, zoals onze offerte-/
// werkbon-sjablonen) om naar een PDF-buffer. A4, achtergrondkleuren/-borders
// mee-afgedrukt (printBackground), geen marges (het sjabloon zelf regelt al
// eigen padding via body{padding:40px}), en dus ook geen browser-kop-/
// voettekst (displayHeaderFooter blijft op de puppeteer-default: false).
export async function renderHtmlNaarPdf(html) {
  const browser = await haalBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const data = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    // page.pdf() geeft sinds recentere puppeteer-versies een Uint8Array terug
    // i.p.v. een Node Buffer — Express' res.send() herkent een kale
    // Uint8Array niet als binair en zou 'm anders per ongeluk als JSON
    // ({"0":37,"1":80,...}) wegschrijven. Expliciet naar Buffer omzetten
    // voorkomt dat.
    return Buffer.from(data);
  } finally {
    await page.close();
  }
}
