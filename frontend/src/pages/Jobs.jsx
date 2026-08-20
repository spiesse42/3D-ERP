import { useState, useEffect } from 'react';
import { usePrinterData } from '../lib/usePrinterData.js';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import KostenModal from '../components/KostenModal.jsx';
import PrinterCard from '../components/PrinterCard.jsx';

const STATUSSEN = ['in te plannen','gepland','bezig','voltooid','gecontroleerd','gefactureerd','betaald','gefaald','geannuleerd'];

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
              {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
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

export default function Jobs() {
  const [jobs,        setJobs]        = useState([]);
  const [printers,    setPrinters]    = useState([]);
  const [klanten,     setKlanten]     = useState([]);
  const [modal,       setModal]       = useState(null);
  const [kostenJob,   setKostenJob]   = useState(null);
  const [filter,      setFilter]      = useState('');
  const [zoekVolgnummer, setZoekVolgnummer] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const { printerConfig, printerData, reloadPrinterConfig } = usePrinterData();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight')) : null;

  const loadJobs = () => api.get('/jobs').then(data => {
    setJobs(data);
    setSelectedJob(prev => prev ? data.find(j => j.id === prev.id) || null : null);
  });

  useEffect(() => {
    loadJobs();
    api.get('/printers').then(setPrinters);
    api.get('/klanten').then(setKlanten);
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
    await api.delete(`/jobs/${id}`);
    loadJobs();
  }


  return (
    <div>
      <div className="page-header">
        <h1>Jobs</h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="">Alle statussen</option>
            {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={zoekVolgnummer} onChange={e => setZoekVolgnummer(e.target.value)}
            placeholder="Zoek op volgnummer..." style={{ width:170 }} />
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe job</button>
        </div>
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
          />
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selectedJob ? '1fr 380px' : '1fr', gap:'1rem', alignItems:'start' }}>
      <div>
      {filtered.length === 0
        ? <div className="empty">Geen jobs gevonden</div>
        : <div className="card" style={{ padding:0 }}>
            <table>
<thead><tr><th>Naam</th><th>Klant</th><th>Printer</th><th>Status</th><th>Uren</th><th>Prijs</th><th>Betaald</th><th>Acties</th></tr></thead>
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
                      {['voltooid','gecontroleerd','gefactureerd','betaald'].includes(j.status)
                        ? <input type="checkbox"
                            checked={j.status === 'betaald'}
                            style={{ width:16, height:16, cursor:'pointer', accentColor:'var(--accent2)' }}
                            onChange={async e => {
                              if (e.target.checked) {
                                await api.patch(`/jobs/${j.id}/status`, { status: 'betaald' });
                              } else {
                                await api.patch(`/jobs/${j.id}/status`, { status: 'gefactureerd' });
                              }
                              loadJobs();
                            }} />
                        : <span style={{ color:'var(--muted)' }}>—</span>
                      }
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
              await api.patch(`/jobs/${selectedJob.id}/status`, { status: e.target.value });
              loadJobs();
            }}>
              {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Betaald */}
          {selectedJob.status === 'voltooid' && selectedJob.klant_id && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'0.75rem', fontSize:13 }}>
              <input type="checkbox" checked={!!selectedJob.betaald}
                style={{ width:16, height:16, cursor:'pointer', accentColor:'var(--accent2)' }}
                onChange={async e => {
                  await api.patch(`/jobs/${selectedJob.id}/betaald`, { betaald: e.target.checked });
                  loadJobs();
                }} />
              <span>Betaald</span>
              {selectedJob.betaald_op && <span style={{ color:'var(--muted)', fontSize:11 }}>{selectedJob.betaald_op.split('T')[0]}</span>}
            </div>
          )}

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
