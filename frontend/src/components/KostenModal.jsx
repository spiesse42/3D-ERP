import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const BASE = window.__API_BASE__ || '/api';

export default function KostenModal({ job, printerLiveData, klanten, onClose, onJobUpdated }) {
  const [rollen, setRollen] = useState([]);
  const [tarieven, setTarieven] = useState({});
  const [selectedRol, setSelectedRol] = useState('');
  const [gram, setGram] = useState('');
  const [materialen, setMaterialen] = useState([]);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [offerteStatus, setOfferteStatus] = useState('');
  const [selectedKlantId, setSelectedKlantId] = useState(job.klant_id || '');

  // Formulier
  const [printUren, setPrintUren] = useState(Math.floor(job.print_uren_werkelijk || job.print_uren_geschat || 0));
  const [printMin, setPrintMin] = useState(Math.round(((job.print_uren_werkelijk || job.print_uren_geschat || 0) % 1) * 60));
  const [isMulticolor, setIsMulticolor] = useState(!!job.is_multicolor);
  const [extraVoorbMin, setExtraVoorbMin] = useState(0);
  const [ontwerpMin, setOntwerpMin] = useState(0);
  const [ontwerpTarief, setOntwerpTarief] = useState(15);
  const [nabewerkingExtraMin, setNabewerkingExtraMin] = useState(0);
  const [nabewerkingExtraTarief, setNabewerkingExtraTarief] = useState(15);
  const [extraPerStuk, setExtraPerStuk] = useState(0);
  const [extraEenmalig, setExtraEenmalig] = useState(0);
  const [extraOmschrijving, setExtraOmschrijving] = useState('');
  const [aantal, setAantal] = useState(1);
  const [opmerking, setOpmerking] = useState(job.notities || '');

  const live = printerLiveData;
  const kwhDelta = live?.kwh_delta;
  const [kwh, setKwh] = useState('');

  useEffect(() => {
    api.get('/filament/rollen').then(r => setRollen(r.filter(x => x.actief)));
    api.get('/tarieven').then(rows => {
      const t = Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]));
      setTarieven(t);
      setOntwerpTarief(t.ontwerp_tarief || 15);
      setNabewerkingExtraTarief(t.nabewerking_tarief || 15);
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

  async function voegMateriaaltoe() {
    if (!selectedRol || !gram) return alert('Selecteer een rol en geef gram op');
    try {
      const rol = rollen.find(r => r.id === parseInt(selectedRol));
      await api.post(`/jobs/${job.id}/materialen`, { filament_rol_id: parseInt(selectedRol), gram_gebruikt: parseFloat(gram) });
      setMaterialen(prev => [...prev, { ...rol, filament_rol_id: parseInt(selectedRol), gram_gebruikt: parseFloat(gram) }]);
      setSelectedRol(''); setGram('');
    } catch(e) { alert(e.message); }
  }

  async function verwijderMateriaal(rolId, matId) {
    try {
      await api.delete(`/jobs/${job.id}/materialen/${matId}`);
      setMaterialen(prev => prev.filter(m => m.id !== matId));
    } catch(e) { alert(e.message); }
  }

  async function koppelKlant() {
    if (!selectedKlantId) return;
    try {
      await api.put(`/jobs/${job.id}`, { ...job, klant_id: selectedKlantId });
      if (onJobUpdated) onJobUpdated();
    } catch(e) { alert(e.message); }
  }

  async function bereken() {
    setSaving(true);
    const totaleUren = parseInt(printUren) + parseInt(printMin) / 60;
    try {
      // Update printuren
      await api.put(`/jobs/${job.id}`, { ...job, klant_id: selectedKlantId || job.klant_id, print_uren_werkelijk: totaleUren });
      const r = await api.post(`/kosten/bereken/${job.id}`, {
        kwh_verbruikt: parseFloat(kwh) || 0,
        is_multicolor: isMulticolor,
        extra_voorbereiding_min: extraVoorbMin,
        ontwerp_min: ontwerpMin, ontwerp_tarief: ontwerpTarief,
        nabewerking_extra_min: nabewerkingExtraMin, nabewerking_extra_tarief: nabewerkingExtraTarief,
        extra_per_stuk: parseFloat(extraPerStuk) || 0,
        extra_eenmalig: parseFloat(extraEenmalig) || 0,
        aantal: parseInt(aantal) || 1,
        opmerking, print_uren: totaleUren,
      });
      setResult(r);
      if (onJobUpdated) onJobUpdated();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function maakOfferte() {
    const klantId = selectedKlantId || job.klant_id;
    if (!klantId) return alert('Koppel eerst een klant aan deze job');
    try {
      const r = await api.post(`/offertes/van-job/${job.id}`, { btw_pct: 21 });
      setOfferteStatus(`✓ Offerte ${r.nummer} aangemaakt!`);
      setTimeout(() => setOfferteStatus(''), 5000);
    } catch(e) { setOfferteStatus('✗ ' + e.message); }
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

  const t = tarieven;
  const voorbMin = (t.voorbereiding_min || 15) + extraVoorbMin;
  const nabMin = t.nabewerking_min || 10;
  const arbTarief = t.arbeid_per_uur || 15;
  const totaleUren = parseInt(printUren) + parseInt(printMin) / 60;
  const margeGrens = t.marge_grens_uur || 4;
  const margePct = totaleUren >= margeGrens ? (t.marge_groot_pct || 10) : (t.marge_klein_pct || 18);

  // Gecombineerde materiaalweergave
  const matGroepen = materialen.reduce((acc, m) => {
    const key = `${m.merk || ''} ${m.materiaal || ''} ${m.kleur || ''}`.trim();
    if (!acc[key]) acc[key] = { items:[], gram_totaal:0, prijs: m.inkoop_prijs_per_kg || 0, naam: key };
    acc[key].items.push(m);
    acc[key].gram_totaal += parseFloat(m.gram_gebruikt);
    return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:640, maxHeight:'93vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2>Werkbon — {job.naam}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:'1rem', display:'flex', gap:16, flexWrap:'wrap' }}>
          <span>🖨 {job.printer_naam}</span>
          <span style={{ color: margePct === (t.marge_klein_pct||18) ? 'var(--warn)' : 'var(--accent2)' }}>
            📊 Marge: {margePct}% ({totaleUren >= margeGrens ? `≥` : `<`}{margeGrens}u)
          </span>
        </div>

        {/* KLANT */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>👤 Klant</p>
          <div style={{ display:'flex', gap:8 }}>
            <select value={selectedKlantId} onChange={e => setSelectedKlantId(e.target.value)} style={{ flex:1 }}>
              <option value="">— voor mezelf (geen klant) —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
            </select>
            {selectedKlantId !== (job.klant_id?.toString() || '') && (
              <button className="btn primary" style={{ fontSize:11 }} onClick={koppelKlant}>Koppelen</button>
            )}
          </div>
        </div>

        {/* PRINTTIJD */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>⏱ Werkelijke printtijd</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'flex-end' }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Uren</label>
              <input type="number" min="0" value={printUren} onChange={e => setPrintUren(parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Minuten</label>
              <input type="number" min="0" max="59" value={printMin} onChange={e => setPrintMin(parseInt(e.target.value)||0)} />
            </div>
            {live?.elapsed_sec > 0 && (
              <button className="btn" style={{ fontSize:11, whiteSpace:'nowrap', marginBottom:0 }}
                onClick={() => {
                  const sec = live.elapsed_sec;
                  setPrintUren(Math.floor(sec / 3600));
                  setPrintMin(Math.floor((sec % 3600) / 60));
                }}>
                ↺ Live ({Math.floor(live.elapsed_sec/3600)}u {Math.floor((live.elapsed_sec%3600)/60)}m)
              </button>
            )}
          </div>
        </div>

        {/* FILAMENT */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <p style={{ fontSize:12, fontWeight:600, margin:0 }}>🧵 Filament</p>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
              <input type="checkbox" checked={isMulticolor} onChange={e => setIsMulticolor(e.target.checked)} />
              Multicolor (BMCU +€{t.bmcu_per_job || 0.10})
            </label>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px auto', gap:8, alignItems:'end', marginBottom:8 }}>
            <select value={selectedRol} onChange={e => setSelectedRol(e.target.value)}>
              <option value="">— selecteer rol —</option>
              {rollen.map(r => (
                <option key={r.id} value={r.id}>
                  {r.merk} {r.materiaal} {r.kleur} — {r.gewicht_gram_huidig}g — €{r.inkoop_prijs_per_kg?.toFixed(2)}/kg
                </option>
              ))}
            </select>
            <input type="number" placeholder="gram" value={gram} onChange={e => setGram(e.target.value)} />
            <button className="btn primary" onClick={voegMateriaaltoe}>+ Voeg toe</button>
          </div>

          {Object.values(matGroepen).map(mg => (
            <div key={mg.naam} style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px', marginBottom:4, fontSize:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <span style={{ fontWeight:500 }}>{mg.naam}</span>
                  <span style={{ color:'var(--muted)', marginLeft:8 }}>
                    {mg.gram_totaal.toFixed(1)}g × €{mg.prijs?.toFixed(2)}/kg = €{((mg.gram_totaal/1000)*mg.prijs).toFixed(3)}
                  </span>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {mg.items.map(m => (
                    <button key={m.id} onClick={() => verwijderMateriaal(m.filament_rol_id, m.id)}
                      style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:12 }}
                      title={`Verwijder ${m.gram_gebruikt}g`}>✕</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ENERGIE */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>⚡ Energie</p>
          {live && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8, fontSize:12 }}>
              {[['Start kWh', live.kwh_start?.toFixed(3)], ['Huidig kWh', live.kwh_current?.toFixed(3)], ['Δ Verbruikt', kwhDelta != null ? `${kwhDelta.toFixed(3)} kWh` : null]].map(([label, val]) => (
                <div key={label} style={{ background:'var(--bg2)', borderRadius:6, padding:'6px 10px' }}>
                  <div style={{ color:'var(--muted)' }}>{label}</div>
                  <div style={{ fontWeight:600, color:'#fbbf24' }}>{val ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="number" step="0.001" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="kWh verbruikt" style={{ flex:1 }} />
            {kwhDelta != null && kwhDelta > 0 && (
              <button className="btn" style={{ fontSize:11 }} onClick={() => setKwh(kwhDelta.toFixed(3))}>
                ↺ Live ({kwhDelta.toFixed(3)})
              </button>
            )}
          </div>
        </div>

        {/* ARBEID */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>👷 Arbeid</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10, fontSize:12 }}>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)' }}>Standaard voorbereiding</div>
              <div style={{ fontWeight:600 }}>{t.voorbereiding_min || 15} min → €{((t.voorbereiding_min||15)/60*arbTarief).toFixed(2)}</div>
            </div>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)' }}>Standaard nabewerking</div>
              <div style={{ fontWeight:600 }}>{nabMin} min → €{(nabMin/60*arbTarief).toFixed(2)}</div>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom:10 }}>
            <label style={{ fontSize:11 }}>Extra voorbereiding (min)</label>
            <input type="number" min="0" value={extraVoorbMin} onChange={e => setExtraVoorbMin(parseInt(e.target.value)||0)} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Ontwerp regie (min)</label>
              <input type="number" min="0" value={ontwerpMin} onChange={e => setOntwerpMin(parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief (€/u)</label>
              <input type="number" value={ontwerpTarief} onChange={e => setOntwerpTarief(parseFloat(e.target.value)||15)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {ontwerpMin > 0 ? `€${(ontwerpMin/60*ontwerpTarief).toFixed(2)}` : ''}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Nabewerking extra (min)</label>
              <input type="number" min="0" value={nabewerkingExtraMin} onChange={e => setNabewerkingExtraMin(parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief (€/u)</label>
              <input type="number" value={nabewerkingExtraTarief} onChange={e => setNabewerkingExtraTarief(parseFloat(e.target.value)||15)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {nabewerkingExtraMin > 0 ? `€${(nabewerkingExtraMin/60*nabewerkingExtraTarief).toFixed(2)}` : ''}
            </div>
          </div>
        </div>

        {/* EXTRA */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>➕ Extra kosten</p>
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
            <label style={{ fontSize:11 }}>Omschrijving extra</label>
            <input value={extraOmschrijving} onChange={e => setExtraOmschrijving(e.target.value)} placeholder="bv. 20 ringetjes + 1 nozzle 0.2mm" />
          </div>
        </div>

        {/* OPMERKING */}
        <div className="form-group" style={{ marginBottom:'1rem' }}>
          <label>📝 Opmerking</label>
          <textarea rows={2} value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="Verschijnt op werkbon" />
        </div>

        <button className="btn primary" style={{ width:'100%', marginBottom:'1rem', padding:'10px' }}
          onClick={bereken} disabled={saving}>
          {saving ? 'Berekenen...' : '🧮 Bereken kostprijs'}
        </button>

        {/* RESULTAAT */}
        {result && (
          <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
            <p style={{ fontSize:12, fontWeight:600, marginBottom:10 }}>📊 Werkbon kostprijsoverzicht</p>
            {[
              { label:'Materiaal', val: result.materiaal_kost, sub: `${Object.values(matGroepen).reduce((s,m)=>s+m.gram_totaal,0).toFixed(1)}g` },
              { label:'Energie', val: result.energie_kost, sub: `${result.kwh_verbruikt} kWh` },
              { label:`Voorbereiding (${voorbMin} min)`, val: (voorbMin/60)*arbTarief },
              { label:`Nabewerking (${nabMin} min)`, val: (nabMin/60)*arbTarief },
              ...(ontwerpMin > 0 ? [{ label:`Ontwerp (${ontwerpMin} min)`, val:(ontwerpMin/60)*ontwerpTarief }] : []),
              ...(nabewerkingExtraMin > 0 ? [{ label:`Nabewerking extra (${nabewerkingExtraMin} min)`, val:(nabewerkingExtraMin/60)*nabewerkingExtraTarief }] : []),
              ...((parseFloat(extraPerStuk)>0||parseFloat(extraEenmalig)>0) ? [{
                label:`Extra${extraOmschrijving ? ` — ${extraOmschrijving}` : ''}`,
                val:(parseFloat(extraPerStuk)*parseInt(aantal))+parseFloat(extraEenmalig)
              }] : []),
            ].map(({ label, val, sub }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <div>
                  <span style={{ color:'var(--muted)' }}>{label}</span>
                  {sub && <span style={{ color:'var(--muted)', fontSize:11, marginLeft:6 }}>{sub}</span>}
                </div>
                <span>€{(val||0).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
              <span>Subtotaal</span><span>€{result.totaal_kost?.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontWeight:700 }}>
              <span style={{ fontSize:15 }}>Verkoopprijs{aantal > 1 ? ` (${aantal}×)` : ''}</span>
              <span style={{ fontSize:24, color:'var(--accent2)' }}>€{result.verkoopprijs?.toFixed(2)}</span>
            </div>
            {aantal > 1 && (
              <div style={{ textAlign:'right', fontSize:12, color:'var(--muted)' }}>
                €{(result.verkoopprijs/aantal).toFixed(2)} per stuk
              </div>
            )}

            <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:8 }}>
                <a className="btn" style={{ flex:1, textAlign:'center' }}
                  href={`${BASE}/kosten/pdf/${job.id}?aantal=${aantal}`} download>
                  ↓ Werkbon PDF
                </a>
                <button className="btn primary" style={{ flex:1 }} onClick={maakOfferte}>
                  📋 Maak offerte
                </button>
              </div>
              {offerteStatus && <div style={{ fontSize:12, color: offerteStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)' }}>{offerteStatus}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="E-mail voor werkbon" style={{ flex:1 }} />
                <button className="btn" onClick={stuurEmail}>✉ Mail</button>
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
