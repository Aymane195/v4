export default function KpiCard({ label, value, unit, color = "#F59E0B", icon }) {
  if (value == null) return null;
  return (
    <div style={s.card}>
      {icon && <div style={s.icon}>{icon}</div>}
      <p style={s.label}>{label}</p>
      <p style={{ ...s.value, color }}>
        {value} <span style={s.unit}>{unit}</span>
      </p>
    </div>
  );
}

const s = {
  card: {
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  icon: { fontSize: "1.2rem", marginBottom: "2px" },
  label: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" },
  value: { fontSize: "1.4rem", fontWeight: "700", lineHeight: 1.2 },
  unit: { fontSize: "0.75rem", fontWeight: "400", color: "#94A3B8" },
};
