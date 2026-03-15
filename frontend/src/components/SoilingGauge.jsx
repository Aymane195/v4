/**
 * Displays panel efficiency = (1 - soiling_index) * 100 as a ring gauge.
 * High % = clean panels = good. Matches the mockup design.
 */
export default function SoilingGauge({ index = 0, size = 160 }) {
  const efficiency = Math.min(Math.max((1 - index) * 100, 0), 100);
  const R = 64;
  const cx = 80, cy = 80;
  const sweep = 260;
  const startAngle = -220;
  const endAngle = startAngle + sweep;
  const fillEnd = startAngle + (sweep * efficiency) / 100;

  const color = efficiency >= 95 ? "#10B981" : efficiency >= 85 ? "#F59E0B" : "#EF4444";

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

  return (
    <svg viewBox="0 0 160 160" width={size} height={size}>
      {/* Glow filter */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path d={describeArc(startAngle, endAngle, R)}
        fill="none" stroke="#1E293B" strokeWidth="12" strokeLinecap="round" />
      {/* Outer dim ring */}
      <path d={describeArc(startAngle, endAngle, R)}
        fill="none" stroke={color + "22"} strokeWidth="12" strokeLinecap="round" />
      {/* Fill arc */}
      {efficiency > 0 && (
        <path d={describeArc(startAngle, fillEnd, R)}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          filter="url(#glow)" />
      )}
      {/* Center value */}
      <text x="80" y="74" textAnchor="middle" fill={color} fontSize="26" fontWeight="800" fontFamily="system-ui">
        {efficiency.toFixed(0)}%
      </text>
      <text x="80" y="92" textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="system-ui" letterSpacing="2">
        SOILING
      </text>
    </svg>
  );
}
