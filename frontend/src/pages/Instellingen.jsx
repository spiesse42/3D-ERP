import { useState, useEffect } from 'react';
import { api, BASE } from '../lib/api.js';

const GROEPEN = [
  { titel: 'Kosten & energie', sleutels: ['kwh_prijs'] },
  { titel: 'Marge', sleutels: ['marge_grens_uur','marge_klein_pct','marge_groot_pct','faalfactor_pct'], info: 'Klein = print korter dan grens · Groot = print langer dan grens' },
  { titel: 'Standaard arbeid', sleutels: ['voorbereiding_min','nabewerking_min'], info: 'Automatisch verrekend bij elke print' },
  { titel: 'Regie tarieven', sleutels: ['ontwerp_tarief','nabewerking_tarief','arbeid_per_uur'], info: 'Gebruikt bij ontwerp op maat of uitgebreide nabewerking' },
  { titel: 'BMCU', sleutels: ['bmcu_per_job'] },
];

// Submenu's — groeperen de instellingen per taak zodat je niet meer door
// één lange lijst kaarten hoeft te scrollen om iets terug te vinden.
const TABS = [
  { key: 'tarieven',    label: 'Tarieven' },
  { key: 'printers',    label: 'Printers' },
  { key: 'bedrijf',     label: 'Bedrijf' },
  { key: 'data',        label: 'Data & Backup' },
  { key: 'integraties', label: 'Integraties' },
];

