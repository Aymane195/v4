# Solar AI-Optimizer — Project Brief for Claude Code

> This file is the single source of truth for this project. Read it fully before doing anything.

---

## What this app is

Solar AI-Optimizer is a solar energy monitoring web app for Moroccan solar panel owners and their installers. It connects to Huawei FusionSolar to pull real-time and historical solar data, runs an AI model to detect panel soiling (dirt/dust reducing panel efficiency), and alerts users when cleaning is needed.

- **Target market:** Morocco — desert/dust regions like Dakhla, Ouarzazate, Agadir
- **UI language:** French (with FR / AR / EN switcher in settings)
- **Version:** v1.0.0

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Flask — handles API routes, auth, DB calls, FusionSolar integration |
| Database | Supabase — PostgreSQL + file storage only (no Supabase Auth) |
| Auth | Flask with JWT tokens via `flask-jwt-extended` — Flask owns login entirely |
| Solar data | Huawei FusionSolar OpenAPI (Northbound API) |
| AI model | `soiling_model.pkl` — loaded directly by Flask using `joblib` |
| Charts | Recharts (React) |

### Important notes on the AI model

The AI model is a `.pkl` file trained by a teammate on his own machine and transferred via USB. There is **no FastAPI server, no HTTP call to an AI service**. Flask just loads the file directly:

```python
import joblib
model = joblib.load("backend/models/soiling_model.pkl")

# usage when FusionSolar data arrives:
result = model.predict([[pv_power, irradiance, temperature]])
soiling_index = result[0]
```

To update the model: teammate retrains → exports new `.pkl` → hands over via USB → replace file in `backend/models/` → restart Flask. No code changes needed.

---

## User roles

### Client
- Self-registers via signup page — account stored in Supabase
- Logs in with own email/password
- Sees **only their own** solar plant data
- Cannot access employee views

### Employee
- Account is **pre-created manually** by the dev team (e.g. `emp1@gmail.com`)
- Cannot self-register
- Manages plants, maintenance, and alerts for all clients
- Different dashboard layout from client

> No admin role in v1.0.

---

## Project folder structure

```
solar-ai-platform/
│
├── frontend/                        # React app
│   └── src/
│       ├── pages/                   # Login, Dashboard (client), Dashboard (employee), Alerts, Analytics, Settings
│       ├── components/              # EnergyChart, SoilingGauge, DeviceCard, AlertCard
│       ├── services/
│       │   └── api.js               # All HTTP calls to Flask — one file, one place
│       └── context/
│           └── AuthContext.js       # Stores logged-in user + role after login
│
├── backend/                         # Flask app
│   ├── app.py                       # Entry point — registers all routes
│   ├── config.py                    # Loads env vars: Supabase URL/key, FusionSolar key, JWT secret
│   ├── routes/
│   │   ├── auth.py                  # Login, signup, token refresh
│   │   ├── plants.py                # Plant data routes
│   │   ├── alerts.py                # Alert routes
│   │   └── devices.py               # Device routes
│   ├── services/
│   │   ├── fusionsolar.py           # All FusionSolar API calls wrapped in functions
│   │   └── soiling.py               # Loads .pkl, runs model.predict(), returns soiling index
│   ├── models/
│   │   ├── soiling_model.pkl        # ← AI model file from teammate via USB (not committed to git)
│   │   └── user.py                  # User model
│   └── .env                         # SUPABASE_URL, SUPABASE_KEY, FUSIONSOLAR_KEY, JWT_SECRET
│
└── database/
    └── schema.sql                   # Supabase table definitions
```

---

## Database schema (Supabase — PostgreSQL)

```sql
-- Users
users: id, email, password_hash, role (client | employee), created_at

-- Solar plants
plants: id, name, location, capacity_kw, owner_id (FK → users), installation_date

-- Devices (inverter, battery, meter)
devices: id, plant_id (FK), type, model, status, last_update

-- Energy production data from FusionSolar
energy_production: id, plant_id, timestamp, pv_power, daily_energy, grid_power

-- AI model output
soiling_results: id, plant_id, timestamp, soiling_index, loss_percent

-- Alerts generated when soiling drops below threshold
alerts: id, plant_id, severity (critique | attention | info), status (en_cours | resolu), title, description, created_at

-- Per-user notification and app settings
user_settings: user_id, soiling_threshold, notif_soiling, notif_email, notif_sms, notif_monthly, language, dark_mode
```

