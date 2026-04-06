"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";

function MedicalReportDownloadButton({ claimId, patientName, user }: { claimId: string; patientName: string; user: unknown }) {
  const [loading, setDlLoading] = useState(false);
  const [error, setDlError] = useState("");

  const handleDownload = async () => {
    setDlLoading(true);
    setDlError("");
    try {
      const res = await apiFetchAuth(`/api/claims/${claimId}/download-medical-report`, user as Parameters<typeof apiFetchAuth>[1]);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patientName}-Medical-Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDlLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
        style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}
      >
        {loading ? (
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        {loading ? "Downloading..." : "Download Report"}
      </button>
      {error && <p className="text-[11px] mt-1" style={{ color: "#dc2626" }}>{error}</p>}
    </div>
  );
}

type ClaimStatus = "submitted" | "under review" | "approved" | "rejected" | "cancelled";
type Decision = "approved" | "rejected";

interface Claim {
  claimId: string;
  patientFName: string;
  patientLName: string;
  patientDOB: string;
  policyName: string;
  treatmentType: string;
  medicalReport: string;
  supportingDocuments: string;
  status: ClaimStatus;
  submittingTime: string;
  examinerID: string;
}

const STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; color: string; dot: string; desc: string }> = {
  submitted: { label: "Submitted", bg: "rgba(0,4,232,0.07)", color: "#0004E8", dot: "#0004E8", desc: "This claim has been received and is awaiting review." },
  "under review": { label: "Under Review", bg: "rgba(234,179,8,0.10)", color: "#b45309", dot: "#eab308", desc: "This claim is currently under your review." },
  approved: { label: "Approved", bg: "rgba(22,163,74,0.08)", color: "#15803d", dot: "#16a34a", desc: "This claim has been approved. The claimant has been notified." },
  rejected: { label: "Rejected", bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626", desc: "This claim has been rejected. The claimant has been notified." },
  cancelled: { label: "Cancelled", bg: "rgba(5,5,8,0.06)", color: "rgba(5,5,8,0.45)", dot: "rgba(5,5,8,0.3)", desc: "This claim was cancelled by the claimant." },
};

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>{label}</p>
      <p className="text-[14px]" style={{ color: "#050508" }}>{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-SA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return iso; }
}

