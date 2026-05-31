"use client";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (
            el: HTMLElement,
            config: Record<string, unknown>
          ) => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const { signIn, loginWithEmail, registerWithEmail } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load the Google Identity Services script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGsiLoaded(true);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!gsiLoaded || !window.google || !buttonRef.current) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === "YOUR_GOOGLE_CLIENT_ID_HERE") {
      return; // Skip Google init if not configured
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        try {
          await signIn(response.credential);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Google Sign-in failed");
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 300,
    });
  }, [gsiLoaded, signIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (isRegister) {
        await registerWithEmail(email, password, name);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-coral/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-teal/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-8 p-8 max-w-md w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-coral flex items-center justify-center text-2xl font-bold font-mono text-white glow-coral">
            DP
          </div>
          <h1 className="text-3xl font-bold gradient-text font-display">
            DevPulse
          </h1>
          <p className="text-sm text-text2 text-center max-w-xs leading-relaxed">
            Engineering Health Intelligence Platform.
            <br />
            Sign in to connect your tools and get started.
          </p>
        </div>

        {/* Sign-in card */}
        <div className="w-full rounded-2xl border border-border bg-bg2/80 backdrop-blur-sm p-8 flex flex-col gap-6">
          <div className="space-y-2 text-center">
            <h2 className="font-semibold text-lg text-text font-display">
              {isRegister ? "Create an account" : "Welcome back"}
            </h2>
            <p className="text-xs text-text3">
              {isRegister ? "Sign up to start tracking your engineering health" : "Sign in to continue"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <div>
                <label className="block text-xs text-text3 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-teal focus:ring-1 focus:ring-teal/20 outline-none transition-colors"
                  placeholder="Your name"
                />
              </div>
            )}
            
            <div>
              <label className="block text-xs text-text3 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-teal focus:ring-1 focus:ring-teal/20 outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs text-text3 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-teal focus:ring-1 focus:ring-teal/20 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-teal hover:bg-teal/90 text-bg font-semibold py-2.5 rounded-lg transition-all text-sm disabled:opacity-50 mt-2"
            >
              {isLoading ? "Please wait..." : (isRegister ? "Sign up" : "Sign in")}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              className="text-xs text-devblue hover:text-devblue/80 transition-colors"
            >
              {isRegister ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-text3 uppercase font-mono tracking-wider">or</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          {/* Google Sign-In button container */}
          <div className="flex justify-center">
            <div ref={buttonRef} className="min-h-[44px] flex items-center justify-center" />
          </div>

          {error && (
            <div className="w-full p-3 bg-coral/10 border border-coral/20 text-coral rounded-lg text-xs text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
