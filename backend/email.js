import nodemailer from 'nodemailer';

export function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendPdfEmail({ to, subject, html, pdfHtml, filename }) {
  const transporter = getTransporter();

  await transporter.sendMail({
    from: `3D Print ERP <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: filename || 'kostprijs.html',
        content: pdfHtml,
        contentType: 'text/html',
      }
    ],
  });
}
