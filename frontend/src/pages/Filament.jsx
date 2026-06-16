import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const KLEUREN = [
  { naam: 'Wit',         hex: '#f5f5f5' },
  { naam: 'Zwart',       hex: '#1a1a1a' },
  { naam: 'Grijs',       hex: '#808080' },
  { naam: 'Rood',        hex: '#ef4444' },
  { naam: 'Blauw',       hex: '#3b82f6' },
  { naam: 'Groen',       hex: '#22c55e' },
  { naam: 'Geel',        hex: '#eab308' },
  { naam: 'Oranje',      hex: '#f97316' },
  { naam: 'Paars',       hex: '#a855f7' },
  { naam: 'Roze',        hex: '#ec4899' },
  { naam: 'Bruin',       hex: '#92400e' },
  { naam: 'Beige',       hex: '#d4b896' },
  { naam: 'Zilver',      hex: '#c0c0c0' },
  { naam: 'Goud',        hex: '#d4af37' },
  { naam: 'Transparant', hex: '#e0f2fe' },
];

const KLEUR_GROEPEN = {
  'lavendel':'#a855f7','lila':'#a855f7','violet':'#a855f7','magenta':'#ec4899',
  'fuchsia':'#ec4899','zalm':'#f97316','koraal':'#f97316','bordeaux':'#ef4444',
  'donkerrood':'#ef4444','turquoise':'#22c55e','mintgroen':'#22c55e','limoen':'#eab308',
  'marineblauw':'#3b82f6','donkerblauw':'#3b82f6','lichtblauw':'#3b82f6',
  'crème':'#d4b896','ivoor':'#f5f5f5','antraciet':'#808080','zwartgrijs':'#808080',
  'koper':'#d4af37','brons':'#92400e','naturel':'#d4b896','fluorescerend':'#eab308',
};

function kleurHex(naam, hex) {
  if (hex) return hex;
  if (!naam) return '#555';
  const lower = naam.toLowerCase();
  const exacte = KLEUREN.find(k => k.naam?.toLowerCase() === lower);
  if (exacte) return exacte.hex;
  return KLEUR_GROEPEN[lower] || '#555';
}

function KleurDot({ kleur, hex, size = 12 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: kleurHex(kleur, hex), border: '1px solid rgba(255,255,255,0.15)',
      flexShrink: 0, verticalAlign: 'middle', marginRight: 6
    }} title={kleur} />
  );
}

