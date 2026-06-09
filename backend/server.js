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

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

initDb();

// Monteer routes op beide mogelijke paden
function mountRoutes(app, prefix) {
  app.use(`${prefix}/klanten`,    klanten);
  app.use(`${prefix}/printers`,   printers);
  app.use(`${prefix}/filament`,   filament);
  app.use(`${prefix}/jobs`,       jobs);
  app.use(`${prefix}/kosten`,     kosten);
  app.use(`${prefix}/offertes`,   offertes);
  app.use(`${prefix}/betalingen`, betalingen);
  app.use(`${prefix}/tarieven`,   tarieven);
  app.use(`${prefix}/ha`,         ha);
  app.use(`${prefix}/rapportage`, rapportage);
}

// Lokaal: /api/...
mountRoutes(app, '/api');

// HA Ingress: /app/SLUG/api/...
app.use('/app', express.Router().use('/:slug/api', (req, res, next) => {
  req.url = req.url.replace(/^\/[^/]+\/api/, '') || '/';
  mountRoutes(app, '');
  next();
}));

// Wildcard: vang /app/SLUG/api/... rechtstreeks op
app.use(/^\/app\/[^/]+\/api(.*)/, (req, res, next) => {
  const apiPath = req.params[0] || '/';
  req.url = apiPath;
  express.Router()
    .use('/klanten',    klanten)
    .use('/printers',   printers)
    .use('/filament',   filament)
    .use('/jobs',       jobs)
    .use('/kosten',     kosten)
    .use('/offertes',   offertes)
    .use('/betalingen', betalingen)
    .use('/tarieven',   tarieven)
    .use('/ha',         ha)
    .use('/rapportage', rapportage)(req, res, next);
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`3D Print ERP draait op poort ${PORT}`);
});
