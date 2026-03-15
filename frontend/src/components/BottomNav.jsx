export default function BottomNav({ active, onChange }) {
  const tabs = [
    { id: "accueil", label: "Accueil", icon: "⚡" },
    { id: "analyses", label: "Analyses", icon: "📊" },
  ];

  return (
    <nav style={s.nav}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{ ...s.tab, ...(active === t.id ? s.active : {}) }}
        >
          <span style={s.tabIcon}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

const s = {
  nav: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "#1E293B",
    borderTop: "1px solid #334155",
    display: "flex",
    zIndex: 100,
  },
  tab: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    gap: "2px", padding: "10px 0 14px",
    background: "none", border: "none",
    color: "#94A3B8", fontSize: "11px", fontWeight: "500",
    transition: "color 0.15s",
  },
  active: { color: "#F59E0B" },
  tabIcon: { fontSize: "1.3rem" },
};
