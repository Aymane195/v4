import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import SoilingGauge from "../components/SoilingGauge";
import KpiCard from "../components/KpiCard";
import BottomNav from "../components/BottomNav";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const today = new Date();

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function useSettings() {
  const [s, setS] = useState(() => { try { return JSON.parse(localStorage.getItem("solar_settings") || "{}"); } catch { return {}; } });
  const upd = (k, v) => { const n = { ...s, [k]: v }; setS(n); localStorage.setItem("solar_settings", JSON.stringify(n)); };
  return [s, upd];
}

function fmt(v, decimals = 0) {
  if (v == null) return "--";
  return parseFloat(v).toLocaleString("fr-FR", { maximumFractionDigits: decimals });
}

const ALARM_COLOR = { 1: "#EF4444", 2: "#F97316", 3: "#F59E0B", 4: "#60A5FA" };
const ALARM_LABEL = { 1: "Critique", 2: "Majeur", 3: "Mineur", 4: "Avertissement" };

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: "52px", height: "28px", borderRadius: "999px", background: value ? "#F59E0B" : "#334155", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: "4px", left: value ? "28px" : "4px", width: "20px", height: "20px", borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
      {value && <span style={{ position: "absolute", left: "7px", top: "6px", fontSize: "9px", color: "#0F172A", fontWeight: "800" }}>ON</span>}
    </div>
  );
}

