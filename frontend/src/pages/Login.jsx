import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BarChart3, Eye, EyeOff, Sun, ChevronRight, ChevronLeft, Check, Shield, X } from "lucide-react";
import Logo from "../components/Logo";

const FULL_POLICY = `POLITIQUE DE CONFIDENTIALITÉ — Solar AI Optimizer
Dernière mise à jour : mars 2026

1. DONNÉES COLLECTÉES
Nous collectons les informations suivantes lors de votre inscription :
• Données d'identité : nom complet, adresse e-mail, numéro de téléphone.
• Données d'installation : capacité installée, type d'installation, localisation géographique.
• Données de production : mesures en temps réel (kW/kWh), irradiation, température des panneaux.
• Données de maintenance : historique des interventions, alertes d'encrassement, prédictions IA.

2. FINALITÉS DU TRAITEMENT
Les données sont utilisées exclusivement pour :
• Afficher votre tableau de bord de monitoring solaire en temps réel.
• Calculer l'index d'encrassement via notre modèle d'intelligence artificielle.
• Vous envoyer des alertes (e-mail ou WhatsApp) lorsqu'une intervention est recommandée.
• Améliorer la précision de nos modèles (données anonymisées).

3. DURÉE DE CONSERVATION
Vos données sont conservées pendant toute la durée de votre abonnement, puis supprimées dans un délai de 90 jours après résiliation.

4. PARTAGE DES DONNÉES
Vos données ne sont jamais vendues. Elles peuvent être transmises à :
• Huawei FusionSolar (intégration API nécessaire au fonctionnement du service).
• Nos prestataires techniques (hébergement sécurisé), soumis à des accords de confidentialité.

5. VOS DROITS (RGPD)
Vous disposez des droits d'accès, de rectification, d'effacement et de portabilité.
Contact : privacy@solarai-optimizer.ma

6. SÉCURITÉ
Données stockées dans une base chiffrée. Mots de passe hachés (bcrypt), jamais stockés en clair.`;

function ConsentModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "560px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={18} color="#F59E0B" />
            <span style={{ fontWeight: "700", fontSize: "15px", color: "#111827" }}>Politique de confidentialité</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "4px", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          <pre style={{ whiteSpace: "pre-wrap", color: "#374151", fontSize: "13px", lineHeight: "1.75", fontFamily: "'Segoe UI', system-ui, sans-serif", margin: 0 }}>{FULL_POLICY}</pre>
        </div>
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#F59E0B", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 1.25rem", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

const INSTALL_TYPES = [
  { value: "residentielle", label: "Résidentielle", desc: "Maison individuelle ou appartement", icon: "\u{1F3E0}" },
  { value: "commerciale",   label: "Commerciale",   desc: "Bureau, magasin ou centre commercial", icon: "\u{1F3EC}" },
  { value: "industrielle",  label: "Industrielle",   desc: "Usine, entrepôt ou grande surface", icon: "\u{1F3ED}" },
];

