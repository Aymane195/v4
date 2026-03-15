import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === "client" ? "/client" : "/employee");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        .login-page { display: flex; min-height: 100vh; font-family: 'Segoe UI', system-ui, sans-serif; }
        .login-left { flex: 1; min-height: 100vh; background: linear-gradient(160deg, #0b1a38 0%, #1a3a5c 55%, #0d2b1e 100%); display: flex; flex-direction: column; padding: 2.5rem 3rem; position: relative; overflow: hidden; }
        .login-right { flex: 1; background: #fff; display: flex; align-items: center; justify-content: center; padding: 2rem; overflow-y: auto; }
        @media (max-width: 768px) {
          .login-left { display: none; }
          .login-right { flex: 1; }
        }
      `}</style>

      <div className="login-page">

        {/* ── Left panel ── */}
        <div className="login-left">
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "40px", height: "40px", background: "#F59E0B", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>☀️</div>
            <span style={{ color: "#fff", fontWeight: "700", fontSize: "1.1rem" }}>SolarAI Monitor</span>
          </div>

          {/* Hero */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ color: "#fff", fontSize: "2.6rem", fontWeight: "800", lineHeight: 1.15, marginBottom: "1.25rem" }}>
              Smart Solar<br />Monitoring<br />Powered by AI
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "1rem", lineHeight: 1.65, maxWidth: "380px" }}>
              Monitor your solar energy production, detect panel soiling, and optimize performance with real-time AI insights.
            </p>
          </div>

          {/* Feature icons */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #F59E0B", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(245,158,11,0.1)", fontSize: "1.6rem" }}>☀️</div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Real-time</span>
            </div>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.2)", margin: "0 16px", marginBottom: "20px" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #60A5FA", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(96,165,250,0.1)", fontSize: "1.6rem" }}>📊</div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Analytics</span>
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px" }}>© 2026 SolarAI Monitor. Optimized for Morocco.</p>
        </div>

        {/* ── Right panel ── */}
        <div className="login-right">
          <div style={{ width: "100%", maxWidth: "420px" }}>
            <h2 style={{ fontSize: "2rem", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>Welcome Back</h2>
            <p style={{ color: "#6B7280", fontSize: "0.95rem", marginBottom: "2rem" }}>Log in to your solar dashboard</p>

            {error && (
              <div style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label style={s.label}>Email Address</label>
              <input style={s.input} type="email" placeholder="example@email.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />

              <label style={{ ...s.label, marginTop: "1.25rem" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...s.input, paddingRight: "3rem" }}
                  type={showPass ? "text" : "password"} placeholder="Enter your password"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: "1.1rem", padding: 0, lineHeight: 1 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>

              <div style={{ textAlign: "right", marginTop: "8px" }}>
                <span style={{ color: "#F59E0B", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>Forgot Password?</span>
              </div>

              <button style={s.btn} type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "1.5rem 0" }}>
              <div style={{ flex: 1, height: "1px", background: "#E5E7EB" }} />
              <span style={{ color: "#9CA3AF", fontSize: "13px" }}>or</span>
              <div style={{ flex: 1, height: "1px", background: "#E5E7EB" }} />
            </div>

            {/* Google button — visual only */}
            <button type="button" style={s.googleBtn}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91a8.78 8.78 0 0 0 2.69-6.62z"/>
                <path fill="#34A853" d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.91-2.26a5.43 5.43 0 0 1-8.07-2.85H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.98 10.71a5.34 5.34 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.02-2.33z"/>
                <path fill="#EA4335" d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.02 2.33A5.36 5.36 0 0 1 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            <p style={{ textAlign: "center", marginTop: "1.25rem", color: "#6B7280", fontSize: "0.875rem" }}>
              Don't have an account?{" "}
              <Link to="/register" style={{ color: "#F59E0B", fontWeight: "700", textDecoration: "none" }}>Sign Up</Link>
            </p>

            {/* Demo credentials */}
            <div style={s.demo}>
              <p style={s.demoTitle}>Comptes démo</p>
              <div style={s.demoRow}>
                <span style={s.demoRole}>Client</span>
                <code style={s.demoCode}>demo@solar.ma</code>
                <code style={s.demoCode}>demo123</code>
              </div>
              <div style={s.demoRow}>
                <span style={s.demoRole}>Employé</span>
                <code style={s.demoCode}>employe@solar.ma</code>
                <code style={s.demoCode}>demo123</code>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

const s = {
  label: { display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "6px" },
  input: { display: "block", width: "100%", padding: "0.75rem 1rem", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#111827", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" },
  btn: { marginTop: "1.25rem", width: "100%", padding: "0.875rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#fff", fontSize: "1rem", fontWeight: "700", cursor: "pointer" },
  googleBtn: { width: "100%", padding: "0.75rem", background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#374151", fontSize: "0.95rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" },
  demo: { marginTop: "1.5rem", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "0.875rem" },
  demoTitle: { fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#F59E0B", marginBottom: "8px", fontWeight: "600" },
  demoRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" },
  demoRole: { fontSize: "11px", color: "#6B7280", width: "48px", flexShrink: 0 },
  demoCode: { fontSize: "12px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: "4px", padding: "2px 6px", color: "#374151", fontFamily: "monospace" },
};
