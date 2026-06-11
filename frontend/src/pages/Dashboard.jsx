import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';

function StatusDot({ status }) {
  const colors = {
    running:'#ef4444', printing:'#ef4444',
    finish:'#22c55e', complete:'#22c55e', success:'#22c55e',
    idle:'#f59e0b', standby:'#f59e0b',
    unavailable:'#555', failed:'#ef4444'
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

function formatSec(sec) {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function PrinterCard({ name, printerId, data, klanten, onJobCreated }) {
  const status = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone = ['finish','complete','success'].includes(status.toLowerCase());
  const color = isRunning ? '#ef4444' : isDone ? '#22c55e' : '#f59e0b';
  const pct = parseFloat(data?.progress) || 0;
  const [showJobForm, setShowJobForm] = useState(false);
  const [klantId, setKlantId] = useState('');
  const [saving, setSaving] = useState(false);

  async function maakJob() {
    setSaving(true);
    try {
      const naam = data?.filename?.replace(/\.(gcode|3mf|stl)$/i, '') || name;
      const uren = data?.elapsed_sec ? Math.round(data.elapsed_sec / 360) / 10 : null;
      await api.post('/jobs', {
        printer_id: printerId,
        klant_id: klantId || null,
        naam,
        status: isRunning ? 'bezig' : isDone ? 'voltooid' : 'gepland',
        stl_bestandsnaam: data?.filename || null,
        print_uren_geschat: uren,
        is_multicolor: false,
        aantal_kleuren: 1,
        notities: `Aangemaakt vanuit live dashboard — ${pct.toFixed(0)}% voltooid`,
      });
      setShowJobForm(false);
      setKlantId('');
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
              onClick={() => setShowJobForm(v => !v)}>
              {showJobForm ? '✕ Annuleer' : '+ Maak job'}
            </button>
          )}
        </div>
      </div>

      {data?.filename && data.filename !== 'unavailable' && (
        <div style={{ fontSize:11, color:'var(--accent)', marginBottom:'0.75rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', background:'var(--bg3)', borderRadius:6, padding:'4px 8px' }}>
          📄 {data.filename}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px', fontSize:12 }}>
        {[
          ['⏱ Verstreken',  data?.elapsed    || '—'],
          ['⏳ Resterend',  data?.remaining  || '—'],
          ['🧵 Filament',   data?.filament   || '—'],
          ['📐 Laag',       data?.layer      || '—'],
          ['⚡ Start kWh',  data?.kwh_start   != null ? data.kwh_start.toFixed(3)   : '—'],
          ['⚡ Huidig kWh', data?.kwh_current != null ? data.kwh_current.toFixed(3) : '—'],
          ['⚡ Δ Verbruikt', data?.kwh_delta  != null ? `${data.kwh_delta.toFixed(3)} kWh` : '—'],
          ['💶 Energiekost', data?.kwh_delta  != null ? `€${(data.kwh_delta * 0.35).toFixed(3)}` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ color:'var(--muted)', fontSize:11 }}>{label}</div>
            <div style={{ fontWeight:500, color: label.includes('kWh') || label.includes('kost') || label.includes('Start') || label.includes('Huidig') ? '#fbbf24' : 'var(--text)' }}>{val}</div>
          </div>
        ))}
      </div>

      {showJobForm && (
        <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
            Job aanmaken voor <strong style={{ color:'var(--text)' }}>{data?.filename?.replace(/\.(gcode|3mf|stl)$/i, '') || name}</strong>
          </p>
          <div className="form-group" style={{ marginBottom:8 }}>
            <label>Klant (optioneel)</label>
            <select value={klantId} onChange={e => setKlantId(e.target.value)}>
              <option value="">— voor mezelf —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          </div>
          <button className="btn primary" style={{ width:'100%' }} onClick={maakJob} disabled={saving}>
            {saving ? 'Bezig...' : '✓ Job aanmaken'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [jobs,        setJobs]        = useState([]);
  const [rollen,      setRollen]      = useState([]);
  const [printers,    setPrinters]    = useState([]);
  const [klanten,     setKlanten]     = useState([]);
  const [printerData, setPrinterData] = useState({});
  const intervalRef = useRef(null);
  const navigate = useNavigate();

  const loadJobs = () => api.get('/jobs').then(setJobs);

  useEffect(() => {
    loadJobs();
    api.get('/filament/rollen').then(setRollen);
    api.get('/printers').then(setPrinters);
    api.get('/klanten').then(setKlanten);
  }, []);

  useEffect(() => {
    const BAMBU = 'sensor.a1mini_0300da611800680_';
    const entities = {
      bambu_status:    `${BAMBU}printstatus`,
      bambu_progress:  `${BAMBU}printvoortgang`,
      bambu_file:      `${BAMBU}gcode_bestandsnaam`,
      bambu_remaining: `${BAMBU}resterende_tijd`,
      bambu_layer_cur: `${BAMBU}huidige_laag`,
      bambu_layer_tot: `${BAMBU}hoeveelheid_lagen`,
      bambu_filament:  `${BAMBU}gewicht_van_print`,
      bambu_start:     `${BAMBU}starttijd`,
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
      // Ender startkWh via HA helper — opgeslagen door automatisatie bij printstart
      ender_kwh_start: 'input_number.print_start_kwh',
    };

    async function poll() {
      try {
        const results = await Promise.all(
          Object.entries(entities).map(([key, entity]) =>
            api.get(`/ha/state/${entity}`).then(d => [key, d.state]).catch(() => [key, null])
          )
        );
        const s = Object.fromEntries(results);

        // Bambu verstreken tijd via starttijd
        let bambuElapsed = 0;
        if (s.bambu_start && s.bambu_start !== 'unavailable') {
          const ms = new Date(s.bambu_start).getTime();
          if (!isNaN(ms)) bambuElapsed = Math.max(0, (Date.now() - ms) / 1000);
        }

        // Ender verstreken tijd — Moonraker geeft uren
        const enderElapsedSec = (parseFloat(s.ender_elapsed) || 0) * 3600;

        // Resterende tijd
        let bambuRem = 0;
        if (s.bambu_remaining && s.bambu_remaining !== 'unavailable') bambuRem = parseFloat(s.bambu_remaining) || 0;
        let enderRem = 0;
        if (s.ender_remaining?.includes('T')) {
          const diff = (new Date(s.ender_remaining).getTime() - Date.now()) / 1000;
          if (diff > 0) enderRem = diff;
        }

        const bambuKwh      = parseFloat(s.bambu_kwh)       || 0;
        const enderKwh      = parseFloat(s.ender_kwh)       || 0;
        // Ender startkWh: rechtstreeks uit HA helper (opgeslagen door automatisatie)
        const enderKwhStart = parseFloat(s.ender_kwh_start) || null;

        const bambuRunning = ['running','printing'].includes((s.bambu_status || '').toLowerCase());
        const enderRunning = ['running','printing'].includes((s.ender_status || '').toLowerCase());

        // Bambu: startkWh bijhouden in state (geen HA helper beschikbaar)
        setPrinterData(prev => {
          const bambuStart = bambuRunning
            ? (prev.bambu?.kwh_start || (bambuKwh > 0 ? bambuKwh : null))
            : null;
          const bambuDelta = bambuKwh > 0 && bambuStart ? bambuKwh - bambuStart : null;

          // Ender: delta = huidig - start (uit HA helper)
          const enderDelta = enderKwh > 0 && enderKwhStart ? enderKwh - enderKwhStart : null;

          return {
            bambu: {
              status:      s.bambu_status || 'unavailable',
              progress:    parseFloat(s.bambu_progress) || 0,
              filename:    s.bambu_file,
              elapsed:     formatSec(bambuElapsed),
              elapsed_sec: bambuElapsed,
              remaining:   formatSec(bambuRem),
              filament:    `${parseFloat(s.bambu_filament)?.toFixed(1) || '—'} g`,
              filament_g:  parseFloat(s.bambu_filament) || 0,
              layer:       `${s.bambu_layer_cur || '0'} / ${s.bambu_layer_tot || '0'}`,
              kwh_start:   bambuStart,
              kwh_current: bambuKwh || null,
              kwh_delta:   bambuDelta,
            },
            ender: {
              status:      s.ender_status || 'unavailable',
              progress:    parseFloat(s.ender_progress) || 0,
              filename:    s.ender_file,
              elapsed:     formatSec(enderElapsedSec),
              elapsed_sec: enderElapsedSec,
              remaining:   formatSec(enderRem),
              filament:    `${((parseFloat(s.ender_filament) || 0) * 2.98).toFixed(1)} g`,
              filament_g:  (parseFloat(s.ender_filament) || 0) * 2.98,
              layer:       `${s.ender_layer_cur || '0'} / ${s.ender_layer_tot || '0'}`,
              kwh_start:   enderKwhStart,
              kwh_current: enderKwh || null,
              kwh_delta:   enderDelta,
            },
          };
        });
      } catch {}
    }

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const wachtrij    = jobs.filter(j => ['gepland','bezig'].includes(j.status));
  const voltooid    = jobs.filter(j => j.status === 'voltooid').slice(0, 5);
  const activeRollen = rollen.filter(r => r.actief);

  const bambuId = printers.find(p => p.naam.toLowerCase().includes('bambu'))?.id;
  const enderId = printers.find(p => p.naam.toLowerCase().includes('ender'))?.id;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ fontSize:12, color:'var(--muted)' }}>
          {new Date().toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </span>
      </div>

      {/* Printerkaarten — identiek aan Jobs tab */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
        <PrinterCard name="Bambu A1 Mini"  printerId={bambuId} data={printerData.bambu} klanten={klanten} onJobCreated={loadJobs} />
        <PrinterCard name="Ender 3 S1 Pro" printerId={enderId} data={printerData.ender} klanten={klanten} onJobCreated={loadJobs} />
      </div>

      {/* Wachtrij / Voltooid / Stock */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1rem' }}>
        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
            📋 Wachtrij <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400 }}>({wachtrij.length})</span>
          </h2>
          {wachtrij.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen jobs in wachtrij</p>
            : wachtrij.map(j => (
              <div key={j.id} onClick={() => navigate('/jobs')}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'7px 8px', borderBottom:'1px solid var(--border)', fontSize:12,
                  cursor:'pointer', borderRadius:6 }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{ fontWeight:500 }}>{j.naam}</div>
                  <div style={{ color:'var(--muted)', fontSize:11 }}>{j.printer_naam}</div>
                </div>
                <span className={`badge ${j.status}`}>{j.status}</span>
              </div>
            ))
          }
        </div>

        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>✅ Recent voltooid</h2>
          {voltooid.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Nog geen voltooide jobs</p>
            : voltooid.map(j => (
              <div key={j.id} onClick={() => navigate('/jobs')}
                style={{ display:'flex', justifyContent:'space-between', padding:'7px 8px',
                  borderBottom:'1px solid var(--border)', fontSize:12, cursor:'pointer', borderRadius:6 }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{ fontWeight:500 }}>{j.naam}</div>
                  <div style={{ color:'var(--muted)', fontSize:11 }}>{j.klant_naam || 'Eigen print'}</div>
                </div>
                {j.verkoopprijs != null && <span style={{ color:'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span>}
              </div>
            ))
          }
        </div>

        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
            🧵 Filamentstock <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400 }}>({activeRollen.length})</span>
          </h2>
          {activeRollen.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen actieve rollen</p>
            : activeRollen.map(r => {
              const pct = Math.min(100, Math.round((r.gewicht_gram_huidig / (r.gewicht_gram_start || 1000)) * 100));
              const kleur = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
              return (
                <div key={r.id} style={{ padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                    <span style={{ fontWeight:500 }}>{r.merk} {r.materiaal} <span style={{ color:'var(--muted)' }}>{r.kleur}</span></span>
                    <span style={{ color:'var(--muted)' }}>{r.gewicht_gram_huidig}g</span>
                  </div>
                  <div style={{ height:3, background:'var(--bg3)', borderRadius:2 }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:kleur, borderRadius:2 }} />
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}
