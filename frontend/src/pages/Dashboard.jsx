import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

function StatusDot({ status }) {
  const colors = { running:'#ef4444', printing:'#ef4444', finish:'#22c55e', complete:'#22c55e', success:'#22c55e', idle:'#f59e0b', standby:'#f59e0b', unavailable:'#555' };
  const c = colors[status?.toLowerCase()] || '#f59e0b';
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:c, marginRight:6, boxShadow:`0 0 6px ${c}` }} />;
}

function ProgressRing({ pct, color, size=70 }) {
  const r = size/2 - 6;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2330" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
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

function PrinterMini({ name, data }) {
  const status = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone = ['finish','complete','success'].includes(status.toLowerCase());
  const color = isRunning ? '#ef4444' : isDone ? '#22c55e' : '#f59e0b';
  const pct = parseFloat(data?.progress) || 0;

  return (
    <div className="card" style={{ flex:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:13 }}>{name}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>
            <StatusDot status={status} />{status}
          </div>
        </div>
        <div style={{ position:'relative', width:70, height:70 }}>
          <ProgressRing pct={pct} color={color} size={70} />
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color }}>
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>
      {data?.filename && data.filename !== 'unavailable' && (
        <div style={{ fontSize:11, color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', background:'var(--bg3)', borderRadius:5, padding:'3px 7px', marginBottom:8 }}>
          📄 {data.filename}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px', fontSize:11 }}>
        {[
          ['⏱', data?.elapsed || '—'],
          ['⏳', data?.remaining || '—'],
          ['🧵', data?.filament || '—'],
          ['📐', data?.layer || '—'],
        ].map(([icon, val]) => (
          <div key={icon} style={{ display:'flex', gap:4 }}>
            <span>{icon}</span>
            <span style={{ color:'var(--muted)' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [rollen, setRollen] = useState([]);
  const [printerData, setPrinterData] = useState({});
  const [kwhStart, setKwhStart] = useState({});
  const intervalRef = useRef(null);

  useEffect(() => {
    api.get('/jobs').then(setJobs);
    api.get('/filament/rollen').then(setRollen);
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
      ender_status:    'sensor.ender_3_s1_pro_current_print_state',
      ender_progress:  'sensor.ender_3_s1_pro_progress',
      ender_file:      'sensor.ender_3_s1_pro_filename',
      ender_remaining: 'sensor.ender_3_s1_pro_print_eta',
      ender_layer_cur: 'sensor.ender_3_s1_pro_current_layer',
      ender_layer_tot: 'sensor.ender_3_s1_pro_total_layer',
      ender_filament:  'sensor.ender_3_s1_pro_filament_used',
      ender_elapsed:   'sensor.ender_3_s1_pro_print_duration',
    };

    async function poll() {
      try {
        const results = await Promise.all(
          Object.entries(entities).map(([key, entity]) =>
            api.get(`/ha/state/${entity}`).then(d => [key, d.state]).catch(() => [key, null])
          )
        );
        const s = Object.fromEntries(results);

        let bambuElapsed = 0;
        if (s.bambu_start && s.bambu_start !== 'unavailable') {
          const ms = new Date(s.bambu_start).getTime();
          if (!isNaN(ms)) bambuElapsed = Math.max(0, (Date.now() - ms) / 1000);
        }
        const enderElapsedSec = (parseFloat(s.ender_elapsed) || 0) * 3600;
        let bambuRem = 0;
        if (s.bambu_remaining && s.bambu_remaining !== 'unavailable') bambuRem = parseFloat(s.bambu_remaining) || 0;
        let enderRem = 0;
        if (s.ender_remaining?.includes('T')) {
          const diff = (new Date(s.ender_remaining).getTime() - Date.now()) / 1000;
          if (diff > 0) enderRem = diff;
        }

        setPrinterData({
          bambu: {
            status: s.bambu_status || 'unavailable',
            progress: parseFloat(s.bambu_progress) || 0,
            filename: s.bambu_file,
            elapsed: formatSec(bambuElapsed),
            remaining: formatSec(bambuRem),
            filament: `${parseFloat(s.bambu_filament)?.toFixed(1) || '—'} g`,
            layer: `${s.bambu_layer_cur || '0'} / ${s.bambu_layer_tot || '0'}`,
          },
          ender: {
            status: s.ender_status || 'unavailable',
            progress: parseFloat(s.ender_progress) || 0,
            filename: s.ender_file,
            elapsed: formatSec(enderElapsedSec),
            remaining: formatSec(enderRem),
            filament: `${((parseFloat(s.ender_filament)||0)*2.98).toFixed(1)} g`,
            layer: `${s.ender_layer_cur || '0'} / ${s.ender_layer_tot || '0'}`,
          },
        });
      } catch {}
    }

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const wachtrij = jobs.filter(j => ['gepland','bezig'].includes(j.status));
  const voltooid = jobs.filter(j => j.status === 'voltooid').slice(0, 5);
  const activeRollen = rollen.filter(r => r.actief);

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ fontSize:12, color:'var(--muted)' }}>
          {new Date().toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </span>
      </div>

      {/* Printers */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
        <PrinterMini name="Bambu A1 Mini" data={printerData.bambu} />
        <PrinterMini name="Ender 3 S1 Pro" data={printerData.ender} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1rem' }}>
        {/* Wachtrij */}
        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
            📋 Wachtrij <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400 }}>({wachtrij.length})</span>
          </h2>
          {wachtrij.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen jobs in wachtrij</p>
            : wachtrij.map(j => (
              <div key={j.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                <div>
                  <div style={{ fontWeight:500 }}>{j.naam}</div>
                  <div style={{ color:'var(--muted)' }}>{j.printer_naam}</div>
                </div>
                <span className={`badge ${j.status}`}>{j.status}</span>
              </div>
            ))
          }
        </div>

        {/* Voltooide jobs */}
        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
            ✅ Recent voltooid
          </h2>
          {voltooid.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Nog geen voltooide jobs</p>
            : voltooid.map(j => (
              <div key={j.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                <div>
                  <div style={{ fontWeight:500 }}>{j.naam}</div>
                  <div style={{ color:'var(--muted)' }}>{j.klant_naam || 'Eigen print'}</div>
                </div>
                {j.verkoopprijs != null && (
                  <span style={{ color:'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span>
                )}
              </div>
            ))
          }
        </div>

        {/* Filamentstock */}
        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
            🧵 Filamentstock <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400 }}>({activeRollen.length} rollen)</span>
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
