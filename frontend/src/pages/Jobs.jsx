import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const STATUSSEN = ['gepland','bezig','voltooid','gefaald','geannuleerd'];

function StatusDot({ status }) {
  const colors = { running: '#ef4444', printing: '#ef4444', finish: '#22c55e', complete: '#22c55e', success: '#22c55e', idle: '#f59e0b', standby: '#f59e0b', unavailable: '#555' };
  const c = colors[status?.toLowerCase()] || '#f59e0b';
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:c, marginRight:6, boxShadow:`0 0 6px ${c}` }} />;
}

function ProgressRing({ pct, color, size=80 }) {
  const r = size/2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2330" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition:'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function PrinterCard({ name, data, loading }) {
  const status = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone = ['finish','complete','success'].includes(status.toLowerCase());
  const color = isRunning ? '#ef4444' : isDone ? '#22c55e' : '#f59e0b';
  const pct = parseFloat(data?.progress) || 0;

  return (
    <div className="card" style={{ flex:1, minWidth:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>{name}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            <StatusDot status={status} />
            {status}
          </div>
        </div>
        <div style={{ position:'relative', width:80, height:80 }}>
          <ProgressRing pct={pct} color={color} size={80} />
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color }}>
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>

      {data?.filename && data.filename !== 'unavailable' && (
        <div style={{ fontSize:11, color:'var(--accent)', marginBottom:'0.75rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', background:'var(--bg3)', borderRadius:6, padding:'4px 8px' }}>
          📄 {data.filename}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px', fontSize:12 }}>
        {[
          ['⏱ Verstreken', data?.elapsed || '—'],
          ['⏳ Resterend', data?.remaining || '—'],
          ['🧵 Filament', data?.filament || '—'],
          ['📐 Laag', data?.layer || '—'],
          ['⚡ Δ kWh', data?.kwh_delta != null ? `${data.kwh_delta.toFixed(3)} kWh` : '—'],
          ['💶 Energiekost', data?.kwh_delta != null ? `€${(data.kwh_delta * 0.35).toFixed(3)}` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ color:'var(--muted)', fontSize:11 }}>{label}</div>
            <div style={{ fontWeight:500, color: label.includes('kWh') || label.includes('kost') ? '#fbbf24' : 'var(--text)' }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobModal({ job, printers, klanten, onClose, onSaved }) {
  const [form, setForm] = useState(job || { printer_id: printers[0]?.id || '', naam: '', status: 'gepland', is_multicolor: false, aantal_kleuren: 1, print_uren_geschat: '', notities: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    try {
      if (job?.id) await api.put(`/jobs/${job.id}`, form);
      else await api.post('/jobs', form);
      onSaved();
    } catch (e) { alert(e.message); }
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
            <input type="number" step="0.1" value={form.print_uren_werkelijk || ''} onChange={e => set('print_uren_werkelijk', e.target.value)} placeholder="na voltooiing" />
          </div>
          <div className="form-group"><label>STL bestandsnaam</label>
            <input value={form.stl_bestandsnaam || ''} onChange={e => set('stl_bestandsnaam', e.target.value)} placeholder="bestand.stl" />
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

function KostenModal({ job, onClose }) {
  const [kwh, setKwh] = useState('');
  const [result, setResult] = useState(null);
  const [rollen, setRollen] = useState([]);
  const [selectedRol, setSelectedRol] = useState('');
  const [gram, setGram] = useState('');
  useEffect(() => {
    api.get('/filament/rollen').then(r => setRollen(r.filter(rol => rol.actief)));
    api.get(`/kosten/job/${job.id}`).then(setResult).catch(() => {});
  }, [job.id]);
  async function bereken() {
    try { const r = await api.post(`/kosten/bereken/${job.id}`, { kwh_verbruikt: parseFloat(kwh) || 0 }); setResult(r); }
    catch (e) { alert(e.message); }
  }
  async function voegToe() {
    if (!selectedRol || !gram) return alert('Selecteer een rol en geef gram op');
    try { await api.post(`/jobs/${job.id}/materialen`, { filament_rol_id: parseInt(selectedRol), gram_gebruikt: parseFloat(gram) }); setSelectedRol(''); setGram(''); alert('Materiaal toegevoegd'); }
    catch (e) { alert(e.message); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:540 }}>
        <div className="modal-header"><h2>Kostprijs — {job.naam}</h2><button className="btn" onClick={onClose}>✕</button></div>
        <p style={{ fontSize:12, color:'var(--muted)', marginBottom:'1rem' }}>Printer: {job.printer_naam} {job.is_multicolor ? '· BMCU multicolor' : ''}</p>
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>Filament toevoegen</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px auto', gap:8, alignItems:'end' }}>
            <select value={selectedRol} onChange={e => setSelectedRol(e.target.value)}>
              <option value="">— selecteer rol —</option>
              {rollen.map(r => <option key={r.id} value={r.id}>{r.merk} {r.materiaal} {r.kleur} ({r.gewicht_gram_huidig}g)</option>)}
            </select>
            <input type="number" placeholder="gram" value={gram} onChange={e => setGram(e.target.value)} />
            <button className="btn primary" onClick={voegToe}>+ Voeg toe</button>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', marginBottom:'1rem' }}>
          <div className="form-group" style={{ flex:1, marginBottom:0 }}>
            <label>kWh verbruikt</label>
            <input type="number" step="0.01" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="bv. 0.45" />
          </div>
          <button className="btn primary" onClick={bereken}>Bereken</button>
        </div>
        {result && (
          <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem' }}>
            <table style={{ fontSize:13 }}>
              <tbody>
                {[['Materiaal', result.materiaal_kost],['Energie', result.energie_kost],['Machine', result.machine_kost],['Arbeid', result.arbeid_kost],['BMCU slijtage', result.bmcu_slijtage]].map(([label, val]) => (
                  <tr key={label}><td style={{ color:'var(--muted)', borderBottom:'1px solid var(--border)', paddingLeft:0 }}>{label}</td><td style={{ textAlign:'right', borderBottom:'1px solid var(--border)' }}>€{val?.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontWeight:600 }}>
              <span>Verkoopprijs</span>
              <span style={{ color:'var(--accent2)', fontSize:18 }}>€{result.verkoopprijs?.toFixed(2)}</span>
            </div>
          </div>
        )}
        <div className="modal-footer"><button className="btn" onClick={onClose}>Sluiten</button></div>
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
  const [jobs, setJobs] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [klanten, setKlanten] = useState([]);
  const [modal, setModal] = useState(null);
  const [kostenJob, setKostenJob] = useState(null);
  const [filter, setFilter] = useState('');
  const [printerData, setPrinterData] = useState({});
  const [kwhStart, setKwhStart] = useState({});
  const intervalRef = useRef(null);

  const loadJobs = () => api.get('/jobs').then(setJobs);

  useEffect(() => {
    loadJobs();
    api.get('/printers').then(setPrinters);
    api.get('/klanten').then(setKlanten);
  }, []);

  // Live HA polling
  useEffect(() => {
    const BAMBU_PREFIX = 'sensor.a1mini_0300da611800680_';
    const entities = {
      bambu_status:    `${BAMBU_PREFIX}printstatus`,
      bambu_progress:  `${BAMBU_PREFIX}printvoortgang`,
      bambu_file:      `${BAMBU_PREFIX}gcode_bestandsnaam`,
      bambu_remaining: `${BAMBU_PREFIX}resterende_tijd`,
      bambu_layer_cur: `${BAMBU_PREFIX}huidige_laag`,
      bambu_layer_tot: `${BAMBU_PREFIX}hoeveelheid_lagen`,
      bambu_filament:  `${BAMBU_PREFIX}gewicht_van_print`,
      bambu_start:     `${BAMBU_PREFIX}starttijd`,
      bambu_kwh:       'sensor.lsc_power_plug_fr_incl_power_meter_6_totaal_energieverbruik',
      ender_status:    'sensor.ender_3_s1_pro_current_print_state',
      ender_progress:  'sensor.ender_3_s1_pro_progress',
      ender_file:      'sensor.ender_3_s1_pro_filename',
      ender_remaining: 'sensor.ender_3_s1_pro_print_eta',
      ender_layer_cur: 'sensor.ender_3_s1_pro_current_layer',
      ender_layer_tot: 'sensor.ender_3_s1_pro_total_layer',
      ender_filament:  'sensor.ender_3_s1_pro_filament_used',
      ender_elapsed:   'sensor.ender_3_s1_pro_print_duration',
      ender_kwh:       'sensor.lsc_power_plug_fr_incl_power_meter_5_totaal_energieverbruik',
    };

    async function poll() {
      try {
        const results = await Promise.all(
          Object.entries(entities).map(([key, entity]) =>
            api.get(`/ha/state/${entity}`).then(d => [key, d.state]).catch(() => [key, null])
          )
        );
        const s = Object.fromEntries(results);

        // Bambu elapsed via starttijd
        let bambuElapsed = 0;
        if (s.bambu_start && s.bambu_start !== 'unavailable') {
          const ms = new Date(s.bambu_start).getTime();
          if (!isNaN(ms)) bambuElapsed = Math.max(0, (Date.now() - ms) / 1000);
        }

        // Ender elapsed (uren als float)
        const enderElapsedSec = (parseFloat(s.ender_elapsed) || 0) * 3600;

        // Bambu remaining (seconden)
        let bambuRem = 0;
        if (s.bambu_remaining && s.bambu_remaining !== 'unavailable') bambuRem = parseFloat(s.bambu_remaining) || 0;

        // Ender remaining (ISO timestamp)
        let enderRem = 0;
        if (s.ender_remaining && s.ender_remaining.includes('T')) {
          const diff = (new Date(s.ender_remaining).getTime() - Date.now()) / 1000;
          if (diff > 0) enderRem = diff;
        }

        // kWh delta
        const bambuKwh = parseFloat(s.bambu_kwh) || 0;
        const enderKwh = parseFloat(s.ender_kwh) || 0;

        setKwhStart(prev => {
          const next = { ...prev };
          const bambuRunning = ['running','printing'].includes((s.bambu_status||'').toLowerCase());
          const enderRunning = ['running','printing'].includes((s.ender_status||'').toLowerCase());
          if (bambuRunning && !prev.bambu && bambuKwh > 0) next.bambu = bambuKwh;
          if (!bambuRunning) next.bambu = null;
          if (enderRunning && !prev.ender && enderKwh > 0) next.ender = enderKwh;
          if (!enderRunning) next.ender = null;
          return next;
        });

        setPrinterData(prev => ({
          bambu: {
            status:   s.bambu_status || 'unavailable',
            progress: parseFloat(s.bambu_progress) || 0,
            filename: s.bambu_file,
            elapsed:  formatSec(bambuElapsed),
            remaining: formatSec(bambuRem),
            filament: `${parseFloat(s.bambu_filament)?.toFixed(1) || '—'} g`,
            layer:    `${s.bambu_layer_cur || '0'} / ${s.bambu_layer_tot || '0'}`,
            kwh_delta: bambuKwh > 0 && prev.bambu?.kwh_start ? bambuKwh - prev.bambu.kwh_start : (bambuKwh > 0 && kwhStart.bambu ? bambuKwh - kwhStart.bambu : null),
            kwh_start: kwhStart.bambu || null,
          },
          ender: {
            status:   s.ender_status || 'unavailable',
            progress: parseFloat(s.ender_progress) || 0,
            filename: s.ender_file,
            elapsed:  formatSec(enderElapsedSec),
            remaining: formatSec(enderRem),
            filament: `${(parseFloat(s.ender_filament) * 2.98)?.toFixed(1) || '—'} g`,
            layer:    `${s.ender_layer_cur || '0'} / ${s.ender_layer_tot || '0'}`,
            kwh_delta: enderKwh > 0 && kwhStart.ender ? enderKwh - kwhStart.ender : null,
            kwh_start: kwhStart.ender || null,
          },
        }));
      } catch {}
    }

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
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

      {/* Live printer dashboard */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
        <PrinterCard name="Bambu A1 Mini" data={printerData.bambu} />
        <PrinterCard name="Ender 3 S1 Pro" data={printerData.ender} />
      </div>

      {/* Joblijst */}
      {filtered.length === 0
        ? <div className="empty">Geen jobs gevonden</div>
        : <div className="card" style={{ padding:0 }}>
            <table>
              <thead><tr><th>Naam</th><th>Klant</th><th>Printer</th><th>Status</th><th>Uren</th><th>Prijs</th><th>Acties</th></tr></thead>
              <tbody>
                {filtered.map(j => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ fontWeight:500 }}>{j.naam}</div>
                      {j.is_multicolor ? <div style={{ fontSize:11, color:'var(--accent)' }}>BMCU · {j.aantal_kleuren} kleuren</div> : null}
                    </td>
                    <td>{j.klant_naam || <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td>{j.printer_naam}</td>
                    <td><span className={`badge ${j.status}`}>{j.status}</span></td>
                    <td style={{ color:'var(--muted)' }}>{j.print_uren_werkelijk != null ? `${j.print_uren_werkelijk}u` : j.print_uren_geschat != null ? `~${j.print_uren_geschat}u` : '—'}</td>
                    <td>{j.verkoopprijs != null ? <span style={{ color:'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span> : <span style={{ color:'var(--muted)' }}>—</span>}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => setKostenJob(j)}>€ Kost</button>
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
      {kostenJob && <KostenModal job={kostenJob} onClose={() => setKostenJob(null)} />}
    </div>
  );
}
