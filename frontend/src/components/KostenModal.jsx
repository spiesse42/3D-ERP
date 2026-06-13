import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

const BASE = window.__API_BASE__ || '/api';

export default function KostenModal({ job, printerLiveData, klanten, onClose, onJobUpdated }) {
  const [rollen,          setRollen]          = useState([]);
  const [tarieven,        setTarieven]        = useState({});
  const [selectedRol,     setSelectedRol]     = useState('');
  const [gram,            setGram]            = useState('');
  const [materialen,      setMaterialen]      = useState([]);
  const [result,          setResult]          = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [emailTo,         setEmailTo]         = useState('');
  const [emailStatus,     setEmailStatus]     = useState('');
  const [selectedKlantId, setSelectedKlantId] = useState(String(job.klant_id || ''));
  const [autoCalc,        setAutoCalc]        = useState(false);

  // Printtijd
  const [printUren, setPrintUren] = useState(Math.floor(job.print_uren_werkelijk || job.print_uren_geschat || 0));
  const [printMin,  setPrintMin]  = useState(Math.round(((job.print_uren_werkelijk || job.print_uren_geschat || 0) % 1) * 60));

  // Arbeid — aanpasbare minuten
  const [voorbMin,          setVoorbMin]          = useState(0);   // wordt ingesteld na laden tarieven
  const [nabMin,            setNabMin]            = useState(0);
  const [extraVoorbMin,     setExtraVoorbMin]     = useState(0);
  const [ontwerpMin,        setOntwerpMin]        = useState(0);
  const [ontwerpTarief,     setOntwerpTarief]     = useState(15);
  const [nabewerkingExtraMin,   setNabewerkingExtraMin]   = useState(0);
  const [nabewerkingExtraTarief,setNabewerkingExtraTarief]= useState(15);

  // Overige
  const [isMulticolor,    setIsMulticolor]    = useState(!!job.is_multicolor);
  const [extraPerStuk,    setExtraPerStuk]    = useState(0);
  const [extraEenmalig,   setExtraEenmalig]   = useState(0);
  const [extraOmschrijving,setExtraOmschrijving]= useState('');
  const [aantal,          setAantal]          = useState(1);
  const [opmerking,       setOpmerking]       = useState(job.notities || '');
  const [kwh,             setKwh]             = useState('');
  const [tarievenGeladen, setTarievenGeladen] = useState(false);

  const live     = printerLiveData;
  const kwhDelta = live?.kwh_delta;
  const liveGram = live?.filament_g || 0;

  // Verstreken tijd — Ender geeft seconden via elapsed_sec
  const liveElapsedSec = live?.elapsed_sec || 0;
  const liveElapsedU   = Math.floor(liveElapsedSec / 3600);
  const liveElapsedMin = Math.floor((liveElapsedSec % 3600) / 60);

  useEffect(() => {
    api.get('/filament/rollen').then(r => setRollen(r.filter(x => x.actief)));
    api.get('/tarieven').then(rows => {
      const t = Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
      setTarieven(t);
      setVoorbMin(t.voorbereiding_min || 15);
      setNabMin(t.nabewerking_min || 10);
      setOntwerpTarief(t.ontwerp_tarief || 15);
      setNabewerkingExtraTarief(t.nabewerking_tarief || 15);
      setTarievenGeladen(true);
    });
    api.get(`/jobs/${job.id}`).then(d => {
      if (d.materialen?.length) setMaterialen(d.materialen);
      if (d.kosten) setResult(d.kosten);
      if (d.notities) setOpmerking(d.notities);
    }).catch(() => {});
  }, [job.id]);

  useEffect(() => {
    if (kwhDelta != null && kwhDelta > 0 && !kwh) setKwh(kwhDelta.toFixed(3));
  }, [kwhDelta]);

  const formValues = JSON.stringify({ printUren, printMin, kwh, isMulticolor, voorbMin, nabMin,
    extraVoorbMin, ontwerpMin, ontwerpTarief, nabewerkingExtraMin, nabewerkingExtraTarief,
    extraPerStuk, extraEenmalig, aantal, materialen });

  useEffect(() => {
    if (!autoCalc || !tarievenGeladen) return;
    const timer = setTimeout(() => { bereken(false); }, 800);
    return () => clearTimeout(timer);
  }, [formValues, autoCalc, tarievenGeladen]);

  async function voegMateriaaltoe() {
    if (!selectedRol || !gram) return alert('Selecteer een rol en geef gram op');
    try {
      const rol = rollen.find(r => r.id === parseInt(selectedRol));
      const res = await api.post(`/jobs/${job.id}/materialen`, {
        filament_rol_id: parseInt(selectedRol),
        gram_gebruikt: parseFloat(gram),
      });
      setMaterialen(prev => [...prev, { ...rol, id: res.id, filament_rol_id: parseInt(selectedRol), gram_gebruikt: parseFloat(gram) }]);
      setSelectedRol(''); setGram('');
    } catch(e) { alert(e.message); }
  }

  async function verwijderMateriaal(matId) {
    try {
      await api.delete(`/jobs/${job.id}/materialen/${matId}`);
      setMaterialen(prev => prev.filter(m => m.id !== matId));
    } catch(e) { alert(e.message); }
  }

  async function koppelKlant() {
    if (!selectedKlantId) return;
    try {
      await api.put(`/jobs/${job.id}`, { ...job, klant_id: parseInt(selectedKlantId) });
      if (onJobUpdated) onJobUpdated();
    } catch(e) { alert(e.message); }
  }

  const getPayload = () => ({
    kwh_verbruikt: parseFloat(kwh) || 0,
    is_multicolor: isMulticolor,
    voorbereiding_min: (voorbMin || 0) + (extraVoorbMin || 0),
    nabewerking_min: nabMin || 0,
    ontwerp_min: ontwerpMin, ontwerp_tarief: ontwerpTarief,
    nabewerking_extra_min: nabewerkingExtraMin,
    nabewerking_extra_tarief: nabewerkingExtraTarief,
    extra_per_stuk: parseFloat(extraPerStuk) || 0,
    extra_eenmalig: parseFloat(extraEenmalig) || 0,
    aantal: parseInt(aantal) || 1,
    opmerking,
    print_uren: parseInt(printUren) + parseInt(printMin) / 60,
  });

  async function bereken(manual = true) {
    if (manual) setSaving(true);
    try {
      await api.put(`/jobs/${job.id}`, {
        ...job,
        klant_id: selectedKlantId ? parseInt(selectedKlantId) : job.klant_id,
        print_uren_werkelijk: parseInt(printUren) + parseInt(printMin) / 60,
      });
      const r = await api.post(`/kosten/bereken/${job.id}`, getPayload());
      setResult(r);
      if (onJobUpdated) onJobUpdated();
    } catch(e) { if (manual) alert(e.message); }
    finally { if (manual) setSaving(false); }
  }

  async function stuurEmail() {
    if (!emailTo) return alert('Vul een e-mailadres in');
    setEmailStatus('Bezig...');
    try {
      await api.post(`/kosten/email/${job.id}`, { to: emailTo, extra_velden: { aantal: parseInt(aantal) } });
      setEmailStatus('✓ Verstuurd!');
      setTimeout(() => setEmailStatus(''), 4000);
    } catch(e) { setEmailStatus('✗ ' + e.message); }
  }

  const t          = tarieven;
  const arbTarief  = t.arbeid_per_uur || 15;
  const totaleUren = parseInt(printUren) + parseInt(printMin) / 60;
  const margeGrens = t.marge_grens_uur || 4;
  const margePct   = totaleUren >= margeGrens ? (t.marge_groot_pct || 10) : (t.marge_klein_pct || 18);
  const totVoorb   = (parseInt(voorbMin) || 0) + (parseInt(extraVoorbMin) || 0);

  const matGroepen = materialen.reduce((acc, m) => {
    const key = `${m.merk || ''} ${m.materiaal || ''} ${m.kleur || ''}`.trim();
    if (!acc[key]) acc[key] = { items:[], gram_totaal:0, prijs: m.prijs_per_kg_effectief || m.inkoop_prijs_per_kg || 0, naam: key };
    acc[key].items.push(m);
    acc[key].gram_totaal += parseFloat(m.gram_gebruikt);
    return acc;
  }, {});

  const Field = ({ label, children }) => (
    <div className="form-group" style={{ marginBottom:0 }}>
      <label style={{ fontSize:11 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:580, maxHeight:'93vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2 style={{ fontSize:14 }}>Werkbon — {job.naam}</h2>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:4, cursor:'pointer', color:'var(--muted)' }}>
              <input type="checkbox" checked={autoCalc} onChange={e => setAutoCalc(e.target.checked)} />
              Auto
            </label>
            <button className="btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:'0.75rem', display:'flex', gap:12, flexWrap:'wrap' }}>
          <span>🖨 {job.printer_naam}</span>
          <span style={{ color: margePct === (t.marge_klein_pct || 18) ? 'var(--warn)' : 'var(--accent2)' }}>
            📊 {margePct}% marge ({totaleUren >= margeGrens ? '≥' : '<'}{margeGrens}u)
          </span>
        </div>

        {/* KLANT */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>👤 Klant</label>
              <select value={selectedKlantId} onChange={e => setSelectedKlantId(e.target.value)}>
                <option value="">— voor mezelf —</option>
                {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
              </select>
            </div>
            {selectedKlantId !== String(job.klant_id || '') && selectedKlantId && (
              <button className="btn primary" style={{ fontSize:11 }} onClick={koppelKlant}>Koppelen</button>
            )}
          </div>
        </div>

        {/* PRINTTIJD */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'flex-end' }}>
            <Field label="⏱ Uren">
              <input type="number" min="0" value={printUren} onChange={e => setPrintUren(parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Minuten">
              <input type="number" min="0" max="59" value={printMin} onChange={e => setPrintMin(parseInt(e.target.value) || 0)} />
            </Field>
            {liveElapsedSec > 0 && (
              <button className="btn" style={{ fontSize:11, whiteSpace:'nowrap' }}
                onClick={() => { setPrintUren(liveElapsedU); setPrintMin(liveElapsedMin); }}
                title="Verstreken tijd overnemen van printer">
                ↺ {liveElapsedU}u {liveElapsedMin}m
              </button>
            )}
          </div>
        </div>

        {/* FILAMENT */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <p style={{ fontSize:12, fontWeight:600, margin:0 }}>🧵 Filament</p>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={isMulticolor} onChange={e => setIsMulticolor(e.target.checked)} />
              Multicolor (BMCU +€{t.bmcu_per_job || 0.10})
            </label>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 90px auto auto', gap:6, alignItems:'end', marginBottom:8 }}>
            <select value={selectedRol} onChange={e => setSelectedRol(e.target.value)} style={{ fontSize:12 }}>
              <option value="">— selecteer rol —</option>
              {rollen.map(r => (
                <option key={r.id} value={r.id}>
                  {r.lotnummer || `Rol #${r.id}`} — {r.merk} {r.materiaal} {r.kleur} — {r.gewicht_gram_huidig}g
                </option>
              ))}
            </select>
            <input type="number" placeholder="gram" value={gram} onChange={e => setGram(e.target.value)} style={{ fontSize:12 }} />
            {liveGram > 0 && (
              <button className="btn" style={{ fontSize:10, padding:'4px 6px', whiteSpace:'nowrap' }}
                title="Live gewicht overnemen" onClick={() => setGram(liveGram.toFixed(1))}>
                ↺ {liveGram.toFixed(1)}g
              </button>
            )}
            <button className="btn primary" style={{ fontSize:11 }} onClick={voegMateriaaltoe}>+ Voeg toe</button>
          </div>

          {Object.values(matGroepen).map(mg => (
            <div key={mg.naam} style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px', marginBottom:4, fontSize:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <span style={{ fontWeight:500 }}>{mg.naam}</span>
                  <span style={{ color:'var(--muted)', marginLeft:8 }}>
                    {mg.gram_totaal.toFixed(1)}g → €{((mg.gram_totaal / 1000) * mg.prijs).toFixed(3)}
                  </span>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {mg.items.map(m => (
                    <button key={m.id} onClick={() => verwijderMateriaal(m.id)}
                      style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:12 }}
                      title={`${m.gram_gebruikt}g`}>✕</button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {isMulticolor && liveGram > 0 && Object.keys(matGroepen).length > 1 && (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
              💡 Tip: Bambu geeft 1 totaalgewicht ({liveGram.toFixed(1)}g). Verdeel dit over de rollen hierboven.
            </div>
          )}
        </div>

        {/* ENERGIE */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>⚡ Energie</p>
          {live && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8, fontSize:11 }}>
              {[
                ['Start kWh',   live.kwh_start?.toFixed(3)],
                ['Huidig kWh',  live.kwh_current?.toFixed(3)],
                ['Δ Verbruikt', kwhDelta != null ? `${kwhDelta.toFixed(3)} kWh` : null],
              ].map(([label, val]) => (
                <div key={label} style={{ background:'var(--bg2)', borderRadius:6, padding:'5px 8px' }}>
                  <div style={{ color:'var(--muted)' }}>{label}</div>
                  <div style={{ fontWeight:600, color:'#fbbf24' }}>{val ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <input type="number" step="0.001" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="kWh verbruikt" style={{ flex:1 }} />
            {kwhDelta != null && kwhDelta > 0 && (
              <button className="btn" style={{ fontSize:11 }} onClick={() => setKwh(kwhDelta.toFixed(3))}>
                ↺ {kwhDelta.toFixed(3)}
              </button>
            )}
          </div>
        </div>

        {/* ARBEID — volledig aanpasbaar */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>👷 Arbeid</p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Voorbereiding (min)</label>
              <input type="number" min="0" value={voorbMin}
                onChange={e => setVoorbMin(parseInt(e.target.value) || 0)}
                style={{ marginBottom:4 }} />
              <div style={{ fontSize:10, color:'var(--accent2)' }}>→ €{(voorbMin / 60 * arbTarief).toFixed(2)}</div>
            </div>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Nabewerking (min)</label>
              <input type="number" min="0" value={nabMin}
                onChange={e => setNabMin(parseInt(e.target.value) || 0)}
                style={{ marginBottom:4 }} />
              <div style={{ fontSize:10, color:'var(--accent2)' }}>→ €{(nabMin / 60 * arbTarief).toFixed(2)}</div>
            </div>
          </div>

          <Field label="Extra voorbereiding (min)">
            <input type="number" min="0" value={extraVoorbMin} onChange={e => setExtraVoorbMin(parseInt(e.target.value) || 0)} />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px', gap:6, marginTop:8, marginBottom:6 }}>
            <Field label="Ontwerp regie (min)">
              <input type="number" min="0" value={ontwerpMin} onChange={e => setOntwerpMin(parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Tarief (€/u)">
              <input type="number" value={ontwerpTarief} onChange={e => setOntwerpTarief(parseFloat(e.target.value) || 15)} />
            </Field>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:11, color:'var(--accent2)' }}>
              {ontwerpMin > 0 ? `€${(ontwerpMin / 60 * ontwerpTarief).toFixed(2)}` : ''}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 60px', gap:6 }}>
            <Field label="Nabewerking extra (min)">
              <input type="number" min="0" value={nabewerkingExtraMin} onChange={e => setNabewerkingExtraMin(parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Tarief (€/u)">
              <input type="number" value={nabewerkingExtraTarief} onChange={e => setNabewerkingExtraTarief(parseFloat(e.target.value) || 15)} />
            </Field>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:11, color:'var(--accent2)' }}>
              {nabewerkingExtraMin > 0 ? `€${(nabewerkingExtraMin / 60 * nabewerkingExtraTarief).toFixed(2)}` : ''}
            </div>
          </div>
        </div>

        {/* EXTRA */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>➕ Extra kosten</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
            <Field label="Aantal stuks">
              <input type="number" min="1" value={aantal} onChange={e => setAantal(parseInt(e.target.value) || 1)} />
            </Field>
            <Field label="Extra/stuk (€) × aantal">
              <input type="number" min="0" step="0.01" value={extraPerStuk} onChange={e => setExtraPerStuk(e.target.value)} />
            </Field>
            <Field label="Extra eenmalig (€)">
              <input type="number" min="0" step="0.01" value={extraEenmalig} onChange={e => setExtraEenmalig(e.target.value)} />
            </Field>
          </div>
          <Field label="Omschrijving extra">
            <input value={extraOmschrijving} onChange={e => setExtraOmschrijving(e.target.value)} placeholder="bv. 20 ringetjes + 1 nozzle 0.2mm" />
          </Field>
        </div>

        {/* OPMERKING */}
        <div className="form-group" style={{ marginBottom:'0.75rem' }}>
          <label>📝 Opmerking</label>
          <textarea rows={2} value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="Verschijnt op werkbon" />
        </div>

        <button className="btn primary" style={{ width:'100%', marginBottom:'0.75rem', padding:'9px' }}
          onClick={() => bereken(true)} disabled={saving}>
          {saving ? 'Berekenen...' : '🧮 Bereken kostprijs'}
        </button>

        {/* RESULTAAT */}
        {result && (
          <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'0.75rem' }}>
            <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>📊 Werkbon kostprijsoverzicht</p>
            {[
              { label:'Materiaal', val: result.materiaal_kost, sub: `${Object.values(matGroepen).reduce((s, m) => s + m.gram_totaal, 0).toFixed(1)}g` },
              { label:'Energie',   val: result.energie_kost,   sub: `${result.kwh_verbruikt} kWh` },
              ...(result.machine_kost > 0 ? [{ label:`Machine (${(parseInt(printUren) + parseInt(printMin)/60).toFixed(1)}u)`, val: result.machine_kost }] : []),
              ...(totVoorb > 0   ? [{ label:`Voorbereiding (${totVoorb} min)`,              val: (totVoorb / 60) * arbTarief }] : []),
              ...(nabMin > 0     ? [{ label:`Nabewerking (${nabMin} min)`,                   val: (nabMin / 60) * arbTarief }] : []),
              ...(ontwerpMin > 0 ? [{ label:`Ontwerp (${ontwerpMin} min)`,                   val: (ontwerpMin / 60) * ontwerpTarief }] : []),
              ...(nabewerkingExtraMin > 0 ? [{ label:`Nabewerking extra (${nabewerkingExtraMin} min)`, val: (nabewerkingExtraMin / 60) * nabewerkingExtraTarief }] : []),
              ...((parseFloat(extraPerStuk) > 0 || parseFloat(extraEenmalig) > 0)
                ? [{ label:`Extra${extraOmschrijving ? ` — ${extraOmschrijving}` : ''}`, val: (parseFloat(extraPerStuk) * parseInt(aantal)) + parseFloat(extraEenmalig) }]
                : []),
            ].map(({ label, val, sub }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                <div>
                  <span style={{ color:'var(--muted)' }}>{label}</span>
                  {sub && <span style={{ color:'var(--muted)', fontSize:10, marginLeft:5 }}>{sub}</span>}
                </div>
                <span>€{(val || 0).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
              <span>Subtotaal</span><span>€{result.totaal_kost?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', fontWeight:700 }}>
              <span>Verkoopprijs{aantal > 1 ? ` (${aantal}×)` : ''}</span>
              <span style={{ fontSize:22, color:'var(--accent2)' }}>€{result.verkoopprijs?.toFixed(2)}</span>
            </div>
            {aantal > 1 && <div style={{ textAlign:'right', fontSize:11, color:'var(--muted)' }}>€{(result.verkoopprijs / aantal).toFixed(2)}/stuk</div>}

            <div style={{ marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
              <a className="btn" style={{ textAlign:'center' }}
                href={`${BASE}/kosten/pdf/${job.id}?aantal=${aantal}`} download>
                ↓ Werkbon PDF
              </a>
              <div style={{ display:'flex', gap:6 }}>
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="E-mail voor werkbon" style={{ flex:1 }} />
                <button className="btn" onClick={stuurEmail}>✉</button>
              </div>
              {emailStatus && <div style={{ fontSize:11, color: emailStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)' }}>{emailStatus}</div>}
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
