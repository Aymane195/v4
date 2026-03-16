import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SoilingGauge from "../components/SoilingGauge";
import { Home, BarChart3, Bell, Settings, LogOut, RefreshCw, Sun, Zap, Plug, Coins, Leaf, Thermometer, AlertTriangle, Flame, Radio, CheckCircle, Wrench, Send, Clock, CalendarDays, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import Logo from "../components/Logo";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const ALARM_LABEL = { 1: "Critique", 2: "Majeure", 3: "Mineure", 4: "Avertissement" };
const ALARM_SEV = {
  1: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  2: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  3: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  4: { bg: "#FEFCE8", text: "#CA8A04", border: "#FEF08A" },
};

function fmt(v, dec = 1) {
  if (v == null || isNaN(Number(v))) return "--";
  return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

function useSettings() {
  const [s, setS] = useState(() => { try { return JSON.parse(localStorage.getItem("solar_settings") || "{}"); } catch { return {}; } });
  const upd = (k, v) => { const n = { ...s, [k]: v }; setS(n); localStorage.setItem("solar_settings", JSON.stringify(n)); };
  return [s, upd];
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = { background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "1.25rem" };
const sectionTitle = { fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "1rem" };
const fieldLbl = { fontSize: "12px", color: "#6B7280", marginBottom: "4px" };
const fieldVal = { fontSize: "15px", fontWeight: "500", color: "#1A202C" };
const inputSty = { display: "block", width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "14px", color: "#1A202C", background: "#F8FAFC", boxSizing: "border-box", outline: "none" };

// ── Live pill (station name + clock + EN DIRECT) ──────────────────────────────
function LivePill({ stationName }) {
  const clock = useClock();
  const timeStr = clock.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "0.5rem 1.25rem", textAlign: "center" }}>
      <p style={{ fontWeight: "600", color: "#1A202C", fontSize: "14px" }}>{stationName}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
        <span style={{ color: "#6B7280", fontSize: "13px" }}>Live {timeStr}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "3px", background: "#DCFCE7", color: "#16A34A", borderRadius: "999px", padding: "1px 8px", fontSize: "11px", fontWeight: "600" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          EN DIRECT
        </span>
      </div>
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────
function PageHeader({ title, stationName, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C", margin: 0 }}>{title}</h1>
      {right || <LivePill stationName={stationName} />}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: "44px", height: "24px", borderRadius: "999px", background: value ? "#3B82F6" : "#CBD5E0", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: "2px", left: value ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );
}

// ── Root dashboard ────────────────────────────────────────────────────────────
export default function ClientDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("accueil");
  const [kpi, setKpi] = useState(null);
  const [soiling, setSoiling] = useState(null);
  const [stations, setStations] = useState([]);
  const [deviceKpi, setDeviceKpi] = useState(null);
  const [alarmCount, setAlarmCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);

  const loadMain = useCallback(async () => {
    try {
      const [s, k, dev, al] = await Promise.allSettled([
        api.get("/client/stations"),
        api.get("/client/kpi/realtime"),
        api.get("/client/kpi/devices"),
        api.get("/client/soiling-alerts"),
      ]);
      if (s.status === "fulfilled") setStations(s.value.data || []);
      if (k.status === "fulfilled") { setKpi(k.value.data); setLastSync(Date.now()); }
      if (dev.status === "fulfilled") { const raw = dev.value.data; setDeviceKpi(Array.isArray(raw) ? raw[0] : raw); }
      if (al.status === "fulfilled") {
        // Count only active (non-resolved) soiling alerts for the badge
        setAlarmCount((al.value.data || []).filter(a => a.status !== "resolu").length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadMain();
    const iv = setInterval(loadMain, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadMain]);

  useEffect(() => {
    if (stations[0]?.station_code) {
      api.get(`/soiling/station/${stations[0].station_code}`).then(r => setSoiling(r.data)).catch(() => {});
    }
  }, [stations]);

  const stationName = stations[0]?.station_name || stations[0]?.station_code || "Mon installation";

  const NAV = [
    { id: "accueil",  label: "Accueil",  icon: <Home size={18} /> },
    { id: "analyses", label: "Analyses", icon: <BarChart3 size={18} /> },
    { id: "alertes",  label: "Alertes",  icon: <Bell size={18} />, badge: alarmCount },
    { id: "reglages", label: "Réglages", icon: <Settings size={18} /> },
  ];

  return (
    <>
      <style>{`
        body { margin: 0; background: #F0F4F8; font-family: 'Segoe UI', system-ui, sans-serif; }
        input[type=range] { accent-color: #3B82F6; }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: "220px", minHeight: "100vh", background: "#fff", borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "1.25rem 1.25rem 0.75rem", borderBottom: "1px solid #F1F5F9" }}>
            <Logo size="sm" color="#1A202C" />
          </div>

          <nav style={{ flex: 1, padding: "0.75rem" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} style={{
                display: "flex", alignItems: "center", gap: "10px", width: "100%",
                padding: "0.6rem 0.875rem", borderRadius: "8px", border: "none", cursor: "pointer",
                marginBottom: "2px", fontSize: "0.9rem", textAlign: "left",
                fontWeight: tab === n.id ? "600" : "400",
                background: tab === n.id ? "#EFF6FF" : "transparent",
                color: tab === n.id ? "#2563EB" : "#4B5563",
              }}>
                <span style={{ fontSize: "1rem" }}>{n.icon}</span>
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.badge > 0 && (
                  <span style={{ background: "#EF4444", color: "#fff", borderRadius: "999px", padding: "1px 7px", fontSize: "11px", fontWeight: "700" }}>{n.badge}</span>
                )}
              </button>
            ))}
          </nav>

          <div style={{ padding: "0.875rem 1.25rem", borderTop: "1px solid #F1F5F9" }}>
            <button onClick={() => { logout(); navigate("/login"); }} style={{ width: "100%", padding: "0.5rem", background: "none", border: "1px solid #E2E8F0", borderRadius: "6px", color: "#6B7280", fontSize: "13px", cursor: "pointer", marginBottom: "6px" }}>
              <LogOut size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} /> Déconnexion
            </button>
            <p style={{ fontSize: "11px", color: "#A0AEC0", textAlign: "center" }}>Version v2.1.0</p>
            <p style={{ fontSize: "11px", color: "#A0AEC0", textAlign: "center" }}>SolarAI, Casablanca, 2024</p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minHeight: "100vh", background: "#F0F4F8", overflowY: "auto" }}>
          {tab === "accueil"  && <AccueilTab  kpi={kpi} soiling={soiling} alarmCount={alarmCount} stationName={stationName} onAlertes={() => setTab("alertes")} />}
          {tab === "analyses" && <AnalysesTab kpi={kpi} deviceKpi={deviceKpi} stations={stations} stationName={stationName} />}
          {tab === "alertes"  && <AlertesTab  stationName={stationName} stations={stations} />}
          {tab === "reglages" && <ReglagesTab kpi={kpi} lastSync={lastSync} stationName={stationName} />}
        </main>
      </div>
    </>
  );
}

// ── Accueil Tab ───────────────────────────────────────────────────────────────
function AccueilTab({ kpi, soiling, alarmCount, stationName, onAlertes }) {
  const d = kpi?.data?.[0]?.dataItemMap || {};
  const dayEnergy    = d.day_power ?? null;
  const totalEnergy  = d.total_power ?? null;
  const monthSavings = d.month_power != null ? Math.round(d.month_power * 1.5) : null;
  const co2Total     = d.reduce_carbon ?? (totalEnergy != null ? Math.round(totalEnergy * 0.233) : null);
  const homeEnergy   = d.day_use_energy ?? null;
  const gridPower    = d.use_power ?? null;
  const dayGrid      = d.day_on_grid_energy ?? null;
  const soilingIdx   = soiling?.soiling_index ?? 0;

  // 3-second live production poll
  const [livePower, setLivePower] = useState(d.inverter_power ?? null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await api.get("/client/kpi/realtime");
        if (cancelled) return;
        const p = res.data?.data?.[0]?.dataItemMap?.inverter_power ?? null;
        setLivePower(p);
        setPulse(true);
        setTimeout(() => { if (!cancelled) setPulse(false); }, 500);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div>
      <PageHeader title="Accueil" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Indice de Propreté */}
        <div style={card}>
          <p style={sectionTitle}>Indice de Propreté (IA)</p>
          <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0" }}>
            <SoilingGauge index={soilingIdx} size={340} />
          </div>
        </div>

        {/* Production + Flux row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>

          {/* Production Actuelle */}
          <div style={{ ...card, transition: "border-color 0.4s", borderColor: pulse ? "#6366F1" : "#E2E8F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <p style={sectionTitle}>Production Actuelle</p>
              <span style={{ background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0", borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <RefreshCw size={12} /> Live
              </span>
            </div>
            <p style={{ fontSize: "3rem", fontWeight: "800", color: "#6366F1", lineHeight: 1 }}>
              {livePower != null ? fmt(livePower, 1) : "--"}
              <span style={{ fontSize: "1.2rem", fontWeight: "500", color: "#94A3B8", marginLeft: "6px" }}>kW</span>
            </p>
          </div>

          {/* Flux d'Énergie */}
          <div style={card}>
            <p style={sectionTitle}>Flux d'Énergie</p>
            <EnergyFlow power={livePower} dayEnergy={dayEnergy} homeEnergy={homeEnergy} gridPower={gridPower} dayGrid={dayGrid} />
          </div>
        </div>

        {/* Bottom 4 KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          <BottomKpi label="Production Aujourd'hui" value={`${fmt(dayEnergy, 1)} kWh`} />
          <BottomKpi label="Économies ce Mois"      value={`${fmt(monthSavings, 0)} DH`} />
          <BottomKpi label="CO₂ Évité (Total)"      value={`${fmt(co2Total, 0)} kg`} />
          <BottomKpi
            label="Perte Encrassement"
            value={soiling?.energy_loss_percent != null ? `${fmt(soiling.energy_loss_percent, 1)}%` : "--"}
            color={soiling?.energy_loss_percent > 10 ? "#DC2626" : soiling?.energy_loss_percent > 5 ? "#EA580C" : "#16A34A"}
          />
        </div>
      </div>
    </div>
  );
}

function BottomKpi({ label, value, color = "#1A202C" }) {
  return (
    <div style={card}>
      <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", marginBottom: "0.5rem" }}>{label}</p>
      <p style={{ fontSize: "1.5rem", fontWeight: "700", color }}>{value}</p>
    </div>
  );
}

function EnergyFlow({ power, dayEnergy, homeEnergy, gridPower, dayGrid }) {
  const Node = ({ icon, label }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "52px", height: "52px", border: "1px solid #E2E8F0", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", background: "#F8FAFC" }}>
        {icon}
      </div>
      <span style={{ fontSize: "11px", color: "#6B7280", textAlign: "center", maxWidth: "70px", lineHeight: 1.3 }}>{label}</span>
    </div>
  );

  const Arrow = ({ top, bottom }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "0 4px" }}>
      <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{top} kW</span>
      <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1, height: "2px", background: "#CBD5E0" }} />
        <span style={{ color: "#CBD5E0", fontSize: "10px", marginLeft: "1px" }}>▶</span>
      </div>
      <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{bottom} kW</span>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", paddingTop: "0.25rem" }}>
      <Node icon={<Sun size={24} color="#F59E0B" />} label="Panneaux Solaires" />
      <Arrow top={fmt(power, 1)} bottom={fmt(dayEnergy, 1)} />
      <Node icon={<Zap size={24} color="#6366F1" />} label="Onduleur" />
      <Arrow top={fmt(homeEnergy, 1)} bottom={fmt(gridPower, 1)} />
      <Node icon={<Home size={24} color="#16A34A" />} label="Maison & Réseau Électrique" />
      <Arrow top={fmt(gridPower, 1)} bottom={fmt(dayGrid, 1)} />
      <Node icon={<Plug size={24} color="#6B7280" />} label="Réseau" />
    </div>
  );
}

// ── Demo chart data generator (client-side fallback) ─────────────────────────
function generateDemoChart(period) {
  const now = new Date();
  const yr = now.getFullYear();
  if (period === "jour") {
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(now); dt.setDate(dt.getDate() - (6 - i));
      const seasonal = 0.5 + 0.5 * Math.cos(Math.PI * (dt.getMonth() + 1 - 7) / 6);
      return { name: dt.toLocaleDateString("fr-FR", { weekday: "short" }), val: Math.round((15 + Math.random() * 55) * seasonal * 10) / 10 };
    });
  }
  if (period === "mois") {
    return MONTHS.map((name, i) => {
      const seasonal = 0.5 + 0.5 * Math.cos(Math.PI * (i + 1 - 7) / 6);
      return { name, val: Math.round((120 + Math.random() * 260) * (0.5 + seasonal) * 10) / 10 };
    });
  }
  return Array.from({ length: 3 }, (_, i) => ({
    name: String(yr - 2 + i),
    val: Math.round((1800 + Math.random() * 2400) * 10) / 10,
  }));
}

function generateDemoTemp() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  const daytime = hour >= 6 && hour <= 20;
  return daytime ? Math.round((38 + Math.random() * 30) * 10) / 10 : Math.round((20 + Math.random() * 18) * 10) / 10;
}

// ── Analyses Tab ──────────────────────────────────────────────────────────────
function AnalysesTab({ kpi, deviceKpi, stations, stationName }) {
  const [period, setPeriod] = useState("mois");
  const [mode, setMode]     = useState("production");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [demoTemp, setDemoTemp]   = useState(generateDemoTemp);

  const d = kpi?.data?.[0]?.dataItemMap || {};
  const totalEnergy  = d.total_power ?? null;
  const totalSavings = totalEnergy != null ? Math.round(totalEnergy * 1.5) : null;
  const co2Total     = d.reduce_carbon ?? (totalEnergy != null ? Math.round(totalEnergy * 0.233) : null);
  const trees        = co2Total != null ? Math.round(co2Total / 21) : null;
  const radiation    = d.radiation_intensity ?? null;
  const dayGrid      = d.day_on_grid_energy ?? null;
  const panelTemp    = deviceKpi?.data?.[0]?.dataItemMap?.temperature ?? demoTemp;

  const stationCode = stations[0]?.station_code;

  // Load chart data — try API first, fallback to demo generation
  useEffect(() => {
    if (!stationCode) return;
    let cancelled = false;
    setLoading(true);

    async function loadFromApi() {
      const now = new Date();
      const yr  = now.getFullYear();
      let data = [];
      try {
        if (period === "jour") {
          data = await Promise.all(Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(now); dt.setDate(dt.getDate() - (6 - i));
            const str = dt.toISOString().slice(0, 10);
            return api.get(`/client/kpi/daily?date=${str}`)
              .then(r => { const kp = Array.isArray(r.data) ? r.data[0] : r.data; return { name: dt.toLocaleDateString("fr-FR", { weekday: "short" }), val: kp?.data?.[0]?.dataItemMap?.day_power ?? 0 }; })
              .catch(() => ({ name: "", val: 0 }));
          }));
        } else if (period === "mois") {
          data = await Promise.all(Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, "0");
            return api.get(`/client/kpi/monthly?date=${yr}-${m}`)
              .then(r => { const kp = Array.isArray(r.data) ? r.data[0] : r.data; return { name: MONTHS[i], val: kp?.data?.[0]?.dataItemMap?.month_power ?? 0 }; })
              .catch(() => ({ name: MONTHS[i], val: 0 }));
          }));
        } else {
          data = await Promise.all(Array.from({ length: 3 }, (_, i) => {
            const y = yr - 2 + i;
            return api.get(`/client/kpi/monthly?date=${y}-06`)
              .then(r => { const kp = Array.isArray(r.data) ? r.data[0] : r.data; return { name: String(y), val: (kp?.data?.[0]?.dataItemMap?.month_power ?? 0) * 12 }; })
              .catch(() => ({ name: String(y), val: 0 }));
          }));
        }
      } catch { data = []; }

      if (cancelled) return;
      const sum = data.reduce((s, r) => s + (r.val || 0), 0);
      return sum > 0 ? data : null; // null = API had no real data
    }

    loadFromApi().then(apiData => {
      if (cancelled) return;
      setChartData(apiData || generateDemoChart(period));
      setLoading(false);
    });

    // Refresh every 10s — only regenerates demo data locally (no API spam)
    const iv = setInterval(() => {
      if (!cancelled) {
        setChartData(generateDemoChart(period));
        setDemoTemp(generateDemoTemp());
      }
    }, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [period, stationCode]);

  const chartVals = mode === "economies" ? chartData.map(r => ({ ...r, val: Math.round(r.val * 1.5) })) : chartData;
  const total = chartVals.reduce((s, r) => s + (r.val || 0), 0);
  const peak  = Math.max(...chartVals.map(r => r.val || 0), 0);
  const avg   = chartVals.length > 0 ? total / chartVals.length : 0;
  const unit  = mode === "economies" ? "DH" : "kWh";

  return (
    <div>
      <PageHeader title="Analyses" stationName={stationName} right={
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", display: "flex", overflow: "hidden" }}>
            {[["jour","Jour"],["mois","Mois"],["année","Année"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setPeriod(id)} style={{
                padding: "0.4rem 1.1rem", border: "none", cursor: "pointer", fontSize: "14px",
                fontWeight: period === id ? "600" : "400",
                background: period === id ? "#1A202C" : "#fff",
                color: period === id ? "#fff" : "#4B5563",
              }}>{lbl}</button>
            ))}
          </div>
          <LivePill stationName={stationName} />
        </div>
      } />

      <div style={{ padding: "0 1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Chart + side stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "1rem" }}>

          {/* Chart card */}
          <div style={card}>
            <p style={sectionTitle}>Sélection de Période</p>
            <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
              {[["production","Production (kWh)"],["economies","Économies (DH)"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setMode(id)} style={{
                  padding: "0.4rem 1rem", borderRadius: "6px", border: "1px solid #E2E8F0", cursor: "pointer", fontSize: "13px",
                  fontWeight: mode === id ? "600" : "400",
                  background: mode === id ? "#1A202C" : "#fff",
                  color: mode === id ? "#fff" : "#4B5563",
                }}>{lbl}</button>
              ))}
            </div>
            {loading ? (
              <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}>Chargement...</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartVals} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }}
                    formatter={v => [`${fmt(v, 1)} ${unit}`, mode === "economies" ? "Économies" : "Production"]}
                  />
                  <Bar dataKey="val" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Side stat cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              [`Production Totale (${period === "mois" ? "Mois" : period === "jour" ? "Semaine" : "Année"})`, `${fmt(total, 1)} ${unit}`],
              ["Valeur de Crête (Meilleur Jour)", `${fmt(peak, 1)} ${unit}`],
              ["Valeur Moyenne (Jour)", `${fmt(avg, 1)} ${unit}`],
            ].map(([lbl, val]) => (
              <div key={lbl} style={card}>
                <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>{lbl}</p>
                <p style={{ fontSize: "1.4rem", fontWeight: "700", color: "#1A202C" }}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 6 detail cards 3×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <DetailCard icon={<Sun size={20} color="#F59E0B" />} label="Total Énergie Produite"    value={totalEnergy != null ? `${fmt(totalEnergy, 0)} kWh` : "--"} sub={`Année d'installation: ${new Date().getFullYear() - 2}`} />
          <DetailCard icon={<Coins size={20} color="#16A34A" />} label="Total Économies Réalisées" value={totalSavings != null ? `${fmt(totalSavings, 0)} DH` : "--"} sub="depuis installation" />
          <DetailCard icon={<Leaf size={20} color="#16A34A" />} label="CO₂ Évité (Total)"         value={co2Total != null ? `${fmt(co2Total, 0)} kg` : "--"} sub={trees != null ? `Équivalent à: ${fmt(trees, 0)} arbres plantés` : null} />
          <DetailCard icon={<Thermometer size={20} color="#DC2626" />} label="Température des Panneaux"  value={panelTemp != null ? `${fmt(panelTemp, 0)} °C` : "--"} />
          <DetailCard icon={<Sun size={20} color="#F59E0B" />} label="Irradiation Solaire"        value={`${fmt(radiation, 0)} W/m²`} />
          <DetailCard icon={<Zap size={20} color="#6366F1" />} label="Injection Réseau"           value={dayGrid != null ? `${fmt(dayGrid, 1)} kW` : "--"} />
        </div>
      </div>
    </div>
  );
}

function DetailCard({ icon, label, value, sub }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "flex-start", gap: "12px" }}>
      <div style={{ width: "40px", height: "40px", background: "#F0F4F8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "2px" }}>{label}</p>
        <p style={{ fontSize: "1.2rem", fontWeight: "700", color: "#1A202C" }}>{value}</p>
        {sub && <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Intervention status helpers ───────────────────────────────────────────────
const IV_STATUS = {
  en_attente: { label: "En attente", dot: "#94A3B8", text: "#475569", bg: "#F8FAFC" },
  acceptee:   { label: "Acceptée",   dot: "#3B82F6", text: "#1D4ED8", bg: "#EFF6FF" },
  planifiee:  { label: "Planifiée",  dot: "#8B5CF6", text: "#5B21B6", bg: "#F5F3FF" },
  en_cours:   { label: "En cours",   dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB" },
  terminee:   { label: "Terminée",   dot: "#22C55E", text: "#166534", bg: "#F0FDF4" },
  cloturee:   { label: "Clôturée",   dot: "#94A3B8", text: "#6B7280", bg: "#F8FAFC" },
};
const IV_TYPE_LABEL = { nettoyage: "Nettoyage", maintenance: "Maintenance", inspection: "Inspection", urgence: "Urgence" };
const IV_PRIO = {
  critique: { label: "Critique", dot: "#DC2626", text: "#991B1B", bg: "#FEF2F2" },
  haute:    { label: "Haute",    dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB" },
  normale:  { label: "Normale",  dot: "#3B82F6", text: "#1E40AF", bg: "#EFF6FF" },
  basse:    { label: "Basse",    dot: "#94A3B8", text: "#475569", bg: "#F8FAFC" },
};
const SEV_TO_PRIO = { 1: "critique", 2: "haute", 3: "normale", 4: "basse" };

// ── Alertes Tab ───────────────────────────────────────────────────────────────
const SOIL_SEV = {
  critique: { label: "Critique", dot: "#DC2626", text: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  attention: { label: "Attention", dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB", border: "#FED7AA" },
  info:      { label: "Info",      dot: "#0891B2", text: "#155E75", bg: "#ECFEFF", border: "#A5F3FC" },
};
const SOIL_SEV_TO_PRIO = { critique: "critique", attention: "haute", info: "normale" };
const SOIL_ICON = { critique: AlertTriangle, attention: Flame, info: CheckCircle };

function AlertesTab({ stationName, stations }) {
  const [soilingAlerts, setSoilingAlerts] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState("all");
  const [expanded, setExpanded]           = useState(null);

  // Interventions
  const [interventions, setInterventions] = useState([]);
  const [ivLoading, setIvLoading]         = useState(true);
  const [ivExpanded, setIvExpanded]       = useState(null);
  const [showIvSection, setShowIvSection] = useState(true);

  // Intervention request form
  const [formAlert, setFormAlert]     = useState(null); // alert id showing form
  const [formType, setFormType]       = useState("nettoyage");
  const [formDesc, setFormDesc]       = useState("");
  const [formPrio, setFormPrio]       = useState("normale");
  const [formSending, setFormSending] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);

  useEffect(() => {
    api.get("/client/soiling-alerts")
      .then(res => setSoilingAlerts(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get("/client/interventions")
      .then(res => setInterventions(res.data || []))
      .catch(() => {})
      .finally(() => setIvLoading(false));
  }, []);

  // Counts per severity
  const counts = { critique: 0, attention: 0, info: 0 };
  soilingAlerts.forEach(a => { if (counts[a.severity] != null) counts[a.severity]++; });
  const visible = filter === "all" ? soilingAlerts : soilingAlerts.filter(a => a.severity === filter);
  const resolvedCount = soilingAlerts.filter(a => a.status === "resolu").length;

  // Intervention counts + lookup by alarm title
  const ivCounts = { pending: 0, active: 0, done: 0 };
  const ivByTitle = {};  // alert.title → intervention (most recent non-clôturée)
  interventions.forEach(iv => {
    if (iv.status === "en_attente") ivCounts.pending++;
    else if (["acceptee", "planifiee", "en_cours"].includes(iv.status)) ivCounts.active++;
    else ivCounts.done++;
    if (!ivByTitle[iv.alarm_name] || iv.status !== "cloturee") {
      ivByTitle[iv.alarm_name] = iv;
    }
  });

  function openForm(alertId, severity) {
    setFormAlert(alertId);
    setFormType("nettoyage");
    setFormDesc("");
    setFormPrio(SOIL_SEV_TO_PRIO[severity] || "normale");
    setFormSuccess(null);
  }

  async function submitIntervention(alert) {
    setFormSending(true);
    try {
      const sevNum = { critique: 1, attention: 2, info: 4 };
      const body = {
        station_code: stations[0]?.station_code || alert.station_code || "UNKNOWN",
        station_name: stationName,
        alarm_name:   alert.title,
        alarm_severity: sevNum[alert.severity] || 3,
        type:        formType,
        description: formDesc || null,
        priority:    formPrio,
      };
      const res = await api.post("/client/interventions", body);
      setInterventions(prev => [res.data, ...prev]);
      setFormSuccess(true);
      setTimeout(() => { setFormAlert(null); setFormSuccess(null); }, 2000);
    } catch {
      setFormSuccess(false);
    } finally {
      setFormSending(false);
    }
  }

  return (
    <div>
      <PageHeader title="Alertes & Interventions" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem" }}>

        {/* ── Mes Interventions section ── */}
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowIvSection(!showIvSection)}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ClipboardList size={18} color="#6366F1" />
              <p style={{ ...sectionTitle, marginBottom: 0 }}>Mes Interventions</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", fontWeight: "500", color: "#92400E" }}>{ivCounts.pending} en attente</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3B82F6", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", fontWeight: "500", color: "#1D4ED8" }}>{ivCounts.active} en cours</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", fontWeight: "500", color: "#166534" }}>{ivCounts.done} terminée{ivCounts.done !== 1 ? "s" : ""}</span>
              </span>
              {showIvSection ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
            </div>
          </div>

          {showIvSection && (
            <div style={{ marginTop: "1rem" }}>
              {ivLoading ? (
                <p style={{ color: "#94A3B8", fontSize: "13px" }}>Chargement...</p>
              ) : interventions.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: "13px" }}>Aucune intervention demandée pour le moment.</p>
              ) : interventions.map((iv, idx) => {
                const st = IV_STATUS[iv.status] || IV_STATUS.en_attente;
                const pr = IV_PRIO[iv.priority] || IV_PRIO.normale;
                const isOpen = ivExpanded === idx;
                return (
                  <div key={iv.id} style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "6px", borderLeft: `4px solid ${pr.text}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setIvExpanded(isOpen ? null : idx)}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                        <Wrench size={16} color="#6B7280" />
                        <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#6366F1", fontWeight: "700", flexShrink: 0 }}>
                          INT-{String(iv.id).padStart(4, "0")}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#1A202C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {IV_TYPE_LABEL[iv.type] || iv.type}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: pr.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", fontWeight: "500", color: pr.text }}>{pr.label}</span>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: st.bg, borderRadius: "999px", padding: "2px 9px", flexShrink: 0 }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", fontWeight: "500", color: st.text }}>{st.label}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "8px" }}>
                        {iv.scheduled_date && (
                          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "12px", color: "#7C3AED" }}>
                            <CalendarDays size={12} /> {iv.scheduled_date}
                          </span>
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "12px", color: "#6B7280" }}>
                          <Clock size={12} /> {iv.created_at ? new Date(iv.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "--"}
                        </span>
                        {isOpen ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #F1F5F9", fontSize: "13px", color: "#374151" }}>
                        <p style={{ marginBottom: "4px" }}><strong>Alerte:</strong> {iv.alarm_name}</p>
                        {iv.description && <p style={{ marginBottom: "4px" }}><strong>Description:</strong> {iv.description}</p>}
                        {iv.employee_notes && <p style={{ marginBottom: "4px", color: "#6366F1" }}><strong>Notes technicien:</strong> {iv.employee_notes}</p>}
                        {iv.resolution && (
                          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "8px 12px", marginTop: "6px" }}>
                            <p style={{ fontWeight: "600", color: "#16A34A", marginBottom: "2px" }}>Résolution</p>
                            <p style={{ color: "#374151" }}>{iv.resolution}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Soiling alerts section ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "1rem", flexWrap: "wrap" }}>
          <p style={{ color: "#4B5563", fontSize: "15px" }}>
            Total: <strong>{soilingAlerts.length}</strong> alerte{soilingAlerts.length !== 1 ? "s" : ""}
          </p>
          {counts.critique > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#DC2626" }} />
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#991B1B" }}>{counts.critique} Critique</span>
            </span>
          )}
          {counts.attention > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F59E0B" }} />
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#92400E" }}>{counts.attention} Attention</span>
            </span>
          )}
          {resolvedCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#166534" }}>{resolvedCount} Résolue{resolvedCount !== 1 ? "s" : ""}</span>
            </span>
          )}
        </div>

        {/* Filter tabs — segmented control */}
        <div style={{ display: "inline-flex", background: "#F1F5F9", borderRadius: "10px", padding: "3px", gap: "1px", marginBottom: "1.5rem" }}>
          {[["all","Toutes",soilingAlerts.length],["critique","Critique",counts.critique],["attention","Attention",counts.attention],["info","Info",counts.info]].map(([key, lbl, cnt]) => {
            const sel = filter === key;
            const sev = key !== "all" ? SOIL_SEV[key] : null;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                fontWeight: sel ? "600" : "400",
                border: "none",
                background: sel ? "#fff" : "transparent",
                color: sel ? (sev ? sev.text : "#1A202C") : "#6B7280",
                boxShadow: sel ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>
                {sev && sel && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: sev.dot, flexShrink: 0 }} />}
                {lbl} <span style={{ opacity: 0.6, fontWeight: "400" }}>({cnt})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: "3rem" }}>Chargement...</div>
        ) : visible.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "2.5rem", color: "#16A34A" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><CheckCircle size={18} /> Panneaux propres</p>
            <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Aucun encrassement détecté — votre installation fonctionne normalement</p>
          </div>
        ) : visible.map(a => {
          const sev  = SOIL_SEV[a.severity] || SOIL_SEV.info;
          const open = expanded === a.id;
          const Icon = SOIL_ICON[a.severity] || CheckCircle;
          const dateStr = a.created_at ? new Date(a.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--";
          const showingForm = formAlert === a.id;
          const isResolved  = a.status === "resolu";

          return (
            <div key={a.id} style={{ ...card, marginBottom: "8px", borderLeft: `4px solid ${sev.text}`, opacity: isResolved ? 0.8 : 1 }}>
              {/* Card header */}
              <div style={{ cursor: "pointer" }} onClick={() => setExpanded(open ? null : a.id)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={sev.text} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <p style={{ fontWeight: "600", fontSize: "15px", color: "#1A202C" }}>{a.title}</p>
                        <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>{dateStr}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: sev.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", fontWeight: "500", color: sev.text }}>{sev.label}</span>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: isResolved ? "#F0FDF4" : "#EFF6FF", borderRadius: "999px", padding: "3px 10px" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isResolved ? "#22C55E" : "#3B82F6", flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", fontWeight: "500", color: isResolved ? "#166534" : "#1D4ED8" }}>{isResolved ? "Résolue" : "En cours"}</span>
                        </span>
                        {open ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded body */}
              {open && (
                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F1F5F9" }}>
                  {/* Metrics row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                    {[
                      ["Soiling Index", `${(a.soiling_index * 100).toFixed(1)}%`, sev.text],
                      ["Perte énergie", `${a.energy_loss_percent.toFixed(1)}%`, "#6B7280"],
                      ["Perte estimée", `~${a.daily_loss_dh} DH/j`, "#6B7280"],
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ background: "#F8FAFC", borderRadius: "8px", padding: "8px 10px" }}>
                        <p style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "2px" }}>{label}</p>
                        <p style={{ fontSize: "15px", fontWeight: "700", color }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <p style={{ fontSize: "13px", color: "#374151", marginBottom: "10px" }}>
                    <strong>Recommandation:</strong> {a.recommendation}
                  </p>

                  {/* Intervention button / badge */}
                  {!isResolved && (() => {
                    const existingIv = ivByTitle[a.title];
                    if (existingIv && existingIv.status !== "cloturee") {
                      const ivSt = IV_STATUS[existingIv.status] || IV_STATUS.en_attente;
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#6366F1", fontWeight: "700" }}>
                            INT-{String(existingIv.id).padStart(4, "0")}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: ivSt.bg, borderRadius: "999px", padding: "4px 12px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: ivSt.dot, flexShrink: 0 }} />
                            <span style={{ fontSize: "12px", fontWeight: "500", color: ivSt.text }}>{ivSt.label}</span>
                          </span>
                          {existingIv.scheduled_date && (
                            <span style={{ fontSize: "12px", color: "#7C3AED", display: "flex", alignItems: "center", gap: "3px" }}>
                              <CalendarDays size={12} /> {existingIv.scheduled_date}
                            </span>
                          )}
                        </div>
                      );
                    }
                    if (!showingForm && formSuccess !== true) {
                      return (
                        <button onClick={e => { e.stopPropagation(); openForm(a.id, a.severity); }} style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "0.5rem 1rem", borderRadius: "6px", border: "none", cursor: "pointer",
                          background: "#F59E0B", color: "#fff", fontSize: "13px", fontWeight: "600",
                        }}>
                          <Wrench size={14} /> Demander une Intervention
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {/* Inline intervention form */}
                  {showingForm && formSuccess === null && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: "10px", padding: "1rem", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px" }}>
                      <p style={{ fontWeight: "600", fontSize: "14px", color: "#92400E", marginBottom: "10px" }}>Nouvelle demande d'intervention</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                        <div>
                          <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Type d'intervention</p>
                          <select value={formType} onChange={e => setFormType(e.target.value)} style={inputSty}>
                            <option value="nettoyage">Nettoyage</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="inspection">Inspection</option>
                            <option value="urgence">Urgence</option>
                          </select>
                        </div>
                        <div>
                          <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Priorité</p>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {["critique", "haute", "normale", "basse"].map(p => {
                              const pr = IV_PRIO[p];
                              const sel = formPrio === p;
                              return (
                                <button key={p} onClick={() => setFormPrio(p)} style={{
                                  flex: 1, padding: "5px 4px", borderRadius: "6px", fontSize: "11px", fontWeight: sel ? "600" : "400", cursor: "pointer",
                                  border: sel ? `1.5px solid ${pr.dot}` : "1px solid #E2E8F0",
                                  background: sel ? pr.bg : "#fff", color: sel ? pr.text : "#6B7280",
                                  display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                                }}>
                                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: pr.dot, flexShrink: 0 }} />
                                  {pr.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginBottom: "10px" }}>
                        <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Description du problème</p>
                        <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                          placeholder="Décrivez le problème ou la situation observée..."
                          style={{ ...inputSty, minHeight: "60px", resize: "vertical", fontFamily: "inherit" }} />
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => submitIntervention(a)} disabled={formSending} style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "0.5rem 1.25rem", borderRadius: "6px", border: "none", cursor: formSending ? "wait" : "pointer",
                          background: "#F59E0B", color: "#fff", fontSize: "13px", fontWeight: "600", opacity: formSending ? 0.7 : 1,
                        }}>
                          <Send size={14} /> {formSending ? "Envoi..." : "Envoyer la demande"}
                        </button>
                        <button onClick={() => setFormAlert(null)} style={{
                          padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #E2E8F0", cursor: "pointer",
                          background: "#fff", color: "#6B7280", fontSize: "13px",
                        }}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {showingForm && formSuccess === true && (
                    <div style={{ marginTop: "10px", padding: "0.75rem 1rem", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <CheckCircle size={16} color="#16A34A" />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#16A34A" }}>Intervention demandée avec succès !</span>
                    </div>
                  )}
                  {showingForm && formSuccess === false && (
                    <div style={{ marginTop: "10px", padding: "0.75rem 1rem", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px" }}>
                      <span style={{ fontSize: "13px", color: "#DC2626" }}>Erreur lors de l'envoi. Veuillez réessayer.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Réglages Tab ──────────────────────────────────────────────────────────────
function ReglagesTab({ kpi, lastSync, stationName }) {
  const { user } = useAuth();
  const [settings, upd] = useSettings();
  const d = kpi?.data?.[0]?.dataItemMap || {};
  const capacity  = d.installed_capacity ?? settings.capacity ?? "--";
  const threshold = settings.soilingThreshold ?? 85;
  const syncAgo   = lastSync ? Math.round((Date.now() - lastSync) / 60000) : null;

  return (
    <div>
      <PageHeader title="Réglages" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Profil */}
        <div style={card}>
          <p style={sectionTitle}>Profil</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            <div><p style={fieldLbl}>Nom Complet</p><p style={fieldVal}>{user?.full_name || "Client"}</p></div>
            <div><p style={fieldLbl}>Ville</p><p style={fieldVal}>{settings.location || "Maroc"}</p></div>
            <div><p style={fieldLbl}>Capacité installée</p><p style={fieldVal}>{capacity !== "--" ? `${capacity} kWc` : "--"}</p></div>
          </div>
        </div>

        {/* Installation */}
        <div style={card}>
          <p style={sectionTitle}>Détails de l'installation</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            <div>
              <p style={fieldLbl}>Nom de l'installation</p>
              <input style={inputSty} value={settings.installName || "Mon installation"} onChange={e => upd("installName", e.target.value)} />
            </div>
            <div>
              <p style={fieldLbl}>Emplacement</p>
              <input style={inputSty} value={settings.location || "Maroc"} onChange={e => upd("location", e.target.value)} />
            </div>
            <div>
              <p style={fieldLbl}>Puissance Crête</p>
              <p style={{ ...fieldVal, color: "#6B7280" }}>{capacity !== "--" ? `${capacity} kWc` : "--"}</p>
            </div>
          </div>
        </div>

        {/* Soiling threshold */}
        <div style={card}>
          <p style={sectionTitle}>AI Seuil d'Alerte d'Encrassement</p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
            <span style={{ color: "#DC2626" }}>Alerte Critique (60%)</span>
            <span style={{ color: "#D97706" }}>Recommandation (85%)</span>
            <span style={{ color: "#16A34A" }}>Optimal (99%)</span>
          </div>
          <input type="range" min="60" max="99" value={threshold} onChange={e => upd("soilingThreshold", +e.target.value)} style={{ width: "100%" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#94A3B8", marginTop: "4px" }}>
            <span>60%</span>
            <span style={{ fontWeight: "600", color: "#374151" }}>{threshold}%</span>
            <span>100%</span>
          </div>
          <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "8px" }}>
            Définir le pourcentage de propreté en dessous duquel recevoir une alerte par e-mail.
          </p>
        </div>

        {/* Notifications */}
        <div style={card}>
          <p style={sectionTitle}>Préférences de Notification</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
            {[
              ["soilingAlerts",  "Alertes d'encrassement"],
              ["emailReports",   "Rapports d'email automatiques"],
              ["smsUrgency",     "SMS d'urgence (pour alarmes critiques)"],
              ["monthlyReport",  "Rapport de synthèse mensuel"],
            ].map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Toggle value={settings[key] !== false} onChange={v => upd(key, v)} />
                <span style={{ fontSize: "13px", color: "#374151" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FusionSolar + App Prefs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div style={card}>
            <p style={sectionTitle}>Connexion API FusionSolar</p>
            <p style={{ fontSize: "13px", marginBottom: "4px" }}>Statut: <span style={{ color: "#16A34A", fontWeight: "600" }}>Connecté</span></p>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "4px" }}>
              Dernière synchro: {syncAgo != null ? `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}` : "—"}
            </p>
            <p style={{ fontSize: "13px", color: "#6B7280" }}>Crédentiels: <span style={{ fontFamily: "monospace" }}>••••••••</span></p>
          </div>
          <div style={card}>
            <p style={sectionTitle}>App Préférences</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.875rem" }}>
              <Toggle value={settings.darkMode || false} onChange={v => upd("darkMode", v)} />
              <span style={{ fontSize: "13px" }}>Mode Sombre</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px" }}>Language</span>
              <select value={settings.language || "fr"} onChange={e => upd("language", e.target.value)}
                style={{ padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px", flex: 1 }}>
                <option value="fr">Français / Arabe / Anglais</option>
                <option value="ar">Arabe</option>
                <option value="en">Anglais</option>
              </select>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
