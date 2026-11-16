import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import "../styles/globals.css";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-arabic",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
        className={`${inter.variable} ${notoArabic.variable} font-sans antialiased min-h-screen bg-bg text-text`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
