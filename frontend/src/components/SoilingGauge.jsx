export default function SoilingGauge({ index = 0 }) {
  const pct = Math.min(Math.max(index * 100, 0), 100);
  const R = 80;
  const cx = 100, cy = 100;
  const circumference = 2 * Math.PI * R;
  // Arc from -220deg to +40deg (240deg sweep)
  const sweep = 240;
  const startAngle = -210;
  const dashArray = (sweep / 360) * circumference;
  const dashOffset = dashArray * (1 - pct / 100);

  const color = pct < 5 ? "#10B981" : pct < 10 ? "#F59E0B" : "#EF4444";
  const label = pct < 5 ? "Panneaux propres" : pct < 10 ? "Légèrement encrassé" : "Nettoyage requis";

  // Convert angle to SVG coords
  function polarToXY(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(startDeg, endDeg, r) {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const endAngle = startAngle + sweep;
  const fillEnd = startAngle + (sweep * pct) / 100;

  return (
    <div style={s.wrap}>
      <svg viewBox="0 0 200 200" width="200" height="200">
        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle, R)}
          fill="none" stroke="#334155" strokeWidth="14" strokeLinecap="round"
        />
        {/* Fill */}
        {pct > 0 && (
          <path
            d={describeArc(startAngle, fillEnd, R)}
            fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text x="100" y="90" textAnchor="middle" fill={color} fontSize="28" fontWeight="700">
          {pct.toFixed(1)}%
        </text>
        <text x="100" y="114" textAnchor="middle" fill="#94A3B8" fontSize="11">
          Indice d'encrassement
        </text>
      </svg>
      <p style={{ ...s.label, color }}>{label}</p>
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  label: { fontSize: "13px", fontWeight: "600" },
};
