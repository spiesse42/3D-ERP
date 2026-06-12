// usePrinterData.js — gedeelde polling hook voor Jobs en Dashboard
import { useState, useEffect, useRef } from 'react';
import { api } from './api.js';

function formatSec(sec) {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

export function usePrinterData() {
  const [printerConfig, setPrinterConfig] = useState([]);
  const [printerData,   setPrinterData]   = useState({});
  const intervalRef = useRef(null);
  const kwhStartRef = useRef({});  // Stabiele ref voor kWh start, reset-proof

  useEffect(() => {
    api.get('/printers/config').then(setPrinterConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!printerConfig.length) return;

    async function poll() {
      const result = {};

      for (const p of printerConfig) {
        const e = p.entities;
        if (!e || !Object.keys(e).length) continue;

        // Haal alle entiteiten op in parallel
        const keys = Object.keys(e).filter(k => e[k]);
        const values = await Promise.all(
          keys.map(k => api.get(`/ha/state/${e[k]}`).then(d => [k, d.state]).catch(() => [k, null]))
        );
        const s = Object.fromEntries(values);

        let elapsed = 0, remaining = 0, filamentG = 0;

        if (p.type === 'bambu') {
          // Verstreken tijd via starttijd
          if (s.start && s.start !== 'unavailable') {
            const ms = new Date(s.start).getTime();
            if (!isNaN(ms)) elapsed = Math.max(0, (Date.now() - ms) / 1000);
          }
          // Resterende tijd in uren → seconden
          remaining = (parseFloat(s.remaining) || 0) * 3600;
          // Filament in gram (rechtstreeks)
          filamentG = parseFloat(s.filament) || 0;

        } else if (p.type === 'ender') {
          // Verstreken tijd in minuten → seconden
          elapsed = (parseFloat(s.duration) || 0) * 60;
          // Resterende tijd via ETA timestamp
          if (s.remaining && s.remaining !== 'unknown' && s.remaining.includes('T')) {
            const diff = (new Date(s.remaining).getTime() - Date.now()) / 1000;
            if (diff > 0) remaining = diff;
          }
          // Filament in meter → gram (factor 2.98 voor PLA)
          filamentG = (parseFloat(s.filament) || 0) * 2.98;
        }

        const kwh    = parseFloat(s.kwh)  || 0;
        const isRunning = ['running', 'printing'].includes((s.status || '').toLowerCase());

        // kWh start bijhouden in ref (niet in state, om re-render loops te vermijden)
        if (isRunning && !kwhStartRef.current[p.id] && kwh > 0) {
          kwhStartRef.current[p.id] = kwh;
        }
        if (!isRunning) {
          kwhStartRef.current[p.id] = null;
        }
        const kwhStart = kwhStartRef.current[p.id] || null;
        const kwhDelta = kwh > 0 && kwhStart ? kwh - kwhStart : null;

        result[p.id] = {
          naam:        p.naam,
          type:        p.type,
          heeft_bmcu:  p.heeft_bmcu,
          kwh_prijs:   p.kwh_prijs,
          status:      s.status  || 'unavailable',
          progress:    parseFloat(s.progress) || 0,
          filename:    s.filename,
          elapsed:     formatSec(elapsed),
          elapsed_sec: elapsed,
          remaining:   formatSec(remaining),
          filament:    `${filamentG.toFixed(1)} g`,
          filament_g:  filamentG,
          layer:       `${s.layer_cur || '0'} / ${s.layer_tot || '0'}`,
          bed_temp:    s.bed_temp   || null,
          nozzle_temp: s.nozzle_temp || null,
          kwh_start:   kwhStart,
          kwh_current: kwh || null,
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
