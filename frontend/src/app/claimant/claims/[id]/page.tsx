"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";

function MedicalReportDownloadButton({ claimId, patientName, user }: { claimId: string; patientName: string; user: unknown }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    setLoading(true);
    setError("");
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
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
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
  examinerResponse?: string;
}

const STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; color: string; dot: string; desc: string }> = {
  submitted: {
    label: "Submitted",
    bg: "rgba(0,4,232,0.07)",
    color: "#0004E8",
    dot: "#0004E8",
    desc: "Your claim has been received and is awaiting review.",
  },
  "under review": {
    label: "Under Review",
    bg: "rgba(234,179,8,0.1)",
    color: "#b45309",
    dot: "#eab308",
    desc: "An examiner is currently reviewing your claim.",
  },
  approved: {
    label: "Approved",
    bg: "rgba(22,163,74,0.08)",
    color: "#15803d",
    dot: "#16a34a",
    desc: "Your claim has been approved. You will be contacted with next steps.",
  },
  rejected: {
    label: "Rejected",
    bg: "rgba(220,38,38,0.08)",
    color: "#dc2626",
    dot: "#dc2626",
    desc: "Your claim has not been approved. Please contact support if you have questions.",
  },
  cancelled: {
    label: "Cancelled",
    bg: "rgba(5,5,8,0.06)",
    color: "rgba(5,5,8,0.45)",
    dot: "rgba(5,5,8,0.3)",
    desc: "This claim has been cancelled.",
  },
};

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
        {label}
      </p>
      <p className="text-[14px]" style={{ color: "#050508" }}>
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-SA", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    setLoading(true);
    apiFetchAuth(`/api/claims/${id}`, user)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load claim");
        setClaim(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, id]);

  const handleCancel = async () => {
    if (!user || !claim) return;
    setCancelError("");
    setCancelling(true);
    try {
      const res = await apiFetchAuth(`/api/claims/${id}/cancel`, user, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to cancel claim");
      setClaim((prev) => prev ? { ...prev, status: "cancelled" } : prev);
      setShowCancelConfirm(false);
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4 hover:opacity-70" style={{ color: "rgba(5,5,8,0.45)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          Back
        </button>
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!claim) return null;

  const statusCfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG["submitted"];
  const canCancel = claim.status === "submitted";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
      {/* Back */}
      <button
        onClick={() => router.push("/claimant/claims")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-5 hover:opacity-70 transition-opacity"
        style={{ color: "rgba(5,5,8,0.45)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        My Claims
      </button>

      {/* Title + status */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "#050508" }}>
            {claim.patientFName} {claim.patientLName}
          </h1>
          <p className="text-[12px] font-mono mt-1" style={{ color: "rgba(5,5,8,0.3)" }}>
            Ref: {claim.claimId}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-wide uppercase"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
          {statusCfg.label}
        </span>
      </div>

      {/* Status description banner */}
      <div
        className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3"
        style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.dot}25` }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={statusCfg.dot} strokeWidth="2" className="flex-shrink-0">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-[13px]" style={{ color: statusCfg.color }}>
          {statusCfg.desc}
        </p>
      </div>

      {/* Details card */}
      <div
        className="rounded-2xl border mb-5"
        style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
      >
        <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
            Patient Information
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="First Name" value={claim.patientFName} />
          <Field label="Last Name" value={claim.patientLName} />
          <Field label="Date of Birth" value={claim.patientDOB} />
        </div>

        <div className="px-6 pb-3 border-t border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>
            Claim Details
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Policy Plan" value={claim.policyName} />
          <Field label="Treatment Type" value={claim.treatmentType} />
          <Field label="Submitted On" value={formatDate(claim.submittingTime)} />
          {claim.medicalReport && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                Medical Report
              </p>
              <MedicalReportDownloadButton
                claimId={claim.claimId}
                patientName={`${claim.patientFName}-${claim.patientLName}`}
                user={user}
              />
            </div>
          )}
          {claim.supportingDocuments && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                Supporting Documents
              </p>
              <a
                href={claim.supportingDocuments}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: "#0004E8" }}
              >
                View Documents ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Examiner Response card — shown to claimant after decision */}
      {claim.examinerResponse && (
        <div
          className="rounded-2xl border mb-5"
          style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
        >
          <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
              Examiner Response
            </p>
          </div>
          <div className="p-6">
            <p className="text-[14px]" style={{ color: "#050508" }}>
              {claim.examinerResponse}
            </p>
          </div>
        </div>
      )}

      {/* Cancel section */}
      {canCancel && (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "#fecaca", background: "#fef9f9" }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[14px] font-semibold" style={{ color: "#050508" }}>
                Cancel This Claim
              </p>
              <p className="text-[13px] mt-0.5" style={{ color: "rgba(5,5,8,0.5)" }}>
                You can withdraw this claim while it&apos;s still pending review.
              </p>
            </div>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all"
              style={{ borderColor: "#fca5a5", color: "#dc2626", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Cancel Claim
            </button>
          </div>
          {cancelError && (
            <p className="text-[12px] mt-2" style={{ color: "#dc2626" }}>{cancelError}</p>
          )}
        </div>
      )}

      {/* Bottom padding for mobile nav */}
      <div className="h-20 lg:h-0" />

      {/* ── Cancel confirmation dialog ── */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: "rgba(5,5,8,0.45)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-7 max-w-sm w-full"
            style={{ background: "#fff", boxShadow: "0 24px 64px rgba(5,5,8,0.18)" }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(220,38,38,0.08)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-[17px] font-bold mb-2" style={{ color: "#050508" }}>
              Cancel this claim?
            </h3>
            <p className="text-[13px] mb-6" style={{ color: "rgba(5,5,8,0.5)" }}>
              This action cannot be undone. The claim will be marked as cancelled and can no longer be reviewed.
            </p>
            {cancelError && (
              <p className="text-[12px] mb-3" style={{ color: "#dc2626" }}>{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "#dc2626" }}
              >
                {cancelling ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cancelling...
                  </>
                ) : "Yes, Cancel"}
              </button>
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(""); }}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all"
                style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Keep Claim
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
