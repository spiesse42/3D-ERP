import { useState, useEffect } from 'react';
import { usePrinterData } from '../lib/usePrinterData.js';
import { useSearchParams } from 'react-router-dom';
import { api, BASE } from '../lib/api.js';
import KostenModal from '../components/KostenModal.jsx';
import PrinterCard from '../components/PrinterCard.jsx';

// Sinds de werkbon/printopdracht-ontkoppeling (sessienotities deel 11) is
// jobs.status uitsluitend nog een PRODUCTIEstatus — de facturatie-lifecycle
// (gecontroleerd/gefactureerd/betaald) leeft voortaan op de werkbon.
const PRODUCTIE_STATUSSEN = ['in te plannen', 'gepland', 'bezig', 'voltooid', 'gefaald', 'geannuleerd'];
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

// Statuswaarden kunnen spaties bevatten (bv. "in te plannen") — CSS-classnamen
// mogen geen spaties bevatten, dus voor de badge-klasse zetten we die om naar
// koppeltekens. De zichtbare tekst blijft ongewijzigd.
function statusKlasse(status) {
  return (status || '').replace(/\s+/g, '-');
}

// Zet een lokaal bestandspad om naar een klikbare file://-link. Werkt enkel als
// het veld het volledige pad bevat (map + bestandsnaam) en de pagina bekeken
// wordt vanaf de computer waar het bestand effectief staat.
function toFileUrl(pad) {
  if (!pad) return null;
  const schoon = pad.trim().replace(/\\/g, '/');
  const metSlash = schoon.startsWith('/') ? schoon : '/' + schoon;
  return 'file://' + metSlash.replace(/ /g, '%20');
}
// Enkel als een "echt" pad-achtig iets (map + bestand), niet een blote bestandsnaam
function isVolledigPad(pad) {
  return !!pad && (pad.includes('/') || pad.includes('\\'));
}

