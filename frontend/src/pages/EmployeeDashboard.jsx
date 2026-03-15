import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

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

  useEffect(() => {
    async function fetchAll() {
      try {
        const [clientsRes, stationsRes] = await Promise.all([
          api.get("/employee/clients"),
          api.get("/employee/stations"),
        ]);
        setClients(clientsRes.data);
        setAllStations(stationsRes.data);

        // Fetch KPI + soiling for each station
        const kpiMap = {};
        const soilingMap = {};
        await Promise.all(
          stationsRes.data.map(async (s) => {
            try {
              const [kpiRes, soilingRes] = await Promise.all([
                api.get(`/employee/stations/${s.station_code}/kpi/realtime`),
                api.get(`/soiling/station/${s.station_code}`),
              ]);
              kpiMap[s.station_code] = kpiRes.data?.data?.[0]?.dataItemMap || {};
              soilingMap[s.station_code] = soilingRes.data;
            } catch {
              kpiMap[s.station_code] = {};
              soilingMap[s.station_code] = null;
            }
          })
        );
        setStationKpi(kpiMap);
        setStationSoiling(soilingMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  async function selectClient(client) {
    setSelectedClient(client);
    const res = await api.get(`/employee/clients/${client.id}/stations`);
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
      setMsg("Station assigned successfully.");
    } catch (err) {
      setMsg(err.response?.data?.detail || "Error assigning station");
    }
  }

  async function removeStation(clientId, stationCode) {
    await api.delete(`/employee/clients/${clientId}/stations/${stationCode}`);
    setClientStations((prev) => prev.filter((s) => s.station_code !== stationCode));
  }

  const soilingColor = (status) =>
    status === "clean" ? "#48bb78"
    : status === "light_soiling" ? "#ecc94b"
    : status === "moderate_soiling" ? "#ed8936"
    : "#e53e3e";

  if (loading) return <div style={styles.loading}>Loading employee dashboard...</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>Employee Dashboard</h1>
          <p style={styles.headerSub}>Welcome, {user?.full_name}</p>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>Logout</button>
      </div>

      {/* All Stations Overview */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>All Stations Overview</h3>
        {allStations.length === 0 ? (
          <p style={{ color: "#718096" }}>No stations assigned to any client yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Station</th>
                <th style={styles.th}>Client ID</th>
                <th style={styles.th}>Power (kW)</th>
                <th style={styles.th}>Energy Today (kWh)</th>
                <th style={styles.th}>Soiling</th>
              </tr>
            </thead>
            <tbody>
              {allStations.map((s) => {
                const kpi = stationKpi[s.station_code] || {};
                const soil = stationSoiling[s.station_code];
                return (
                  <tr key={s.station_code}>
                    <td style={styles.td}>{s.station_name || s.station_code}</td>
                    <td style={styles.td}>{s.client_id}</td>
                    <td style={styles.td}>{kpi.inverter_power ?? "--"}</td>
                    <td style={styles.td}>{kpi.day_power ?? "--"}</td>
                    <td style={styles.td}>
                      {soil ? (
                        <span style={{ color: soilingColor(soil.status), fontWeight: "600" }}>
                          {(soil.soiling_index * 100).toFixed(1)}% — {soil.status.replace(/_/g, " ")}
                        </span>
                      ) : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Client Management */}
      <div style={styles.twoCol}>
        {/* Client list */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Clients</h3>
          {clients.map((c) => (
            <div
              key={c.id}
              style={{ ...styles.clientItem, background: selectedClient?.id === c.id ? "#ebf8ff" : "#fff" }}
              onClick={() => selectClient(c)}
            >
              <strong>{c.full_name}</strong>
              <span style={styles.emailBadge}>{c.email}</span>
            </div>
          ))}
        </div>

        {/* Station assignment */}
        {selectedClient && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Stations for {selectedClient.full_name}</h3>
            {msg && <p style={styles.msg}>{msg}</p>}
            <form onSubmit={assignStation} style={styles.assignForm}>
              <input
                style={styles.input}
                placeholder="Station code (from FusionSolar)"
                value={newStation.station_code}
                onChange={(e) => setNewStation({ ...newStation, station_code: e.target.value })}
                required
              />
              <input
                style={styles.input}
                placeholder="Station name (optional)"
                value={newStation.station_name}
                onChange={(e) => setNewStation({ ...newStation, station_name: e.target.value })}
              />
              <button type="submit" style={styles.assignBtn}>Assign</button>
            </form>
            <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
              {clientStations.map((s) => (
                <li key={s.id} style={styles.stationItem}>
                  <span><strong>{s.station_name || s.station_code}</strong> <code style={styles.code}>{s.station_code}</code></span>
                  <button style={styles.removeBtn} onClick={() => removeStation(selectedClient.id, s.station_code)}>Remove</button>
                </li>
              ))}
              {clientStations.length === 0 && <p style={{ color: "#718096" }}>No stations assigned.</p>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: "1200px", margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" },
  loading: { textAlign: "center", padding: "4rem", fontSize: "1.2rem", color: "#718096" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" },
  headerTitle: { margin: 0, fontSize: "1.8rem", color: "#1a202c" },
  headerSub: { margin: "0.25rem 0 0", color: "#718096" },
  logoutBtn: { padding: "0.5rem 1.25rem", background: "#e2e8f0", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  card: { background: "#fff", padding: "1.5rem", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "1.5rem" },
  cardTitle: { margin: "0 0 1rem", fontSize: "1.1rem", color: "#2d3748" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.5rem 0.75rem", background: "#f7fafc", color: "#4a5568", fontSize: "0.85rem", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "0.5rem 0.75rem", borderBottom: "1px solid #e2e8f0", color: "#4a5568", fontSize: "0.9rem" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" },
  clientItem: { padding: "0.75rem", borderRadius: "8px", marginBottom: "0.5rem", cursor: "pointer", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  emailBadge: { color: "#718096", fontSize: "0.8rem" },
  assignForm: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  input: { flex: 1, padding: "0.6rem", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "0.9rem", minWidth: "140px" },
  assignBtn: { padding: "0.6rem 1.25rem", background: "#f6ad55", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  stationItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid #e2e8f0" },
  removeBtn: { padding: "0.25rem 0.75rem", background: "#fed7d7", color: "#c53030", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" },
  code: { background: "#edf2f7", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.8rem" },
  msg: { padding: "0.5rem 0.75rem", background: "#c6f6d5", borderRadius: "6px", color: "#276749", marginBottom: "0.75rem" },
};
