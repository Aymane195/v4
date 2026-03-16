/**
 * SAO — Solar-AI-Opt logo, no background, transparent.
 * color prop controls the icon+text color (default: amber #F59E0B for dark bg, or #1A202C for light bg)
 */
export default function Logo({ size = "md", color = "#F59E0B" }) {
  const scales = { sm: 0.7, md: 1, lg: 1.35 };
  const s = scales[size] ?? 1;
  const iconW = 38 * s, iconH = 30 * s;
  const titleSize = 15 * s, subSize = 9 * s;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 * s, userSelect: "none" }}>
      {/* Mountain + solar ray icon */}
      <svg width={iconW} height={iconH} viewBox="0 0 38 30" fill="none">
        {/* Left mountain */}
        <path d="M2 27 L12 8 L22 27Z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" fill="none" />
        {/* Right mountain (taller, overlapping) */}
        <path d="M14 27 L26 4 L38 27Z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" fill="none" />
        {/* Solar ray lines above right peak */}
        <line x1="26" y1="1" x2="26" y2="0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="29" y1="2.5" x2="30.5" y2="1.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="23" y1="2.5" x2="21.5" y2="1.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Text block */}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          fontSize: titleSize,
          fontWeight: "800",
          letterSpacing: "0.04em",
          color,
        }}>
          SOLAR-AI-OPT
        </span>
        <span style={{
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          fontSize: subSize,
          fontWeight: "500",
          letterSpacing: "0.25em",
          color,
          opacity: 0.75,
          marginTop: 2 * s,
        }}>
          — SAO —
        </span>
      </div>
    </div>
  );
}
