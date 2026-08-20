import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';
import { usePrinterData } from '../lib/usePrinterData.js';
import KleurDot from '../components/KleurDot.jsx';

function OperationeelWidget({ icon, titel, items, renderRij, leegTekst }) {
  const PER_PAGINA = 5;
  const [pagina, setPagina] = React.useState(0);
  const totaal = items.length;
  const totaalPaginas = Math.ceil(totaal / PER_PAGINA);
  const zichtbaar = items.slice(pagina * PER_PAGINA, (pagina + 1) * PER_PAGINA);

  // Reset pagina als items wijzigen
  React.useEffect(() => { setPagina(0); }, [totaal]);

  return (
    <div className="card" style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
        <h2 style={{ fontSize:14, fontWeight:600, margin:0 }}>
          {icon} {titel}
          <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>({totaal})</span>
        </h2>
        {totaalPaginas > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)' }}>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === 0 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>←</button>
            <span>{pagina + 1}/{totaalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totaalPaginas-1, p+1))} disabled={pagina === totaalPaginas-1}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === totaalPaginas-1 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>→</button>
          </div>
        )}
      </div>
      <div style={{ flex:1, minHeight:200 }}>
        {totaal === 0
          ? <p style={{ color:'var(--muted)', fontSize:12 }}>{leegTekst}</p>
          : zichtbaar.map(renderRij)
        }
      </div>
    </div>
  );
}

function FacturatieSamenvattingWidget({ aantal, totaal, navigate }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 0.75rem 0' }}>💶 Controle / Facturatie</h2>
        {aantal === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 12 }}>Niets openstaand</p>
          : <>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--warn)' }}>€{totaal.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{aantal} {aantal === 1 ? 'job' : 'jobs'} nog te innen</div>
            </>
        }
      </div>
      <button className="btn" style={{ marginTop: '0.75rem', alignSelf: 'flex-start' }}
        onClick={() => navigate('/financien?tab=facturatie')}>
        Naar Facturatie →
      </button>
    </div>
  );
}

