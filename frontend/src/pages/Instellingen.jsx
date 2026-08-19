import { useState, useEffect } from 'react';
import { api, BASE } from '../lib/api.js';

const GROEPEN = [
  { titel: 'Kosten & energie', sleutels: ['kwh_prijs'] },
  { titel: 'Marge', sleutels: ['marge_grens_uur','marge_klein_pct','marge_groot_pct','faalfactor_pct'], info: 'Klein = print korter dan grens · Groot = print langer dan grens' },
  { titel: 'Standaard arbeid', sleutels: ['voorbereiding_min','nabewerking_min'], info: 'Automatisch verrekend bij elke print' },
  { titel: 'Regie tarieven', sleutels: ['ontwerp_tarief','nabewerking_tarief','arbeid_per_uur'], info: 'Gebruikt bij ontwerp op maat of uitgebreide nabewerking' },
  { titel: 'BMCU', sleutels: ['bmcu_per_job'] },
];
export default function Instellingen() {
  const [tarieven, setTarieven]       = useState({});
  const [geladen, setGeladen]         = useState(false);
  const [printers, setPrinters]       = useState([]);
  const [haUrl, setHaUrl]             = useState('');
  const [haToken, setHaToken]         = useState('');
  const [tokenZichtbaar, setTokenZichtbaar] = useState(false);
  const [saved, setSaved]             = useState('');
  const [haTestStatus, setHaTestStatus] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy,    setResetBusy]    = useState(false);
  const [resetResult,  setResetResult]  = useState(null);
  const [resetError,   setResetError]   = useState('');
  const [nieuwePrinter, setNieuwePrinter] = useState(null);

  async function startNieuwJaar() {
    if (resetConfirm !== 'RESET') return;
    if (!confirm('Dit archiveert de volledige database en maakt daarna jobs, offertes, bestellingen en de volledige stock (filament + artikelen) definitief leeg. Klanten, leveranciers en instellingen blijven behouden.\n\nWeet je het zeker?')) return;
    setResetBusy(true);
    setResetError('');
    setResetResult(null);
    try {
      const r = await api.post('/reset/nieuw-jaar', { bevestiging: resetConfirm });
      setResetResult(r);
      setResetConfirm('');
      window.open(`${BASE}/reset/download/${r.archiefBestand}`, '_blank');
    } catch (e) {
      setResetError(e.message);
    } finally {
      setResetBusy(false);
    }
  }

  useEffect(() => {
    api.get('/tarieven').then(rows => {
      const map = {};
      rows.forEach(r => { map[r.sleutel] = { ...r }; });
      setTarieven(map);
      setGeladen(true);
    });
    api.get('/printers').then(setPrinters);
    // Laad HA instellingen uit de instellingen tabel
    api.get('/instellingen').then(rows => {
      const map = {};
      rows.forEach(r => { map[r.sleutel] = r.waarde; });
      setHaUrl(map.ha_url || 'http://192.168.0.105:8123');
      setHaToken(map.ha_token || '');
    }).catch(() => {});
  }, []);

  function setTarief(sleutel, waarde) {
    setTarieven(t => ({ ...t, [sleutel]: { ...t[sleutel], waarde: parseFloat(waarde) || 0 } }));
  }

  async function saveTarieven() {
    for (const [sleutel, t] of Object.entries(tarieven)) {
      await api.put(`/tarieven/${sleutel}`, { waarde: t.waarde });
    }
    setSaved('Tarieven opgeslagen!');
    setTimeout(() => setSaved(''), 3000);
  }

  async function saveHaInstellingen() {
    await api.put('/instellingen/ha_url',   { waarde: haUrl });
    await api.put('/instellingen/ha_token', { waarde: haToken });
    setSaved('HA instellingen opgeslagen!');
    setTimeout(() => setSaved(''), 3000);
  }

  async function testHaVerbinding() {
    setHaTestStatus('Bezig...');
    try {
      const result = await api.get('/ha/test');
      if (result?.ok) {
        setHaTestStatus('✓ Verbinding OK');
      } else {
        setHaTestStatus('✗ Verbinding mislukt');
      }
    } catch {
      setHaTestStatus('✗ Verbinding mislukt');
    }
    setTimeout(() => setHaTestStatus(''), 4000);
  }

  function setPrinter(id, k, v) {
    setPrinters(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  }

  async function savePrinter(printer) {
    await api.put(`/printers/${printer.id}`, printer);
    setSaved('Printer opgeslagen!');
    setTimeout(() => setSaved(''), 3000);
  }

  function setNieuw(k, v) {
    setNieuwePrinter(p => ({ ...p, [k]: v }));
  }

  async function maakPrinter() {
    if (!nieuwePrinter?.naam?.trim()) { alert('Naam is verplicht'); return; }
    try {
      await api.post('/printers', {
        naam: nieuwePrinter.naam.trim(),
        type: 'FDM',
        ha_entity_prefix:     nieuwePrinter.ha_entity_prefix || null,
        kwh_entity:           nieuwePrinter.kwh_entity || null,
        watt_entity:          nieuwePrinter.watt_entity || null,
        machine_kost_per_uur: nieuwePrinter.machine_kost_per_uur || 0.13,
        heeft_bmcu:           nieuwePrinter.heeft_bmcu ? 1 : 0,
        gem_verbruik_watt:    nieuwePrinter.gem_verbruik_watt || null,
      });
      setNieuwePrinter(null);
      setPrinters(await api.get('/printers'));
      setSaved('Printer toegevoegd!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  if (!geladen) return <div style={{ padding:'2rem', color:'var(--muted)' }}>Laden...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Instellingen</h1>
        {saved && <span style={{ color:'var(--accent2)', fontSize:13 }}>✓ {saved}</span>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', alignItems:'start' }}>

        {/* LINKER KOLOM — tarieven + HA verbinding */}
        <div>
          {GROEPEN.map(g => {
            const velden = g.sleutels.map(s => tarieven[s]).filter(Boolean);
            return (
              <div key={g.titel} className="card" style={{ marginBottom:'1rem' }}>
                <h2 style={{ fontSize:14, fontWeight:600, marginBottom: g.info ? 4 : '1rem' }}>{g.titel}</h2>
                {g.info && <p style={{ fontSize:11, color:'var(--muted)', marginBottom:'0.75rem' }}>{g.info}</p>}
                {velden.length === 0
                  ? <p style={{ fontSize:12, color:'var(--muted)' }}>Geen tarieven gevonden — herstart de addon.</p>
                  : velden.map(t => (
                    <div key={t.sleutel} className="form-group">
                      <label>{t.label} <span style={{ color:'var(--muted)', fontWeight:400 }}>({t.eenheid})</span></label>
                      <input type="number" step="0.01" value={t.waarde}
                        onChange={e => setTarief(t.sleutel, e.target.value)} />
                    </div>
                  ))
                }
              </div>
            );
          })}
          <button className="btn primary" style={{ width:'100%' }} onClick={saveTarieven}>
            Tarieven opslaan
          </button>

          {/* HA VERBINDING */}
          <div className="card" style={{ marginTop:'1.5rem' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.25rem' }}>Home Assistant verbinding</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:'1rem' }}>
              Gebruikt voor Watt-sampling per printjob. Token wordt versleuteld opgeslagen.
            </p>

            <div className="form-group">
              <label>HA URL</label>
              <input
                type="text"
                value={haUrl}
                onChange={e => setHaUrl(e.target.value)}
                placeholder="http://192.168.0.105:8123"
              />
            </div>

            <div className="form-group">
              <label>Long-Lived Access Token</label>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  type={tokenZichtbaar ? 'text' : 'password'}
                  value={haToken}
                  onChange={e => setHaToken(e.target.value)}
                  placeholder="eyJhbGci..."
                  style={{ flex:1, fontFamily:'monospace', fontSize:11 }}
                />
                <button
                  className="btn"
                  style={{ flexShrink:0, fontSize:11, padding:'4px 10px' }}
                  onClick={() => setTokenZichtbaar(v => !v)}
                >
                  {tokenZichtbaar ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:'0.75rem' }}>
              <button className="btn primary" style={{ flex:1 }} onClick={saveHaInstellingen}>
                Opslaan
              </button>
              <button className="btn" style={{ flex:1 }} onClick={testHaVerbinding}>
                Verbinding testen
              </button>
            </div>
            {haTestStatus && (
              <p style={{
                fontSize:12,
                marginTop:8,
                color: haTestStatus.startsWith('✓') ? 'var(--accent2)' : '#ef4444'
              }}>
                {haTestStatus}
              </p>
            )}
          </div>
        </div>

        {/* RECHTER KOLOM — printers + export */}
        <div>
          {nieuwePrinter === null ? (
            <button className="btn primary" style={{ width:'100%', marginBottom:'1rem' }}
              onClick={() => setNieuwePrinter({})}>
              + Nieuwe printer
            </button>
          ) : (
            <div className="card" style={{ marginBottom:'1rem' }}>
              <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>Nieuwe printer</h2>

              <div className="form-group">
                <label>Naam *</label>
                <input value={nieuwePrinter.naam || ''} onChange={e => setNieuw('naam', e.target.value)}
                  placeholder="bv. AnyCubic Kobra S1 Pro" />
              </div>

              <div className="form-group">
                <label>HA entity prefix <span style={{ color:'var(--muted)', fontWeight:400 }}>optioneel</span></label>
                <input value={nieuwePrinter.ha_entity_prefix || ''} onChange={e => setNieuw('ha_entity_prefix', e.target.value)}
                  placeholder="sensor.a1mini_0300da611800680_" />
              </div>

              <div className="form-group">
                <label>kWh entity (slim stopcontact — teller) <span style={{ color:'var(--muted)', fontWeight:400 }}>optioneel</span></label>
                <input value={nieuwePrinter.kwh_entity || ''} onChange={e => setNieuw('kwh_entity', e.target.value)}
                  placeholder="sensor.lsc_power_plug_fr_..._totaal_energieverbruik" />
              </div>

              <div className="form-group">
                <label>Watt entity (slim stopcontact — vermogen) <span style={{ color:'var(--muted)', fontWeight:400 }}>optioneel</span></label>
                <input value={nieuwePrinter.watt_entity || ''} onChange={e => setNieuw('watt_entity', e.target.value)}
                  placeholder="sensor.lsc_power_plug_fr_..._vermogen" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Machine kost/uur (€)</label>
                  <input type="number" step="0.01" value={nieuwePrinter.machine_kost_per_uur ?? ''}
                    onChange={e => setNieuw('machine_kost_per_uur', parseFloat(e.target.value))} placeholder="0.13" />
                </div>
                <div className="form-group">
                  <label>Heeft BMCU</label>
                  <select value={nieuwePrinter.heeft_bmcu ? '1' : '0'} onChange={e => setNieuw('heeft_bmcu', e.target.value === '1' ? 1 : 0)}>
                    <option value="0">Nee</option>
                    <option value="1">Ja</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Gemiddeld verbruik (Watt) <span style={{ color:'var(--muted)', fontWeight:400 }}>optioneel</span></label>
                <input type="number" step="1" value={nieuwePrinter.gem_verbruik_watt ?? ''}
                  onChange={e => setNieuw('gem_verbruik_watt', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="bv. 300" />
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" style={{ flex:1 }} onClick={() => setNieuwePrinter(null)}>Annuleer</button>
                <button className="btn primary" style={{ flex:1 }} onClick={maakPrinter}>Toevoegen</button>
              </div>
            </div>
          )}

          {printers.map(p => (
            <div key={p.id} className="card" style={{ marginBottom:'1rem' }}>
              <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>{p.naam}</h2>

              <div className="form-group">
                <label>HA entity prefix</label>
                <input value={p.ha_entity_prefix || ''} onChange={e => setPrinter(p.id, 'ha_entity_prefix', e.target.value)}
                  placeholder="sensor.a1mini_0300da611800680_" />
              </div>

              <div className="form-group">
                <label>kWh entity (slim stopcontact — teller)</label>
                <input value={p.kwh_entity || ''} onChange={e => setPrinter(p.id, 'kwh_entity', e.target.value)}
                  placeholder="sensor.lsc_power_plug_fr_..._totaal_energieverbruik" />
              </div>

              <div className="form-group">
                <label>Watt entity (slim stopcontact — vermogen)</label>
                <input value={p.watt_entity || ''} onChange={e => setPrinter(p.id, 'watt_entity', e.target.value)}
                  placeholder="sensor.lsc_power_plug_fr_..._vermogen" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Machine kost/uur (€)</label>
                  <input type="number" step="0.01" value={p.machine_kost_per_uur}
                    onChange={e => setPrinter(p.id, 'machine_kost_per_uur', parseFloat(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>Heeft BMCU</label>
                  <select value={p.heeft_bmcu ? '1' : '0'} onChange={e => setPrinter(p.id, 'heeft_bmcu', e.target.value === '1' ? 1 : 0)}>
                    <option value="0">Nee</option>
                    <option value="1">Ja</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Gemiddeld verbruik (Watt)</label>
                <input type="number" step="1" value={p.gem_verbruik_watt ?? ''}
                  onChange={e => setPrinter(p.id, 'gem_verbruik_watt', e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="bv. 300" />
                <p style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                  Gebruikt als schatting voor energiekost wanneer er geen live kWh-meting is (bv. cloud-only printers).
                </p>
              </div>

              <button className="btn primary" style={{ width:'100%' }} onClick={() => savePrinter(p)}>
                Opslaan
              </button>
            </div>
          ))}

          <div className="card">
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>Data export</h2>
            <a className="btn" href="/api/rapportage/csv/jobs" download>↓ Jobs exporteren (CSV)</a>
          </div>

          <div className="card" style={{ border:'1px solid var(--danger)' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:8, color:'var(--danger)' }}>🗓 Nieuw jaar starten</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>
              Archiveert de volledige database naar een apart bestand (en download het meteen),
              en maakt daarna <b>jobs, offertes, bestellingen en de volledige stock</b> (filament + artikelen) leeg.
            </p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              <b>Klanten, leveranciers, printers, tarieven en instellingen blijven behouden.</b> Deze actie kan niet ongedaan gemaakt worden — enkel het archiefbestand bevat de oude data nog.
            </p>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Typ "RESET" om te bevestigen</label>
              <input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="RESET" />
            </div>
            <button className="btn" style={{ width:'100%', background:'var(--danger)', color:'#fff' }}
              disabled={resetConfirm !== 'RESET' || resetBusy}
              onClick={startNieuwJaar}>
              {resetBusy ? 'Bezig met archiveren en leegmaken...' : '🗓 Archiveren + nieuw jaar starten'}
            </button>
            {resetResult && (
              <div style={{ fontSize:11, color:'var(--accent2)', marginTop:8 }}>
                ✓ Klaar. Archief: {resetResult.archiefBestand} (download gestart — staat ook op de server in /data/archief/)
              </div>
            )}
            {resetError && (
              <div style={{ fontSize:11, color:'var(--danger)', marginTop:8 }}>✗ {resetError}</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
