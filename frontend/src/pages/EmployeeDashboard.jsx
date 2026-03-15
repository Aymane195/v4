import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const soilingColor = (status) =>
  status === "clean" ? "#10B981"
  : status === "light_soiling" ? "#F59E0B"
  : status === "moderate_soiling" ? "#F97316"
  : "#EF4444";

const soilingLabel = (status) =>
  status === "clean" ? "Propre"
  : status === "light_soiling" ? "Léger"
  : status === "moderate_soiling" ? "Modéré"
  : "Critique";

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientStations, setClientStations] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [stationKpi, setStationKpi] = useState({});
  const [stationSoiling, setStationSoiling] = useState({});
  const [newStation, setNewStation] = useState({ station_code: "", station_name: "" });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
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
        const kpiMap = {}, soilingMap = {};
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
          })
        );
        setStationKpi(kpiMap);
        setStationSoiling(soilingMap);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    fetchAll();
  }, []);

  async function selectClient(c) {
    setSelectedClient(c);
    setActiveTab("clients");
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

  if (loading) return (
    <div style={s.page}>
      <div style={s.loadingWrap}><span style={s.loadingDot}>☀️</span><p style={{ color: "#94A3B8" }}>Chargement...</p></div>
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
          { id: "overview", label: "Vue d'ensemble" },
          { id: "clients", label: `Clients (${clients.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ ...s.tabBtn, ...(activeTab === t.id ? s.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div style={s.content}>
          <p style={s.sectionTitle}>Toutes les installations ({allStations.length})</p>
          {allStations.length === 0 ? (
            <div style={s.empty}>Aucune installation assignée pour l'instant.</div>
          ) : (
            <div style={s.stationList}>
              {allStations.map(st => {
                const kpi = stationKpi[st.station_code] || {};
                const soil = stationSoiling[st.station_code];
                return (
                  <div key={st.station_code} style={s.stationCard}>
                    <div style={s.stationHeader}>
                      <div>
                        <p style={s.stationName}>{st.station_name || st.station_code}</p>
                        <p style={s.stationCode}>{st.station_code}</p>
                      </div>
                      {soil && (
                        <span style={{ ...s.soilingBadge, background: soilingColor(soil.status) + "22", color: soilingColor(soil.status), borderColor: soilingColor(soil.status) + "44" }}>
                          {soilingLabel(soil.status)}
                        </span>
                      )}
                    </div>
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
      )}

      {/* Clients tab */}
      {activeTab === "clients" && (
        <div style={s.content}>
          <div style={s.twoCol}>
            {/* Client list */}
            <div>
              <p style={s.sectionTitle}>Clients</p>
              {clients.map(c => (
                <div key={c.id}
                  onClick={() => selectClient(c)}
                  style={{ ...s.clientCard, ...(selectedClient?.id === c.id ? s.clientActive : {}) }}>
                  <div style={s.clientAvatar}>{c.full_name[0].toUpperCase()}</div>
                  <div>
                    <p style={s.clientName}>{c.full_name}</p>
                    <p style={s.clientEmail}>{c.email}</p>
                  </div>
                </div>
              ))}
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
                  ) : (
                    clientStations.map(st => (
                      <div key={st.id} style={s.assignedStation}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: "14px" }}>{st.station_name || st.station_code}</p>
                          <p style={{ color: "#94A3B8", fontSize: "12px" }}>{st.station_code}</p>
                        </div>
                        <button onClick={() => removeStation(selectedClient.id, st.station_code)} style={s.removeBtn}>
                          Retirer
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "system-ui, sans-serif" },
  loadingWrap: { height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" },
  loadingDot: { fontSize: "3rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid #334155" },
  appName: { fontWeight: "700", fontSize: "1rem" },
  sub: { color: "#94A3B8", fontSize: "12px", marginTop: "2px" },
  logoutBtn: { padding: "6px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "8px", fontSize: "13px" },
  tabNav: { display: "flex", gap: "0", borderBottom: "1px solid #334155", padding: "0 1.25rem" },
  tabBtn: { padding: "10px 16px", background: "none", border: "none", color: "#94A3B8", fontSize: "13px", fontWeight: "500", borderBottom: "2px solid transparent", cursor: "pointer" },
  tabActive: { color: "#F59E0B", borderBottomColor: "#F59E0B" },
  content: { padding: "1.25rem" },
  sectionTitle: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: "0.75rem" },
  empty: { color: "#94A3B8", fontSize: "14px", textAlign: "center", padding: "2rem" },
  stationList: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  stationCard: { background: "#1E293B", border: "1px solid #334155", borderRadius: "12px", padding: "1rem" },
  stationHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" },
  stationName: { fontWeight: "600", fontSize: "14px" },
  stationCode: { color: "#94A3B8", fontSize: "12px", marginTop: "2px" },
  soilingBadge: { fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "999px", border: "1px solid" },
  kpiRow: { display: "flex", gap: "1rem" },
  kpiItem: { display: "flex", flexDirection: "column", gap: "1px" },
  kpiVal: { fontSize: "1rem", fontWeight: "700", color: "#F59E0B" },
  kpiUnit: { fontSize: "10px", color: "#94A3B8" },
  kpiLbl: { fontSize: "10px", color: "#94A3B8", textTransform: "uppercase" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1.5rem" },
  clientCard: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", marginBottom: "8px", cursor: "pointer" },
  clientActive: { borderColor: "#F59E0B", background: "rgba(245,158,11,0.08)" },
  clientAvatar: { width: "36px", height: "36px", borderRadius: "50%", background: "#F59E0B", color: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "14px", flexShrink: 0 },
  clientName: { fontWeight: "600", fontSize: "14px" },
  clientEmail: { color: "#94A3B8", fontSize: "12px" },
  assignForm: { display: "flex", flexDirection: "column", gap: "8px" },
  input: { padding: "0.65rem 0.875rem", background: "#0F172A", border: "1px solid #334155", borderRadius: "8px", color: "#F1F5F9", fontSize: "13px" },
  assignBtn: { padding: "0.65rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#0F172A", fontWeight: "700", fontSize: "13px" },
  assignedStation: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "10px", marginBottom: "8px" },
  removeBtn: { padding: "4px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "6px", fontSize: "12px" },
  msgBox: { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#6EE7B7", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", marginBottom: "10px" },
};
