import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { Sun, BarChart3, Users, Bell, ClipboardList, Settings, LogOut, Construction, AlertTriangle, Search, Pencil, MapPin, Wrench, Flame, Radio, Zap, CheckCircle, CalendarDays, ChevronDown, ChevronUp, Play, Check, X } from "lucide-react";
import Logo from "../components/Logo";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v, dec = 1) {
  if (v == null || isNaN(Number(v))) return "--";
  return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

function healthInfo(state) {
  if (state === 3) return { color: "#16A34A", label: "En Ligne", bg: "#DCFCE7" };
  if (state === 2) return { color: "#DC2626", label: "En Panne", bg: "#FEF2F2" };
  if (state === 1) return { color: "#6B7280", label: "Hors Ligne", bg: "#F1F5F9" };
  return { color: "#6B7280", label: "Inconnu", bg: "#F1F5F9" };
}

function soilingInfo(s) {
  if (!s || s.status === "clean")            return { color: "#16A34A", label: "Propre" };
  if (s.status === "light_soiling")          return { color: "#D97706", label: "Sale" };
  if (s.status === "moderate_soiling")       return { color: "#EA580C", label: "Sale" };
  return { color: "#DC2626", label: "Critiquement Sale" };
}

const ALARM_LABEL = { 1: "Critique", 2: "Majeure", 3: "Mineure", 4: "Avertissement" };
const ALARM_SEV = {
  1: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  2: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  3: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  4: { bg: "#FEFCE8", text: "#CA8A04", border: "#FEF08A" },
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = { background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "1.25rem" };

// ── Mini ring gauge ───────────────────────────────────────────────────────────
function MiniGauge({ pct = 0, size = 56 }) {
  const r = 20, sw = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  const color = pct >= 90 ? "#22C55E" : pct >= 70 ? "#EAB308" : "#EF4444";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 50 50">
        <circle cx="25" cy="25" r={r} fill="none" stroke="#E2E8F0" strokeWidth={sw} />
        <circle cx="25" cy="25" r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 25 25)" />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700", color: "#1A202C" }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Live pill ─────────────────────────────────────────────────────────────────
function LivePill({ label }) {
  const clock = useClock();
  const timeStr = clock.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "0.5rem 1.25rem", textAlign: "center" }}>
      <p style={{ fontWeight: "600", color: "#1A202C", fontSize: "14px" }}>{label}</p>
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

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN DASHBOARD ──
// ══════════════════════════════════════════════════════════════════════════════
export default function EmployeeDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [clients, setClients]           = useState([]);
  const [allStations, setAllStations]   = useState([]);
  const [stationKpi, setStationKpi]     = useState({});
  const [stationSoiling, setStationSoiling] = useState({});
  const [stationAlarms, setStationAlarms]   = useState({});
  const [totalAlarms, setTotalAlarms]   = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [cRes, sRes, aRes] = await Promise.all([
          api.get("/employee/clients"),
          api.get("/employee/stations"),
          api.get("/employee/alarms"),
        ]);
        setClients(cRes.data);
        setAllStations(sRes.data);

        const alarmList = aRes.data || [];
        setTotalAlarms(alarmList.length);

        const kpiMap = {}, soilMap = {}, almMap = {};
        alarmList.forEach(a => { almMap[a.station_code] = (almMap[a.station_code] || 0) + 1; });
        setStationAlarms(almMap);

        await Promise.all(sRes.data.map(async s => {
          try {
            const [kpiR, soilR] = await Promise.all([
              api.get(`/employee/stations/${s.station_code}/kpi/realtime`),
              api.get(`/soiling/station/${s.station_code}`),
            ]);
            kpiMap[s.station_code]  = kpiR.data?.data?.[0]?.dataItemMap || {};
            soilMap[s.station_code] = soilR.data;
          } catch {
            kpiMap[s.station_code]  = {};
            soilMap[s.station_code] = null;
          }
        }));
        setStationKpi(kpiMap);
        setStationSoiling(soilMap);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    fetchAll();
    const iv = setInterval(fetchAll, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const NAV = [
    { id: "overview", label: "Vue d'ensemble", icon: <BarChart3 size={18} /> },
    { id: "clients",  label: "Clients",        icon: <Users size={18} /> },
    { id: "alarmes",  label: "Alarmes",        icon: <Bell size={18} />, badge: totalAlarms },
    { id: "missions", label: "Missions",        icon: <ClipboardList size={18} /> },
    { id: "reglages", label: "Réglages",       icon: <Settings size={18} /> },
  ];

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0F4F8" }}>
      <Sun size={48} color="#F59E0B" />
      <span style={{ color: "#6B7280", marginLeft: "12px" }}>Chargement...</span>
    </div>
  );

  return (
    <>
      <style>{`body { margin: 0; background: #F0F4F8; font-family: 'Segoe UI', system-ui, sans-serif; }`}</style>
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
                {n.badge > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: "999px", padding: "1px 7px", fontSize: "11px", fontWeight: "700" }}>{n.badge}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "0.875rem 1.25rem", borderTop: "1px solid #F1F5F9" }}>
            <button onClick={() => { logout(); navigate("/login"); }} style={{ width: "100%", padding: "0.5rem", background: "none", border: "1px solid #E2E8F0", borderRadius: "6px", color: "#6B7280", fontSize: "13px", cursor: "pointer" }}>
              <LogOut size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} /> Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, minHeight: "100vh", background: "#F0F4F8", overflowY: "auto" }}>
          {tab === "overview" && <OverviewTab allStations={allStations} stationKpi={stationKpi} stationSoiling={stationSoiling} stationAlarms={stationAlarms} clients={clients} />}
          {tab === "clients"  && <ClientsTab clients={clients} allStations={allStations} stationKpi={stationKpi} />}
          {tab === "alarmes"  && <AlarmesTab />}
          {tab === "missions" && <MissionsTab clients={clients} />}
          {tab === "reglages" && <PlaceholderTab title="Réglages" desc="Paramètres employé — bientôt disponible." />}
        </main>
      </div>
    </>
  );
}

