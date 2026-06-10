// Email stub — nodemailer wordt later toegevoegd via Dockerfile
export async function sendPdfEmail({ to, subject, html, pdfHtml, filename }) {
  console.log(`Email stub: zou versturen naar ${to} — ${subject}`);
  throw new Error('Email nog niet geconfigureerd. Installeer nodemailer via Dockerfile.');
}
