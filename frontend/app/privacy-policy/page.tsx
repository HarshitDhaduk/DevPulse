import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <nav className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-coral flex items-center justify-center text-xs font-bold font-mono text-white">
            DP
          </div>
          <span className="text-lg font-bold gradient-text font-display">DevPulse</span>
        </Link>
      </nav>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold font-display mb-6 text-text">Privacy Policy</h1>
        <div className="space-y-6 text-sm text-text2 leading-relaxed">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">1. Information We Collect</h2>
            <p>We collect information you provide directly to us when using DevPulse, including account information, and data from connected third-party tools (GitHub, Linear, Slack, Sentry).</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">2. How We Use Your Information</h2>
            <p>We use the collected information to provide, maintain, and improve our services, process transactions, and send you related information such as engineering health reports.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">3. Data Security</h2>
            <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">4. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us.</p>
          </section>
        </div>
      </main>
      <footer className="border-t border-border/60 px-6 py-6 flex flex-col sm:flex-row items-center justify-between text-xs text-text3 font-mono">
        <div>DevPulse · Engineering Health Intelligence</div>
        <div className="flex gap-4 mt-4 sm:mt-0">
          <Link href="/privacy-policy" className="hover:text-text transition-colors">Privacy Policy</Link>
          <Link href="/terms-conditions" className="hover:text-text transition-colors">Terms &amp; Conditions</Link>
        </div>
      </footer>
    </div>
  );
}