function PlaceholderTab({ title, desc }) {
  return (
    <div>
      <div style={{ padding: "1.5rem 2rem 1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C" }}>{title}</h1>
      </div>
      <div style={{ padding: "0 2rem" }}>
        <div style={{ ...card, textAlign: "center", padding: "4rem 2rem", color: "#94A3B8" }}>
          <p style={{ fontSize: "2rem", marginBottom: "0.5rem", display: "flex", justifyContent: "center" }}><Construction size={32} color="#94A3B8" /></p>
          <p>{desc}</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VUE D'ENSEMBLE ──
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ allStations, stationKpi, stationSoiling, stationAlarms, clients }) {
  const [filter, setFilter] = useState("tous");
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.full_name]));

  const total   = allStations.length;
  const offline = allStations.filter(s => { const h = stationKpi[s.station_code]?.real_health_state; return h === 1 || h === 2; }).length;
  const prVals  = allStations.map(s => stationKpi[s.station_code]?.performance_ratio).filter(v => v != null);
  const avgPR   = prVals.length ? Math.round(prVals.reduce((a, b) => a + b, 0) / prVals.length * 100) : "--";

  const filtered = allStations.filter(s => {
    const kpi  = stationKpi[s.station_code] || {};
    const soil = stationSoiling[s.station_code];
    if (filter === "panne")   return kpi.real_health_state === 1 || kpi.real_health_state === 2;
    if (filter === "alarmes") return (stationAlarms[s.station_code] || 0) > 0;
    if (filter === "sales")   return soil && soil.status !== "clean";
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C" }}>Vue d'ensemble</h1>
        <LivePill label="Flotte Complète - Maroc" />
      </div>

      <div style={{ padding: "0 2rem 2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Fleet summary 3 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div style={card}>
            <p style={{ fontSize: "12px", color: "#6B7280" }}>Total installations</p>
            <p style={{ fontSize: "2rem", fontWeight: "800", color: "#1A202C" }}>{total}</p>
          </div>
          <div style={card}>
            <p style={{ fontSize: "12px", color: "#6B7280" }}>Hors Ligne / En Panne</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <p style={{ fontSize: "2rem", fontWeight: "800", color: offline > 0 ? "#DC2626" : "#16A34A" }}>{offline}</p>
              {offline > 0 && <AlertTriangle size={20} color="#DC2626" />}
            </div>
          </div>
          <div style={card}>
            <p style={{ fontSize: "12px", color: "#6B7280" }}>Taux de Performance Moyen</p>
            <p style={{ fontSize: "2rem", fontWeight: "800", color: "#1A202C" }}>{avgPR}%</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[["tous","Toutes"],["panne","En Panne"],["alarmes","Avec Alarmes"],["sales","Panneaux Sales"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              padding: "0.4rem 1rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
              fontWeight: filter === id ? "600" : "400",
              border: filter === id ? "2px solid #2563EB" : "1px solid #E2E8F0",
              background: filter === id ? "#EFF6FF" : "#fff",
              color: filter === id ? "#2563EB" : "#4B5563",
            }}>{lbl}</button>
          ))}
        </div>

        {/* Station cards 2-column grid */}
        {filtered.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "2rem", color: "#94A3B8" }}>Aucune installation dans cette catégorie.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {filtered.map(st => {
              const kpi    = stationKpi[st.station_code] || {};
              const soil   = stationSoiling[st.station_code];
              const almCnt = stationAlarms[st.station_code] || 0;
              const health = healthInfo(kpi.real_health_state);
              const isOnline = kpi.real_health_state === 3;
              const soilI  = isOnline ? soilingInfo(soil) : { color: "#6B7280", label: "Inconnu" };
              const pr     = kpi.performance_ratio != null ? Math.round(kpi.performance_ratio * 100) : null;
              const idx    = isOnline && soil?.soiling_index != null ? Math.round((1 - soil.soiling_index) * 100) : null;
              const clientName = clientMap[st.client_id] || "--";
              const shortName  = clientName.split(" ").length >= 2
                ? clientName.split(" ")[0][0] + ". " + clientName.split(" ").slice(1).join(" ")
                : clientName;

              return (
                <div key={st.station_code} style={{ ...card, display: "flex", gap: "12px" }}>
                  {/* Left info */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: "700", fontSize: "15px", color: "#1A202C", marginBottom: "6px" }}>
                      {st.station_name || st.station_code} <span style={{ fontWeight: "400", color: "#6B7280" }}>({shortName})</span>
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", color: "#6B7280" }}>Statut:</span>
                      <span style={{ background: health.bg, color: health.color, borderRadius: "4px", padding: "1px 8px", fontSize: "12px", fontWeight: "600" }}>
                        {health.label}
                      </span>
                      {almCnt > 0 && (
                        <span style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: "4px", padding: "1px 8px", fontSize: "12px", fontWeight: "600" }}>
                          {almCnt} Alerte{almCnt > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "2px" }}>
                      Encrassement: <span style={{ color: soilI.color, fontWeight: "600" }}>{soilI.label}</span>
                    </p>
                    <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px" }}>
                      Alarmes: {almCnt}
                    </p>

                    <p style={{ fontSize: "13px", color: "#374151" }}>
                      Prod: <strong>{fmt(kpi.day_power, 1)} kWh</strong>
                      &nbsp;&nbsp;P: <strong>{fmt(kpi.inverter_power, 1)} kW</strong>
                    </p>
                  </div>

                  {/* Right: TR, IS, gauge */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                    <p style={{ fontSize: "12px", color: "#6B7280" }}>TR: <strong style={{ color: "#1A202C" }}>{pr != null ? `${pr}%` : "--"}</strong></p>
                    <p style={{ fontSize: "12px", color: "#6B7280" }}>IS: <strong style={{ color: "#1A202C" }}>{idx != null ? `${idx}%` : "--"}</strong></p>
                    <MiniGauge pct={idx ?? 0} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CLIENTS (table view) ──
// ══════════════════════════════════════════════════════════════════════════════
function ClientsTab({ clients, allStations, stationKpi }) {
  const [search, setSearch]   = useState("");
  const [sortBy, setSortBy]   = useState("name");
  const [showAdd, setShowAdd] = useState(false);
  const [newStation, setNewStation] = useState({ client_id: "", station_code: "", station_name: "" });
  const [msg, setMsg] = useState("");

  // Build table rows: one row per client-station pair
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const rows = allStations.map(st => {
    const client = clientMap[st.client_id];
    if (!client) return null;
    const kpi = stationKpi[st.station_code] || {};
    const health = healthInfo(kpi.real_health_state);
    return { client, st, kpi, health };
  }).filter(Boolean);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    return r.client.full_name.toLowerCase().includes(q) || r.client.email.toLowerCase().includes(q) || r.st.station_code.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name")    return a.client.full_name.localeCompare(b.client.full_name);
    if (sortBy === "station") return (a.st.station_code || "").localeCompare(b.st.station_code || "");
    return 0;
  });

  async function handleAssign(e) {
    e.preventDefault();
    if (!newStation.client_id || !newStation.station_code) return;
    try {
      await api.post(`/employee/clients/${newStation.client_id}/stations`, {
        station_code: newStation.station_code,
        station_name: newStation.station_name,
      });
      setMsg("Station assignée avec succès.");
      setNewStation({ client_id: "", station_code: "", station_name: "" });
      setShowAdd(false);
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg(err.response?.data?.detail || "Erreur");
    }
  }

  async function handleRemove(clientId, code) {
    if (!window.confirm(`Retirer ${code} ?`)) return;
    try {
      await api.delete(`/employee/clients/${clientId}/stations/${code}`);
      setMsg("Station retirée.");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg(err.response?.data?.detail || "Erreur");
    }
  }

  const th = { textAlign: "left", padding: "0.6rem 0.75rem", fontSize: "12px", color: "#6B7280", fontWeight: "600", borderBottom: "2px solid #E2E8F0" };
  const td = { padding: "0.6rem 0.75rem", fontSize: "14px", color: "#374151", borderBottom: "1px solid #F1F5F9" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C" }}>Clients</h1>
      </div>

      <div style={{ padding: "0 2rem 2rem" }}>
        {msg && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#16A34A", borderRadius: "8px", padding: "0.5rem 1rem", fontSize: "13px", marginBottom: "1rem" }}>{msg}</div>}

        {/* Toolbar */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: "320px" }}>
            <input placeholder="Rechercher un client ou code" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "0.5rem 0.75rem 0.5rem 2rem", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#fff" }} />
            <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8", display: "flex" }}><Search size={16} /></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "13px", color: "#6B7280" }}>Trier par:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding: "0.4rem 0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px" }}>
              <option value="name">Nom</option>
              <option value="station">Station</option>
            </select>
          </div>
          <button onClick={() => setShowAdd(p => !p)} style={{
            padding: "0.5rem 1rem", background: "#16A34A", color: "#fff", border: "none",
            borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer", marginLeft: "auto",
          }}>
            + Ajouter un client
          </button>
        </div>

        {/* Assign station form */}
        {showAdd && (
          <form onSubmit={handleAssign} style={{ ...card, display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Client ID</p>
              <select value={newStation.client_id} onChange={e => setNewStation({ ...newStation, client_id: e.target.value })}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px" }} required>
                <option value="">Choisir...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Code station</p>
              <input placeholder="CODE-STATION" value={newStation.station_code} onChange={e => setNewStation({ ...newStation, station_code: e.target.value })}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }} required />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "4px" }}>Nom (optionnel)</p>
              <input placeholder="Nom de l'installation" value={newStation.station_name} onChange={e => setNewStation({ ...newStation, station_name: e.target.value })}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }} />
            </div>
            <button type="submit" style={{ padding: "0.5rem 1.25rem", background: "#2563EB", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "600", cursor: "pointer" }}>
              Assigner
            </button>
          </form>
        )}

        {/* Table */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={th}>Client</th>
                <th style={th}>Email</th>
                <th style={th}>Code Station</th>
                <th style={th}>Dernière Synchro</th>
                <th style={th}>Statut Health</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#94A3B8", padding: "2rem" }}>Aucun résultat.</td></tr>
              ) : sorted.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: r.health.color === "#DC2626" ? "#FCA5A5" : "#CBD5E0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "13px", color: "#374151", flexShrink: 0 }}>
                        {r.client.full_name[0]}
                      </div>
                      <div>
                        <p style={{ fontWeight: "600", fontSize: "14px", color: "#1A202C" }}>{r.client.full_name}</p>
                        <p style={{ fontSize: "11px", color: "#94A3B8" }}>({r.st.station_name || r.st.station_code})</p>
                      </div>
                    </div>
                  </td>
                  <td style={td}>{r.client.email}</td>
                  <td style={td}><span style={{ fontFamily: "monospace", fontSize: "13px" }}>{r.st.station_code}</span></td>
                  <td style={td}>{r.kpi.day_power != null ? new Date().toLocaleDateString("fr-FR") : "--"}</td>
                  <td style={td}>
                    <span style={{ background: r.health.bg, color: r.health.color, borderRadius: "4px", padding: "2px 10px", fontSize: "12px", fontWeight: "600" }}>
                      {r.health.label}
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button style={{ padding: "3px 10px", background: "none", border: "1px solid #E2E8F0", borderRadius: "4px", fontSize: "12px", cursor: "pointer", color: "#374151" }}>
                        <Pencil size={12} style={{ verticalAlign: "middle", marginRight: "3px" }} /> Modifier
                      </button>
                      <button onClick={() => handleRemove(r.client.id, r.st.station_code)}
                        style={{ padding: "3px 10px", background: "none", border: "1px solid #FECACA", borderRadius: "4px", fontSize: "12px", cursor: "pointer", color: "#DC2626" }}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ALARMES ──
