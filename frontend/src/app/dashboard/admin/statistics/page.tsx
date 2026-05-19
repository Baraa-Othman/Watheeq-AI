"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

import { LangProvider, useLang } from "@/lib/lang-context";
import LangToggle from "@/components/LangToggle";

type Status = "submitted" | "under review" | "approved" | "rejected" | "cancelled";

interface ClaimsStats {
  total: number;
  byStatus: Record<string, number>;
}

const STATUS_ORDER: Status[] = ["submitted", "under review", "approved", "rejected", "cancelled"];

const STATUS_STYLES: Record<Status, { bar: string; bg: string; text: string; label: string }> = {
  submitted:     { bar: "#0004E8", bg: "rgba(0,4,232,0.10)",   text: "#0004E8", label: "Submitted" },
  "under review":{ bar: "#a855f7", bg: "rgba(168,85,247,0.12)", text: "#7e22ce", label: "Under Review" },
  approved:      { bar: "#22c55e", bg: "rgba(34,197,94,0.12)",  text: "#15803d", label: "Approved" },
  rejected:      { bar: "#ef4444", bg: "rgba(239,68,68,0.10)",  text: "#dc2626", label: "Rejected" },
  cancelled:     { bar: "#6b7280", bg: "rgba(107,114,128,0.12)",text: "#374151", label: "Cancelled" },
};

export default function AdminStatisticsPage() {
  return (
    <LangProvider>
      <AdminStatisticsPageInner />
    </LangProvider>
  );
}