// ─── Accueil Tab ──────────────────────────────────────────────────────────────
function AccueilTab({ kpi, deviceKpi, soiling, stations, alarmCount, onAlertes }) {
  const clock = useClock();
  const data         = kpi?.data?.[0]?.dataItemMap || {};
  const power        = data.inverter_power ?? null;
  const dayEnergy    = data.day_power ?? null;
  const totalEnergy  = data.total_power ?? null;
  const monthEnergy  = data.month_power ?? null;
  const homeEnergy   = data.day_use_energy ?? null;
  const gridPower    = data.use_power ?? data.day_on_grid_energy ?? null;
  const co2Total     = data.reduce_carbon ?? (totalEnergy != null ? +(totalEnergy * 0.233).toFixed(0) : null);
  const monthSavings = monthEnergy != null ? +(monthEnergy * 1.5).toFixed(0) : null;

  const soilingPct = soiling?.soiling_index ?? 0;
  const isClean    = soilingPct < 0.05;
  const stationName = stations[0]?.station_name || stations[0]?.station_code || "Mon installation";

  const [livePower, setLivePower] = useState(power);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await api.get("/client/kpi/realtime");
        if (cancelled) return;
        const p = res.data?.data?.[0]?.dataItemMap?.inverter_power ?? null;
        setLivePower(p);
        setPulse(true);
        setTimeout(() => { if (!cancelled) setPulse(false); }, 500);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <div style={s.tab}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.brand}>SOLAR AI-OPTIMIZER</p>
          <p style={s.pageTitle}>{stationName}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <p style={s.clock}>{clock}</p>
          <div style={s.live}><span style={s.liveDot} />Live</div>
        </div>
      </div>

      {/* Status banner */}
      <div style={{ ...s.banner, background: isClean ? "rgba(16,185,129,0.12)" : "rgba(249,115,22,0.12)", borderColor: isClean ? "#10B981" : "#F97316" }}>
        <span style={{ color: isClean ? "#10B981" : "#F97316", fontWeight: 700, fontSize: "14px" }}>
          {isClean ? "Panneaux propres — production optimale" : "⚠ Nettoyage recommandé"}
        </span>
        <span style={{ color: "#64748B", fontSize: "12px" }}>{soiling?.recommendation || "Analyse en cours..."}</span>
      </div>

      {/* Live production */}
      <div style={{ background: pulse ? "rgba(245,158,11,0.12)" : "#1E293B", border: `1px solid ${pulse ? "#F59E0B" : "#334155"}`, borderRadius: "14px", padding: "0.875rem 1.25rem", transition: "background 0.4s, border-color 0.4s", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} />
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748B", fontWeight: "700" }}>Énergie produite en ce moment</p>
          </div>
          <p style={{ fontSize: "2rem", fontWeight: "800", color: "#F59E0B", lineHeight: 1.1 }}>
            {livePower != null ? fmt(livePower, 2) : "--"}
            <span style={{ fontSize: "0.85rem", fontWeight: "500", color: "#94A3B8", marginLeft: "6px" }}>kW</span>
          </p>
        </div>
        <span style={{ fontSize: "2rem" }}>⚡</span>
      </div>

      {/* Flux énergétique card — gauge + flow */}
      <div style={s.fluxCard}>
        <p style={s.fluxTitle}>FLUX D'ÉNERGIE EN DIRECT</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "0.5rem 0" }}>
          <SoilingGauge index={soilingPct} size={160} />
        </div>
        {/* Flow diagram */}
        <div style={s.flow}>
          <div style={s.flowNode}>
            <div style={{ ...s.flowIcon, borderColor: "#F59E0B" }}>☀️</div>
            <p style={s.flowLabel}>Panneaux solaires</p>
            <p style={{ ...s.flowVal, color: "#F59E0B" }}>{power != null ? `${fmt(power, 2)} kW` : "--"}</p>
          </div>
          <div style={s.flowLine}><div style={s.flowDot} /><div style={s.flowDot} /><div style={s.flowDot} /></div>
          <div style={s.flowNode}>
            <div style={{ ...s.flowIcon, borderColor: "#60A5FA", fontSize: "1rem" }}>⚡</div>
            <p style={s.flowLabel}>ONDULEUR</p>
          </div>
          <div style={s.flowLine}><div style={s.flowDot} /><div style={s.flowDot} /><div style={s.flowDot} /></div>
          <div style={s.flowNode}>
            <div style={{ ...s.flowIcon, borderColor: "#10B981" }}>🏠</div>
            <p style={s.flowLabel}>Domicile</p>
            <p style={{ ...s.flowVal, color: "#10B981" }}>{homeEnergy != null ? `${fmt(homeEnergy, 2)} kW` : "--"}</p>
          </div>
          <div style={s.flowLine}><div style={s.flowDot} /><div style={s.flowDot} /><div style={s.flowDot} /></div>
          <div style={s.flowNode}>
            <div style={{ ...s.flowIcon, borderColor: "#A78BFA" }}>🔌</div>
            <p style={s.flowLabel}>Réseau</p>
            <p style={{ ...s.flowVal, color: "#A78BFA" }}>{gridPower != null ? `${fmt(gridPower, 2)} kW` : "--"}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={s.kpiGrid}>
        <KpiCard label="Production" value={power} unit="kW" sub="en ce moment" color="#F59E0B" icon="⚡" />
        <KpiCard label="Aujourd'hui" value={dayEnergy} unit="kWh" sub="produit ce jour" color="#10B981" icon="📅" />
        <KpiCard label="Économies" value={monthSavings} unit="DH" sub="ce mois-ci" color="#10B981" icon="💰" />
        <KpiCard label="CO₂ évité" value={co2Total} unit="kg" sub="depuis installation" color="#A78BFA" icon="🌍" />
      </div>

      {/* Alarm chip */}
      <button onClick={onAlertes} style={{ ...s.alarmChip, ...(alarmCount > 0 ? s.alarmActive : {}) }}>
        🔔 {alarmCount > 0 ? `${alarmCount} alarme(s) active(s) — voir détails` : "Aucune alarme active"}
      </button>
    </div>
  );
}

