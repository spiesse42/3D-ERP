import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import KlantModal from '../components/KlantModal.jsx';

// ─── KlantDetail ─────────────────────────────────────────────────────────────
function KlantDetail({ klant, onClose, onEdit, onDeleted }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get(`/klanten/${klant.id}`).then(setDetail).catch(() => {});
  }, [klant.id]);

  async function del() {
    if (!confirm('Klant verwijderen? Jobs blijven bewaard.')) return;
    try {
      await api.delete(`/klanten/${klant.id}`);
      onDeleted();
    } catch (e) { alert(e.message); }
  }

  const volledigAdres = (k) => {
    const d = [k.straat, k.huisnummer].filter(Boolean).join(' ');
    const pc = [k.postcode, k.gemeente].filter(Boolean).join(' ');
    return [d, pc].filter(Boolean).join(', ') || '—';
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:580 }}>
        <div className="modal-header">
          <h2>
            {klant.type === 'zakelijk' ? '🏢' : '👤'}{' '}
            {klant.voornaam ? `${klant.voornaam} ${klant.naam}` : klant.naam}
            {klant.bedrijfsnaam && <span style={{ fontSize:13, color:'var(--muted)', marginLeft:8 }}>{klant.bedrijfsnaam}</span>}
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {/* Klantinfo */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem 1.5rem', marginBottom:'1rem', fontSize:13 }}>
          {klant.email    && <div><span style={{ color:'var(--muted)' }}>E-mail: </span>{klant.email}</div>}
          {klant.telefoon && <div><span style={{ color:'var(--muted)' }}>Tel: </span>{klant.telefoon}</div>}
          {klant.gsm      && <div><span style={{ color:'var(--muted)' }}>GSM: </span>{klant.gsm}</div>}
          {klant.btw_nummer && <div><span style={{ color:'var(--muted)' }}>BTW: </span>{klant.btw_nummer}</div>}
          <div style={{ gridColumn:'1/-1' }}><span style={{ color:'var(--muted)' }}>Adres: </span>{volledigAdres(klant)}</div>
          {klant.notities && <div style={{ gridColumn:'1/-1' }}><span style={{ color:'var(--muted)' }}>Notities: </span>{klant.notities}</div>}
        </div>

        {/* Jobs */}
        <h3 style={{ fontSize:13, fontWeight:600, marginBottom:'0.5rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
          Jobs ({detail?.jobs?.length ?? '…'})
        </h3>
        {!detail
          ? <p style={{ color:'var(--muted)', fontSize:12 }}>Laden...</p>
          : detail.jobs.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:12 }}>Geen jobs voor deze klant.</p>
          : <div style={{ maxHeight:240, overflowY:'auto' }}>
              <table style={{ width:'100%', fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)', fontWeight:500 }}>Naam</th>
                    <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)', fontWeight:500 }}>Status</th>
                    <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)', fontWeight:500 }}>Datum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.jobs.map(j => (
                    <tr key={j.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'6px 8px', fontWeight:500 }}>{j.naam}</td>
                      <td style={{ padding:'6px 8px' }}>
                        <span className={`badge ${(j.status || '').replace(/\s+/g,'-')}`}>{j.status}</span>
                      </td>
                      <td style={{ padding:'6px 8px', color:'var(--muted)' }}>
                        {j.aangemaakt_op ? new Date(j.aangemaakt_op).toLocaleDateString('nl-BE') : '—'}
                      </td>
                      <td style={{ padding:'6px 8px' }}>
                        <button className="btn" style={{ fontSize:11, padding:'3px 8px' }}
                          onClick={() => { onClose(); navigate(`/jobs?highlight=${j.id}`); }}>
                          → Bekijk
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }

        <div className="modal-footer" style={{ marginTop:'1rem' }}>
          <button className="btn danger" onClick={del}>Verwijderen</button>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={onClose}>Sluiten</button>
            <button className="btn primary" onClick={() => { onClose(); onEdit(klant); }}>✏ Bewerken</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export default function Klanten() {
  const [klanten, setKlanten] = useState([]);
  const [detailKlant, setDetailKlant] = useState(null);
  const [modal, setModal] = useState(null);
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => api.get('/klanten').then(setKlanten);
  useEffect(() => { load(); }, []);

  const filtered = klanten.filter(k => {
    const matchZoek = !zoek ||
      k.naam.toLowerCase().includes(zoek.toLowerCase()) ||
      (k.voornaam||'').toLowerCase().includes(zoek.toLowerCase()) ||
      (k.bedrijfsnaam||'').toLowerCase().includes(zoek.toLowerCase()) ||
      (k.email||'').toLowerCase().includes(zoek.toLowerCase());
    const matchType = !filter || k.type === filter;
    return matchZoek && matchType;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Klanten</h1>
        <div style={{ display:'flex', gap:8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
            <option value="">Alle types</option>
            <option value="particulier">👤 Particulier</option>
            <option value="zakelijk">🏢 Zakelijk</option>
          </select>
          <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoeken..." style={{ width:200 }} />
          <button className="btn primary" onClick={() => setModal({})}>+ Nieuwe klant</button>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty">Geen klanten gevonden</div>
        : <div className="card" style={{ padding:0, overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>T</th>
                  <th>Bedrijfsnaam</th>
                  <th>BTW</th>
                  <th>Naam</th>
                  <th>Voornaam</th>
                  <th>Postcode</th>
                  <th>Gemeente</th>
                  <th>E-mail</th>
                  <th>GSM</th>
                  <th>Jobs</th>
                  <th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(k => (
                  <tr key={k.id} style={{ cursor:'pointer' }} onClick={() => setDetailKlant(k)}>
                    <td>
                      <span title={k.type === 'zakelijk' ? 'Zakelijk' : 'Particulier'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: '50%',
                          background: k.type === 'zakelijk' ? '#3b82f6' : '#22c55e',
                          color: '#fff', fontSize: 11, fontWeight: 700,
                        }}>
                        {k.type === 'zakelijk' ? 'Z' : 'P'}
                      </span>
                    </td>
                    <td style={{ fontWeight: k.bedrijfsnaam ? 500 : undefined, color: k.bedrijfsnaam ? undefined : 'var(--muted)' }}>
                      {k.bedrijfsnaam || '—'}
                    </td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{k.btw_nummer || '—'}</td>
                    <td style={{ fontWeight:500 }}>{k.naam}</td>
                    <td>{k.voornaam || '—'}</td>
                    <td style={{ color:'var(--muted)' }}>{k.postcode || '—'}</td>
                    <td style={{ color:'var(--muted)' }}>{k.gemeente || '—'}</td>
                    <td style={{ fontSize:12 }}>{k.email || '—'}</td>
                    <td style={{ fontSize:12 }}>{k.gsm || '—'}</td>
                    <td>{k.aantal_jobs}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => setModal(k)}>✏</button>
                        <button className="btn danger" style={{ fontSize:11, padding:'4px 8px' }}
                          onClick={async () => {
                            if (!confirm('Klant verwijderen? Jobs blijven bewaard.')) return;
                            try {
                              await api.delete(`/klanten/${k.id}`);
                              load();
                            } catch (e) { alert(e.message); }
                          }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }

      {detailKlant && (
        <KlantDetail
          klant={detailKlant}
          onClose={() => setDetailKlant(null)}
          onEdit={(k) => setModal(k)}
          onDeleted={() => { setDetailKlant(null); load(); }}
        />
      )}

      {modal !== null && (
        <KlantModal
          klant={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}