// ══════════════════════════════════════════════════════════════════════════════
function AlarmesTab() {
  const [alarms, setAlarms]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState(0);
  const [stFilter, setStFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get("/employee/alarms").then(r => setAlarms(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const stations = [...new Set(alarms.map(a => a.station_name).filter(Boolean))];
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  alarms.forEach(a => { if (counts[a.lev] != null) counts[a.lev]++; });
  const visible = alarms.filter(a => {
    if (filter !== 0 && a.lev !== filter) return false;
    if (stFilter !== "all" && a.station_name !== stFilter) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C" }}>Alarmes</h1>
        <LivePill label="Toutes les installations" />
      </div>

      <div style={{ padding: "0 2rem 2rem" }}>
        {/* Summary chips */}
        {alarms.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map(lev => counts[lev] > 0 && (
              <span key={lev} style={{ background: ALARM_SEV[lev].bg, color: ALARM_SEV[lev].text, border: `1px solid ${ALARM_SEV[lev].border}`, borderRadius: "6px", padding: "4px 12px", fontSize: "13px", fontWeight: "600" }}>
                {counts[lev]} {ALARM_LABEL[lev]}
              </span>
            ))}
          </div>
        )}

        {/* Filter row */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          {[[0,"Tous"],[1,"Critique"],[2,"Majeure"],[3,"Mineure"],[4,"Avert."]].map(([lev, lbl]) => {
            const sel = filter === lev;
            const sev = lev > 0 ? ALARM_SEV[lev] : null;
            return (
              <button key={lev} onClick={() => setFilter(lev)} style={{
                padding: "0.4rem 1rem", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
                fontWeight: sel ? "600" : "400",
                border: sel ? `2px solid ${sev ? sev.text : "#374151"}` : "1px solid #E2E8F0",
                background: sel ? (sev ? sev.bg : "#F1F5F9") : "#fff",
                color: sel ? (sev ? sev.text : "#374151") : "#6B7280",
              }}>{lbl} ({lev === 0 ? alarms.length : counts[lev]})</button>
            );
          })}
          {stations.length > 1 && (
            <select value={stFilter} onChange={e => setStFilter(e.target.value)}
              style={{ padding: "0.4rem 0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px", marginLeft: "auto" }}>
              <option value="all">Toutes les installations</option>
              {stations.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>

        {/* Alarm cards */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: "3rem" }}>Chargement...</div>
        ) : visible.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "2.5rem", color: "#16A34A" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: "600" }}><CheckCircle size={18} style={{ verticalAlign: "middle", marginRight: "6px" }} /> Aucune alarme active pour le moment</p>
          </div>
        ) : visible.map((a, i) => {
          const sev = ALARM_SEV[a.lev] || { bg: "#F8FAFC", text: "#6B7280", border: "#E2E8F0" };
          const open = expanded === i;
          const dateStr = a.raiseTime ? new Date(a.raiseTime).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "--";

          return (
            <div key={i} onClick={() => setExpanded(open ? null : i)} style={{ ...card, marginBottom: "8px", cursor: "pointer", borderLeft: `4px solid ${sev.text}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ width: "42px", height: "42px", background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  {a.lev === 1 ? <AlertTriangle size={20} /> : a.lev === 2 ? <Flame size={20} /> : a.lev === 4 ? <Radio size={20} /> : <Zap size={20} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontWeight: "600", fontSize: "15px", color: "#1A202C" }}>{a.alarmName || "Alarme"}</p>
                      <p style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>
                        <MapPin size={12} style={{ verticalAlign: "middle" }} /> {a.station_name || a.station_code} · <Wrench size={12} style={{ verticalAlign: "middle" }} /> {a.devName || "--"} · {dateStr}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span style={{ background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, borderRadius: "6px", padding: "2px 10px", fontSize: "12px", fontWeight: "600" }}>
                        {ALARM_LABEL[a.lev] || "—"}
                      </span>
                      <span style={{ color: "#94A3B8" }}>{open ? "∧" : "∨"}</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F1F5F9" }}>
                      {a.alarmCause   && <p style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}><strong>Cause:</strong> {a.alarmCause}</p>}
                      {a.alarmSuggest && <p style={{ fontSize: "13px", color: "#374151" }}><strong>Action Suggérée:</strong> {a.alarmSuggest}</p>}
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

// ══════════════════════════════════════════════════════════════════════════════
// ── MISSIONS ──
// ══════════════════════════════════════════════════════════════════════════════
const IV_STATUS = {
  en_attente: { label: "En attente",  bg: "#F1F5F9", text: "#64748B", border: "#CBD5E1" },
  acceptee:   { label: "Acceptée",    bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  planifiee:  { label: "Planifiée",   bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  en_cours:   { label: "En cours",    bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  terminee:   { label: "Terminée",    bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  cloturee:   { label: "Clôturée",    bg: "#F8FAFC", text: "#475569", border: "#CBD5E1" },
};
const IV_TYPE_LABEL = { nettoyage: "Nettoyage", maintenance: "Maintenance", inspection: "Inspection", urgence: "Urgence" };
const IV_PRIO = {
  critique: { label: "Critique", bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  haute:    { label: "Haute",    bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  normale:  { label: "Normale",  bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  basse:    { label: "Basse",    bg: "#F1F5F9", text: "#64748B", border: "#CBD5E1" },
};

function MissionsTab({ clients }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [stFilter, setStFilter] = useState("all");
  const [idFilter, setIdFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Inline action state (per-card, keyed by mission id)
  const [schedDate, setSchedDate]       = useState("");
  const [noteText, setNoteText]         = useState("");
  const [resolutionText, setResolutionText] = useState("");

  const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c.full_name]));

  useEffect(() => {
    api.get("/employee/interventions")
      .then(r => setMissions(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateMission(id, patch) {
    setActionLoading(id);
    try {
      const res = await api.patch(`/employee/interventions/${id}`, patch);
      setMissions(prev => prev.map(m => m.id === id ? res.data : m));
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }

  // Filter by station + ID
  const stationCodes = [...new Set(missions.map(m => m.station_code))];
  const filtered = missions.filter(m => {
    if (stFilter !== "all" && m.station_code !== stFilter) return false;
    if (idFilter && !String(m.id).padStart(4, "0").includes(idFilter.replace(/^INT-?/i, ""))) return false;
    return true;
  });

  // Split into 3 columns
  const colNew    = filtered.filter(m => m.status === "en_attente");
  const colActive = filtered.filter(m => ["acceptee", "planifiee", "en_cours"].includes(m.status));
  const colDone   = filtered.filter(m => ["terminee", "cloturee"].includes(m.status));

  const COLUMNS = [
    { key: "new",    title: "Nouvelles",  color: "#F59E0B", items: colNew },
    { key: "active", title: "En cours",   color: "#2563EB", items: colActive },
    { key: "done",   title: "Terminées",  color: "#16A34A", items: colDone },
  ];

  // ── Render a single mission card ──
  function renderCard(m) {
    const st = IV_STATUS[m.status] || IV_STATUS.en_attente;
    const pr = IV_PRIO[m.priority] || IV_PRIO.normale;
    const isOpen = expanded === m.id;
    const isActioning = actionLoading === m.id;
    const clientName = m.client_name || clientMap[m.client_id] || "Client";

    return (
      <div key={m.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "10px", borderLeft: `4px solid ${pr.text}`, overflow: "hidden" }}>
        {/* Card header */}
        <div style={{ padding: "0.75rem 1rem", cursor: "pointer" }} onClick={() => {
          setExpanded(isOpen ? null : m.id);
          setSchedDate(m.scheduled_date || "");
          setNoteText(m.employee_notes || "");
          setResolutionText(m.resolution || "");
        }}>
          {/* ID + type */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#6366F1", fontWeight: "700" }}>
                INT-{String(m.id).padStart(4, "0")}
              </span>
              <span style={{ fontWeight: "700", fontSize: "13px", color: "#1A202C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {IV_TYPE_LABEL[m.type] || m.type}
              </span>
            </div>
            {isOpen ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
          </div>

          {/* Badges row */}
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span style={{ background: pr.bg, color: pr.text, border: `1px solid ${pr.border}`, borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: "600" }}>
              {pr.label}
            </span>
            {m.status !== "en_attente" && (
              <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: "600" }}>
                {st.label}
              </span>
            )}
            {m.scheduled_date && (
              <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px", color: "#7C3AED" }}>
                <CalendarDays size={10} /> {m.scheduled_date}
              </span>
            )}
          </div>

          {/* Client + station */}
          <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "2px" }}>
            <MapPin size={10} style={{ verticalAlign: "middle" }} /> {m.station_name || m.station_code}
          </p>
          <p style={{ fontSize: "12px", color: "#374151" }}>
            Client: <strong>{clientName}</strong>
          </p>

          {m.description && !isOpen && (
            <p style={{ fontSize: "11px", color: "#6B7280", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.description}
            </p>
          )}
        </div>

        {/* ── Expanded detail ── */}
        {isOpen && (
          <div style={{ padding: "0 1rem 0.75rem", borderTop: "1px solid #F1F5F9" }}>
            {/* Description */}
            {m.description && (
              <p style={{ fontSize: "12px", color: "#374151", marginTop: "8px", marginBottom: "8px" }}>{m.description}</p>
            )}

            {/* Alarm origin */}
            <div style={{ background: "#F8FAFC", borderRadius: "6px", padding: "8px 10px", marginBottom: "8px" }}>
              <p style={{ fontSize: "11px", color: "#6B7280", marginBottom: "2px" }}>Alarme d'origine</p>
              <p style={{ fontSize: "12px", color: "#374151" }}>
                <strong>{m.alarm_name}</strong> — {ALARM_LABEL[m.alarm_severity] || "Sév. " + m.alarm_severity}
              </p>
            </div>

            {/* Notes (editable) */}
            <div style={{ marginBottom: "8px" }}>
              <p style={{ fontSize: "11px", color: "#6B7280", marginBottom: "3px" }}>Notes technicien</p>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                placeholder="Ajouter des notes..."
                style={{ width: "100%", padding: "6px", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", minHeight: "40px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              {noteText !== (m.employee_notes || "") && (
                <button onClick={() => updateMission(m.id, { employee_notes: noteText })} disabled={isActioning}
                  style={{ marginTop: "3px", padding: "3px 10px", background: "#2563EB", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>
                  Sauvegarder
                </button>
              )}
            </div>

            {/* Resolution (if exists) */}
            {m.resolution && (
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "6px", padding: "6px 10px", marginBottom: "8px" }}>
                <p style={{ fontWeight: "600", color: "#16A34A", fontSize: "11px", marginBottom: "2px" }}>Résolution</p>
                <p style={{ fontSize: "12px", color: "#374151" }}>{m.resolution}</p>
              </div>
            )}

            {/* ── Actions ── */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "flex-end" }}>

              {m.status === "en_attente" && (
                <>
                  <button onClick={() => updateMission(m.id, { status: "acceptee" })} disabled={isActioning}
                    style={{ display: "flex", alignItems: "center", gap: "3px", padding: "6px 12px", background: "#2563EB", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                    <Check size={12} /> Accepter
                  </button>
                  <button onClick={() => {
                    const reason = window.prompt("Raison du refus:");
                    if (reason != null) updateMission(m.id, { status: "cloturee", employee_notes: `Refusée: ${reason}` });
                  }} disabled={isActioning}
                    style={{ display: "flex", alignItems: "center", gap: "3px", padding: "6px 12px", background: "#fff", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                    <X size={12} /> Refuser
                  </button>
                </>
              )}

              {m.status === "acceptee" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                    style={{ padding: "4px 6px", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", flex: 1 }} />
                  <button onClick={() => { if (schedDate) updateMission(m.id, { scheduled_date: schedDate }); }} disabled={isActioning || !schedDate}
                    style={{ padding: "6px 12px", background: "#7C3AED", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer", opacity: schedDate ? 1 : 0.5, whiteSpace: "nowrap" }}>
                    Planifier
                  </button>
                </div>
              )}

              {m.status === "planifiee" && (
                <>
                  <button onClick={() => updateMission(m.id, { status: "en_cours" })} disabled={isActioning}
                    style={{ display: "flex", alignItems: "center", gap: "3px", padding: "6px 12px", background: "#EA580C", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                    <Play size={12} /> Commencer
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                    <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                      style={{ padding: "4px 6px", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", flex: 1 }} />
                    <button onClick={() => { if (schedDate) updateMission(m.id, { scheduled_date: schedDate }); }} disabled={isActioning || !schedDate}
                      style={{ padding: "6px 10px", background: "#fff", color: "#7C3AED", border: "1px solid #DDD6FE", borderRadius: "6px", fontSize: "11px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>
                      Replanifier
                    </button>
                  </div>
                </>
              )}

              {m.status === "en_cours" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
                  <textarea value={resolutionText} onChange={e => setResolutionText(e.target.value)}
                    placeholder="Décrivez ce qui a été fait..."
                    style={{ width: "100%", padding: "6px", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "12px", minHeight: "40px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                  <button onClick={() => updateMission(m.id, { status: "terminee", resolution: resolutionText || "Intervention terminée" })} disabled={isActioning}
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "3px", padding: "6px 14px", background: "#16A34A", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                    <Check size={12} /> Terminer
                  </button>
                </div>
              )}

              {m.status === "terminee" && (
                <button onClick={() => updateMission(m.id, { status: "cloturee" })} disabled={isActioning}
                  style={{ display: "flex", alignItems: "center", gap: "3px", padding: "6px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
                  <Check size={12} /> Clôturer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem 1rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1A202C" }}>Missions</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input
              type="text"
              placeholder="INT-0001"
              value={idFilter}
              onChange={e => setIdFilter(e.target.value)}
              style={{ padding: "0.4rem 0.5rem 0.4rem 1.75rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px", width: "120px", outline: "none" }}
            />
          </div>
          {stationCodes.length > 1 && (
            <select value={stFilter} onChange={e => setStFilter(e.target.value)}
              style={{ padding: "0.4rem 0.5rem", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "13px" }}>
              <option value="all">Toutes les installations</option>
              {stationCodes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <LivePill label="Interventions terrain" />
        </div>
      </div>

      <div style={{ padding: "0 2rem 2rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: "3rem" }}>Chargement...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", alignItems: "start" }}>
            {COLUMNS.map(col => (
              <div key={col.key} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", borderTop: `4px solid ${col.color}` }}>
                {/* Column header */}
                <div style={{ padding: "1rem 1rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: "700", fontSize: "15px", color: "#1A202C" }}>{col.title}</span>
                  <span style={{ background: col.color + "18", color: col.color, borderRadius: "999px", padding: "2px 10px", fontSize: "13px", fontWeight: "700" }}>
                    {col.items.length}
                  </span>
                </div>

                {/* Column body */}
                <div style={{ padding: "0 0.75rem 0.75rem", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {col.items.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem 0.5rem", color: "#94A3B8", fontSize: "13px" }}>
                      {col.key === "new" ? "Aucune nouvelle demande" : col.key === "active" ? "Aucune mission en cours" : "Aucune mission terminée"}
                    </div>
                  ) : col.items.map(m => renderCard(m))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
