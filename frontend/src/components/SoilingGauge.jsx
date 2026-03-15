/**
 * Semicircle speedometer gauge — orange (dirty) → green (clean).
 * Shows panel efficiency = (1 - soiling_index) * 100.
 */
export default function SoilingGauge({ index = 0, size = 300 }) {
  const pct = Math.min(100, Math.max(0, Math.round((1 - index) * 100)));

  const W  = size;
  const H  = size * 0.58;
  const cx = W / 2;
  const cy = H * 0.96;
  const r  = Math.min(cx * 0.86, cy * 0.86);
  const sw = r * 0.19;

  function pt(deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  const p180 = pt(180);
  const p0   = pt(0);

  // Full background arc: 180° → 0° counterclockwise through top (sweep-flag=0)
  const bgPath = `M ${p180.x} ${p180.y} A ${r} ${r} 0 0 0 ${p0.x} ${p0.y}`;

  // Filled gradient arc up to pct%
  let fgPath = "";
  if (pct >= 100) {
    fgPath = bgPath;
  } else if (pct > 0) {
    const endAngle = 180 - (pct / 100) * 180;
    const ep = pt(endAngle);
    const lg = pct > 50 ? 1 : 0;
    fgPath = `M ${p180.x} ${p180.y} A ${r} ${r} 0 ${lg} 0 ${ep.x} ${ep.y}`;
  }

  const label =
    pct >= 95 ? "Panneaux propres - Production maximale" :
    pct >= 85 ? "Légère poussière - Nettoyage recommandé" :
    pct >= 70 ? "Encrassement modéré - Nettoyage urgent" :
                "Encrassement critique - Intervention requise";

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="gaugeGrad" x1={p180.x} y1="0" x2={p0.x} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#EF4444" />
            <stop offset="28%"  stopColor="#F97316" />
            <stop offset="60%"  stopColor="#EAB308" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <path d={bgPath} fill="none" stroke="#E2E8F0" strokeWidth={sw} strokeLinecap="round" />
        {/* Gradient filled arc */}
        {fgPath && (
          <path d={fgPath} fill="none" stroke="url(#gaugeGrad)" strokeWidth={sw} strokeLinecap="round" />
        )}
        {/* Percentage number */}
        <text x={cx} y={cy - r * 0.1} textAnchor="middle"
          fontSize={r * 0.46} fontWeight="800" fill="#1A202C"
          fontFamily="'Segoe UI', system-ui, sans-serif">
          {pct}%
        </text>
      </svg>
      <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "-6px" }}>{label}</p>
    </div>
  );
}
