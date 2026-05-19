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

type Role = "admin" | "examiner" | "claimant";
type Category = "account" | "policy" | "claim" | "other";

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  category: Category | string;
  actorUid: string;
  actorRole: Role | string;
  actorName: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}

const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  admin:    { bg: "rgba(0,4,232,0.10)",  text: "#0004E8" },
  examiner: { bg: "rgba(168,85,247,0.12)", text: "#7e22ce" },
  claimant: { bg: "rgba(34,197,94,0.12)",  text: "#15803d" },
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  account: { bg: "rgba(0,4,232,0.08)",     text: "#0004E8" },
  policy:  { bg: "rgba(234,179,8,0.15)",   text: "#b45309" },
  claim:   { bg: "rgba(168,85,247,0.12)",  text: "#7e22ce" },
  other:   { bg: "rgba(107,114,128,0.12)", text: "#374151" },
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-SA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminAuditLogPage() {
  return (
    <LangProvider>
      <AdminAuditLogPageInner />
    </LangProvider>
  );
}

function AdminAuditLogPageInner() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLang();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const fetchLogs = useCallback(async (isRetry = false) => {
    if (!user) return;
    if (!isRetry) { setFetching(true); setError(null); }
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("actor_role", roleFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      params.set("limit", "500");
      const res = await apiFetchAuth(`/api/admin/audit-logs?${params.toString()}`, user);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data: AuditLog[] = await res.json();
      setLogs(data);
      setFetching(false);
    } catch (e) {
      if (!isRetry) {
        setTimeout(() => fetchLogs(true), 800);
      } else {
        console.error("[AuditLog] fetch error:", e);
        setError(e instanceof Error ? e.message : "Failed to load audit log");
        setFetching(false);
      }
    }
  }, [user, roleFilter, categoryFilter]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const t = setTimeout(fetchLogs, 200);
      return () => clearTimeout(t);
    }
  }, [loading, user, profile, fetchLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      (l.actorName || "").toLowerCase().includes(q)
      || (l.actorUid || "").toLowerCase().includes(q)
      || (l.action || "").toLowerCase().includes(q)
      || (l.targetId || "").toLowerCase().includes(q)
    );
  }, [logs, search]);

  const getRoleLabel = (role: string) => {
    if (role === "admin") return t("roleAdminOption");
    if (role === "examiner") return t("roleExaminerOption");
    if (role === "claimant") return t("roleClaimantOption");
    return role;
  };

  const getCategoryLabel = (category: string) => {
    if (category === "account") return t("categoryAccountOption");
    if (category === "policy") return t("categoryPolicyOption");
    if (category === "claim") return t("categoryClaimOption");
    if (category === "other") return t("categoryOtherOption");
    return category;
  };

  const getActionLabel = (action: string) => {
    return t(action) || action;
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

  return (
    <div className="min-h-screen flex flex-col" dir={isRTL ? "rtl" : "ltr"} style={{ background: "#fafafd" }}>
      {/* Header */}
      <header
        className="h-16 border-b flex items-center justify-between px-6"
        style={{ borderColor: "#e2e2ee", background: "#fff" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}
          >
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

      <main className="max-w-6xl w-full mx-auto px-6 py-10 flex-1">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {/* Page header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#050508" }}>{t("auditLogHeader")}</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                {t("auditLogSub")}
              </p>
            </div>
            <button
              onClick={() => fetchLogs()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all"
              style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)", background: "#fff" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={isRTL ? "rotate-180" : ""}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {t("refresh")}
            </button>
          </div>

          {/* Filters */}
          <div
            className="rounded-2xl border p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center"
            style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
          >
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchAuditPlaceholder")}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all"
                style={{ borderColor: "#e2e2ee", color: "#050508" }}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "all" | Role)}
              className="px-3 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.7)", background: "#fff" }}
            >
              <option value="all">{t("allRolesOption")}</option>
              <option value="admin">{t("roleAdminOption")}</option>
              <option value="examiner">{t("roleExaminerOption")}</option>
              <option value="claimant">{t("roleClaimantOption")}</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as "all" | Category)}
              className="px-3 py-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.7)", background: "#fff" }}
            >
              <option value="all">{t("allCategoriesOption")}</option>
              <option value="account">{t("categoryAccountOption")}</option>
              <option value="policy">{t("categoryPolicyOption")}</option>
              <option value="claim">{t("categoryClaimOption")}</option>
              <option value="other">{t("categoryOtherOption")}</option>
            </select>
          </div>

          {/* Results */}
          {fetching ? (
            <div
              className="rounded-2xl border flex items-center justify-center py-24"
              style={{ borderColor: "#e2e2ee", background: "#fff" }}
            >
              <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div
              className="rounded-2xl border p-8"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#dc2626" }}
            >
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl border p-12 text-center"
              style={{ borderColor: "#e2e2ee", background: "#fff" }}
            >
              <p className="text-sm" style={{ color: "rgba(5,5,8,0.5)" }}>
                {logs.length === 0 ? t("noAuditLogs") : t("noAuditLogsMatch")}
              </p>
            </div>
          ) : (
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "#f9f9fc" }}>
                    <tr style={{ color: "rgba(5,5,8,0.55)" }}>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderTime")}</th>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderActor")}</th>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderRole")}</th>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderAction")}</th>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderCategory")}</th>
                      <th className="text-start font-semibold uppercase text-[11px] tracking-wider px-5 py-3">{t("tableHeaderTarget")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const roleStyle = ROLE_STYLES[row.actorRole] ?? { bg: "rgba(107,114,128,0.12)", text: "#374151" };
                      const catKey = (row.category as string) || "other";
                      const catStyle = CATEGORY_STYLES[catKey] ?? CATEGORY_STYLES.other;
                      return (
                        <tr
                          key={row.id}
                          className="border-t"
                          style={{ borderColor: "#f0f0f5" }}
                        >
                          <td className="px-5 py-3 align-top whitespace-nowrap" style={{ color: "rgba(5,5,8,0.7)" }}>
                            <span dir="ltr">{formatDate(row.timestamp)}</span>
                          </td>
                          <td className="px-5 py-3 align-top">
                            <div className="font-medium" style={{ color: "#050508" }}>
                              {row.actorName || t("unknownActor")}
                            </div>
                            {row.actorUid && (
                              <div className="text-[11px] mt-0.5 font-mono" dir="ltr" style={{ color: "rgba(5,5,8,0.4)" }}>
                                {row.actorUid}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 align-top">
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                              style={{ background: roleStyle.bg, color: roleStyle.text }}
                            >
                              {getRoleLabel(row.actorRole)}
                            </span>
                          </td>
                          <td className="px-5 py-3 align-top" style={{ color: "#050508" }}>
                            {getActionLabel(row.action)}
                          </td>
                          <td className="px-5 py-3 align-top">
                            <span
                              className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                              style={{ background: catStyle.bg, color: catStyle.text }}
                            >
                              {getCategoryLabel(row.category)}
                            </span>
                          </td>
                          <td className="px-5 py-3 align-top">
                            {row.targetId ? (
                              <div>
                                <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "rgba(5,5,8,0.4)" }}>
                                  {row.targetType || "—"}
                                </div>
                                <div className="text-xs font-mono" dir="ltr" style={{ color: "rgba(5,5,8,0.6)" }}>
                                  {row.targetId}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "rgba(5,5,8,0.3)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className="px-5 py-3 text-xs border-t"
                style={{ borderColor: "#f0f0f5", color: "rgba(5,5,8,0.5)", background: "#fafafd" }}
              >
                {t("showingEntriesOf")
                  .replace("{filtered}", String(filtered.length))
                  .replace("{total}", String(logs.length))}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
