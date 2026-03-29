import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Sun, X, Shield } from "lucide-react";

// ── Full consent text shown in the modal ─────────────────────────────────────
const FULL_POLICY = `POLITIQUE DE CONFIDENTIALITÉ — Solar AI Optimizer
Dernière mise à jour : mars 2026

1. DONNÉES COLLECTÉES
Nous collectons les informations suivantes lors de votre inscription et utilisation de la plateforme :
• Données d'identité : nom complet, adresse e-mail, numéro de téléphone (optionnel).
• Données d'installation : capacité installée, type d'installation, localisation géographique de la centrale solaire.
• Données de production : mesures en temps réel de production (kW/kWh), irradiation, température des panneaux, performance ratio.
• Données de maintenance : historique des interventions de nettoyage, alertes d'encrassement, prédictions du modèle IA.

2. FINALITÉS DU TRAITEMENT
Les données collectées sont utilisées exclusivement pour :
• Afficher votre tableau de bord de monitoring solaire en temps réel.
• Calculer l'index d'encrassement et générer des recommandations de maintenance via notre modèle d'intelligence artificielle.
• Vous envoyer des alertes (e-mail ou WhatsApp) lorsqu'une intervention est recommandée.
• Améliorer la précision de nos modèles de prédiction (données anonymisées).

3. DURÉE DE CONSERVATION
Vos données sont conservées pendant toute la durée de votre abonnement actif, puis supprimées dans un délai de 90 jours après résiliation du contrat.

4. PARTAGE DES DONNÉES
Vos données ne sont jamais vendues ni partagées avec des tiers à des fins commerciales. Elles peuvent être transmises à :
• Huawei FusionSolar (agrégateur de données de votre onduleur), dans le cadre de l'intégration API nécessaire au fonctionnement du service.
• Nos prestataires techniques (hébergement sécurisé), soumis à des accords de confidentialité stricts.

5. VOS DROITS (RGPD)
Conformément au Règlement Général sur la Protection des Données, vous disposez des droits suivants :
• Droit d'accès, de rectification et d'effacement de vos données.
• Droit à la portabilité de vos données.
• Droit d'opposition au traitement.
Pour exercer ces droits, contactez-nous à : privacy@solarai-optimizer.ma

6. SÉCURITÉ
Vos données sont stockées dans une base de données chiffrée, accessible uniquement au personnel autorisé. Les mots de passe sont hachés (bcrypt) et ne sont jamais stockés en clair.

En cochant la case de consentement, vous reconnaissez avoir lu, compris et accepté la présente politique de confidentialité.`;

