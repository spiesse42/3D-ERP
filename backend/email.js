// email.js — verzendt de werkbon per e-mail via Gmail SMTP (nodemailer)
// SMTP_USER / SMTP_PASS / SMTP_FROM komen uit de Home Assistant addon-instellingen
// (nooit hardcoden in code of config.yaml — enkel via de addon-configuratie invullen).
import nodemailer from 'nodemailer';

let transporter = null;
let transporterKey = null;

function getTransporter() {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) return null;

  const key = `${user}:${pass}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    transporterKey = key;
  }
  return transporter;
}

export async function sendPdfEmail({ to, subject, html, pdfHtml, filename }) {
  if (!to) {
    throw new Error('Geen ontvanger opgegeven — vul een e-mailadres in.');
  }

  const t = getTransporter();
  if (!t) {
    throw new Error(
      'Email nog niet geconfigureerd — vul SMTP-gebruiker en app-wachtwoord in bij de ' +
      'Home Assistant addon-instellingen (Instellingen → Add-ons → 3D Print ERP → Configuratie).'
    );
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await t.sendMail({
      from: `"3D Print ERP" <${from}>`,
      to,
      subject,
      html,
      attachments: pdfHtml ? [{
        filename: filename || 'werkbon.html',
        content: pdfHtml,
        contentType: 'text/html',
      }] : [],
    });
  } catch (e) {
    // Nodemailer/Gmail-foutmeldingen zijn vaak Engels en technisch — geef een
    // duidelijkere hint mee voor de meest voorkomende oorzaak.
    if (e?.responseCode === 535 || /invalid login/i.test(e?.message || '')) {
      throw new Error('Gmail weigerde de login — controleer of het app-wachtwoord correct is ingevuld (geen gewoon Google-wachtwoord).');
    }
    throw new Error(`Verzenden mislukt: ${e.message}`);
  }
}
