import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const STATUSSEN = ['gepland','bezig','voltooid','gefaald','geannuleerd'];

function JobModal({ job, printers, klanten, onClose, onSaved }) {
  const [form, setForm] = useState(job || { printer_id: printers[0]?.id || '', naam: '', status: 'gepland', is_multicolor: false, aantal_kleuren: 1, print_uren_geschat: '', notities: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    try {
      if (job?.id) await api.put(`/jobs/${job.id}`, form);
      else await api.post('/jobs', form);
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{job?.id ? 'Job bewerken' : 'Nieuwe job'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label>Naam *</label>
          <input value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="Naam van de print" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Printer *</label>
            <select value={form.printer_id} onChange={e => set('printer_id', e.target.value)}>
              {printers.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Klant</label>
            <select value={form.klant_id || ''} onChange={e => set('klant_id', e.target.value || null)}>
              <option value="">— geen klant —</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.naam}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Print uren (geschat)</label>
            <input type="number" step="0.1" value={form.print_uren_geschat} onChange={e => set('print_uren_geschat', e.target.value)} placeholder="bv. 3.5" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Print uren (werkelijk)</label>
            <input type="number" step="0.1" value={form.print_uren_werkelijk || ''} onChange={e => set('print_uren_werkelijk', e.target.value)} placeholder="na voltooiing" />
          </div>
          <div className="form-group">
            <label>STL bestandsnaam</label>
            <input value={form.stl_bestandsnaam || ''} onChange={e => set('stl_bestandsnaam', e.target.value)} placeholder="bestand.stl" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Multicolor</label>
            <select value={form.is_multicolor ? '1' : '0'} onChange={e => set('is_multicolor', e.target.value === '1')}>
              <option value="0">Nee</option>
              <option value="1">Ja (BMCU)</option>
            </select>
          </div>
          {form.is_multicolor && (
            <div className="form-group">
              <label>Aantal kleuren</label>
              <input type="number" min="2" max="8" value={form.aantal_kleuren} onChange={e => set('aantal_kleuren', parseInt(e.target.value))} />
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Notities</label>
          <textarea rows={2} value={form.notities || ''} onChange={e => set('notities', e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Annuleer</button>
          <button className="btn primary" onClick={save}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

function KostenModal({ job, onClose }) {
  const [kwh, setKwh] = useState('');
  const [result, setResult] = useState(null);
  const [rollen, setRollen] = useState([]);
  const [selectedRol, setSelectedRol] = useState('');
  const [gram, setGram] = useState('');

  useEffect(() => {
    api.get('/filament/rollen').then(r => setRollen(r.filter(rol => rol.actief)));
    api.get(`/kosten/job/${job.id}`).then(setResult).catch(() => {});
  }, [job.id]);

  async function bereken() {
    try {
      const r = await api.post(`/kosten/bereken/${job.id}`, { kwh_verbruikt: parseFloat(kwh) || 0 });
      setResult(r);
    } catch (e) { alert(e.message); }
  }

  async function voegMateriaaltoe() {
    if (!selectedRol || !gram) return alert('Selecteer een rol en geef gram op');
    try {
      await api.post(`/jobs/${job.id}/materialen`, { filament_rol_id: parseInt(selectedRol), gram_gebruikt: parseFloat(gram) });
      setSelectedRol(''); setGram('');
      alert('Materiaal toegevoegd');
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 540 }}>
        <div className="modal-header">
          <h2>Kostprijs — {job.naam}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: '1rem' }}>
          Printer: {job.printer_naam} {job.is_multicolor ? '· BMCU multicolor' : ''}
        </p>

        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Filament toevoegen</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8, alignItems: 'end' }}>
            <select value={selectedRol} onChange={e => setSelectedRol(e.target.value)}>
              <option value="">— selecteer rol —</option>
              {rollen.map(r => <option key={r.id} value={r.id}>{r.merk} {r.materiaal} {r.kleur} ({r.gewicht_gram_huidig}g)</option>)}
            </select>
            <input type="number" placeholder="gram" value={gram} onChange={e => setGram(e.target.value)} />
            <button className="btn primary" onClick={voegMateriaaltoe}>+ Voeg toe</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>kWh verbruikt (handmatig of van HA)</label>
            <input type="number" step="0.01" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="bv. 0.45" />
          </div>
          <button className="btn primary" onClick={bereken}>Bereken</button>
        </div>

        {result && (
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <table style={{ fontSize: 13 }}>
              <tbody>
                {[
                  ['Materiaal', result.materiaal_kost],
                  ['Energie', result.energie_kost],
                  ['Machine', result.machine_kost],
                  ['Arbeid', result.arbeid_kost],
                  ['BMCU slijtage', result.bmcu_slijtage],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)', paddingLeft: 0 }}>{label}</td>
                    <td style={{ textAlign: 'right', borderBottom: '1px solid var(--border)' }}>€{val?.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ paddingLeft: 0, color: 'var(--muted)', fontSize: 11 }}>+ {result.faalfactor_pct}% faal + {result.winstmarge_pct}% marge</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 11 }}>€{result.totaal_kost?.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontWeight: 600 }}>
              <span>Verkoopprijs</span>
              <span style={{ color: 'var(--accent2)', fontSize: 18 }}>€{result.verkoopprijs?.toFixed(2)}</span>
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

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [klanten, setKlanten] = useState([]);
  const [modal, setModal] = useState(null);
  const [kostenJob, setKostenJob] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => api.get('/jobs').then(setJobs);
  useEffect(() => {
    load();
    api.get('/printers').then(setPrinters);
    api.get('/klanten').then(setKlanten);
  }, []);

  const filtered = filter ? jobs.filter(j => j.status === filter) : jobs;

  async function deleteJob(id) {
    if (!confirm('Job verwijderen?')) return;
    await api.delete(`/jobs/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Jobs</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Alle statussen</option>
            {STATUSSEN.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe job</button>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty">Geen jobs gevonden</div>
        : <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Naam</th><th>Klant</th><th>Printer</th>
                  <th>Status</th><th>Uren</th><th>Prijs</th><th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(j => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{j.naam}</div>
                      {j.is_multicolor ? <div style={{ fontSize: 11, color: 'var(--accent)' }}>BMCU · {j.aantal_kleuren} kleuren</div> : null}
                    </td>
                    <td>{j.klant_naam || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>{j.printer_naam}</td>
                    <td><span className={`badge ${j.status}`}>{j.status}</span></td>
                    <td style={{ color: 'var(--muted)' }}>
                      {j.print_uren_werkelijk != null ? `${j.print_uren_werkelijk}u` : j.print_uren_geschat != null ? `~${j.print_uren_geschat}u` : '—'}
                    </td>
                    <td>{j.verkoopprijs != null ? <span style={{ color: 'var(--accent2)' }}>€{j.verkoopprijs.toFixed(2)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setKostenJob(j)}>€ Kost</button>
                        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setModal(j)}>✏</button>
                        <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteJob(j.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }

      {modal !== null && (
        <JobModal
          job={modal?.id ? modal : null}
          printers={printers}
          klanten={klanten}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
      {kostenJob && <KostenModal job={kostenJob} onClose={() => setKostenJob(null)} />}
    </div>
  );
}
