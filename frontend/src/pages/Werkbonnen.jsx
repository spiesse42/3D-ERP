import { useState, useEffect } from 'react';
import { api, BASE } from '../lib/api.js';
import WerkbonModal from '../components/WerkbonModal.jsx';

const WERKBON_STATUSSEN = ['in te plannen', 'gepland', 'bezig', 'voltooid', 'gecontroleerd', 'gefactureerd', 'betaald', 'gefaald', 'geannuleerd'];

// Zelfde labels als REGEL_TYPE_LABELS in backend/routes/werkbonnen.js —
// bewust een eigen frontend-kopie, zelfde conventie als elders in de app.
const REGEL_TYPE_LABELS = {
  ontwerp: 'Ontwerp',
  aanpassing: 'Aanpassing',
  printen: 'Printen',
  extra: 'Extra',
  artikel: 'Artikel',
};

// Regeltypes die een telbaar aantal fysieke stuks voorstellen — zelfde
// conventie/naam als LEVERBARE_TYPES in backend/routes/werkbonnen.js en
// pakbonnen.js. Enkel deze regeltypes kunnen een printopdracht koppelen/
// aanmaken en tonen een "X van de Y gepland"-voortgang.
const LEVERBARE_TYPES = ['printen', 'artikel'];

// Statuswaarden kunnen spaties bevatten (bv. "in te plannen") — CSS-classnamen
// mogen geen spaties bevatten, dus voor de badge-klasse zetten we die om naar
// koppeltekens. De zichtbare tekst blijft ongewijzigd. Eigen kopie, zelfde
// als in Jobs.jsx (Printopdrachten-tabel heeft 'm ook nodig).
function statusKlasse(status) {
  return (status || '').replace(/\s+/g, '-');
}

// Korte inhoudspreview van een werkbon (voor de rij vóór het uitklappen) —
// gebaseerd op de object-namen van de regels.
function werkbonOmschrijving(w) {
  let regels = [];
  try { regels = JSON.parse(w.regels_json || '[]'); } catch { regels = []; }
  const namen = regels.map(r => r.object_naam).filter(Boolean);
  if (!namen.length) return <span style={{ color: 'var(--muted)' }}>—</span>;
  return namen.length > 2 ? `${namen.slice(0, 2).join(', ')} +${namen.length - 2}` : namen.join(', ');
}

// Hoeveel van de printen-regels op deze werkbon al een gekoppelde
// printopdracht hebben — gebaseerd op de al-geladen jobs-lijst (geen aparte
// fetch nodig). Regels van een ander type ("geen printopdracht nodig") tellen
// niet mee.
function KoppelBadge({ werkbon, jobs }) {
  let regels = [];
  try { regels = JSON.parse(werkbon.regels_json || '[]'); } catch { regels = []; }
  const printenCount = regels.filter(r => r.type === 'printen').length;
  if (printenCount === 0) {
    return <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)' }}>geen printopdracht nodig</span>;
  }
  const gekoppeldeIdx = new Set(
    jobs.filter(j => j.werkbon_id === werkbon.id && j.werkbon_regel_index != null).map(j => j.werkbon_regel_index)
  );
  let gekoppeld = 0;
  regels.forEach((r, i) => { if (r.type === 'printen' && gekoppeldeIdx.has(i)) gekoppeld++; });
  const volledig = gekoppeld === printenCount;
  return (
    <span className="badge" style={{ background: volledig ? '#1e3a2a' : '#3a2a12', color: volledig ? '#34d399' : '#fbbf24' }}>
      {gekoppeld} / {printenCount} gekoppeld
    </span>
  );
}

