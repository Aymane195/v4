import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SoilingGauge from "../components/SoilingGauge";
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
        api.get("/client/alarms"),
      ]);
      if (s.status === "fulfilled") setStations(s.value.data || []);
      if (k.status === "fulfilled") { setKpi(k.value.data); setLastSync(Date.now()); }
      if (dev.status === "fulfilled") setDeviceKpi(dev.value.data);
      if (al.status === "fulfilled") {
        const all = [];
        (al.value.data || []).forEach(r => (r?.data || []).forEach(a => all.push(a)));
        setAlarmCount(all.length);
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
      api.get(`/soiling/${stations[0].station_code}`).then(r => setSoiling(r.data)).catch(() => {});
    }
  }, [stations]);

  const stationName = stations[0]?.station_name || stations[0]?.station_code || "Mon installation";

  const NAV = [
    { id: "accueil",  label: "Accueil",  icon: "🏠" },
    { id: "analyses", label: "Analyses", icon: "📊" },
    { id: "alertes",  label: "Alertes",  icon: "🔔", badge: alarmCount },
    { id: "reglages", label: "Réglages", icon: "⚙️" },
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
              <div style={{ width: "32px", height: "32px", background: "#F59E0B", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>☀️</div>
              <span style={{ fontWeight: "700", fontSize: "0.95rem", color: "#1A202C" }}>SolarAI Monitor</span>
            </div>
            <p style={{ fontSize: "11px", color: "#94A3B8", marginLeft: "40px" }}>Optimisez votre énergie solaire</p>
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
              ⏻ Déconnexion
            </button>
            <p style={{ fontSize: "11px", color: "#A0AEC0", textAlign: "center" }}>Version v2.1.0</p>
            <p style={{ fontSize: "11px", color: "#A0AEC0", textAlign: "center" }}>SolarAI, Casablanca, 2024</p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minHeight: "100vh", background: "#F0F4F8", overflowY: "auto" }}>
          {tab === "accueil"  && <AccueilTab  kpi={kpi} soiling={soiling} alarmCount={alarmCount} stationName={stationName} onAlertes={() => setTab("alertes")} />}
          {tab === "analyses" && <AnalysesTab kpi={kpi} deviceKpi={deviceKpi} stations={stations} stationName={stationName} />}
          {tab === "alertes"  && <AlertesTab  stationName={stationName} />}
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
              <span style={{ background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0", borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: "600" }}>
                ⟳ Live
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
          <div style={{ ...card, cursor: alarmCount > 0 ? "pointer" : "default" }} onClick={alarmCount > 0 ? onAlertes : undefined}>
            <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", marginBottom: "0.5rem" }}>Résumé des Alarmes</p>
            {alarmCount === 0 ? (
              <>
                <p style={{ fontSize: "13px", fontWeight: "600", color: "#16A34A" }}>Statut: Normal.</p>
                <p style={{ fontSize: "13px", color: "#16A34A" }}>Aucune alerte active.</p>
              </>
            ) : (
              <p style={{ fontSize: "1.1rem", fontWeight: "700", color: "#EF4444" }}>{alarmCount} alarme{alarmCount > 1 ? "s" : ""} active{alarmCount > 1 ? "s" : ""}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomKpi({ label, value }) {
  return (
    <div style={card}>
      <p style={{ fontSize: "13px", color: "#6B7280", fontWeight: "500", marginBottom: "0.5rem" }}>{label}</p>
      <p style={{ fontSize: "1.5rem", fontWeight: "700", color: "#1A202C" }}>{value}</p>
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
      <Node icon="☀️" label="Panneaux Solaires" />
      <Arrow top={fmt(power, 1)} bottom={fmt(dayEnergy, 1)} />
      <Node icon="⚡" label="Onduleur" />
      <Arrow top={fmt(homeEnergy, 1)} bottom={fmt(gridPower, 1)} />
      <Node icon="🏠" label="Maison & Réseau Électrique" />
      <Arrow top={fmt(gridPower, 1)} bottom={fmt(dayGrid, 1)} />
      <Node icon="🔌" label="Réseau" />
    </div>
  );
}

// ── Analyses Tab ──────────────────────────────────────────────────────────────
function AnalysesTab({ kpi, deviceKpi, stations, stationName }) {
  const [period, setPeriod] = useState("mois");
  const [mode, setMode]     = useState("production");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]     = useState(false);

  const d = kpi?.data?.[0]?.dataItemMap || {};
  const totalEnergy  = d.total_power ?? null;
  const totalSavings = totalEnergy != null ? Math.round(totalEnergy * 1.5) : null;
  const co2Total     = d.reduce_carbon ?? (totalEnergy != null ? Math.round(totalEnergy * 0.233) : null);
  const trees        = co2Total != null ? Math.round(co2Total / 21) : null;
  const radiation    = d.radiation_intensity ?? null;
  const dayGrid      = d.day_on_grid_energy ?? null;
  const panelTemp    = deviceKpi?.data?.[0]?.dataItemMap?.temperature ?? null;

  const stationCode = stations[0]?.station_code;

  useEffect(() => {
    if (!stationCode) return;
    setLoading(true);
    const now = new Date();
    const yr  = now.getFullYear();

    async function load() {
      try {
        let data = [];
        if (period === "jour") {
          const rows = await Promise.all(Array.from({ length: 7 }, (_, i) => {
            const d = new Date(now); d.setDate(d.getDate() - (6 - i));
            const str = d.toISOString().slice(0, 10);
            return api.get(`/client/kpi/daily?date=${str}`)
              .then(r => ({ name: d.toLocaleDateString("fr-FR", { weekday: "short" }), val: r.data?.data?.[0]?.dataItemMap?.day_power ?? 0 }))
              .catch(() => ({ name: "", val: 0 }));
          }));
          data = rows;
        } else if (period === "mois") {
          const rows = await Promise.all(Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, "0");
            return api.get(`/client/kpi/monthly?month=${yr}-${m}`)
              .then(r => ({ name: MONTHS[i], val: r.data?.data?.[0]?.dataItemMap?.month_power ?? 0 }))
              .catch(() => ({ name: MONTHS[i], val: 0 }));
          }));
          data = rows;
        } else {
          const rows = await Promise.all(Array.from({ length: 3 }, (_, i) => {
            const y = yr - 2 + i;
            return api.get(`/client/kpi/monthly?month=${y}-06`)
              .then(r => ({ name: String(y), val: (r.data?.data?.[0]?.dataItemMap?.month_power ?? 0) * 12 }))
              .catch(() => ({ name: String(y), val: 0 }));
          }));
          data = rows;
        }
        setChartData(data);
      } finally { setLoading(false); }
    }
    load();
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
          <DetailCard icon="☀️" label="Total Énergie Produite"    value={totalEnergy != null ? `${fmt(totalEnergy, 0)} kWh` : "--"} sub={`Année d'installation: ${new Date().getFullYear() - 2}`} />
          <DetailCard icon="💰" label="Total Économies Réalisées" value={totalSavings != null ? `${fmt(totalSavings, 0)} DH` : "--"} sub="depuis installation" />
          <DetailCard icon="🌍" label="CO₂ Évité (Total)"         value={co2Total != null ? `${fmt(co2Total, 0)} kg` : "--"} sub={trees != null ? `Équivalent à: ${fmt(trees, 0)} arbres plantés` : null} />
          <DetailCard icon="🌡️" label="Température des Panneaux"  value={panelTemp != null ? `${fmt(panelTemp, 0)} °C` : "--"} />
          <DetailCard icon="☀️" label="Irradiation Solaire"        value={`${fmt(radiation, 0)} W/m²`} />
          <DetailCard icon="⚡" label="Injection Réseau"           value={dayGrid != null ? `${fmt(dayGrid, 1)} kW` : "--"} />
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

// ── Alertes Tab ───────────────────────────────────────────────────────────────
function AlertesTab({ stationName }) {
  const [alarms, setAlarms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState(0);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get("/client/alarms")
      .then(res => {
        const all = [];
        (res.data || []).forEach(r => (r?.data || []).forEach(a => all.push(a)));
        all.sort((a, b) => (a.lev ?? 9) - (b.lev ?? 9) || (b.raiseTime ?? 0) - (a.raiseTime ?? 0));
        setAlarms(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  alarms.forEach(a => { if (counts[a.lev] != null) counts[a.lev]++; });
  const visible = filter === 0 ? alarms : alarms.filter(a => a.lev === filter);

  return (
    <div>
      <PageHeader title="Alertes" stationName={stationName} />
      <div style={{ padding: "0 1.5rem 2rem" }}>
        <p style={{ color: "#4B5563", fontSize: "15px", marginBottom: "1rem" }}>
          Total: <strong>{alarms.length}</strong> active alarm{alarms.length !== 1 ? "s" : ""}
        </p>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {[[0,"Tous",alarms.length],[1,"Critique",counts[1]],[2,"Majeure",counts[2]],[3,"Mineure",counts[3]],[4,"Avertissement",counts[4]]].map(([lev, lbl, cnt]) => {
            const sel = filter === lev;
            const sev = lev > 0 ? ALARM_SEV[lev] : null;
            return (
              <button key={lev} onClick={() => setFilter(lev)} style={{
                padding: "0.4rem 1rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
                fontWeight: sel ? "600" : "400",
                border: sel ? `2px solid ${sev ? sev.text : "#374151"}` : "1px solid #E2E8F0",
                background: sel ? (sev ? sev.bg : "#F1F5F9") : "#fff",
                color: sel ? (sev ? sev.text : "#374151") : "#6B7280",
              }}>
                {lbl} ({cnt})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: "3rem" }}>Chargement...</div>
        ) : visible.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "2.5rem", color: "#16A34A" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: "600" }}>✓ Aucune alarme active</p>
            <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Votre installation fonctionne normalement</p>
          </div>
        ) : visible.map((a, i) => {
          const sev  = ALARM_SEV[a.lev] || { bg: "#F8FAFC", text: "#6B7280", border: "#E2E8F0" };
          const open = expanded === i;
          const dateStr = a.raiseTime ? new Date(a.raiseTime).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--";
          const alarmIcon = a.lev === 1 ? "⚠️" : a.lev === 2 ? "🔥" : a.lev === 4 ? "📡" : "⚡";

          return (
            <div key={i} onClick={() => setExpanded(open ? null : i)} style={{
              ...card, marginBottom: "8px", cursor: "pointer", borderLeft: `4px solid ${sev.text}`,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ width: "42px", height: "42px", background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  {alarmIcon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontWeight: "600", fontSize: "15px", color: "#1A202C" }}>{a.alarmName || "Alarme"}</p>
                      <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>Date: {dateStr}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "12px" }}>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "12px", color: "#6B7280" }}>Date: {dateStr}</p>
                        <p style={{ fontSize: "12px", color: "#6B7280" }}>Device: {a.devName || "--"}</p>
                      </div>
                      <span style={{ background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, borderRadius: "6px", padding: "2px 10px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" }}>
                        {ALARM_LABEL[a.lev] || "—"}
                      </span>
                      <span style={{ color: "#94A3B8", fontSize: "16px" }}>{open ? "∧" : "∨"}</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F1F5F9" }}>
                      {a.alarmCause    && <p style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}><strong>Cause:</strong> {a.alarmCause}</p>}
                      {a.alarmSuggest  && <p style={{ fontSize: "13px", color: "#374151" }}><strong>Action Suggérée:</strong> {a.alarmSuggest}</p>}
                    </div>
                  )}
                </div>
              </div>
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
