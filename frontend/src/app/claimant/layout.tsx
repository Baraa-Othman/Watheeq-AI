"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";

const navLinks = [
  {
    href: "/claimant/claims",
    label: "My Claims",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: "/claimant/claims/new",
    label: "Submit Claim",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/claimant/policies",
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

export default function ClaimantLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== "claimant")) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#fafafd" }}>
      {/* ── Sidebar (desktop) ── */}
      <aside
        className="hidden lg:flex flex-col w-64 flex-shrink-0 min-h-screen border-r"
        style={{ background: "#fff", borderColor: "#e2e2ee" }}
      >
        {/* Logo */}
        <div className="px-6 pt-7 pb-8 border-b" style={{ borderColor: "#e2e2ee" }}>
          <Link href="/claimant/claims" className="inline-flex items-center">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={120} height={32} />
          </Link>
        </div>

        {/* User greeting */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "#e2e2ee" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(5,5,8,0.35)" }}>
            Claimant
          </p>
          <p className="text-[14px] font-medium truncate" style={{ color: "#050508" }}>
            {profile.fullName}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            const isSubmit = link.href.includes("/new");
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all"
                style={{
                  background: isActive ? "rgba(0,4,232,0.07)" : isSubmit ? "rgba(0,4,232,0.04)" : "transparent",
                  color: isActive ? "#0004E8" : isSubmit ? "#0004E8" : "rgba(5,5,8,0.55)",
                  border: isSubmit && !isActive ? "1px dashed rgba(0,4,232,0.25)" : "1px solid transparent",
                }}
              >
                <span style={{ color: isActive || isSubmit ? "#0004E8" : "rgba(5,5,8,0.38)" }}>
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 pb-5 border-t pt-3" style={{ borderColor: "#e2e2ee" }}>
          <button
            onClick={signOut}
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
          <Link href="/claimant/claims">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <button
            onClick={signOut}
            className="text-[13px] font-medium"
            style={{ color: "rgba(5,5,8,0.45)" }}
          >
            Sign Out
          </button>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-10 lg:py-8 max-w-5xl w-full mx-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 border-t flex z-30"
          style={{ background: "#fff", borderColor: "#e2e2ee" }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== "/claimant/claims");
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] font-medium transition-colors"
                style={{ color: isActive ? "#0004E8" : "rgba(5,5,8,0.4)" }}
              >
                <span style={{ color: isActive ? "#0004E8" : "rgba(5,5,8,0.35)" }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
