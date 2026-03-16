/**
 * Minimal arc gauge — clean, sharp, professional.
 * cleanliness = (1 - soiling_index) * 100
 * Left = 0% dirty (red), Right = 100% clean (green)
 */
export default function SoilingGauge({ index = 0, size = 300 }) {
  const cleanliness = Math.min(100, Math.max(0, Math.round((1 - index) * 100)));

  const W   = size;
  const H   = size * 0.60;
  const cx  = W / 2;
  const cy  = H * 0.96;
  const R   = W * 0.42;
  const sw  = W * 0.028;   // thin track

  // 0% → 180° (left), 100% → 0° (right), top = 90°
  function pctToAngle(p) { return 180 - (p / 100) * 180; }

  function pt(radius, deg) {
    const rad = deg * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }

  // Arc path — sweep=1 (clockwise in SVG = upward on screen)
  function arcPath(fromPct, toPct, radius) {
    const p1 = pt(radius, pctToAngle(fromPct));
    const p2 = pt(radius, pctToAngle(toPct));
    const lg = (toPct - fromPct) > 50 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${lg} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  // Needle
  const needleAngle = pctToAngle(cleanliness) * Math.PI / 180;
  const needleTip   = { x: cx + R * 0.86 * Math.cos(needleAngle), y: cy - R * 0.86 * Math.sin(needleAngle) };
  const needleBase  = { x: cx - R * 0.14 * Math.cos(needleAngle), y: cy + R * 0.14 * Math.sin(needleAngle) };

  // Tick marks only at 25, 50, 75% (0% and 100% at arc ends look like dashes)
  const ticks = [25, 50, 75].map(p => {
    const inner = pt(R * 1.05, pctToAngle(p));
    const outer = pt(R * 1.16, pctToAngle(p));
    const label = pt(R * 1.30, pctToAngle(p));
    return { inner, outer, label, value: p };
  });

  // End labels — placed just outside the arc endpoints, offset inward to avoid looking like dashes
  const endLeft  = pt(R * 1.22, pctToAngle(2));   // near 0%
  const endRight = pt(R * 1.22, pctToAngle(98));  // near 100%

  const gradId = `sg-grad-${size}`;

  const status =
    cleanliness >= 95 ? { label: "Propres",          color: "#16A34A" } :
    cleanliness >= 78 ? { label: "Légère poussière",  color: "#D97706" } :
    cleanliness >= 55 ? { label: "Modéré",            color: "#EA580C" } :
                        { label: "Critique",          color: "#DC2626" };

  return (
    <div style={{ textAlign: "center", userSelect: "none" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        <defs>
          {/* Gradient along the arc: red (left/0%) → yellow (mid) → green (right/100%) */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#EF4444" />
            <stop offset="40%"  stopColor="#F97316" />
            <stop offset="70%"  stopColor="#EAB308" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>

        {/* Full colored arc — always visible, needle sweeps over it */}
        <path d={arcPath(0, 100, R)} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={sw}
          strokeLinecap="round" />

        {/* Tick marks at 25 / 50 / 75% */}
        {ticks.map(({ inner, outer, label, value }) => (
          <g key={value}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="#94A3B8" strokeWidth={1.5} strokeLinecap="round" />
            <text x={label.x} y={label.y + 4} textAnchor="middle"
              fontSize={W * 0.033} fill="#94A3B8"
              fontFamily="'Segoe UI', system-ui, sans-serif">
              {value}%
            </text>
          </g>
        ))}

        {/* End labels — no tick line, just text near arc endpoints */}
        <text x={endLeft.x}  y={endLeft.y  + 4} textAnchor="middle"
          fontSize={W * 0.033} fill="#94A3B8"
          fontFamily="'Segoe UI', system-ui, sans-serif">0%</text>
        <text x={endRight.x} y={endRight.y + 4} textAnchor="middle"
          fontSize={W * 0.033} fill="#94A3B8"
          fontFamily="'Segoe UI', system-ui, sans-serif">100%</text>

        {/* Needle — thin sharp line */}
        <line
          x1={needleBase.x} y1={needleBase.y}
          x2={needleTip.x}  y2={needleTip.y}
          stroke="#1E293B" strokeWidth={W * 0.012} strokeLinecap="round" />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={W * 0.022} fill="#1E293B" />
        <circle cx={cx} cy={cy} r={W * 0.010} fill="#fff" />

        {/* Percentage value */}
        <text x={cx} y={cy - R * 0.32} textAnchor="middle"
          fontSize={R * 0.52} fontWeight="700" fill="#1A202C"
          fontFamily="'Segoe UI', system-ui, sans-serif">
          {cleanliness}%
        </text>
      </svg>

      <p style={{ fontSize: "14px", fontWeight: "600", color: status.color, marginTop: "2px" }}>
        {status.label}
      </p>
      <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>
        Soiling Index : {(index * 100).toFixed(1)}%
      </p>
    </div>
  );
}
