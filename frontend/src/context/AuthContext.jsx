import { createContext, useContext, useState } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user"));
    } catch {
      return null;
    }
  });

  // Always re-fetch fresh user data from DB on app load (catches profile updates)
  useState(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      api.get("/auth/me").then(res => {
        sessionStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      }).catch(() => {});
    }
  });

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    sessionStorage.setItem("token", data.access_token);
    const me = await api.get("/auth/me");
    sessionStorage.setItem("user", JSON.stringify(me.data));
    setUser(me.data);
    return me.data;
  }

  async function register(data) {
    await api.post("/auth/register", { role: "client", ...data });
  }

  function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
