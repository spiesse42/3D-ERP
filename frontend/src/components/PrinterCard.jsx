// PrinterCard.jsx — gedeelde printerkaart, gebruikt door zowel Dashboard.jsx
// als Jobs.jsx. Voorheen stond deze (incl. StatusDot en ProgressRing) volledig
// dubbel in beide bestanden — dat is hoe StatusDot ooit uit sync raakte tussen
// de twee pagina's. Nu is er nog maar 1 bron.
import { useState } from 'react';
import { api, BASE } from '../lib/api.js';

function StatusDot({ status }) {
  const colors = {
    running:'#ef4444', printing:'#ef4444',
    finish:'#22c55e', finished:'#22c55e', complete:'#22c55e', success:'#22c55e',
    idle:'#f59e0b', standby:'#f59e0b', offline:'#555',
    unavailable:'#555', failed:'#ef4444', pause:'#f59e0b',
  };
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

export default function PrinterCard({ printerId, naam, data, klanten, onJobCreated, bestaandeJobs, autoJobAanmaken, onConfigChanged,
  pauseEntity, resumeEntity, cancelEntity, cameraEntity }) {
  const name      = naam || data?.naam || '—';
  const status    = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone    = ['finish','finished','complete','success'].includes(status.toLowerCase());
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
  const [gewichtGeschat, setGewichtGeschat] = useState('');
  const [rolFilter,    setRolFilter]    = useState('');
  const [autoBusy,     setAutoBusy]     = useState(false);
  const [knopBusy,     setKnopBusy]     = useState('');
  const [liveViewOpen, setLiveViewOpen] = useState(false);
  const [streamTs,     setStreamTs]     = useState(null);

  async function drukKnop(entity, label) {
    if (!entity || knopBusy) return;
    if (!window.confirm(`${label} — weet je het zeker?`)) return;
    setKnopBusy(entity);
    try {
      await api.post('/ha/press-button', { entity_id: entity });
    } catch (e) { alert(e.message); }
    finally { setKnopBusy(''); }
  }

  async function toggleAutoJob() {
    setAutoBusy(true);
    try {
      await api.patch(`/printers/${printerId}/auto-job`, { auto_job_aanmaken: !autoJobAanmaken });
      await onConfigChanged?.();
    } catch (e) { alert(e.message); }
    finally { setAutoBusy(false); }
  }

  const gefilterdeRollen = rollen
    .filter(r => (r.categorie || 'filament') === 'filament')
    .filter(r => !rolFilter || `${r.lotnummer||''} ${r.merk} ${r.materiaal} ${r.kleur||''}`.toLowerCase().includes(rolFilter.toLowerCase()));

  // Reset form bij openen
  function openForm() {
    setJobNaam(defaultNaam);
    setKlantId('');
    setIsMulticolor(false);
    setAantalKleuren(2);
    setRolIds(['']);
    setGewichtGeschat('');
    setRolFilter('');
    api.get('/filament/rollen').then(r => setRollen(r.filter(x => x.actief))).catch(() => {});
    setShowJobForm(true);
  }

  async function maakJob() {
    if (saving) return;
    setSaving(true);
    try {
      // Er mag nooit meer dan 1 fysiek "bezig" job per printer zijn — anders raakt
      // de auto-afsluitlogica in de war over welke job de printer nu net beëindigd
      // heeft. Staat er al een bezig-job op deze printer? Dan wordt de nieuwe job
      // altijd "gepland" (in de wachtrij), ongeacht wat de printer nu fysiek doet.
      const heeftAlBezigJob = bestaandeJobs?.some(j => j.printer_id === printerId && j.status === 'bezig');
      const jobStatus  = heeftAlBezigJob ? 'gepland' : (isDone ? 'voltooid' : isRunning ? 'bezig' : 'gepland');
      const gestart_op = (!heeftAlBezigJob && isRunning) ? new Date().toISOString() : null;
      // Geschatte totale tijd = verstreken + resterend
      const totalSec   = (data?.elapsed_sec || 0) + (data?.remaining_sec || 0);
      const urenGeschat = totalSec > 0 ? Math.round(totalSec / 360) / 10 : null;

      const jobId = await api.post('/jobs', {
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
        gewicht_geschat:    parseFloat(gewichtGeschat) || null,
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
          <button
            type="button"
            onClick={toggleAutoJob}
            disabled={autoBusy}
            title={autoJobAanmaken ? 'Automatische jobaanmaak staat aan — klik om te pauzeren' : 'Automatische jobaanmaak staat uit — klik om te activeren'}
            style={{
              fontSize: 10, marginTop: 6, padding: '2px 7px', borderRadius: 10, cursor: 'pointer',
              border: autoJobAanmaken ? '1px solid var(--accent2)' : '1px solid var(--border)',
              background: autoJobAanmaken ? 'rgba(34,197,94,0.12)' : 'transparent',
              color: autoJobAanmaken ? 'var(--accent2)' : 'var(--muted)',
            }}>
            🤖 Auto-job {autoJobAanmaken ? 'aan' : 'uit'}
          </button>
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
          {status !== 'unavailable' && (
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
          ['🧵 Filament',   data?.filament_g != null ? `${Math.ceil(data.filament_g)} g` : '—'],
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

      {(pauseEntity || resumeEntity || cancelEntity || cameraEntity) && (
        <div style={{ marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid var(--border)' }}>
          {(pauseEntity || resumeEntity || cancelEntity) && (
            <div style={{ display:'flex', gap:6, marginBottom: cameraEntity ? 8 : 0 }}>
              {pauseEntity && (
                <button className="btn" style={{ flex:1, fontSize:11, padding:'4px 6px' }}
                  disabled={!!knopBusy} onClick={() => drukKnop(pauseEntity, 'Print pauzeren')}>
                  ⏸ Pauzeer
                </button>
              )}
              {resumeEntity && (
                <button className="btn" style={{ flex:1, fontSize:11, padding:'4px 6px' }}
                  disabled={!!knopBusy} onClick={() => drukKnop(resumeEntity, 'Print hervatten')}>
                  ▶ Hervat
                </button>
              )}
              {cancelEntity && (
                <button className="btn" style={{ flex:1, fontSize:11, padding:'4px 6px', color:'#ef4444', borderColor:'#ef4444' }}
                  disabled={!!knopBusy} onClick={() => drukKnop(cancelEntity, 'Print annuleren')}>
                  ✕ Annuleer
                </button>
              )}
            </div>
          )}
          {cameraEntity && (
            <div>
              <button className="btn" style={{ width:'100%', fontSize:11, padding:'4px 6px' }}
                onClick={() => setLiveViewOpen(v => {
                  const next = !v;
                  if (next) setStreamTs(Date.now());
                  return next;
                })}>
                🎥 {liveViewOpen ? 'Live view verbergen' : 'Live view tonen'}
              </button>
              {liveViewOpen && streamTs && (
                <img
                  src={`${BASE}/ha/camera-stream/${cameraEntity}?t=${streamTs}`}
                  alt="Live camerabeeld"
                  style={{ width:'100%', marginTop:6, borderRadius:6, display:'block', background:'#000' }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {showJobForm && (
        <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
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
          {!!data?.heeft_bmcu && (
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
          <div className="form-group" style={{ marginBottom:8 }}>
            <input type="text" placeholder="🔍 Filter op kleur/merk/materiaal..." value={rolFilter}
              onChange={e => setRolFilter(e.target.value)} style={{ fontSize:12 }} />
          </div>
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
                  {gefilterdeRollen.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.lotnummer || `Rol #${r.id}`} — {r.merk} {r.materiaal} — {r.kleur || '?'} ({r.gewicht_gram_huidig}g)
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
                {gefilterdeRollen.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.lotnummer || `Rol #${r.id}`} — {r.merk} {r.materiaal} — {r.kleur || '?'} ({r.gewicht_gram_huidig}g)
                  </option>
                ))}
              </select>
            </div>
          )}
          {data?.type === 'ender' && (
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Geschat gewicht (g) <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>uit slicer</span></label>
              <input type="number" min="0" step="0.1" value={gewichtGeschat}
                onChange={e => setGewichtGeschat(e.target.value)}
                placeholder="bv. 11.3" />
            </div>
          )}
          <button className="btn primary" style={{ width:'100%' }} onClick={maakJob}
            disabled={saving}>
            {saving ? 'Bezig...' : '✓ Job aanmaken'}
          </button>
        </div>
      )}
    </div>
  );
}
