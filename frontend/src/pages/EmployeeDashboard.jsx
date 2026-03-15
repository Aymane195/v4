import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const ALARM_COLOR = { 1: "#EF4444", 2: "#F97316", 3: "#F59E0B", 4: "#60A5FA" };
const ALARM_LABEL = { 1: "Critique", 2: "Majeur", 3: "Mineur", 4: "Avertissement" };

const soilingColor = s =>
  s === "clean" ? "#10B981" : s === "light_soiling" ? "#F59E0B" : s === "moderate_soiling" ? "#F97316" : "#EF4444";
const soilingLabel = s =>
  s === "clean" ? "Propre" : s === "light_soiling" ? "Léger" : s === "moderate_soiling" ? "Modéré" : "Critique";

function healthInfo(state) {
  if (state === 3) return { color: "#10B981", label: "En ligne" };
  if (state === 2) return { color: "#F97316", label: "En panne" };
  if (state === 1) return { color: "#EF4444", label: "Hors ligne" };
  return { color: "#64748B", label: "Inconnu" };
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ allStations, stationKpi, stationSoiling, stationAlarms, clients }) {
  const [filter, setFilter] = useState("tous");

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.full_name]));

  // Fleet summary
  const total   = allStations.length;
  const offline = allStations.filter(st => stationKpi[st.station_code]?.real_health_state === 1).length;
  const faulty  = allStations.filter(st => stationKpi[st.station_code]?.real_health_state === 2).length;
  const prValues = allStations.map(st => stationKpi[st.station_code]?.performance_ratio).filter(v => v != null);
  const avgPR   = prValues.length ? (prValues.reduce((a, b) => a + b, 0) / prValues.length * 100).toFixed(0) : "--";

  const filtered = allStations.filter(st => {
    const kpi  = stationKpi[st.station_code] || {};
    const soil = stationSoiling[st.station_code];
    if (filter === "panne")   return kpi.real_health_state === 2 || kpi.real_health_state === 1;
    if (filter === "alarmes") return (stationAlarms[st.station_code] || 0) > 0;
    if (filter === "sales")   return soil && soil.status !== "clean";
    return true;
  });

  return (
    <div style={s.content}>
      {/* Fleet summary */}
      <div style={s.summaryBar}>
        <div style={s.summaryItem}>
          <span style={s.summaryVal}>{total}</span>
          <span style={s.summaryLbl}>Installations</span>
        </div>
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, color: offline + faulty > 0 ? "#EF4444" : "#10B981" }}>{offline + faulty}</span>
          <span style={s.summaryLbl}>Hors ligne / En panne</span>
        </div>
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, color: "#F59E0B" }}>{avgPR}%</span>
          <span style={s.summaryLbl}>Rendement moy.</span>
        </div>
      </div>

      {/* Filter row */}
      <div style={s.filterRow}>
        {[["tous","Tous"],["panne","En panne"],["alarmes","Alarmes"],["sales","Encrassés"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ ...s.filterBtn, ...(filter === id ? s.filterActive : {}) }}>
            {lbl}
          </button>
        ))}
      </div>

      <p style={s.sectionTitle}>Installations ({filtered.length})</p>

      {filtered.length === 0 ? (
        <div style={s.empty}>Aucune installation dans cette catégorie.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map(st => {
            const kpi   = stationKpi[st.station_code] || {};
            const soil  = stationSoiling[st.station_code];
            const alarmN = stationAlarms[st.station_code] || 0;
            const health = healthInfo(kpi.real_health_state);
            const pr     = kpi.performance_ratio != null ? (kpi.performance_ratio * 100).toFixed(0) + "%" : "--";
            const clientName = clientMap[st.client_id] || "--";

            return (
              <div key={st.station_code} style={{ ...s.stationCard, borderLeftColor: health.color }}>
                {/* Card header */}
                <div style={s.stationHeader}>
                  <div style={{ flex: 1 }}>
                    <p style={s.stationName}>{st.station_name || st.station_code}</p>
                    <p style={s.stationCode}>{st.station_code} · 👤 {clientName}</p>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ ...s.badge, background: health.color + "22", color: health.color, borderColor: health.color + "44" }}>
                      {health.label}
                    </span>
                    {soil && (
                      <span style={{ ...s.badge, background: soilingColor(soil.status) + "22", color: soilingColor(soil.status), borderColor: soilingColor(soil.status) + "44" }}>
                        {soilingLabel(soil.status)}
                      </span>
                    )}
                    {alarmN > 0 && (
                      <span style={{ ...s.badge, background: "rgba(239,68,68,0.15)", color: "#FCA5A5", borderColor: "rgba(239,68,68,0.3)" }}>
                        🔔 {alarmN}
                      </span>
                    )}
                  </div>
                </div>

                {/* KPI row */}
                <div style={s.kpiRow}>
                  <div style={s.kpiItem}>
                    <span style={s.kpiVal}>{kpi.inverter_power ?? "--"}</span>
                    <span style={s.kpiUnit}>kW</span>
                    <span style={s.kpiLbl}>Puissance</span>
                  </div>
                  <div style={s.kpiItem}>
                    <span style={s.kpiVal}>{kpi.day_power ?? "--"}</span>
                    <span style={s.kpiUnit}>kWh</span>
                    <span style={s.kpiLbl}>Aujourd'hui</span>
                  </div>
                  <div style={s.kpiItem}>
                    <span style={s.kpiVal}>{kpi.total_power ?? "--"}</span>
                    <span style={s.kpiUnit}>kWh</span>
                    <span style={s.kpiLbl}>Total</span>
                  </div>
                  <div style={s.kpiItem}>
                    <span style={{ ...s.kpiVal, color: "#10B981" }}>{pr}</span>
                    <span style={s.kpiLbl}>Rendement</span>
                  </div>
                  {soil && (
                    <div style={s.kpiItem}>
                      <span style={{ ...s.kpiVal, color: soilingColor(soil.status) }}>
                        {(soil.soiling_index * 100).toFixed(1)}%
                      </span>
                      <span style={s.kpiLbl}>Encrassement</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Clients Tab ──────────────────────────────────────────────────────────────

function ClientsTab({ clients, allStations, stationKpi, stationSoiling }) {
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientStations, setClientStations] = useState([]);
  const [newStation, setNewStation] = useState({ station_code: "", station_name: "" });
  const [msg, setMsg] = useState("");

  async function selectClient(c) {
    setSelectedClient(c);
    const res = await api.get(`/employee/clients/${c.id}/stations`);
    setClientStations(res.data);
  }

  async function assignStation(e) {
    e.preventDefault();
    if (!selectedClient || !newStation.station_code) return;
    try {
      await api.post(`/employee/clients/${selectedClient.id}/stations`, newStation);
      const res = await api.get(`/employee/clients/${selectedClient.id}/stations`);
      setClientStations(res.data);
      setNewStation({ station_code: "", station_name: "" });
      setMsg("Installation assignée avec succès.");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setMsg(err.response?.data?.detail || "Erreur lors de l'assignation");
    }
  }

  async function removeStation(clientId, code) {
    await api.delete(`/employee/clients/${clientId}/stations/${code}`);
    setClientStations(prev => prev.filter(s => s.station_code !== code));
  }

  return (
    <div style={s.content}>
      <div style={s.twoCol}>
        {/* Client list */}
        <div>
          <p style={s.sectionTitle}>Clients ({clients.length})</p>
          {clients.map(c => {
            const cStations = allStations.filter(st => st.client_id === c.id);
            const hasIssue  = cStations.some(st => {
              const h = stationKpi[st.station_code]?.real_health_state;
              return h === 1 || h === 2;
            });
            return (
              <div key={c.id} onClick={() => selectClient(c)}
                style={{ ...s.clientCard, ...(selectedClient?.id === c.id ? s.clientActive : {}) }}>
                <div style={{ ...s.clientAvatar, background: hasIssue ? "#EF4444" : "#F59E0B" }}>
                  {c.full_name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={s.clientName}>{c.full_name}</p>
                  <p style={s.clientEmail}>{c.email}</p>
                </div>
                <span style={{ color: "#94A3B8", fontSize: "12px" }}>{cStations.length} inst.</span>
              </div>
            );
          })}
        </div>

        {/* Station assignment */}
        {selectedClient && (
          <div>
            <p style={s.sectionTitle}>Installations — {selectedClient.full_name}</p>
            {msg && <div style={s.msgBox}>{msg}</div>}
            <form onSubmit={assignStation} style={s.assignForm}>
              <input style={s.input} placeholder="Code station (FusionSolar)"
                value={newStation.station_code}
                onChange={e => setNewStation({ ...newStation, station_code: e.target.value })} required />
              <input style={s.input} placeholder="Nom de l'installation (optionnel)"
                value={newStation.station_name}
                onChange={e => setNewStation({ ...newStation, station_name: e.target.value })} />
              <button type="submit" style={s.assignBtn}>+ Assigner</button>
            </form>
            <div style={{ marginTop: "1rem" }}>
              {clientStations.length === 0 ? (
                <p style={{ color: "#94A3B8", fontSize: "13px" }}>Aucune installation assignée.</p>
              ) : clientStations.map(st => {
                const kpi   = stationKpi[st.station_code] || {};
                const health = healthInfo(kpi.real_health_state);
                return (
                  <div key={st.id} style={s.assignedStation}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <p style={{ fontWeight: 600, fontSize: "14px" }}>{st.station_name || st.station_code}</p>
                        <span style={{ ...s.badge, background: health.color + "22", color: health.color, borderColor: health.color + "44", fontSize: "10px" }}>
                          {health.label}
                        </span>
                      </div>
                      <p style={{ color: "#94A3B8", fontSize: "12px" }}>{st.station_code}</p>
                      <p style={{ color: "#94A3B8", fontSize: "12px" }}>
                        {kpi.day_power != null ? `${kpi.day_power} kWh aujourd'hui` : "Pas de données"}
                        {kpi.total_power != null ? ` · ${kpi.total_power} kWh total` : ""}
                      </p>
                    </div>
                    <button onClick={() => removeStation(selectedClient.id, st.station_code)} style={s.removeBtn}>
                      Retirer
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alertes Tab ──────────────────────────────────────────────────────────────

function AlertesTab() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(0);
  const [stationFilter, setStationFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get("/employee/alarms")
      .then(res => setAlarms(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stations = [...new Set(alarms.map(a => a.station_name).filter(Boolean))];

  const visible = alarms.filter(a => {
    if (filter !== 0 && a.lev !== filter) return false;
    if (stationFilter !== "all" && a.station_name !== stationFilter) return false;
    return true;
  });

  const countBy = lev => alarms.filter(a => a.lev === lev).length;

  return (
    <div style={s.content}>
      <p style={s.sectionTitle}>Alarmes — Toutes installations</p>

      {/* Summary chips */}
      {alarms.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          {[1, 2, 3, 4].map(lev => countBy(lev) > 0 && (
            <span key={lev} style={{ background: ALARM_COLOR[lev] + "22", color: ALARM_COLOR[lev], border: `1px solid ${ALARM_COLOR[lev]}44`, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 600 }}>
              {countBy(lev)} {ALARM_LABEL[lev]}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      {alarms.length > 0 && (
        <>
          <div style={s.filterRow}>
            {[[0, "Tous"], [1, "Critique"], [2, "Majeur"], [3, "Mineur"], [4, "Avert."]].map(([lev, lbl]) => (
              <button key={lev} onClick={() => setFilter(lev)}
                style={{ ...s.filterBtn, ...(filter === lev ? s.filterActive : {}) }}>
                {lbl}
              </button>
            ))}
          </div>
          {stations.length > 1 && (
            <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} style={{ ...s.input, marginBottom: "0.5rem" }}>
              <option value="all">Toutes les installations</option>
              {stations.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </>
      )}

      {loading ? (
        <div style={s.empty}>Chargement des alarmes...</div>
      ) : visible.length === 0 ? (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "12px", padding: "1.5rem", textAlign: "center", color: "#6EE7B7", fontSize: "14px" }}>
          ✓ Aucune alarme active pour le moment
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {visible.map((a, i) => {
            const color  = ALARM_COLOR[a.lev] || "#94A3B8";
            const isOpen = expanded === i;
            return (
              <div key={i} onClick={() => setExpanded(isOpen ? null : i)}
                style={{ background: "#1E293B", border: "1px solid #334155", borderLeft: `4px solid ${color}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p style={{ fontWeight: 600, fontSize: "14px", flex: 1, paddingRight: "8px" }}>{a.alarmName || "Alarme"}</p>
                  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                    {ALARM_LABEL[a.lev] || `Niv.${a.lev}`}
                  </span>
                </div>
                <p style={{ color: "#94A3B8", fontSize: "12px", marginTop: "4px" }}>
                  📍 {a.station_name} · 🔧 {a.devName || "--"}
                </p>
                <p style={{ color: "#64748B", fontSize: "11px", marginTop: "2px" }}>
                  {a.raiseTime ? new Date(a.raiseTime).toLocaleString("fr-FR") : ""}
                </p>
                {isOpen && (
                  <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #334155", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {a.alarmCause && <p style={{ fontSize: "13px", color: "#CBD5E1" }}><b>Cause:</b> {a.alarmCause}</p>}
                    {a.alarmSuggest && <p style={{ fontSize: "13px", color: "#CBD5E1" }}><b>Suggestion:</b> {a.alarmSuggest}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [stationKpi, setStationKpi] = useState({});
  const [stationSoiling, setStationSoiling] = useState({});
  const [stationAlarms, setStationAlarms] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function fetchAll() {
      try {
        const [clientsRes, stationsRes] = await Promise.all([
          api.get("/employee/clients"),
          api.get("/employee/stations"),
        ]);
        setClients(clientsRes.data);
        setAllStations(stationsRes.data);

        const kpiMap = {}, soilingMap = {}, alarmMap = {};
        await Promise.all(
          stationsRes.data.map(async (s) => {
            try {
              const [kpiRes, soilRes] = await Promise.all([
                api.get(`/employee/stations/${s.station_code}/kpi/realtime`),
                api.get(`/soiling/station/${s.station_code}`),
              ]);
              kpiMap[s.station_code] = kpiRes.data?.data?.[0]?.dataItemMap || {};
              soilingMap[s.station_code] = soilRes.data;
            } catch {
              kpiMap[s.station_code] = {};
              soilingMap[s.station_code] = null;
            }
            try {
              const alarmRes = await api.get(`/employee/stations/${s.station_code}/alarms`);
              alarmMap[s.station_code] = (alarmRes.data?.data || []).length;
            } catch {
              alarmMap[s.station_code] = 0;
            }
          })
        );
        setStationKpi(kpiMap);
        setStationSoiling(soilingMap);
        setStationAlarms(alarmMap);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    fetchAll();
    const interval = setInterval(fetchAll, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div style={s.page}>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <span style={{ fontSize: "3rem" }}>☀️</span>
        <p style={{ color: "#94A3B8" }}>Chargement...</p>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.appName}>☀️ Solar AI Monitor</p>
          <p style={s.sub}>Tableau de bord employé — {user?.full_name}</p>
        </div>
        <button onClick={logout} style={s.logoutBtn}>Déconnexion</button>
      </div>

      {/* Tab nav */}
      <div style={s.tabNav}>
        {[
          { id: "overview", label: `Vue d'ensemble` },
          { id: "clients",  label: `Clients (${clients.length})` },
          { id: "alertes",  label: "Alarmes" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ ...s.tabBtn, ...(activeTab === t.id ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab allStations={allStations} stationKpi={stationKpi} stationSoiling={stationSoiling} stationAlarms={stationAlarms} clients={clients} />
      )}
      {activeTab === "clients" && (
        <ClientsTab clients={clients} allStations={allStations} stationKpi={stationKpi} stationSoiling={stationSoiling} />
      )}
      {activeTab === "alertes" && <AlertesTab />}
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid #334155" },
  appName: { fontWeight: "700", fontSize: "1rem" },
  sub: { color: "#94A3B8", fontSize: "12px", marginTop: "2px" },
  logoutBtn: { padding: "6px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "8px", fontSize: "13px" },
  tabNav: { display: "flex", borderBottom: "1px solid #334155", padding: "0 1.25rem" },
  tabBtn: { padding: "10px 16px", background: "none", border: "none", color: "#94A3B8", fontSize: "13px", fontWeight: "500", borderBottom: "2px solid transparent", cursor: "pointer" },
  tabActive: { color: "#F59E0B", borderBottomColor: "#F59E0B" },
  content: { padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" },
  sectionTitle: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" },
  empty: { color: "#94A3B8", fontSize: "14px", textAlign: "center", padding: "2rem" },
  summaryBar: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" },
  summaryItem: { background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" },
  summaryVal: { fontSize: "1.4rem", fontWeight: "800", color: "#F59E0B" },
  summaryLbl: { fontSize: "10px", color: "#94A3B8", textTransform: "uppercase", textAlign: "center" },
  filterRow: { display: "flex", gap: "6px", flexWrap: "wrap" },
  filterBtn: { padding: "5px 12px", background: "#1E293B", border: "1px solid #334155", color: "#94A3B8", borderRadius: "999px", fontSize: "12px", cursor: "pointer" },
  filterActive: { background: "rgba(245,158,11,0.15)", borderColor: "#F59E0B", color: "#F59E0B", fontWeight: "600" },
  stationCard: { background: "#1E293B", border: "1px solid #334155", borderLeft: "4px solid #334155", borderRadius: "12px", padding: "1rem" },
  stationHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "8px" },
  stationName: { fontWeight: "600", fontSize: "14px" },
  stationCode: { color: "#94A3B8", fontSize: "12px", marginTop: "2px" },
  badge: { fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "999px", border: "1px solid" },
  kpiRow: { display: "flex", gap: "1rem", flexWrap: "wrap" },
  kpiItem: { display: "flex", flexDirection: "column", gap: "1px" },
  kpiVal: { fontSize: "1rem", fontWeight: "700", color: "#F59E0B" },
  kpiUnit: { fontSize: "10px", color: "#94A3B8" },
  kpiLbl: { fontSize: "10px", color: "#94A3B8", textTransform: "uppercase" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1.5rem" },
  clientCard: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", marginBottom: "8px", cursor: "pointer" },
  clientActive: { borderColor: "#F59E0B", background: "rgba(245,158,11,0.08)" },
  clientAvatar: { width: "36px", height: "36px", borderRadius: "50%", color: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px", flexShrink: 0 },
  clientName: { fontWeight: "600", fontSize: "14px" },
  clientEmail: { color: "#94A3B8", fontSize: "12px" },
  assignForm: { display: "flex", flexDirection: "column", gap: "8px" },
  input: { padding: "0.65rem 0.875rem", background: "#0F172A", border: "1px solid #334155", borderRadius: "8px", color: "#F1F5F9", fontSize: "13px", width: "100%", boxSizing: "border-box" },
  assignBtn: { padding: "0.65rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#0F172A", fontWeight: "700", fontSize: "13px" },
  assignedStation: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", marginBottom: "8px", gap: "8px" },
  removeBtn: { padding: "4px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "6px", fontSize: "12px", flexShrink: 0 },
  msgBox: { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#6EE7B7", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", marginBottom: "10px" },
};
