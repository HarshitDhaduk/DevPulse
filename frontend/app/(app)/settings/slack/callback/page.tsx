"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("No authorization code found in URL.");
      return;
    }

    api.post("/api/settings/slack/oauth", { code })
      .then(() => {
        window.location.href = "/settings";
      })
      .catch((e: Error) => {
        setError(e.message || "Failed to connect to Slack");
      });
  }, [code, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
        <div className="w-12 h-12 rounded-full bg-coral/20 flex items-center justify-center text-coral">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-coral text-lg font-medium">OAuth Failed</p>
        <p className="text-text2 text-sm">{error}</p>
        <button 
          onClick={() => router.push("/settings")}
          className="mt-4 px-4 py-2 bg-bg3 border border-border rounded-lg text-sm hover:bg-border transition-colors"
        >
          Return to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
      <div className="w-12 h-12 rounded-full bg-teal/20 flex items-center justify-center animate-pulse text-teal">
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
      <p className="text-text font-medium text-lg">Connecting Slack...</p>
      <p className="text-text3 text-sm">Exchanging authorization code securely.</p>
    </div>
  );
}

export default function SlackCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
        <div className="w-12 h-12 rounded-full bg-teal/20 flex items-center justify-center animate-pulse text-teal">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
        <p className="text-text font-medium text-lg">Loading...</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
