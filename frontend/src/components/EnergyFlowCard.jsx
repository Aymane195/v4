function Node({ label, value, unit, color = "#F59E0B", icon }) {
  return (
    <div style={s.node}>
      <div style={{ ...s.nodeIcon, borderColor: color }}>{icon}</div>
      <p style={s.nodeLabel}>{label}</p>
      <p style={{ ...s.nodeVal, color }}>{value ?? "--"} <span style={s.nodeUnit}>{unit}</span></p>
    </div>
  );
}

function Arrow() {
  return <div style={s.arrow}>→</div>;
}

export default function EnergyFlowCard({ power, homeEnergy, gridPower }) {
  return (
    <div style={s.card}>
      <p style={s.title}>Flux Énergétique</p>
      <div style={s.flow}>
        <Node label="Panneaux" value={power} unit="kW" icon="☀️" color="#F59E0B" />
        <Arrow />
        <Node label="Onduleur" value={power} unit="kW" icon="⚡" color="#60A5FA" />
        <Arrow />
        <Node label="Domicile" value={homeEnergy} unit="kWh" icon="🏠" color="#10B981" />
        <Arrow />
        <Node label="Réseau" value={gridPower} unit="kW" icon="🔌" color="#A78BFA" />
      </div>
    </div>
  );
}

const s = {
  card: {
    background: "#1E293B",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "1rem 1.25rem",
  },
  title: { fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginBottom: "1rem" },
  flow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", flexWrap: "wrap" },
  node: { display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", minWidth: "64px" },
  nodeIcon: {
    width: "44px", height: "44px", borderRadius: "50%",
    border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1.2rem", background: "#0F172A",
  },
  nodeLabel: { fontSize: "10px", color: "#94A3B8", textAlign: "center" },
  nodeVal: { fontSize: "13px", fontWeight: "700", textAlign: "center" },
  nodeUnit: { fontSize: "10px", fontWeight: "400", color: "#94A3B8" },
  arrow: { color: "#334155", fontSize: "1.2rem", flexShrink: 0 },
};
