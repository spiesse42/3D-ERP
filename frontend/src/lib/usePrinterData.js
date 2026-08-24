// usePrinterData.js — gedeelde polling hook voor Jobs en Dashboard
import { useState, useEffect, useRef } from 'react';
import { api } from './api.js';

const _kwhAccum = {};       // lopende kWh delta in geheugen
const _lastPoll  = {};
const _failedStreak = {};   // aantal opeenvolgende polls met failed/cancelled-status
const _kwhLoaded = {};      // is delta al uit DB geladen voor deze printer?
const _kwhLastSave = {};    // timestamp laatste DB save
const _frozenElapsed = {};  // laatst gekende live verstreken-tijd (sec) per printer — bevriest na 'finish' (enkel relevant voor Bambu)

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

  function reloadPrinterConfig() {
    return api.get('/printers/config').then(setPrinterConfig).catch(() => {});
  }

  useEffect(() => {
    reloadPrinterConfig();
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
            gem_verbruik_watt: p.gem_verbruik_watt,
          };
          continue;
        }

        const keys = Object.keys(e).filter(k => e[k]);
        const values = await Promise.all(
          keys.map(k => api.get(`/ha/state/${e[k]}`).then(d => [k, d.state]).catch(() => [k, null]))
        );
        const s = Object.fromEntries(values);

        let elapsed = 0, remaining = 0, filamentG = 0;

        const statusLower = (s.status || '').toLowerCase();
        const isActief = ['running','printing','prepare'].includes(statusLower);
        // 'free' en 'stoped' (sic) zijn de Kobra/Anycubic S1 MQTT Bridge-termen
        // voor "geen actieve job" — bevestigd via de broncode van de addon.
        // 'finished' (met -ed) toegevoegd naast 'finish': de AnyCubic Kobra S1 Pro
        // rapporteert in de praktijk "finished", niet "finish" — zonder deze
        // toevoeging bleef een voltooide print onopgemerkt (job bleef op "bezig").
        const isIdle   = ['idle','standby','finish','finished','complete','offline','unavailable','failed','cancelled','free','stoped'].includes(statusLower);

        if (p.type === 'bambu') {
          // Enkel live doortellen zolang de printer effectief actief is. De
          // 'start'-entiteit van Bambu blijft na afloop van de print gewoon het
          // oude tijdstip tonen, dus "nu - start" zou anders eindeloos blijven
          // oplopen na 'finish'. Bij inactief bevriezen we op de laatst gekende
          // live waarde (= de effectieve printduur op het moment van klaar zijn).
          if (isActief && s.start && s.start !== 'unavailable' && s.start !== 'unknown') {
            const ms = new Date(s.start).getTime();
            if (!isNaN(ms)) {
              elapsed = Math.max(0, (Date.now() - ms) / 1000);
              _frozenElapsed[p.id] = elapsed;
            }
          } else {
            elapsed = _frozenElapsed[p.id] || 0;
          }
          remaining = (parseFloat(s.remaining) || 0) * 3600;
          filamentG = parseFloat(s.filament) || 0;

        } else if (p.type === 'ender') {
          elapsed = (parseFloat(s.duration) || 0) * 60;
          if (s.remaining && s.remaining !== 'unknown' && s.remaining.includes('T')) {
            const diff = (new Date(s.remaining).getTime() - Date.now()) / 1000;
            if (diff > 0) remaining = diff;
          }
          filamentG = (parseFloat(s.filament) || 0) * 2.98; // PLA 1.75mm: 2.98 g/m

        } else if (p.type === 'kobra') {
          elapsed   = (parseFloat(s.duration)  || 0) * 60; // minuten -> seconden
          remaining = (parseFloat(s.remaining) || 0) * 60; // minuten -> seconden
          filamentG = (parseFloat(s.filament)  || 0) / 1000 * 2.98; // mm -> m -> gram (PLA 1.75mm)
        }

        const wattVal = parseFloat(s.watt);
        const watt    = !isNaN(wattVal) ? wattVal : null;
        const kwhVal  = parseFloat(s.kwh);
        const kwh     = !isNaN(kwhVal) ? kwhVal : null;

        // kWh delta per JOB (niet per printer-status).
        // De actieve bezig-job draagt zijn eigen verbruikte delta in job.kwh_start.
        // Nieuwe print = nieuwe job = eigen teller. Geen wis-logica nodig.
        const now = Date.now();

        if (isActief && watt != null && watt > 0) {
          // Laad delta uit DB bij eerste poll voor deze printer (refresh/tabwissel)
          if (_kwhAccum[p.id] == null && !_kwhLoaded[p.id]) {
            _kwhLoaded[p.id] = true;
            _kwhAccum[p.id] = 0;
            api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
              const actief = jobs.find(j => j.printer_id === p.id);
              if (actief && actief.kwh_start != null) {
                _kwhAccum[p.id] = actief.kwh_start + (_kwhAccum[p.id] || 0);
              }
            }).catch(() => {});
          }
          if (_kwhAccum[p.id] == null) _kwhAccum[p.id] = 0;

          // Accumuleer Watt × tijd
          const last = _lastPoll[p.id];
          if (last != null) {
            const dtH = (now - last) / 3600000;
            _kwhAccum[p.id] += watt * dtH / 1000;
          }

          // Sla delta periodiek op in de bezig-job (elke 30s)
          if (_kwhLastSave[p.id] == null || (now - _kwhLastSave[p.id]) > 30000) {
            _kwhLastSave[p.id] = now;
            const deltaNu = _kwhAccum[p.id];
            api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
              const actief = jobs.find(j => j.printer_id === p.id);
              if (actief) api.patch(`/jobs/${actief.id}/kwh_start`, { kwh_start: deltaNu }).catch(() => {});
            }).catch(() => {});
          }
        }

        // Bij idle/finish: bewaar definitieve delta in de job, reset enkel geheugen.
        // De DB-delta blijft staan = definitief verbruik voor de kostprijs.
        if (isIdle) {
          if (_kwhAccum[p.id] != null && _kwhAccum[p.id] > 0) {
            const deltaFinaal = _kwhAccum[p.id];
            api.get(`/jobs?printer_id=${p.id}`).then(jobs => {
              const job = jobs.find(j => j.printer_id === p.id && (j.status === 'bezig' || j.status === 'voltooid'));
              if (job) api.patch(`/jobs/${job.id}/kwh_start`, { kwh_start: deltaFinaal }).catch(() => {});
            }).catch(() => {});
          }
          _kwhAccum[p.id] = null;
          _kwhLoaded[p.id] = false;
          _kwhLastSave[p.id] = null;
        }

                        _lastPoll[p.id] = now;

        // Auto-status: robuust, niet afhankelijk van vorige poll-status
        // 'done' = Kobra/Anycubic S1 MQTT Bridge (bevestigd via broncode);
        // 'finished' toegevoegd — de effectief waargenomen status op de
        // AnyCubic Kobra S1 Pro, zie toelichting bij isIdle hierboven.
        const isDone   = ['finish','finished','complete','success','done'].includes(statusLower);
        const isFailed = statusLower === 'failed' || statusLower === 'cancelled';

        // Finish: zet bezig job op voltooid. Werkt op elke poll opnieuw (niet enkel
        // bij een gedetecteerde overgang) omdat we checken op een bestaande bezig-job.
        // Ook zelfherstellend: als een job eerder onterecht op "geannuleerd" werd
        // gezet door een kortstondige sensor-glitch (bv. AMS-kleurwissel bij
        // multicolor), corrigeert dit hem alsnog naar "voltooid" zodra de printer
        // effectief "finish" toont.
        if (isDone) {
          api.get(`/jobs?printer_id=${p.id}`).then(jobs => {
            const kandidaat = jobs.find(j => j.printer_id === p.id && ['bezig', 'geannuleerd'].includes(j.status));
            if (kandidaat) api.patch(`/jobs/${kandidaat.id}/status`, { status: 'voltooid' }).catch(() => {});
          }).catch(() => {});
        }

        // Failed: pas na 2 opeenvolgende polls (~10s) bevestigd — een eenmalige
        // sensor-glitch (bv. tijdens een AMS-kleurwissel bij multicolor prints)
        // mag een lopende job niet meteen als mislukt annuleren.
        if (isFailed) {
          _failedStreak[p.id] = (_failedStreak[p.id] || 0) + 1;
        } else {
          _failedStreak[p.id] = 0;
        }
        if (isFailed && _failedStreak[p.id] === 2) {
          api.get(`/jobs?status=bezig&printer_id=${p.id}`).then(jobs => {
            const actief = jobs.find(j => j.printer_id === p.id);
            if (actief) api.patch(`/jobs/${actief.id}/status`, { status: 'geannuleerd' }).catch(() => {});
          }).catch(() => {});
        }

        // Automatische jobaanmaak bij start van een print — optioneel per printer,
        // pauzeerbaar via de toggle in de printerkaart (bv. tijdens filament-
        // kalibratie). Zelfherstellend, net als de finish/failed-detectie hierboven:
        // elke poll opnieuw checken i.p.v. enkel bij een gedetecteerde overgang naar
        // actief printen. Dat laatste (wasBusy-transitie) miste een print zodra Auto-job
        // pas ná de start werd aangezet, of de printer al actief was bij het openen
        // van een nieuwe browsersessie — dan kwam er nooit meer een job bij, want de
        // "overgang" was al voorbij. De heeftAlJob-check hieronder blijft de enige en
        // afdoende bescherming tegen dubbele aanmaak (blokkeert ook bij een bestaande
        // geplande/wachtrij-job, zoals voorheen).
        if (p.auto_job_aanmaken && isActief) {
          api.get(`/jobs?printer_id=${p.id}`).then(jobs => {
            const heeftAlJob = jobs.some(j => ['bezig', 'gepland', 'in te plannen'].includes(j.status));
            if (!heeftAlJob) {
              const totalSec = elapsed + remaining;
              const urenGeschat = totalSec > 0 ? Math.round(totalSec / 360) / 10 : null;
              api.post('/jobs', {
                printer_id: p.id,
                naam: s.filename || `Auto — ${new Date().toLocaleString('nl-BE')}`,
                status: 'bezig',
                gestart_op: new Date().toISOString(),
                stl_bestandsnaam: s.filename || null,
                print_uren_geschat: urenGeschat,
                notities: '🤖 Automatisch aangemaakt bij start van de print — vul klant/materialen aan.',
              }).catch(() => {});
            }
          }).catch(() => {});
        }

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
          gem_verbruik_watt: p.gem_verbruik_watt,
          status:      s.status  || 'unavailable',
          progress:    parseFloat(s.progress) || 0,
          filename:    s.filename,
          elapsed:     formatSec(elapsed),
          elapsed_sec: elapsed,
          remaining:   formatSec(remaining),
          remaining_sec: remaining,
          filament:    `${filamentG.toFixed(1)} g`,
          filament_g:  filamentG,
          layer:       p.type === 'kobra' ? (s.layer_raw || '0 / 0') : `${s.layer_cur || '0'} / ${s.layer_tot || '0'}`,
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

  return { printerConfig, printerData, reloadPrinterConfig };
}
