import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import SoilingGauge from "../components/SoilingGauge";
import KpiCard from "../components/KpiCard";
import BottomNav from "../components/BottomNav";
import EnergyFlowCard from "../components/EnergyFlowCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const today = new Date();

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Accueil Tab ────────────────────────────────────────────────────────────

function AccueilTab({ kpi, soiling, stations }) {
  const clock = useClock();
  const data = kpi?.data?.[0]?.dataItemMap || {};
  const power = data.inverter_power ?? null;
  const dayEnergy = data.day_power ?? null;
  const totalEnergy = data.total_power ?? null;
  const co2 = data.reduce_carbon ?? null;
  const gridPower = data.use_power ?? null;

  const soilingPct = soiling?.soiling_index ?? 0;
  const isClean = soilingPct < 0.05;

  return (
    <div style={s.tab}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.appName}>☀️ Solar AI Monitor</p>
          <p style={s.clock}>{clock}</p>
        </div>
        <div style={s.live}><span style={s.dot} />EN DIRECT</div>
      </div>

      {/* Status banner */}
      <div style={{ ...s.banner, background: isClean ? "rgba(16,185,129,0.15)" : "rgba(249,115,22,0.15)", borderColor: isClean ? "#10B981" : "#F97316" }}>
        <span style={{ color: isClean ? "#10B981" : "#F97316", fontWeight: 700 }}>
          {isClean ? "✓ Panneaux propres" : "⚠ Nettoyage recommandé"}
        </span>
        <span style={s.bannerSub}>
          {soiling?.recommendation || "Analyse en cours..."}
        </span>
      </div>

      {/* Soiling gauge */}
      <div style={s.gaugeWrap}>
        <SoilingGauge index={soilingPct} />
      </div>

      {/* Energy flow */}
      <EnergyFlowCard power={power} dayPower={dayEnergy} gridPower={gridPower} />

      {/* KPI cards */}
      <div style={s.kpiGrid}>
        <KpiCard label="Production" value={power} unit="kW" color="#F59E0B" icon="⚡" />
        <KpiCard label="Aujourd'hui" value={dayEnergy} unit="kWh" color="#10B981" icon="📅" />
        <KpiCard label="Total produit" value={totalEnergy} unit="kWh" color="#60A5FA" icon="🔋" />
        <KpiCard label="CO₂ évité" value={co2} unit="kg" color="#A78BFA" icon="🌿" />
      </div>

      {/* Station info */}
      {stations.length > 0 && (
        <div style={s.stationInfo}>
          <span style={s.stationDot}>📍</span>
          <span style={{ color: "#94A3B8", fontSize: "13px" }}>
            {stations[0].station_name || stations[0].station_code}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Analyses Tab ────────────────────────────────────────────────────────────

function AnalysesTab({ stationCodes }) {
  const [period, setPeriod] = useState("mois");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!stationCodes.length) return;
    setLoading(true);
    try {
      if (period === "mois") {
        // Fetch last 6 months
        const results = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          try {
            const res = await api.get(`/client/kpi/monthly?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.month_power ?? 0;
            results.push({ name: MONTHS_FR[d.getMonth()], kWh: parseFloat(val) || 0 });
          } catch {
            results.push({ name: MONTHS_FR[d.getMonth()], kWh: 0 });
          }
        }
        setChartData(results);
      } else if (period === "jour") {
        // Last 7 days
        const results = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const dayLabel = d.toLocaleDateString("fr-FR", { weekday: "short" });
          try {
            const res = await api.get(`/client/kpi/daily?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.day_power ?? 0;
            results.push({ name: dayLabel, kWh: parseFloat(val) || 0 });
          } catch {
            results.push({ name: dayLabel, kWh: 0 });
          }
        }
        setChartData(results);
      } else {
        // Year: last 12 months grouped by year label
        const results = [];
        for (let y = today.getFullYear() - 1; y <= today.getFullYear(); y++) {
          const dateStr = `${y}-01`;
          try {
            const res = await api.get(`/client/kpi/monthly?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.month_power ?? 0;
            results.push({ name: String(y), kWh: parseFloat(val) || 0 });
          } catch {
            results.push({ name: String(y), kWh: 0 });
          }
        }
        setChartData(results);
      }
    } finally {
      setLoading(false);
    }
  }, [period, stationCodes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const total = chartData.reduce((s, d) => s + d.kWh, 0);
  const peak = Math.max(...chartData.map(d => d.kWh), 0);
  const avg = chartData.length ? total / chartData.length : 0;
  const economies = (total * 1.5).toFixed(0);

  return (
    <div style={s.tab}>
      <div style={s.header}>
        <p style={s.appName}>📊 Analyses</p>
      </div>

      {/* Period toggle */}
      <div style={s.toggleRow}>
        {["jour", "mois", "année"].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{ ...s.toggleBtn, ...(period === p ? s.toggleActive : {}) }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div style={s.chartWrap}>
        {loading ? (
          <div style={s.loading}>Chargement...</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#F1F5F9" }}
                cursor={{ fill: "rgba(245,158,11,0.1)" }}
                formatter={v => [`${v} kWh`, "Production"]}
              />
              <Bar dataKey="kWh" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary chips */}
      <div style={s.summaryRow}>
        <div style={s.chip}><span style={s.chipVal}>{total.toFixed(1)}</span><span style={s.chipLbl}>Total kWh</span></div>
        <div style={s.chip}><span style={s.chipVal}>{peak.toFixed(1)}</span><span style={s.chipLbl}>Pic kWh</span></div>
        <div style={s.chip}><span style={s.chipVal}>{avg.toFixed(1)}</span><span style={s.chipLbl}>Moy. kWh</span></div>
      </div>

      {/* Detail cards */}
      <div style={s.kpiGrid}>
        <KpiCard label="Énergie totale" value={total.toFixed(1)} unit="kWh" color="#F59E0B" icon="⚡" />
        <KpiCard label="CO₂ évité" value={(total * 0.4).toFixed(1)} unit="kg" color="#10B981" icon="🌿" />
        <KpiCard label="Temp. panneaux" value="--" unit="°C" color="#F97316" icon="🌡️" />
        <KpiCard label="Irradiance" value="--" unit="W/m²" color="#60A5FA" icon="☀️" />
        <KpiCard label="Économies" value={economies} unit="DH" color="#A78BFA" icon="💰" />
        <KpiCard label="Puissance crête" value={peak.toFixed(1)} unit="kWh" color="#F59E0B" icon="📈" />
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const { logout } = useAuth();
  const [tab, setTab] = useState("accueil");
  const [kpi, setKpi] = useState(null);
  const [soiling, setSoiling] = useState(null);
  const [stations, setStations] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [stRes, kpiRes] = await Promise.all([
          api.get("/client/stations"),
          api.get("/client/kpi/realtime"),
        ]);
        setStations(stRes.data);
        setKpi(kpiRes.data);
        if (stRes.data.length > 0) {
          const soil = await api.get(`/soiling/station/${stRes.data[0].station_code}`);
          setSoiling(soil.data);
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, []);

  const stationCodes = stations.map(s => s.station_code);

  return (
    <div style={s.page}>
      {/* Logout button */}
      <button onClick={logout} style={s.logoutBtn} title="Déconnexion">⏻</button>

      {tab === "accueil" ? (
        <AccueilTab kpi={kpi} soiling={soiling} stations={stations} />
      ) : (
        <AnalysesTab stationCodes={stationCodes} />
      )}

      <div style={{ height: "70px" }} />
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "system-ui, sans-serif", position: "relative" },
  logoutBtn: { position: "fixed", top: "12px", right: "12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "8px", padding: "6px 10px", fontSize: "16px", zIndex: 200 },
  tab: { padding: "1rem 1rem 0", display: "flex", flexDirection: "column", gap: "1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" },
  appName: { fontWeight: "700", fontSize: "1rem", color: "#F1F5F9" },
  clock: { fontSize: "12px", color: "#94A3B8", marginTop: "2px" },
  live: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "999px", padding: "4px 10px", fontSize: "11px", color: "#10B981", fontWeight: "600" },
  dot: { width: "6px", height: "6px", borderRadius: "50%", background: "#10B981", display: "inline-block", animation: "pulse 1.5s infinite" },
  banner: { border: "1px solid", borderRadius: "10px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "13px" },
  bannerSub: { color: "#94A3B8", fontSize: "12px" },
  gaugeWrap: { display: "flex", justifyContent: "center", padding: "0.5rem 0" },
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  stationInfo: { display: "flex", alignItems: "center", gap: "6px", padding: "0.5rem 0" },
  stationDot: { fontSize: "14px" },
  toggleRow: { display: "flex", gap: "8px", background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", padding: "4px" },
  toggleBtn: { flex: 1, padding: "6px 0", background: "none", border: "none", color: "#94A3B8", borderRadius: "7px", fontSize: "13px", fontWeight: "500" },
  toggleActive: { background: "#F59E0B", color: "#0F172A", fontWeight: "700" },
  chartWrap: { background: "#1E293B", border: "1px solid #334155", borderRadius: "12px", padding: "1rem" },
  loading: { height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" },
  summaryRow: { display: "flex", gap: "8px" },
  chip: { flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" },
  chipVal: { fontSize: "1rem", fontWeight: "700", color: "#F59E0B" },
  chipLbl: { fontSize: "10px", color: "#94A3B8", textTransform: "uppercase" },
};
