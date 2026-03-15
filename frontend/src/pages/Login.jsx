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
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Solar AI Monitor</h2>
        <p style={styles.subtitle}>Sign in to your account</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p style={styles.link}>
          No account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4f8" },
  card: { background: "#fff", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", width: "100%", maxWidth: "400px" },
  title: { margin: "0 0 0.25rem", fontSize: "1.6rem", color: "#1a202c" },
  subtitle: { margin: "0 0 1.5rem", color: "#718096" },
  input: { display: "block", width: "100%", padding: "0.75rem", marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "1rem", boxSizing: "border-box" },
  button: { width: "100%", padding: "0.75rem", background: "#f6ad55", border: "none", borderRadius: "8px", fontSize: "1rem", fontWeight: "600", cursor: "pointer", color: "#1a202c" },
  error: { background: "#fed7d7", color: "#c53030", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem" },
  link: { textAlign: "center", marginTop: "1rem", color: "#718096" },
};
