import { useState, useEffect, useCallback } from 'react';
import { api, BASE } from '../lib/api.js';
import KlantModal from '../components/KlantModal.jsx';
import {
  nieuweRegel, berekenOfferteRegelsClient, offerteRegelsClientNieuw, RegelCard, F,
} from '../lib/regelEditor.jsx';

const STATUSSEN = ['concept','verstuurd','goedgekeurd','geannuleerd'];
const BTW_OPTIES = [0, 6, 21];

function statusKleur(s) {
  return { concept:'#f59e0b', verstuurd:'#60a5fa', goedgekeurd:'#22c55e', geannuleerd:'#6b7280' }[s] || '#6b7280';
}

function standaardGeldigTot() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

// nieuweRegel, berekenOfferteRegelsClient, offerteRegelsClientNieuw, RegelCard
// en F verhuisden naar ../lib/regelEditor.jsx (gedeeld met WerkbonModal) —
// zie de import bovenaan dit bestand.

// Op moduleniveau gedefinieerd (niet binnen OfferteModal) — anders krijgen
// deze bij elke toetsaanslag een nieuwe component-identiteit, waardoor React
// het onderliggende <input> unmount/remount en de cursor/focus verloren gaat.
const Sec = ({ title, children }) => (
  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
    <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>{title}</p>
    {children}
  </div>
);

