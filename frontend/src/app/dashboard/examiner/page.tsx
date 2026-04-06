"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const navLinks = [
  {
    href: "/dashboard/examiner/claims",
    label: "Claims Queue",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/policies",
    label: "Policy Plans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

export default function ExaminerDashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "examiner") {
      router.replace(`/dashboard/${profile.role}`);
    }
  }, [user, profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#fafafd" }}>
        <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!user || profile.role !== "examiner") return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#fafafd" }}>
      {/* ── Sidebar (desktop) ── */}
      <aside
        className="hidden lg:flex flex-col w-64 flex-shrink-0 min-h-screen border-r"
        style={{ background: "#fff", borderColor: "#e2e2ee" }}
      >
        {/* Logo */}
        <div className="px-6 pt-7 pb-8 border-b" style={{ borderColor: "#e2e2ee" }}>
          <Link href="/dashboard/examiner" className="inline-flex items-center">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={120} height={32} />
          </Link>
        </div>

        {/* User greeting */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "#e2e2ee" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(5,5,8,0.35)" }}>
            Claims Examiner
          </p>
          <p className="text-[14px] font-medium truncate" style={{ color: "#050508" }}>
            {profile.fullName}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all"
              style={{
                background: "transparent",
                color: "rgba(5,5,8,0.55)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,4,232,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "rgba(5,5,8,0.38)" }}>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 pb-5 border-t pt-3" style={{ borderColor: "#e2e2ee" }}>
          <button
            onClick={async () => { await signOut(); router.push("/login"); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium w-full text-left transition-all"
            style={{ color: "rgba(5,5,8,0.45)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header
          className="lg:hidden flex items-center justify-between px-5 py-4 border-b sticky top-0 z-30"
          style={{ background: "#fff", borderColor: "#e2e2ee" }}
        >
          <Link href="/dashboard/examiner">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <button
            onClick={async () => { await signOut(); router.push("/login"); }}
            className="text-[13px] font-medium"
            style={{ color: "rgba(5,5,8,0.45)" }}
          >
            Sign Out
          </button>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-10 lg:py-8 max-w-5xl w-full mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Page header */}
            <div className="mb-8">
              <h1 className="text-[28px] font-bold tracking-tight" style={{ color: "#050508" }}>
                Welcome, {profile.fullName}
              </h1>
              <p className="text-[14px] mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                Review and process insurance claims with AI assistance.
              </p>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Claims Queue card */}
              <Link
                href="/dashboard/examiner/claims"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.08)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  Claims Queue
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  View, pick, and process submitted insurance claims.
                </p>
              </Link>

              {/* Policy Plans card */}
              <Link
                href="/dashboard/policies"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.08)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  Policy Plans
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  View and download available insurance policy plan documents.
                </p>
              </Link>
            </div>
          </motion.div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 border-t flex z-30"
          style={{ background: "#fff", borderColor: "#e2e2ee" }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] font-medium transition-colors"
              style={{ color: "rgba(5,5,8,0.4)" }}
            >
              <span style={{ color: "rgba(5,5,8,0.35)" }}>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
