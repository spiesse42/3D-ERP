# 3D Print ERP

ERP systeem voor 3D print hobbyisten — draait als Home Assistant addon op een NUC/HAOS.

## Features

- **Jobs** — print queue, status, multicolor/BMCU tracking
- **Klantenbeheer** — contacten, bestellingshistoriek
- **Filamentstock** — rollen bijhouden, auto-aftrek per job
- **Kostenmotor** — materiaal + energie + arbeid + BMCU slijtage
- **Offertes** — aanmaken, opvolgen, betaalstatus
- **HA integratie** — live kWh van smart plugs, printerstatus
- **Dashboard** — KPI's, omzet per maand, stockoverzicht

## Installatie in Home Assistant

### Stap 1 — GitHub repository aanmaken

1. Maak een nieuwe repo aan op GitHub: `3d-print-erp`
2. Clone lokaal: `git clone https://github.com/JOUW_NAAM/3d-print-erp.git`
3. Kopieer alle bestanden in die map
4. Run het build script: `bash build.sh`
5. Commit en push:
   ```bash
   git add .
   git commit -m "Initial 3D Print ERP"
   git push
   ```

### Stap 2 — Addon toevoegen in HA

1. Ga naar **Instellingen → Add-ons → Add-on store**
2. Klik op de drie puntjes rechtsboven → **Repositories**
3. Voeg toe: `https://github.com/JOUW_NAAM/3d-print-erp`
4. Herlaad de pagina — de addon verschijnt bovenaan
5. Klik op **3D Print ERP** → **Installeren**
6. Klik op **Starten**

### Stap 3 — Openen

- Via **Ingress** (aanbevolen): klik op **Openen** in de addon pagina
- Of surf naar: `http://JOUW_NUC_IP:3000`
- In de zijbalk van HA: het paneel **3D Print ERP** verschijnt automatisch

## HA entity configuratie

Na installatie ga je naar **Instellingen** in de app en vul je de HA entities in:

| Printer | kwh_entity | ha_entity_prefix |
|---------|-----------|-----------------|
| Ender 3 S1 Pro | `sensor.NAAM_van_jouw_smartplug_energy` | leeg laten |
| Bambu A1 Mini | `sensor.NAAM_van_jouw_smartplug_energy` | `sensor.a1mini_0300da611800680_` |

Zoek de juiste entity namen op in **HA → Instellingen → Apparaten & diensten → Entiteiten**.

## Lokale ontwikkeling

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (apart terminal)
cd frontend && npm install && npm run dev
# → open http://localhost:5173
```

## Structuur

```
├── addon/          ← HA addon (Dockerfile, config.yaml, run.sh)
├── backend/        ← Express API + SQLite
│   ├── server.js
│   ├── db.js
│   └── routes/
├── frontend/       ← React app
│   └── src/
│       ├── pages/  ← Dashboard, Jobs, Klanten, Filament, Offertes, Instellingen
│       └── lib/    ← API client
├── build.sh        ← bouw frontend + kopieer naar addon
└── repository.json ← HA addon store config
```