function AdminStatisticsPageInner() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLang();

  const [stats, setStats] = useState<ClaimsStats | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const fetchStats = useCallback(async (isRetry = false) => {
    if (!user) return;
    if (!isRetry) { setFetching(true); setError(null); }
    try {
      const res = await apiFetchAuth("/api/admin/stats/claims", user);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data: ClaimsStats = await res.json();
      setStats(data);
      setFetching(false);
    } catch (e) {
      if (!isRetry) {
        setTimeout(() => fetchStats(true), 800);
      } else {
        console.error("[AdminStats] fetch error:", e);
        setError(e instanceof Error ? e.message : "Failed to load statistics");
        setFetching(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const t = setTimeout(fetchStats, 200);
      return () => clearTimeout(t);
    }
  }, [loading, user, profile, fetchStats]);

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

  if (profile.role !== "admin") return null;

  const total = stats?.total ?? 0;

  const getStatusLabel = (s: Status) => {
    if (s === "submitted") return t("statusSubmitted");
    if (s === "under review") return t("statusUnderReview");
    if (s === "approved") return t("statusApproved");
    if (s === "rejected") return t("statusRejected");
    if (s === "cancelled") return t("statusCancelled");
    return s;
  };

  return (
    <div className="min-h-screen flex flex-col" dir={isRTL ? "rtl" : "ltr"} style={{ background: "#fafafd" }}>
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6" style={{ borderColor: "#e2e2ee", background: "#fff" }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}>
            {t("adminRole")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle compact />
          <Link
            href="/dashboard/admin"
            className="text-sm font-medium px-4 py-2 rounded-lg border transition-all inline-flex items-center gap-1.5"
            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
          >
            {isRTL ? "لوحة التحكم ←" : "← Dashboard"}
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl w-full mx-auto px-6 py-10 flex-1">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {/* Page header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#050508" }}>
                {t("claimsStatisticsHeader")}
              </h1>
              <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                {t("claimsStatsSub")}
              </p>
            </div>
            <button
              onClick={() => fetchStats()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all"
              style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)", background: "#fff" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={isRTL ? "rotate-180" : ""}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {t("refresh")}
            </button>
          </div>

          {fetching ? (
            <div className="rounded-2xl border flex items-center justify-center py-24" style={{ borderColor: "#e2e2ee", background: "#fff" }}>
              <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="rounded-2xl border p-8" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#dc2626" }}>
              {error}
            </div>
          ) : stats ? (
            <>
              {/* Total + status cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div
                  className="rounded-2xl border p-5"
                  style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.4)" }}>
                    {t("statsTotalClaims")}
                  </p>
                  <p className="text-3xl font-bold" style={{ color: "#050508" }} dir="ltr">{total}</p>
                </div>
                {STATUS_ORDER.map((s) => {
                  const count = stats.byStatus?.[s] ?? 0;
                  const style = STATUS_STYLES[s];
                  return (
                    <div
                      key={s}
                      className="rounded-2xl border p-5"
                      style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
                    >
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2"
                        style={{ background: style.bg, color: style.text }}
                      >
                        {getStatusLabel(s)}
                      </span>
                      <p className="text-3xl font-bold" style={{ color: "#050508" }} dir="ltr">{count}</p>
                      <p className="text-xs mt-1" style={{ color: "rgba(5,5,8,0.4)" }}>
                        <span dir="ltr" className="font-semibold">{total > 0 ? `${Math.round((count / total) * 100)}%` : "0%"}</span> {t("statsOfTotal")}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Doughnut chart */}
              <div
                className="rounded-2xl border p-6"
                style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
              >
                <h3 className="text-base font-bold mb-1" style={{ color: "#050508" }}>{t("distributionByStatus")}</h3>
                <p className="text-xs mb-6" style={{ color: "rgba(5,5,8,0.45)" }}>
                  {t("shareOfClaimsDesc")}
                </p>

                <ClaimsDoughnut stats={stats} />
              </div>
            </>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}

function ClaimsDoughnut({ stats }: { stats: ClaimsStats }) {
  const { t, isRTL } = useLang();
  const total = STATUS_ORDER.reduce((sum, s) => sum + (stats.byStatus?.[s] ?? 0), 0);
  const [hovered, setHovered] = useState<Status | null>(null);

  const radius = 90;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const slices = STATUS_ORDER.map((s) => {
    const count = stats.byStatus?.[s] ?? 0;
    const fraction = total > 0 ? count / total : 0;
    const dash = fraction * circumference;
    const slice = { status: s, count, fraction, dash, offset };
    offset += dash;
    return slice;
  });

  const getStatusLabel = (s: Status) => {
    if (s === "submitted") return t("statusSubmitted");
    if (s === "under review") return t("statusUnderReview");
    if (s === "approved") return t("statusApproved");
    if (s === "rejected") return t("statusRejected");
    if (s === "cancelled") return t("statusCancelled");
    return s;
  };

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm italic" style={{ color: "rgba(5,5,8,0.4)" }}>
        {t("noClaimsSubmittedYet")}
      </div>
    );
  }

  const activeSlice = hovered ? slices.find((s) => s.status === hovered) : null;
  const activePct = activeSlice ? Math.round(activeSlice.fraction * 100) : 0;

  return (
    <div className={`flex flex-col md:flex-row items-center gap-8 ${isRTL ? "md:flex-row-reverse" : ""}`}>
      <div className="relative flex-shrink-0">
        <svg width="220" height="220" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="#f0f0f5" strokeWidth={stroke} />
          <g transform="rotate(-90 110 110)">
            {slices.map((sl) => {
              if (sl.count === 0) return null;
              const isHovered = hovered === sl.status;
              const isDimmed = hovered !== null && !isHovered;
              return (
                <motion.circle
                  key={sl.status}
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke={STATUS_STYLES[sl.status].bar}
                  strokeWidth={isHovered ? stroke + 5 : stroke}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
          {activeSlice ? (
            <>
              <span className="text-3xl font-bold tabular-nums" style={{ color: STATUS_STYLES[activeSlice.status].bar }} dir="ltr">
                {activeSlice.count}
              </span>
              <span className="text-[11px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: "rgba(5,5,8,0.6)" }}>
                {getStatusLabel(activeSlice.status)}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: "rgba(5,5,8,0.4)" }}>
                {isRTL ? `%${activePct} من الإجمالي` : `${activePct}% of total`}
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold" style={{ color: "#050508" }} dir="ltr">{total}</span>
              <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "rgba(5,5,8,0.4)" }}>
                {isRTL ? "الإجمالي" : "Total"}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {slices.map((sl) => {
          const pct = Math.round(sl.fraction * 100);
          const isHovered = hovered === sl.status;
          const isDimmed = hovered !== null && !isHovered;
          return (
            <div
              key={sl.status}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition-all"
              style={{
                background: isHovered ? "rgba(0,4,232,0.05)" : "transparent",
                opacity: isDimmed ? 0.5 : 1,
              }}
              onMouseEnter={() => setHovered(sl.status)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="flex items-center gap-3">
                <span
                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: STATUS_STYLES[sl.status].bar }}
                />
                <span className="text-sm font-medium" style={{ color: "rgba(5,5,8,0.75)" }}>
                  {getStatusLabel(sl.status)}
                </span>
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#050508" }} dir="ltr">
                {sl.count} <span className="font-normal" style={{ color: "rgba(5,5,8,0.4)" }}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
