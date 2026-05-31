import Link from "next/link";

const sources = [
  { name: "GitHub",  color: "bg-bg3",          iconColor: "text-text2",     icon: "⬡", desc: "PRs, commits, CI runs" },
  { name: "Linear",  color: "bg-devpurple/12", iconColor: "text-devpurple",  icon: "◈", desc: "Issues, sprints, cycles" },
  { name: "Slack",   color: "bg-teal/12",       iconColor: "text-teal",      icon: "◉", desc: "Team activity, channels" },
  { name: "Sentry",  color: "bg-coral/12",      iconColor: "text-coral",     icon: "◎", desc: "Errors, events, alerts" },
];

const features = [
  {
    icon: "⚡",
    title: "Unified Engineering View",
    desc: "Stop switching between GitHub, Linear, Slack, and Sentry. DevPulse merges all your engineering data into a single queryable interface.",
  },
  {
    icon: "🤖",
    title: "AI-Powered Health Reports",
    desc: "Automatically generated daily digests surface blockers, error spikes, and workload imbalances — so you start each standup with answers, not questions.",
  },
  {
    icon: "💬",
    title: "Natural Language Queries",
    desc: "Ask plain English questions like \"Why did errors spike yesterday?\" and get data-backed answers in seconds with full source traceability.",
  },
  {
    icon: "📊",
    title: "Cross-Source SQL Engine",
    desc: "Run SQL queries that JOIN across all your engineering tools simultaneously. Correlate PRs to Linear issues to Sentry errors in a single statement.",
  },
];

const steps = [
  {
    step: "01",
    title: "Connect your tools",
    desc: "Register your GitHub, Linear, Slack, and Sentry sources. DevPulse handles auth, pagination, and rate limiting for you.",
  },
  {
    step: "02",
    title: "Query everything at once",
    desc: "Use natural language or SQL to query across all sources simultaneously. No more tab-switching or manual correlation.",
  },
  {
    step: "03",
    title: "Get actionable insights",
    desc: "AI synthesizes raw data into clear reports with blockers, risks, and team highlights — delivered to your dashboard every morning.",
  },
];

