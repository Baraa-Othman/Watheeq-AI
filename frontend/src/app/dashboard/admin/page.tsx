"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetchAuth } from "@/lib/apiClient";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

import { LangProvider, useLang } from "@/lib/lang-context";
import LangToggle from "@/components/LangToggle";

const navLinks = [
  {
    href: "/dashboard/admin/requests",
    label: "Examiner Requests",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/dashboard/admin/policies",
    label: "Policy Plans",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/dashboard/admin/statistics",
    label: "Claims Statistics",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </svg>
    ),
  },
  {
    href: "/dashboard/admin/examiners",
    label: "Examiner Performance",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/admin/audit",
    label: "Audit Log",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
];

type Status = "submitted" | "under review" | "approved" | "rejected" | "cancelled";

interface ClaimsStats {
  total: number;
  byStatus: Record<string, number>;
}

interface ExaminerPerf {
  examinerId: string;
  fullName: string;
  email: string;
  totalAssigned: number;
  approved: number;
  rejected: number;
  underReview: number;
  approvalRate: number;
  avgHandlingSeconds: number | null;
  handledCount: number;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

const STATUS_ORDER: Status[] = ["submitted", "under review", "approved", "rejected", "cancelled"];
const STATUS_META: Record<Status, { bar: string; label: string }> = {
  submitted:      { bar: "#0004E8", label: "Submitted" },
  "under review": { bar: "#a855f7", label: "Under Review" },
  approved:       { bar: "#22c55e", label: "Approved" },
  rejected:       { bar: "#ef4444", label: "Rejected" },
  cancelled:      { bar: "#6b7280", label: "Cancelled" },
};

export default function AdminDashboard() {
  return (
    <LangProvider>
      <AdminDashboardInner />
    </LangProvider>
  );
}

function AdminDashboardInner() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [claimsStats, setClaimsStats] = useState<ClaimsStats | null>(null);
  const [examinerPerf, setExaminerPerf] = useState<ExaminerPerf[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetchAuth("/api/admin/examiner-requests?status=pending", user);
      if (res.ok) {
        const data = await res.json();
        setPendingCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      // non-fatal
    }
  }, [user]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const [claimsRes, examinersRes] = await Promise.all([
        apiFetchAuth("/api/admin/stats/claims", user),
        apiFetchAuth("/api/admin/stats/examiners", user),
      ]);
      if (claimsRes.ok) setClaimsStats(await claimsRes.json());
      if (examinersRes.ok) setExaminerPerf(await examinersRes.json());
    } catch {
      // non-fatal — charts simply won't render
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const t = setTimeout(() => {
        fetchPendingCount();
        fetchStats();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [loading, user, profile, fetchPendingCount, fetchStats]);

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

  if (!user || profile.role !== "admin") return null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" dir={isRTL ? "rtl" : "ltr"} style={{ background: "#fafafd" }}>
      {/* ── Sidebar (desktop) ── */}
      <aside
        className={`hidden lg:flex flex-col w-64 flex-shrink-0 min-h-screen ${isRTL ? "border-l" : "border-r"}`}
        style={{ background: "#fff", borderColor: "#e2e2ee" }}
      >
        {/* Logo + language toggle row */}
        <div className="px-5 pt-7 pb-5 border-b flex items-center justify-between w-full gap-2" style={{ borderColor: "#e2e2ee" }}>
          <Link href="/dashboard/admin" className="inline-flex items-center">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={29} className="shrink-0" />
          </Link>
          <LangToggle compact />
        </div>

        {/* User greeting */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "#e2e2ee" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(5,5,8,0.35)" }}>
            {t("adminRole")}
          </p>
          <p className="text-[14px] font-medium truncate" style={{ color: "#050508" }}>
            {profile.fullName}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map((link) => {
            const isPending = link.href.includes("/requests") && pendingCount !== null && pendingCount > 0;
            const localizedLabel =
              link.label === "Examiner Requests" ? t("examinerRequests") :
              link.label === "Policy Plans" ? t("policyPlansTitle") :
              link.label === "Claims Statistics" ? t("claimsStats") :
              link.label === "Examiner Performance" ? t("examinerPerf") :
              link.label === "Audit Log" ? t("auditLog") : link.label;

            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all"
                style={{
                  background: "transparent",
                  color: "rgba(5,5,8,0.55)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,4,232,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span className="flex items-center gap-3">
                  <span style={{ color: "rgba(5,5,8,0.38)" }}>{link.icon}</span>
                  {localizedLabel}
                </span>
                {isPending && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(234,179,8,0.15)", color: "#b45309" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={isRTL ? "rotate-180" : ""}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t("signOut")}
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
          <Link href="/dashboard/admin">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <div className="flex items-center gap-3">
            <LangToggle compact />
            <button
              onClick={async () => { await signOut(); router.push("/login"); }}
              className="text-[13px] font-medium"
              style={{ color: "rgba(5,5,8,0.45)" }}
            >
              {t("signOut")}
            </button>
          </div>
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
                {t("welcomeAdmin")}{profile.fullName}
              </h1>
              <p className="text-[14px] mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                {t("adminPortalSub")}
              </p>
            </div>

            {/* ── Live charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {/* Claims by status */}
              <div
                className="rounded-2xl border p-6"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-bold" style={{ color: "#050508" }}>{t("claimsByStatus")}</h3>
                  <Link href="/dashboard/admin/statistics" className="text-xs font-semibold" style={{ color: "#0004E8" }}>
                    {t("fullView")}
                  </Link>
                </div>
                <p className="text-xs mb-5" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {claimsStats ? `${claimsStats.total}${t("totalClaims")}` : t("loadingTotals")}
                </p>

                {statsLoading && !claimsStats ? (
                  <ChartSkeleton rows={5} />
                ) : claimsStats ? (
                  <ClaimsDoughnut stats={claimsStats} />
                ) : (
                  <p className="text-xs italic" style={{ color: "rgba(5,5,8,0.4)" }}>{t("unableLoadStats")}</p>
                )}
              </div>

              {/* Examiner performance */}
              <div
                className="rounded-2xl border p-6"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-bold" style={{ color: "#050508" }}>{t("fastestExaminers")}</h3>
                  <Link href="/dashboard/admin/examiners" className="text-xs font-semibold" style={{ color: "#0004E8" }}>
                    {t("fullView")}
                  </Link>
                </div>
                <p className="text-xs mb-5" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("avgTimePickDecision")}
                </p>

                {statsLoading && !examinerPerf ? (
                  <ChartSkeleton rows={4} />
                ) : examinerPerf && examinerPerf.some((e) => e.avgHandlingSeconds !== null) ? (
                  <ExaminerHandlingTimeChart perf={examinerPerf} />
                ) : (
                  <p className="text-xs italic" style={{ color: "rgba(5,5,8,0.4)" }}>
                    {t("noClosedClaimsYet")}
                  </p>
                )}
              </div>
            </div>

            {/* Volume over time — full width row */}
            {user && <VolumeOverTimeSection user={user} />}

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Examiner Requests card */}
              <Link
                href="/dashboard/admin/requests"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,4,232,0.08)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  {pendingCount !== null && pendingCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(234,179,8,0.15)", color: "#b45309" }}>
                      {pendingCount}{t("pendingLabel")}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  {t("examinerRequests")}
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("requestsCardDesc")}
                </p>
              </Link>

              {/* Policy Plans card */}
              <Link
                href="/dashboard/admin/policies"
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
                  {t("policyPlansTitle")}
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("policiesCardDesc")}
                </p>
              </Link>

              {/* Claims Statistics card */}
              <Link
                href="/dashboard/admin/statistics"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.08)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                    <line x1="3" y1="20" x2="21" y2="20" />
                  </svg>
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  {t("claimsStats")}
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("statsCardDesc")}
                </p>
              </Link>

              {/* Examiner Performance card */}
              <Link
                href="/dashboard/admin/examiners"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.08)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  {t("examinerPerf")}
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("perfCardDesc")}
                </p>
              </Link>

              {/* Audit Log card */}
              <Link
                href="/dashboard/admin/audit"
                className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.08)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="13" y2="17" />
                  </svg>
                </div>
                <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
                  {t("auditLog")}
                </h3>
                <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("auditCardDesc")}
                </p>
              </Link>
            </div>
          </motion.div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 border-t flex z-30 font-medium"
          style={{ background: "#fff", borderColor: "#e2e2ee" }}
        >
          {navLinks.map((link) => {
            const localizedLabel =
              link.label === "Examiner Requests" ? t("examinerRequests") :
              link.label === "Policy Plans" ? t("policyPlansTitle") :
              link.label === "Claims Statistics" ? t("claimsStats") :
              link.label === "Examiner Performance" ? t("examinerPerf") :
              link.label === "Audit Log" ? t("auditLog") : link.label;

            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] transition-colors"
                style={{ color: "rgba(5,5,8,0.4)" }}
              >
                <span style={{ color: "rgba(5,5,8,0.35)" }}>{link.icon}</span>
                {localizedLabel}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function ClaimsDoughnut({ stats }: { stats: ClaimsStats }) {
  const { t, isRTL } = useLang();
  const total = STATUS_ORDER.reduce((sum, s) => sum + (stats.byStatus?.[s] ?? 0), 0);
  const [hovered, setHovered] = useState<Status | null>(null);

  // Doughnut geometry
  const radius = 70;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;

  // Translate helper
  const getStatusLabel = (status: string) => {
    if (status === "submitted") return t("statusSubmitted");
    if (status === "under review") return t("statusUnderReview");
    if (status === "approved") return t("statusApproved");
    if (status === "rejected") return t("statusRejected");
    if (status === "cancelled") return t("statusCancelled");
    return status;
  };

  // Build slices with cumulative offsets, skip zero counts
  let offset = 0;
  const slices = STATUS_ORDER.map((s) => {
    const count = stats.byStatus?.[s] ?? 0;
    const fraction = total > 0 ? count / total : 0;
    const dash = fraction * circumference;
    const slice = { status: s, count, fraction, dash, offset };
    offset += dash;
    return slice;
  });

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[180px] text-sm italic" style={{ color: "rgba(5,5,8,0.4)" }}>
        {t("noClaimsYet")}
      </div>
    );
  }

  const activeSlice = hovered ? slices.find((s) => s.status === hovered) : null;
  const activePct = activeSlice ? Math.round(activeSlice.fraction * 100) : 0;

  return (
    <div className={`flex flex-col sm:flex-row items-center gap-6 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
      {/* SVG doughnut */}
      <div className="relative flex-shrink-0">
        <svg width="180" height="180" viewBox="0 0 180 180">
          {/* Track */}
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="#f0f0f5"
            strokeWidth={stroke}
          />
          {/* Slices — rotate -90deg so the first slice starts at 12 o'clock */}
          <g transform="rotate(-90 90 90)">
            {slices.map((sl) => {
              if (sl.count === 0) return null;
              const isHovered = hovered === sl.status;
              const isDimmed = hovered !== null && !isHovered;
              return (
                <motion.circle
                  key={sl.status}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={STATUS_META[sl.status].bar}
                  strokeWidth={isHovered ? stroke + 4 : stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${sl.dash} ${circumference - sl.dash}`}
                  initial={{ strokeDashoffset: -sl.offset + circumference }}
                  animate={{
                    strokeDashoffset: -sl.offset,
                    opacity: isDimmed ? 0.3 : 1,
                  }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  style={{ cursor: "pointer", transition: "stroke-width 0.15s ease, opacity 0.15s ease" }}
                  onMouseEnter={() => setHovered(sl.status)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{`${getStatusLabel(sl.status)}: ${sl.count} (${Math.round(sl.fraction * 100)}%)`}</title>
                </motion.circle>
              );
            })}
          </g>
        </svg>
        {/* Center label — swaps to hovered slice details */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 text-center">
          {activeSlice ? (
            <>
              <span className="text-2xl font-bold tabular-nums" style={{ color: STATUS_META[activeSlice.status].bar }}>
                {activeSlice.count}
              </span>
              <span className="text-[10px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: "rgba(5,5,8,0.55)" }}>
                {getStatusLabel(activeSlice.status)}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: "rgba(5,5,8,0.4)" }}>
                {isRTL ? `%${activePct} من الإجمالي` : `${activePct}% of total`}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold" style={{ color: "#050508" }}>{total}</span>
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "rgba(5,5,8,0.4)" }}>
                {isRTL ? "الإجمالي" : "Total"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-2">
        {slices.map((sl) => {
          const pct = total > 0 ? Math.round(sl.fraction * 100) : 0;
          const isHovered = hovered === sl.status;
          const isDimmed = hovered !== null && !isHovered;
          return (
            <div
              key={sl.status}
              className="flex items-center justify-between text-xs rounded-md px-1.5 py-0.5 cursor-pointer transition-all"
              style={{
                background: isHovered ? "rgba(0,4,232,0.05)" : "transparent",
                opacity: isDimmed ? 0.5 : 1,
              }}
              onMouseEnter={() => setHovered(sl.status)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: STATUS_META[sl.status].bar }}
                />
                <span className="truncate" style={{ color: "rgba(5,5,8,0.7)" }}>
                  {getStatusLabel(sl.status)}
                </span>
              </span>
              <span className="font-semibold tabular-nums" style={{ color: "#050508" }} dir="ltr">
                {sl.count} <span className="font-normal" style={{ color: "rgba(5,5,8,0.4)" }}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExaminerHandlingTimeChart({ perf }: { perf: ExaminerPerf[] }) {
  const { t, isRTL } = useLang();
  const ranked = perf
    .filter((e) => e.avgHandlingSeconds !== null && e.handledCount > 0)
    .sort((a, b) => (a.avgHandlingSeconds as number) - (b.avgHandlingSeconds as number))
    .slice(0, 5);

  const maxSeconds = Math.max(1, ...ranked.map((e) => e.avgHandlingSeconds as number));

  return (
    <div className="space-y-3">
      {ranked.map((e, i) => {
        const seconds = e.avgHandlingSeconds as number;
        const width = (seconds / maxSeconds) * 100;
        // Top performer (fastest) gets the strongest accent; others get a lighter shade.
        const color = i === 0 ? "#0004E8" : "#8085ff";
        return (
          <div key={e.examinerId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold truncate max-w-[180px]" style={{ color: "#050508" }}>
                {i === 0 && <span className={isRTL ? "ml-1.5" : "mr-1.5"}>⚡</span>}
                {e.fullName || "(unnamed)"}
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color: "#0004E8" }}>
                {formatDuration(seconds)}
              </span>
            </div>
            <div className="h-4 rounded-md overflow-hidden" style={{ background: "#f5f5f8" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`h-full rounded-md ${isRTL ? "mr-0" : "ml-0"}`}
                style={{ background: color }}
                title={`${e.handledCount} closed claim(s)`}
              />
            </div>
            <span className="text-[10px] mt-0.5 inline-block" style={{ color: "rgba(5,5,8,0.4)" }}>
              {isRTL ? `خلال ${e.handledCount} مطالبات` : `over ${e.handledCount} claims`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-6 rounded-md animate-pulse"
          style={{ background: "#f0f0f5" }}
        />
      ))}
    </div>
  );
}

// ─── Volume over time ────────────────────────────────────────────────────────

interface VolumeBucket {
  date: string;
  count: number;
}

interface VolumeData {
  year: number;
  quarter: number;
  quarters: { quarter: number; count: number }[];
  buckets: VolumeBucket[];
  totalInQuarter: number;
  availableYears: number[];
}

const QUARTER_LABELS: Record<number, string> = { 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VolumeOverTimeSection({ user }: { user: any }) {
  const { t, isRTL } = useLang();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  const [year, setYear] = useState<number>(currentYear);
  const [quarter, setQuarter] = useState<number>(currentQuarter);
  const [data, setData] = useState<VolumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<VolumeBucket | null>(null);

  const fetchVolume = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchAuth(`/api/admin/stats/claims/volume?year=${year}&quarter=${quarter}`, user);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load volume data");
    } finally {
      setLoading(false);
    }
  }, [user, year, quarter]);

  useEffect(() => {
    fetchVolume();
  }, [fetchVolume]);

  return (
    <div
      className="rounded-2xl border p-6 mt-4 mb-4"
      style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
    >
      {/* Header + controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <h3 className="text-base font-bold" style={{ color: "#050508" }}>{t("volumeOverTime")}</h3>

        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
            style={{ borderColor: "#e2e2ee", background: "#fff", color: "#050508" }}
          >
            {(data?.availableYears ?? [currentYear]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "#f0f0f5" }}>
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                style={
                  quarter === q
                    ? { background: "#fff", color: "#0004E8", boxShadow: "0 1px 2px rgba(5,5,8,0.08)" }
                    : { color: "rgba(5,5,8,0.45)" }
                }
              >
                {isRTL ? `الربع ${q}` : `Q${q}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <ChartSkeleton rows={3} />
      ) : error ? (
        <p className="text-xs italic" style={{ color: "#dc2626" }}>{isRTL ? "فشل تحميل بيانات حجم المطالبات" : error}</p>
      ) : data ? (
        <DailyLineChart
          buckets={data.buckets}
          hovered={hoveredDay}
          onHover={setHoveredDay}
        />
      ) : null}
    </div>
  );
}

// Monotone cubic interpolation (Fritsch–Carlson). Returns SVG path segments
// that pass through every point without overshooting — appropriate for
// monotonic data like a cumulative total.
function buildSmoothPath(points: { x: number; y: number }[]): { line: string; area: string } {
  const n = points.length;
  if (n === 0) return { line: "", area: "" };
  if (n === 1) {
    const p = points[0];
    return { line: `M${p.x},${p.y}`, area: `M${p.x},100 L${p.x},${p.y} L${p.x},100 Z` };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    dy[i] = ys[i + 1] - ys[i];
    slopes[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }

  // Enforce monotonicity (prevents overshoot)
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h2 = a * a + b * b;
    if (h2 > 9) {
      const tau = 3 / Math.sqrt(h2);
      tangents[i] = tau * a * slopes[i];
      tangents[i + 1] = tau * b * slopes[i];
    }
  }

  const segs: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const cp1x = xs[i] + h;
    const cp1y = ys[i] + h * tangents[i];
    const cp2x = xs[i + 1] - h;
    const cp2y = ys[i + 1] - h * tangents[i + 1];
    segs.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${xs[i + 1]},${ys[i + 1]}`);
  }

  const line = `M${xs[0]},${ys[0]} ${segs.join(" ")}`;
  const area = `M${xs[0]},100 L${xs[0]},${ys[0]} ${segs.join(" ")} L${xs[n - 1]},100 Z`;
  return { line, area };
}

function DailyLineChart({
  buckets,
  hovered,
  onHover,
}: {
  buckets: VolumeBucket[];
  hovered: VolumeBucket | null;
  onHover: (b: VolumeBucket | null) => void;
}) {
  const { t, isRTL } = useLang();
  if (buckets.length === 0) {
    return <p className="text-xs italic" style={{ color: "rgba(5,5,8,0.4)" }}>{isRTL ? "لا توجد أيام في هذه الفترة" : "No days in this range."}</p>;
  }

  // Convert daily counts to a running total through each day
  let running = 0;
  const cumulative: VolumeBucket[] = buckets.map((b) => {
    running += b.count;
    return { date: b.date, count: running };
  });

  const maxCount = Math.max(1, cumulative[cumulative.length - 1].count);
  const n = cumulative.length;

  // Map each cumulative point into 0..100 coordinate space (preserveAspectRatio="none").
  // Reserve a few units of headroom at the top so the stroke isn't clipped at max.
  const TOP_PAD = 4;
  const points = cumulative.map((b, i) => {
    const xPct = n > 1 ? (i / (n - 1)) * 100 : 50;
    const yPct = TOP_PAD + (1 - b.count / maxCount) * (100 - TOP_PAD);
    return { ...b, xPct, yPct };
  });

  const { line: linePath, area: areaPath } = buildSmoothPath(
    points.map((p) => ({ x: p.xPct, y: p.yPct }))
  );
  const hoveredPoint = hovered ? points.find((p) => p.date === hovered.date) ?? null : null;
  const slotWidth = 100 / n;

  // First-of-month labels for the x-axis
  const monthMarkers: { idx: number; label: string }[] = [];
  cumulative.forEach((b, i) => {
    const d = new Date(b.date + "T00:00:00Z");
    if (d.getUTCDate() === 1) {
      monthMarkers.push({
        idx: i,
        label: d.toLocaleString(isRTL ? "ar-SA" : "en-US", { month: "short", timeZone: "UTC" }),
      });
    }
  });

  return (
    <div>
      <div className="relative h-44">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0"
          onMouseLeave={() => onHover(null)}
        >
          <path d={areaPath} fill="rgba(0,4,232,0.08)" />
          <path
            d={linePath}
            fill="none"
            stroke="#0004E8"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hoveredPoint && (
            <line
              x1={hoveredPoint.xPct}
              y1={0}
              x2={hoveredPoint.xPct}
              y2={100}
              stroke="rgba(0,4,232,0.3)"
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Invisible per-day hover targets */}
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={Math.max(0, p.xPct - slotWidth / 2)}
              y={0}
              width={slotWidth}
              height={100}
              fill="transparent"
              onMouseEnter={() => onHover(cumulative[i])}
            />
          ))}
        </svg>

        {/* Highlight dot (HTML so it stays circular regardless of stretch) */}
        {hoveredPoint && (
          <div
            className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
            style={{
              left: `${hoveredPoint.xPct}%`,
              top: `${hoveredPoint.yPct}%`,
              transform: "translate(-50%, -50%)",
              background: "#0004E8",
              boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(0,4,232,0.3)",
            }}
          />
        )}

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute px-2.5 py-1.5 rounded-md text-[11px] font-semibold pointer-events-none whitespace-nowrap shadow-md"
            style={{
              left: `${hoveredPoint.xPct}%`,
              top: `${hoveredPoint.yPct}%`,
              transform: "translate(-50%, calc(-100% - 12px))",
              background: "#050508",
              color: "#fff",
            }}
          >
            {new Date(hoveredPoint.date + "T00:00:00Z").toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
            <span className={isRTL ? "mr-2 font-bold" : "ml-2 font-bold"} style={{ color: "#8ab4ff" }}>
              {hoveredPoint.count} {isRTL ? "الإجمالي" : "total"}
            </span>
          </div>
        )}
      </div>

      {/* Month labels */}
      <div className="relative mt-2 h-4">
        {monthMarkers.map((m) => {
          const leftPct = (m.idx / buckets.length) * 100;
          return (
            <span
              key={m.label}
              className="absolute text-[10px] font-semibold"
              style={{ left: `${leftPct}%`, color: "rgba(5,5,8,0.5)" }}
            >
              {m.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
