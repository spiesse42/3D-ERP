import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';
import { usePrinterData } from '../lib/usePrinterData.js';

const KLEUREN_MAP = {
  'Wit':'#f5f5f5','Zwart':'#1a1a1a','Grijs':'#808080','Rood':'#ef4444',
  'Blauw':'#3b82f6','Groen':'#22c55e','Geel':'#eab308','Oranje':'#f97316',
  'Paars':'#a855f7','Roze':'#ec4899','Bruin':'#92400e','Beige':'#d4b896',
  'Zilver':'#c0c0c0','Goud':'#d4af37','Transparant':'#e0f2fe',
};
function KleurDot({ kleur, size = 12 }) {
  const hex = KLEUREN_MAP[kleur] || '#555';
  return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', background:hex, border:'1px solid rgba(255,255,255,0.15)', marginRight:4, verticalAlign:'middle', flexShrink:0 }} />;
}

function StatusDot({ status }) {
  const colors = {
    running:'#ef4444', printing:'#ef4444',
    finish:'#22c55e', complete:'#22c55e', success:'#22c55e',
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

function PrinterCard({ printerId, naam, data, klanten, onJobCreated }) {
  const name    = naam || data?.naam || '—';
  const status  = data?.status || 'unavailable';
  const isRunning = ['running','printing'].includes(status.toLowerCase());
  const isDone    = ['finish','complete','success'].includes(status.toLowerCase());
  const color  = isRunning ? '#ef4444' : isDone ? '#22c55e' : '#f59e0b';
  const pct    = parseFloat(data?.progress) || 0;
  const [showJobForm, setShowJobForm] = useState(false);
  const [klantId, setKlantId] = useState('');
  const [saving, setSaving]   = useState(false);

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
              onClick={() => setShowJobForm(v => !v)}>
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
          ['⏱ Verstreken',  data?.elapsed    || '—'],
          ['⏳ Resterend',  data?.remaining  || '—'],
          ['🧵 Filament',   data?.filament   || '—'],
          ['📐 Laag',       data?.layer      || '—'],
          ['⚡ Vermogen',   data?.watt        != null ? `${data.watt.toFixed(1)} W`  : '—'],
          ['⚡ Δ Verbruikt', data?.kwh_delta  != null ? `${data.kwh_delta.toFixed(3)} kWh` : '—'],
          ['💶 Energiekost', data?.kwh_delta  != null && data?.kwh_prijs
            ? `€${(data.kwh_delta * data.kwh_prijs).toFixed(3)}` : '—'],
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

function OperationeelWidget({ icon, titel, items, renderRij, leegTekst }) {
  return (
    <div className="card" style={{ flex:1, minWidth:0 }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
        {icon} {titel}
        <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>({items.length})</span>
      </h2>
      {items.length === 0
        ? <p style={{ color:'var(--muted)', fontSize:12 }}>{leegTekst}</p>
        : items.map(renderRij)
      }
    </div>
  );
}

export default function Dashboard() {
  const [rollen,       setRollen]       = useState([]);
  const [klanten,      setKlanten]      = useState([]);
  const [operationeel, setOperationeel] = useState({ gepland:[], bezig:[], te_factureren:[] });
  const { printerConfig, printerData }  = usePrinterData();
  const navigate = useNavigate();

  const loadOperationeel = () => api.get('/rapportage/dashboard/operationeel').then(setOperationeel).catch(() => {});

  useEffect(() => {
    loadOperationeel();
    api.get('/filament/rollen').then(setRollen);
    api.get('/klanten').then(setKlanten);
  }, []);

  const activeRollen = rollen.filter(r => r.actief);

  function jobRijStijl() {
    return {
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'7px 8px', borderBottom:'1px solid var(--border)', fontSize:12,
      cursor:'pointer', borderRadius:6,
    };
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ fontSize:12, color:'var(--muted)' }}>
          {new Date().toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </span>
      </div>

      {/* Rij 1: Printerkaarten + operationele widgets */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {printerConfig.map(p => (
          <PrinterCard
            key={p.id}
            printerId={p.id}
            naam={p.naam}
            data={printerData[p.id]}
            klanten={klanten}
            onJobCreated={loadOperationeel}
          />
        ))}

        <OperationeelWidget
          icon="📋" titel="Gepland" leegTekst="Geen jobs in wachtrij"
          items={operationeel.gepland}
          renderRij={j => (
            <div key={j.id} style={jobRijStijl()}
              onClick={() => navigate(`/jobs?highlight=${j.id}`)}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{ fontWeight:500 }}>{j.naam}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{j.printer_naam}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }} onClick={e => e.stopPropagation()}>
                <span style={{ color:'var(--muted)', fontSize:11 }}>{j.klant_naam || '—'}</span>
                <select value={j.status}
                  style={{ fontSize:11, padding:'2px 6px', background:'var(--bg2)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:4 }}
                  onChange={async e => { await api.patch(`/jobs/${j.id}/status`, { status: e.target.value }); loadOperationeel(); }}>
                  {['gepland','bezig','voltooid','gefaald','geannuleerd'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
        />

        <OperationeelWidget
          icon="🖨" titel="Bezig" leegTekst="Geen actieve prints"
          items={operationeel.bezig}
          renderRij={j => (
            <div key={j.id} style={jobRijStijl()}
              onClick={() => navigate(`/jobs?highlight=${j.id}`)}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500 }}>{j.naam}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{j.printer_naam}</div>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <select value={j.status}
                  style={{ fontSize:11, padding:'2px 6px', background:'var(--bg2)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:4 }}
                  onChange={async e => { await api.patch(`/jobs/${j.id}/status`, { status: e.target.value }); loadOperationeel(); }}>
                  {['gepland','bezig','voltooid','gefaald','geannuleerd'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
        />

        <OperationeelWidget
          icon="💶" titel="Te factureren" leegTekst="Niets openstaand"
          items={operationeel.te_factureren}
          renderRij={j => (
            <div key={j.id} style={jobRijStijl()}
              onClick={() => navigate(`/jobs?highlight=${j.id}`)}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{ fontWeight:500 }}>{j.naam}</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{j.klant_naam}</div>
              </div>
              {j.verkoopprijs != null
                ? <span style={{ color:'var(--accent2)', fontWeight:600 }}>€{j.verkoopprijs.toFixed(2)}</span>
                : <span style={{ color:'var(--warn)', fontSize:11 }}>geen prijs</span>
              }
            </div>
          )}
        />
      </div>

      {/* Filamentstock */}
      <div className="card">
        <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>
          🧵 Filamentstock
          <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>({activeRollen.length})</span>
        </h2>
        {activeRollen.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen actieve rollen</p>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'0.5rem' }}>
              {activeRollen.map(r => {
                const pct = Math.min(100, Math.round((r.gewicht_gram_huidig / (r.gewicht_gram_start || 1000)) * 100));
                const kleur = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={r.id} style={{ padding:'6px 8px', background:'var(--bg3)', borderRadius:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                      <span style={{ fontWeight:500, display:'flex', alignItems:'center', gap:4 }}>
                        {r.merk} {r.materiaal}
                        <KleurDot kleur={r.kleur} hex={r.kleur_hex} size={10} />
                        <span style={{ color:'var(--muted)' }}>{r.kleur}</span>
                      </span>
                      <span style={{ color:'var(--muted)' }}>{r.gewicht_gram_huidig}g</span>
                    </div>
                    <div style={{ height:3, background:'var(--bg2)', borderRadius:2 }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:kleur, borderRadius:2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
