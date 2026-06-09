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

initDb();

// Registreer API routes op zowel /api als /app/SLUG/api (voor HA Ingress)
const apiRoutes = (router) => {
  router.use('/klanten',    klanten);
  router.use('/printers',   printers);
  router.use('/filament',   filament);
  router.use('/jobs',       jobs);
  router.use('/kosten',     kosten);
  router.use('/offertes',   offertes);
  router.use('/betalingen', betalingen);
  router.use('/tarieven',   tarieven);
  router.use('/ha',         ha);
  router.use('/rapportage', rapportage);
};

// Lokaal dev pad
const localRouter = express.Router();
apiRoutes(localRouter);
app.use('/api', localRouter);

// HA Ingress pad — matcht /app/SLUG/api/...
app.use('/app/:slug/api', (req, res, next) => {
  const ingressRouter = express.Router();
  apiRoutes(ingressRouter);
  ingressRouter(req, res, next);
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Vang alle overige paden op — stuur index.html terug (React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`3D Print ERP draait op poort ${PORT}`);
});
