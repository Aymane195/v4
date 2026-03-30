import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SoilingGauge from "../components/SoilingGauge";
import { Home, BarChart3, Bell, Settings, LogOut, RefreshCw, Sun, Zap, Plug, Coins, Leaf, Thermometer, AlertTriangle, Flame, Radio, CheckCircle, Wrench, Send, Clock, CalendarDays, ChevronDown, ChevronUp, ClipboardList, MapPin, Users, ArrowRight, Plus, Lock, Eye, EyeOff, Phone, Mail, User, Shield, Wifi, Grid, BatteryCharging } from "lucide-react";
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

// â??â?? Shared styles â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
const card = { background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "1.25rem" };
const sectionTitle = { fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "1rem" };
const fieldLbl = { fontSize: "12px", color: "#6B7280", marginBottom: "4px" };
const fieldVal = { fontSize: "15px", fontWeight: "500", color: "#1A202C" };
const inputSty = { display: "block", width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "14px", color: "#1A202C", background: "#F8FAFC", boxSizing: "border-box", outline: "none" };

// â??â?? Live pill (station name + clock + EN DIRECT) â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
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

// â??â?? Page header â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
function PageHeader({ title, stationName, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C", margin: 0 }}>{title}</h1>
      {right || <LivePill stationName={stationName} />}
    </div>
  );
}

// â??â?? Toggle switch â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: "44px", height: "24px", borderRadius: "999px", background: value ? "#3B82F6" : "#CBD5E0", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: "2px", left: value ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );
}

