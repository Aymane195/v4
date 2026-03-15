function fmt(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default function KpiCard({ label, value, unit, sub, color = "#F59E0B", icon }) {
  if (value == null) return null;
  return (
    <div style={s.card}>
      {icon && <span style={s.icon}>{icon}</span>}
      <p style={s.label}>{label}</p>
      <p style={{ ...s.value, color }}>
        {fmt(value)} <span style={s.unit}>{unit}</span>
      </p>
      {sub && <p style={s.sub}>{sub}</p>}
    </div>
  );
}

const s = {
  card: { background: "#1E293B", border: "1px solid #334155", borderRadius: "14px", padding: "1rem", display: "flex", flexDirection: "column", gap: "3px" },
  icon: { fontSize: "1.1rem", marginBottom: "2px" },
  label: { fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748B", fontWeight: "600" },
  value: { fontSize: "1.5rem", fontWeight: "800", lineHeight: 1.1 },
  unit: { fontSize: "0.8rem", fontWeight: "500", color: "#94A3B8" },
  sub: { fontSize: "11px", color: "#64748B", marginTop: "1px" },
};
