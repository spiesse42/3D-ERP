import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const BASE = window.__API_BASE__ || '/api';

export default function KostenModal({ job, printerLiveData, onClose }) {
  const [rollen, setRollen] = useState([]);
  const [tarieven, setTarieven] = useState({});
  const [selectedRol, setSelectedRol] = useState('');
  const [gram, setGram] = useState('');
  const [toegevoegdeMaterialen, setToegevoegdeMaterialen] = useState([]);
  const [result, setResult] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Formulier state
  const [kwh, setKwh] = useState('');
  const [ontwerpMin, setOntwerpMin] = useState(0);
  const [ontwerpTarief, setOntwerpTarief] = useState(15);
  const [nabewerkingExtraMin, setNabewerkingExtraMin] = useState(0);
  const [nabewerkingExtraTarief, setNabewerkingExtraTarief] = useState(15);
  const [extraPerStuk, setExtraPerStuk] = useState(0);
  const [extraEenmalig, setExtraEenmalig] = useState(0);
  const [extraOmschrijving, setExtraOmschrijving] = useState('');
  const [aantal, setAantal] = useState(1);
  const [opmerking, setOpmerking] = useState(job?.notities || '');

  // Live kWh van printer
  const live = printerLiveData;
  const kwhDelta = live?.kwh_delta;

  useEffect(() => {
    api.get('/filament/rollen').then(r => setRollen(r.filter(x => x.actief)));
    api.get('/tarieven').then(rows => {
      const t = Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
      setTarieven(t);
      setOntwerpTarief(t.ontwerp_tarief || 15);
      setNabewerkingExtraTarief(t.nabewerking_tarief || 15);
    });
    // Bestaande materialen laden
    fetch(`${BASE}/jobs/${job.id}`).then(r => r.json()).then(d => {
      if (d.materialen?.length) setToegevoegdeMaterialen(d.materialen);
      if (d.kosten) setResult(d.kosten);
      if (d.notities) setOpmerking(d.notities);
    });
  }, [job.id]);

  // Automatisch kWh invullen vanuit live data
  useEffect(() => {
    if (kwhDelta != null && kwhDelta > 0 && !kwh) {
      setKwh(kwhDelta.toFixed(3));
    }
  }, [kwhDelta]);

  async function voegMateriaaltoe() {
    if (!selectedRol || !gram) return alert('Selecteer een rol en geef gram op');
    try {
      await api.post(`/jobs/${job.id}/materialen`, {
        filament_rol_id: parseInt(selectedRol),
        gram_gebruikt: parseFloat(gram),
      });
      const rol = rollen.find(r => r.id === parseInt(selectedRol));
      setToegevoegdeMaterialen(prev => [...prev, { ...rol, gram_gebruikt: parseFloat(gram) }]);
      setSelectedRol(''); setGram('');
    } catch(e) { alert(e.message); }
  }

  async function bereken() {
    setSaving(true);
    try {
      const r = await api.post(`/kosten/bereken/${job.id}`, {
        kwh_verbruikt:           parseFloat(kwh) || 0,
        ontwerp_min:             ontwerpMin,
        ontwerp_tarief:          ontwerpTarief,
        nabewerking_extra_min:   nabewerkingExtraMin,
        nabewerking_extra_tarief: nabewerkingExtraTarief,
        extra_per_stuk:          parseFloat(extraPerStuk) || 0,
        extra_eenmalig:          parseFloat(extraEenmalig) || 0,
        aantal:                  parseInt(aantal) || 1,
        opmerking,
      });
      setResult(r);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function stuurEmail() {
    if (!emailTo) return alert('Vul een e-mailadres in');
    setEmailStatus('Bezig...');
    try {
      const extra_velden = {
        arb_voorb: (tarieven.voorbereiding_min || 15) / 60 * (tarieven.arbeid_per_uur || 15),
        arb_nab:   (tarieven.nabewerking_min || 10) / 60 * (tarieven.arbeid_per_uur || 15),
        arb_ontw:  (ontwerpMin / 60) * ontwerpTarief,
        arb_nab_extra: (nabewerkingExtraMin / 60) * nabewerkingExtraTarief,
        extra_totaal: (parseFloat(extraPerStuk) * parseInt(aantal)) + parseFloat(extraEenmalig),
        aantal: parseInt(aantal),
      };
      await api.post(`/kosten/email/${job.id}`, { to: emailTo, extra_velden });
      setEmailStatus('✓ Verstuurd!');
      setTimeout(() => setEmailStatus(''), 4000);
    } catch(e) { setEmailStatus('✗ Fout: ' + e.message); }
  }

  const uren = job.print_uren_werkelijk || job.print_uren_geschat || 0;
  const margeGrens = tarieven.marge_grens_uur || 4;
  const margePct = uren >= margeGrens ? (tarieven.marge_groot_pct || 10) : (tarieven.marge_klein_pct || 18);
  const voorbMin = tarieven.voorbereiding_min || 15;
  const nabMin = tarieven.nabewerking_min || 10;
  const arbTarief = tarieven.arbeid_per_uur || 15;

  const Row = ({ label, value, accent, sub }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize:13, color: accent ? 'var(--text)' : 'var(--muted)' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'var(--muted)' }}>{sub}</div>}
      </div>
      <div style={{ fontWeight: accent ? 600 : 400, color: accent ? 'var(--accent2)' : 'var(--text)', fontSize: accent ? 15 : 13 }}>
        {typeof value === 'number' ? `€${value.toFixed(2)}` : value}
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:600, maxHeight:'90vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2>Kostprijs — {job.naam}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:'1rem', display:'flex', gap:16 }}>
          <span>🖨 {job.printer_naam}</span>
          <span>⏱ {uren}u</span>
          <span style={{ color: margePct === 18 ? 'var(--warn)' : 'var(--accent2)' }}>
            📊 Marge: {margePct}% ({uren >= margeGrens ? `>` : `<`}{margeGrens}u)
          </span>
        </div>

        {/* SECTIE 1: Filament */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:8 }}>🧵 Filament</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px auto', gap:8, alignItems:'end', marginBottom:8 }}>
            <select value={selectedRol} onChange={e => setSelectedRol(e.target.value)}>
              <option value="">— selecteer rol —</option>
              {rollen.map(r => <option key={r.id} value={r.id}>{r.merk} {r.materiaal} {r.kleur} ({r.gewicht_gram_huidig}g)</option>)}
            </select>
            <input type="number" placeholder="gram" value={gram} onChange={e => setGram(e.target.value)} />
            <button className="btn primary" onClick={voegMateriaaltoe}>+ Voeg toe</button>
          </div>
          {toegevoegdeMaterialen.length > 0 && (
            <div style={{ fontSize:12, color:'var(--accent2)' }}>
              ✓ {toegevoegdeMaterialen.map(m => `${m.merk || ''} ${m.materiaal || ''} ${m.kleur || ''} — ${m.gram_gebruikt}g`).join(' | ')}
            </div>
          )}
        </div>

        {/* SECTIE 2: Energie */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:8 }}>⚡ Energie</p>
          {live && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8, fontSize:12 }}>
              <div style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px' }}>
                <div style={{ color:'var(--muted)' }}>Start kWh</div>
                <div style={{ fontWeight:600, color:'#fbbf24' }}>{live.kwh_start?.toFixed(3) ?? '—'}</div>
              </div>
              <div style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px' }}>
                <div style={{ color:'var(--muted)' }}>Huidig kWh</div>
                <div style={{ fontWeight:600, color:'#fbbf24' }}>{live.kwh_current?.toFixed(3) ?? '—'}</div>
              </div>
              <div style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px' }}>
                <div style={{ color:'var(--muted)' }}>Δ Verbruikt</div>
                <div style={{ fontWeight:600, color:'#fbbf24' }}>{kwhDelta != null ? `${kwhDelta.toFixed(3)} kWh` : '—'}</div>
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="number" step="0.001" value={kwh} onChange={e => setKwh(e.target.value)}
              placeholder="kWh verbruikt" style={{ flex:1 }} />
            {kwhDelta != null && kwhDelta > 0 && (
              <button className="btn" style={{ fontSize:11, whiteSpace:'nowrap' }}
                onClick={() => setKwh(kwhDelta.toFixed(3))}>
                ↺ Live ({kwhDelta.toFixed(3)})
              </button>
            )}
          </div>
        </div>

        {/* SECTIE 3: Arbeid */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:8 }}>👷 Arbeid</p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, fontSize:12 }}>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)', marginBottom:2 }}>Voorbereiding (standaard)</div>
              <div style={{ fontWeight:600 }}>{voorbMin} min → €{((voorbMin/60)*arbTarief).toFixed(2)}</div>
            </div>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)', marginBottom:2 }}>Nabewerking (standaard)</div>
              <div style={{ fontWeight:600 }}>{nabMin} min → €{((nabMin/60)*arbTarief).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Ontwerp (min)</label>
              <input type="number" min="0" value={ontwerpMin} onChange={e => setOntwerpMin(parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief ontwerp (€/u)</label>
              <input type="number" min="0" value={ontwerpTarief} onChange={e => setOntwerpTarief(parseFloat(e.target.value)||15)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {ontwerpMin > 0 ? `→ €${((ontwerpMin/60)*ontwerpTarief).toFixed(2)}` : ''}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Nabewerking extra (min)</label>
              <input type="number" min="0" value={nabewerkingExtraMin} onChange={e => setNabewerkingExtraMin(parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief nabewerking (€/u)</label>
              <input type="number" min="0" value={nabewerkingExtraTarief} onChange={e => setNabewerkingExtraTarief(parseFloat(e.target.value)||15)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {nabewerkingExtraMin > 0 ? `→ €${((nabewerkingExtraMin/60)*nabewerkingExtraTarief).toFixed(2)}` : ''}
            </div>
          </div>
        </div>

        {/* SECTIE 4: Extra kosten */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:8 }}>➕ Extra kosten</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Aantal stuks</label>
              <input type="number" min="1" value={aantal} onChange={e => setAantal(parseInt(e.target.value)||1)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Extra/stuk (€) × aantal</label>
              <input type="number" min="0" step="0.01" value={extraPerStuk} onChange={e => setExtraPerStuk(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Extra eenmalig (€)</label>
              <input type="number" min="0" step="0.01" value={extraEenmalig} onChange={e => setExtraEenmalig(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label style={{ fontSize:11 }}>Omschrijving extra (bv. ringetjes, nozzle...)</label>
            <input value={extraOmschrijving} onChange={e => setExtraOmschrijving(e.target.value)} placeholder="bv. 20 ringetjes + 1 nozzle 0.2mm" />
          </div>
        </div>

        {/* SECTIE 5: Opmerking */}
        <div className="form-group" style={{ marginBottom:'1rem' }}>
          <label>📝 Opmerking (verschijnt op kostprijsoverzicht)</label>
          <textarea rows={2} value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="bv. Kleur op aanvraag klant, extra support verwijderd..." />
        </div>

        {/* BEREKEN KNOP */}
        <button className="btn primary" style={{ width:'100%', marginBottom:'1rem', padding:'10px' }}
          onClick={bereken} disabled={saving}>
          {saving ? 'Berekenen...' : '🧮 Bereken kostprijs'}
        </button>

        {/* RESULTAAT */}
        {result && (
          <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
            <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:8 }}>📊 Kostprijsoverzicht</p>
            <Row label="Materiaal" sub={`incl. ${result.faalfactor_pct}% faalfactor`} value={result.materiaal_kost} />
            <Row label="Energie" sub={`${result.kwh_verbruikt} kWh × €${tarieven.kwh_prijs || 0.35}/kWh`} value={result.energie_kost} />
            <Row label={`Voorbereiding (${voorbMin} min)`} value={(voorbMin/60)*arbTarief} />
            <Row label={`Nabewerking (${nabMin} min)`} value={(nabMin/60)*arbTarief} />
            {ontwerpMin > 0 && <Row label={`Ontwerp regie (${ontwerpMin} min)`} value={(ontwerpMin/60)*ontwerpTarief} />}
            {nabewerkingExtraMin > 0 && <Row label={`Nabewerking extra (${nabewerkingExtraMin} min)`} value={(nabewerkingExtraMin/60)*nabewerkingExtraTarief} />}
            {(parseFloat(extraPerStuk) > 0 || parseFloat(extraEenmalig) > 0) && (
              <Row label={`Extra kosten${extraOmschrijving ? ` — ${extraOmschrijving}` : ''}`}
                value={(parseFloat(extraPerStuk)*parseInt(aantal)) + parseFloat(extraEenmalig)} />
            )}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:12 }}>
              <span>Subtotaal</span><span>€{result.totaal_kost?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:12 }}>
              <span>Winstmarge ({result.winstmarge_pct}%)</span>
              <span>€{((result.verkoopprijs||0) - (result.totaal_kost||0)).toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0 4px', fontWeight:700 }}>
              <span style={{ fontSize:15 }}>Verkoopprijs{aantal > 1 ? ` (${aantal}x)` : ''}</span>
              <span style={{ fontSize:24, color:'var(--accent2)' }}>€{result.verkoopprijs?.toFixed(2)}</span>
            </div>
            {aantal > 1 && (
              <div style={{ textAlign:'right', fontSize:12, color:'var(--muted)' }}>
                €{(result.verkoopprijs / aantal).toFixed(2)} per stuk
              </div>
            )}

            {/* PDF + EMAIL */}
            <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
              <a className="btn" style={{ textAlign:'center' }}
                href={`${BASE}/kosten/pdf/${job.id}?arb_voorb=${(voorbMin/60)*arbTarief}&arb_nab=${(nabMin/60)*arbTarief}&arb_ontw=${(ontwerpMin/60)*ontwerpTarief}&arb_nab_extra=${(nabewerkingExtraMin/60)*nabewerkingExtraTarief}&extra_totaal=${(parseFloat(extraPerStuk)*parseInt(aantal))+parseFloat(extraEenmalig)}&aantal=${aantal}`}
                download>
                ↓ PDF downloaden
              </a>
              <div style={{ display:'flex', gap:8 }}>
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
                  placeholder="E-mailadres klant" style={{ flex:1 }} />
                <button className="btn primary" onClick={stuurEmail}>✉ Verstuur</button>
              </div>
              {emailStatus && <div style={{ fontSize:12, color: emailStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)' }}>{emailStatus}</div>}
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}
