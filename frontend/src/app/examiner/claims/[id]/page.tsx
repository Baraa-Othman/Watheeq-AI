"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";

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
  examinerResponse?: string;
  aiDecision?: string;
  aiMessage?: string;
  aiDraft?: string;
  aiDraftOriginal?: string;
}

type AICoverage = "covered" | "not_covered";
type AIStatus = "pending" | "processing" | "completed" | "failed";

interface AIClause {
  clause_id: string;
  clause_text: string;
  relevance: string;
}

interface AIAnalysis {
  status: AIStatus;
  coverage_decision: AICoverage | null;
  confidence_score: number | null;
  applicable_clauses: AIClause[] | null;
  reasoning: string | null;
  flags: string[] | null;
  draft_response: string | null;
  error_message: string | null;
}

const STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; color: string; dot: string; desc: string }> = {
  submitted: {
    label: "Submitted",
    bg: "rgba(0,4,232,0.07)",
    color: "#0004E8",
    dot: "#0004E8",
    desc: "This claim has been received and is awaiting review.",
  },
  "under review": {
    label: "Under Review",
    bg: "rgba(234,179,8,0.10)",
    color: "#b45309",
    dot: "#eab308",
    desc: "This claim is currently under your review.",
  },
  approved: {
    label: "Approved",
    bg: "rgba(22,163,74,0.08)",
    color: "#15803d",
    dot: "#16a34a",
    desc: "This claim has been approved. The claimant has been notified.",
  },
  rejected: {
    label: "Rejected",
    bg: "rgba(220,38,38,0.08)",
    color: "#dc2626",
    dot: "#dc2626",
    desc: "This claim has been rejected. The claimant has been notified.",
  },
  cancelled: {
    label: "Cancelled",
    bg: "rgba(5,5,8,0.06)",
    color: "rgba(5,5,8,0.45)",
    dot: "rgba(5,5,8,0.3)",
    desc: "This claim was cancelled by the claimant.",
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

export default function ExaminerClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Decision modal state
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [examinerResponse, setExaminerResponse] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState("");

  // AI analysis state
  const [ai, setAI] = useState<AIAnalysis | null>(null);
  const [aiError, setAIError] = useState("");
  const [aiTriggering, setAITriggering] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    setLoading(true);
    apiFetchAuth(`/api/examiner/claims/${id}`, user)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load claim");
        setClaim(data);
        if (typeof data.aiDraft === "string" && data.aiDraft) {
          setExaminerResponse(data.aiDraft);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, id]);

  // ── AI: load existing result, or auto-trigger when examiner opens an under-review claim ──
  useEffect(() => {
    if (!user || !claim) return;
    const isMyClaim = claim.examinerID === (profile?.uid ?? "");
    if (!isMyClaim) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async (): Promise<AIAnalysis | null> => {
      const res = await apiFetchAuth(`/api/examiner/ai/analysis/${claim.claimId}`, user);
      if (res.status === 404) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch AI analysis");
      return data as AIAnalysis;
    };

    const poll = async () => {
      try {
        const data = await fetchOnce();
        if (cancelled) return;
        if (!data) return;
        setAI(data);
        if (data.status === "completed" && data.draft_response && !examinerResponse) {
          setExaminerResponse(data.draft_response);
        }
        if (data.status === "pending" || data.status === "processing") {
          pollTimer = setTimeout(poll, 4000);
        }
      } catch (err) {
        if (cancelled) return;
        setAIError(err instanceof Error ? err.message : "AI poll failed");
      }
    };

    const trigger = async () => {
      setAITriggering(true);
      setAIError("");
      try {
        const res = await apiFetchAuth(`/api/examiner/ai/analysis/trigger`, user, {
          method: "POST",
          body: JSON.stringify({ claim_id: claim.claimId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to trigger AI analysis");
        setAI({
          status: data.status ?? "pending",
          coverage_decision: null,
          confidence_score: null,
          applicable_clauses: null,
          reasoning: null,
          flags: null,
          draft_response: null,
          error_message: null,
        });
        pollTimer = setTimeout(poll, 4000);
      } catch (err) {
        setAIError(err instanceof Error ? err.message : "AI trigger failed");
      } finally {
        if (!cancelled) setAITriggering(false);
      }
    };

    (async () => {
      try {
        const existing = await fetchOnce();
        if (cancelled) return;
        if (existing) {
          setAI(existing);
          if (existing.status === "completed" && existing.draft_response && !examinerResponse) {
            setExaminerResponse(existing.draft_response);
          }
          if (existing.status === "pending" || existing.status === "processing") {
            pollTimer = setTimeout(poll, 4000);
          }
          return;
        }
        if (claim.status === "under review" && !claim.aiDecision) {
          await trigger();
        }
      } catch (err) {
        if (!cancelled) setAIError(err instanceof Error ? err.message : "AI lookup failed");
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, claim?.claimId, claim?.status, claim?.examinerID, claim?.aiDecision, profile?.uid]);

  const handleDecide = async () => {
    if (!user || !claim || !pendingDecision) return;
    setDecideError("");
    setDeciding(true);
    try {
      // Persist any examiner edits to the AI draft before deciding (so the audit trail records them)
      if (ai && ai.draft_response && examinerResponse && examinerResponse !== ai.draft_response) {
        try {
          await apiFetchAuth(`/api/examiner/ai/responses/${claim.claimId}/draft`, user, {
            method: "PUT",
            body: JSON.stringify({ edited_response: examinerResponse }),
          });
        } catch {
          // Non-fatal — proceed with the decision regardless
        }
      }

      const res = await apiFetchAuth(`/api/examiner/claims/${id}/decide`, user, {
        method: "PATCH",
        body: JSON.stringify({ decision: pendingDecision, examinerResponse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit decision");
      setClaim((prev) => prev ? { ...prev, status: pendingDecision, examinerResponse: pendingDecision === "approved" && !examinerResponse ? "approved as requested" : examinerResponse } : prev);
      setSelectedDecision(pendingDecision);
      setPendingDecision(null);
    } catch (err: unknown) {
      setDecideError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setDeciding(false);
    }
  };

  const handleRetryAI = async () => {
    if (!user || !claim) return;
    setAIError("");
    setAITriggering(true);
    try {
      const res = await apiFetchAuth(`/api/examiner/ai/analysis/trigger`, user, {
        method: "POST",
        body: JSON.stringify({ claim_id: claim.claimId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to trigger AI analysis");
      setAI({
        status: data.status ?? "pending",
        coverage_decision: null,
        confidence_score: null,
        applicable_clauses: null,
        reasoning: null,
        flags: null,
        draft_response: null,
        error_message: null,
      });
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "AI retry failed");
    } finally {
      setAITriggering(false);
    }
  };

  const myUid = profile?.uid ?? "";

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-lg">
        <button
          onClick={() => router.push("/examiner/claims")}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4 hover:opacity-70"
          style={{ color: "rgba(5,5,8,0.45)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Claims Queue
        </button>
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!claim) return null;

  const statusCfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG["submitted"];
  const isMyReview = claim.examinerID === myUid;
  const canDecide = isMyReview && claim.status === "under review";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
      {/* Back */}
      <button
        onClick={() => router.push("/examiner/claims")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-5 hover:opacity-70 transition-opacity"
        style={{ color: "rgba(5,5,8,0.45)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Claims Queue
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

      {/* Patient Information card */}
      <div
        className="rounded-2xl border mb-4"
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
              <a
                href={claim.medicalReport}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: "#0004E8" }}
              >
                View Report ↗
              </a>
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

      {/* ── Response History (if exists) ── */}
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

      {/* ── AI Analysis + Examiner Response ── */}
      {canDecide && (
        <div
          className="rounded-2xl border mb-5"
          style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
        >
          <div className="px-6 pt-5 pb-3 border-b flex items-center justify-between gap-3" style={{ borderColor: "#f0f0f5" }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
              AI Analysis (Watheeq AI)
            </p>
            {ai && (ai.status === "completed" || ai.status === "failed") && (
              <button
                onClick={handleRetryAI}
                disabled={aiTriggering}
                className="text-[11px] font-semibold uppercase tracking-widest hover:opacity-70 disabled:opacity-40"
                style={{ color: "rgba(5,5,8,0.45)" }}
              >
                {aiTriggering ? "Re-running…" : "Re-run analysis"}
              </button>
            )}
          </div>
          <div className="p-6">
            {/* AI status banner */}
            {(!ai || ai.status === "pending" || ai.status === "processing" || aiTriggering) && (
              <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl" style={{ background: "rgba(0,4,232,0.04)", border: "1px solid rgba(0,4,232,0.12)" }}>
                <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-[13px]" style={{ color: "#0004E8" }}>
                  {aiTriggering
                    ? "Triggering AI analysis…"
                    : "AI is reviewing the medical report and the policy. This usually takes 10–20 seconds."}
                </p>
              </div>
            )}

            {ai && ai.status === "failed" && (
              <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid #fca5a5" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[13px]" style={{ color: "#dc2626" }}>
                  AI analysis failed{ai.error_message ? `: ${ai.error_message}` : ""}.
                </p>
              </div>
            )}

            {aiError && (
              <p className="text-[12px] mb-4" style={{ color: "#dc2626" }}>{aiError}</p>
            )}

            {/* AI result fields */}
            {ai && ai.status === "completed" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                      AI Decision
                    </p>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold uppercase"
                      style={{
                        background: ai.coverage_decision === "covered" ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)",
                        color: ai.coverage_decision === "covered" ? "#15803d" : "#dc2626",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ai.coverage_decision === "covered" ? "#16a34a" : "#dc2626" }} />
                      {ai.coverage_decision === "covered" ? "Covered" : "Not covered"}
                    </span>
                  </div>
                  {typeof ai.confidence_score === "number" && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                        Confidence
                      </p>
                      <p className="text-[14px]" style={{ color: "#050508" }}>
                        {(ai.confidence_score * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                {ai.reasoning && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.35)" }}>
                      AI Reasoning
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "#050508" }}>
                      {ai.reasoning}
                    </p>
                  </div>
                )}

                {ai.applicable_clauses && ai.applicable_clauses.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.35)" }}>
                      Cited Policy Clauses
                    </p>
                    <ul className="space-y-3">
                      {ai.applicable_clauses.map((c, i) => (
                        <li key={i} className="rounded-xl p-3" style={{ background: "#f9f9fc", border: "1px solid #f0f0f5" }}>
                          <p className="text-[12px] font-semibold mb-1" style={{ color: "#0004E8" }}>{c.clause_id}</p>
                          <p className="text-[13px] mb-1.5" style={{ color: "#050508" }}>&ldquo;{c.clause_text}&rdquo;</p>
                          <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.55)" }}>{c.relevance}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.flags && ai.flags.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#b45309" }}>
                      Flags for Manual Review
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {ai.flags.map((f, i) => (
                        <li key={i} className="text-[13px]" style={{ color: "#b45309" }}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px] italic mb-5" style={{ color: "rgba(5,5,8,0.4)" }}>
                  AI-assisted analysis. Review the cited clauses and adjust the response below before submitting your decision.
                </p>
              </>
            )}

            {/* Editable draft / examiner response */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.35)" }}>
                {ai && ai.draft_response ? "AI Draft Response (editable)" : "Examiner Response (Optional)"}
              </p>
              <textarea
                className="w-full rounded-xl border p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0004E8]"
                style={{ borderColor: "#e2e2ee", color: "#050508", background: "#f9f9fc" }}
                rows={ai && ai.draft_response ? 6 : 3}
                placeholder={ai && ai.draft_response ? "Edit the AI draft before sending…" : "Enter response here..."}
                value={examinerResponse}
                onChange={(e) => setExaminerResponse(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Decision panel (only if I own this claim and it's under review) ── */}
      {canDecide && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-5 mb-5"
          style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
        >
          <p className="text-[13px] font-semibold mb-1" style={{ color: "#050508" }}>
            Make a Decision
          </p>
          <p className="text-[13px] mb-4" style={{ color: "rgba(5,5,8,0.5)" }}>
            Review the claim documents above, then approve or reject this claim. The claimant will be notified by email.
          </p>
          <div className="flex flex-col gap-3 mb-5">
            {/* Approve List Item */}
            <button
              onClick={() => setSelectedDecision("approved")}
              className="flex items-center gap-3 p-4 rounded-xl border text-left transition-all"
              style={{
                borderColor: selectedDecision === "approved" ? "#0004E8" : "#e2e2ee",
                background: selectedDecision === "approved" ? "rgba(0,4,232,0.04)" : "#fff"
              }}
              onMouseEnter={(e) => { if (selectedDecision !== "approved") e.currentTarget.style.background = "rgba(0,4,232,0.02)"; }}
              onMouseLeave={(e) => { if (selectedDecision !== "approved") e.currentTarget.style.background = "#fff"; }}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedDecision === "approved" ? "border-[#0004E8]" : "border-[#e2e2ee]"}`}>
                {selectedDecision === "approved" && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#0004E8" }} />}
              </div>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: selectedDecision === "approved" ? "#0004E8" : "#050508" }}>Approve Claim</p>
                <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.5)" }}>Mark the claim as approved.</p>
              </div>
            </button>

            {/* Reject List Item */}
            <button
              onClick={() => setSelectedDecision("rejected")}
              className="flex items-center gap-3 p-4 rounded-xl border text-left transition-all"
              style={{
                borderColor: selectedDecision === "rejected" ? "#0004E8" : "#e2e2ee",
                background: selectedDecision === "rejected" ? "rgba(0,4,232,0.04)" : "#fff"
              }}
              onMouseEnter={(e) => { if (selectedDecision !== "rejected") e.currentTarget.style.background = "rgba(0,4,232,0.02)"; }}
              onMouseLeave={(e) => { if (selectedDecision !== "rejected") e.currentTarget.style.background = "#fff"; }}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedDecision === "rejected" ? "border-[#0004E8]" : "border-[#e2e2ee]"}`}>
                {selectedDecision === "rejected" && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#0004E8" }} />}
              </div>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: selectedDecision === "rejected" ? "#0004E8" : "#050508" }}>Reject Claim</p>
                <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.5)" }}>Mark the claim as rejected.</p>
              </div>
            </button>
          </div>

          {selectedDecision && (
            <motion.button
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              onClick={() => setPendingDecision(selectedDecision)}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#0004E8" }}
            >
              Submit Decision
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Post-decision banner */}
      {(claim.status === "approved" || claim.status === "rejected") && isMyReview && (
        <div
          className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3"
          style={{
            background: claim.status === "approved" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
            border: `1px solid ${claim.status === "approved" ? "#86efac" : "#fca5a5"}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={claim.status === "approved" ? "#16a34a" : "#dc2626"} strokeWidth="2" className="flex-shrink-0">
            {claim.status === "approved"
              ? <path d="M20 6L9 17l-5-5" />
              : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>
            }
          </svg>
          <p className="text-[13px] font-medium" style={{ color: claim.status === "approved" ? "#15803d" : "#dc2626" }}>
            You {claim.status === "approved" ? "approved" : "rejected"} this claim. The claimant has been notified by email.
          </p>
        </div>
      )}

      {/* Bottom padding for mobile nav */}
      <div className="h-20 lg:h-0" />

      {/* ── Decision confirmation modal ── */}
      {pendingDecision && (
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
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{
                background: pendingDecision === "approved"
                  ? "rgba(22,163,74,0.08)"
                  : "rgba(220,38,38,0.08)",
              }}
            >
              {pendingDecision === "approved" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
            </div>

            <h3 className="text-[17px] font-bold mb-2" style={{ color: "#050508" }}>
              {pendingDecision === "approved" ? "Approve this claim?" : "Reject this claim?"}
            </h3>
            <p className="text-[13px] mb-6" style={{ color: "rgba(5,5,8,0.5)" }}>
              {pendingDecision === "approved"
                ? "The claim will be marked as approved and the claimant will be notified by email."
                : "The claim will be marked as rejected and the claimant will be notified by email."}
            </p>

            {decideError && (
              <p className="text-[12px] mb-3" style={{ color: "#dc2626" }}>
                {decideError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDecide}
                disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: pendingDecision === "approved" ? "#16a34a" : "#dc2626",
                }}
              >
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
              <button
                onClick={() => { setPendingDecision(null); setDecideError(""); }}
                disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all disabled:opacity-50"
                style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