// ── Consent modal ─────────────────────────────────────────────────────────────
function ConsentModal({ onClose }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Shield size={20} color="#F59E0B" />
            <span style={{ color: "#F1F5F9", fontWeight: "700", fontSize: "15px" }}>
              Politique de confidentialité
            </span>
          </div>
          <button onClick={onClose} style={s.closeBtn}><X size={18} /></button>
        </div>
        <div style={s.modalBody}>
          <pre style={s.policyText}>{FULL_POLICY}</pre>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.closeFullBtn}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Register page ─────────────────────────────────────────────────────────────
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "client" });
  const [consented, setConsented] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!consented) return;
    setError("");
    setLoading(true);
    try {
      await register(form.email, form.password, form.full_name, form.role);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Erreur lors de la création du compte");
    } finally {
      setLoading(false);
    }
  }

  const btnActive = consented && !loading;

  return (
    <div style={s.page}>
      {showPolicy && <ConsentModal onClose={() => setShowPolicy(false)} />}

      <div style={s.card}>
        <div style={s.logo}><Sun size={36} color="#F59E0B" /></div>
        <h1 style={s.title}>Créer un compte</h1>
        <p style={s.sub}>Rejoignez Solar AI Monitor</p>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={s.label}>Nom complet</label>
          <input style={s.input} type="text" placeholder="Votre nom"
            value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />

          <label style={s.label}>Adresse email</label>
          <input style={s.input} type="email" placeholder="vous@exemple.com"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />

          <label style={s.label}>Mot de passe</label>
          <input style={s.input} type="password" placeholder="••••••••"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />

          <label style={s.label}>Type de compte</label>
          <select style={s.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="client">Client</option>
            <option value="employee">Employé</option>
          </select>

          {/* ── Consent block ── */}
          <div style={s.consentBox}>
            <label style={s.consentRow}>
              <input
                type="checkbox"
                checked={consented}
                onChange={e => setConsented(e.target.checked)}
                style={s.checkbox}
              />
              <span style={s.consentText}>
                J'accepte que Solar AI Optimizer collecte et utilise mes données de production solaire
                pour le monitoring et la maintenance de mon installation.{" "}
                <button type="button" onClick={() => setShowPolicy(true)} style={s.readMore}>
                  Lire la politique complète
                </button>
              </span>
            </label>
          </div>

          <button
            style={{ ...s.btn, ...(btnActive ? {} : s.btnDisabled) }}
            type="submit"
            disabled={!btnActive}
          >
            {loading ? "Création..." : "Créer mon compte"}
          </button>

          {!consented && (
            <p style={s.consentHint}>
              Veuillez accepter la politique de confidentialité pour continuer.
            </p>
          )}
        </form>

        <p style={s.foot}>
          Déjà inscrit ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A", padding: "1rem" },
  card: { background: "#1E293B", border: "1px solid #334155", borderRadius: "16px", padding: "2.5rem 2rem", width: "100%", maxWidth: "420px" },
  logo: { fontSize: "2.5rem", textAlign: "center", marginBottom: "0.5rem", display: "flex", justifyContent: "center" },
  title: { textAlign: "center", fontSize: "1.5rem", fontWeight: "700", color: "#F1F5F9", marginBottom: "0.25rem" },
  sub: { textAlign: "center", color: "#94A3B8", fontSize: "0.9rem", marginBottom: "1.75rem" },
  label: { display: "block", fontSize: "13px", color: "#94A3B8", marginBottom: "6px", marginTop: "1rem" },
  input: { display: "block", width: "100%", padding: "0.7rem 0.875rem", background: "#0F172A", border: "1px solid #334155", borderRadius: "8px", color: "#F1F5F9", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" },
  btn: { marginTop: "1.25rem", width: "100%", padding: "0.75rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#0F172A", fontSize: "1rem", fontWeight: "700", cursor: "pointer", transition: "opacity 0.2s" },
  btnDisabled: { background: "#475569", color: "#94A3B8", cursor: "not-allowed", opacity: 0.7 },
  error: { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#FCA5A5", padding: "0.75rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "0.5rem" },
  foot: { textAlign: "center", marginTop: "1.25rem", color: "#94A3B8", fontSize: "0.875rem" },

  // Consent
  consentBox: { marginTop: "1.5rem", background: "#0F172A", border: "1px solid #334155", borderRadius: "10px", padding: "0.875rem 1rem" },
  consentRow: { display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" },
  checkbox: { marginTop: "2px", width: "16px", height: "16px", flexShrink: 0, accentColor: "#F59E0B", cursor: "pointer" },
  consentText: { fontSize: "12.5px", color: "#94A3B8", lineHeight: "1.55" },
  readMore: { background: "none", border: "none", color: "#F59E0B", fontSize: "12.5px", cursor: "pointer", textDecoration: "underline", padding: 0, fontWeight: "600" },
  consentHint: { textAlign: "center", color: "#64748B", fontSize: "11.5px", marginTop: "0.5rem", marginBottom: 0 },

  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" },
  modal: { background: "#1E293B", border: "1px solid #334155", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "80vh", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #334155" },
  modalBody: { flex: 1, overflowY: "auto", padding: "1.25rem" },
  policyText: { whiteSpace: "pre-wrap", color: "#CBD5E1", fontSize: "13px", lineHeight: "1.75", fontFamily: "'Segoe UI', system-ui, sans-serif", margin: 0 },
  modalFooter: { padding: "1rem 1.25rem", borderTop: "1px solid #334155", display: "flex", justifyContent: "flex-end" },
  closeBtn: { background: "none", border: "none", color: "#64748B", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" },
  closeFullBtn: { background: "#F59E0B", border: "none", borderRadius: "8px", color: "#0F172A", padding: "0.5rem 1.25rem", fontWeight: "700", fontSize: "14px", cursor: "pointer" },
};
