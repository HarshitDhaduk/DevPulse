"use client";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/lib/auth";
import { LoginPage } from "@/components/auth/LoginPage";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-coral flex items-center justify-center text-sm font-bold font-mono text-white animate-pulse">
            DP
          </div>
          <p className="text-xs text-text3 font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
