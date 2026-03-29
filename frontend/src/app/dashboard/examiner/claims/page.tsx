"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";

type ClaimStatus = "submitted" | "under review" | "approved" | "rejected" | "cancelled";
type Tab = "all" | "submitted" | "under review" | "approved" | "rejected";

interface Claim {
  claimId: string;
  patientFName: string;
  patientLName: string;
  policyName: string;
  treatmentType: string;
  status: ClaimStatus;
  submittingTime: string;
  examinerID: string;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; color: string; dot: string }> = {
  submitted: { label: "Submitted", bg: "rgba(0,4,232,0.07)", color: "#0004E8", dot: "#0004E8" },
  "under review": { label: "Under Review", bg: "rgba(234,179,8,0.10)", color: "#b45309", dot: "#eab308" },
  approved: { label: "Approved", bg: "rgba(22,163,74,0.08)", color: "#15803d", dot: "#16a34a" },
  rejected: { label: "Rejected", bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626" },
  cancelled: { label: "Cancelled", bg: "rgba(5,5,8,0.06)", color: "rgba(5,5,8,0.45)", dot: "rgba(5,5,8,0.3)" },
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["submitted"];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-SA", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function ExaminerClaimsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("submitted");
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "examiner") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, authLoading, router]);

  const fetchClaims = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError("");
    apiFetchAuth("/api/examiner/claims", user)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load claims");
        setClaims(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!authLoading && user && profile?.role === "examiner") {
      fetchClaims();
    }
  }, [authLoading, user, profile, fetchClaims]);

  const handlePick = async (claimId: string) => {
    if (!user) return;
    setPickError("");
    setPicking(claimId);
    try {
      const res = await apiFetchAuth(`/api/examiner/claims/${claimId}/pick`, user, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to pick claim");
      router.push(`/dashboard/examiner/claims/${claimId}`);
    } catch (err: unknown) {
      setPickError(err instanceof Error ? err.message : "Could not pick claim");
      setPicking(null);
    }
  };

  const myUid = profile?.uid ?? "";

  const filteredClaims = claims.filter((c) =>
    activeTab === "all" ? true : c.status === activeTab
  );

  const tabCount = (tab: Tab) =>
    tab === "all" ? claims.length : claims.filter((c) => c.status === tab).length;

  if (authLoading || !profile) {
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
    <div className="min-h-screen" style={{ background: "#fafafd" }}>
      {/* Header */}
      <header
        className="h-16 border-b flex items-center justify-between px-6 sticky top-0 z-30"
        style={{ borderColor: "#e2e2ee", background: "#fff" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight" style={{ color: "#050508" }}>Watheeq AI</span>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}
          >
            Claims Queue
          </span>
        </div>
        <button
          onClick={() => router.push("/dashboard/examiner")}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-all hover:bg-gray-50"
          style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#050508" }}>
            Claims Queue
          </h1>
          <p className="text-[14px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>
            Review and process insurance claims assigned to you
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {/* Pick error */}
        {pickError && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {pickError}
            <button onClick={() => setPickError("")} className="ml-auto hover:opacity-70">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 overflow-x-auto" style={{ background: "#f0f0f6" }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap flex-shrink-0"
                style={{
                  background: isActive ? "#fff" : "transparent",
                  color: isActive ? "#050508" : "rgba(5,5,8,0.5)",
                  boxShadow: isActive ? "0 1px 3px rgba(5,5,8,0.08)" : "none",
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? "rgba(0,4,232,0.08)" : "rgba(5,5,8,0.08)",
                      color: isActive ? "#0004E8" : "rgba(5,5,8,0.45)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredClaims.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "rgba(0,4,232,0.06)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <h2 className="text-[18px] font-bold mb-1.5" style={{ color: "#050508" }}>No claims here</h2>
            <p className="text-[14px] max-w-xs" style={{ color: "rgba(5,5,8,0.45)" }}>
              {activeTab === "submitted"
                ? "No submitted claims waiting for review."
                : activeTab === "under review"
                ? "You have no claims currently under your review."
                : `No ${activeTab} claims to show.`}
            </p>
          </motion.div>
        )}

        {/* Claims list */}
        {!loading && filteredClaims.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {filteredClaims.map((claim, i) => {
                const isMyReview = claim.examinerID === myUid;
                const isSubmitted = claim.status === "submitted";

                return (
                  <motion.div
                    key={claim.claimId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border p-5 transition-all"
                    style={{
                      background: "#fff",
                      borderColor: "#e2e2ee",
                      boxShadow: "0 1px 3px rgba(5,5,8,0.04), 0 4px 12px rgba(5,5,8,0.03)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Claim info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                          <span className="text-[15px] font-semibold" style={{ color: "#050508" }}>
                            {claim.patientFName} {claim.patientLName}
                          </span>
                          <StatusBadge status={claim.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                          <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.45)" }}>
                            <span className="font-medium" style={{ color: "rgba(5,5,8,0.6)" }}>Policy:</span>{" "}
                            {claim.policyName}
                          </span>
                          {claim.treatmentType && (
                            <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.45)" }}>
                              <span className="font-medium" style={{ color: "rgba(5,5,8,0.6)" }}>Treatment:</span>{" "}
                              {claim.treatmentType}
                            </span>
                          )}
                          <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.4)" }}>
                            {formatDate(claim.submittingTime)}
                          </span>
                        </div>
                        <p className="text-[11px] mt-2 font-mono" style={{ color: "rgba(5,5,8,0.28)" }}>
                          Ref: {claim.claimId}
                        </p>
                      </div>

                      {/* Action */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isSubmitted && (
                          <button
                            id={`pick-${claim.claimId}`}
                            onClick={() => handlePick(claim.claimId)}
                            disabled={picking === claim.claimId}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-60"
                            style={{ background: "#0004E8" }}
                            onMouseEnter={(e) => { if (!picking) (e.currentTarget as HTMLElement).style.background = "#2a2eed"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#0004E8"; }}
                          >
                            {picking === claim.claimId ? (
                              <>
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Picking...
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                </svg>
                                Pick
                              </>
                            )}
                          </button>
                        )}

                        {!isSubmitted && isMyReview && (
                          <button
                            id={`view-${claim.claimId}`}
                            onClick={() => router.push(`/dashboard/examiner/claims/${claim.claimId}`)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all"
                            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.65)", background: "transparent" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            View
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
