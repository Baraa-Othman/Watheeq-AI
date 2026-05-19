"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { LangProvider, useLang } from "@/lib/lang-context";
import LangToggle from "@/components/LangToggle";

interface ExaminerPerf {
  examinerId: string;
  fullName: string;
  email: string;
  status: string;
  totalAssigned: number;
  approved: number;
  rejected: number;
  underReview: number;
  approvalRate: number;
  avgHandlingSeconds: number | null;
  handledCount: number;
}

type SortKey =
  | "avgHandlingSeconds"
  | "totalAssigned"
  | "approved"
  | "rejected"
  | "underReview"
  | "approvalRate"
  | "fullName";

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

export default function AdminExaminersPage() {
  return (
    <LangProvider>
      <AdminExaminersPageInner />
    </LangProvider>
  );
}

function AdminExaminersPageInner() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLang();

  const [examiners, setExaminers] = useState<ExaminerPerf[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("avgHandlingSeconds");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const fetchPerf = useCallback(async (isRetry = false) => {
    if (!user) return;
    if (!isRetry) { setFetching(true); setError(null); }
    try {
      const res = await apiFetchAuth("/api/admin/stats/examiners", user);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data: ExaminerPerf[] = await res.json();
      setExaminers(data);
      setFetching(false);
    } catch (e) {
      if (!isRetry) {
        setTimeout(() => fetchPerf(true), 800);
      } else {
        console.error("[AdminExaminers] fetch error:", e);
        setError(e instanceof Error ? e.message : t("toastActionFailed"));
        setFetching(false);
      }
    }
  }, [user, t]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const timer = setTimeout(fetchPerf, 200);
      return () => clearTimeout(timer);
    }
  }, [loading, user, profile, fetchPerf]);

  const sorted = useMemo(() => {
    const copy = [...examiners];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // null/undefined values are always pushed to the bottom regardless of sort direction
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return copy;
  }, [examiners, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Time + name default to ascending; everything else (volumes, rates) default to descending
      setSortDir(key === "fullName" || key === "avgHandlingSeconds" ? "asc" : "desc");
    }
  };

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

  // Aggregate totals across all examiners (for summary header)
  const totals = examiners.reduce(
    (acc, e) => {
      acc.assigned += e.totalAssigned;
      acc.approved += e.approved;
      acc.rejected += e.rejected;
      acc.underReview += e.underReview;
      if (e.avgHandlingSeconds !== null && e.handledCount > 0) {
        acc.weightedDurationSum += e.avgHandlingSeconds * e.handledCount;
        acc.handledCount += e.handledCount;
      }
      return acc;
    },
    { assigned: 0, approved: 0, rejected: 0, underReview: 0, weightedDurationSum: 0, handledCount: 0 }
  );
  const overallAvgHandlingSeconds = totals.handledCount > 0
    ? totals.weightedDurationSum / totals.handledCount
    : null;

  return (
    <div className="min-h-screen" style={{ background: "#fafafd" }} dir={isRTL ? "rtl" : "ltr"}>
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
          <LangToggle />
          <Link
            href="/dashboard/admin"
            className="text-sm font-medium px-4 py-2 rounded-lg border transition-all"
            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
          >
            {isRTL ? "لوحة التحكم ←" : "← Dashboard"}
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {/* Page header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#050508" }}>{t("examinerPerformanceHeader")}</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                {t("productivityMetricsSub")}
              </p>
            </div>
            <button
              onClick={() => fetchPerf()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all"
              style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={isRTL ? "scale-x-[-1]" : ""}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {t("refresh")}
            </button>
          </div>

          {/* Summary cards */}
          {!fetching && !error && examiners.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <SummaryCard label={t("summaryExaminers")} value={String(examiners.length)} />
              <SummaryCard
                label={t("summaryAvgHandlingTime")}
                value={formatDuration(overallAvgHandlingSeconds)}
                accent="#0004E8"
                isDuration={overallAvgHandlingSeconds !== null}
              />
              <SummaryCard label={t("summaryApproved")} value={String(totals.approved)} accent="#15803d" />
              <SummaryCard label={t("summaryRejected")} value={String(totals.rejected)} accent="#dc2626" />
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}>
            {fetching ? (
              <div className="flex items-center justify-center py-20">
                <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : error ? (
              <div className="p-8" style={{ color: "#dc2626" }}>{error}</div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.06)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  </svg>
                </div>
                <p className="font-semibold" style={{ color: "#050508" }}>{t("noExaminersYet")}</p>
                <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.4)" }}>{t("noExaminersYetSub")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f0f0f5" }}>
                      <SortHeader label={t("tableHeaderExaminer")} col="fullName" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="start" />
                      <SortHeader label={t("tableHeaderAvgHandling")} col="avgHandlingSeconds" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortHeader label={t("tableHeaderAssigned")} col="totalAssigned" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortHeader label={t("tableHeaderUnderReview")} col="underReview" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortHeader label={t("tableHeaderApproved")} col="approved" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortHeader label={t("tableHeaderRejected")} col="rejected" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortHeader label={t("tableHeaderApprovalRate")} col="approvalRate" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((e, i) => {
                      const finalized = e.approved + e.rejected;
                      const ratePct = Math.round(e.approvalRate * 100);
                      const overClaimsText = e.handledCount === 1 
                        ? t("overClaimCount").replace("{count}", "1")
                        : t("overClaimsCount").replace("{count}", String(e.handledCount));
                      return (
                        <motion.tr
                          key={e.examinerId}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          style={{ borderBottom: "1px solid #f5f5f8" }}
                        >
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold" style={{ color: "#050508" }}>
                                {e.fullName || t("unnamedExaminer")}
                              </span>
                              {e.email && (
                                <span className="text-xs" style={{ color: "rgba(5,5,8,0.45)" }}>{e.email}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {e.avgHandlingSeconds !== null ? (
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-bold" style={{ color: "#0004E8" }} dir="ltr">
                                  {formatDuration(e.avgHandlingSeconds)}
                                </span>
                                <span className="text-[10px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>
                                  {overClaimsText}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: "rgba(5,5,8,0.3)" }}>{t("noClosedClaimsYetText")}</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm font-bold font-mono" style={{ color: "#050508" }} dir="ltr">{e.totalAssigned}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <PillNumber value={e.underReview} bg="rgba(168,85,247,0.12)" color="#7e22ce" />
                          </td>
                          <td className="px-5 py-4 text-center">
                            <PillNumber value={e.approved} bg="rgba(34,197,94,0.12)" color="#15803d" />
                          </td>
                          <td className="px-5 py-4 text-center">
                            <PillNumber value={e.rejected} bg="rgba(239,68,68,0.10)" color="#dc2626" />
                          </td>
                          <td className="px-5 py-4">
                            {finalized > 0 ? (
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#f0f0f5" }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${ratePct}%`,
                                      background: ratePct >= 50 ? "#22c55e" : "#ef4444",
                                    }}
                                  />
                                </div>
                                <span className="text-sm font-semibold w-12 text-end font-mono" style={{ color: "#050508" }} dir="ltr">
                                  {ratePct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-center block w-full" style={{ color: "rgba(5,5,8,0.3)" }}>{t("noDecisionsYet")}</span>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, accent, isDuration = false }: { label: string; value: string | number; accent?: string; isDuration?: boolean }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.4)" }}>
        {label}
      </p>
      <p className="text-3xl font-bold font-mono" style={{ color: accent ?? "#050508" }} dir={isDuration ? "ltr" : undefined}>{value}</p>
    </div>
  );
}

function PillNumber({ value, bg, color }: { value: number; bg: string; color: string }) {
  if (value === 0) return <span className="text-sm font-mono" style={{ color: "rgba(5,5,8,0.3)" }}>0</span>;
  return (
    <span
      className="inline-flex min-w-[2rem] justify-center px-2 py-0.5 rounded-full text-xs font-bold font-mono"
      style={{ background: bg, color }}
      dir="ltr"
    >
      {value}
    </span>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align = "center",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (c: SortKey) => void;
  align?: "start" | "center";
}) {
  const active = sortKey === col;
  const { isRTL } = useLang();
  
  // Dynamic text alignment classes in Tailwind: text-start / text-center
  return (
    <th
      className={`px-5 py-3.5 text-${align} text-[11px] font-semibold uppercase tracking-widest cursor-pointer select-none`}
      style={{ color: active ? "#0004E8" : "rgba(5,5,8,0.38)", background: "#fafafd" }}
      onClick={() => onClick(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-block w-2.5" style={{ opacity: active ? 1 : 0.25 }}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}
        </span>
      </span>
    </th>
  );
}