const ALERT_OPTIONS = [
  { value: "email",    label: "Email uniquement",       desc: "Recevez les alertes par email" },
  { value: "whatsapp", label: "WhatsApp uniquement",    desc: "Recevez les alertes par WhatsApp" },
  { value: "both",     label: "Email + WhatsApp",       desc: "Recevez les alertes sur les deux canaux" },
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [consented, setConsented] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  // Multi-step register state
  const [step, setStep] = useState(1);
  const [reg, setReg] = useState({
    full_name: "", email: "", password: "", confirm: "", phone: "",
    installation_type: "", num_panels: "",
    fusionsolar_username: "", fusionsolar_password: "",
    alert_preference: "email",
  });

  function switchMode(m) {
    setMode(m); setError(""); setSuccess(""); setStep(1); setConsented(false);
  }

  function updateReg(field, value) {
    setReg(prev => ({ ...prev, [field]: value }));
  }

  // --- Login ---
  async function handleLogin(e) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const user = await login(loginForm.email, loginForm.password);
      navigate(user.role === "client" ? "/client" : "/employee");
    } catch (err) {
      setError(err.response?.data?.detail || "Identifiants incorrects");
    } finally { setLoading(false); }
  }

  // --- Register step validation ---
  function validateStep(s) {
    if (s === 1) {
      if (!reg.full_name.trim()) return "Veuillez entrer votre nom complet";
      if (!reg.email.trim()) return "Veuillez entrer votre email";
      if (!reg.phone.trim()) return "Veuillez entrer votre numéro de téléphone";
      if (!reg.password || reg.password.length < 6) return "Le mot de passe doit contenir au moins 6 caracteres";
      if (reg.password !== reg.confirm) return "Les mots de passe ne correspondent pas";
    }
    if (s === 2) {
      if (!reg.installation_type) return "Veuillez sélectionner un type d'installation";
      if (!reg.num_panels || Number(reg.num_panels) < 1) return "Veuillez indiquer le nombre de panneaux";
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(""); setStep(s => s + 1);
  }

  function prevStep() { setError(""); setStep(s => s - 1); }

  // --- Submit registration ---
  async function handleRegister(e) {
    e.preventDefault();
    const err = validateStep(3);
    if (err) { setError(err); return; }
    if (!consented) { setError("Veuillez accepter la politique de confidentialité pour continuer."); return; }
    setError(""); setLoading(true);
    try {
      await register({
        full_name: reg.full_name.trim(),
        email: reg.email.trim(),
        password: reg.password,
        phone: reg.phone.trim(),
        installation_type: reg.installation_type,
        num_panels: Number(reg.num_panels),
        fusionsolar_username: reg.fusionsolar_username.trim() || null,
        fusionsolar_password: reg.fusionsolar_password.trim() || null,
        alert_preference: reg.alert_preference,
      });
      setSuccess("Compte créé avec succès ! Vous pouvez maintenant vous connecter.");
      setReg({ full_name: "", email: "", password: "", confirm: "", phone: "", installation_type: "", num_panels: "", fusionsolar_username: "", fusionsolar_password: "", alert_preference: "email" });
      setStep(1);
      setMode("login");
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de la création du compte");
    } finally { setLoading(false); }
  }

  // --- Step indicator ---
  function StepIndicator() {
    const steps = [
      { num: 1, label: "Compte" },
      { num: 2, label: "Installation" },
      { num: 3, label: "Préférences" },
    ];
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0", marginBottom: "2rem" }}>
        {steps.map((st, i) => (
          <div key={st.num} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "14px", fontWeight: "700",
                background: step > st.num ? "#10B981" : step === st.num ? "#F59E0B" : "#F3F4F6",
                color: step >= st.num ? "#fff" : "#9CA3AF",
                transition: "all 0.2s",
              }}>
                {step > st.num ? <Check size={16} /> : st.num}
              </div>
              <span style={{ fontSize: "11px", color: step >= st.num ? "#374151" : "#9CA3AF", fontWeight: step === st.num ? "600" : "400" }}>{st.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: "48px", height: "2px", background: step > st.num ? "#10B981" : "#E5E7EB", marginBottom: "18px", transition: "background 0.2s" }} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // --- Render register steps ---
  function renderRegisterStep() {
    if (step === 1) return (
      <>
        <label style={s.label}>Nom complet</label>
        <input style={s.input} type="text" placeholder="Votre nom complet"
          value={reg.full_name} onChange={e => updateReg("full_name", e.target.value)} required />

        <label style={{ ...s.label, marginTop: "1rem" }}>Email</label>
        <input style={s.input} type="email" placeholder="exemple@email.com"
          value={reg.email} onChange={e => updateReg("email", e.target.value)} required />

        <label style={{ ...s.label, marginTop: "1rem" }}>Téléphone (WhatsApp)</label>
        <input style={s.input} type="tel" placeholder="+212 6XX XXX XXX"
          value={reg.phone} onChange={e => updateReg("phone", e.target.value)} required />

        <label style={{ ...s.label, marginTop: "1rem" }}>Mot de passe</label>
        <div style={{ position: "relative" }}>
          <input style={{ ...s.input, paddingRight: "3rem" }}
            type={showPass ? "text" : "password"} placeholder="Minimum 6 caracteres"
            value={reg.password} onChange={e => updateReg("password", e.target.value)} required />
          <button type="button" onClick={() => setShowPass(p => !p)} style={s.eyeBtn}>
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <label style={{ ...s.label, marginTop: "1rem" }}>Confirmer le mot de passe</label>
        <input style={s.input} type={showPass ? "text" : "password"} placeholder="Répétez votre mot de passe"
          value={reg.confirm} onChange={e => updateReg("confirm", e.target.value)} required />
      </>
    );

    if (step === 2) return (
      <>
        <label style={s.label}>Type d'installation</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1.25rem" }}>
          {INSTALL_TYPES.map(t => (
            <div key={t.value} onClick={() => updateReg("installation_type", t.value)} style={{
              display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
              border: reg.installation_type === t.value ? "2px solid #F59E0B" : "1px solid #E5E7EB",
              borderRadius: "10px", cursor: "pointer", background: reg.installation_type === t.value ? "rgba(245,158,11,0.06)" : "#fff",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: "24px" }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: "600", fontSize: "14px", color: "#111827", margin: 0 }}>{t.label}</p>
                <p style={{ fontSize: "12px", color: "#6B7280", margin: "2px 0 0" }}>{t.desc}</p>
              </div>
              {reg.installation_type === t.value && (
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={14} color="#fff" />
                </div>
              )}
            </div>
          ))}
        </div>

        <label style={s.label}>Nombre de panneaux solaires</label>
        <input style={s.input} type="number" min="1" placeholder="Ex: 12"
          value={reg.num_panels} onChange={e => updateReg("num_panels", e.target.value)} required />
      </>
    );

    if (step === 3) return (
      <>
        <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "1rem" }}>
          Ces informations sont optionnelles mais permettent à votre installateur de configurer votre station plus rapidement.
        </p>

        <label style={s.label}>Identifiant FusionSolar</label>
        <input style={s.input} type="text" placeholder="Votre identifiant FusionSolar (optionnel)"
          value={reg.fusionsolar_username} onChange={e => updateReg("fusionsolar_username", e.target.value)} />

        <label style={{ ...s.label, marginTop: "1rem" }}>Mot de passe FusionSolar</label>
        <input style={s.input} type="password" placeholder="Votre mot de passe FusionSolar (optionnel)"
          value={reg.fusionsolar_password} onChange={e => updateReg("fusionsolar_password", e.target.value)} />

        <label style={{ ...s.label, marginTop: "1.25rem" }}>Préférence d'alerte</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ALERT_OPTIONS.map(a => (
            <div key={a.value} onClick={() => updateReg("alert_preference", a.value)} style={{
              display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
              border: reg.alert_preference === a.value ? "2px solid #F59E0B" : "1px solid #E5E7EB",
              borderRadius: "10px", cursor: "pointer", background: reg.alert_preference === a.value ? "rgba(245,158,11,0.06)" : "#fff",
              transition: "all 0.15s",
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: "600", fontSize: "13px", color: "#111827", margin: 0 }}>{a.label}</p>
                <p style={{ fontSize: "11px", color: "#6B7280", margin: "2px 0 0" }}>{a.desc}</p>
              </div>
              {reg.alert_preference === a.value && (
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={12} color="#fff" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Consent checkbox ── */}
        <div style={{ marginTop: "1.25rem", background: "#F9FAFB", border: consented ? "1.5px solid #10B981" : "1.5px solid #E5E7EB", borderRadius: "10px", padding: "0.875rem 1rem", transition: "border-color 0.2s" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consented}
              onChange={e => setConsented(e.target.checked)}
              style={{ marginTop: "2px", width: "16px", height: "16px", flexShrink: 0, accentColor: "#10B981", cursor: "pointer" }}
            />
            <span style={{ fontSize: "12.5px", color: "#374151", lineHeight: "1.6" }}>
              J'ai lu et j'accepte la collecte de mes données de production solaire pour le monitoring et la maintenance de mon installation.{" "}
              <button type="button" onClick={() => setShowPolicy(true)} style={{ background: "none", border: "none", color: "#F59E0B", fontSize: "12.5px", cursor: "pointer", textDecoration: "underline", padding: 0, fontWeight: "600" }}>
                Lire la politique de confidentialité
              </button>
            </span>
          </label>
        </div>
      </>
    );
  }

  return (
    <>
      {showPolicy && <ConsentModal onClose={() => setShowPolicy(false)} />}
      <style>{`
        .login-page  { display: flex; min-height: 100vh; font-family: 'Segoe UI', system-ui, sans-serif; }
        .login-left  { flex: 1; min-height: 100vh; background: linear-gradient(160deg, #0b1a38 0%, #1a3a5c 55%, #0d2b1e 100%); display: flex; flex-direction: column; padding: 2.5rem 3rem; }
        .login-right { flex: 1; background: #fff; display: flex; align-items: center; justify-content: center; padding: 2rem; overflow-y: auto; }
        @media (max-width: 768px) { .login-left { display: none; } }
      `}</style>

      <div className="login-page">

        {/* Left panel */}
        <div className="login-left">
          <Logo size="md" color="#F59E0B" />

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ color: "#fff", fontSize: "2.6rem", fontWeight: "800", lineHeight: 1.15, marginBottom: "1.25rem" }}>
              Smart Solar<br />Monitoring<br />Powered by AI
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "1rem", lineHeight: 1.65, maxWidth: "380px" }}>
              Monitor your solar energy production, detect panel soiling, and optimize performance with real-time AI insights.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #F59E0B", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(245,158,11,0.1)" }}><Sun size={26} color="#F59E0B" /></div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Real-time</span>
            </div>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.2)", margin: "0 16px", marginBottom: "20px" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #60A5FA", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(96,165,250,0.1)" }}><BarChart3 size={26} color="#60A5FA" /></div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>Analytics</span>
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px" }}>&copy; 2026 SOLAR-AI-OPT. Optimized for Morocco.</p>
        </div>

        {/* Right panel */}
        <div className="login-right">
          <div style={{ width: "100%", maxWidth: "440px" }}>

            {mode === "login" ? (
              <>
                <h2 style={s.title}>Bienvenue</h2>
                <p style={s.sub}>Connectez-vous à votre tableau de bord solaire</p>

                {success && <div style={s.successBox}>{success}</div>}
                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={handleLogin}>
                  <label style={s.label}>Adresse email</label>
                  <input style={s.input} type="email" placeholder="exemple@email.com"
                    value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required />

                  <label style={{ ...s.label, marginTop: "1.25rem" }}>Mot de passe</label>
                  <div style={{ position: "relative" }}>
                    <input style={{ ...s.input, paddingRight: "3rem" }}
                      type={showPass ? "text" : "password"} placeholder="Entrez votre mot de passe"
                      value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
                    <button type="button" onClick={() => setShowPass(p => !p)} style={s.eyeBtn}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <button style={s.btn} type="submit" disabled={loading}>
                    {loading ? "Connexion en cours..." : "Se connecter"}
                  </button>
                </form>

                <div style={s.divider}>
                  <div style={s.divLine} /><span style={s.divText}>ou</span><div style={s.divLine} />
                </div>

                <button type="button" style={s.googleFallback}>
                  <GoogleIcon />
                  <span>Continuer avec Google</span>
                </button>

                <p style={s.foot}>
                  Pas encore de compte ?{" "}
                  <span style={s.link} onClick={() => switchMode("register")}>Créer un compte</span>
                </p>

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
              </>
            ) : (
              <>
                <h2 style={s.title}>Créer un compte</h2>
                <p style={s.sub}>Inscription en 3 étapes simples</p>

                <StepIndicator />

                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={step === 3 ? handleRegister : (e) => { e.preventDefault(); nextStep(); }}>
                  {renderRegisterStep()}

                  {/* Navigation buttons */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
                    {step > 1 && (
                      <button type="button" onClick={prevStep} style={{
                        flex: 1, padding: "0.75rem", background: "#F3F4F6", border: "1px solid #E5E7EB",
                        borderRadius: "8px", color: "#374151", fontSize: "0.95rem", fontWeight: "600",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      }}>
                        <ChevronLeft size={18} /> Retour
                      </button>
                    )}
                    {step < 3 ? (
                      <button type="submit" style={{
                        flex: 1, padding: "0.75rem", background: "#F59E0B", border: "none",
                        borderRadius: "8px", color: "#fff", fontSize: "0.95rem", fontWeight: "700",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      }}>
                        Suivant <ChevronRight size={18} />
                      </button>
                    ) : (
                      <button type="submit" disabled={loading || !consented} style={{
                        flex: 1, padding: "0.75rem", border: "none",
                        borderRadius: "8px", color: "#fff", fontSize: "0.95rem", fontWeight: "700",
                        background: (!consented || loading) ? "#9CA3AF" : "#10B981",
                        cursor: (!consented || loading) ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        transition: "background 0.2s",
                      }}>
                        {loading ? "Création en cours..." : <><Check size={18} /> Créer mon compte</>}
                      </button>
                    )}
                  </div>
                </form>

                <p style={{ ...s.foot, marginTop: "1.25rem" }}>
                  Déjà un compte ?{" "}
                  <span style={s.link} onClick={() => switchMode("login")}>Se connecter</span>
                </p>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91a8.78 8.78 0 0 0 2.69-6.62z"/>
      <path fill="#34A853" d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.91-2.26a5.43 5.43 0 0 1-8.07-2.85H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.98 10.71a5.34 5.34 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.02-2.33z"/>
      <path fill="#EA4335" d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.02 2.33A5.36 5.36 0 0 1 9 3.58z"/>
    </svg>
  );
}

const s = {
  title:    { fontSize: "2rem", fontWeight: "800", color: "#111827", marginBottom: "4px" },
  sub:      { color: "#6B7280", fontSize: "0.95rem", marginBottom: "2rem" },
  label:    { display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "6px" },
  input:    { display: "block", width: "100%", padding: "0.75rem 1rem", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#111827", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" },
  eyeBtn:   { position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: "1.1rem", padding: 0, lineHeight: 1 },
  btn:      { marginTop: "1.25rem", width: "100%", padding: "0.875rem", background: "#F59E0B", border: "none", borderRadius: "8px", color: "#fff", fontSize: "1rem", fontWeight: "700", cursor: "pointer" },
  link:     { color: "#F59E0B", fontWeight: "700", cursor: "pointer", textDecoration: "none" },
  foot:     { textAlign: "center", color: "#6B7280", fontSize: "0.875rem" },
  divider:  { display: "flex", alignItems: "center", gap: "12px", margin: "1.5rem 0" },
  divLine:  { flex: 1, height: "1px", background: "#E5E7EB" },
  divText:  { color: "#9CA3AF", fontSize: "13px" },
  googleFallback: { width: "100%", padding: "0.75rem", background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#6B7280", fontSize: "0.9rem", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "1.25rem" },
  errorBox: { background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem" },
  successBox:{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", color: "#059669", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem" },
  demo:     { marginTop: "1.5rem", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "0.875rem" },
  demoTitle:{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#F59E0B", marginBottom: "8px", fontWeight: "600" },
  demoRow:  { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" },
  demoRole: { fontSize: "11px", color: "#6B7280", width: "48px", flexShrink: 0 },
  demoCode: { fontSize: "12px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: "4px", padding: "2px 6px", color: "#374151", fontFamily: "monospace" },
};
