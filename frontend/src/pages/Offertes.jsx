import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const BASE = window.__API_BASE__ || '/api';
const STATUSSEN = ['concept','verstuurd','goedgekeurd','geannuleerd'];

function statusKleur(s) {
  return { concept:'#f59e0b', verstuurd:'#60a5fa', goedgekeurd:'#22c55e', geannuleerd:'#6b7280' }[s] || '#6b7280';
}

function OfferteForm({ klanten, printers, filamentTypes, tarieven, onSaved, onCancel }) {
  const [form, setForm] = useState({
    klant_id: '', object_naam: '', object_link: '', printer_id: printers[0]?.id || '',
    filament_type_id: '', geschat_gewicht_g: '', geschatte_tijd_u: 0, geschatte_tijd_min: 0,
    voorbereiding_min: tarieven.voorbereiding_min || 15,
    nabewerking_min: tarieven.nabewerking_min || 10,
    ontwerp_min: 0, ontwerp_tarief: tarieven.ontwerp_tarief || 15,
    nabewerking_extra_min: 0, nabewerking_extra_tarief: tarieven.nabewerking_tarief || 15,
    is_multicolor: false, extra_per_stuk: 0, extra_eenmalig: 0,
    extra_omschrijving: '', aantal: 1, btw_pct: 21, geldig_tot: '', notities: '',
  });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Live preview berekening
  useEffect(() => {
    const ft = filamentTypes.find(f => f.id === parseInt(form.filament_type_id));
    const printer = printers.find(p => p.id === parseInt(form.printer_id));
    if (!ft || !form.geschat_gewicht_g) return setPreview(null);

    const prijs = ft.inkoop_prijs_per_kg;
    const faal = 1 + (tarieven.faalfactor_pct || 10) / 100;
    const gram = parseFloat(form.geschat_gewicht_g) || 0;
    const u = parseInt(form.geschatte_tijd_u) || 0;
    const min = parseInt(form.geschatte_tijd_min) || 0;
    const totU = u + min / 60;
    const aantal = parseInt(form.aantal) || 1;
    const watt = printer?.naam?.toLowerCase().includes('ender') ? (tarieven.ender_watt || 150) : (tarieven.bambu_watt || 120);
    const kwh = tarieven.kwh_prijs || 0.35;
    const arbTarief = tarieven.arbeid_per_uur || 15;

    const mat = (gram / 1000) * prijs * faal * aantal;
    const ener = (watt / 1000) * totU * kwh * aantal;
    const mach = totU * (tarieven.machine_per_uur || 0.13) * aantal;
    const arb = ((parseInt(form.voorbereiding_min) + parseInt(form.nabewerking_min)) / 60 * arbTarief)
      + (parseInt(form.ontwerp_min) / 60 * parseFloat(form.ontwerp_tarief))
      + (parseInt(form.nabewerking_extra_min) / 60 * parseFloat(form.nabewerking_extra_tarief));
    const bmcu = form.is_multicolor ? (tarieven.bmcu_per_job || 0.10) : 0;
    const extra = parseFloat(form.extra_per_stuk) * aantal + parseFloat(form.extra_eenmalig);
    const sub = mat + ener + mach + arb + extra + bmcu;
    const margeGrns = tarieven.marge_grens_uur || 4;
    const marge = totU >= margeGrns ? (tarieven.marge_groot_pct || 10) : (tarieven.marge_klein_pct || 18);
    const vkp = sub * (1 + marge / 100);

    setPreview({ mat, ener, arb, extra, bmcu, sub, marge, vkp, aantal });
  }, [form, tarieven, filamentTypes, printers]);

  async function save() {
    if (!form.klant_id) return alert('Selecteer een klant');
    setSaving(true);
    try {
      const r = await api.post('/offertes2', form);
      onSaved(r);
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const Section = ({ title, children }) => (
    <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'1rem' }}>
      <p style={{ fontSize:12, fontWeight:600, marginBottom:10 }}>{title}</p>
      {children}
    </div>
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'1.5rem', alignItems:'start' }}>
      <div>
        <Section title="👤 Klant & object">
          <div className="form-row" style={{ marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Klant *</label>
              <select value={form.klant_id} onChange={e => set('klant_id', e.target.value)}>
                <option value="">— selecteer klant —</option>
                {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Printer</label>
              <select value={form.printer_id} onChange={e => set('printer_id', e.target.value)}>
                {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:8 }}>
            <label>Object naam</label>
            <input value={form.object_naam} onChange={e => set('object_naam', e.target.value)} placeholder="bv. Corgi hond, Naambordje, ..." />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>Link (Makerworld, Printables, ...)</label>
            <input value={form.object_link} onChange={e => set('object_link', e.target.value)} placeholder="https://makerworld.com/..." />
          </div>
        </Section>

        <Section title="🧵 Slicer data">
          <div className="form-row" style={{ marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Filamenttype</label>
              <select value={form.filament_type_id} onChange={e => set('filament_type_id', e.target.value)}>
                <option value="">— selecteer type —</option>
                {filamentTypes.map(f => <option key={f.id} value={f.id}>{f.merk} {f.materiaal} — €{f.inkoop_prijs_per_kg?.toFixed(2)}/kg</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Geschat gewicht (g)</label>
              <input type="number" step="0.1" value={form.geschat_gewicht_g} onChange={e => set('geschat_gewicht_g', e.target.value)} placeholder="uit slicer" />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Geschatte tijd — uren</label>
              <input type="number" min="0" value={form.geschatte_tijd_u} onChange={e => set('geschatte_tijd_u', parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Geschatte tijd — minuten</label>
              <input type="number" min="0" max="59" value={form.geschatte_tijd_min} onChange={e => set('geschatte_tijd_min', parseInt(e.target.value)||0)} />
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
            <input type="checkbox" checked={form.is_multicolor} onChange={e => set('is_multicolor', e.target.checked)} id="mc" />
            <label htmlFor="mc" style={{ cursor:'pointer' }}>Multicolor (BMCU +€{tarieven.bmcu_per_job || 0.10})</label>
          </div>
        </Section>

        <Section title="👷 Arbeid">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, fontSize:12 }}>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)' }}>Voorbereiding</div>
              <div style={{ fontWeight:600 }}>{form.voorbereiding_min} min → €{(form.voorbereiding_min/60*(tarieven.arbeid_per_uur||15)).toFixed(2)}</div>
            </div>
            <div style={{ background:'var(--bg2)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ color:'var(--muted)' }}>Nabewerking</div>
              <div style={{ fontWeight:600 }}>{form.nabewerking_min} min → €{(form.nabewerking_min/60*(tarieven.arbeid_per_uur||15)).toFixed(2)}</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Ontwerp regie (min)</label>
              <input type="number" min="0" value={form.ontwerp_min} onChange={e => set('ontwerp_min', parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief (€/u)</label>
              <input type="number" value={form.ontwerp_tarief} onChange={e => set('ontwerp_tarief', e.target.value)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {form.ontwerp_min > 0 ? `€${(form.ontwerp_min/60*form.ontwerp_tarief).toFixed(2)}` : ''}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Nabewerking extra (min)</label>
              <input type="number" min="0" value={form.nabewerking_extra_min} onChange={e => set('nabewerking_extra_min', parseInt(e.target.value)||0)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Tarief (€/u)</label>
              <input type="number" value={form.nabewerking_extra_tarief} onChange={e => set('nabewerking_extra_tarief', e.target.value)} />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2, fontSize:12, color:'var(--accent2)' }}>
              {form.nabewerking_extra_min > 0 ? `€${(form.nabewerking_extra_min/60*form.nabewerking_extra_tarief).toFixed(2)}` : ''}
            </div>
          </div>
        </Section>

        <Section title="➕ Extra kosten">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Aantal stuks</label>
              <input type="number" min="1" value={form.aantal} onChange={e => set('aantal', parseInt(e.target.value)||1)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Extra/stuk (€) × aantal</label>
              <input type="number" min="0" step="0.01" value={form.extra_per_stuk} onChange={e => set('extra_per_stuk', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label style={{ fontSize:11 }}>Extra eenmalig (€)</label>
              <input type="number" min="0" step="0.01" value={form.extra_eenmalig} onChange={e => set('extra_eenmalig', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label style={{ fontSize:11 }}>Omschrijving extra</label>
            <input value={form.extra_omschrijving} onChange={e => set('extra_omschrijving', e.target.value)} placeholder="bv. 20 ringetjes + 1 nozzle 0.2mm" />
          </div>
        </Section>

        <Section title="📋 Offerte details">
          <div className="form-row" style={{ marginBottom:8 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Geldig tot</label>
              <input type="date" value={form.geldig_tot} onChange={e => set('geldig_tot', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>BTW %</label>
              <input type="number" value={form.btw_pct} onChange={e => set('btw_pct', parseFloat(e.target.value))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>Notities / opmerkingen (verschijnen op PDF)</label>
            <textarea rows={2} value={form.notities} onChange={e => set('notities', e.target.value)} />
          </div>
        </Section>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" style={{ flex:1 }} onClick={onCancel}>Annuleer</button>
          <button className="btn primary" style={{ flex:2 }} onClick={save} disabled={saving}>
            {saving ? 'Bezig...' : '📋 Offerte aanmaken'}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div style={{ position:'sticky', top:0 }}>
        <div className="card">
          <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>📊 Prijsoverzicht (live)</h2>
          {!preview
            ? <p style={{ color:'var(--muted)', fontSize:12 }}>Vul filamenttype en gewicht in om de prijs te zien</p>
            : <>
              {[
                ['Materiaal', preview.mat],
                ['Energie (schatting)', preview.ener],
                ['Arbeid', preview.arb],
                ...(preview.bmcu > 0 ? [['BMCU', preview.bmcu]] : []),
                ...(preview.extra > 0 ? [['Extra', preview.extra]] : []),
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <span style={{ color:'var(--muted)' }}>{label}</span>
                  <span>€{(val||0).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
                <span>Subtotaal</span><span>€{preview.sub.toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
                <span>Marge ({preview.marge}%)</span>
                <span>€{(preview.vkp - preview.sub).toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontWeight:700 }}>
                <span>Verkoopprijs{preview.aantal > 1 ? ` (${preview.aantal}×)` : ''}</span>
                <span style={{ fontSize:22, color:'var(--accent2)' }}>€{preview.vkp.toFixed(2)}</span>
              </div>
              {preview.aantal > 1 && (
                <div style={{ textAlign:'right', fontSize:11, color:'var(--muted)' }}>
                  €{(preview.vkp/preview.aantal).toFixed(2)} per stuk
                </div>
              )}
            </>
          }
        </div>
      </div>
    </div>
  );
}

export default function Offertes() {
  const [offertes, setOffertes] = useState([]);
  const [klanten, setKlanten] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [filamentTypes, setFilamentTypes] = useState([]);
  const [tarieven, setTarieven] = useState({});
  const [view, setView] = useState('lijst'); // lijst | nieuw | detail
  const [detail, setDetail] = useState(null);
  const [jobStatus, setJobStatus] = useState('');

  const load = () => api.get('/offertes2').then(setOffertes);

  useEffect(() => {
    load();
    api.get('/klanten').then(setKlanten);
    api.get('/printers').then(setPrinters);
    api.get('/filament/types').then(setFilamentTypes);
    api.get('/tarieven').then(rows => {
      setTarieven(Object.fromEntries(rows.map(r => [r.sleutel, r.waarde])));
    });
  }, []);

  async function openDetail(id) {
    const d = await api.get(`/offertes2/${id}`);
    setDetail(d);
    setView('detail');
  }

  async function updateStatus(id, status) {
    await api.patch(`/offertes2/${id}/status`, { status });
    load();
    if (detail?.id === id) setDetail(d => ({ ...d, status }));
  }

  async function maakJob(id) {
    setJobStatus('Bezig...');
    try {
      const r = await api.post(`/offertes2/${id}/maak-job`, {});
      setJobStatus(`✓ Job aangemaakt (ID: ${r.job_id}) — ga naar Jobs voor de werkbon`);
      load();
      if (detail?.id === id) setDetail(d => ({ ...d, job_id: r.job_id, status:'goedgekeurd' }));
    } catch(e) { setJobStatus('✗ ' + e.message); }
  }

  async function del(id) {
    if (!confirm('Offerte verwijderen?')) return;
    await api.delete(`/offertes2/${id}`);
    load();
    if (view === 'detail') setView('lijst');
  }

  if (view === 'nieuw') {
    return (
      <div>
        <div className="page-header">
          <h1>Nieuwe offerte</h1>
          <button className="btn" onClick={() => setView('lijst')}>← Terug</button>
        </div>
        <OfferteForm
          klanten={klanten} printers={printers} filamentTypes={filamentTypes} tarieven={tarieven}
          onSaved={(r) => { load(); setView('lijst'); }}
          onCancel={() => setView('lijst')}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <button className="btn primary" onClick={() => setView('nieuw')}>+ Nieuwe offerte</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail && view === 'detail' ? '1fr 420px' : '1fr', gap:'1rem' }}>
        {/* Lijst */}
        <div>
          {offertes.length === 0
            ? <div className="empty">
                <p>Nog geen offertes</p>
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>Klik op "+ Nieuwe offerte" om te starten</p>
              </div>
            : <div className="card" style={{ padding:0 }}>
                <table>
                  <thead>
                    <tr><th>Nummer</th><th>Klant</th><th>Object</th><th>Status</th><th>Verkoopprijs</th><th>Datum</th><th>Acties</th></tr>
                  </thead>
                  <tbody>
                    {offertes.map(o => (
                      <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => openDetail(o.id)}>
                        <td style={{ fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{o.nummer}</td>
                        <td>{o.klant_voornaam ? `${o.klant_voornaam} ${o.klant_naam}` : o.klant_naam}</td>
                        <td style={{ fontSize:12 }}>{o.object_naam || '—'}</td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:600, color:statusKleur(o.status),
                            background:statusKleur(o.status)+'22', padding:'2px 8px', borderRadius:20 }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ color:'var(--accent2)', fontWeight:500 }}>€{o.verkoopprijs?.toFixed(2)}</td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>{o.aangemaakt_op?.split('T')[0]}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <a className="btn" style={{ fontSize:10, padding:'3px 7px' }}
                              href={`${BASE}/offertes2/${o.id}/pdf`} download title="PDF">↓</a>
                            <button className="btn danger" style={{ fontSize:10, padding:'3px 7px' }}
                              onClick={() => del(o.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

        {/* Detail panel */}
        {detail && view === 'detail' && (
          <div className="card" style={{ position:'sticky', top:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontSize:15, fontWeight:700 }}>{detail.nummer}</h2>
              <button className="btn" onClick={() => { setDetail(null); setView('lijst'); }}>✕</button>
            </div>

            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'1rem', fontSize:13 }}>
              <div style={{ fontWeight:600 }}>
                {detail.klant_voornaam ? `${detail.klant_voornaam} ${detail.klant_naam}` : detail.klant_naam}
              </div>
              {detail.email && <div style={{ color:'var(--muted)', fontSize:12 }}>✉ {detail.email}</div>}
              {detail.object_naam && <div style={{ color:'var(--accent)', fontSize:12, marginTop:4 }}>📦 {detail.object_naam}</div>}
              {detail.object_link && (
                <a href={detail.object_link} target="_blank" rel="noreferrer"
                  style={{ fontSize:11, color:'var(--accent)' }}>🔗 Link openen</a>
              )}
            </div>

            <div style={{ fontSize:12, marginBottom:'1rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  ['Printer', detail.printer_naam || '—'],
                  ['Filament', detail.filament_merk ? `${detail.filament_merk} ${detail.filament_materiaal}` : '—'],
                  ['Gewicht', detail.geschat_gewicht_g ? `${detail.geschat_gewicht_g}g` : '—'],
                  ['Tijd', `${detail.geschatte_tijd_u || 0}u ${detail.geschatte_tijd_min || 0}min`],
                  ['Aantal', detail.aantal || 1],
                  ['Multicolor', detail.is_multicolor ? 'Ja' : 'Nee'],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ color:'var(--muted)', fontSize:11 }}>{label}</div>
                    <div style={{ fontWeight:500 }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kostprijsoverzicht */}
            <div style={{ fontSize:12, marginBottom:'1rem' }}>
              {[
                ['Materiaal', detail.materiaal_kost],
                ['Energie (schat)', detail.energie_kost_schat],
                ['Arbeid', detail.arbeid_kost],
                ['Extra', detail.extra_totaal],
              ].filter(([,v]) => v > 0).map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--muted)' }}>{label}</span>
                  <span>€{(val||0).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', color:'var(--muted)' }}>
                <span>Subtotaal</span><span>€{detail.subtotaal?.toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontWeight:700, fontSize:16 }}>
                <span>Verkoopprijs</span>
                <span style={{ color:'var(--accent2)' }}>€{detail.verkoopprijs?.toFixed(2)}</span>
              </div>
              {detail.aantal > 1 && (
                <div style={{ textAlign:'right', fontSize:11, color:'var(--muted)' }}>
                  €{(detail.verkoopprijs/detail.aantal).toFixed(2)} per stuk
                </div>
              )}
            </div>

            {/* Status */}
            <div className="form-group" style={{ marginBottom:'1rem' }}>
              <label>Status</label>
              <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)}>
                {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {detail.notities && (
              <div style={{ background:'#fffbeb', borderLeft:'3px solid #f59e0b', padding:'8px 12px', borderRadius:4, fontSize:12, color:'#664400', marginBottom:'1rem' }}>
                📝 {detail.notities}
              </div>
            )}

            {jobStatus && (
              <div style={{ fontSize:12, color: jobStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)', marginBottom:8 }}>
                {jobStatus}
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <a className="btn" style={{ textAlign:'center' }}
                href={`${BASE}/offertes2/${detail.id}/pdf`} download>
                ↓ PDF downloaden
              </a>
              {!detail.job_id && detail.status !== 'geannuleerd' && (
                <button className="btn primary" onClick={() => maakJob(detail.id)}>
                  🔧 Maak werkbon job
                </button>
              )}
              {detail.job_id && (
                <div style={{ fontSize:12, color:'var(--accent2)', textAlign:'center' }}>
                  ✓ Werkbon job aangemaakt (ID: {detail.job_id})
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
