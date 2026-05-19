"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion } from "framer-motion";
import { useLang } from "@/lib/lang-context";

type ClaimStatus = "submitted" | "under review" | "approved" | "rejected" | "cancelled";

interface Claim {
  claimId: string;
  patientFName: string;
  patientLName: string;
  policyName: string;
  treatmentType: string;
  status: ClaimStatus;
  submittingTime: string;
}

const STATUS_STYLE: Record<ClaimStatus, { bg: string; color: string; dot: string; labelKey: string }> = {
  submitted:      { labelKey: "statusSubmitted",    bg: "rgba(0,4,232,0.07)",      color: "#0004E8",           dot: "#0004E8" },
  "under review": { labelKey: "statusUnderReview",  bg: "rgba(234,179,8,0.1)",     color: "#b45309",           dot: "#eab308" },
  approved:       { labelKey: "statusApproved",     bg: "rgba(22,163,74,0.08)",    color: "#15803d",           dot: "#16a34a" },
  rejected:       { labelKey: "statusRejected",     bg: "rgba(220,38,38,0.08)",    color: "#dc2626",           dot: "#dc2626" },
  cancelled:      { labelKey: "statusCancelled",    bg: "rgba(5,5,8,0.06)",        color: "rgba(5,5,8,0.45)",  dot: "rgba(5,5,8,0.3)" },
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  const { t } = useLang();
  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE["submitted"];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase"
      style={{ background: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {t(cfg.labelKey)}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return iso; }
}

export default function ClaimsListPage() {
  const { user } = useAuth();
  const { t, isRTL } = useLang();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetchAuth("/api/claims", user)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load claims");
        setClaims(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#050508" }}>{t("myClaimsTitle")}</h1>
          <p className="text-[14px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>{t("myClaimsSub")}</p>
        </div>
        <Link
          href="/claimant/claims/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
          style={{ background: "#0004E8" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2eed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#0004E8")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
          {t("newClaim")}
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
          style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span dir="ltr">{error}</span>
        </div>
      )}

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
      {!loading && !error && claims.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.06)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
            </svg>
          </div>
          <h2 className="text-[18px] font-bold mb-1.5" style={{ color: "#050508" }}>{t("noClaimsYet")}</h2>
          <p className="text-[14px] mb-6 max-w-xs" style={{ color: "rgba(5,5,8,0.45)" }}>{t("noClaimsDesc")}</p>
          <Link href="/claimant/claims/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all"
            style={{ background: "#0004E8" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2eed")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#0004E8")}>
            {t("submitAClaim")}
          </Link>
        </motion.div>
      )}

      {/* Claims list */}
      {!loading && claims.length > 0 && (
        <div className="space-y-3">
          {claims.map((claim, i) => (
            <motion.div key={claim.claimId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link
                href={`/claimant/claims/${claim.claimId}`}
                className="block rounded-2xl border p-5 transition-all hover:-translate-y-0.5 group"
                style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04), 0 4px 12px rgba(5,5,8,0.03)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,4,232,0.2)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,4,232,0.08)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#e2e2ee"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(5,5,8,0.04), 0 4px 12px rgba(5,5,8,0.03)"; }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      {/* Patient name always LTR — user entered English */}
                      <span className="text-[15px] font-semibold truncate" style={{ color: "#050508" }} dir="ltr">
                        {claim.patientFName} {claim.patientLName}
                      </span>
                      <StatusBadge status={claim.status as ClaimStatus} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.45)" }}>
                        <span className="font-medium" style={{ color: "rgba(5,5,8,0.6)" }}>{t("policyLabel")}</span>{" "}
                        <span dir="ltr">{claim.policyName}</span>
                      </span>
                      {claim.treatmentType && (
                        <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.45)" }}>
                          <span className="font-medium" style={{ color: "rgba(5,5,8,0.6)" }}>{t("treatmentLabel")}</span>{" "}
                          <span dir="ltr">{claim.treatmentType}</span>
                        </span>
                      )}
                      <span className="text-[13px]" style={{ color: "rgba(5,5,8,0.4)" }} dir="ltr">{formatDate(claim.submittingTime)}</span>
                    </div>
                    <p className="text-[11px] mt-2 font-mono" style={{ color: "rgba(5,5,8,0.28)" }} dir="ltr">
                      {t("refLabel")} {claim.claimId}
                    </p>
                  </div>
                  {/* Chevron flips in RTL */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className="flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5"
                    style={{ color: "rgba(5,5,8,0.25)", transform: isRTL ? "scaleX(-1)" : "none" }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <div className="h-20 lg:h-0" />
    </div>
  );
}
