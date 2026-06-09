import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Instellingen() {
  const [tarieven, setTarieven] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api.get('/tarieven').then(setTarieven);
    api.get('/printers').then(setPrinters);
  }, []);

  function setTarief(sleutel, waarde) {
    setTarieven(t => t.map(x => x.sleutel === sleutel ? { ...x, waarde: parseFloat(waarde) || 0 } : x));
  }

  async function saveTarieven() {
    for (const t of tarieven) {
      await api.put(`/tarieven/${t.sleutel}`, { waarde: t.waarde });
    }
    setSaved('Tarieven opgeslagen!');
    setTimeout(() => setSaved(''), 3000);
  }

  function setPrinter(id, k, v) {
    setPrinters(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  }

  async function savePrinter(printer) {
    await api.put(`/printers/${printer.id}`, printer);
    setSaved('Printer opgeslagen!');
    setTimeout(() => setSaved(''), 3000);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Instellingen</h1>
        {saved && <span style={{ color: 'var(--accent2)', fontSize: 13 }}>✓ {saved}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1.25rem' }}>Tarieven & marges</h2>
          {tarieven.map(t => (
            <div key={t.sleutel} className="form-group">
              <label>{t.label} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({t.eenheid})</span></label>
              <input
                type="number"
                step="0.01"
                value={t.waarde}
                onChange={e => setTarief(t.sleutel, e.target.value)}
              />
            </div>
          ))}
          <button className="btn primary" style={{ width: '100%', marginTop: 4 }} onClick={saveTarieven}>
            Tarieven opslaan
          </button>
        </div>

        <div>
          {printers.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1.25rem' }}>{p.naam}</h2>
              <div className="form-group">
                <label>HA entity prefix</label>
                <input
                  value={p.ha_entity_prefix || ''}
                  onChange={e => setPrinter(p.id, 'ha_entity_prefix', e.target.value)}
                  placeholder="sensor.a1mini_0300da611800680_"
                />
              </div>
              <div className="form-group">
                <label>kWh entity (smart plug)</label>
                <input
                  value={p.kwh_entity || ''}
                  onChange={e => setPrinter(p.id, 'kwh_entity', e.target.value)}
                  placeholder="sensor.ender3_kwh"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Machine kost/uur (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={p.machine_kost_per_uur}
                    onChange={e => setPrinter(p.id, 'machine_kost_per_uur', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>Heeft BMCU</label>
                  <select
                    value={p.heeft_bmcu ? '1' : '0'}
                    onChange={e => setPrinter(p.id, 'heeft_bmcu', e.target.value === '1' ? 1 : 0)}
                  >
                    <option value="0">Nee</option>
                    <option value="1">Ja</option>
                  </select>
                </div>
              </div>
              <button className="btn primary" style={{ width: '100%', marginTop: 4 }} onClick={() => savePrinter(p)}>
                Opslaan
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1rem' }}>Data export</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href="/api/rapportage/csv/jobs" download>
            ↓ Jobs exporteren (CSV)
          </a>
        </div>
      </div>
    </div>
  );
}
