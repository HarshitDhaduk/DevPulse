import type { Metadata } from "next";
import { IBM_Plex_Mono, Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600", "700"],
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "DevPulse — Engineering Health Intelligence",
  description:
    "AI-powered engineering health agent. Query GitHub, Linear, Slack, and Sentry with a single SQL interface.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${ibmPlexMono.variable} ${syne.variable} ${dmSans.variable} font-sans bg-bg text-text antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
