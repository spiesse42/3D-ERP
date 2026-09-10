import { Router } from 'express';
import { getDb } from '../db.js';

const r = Router();

function getTarieven(db) {
  const rows = db.prepare('SELECT sleutel, waarde FROM tarieven').all();
  return Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
}

// Valt terug op de standaardwaarde enkel als er écht niets bruikbaars werd
// meegegeven — niet bij een bewust ingevulde 0 (bv. "geen voorbereidingstijd
// nodig", of "0 print-uren aanrekenen"). Met een gewone `||`-fallback ging
// zo'n ingevulde 0 altijd verloren. Zelfde helper als in offertes_v2.js.
function getalOfDefault(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

r.post('/bereken/:jobId', (req, res) => {
  const db = getDb();
  // LEFT JOIN — een 'dienst'-job (consultancy/ontwerp) heeft geen printer_id,
  // en moet dus ook zonder gekoppelde printer een berekening kunnen krijgen.
  const job = db.prepare(`
    SELECT j.*, p.machine_kost_per_uur, p.heeft_bmcu, p.naam as printer_naam
    FROM jobs j LEFT JOIN printers p ON p.id = j.printer_id WHERE j.id = ?
  `).get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job niet gevonden' });
  const machineKostPerUur = job.machine_kost_per_uur || 0;

  const t = getTarieven(db);
  const kwh_prijs = getalOfDefault(t.kwh_prijs, 0.35);
  const arbeid_per_uur = getalOfDefault(t.arbeid_per_uur, 15);
  const faalfactor_pct = getalOfDefault(t.faalfactor_pct, 10);
  const bmcu_per_job = getalOfDefault(t.bmcu_per_job, 0.10);
  const voorbereiding_min_default = getalOfDefault(t.voorbereiding_min, 15);
  const nabewerking_min_default = getalOfDefault(t.nabewerking_min, 10);
  const marge_grens_uur = getalOfDefault(t.marge_grens_uur, 4);
  const marge_klein_pct = getalOfDefault(t.marge_klein_pct, 18);
  const marge_groot_pct = getalOfDefault(t.marge_groot_pct, 10);

  const {
    kwh_verbruikt = 0,
    is_multicolor = job.is_multicolor,
    incl_voorbereiding = true,
    incl_nabewerking = true,
    voorbereiding_min = voorbereiding_min_default,
    nabewerking_min = nabewerking_min_default,
    extra_voorbereiding_min = 0,
    ontwerp_min = 0,
    ontwerp_tarief = getalOfDefault(t.ontwerp_tarief, 15),
    nabewerking_extra_min = 0,
    nabewerking_extra_tarief = getalOfDefault(t.nabewerking_tarief, 15),
    extra_per_stuk = 0,
    extra_eenmalig = 0,
    extra_omschrijving = '',
    aantal = 1,
    opmerking = '',
    print_uren = null,
  } = req.body;

  // Bugfix: bewust "0 print-uren" invullen (bv. correctie na een mislukte
  // print, of een dienst-job zonder printtijd) werd door de oude `||`-keten
  // genegeerd — 0 is falsy, dus viel dit altijd terug op de oude opgeslagen
  // waarde van de job. `??` respecteert een echte 0 in die oude waarden,
  // `getalOfDefault` respecteert een echte 0 in de nieuw ingevulde `print_uren`.
  const uren = getalOfDefault(print_uren, job.print_uren_werkelijk ?? job.print_uren_geschat ?? 0);

  if (print_uren != null) {
    try { db.prepare('UPDATE jobs SET print_uren_werkelijk = ? WHERE id = ?').run(parseFloat(print_uren), req.params.jobId); } catch {}
  }

  const materialen = db.prepare(`
    SELECT jm.gram_gebruikt, ft.merk, ft.materiaal, ft.categorie, ft.eenheid, r.kleur, r.id as rol_id,
      COALESCE(r.aankoopprijs_eur / NULLIF(r.gewicht_gram_start, 0) * (CASE WHEN ft.eenheid = 'gram' THEN 1000.0 ELSE 1.0 END), ft.inkoop_prijs_per_kg) as prijs_per_kg_effectief
    FROM job_materialen jm
    JOIN filament_rollen r ON r.id = jm.filament_rol_id
    JOIN filament_types ft ON ft.id = r.filament_type_id
    WHERE jm.job_id = ?
  `).all(req.params.jobId);

  const kostPerRegel = m => (m.gram_gebruikt / (m.eenheid === 'gram' ? 1000 : 1)) * m.prijs_per_kg_effectief;

  const filament_kost = materialen
    .filter(m => m.categorie === 'filament')
    .reduce((sum, m) => sum + kostPerRegel(m), 0) * (1 + faalfactor_pct / 100);

  const artikel_kost = materialen
    .filter(m => m.categorie !== 'filament')
    .reduce((sum, m) => sum + kostPerRegel(m), 0);

  const materiaal_kost = filament_kost + artikel_kost;

  const diensten = db.prepare(`
    SELECT jd.aantal, jd.prijs_per_eenheid, ft.vaste_prijs
    FROM job_diensten jd JOIN filament_types ft ON ft.id = jd.filament_type_id
    WHERE jd.job_id = ?
  `).all(req.params.jobId);
  // Zelfde marge/vaste-prijs-splitsing als offertes (offertes_v2.js): een
  // dienst met "vaste prijs, geen marge, incl. BTW" (bv. verzendkosten) krijgt
  // GEEN marge en wordt als reeds-incl.-BTW eindprijs bijgeteld ná de marge —
  // in plaats van mee te tellen in het marge-gebaseerde subtotaal.
  const diensten_kost_marge = diensten.filter(d => !d.vaste_prijs).reduce((sum, d) => sum + d.aantal * d.prijs_per_eenheid, 0);
  const diensten_kost_vast = diensten.filter(d => d.vaste_prijs).reduce((sum, d) => sum + d.aantal * d.prijs_per_eenheid, 0);
  const diensten_kost = diensten_kost_marge + diensten_kost_vast;

  const energie_kost = parseFloat(kwh_verbruikt) * kwh_prijs;
  const machine_kost = uren * machineKostPerUur;
  const bmcu_slijtage = (is_multicolor && job.heeft_bmcu) ? bmcu_per_job : 0;

  // Voorbereiding/nabewerking — waarden komen uit de modal (incl. eventuele extra)
  const totale_voorb_min = parseFloat(voorbereiding_min) || 0;
  const arbeid_voorbereiding = (totale_voorb_min / 60) * arbeid_per_uur;
  const arbeid_nabewerking = (parseFloat(nabewerking_min) || 0) / 60 * arbeid_per_uur;
  const arbeid_ontwerp = (parseFloat(ontwerp_min) / 60) * parseFloat(ontwerp_tarief);
  const arbeid_nabewerking_extra = (parseFloat(nabewerking_extra_min) / 60) * parseFloat(nabewerking_extra_tarief);
  const arbeid_totaal = arbeid_voorbereiding + arbeid_nabewerking + arbeid_ontwerp + arbeid_nabewerking_extra;

  const extra_totaal = (parseFloat(extra_per_stuk) * parseInt(aantal)) + parseFloat(extra_eenmalig);
  const subtotaal = materiaal_kost + energie_kost + machine_kost + bmcu_slijtage + arbeid_totaal + extra_totaal + diensten_kost_marge;
  const marge_pct = uren >= marge_grens_uur ? marge_groot_pct : marge_klein_pct;
  // verkoopprijs_basis = alles waar marge op wordt toegepast (excl. de
  // vast-geprijsde diensten — bv. verzendkosten — die krijgen bewust GEEN
  // marge en worden 1-op-1 als reeds-incl.-BTW eindprijs bijgeteld. Zelfde
  // principe als artikelen_vast_kost bij offertes (offertes_v2.js).
  const verkoopprijs_basis = subtotaal * (1 + marge_pct / 100);
  const verkoopprijs = verkoopprijs_basis + diensten_kost_vast;

  const ro = v => Math.round(v * 1000) / 1000;
  const kosten = {
    job_id: parseInt(req.params.jobId),
    materiaal_kost: ro(materiaal_kost), filament_kost: ro(filament_kost), artikel_kost: ro(artikel_kost), diensten_kost: ro(diensten_kost), energie_kost: ro(energie_kost),
    machine_kost: ro(machine_kost), bmcu_slijtage: ro(bmcu_slijtage),
    arbeid_kost: ro(arbeid_totaal), arbeid_voorbereiding: ro(arbeid_voorbereiding),
    arbeid_nabewerking: ro(arbeid_nabewerking), arbeid_ontwerp: ro(arbeid_ontwerp),
    extra_totaal: ro(extra_totaal), faalfactor_pct, winstmarge_pct: marge_pct,
    totaal_kost: ro(subtotaal), verkoopprijs_basis: Math.round(verkoopprijs_basis * 100) / 100,
    vast_prijs_totaal: ro(diensten_kost_vast), verkoopprijs: Math.round(verkoopprijs * 100) / 100,
    kwh_verbruikt: parseFloat(kwh_verbruikt), aantal: parseInt(aantal) || 1,
    extra_per_stuk: parseFloat(extra_per_stuk) || 0, extra_eenmalig: parseFloat(extra_eenmalig) || 0,
    extra_omschrijving, voorbereiding_min: totale_voorb_min, nabewerking_min: parseFloat(nabewerking_min) || 0,
    ontwerp_min: parseFloat(ontwerp_min) || 0, ontwerp_tarief: parseFloat(ontwerp_tarief) || 15,
    nabewerking_extra_min: parseFloat(nabewerking_extra_min) || 0, nabewerking_extra_tarief: parseFloat(nabewerking_extra_tarief) || 15,
    opmerking, printer_naam: job.printer_naam, job_naam: job.naam,
  };

  db.prepare(`
    INSERT INTO job_kosten
      (job_id,materiaal_kost,energie_kost,machine_kost,arbeid_kost,bmcu_slijtage,
       faalfactor_pct,winstmarge_pct,totaal_kost,verkoopprijs,kwh_verbruikt,
       aantal,extra_per_stuk,extra_eenmalig,extra_omschrijving,
       voorbereiding_min,nabewerking_min,ontwerp_min,ontwerp_tarief,
       nabewerking_extra_min,nabewerking_extra_tarief,diensten_kost,vast_prijs_totaal,berekend_op)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      materiaal_kost=excluded.materiaal_kost,energie_kost=excluded.energie_kost,
      machine_kost=excluded.machine_kost,arbeid_kost=excluded.arbeid_kost,
      bmcu_slijtage=excluded.bmcu_slijtage,faalfactor_pct=excluded.faalfactor_pct,
      winstmarge_pct=excluded.winstmarge_pct,totaal_kost=excluded.totaal_kost,
      verkoopprijs=excluded.verkoopprijs,kwh_verbruikt=excluded.kwh_verbruikt,
      aantal=excluded.aantal,extra_per_stuk=excluded.extra_per_stuk,
      extra_eenmalig=excluded.extra_eenmalig,extra_omschrijving=excluded.extra_omschrijving,
      voorbereiding_min=excluded.voorbereiding_min,nabewerking_min=excluded.nabewerking_min,
      ontwerp_min=excluded.ontwerp_min,ontwerp_tarief=excluded.ontwerp_tarief,
      nabewerking_extra_min=excluded.nabewerking_extra_min,nabewerking_extra_tarief=excluded.nabewerking_extra_tarief,
      diensten_kost=excluded.diensten_kost,vast_prijs_totaal=excluded.vast_prijs_totaal,
      berekend_op=datetime('now')
  `).run(kosten.job_id, kosten.materiaal_kost, kosten.energie_kost, kosten.machine_kost,
         kosten.arbeid_kost, kosten.bmcu_slijtage, kosten.faalfactor_pct, kosten.winstmarge_pct,
         kosten.totaal_kost, kosten.verkoopprijs, kosten.kwh_verbruikt,
         kosten.aantal, kosten.extra_per_stuk, kosten.extra_eenmalig, kosten.extra_omschrijving,
         kosten.voorbereiding_min, kosten.nabewerking_min, kosten.ontwerp_min, kosten.ontwerp_tarief,
         kosten.nabewerking_extra_min, kosten.nabewerking_extra_tarief, kosten.diensten_kost, kosten.vast_prijs_totaal);

  if (opmerking) db.prepare('UPDATE jobs SET notities = ? WHERE id = ?').run(opmerking, req.params.jobId);

  res.json(kosten);
});

r.get('/job/:jobId', (req, res) => {
  const k = getDb().prepare('SELECT * FROM job_kosten WHERE job_id = ?').get(req.params.jobId);
  if (!k) return res.status(404).json({ error: 'Geen kostprijsberekening' });
  res.json(k);
});

export default r;
