import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Tajawal } from "next/font/google";
import "../styles/globals.css";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const tajawal = Tajawal({
  subsets: ["arabic"],
  variable: "--font-tajawal",
  display: "swap",
  weight: ["300", "400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Watheeq AI — AI-Powered Healthcare Claims Adjudication",
  description:
    "Streamline Saudi healthcare insurance claims with AI-driven analysis, clause matching, and draft generation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${inter.variable} ${ibmPlexArabic.variable} ${tajawal.variable} font-sans antialiased min-h-screen bg-bg text-text`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
