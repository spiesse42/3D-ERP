import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const CATEGORIEEN = [
  { waarde: 'materiaal',    label: 'Materiaal (buiten bestellingen)' },
  { waarde: 'energie',      label: 'Energie' },
  { waarde: 'software',     label: 'Software' },
  { waarde: 'verzekering',  label: 'Verzekering' },
  { waarde: 'marketing',    label: 'Marketing' },
  { waarde: 'afschrijving', label: 'Afschrijving' },
  { waarde: 'onderhoud',    label: 'Onderhoud' },
  { waarde: 'overig',       label: 'Overig' },
];

function categorieLabel(waarde) {
  return CATEGORIEEN.find(c => c.waarde === waarde)?.label || waarde;
}

function Sectie({ titel, children, actie }) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{titel}</h2>
        {actie}
      </div>
      {children}
    </div>
  );
}

function TabKnop({ label, actief, onClick }) {
  return (
    <button className={`btn${actief ? ' primary' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function BalkGrafiek({ data, labelKey, waardeKey, kleur = 'var(--accent)', eenheid = '' }) {
  if (!data?.length) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Geen data beschikbaar.</p>;
  const max = Math.max(...data.map(r => Math.abs(r[waardeKey] || 0))) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div style={{ width: 70, textAlign: 'right', color: 'var(--muted)', flexShrink: 0 }}>{r[labelKey]}</div>
          <div style={{ flex: 1, height: 16, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(Math.abs(r[waardeKey]) / max) * 100}%`, height: '100%', background: kleur, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <div style={{ width: 80, color: 'var(--text)', fontWeight: 500 }}>{r[waardeKey]}{eenheid}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Drempel-voortgangsbalk (btw-vrijstelling / sociale bijdragen bijberoep) ──
function DrempelBalk({ label, ytd, drempel }) {
  const pct = drempel > 0 ? Math.min(100, Math.round((ytd / drempel) * 100)) : 0;
  const kleur = pct >= 100 ? '#ef4444' : pct >= 80 ? 'var(--warn)' : 'var(--accent2)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--muted)' }}>€{ytd.toFixed(2)} / €{drempel.toFixed(2)} ({pct}%)</span>
      </div>
      <div style={{ height: 10, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur, borderRadius: 5, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function DrempelsWidget() {
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get('/rapportage/drempels').then(setD).catch(() => {});
  }, []);

  if (!d) return null;

  return (
    <Sectie titel={`📊 Drempels bijberoep ${d.jaar}`}>
      {!d.startdatum && (
        <p style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>
          Geen startdatum ingesteld — de volledige jaardrempel wordt getoond in plaats van verhoudingsgewijs verminderd.
          Stel dit in bij Instellingen → Drempels.
        </p>
      )}
      <DrempelBalk label="Omzet (btw-vrijstelling kleine onderneming)" ytd={d.omzet.ytd} drempel={d.omzet.drempel_prorated} />
      <DrempelBalk label="Winst (vrijstelling sociale bijdragen bijberoep)" ytd={d.winst.ytd} drempel={d.winst.drempel_prorated} />
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        Richtwaarde, geen officiële berekening — verifieer bij twijfel met je sociaal secretariaat of boekhouder.
        {d.startdatum && ` Verhoudingsgewijs berekend op basis van ${d.dagen_actief}/${d.dagen_in_jaar} dagen actief in ${d.jaar}.`}
      </p>
    </Sectie>
  );
}

// ─── Tab: Overzicht ────────────────────────────────────────────────
function OverzichtTab() {
  const [rijen, setRijen] = useState([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    api.get('/rapportage/stats/financien').then(d => { setRijen(d); setLaden(false); }).catch(() => setLaden(false));
  }, []);

  const jaartotalen = rijen.reduce((acc, r) => ({
    inkomsten: acc.inkomsten + (r.inkomsten || 0),
    materiaalkosten: acc.materiaalkosten + (r.materiaalkosten || 0),
    uitgaven: acc.uitgaven + (r.uitgaven || 0),
    saldo: acc.saldo + (r.saldo || 0),
  }), { inkomsten: 0, materiaalkosten: 0, uitgaven: 0, saldo: 0 });

  return (
    <>
      <DrempelsWidget />

      <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Inkomsten (laatste 24 mnd)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent2)' }}>€{jaartotalen.inkomsten.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Materiaalkosten</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--warn)' }}>€{jaartotalen.materiaalkosten.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Overige uitgaven</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--warn)' }}>€{jaartotalen.uitgaven.toFixed(2)}</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Saldo</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: jaartotalen.saldo >= 0 ? 'var(--accent2)' : '#ef4444' }}>
            €{jaartotalen.saldo.toFixed(2)}
          </div>
        </div>
      </div>

      <Sectie titel="📈 Inkomsten vs. uitgaven per maand">
        {laden
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Laden...</p>
          : rijen.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen betaalde jobs, bestellingen of uitgaven geregistreerd.</p>
            : <table>
                <thead>
                  <tr><th>Maand</th><th>Inkomsten</th><th>Materiaal</th><th>Uitgaven</th><th>Saldo</th></tr>
                </thead>
                <tbody>
                  {rijen.map(r => (
                    <tr key={r.maand}>
                      <td>{r.maand}</td>
                      <td style={{ color: 'var(--accent2)' }}>€{r.inkomsten.toFixed(2)}</td>
                      <td>€{r.materiaalkosten.toFixed(2)}</td>
                      <td>€{r.uitgaven.toFixed(2)}</td>
                      <td style={{ color: r.saldo >= 0 ? 'var(--accent2)' : '#ef4444', fontWeight: 600 }}>
                        €{r.saldo.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        }
      </Sectie>

      <Sectie titel="💶 Inkomsten per maand">
        <BalkGrafiek data={[...rijen].reverse()} labelKey="maand" waardeKey="inkomsten" kleur="var(--accent2)" eenheid=" €" />
      </Sectie>

      <p style={{ fontSize: 11, color: 'var(--muted)' }}>
        Inkomsten worden geteld op betaaldatum (kasstelsel), materiaalkosten op besteldatum. Bedoeld als financieel overzicht,
        niet als officiële boekhouding — raadpleeg voor je aangiftes altijd je boekhouder/Accountable.
      </p>
    </>
  );
}

// ─── Tab: Facturatie ───────────────────────────────────────────────
function FacturatieTab() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState({ rows: [], totaal: 0, aantal: 0 });
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    setLaden(true);
    api.get(`/rapportage/facturatie?status=${status}`).then(d => { setData(d); setLaden(false); }).catch(() => setLaden(false));
  }, [status]);

  const markeerBetaald = async (job) => {
    try {
      await api.patch(`/jobs/${job.id}/status`, { status: 'betaald' });
      api.get(`/rapportage/facturatie?status=${status}`).then(setData).catch(() => {});
    } catch (e) { alert(e.message); }
  };

  return (
    <Sectie
      titel="🧾 Facturatie"
      actie={
        <div style={{ display: 'flex', gap: 6 }}>
          <TabKnop label="Openstaand" actief={status === 'open'} onClick={() => setStatus('open')} />
          <TabKnop label="Betaald" actief={status === 'betaald'} onClick={() => setStatus('betaald')} />
          <TabKnop label="Alles" actief={status === 'alles'} onClick={() => setStatus('alles')} />
        </div>
      }
    >
      <div style={{ marginBottom: '1rem', fontSize: 13, color: 'var(--muted)' }}>
        {data.aantal} {data.aantal === 1 ? 'factuur' : 'facturen'} — totaal{' '}
        <span style={{ color: status === 'open' ? '#ef4444' : 'var(--accent2)', fontWeight: 700, fontSize: 15 }}>
          €{data.totaal.toFixed(2)}
        </span>
      </div>
      {laden
        ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Laden...</p>
        : data.rows.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Niets te tonen.</p>
          : <table>
              <thead>
                <tr><th>Job</th><th>Klant</th><th>Status</th><th>Voltooid op</th><th>Bedrag</th><th></th></tr>
              </thead>
              <tbody>
                {data.rows.map(j => (
                  <tr key={j.id}>
                    <td style={{ fontWeight: 500 }}>{j.naam}</td>
                    <td>{j.klant_voornaam ? `${j.klant_voornaam} ${j.klant_naam}` : j.klant_naam || '—'}</td>
                    <td>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 3,
                        background: j.status === 'betaald' ? 'rgba(34,197,94,0.2)' : j.status === 'gefactureerd' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                        color: j.status === 'betaald' ? 'var(--accent2)' : j.status === 'gefactureerd' ? 'var(--warn)' : '#8b5cf6',
                      }}>{j.status}</span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{j.voltooid_op ? j.voltooid_op.split('T')[0] : '—'}</td>
                    <td style={{ color: 'var(--accent2)', fontWeight: 600 }}>
                      {j.verkoopprijs != null ? `€${j.verkoopprijs.toFixed(2)}` : '—'}
                    </td>
                    <td>
                      {j.status !== 'betaald' && (
                        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => markeerBetaald(j)}>
                          ✓ Betaald
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
      }
    </Sectie>
  );
}

// ─── Tab: Uitgaven ─────────────────────────────────────────────────
function UitgaveModal({ uitgave, onClose, onSaved }) {
  const [form, setForm] = useState({
    datum: uitgave?.datum || new Date().toISOString().slice(0, 10),
    categorie: uitgave?.categorie || 'overig',
    omschrijving: uitgave?.omschrijving || '',
    bedrag: uitgave?.bedrag ?? '',
    terugkerend: !!uitgave?.terugkerend,
  });
  const [fout, setFout] = useState('');

  const bewaar = async () => {
    if (!form.bedrag || parseFloat(form.bedrag) <= 0) { setFout('Bedrag moet groter zijn dan 0'); return; }
    try {
      if (uitgave?.id) await api.put(`/uitgaven/${uitgave.id}`, form);
      else await api.post('/uitgaven', form);
      onSaved();
    } catch (e) {
      setFout(e.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2>{uitgave?.id ? 'Uitgave bewerken' : 'Nieuwe uitgave'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {fout && <p style={{ color: '#ef4444', fontSize: 12 }}>{fout}</p>}
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: 11 }}>Datum</label>
          <input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: 11 }}>Categorie</label>
          <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
            {CATEGORIEEN.map(c => <option key={c.waarde} value={c.waarde}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: 11 }}>Omschrijving</label>
          <input type="text" value={form.omschrijving} onChange={e => setForm({ ...form, omschrijving: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: 11 }}>Bedrag (€)</label>
          <input type="number" step="0.01" min="0.01" value={form.bedrag} onChange={e => setForm({ ...form, bedrag: e.target.value })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', fontSize: 13 }}>
          <input type="checkbox" checked={form.terugkerend} onChange={e => setForm({ ...form, terugkerend: e.target.checked })} style={{ width: 16, height: 16 }} />
          <span>Terugkerende (vaste) maandkost</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Annuleren</button>
          <button className="btn primary" onClick={bewaar}>Bewaren</button>
        </div>
      </div>
    </div>
  );
}

function UitgavenTab() {
  const [uitgaven, setUitgaven] = useState([]);
  const [modal, setModal] = useState(null);

  const laad = () => api.get('/uitgaven').then(setUitgaven).catch(() => {});
  useEffect(() => { laad(); }, []);

  const verwijder = async (id) => {
    await api.delete(`/uitgaven/${id}`);
    laad();
  };

  const totaalDitJaar = uitgaven
    .filter(u => u.datum?.startsWith(new Date().getFullYear().toString()))
    .reduce((s, u) => s + u.bedrag, 0);

  return (
    <Sectie
      titel="🧾 Uitgaven"
      actie={<button className="btn primary" onClick={() => setModal({})}>+ Nieuwe uitgave</button>}
    >
      <div style={{ marginBottom: '1rem', fontSize: 13, color: 'var(--muted)' }}>
        Dit jaar: <span style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 15 }}>€{totaalDitJaar.toFixed(2)}</span>
      </div>
      {uitgaven.length === 0
        ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen uitgaven geregistreerd.</p>
        : <table>
            <thead>
              <tr><th>Datum</th><th>Categorie</th><th>Omschrijving</th><th>Bedrag</th><th></th></tr>
            </thead>
            <tbody>
              {uitgaven.map(u => (
                <tr key={u.id}>
                  <td>{u.datum}</td>
                  <td>{categorieLabel(u.categorie)}{u.terugkerend ? ' 🔁' : ''}</td>
                  <td>{u.omschrijving || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td style={{ fontWeight: 600 }}>€{u.bedrag.toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setModal(u)}>✏</button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => verwijder(u.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      }
      {modal && <UitgaveModal uitgave={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); laad(); }} />}
    </Sectie>
  );
}

// ─── Hoofdpagina ───────────────────────────────────────────────────
export default function Financien() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overzicht');

  return (
    <div>
      <div className="page-header">
        <h1>Financiën</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <TabKnop label="Overzicht" actief={tab === 'overzicht'} onClick={() => setTab('overzicht')} />
          <TabKnop label="Facturatie" actief={tab === 'facturatie'} onClick={() => setTab('facturatie')} />
          <TabKnop label="Uitgaven" actief={tab === 'uitgaven'} onClick={() => setTab('uitgaven')} />
        </div>
      </div>

      {tab === 'overzicht'  && <OverzichtTab />}
      {tab === 'facturatie' && <FacturatieTab />}
      {tab === 'uitgaven'   && <UitgavenTab />}
    </div>
  );
}