// Werkbonnen — sinds de "opruimsessie" een volwaardige, eigenstandige
// navigatiepagina (was voorheen de "Werkbons"-tab op Jobs.jsx). Omdat er
// geen ouder-tabblad meer is dat printers/klanten/filamentTypes/allRollen/
// tarieven/jobs aanlevert via props, laadt deze pagina die zelf — zelfde
// aanpak als Jobs.jsx dat voorheen deed voor zijn eigen tab-inhoud.
export default function Werkbonnen() {
  const [jobs,          setJobs]          = useState([]);
  const [printers,      setPrinters]      = useState([]);
  const [klanten,       setKlanten]       = useState([]);
  const [filamentTypes, setFilamentTypes] = useState([]);
  const [allRollen,     setAllRollen]     = useState([]);
  const [tarieven,      setTarieven]      = useState({});

  const [werkbonnen, setWerkbonnen] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [laden, setLaden] = useState(true);
  const [nieuweWerkbonModal, setNieuweWerkbonModal] = useState(false);
  // Bewerk-modus voor een STANDALONE werkbon (offerte_id = null) — draagt de
  // volledige detail-payload van GET /werkbonnen/:id (zie WerkbonModal's
  // `werkbon`-prop). Voor een offerte-afgeleide werkbon bestaat deze knop
  // bewust niet (bevroren offerteprijs, zie PUT /werkbonnen/:id backend).
  const [bewerkWerkbon, setBewerkWerkbon] = useState(null);

  // Inline "+ Printopdracht"-formulier per regel (LEVERBARE_TYPES) — zelfde
  // open/dicht-klap-patroon als PakbonSectie's inline-formulieren hieronder.
  // Key = "werkbonId:regelIndex", zodat er op elk moment maar 1 form open
  // staat, ongeacht welke werkbon/regel.
  const [printFormKey, setPrintFormKey] = useState(null);
  const [printForm, setPrintForm] = useState({});

  const loadJobs = () => api.get('/jobs').then(setJobs).catch(e => alert('Kon jobs niet laden: ' + e.message));
  const loadList = () => api.get('/werkbonnen').then(setWerkbonnen).catch(e => alert('Kon werkbons niet laden: ' + e.message));
  const loadDetail = (id) => api.get(`/werkbonnen/${id}`).then(d => setDetails(prev => ({ ...prev, [id]: d }))).catch(e => alert(e.message));
  const reloadJobs = () => loadJobs();

  useEffect(() => {
    loadList().finally(() => setLaden(false));
    loadJobs();
    api.get('/printers').then(setPrinters).catch(e => alert('Kon printers niet laden: ' + e.message));
    api.get('/klanten').then(setKlanten).catch(e => alert('Kon klanten niet laden: ' + e.message));
    api.get('/filament/types').then(setFilamentTypes).catch(e => alert('Kon filamenttypes niet laden: ' + e.message));
    api.get('/filament/rollen').then(setAllRollen).catch(e => alert('Kon filamentrollen niet laden: ' + e.message));
    api.get('/tarieven').then(rows => setTarieven(Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]))))
      .catch(e => alert('Kon tarieven niet laden: ' + e.message));
  }, []);

  function togglePrintForm(werkbonId, idx) {
    const key = `${werkbonId}:${idx}`;
    if (printFormKey === key) { setPrintFormKey(null); return; }
    setPrintFormKey(key);
    setPrintForm({ aantal: 1, printer_id: '', geschatte_tijd_u: '', geschatte_tijd_min: '', geschat_gewicht_g: '', uitgebreid: false });
  }

  async function opslaanPrintopdracht(werkbonId, idx, regel) {
    const aantal = parseInt(printForm.aantal);
    if (!Number.isFinite(aantal) || aantal <= 0) { alert('Aantal moet een geheel getal groter dan 0 zijn'); return; }
    // Een 'artikel'-regel heeft geen eigen printer/tijd/gewicht-velden (enkel
    // geprijsd, geen productiedetails) — daar is printer_id verplicht.
    if (regel.type === 'artikel' && !printForm.printer_id) { alert('Kies een printer voor deze printopdracht'); return; }
    const payload = { aantal };
    if (printForm.printer_id) payload.printer_id = parseInt(printForm.printer_id);
    if (printForm.geschatte_tijd_u !== '' && printForm.geschatte_tijd_u != null) payload.geschatte_tijd_u = printForm.geschatte_tijd_u;
    if (printForm.geschatte_tijd_min !== '' && printForm.geschatte_tijd_min != null) payload.geschatte_tijd_min = printForm.geschatte_tijd_min;
    if (printForm.geschat_gewicht_g !== '' && printForm.geschat_gewicht_g != null) payload.geschat_gewicht_g = printForm.geschat_gewicht_g;
    try {
      await api.post(`/werkbonnen/${werkbonId}/regels/${idx}/nieuwe-printopdracht`, payload);
      setPrintFormKey(null);
      loadDetail(werkbonId); loadList(); reloadJobs();
    } catch (e) { alert(e.message); }
  }

  function toggle(w) {
    const willOpen = openId !== w.id;
    setOpenId(willOpen ? w.id : null);
    if (willOpen) loadDetail(w.id);
  }

  async function ontkoppel(werkbonId, idx, jobId) {
    if (!confirm('Deze printopdracht ontkoppelen van de werkbon?')) return;
    try {
      await api.delete(`/werkbonnen/${werkbonId}/regels/${idx}/koppel/${jobId}`);
      loadDetail(werkbonId); loadList(); reloadJobs();
    } catch (e) { alert(e.message); }
  }

  async function koppel(werkbonId, idx, jobId) {
    try {
      await api.post(`/werkbonnen/${werkbonId}/regels/${idx}/koppel`, { job_id: jobId });
      loadDetail(werkbonId); loadList(); reloadJobs();
    } catch (e) { alert(e.message); }
  }

  async function gebruikGemetenData(werkbonId, idx, jobId) {
    try {
      await api.post(`/werkbonnen/${werkbonId}/regels/${idx}/gebruik-gemeten-data`, { job_id: jobId });
      loadDetail(werkbonId); loadList();
    } catch (e) { alert(e.message); }
  }

  async function zetStatus(werkbonId, status) {
    try {
      await api.patch(`/werkbonnen/${werkbonId}/status`, { status });
      loadDetail(werkbonId); loadList();
    } catch (e) { alert(e.message); }
  }

  async function zetBetaald(werkbonId, betaald) {
    try {
      await api.patch(`/werkbonnen/${werkbonId}/betaald`, { betaald });
      loadDetail(werkbonId); loadList();
    } catch (e) { alert(e.message); }
  }

  async function stuurMail(werkbonId, to) {
    try {
      await api.post(`/werkbonnen/${werkbonId}/email`, { to });
      alert('Werkbon verstuurd naar ' + to);
    } catch (e) { alert('Versturen mislukt: ' + e.message); }
  }

  const onbekoppeldeJobs = jobs.filter(j => j.type === 'print' && !j.werkbon_id);

  // Nieuwe standaalone werkbon aanmaken (geen offerte nodig) — na opslaan de
  // lijst herladen en de nieuwe werkbon meteen uitklappen, zodat je er direct
  // in verder kan (bv. een eerste printopdracht koppelen).
  function nieuweWerkbonAangemaakt(r) {
    setNieuweWerkbonModal(false);
    loadList();
    if (r?.id) { setOpenId(r.id); loadDetail(r.id); }
  }

  // Standalone werkbon opgeslagen via de "✏ Bewerken"-knop — id vastnemen
  // vóór setBewerkWerkbon(null), dat vult bewerkWerkbon anders al met null.
  function werkbonBewerkt() {
    const id = bewerkWerkbon?.id;
    setBewerkWerkbon(null);
    if (id) { loadDetail(id); loadList(); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Werkbons</h1>
        <button className="btn primary" style={{ fontSize: 12 }} onClick={() => setNieuweWerkbonModal(true)}>+ Nieuwe werkbon</button>
      </div>

      {nieuweWerkbonModal && (
        <WerkbonModal
          klanten={klanten} printers={printers} filamentTypes={filamentTypes}
          allRollen={allRollen} tarieven={tarieven}
          onKlantToegevoegd={() => {}}
          onSaved={nieuweWerkbonAangemaakt}
          onClose={() => setNieuweWerkbonModal(false)}
        />
      )}

      {bewerkWerkbon && (
        <WerkbonModal
          werkbon={bewerkWerkbon}
          klanten={klanten} printers={printers} filamentTypes={filamentTypes}
          allRollen={allRollen} tarieven={tarieven}
          onKlantToegevoegd={() => {}}
          onSaved={werkbonBewerkt}
          onClose={() => setBewerkWerkbon(null)}
        />
      )}

      {laden ? <div className="empty">Laden...</div> : !werkbonnen.length ? <div className="empty">Geen werkbons gevonden</div> : (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 20 }}></th>
            <th>Werkbon</th>
            <th>Klant</th>
            <th>Status</th>
            <th>Prijs</th>
            <th>Betaald</th>
            <th>Printopdrachten</th>
          </tr>
        </thead>
        <tbody>
          {werkbonnen.flatMap(w => {
            const open = openId === w.id;
            const detail = details[w.id];
            const rows = [];
            rows.push(
                <tr key={w.id} style={{ cursor: 'pointer', background: open ? 'var(--bg3)' : undefined }} onClick={() => toggle(w)}>
                  <td style={{ color: 'var(--muted)' }}>{open ? '▾' : '▸'}</td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--accent)' }}>{w.volgnummer}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{werkbonOmschrijving(w)}</div>
                  </td>
                  <td>{w.klant_voornaam ? `${w.klant_voornaam} ${w.klant_naam}` : w.klant_naam}</td>
                  <td><span className={`badge ${statusKlasse(w.status)}`}>{w.status}</span></td>
                  <td>€{(w.totaal ?? 0).toFixed(2)}</td>
                  <td>{w.betaald
                    ? <span style={{ color: 'var(--accent2)' }}>✓{w.betaald_op ? ' ' + w.betaald_op.split('T')[0] : ''}</span>
                    : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td><KoppelBadge werkbon={w} jobs={jobs} /></td>
                </tr>
            );
            if (open) {
              rows.push(
                <tr key={`${w.id}-detail`}>
                    <td colSpan={7} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
                      {!detail ? <div style={{ color: 'var(--muted)' }}>Laden...</div> : (
                        <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>
                              Regels op deze werkbon
                            </div>
                            {detail.regels.map((regel, idx) => (
                              <div key={idx} className="card" style={{ marginBottom: 8, padding: '0.6rem 0.75rem' }}>
                                <div>
                                  <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--muted)', marginRight: 6 }}>
                                    {REGEL_TYPE_LABELS[regel.type] || regel.type}
                                  </span>
                                  <span style={{ fontWeight: 500 }}>{regel.object_naam || REGEL_TYPE_LABELS[regel.type]}</span>
                                  {LEVERBARE_TYPES.includes(regel.type) && (
                                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                                      {regel.aantal_gepland ?? 0} van de {regel.aantal ?? 1} gepland
                                    </span>
                                  )}
                                </div>
                                {!LEVERBARE_TYPES.includes(regel.type) ? (
                                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                                    Geen printopdracht van toepassing op dit regeltype.
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                                    {(regel.gekoppelde_jobs || []).length > 0 ? regel.gekoppelde_jobs.map(job => (
                                      <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                        <span className={`badge ${statusKlasse(job.status)}`}>{job.status}</span>
                                        <span style={{ flex: 1, minWidth: 120 }}>
                                          {job.naam}{job.printer_naam ? ` · ${job.printer_naam}` : ''}
                                          {job.werkbon_regel_aantal != null ? ` · ${job.werkbon_regel_aantal}×` : ''}
                                        </span>
                                        {job.verkoopprijs != null && (
                                          <button className="btn" style={{ fontSize: 10, padding: '3px 7px' }}
                                            onClick={() => gebruikGemetenData(w.id, idx, job.id)}>
                                            Gebruik gemeten data (€{job.verkoopprijs.toFixed(2)})
                                          </button>
                                        )}
                                        <button className="btn danger" style={{ fontSize: 10, padding: '3px 7px' }}
                                          onClick={() => ontkoppel(w.id, idx, job.id)}>✕ Ontkoppel</button>
                                      </div>
                                    )) : (
                                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Nog geen printopdracht gekoppeld.</div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {onbekoppeldeJobs.length > 0 && (
                                        <select style={{ fontSize: 11, padding: '4px 6px', width: 'auto' }} value=""
                                          onChange={e => { if (e.target.value) koppel(w.id, idx, parseInt(e.target.value)); }}>
                                          <option value="">Koppel bestaande printopdracht…</option>
                                          {onbekoppeldeJobs.map(j => (
                                            <option key={j.id} value={j.id}>{j.naam} · {j.printer_naam} · {j.status}</option>
                                          ))}
                                        </select>
                                      )}
                                      <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
                                        onClick={() => togglePrintForm(w.id, idx)}>+ Printopdracht</button>
                                    </div>

                                    {/* Inline "+ Printopdracht"-formulier — zelfde open/dicht-klap-stijl
                                        als PakbonSectie's inline-formulieren hieronder. Voor 'printen'
                                        blijven printer/tijd/gewicht standaard dichtgeklapt (de regel zelf
                                        heeft al defaults); voor 'artikel' is een printer verplicht (de
                                        regel heeft er zelf geen), dus die select staat meteen open. */}
                                    {printFormKey === `${w.id}:${idx}` && (
                                      <div style={{ marginTop: 8, padding: '0.6rem', background: 'var(--bg3)', borderRadius: 6 }}>
                                        <div className="form-row" style={{ marginBottom: 6 }}>
                                          <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label style={{ fontSize: 11 }}>Aantal (van deze regel)</label>
                                            <input type="number" min="1" step="1" value={printForm.aantal ?? 1}
                                              onChange={e => setPrintForm(f => ({ ...f, aantal: e.target.value }))}
                                              style={{ fontSize: 12 }} />
                                          </div>
                                          {regel.type === 'artikel' && (
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                              <label style={{ fontSize: 11 }}>Printer *</label>
                                              <select value={printForm.printer_id || ''}
                                                onChange={e => setPrintForm(f => ({ ...f, printer_id: e.target.value }))}
                                                style={{ fontSize: 12 }}>
                                                <option value="">— selecteer —</option>
                                                {printers.filter(p => p.actief).map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                                              </select>
                                            </div>
                                          )}
                                        </div>
                                        {regel.type === 'printen' && (
                                          <>
                                            {!printForm.uitgebreid ? (
                                              <button type="button" className="btn" style={{ fontSize: 10, padding: '3px 7px', marginBottom: 6 }}
                                                onClick={() => setPrintForm(f => ({ ...f, uitgebreid: true }))}>
                                                Printer/tijd/gewicht overschrijven (optioneel)…
                                              </button>
                                            ) : (
                                              <div style={{ marginBottom: 6 }}>
                                                <div className="form-row" style={{ marginBottom: 6 }}>
                                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label style={{ fontSize: 11 }}>Printer (leeg = van regel)</label>
                                                    <select value={printForm.printer_id || ''}
                                                      onChange={e => setPrintForm(f => ({ ...f, printer_id: e.target.value }))}
                                                      style={{ fontSize: 12 }}>
                                                      <option value="">— van regel —</option>
                                                      {printers.filter(p => p.actief).map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                                                    </select>
                                                  </div>
                                                </div>
                                                <div className="form-row" style={{ marginBottom: 0 }}>
                                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label style={{ fontSize: 11 }}>Tijd — uren (per stuk)</label>
                                                    <input type="number" min="0" value={printForm.geschatte_tijd_u ?? ''}
                                                      onChange={e => setPrintForm(f => ({ ...f, geschatte_tijd_u: e.target.value }))}
                                                      placeholder="van regel" style={{ fontSize: 12 }} />
                                                  </div>
                                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label style={{ fontSize: 11 }}>Tijd — minuten (per stuk)</label>
                                                    <input type="number" min="0" max="59" value={printForm.geschatte_tijd_min ?? ''}
                                                      onChange={e => setPrintForm(f => ({ ...f, geschatte_tijd_min: e.target.value }))}
                                                      placeholder="van regel" style={{ fontSize: 12 }} />
                                                  </div>
                                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label style={{ fontSize: 11 }}>Gewicht g (per stuk)</label>
                                                    <input type="number" step="0.1" value={printForm.geschat_gewicht_g ?? ''}
                                                      onChange={e => setPrintForm(f => ({ ...f, geschat_gewicht_g: e.target.value }))}
                                                      placeholder="van regel" style={{ fontSize: 12 }} />
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <button className="btn primary" style={{ fontSize: 11, padding: '4px 8px' }}
                                            onClick={() => opslaanPrintopdracht(w.id, idx, regel)}>Opslaan</button>
                                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
                                            onClick={() => setPrintFormKey(null)}>Annuleer</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
                                Financieel
                              </div>
                              {/* Enkel voor een standalone werkbon (geen offerte_id) — een
                                  offerte-afgeleide werkbon mag nooit stilzwijgend afwijken van
                                  de goedgekeurde offerteprijs, zie PUT /werkbonnen/:id backend. */}
                              {!w.offerte_id && (
                                <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }}
                                  onClick={() => setBewerkWerkbon(detail)}>✏ Bewerken</button>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Vrijgesteld van BTW — art. 56bis</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, padding: '6px 0', borderTop: '1px solid var(--border)', marginBottom: 12 }}>
                              <span>Totaal</span><span style={{ color: 'var(--accent2)' }}>€{(detail.totaal ?? 0).toFixed(2)}</span>
                            </div>

                            <div className="form-group">
                              <label>Status</label>
                              <select value={detail.status} onChange={e => zetStatus(w.id, e.target.value)}>
                                {WERKBON_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <input type="checkbox" checked={!!detail.betaald}
                                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent2)' }}
                                onChange={e => zetBetaald(w.id, e.target.checked)} />
                              <span>Betaald</span>
                              {detail.betaald_op && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{detail.betaald_op.split('T')[0]}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <a className="btn" href={`${BASE}/werkbonnen/${w.id}/pdf`} download>↓ PDF</a>
                              <button className="btn" onClick={() => {
                                const to = prompt('E-mailadres', detail.email || '');
                                if (to) stuurMail(w.id, to);
                              }}>✉ Mail</button>
                            </div>
                          </div>
                        </div>
                        <PakbonSectie werkbonId={w.id} klantEmail={detail.email} />
                        </>
                      )}
                    </td>
                </tr>
              );
            }
            return rows;
          })}
        </tbody>
      </table>
    </div>
      )}
    </div>
  );
}

function PakbonSectie({ werkbonId, klantEmail }) {
  const [data, setData] = useState(null); // { pakbonnen, voortgang }
  const [laden, setLaden] = useState(true);
  const [bewerkId, setBewerkId] = useState(null); // null = gesloten, 'nieuw', of pakbon.id
  const [draftRegels, setDraftRegels] = useState([]);
  const [draftNotities, setDraftNotities] = useState('');
  const [opslaan, setOpslaan] = useState(false);

  const load = () => api.get(`/pakbonnen/werkbon/${werkbonId}`)
    .then(d => setData(d))
    .catch(e => alert('Kon pakbonnen niet laden: ' + e.message))
    .finally(() => setLaden(false));

  useEffect(() => { load(); }, [werkbonId]);

  function startNieuw() {
    const voorstel = (data?.voortgang || [])
      .filter(v => v.aantal_resterend > 0)
      .map(v => ({ werkbon_regel_index: v.werkbon_regel_index, object_naam: v.object_naam, aantal: v.aantal_resterend }));
    setDraftRegels(voorstel.length ? voorstel : [{ werkbon_regel_index: null, object_naam: '', aantal: 1 }]);
    setDraftNotities('');
    setBewerkId('nieuw');
  }

  function startBewerk(pb) {
    setDraftRegels(pb.regels.map(r => ({ ...r })));
    setDraftNotities(pb.notities || '');
    setBewerkId(pb.id);
  }

  function annuleer() { setBewerkId(null); setDraftRegels([]); }

  function regelWijzig(i, veld, waarde) {
    setDraftRegels(prev => prev.map((r, idx) => idx === i ? { ...r, [veld]: waarde } : r));
  }
  function regelVerwijder(i) { setDraftRegels(prev => prev.filter((_, idx) => idx !== i)); }
  function regelToevoegen() { setDraftRegels(prev => [...prev, { werkbon_regel_index: null, object_naam: '', aantal: 1 }]); }

  async function opslaanKlik() {
    if (!draftRegels.length) { alert('Minstens 1 regel nodig'); return; }
    for (const r of draftRegels) {
      if (!r.object_naam || !String(r.object_naam).trim()) { alert('Elke regel heeft een omschrijving nodig'); return; }
      const aantal = parseInt(r.aantal);
      if (!Number.isFinite(aantal) || aantal <= 0) { alert(`Aantal moet een geheel getal groter dan 0 zijn (regel "${r.object_naam}")`); return; }
    }
    setOpslaan(true);
    try {
      const payload = {
        regels: draftRegels.map(r => ({
          werkbon_regel_index: r.werkbon_regel_index === '' ? null : r.werkbon_regel_index,
          object_naam: String(r.object_naam).trim(),
          aantal: parseInt(r.aantal),
        })),
        notities: draftNotities || null,
      };
      if (bewerkId === 'nieuw') await api.post('/pakbonnen', { werkbon_id: werkbonId, ...payload });
      else await api.put(`/pakbonnen/${bewerkId}`, payload);
      setBewerkId(null);
      setDraftRegels([]);
      await load();
    } catch (e) { alert(e.message); }
    setOpslaan(false);
  }

  async function verwijderPakbon(id) {
    if (!confirm('Deze pakbon verwijderen? De werkbon en de gekoppelde printopdrachten blijven ongewijzigd — enkel deze leveringsbon verdwijnt.')) return;
    try { await api.delete(`/pakbonnen/${id}`); load(); } catch (e) { alert(e.message); }
  }

  async function mailPakbon(id) {
    const to = prompt('E-mailadres', klantEmail || '');
    if (!to) return;
    try { await api.post(`/pakbonnen/${id}/email`, { to }); alert('Pakbon verstuurd naar ' + to); }
    catch (e) { alert('Versturen mislukt: ' + e.message); }
  }

  if (laden) return null;
  const leverbareRegels = data?.voortgang || [];

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>
          Pakbonnen (leveringen)
        </div>
        {bewerkId === null && (
          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={startNieuw}>+ Nieuwe pakbon</button>
        )}
      </div>

      {leverbareRegels.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {leverbareRegels.map(v => (
            <span key={v.werkbon_regel_index}>
              {v.object_naam}: <strong style={{ color: v.aantal_resterend > 0 ? 'var(--accent)' : 'var(--accent2)' }}>
                {v.aantal_geleverd}/{v.aantal_totaal} geleverd
              </strong>
            </span>
          ))}
        </div>
      )}

      {data?.pakbonnen?.length > 0 && data.pakbonnen.map(pb => (
        <div key={pb.id} className="card" style={{ marginBottom: 6, padding: '0.5rem 0.75rem', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>{pb.volgnummer}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                {(pb.aangemaakt_op || '').split(' ')[0]} · {pb.regels.length} regel{pb.regels.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ fontSize: 10, padding: '3px 7px' }} onClick={() => startBewerk(pb)}>Bewerk</button>
              <a className="btn" style={{ fontSize: 10, padding: '3px 7px' }} href={`${BASE}/pakbonnen/${pb.id}/pdf`} download>↓ PDF</a>
              <button className="btn" style={{ fontSize: 10, padding: '3px 7px' }} onClick={() => mailPakbon(pb.id)}>✉ Mail</button>
              <button className="btn danger" style={{ fontSize: 10, padding: '3px 7px' }} onClick={() => verwijderPakbon(pb.id)}>✕</button>
            </div>
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)' }}>
            {pb.regels.map(r => `${r.aantal}× ${r.object_naam}`).join(' · ')}
          </div>
          {pb.notities && <div style={{ marginTop: 4, color: 'var(--muted)', fontStyle: 'italic' }}>{pb.notities}</div>}
        </div>
      ))}

      {!data?.pakbonnen?.length && bewerkId === null && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Nog geen pakbon voor deze werkbon.</div>
      )}

      {bewerkId !== null && (
        <div className="card" style={{ padding: '0.75rem', background: 'var(--bg3)', marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            {bewerkId === 'nieuw' ? 'Nieuwe pakbon' : 'Pakbon bewerken'}
          </div>
          {draftRegels.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" min="1" step="1" value={r.aantal}
                onChange={e => regelWijzig(i, 'aantal', e.target.value)}
                style={{ width: 56, fontSize: 12, padding: '4px 6px' }} />
              <input type="text" value={r.object_naam} placeholder="Omschrijving"
                onChange={e => regelWijzig(i, 'object_naam', e.target.value)}
                style={{ flex: 1, minWidth: 160, fontSize: 12, padding: '4px 6px' }} />
              <select value={r.werkbon_regel_index ?? ''} style={{ fontSize: 11, padding: '4px 6px', width: 'auto' }}
                onChange={e => regelWijzig(i, 'werkbon_regel_index', e.target.value === '' ? null : parseInt(e.target.value))}>
                <option value="">Los item (geen koppeling)</option>
                {leverbareRegels.map(v => (
                  <option key={v.werkbon_regel_index} value={v.werkbon_regel_index}>
                    Regel: {v.object_naam} (nog {v.aantal_resterend} te leveren)
                  </option>
                ))}
              </select>
              <button className="btn danger" style={{ fontSize: 10, padding: '3px 7px' }} onClick={() => regelVerwijder(i)}>✕</button>
            </div>
          ))}
          <button className="btn" style={{ fontSize: 11, padding: '4px 8px', marginBottom: 10 }} onClick={regelToevoegen}>+ Regel toevoegen</button>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11 }}>Notities (optioneel)</label>
            <input type="text" value={draftNotities} onChange={e => setDraftNotities(e.target.value)}
              placeholder="bv. Deellevering — rest volgt later" style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" style={{ fontSize: 11, padding: '5px 10px' }} disabled={opslaan} onClick={opslaanKlik}>
              {opslaan ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button className="btn" style={{ fontSize: 11, padding: '5px 10px' }} onClick={annuleer}>Annuleer</button>
          </div>
        </div>
      )}
    </div>
  );
}
