import { useState, useEffect } from 'react';
import { usePrinterData } from '../lib/usePrinterData.js';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import KostenModal from '../components/KostenModal.jsx';

const STATUSSEN = ['gepland','bezig','voltooid','gefaald','geannuleerd'];

function StatusDot({ status }) {
  const colors = { running:'#ef4444', printing:'#ef4444', finish:'#22c55e', complete:'#22c55e', success:'#22c55e', idle:'#f59e0b', standby:'#f59e0b', unavailable:'#555' };
  const c = colors[status?.toLowerCase()] || '#f59e0b';
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:c, marginRight:6, boxShadow:`0 0 6px ${c}` }} />;
}

function ProgressRing({ pct, color, size=80 }) {
  const r2 = size/2 - 8;
  const circ = 2 * Math.PI * r2;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke="#1e2330" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition:'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function PrinterCard({ printerId, naam, data, klanten, onJobCreated, bestaandeJobs }) {
  const name      = naam || data?.naam || '—';
  const status    = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone    = ['finish','complete','success'].includes(status.toLowerCase());
  const color     = isRunning ? '#ef4444' : isDone ? '#22c55e' : '#f59e0b';
  const pct       = parseFloat(data?.progress) || 0;

  // Bestandsnaam zonder extensie als standaard jobnaam
  const defaultNaam = data?.filename?.replace(/\.(gcode|3mf|stl)$/i,'') || name;

  const [showJobForm,  setShowJobForm]  = useState(false);
  const [klantId,      setKlantId]      = useState('');
  const [jobNaam,      setJobNaam]      = useState('');
  const [isMulticolor, setIsMulticolor] = useState(false);
  const [aantalKleuren,setAantalKleuren]= useState(2);
  const [rolIds,       setRolIds]       = useState(['']);
  const [rollen,       setRollen]       = useState([]);
  const [saving,       setSaving]       = useState(false);

  // Reset form bij openen
  function openForm() {
    setJobNaam(defaultNaam);
    setKlantId('');
    setIsMulticolor(false);
    setAantalKleuren(2);
    setRolIds(['']);
    api.get('/filament/rollen').then(r => setRollen(r.filter(x => x.actief))).catch(() => {});
    setShowJobForm(true);
  }

  // Check of er al een actieve job is voor deze printer
  const heeftActieveJob = bestaandeJobs?.some(
    j => j.printer_id === printerId && ['bezig','gepland'].includes(j.status)
  );

  async function maakJob() {
    if (heeftActieveJob) {
      if (!confirm('Er is al een actieve job voor deze printer. Toch doorgaan?')) return;
    }
    setSaving(true);
    try {
      const jobStatus  = isDone ? 'voltooid' : isRunning ? 'bezig' : 'gepland';
      const gestart_op = isRunning ? new Date().toISOString() : null;
      // Geschatte totale tijd = verstreken + resterend
      const totalSec   = (data?.elapsed_sec || 0) + (data?.remaining_sec || 0);
      const urenGeschat = totalSec > 0 ? Math.round(totalSec / 360) / 10 : null;

      await api.post('/jobs', {
        printer_id:         printerId,
        klant_id:           klantId || null,
        naam:               jobNaam || defaultNaam,
        status:             jobStatus,
        gestart_op,
        stl_bestandsnaam:   data?.filename || null,
        print_uren_geschat: urenGeschat,
        is_multicolor:      isMulticolor ? 1 : 0,
        aantal_kleuren:     isMulticolor ? aantalKleuren : 1,
        notities:           `Aangemaakt vanuit printerkaart — ${pct.toFixed(0)}% voltooid`,
      });
      // Filamentrollen koppelen
      if (jobId?.id) {
        for (const rid of rolIds.filter(r => r)) {
          await api.post(`/jobs/${jobId.id}/materialen`, {
            filament_rol_id: parseInt(rid),
            gram_gebruikt: 1,
          }).catch(() => {});
        }
      }

      setShowJobForm(false);
      onJobCreated();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="card" style={{ flex:1, minWidth:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>{name}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            <StatusDot status={status} />{status}
          </div>
          {(data?.bed_temp || data?.nozzle_temp) && (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, display:'flex', gap:10 }}>
              {data.bed_temp    && <span>🛏 {data.bed_temp}°C</span>}
              {data.nozzle_temp && <span>🌡 {data.nozzle_temp}°C</span>}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ position:'relative', width:80, height:80 }}>
            <ProgressRing pct={pct} color={color} size={80} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color }}>
              {pct.toFixed(0)}%
            </div>
          </div>
          {(isRunning || isDone) && (
            <button className="btn primary" style={{ fontSize:11, padding:'4px 10px', whiteSpace:'nowrap' }}
              onClick={() => showJobForm ? setShowJobForm(false) : openForm()}>
              {showJobForm ? '✕ Annuleer' : '+ Maak job'}
            </button>
          )}
        </div>
      </div>

      {data?.filename && data.filename !== 'unavailable' && data.filename !== 'unknown' && (
        <div style={{ fontSize:11, color:'var(--accent)', marginBottom:'0.75rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', background:'var(--bg3)', borderRadius:6, padding:'4px 8px' }}>
          📄 {data.filename}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px', fontSize:12 }}>
        {[
          ['⏱ Verstreken',  data?.elapsed   || '—'],
          ['⏳ Resterend',  data?.remaining || '—'],
          ['🧵 Filament',   data?.filament  || '—'],
          ['📐 Laag',       data?.layer     || '—'],
          ['⚡ Vermogen',    data?.watt      != null ? `${data.watt.toFixed(1)} W` : '—'],
          ['⚡ Δ Verbruikt', data?.kwh_delta != null ? `${data.kwh_delta.toFixed(3)} kWh` : '—'],
          ['💶 Energiekost', data?.kwh_delta != null && data?.kwh_prijs
            ? `€${(data.kwh_delta * data.kwh_prijs).toFixed(3)}` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ color:'var(--muted)', fontSize:11 }}>{label}</div>
            <div style={{ fontWeight:500, color: label.includes('Verbruikt') || label.includes('kost') ? '#fbbf24' : 'var(--text)' }}>{val}</div>
          </div>
        ))}
      </div>

      {showJobForm && (
        <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
          {heeftActieveJob && (
            <div style={{ fontSize:11, color:'var(--warn)', marginBottom:8, padding:'4px 8px', background:'rgba(245,158,11,0.1)', borderRadius:4 }}>
              ⚠ Er is al een actieve job voor deze printer
            </div>
          )}
          <div className="form-group" style={{ marginBottom:8 }}>
            <label>Jobnaam</label>
            <input value={jobNaam} onChange={e => setJobNaam(e.target.value)} placeholder="Naam van de job" />
          </div>
          <div className="form-group" style={{ marginBottom:8 }}>
            <label>Klant (optioneel)</label>
            <select value={klantId} onChange={e => setKlantId(e.target.value)}>
              <option value="">— voor mezelf —</option>
              {klanten.map(k => (
                <option key={k.id} value={k.id}>
                  {k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}
                  {k.bedrijfsnaam ? ` — ${k.bedrijfsnaam}` : ''}
                </option>
              ))}
            </select>
          </div>
          {data?.heeft_bmcu && (
            <div className="form-row" style={{ marginBottom:8 }}>
              <div className="form-group">
                <label>Multicolor (BMCU)</label>
                <select value={isMulticolor ? '1' : '0'} onChange={e => setIsMulticolor(e.target.value === '1')}>
                  <option value="0">Nee</option>
                  <option value="1">Ja</option>
                </select>
              </div>
              {isMulticolor && (
                <div className="form-group">
                  <label>Aantal kleuren</label>
                  <input type="number" min="2" max="8" value={aantalKleuren}
                    onChange={e => setAantalKleuren(parseInt(e.target.value))} />
                </div>
              )}
            </div>
          )}
          {isMulticolor === true ? (
            Array.from({ length: aantalKleuren }, (_, i) => (
              <div className="form-group" style={{ marginBottom:8 }} key={i}>
                <label>Kleur {i + 1} — filamentrol (optioneel)</label>
                <select value={rolIds[i] || ''} onChange={e => {
                  const nieuw = [...rolIds];
                  nieuw[i] = e.target.value;
                  setRolIds(nieuw);
                }}>
                  <option value="">— geen rol koppelen —</option>
                  {rollen.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.merk} {r.materiaal} — {r.kleur || '?'} ({r.gewicht_gram_huidig}g)
                    </option>
                  ))}
                </select>
              </div>
            ))
          ) : (
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Filamentrol (optioneel)</label>
              <select value={rolIds[0] || ''} onChange={e => setRolIds([e.target.value])}>
                <option value="">— geen rol koppelen —</option>
                {rollen.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.merk} {r.materiaal} — {r.kleur || '?'} ({r.gewicht_gram_huidig}g)
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn primary" style={{ width:'100%' }} onClick={maakJob}
            disabled={saving || heeftActieveJob}>
            {saving ? 'Bezig...' : heeftActieveJob ? '⚠ Al een actieve job' : '✓ Job aanmaken'}
          </button>
        </div>
      )}
    </div>
  );
}

