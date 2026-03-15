import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const [kpi, setKpi] = useState(null);
  const [daily, setDaily] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [soiling, setSoiling] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [kpiRes, stationsRes, alarmsRes] = await Promise.all([
          api.get("/client/kpi/realtime"),
          api.get("/client/stations"),
          api.get("/client/alarms"),
        ]);
        setKpi(kpiRes.data);
        setStations(stationsRes.data);
        setAlarms(alarmsRes.data);

        // Fetch daily KPI for chart
        const dailyRes = await api.get(`/client/kpi/daily?date=${today}`);
        setDaily(dailyRes.data);

        // Run soiling prediction for first station
        if (stationsRes.data.length > 0) {
          const code = stationsRes.data[0].station_code;
          const soilingRes = await api.get(`/soiling/station/${code}`);
          setSoiling(soilingRes.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // Extract KPI values from FusionSolar response
  const kpiItems = kpi?.data || [];
  const firstKpi = kpiItems[0]?.dataItemMap || {};

  const soilingColor =
    soiling?.status === "clean" ? "#48bb78"
    : soiling?.status === "light_soiling" ? "#ecc94b"
    : soiling?.status === "moderate_soiling" ? "#ed8936"
    : "#e53e3e";

  if (loading) return <div style={styles.loading}>Loading your dashboard...</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>My Solar Dashboard</h1>
          <p style={styles.headerSub}>Welcome, {user?.full_name}</p>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>Logout</button>
      </div>

      {/* KPI Cards */}
      <div style={styles.cardRow}>
        <KpiCard title="Current Power" value={`${firstKpi.inverter_power ?? "--"} kW`} color="#f6ad55" />
        <KpiCard title="Energy Today" value={`${firstKpi.day_power ?? "--"} kWh`} color="#68d391" />
        <KpiCard title="Total Energy" value={`${firstKpi.total_power ?? "--"} kWh`} color="#63b3ed" />
        <KpiCard title="CO₂ Reduced" value={`${firstKpi.reduce_carbon ?? "--"} kg`} color="#b794f4" />
      </div>

      {/* Soiling Index */}
      {soiling && (
        <div style={{ ...styles.card, borderLeft: `6px solid ${soilingColor}` }}>
          <h3 style={styles.cardTitle}>Panel Soiling Status</h3>
          <div style={styles.soilingRow}>
            <div>
              <span style={{ fontSize: "2rem", fontWeight: "700", color: soilingColor }}>
                {(soiling.soiling_index * 100).toFixed(1)}%
              </span>
              <span style={styles.soilingLabel}> soiling index</span>
            </div>
            <div style={{ color: "#718096" }}>
              <strong>Energy loss:</strong> {soiling.energy_loss_percent}%<br />
              <strong>Status:</strong> {soiling.status.replace(/_/g, " ")}<br />
              <em>{soiling.recommendation}</em>
            </div>
          </div>
        </div>
      )}

      {/* Alarms */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Active Alarms</h3>
        {(alarms[0]?.data || []).length === 0 ? (
          <p style={{ color: "#718096" }}>No active alarms.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Alarm Name</th>
                <th style={styles.th}>Device</th>
                <th style={styles.th}>Level</th>
                <th style={styles.th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {(alarms[0]?.data || []).map((a, i) => (
                <tr key={i}>
                  <td style={styles.td}>{a.alarmName || a.alarm_name}</td>
                  <td style={styles.td}>{a.devName || a.dev_name}</td>
                  <td style={styles.td}>{a.alarmLevel || a.alarm_level}</td>
                  <td style={styles.td}>{a.raiseTime || a.raise_time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stations */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>My Stations</h3>
        {stations.length === 0 ? (
          <p style={{ color: "#718096" }}>No stations assigned yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {stations.map((s) => (
              <li key={s.station_code} style={styles.stationItem}>
                <strong>{s.station_name || s.station_code}</strong>
                <span style={styles.badge}>{s.station_code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, color }) {
  return (
    <div style={{ ...styles.kpiCard, borderTop: `4px solid ${color}` }}>
      <p style={styles.kpiTitle}>{title}</p>
      <p style={{ ...styles.kpiValue, color }}>{value}</p>
    </div>
  );
}

const styles = {
  page: { maxWidth: "1100px", margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" },
  loading: { textAlign: "center", padding: "4rem", fontSize: "1.2rem", color: "#718096" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" },
  headerTitle: { margin: 0, fontSize: "1.8rem", color: "#1a202c" },
  headerSub: { margin: "0.25rem 0 0", color: "#718096" },
  logoutBtn: { padding: "0.5rem 1.25rem", background: "#e2e8f0", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  cardRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" },
  kpiCard: { background: "#fff", padding: "1.25rem", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  kpiTitle: { margin: "0 0 0.5rem", color: "#718096", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" },
  kpiValue: { margin: 0, fontSize: "1.6rem", fontWeight: "700" },
  card: { background: "#fff", padding: "1.5rem", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "1.5rem" },
  cardTitle: { margin: "0 0 1rem", fontSize: "1.1rem", color: "#2d3748" },
  soilingRow: { display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" },
  soilingLabel: { color: "#718096", fontSize: "1rem" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "0.5rem 0.75rem", background: "#f7fafc", color: "#4a5568", fontSize: "0.85rem", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "0.5rem 0.75rem", borderBottom: "1px solid #e2e8f0", color: "#4a5568", fontSize: "0.9rem" },
  stationItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid #e2e8f0" },
  badge: { background: "#ebf8ff", color: "#2b6cb0", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.8rem" },
};
