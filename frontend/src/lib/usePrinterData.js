// usePrinterData.js — gedeelde polling hook voor Jobs en Dashboard
import { useState, useEffect, useRef } from 'react';
import { api } from './api.js';

const _kwhAccum = {};       // lopende kWh delta in geheugen
const _lastPoll  = {};
const _prevStatus = {};
const _kwhLoaded = {};      // is delta al uit DB geladen voor deze printer?
const _kwhLastSave = {};    // timestamp laatste DB save

function formatSec(sec) {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

export function usePrinterData() {
  const [printerConfig, setPrinterConfig] = useState([]);
  const [printerData,   setPrinterData]   = useState({});
  const intervalRef = useRef(null);
  const kwhStartRef  = useRef({});
  

  useEffect(() => {
    api.get('/printers/config').then(setPrinterConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!printerConfig.length) return;

    async function poll() {
      const result = {};

      for (const p of printerConfig) {
        const e = p.entities;
        if (!e || !Object.keys(e).length) {
          // Geen entiteiten geconfigureerd — toon printer met lege data
          result[p.id] = {
            naam: p.naam, type: p.type, heeft_bmcu: p.heeft_bmcu,
            kwh_prijs: p.kwh_prijs, status: 'unavailable',
          };
          continue;
        }

        const keys = Object.keys(e).filter(k => e[k]);
        const values = await Promise.all(
          keys.map(k => api.get(`/ha/state/${e[k]}`).then(d => [k, d.state]).catch(() => [k, null]))
        );
        const s = Object.fromEntries(values);

        let elapsed = 0, remaining = 0, filamentG = 0;

        if (p.type === 'bambu') {
          if (s.start && s.start !== 'unavailable' && s.start !== 'unknown') {
            const ms = new Date(s.start).getTime();
            if (!isNaN(ms)) elapsed = Math.max(0, (Date.now() - ms) / 1000);
          }
          remaining = (parseFloat(s.remaining) || 0) * 3600;
          filamentG = parseFloat(s.filament) || 0;

        } else if (p.type === 'ender') {
          elapsed = (parseFloat(s.duration) || 0) * 60;
          if (s.remaining && s.remaining !== 'unknown' && s.remaining.includes('T')) {
            const diff = (new Date(s.remaining).getTime() - Date.now()) / 1000;
            if (diff > 0) remaining = diff;
          }
          filamentG = (parseFloat(s.filament) || 0) * 2.98;
        }

        const wattVal = parseFloat(s.watt);
        const watt    = !isNaN(wattVal) ? wattVal : null;
        const kwhVal  = parseFloat(s.kwh);
        const kwh     = !isNaN(kwhVal) ? kwhVal : null;

        const statusLower = (s.status || '').toLowerCase();
        const isActief = ['running','printing','prepare'].includes(statusLower);
        const isIdle   = ['idle','standby','finish','complete','offline','unavailable','failed'].includes(statusLower);

        // kWh delta via Watt-accumulatie, persistent in DB (kwh_start = opgeslagen delta)
        const now = Date.now();

        // Stap 1: laad opgeslagen delta uit DB bij eerste poll (na refresh/tabwissel)
        if (isActief && _kwhAccum[p.id] == null && !_kwhLoaded[p.id]) {
          _kwhLoaded[p.id] = true;
          _kwhAccum[p.id] = 0; // tijdelijk tot DB-waarde binnen is
          api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
            const actief = jobs.find(j => j.printer_id === p.id);
            if (actief && actief.kwh_start != null) {
              // Herstel opgeslagen delta — tel huidige geheugenwaarde erbij
              _kwhAccum[p.id] = actief.kwh_start + (_kwhAccum[p.id] || 0);
            }
          }).catch(() => {});
        }

        // Stap 2: accumuleer Watt × tijd
        if (isActief && watt != null && watt > 0) {
          if (_kwhAccum[p.id] == null) _kwhAccum[p.id] = 0;
          const last = _lastPoll[p.id];
          if (last != null) {
            const dtH = (now - last) / 3600000;
            _kwhAccum[p.id] += watt * dtH / 1000;
          }

          // Stap 3: sla delta periodiek op in DB (elke 30s)
          if (_kwhLastSave[p.id] == null || (now - _kwhLastSave[p.id]) > 30000) {
            _kwhLastSave[p.id] = now;
            const deltaNu = _kwhAccum[p.id];
            api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
              const actief = jobs.find(j => j.printer_id === p.id);
              if (actief) api.patch(`/jobs/${actief.id}/kwh_start`, { kwh_start: deltaNu }).catch(() => {});
            }).catch(() => {});
          }
        }

        // Stap 4: bij finish/cancel — wis delta in DB en geheugen
        if (isIdle) {
          if (_kwhAccum[p.id] != null) {
            api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
              const actief = jobs.find(j => j.printer_id === p.id);
              if (actief) api.patch(`/jobs/${actief.id}/kwh_start_clear`, {}).catch(() => {});
            }).catch(() => {});
          }
          _kwhAccum[p.id] = null;
          _kwhLoaded[p.id] = false;
          _kwhLastSave[p.id] = null;
        }

                _lastPoll[p.id] = now;

        // Auto-voltooid: als printer finish is, zet bezig job op voltooid
        const isDone  = ['finish','complete','success'].includes(statusLower);
        const wasBusy = _prevStatus[p.id];
        if (isDone && (wasBusy === 'running' || wasBusy === 'printing')) {
          api.get('/jobs?status=bezig').then(jobs => {
            const actief = jobs.find(j => j.printer_id === p.id);
            if (actief) api.patch(`/jobs/${actief.id}/status`, { status: 'voltooid' }).catch(() => {});
          }).catch(() => {});
        }
        _prevStatus[p.id] = statusLower;

        // kwhDelta = huidig kWh - start kWh
        // _kwhAccum bevat nu de delta zelf (Watt-accumulatie)
        const kwhDelta = _kwhAccum[p.id] ?? null;
        // Start kWh = huidige meterstand minus verbruikte delta (informatief)
        const kwhStart = (kwh != null && kwhDelta != null) ? kwh - kwhDelta : null;

        // Temperaturen — expliciet null check (0°C is geldig)
        const bedTemp    = s.bed_temp    != null && s.bed_temp    !== 'unavailable' && s.bed_temp    !== 'unknown' ? s.bed_temp    : null;
        const nozzleTemp = s.nozzle_temp != null && s.nozzle_temp !== 'unavailable' && s.nozzle_temp !== 'unknown' ? s.nozzle_temp : null;

        result[p.id] = {
          naam:        p.naam,
          type:        p.type,
	  watt:        watt,
          heeft_bmcu:  p.heeft_bmcu,
          kwh_prijs:   p.kwh_prijs,
          status:      s.status  || 'unavailable',
          progress:    parseFloat(s.progress) || 0,
          filename:    s.filename,
          elapsed:     formatSec(elapsed),
          elapsed_sec: elapsed,
          remaining:   formatSec(remaining),
          remaining_sec: remaining,
          filament:    `${filamentG.toFixed(1)} g`,
          filament_g:  filamentG,
          layer:       `${s.layer_cur || '0'} / ${s.layer_tot || '0'}`,
          bed_temp:    bedTemp,
          nozzle_temp: nozzleTemp,
          kwh_start:   kwhStart,
          kwh_current: kwh,
          kwh_delta:   kwhDelta,
        };
      }

      setPrinterData(result);
    }

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [printerConfig]);

  return { printerConfig, printerData };
}