function TeBestellenWidget({ rollen, navigate }) {
  const PER_PAGINA = 10;
  const [pagina, setPagina] = React.useState(0);

  const drempel = (r) => (r.gewicht_gram_start || 1000) <= 200 ? 50 : 100;
  const laag = rollen.filter(r => r.gewicht_gram_huidig < drempel(r));

  const totaalPaginas = Math.ceil(laag.length / PER_PAGINA);
  const zichtbaar = laag.slice(pagina * PER_PAGINA, (pagina + 1) * PER_PAGINA);

  return (
    <div className="card" style={{ flex:1, minWidth:220, border: laag.length > 0 ? '1px solid rgba(239,68,68,0.3)' : undefined }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
        <h2 style={{ fontSize:14, fontWeight:600, margin:0 }}>
          ⚠️ Te bestellen
          <span style={{ fontSize:12, color: laag.length > 0 ? '#ef4444' : 'var(--muted)', fontWeight:600, marginLeft:6 }}>({laag.length})</span>
        </h2>
        {totaalPaginas > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)' }}>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === 0 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>←</button>
            <span>{pagina + 1}/{totaalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totaalPaginas-1, p+1))} disabled={pagina === totaalPaginas-1}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === totaalPaginas-1 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>→</button>
          </div>
        )}
      </div>
      {laag.length === 0
        ? <p style={{ color:'var(--muted)', fontSize:12 }}>Niets onder de drempel</p>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:'0.4rem' }}>
            {zichtbaar.map(r => (
              <div key={r.id}
                onClick={() => navigate(`/filament?highlight=${r.id}`)}
                style={{ padding:'6px 8px', background:'rgba(239,68,68,0.1)', borderRadius:6, cursor:'pointer', border:'1px solid rgba(239,68,68,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,0.1)'}>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:1 }}>
                  <KleurDot kleur={r.kleur} hex={r.kleur_hex} size={8} />
                  <span style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.kleur}</span>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.merk} {r.materiaal}</div>
                <div style={{ fontSize:12, fontWeight:700, color:'#ef4444', marginBottom:2 }}>{Math.ceil(r.gewicht_gram_huidig)}g</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>drempel: {drempel(r)}g</div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function FilamentStockWidget({ rollen, navigate }) {
  const PER_PAGINA = 10;
  const [pagina, setPagina] = React.useState(0);
  const totaalPaginas = Math.ceil(rollen.length / PER_PAGINA);
  const zichtbaar = rollen.slice(pagina * PER_PAGINA, (pagina + 1) * PER_PAGINA);

  return (
    <div className="card" style={{ flex:1, minWidth:220 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
        <h2 style={{ fontSize:14, fontWeight:600, margin:0 }}>
          🧵 Filamentstock
          <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400, marginLeft:6 }}>({rollen.length})</span>
        </h2>
        {totaalPaginas > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)' }}>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === 0 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>←</button>
            <span>{pagina + 1}/{totaalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totaalPaginas-1, p+1))} disabled={pagina === totaalPaginas-1}
              style={{ background:'none', border:'none', cursor:'pointer', color: pagina === totaalPaginas-1 ? 'var(--border)' : 'var(--text)', fontSize:14, padding:'0 2px' }}>→</button>
          </div>
        )}
      </div>
      {rollen.length === 0
        ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen actieve rollen</p>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:'0.4rem' }}>
            {zichtbaar.map(r => {
              const pct = Math.min(100, Math.round((r.gewicht_gram_huidig / (r.gewicht_gram_start || 1000)) * 100));
              const kleur = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
              return (
                <div key={r.id}
                  onClick={() => navigate(`/filament?highlight=${r.id}`)}
                  style={{ padding:'6px 8px', background:'var(--bg3)', borderRadius:6, cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background='var(--bg3)'}>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:1 }}>
                    <KleurDot kleur={r.kleur} hex={r.kleur_hex} size={8} />
                    <span style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.kleur}</span>
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.merk} {r.materiaal}</div>
                  <div style={{ fontSize:12, fontWeight:500, marginBottom:4 }}>{Math.ceil(r.gewicht_gram_huidig)}g</div>
                  <div style={{ height:3, background:'var(--bg2)', borderRadius:2 }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:kleur, borderRadius:2 }} />
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ─── Compacte printerstatus (géén live telemetrie meer — dat hoort bij Jobs) ──
function PrinterStatusStrip({ printerConfig, printerData, navigate }) {
  return (
    <div className="card" style={{ flex:1, minWidth:220 }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>🖨 Printers</h2>
      {printerConfig.length === 0
        ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen printers geconfigureerd</p>
        : <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {printerConfig.map(p => {
              const d = printerData[p.id] || {};
              const statusLower = (d.status || '').toLowerCase();
              const isActief = ['running','printing','prepare'].includes(statusLower);
              const isOnbekend = !d.status || statusLower === 'unavailable';
              const kleur = isActief ? 'var(--accent2)' : isOnbekend ? 'var(--muted)' : '#f59e0b';
              return (
                <div key={p.id} onClick={() => navigate('/jobs')}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 4px', borderRadius:6 }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:kleur, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{p.naam}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {isActief ? (d.filename || 'aan het printen') : (d.status || 'onbekend')}
                    </div>
                  </div>
                  {isActief && d.progress != null && (
                    <span style={{ fontSize:11, color:'var(--accent2)', fontWeight:600, flexShrink:0 }}>{Math.round(d.progress)}%</span>
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

function MiniDrempel({ label, ytd, drempel }) {
  const pct = drempel > 0 ? Math.min(100, Math.round((ytd / drempel) * 100)) : 0;
  const kleur = pct >= 100 ? '#ef4444' : pct >= 80 ? 'var(--warn)' : 'var(--accent2)';
  return (
    <div style={{ marginBottom:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:2 }}>
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div style={{ height:5, background:'var(--bg3)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:kleur, borderRadius:3, transition:'width 0.3s' }} />
      </div>
    </div>
  );
}

// ─── Financieel: samengevat uit Financiën-pagina, niet gedupliceerd in detail ──
function FinancieelWidget({ navigate }) {
  const [maand, setMaand]       = useState(null);
  const [drempels, setDrempels] = useState(null);

  useEffect(() => {
    const huidigeMaand = new Date().toISOString().slice(0, 7);
    api.get('/rapportage/stats/financien')
      .then(rijen => setMaand(rijen.find(r => r.maand === huidigeMaand) || null))
      .catch(() => {});
    api.get('/rapportage/drempels').then(setDrempels).catch(() => {});
  }, []);

  return (
    <div className="card" style={{ flex:1, minWidth:240, display:'flex', flexDirection:'column' }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.75rem' }}>💰 Financieel</h2>
      <div style={{ display:'flex', gap:16, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Omzet deze maand</div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--accent2)' }}>€{(maand?.inkomsten || 0).toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Saldo deze maand</div>
          <div style={{ fontSize:18, fontWeight:700, color: (maand?.saldo || 0) >= 0 ? 'var(--accent2)' : '#ef4444' }}>
            €{(maand?.saldo || 0).toFixed(2)}
          </div>
        </div>
      </div>
      {drempels && (
        <>
          <MiniDrempel label="Omzetdrempel bijberoep" ytd={drempels.omzet.ytd} drempel={drempels.omzet.drempel_prorated} />
          <MiniDrempel label="Winstdrempel bijberoep" ytd={drempels.winst.ytd} drempel={drempels.winst.drempel_prorated} />
        </>
      )}
      <button className="btn" style={{ marginTop:'auto', alignSelf:'flex-start', fontSize:11, padding:'4px 8px' }}
        onClick={() => navigate('/financien')}>
        Naar Financiën →
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [rollen,       setRollen]       = useState([]);
  const [operationeel, setOperationeel] = useState({ gepland:[], bezig:[], voltooid:[], controle_facturatie:[], controle_facturatie_totaal:0 });
  const [loading,      setLoading]      = useState(true);
  // usePrinterData blijft actief op Dashboard (ook al tonen we geen volledige
  // printerkaarten meer) — de hook doet op de achtergrond ook auto-detectie
  // van voltooide/mislukte prints en optionele auto-jobaanmaak. Die logica
  // moet blijven lopen ongeacht welke pagina open staat.
  const { printerConfig, printerData } = usePrinterData();
  const navigate = useNavigate();

  const loadOperationeel = () => api.get('/rapportage/dashboard/operationeel')
    .then(d => { setOperationeel(d); })
    .catch(() => {});

  useEffect(() => {
    api.get('/rapportage/dashboard/operationeel')
      .then(d => { setOperationeel(d); setLoading(false); })
      .catch(() => setLoading(false));
    api.get('/filament/rollen').then(setRollen).catch(() => {});

    // Periodiek herladen zodat statuswijzigingen (finish, cancel) direct zichtbaar zijn
    const interval = setInterval(loadOperationeel, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeRollen = rollen.filter(r => r.actief);

  function jobRijStijl() {
    return {
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'7px 8px', borderBottom:'1px solid var(--border)', fontSize:12,
      cursor:'pointer', borderRadius:6,
    };
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)', fontSize:14 }}>
      ⏳ Dashboard laden...
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ fontSize:12, color:'var(--muted)' }}>
          {new Date().toLocaleDateString('nl-BE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </span>
      </div>

      {/* Rij 1: Wat gebeurt er nu */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        <PrinterStatusStrip printerConfig={printerConfig} printerData={printerData} navigate={navigate} />

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
                  {['in te plannen','gepland','bezig','voltooid','gefaald','geannuleerd'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}
        />

        <FinancieelWidget navigate={navigate} />
      </div>

      {/* Rij 2: Vraagt jouw aandacht */}
      <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        <FilamentStockWidget rollen={activeRollen} navigate={navigate} />
        <TeBestellenWidget rollen={activeRollen} navigate={navigate} />
        <FacturatieSamenvattingWidget
          aantal={operationeel.controle_facturatie.length}
          totaal={operationeel.controle_facturatie_totaal || 0}
          navigate={navigate}
        />
      </div>
    </div>
  );
}