// ─── Analyses Tab ─────────────────────────────────────────────────────────────
function AnalysesTab({ stationCodes, kpi, deviceKpi }) {
  const [period, setPeriod]   = useState("mois");
  const [mode, setMode]       = useState("production");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  const data          = kpi?.data?.[0]?.dataItemMap || {};
  const totalEnergy   = data.total_power ?? null;
  const totalSavings  = totalEnergy != null ? (totalEnergy * 1.5).toFixed(0) : null;
  const co2Total      = data.reduce_carbon ?? (totalEnergy != null ? +(totalEnergy * 0.233).toFixed(0) : null);
  const trees         = co2Total != null ? Math.round(co2Total / 21) : null;
  const radiation     = data.radiation_intensity ?? null;
  const gridInjection = data.day_on_grid_energy ?? null;
  const panelTemp     = deviceKpi?.temperature ?? null;

  const fetchData = useCallback(async () => {
    if (!stationCodes.length) return;
    setLoading(true);
    try {
      if (period === "mois") {
        const results = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(today.getFullYear(), i, 1);
          const dateStr = `${d.getFullYear()}-${String(i + 1).padStart(2, "0")}`;
          try {
            const res = await api.get(`/client/kpi/monthly?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.month_power ?? 0;
            results.push({ name: MONTHS_FR[i], kWh: parseFloat(val) || 0 });
          } catch { results.push({ name: MONTHS_FR[i], kWh: 0 }); }
        }
        setChartData(results);
      } else if (period === "jour") {
        const results = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const dayLabel = d.toLocaleDateString("fr-FR", { weekday: "short" });
          try {
            const res = await api.get(`/client/kpi/daily?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.day_power ?? 0;
            results.push({ name: dayLabel, kWh: parseFloat(val) || 0 });
          } catch { results.push({ name: dayLabel, kWh: 0 }); }
        }
        setChartData(results);
      } else {
        const results = [];
        for (let y = today.getFullYear() - 2; y <= today.getFullYear(); y++) {
          const dateStr = `${y}-01`;
          try {
            const res = await api.get(`/client/kpi/monthly?date=${dateStr}`);
            const val = res.data?.[0]?.data?.[0]?.dataItemMap?.month_power ?? 0;
            results.push({ name: String(y), kWh: parseFloat(val) || 0 });
          } catch { results.push({ name: String(y), kWh: 0 }); }
        }
        setChartData(results);
      }
    } finally { setLoading(false); }
  }, [period, stationCodes]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartValues = mode === "economies" ? chartData.map(d => ({ ...d, val: +(d.kWh * 1.5).toFixed(0) })) : chartData.map(d => ({ ...d, val: d.kWh }));
  const total = chartData.reduce((a, d) => a + d.kWh, 0);
  const peak  = Math.max(...chartData.map(d => d.kWh), 0);
  const avg   = chartData.length ? total / chartData.length : 0;

  return (
    <div style={s.tab}>
      <div style={s.header}>
        <div>
          <p style={s.pageTitle}>Analyses & historique</p>
          <p style={{ color: "#64748B", fontSize: "12px" }}>Suivez l'évolution de votre installation</p>
        </div>
      </div>

      {/* Period toggle */}
      <div style={s.toggleRow}>
        {[["jour","Jour"],["mois","Mois"],["année","Année"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setPeriod(id)}
            style={{ ...s.toggleBtn, ...(period === id ? s.toggleActive : {}) }}>
            {lbl}
            {period === id && <span style={s.activePill}>ACTIVE</span>}
          </button>
        ))}
      </div>

      {/* Mode sub-toggle */}
      <div style={s.modeRow}>
        <button onClick={() => setMode("production")}
          style={{ ...s.modeBtn, ...(mode === "production" ? s.modeActive : {}) }}>
          ⚡ Production
          {mode === "production" && <span style={s.activePill}>ACTIVE</span>}
        </button>
        <button onClick={() => setMode("economies")}
          style={{ ...s.modeBtn, ...(mode === "economies" ? s.modeActive : {}) }}>
          💰 Économies
          {mode === "economies" && <span style={s.activePill}>ACTIVE</span>}
        </button>
      </div>

      {/* Bar chart */}
      <div style={s.chartWrap}>
        {loading ? (
          <div style={s.loading}>Chargement...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartValues} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0F172A", border: "1px solid #334155", borderRadius: "10px", color: "#F1F5F9", fontSize: "12px" }}
                cursor={{ fill: "rgba(245,158,11,0.08)" }}
                formatter={v => [`${fmt(v)} ${mode === "economies" ? "DH" : "kWh"}`, mode === "economies" ? "Économies" : "Production"]}
              />
              <Bar dataKey="val" fill="#F59E0B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary chips */}
      <div style={s.summaryRow}>
        <div style={s.chip}><span style={s.chipVal}>{fmt(total)}</span><span style={s.chipLbl}>Total kWh</span></div>
        <div style={s.chip}><span style={s.chipVal}>{fmt(peak)}</span><span style={s.chipLbl}>Pic kWh</span></div>
        <div style={s.chip}><span style={s.chipVal}>{fmt(avg, 0)}</span><span style={s.chipLbl}>Moyenne</span></div>
      </div>

      {/* Detailed indicators */}
      <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", color: "#64748B", textTransform: "uppercase" }}>
        Indicateurs détaillés
      </p>
      <div style={s.kpiGrid}>
        <DetailCard icon="📦" label="Énergie totale produite" value={fmt(totalEnergy)} unit="kWh" sub={`depuis ${today.getFullYear() - 2}`} color="#F59E0B" />
        <DetailCard icon="🏛️" label="Économies totales" value={totalSavings != null ? fmt(totalSavings) : null} unit="DH" sub="depuis installation" color="#10B981" />
        <DetailCard icon="🌍" label="CO₂ évité au total" value={co2Total != null ? fmt(co2Total) : null} unit="kg" sub={trees != null ? `≈ ${fmt(trees)} arbres plantés` : null} color="#A78BFA" />
        <DetailCard icon="🌡️" label="Température panneaux" value={panelTemp != null ? fmt(panelTemp, 1) : null} unit="°C" sub="surface capteurs" color="#F97316" />
        <DetailCard icon="☀️" label="Irradiance solaire" value={fmt(radiation, 0)} unit="W/m²" sub="rayonnement actuel" color="#60A5FA" />
        <DetailCard icon="↗️" label="Injection réseau" value={gridInjection != null ? fmt(gridInjection, 2) : null} unit="kW" sub="surplus envoyé" color="#F59E0B" />
      </div>
    </div>
  );
}

function DetailCard({ icon, label, value, unit, sub, color }) {
  if (value == null) return null;
  return (
    <div style={{ background: "#1E293B", border: "1px solid #1E3A5F", borderRadius: "14px", padding: "1rem", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "1rem" }}>{icon}</span>
        <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748B", fontWeight: "600" }}>{label}</p>
      </div>
      <p style={{ fontSize: "1.4rem", fontWeight: "800", color, lineHeight: 1.1 }}>
        {value} <span style={{ fontSize: "0.8rem", fontWeight: "500", color: "#94A3B8" }}>{unit}</span>
      </p>
      {sub && <p style={{ fontSize: "11px", color: "#64748B" }}>{sub}</p>}
    </div>
  );
}

// ─── Alertes Tab ──────────────────────────────────────────────────────────────
function AlertesTab() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(0);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get("/client/alarms")
      .then(res => {
        const all = [];
        (res.data || []).forEach(r => (r?.data || []).forEach(a => all.push(a)));
        all.sort((a, b) => (a.lev ?? 9) - (b.lev ?? 9) || (b.raiseTime ?? 0) - (a.raiseTime ?? 0));
        setAlarms(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = filter === 0 ? alarms : alarms.filter(a => a.lev === filter);

  return (
    <div style={s.tab}>
      <div style={s.header}>
        <div>
          <p style={s.pageTitle}>Alertes</p>
          <p style={{ color: "#64748B", fontSize: "12px" }}>Notifications de votre installation</p>
        </div>
        {alarms.length > 0 && <span style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: "999px", padding: "3px 10px", fontSize: "12px" }}>{alarms.length}</span>}
      </div>

      {alarms.length > 0 && (
        <div style={s.toggleRow}>
          {[[0,"Tous"],[1,"Critique"],[2,"Majeur"],[3,"Mineur"],[4,"Avert."]].map(([lev, lbl]) => (
            <button key={lev} onClick={() => setFilter(lev)}
              style={{ ...s.toggleBtn, ...(filter === lev ? { ...s.toggleActive, background: lev === 0 ? "#F59E0B" : ALARM_COLOR[lev] } : {}) }}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={s.loading}>Chargement...</div>
      ) : visible.length === 0 ? (
        <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "14px", padding: "2rem", textAlign: "center", color: "#6EE7B7", fontSize: "14px" }}>
          ✓ Aucune alarme active<br /><span style={{ fontSize: "12px", color: "#64748B" }}>Votre installation fonctionne normalement</span>
        </div>
      ) : visible.map((a, i) => {
        const color = ALARM_COLOR[a.lev] || "#94A3B8";
        const open = expanded === i;
        return (
          <div key={i} onClick={() => setExpanded(open ? null : i)}
            style={{ background: "#1E293B", border: "1px solid #334155", borderLeft: `4px solid ${color}`, borderRadius: "12px", padding: "12px 14px", cursor: "pointer", marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <p style={{ fontWeight: 700, fontSize: "14px", flex: 1, paddingRight: "8px" }}>{a.alarmName || "Alarme"}</p>
              <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>{ALARM_LABEL[a.lev]}</span>
            </div>
            <p style={{ color: "#64748B", fontSize: "12px", marginTop: "4px" }}>
              {a.devName || "--"} · {a.raiseTime ? new Date(a.raiseTime).toLocaleString("fr-FR") : ""}
            </p>
            {open && (
              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #334155", display: "flex", flexDirection: "column", gap: "6px" }}>
                {a.alarmCause && <p style={{ fontSize: "13px", color: "#CBD5E1" }}><b>Cause:</b> {a.alarmCause}</p>}
                {a.alarmSuggest && <p style={{ fontSize: "13px", color: "#CBD5E1" }}><b>Suggestion:</b> {a.alarmSuggest}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Réglages Tab ─────────────────────────────────────────────────────────────
function ReglagesTab({ kpi, lastSync }) {
  const { user } = useAuth();
  const [settings, upd] = useSettings();
  const data = kpi?.data?.[0]?.dataItemMap || {};

  const installName = settings.installName || "Mon installation";
  const location    = settings.location || "Maroc";
  const threshold   = settings.soilingThreshold ?? 85;
  const capacity    = data.installed_capacity ?? settings.capacity ?? "--";
  const syncAgo     = lastSync ? Math.round((Date.now() - lastSync) / 60000) : null;

  return (
    <div style={s.tab}>
      <div style={s.header}>
        <p style={s.pageTitle}>Paramètres</p>
      </div>

      {/* Profile */}
      <div style={{ ...s.section, display: "flex", alignItems: "center", gap: "14px", padding: "1.25rem" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", flexShrink: 0 }}>
          👤
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: "16px" }}>{user?.full_name || "Client"}</p>
          <p style={{ color: "#64748B", fontSize: "13px" }}>{location}</p>
          {capacity !== "--" && (
            <span style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B", borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 600, marginTop: "4px", display: "inline-block" }}>
              {capacity} kWc
            </span>
          )}
        </div>
      </div>

      {/* Installation */}
      <SectionTitle>Installation</SectionTitle>
      <div style={s.section}>
        <SettingRow icon="🏭" label="Nom de l'installation">
          <input value={installName} onChange={e => upd("installName", e.target.value)}
            style={{ background: "transparent", border: "none", color: "#F1F5F9", fontSize: "13px", textAlign: "right", outline: "none", width: "140px" }} />
        </SettingRow>
        <Divider />
        <SettingRow icon="📍" label="Localisation">
          <input value={location} onChange={e => upd("location", e.target.value)}
            style={{ background: "transparent", border: "none", color: "#F1F5F9", fontSize: "13px", textAlign: "right", outline: "none", width: "120px" }} />
        </SettingRow>
        <Divider />
        <SettingRow icon="⚡" label="Puissance crête">
          <span style={{ color: "#94A3B8", fontSize: "13px" }}>{capacity} kWc</span>
        </SettingRow>
      </div>

      {/* Soiling threshold */}
      <SectionTitle>Seuil d'alerte soiling</SectionTitle>
      <div style={{ ...s.section, padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600 }}>Déclencher alerte si Soiling</p>
            <p style={{ fontSize: "11px", color: "#64748B" }}>En dessous de ce seuil → email automatique</p>
          </div>
          <span style={{ fontSize: "1.4rem", fontWeight: "800", color: "#F59E0B" }}>{threshold}%</span>
        </div>
        <input type="range" min="60" max="99" value={threshold}
          onChange={e => upd("soilingThreshold", +e.target.value)}
          style={{ width: "100%", accentColor: "#F59E0B", height: "6px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          <span style={{ fontSize: "10px", color: "#EF4444" }}>60% · Critique</span>
          <span style={{ fontSize: "10px", color: "#F59E0B" }}>85% · Recommandé</span>
          <span style={{ fontSize: "10px", color: "#10B981" }}>99% · Strict</span>
        </div>
      </div>

      {/* Notifications */}
      <SectionTitle>Notifications</SectionTitle>
      <div style={s.section}>
        <SettingRow icon="🔔" label="Alertes soiling" sub="Notification quand indice < seuil">
          <Toggle value={settings.notifSoiling ?? true} onChange={v => upd("notifSoiling", v)} />
        </SettingRow>
        <Divider />
        <SettingRow icon="✉️" label="Email automatique" sub="Rapport d'alerte par email">
          <Toggle value={settings.notifEmail ?? true} onChange={v => upd("notifEmail", v)} />
        </SettingRow>
        <Divider />
        <SettingRow icon="💬" label="SMS d'urgence" sub="SMS pour alertes critiques seulement">
          <Toggle value={settings.notifSMS ?? false} onChange={v => upd("notifSMS", v)} />
        </SettingRow>
        <Divider />
        <SettingRow icon="📊" label="Rapport mensuel" sub="Bilan mensuel de votre installation">
          <Toggle value={settings.notifMonthly ?? true} onChange={v => upd("notifMonthly", v)} />
        </SettingRow>
      </div>

      {/* FusionSolar connection */}
      <SectionTitle>Connexion Huawei FusionSolar</SectionTitle>
      <div style={s.section}>
        <SettingRow icon="🔗" label="Statut API">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
            <span style={{ fontSize: "12px", color: "#10B981" }}>Connecté</span>
            {syncAgo != null && <span style={{ fontSize: "11px", color: "#64748B" }}>· sync il y a {syncAgo} min</span>}
          </div>
        </SettingRow>
        <Divider />
        <SettingRow icon="🔑" label="Identifiants API">
          <span style={{ fontSize: "12px", color: "#64748B", letterSpacing: "3px" }}>••••••••••</span>
        </SettingRow>
      </div>

      {/* Preferences */}
      <SectionTitle>Préférences</SectionTitle>
      <div style={s.section}>
        <SettingRow icon="🌙" label="Mode sombre">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ ...s.pill, background: "#F59E0B22", color: "#F59E0B", border: "1px solid #F59E0B55" }}>ACTIVE</span>
            <Toggle value={true} onChange={() => {}} />
          </div>
        </SettingRow>
        <Divider />
        <SettingRow icon="🌐" label="Langue">
          <div style={{ display: "flex", gap: "6px" }}>
            {["FR", "AR", "EN"].map(lang => (
              <button key={lang} onClick={() => upd("language", lang)}
                style={{ ...s.langBtn, ...(( settings.language || "FR") === lang ? s.langActive : {}) }}>
                {lang}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "1.5rem 0 0.5rem", color: "#334155", fontSize: "12px" }}>
        <p style={{ fontWeight: 600 }}>Solar AI-OPTIMIZER v1.0.0</p>
        <p>{location}, {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.1em", color: "#64748B", textTransform: "uppercase", padding: "0.25rem 0" }}>{children}</p>;
}
function Divider() {
  return <div style={{ height: "1px", background: "#1E3A5F", margin: "0 0.5rem" }} />;
}
function SettingRow({ icon, label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        <div>
          <p style={{ fontSize: "13px", fontWeight: 500 }}>{label}</p>
          {sub && <p style={{ fontSize: "11px", color: "#64748B" }}>{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ClientDashboard() {
  const { logout } = useAuth();
  const [tab, setTab]           = useState("accueil");
  const [kpi, setKpi]           = useState(null);
  const [deviceKpi, setDevKpi]  = useState(null);
  const [soiling, setSoiling]   = useState(null);
  const [stations, setStations] = useState([]);
  const [alarmCount, setAlarmCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [stRes, kpiRes] = await Promise.all([
          api.get("/client/stations"),
          api.get("/client/kpi/realtime"),
        ]);
        setStations(stRes.data);
        setKpi(kpiRes.data);
        setLastSync(Date.now());
        if (stRes.data.length > 0) {
          const soil = await api.get(`/soiling/station/${stRes.data[0].station_code}`);
          setSoiling(soil.data);
        }
        try {
          const devRes = await api.get("/client/kpi/devices");
          setDevKpi(devRes.data?.[0]?.data?.[0]?.dataItemMap || null);
        } catch {}
        try {
          const alarmRes = await api.get("/client/alarms");
          setAlarmCount((alarmRes.data || []).reduce((n, r) => n + (r?.data?.length || 0), 0));
        } catch {}
      } catch (err) { console.error(err); }
    }
    load();
    const iv = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const stationCodes = stations.map(s => s.station_code);

  return (
    <div style={s.page}>
      <button onClick={logout} style={s.logoutBtn} title="Déconnexion">⏻</button>

      {tab === "accueil"  && <AccueilTab kpi={kpi} deviceKpi={deviceKpi} soiling={soiling} stations={stations} alarmCount={alarmCount} onAlertes={() => setTab("alertes")} />}
      {tab === "analyses" && <AnalysesTab stationCodes={stationCodes} kpi={kpi} deviceKpi={deviceKpi} />}
      {tab === "alertes"  && <AlertesTab />}
      {tab === "reglages" && <ReglagesTab kpi={kpi} lastSync={lastSync} />}

      <div style={{ height: "72px" }} />
      <BottomNav active={tab} onChange={setTab} alarmCount={alarmCount} />
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "system-ui, sans-serif", position: "relative" },
  logoutBtn: { position: "fixed", top: "12px", right: "12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#FCA5A5", borderRadius: "8px", padding: "6px 10px", fontSize: "15px", zIndex: 200 },
  tab: { padding: "1rem 1rem 0", display: "flex", flexDirection: "column", gap: "1rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingTop: "4px" },
  brand: { fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: "#64748B", textTransform: "uppercase" },
  pageTitle: { fontWeight: "800", fontSize: "1.1rem", color: "#F1F5F9", marginTop: "2px" },
  clock: { fontSize: "1.4rem", fontWeight: "800", color: "#F59E0B" },
  live: { display: "flex", alignItems: "center", gap: "5px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "999px", padding: "3px 9px", fontSize: "10px", color: "#10B981", fontWeight: "700" },
  liveDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#10B981", display: "inline-block" },
  banner: { border: "1px solid", borderRadius: "12px", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "3px" },
  fluxCard: { background: "#1E293B", border: "1px solid #334155", borderRadius: "16px", padding: "1.25rem" },
  fluxTitle: { fontSize: "10px", fontWeight: "700", letterSpacing: "0.1em", color: "#64748B", textTransform: "uppercase", marginBottom: "0.5rem" },
  flow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.75rem" },
  flowNode: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: 1 },
  flowIcon: { width: "44px", height: "44px", borderRadius: "50%", border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", background: "#0F172A" },
  flowLabel: { fontSize: "9px", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" },
  flowVal: { fontSize: "12px", fontWeight: "700", textAlign: "center" },
  flowLine: { display: "flex", gap: "3px", alignItems: "center", marginBottom: "20px" },
  flowDot: { width: "4px", height: "4px", borderRadius: "50%", background: "#334155" },
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  alarmChip: { padding: "12px", borderRadius: "12px", border: "1px solid #334155", background: "#1E293B", color: "#64748B", fontSize: "13px", fontWeight: "500", cursor: "pointer", textAlign: "center" },
  alarmActive: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#FCA5A5" },
  toggleRow: { display: "flex", gap: "6px", background: "#1E293B", border: "1px solid #334155", borderRadius: "12px", padding: "4px" },
  toggleBtn: { flex: 1, padding: "7px 4px", background: "none", border: "none", color: "#64748B", borderRadius: "9px", fontSize: "12px", fontWeight: "500", position: "relative", cursor: "pointer" },
  toggleActive: { background: "#F59E0B", color: "#0F172A", fontWeight: "700" },
  activePill: { position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", background: "#F59E0B", color: "#0F172A", fontSize: "7px", fontWeight: "800", padding: "1px 4px", borderRadius: "4px" },
  modeRow: { display: "flex", gap: "8px" },
  modeBtn: { flex: 1, padding: "10px", background: "#1E293B", border: "1px solid #334155", borderRadius: "12px", color: "#64748B", fontSize: "13px", fontWeight: "500", position: "relative", cursor: "pointer" },
  modeActive: { background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", color: "#F59E0B", fontWeight: "700" },
  chartWrap: { background: "#1E293B", border: "1px solid #334155", borderRadius: "14px", padding: "1rem" },
  loading: { height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" },
  summaryRow: { display: "flex", gap: "8px" },
  chip: { flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: "12px", padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" },
  chipVal: { fontSize: "1.1rem", fontWeight: "800", color: "#F59E0B" },
  chipLbl: { fontSize: "9px", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" },
  section: { background: "#1E293B", border: "1px solid #1E3A5F", borderRadius: "14px", overflow: "hidden" },
  pill: { fontSize: "9px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px" },
  langBtn: { padding: "5px 10px", background: "#0F172A", border: "1px solid #334155", color: "#64748B", borderRadius: "8px", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  langActive: { background: "rgba(245,158,11,0.15)", border: "1px solid #F59E0B", color: "#F59E0B" },
};