---

## Client interface — 4 screens

Design: dark theme, orange/amber accent `#F59E0B`, French language.

### Screen 1 — Accueil (home dashboard)
- Header: app name, current time, Live indicator
- Status banner: panel cleanliness status + last cleaned date
- Soiling ring gauge: large circular indicator showing Soiling Index % with orange arc
- Energy flow diagram: Panneaux solaires → Onduleur → Domicile → Réseau, with live kW values
- 4 stat cards: Production (kW en ce moment), Aujourd'hui (kWh), Economies (DH ce mois-ci), CO₂ évité (kg)
- Bottom nav: Accueil, Analyses

### Screen 2 — Analyses
- Period toggle: Jour / Mois / Année
- Metric toggle: Production / Economies
- Bar chart: monthly energy production across 12 months, tooltip on selected bar
- Summary row: Total kWh, Pic kWh, Moyenne kWh
- 6 detail cards: Energie totale produite, Economies totales, CO₂ évité, Température panneaux (°C), Irradiance solaire (W/m²), Injection réseau (kW)
- Bottom nav: Accueil, Analyses (active)

### Screen 3 — Alertes
- 3 summary counters: Total alertes, En attente (red), Résolues (green)
- Filter tabs: Toutes / En cours / Résolues
- Alert cards with 3 severity levels:
  - `CRITIQUE` — red border, expandable, shows Soiling Index %, estimated loss DH/jour, field team notification status
  - `ATTENTION` — orange border, cleaning recommendation
  - `INFO` — teal, informational (e.g. cleaning completed)
- Each card: severity badge, status badge (RÉSOLU / EN COURS), date/time, title, description, expand/collapse
- Bottom nav: Accueil, Analyses, Alertes (active + badge count), Réglages

### Screen 4 — Paramètres (settings)
- Profile card: avatar, name, city + country, capacity (kWc), installation date
- Installation section: Nom de l'installation (editable), Localisation (editable), Puissance crête (read-only)
- Soiling alert threshold: slider (default 85%) — labels: 60% Critique / 85% Recommandé / 99% Strict — triggers auto email below threshold
- Notifications (4 toggles): Alertes soiling (ON), Email automatique (ON), SMS d'urgence (OFF), Rapport mensuel (ON)
- Connexion Huawei FusionSolar: API status (Connected + last sync time), API credentials (masked, editable)
- Preferences: Mode sombre toggle, Language switcher (FR / AR / EN)
- Bottom nav: Accueil, Analyses, Alertes (badge), Réglages (active)

---

## Data flow

```
FusionSolar API
    ↓
Flask (services/fusionsolar.py) — fetches plant + energy + device data
    ↓
Supabase — stores raw energy_production rows
    ↓
Flask (services/soiling.py) — runs model.predict() on new data
    ↓
Supabase — stores result in soiling_results
    ↓
If soiling_index < user threshold → create alert row + send email
    ↓
React (api.js) — polls Flask routes → renders dashboard
```

---

## What needs to be set up — help needed here

The developer needs help setting up the following. Please guide step by step when asked:

### 1. Supabase setup
- Create a new Supabase project
- Run the schema SQL to create all tables
- Set up Row Level Security (RLS) so clients only see their own data
- Get the `SUPABASE_URL` and `SUPABASE_KEY` for the `.env` file
- Connect Flask to Supabase using `supabase-py`

### 2. FusionSolar API setup
- Create an installer account on Huawei FusionSolar portal
- Request OpenAPI / Northbound API access
- Get the `AppKey` and `AppSecret`
- Implement login flow: `POST /thirdData/login` → returns `accessToken`
- Use token to call: `getStationList`, `getKpiStationDay`, `getDevList`

### 3. Flask JWT auth setup
- Install and configure `flask-jwt-extended`
- Login route returns access token + role
- Protected routes check token + role before responding
- React stores token and sends it in every request header

### 4. Flask + Supabase connection
- Use `supabase-py` library in Flask to read/write all tables
- Client data isolation: always filter queries by `owner_id = current_user.id`

---

## Environment variables needed

```
SUPABASE_URL=
SUPABASE_KEY=
FUSIONSOLAR_KEY=
FUSIONSOLAR_SECRET=
JWT_SECRET=
```

---

*Solar AI-Optimizer v1.0.0 — Dakhla, Maroc 2025*
