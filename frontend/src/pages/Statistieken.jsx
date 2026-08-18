import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { kleurHex } from '../lib/kleuren.js';

function KleurDot({ kleur }) {
  return <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:kleurHex(kleur), border:'1px solid rgba(255,255,255,0.15)', marginRight:6, verticalAlign:'middle' }} />;
}

function BalkGrafiek({ data, labelKey, waardeKey, kleur = 'var(--accent)', eenheid = '' }) {
  if (!data?.length) return <p style={{ color:'var(--muted)', fontSize:13 }}>Geen data beschikbaar.</p>;
  const max = Math.max(...data.map(r => r[waardeKey] || 0)) || 1;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {data.map((r, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, fontSize:12 }}>
          <div style={{ width:140, textAlign:'right', color:'var(--muted)', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {r[labelKey]}
          </div>
          <div style={{ flex:1, height:16, background:'var(--bg3)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ width:`${(r[waardeKey] / max) * 100}%`, height:'100%', background:kleur, borderRadius:4, transition:'width 0.3s' }} />
          </div>
          <div style={{ width:80, color:'var(--text)', fontWeight:500 }}>
            {r[waardeKey]}{eenheid}
          </div>
        </div>
      ))}
    </div>
  );
}

function Sectie({ titel, children }) {
  return (
    <div className="card" style={{ marginBottom:'1.5rem' }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>{titel}</h2>
      {children}
    </div>
  );
}

function TabKnop({ label, actief, onClick }) {
  return (
    <button className={`btn${actief ? ' primary' : ''}`} style={{ fontSize:11, padding:'3px 10px' }} onClick={onClick}>
      {label}
    </button>
  );
}

export default function Statistieken() {
  const [dash,        setDash]        = useState(null);
  const [filament,    setFilament]    = useState([]);
  const [perPrinter,  setPerPrinter]  = useState([]);
  const [perMaand,    setPerMaand]    = useState([]);
  const [kwh,         setKwh]         = useState(null);
  const [kwhTab,      setKwhTab]      = useState('maand');

  useEffect(() => {
    api.get('/rapportage/dashboard').then(setDash).catch(() => {});
    api.get('/rapportage/stats/filament').then(setFilament).catch(() => {});
    api.get('/rapportage/stats/jobs-per-printer').then(setPerPrinter).catch(() => {});
    api.get('/rapportage/stats/jobs-per-maand').then(d => setPerMaand([...d].reverse())).catch(() => {});
    api.get('/rapportage/stats/kwh').then(setKwh).catch(() => {});
  }, []);

  const kwhData = kwhTab === 'dag'   ? kwh?.per_dag
               : kwhTab === 'maand' ? kwh?.per_maand
               : kwh?.per_jaar;

  return (
    <div>
      <div className="page-header"><h1>Statistieken</h1></div>

      {/* Top 10 filament + kleur */}
      <Sectie titel="🧵 Top 10 meest gebruikt filament & kleur">
        {filament.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>Nog geen jobmateriaal geregistreerd.</p>
          : <table>
              <thead>
                <tr><th>Merk</th><th>Materiaal</th><th>Kleur</th><th>Jobs</th><th>Gram totaal</th></tr>
              </thead>
              <tbody>
                {filament.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:500 }}>{r.merk}</td>
                    <td>{r.materiaal}</td>
                    <td>
                      <KleurDot kleur={r.kleur} />
                      {r.kleur || <span style={{ color:'var(--muted)' }}>—</span>}
                    </td>
                    <td>{r.aantal_jobs}</td>
                    <td style={{ color:'var(--accent2)' }}>{r.gram_totaal}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </Sectie>

      {/* Jobs per printer */}
      <Sectie titel="🖨 Jobs per printer">
        {perPrinter.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>Geen jobs gevonden.</p>
          : <table>
              <thead>
                <tr><th>Printer</th><th>Totaal</th><th>Voltooid</th><th>Gefaald</th><th>Slaagkans</th></tr>
              </thead>
              <tbody>
                {perPrinter.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:500 }}>{r.printer}</td>
                    <td>{r.totaal}</td>
                    <td style={{ color:'var(--accent2)' }}>{r.voltooid}</td>
                    <td style={{ color:'#ef4444' }}>{r.gefaald}</td>
                    <td>{r.totaal > 0 ? `${Math.round((r.voltooid / r.totaal) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </Sectie>

      {/* Jobs per maand */}
      <Sectie titel="📅 Jobs per maand">
        <BalkGrafiek
          data={perMaand}
          labelKey="maand"
          waardeKey="totaal"
          kleur="var(--accent)"
        />
        {perMaand.length > 0 && (
          <table style={{ marginTop:'1rem' }}>
            <thead>
              <tr><th>Maand</th><th>Totaal</th><th>Voltooid</th><th>Gefaald</th><th>Geannuleerd</th></tr>
            </thead>
            <tbody>
              {[...perMaand].reverse().map((r, i) => (
                <tr key={i}>
                  <td>{r.maand}</td>
                  <td style={{ fontWeight:500 }}>{r.totaal}</td>
                  <td style={{ color:'var(--accent2)' }}>{r.voltooid}</td>
                  <td style={{ color:'#ef4444' }}>{r.gefaald}</td>
                  <td style={{ color:'var(--muted)' }}>{r.geannuleerd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sectie>

      {/* kWh */}
      <Sectie titel="⚡ Energieverbruik (kWh)">
        <div style={{ display:'flex', gap:6, marginBottom:'1rem' }}>
          {['dag','maand','jaar'].map(t => (
            <TabKnop key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} actief={kwhTab === t} onClick={() => setKwhTab(t)} />
          ))}
        </div>
        <BalkGrafiek
          data={kwhData || []}
          labelKey={kwhTab === 'dag' ? 'dag' : kwhTab === 'maand' ? 'maand' : 'jaar'}
          waardeKey="kwh"
          kleur="#fbbf24"
          eenheid=" kWh"
        />
      </Sectie>

      {/* Omzet per maand */}
      <Sectie titel="💶 Omzet per maand">
        {(dash?.omzet_maand || []).length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>Nog geen voltooide jobs met kostprijs.</p>
          : <>
              <BalkGrafiek
                data={[...(dash?.omzet_maand || [])].reverse()}
                labelKey="maand"
                waardeKey="omzet"
                kleur="var(--accent2)"
                eenheid=" €"
              />
              <table style={{ marginTop:'1rem' }}>
                <thead>
                  <tr><th>Maand</th><th>Jobs</th><th>Omzet</th><th>Kost</th><th>Marge</th><th>kWh</th></tr>
                </thead>
                <tbody>
                  {dash.omzet_maand.map(m => (
                    <tr key={m.maand}>
                      <td>{m.maand}</td>
                      <td>{m.jobs}</td>
                      <td style={{ color:'var(--accent2)' }}>€{m.omzet?.toFixed(2)}</td>
                      <td>€{m.kost?.toFixed(2)}</td>
                      <td style={{ color:'var(--accent2)' }}>
                        {m.omzet > 0 ? `${Math.round((m.omzet - m.kost) / m.omzet * 100)}%` : '—'}
                      </td>
                      <td>{m.kwh?.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
        }
      </Sectie>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <a className="btn" href="/api/rapportage/csv/jobs" download>↓ Jobs exporteren (CSV)</a>
      </div>
    </div>
  );
}