export default function Instellingen() {
  const [tab, setTab]                 = useState('tarieven');
  const [tarieven, setTarieven]       = useState({});
  const [geladen, setGeladen]         = useState(false);
  const [printers, setPrinters]       = useState([]);
  const [haUrl, setHaUrl]             = useState('');
  const [haToken, setHaToken]         = useState('');
  const [tokenZichtbaar, setTokenZichtbaar] = useState(false);
  const [geminiKey, setGeminiKey]     = useState('');
  const [geminiKeyZichtbaar, setGeminiKeyZichtbaar] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState('');
  const [saved, setSaved]             = useState('');
  const [haTestStatus, setHaTestStatus] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy,    setResetBusy]    = useState(false);
  const [resetResult,  setResetResult]  = useState(null);
  const [resetError,   setResetError]   = useState('');
  const [nieuwePrinter, setNieuwePrinter] = useState(null);
  const [backups, setBackups]             = useState([]);
  const [backupBusy, setBackupBusy]       = useState(false);
  const [backupMelding, setBackupMelding] = useState('');
  const [backupAutoActief, setBackupAutoActief]     = useState(true);
  const [backupAutoInterval, setBackupAutoInterval] = useState('24');
  const [startdatum, setStartdatum]           = useState('');
  const [drempelOmzet, setDrempelOmzet]       = useState('25000');
  const [drempelWinst, setDrempelWinst]       = useState('1922.16');
  const [drempelSaved, setDrempelSaved]       = useState('');
  const [bedrijfNaam,  setBedrijfNaam]  = useState('');
  const [bedrijfBtw,   setBedrijfBtw]   = useState('');
  const [bedrijfAdres, setBedrijfAdres] = useState('');
  const [bedrijfEmail, setBedrijfEmail] = useState('');
  const [bedrijfIban,  setBedrijfIban]  = useState('');
  const [bedrijfSaved, setBedrijfSaved] = useState('');

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
    }).catch(e => {
      alert('Kon tarieven niet laden: ' + e.message);
      setGeladen(true); // anders blijft de pagina voor altijd op "Laden..." staan
    });
    api.get('/printers').then(setPrinters).catch(e => alert('Kon printers niet laden: ' + e.message));
    // Laad HA + backup instellingen uit de instellingen tabel
    api.get('/instellingen').then(rows => {
      const map = {};
      rows.forEach(r => { map[r.sleutel] = r.waarde; });
      setHaUrl(map.ha_url || 'http://192.168.0.105:8123');
      // Geheimen worden bewust nooit meer vanuit de server naar de browser geladen.
      setBackupAutoActief(map.backup_auto_actief !== '0');
      setBackupAutoInterval(map.backup_auto_interval_uren || '24');
      setStartdatum(map.bedrijf_startdatum || '');
      setDrempelOmzet(map.drempel_omzet_jaar || '25000');
      setDrempelWinst(map.drempel_winst_jaar || '1922.16');
      setBedrijfNaam(map.bedrijf_naam || '');
      setBedrijfBtw(map.bedrijf_btw || '');
      setBedrijfAdres(map.bedrijf_adres || '');
      setBedrijfEmail(map.bedrijf_email || '');
      setBedrijfIban(map.bedrijf_iban || '');
    }).catch(() => {});
    laadBackups();
  }, []);

  async function saveBedrijfsgegevens() {
    try {
      await api.put('/instellingen/bedrijf_naam',  { waarde: bedrijfNaam });
      await api.put('/instellingen/bedrijf_btw',   { waarde: bedrijfBtw });
      await api.put('/instellingen/bedrijf_adres', { waarde: bedrijfAdres });
      await api.put('/instellingen/bedrijf_email', { waarde: bedrijfEmail });
      await api.put('/instellingen/bedrijf_iban',  { waarde: bedrijfIban });
      setBedrijfSaved('Opgeslagen!');
      setTimeout(() => setBedrijfSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  async function saveDrempels() {
    try {
      await api.put('/instellingen/bedrijf_startdatum', { waarde: startdatum });
      await api.put('/instellingen/drempel_omzet_jaar', { waarde: drempelOmzet });
      await api.put('/instellingen/drempel_winst_jaar', { waarde: drempelWinst });
      setDrempelSaved('Opgeslagen!');
      setTimeout(() => setDrempelSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  function laadBackups() {
    api.get('/reset/archieven').then(rows => setBackups(rows.filter(r => r.type !== 'jaarreset'))).catch(() => {});
  }

  async function backupNu() {
    setBackupBusy(true);
    setBackupMelding('');
    try {
      await api.post('/reset/backup');
      setBackupMelding('✓ Backup gemaakt');
      laadBackups();
    } catch (e) {
      setBackupMelding(`✗ ${e.message}`);
    } finally {
      setBackupBusy(false);
      setTimeout(() => setBackupMelding(''), 4000);
    }
  }

  async function saveBackupAutoInstellingen(actief, interval) {
    try {
      await api.put('/instellingen/backup_auto_actief', { waarde: actief ? '1' : '0' });
      await api.put('/instellingen/backup_auto_interval_uren', { waarde: interval });
    } catch (e) { alert(e.message); }
  }

  function setTarief(sleutel, waarde) {
    setTarieven(t => ({ ...t, [sleutel]: { ...t[sleutel], waarde: parseFloat(waarde) || 0 } }));
  }

  async function saveTarieven() {
    try {
      for (const [sleutel, t] of Object.entries(tarieven)) {
        await api.put(`/tarieven/${sleutel}`, { waarde: t.waarde });
      }
      setSaved('Tarieven opgeslagen!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  async function saveHaInstellingen() {
    try {
      await api.put('/instellingen/ha_url', { waarde: haUrl });
      setSaved('HA URL opgeslagen! Het token beheer je in de add-onconfiguratie.');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  function saveGeminiKey() {
    setGeminiSaved('Stel de Gemini API-key in via Instellingen → Add-ons → 3D Print ERP → Configuratie.');
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
    try {
      await api.put(`/printers/${printer.id}`, printer);
      setSaved('Printer opgeslagen!');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) { alert(e.message); }
  }

  // Archiveren i.p.v. verwijderen — een printer die al gebruikt is (jobs,
  // offertes) kan niet weg (zie backend), maar mag wel uit nieuwe
  // selectielijsten verdwijnen zonder de historische naam te verliezen.
  async function togglePrinterActief(printer) {
    try {
      await api.patch(`/printers/${printer.id}/actief`, { actief: !printer.actief });
      setPrinters(await api.get('/printers'));
    } catch (e) { alert(e.message); }
  }

  async function verwijderPrinter(printer) {
    if (!confirm(`Printer "${printer.naam}" definitief verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    try {
      await api.delete(`/printers/${printer.id}`);
      setPrinters(await api.get('/printers'));
    } catch (e) { alert(e.message); }
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
        pause_entity:         nieuwePrinter.pause_entity  || null,
        resume_entity:        nieuwePrinter.resume_entity || null,
        cancel_entity:        nieuwePrinter.cancel_entity || null,
        camera_entity:        nieuwePrinter.camera_entity || null,
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

      <div style={{ display:'flex', gap:4, marginBottom:'1.25rem' }}>
        {TABS.map(t => (
          <button key={t.key} className={`btn${tab === t.key ? ' primary' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TARIEVEN ═══ */}
      {tab === 'tarieven' && (
        <div style={{ maxWidth:640 }}>
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
        </div>
      )}

      {/* ═══ PRINTERS (incl. Home Assistant-verbinding) ═══ */}
      {tab === 'printers' && (
        <div style={{ maxWidth:640 }}>
          {/* HA VERBINDING */}
          <div className="card" style={{ marginBottom:'1.5rem' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.25rem' }}>Home Assistant verbinding</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:'1rem' }}>
              Gebruikt voor Watt-sampling per printjob. Het token wordt enkel in de beveiligde add-onconfiguratie bewaard en nooit aan deze pagina teruggegeven.
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
              <label>Long-Lived Access Token (add-onconfiguratie)</label>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  type={tokenZichtbaar ? 'text' : 'password'}
                  value={haToken}
                  onChange={e => setHaToken(e.target.value)}
                  placeholder="Stel in via de add-onconfiguratie"
                  style={{ flex:1, fontFamily:'monospace', fontSize:11 }}
                  disabled
                />
                <button
                  className="btn"
                  style={{ flexShrink:0, fontSize:11, padding:'4px 10px' }}
                  onClick={() => setTokenZichtbaar(v => !v)}
                  disabled
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

              <h3 style={{ fontSize:12, fontWeight:600, marginTop:'1rem', marginBottom:4, color:'var(--muted)' }}>
                Bediening & live view <span style={{ fontWeight:400 }}>— optioneel, enkel invullen wat je HA-integratie aanbiedt</span>
              </h3>
              <div className="form-group">
                <label>Pauzeer-knop entity</label>
                <input value={nieuwePrinter.pause_entity || ''} onChange={e => setNieuw('pause_entity', e.target.value)}
                  placeholder="button.anycubic_printer_pause_print" />
              </div>
              <div className="form-group">
                <label>Hervat-knop entity</label>
                <input value={nieuwePrinter.resume_entity || ''} onChange={e => setNieuw('resume_entity', e.target.value)}
                  placeholder="button.anycubic_printer_resume_print" />
              </div>
              <div className="form-group">
                <label>Annuleer-knop entity</label>
                <input value={nieuwePrinter.cancel_entity || ''} onChange={e => setNieuw('cancel_entity', e.target.value)}
                  placeholder="button.anycubic_printer_cancel_print" />
              </div>
              <div className="form-group">
                <label>Camera entity</label>
                <input value={nieuwePrinter.camera_entity || ''} onChange={e => setNieuw('camera_entity', e.target.value)}
                  placeholder="camera.anycubic_s1_printer_camera" />
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" style={{ flex:1 }} onClick={() => setNieuwePrinter(null)}>Annuleer</button>
                <button className="btn primary" style={{ flex:1 }} onClick={maakPrinter}>Toevoegen</button>
              </div>
            </div>
          )}

          {printers.map(p => (
            <div key={p.id} className="card" style={{ marginBottom:'1rem', opacity: p.actief ? 1 : 0.6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <h2 style={{ fontSize:14, fontWeight:600 }}>
                  {p.naam}
                  {!p.actief && <span style={{ marginLeft:8, fontSize:11, fontWeight:400, color:'var(--muted)' }}>(inactief / verkocht)</span>}
                </h2>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => togglePrinterActief(p)}>
                    {p.actief ? 'Markeer inactief/verkocht' : 'Heractiveer'}
                  </button>
                  <button className="btn danger" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => verwijderPrinter(p)}>Verwijder</button>
                </div>
              </div>

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

              <h3 style={{ fontSize:12, fontWeight:600, marginTop:'1rem', marginBottom:4, color:'var(--muted)' }}>
                Bediening & live view <span style={{ fontWeight:400 }}>— optioneel, enkel invullen wat je HA-integratie aanbiedt</span>
              </h3>
              <div className="form-group">
                <label>Pauzeer-knop entity</label>
                <input value={p.pause_entity || ''} onChange={e => setPrinter(p.id, 'pause_entity', e.target.value)}
                  placeholder="button.anycubic_printer_pause_print" />
              </div>
              <div className="form-group">
                <label>Hervat-knop entity</label>
                <input value={p.resume_entity || ''} onChange={e => setPrinter(p.id, 'resume_entity', e.target.value)}
                  placeholder="button.anycubic_printer_resume_print" />
              </div>
              <div className="form-group">
                <label>Annuleer-knop entity</label>
                <input value={p.cancel_entity || ''} onChange={e => setPrinter(p.id, 'cancel_entity', e.target.value)}
                  placeholder="button.anycubic_printer_cancel_print" />
              </div>
              <div className="form-group">
                <label>Camera entity</label>
                <input value={p.camera_entity || ''} onChange={e => setPrinter(p.id, 'camera_entity', e.target.value)}
                  placeholder="camera.anycubic_s1_printer_camera" />
              </div>

              <button className="btn primary" style={{ width:'100%' }} onClick={() => savePrinter(p)}>
                Opslaan
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ BEDRIJF ═══ */}
      {tab === 'bedrijf' && (
        <div style={{ maxWidth:640 }}>
          <div className="card" style={{ marginBottom:'1.5rem' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>🏢 Bedrijfsgegevens</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              Verschijnt op offertes, werkbonnen en facturen (header/footer van het PDF-document).
            </p>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Bedrijfsnaam</label>
              <input value={bedrijfNaam} onChange={e => setBedrijfNaam(e.target.value)} placeholder="bv. 3D Plezier" />
            </div>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>BTW-nummer</label>
              <input value={bedrijfBtw} onChange={e => setBedrijfBtw(e.target.value)} placeholder="bv. BE0543857422" />
            </div>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Adres</label>
              <input value={bedrijfAdres} onChange={e => setBedrijfAdres(e.target.value)} placeholder="straat + nr, postcode gemeente" />
            </div>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>E-mailadres</label>
              <input value={bedrijfEmail} onChange={e => setBedrijfEmail(e.target.value)} placeholder="bv. info@bedrijf.be" />
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>IBAN</label>
              <input value={bedrijfIban} onChange={e => setBedrijfIban(e.target.value)} placeholder="bv. BE59 0020 3763 3126" />
            </div>
            <button className="btn primary" onClick={saveBedrijfsgegevens}>Opslaan</button>
            {bedrijfSaved && <span style={{ fontSize:11, color:'var(--accent2)', marginLeft:8 }}>{bedrijfSaved}</span>}
          </div>

          <div className="card">
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>📊 Drempels (bijberoep)</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              Gebruikt voor de voortgangsbalken op de Financiën-pagina (btw-vrijstelling kleine onderneming
              en vrijstelling sociale bijdragen bijberoep). Enkel een richtwaarde, geen officiële berekening —
              verifieer bij twijfel met je sociaal secretariaat of boekhouder.
            </p>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Startdatum (registratie als zelfstandige)</label>
              <input type="date" value={startdatum} onChange={e => setStartdatum(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:8 }}>
              <label>Omzetdrempel per jaar (€) — btw-vrijstelling</label>
              <input type="number" step="0.01" value={drempelOmzet} onChange={e => setDrempelOmzet(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label>Winstdrempel per jaar (€) — sociale bijdragen bijberoep</label>
              <input type="number" step="0.01" value={drempelWinst} onChange={e => setDrempelWinst(e.target.value)} />
            </div>
            <button className="btn primary" onClick={saveDrempels}>Opslaan</button>
            {drempelSaved && <span style={{ fontSize:11, color:'var(--accent2)', marginLeft:8 }}>{drempelSaved}</span>}
          </div>
        </div>
      )}

      {/* ═══ DATA & BACKUP ═══ */}
      {tab === 'data' && (
        <div style={{ maxWidth:640 }}>
          <div className="card" style={{ marginBottom:'1.5rem' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'1rem' }}>Data export</h2>
            <a className="btn" href="/api/rapportage/csv/jobs" download>↓ Jobs exporteren (CSV)</a>
          </div>

          <div className="card" style={{ marginBottom:'1.5rem' }}>
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>📦 Backup</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
              Niet-destructief: maakt enkel een kopie van de volledige database, er wordt niets verwijderd of leeggemaakt.
            </p>

            <button className="btn" style={{ marginBottom:8 }} disabled={backupBusy} onClick={backupNu}>
              {backupBusy ? 'Bezig...' : '📦 Backup nu maken'}
            </button>
            {backupMelding && (
              <div style={{ fontSize:11, color: backupMelding.startsWith('✓') ? 'var(--accent2)' : 'var(--danger)', marginBottom:8 }}>
                {backupMelding}
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:8, margin:'12px 0', fontSize:13 }}>
              <input type="checkbox" checked={backupAutoActief} style={{ width:16, height:16, cursor:'pointer' }}
                onChange={e => {
                  const v = e.target.checked;
                  setBackupAutoActief(v);
                  saveBackupAutoInstellingen(v, backupAutoInterval);
                }} />
              <span>Automatische backup</span>
              <select value={backupAutoInterval} disabled={!backupAutoActief} style={{ width:'auto' }}
                onChange={e => {
                  const v = e.target.value;
                  setBackupAutoInterval(v);
                  saveBackupAutoInstellingen(backupAutoActief, v);
                }}>
                <option value="24">Elke dag</option>
                <option value="168">Elke week</option>
              </select>
            </div>

            {backups.length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>Laatste backups ({backups.length}/20)</div>
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  {backups.map(b => (
                    <div key={b.bestand} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                      <span>
                        {b.aangemaakt.replace('T', ' ').slice(0, 16)}
                        <span style={{ color:'var(--muted)', marginLeft:6 }}>({b.type})</span>
                      </span>
                      <a className="btn" style={{ fontSize:10, padding:'2px 6px' }} href={`${BASE}/reset/download/${b.bestand}`} target="_blank" rel="noreferrer">↓</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
      )}

      {/* ═══ INTEGRATIES ═══ */}
      {tab === 'integraties' && (
        <div style={{ maxWidth:640 }}>
          <div className="card">
            <h2 style={{ fontSize:14, fontWeight:600, marginBottom:'0.25rem' }}>Factuurherkenning (Gemini)</h2>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:'1rem' }}>
              Nodig om geüploade facturen automatisch uit te lezen bij Artikelen. Stel de sleutel veilig in via Instellingen → Add-ons → 3D Print ERP → Configuratie. Gratis aan te maken via{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
            </p>

            <div className="form-group">
              <label>Gemini API-key (add-onconfiguratie)</label>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  type={geminiKeyZichtbaar ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="Stel in via de add-onconfiguratie"
                  style={{ flex:1, fontFamily:'monospace', fontSize:11 }}
                  disabled
                />
                <button
                  className="btn"
                  style={{ flexShrink:0, fontSize:11, padding:'4px 10px' }}
                  onClick={() => setGeminiKeyZichtbaar(v => !v)}
                  disabled
                >
                  {geminiKeyZichtbaar ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button className="btn primary" style={{ width:'100%', marginTop:'0.75rem' }} onClick={saveGeminiKey}>
              Toon configuratie-instructie
            </button>
            {geminiSaved && (
              <p style={{ fontSize:12, marginTop:8, color:'var(--accent2)' }}>{geminiSaved}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