export default function ExaminerClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState("");

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "examiner") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    setLoading(true);
    apiFetchAuth(`/api/examiner/claims/${id}`, user)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load claim");
        setClaim(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, id]);

  const handleDecide = async () => {
    if (!user || !claim || !pendingDecision) return;
    setDecideError("");
    setDeciding(true);
    try {
      const res = await apiFetchAuth(`/api/examiner/claims/${id}/decide`, user, {
        method: "PATCH",
        body: JSON.stringify({ decision: pendingDecision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit decision");
      setClaim((prev) => prev ? { ...prev, status: pendingDecision } : prev);
      setPendingDecision(null);
    } catch (err: unknown) {
      setDecideError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setDeciding(false);
    }
  };

  const myUid = profile?.uid ?? "";

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
          <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}>
            Claim Details
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

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="max-w-lg">
            <button
              onClick={() => router.push("/dashboard/examiner/claims")}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4 hover:opacity-70"
              style={{ color: "rgba(5,5,8,0.45)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              Claims Queue
            </button>
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
              {error}
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && claim && (() => {
          const statusCfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG["submitted"];
          const isMyReview = claim.examinerID === myUid;
          const canDecide = isMyReview && claim.status === "under review";

          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* Back */}
              <button
                onClick={() => router.push("/dashboard/examiner/claims")}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-5 hover:opacity-70 transition-opacity"
                style={{ color: "rgba(5,5,8,0.45)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                Claims Queue
              </button>

              {/* Title + status */}
              <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "#050508" }}>
                    {claim.patientFName} {claim.patientLName}
                  </h1>
                  <p className="text-[12px] font-mono mt-1" style={{ color: "rgba(5,5,8,0.3)" }}>Ref: {claim.claimId}</p>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-wide uppercase"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
                  {statusCfg.label}
                </span>
              </div>

              {/* Status banner */}
              <div className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3"
                style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.dot}25` }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={statusCfg.dot} strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[13px]" style={{ color: statusCfg.color }}>{statusCfg.desc}</p>
              </div>

              {/* Details card */}
              <div className="rounded-2xl border mb-4"
                style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}>
                <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>Patient Information</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="First Name" value={claim.patientFName} />
                  <Field label="Last Name" value={claim.patientLName} />
                  <Field label="Date of Birth" value={claim.patientDOB} />
                </div>
                <div className="px-6 pb-3 border-t border-b" style={{ borderColor: "#f0f0f5" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>Claim Details</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Policy Plan" value={claim.policyName} />
                  <Field label="Treatment Type" value={claim.treatmentType} />
                  <Field label="Submitted On" value={formatDate(claim.submittingTime)} />
                  {claim.medicalReport && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>Medical Report</p>
                      <MedicalReportDownloadButton
                        claimId={claim.claimId}
                        patientName={`${claim.patientFName}-${claim.patientLName}`}
                        user={user}
                      />
                    </div>
                  )}
                  {claim.supportingDocuments && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>Supporting Documents</p>
                      <a href={claim.supportingDocuments} target="_blank" rel="noopener noreferrer"
                        className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70" style={{ color: "#0004E8" }}>
                        View Documents ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Decision panel */}
              {canDecide && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border p-5 mb-5"
                  style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}>
                  <p className="text-[13px] font-semibold mb-1" style={{ color: "#050508" }}>Make a Decision</p>
                  <p className="text-[13px] mb-4" style={{ color: "rgba(5,5,8,0.5)" }}>
                    Review the documents above, then approve or reject this claim. The claimant will be notified by email.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <button id="btn-approve" onClick={() => setPendingDecision("approved")}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
                      style={{ background: "#16a34a" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#15803d")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#16a34a")}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6L9 17l-5-5" /></svg>
                      Approve Claim
                    </button>
                    <button id="btn-reject" onClick={() => setPendingDecision("rejected")}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold border transition-all"
                      style={{ borderColor: "#fca5a5", color: "#dc2626", background: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      Reject Claim
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Post-decision banner */}
              {(claim.status === "approved" || claim.status === "rejected") && isMyReview && (
                <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3"
                  style={{
                    background: claim.status === "approved" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
                    border: `1px solid ${claim.status === "approved" ? "#86efac" : "#fca5a5"}`,
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke={claim.status === "approved" ? "#16a34a" : "#dc2626"} strokeWidth="2" className="flex-shrink-0">
                    {claim.status === "approved"
                      ? <path d="M20 6L9 17l-5-5" />
                      : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>
                    }
                  </svg>
                  <p className="text-[13px] font-medium"
                    style={{ color: claim.status === "approved" ? "#15803d" : "#dc2626" }}>
                    You {claim.status === "approved" ? "approved" : "rejected"} this claim. The claimant has been notified by email.
                  </p>
                </div>
              )}
            </motion.div>
          );
        })()}
      </main>

      {/* Confirmation modal */}
      {pendingDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: "rgba(5,5,8,0.45)" }}>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-7 max-w-sm w-full"
            style={{ background: "#fff", boxShadow: "0 24px 64px rgba(5,5,8,0.18)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ background: pendingDecision === "approved" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)" }}>
              {pendingDecision === "approved"
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              }
            </div>
            <h3 className="text-[17px] font-bold mb-2" style={{ color: "#050508" }}>
              {pendingDecision === "approved" ? "Approve this claim?" : "Reject this claim?"}
            </h3>
            <p className="text-[13px] mb-6" style={{ color: "rgba(5,5,8,0.5)" }}>
              {pendingDecision === "approved"
                ? "The claim will be marked as approved and the claimant will be notified by email."
                : "The claim will be marked as rejected and the claimant will be notified by email."}
            </p>
            {decideError && <p className="text-[12px] mb-3" style={{ color: "#dc2626" }}>{decideError}</p>}
            <div className="flex gap-3">
              <button onClick={handleDecide} disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: pendingDecision === "approved" ? "#16a34a" : "#dc2626" }}>
                {deciding ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </>
                ) : pendingDecision === "approved" ? "Yes, Approve" : "Yes, Reject"}
              </button>
              <button onClick={() => { setPendingDecision(null); setDecideError(""); }} disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all disabled:opacity-50"
                style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
