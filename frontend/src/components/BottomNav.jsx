export default function BottomNav({ active, onChange, alarmCount = 0 }) {
  const tabs = [
    { id: "accueil",  label: "Accueil",  icon: "⚡" },
    { id: "analyses", label: "Analyses", icon: "📊" },
    { id: "alertes",  label: "Alertes",  icon: "🔔", badge: alarmCount },
    { id: "reglages", label: "Réglages", icon: "⚙️" },
  ];

  return (
    <nav style={s.nav}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ ...s.tab, ...(active === t.id ? s.active : {}) }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <span style={s.tabIcon}>{t.icon}</span>
            {t.badge > 0 && (
              <span style={s.badge}>{t.badge > 9 ? "9+" : t.badge}</span>
            )}
          </div>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

const s = {
  nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#0F172A", borderTop: "1px solid #1E293B", display: "flex", zIndex: 100 },
  tab: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "10px 0 14px", background: "none", border: "none", color: "#475569", fontSize: "10px", fontWeight: "500", cursor: "pointer", transition: "color 0.15s" },
  active: { color: "#F59E0B" },
  tabIcon: { fontSize: "1.25rem" },
  badge: { position: "absolute", top: "-4px", right: "-8px", background: "#EF4444", color: "white", borderRadius: "999px", fontSize: "9px", fontWeight: "700", padding: "1px 4px", minWidth: "14px", textAlign: "center" },
};
