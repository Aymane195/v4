import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "client" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.email, form.password, form.full_name, form.role);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create Account</h2>
        <p style={styles.subtitle}>Join Solar AI Monitor</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <input style={styles.input} type="text" placeholder="Full Name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          <input style={styles.input} type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input style={styles.input} type="password" placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select style={styles.input} value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="client">Client</option>
            <option value="employee">Employee</option>
          </select>
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
        <p style={styles.link}>
          Already have an account? <Link to="/login">Sign in</Link>
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