// ─── TypeModal ───────────────────────────────────────────────────────────────
const CATEGORIEEN = [
  { waarde: 'filament',           label: '🧵 Filament' },
  { waarde: 'onderdeel',          label: '🔧 Onderdeel (sleutelhangers, ringetjes...)' },
  { waarde: 'verbruiksmateriaal', label: '🧪 Verbruiksmateriaal (lijm, schroeven...)' },
  { waarde: 'overig',             label: '📦 Overig' },
];
const EENHEDEN = [
  { waarde: 'gram', label: 'gram (g)' },
  { waarde: 'stuk', label: 'stuk(s)' },
  { waarde: 'ml',   label: 'milliliter (ml)' },
];

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState(type?.id ? { ...type } : {
    merk: '', materiaal: 'PLA+', inkoop_prijs_per_kg: '', dichtheid_g_per_cm3: 1.24, leverancier: '',
    categorie: 'filament', eenheid: 'gram', marge_pct: '', min_voorraad: ''
  });
  // Lokale strings zodat je ononderbroken kan typen
  const [prijsStr, setPrijsStr] = useState(String(form.inkoop_prijs_per_kg ?? ''));
  const [margeStr, setMargeStr] = useState(String(form.marge_pct ?? ''));
  const [minVoorraadStr, setMinVoorraadStr] = useState(String(form.min_voorraad ?? ''));

  const isFilament = form.categorie === 'filament';
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

 async function save() {
    if (!form.merk || !form.materiaal) { alert('Merk/naam en materiaal/omschrijving zijn verplicht'); return; }
    const prijs = parseFloat(prijsStr.replace(',', '.'));
    const marge = margeStr !== '' ? parseFloat(margeStr.replace(',', '.')) : null;
    const minVoorraad = minVoorraadStr !== '' ? parseFloat(minVoorraadStr.replace(',', '.')) : null;
    try {
      const payload = {
        ...form,
        inkoop_prijs_per_kg: (!isNaN(prijs) && prijs > 0) ? prijs : 0,
        marge_pct: (marge != null && !isNaN(marge)) ? marge : null,
        min_voorraad: (minVoorraad != null && !isNaN(minVoorraad)) ? minVoorraad : null,
      };
      if (type?.id) await api.put(`/filament/types/${type.id}`, payload);
      else await api.post('/filament/types', payload);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{type?.id ? 'Artikeltype bewerken' : 'Nieuw artikeltype'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Categorie *</label>
          <select value={form.categorie} onChange={e => set('categorie', e.target.value)}>
            {CATEGORIEEN.map(c => <option key={c.waarde} value={c.waarde}>{c.label}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{isFilament ? 'Merk *' : 'Merk/Leverancier *'}</label>
            <input value={form.merk} onChange={e => set('merk', e.target.value)} placeholder={isFilament ? 'bv. Elegoo' : 'bv. AliExpress'} />
          </div>
          <div className="form-group">
            <label>{isFilament ? 'Materiaal *' : 'Omschrijving *'}</label>
            <input value={form.materiaal} onChange={e => set('materiaal', e.target.value)} placeholder={isFilament ? 'bv. PLA+' : 'bv. Sleutelhanger rond 30mm'} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Eenheid *</label>
            <select value={form.eenheid} onChange={e => set('eenheid', e.target.value)}>
              {EENHEDEN.map(e => <option key={e.waarde} value={e.waarde}>{e.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Marge (%) <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>leeg = globale marge</span></label>
            <input value={margeStr} onChange={e => setMargeStr(e.target.value)} placeholder="bv. 30" />
          </div>
        </div>

        {isFilament && (
          <div className="form-group">
            <label>Dichtheid (g/cm³)</label>
            <input type="number" step="0.01" value={form.dichtheid_g_per_cm3}
              onChange={e => set('dichtheid_g_per_cm3', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label>Minimum voorraad <span style={{ color:'var(--muted)', fontWeight:400, fontSize:11 }}>
            {isFilament ? 'leeg = automatisch 50g (≤200g rol) / 100g (≥1000g rol)' : 'drempel voor "Te bestellen"'}
          </span></label>
          <input value={minVoorraadStr} onChange={e => setMinVoorraadStr(e.target.value)} placeholder={isFilament ? 'optioneel' : 'bv. 10'} />
        </div>

        <div className="form-group">
          <label>Leverancier</label>
          <input value={form.leverancier || ''} onChange={e => set('leverancier', e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ─── RolModal ────────────────────────────────────────────────────────────────
function RolModal({ types, rol, onClose, onSaved }) {
  const isEdit = !!rol?.id;

  const [form, setForm] = useState(rol?.id ? {
    filament_type_id: rol.filament_type_id,
    kleur:              rol.kleur || '',
    kleur_hex:          rol.kleur_hex || '',
    gewicht_gram_start: rol.gewicht_gram_start,
    gewicht_gram_huidig: rol.gewicht_gram_huidig,
    locatie:            rol.locatie || '',
    gekocht_op:         rol.gekocht_op || new Date().toISOString().split('T')[0],
    actief:             rol.actief,
    aankoopprijs_eur:   rol.aankoopprijs_eur ?? '',
    lotnummer:          rol.lotnummer || '',
    } : {
    filament_type_id:   types[0]?.id || '',
    kleur:              '',
    kleur_hex:          '',
    gewicht_gram_start: 1000,
    gewicht_gram_huidig: 1000,
    locatie:            '',
    gekocht_op:         new Date().toISOString().split('T')[0],
    actief:             1,
    aankoopprijs_eur:   '',
    lotnummer:          '',
  });

  // Lokale strings voor numerieke velden — cursor springt niet weg
  const [startStr,  setStartStr]  = useState(String(form.gewicht_gram_start));
  const [huidigStr, setHuidigStr] = useState(String(form.gewicht_gram_huidig));
  const [prijsStr,  setPrijsStr]  = useState(String(form.aankoopprijs_eur ?? ''));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function setStandaard(gram) {
    setStartStr(String(gram));
    set('gewicht_gram_start', gram);
    if (!isEdit) {
      setHuidigStr(String(gram));
      set('gewicht_gram_huidig', gram);
    }
  }

  // Effectieve prijs/kg berekenen voor weergave
  const gekozenType = types.find(t => t.id === parseInt(form.filament_type_id));
  const aankoopNum  = parseFloat(prijsStr.replace(',', '.'));
  const startNum    = parseFloat(startStr) || 1000;
  const prijsPerKg  = (!isNaN(aankoopNum) && aankoopNum > 0)
    ? aankoopNum / (startNum / 1000)
    : gekozenType?.inkoop_prijs_per_kg;

  const prijsInfo = gekozenType ? (() => {
    if (!isNaN(aankoopNum) && aankoopNum > 0) {
      return `Aankoopprijs €${aankoopNum.toFixed(2)} = €${prijsPerKg.toFixed(2)}/kg (typeprijs: €${gekozenType.inkoop_prijs_per_kg.toFixed(2)}/kg)`;
    }
    return `Typeprijs: €${gekozenType.inkoop_prijs_per_kg.toFixed(2)}/kg (geen rolprijs ingevuld)`;
  })() : null;

  async function save() {
    const startG  = parseFloat(startStr)  || 1000;
    const huidigG = parseFloat(huidigStr) || startG;
    const aankoopVal = prijsStr !== '' ? parseFloat(prijsStr.replace(',', '.')) : null;

    const payload = {
      ...form,
      gewicht_gram_start:  startG,
      gewicht_gram_huidig: huidigG,
      aankoopprijs_eur:    (!isNaN(aankoopVal) && aankoopVal > 0) ? aankoopVal : null,
    };

    try {
      if (isEdit) await api.put(`/filament/rollen/${rol.id}`, payload);
      else await api.post('/filament/rollen', payload);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? 'Rol bewerken' : 'Nieuwe rol toevoegen'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* Filamenttype — altijd aanpasbaar */}
        <div className="form-group">
          <label>Filamenttype *</label>
          <select value={form.filament_type_id} onChange={e => set('filament_type_id', e.target.value)}>
            {types.map(t => <option key={t.id} value={t.id}>{t.merk} {t.materiaal}</option>)}
          </select>
        </div>

        {/* Kleur */}
        <div className="form-group">
          <label>Kleur</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: kleurHex(form.kleur, form.kleur_hex), border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
            <input value={form.kleur} onChange={e => set('kleur', e.target.value)} placeholder="bv. Robijnrood, Lavendel..." />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {KLEUREN.map(k => (
              <button key={k.naam} onClick={() => set('kleur_hex', k.hex)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
                  border: form.kleur_hex === k.hex ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: form.kleur_hex === k.hex ? 'var(--bg3)' : 'transparent',
                  cursor: 'pointer', fontSize: 11, color: 'var(--text)'
                }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: k.hex, border: '1px solid rgba(255,255,255,0.2)' }} />
                {k.naam}
              </button>
            ))}
          </div>
        </div>

        {/* Standaard gewicht knoppen */}
        <div className="form-group">
          <label>Standaard rolgewicht</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            {[1000, 200].map(g => (
              <button key={g} className={`btn${parseFloat(startStr) === g ? ' primary' : ''}`}
                style={{ flex: 1 }} onClick={() => setStandaard(g)}>
                {g}g {g === 200 ? '(mini rol)' : '(standaard)'}
              </button>
            ))}
          </div>
          {prijsInfo && (
            <div style={{ fontSize: 11, color: 'var(--accent2)', marginBottom: 4 }}>💰 {prijsInfo}</div>
          )}
        </div>

        {/* Gewichten */}
        <div className="form-row">
          <div className="form-group">
            <label>Startgewicht (g)</label>
            <input type="number" value={startStr}
              onChange={e => {
                setStartStr(e.target.value);
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) {
                  set('gewicht_gram_start', n);
                  if (!isEdit) { setHuidigStr(e.target.value); set('gewicht_gram_huidig', n); }
                }
              }} />
          </div>
          <div className="form-group">
            <label>Huidig gewicht (g) {isEdit && <span style={{ color: 'var(--accent)', fontSize: 11 }}>← pas dit aan</span>}</label>
            <input type="number" value={huidigStr}
              onChange={e => {
                setHuidigStr(e.target.value);
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) set('gewicht_gram_huidig', n);
              }} />
          </div>
        </div>

        {/* Aankoopprijs + lotnummer */}
        <div className="form-row">
          <div className="form-group">
            <label>Aankoopprijs rol (€) <span style={{ color: 'var(--muted)', fontWeight: 400 }}>optioneel</span></label>
            <input
              type="number" step="0.01" min="0"
              value={prijsStr}
              placeholder={gekozenType ? `typeprijs: €${(gekozenType.inkoop_prijs_per_kg * startNum / 1000).toFixed(2)}` : ''}
              onChange={e => setPrijsStr(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Lotnummer <span style={{ color: 'var(--muted)', fontWeight: 400 }}>optioneel</span></label>
            <input value={form.lotnummer} onChange={e => set('lotnummer', e.target.value)} placeholder="bv. Amazon 2024-06" />
          </div>
        </div>

        {/* Locatie + datum */}
        <div className="form-row">
          <div className="form-group">
            <label>Locatie</label>
            <input value={form.locatie} onChange={e => set('locatie', e.target.value)} placeholder="bv. Rek A" />
          </div>
          <div className="form-group">
            <label>Aankoopdatum</label>
            <input type="date" value={form.gekocht_op} onChange={e => set('gekocht_op', e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

// ─── Hoofdcomponent ──────────────────────────────────────────────────────────
export default function Filament() {
  const [types,     setTypes]     = useState([]);
  const [rollen,    setRollen]    = useState([]);
  const [tab,       setTab]       = useState('rollen');
  const [typeModal, setTypeModal] = useState(null);
  const [rolModal,  setRolModal]  = useState(null);

  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') ? parseInt(searchParams.get('highlight')) : null;
  const highlightRef = useRef(null);

  const load = () => {
    api.get('/filament/types').then(setTypes);
    api.get('/filament/rollen').then(setRollen);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, rollen]);

  async function toggleRol(rol) {
    try {
      await api.put(`/filament/rollen/${rol.id}`, { ...rol, actief: rol.actief ? 0 : 1 });
      load();
    } catch (e) { alert(e.message); }
  }

  async function deleteRol(rol) {
    if (!confirm(`Rol "${rol.merk} ${rol.materiaal} – ${rol.kleur || 'geen kleur'}" verwijderen?`)) return;
    try {
      await api.delete(`/filament/rollen/${rol.id}`);
      load();
    } catch (e) { alert(e.message); }
  }

  async function deleteType(t) {
    if (!confirm(`Type "${t.merk} ${t.materiaal}" verwijderen?`)) return;
    try {
      await api.delete(`/filament/types/${t.id}`);
      load();
    } catch (e) { alert(e.message); }
  }

  function VoorraadBalk({ huidig, start }) {
    const pct = Math.min(100, Math.round((huidig / (start || 1000)) * 100));
    const kleur = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: kleur, borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>{pct}%</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Artikelen</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'types'  && <button className="btn primary" onClick={() => setTypeModal({})}>+ Nieuw type</button>}
          {tab === 'rollen' && <button className="btn primary" onClick={() => setRolModal({})}>+ Nieuwe voorraad</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem' }}>
        {['rollen', 'types'].map(t => (
          <button key={t} className={`btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'rollen' ? 'Voorraad' : 'Artikeltypes'}
          </button>
        ))}
      </div>

      {/* ── Rollen tabel ── */}
      {tab === 'rollen' && (
        rollen.length === 0
          ? <div className="empty">Geen rollen geregistreerd</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Kleur</th>
                    <th>Lot</th>
                    <th>Gewicht</th>
                    <th>Prijs/kg</th>
                    <th>Restwaarde</th>
                    <th>Locatie</th>
                    <th>Status</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {rollen.map(r => (
                    <tr key={r.id} ref={r.id === highlightId ? highlightRef : null} style={{ opacity: r.actief ? 1 : 0.5, cursor:'pointer', outline: r.id === highlightId ? '2px solid var(--accent)' : undefined, background: r.id === highlightId ? 'var(--bg3)' : undefined }} onClick={() => setRolModal(r)}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.merk} {r.materiaal}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <KleurDot kleur={r.kleur} hex={r.kleur_hex} size={14} />
                          <span>{r.kleur || <span style={{ color: 'var(--muted)' }}>—</span>}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.lotnummer || '—'}</td>
                      <td style={{ minWidth: 160 }}>
                        <div style={{ marginBottom: 4 }}>
                          {parseFloat(r.gewicht_gram_huidig).toFixed(0)}g
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}> / {parseFloat(r.gewicht_gram_start).toFixed(0)}g</span>
                        </div>
                        <VoorraadBalk huidig={r.gewicht_gram_huidig} start={r.gewicht_gram_start} />
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ color: r.aankoopprijs_eur ? 'var(--accent2)' : 'var(--muted)' }}>
                          €{parseFloat(r.prijs_per_kg_effectief || r.inkoop_prijs_per_kg).toFixed(2)}/kg
                        </div>
                        {r.aankoopprijs_eur && (
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>rol: €{parseFloat(r.aankoopprijs_eur).toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ color: 'var(--accent2)' }}>€{r.restwaarde_eur}</td>
                      <td style={{ color: 'var(--muted)' }}>{r.locatie || '—'}</td>
                      <td>
                        <span className={`badge ${r.actief ? 'bezig' : 'geannuleerd'}`}>
                          {r.actief ? 'actief' : 'leeg'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setRolModal(r)}>✏</button>
                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => toggleRol(r)}>
                            {r.actief ? 'Leeg' : 'Heractiveer'}
                          </button>
                          <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteRol(r)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* ── Types tabel ── */}
      {tab === 'types' && (
        types.length === 0
          ? <div className="empty">Geen artikeltypes</div>
          : <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Categorie</th><th>Merk/Leverancier</th><th>Materiaal/Omschrijving</th><th>Eenheid</th><th>Marge</th><th>Leverancier</th><th>Acties</th></tr>
		</thead>
                <tbody>
                  {types.map(t => {
                    const cat = CATEGORIEEN.find(c => c.waarde === (t.categorie || 'filament'));
                    return (
                    <tr key={t.id} style={{ cursor:'pointer' }} onClick={() => setTypeModal(t)}>
                      <td style={{ fontSize: 12 }}>{cat?.label || t.categorie}</td>
                      <td style={{ fontWeight: 500 }}>{t.merk}</td>
                      <td>{t.materiaal}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.eenheid || 'gram'}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.marge_pct != null ? `${t.marge_pct}%` : <span style={{ fontStyle:'italic' }}>globaal</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{t.leverancier || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setTypeModal(t)}>✏</button>
                          <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteType(t)}>✕</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {typeModal !== null && (
        <TypeModal
          type={typeModal?.id ? typeModal : null}
          onClose={() => setTypeModal(null)}
          onSaved={() => { setTypeModal(null); load(); }}
        />
      )}
      {rolModal !== null && (
        <RolModal
          types={types}
          rol={rolModal?.id ? rolModal : null}
          onClose={() => setRolModal(null)}
          onSaved={() => { setRolModal(null); load(); }}
        />
      )}
    </div>
  );
}
