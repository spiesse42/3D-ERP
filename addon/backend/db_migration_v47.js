// Migratie v47 — globaal "machinekost per uur"-tarief zichtbaar/instelbaar
// maken. `regelmotor.js`, `offertes_v2.js` en `regelEditor.jsx` gebruiken al
// langer `t.machine_per_uur` (via getalOfDefault, stille standaardwaarde
// €0,13) als terugval wanneer een printer geen eigen `machine_kost_per_uur`
// heeft — maar er stond nooit een rij voor in de `tarieven`-tabel, dus was
// dit tarief nergens via de app zelf te bekijken of aan te passen. Zie
// ux-verbeterlijst 2026-09-10, #5.
// Zelfde idempotente patroon als v2 (INSERT OR IGNORE, bestaande waarde
// nooit overschrijven).
export function migrateDbV47(db) {
  try {
    db.prepare('INSERT OR IGNORE INTO tarieven (sleutel,waarde,eenheid,label) VALUES (?,?,?,?)')
      .run('machine_per_uur', 0.13, 'EUR/u', 'Machinekost (globaal, terugval)');
    console.log('Migratie v47: machine_per_uur toegevoegd aan tarieven');
  } catch (e) { console.error('Migratie v47 fout:', e.message); }
}
