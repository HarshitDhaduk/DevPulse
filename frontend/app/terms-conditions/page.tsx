import Link from "next/link";

export default function TermsConditions() {
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
        <h1 className="text-3xl font-bold font-display mb-6 text-text">Terms &amp; Conditions</h1>
        <div className="space-y-6 text-sm text-text2 leading-relaxed">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">1. Acceptance of Terms</h2>
            <p>By accessing and using DevPulse, you accept and agree to be bound by the terms and provision of this agreement.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">2. Use License</h2>
            <p>Permission is granted to temporarily use DevPulse for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">3. Disclaimer</h2>
            <p>The materials on DevPulse are provided on an &apos;as is&apos; basis. DevPulse makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-text mb-3">4. Limitations</h2>
            <p>In no event shall DevPulse or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on DevPulse.</p>
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