// Uit de bevroren werkbon_regels_json op een job de regel-omschrijving
// halen — voor de "gekoppeld aan"-badge op de Printopdrachten-tabel.
function werkbonRegelLabel(j) {
  if (!j.werkbon_id) return null;
  let regel = null;
  try {
    const regels = JSON.parse(j.werkbon_regels_json || '[]');
    regel = regels[j.werkbon_regel_index];
  } catch { /* regels_json ontbreekt/ongeldig — val terug op enkel het volgnummer */ }
  const naam = regel?.object_naam || `regel ${(j.werkbon_regel_index ?? 0) + 1}`;
  return `${j.werkbon_volgnummer} · ${naam}`;
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

function JobModal({ job, printers, klanten, onClose, onSaved }) {
const [form, setForm] = useState(job ? {
    printer_id: job.printer_id || '', naam: job.naam, status: job.status,
    type: job.type || 'print', dienst_categorie: job.dienst_categorie || '',
    klant_id: job.klant_id || '', is_multicolor: job.is_multicolor,
    aantal_kleuren: job.aantal_kleuren || '', print_uren_geschat: job.print_uren_geschat || '',
    print_uren_werkelijk: job.print_uren_werkelijk || '', stl_bestandsnaam: job.stl_bestandsnaam || '',
    notities: job.notities || '',
  } : { printer_id: printers[0]?.id || '', naam:'', status:'in te plannen', type:'print', dienst_categorie:'', is_multicolor:false, aantal_kleuren:1, print_uren_geschat:'', notities:'' });  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [categorieSuggesties, setCategorieSuggesties] = useState([]);
  useEffect(() => { api.get('/jobs/dienst-categorieen').then(setCategorieSuggesties).catch(() => {}); }, []);
  async function save() {
    if (form.type !== 'dienst' && !form.printer_id) { alert('Selecteer een printer'); return; }
    try {
      if (job?.id) await api.put(`/jobs/${job.id}`, form);
      else await api.post('/jobs', form);
      onSaved();
    } catch(e) { alert(e.message); }
  }
  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Venster sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{job?.id ? 'Job bewerken' : 'Nieuwe job'}{job?.volgnummer ? <span style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)', fontWeight:400, marginLeft:8 }}>{job.volgnummer}</span> : null}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-group"><label>Naam *</label><input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Naam van de print" /></div>
        <div className="form-row">
          <div className="form-group"><label>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="print">🖨 Print</option>
              <option value="dienst">🛠 Dienst (consultancy/ontwerp)</option>
            </select>
          </div>
          <div className="form-group"><label>Klant</label>
            <select value={form.klant_id || ''} onChange={e => set('klant_id', e.target.value || null)}>
              <option value="">— geen klant —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
            </select>
          </div>
        </div>
        {form.type === 'print' ? (
          <div className="form-group"><label>Printer *</label>
            <select value={form.printer_id} onChange={e => set('printer_id', e.target.value)}>
              {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label>Categorie <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>optioneel — bv. Ontwerp op maat, Consultancy...</span></label>
            <input list="dienst-categorieen-lijst" value={form.dienst_categorie} onChange={e => set('dienst_categorie', e.target.value)} placeholder="bv. Ontwerp op maat" />
            <datalist id="dienst-categorieen-lijst">
              {categorieSuggesties.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        )}
        <div className="form-row">
          <div className="form-group"><label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {PRODUCTIE_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Print uren (geschat)</label>
            <input type="number" step="0.1" value={form.print_uren_geschat} onChange={e => set('print_uren_geschat', e.target.value)} placeholder="bv. 3.5" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Print uren (werkelijk)</label>
            <input type="number" step="0.1" value={form.print_uren_werkelijk || ''} onChange={e => set('print_uren_werkelijk', e.target.value)} />
          </div>
          <div className="form-group">
            <label>STL bestandsnaam <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>volledig pad voor klikbare link, bv. C:\Users\...\bestand.stl</span></label>
            <div style={{ display:'flex', gap:6 }}>
              <input style={{ flex:1 }} value={form.stl_bestandsnaam || ''} onChange={e => set('stl_bestandsnaam', e.target.value)} />
              {isVolledigPad(form.stl_bestandsnaam) && (
                <a className="btn" href={toFileUrl(form.stl_bestandsnaam)} title="Bestand openen (werkt enkel vanaf deze computer)">📂</a>
              )}
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Multicolor</label>
            <select value={form.is_multicolor ? '1' : '0'} onChange={e => set('is_multicolor', e.target.value === '1')}>
              <option value="0">Nee</option><option value="1">Ja (BMCU)</option>
            </select>
          </div>
          {form.is_multicolor ? (
            <div className="form-group"><label>Aantal kleuren</label>
              <input type="number" min="2" max="8" value={form.aantal_kleuren || 2} onChange={e => set('aantal_kleuren', parseInt(e.target.value))} />
            </div>
          ) : <div />}
        </div>
        <div className="form-group"><label>Notities</label><textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// Gekoppeld-cel voor een losse printopdracht (Printopdrachten-tabel én
// detailpaneel) — toont ofwel de gekoppelde werkbon-regel met een
// ontkoppelknop, ofwel een select om meteen aan een openstaande werkbon-regel
// te koppelen.
function GekoppeldCel({ job, koppelbareRegels, onKoppel, onOntkoppel }) {
  if (job.werkbon_id) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        <span className="badge werkbon-link">{werkbonRegelLabel(job)}</span>
        <button className="btn danger" style={{ fontSize:10, padding:'3px 7px' }} title="Ontkoppelen"
          onClick={() => onOntkoppel(job)}>✕</button>
      </div>
    );
  }
  if (job.type !== 'print') return <span style={{ color:'var(--muted)', fontSize:11 }}>n.v.t.</span>;
  if (!koppelbareRegels.length) return <span style={{ color:'var(--muted)', fontSize:11 }}>— niet gekoppeld</span>;
  return (
    <select style={{ fontSize:11, padding:'4px 6px', width:'auto' }} value=""
      onChange={e => {
        const [wid, idx] = e.target.value.split(':');
        if (wid) onKoppel(job.id, parseInt(wid), parseInt(idx));
      }}>
      <option value="">— koppelen —</option>
      {koppelbareRegels.map(rg => (
        <option key={`${rg.werkbon_id}:${rg.regel_index}`} value={`${rg.werkbon_id}:${rg.regel_index}`}>
          {rg.werkbon_volgnummer} · {rg.object_naam || `regel ${rg.regel_index + 1}`} ({rg.klant_naam})
        </option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tabblad Werkbons — facturatiedocumenten, los van de printopdrachten.
// Elke rij is uitklapbaar naar de regels + het koppel-widget per
// printen-regel + financieel overzicht + status/betaald/PDF/mail.
// ═══════════════════════════════════════════════════════════════════════
function WerkbonnenTab({ jobs, reloadJobs }) {
  const [werkbonnen, setWerkbonnen] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [laden, setLaden] = useState(true);

  const loadList = () => api.get('/werkbonnen').then(setWerkbonnen).catch(e => alert('Kon werkbons niet laden: ' + e.message));
  const loadDetail = (id) => api.get(`/werkbonnen/${id}`).then(d => setDetails(prev => ({ ...prev, [id]: d }))).catch(e => alert(e.message));

  useEffect(() => { loadList().finally(() => setLaden(false)); }, []);

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

  async function nieuwePrintopdracht(werkbonId, idx) {
    if (!confirm('Nieuwe printopdracht aanmaken vanuit deze regel? Printer/materiaal worden overgenomen van de regel.')) return;
    try {
      await api.post(`/werkbonnen/${werkbonId}/regels/${idx}/nieuwe-printopdracht`);
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

  if (laden) return <div className="empty">Laden...</div>;
  if (!werkbonnen.length) return <div className="empty">Geen werkbons gevonden</div>;

  const onbekoppeldeJobs = jobs.filter(j => j.type === 'print' && !j.werkbon_id);

  return (
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
                                </div>
                                {regel.type !== 'printen' ? (
                                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                                    Geen printopdracht van toepassing op dit regeltype.
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                                    {(regel.gekoppelde_jobs || []).length > 0 ? regel.gekoppelde_jobs.map(job => (
                                      <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                        <span className={`badge ${statusKlasse(job.status)}`}>{job.status}</span>
                                        <span style={{ flex: 1, minWidth: 120 }}>{job.naam}{job.printer_naam ? ` · ${job.printer_naam}` : ''}</span>
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
                                        onClick={() => nieuwePrintopdracht(w.id, idx)}>+ Nieuwe printopdracht</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>
                              Financieel
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
  );
}

// ── Pakbonnen (leveringen) — bij een werkbon-detail ────────────────────
// Een pakbon is GEEN facturatiedocument: enkel aantal + omschrijving, geen
// bedragen (zie backend/routes/pakbonnen.js). Een werkbon kan meerdere
// pakbonnen krijgen (bv. eerst een deellevering, later de rest) — "nog te
// leveren" per regel wordt steeds vers uit de bestaande pakbonnen herberekend,
// nooit een aparte teller die uit sync kan raken. Regels/aantallen zijn hier
// vrij aan te passen, zowel bij het aanmaken als nadien via "Bewerk" — het
// aanmaken/bewerken van een pakbon raakt nooit de werkbon-regels of de
// job-koppeling: wat nog niet geleverd is, blijft gewoon aan de werkbon/jobs
// gekoppeld zoals het was.
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

export default function Jobs() {
  const [jobs,        setJobs]        = useState([]);
  const [printers,    setPrinters]    = useState([]);
  const [klanten,     setKlanten]     = useState([]);
  const [modal,       setModal]       = useState(null);
  const [kostenJob,   setKostenJob]   = useState(null);
  const [filter,      setFilter]      = useState('');
  const [zoekVolgnummer, setZoekVolgnummer] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [tab,          setTab]         = useState('printopdrachten');
  const [koppelbareRegels, setKoppelbareRegels] = useState([]);
  const { printerConfig, printerData, reloadPrinterConfig } = usePrinterData();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight')) : null;

  const loadJobs = () => api.get('/jobs').then(data => {
    setJobs(data);
    setSelectedJob(prev => prev ? data.find(j => j.id === prev.id) || null : null);
  });
  const loadKoppelbaar = () => api.get('/werkbonnen/regels/koppelbaar').then(setKoppelbareRegels).catch(() => {});

  useEffect(() => {
    loadJobs();
    loadKoppelbaar();
    api.get('/printers').then(setPrinters).catch(e => alert('Kon printers niet laden: ' + e.message));
    api.get('/klanten').then(setKlanten).catch(e => alert('Kon klanten niet laden: ' + e.message));
    const interval = setInterval(loadJobs, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const filtered = jobs
    .filter(j => !filter || j.status === filter)
    .filter(j => !zoekVolgnummer || (j.volgnummer || '').toLowerCase().includes(zoekVolgnummer.trim().toLowerCase()));

  async function deleteJob(id) {
    if (!confirm('Job verwijderen?')) return;
    try {
      await api.delete(`/jobs/${id}`);
      loadJobs();
    } catch(e) { alert(e.message); }
  }

  async function koppelJobAanRegel(jobId, werkbonId, idx) {
    try {
      await api.post(`/werkbonnen/${werkbonId}/regels/${idx}/koppel`, { job_id: jobId });
      loadJobs(); loadKoppelbaar();
    } catch (e) { alert(e.message); }
  }

  async function ontkoppelJob(job) {
    if (!confirm('Deze printopdracht ontkoppelen van de werkbon?')) return;
    try {
      await api.delete(`/werkbonnen/${job.werkbon_id}/regels/${job.werkbon_regel_index}/koppel/${job.id}`);
      loadJobs(); loadKoppelbaar();
    } catch (e) { alert(e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Jobs</h1>
        {tab === 'printopdrachten' && (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
              <option value="">Alle statussen</option>
              {PRODUCTIE_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={zoekVolgnummer} onChange={e => setZoekVolgnummer(e.target.value)}
              placeholder="Zoek op volgnummer..." style={{ width:170 }} />
            <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe job</button>
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
        {printerConfig.map(p => (
          <PrinterCard
            key={p.id}
            printerId={p.id}
            naam={p.naam}
            autoJobAanmaken={p.auto_job_aanmaken}
            onConfigChanged={reloadPrinterConfig}
            data={printerData[p.id]}
            klanten={klanten}
            onJobCreated={loadJobs}
            bestaandeJobs={jobs}
            pauseEntity={p.pause_entity}
            resumeEntity={p.resume_entity}
            cancelEntity={p.cancel_entity}
            cameraEntity={p.camera_entity}
          />
        ))}
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:'1rem' }}>
        <button className={`btn${tab === 'printopdrachten' ? ' primary' : ''}`} onClick={() => setTab('printopdrachten')}>Printopdrachten</button>
        <button className={`btn${tab === 'werkbonnen' ? ' primary' : ''}`} onClick={() => setTab('werkbonnen')}>Werkbons</button>
      </div>

      {tab === 'werkbonnen' ? (
        <WerkbonnenTab jobs={jobs} reloadJobs={() => { loadJobs(); loadKoppelbaar(); }} />
      ) : (
      <div style={{ display:'grid', gridTemplateColumns: selectedJob ? '1fr 380px' : '1fr', gap:'1rem', alignItems:'start' }}>
      <div>
      {filtered.length === 0
        ? <div className="empty">Geen jobs gevonden</div>
        : <div className="card" style={{ padding:0 }}>
            <table>
<thead><tr><th>Naam</th><th>Klant</th><th>Printer</th><th>Status</th><th>Uren</th><th>Prijs</th><th>Gekoppeld</th><th>Acties</th></tr></thead>
	<tbody>
                {filtered.map(j => (
                  <tr key={j.id}
                    style={{ background: j.id === highlightId ? 'var(--bg3)' : j.id === selectedJob?.id ? 'var(--bg3)' : undefined, outline: j.id === highlightId ? '2px solid var(--accent)' : j.id === selectedJob?.id ? '2px solid var(--accent2)' : undefined, cursor:'pointer' }}
                    onClick={() => setSelectedJob(prev => prev?.id === j.id ? null : j)}>
                    <td>
                      <div style={{ fontWeight:500 }}>{j.naam}</div>
                      <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:2 }}>
                        {j.volgnummer && <span style={{ fontSize:10, fontFamily:'monospace', color:'var(--muted)' }}>{j.volgnummer}</span>}
                        <span style={{ fontSize:10, color:'var(--muted)' }}>{j.type === 'dienst' ? '🛠 Dienst' : '🖨 Print'}</span>
                      </div>
                      {j.is_multicolor ? <div style={{ fontSize:11, color:'var(--accent)' }}>BMCU · {j.aantal_kleuren} kleuren</div> : null}
                    </td>
                    <td>{j.klant_naam || <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td>{j.type === 'dienst'
                      ? (j.dienst_categorie || <span style={{ color:'var(--muted)' }}>—</span>)
                      : j.printer_naam}</td>
                    <td><span className={`badge ${statusKlasse(j.status)}`}>{j.status}</span></td>
                    <td style={{ color:'var(--muted)' }}>
                      {(() => {
                        const u = j.print_uren_werkelijk ?? j.print_uren_geschat;
                        if (u == null) return '—';
                        const prefix = j.print_uren_werkelijk == null ? '~' : '';
                        const h = Math.floor(u);
                        const m = Math.round((u - h) * 60);
                        return `${prefix}${h}u ${m}m`;
                      })()}
                    </td>
                    <td>{j.verkoopprijs != null
                      ? ['bezig','voltooid'].includes(j.status)
                        ? <div><span style={{ color:'var(--warn)' }}>~€{j.verkoopprijs.toFixed(2)}</span><div style={{ fontSize:10, color:'var(--muted)' }}>geschat</div></div>
                        : <span style={{ color:'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span>
                      : <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <GekoppeldCel job={j} koppelbareRegels={koppelbareRegels} onKoppel={koppelJobAanRegel} onOntkoppel={ontkoppelJob} />
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                <button className="btn" style={{ fontSize:11, padding:'4px 8px' }}
                          onClick={() => setKostenJob({ ...j,
                            printer_naam: j.printer_naam,
                          })}>€ Kost</button>
                        <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => setModal(j)}>✏</button>
                        <button className="btn danger" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => deleteJob(j.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }
      </div>

      {/* Detail paneel */}
      {selectedJob && (
        <div className="card" style={{ position:'sticky', top:0, maxHeight:'90vh', overflowY:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <div style={{ overflow:'hidden' }}>
              <h2 style={{ fontSize:15, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 }}>{selectedJob.naam}</h2>
              {selectedJob.volgnummer && <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--muted)' }}>{selectedJob.volgnummer}</div>}
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button className="btn" style={{ fontSize:11 }} onClick={() => { setModal(selectedJob); }}>✏</button>
              <button className="btn" onClick={() => setSelectedJob(null)}>✕</button>
            </div>
          </div>

          {/* Klant + printer */}
          <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.65rem', marginBottom:'0.75rem', fontSize:13 }}>
            <div style={{ fontWeight:600 }}>{selectedJob.klant_naam ? (selectedJob.klant_voornaam ? `${selectedJob.klant_voornaam} ${selectedJob.klant_naam}` : selectedJob.klant_naam) : <span style={{ color:'var(--muted)' }}>Eigen print</span>}</div>
            <div style={{ color:'var(--muted)', fontSize:12 }}>
              {selectedJob.type === 'dienst'
                ? `🛠 Dienst${selectedJob.dienst_categorie ? ' — ' + selectedJob.dienst_categorie : ''}`
                : `🖨 ${selectedJob.printer_naam}`}
            </div>
            {selectedJob.stl_bestandsnaam && (
              isVolledigPad(selectedJob.stl_bestandsnaam)
                ? <a href={toFileUrl(selectedJob.stl_bestandsnaam)} style={{ color:'var(--accent)', fontSize:12 }} title="Bestand openen (werkt enkel vanaf deze computer)">📂 {selectedJob.stl_bestandsnaam}</a>
                : <div style={{ color:'var(--accent)', fontSize:12 }}>📄 {selectedJob.stl_bestandsnaam}</div>
            )}
          </div>

          {/* Gekoppelde werkbon */}
          <div style={{ marginBottom:'0.75rem' }}>
            <div style={{ color:'var(--muted)', fontSize:10, marginBottom:4 }}>Gekoppelde werkbon</div>
            <GekoppeldCel job={selectedJob} koppelbareRegels={koppelbareRegels} onKoppel={koppelJobAanRegel} onOntkoppel={ontkoppelJob} />
          </div>

          {/* Details grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, fontSize:12, marginBottom:'0.75rem' }}>
            {[
              ['Aangemaakt', selectedJob.aangemaakt_op ? selectedJob.aangemaakt_op.replace('T',' ').substring(0,16) : '—'],
              ['Gestart', selectedJob.gestart_op ? selectedJob.gestart_op.replace('T',' ').substring(0,16) : '—'],
              ['Voltooid', selectedJob.voltooid_op?.split('T')[0] || '—'],
              ['Uren geschat', selectedJob.print_uren_geschat ? `${Math.floor(selectedJob.print_uren_geschat)}u ${Math.round((selectedJob.print_uren_geschat % 1) * 60)}min` : '—'],
              ['Uren werkelijk', selectedJob.print_uren_werkelijk ? `${Math.floor(selectedJob.print_uren_werkelijk)}u ${Math.round((selectedJob.print_uren_werkelijk % 1) * 60)}min` : '—'],
              ['Multicolor', selectedJob.is_multicolor ? `Ja · ${selectedJob.aantal_kleuren} kleuren` : 'Nee'],
            ].map(([l, v]) => (
              <div key={l} style={{ padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ color:'var(--muted)', fontSize:10 }}>{l}</div>
                <div style={{ fontWeight:500 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Kostprijs */}
          {selectedJob.verkoopprijs != null && (
            <div style={{ marginBottom:'0.75rem' }}>
              {[
                ['Materiaal', selectedJob.materiaal_kost],
                ['Energie', selectedJob.energie_kost],
                ['Machine', selectedJob.machine_kost],
                ['Arbeid', selectedJob.arbeid_kost],
              ].filter(([,v]) => v != null).map(([l, v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <span style={{ color:'var(--muted)' }}>{l}</span><span>€{(v || 0).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', fontWeight:700, fontSize:15 }}>
                <span>Verkoopprijs</span><span style={{ color:'var(--accent2)' }}>€{selectedJob.verkoopprijs.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="form-group" style={{ marginBottom:'0.75rem' }}>
            <label style={{ fontSize:11 }}>Status</label>
            <select value={selectedJob.status} onChange={async e => {
              try {
                await api.patch(`/jobs/${selectedJob.id}/status`, { status: e.target.value });
                loadJobs();
              } catch(err) { alert(err.message); }
            }}>
              {PRODUCTIE_STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Notities */}
          {selectedJob.notities && (
            <div style={{ background:'#fffbeb', borderLeft:'3px solid #f59e0b', padding:'7px 10px', borderRadius:4, fontSize:12, color:'#664400', marginBottom:'0.75rem' }}>
              📝 {selectedJob.notities}
            </div>
          )}

          {/* Acties */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <button className="btn" style={{ textAlign:'center' }} onClick={() => {
              setKostenJob({ ...selectedJob, printer_naam: selectedJob.printer_naam });
            }}>💶 Kostprijs berekenen</button>
          </div>
        </div>
      )}
      </div>
      )}

      {modal !== null && (
        <JobModal job={modal?.id ? modal : null} printers={printers} klanten={klanten}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); loadJobs(); }} />
      )}

      {kostenJob && (
        <KostenModal
          job={kostenJob}
          klanten={klanten}
          printerLiveData={printerData[kostenJob.printer_id]}
          onClose={() => setKostenJob(null)}
          onJobUpdated={loadJobs}
        />
      )}
    </div>
  );
}