// â??â?? Root dashboard â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
export default function ClientDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("accueil");
  const [kpi, setKpi] = useState(null);
  const [soiling, setSoiling] = useState(null);
  const [stations, setStations] = useState([]);
  const [deviceKpi, setDeviceKpi] = useState(null);
  const [alarmCount, setAlarmCount] = useState(0);
  const [soilingAlerts, setSoilingAlerts] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [alertForIntervention, setAlertForIntervention] = useState(null);

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
        const alerts = al.value.data || [];
        setSoilingAlerts(alerts);
        setAlarmCount(alerts.filter(a => a.status !== "resolu").length);
      }
      // Fetch soiling gauge in the same cycle so it stays consistent with alerts
      const code = s.status === "fulfilled" && s.value.data?.[0]?.station_code;
      if (code) {
        try { const r = await api.get(`/soiling/station/${code}`); setSoiling(r.data); } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadMain();
    const iv = setInterval(loadMain, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadMain]);

  const stationName = stations[0]?.station_name || stations[0]?.station_code || "Mon installation";

  const NAV = [
    { id: "accueil",       label: "Accueil",        icon: <Home size={18} /> },
    { id: "analyses",      label: "Analyses",       icon: <BarChart3 size={18} /> },
    { id: "alertes",       label: "Alertes",        icon: <Bell size={18} />, badge: alarmCount },
    { id: "interventions", label: "Interventions",  icon: <Wrench size={18} /> },
    { id: "reglages",      label: "Réglages",       icon: <Settings size={18} /> },
  ];

  return (
    <>
      <style>{`
        body { margin: 0; background: #F0F4F8; font-family: 'Segoe UI', system-ui, sans-serif; }
        input[type=range] { accent-color: #3B82F6; }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* â??â?? Sidebar â??â?? */}
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

        {/* â??â?? Main content â??â?? */}
        <main style={{ flex: 1, minHeight: "100vh", background: "#F0F4F8", overflowY: "auto" }}>
          {tab === "accueil"       && <AccueilTab  kpi={kpi} soiling={soiling} alarmCount={alarmCount} soilingAlerts={soilingAlerts} stationName={stationName} onAlertes={() => setTab("alertes")} />}
          {tab === "analyses"      && <AnalysesTab kpi={kpi} deviceKpi={deviceKpi} stations={stations} stationName={stationName} />}
          {tab === "alertes"       && <AlertesTab  stationName={stationName} stations={stations} soilingAlerts={soilingAlerts} onRequestIntervention={(alert) => { setAlertForIntervention(alert); setTab("interventions"); }} />}
          {tab === "interventions" && <InterventionsTab stationName={stationName} stations={stations} alertForIntervention={alertForIntervention} onClearAlert={() => setAlertForIntervention(null)} />}
          {tab === "reglages"      && <ReglagesTab kpi={kpi} lastSync={lastSync} stationName={stationName} stations={stations} />}
        </main>

      </div>
    </>
  );
}

// â??â?? Accueil Tab â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
function AccueilTab({ kpi, soiling, alarmCount, soilingAlerts = [], stationName, onAlertes }) {
  const d = kpi?.data?.[0]?.dataItemMap || {};
  const dayEnergy    = d.day_power ?? null;
  const totalEnergy  = d.total_power ?? null;
  const monthSavings = d.month_power != null ? Math.round(d.month_power * 1.5) : null;
  const co2Total     = d.reduce_carbon ?? (totalEnergy != null ? Math.round(totalEnergy * 0.233) : null);
  const homeEnergy   = d.day_use_energy ?? null;
  const gridPower    = d.use_power ?? null;
  const dayGrid      = d.day_on_grid_energy ?? null;
  const soilingIdx   = soiling?.soiling_index ?? 0;

  // Only show active (non-resolved) critique and attention alerts
  const activeAlerts = soilingAlerts.filter(a => a.status !== "resolu");

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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <PageHeader title="Accueil" stationName={stationName} />
      <div style={{ flex: 1, padding: "0 1.5rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem", minHeight: 0 }}>

        {/* Soiling alert banners â?? compact */}
        {activeAlerts.map(a => {
          const isCritique = a.severity === "critique";
          return (
            <div key={a.id} onClick={onAlertes} style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px",
              borderRadius: "10px", cursor: "pointer",
              background: isCritique ? "linear-gradient(135deg, #FEF2F2, #FEE2E2)" : "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
              border: `1px solid ${isCritique ? "#FECACA" : "#FDE68A"}`,
            }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                background: isCritique ? "#DC2626" : "#F59E0B",
              }}>
                {isCritique ? <AlertTriangle size={16} color="#fff" /> : <Flame size={16} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "#fff", borderRadius: "3px", padding: "1px 6px", background: isCritique ? "#DC2626" : "#D97706" }}>
                    {isCritique ? "Critique" : "Attention"}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: isCritique ? "#991B1B" : "#92400E" }}>{a.title}</span>
                </div>
                <p style={{ fontSize: "11px", color: isCritique ? "#B91C1C" : "#B45309", margin: 0 }}>
                  Perte : {fmt(a.energy_loss_percent, 1)}% &middot; ~{fmt(a.daily_loss_dh, 1)} DH/jour
                </p>
              </div>
              <ChevronDown size={16} color={isCritique ? "#DC2626" : "#D97706"} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
            </div>
          );
        })}

        {/* Main row: Gauge + Production + Flux */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.6rem", flex: 1, minHeight: 0 }}>

          {/* Left: Soiling gauge */}
          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0.6rem 1.25rem" }}>
            <p style={{ ...sectionTitle, marginBottom: "0.25rem" }}>Indice de Propreté (IA)</p>
            <SoilingGauge index={soilingIdx} size={200} />
          </div>

          {/* Right: Production + Flux stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minHeight: 0 }}>
            {/* Production Actuelle */}
            <div style={{ ...card, transition: "border-color 0.4s", borderColor: pulse ? "#6366F1" : "#E2E8F0", padding: "0.75rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <p style={sectionTitle}>Production Actuelle</p>
                <span style={{ background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0", borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <RefreshCw size={10} /> Live
                </span>
              </div>
              <p style={{ fontSize: "2rem", fontWeight: "800", color: "#6366F1", lineHeight: 1 }}>
                {livePower != null ? fmt(livePower, 1) : "--"}
                <span style={{ fontSize: "1rem", fontWeight: "500", color: "#94A3B8", marginLeft: "6px" }}>kW</span>
              </p>
            </div>

            {/* Flux d'Énergie */}
            <div style={{ ...card, flex: 1, padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <p style={{ ...sectionTitle, marginBottom: "0.25rem" }}>Flux d'Énergie</p>
              <EnergyFlow power={livePower} dayEnergy={dayEnergy} homeEnergy={homeEnergy} gridPower={gridPower} dayGrid={dayGrid} />
            </div>
          </div>
        </div>

        {/* Bottom 4 KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
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
        <span style={{ color: "#CBD5E0", fontSize: "10px", marginLeft: "1px" }}>â?¶</span>
      </div>
      <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{bottom} kW</span>
    </div>
  );

  const BiArrow = ({ toGrid, fromGrid }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "0 4px" }}>
      {/* Maison â?? Réseau (injection) */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ fontSize: "11px", fontWeight: "600", color: "#16A34A", whiteSpace: "nowrap" }}>{toGrid} kW</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, height: "2px", background: "#86EFAC" }} />
          <span style={{ color: "#16A34A", fontSize: "10px", marginLeft: "1px" }}>&#9654;</span>
        </div>
      </div>
      {/* Réseau â?? Maison (consommation) */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "4px" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <span style={{ color: "#6366F1", fontSize: "10px", marginRight: "1px" }}>&#9664;</span>
          <div style={{ flex: 1, height: "2px", background: "#C7D2FE" }} />
        </div>
        <span style={{ fontSize: "11px", fontWeight: "600", color: "#6366F1", whiteSpace: "nowrap" }}>{fromGrid} kW</span>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", paddingTop: "0.25rem" }}>
      <Node icon={<Sun size={24} color="#F59E0B" />} label="Panneaux Solaires" />
      <Arrow top={fmt(power, 1)} bottom={fmt(dayEnergy, 1)} />
      <Node icon={<Home size={24} color="#16A34A" />} label="Maison" />
      <BiArrow toGrid={fmt(dayGrid, 1)} fromGrid={fmt(gridPower, 1)} />
      <Node icon={<Plug size={24} color="#6B7280" />} label="Réseau" />
    </div>
  );
}

// â??â?? Demo chart data generator (client-side fallback) â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
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

// â??â?? Analyses Tab â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
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

  // Load chart data â?? try API first, fallback to demo generation
  useEffect(() => {
    if (!stationCode) return;
    let cancelled = false;
    setLoading(true);

    async function loadFromApi() {
      const now   = new Date();
      const yr    = now.getFullYear();
      const mo    = now.getMonth() + 1; // 1-12
      let data = [];
      try {
        if (period === "jour") {
          // Last 7 days — 7 parallel daily calls (manageable load)
          data = await Promise.all(Array.from({ length: 7 }, (_, i) => {
            const dt = new Date(now); dt.setDate(dt.getDate() - (6 - i));
            const str = dt.toISOString().slice(0, 10);
            return api.get(`/client/kpi/daily?date=${str}`)
              .then(r => { const kp = Array.isArray(r.data) ? r.data[0] : r.data; return { name: dt.toLocaleDateString("fr-FR", { weekday: "short" }), val: kp?.data?.[0]?.dataItemMap?.day_power ?? 0 }; })
              .catch(() => ({ name: "", val: 0 }));
          }));
        } else if (period === "mois") {
          // Daily bars for the current month — backend reads from DB (collector) first,
          // falls back to sequential FusionSolar calls for missing days
          const r = await api.get(`/client/kpi/month-days?year=${yr}&month=${mo}`);
          data = (r.data || []).map(item => ({ name: String(item.day), val: item.production_kwh || 0 }));
        } else {
          // Année view — last 12 months via dedicated history endpoint (sequential, 1h cache)
          const r = await api.get(`/client/kpi/history`);
          data = (r.data?.historique || []).map(item => ({
            name: item.mois.slice(5),   // "2026-03" → "03"
            val: item.production_kwh || 0,
          }));
        }
      } catch { data = []; }

      if (cancelled) return;
      const sum = data.reduce((s, r) => s + (r.val || 0), 0);
      return sum > 0 ? data : null;
    }

    loadFromApi().then(apiData => {
      if (cancelled) return;
      setChartData(apiData || []);
      setLoading(false);
    });

    return () => { cancelled = true; };
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

// â??â?? Intervention status helpers â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
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

// â??â?? Alertes Tab â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
const SOIL_SEV = {
  critique: { label: "Critique", dot: "#DC2626", text: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  attention: { label: "Attention", dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB", border: "#FED7AA" },
};
const SOIL_SEV_TO_PRIO = { critique: "critique", attention: "haute" };
const SOIL_ICON = { critique: AlertTriangle, attention: Flame };

function AlertesTab({ stationName, stations, soilingAlerts = [], onRequestIntervention }) {
  const [filter, setFilter]               = useState("all");
  const [expanded, setExpanded]           = useState(null);

  // Counts per severity
  const counts = { critique: 0, attention: 0 };
  soilingAlerts.forEach(a => { if (counts[a.severity] != null) counts[a.severity]++; });
  const visible = filter === "all" ? soilingAlerts : soilingAlerts.filter(a => a.severity === filter);
  const resolvedCount = soilingAlerts.filter(a => a.status === "resolu").length;

  return (
    <div>
      <PageHeader title="Alertes" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem" }}>

        {/* â??â?? Soiling alerts section â??â?? */}
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

        {/* Filter tabs â?? segmented control */}
        <div style={{ display: "inline-flex", background: "#F1F5F9", borderRadius: "10px", padding: "3px", gap: "1px", marginBottom: "1.5rem" }}>
          {[["all","Toutes",soilingAlerts.length],["critique","Critique",counts.critique],["attention","Attention",counts.attention]].map(([key, lbl, cnt]) => {
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

        {visible.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "2.5rem", color: "#16A34A" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><CheckCircle size={18} /> Panneaux propres</p>
            <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Aucun encrassement détecté â?? votre installation fonctionne normalement</p>
          </div>
        ) : visible.map(a => {
          const sev  = SOIL_SEV[a.severity] || SOIL_SEV.attention;
          const open = expanded === a.id;
          const Icon = SOIL_ICON[a.severity] || Flame;
          const dateStr = a.created_at ? new Date(a.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--";
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

                  {/* Redirect to Interventions tab */}
                  {!isResolved && (
                    <button onClick={e => { e.stopPropagation(); onRequestIntervention(a); }} style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "0.5rem 1rem", borderRadius: "8px", border: "none", cursor: "pointer",
                      background: "#F59E0B", color: "#fff", fontSize: "13px", fontWeight: "600",
                    }}>
                      <Wrench size={14} /> Demander une Intervention <ArrowRight size={14} />
                    </button>
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

// â??â?? Demo teams â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
const DEMO_TEAMS = [
  { id: 1, name: "Équipe Casablanca Centre",  city: "Casablanca", distance: "12 km", eta: "~30 min", rating: 4.8, jobs: 142, available: true },
  { id: 2, name: "Équipe Mohammedia",         city: "Mohammedia", distance: "28 km", eta: "~45 min", rating: 4.6, jobs: 89,  available: true },
  { id: 3, name: "Équipe Ain Sebaa",          city: "Casablanca", distance: "8 km",  eta: "~20 min", rating: 4.9, jobs: 203, available: false },
  { id: 4, name: "Équipe Berrechid",          city: "Berrechid",  distance: "52 km", eta: "~1h 10",  rating: 4.5, jobs: 67,  available: true },
];

// â??â?? Interventions Tab â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
function InterventionsTab({ stationName, stations, alertForIntervention, onClearAlert }) {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [expanded, setExpanded]           = useState(null);
  const [ivFilter, setIvFilter]           = useState("all");

  // New intervention form state
  const [showForm, setShowForm]       = useState(false);
  const [formType, setFormType]       = useState("nettoyage");
  const [formDesc, setFormDesc]       = useState("");
  const [formTeam, setFormTeam]       = useState(null);
  const [formSending, setFormSending] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);

  // Alert context â?? auto-open form when redirected from AlertesTab
  const alertCtx = alertForIntervention;
  const autoPriority = alertCtx ? (alertCtx.severity === "critique" ? "critique" : "haute") : "normale";

  useEffect(() => {
    api.get("/client/interventions")
      .then(res => setInterventions(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (alertCtx) {
      setShowForm(true);
      setFormType(alertCtx.severity === "critique" ? "urgence" : "nettoyage");
      setFormDesc("");
      setFormTeam(null);
      setFormSuccess(null);
    }
  }, [alertCtx]);

  function openNewForm() {
    if (onClearAlert) onClearAlert();
    setShowForm(true);
    setFormType("nettoyage");
    setFormDesc("");
    setFormTeam(null);
    setFormSuccess(null);
  }

  function closeForm() {
    setShowForm(false);
    if (onClearAlert) onClearAlert();
  }

  async function submitIntervention() {
    setFormSending(true);
    try {
      const body = {
        station_code: stations?.[0]?.station_code || alertCtx?.station_code || "UNKNOWN",
        station_name: stationName,
        alarm_name: alertCtx?.title || "Demande manuelle",
        alarm_severity: alertCtx?.severity === "critique" ? 1 : alertCtx?.severity === "attention" ? 2 : 3,
        type: formType,
        description: formDesc || null,
        priority: autoPriority,
      };
      await api.post("/client/interventions", body);
      setFormSuccess(true);
      const res = await api.get("/client/interventions");
      setInterventions(res.data || []);
      setTimeout(() => { setShowForm(false); setFormSuccess(null); if (onClearAlert) onClearAlert(); }, 2500);
    } catch {
      setFormSuccess(false);
    } finally {
      setFormSending(false);
    }
  }

  const counts = { pending: 0, active: 0, done: 0 };
  interventions.forEach(iv => {
    if (iv.status === "en_attente") counts.pending++;
    else if (["acceptee", "planifiee", "en_cours"].includes(iv.status)) counts.active++;
    else counts.done++;
  });

  const selectedTeam = DEMO_TEAMS.find(t => t.id === formTeam);

  return (
    <div>
      <PageHeader title="Interventions" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem" }}>

        {/* Summary counters â?? clickable filters */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem" }}>
          {[
            { key: "pending", label: "En attente", count: counts.pending, dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB" },
            { key: "active",  label: "En cours",   count: counts.active,  dot: "#3B82F6", text: "#1D4ED8", bg: "#EFF6FF" },
            { key: "done",    label: "Terminées",  count: counts.done,    dot: "#22C55E", text: "#166534", bg: "#F0FDF4" },
          ].map(s => {
            const active = ivFilter === s.key;
            return (
              <div key={s.key}
                onClick={() => setIvFilter(active ? "all" : s.key)}
                style={{
                  ...card, flex: 1, display: "flex", alignItems: "center", gap: "12px", padding: "1rem 1.25rem",
                  cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
                  border: active ? `2px solid ${s.dot}` : "1px solid #E2E8F0",
                  boxShadow: active ? `0 0 0 3px ${s.dot}22` : "none",
                }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.dot }} />
                </div>
                <div>
                  <p style={{ fontSize: "1.4rem", fontWeight: "700", color: s.text }}>{s.count}</p>
                  <p style={{ fontSize: "12px", color: active ? s.text : "#6B7280", fontWeight: active ? "600" : "400" }}>{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* New intervention button */}
        {!showForm && (
          <button onClick={openNewForm} style={{
            display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.25rem",
            padding: "0.65rem 1.25rem", borderRadius: "8px", border: "1px dashed #D1D5DB", cursor: "pointer",
            background: "#fff", color: "#6366F1", fontSize: "14px", fontWeight: "600", width: "100%", justifyContent: "center",
          }}>
            <Plus size={16} /> Nouvelle demande d'intervention
          </button>
        )}

        {/* â??â?? New intervention form â??â?? */}
        {showForm && formSuccess === null && (
          <div style={{ ...card, marginBottom: "1.25rem", border: "2px solid #6366F1", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <p style={{ fontWeight: "700", fontSize: "16px", color: "#1A202C", display: "flex", alignItems: "center", gap: "8px" }}>
                <Wrench size={18} color="#6366F1" /> Nouvelle demande d'intervention
              </p>
              {alertCtx && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: "600",
                  padding: "4px 12px", borderRadius: "6px",
                  background: alertCtx.severity === "critique" ? "#FEF2F2" : "#FFFBEB",
                  color: alertCtx.severity === "critique" ? "#DC2626" : "#D97706",
                  border: `1px solid ${alertCtx.severity === "critique" ? "#FECACA" : "#FDE68A"}`,
                }}>
                  <AlertTriangle size={12} /> Suite à alerte {alertCtx.severity}
                </span>
              )}
            </div>

            {/* Alert context banner */}
            {alertCtx && (
              <div style={{
                background: alertCtx.severity === "critique" ? "#FEF2F2" : "#FFFBEB",
                border: `1px solid ${alertCtx.severity === "critique" ? "#FECACA" : "#FDE68A"}`,
                borderRadius: "8px", padding: "12px 16px", marginBottom: "1.25rem",
              }}>
                <p style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "4px" }}>{alertCtx.title}</p>
                <p style={{ fontSize: "12px", color: "#6B7280" }}>
                  Soiling Index: {(alertCtx.soiling_index * 100).toFixed(1)}% &middot; Perte: ~{alertCtx.daily_loss_dh} DH/jour
                </p>
              </div>
            )}

            {/* Type + Priority (auto) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px", fontWeight: "500" }}>Type d'intervention</p>
                <select value={formType} onChange={e => setFormType(e.target.value)} style={inputSty}>
                  <option value="nettoyage">Nettoyage</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inspection">Inspection</option>
                  <option value="urgence">Urgence</option>
                </select>
              </div>
              <div>
                <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px", fontWeight: "500" }}>Priorité</p>
                <div style={{ ...inputSty, display: "flex", alignItems: "center", gap: "8px", background: "#F8FAFC", cursor: "default" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, background: IV_PRIO[autoPriority]?.dot || "#94A3B8" }} />
                  <span style={{ fontWeight: "600", color: IV_PRIO[autoPriority]?.text || "#374151" }}>
                    {IV_PRIO[autoPriority]?.label || "Normale"}
                  </span>
                  {alertCtx && <span style={{ fontSize: "11px", color: "#94A3B8", marginLeft: "auto" }}>Auto</span>}
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: "1.25rem" }}>
              <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "6px", fontWeight: "500" }}>Description du problème</p>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder="Décrivez le problème ou la situation observée..."
                style={{ ...inputSty, minHeight: "70px", resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* Team selection */}
            <div style={{ marginBottom: "1.25rem" }}>
              <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "8px", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px" }}>
                <Users size={14} /> Sélectionner une équipe
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {DEMO_TEAMS.map(team => {
                  const sel = formTeam === team.id;
                  return (
                    <div key={team.id}
                      onClick={() => team.available && setFormTeam(team.id)}
                      style={{
                        ...card, padding: "14px", cursor: team.available ? "pointer" : "not-allowed",
                        border: sel ? "2px solid #6366F1" : "1px solid #E2E8F0",
                        background: !team.available ? "#F9FAFB" : sel ? "#EEF2FF" : "#fff",
                        opacity: team.available ? 1 : 0.55,
                        transition: "border-color 0.15s, background 0.15s",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <p style={{ fontWeight: "600", fontSize: "14px", color: sel ? "#4338CA" : "#1A202C" }}>{team.name}</p>
                          <p style={{ fontSize: "12px", color: "#6B7280", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                            <MapPin size={11} /> {team.city}
                          </p>
                        </div>
                        {!team.available && (
                          <span style={{ fontSize: "10px", fontWeight: "600", color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: "4px" }}>Indisponible</span>
                        )}
                        {team.available && sel && <CheckCircle size={18} color="#6366F1" />}
                      </div>
                      <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#6B7280" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><MapPin size={11} color="#6366F1" /> {team.distance}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={11} color="#6366F1" /> {team.eta}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><span style={{ color: "#F59E0B" }}>&#9733;</span> {team.rating}</span>
                        <span style={{ color: "#94A3B8" }}>{team.jobs} missions</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected team summary */}
            {selectedTeam && (
              <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: "8px", padding: "12px 16px", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "12px" }}>
                <Users size={18} color="#6366F1" />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "13px", fontWeight: "600", color: "#4338CA" }}>{selectedTeam.name}</p>
                  <p style={{ fontSize: "12px", color: "#6B7280" }}>Estimation d'arrivée : {selectedTeam.eta} &middot; Distance : {selectedTeam.distance}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={submitIntervention} disabled={formSending || !formTeam}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "0.6rem 1.5rem", borderRadius: "8px", border: "none",
                  cursor: (formSending || !formTeam) ? "not-allowed" : "pointer",
                  background: (!formTeam) ? "#D1D5DB" : "#6366F1", color: "#fff",
                  fontSize: "14px", fontWeight: "600", opacity: formSending ? 0.7 : 1,
                }}>
                <Send size={14} /> {formSending ? "Envoi en cours..." : "Envoyer la demande"}
              </button>
              <button onClick={closeForm} style={{
                padding: "0.6rem 1.25rem", borderRadius: "8px", border: "1px solid #E2E8F0",
                cursor: "pointer", background: "#fff", color: "#6B7280", fontSize: "14px",
              }}>Annuler</button>
            </div>
          </div>
        )}

        {/* Success / Error messages */}
        {showForm && formSuccess === true && (
          <div style={{ ...card, marginBottom: "1.25rem", padding: "1.25rem", background: "#F0FDF4", border: "1px solid #BBF7D0", display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle size={20} color="#16A34A" />
            <div>
              <p style={{ fontSize: "14px", fontWeight: "600", color: "#16A34A" }}>Intervention demandée avec succès !</p>
              <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>L'équipe sera notifiée et vous recevrez une confirmation.</p>
            </div>
          </div>
        )}
        {showForm && formSuccess === false && (
          <div style={{ ...card, marginBottom: "1.25rem", padding: "1rem", background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <p style={{ fontSize: "13px", color: "#DC2626" }}>Erreur lors de l'envoi. Veuillez réessayer.</p>
          </div>
        )}

        {/* Intervention list */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: "3rem" }}>Chargement...</div>
        ) : interventions.length === 0 && !showForm ? (
          <div style={{ ...card, textAlign: "center", padding: "2.5rem" }}>
            <ClipboardList size={28} color="#94A3B8" style={{ marginBottom: "8px" }} />
            <p style={{ fontSize: "1rem", fontWeight: "600", color: "#6B7280" }}>Aucune intervention</p>
            <p style={{ fontSize: "13px", color: "#94A3B8", marginTop: "4px" }}>Vos demandes d'intervention apparaîtront ici.</p>
          </div>
        ) : (ivFilter === "all" ? interventions : interventions.filter(iv => {
          if (ivFilter === "pending") return iv.status === "en_attente";
          if (ivFilter === "active") return ["acceptee", "planifiee", "en_cours"].includes(iv.status);
          return ["terminee", "cloturee"].includes(iv.status);
        })).map((iv, idx) => {
          const st = IV_STATUS[iv.status] || IV_STATUS.en_attente;
          const pr = IV_PRIO[iv.priority] || IV_PRIO.normale;
          const isOpen = expanded === idx;
          return (
            <div key={iv.id} style={{ ...card, marginBottom: "8px", borderLeft: `4px solid ${pr.text}`, padding: "0.85rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : idx)}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
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
                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F1F5F9", fontSize: "13px", color: "#374151" }}>
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
    </div>
  );
}

// â??â?? WhatsApp Registration Section â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
const WA_ICON = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

function WhatsAppSection({ phone: savedPhone }) {
  const [phone, setPhone] = useState(savedPhone || "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [step, setStep] = useState(savedPhone ? 2 : 1); // 1 = join sandbox, 2 = enter number
  const isRegistered = !!savedPhone;

  async function handleRegister(e) {
    e.preventDefault();
    const cleaned = phone.replace(/\s/g, "");
    if (!cleaned) { setMsg({ type: "error", text: "Veuillez entrer votre numéro WhatsApp" }); return; }
    setLoading(true); setMsg({ type: "", text: "" });
    try {
      const res = await api.post("/auth/whatsapp-register", { phone: cleaned });
      setMsg({ type: "success", text: res.data.message });
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.detail || "Erreur lors de l'enregistrement" });
    } finally { setLoading(false); }
  }

  return (
    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d={WA_ICON}/></svg>
        </div>
        <div>
          <p style={{ fontSize: "14px", fontWeight: "600", color: "#1A202C", margin: 0 }}>Assistant SolarAI sur WhatsApp</p>
          <p style={{ fontSize: "12px", color: "#6B7280", margin: "2px 0 0" }}>
            Recevez vos alertes et consultez vos données solaires directement sur WhatsApp
          </p>
        </div>
      </div>

      {msg.text && (
        <div style={{
          padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "13px", marginBottom: "0.75rem",
          background: msg.type === "success" ? "#DCFCE7" : "#FEF2F2",
          border: `1px solid ${msg.type === "success" ? "#86EFAC" : "#FECACA"}`,
          color: msg.type === "success" ? "#16A34A" : "#DC2626",
        }}>{msg.text}</div>
      )}

      {/* Step 1: Join sandbox */}
      {step === 1 && !isRegistered && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "1rem", marginBottom: "0.75rem" }}>
            <p style={{ fontSize: "13px", fontWeight: "600", color: "#374151", margin: "0 0 8px" }}>
              Étape 1 : Activez le service WhatsApp
            </p>
            <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 10px", lineHeight: 1.5 }}>
              Avant de recevoir les alertes, vous devez d'abord activer le service en envoyant un message sur WhatsApp :
            </p>
            <ol style={{ fontSize: "13px", color: "#374151", margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8 }}>
              <li>Ouvrez WhatsApp sur votre téléphone</li>
              <li>Envoyez le message <strong style={{ fontFamily: "monospace", background: "#F3F4F6", padding: "2px 6px", borderRadius: "4px" }}>join</strong> au numéro <strong style={{ fontFamily: "monospace", background: "#F3F4F6", padding: "2px 6px", borderRadius: "4px" }}>+1 415 523 8886</strong></li>
              <li>Attendez la confirmation, puis cliquez sur "Suivant" ci-dessous</li>
            </ol>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <a href="https://wa.me/14155238886?text=join" target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px",
                background: "#25D366", color: "#fff", border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: "600", cursor: "pointer", textDecoration: "none",
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d={WA_ICON}/></svg>
              Ouvrir WhatsApp
            </a>
            <button type="button" onClick={() => setStep(2)} style={{
              padding: "10px 20px", background: "#fff", border: "1px solid #BBF7D0", borderRadius: "8px",
              fontSize: "14px", fontWeight: "600", color: "#16A34A", cursor: "pointer",
            }}>
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Enter phone number */}
      {(step === 2 || isRegistered) && (
        <>
          {!isRegistered && (
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "13px", fontWeight: "600", color: "#374151", margin: "0 0 4px" }}>
                Étape 2 : Entrez votre numéro WhatsApp
              </p>
              <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                Entrez le même numéro que vous avez utilisé pour envoyer "join".
              </p>
            </div>
          )}
          <form onSubmit={handleRegister} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: "320px" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#6B7280" }}>+</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="212600000001"
                style={{
                  width: "100%", padding: "10px 12px 10px 26px", border: "1px solid #BBF7D0", borderRadius: "8px",
                  fontSize: "14px", color: "#1A202C", background: "#fff", outline: "none", boxSizing: "border-box",
                  fontFamily: "monospace", letterSpacing: "0.5px",
                }}
              />
            </div>
            <button type="submit" disabled={loading} style={{
              display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px",
              background: "#25D366", color: "#fff", border: "none", borderRadius: "8px",
              fontSize: "14px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              opacity: loading ? 0.7 : 1,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d={WA_ICON}/></svg>
              {loading ? "Envoi..." : isRegistered ? "Mettre à jour" : "Activer WhatsApp"}
            </button>
          </form>

          {!isRegistered && step === 2 && (
            <button type="button" onClick={() => setStep(1)} style={{
              marginTop: "8px", background: "none", border: "none", color: "#6B7280", fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline",
            }}>
              Retour à l'étape 1
            </button>
          )}
        </>
      )}

      {isRegistered && (
        <p style={{ fontSize: "12px", color: "#16A34A", marginTop: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
          <CheckCircle size={14} /> Numéro enregistré : {savedPhone}
        </p>
      )}
    </div>
  );
}

// â??â?? Réglages Tab â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??â??
function ReglagesTab({ kpi, lastSync, stationName, stations }) {
  const { user } = useAuth();
  const [settings, upd] = useSettings();
  const d = kpi?.data?.[0]?.dataItemMap || {};
  // installed_capacity: try realtime KPI first, then station list metadata, then local settings
  const capacity = d.installed_capacity ?? stations?.[0]?.installed_capacity ?? settings.capacity ?? "--";
  const syncAgo   = lastSync ? Math.round((Date.now() - lastSync) / 60000) : null;

  // Change password state
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwShow, setPwShow] = useState(false);
  const [pwMsg, setPwMsg]   = useState({ type: "", text: "" });
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.newPw.length < 6) { setPwMsg({ type: "error", text: "Le nouveau mot de passe doit contenir au moins 6 caracteres" }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: "error", text: "Les mots de passe ne correspondent pas" }); return; }
    setPwLoading(true); setPwMsg({ type: "", text: "" });
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current, new_password: pwForm.newPw });
      setPwMsg({ type: "success", text: "Mot de passe modifié avec succès !" });
      setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err) {
      setPwMsg({ type: "error", text: err.response?.data?.detail || "Erreur lors du changement de mot de passe" });
    } finally { setPwLoading(false); }
  }

  const INSTALL_LABELS = { residentielle: "Résidentielle", commerciale: "Commerciale", industrielle: "Industrielle" };
  const ALERT_LABELS = { email: "Email", whatsapp: "WhatsApp", both: "Email + WhatsApp" };

  const initials = (user?.full_name || "C").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const InfoRow = ({ icon, label, value }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid #F1F5F9" }}>
      <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#F0F9FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: "11px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: "14px", fontWeight: "600", color: "#1A202C", margin: "2px 0 0" }}>{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Réglages" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        {/* ── Profile Hero ── */}
        <div style={{ ...card, padding: "1.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "26px", fontWeight: "700", color: "#fff", flexShrink: 0,
              boxShadow: "0 4px 14px rgba(14,165,233,0.35)",
            }}>{initials}</div>

            {/* Name + role */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "22px", fontWeight: "700", color: "#1A202C", margin: 0 }}>{user?.full_name || "Client"}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>{user?.email}</span>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#D1D5DB" }} />
                <span style={{
                  fontSize: "11px", fontWeight: "600", padding: "2px 10px", borderRadius: "20px",
                  background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0",
                }}>Client actif</span>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {[
                { label: "Panneaux", value: user?.num_panels ?? "—" },
                { label: "Installation", value: INSTALL_LABELS[user?.installation_type] || "—" },
                { label: "Capacité", value: capacity !== "--" ? `${capacity} kWc` : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", padding: "0.75rem 1.25rem", background: "#F8FAFC", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                  <p style={{ fontSize: "18px", fontWeight: "700", color: "#1A202C", margin: 0 }}>{value}</p>
                  <p style={{ fontSize: "11px", color: "#9CA3AF", margin: "3px 0 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Two-column: Contact + Installation ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>

          {/* Contact */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <p style={sectionTitle}>Informations de contact</p>
            </div>
            <InfoRow icon={<User size={16} color="#0EA5E9" />}  label="Nom complet"        value={user?.full_name} />
            <InfoRow icon={<Mail size={16} color="#0EA5E9" />}  label="Adresse email"       value={user?.email} />
            <InfoRow icon={<Phone size={16} color="#0EA5E9" />} label="Téléphone"           value={user?.phone} />
            <InfoRow icon={<Bell size={16} color="#0EA5E9" />}  label="Préférence d'alerte" value={ALERT_LABELS[user?.alert_preference]} />
          </div>

          {/* Installation */}
          <div style={card}>
            <p style={sectionTitle}>Installation solaire</p>
            <InfoRow icon={<Sun size={16} color="#F59E0B" />}          label="Puissance crête"        value={capacity !== "--" ? `${capacity} kWc` : null} />
            <InfoRow icon={<Grid size={16} color="#F59E0B" />}          label="Nombre de panneaux"     value={user?.num_panels ? `${user.num_panels} panneaux` : null} />
            <InfoRow icon={<Zap size={16} color="#F59E0B" />}          label="Type d'installation"    value={INSTALL_LABELS[user?.installation_type]} />
            <InfoRow icon={<MapPin size={16} color="#F59E0B" />}       label="Localisation"           value={settings.location || "Maroc"} />
          </div>
        </div>

        {/* ── Security: Change Password ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.25rem" }}>
            <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={17} color="#6366F1" />
            </div>
            <div>
              <p style={{ ...sectionTitle, marginBottom: 0 }}>Sécurité du compte</p>
              <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Modifiez votre mot de passe régulièrement</p>
            </div>
          </div>
          {pwMsg.text && (
            <div style={{
              padding: "0.6rem 0.9rem", borderRadius: "8px", fontSize: "13px", marginBottom: "1rem",
              background: pwMsg.type === "success" ? "#F0FDF4" : "#FEF2F2",
              border: `1px solid ${pwMsg.type === "success" ? "#BBF7D0" : "#FECACA"}`,
              color: pwMsg.type === "success" ? "#16A34A" : "#DC2626",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              {pwMsg.type === "success" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {pwMsg.text}
            </div>
          )}
          <form onSubmit={handleChangePassword} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "1rem", alignItems: "end" }}>
            <div>
              <p style={fieldLbl}>Mot de passe actuel</p>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputSty, paddingRight: "2.5rem" }} type={pwShow ? "text" : "password"} placeholder="••••••••"
                  value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} required />
                <button type="button" onClick={() => setPwShow(p => !p)} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
                  {pwShow ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <p style={fieldLbl}>Nouveau mot de passe</p>
              <input style={inputSty} type={pwShow ? "text" : "password"} placeholder="Min. 6 caractères"
                value={pwForm.newPw} onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })} required />
            </div>
            <div>
              <p style={fieldLbl}>Confirmer le mot de passe</p>
              <input style={inputSty} type={pwShow ? "text" : "password"} placeholder="Répéter"
                value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} required />
            </div>
            <button type="submit" disabled={pwLoading} style={{
              padding: "0.55rem 1.25rem", background: "#6366F1", color: "#fff", border: "none",
              borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: pwLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", opacity: pwLoading ? 0.7 : 1,
            }}>
              {pwLoading ? "..." : "Enregistrer"}
            </button>
          </form>
        </div>

        {/* ── Notifications + API Status ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>

          {/* Notifications */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.25rem" }}>
              <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bell size={17} color="#F59E0B" />
              </div>
              <p style={{ ...sectionTitle, marginBottom: 0 }}>Préférences de notification</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                ["soilingAlerts", "Alertes d'encrassement"],
                ["emailReports",  "Rapports automatiques par email"],
                ["smsUrgency",    "SMS pour alarmes critiques"],
                ["monthlyReport", "Rapport mensuel de synthèse"],
              ].map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{label}</span>
                  <Toggle value={settings[key] !== false} onChange={v => upd(key, v)} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid #F1F5F9" }}>
              <WhatsAppSection phone={user?.phone} />
            </div>
          </div>

          {/* Right column: API status + alert thresholds */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* FusionSolar status */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Wifi size={17} color="#16A34A" />
                </div>
                <p style={{ ...sectionTitle, marginBottom: 0 }}>Connexion FusionSolar</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} />
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#16A34A" }}>Connecté et opérationnel</span>
              </div>
              <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>
                Dernière synchro : {syncAgo != null ? `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}` : "—"}
              </p>
              <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "4px 0 0" }}>Station : {stationName || "—"}</p>
            </div>

            {/* Alert thresholds */}
            <div style={card}>
              <p style={sectionTitle}>Seuils d'alerte encrassement</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { label: "Propre", range: "Propreté > 85%", bg: "#F0FDF4", border: "#BBF7D0", color: "#16A34A" },
                  { label: "Attention", range: "60% – 85%", bg: "#FFFBEB", border: "#FDE68A", color: "#D97706" },
                  { label: "Critique", range: "Propreté < 60%", bg: "#FEF2F2", border: "#FECACA", color: "#DC2626" },
                ].map(t => (
                  <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: t.color }}>{t.label}</span>
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>{t.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

