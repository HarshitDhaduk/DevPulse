"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface IntegrationConfig {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  tokenKey: string;
  tokenPlaceholder: string;
  extraFields?: { key: string; label: string; placeholder: string }[];
  guide: {
    title: string;
    url: string;
    steps: string[];
    scopes?: string[];
  };
}

const integrations: IntegrationConfig[] = [
  {
    id: "github",
    name: "GitHub",
    icon: "⬡",
    iconColor: "text-text2",
    bgColor: "bg-bg3",
    tokenKey: "github_token",
    tokenPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    extraFields: [
      {
        key: "github_owner",
        label: "Repository Owner",
        placeholder: "e.g. facebook, vercel, your-username",
      },
    ],
    guide: {
      title: "Create a Personal Access Token",
      url: "https://github.com/settings/tokens?type=beta",
      steps: [
        "Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens",
        'Click "Generate new token"',
        "Give it a descriptive name like \"DevPulse\"",
        "Select your target repository or organization",
        'Under "Repository permissions", grant: Contents (Read), Pull requests (Read), Issues (Read), Metadata (Read)',
        "Click \"Generate token\" and copy the token starting with ghp_",
      ],
      scopes: ["repo (contents, PRs, issues)", "read:org"],
    },
  },
  {
    id: "linear",
    name: "Linear",
    icon: "◈",
    iconColor: "text-devpurple",
    bgColor: "bg-devpurple/12",
    tokenKey: "linear_api_key",
    tokenPlaceholder: "lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    guide: {
      title: "Create a Personal API Key",
      url: "https://linear.app/settings/api",
      steps: [
        "Open Linear → Click your avatar (bottom-left) → Settings",
        "Go to \"My Account\" → \"API\" section",
        'Click "Create key" under Personal API Keys',
        "Give it a label like \"DevPulse\" and click Create",
        "Copy the generated key starting with lin_api_",
      ],
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    icon: "◎",
    iconColor: "text-coral",
    bgColor: "bg-coral/12",
    tokenKey: "sentry_token",
    tokenPlaceholder: "sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    extraFields: [
      {
        key: "sentry_org",
        label: "Organization Slug",
        placeholder: "e.g. acme-corp (from your Sentry URL)",
      },
    ],
    guide: {
      title: "Create an Auth Token",
      url: "https://sentry.io/settings/auth-tokens/",
      steps: [
        "Go to Sentry → Settings → Auth Tokens (under Account)",
        'Click "Create New Token"',
        "Select the required scopes (see below)",
        "Copy the token starting with sntrys_",
        "Find your Organization Slug from your Sentry URL: sentry.io/organizations/{slug}/",
      ],
      scopes: [
        "project:read",
        "event:read",
        "org:read",
        "issue:read",
      ],
    },
  },
  {
    id: "slack",
    name: "Slack",
    icon: "◉",
    iconColor: "text-teal",
    bgColor: "bg-teal/12",
    tokenKey: "slack_token",
    tokenPlaceholder: "xoxp-xxxxxxxxxxxx-xxxxxxxxxxxx",
    guide: {
      title: "Create a Slack App & Get Bot Token",
      url: "https://api.slack.com/apps",
      steps: [
        'Go to api.slack.com/apps → Click "Create New App" → "From scratch"',
        "Name it \"DevPulse\" and select your workspace",
        "Go to \"OAuth & Permissions\" in the left sidebar",
        "Under \"Bot Token Scopes\", add the required scopes (see below)",
        'Click "Install to Workspace" and authorize',
        'Copy the "Bot User OAuth Token" starting with xoxb-',
      ],
      scopes: [
        "channels:read",
        "channels:history",
        "users:read",
        "groups:read",
      ],
    },
  },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<Record<string, string>>({});
  const [hasTokens, setHasTokens] = useState<Record<string, boolean>>({
    github: false,
    linear: false,
    slack: false,
    sentry: false,
  });

  useEffect(() => {
    api
      .get("/api/settings")
      .then((data) => {
        setForm({
          github_owner: data.github_owner || "",
          sentry_org: data.sentry_org || "",
        });
        setHasTokens({
          github: data.has_github_token,
          linear: data.has_linear_key,
          slack: data.has_slack_token,
          sentry: data.has_sentry_token,
        });
        setLoading(false);
      })
      .catch((e) => {
        setMessages({ _global: { type: "error", text: e.message } });
        setLoading(false);
      });
  }, []);

  const handleSaveIntegration = async (integration: IntegrationConfig) => {
    setSaving(integration.id);
    setMessages((m) => ({ ...m, [integration.id]: undefined as unknown as { type: "success" | "error"; text: string } }));

    try {
      const updateData: Record<string, string> = {};

      // Token field
      const tokenVal = form[integration.tokenKey];
      if (tokenVal) {
        updateData[integration.tokenKey] = tokenVal;
      }

      // Extra fields (owner, org slug, etc.)
      for (const field of integration.extraFields || []) {
        const val = form[field.key];
        if (val !== undefined) {
          updateData[field.key] = val;
        }
      }

      if (Object.keys(updateData).length === 0) {
        setMessages((m) => ({
          ...m,
          [integration.id]: { type: "error", text: "No changes to save." },
        }));
        setSaving(null);
        return;
      }

      const res = await api.post("/api/settings/connect", updateData);
      setMessages((m) => ({
        ...m,
        [integration.id]: { type: "success", text: res.message || "Saved successfully!" },
      }));

      // Clear token field & update status
      setForm((f) => ({ ...f, [integration.tokenKey]: "" }));
      if (tokenVal) {
        setHasTokens((h) => ({ ...h, [integration.id]: true }));
      }
      setEditMode((m) => ({ ...m, [integration.id]: false }));
    } catch (e: unknown) {
      setMessages((m) => ({
        ...m,
        [integration.id]: { type: "error", text: e instanceof Error ? e.message : "Save failed" },
      }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-coral/20 flex items-center justify-center animate-pulse">
            <svg className="w-4 h-4 text-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            </svg>
          </div>
          <p className="text-sm text-text3">Loading your settings...</p>
        </div>
      </div>
    );
  }

  const configuredCount = Object.values(hasTokens).filter(Boolean).length;

  return (
    <div className="max-w-2xl mx-auto p-6 pb-12 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold font-display">Integrations & Settings</h1>
        <p className="text-sm text-text2">
          Connect your engineering tools. Each token is{" "}
          <span className="text-teal font-medium">encrypted</span> and stored securely — only you can access your credentials.
        </p>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg2/50">
        <div className={`w-2.5 h-2.5 rounded-full ${configuredCount === 4 ? "bg-teal" : configuredCount > 0 ? "bg-devyellow" : "bg-coral"} pulse-dot`} />
        <span className="text-xs text-text2 font-mono">
          {configuredCount}/4 integrations connected
        </span>
        {configuredCount < 4 && (
          <span className="text-xs text-text3 ml-auto">
            Configure tokens below to enable all features
          </span>
        )}
      </div>

      {/* Global error */}
      {messages._global && (
        <div className="p-3 bg-coral/10 border border-coral/20 text-coral rounded-lg text-sm">
          {messages._global.text}
        </div>
      )}

      {/* Integration cards */}
      <div className="space-y-4">
        {integrations.map((integration) => {
          const msg = messages[integration.id];
          const isExpanded = expandedGuide === integration.id;
          const isSaving = saving === integration.id;
          const isConfigured = hasTokens[integration.id];

          return (
            <div
              key={integration.id}
              className="rounded-xl border border-border bg-bg2 overflow-hidden transition-all"
            >
              {/* Card header */}
              <div className="p-4 pb-3 flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-lg ${integration.bgColor} flex items-center justify-center text-lg ${integration.iconColor}`}
                >
                  {integration.icon}
                </span>
                <div className="flex-1">
                  <h2 className="font-medium text-text text-sm font-display">{integration.name}</h2>
                  <p className="text-[10px] text-text3 font-mono">
                    {isConfigured ? "Token configured" : "Not connected"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isConfigured && (
                    <span className="flex items-center gap-1.5 text-xs text-teal font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                      Connected
                    </span>
                  )}
                  <button
                    onClick={() => setExpandedGuide(isExpanded ? null : integration.id)}
                    className="text-xs text-devblue hover:text-devblue/80 transition-colors font-mono flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                    How to get token
                  </button>
                </div>
              </div>

              {/* Guide panel (expandable) */}
              {isExpanded && (
                <div className="mx-4 mb-3 p-4 rounded-lg border border-devblue/20 bg-devblue/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-devblue font-display">
                      {integration.guide.title}
                    </h3>
                    <a
                      href={integration.guide.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-devblue hover:underline font-mono flex items-center gap-1"
                    >
                      Open in browser
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </div>
                  <ol className="space-y-1.5">
                    {integration.guide.steps.map((step, i) => (
                      <li key={i} className="flex gap-2 text-xs text-text2 leading-relaxed">
                        <span className="text-devblue font-mono font-bold shrink-0 w-4 text-right">
                          {i + 1}.
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {integration.guide.scopes && (
                    <div className="pt-2 border-t border-devblue/15">
                      <p className="text-[10px] text-text3 font-mono mb-1.5">Required scopes:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {integration.guide.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-2 py-0.5 rounded-md bg-devblue/10 text-devblue text-[10px] font-mono"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Form fields */}
              <div className="px-4 pb-4 space-y-3">
                {isConfigured && !editMode[integration.id] ? (
                  <div className="space-y-3">
                    {integration.extraFields?.map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs text-text3 mb-1">{field.label}</label>
                        <div className="w-full bg-bg3/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-text3">
                          {form[field.key] || <span className="italic opacity-50">Not set</span>}
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs text-text3 mb-1 flex justify-between">
                        <span>{integration.id === "linear" ? "API Key" : integration.id === "github" ? "Personal Access Token" : "Auth Token"}</span>
                        <span className="text-teal flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                          Encrypted
                        </span>
                      </label>
                      <div className="w-full bg-bg3/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-text3 font-mono tracking-widest pt-3">
                        ********************
                      </div>
                    </div>
                    {msg && (
                      <div
                        className={`p-2.5 rounded-lg text-xs ${
                          msg.type === "success"
                            ? "bg-teal/10 border border-teal/20 text-teal"
                            : "bg-coral/10 border border-coral/20 text-coral"
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                    <button
                      onClick={() => setEditMode({ ...editMode, [integration.id]: true })}
                      className="w-full bg-bg2 hover:bg-bg3 border border-border text-text font-medium py-2 rounded-lg transition-all text-sm mt-2 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit Settings
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Extra fields (owner, org, etc.) */}
                    {integration.extraFields?.map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs text-text3 mb-1">{field.label}</label>
                        <input
                          type="text"
                          className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-teal focus:ring-1 focus:ring-teal/20 outline-none transition-colors"
                          value={form[field.key] || ""}
                          onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}

                {/* Token field */}
                <div>
                  <label className="block text-xs text-text3 mb-1 flex justify-between">
                    <span>{integration.id === "linear" ? "API Key" : integration.id === "github" ? "Personal Access Token" : "Auth Token"}</span>
                    {isConfigured && (
                      <span className="text-teal flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        Encrypted
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-text focus:border-teal focus:ring-1 focus:ring-teal/20 outline-none transition-colors"
                    value={form[integration.tokenKey] || ""}
                    onChange={(e) => setForm({ ...form, [integration.tokenKey]: e.target.value })}
                    placeholder={
                      isConfigured
                        ? "Enter new token to overwrite"
                        : integration.tokenPlaceholder
                    }
                  />
                </div>

                {/* Status message */}
                {msg && (
                  <div
                    className={`p-2.5 rounded-lg text-xs ${
                      msg.type === "success"
                        ? "bg-teal/10 border border-teal/20 text-teal"
                        : "bg-coral/10 border border-coral/20 text-coral"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={() => handleSaveIntegration(integration)}
                  disabled={isSaving}
                  className="w-full bg-bg3 hover:bg-border border border-border hover:border-border2 text-text font-medium py-2 rounded-lg transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving & Restarting Coral...
                    </>
                  ) : (
                    <>
                      Save {integration.name}
                    </>
                  )}
                </button>
                
                {integration.id === "github" && process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-bg2 px-2 text-xs text-text3 font-mono">OR</span>
                      </div>
                    </div>
                    <a
                      href={`https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID}&scope=repo,read:org`}
                      className="w-full bg-[#24292F] hover:bg-[#24292F]/90 text-white font-medium py-2 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
                    >
                      <svg height="16" viewBox="0 0 16 16" version="1.1" width="16" aria-hidden="true" fill="currentColor"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                      Connect with GitHub
                    </a>
                  </>
                )}
                {integration.id === "slack" && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-bg2 px-2 text-xs text-text3 font-mono">OR</span>
                      </div>
                    </div>
                    {process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ? (
                      <a
                        href={`https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&user_scope=channels:read,channels:history,users:read,groups:read&redirect_uri=${encodeURIComponent("http://localhost:3000/settings/slack/callback")}`}
                        className="w-full bg-[#4A154B] hover:bg-[#4A154B]/90 text-white font-medium py-2 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.523-2.522v-2.522h2.523zM15.165 17.688a2.527 2.527 0 0 1-2.523-2.523 2.526 2.526 0 0 1 2.523-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z" fill="currentColor"/></svg>
                        Connect with Slack
                      </a>
                    ) : (
                      <div className="w-full border border-dashed border-border bg-bg3/50 text-text3 text-xs p-3 rounded-lg text-center font-mono">
                        Add NEXT_PUBLIC_SLACK_CLIENT_ID to .env.local to enable 1-click OAuth
                      </div>
                    )}
                  </>
                )}
                {integration.id === "linear" && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-bg2 px-2 text-xs text-text3 font-mono">OR</span>
                      </div>
                    </div>
                    {process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID ? (
                      <a
                        href={`https://linear.app/oauth/authorize?response_type=code&client_id=${process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID}&redirect_uri=${encodeURIComponent("http://localhost:3000/settings/linear/callback")}&scope=read`}
                        className="w-full bg-[#5E6AD2] hover:bg-[#5E6AD2]/90 text-white font-medium py-2 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.001 0c6.626 0 11.999 5.372 11.999 11.999 0 6.627-5.373 12-11.999 12-6.628 0-12-5.373-12-12C.001 5.372 5.373 0 12.001 0zm0 3.238c-4.839 0-8.761 3.92-8.761 8.761 0 4.84 3.922 8.761 8.761 8.761 4.839 0 8.761-3.921 8.761-8.761 0-4.841-3.922-8.761-8.761-8.761zm-4.638 4.638l9.277 9.276a1.455 1.455 0 0 1-2.058 2.057l-9.276-9.276a1.455 1.455 0 0 1 2.057-2.057z" fill="currentColor"/></svg>
                        Connect with Linear
                      </a>
                    ) : (
                      <div className="w-full border border-dashed border-border bg-bg3/50 text-text3 text-xs p-3 rounded-lg text-center font-mono">
                        Add NEXT_PUBLIC_LINEAR_CLIENT_ID to .env.local to enable 1-click OAuth
                      </div>
                    )}
                  </>
                )}
                {integration.id === "sentry" && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-bg2 px-2 text-xs text-text3 font-mono">OR</span>
                      </div>
                    </div>
                    {process.env.NEXT_PUBLIC_SENTRY_CLIENT_ID ? (
                      <a
                        href={`https://sentry.io/oauth/authorize/?client_id=${process.env.NEXT_PUBLIC_SENTRY_CLIENT_ID}&redirect_uri=${encodeURIComponent("http://localhost:3000/settings/sentry/callback")}&response_type=code&scope=org:read%20event:read%20project:read`}
                        className="w-full bg-[#362D59] hover:bg-[#362D59]/90 text-white font-medium py-2 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.583 0A12.067 12.067 0 000 11.233a11.95 11.95 0 001.077 5.093l4.78-2.617a6.386 6.386 0 01-.422-2.316C5.435 7.917 8.358 5 11.85 5a6.417 6.417 0 016.416 6.415c0 3.518-2.893 6.393-6.416 6.415a6.31 6.31 0 01-3.66-.11l-3.327 3.542A11.758 11.758 0 0011.83 23c6.643 0 12.05-5.367 12.05-11.95C23.88 4.484 18.237 0 11.583 0z" fill="currentColor"/></svg>
                        Connect with Sentry
                      </a>
                    ) : (
                      <div className="w-full border border-dashed border-border bg-bg3/50 text-text3 text-xs p-3 rounded-lg text-center font-mono">
                        Add NEXT_PUBLIC_SENTRY_CLIENT_ID to .env.local to enable 1-click OAuth
                      </div>
                    )}
                  </>
                )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Security notice */}
      <div className="rounded-xl border border-border bg-bg2/50 p-4 flex gap-3">
        <svg className="w-5 h-5 text-teal shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <div>
          <p className="text-xs font-medium text-text mb-1">Your tokens are secure</p>
          <p className="text-[10px] text-text3 leading-relaxed">
            All API tokens are encrypted using AES-256 (Fernet) with a server-side key before storage.
            Tokens are never stored in plain text and are isolated per user — no other user can access your credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