// ── OfferteModal ──────────────────────────────────────────────────────────────
// Pop-up venster in dezelfde stijl/interactiepatroon als KlantModal en
// KostenModal (Werkbon) — i.p.v. een aparte volle pagina, zodat het
// offerteformulier overal in de app hetzelfde aanvoelt.
function OfferteModal({ offerte, klanten, printers, filamentTypes, allRollen, tarieven, onClose, onSaved, onKlantToegevoegd }) {
  const [form, setForm] = useState({
    klant_id: '', object_link: '',
    geldig_tot: standaardGeldigTot(), levertermijn: '3 weken',
    btw_pct: 0, notities: '', // vrijstellingsregel art. 56bis — standaard 0% BTW
    regels: [],
    ...offerte,
  });
  const [saving, setSaving] = useState(false);
  const [klantModal, setKlantModal] = useState(false);

  // "Bevroren tot je zelf wijzigt": bij het heropenen van een bestaande
  // offerte tonen we de opgeslagen waarden (identiek aan het detailvenster/
  // de PDF), i.p.v. meteen te herberekenen met de huidige tarieven/prijzen —
  // die kunnen intussen gewijzigd zijn. Pas zodra je zelf iets aanpast
  // schakelt de preview over naar de live herberekening. setSilent: wijzigt
  // het form ZONDER dirty te markeren — enkel voor puur afgeleide/hydratie-
  // effects (bv. rol-auto-select in PrintenVelden), nooit voor echte
  // gebruikersinvoer.
  const [dirty, setDirty] = useState(false);
  const setSilent = useCallback((k, v) => setForm(f => (f[k] === v ? f : { ...f, [k]: v })), []);
  const set = useCallback((k, v) => setForm(f => { if (f[k] === v) return f; setDirty(true); return { ...f, [k]: v }; }), []);
  const isEdit = !!form.id;

  // Extra artikelen/diensten (bv. verzendkosten) — alleen niet-filament
  // types, prijs op TYPE-niveau. Hoofdfilamenttype: omgekeerde filter, enkel
  // 'filament'-categorie. Zelfde filterconventie als elders (KostenModal.jsx,
  // PrinterCard.jsx).
  const artikelTypes = filamentTypes.filter(f => (f.categorie || 'filament') !== 'filament');
  const printFilamentTypes = filamentTypes.filter(f => (f.categorie || 'filament') === 'filament');

  function setRegelPatch(i, patch) {
    set('regels', (form.regels || []).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setRegelPatchSilent(i, patch) {
    setSilent('regels', (form.regels || []).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function voegRegelToe() {
    set('regels', [...(form.regels || []), nieuweRegel('', tarieven)]);
  }
  function verwijderRegel(i) {
    set('regels', (form.regels || []).filter((_, idx) => idx !== i));
  }

  const klantGekozen = klanten.find(k => k.id === parseInt(form.klant_id));
  const klantNaamGekozen = klantGekozen ? (klantGekozen.voornaam ? `${klantGekozen.voornaam} ${klantGekozen.naam}` : klantGekozen.naam) : '';

  const berekeningLive = berekenOfferteRegelsClient(form.regels || [], tarieven, allRollen, printers, filamentTypes);
  const toonBevroren = isEdit && !dirty;
  const berekeningPreview = toonBevroren ? { regels: form.regels || [], marge_pct: form.marge_pct } : berekeningLive;
  const previewRegels = offerteRegelsClientNieuw(berekeningPreview);
  const verkoopprijsPreview = toonBevroren ? (form.verkoopprijs || 0) : berekeningLive.verkoopprijs;
  const btwBedragPreview = toonBevroren ? (form.btw_bedrag || 0) : (berekeningLive.verkoopprijs_basis * (form.btw_pct || 0) / 100);

  async function save() {
    if (!form.klant_id) return alert('Selecteer een klant');
    const regels = form.regels || [];
    if (regels.length === 0) return alert('Voeg minstens 1 regel toe');
    for (const r of regels) {
      if (!r.type) return alert('Kies voor elke regel een type');
      if (r.type === 'printen' && !r.filament_rol_id) return alert('Selecteer voor elke "Printen"-regel een filamentrol');
      if (r.type === 'printen' && r.is_multicolor && (r.filament_rollen || []).some(fr => !fr.filament_rol_id))
        return alert('Selecteer voor elke kleur een filamentrol');
      if (r.handmatig_bedrag !== undefined && r.handmatig_bedrag !== null && r.handmatig_bedrag !== '') {
        const n = parseFloat(r.handmatig_bedrag);
        if (!Number.isFinite(n) || n < 0) return alert(`Handmatig bedrag moet 0 of hoger zijn (regel "${r.object_naam || r.type}")`);
      }
    }
    setSaving(true);
    try {
      const payload = {
        klant_id: form.klant_id, object_link: form.object_link || '',
        geldig_tot: form.geldig_tot, levertermijn: form.levertermijn,
        btw_pct: form.btw_pct, notities: form.notities,
        // _berekend is bevroren server-data, niet opnieuw opsturen — de
        // backend herberekent bij opslaan zelf op basis van de ruwe velden.
        regels: regels.map(({ _berekend, ...r }) => r),
      };
      if (form.id) {
        const r = await api.put(`/offertes2/${form.id}`, payload);
        onSaved({ ...form, ...r });
        onClose();
      } else {
        const r = await api.post('/offertes2', payload);
        setForm(f => ({ ...f, id: r.id, nummer: r.nummer }));
        onSaved({ ...form, ...r });
      }
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Offerte sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal" style={{ width:760, maxHeight:'93vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2 style={{ fontSize:14 }}>{isEdit ? `Offerte bewerken — ${form.nummer}` : 'Nieuwe offerte'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* KLANT & OFFERTE */}
        <Sec title="👤 Klant & offerte">
          <F label="Klant *" style={{ marginBottom:8 }}>
            <div style={{ display:'flex', gap:6 }}>
              <select value={form.klant_id} onChange={e => set('klant_id', e.target.value)} style={{ flex:1 }}>
                <option value="">— selecteer —</option>
                {klanten.map(k => <option key={k.id} value={k.id}>{k.voornaam ? `${k.voornaam} ${k.naam}` : k.naam}</option>)}
              </select>
              <button type="button" className="btn" style={{ fontSize:11, padding:'0 8px' }}
                onClick={() => setKlantModal(true)} title="Nieuwe klant aanmaken">+ Nieuw</button>
            </div>
          </F>
          <div className="form-row" style={{ marginBottom:8 }}>
            <F label="Geldig tot">
              <input type="date" value={form.geldig_tot || ''} onChange={e => set('geldig_tot', e.target.value)} />
            </F>
            <F label="Levertermijn">
              <input value={form.levertermijn || ''} onChange={e => set('levertermijn', e.target.value)} placeholder="bv. 3 weken" />
            </F>
          </div>
          <F label="Link (Makerworld, Printables, referentie...)">
            <input value={form.object_link || ''} onChange={e => set('object_link', e.target.value)} placeholder="https://..." />
          </F>
        </Sec>

        {/* REGELS — diensten & objecten */}
        <Sec title="🧾 Regels — diensten & objecten">
          {(form.regels || []).map((regel, i) => {
            const berekend = berekeningPreview.regels?.[i]?._berekend;
            const margeFactor = 1 + (berekeningPreview.marge_pct || 0) / 100;
            const bedrag = berekend ? berekend.bedrag * (berekend.vaste_prijs ? 1 : margeFactor) : undefined;
            return (
              <RegelCard key={i} index={i} regel={regel}
                onChange={patch => setRegelPatch(i, patch)}
                onChangeSilent={patch => setRegelPatchSilent(i, patch)}
                onRemove={() => verwijderRegel(i)}
                printFilamentTypes={printFilamentTypes} artikelTypes={artikelTypes}
                allRollen={allRollen} printers={printers} tarieven={tarieven}
                bedrag={bedrag} handmatig={!!berekend?.handmatig}
              />
            );
          })}
          {(form.regels || []).length === 0 && (
            <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:8 }}>Nog geen regels — voeg er hieronder een toe.</div>
          )}
          <button type="button" className="btn" style={{ width:'100%', border:'1px dashed var(--border)', background:'none', justifyContent:'center' }} onClick={voegRegelToe}>
            + Regel toevoegen
          </button>
        </Sec>

        {/* OFFERTE DETAILS */}
        <Sec title="📝 Offerte details">
          <F label="BTW %" style={{ marginBottom:8 }}>
            <select value={form.btw_pct} onChange={e => set('btw_pct', parseFloat(e.target.value))}>
              {BTW_OPTIES.map(b => <option key={b} value={b}>{b}%</option>)}
            </select>
          </F>
          <F label="Notities">
            <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
          </F>
        </Sec>

        {/* LIVE OFFERTE-PREVIEW — onderaan, letterlijk dezelfde
            offerteRegelsClientNieuw()-weergave als het detailvenster en de
            PDF. Wat je hier ziet is dus exact wat er straks bewaard/
            afgedrukt wordt. */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>
            📄 {toonBevroren ? 'Opgeslagen offerte' : 'Live offerte-preview'}
          </p>
          {toonBevroren && (
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
              Dit zijn de bewaarde waarden van deze offerte. Zodra je iets wijzigt, schakelt dit over naar een live herberekening met de huidige tarieven/prijzen.
            </p>
          )}
          {previewRegels.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:12, margin:0 }}>Voeg minstens 1 regel toe</p>
            : <>
              {klantNaamGekozen && <div style={{ fontWeight:600, fontSize:12, marginBottom:10 }}>{klantNaamGekozen}</div>}
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left', color:'var(--muted)', fontSize:10, textTransform:'uppercase' }}>
                    <th style={{ padding:'2px 4px 6px 0' }}>Aantal</th>
                    <th style={{ padding:'2px 4px 6px' }}>Omschrijving</th>
                    <th style={{ padding:'2px 4px 6px', textAlign:'right' }}>Eenh.prijs</th>
                    <th style={{ padding:'2px 0 6px 4px', textAlign:'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRegels.map((r, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'4px 4px 4px 0' }}>{r.aantal}</td>
                      <td style={{ padding:'4px' }}>{r.omschrijving}</td>
                      <td style={{ padding:'4px', textAlign:'right' }}>€{r.eenheidsprijs.toFixed(2)}</td>
                      <td style={{ padding:'4px 0 4px 4px', textAlign:'right' }}>€{r.totaal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', fontWeight:700 }}>
                <span>Verkoopprijs</span>
                <span style={{ fontSize:22, color:'var(--accent2)' }}>€{verkoopprijsPreview.toFixed(2)}</span>
              </div>
              {form.btw_pct > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:'var(--muted)' }}>
                  <span>+ BTW {form.btw_pct}%</span>
                  <span>€{btwBedragPreview.toFixed(2)}</span>
                </div>
              )}
            </>
          }
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{isEdit ? 'Sluiten' : 'Annuleer'}</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Bezig...' : isEdit ? '💾 Bijwerken' : '📋 Offerte aanmaken'}
          </button>
        </div>
      </div>

      {klantModal && (
        <KlantModal
          onClose={() => setKlantModal(false)}
          onSaved={(nieuweKlant) => {
            setKlantModal(false);
            set('klant_id', nieuweKlant.id);
            onKlantToegevoegd?.(nieuweKlant);
          }}
        />
      )}
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────
export default function Offertes() {
  const [offertes,     setOffertes]     = useState([]);
  const [klanten,      setKlanten]      = useState([]);
  const [printers,     setPrinters]     = useState([]);
  const [filamentTypes,setFilamentTypes]= useState([]);
  const [allRollen,    setAllRollen]    = useState([]);
  const [tarieven,     setTarieven]     = useState({});
  const [detail,       setDetail]       = useState(null);
  const [offerteModal, setOfferteModal] = useState(null); // null = dicht, {} = nieuw, object = bewerken
  const [jobStatus,    setJobStatus]    = useState('');

  const load = () => api.get('/offertes2').then(setOffertes).catch(e => alert('Kon offertes niet laden: ' + e.message));

  useEffect(() => {
    load();
    api.get('/klanten').then(setKlanten).catch(e => alert('Kon klanten niet laden: ' + e.message));
    api.get('/printers').then(setPrinters).catch(e => alert('Kon printers niet laden: ' + e.message));
    api.get('/filament/types').then(setFilamentTypes).catch(e => alert('Kon filamenttypes niet laden: ' + e.message));
    api.get('/filament/rollen').then(setAllRollen).catch(e => alert('Kon filamentrollen niet laden: ' + e.message));
    api.get('/tarieven').then(rows => setTarieven(Object.fromEntries(rows.map(r => [r.sleutel, r.waarde]))))
      .catch(e => alert('Kon tarieven niet laden: ' + e.message));
  }, []);

  async function openDetail(id) {
    const d = await api.get(`/offertes2/${id}`);
    setDetail(d); setJobStatus('');
  }

  async function updateStatus(id, status) {
    try {
      await api.patch(`/offertes2/${id}/status`, { status });
      load();
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
    } catch(e) { alert(e.message); }
  }

  // Zet de offerte om naar een werkbon (POST /offertes2/:id/maak-werkbon) —
  // dit maakt ÉÉN werkbon-rij aan met ALLE regeltypes (niet enkel 'printen',
  // zie toelichting in backend/routes/offertes_v2.js bij die route). Er
  // wordt hier bewust GEEN printopdracht (job) meer aangemaakt.
  async function maakWerkbon(id) {
    setJobStatus('Bezig...');
    try {
      await api.post(`/offertes2/${id}/maak-werkbon`, {});
      const u = await api.get(`/offertes2/${id}`);
      setJobStatus(u.werkbon ? `✓ Werkbon aangemaakt (${u.werkbon.volgnummer}) — ga naar Werkbons` : '✓ Werkbon aangemaakt');
      load();
      if (detail?.id === id) setDetail(u);
    } catch(e) { setJobStatus('✗ ' + e.message); }
  }

  async function del(id) {
    if (!confirm('Offerte verwijderen? De gekoppelde werkbon wordt ook verwijderd.')) return;
    try {
      await api.delete(`/offertes2/${id}`);
      load();
      if (detail?.id === id) setDetail(null);
    } catch(e) { alert(e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Offertes</h1>
        <button className="btn primary" onClick={() => setOfferteModal({})}>+ Nieuwe offerte</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail ? '1fr 380px' : '1fr', gap:'1rem' }}>
        <div>
          {offertes.length === 0
            ? <div className="empty"><p>Nog geen offertes</p><p style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>Klik op "+ Nieuwe offerte" om te starten</p></div>
            : <div className="card" style={{ padding:0 }}>
                <table>
                  <thead><tr><th>Nummer</th><th>Klant</th><th>Object</th><th>Status</th><th>Prijs</th><th>Datum</th><th></th></tr></thead>
                  <tbody>
                    {offertes.map(o => (
                      <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => openDetail(o.id)}>
                        <td style={{ fontWeight:600, fontFamily:'monospace', fontSize:12 }}>{o.nummer}</td>
                        <td style={{ fontSize:13 }}>{o.klant_voornaam ? `${o.klant_voornaam} ${o.klant_naam}` : o.klant_naam}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{o.object_naam || '—'}</td>
                        <td>
                          <span style={{ fontSize:11, fontWeight:600, color:statusKleur(o.status), background:statusKleur(o.status)+'22', padding:'2px 8px', borderRadius:20 }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ color:'var(--accent2)', fontWeight:500 }}>€{o.verkoopprijs?.toFixed(2)}</td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>{o.aangemaakt_op?.split('T')[0]}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap:4 }}>
                            <a className="btn" style={{ fontSize:10, padding:'3px 7px' }} href={`${BASE}/offertes2/${o.id}/pdf`} download title="PDF">↓</a>
                            <button className="btn danger" style={{ fontSize:10, padding:'3px 7px' }} onClick={() => del(o.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

        {detail && (
          <div className="card" style={{ position:'sticky', top:0, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <h2 style={{ fontSize:15, fontWeight:700 }}>{detail.nummer}</h2>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn" style={{ fontSize:11 }} onClick={() => setOfferteModal({...detail})}>✏</button>
                <button className="btn" onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>

            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.65rem', marginBottom:'0.75rem', fontSize:13 }}>
              <div style={{ fontWeight:600 }}>{detail.klant_voornaam ? `${detail.klant_voornaam} ${detail.klant_naam}` : detail.klant_naam}</div>
              {detail.email && <div style={{ color:'var(--muted)', fontSize:12 }}>✉ {detail.email}</div>}
              {detail.object_naam && <div style={{ color:'var(--accent)', fontSize:12 }}>📦 {detail.object_naam}</div>}
              {detail.object_link && <a href={detail.object_link} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--accent)' }}>🔗 Link</a>}
              <div style={{ display:'flex', gap:12, marginTop:6, fontSize:11, color:'var(--muted)' }}>
                {detail.geldig_tot && <span>Geldig tot: {detail.geldig_tot}</span>}
                {detail.levertermijn && <span>Levertermijn: {detail.levertermijn}</span>}
              </div>
            </div>

            {/* 📄 Offerteregels — zelfde regel-indeling als op de PDF: aantal /
                omschrijving / eenheidsprijs / totaal. Bewust geen interne
                rekendetails (faalfactor, printer, machine-uurkost, ...). */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
              <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>📄 Offerteregels</p>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left', color:'var(--muted)', fontSize:10, textTransform:'uppercase' }}>
                    <th style={{ padding:'2px 4px 6px 0' }}>Aantal</th>
                    <th style={{ padding:'2px 4px 6px' }}>Omschrijving</th>
                    <th style={{ padding:'2px 4px 6px', textAlign:'right' }}>Eenh.prijs</th>
                    <th style={{ padding:'2px 0 6px 4px', textAlign:'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {offerteRegelsClientNieuw({ regels: detail.regels || [], marge_pct: detail.marge_pct }).map((r, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'4px 4px 4px 0' }}>{r.aantal}</td>
                      <td style={{ padding:'4px' }}>{r.omschrijving}</td>
                      <td style={{ padding:'4px', textAlign:'right' }}>€{r.eenheidsprijs.toFixed(2)}</td>
                      <td style={{ padding:'4px 0 4px 4px', textAlign:'right' }}>€{r.totaal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', fontWeight:700, fontSize:15 }}>
                <span>Verkoopprijs</span><span style={{ color:'var(--accent2)' }}>€{detail.verkoopprijs?.toFixed(2)}</span>
              </div>
              {detail.btw_pct > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--muted)' }}>
                  <span>+ BTW {detail.btw_pct}%</span>
                  <span>€{detail.btw_bedrag?.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom:'0.75rem' }}>
              <label style={{ fontSize:11 }}>Status</label>
              <select value={detail.status} onChange={e => updateStatus(detail.id, e.target.value)}>
                {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {detail.notities && (
              <div style={{ background:'#fffbeb', borderLeft:'3px solid #f59e0b', padding:'7px 10px', borderRadius:4, fontSize:12, color:'#664400', marginBottom:'0.75rem' }}>
                📝 {detail.notities}
              </div>
            )}

            {jobStatus && <div style={{ fontSize:12, color: jobStatus.includes('✓') ? 'var(--accent2)' : 'var(--danger)', marginBottom:6 }}>{jobStatus}</div>}

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <a className="btn" style={{ textAlign:'center' }} href={`${BASE}/offertes2/${detail.id}/pdf`} download>↓ PDF downloaden</a>
              {!detail.werkbon && detail.status !== 'geannuleerd' && (
                <button className="btn primary" onClick={() => maakWerkbon(detail.id)}>🔧 Maak werkbon</button>
              )}
              {detail.werkbon && <div style={{ fontSize:12, color:'var(--accent2)', textAlign:'center' }}>✓ Werkbon: {detail.werkbon.volgnummer}</div>}
            </div>
          </div>
        )}
      </div>

      {offerteModal !== null && (
        <OfferteModal
          offerte={offerteModal}
          klanten={klanten} printers={printers} filamentTypes={filamentTypes}
          allRollen={allRollen} tarieven={tarieven}
          onKlantToegevoegd={(k) => api.get('/klanten').then(setKlanten)}
          onSaved={async (updated) => {
            await load();
            if (detail && String(detail.id) === String(updated.id)) {
              const u = await api.get(`/offertes2/${updated.id}`); setDetail(u);
            }
          }}
          onClose={() => setOfferteModal(null)}
        />
      )}
    </div>
  );
}
