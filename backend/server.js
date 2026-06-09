import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

import klanten from './routes/klanten.js';
import printers from './routes/printers.js';
import filament from './routes/filament.js';
import jobs from './routes/jobs.js';
import kosten from './routes/kosten.js';
import offertes from './routes/offertes.js';
import tarieven from './routes/tarieven.js';
import ha from './routes/ha.js';
import rapportage from './routes/rapportage.js';
import { betalingen } from './routes/_combined.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Log alle requests inclusief headers
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} | ingress: ${req.headers['x-ingress-path'] || 'none'}`);
  next();
});

initDb();

// API routes op /api
app.use('/api/klanten',    klanten);
app.use('/api/printers',   printers);
app.use('/api/filament',   filament);
app.use('/api/jobs',       jobs);
app.use('/api/kosten',     kosten);
app.use('/api/offertes',   offertes);
app.use('/api/betalingen', betalingen);
app.use('/api/tarieven',   tarieven);
app.use('/api/ha',         ha);
app.use('/api/rapportage', rapportage);

// Geef ingress pad mee aan frontend via een endpoint
app.get('/ingress-path', (req, res) => {
  const ingressPath = req.headers['x-ingress-path'] || '';
  res.json({ path: ingressPath });
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`3D Print ERP draait op poort ${PORT}`);
});
