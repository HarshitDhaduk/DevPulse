"use client";
import { useState, useCallback } from "react";
import { api } from "@/lib/api";

export function useReport() {
  const [report, setReport] = useState<string | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (workflow: string = "standup") => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post("/api/report", { workflow });
      setReport(data.report);
      setRawData(data.raw_data);
      setLastRefreshed(data.generated_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report generation failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, rawData, loading, lastRefreshed, error, generate };
}
