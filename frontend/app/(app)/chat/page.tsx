"use client";
import { useState, useRef, useCallback } from "react";
import { useChat } from "@/hooks/useChat";

type Message = { role: "user" | "agent"; content: string; queries?: string[] };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`);
  const { streamMessage } = useChat();

  const send = useCallback(() => {
    if (!input.trim() || streaming) return;
    const question = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setStreaming(true);

    let agentMsg = "";
    let queries: string[] = [];

    setMessages((m) => [...m, { role: "agent", content: "", queries: [] }]);

    streamMessage(question, sessionId.current, {
      onQueries: (q) => { queries = q; },
      onToken: (t) => {
        agentMsg += t;
        setMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { role: "agent", content: agentMsg, queries };
          return updated;
        });
      },
      onError: (msg) => {
        setMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { 
            role: "agent", 
            content: updated[updated.length - 1].content + `\n\n[Error: ${msg}]`, 
            queries 
          };
          return updated;
        });
      },
      onDone: () => setStreaming(false),
    });
  }, [input, streaming, streamMessage]);

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      <h1 className="text-xl font-semibold font-display shrink-0">Chat</h1>

      <div className="flex-1 overflow-y-auto space-y-4 rounded-xl border border-border bg-bg2 p-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-text3 text-center mt-8">
            Ask anything about your engineering health — e.g. &quot;Why did errors spike yesterday?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
            {m.queries && m.queries.length > 0 && (
              <details className="text-xs text-text3 max-w-xl">
                <summary className="cursor-pointer hover:text-text2 font-mono">
                  Coral SQL ({m.queries.length} queries)
                </summary>
                <pre className="mt-1 rounded-lg bg-bg3 border border-border p-2 overflow-x-auto text-text2 font-mono text-[11px]">
                  {m.queries.join("\n\n")}
                </pre>
              </details>
            )}
            <div
              className={`max-w-xl rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-coral text-white"
                  : "bg-bg3 text-text border border-border"
              }`}
            >
              {m.content || <span className="animate-pulse text-text3">▋</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your engineering health..."
          className="flex-1 rounded-lg border border-border2 bg-bg2 px-4 py-2 text-sm outline-none focus:border-coral transition-colors placeholder:text-text3"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="rounded-lg bg-coral px-4 py-2 text-sm font-medium hover:bg-coral2 disabled:opacity-50 transition-colors text-white"
        >
          Send
        </button>
      </div>
    </div>
  );
}
