import { useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import KlantModal from './KlantModal.jsx';
import {
  nieuweRegel, berekenOfferteRegelsClient, offerteRegelsClientNieuw, RegelCard, F,
} from '../lib/regelEditor.jsx';

const BTW_OPTIES = [0, 6, 21];

function standaardGeldigTot() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

// Zelfde kleine sectie-wrapper als Offertes.jsx (Sec) — bewust een eigen
// kopie i.p.v. gedeeld, zelfde conventie als elders in deze app (bv.
// REGEL_TYPE_LABELS die ook al dubbel in Jobs.jsx en de backend staat).
const Sec = ({ title, children }) => (
  <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.75rem' }}>
    <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>{title}</p>
    {children}
  </div>
);

// ── WerkbonModal ─────────────────────────────────────────────────────────
// Standalone werkbon aanmaken (zonder offertetraject) — qua vorm gebaseerd
// op OfferteModal (Offertes.jsx): klant-select, regelkaarten via RegelCard
// (../lib/regelEditor.jsx), live-preview totalen. In tegenstelling tot een
// offerte: geen object_link-veld, en POST /werkbonnen i.p.v. /offertes2.
// Enkel voor NIEUWE werkbons — bewerken van een bestaande werkbon (regels/
// handmatig_bedrag) gebeurt al via de bestaande PUT /werkbonnen/:id-flow op
// de Werkbons-tab zelf (Jobs.jsx), niet via deze modal.
export default function WerkbonModal({ klanten, printers, filamentTypes, allRollen, tarieven, onClose, onSaved, onKlantToegevoegd }) {
  const [form, setForm] = useState({
    klant_id: '', geldig_tot: standaardGeldigTot(), levertermijn: '3 weken',
    btw_pct: 0, notities: '', regels: [],
  });
  const [saving, setSaving] = useState(false);
  const [klantModal, setKlantModal] = useState(false);
  const set = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  const artikelTypes = filamentTypes.filter(f => (f.categorie || 'filament') !== 'filament');
  const printFilamentTypes = filamentTypes.filter(f => (f.categorie || 'filament') === 'filament');

  function setRegelPatch(i, patch) {
    set('regels', (form.regels || []).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function voegRegelToe() {
    set('regels', [...(form.regels || []), nieuweRegel('', tarieven)]);
  }
  function verwijderRegel(i) {
    set('regels', (form.regels || []).filter((_, idx) => idx !== i));
  }

  const klantGekozen = klanten.find(k => k.id === parseInt(form.klant_id));
  const klantNaamGekozen = klantGekozen ? (klantGekozen.voornaam ? `${klantGekozen.voornaam} ${klantGekozen.naam}` : klantGekozen.naam) : '';

  // Altijd live herberekend — een nieuwe werkbon heeft nog geen bevroren
  // waarden om naar terug te vallen (in tegenstelling tot OfferteModal's
  // "toonBevroren"-pad bij het bewerken van een bestaande offerte).
  const berekeningLive = berekenOfferteRegelsClient(form.regels || [], tarieven, allRollen, printers, filamentTypes);
  const previewRegels = offerteRegelsClientNieuw(berekeningLive);
  const btwBedragPreview = berekeningLive.verkoopprijs_basis * (form.btw_pct || 0) / 100;

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
        klant_id: form.klant_id,
        geldig_tot: form.geldig_tot, levertermijn: form.levertermijn,
        btw_pct: form.btw_pct, notities: form.notities,
        // _berekend is bevroren server-data, niet opnieuw opsturen — de
        // backend herberekent bij opslaan zelf op basis van de ruwe velden.
        regels: regels.map(({ _berekend, ...r }) => r),
      };
      const r = await api.post('/werkbonnen', payload);
      onSaved(r);
      onClose();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => {
      if (e.target === e.currentTarget && confirm('Werkbon sluiten? Niet-opgeslagen wijzigingen kunnen verloren gaan.')) onClose();
    }}>
      <div className="modal" style={{ width:760, maxHeight:'93vh', overflowY:'auto' }}>
        <div className="modal-header">
          <h2 style={{ fontSize:14 }}>Nieuwe werkbon</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* KLANT & WERKBON */}
        <Sec title="👤 Klant & werkbon">
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
        </Sec>

        {/* REGELS — diensten & objecten */}
        <Sec title="🧾 Regels — diensten & objecten">
          {(form.regels || []).map((regel, i) => {
            const berekend = berekeningLive.regels?.[i]?._berekend;
            const margeFactor = 1 + (berekeningLive.marge_pct || 0) / 100;
            const bedrag = berekend ? berekend.bedrag * (berekend.vaste_prijs ? 1 : margeFactor) : undefined;
            return (
              <RegelCard key={i} index={i} regel={regel}
                onChange={patch => setRegelPatch(i, patch)}
                onChangeSilent={patch => setRegelPatch(i, patch)}
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

        {/* WERKBON DETAILS */}
        <Sec title="📝 Werkbon details">
          <F label="BTW %" style={{ marginBottom:8 }}>
            <select value={form.btw_pct} onChange={e => set('btw_pct', parseFloat(e.target.value))}>
              {BTW_OPTIES.map(b => <option key={b} value={b}>{b}%</option>)}
            </select>
          </F>
          <F label="Notities">
            <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
          </F>
        </Sec>

        {/* LIVE WERKBON-PREVIEW — onderaan, letterlijk dezelfde
            offerteRegelsClientNieuw()-weergave als de offerte/werkbon-
            detailweergave. Wat je hier ziet is dus exact wat er straks
            bewaard wordt. */}
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'1rem', marginBottom:'0.75rem' }}>
          <p style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>📄 Live werkbon-preview</p>
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
                <span style={{ fontSize:22, color:'var(--accent2)' }}>€{berekeningLive.verkoopprijs.toFixed(2)}</span>
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
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Bezig...' : '📋 Werkbon aanmaken'}
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