const metrics = [
  { value: "4", label: "Data Sources", sub: "GitHub · Linear · Slack · Sentry" },
  { value: "30+", label: "Minutes Saved", sub: "Per morning standup" },
  { value: "<5s", label: "Query Time", sub: "Cross-source JOINs" },
  { value: "24/7", label: "Monitoring", sub: "Automated health digests" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-coral flex items-center justify-center text-xs font-bold font-mono text-white">
            DP
          </div>
          <span className="text-lg font-bold gradient-text font-display">DevPulse</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-text2 hover:text-text transition-colors">
            Dashboard
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-coral hover:bg-coral2 px-4 py-2 text-sm font-medium transition-colors text-white"
          >
            Open App →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded border border-coral/30 bg-coral/8 px-4 py-1.5 text-xs text-coral font-mono font-semibold tracking-wide uppercase">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-coral inline-block" />
          Engineering Health Intelligence Platform
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 max-w-3xl font-display" style={{ letterSpacing: "-0.02em" }}>
          Engineering health,{" "}
          <span className="gradient-text">one query away</span>
        </h1>

        <p className="text-lg text-text2 max-w-xl mb-10 leading-relaxed font-light">
          Get a unified view of sprint health, error trends, and team velocity across GitHub,
          Linear, Slack, and Sentry — in seconds, not hours.
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-coral hover:bg-coral2 px-6 py-3 text-sm font-semibold transition-colors glow-coral text-white"
          >
            Open Dashboard →
          </Link>
          <Link
            href="/chat"
            className="rounded-lg border border-border2 hover:border-text3 bg-bg2 hover:bg-bg3 px-6 py-3 text-sm font-semibold transition-colors text-text"
          >
            Try Chat Interface
          </Link>
        </div>

        {/* SQL demo block */}
        <div className="mt-16 w-full max-w-2xl rounded-xl border border-border bg-bg2/80 text-left overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg2">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-devyellow/70" />
            <span className="h-3 w-3 rounded-full bg-teal/70" />
            <span className="ml-2 text-xs text-text3 font-mono">devpulse query</span>
          </div>
          <pre className="p-5 text-xs font-mono text-text2 leading-relaxed overflow-x-auto">
{`SELECT
  l.issue_title,  l.assignee,
  g.pr_status,    g.pr_url,
  s.error_count,  sl.last_message_at
FROM linear.issues l
LEFT JOIN github.pull_requests g
  ON g.branch LIKE '%' || l.issue_id || '%'
LEFT JOIN sentry.issue_stats s
  ON s.title ILIKE '%' || l.issue_title || '%'
LEFT JOIN slack.channel_messages sl
  ON sl.channel = 'engineering'
WHERE l.state = 'in_progress'
ORDER BY s.error_count DESC;`}
          </pre>
          <div className="px-4 py-2 border-t border-border bg-bg2/50 text-xs text-text3 font-mono">
            One query · Four sources · Instant cross-source correlation
          </div>
        </div>
      </section>

      {/* Metrics Strip */}
      <section className="px-6 py-12 border-t border-border/60 bg-bg2/30">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-3xl font-bold font-display gradient-text">{m.value}</p>
              <p className="text-sm font-semibold text-text mt-1">{m.label}</p>
              <p className="text-xs text-text3 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16 border-t border-border/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] text-text3 uppercase tracking-widest mb-3 font-mono font-semibold">
            How it works
          </p>
          <h2 className="text-2xl font-bold text-center mb-10 font-display">
            From data chaos to <span className="gradient-text">clarity</span> in three steps
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div
                key={s.step}
                className="card-hover rounded-xl border border-border bg-bg2 p-6 relative"
              >
                <span className="text-4xl font-black text-coral/15 font-mono absolute top-4 right-4">
                  {s.step}
                </span>
                <p className="font-semibold text-sm mb-2 text-text font-display">{s.title}</p>
                <p className="text-xs text-text2 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Connected Sources */}
      <section className="px-6 py-16 border-t border-border/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] text-text3 uppercase tracking-widest mb-8 font-mono font-semibold">
            Connected data sources
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {sources.map((s) => (
              <div
                key={s.name}
                className="card-hover rounded-xl border border-border bg-bg2 p-5 flex flex-col gap-2"
              >
                <span
                  className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center text-lg ${s.iconColor}`}
                >
                  {s.icon}
                </span>
                <p className="font-semibold text-sm text-text">{s.name}</p>
                <p className="text-xs text-text3">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 border-t border-border/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] text-text3 uppercase tracking-widest mb-3 font-mono font-semibold">
            Capabilities
          </p>
          <h2 className="text-2xl font-bold text-center mb-10 font-display">
            Everything your team needs to <span className="gradient-text">stay healthy</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="card-hover rounded-xl border border-border bg-bg2 p-6 flex gap-4"
              >
                <span className="text-2xl shrink-0">{f.icon}</span>
                <div>
                  <p className="font-semibold text-sm mb-1 text-text font-display">{f.title}</p>
                  <p className="text-xs text-text2 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="px-6 py-16 border-t border-border/60 bg-bg2/30">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[10px] text-text3 uppercase tracking-widest mb-3 font-mono font-semibold">
            Built for engineering teams
          </p>
          <h2 className="text-2xl font-bold text-center mb-10 font-display">
            Questions DevPulse <span className="gradient-text">answers daily</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              "What's blocked in the current sprint?",
              "Did last night's deploy cause new errors?",
              "Which engineers are overloaded right now?",
              "Why did that incident happen and which PR caused it?",
              "What's the PR velocity trend this cycle?",
              "Are there any carry-over issues from last sprint?",
            ].map((q) => (
              <div
                key={q}
                className="rounded-lg border border-border bg-bg2 px-5 py-3.5 text-sm text-text2 flex items-center gap-3"
              >
                <span className="text-coral text-xs font-mono shrink-0">→</span>
                {q}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 px-6 py-6 text-center text-xs text-text3 font-mono">
        DevPulse · Engineering Health Intelligence
      </footer>
    </div>
  );
}
