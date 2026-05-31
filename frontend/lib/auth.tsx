"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (googleCredential: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  signIn: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const TOKEN_KEY = "devpulse_token";
const USER_KEY = "devpulse_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      // Validate token is still good
      api
        .get("/api/auth/me", savedToken)
        .then((data) => {
          setUser(data);
          localStorage.setItem(USER_KEY, JSON.stringify(data));
        })
        .catch(() => {
          // Token expired/invalid — clear
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setToken(null);
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const signIn = useCallback(async (googleCredential: string) => {
    const res = await api.post("/api/auth/google", {
      credential: googleCredential,
    });
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }, []);

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    const res = await api.post("/api/auth/login", {
      email,
      password: pass,
      name: "",
    });
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }, []);

  const registerWithEmail = useCallback(async (email: string, pass: string, name: string) => {
    const res = await api.post("/api/auth/register", {
      email,
      password: pass,
      name,
    });
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, loginWithEmail, registerWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
