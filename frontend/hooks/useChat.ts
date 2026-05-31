"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";

type ChatCallbacks = {
  onQueries: (queries: string[]) => void;
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
};

export function useChat() {
  const streamMessage = useCallback(
    (question: string, sessionId: string, cb: ChatCallbacks, runId?: number) => {
      const params: Record<string, string> = { q: question, session_id: sessionId };
      if (runId) params.run_id = String(runId);
      const url = api.streamUrl("/api/chat/stream", params);
      const es = new EventSource(url);

      es.addEventListener("queries", (e) => cb.onQueries(JSON.parse(e.data)));
      es.addEventListener("token", (e) => cb.onToken(JSON.parse(e.data)));
      es.addEventListener("done", () => { es.close(); cb.onDone(); });
      es.addEventListener("error", (e: any) => {
        try {
          cb.onError(JSON.parse(e.data));
        } catch {
          cb.onError("Stream error occurred.");
        }
        es.close();
        cb.onDone();
      });
      es.onerror = () => {
        if (es.readyState !== EventSource.CLOSED) {
          cb.onError("Connection lost or stream failed.");
          es.close();
          cb.onDone();
        }
      };

      return () => es.close();
    },
    []
  );

  return { streamMessage };
}