function JobModal({ job, printers, klanten, onClose, onSaved }) {
const [form, setForm] = useState(job ? {
    printer_id: job.printer_id, naam: job.naam, status: job.status,
    klant_id: job.klant_id || '', is_multicolor: job.is_multicolor,
    aantal_kleuren: job.aantal_kleuren, print_uren_geschat: job.print_uren_geschat || '',
    print_uren_werkelijk: job.print_uren_werkelijk || '', stl_bestandsnaam: job.stl_bestandsnaam || '',
    notities: job.notities || '',
  } : { printer_id: printers[0]?.id || '', naam:'', status:'gepland', is_multicolor:false, aantal_kleuren:1, print_uren_geschat:'', notities:'' });  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    try {
      if (job?.id) await api.put(`/jobs/${job.id}`, form);
      else await api.post('/jobs', form);
      onSaved();
    } catch(e) { alert(e.message); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{job?.id ? 'Job bewerken' : 'Nieuwe job'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-group"><label>Naam *</label><input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Naam van de print" /></div>
        <div className="form-row">
          <div className="form-group"><label>Printer *</label>
            <select value={form.printer_id} onChange={e => set('printer_id', e.target.value)}>
              {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Klant</label>
            <select value={form.klant_id || ''} onChange={e => set('klant_id', e.target.value || null)}>
              <option value="">— geen klant —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          </div>
        </div>
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
          <div className="form-group"><label>STL bestandsnaam</label>
            <input value={form.stl_bestandsnaam || ''} onChange={e => set('stl_bestandsnaam', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Multicolor</label>
            <select value={form.is_multicolor ? '1' : '0'} onChange={e => set('is_multicolor', e.target.value === '1')}>
              <option value="0">Nee</option><option value="1">Ja (BMCU)</option>
            </select>
          </div>
          {form.is_multicolor && (
            <div className="form-group"><label>Aantal kleuren</label>
              <input type="number" min="2" max="8" value={form.aantal_kleuren} onChange={e => set('aantal_kleuren', parseInt(e.target.value))} />
            </div>
          )}
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

function formatSec(sec) {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

export default function Jobs() {
  const [jobs,      setJobs]      = useState([]);
  const [printers,  setPrinters]  = useState([]);
  const [klanten,   setKlanten]   = useState([]);
  const [modal,     setModal]     = useState(null);
  const [kostenJob, setKostenJob] = useState(null);
  const [filter,    setFilter]    = useState('');
  const { printerConfig, printerData } = usePrinterData();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight')) : null;

  const loadJobs = () => api.get('/jobs').then(setJobs);

  useEffect(() => {
    loadJobs();
    api.get('/printers').then(setPrinters);
    api.get('/klanten').then(setKlanten);
  }, []);

  const filtered = filter ? jobs.filter(j => j.status === filter) : jobs;

  async function deleteJob(id) {
    if (!confirm('Job verwijderen?')) return;
    await api.delete(`/jobs/${id}`);
    loadJobs();
  }


  return (
    <div>
      <div className="page-header">
        <h1>Jobs</h1>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="">Alle statussen</option>
            {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe job</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
        {printerConfig.map(p => (
          <PrinterCard
            key={p.id}
            printerId={p.id}
            naam={p.naam}
            data={printerData[p.id]}
            klanten={klanten}
            onJobCreated={loadJobs}
            bestaandeJobs={jobs}
          />
        ))}
      </div>

      {filtered.length === 0
        ? <div className="empty">Geen jobs gevonden</div>
        : <div className="card" style={{ padding:0 }}>
            <table>
<thead><tr><th>Naam</th><th>Klant</th><th>Printer</th><th>Status</th><th>Uren</th><th>Prijs</th><th>Betaald</th><th>Acties</th></tr></thead>
	<tbody>
                {filtered.map(j => (
                  <tr key={j.id} style={{ background: j.id === highlightId ? 'var(--bg3)' : undefined, outline: j.id === highlightId ? '2px solid var(--accent)' : undefined }}>
                    <td>
                      <div style={{ fontWeight:500 }}>{j.naam}</div>
                      {j.is_multicolor ? <div style={{ fontSize:11, color:'var(--accent)' }}>BMCU · {j.aantal_kleuren} kleuren</div> : null}
                    </td>
                    <td>{j.klant_naam || <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td>{j.printer_naam}</td>
                    <td><span className={`badge ${j.status}`}>{j.status}</span></td>
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
                    <td>{j.verkoopprijs != null ? <span style={{ color:'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span> : <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {j.status === 'voltooid' && j.klant_id
                        ? <input type="checkbox" checked={!!j.betaald}
                            style={{ width:16, height:16, cursor:'pointer', accentColor:'var(--accent2)' }}
                            onChange={async e => {
                              await api.patch(`/jobs/${j.id}/betaald`, { betaald: e.target.checked });
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
