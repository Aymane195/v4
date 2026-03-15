import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>☀️</div>
        <h1 style={s.title}>Solar AI Monitor</h1>
        <p style={s.sub}>Connectez-vous à votre compte</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={s.label}>Adresse email</label>
          <input style={s.input} type="email" placeholder="vous@exemple.com"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <label style={s.label}>Mot de passe</label>
          <input style={s.input} type="password" placeholder="••••••••"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p style={s.foot}>
          Pas de compte ? <Link to="/register">Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A", padding: "1rem" },
  card: { background: "#1E293B", border: "1px solid #334155", borderRadius: "16px", padding: "2.5rem 2rem", width: "100%", maxWidth: "400px" },
  logo: { fontSize: "2.5rem", textAlign: "center", marginBottom: "0.5rem" },
  title: { textAlign: "center", fontSize: "1.5rem", fontWeight: "700", color: "#F1F5F9", marginBottom: "0.25rem" },
  sub: { textAlign: "center", color: "#94A3B8", fontSize: "0.9rem", marginBottom: "1.75rem" },
  label: { display: "block", fontSize: "13px", color: "#94A3B8", marginBottom: "6px", marginTop: "1rem" },
  input: { display: "block", width: "100%", padding: "0.7rem 0.875rem", background: "#0F172A", border: "1px solid #334155", borderRadius: "8px", color: "#F1F5F9", fontSize: "0.95rem", outline: "none" },
  btn: { marginTop: "1.5rem", width: "100%", padding: "0.75rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#0F172A", fontSize: "1rem", fontWeight: "700" },
  error: { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#FCA5A5", padding: "0.75rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "0.5rem" },
  foot: { textAlign: "center", marginTop: "1.25rem", color: "#94A3B8", fontSize: "0.875rem" },
};
