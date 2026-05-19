"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth, API_BASE_URL } from "@/lib/apiClient";

import { useLang } from "@/lib/lang-context";

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

function Field({ label, value, isLTR = false }: { label: string; value: string; isLTR?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
        {label}
      </p>
      <p className="text-[14px]" dir={isLTR ? "ltr" : undefined} style={{ color: "#050508", textAlign: isLTR ? "left" : undefined }}>
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
  const { t, isRTL } = useLang();

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

  // Live-streaming state (NDJSON event stream)
  type AIPhase =
    | "idle"
    | "started"
    | "pdf_medical"
    | "pdf_policy"
    | "pdf_supporting"
    | "llm_analysis"
    | "llm_draft"
    | "done"
    | "failed";

  const PHASE_COPY: Record<AIPhase, string> = {
    idle: "",
    started: t("aiStartingAnalysis"),
    pdf_medical: t("aiReadingMedical"),
    pdf_policy: t("aiReadingPolicy"),
    pdf_supporting: t("aiReadingSupporting"),
    llm_analysis: t("aiAnalyzingClaim"),
    llm_draft: t("aiDraftingResponse"),
    done: t("aiDone"),
    failed: t("aiFailed"),
  };

  const [aiPhase, setAIPhase] = useState<AIPhase>("idle");
  const [streamingDraft, setStreamingDraft] = useState("");
  const [draftStreaming, setDraftStreaming] = useState(false);
  // Holds the prompt-built draft separate from the textarea so the examiner
  // can keep typing while tokens are still arriving.
  const examinerEditedRef = useRef(false);

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

  // ── AI: live event stream (NDJSON) ─────────────────────────────────────────
  useEffect(() => {
    if (!user || !claim) return;
    const isMyClaim = claim.examinerID === (profile?.uid ?? "");
    if (!isMyClaim) return;
    if (claim.status !== "under review") return;

    // If the analysis already finished and was persisted on the claim doc, just hydrate from it.
    if (claim.aiDecision) {
      setAI({
        status: "completed",
        coverage_decision: (claim.aiDecision as AICoverage) || null,
        confidence_score: null,
        applicable_clauses: null,
        reasoning: claim.aiMessage ?? null,
        flags: null,
        draft_response: claim.aiDraft ?? null,
        error_message: null,
      });
      setAIPhase("done");
      if (!examinerEditedRef.current && claim.aiDraft) {
        setExaminerResponse(claim.aiDraft);
      }
      return;
    }

    let cancelled = false;
    let abortController: AbortController | null = null;
    let completedHandled = false;

    const refetchClaim = async () => {
      try {
        const res = await apiFetchAuth(`/api/examiner/claims/${claim.claimId}`, user);
        if (!res.ok) return;
        const fresh = await res.json();
        if (!cancelled) setClaim(fresh);
      } catch {
        // non-fatal
      }
    };

    const handleEvent = (ev: { type: string; [k: string]: unknown }) => {
      if (cancelled) return;
      switch (ev.type) {
        case "open":
          setAIPhase((p) => (p === "idle" ? "started" : p));
          setAI((prev) => prev ?? {
            status: "processing",
            coverage_decision: null, confidence_score: null,
            applicable_clauses: null, reasoning: null, flags: null,
            draft_response: null, error_message: null,
          });
          break;
        case "step": {
          const step = (ev as { step?: string }).step;
          if (step && step in PHASE_COPY) setAIPhase(step as AIPhase);
          if (step === "llm_draft") {
            setStreamingDraft("");
            setDraftStreaming(true);
          }
          break;
        }
        case "analysis": {
          const data = (ev as unknown as { data: AIAnalysis & { coverage_decision: AICoverage } }).data;
          setAI((prev) => ({
            ...(prev ?? {
              status: "processing", coverage_decision: null, confidence_score: null,
              applicable_clauses: null, reasoning: null, flags: null,
              draft_response: null, error_message: null,
            }),
            status: "processing",
            coverage_decision: data.coverage_decision,
            confidence_score: data.confidence_score ?? null,
            applicable_clauses: data.applicable_clauses ?? null,
            reasoning: data.reasoning ?? null,
            flags: data.flags ?? null,
          }));
          break;
        }
        case "draft_chunk": {
          const piece = String((ev as { text?: string }).text ?? "");
          if (!piece) break;
          setStreamingDraft((prev) => prev + piece);
          if (!examinerEditedRef.current) {
            setExaminerResponse((prev) => prev + piece);
          }
          break;
        }
        case "complete": {
          const data = (ev as unknown as { data: AIAnalysis & { coverage_decision: AICoverage } }).data;
          setAI({
            status: "completed",
            coverage_decision: data.coverage_decision ?? null,
            confidence_score: data.confidence_score ?? null,
            applicable_clauses: data.applicable_clauses ?? null,
            reasoning: data.reasoning ?? null,
            flags: data.flags ?? null,
            draft_response: data.draft_response ?? null,
            error_message: null,
          });
          setDraftStreaming(false);
          setAIPhase("done");
          if (!examinerEditedRef.current && data.draft_response) {
            setExaminerResponse(data.draft_response);
          }
          if (!completedHandled) {
            completedHandled = true;
            refetchClaim();
          }
          break;
        }
        case "error": {
          const message = String((ev as { message?: string }).message ?? "AI analysis failed");
          setAI((prev) => ({
            ...(prev ?? {
              coverage_decision: null, confidence_score: null,
              applicable_clauses: null, reasoning: null, flags: null,
              draft_response: null,
            }),
            status: "failed",
            coverage_decision: prev?.coverage_decision ?? null,
            confidence_score: prev?.confidence_score ?? null,
            applicable_clauses: prev?.applicable_clauses ?? null,
            reasoning: prev?.reasoning ?? null,
            flags: prev?.flags ?? null,
            draft_response: prev?.draft_response ?? null,
            error_message: message,
          }));
          setDraftStreaming(false);
          setAIPhase("failed");
          setAIError(message);
          break;
        }
        default:
          break;
      }
    };

    const consume = async () => {
      try {
        setAIError("");
        setAIPhase("started");
        setAI({
          status: "processing",
          coverage_decision: null, confidence_score: null,
          applicable_clauses: null, reasoning: null, flags: null,
          draft_response: null, error_message: null,
        });

        const idToken = await user.getIdToken();
        abortController = new AbortController();
        const res = await fetch(`${API_BASE_URL}/api/examiner/ai/analysis/${claim.claimId}/stream`, {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          // eslint-disable-next-line no-cond-assign
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              handleEvent(JSON.parse(line));
            } catch (parseErr) {
              console.warn("[AI stream] bad line:", line, parseErr);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        const aborted =
          (err as DOMException)?.name === "AbortError" ||
          (typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError");
        if (!aborted) {
          setAIError(err instanceof Error ? err.message : "AI stream failed");
          setAIPhase("failed");
        }
      }
    };

    consume();

    return () => {
      cancelled = true;
      abortController?.abort();
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
    setAIPhase("started");
    setStreamingDraft("");
    setDraftStreaming(false);
    examinerEditedRef.current = false;
    setExaminerResponse("");
    try {
      // Re-trigger the analysis. The stream useEffect re-runs because we clear
      // claim.aiDecision so the live progress events flow back into the UI.
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
      // Force the streaming useEffect to re-bind by clearing the persisted decision
      setClaim((prev) => prev ? { ...prev, aiDecision: "", aiMessage: "", aiDraft: "", aiDraftOriginal: "" } : prev);
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
          {t("claimsQueue")}
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

  const statusLabel =
    claim.status === "submitted" ? t("statusSubmitted") :
    claim.status === "under review" ? t("statusUnderReview") :
    claim.status === "approved" ? t("statusApproved") :
    claim.status === "rejected" ? t("statusRejected") :
    claim.status === "cancelled" ? t("statusCancelled") : statusCfg.label;

  const statusDesc =
    claim.status === "submitted" ? t("descSubmitted") :
    claim.status === "under review" ? t("descUnderReview") :
    claim.status === "approved" ? t("descApproved") :
    claim.status === "rejected" ? t("descRejected") :
    claim.status === "cancelled" ? t("descCancelled") : statusCfg.desc;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl" dir={isRTL ? "rtl" : "ltr"}>
      {/* Back */}
      <button
        onClick={() => router.push("/examiner/claims")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-5 hover:opacity-70 transition-opacity"
        style={{ color: "rgba(5,5,8,0.45)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isRTL ? "rotate-180" : ""}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {t("claimsQueue")}
      </button>

      {/* Title + status */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "#050508" }}>
            {claim.patientFName} {claim.patientLName}
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "rgba(5,5,8,0.3)" }}>
            {t("refLabel")}{" "}
            <span className="font-mono" dir="ltr">
              {claim.claimId}
            </span>
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-wide uppercase"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
          {statusLabel}
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
          {statusDesc}
        </p>
      </div>

      {/* Patient Information card */}
      <div
        className="rounded-2xl border mb-4"
        style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
      >
        <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
            {t("patientInfoSection")}
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label={t("firstNameLabel")} value={claim.patientFName} />
          <Field label={t("lastNameLabel")} value={claim.patientLName} />
          <Field label={t("dobLabel")} value={claim.patientDOB} isLTR={true} />
        </div>

        <div className="px-6 pb-3 border-t border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>
            {t("claimDetailsSection")}
          </p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label={t("policyPlanLabel")} value={claim.policyName} />
          <Field label={t("treatmentTypeLabel")} value={claim.treatmentType} />
          <Field label={t("submittedOnLabel")} value={formatDate(claim.submittingTime)} isLTR={true} />

          {claim.medicalReport && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                {t("medReportLabel")}
              </p>
              <a
                href={claim.medicalReport}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: "#0004E8" }}
              >
                {t("viewReportBtn")}
              </a>
            </div>
          )}

          {claim.supportingDocuments && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                {t("supportDocsLabel")}
              </p>
              <a
                href={claim.supportingDocuments}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: "#0004E8" }}
              >
                {t("viewDocuments")}
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
              {t("examinerResponseLabel")}
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
              {t("aiAnalysisTitle")}
            </p>
            {ai && (ai.status === "completed" || ai.status === "failed") && (
              <button
                onClick={handleRetryAI}
                disabled={aiTriggering}
                className="text-[11px] font-semibold uppercase tracking-widest hover:opacity-70 disabled:opacity-40"
                style={{ color: "rgba(5,5,8,0.45)" }}
              >
                {aiTriggering ? t("rerunning") : t("rerunAnalysis")}
              </button>
            )}
          </div>
          <div className="p-6">
            {/* Live phase banner — visible while the analysis is in flight */}
            {ai && ai.status !== "completed" && ai.status !== "failed" && (
              <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl" style={{ background: "rgba(0,4,232,0.04)", border: "1px solid rgba(0,4,232,0.12)" }}>
                <svg className="animate-spin h-4 w-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="flex-1">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={aiPhase}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="text-[13px] font-medium"
                      style={{ color: "#0004E8" }}
                    >
                      {PHASE_COPY[aiPhase] || t("aiStartingAnalysis")}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-[11px] mt-1" style={{ color: "rgba(0,4,232,0.55)" }}>
                    {isRTL ? "مباشر · البث من " : "Live · streaming from "}{aiPhase === "llm_draft" ? (isRTL ? "توليد المسودة" : "draft generation") : "Gemini"}
                  </p>
                </div>
              </div>
            )}

            {ai && ai.status === "failed" && (
              <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid #fca5a5" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[13px]" style={{ color: "#dc2626" }}>
                  {t("aiFailed")}{ai.error_message ? `: ${ai.error_message}` : ""}.
                </p>
              </div>
            )}

            {aiError && (
              <p className="text-[12px] mb-4" style={{ color: "#dc2626" }}>{aiError}</p>
            )}

            {/* AI result fields — render progressively as the stream populates them */}
            {ai && ai.coverage_decision && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                      {t("aiCoverageDecision")}
                    </p>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold uppercase"
                      style={{
                        background: ai.coverage_decision === "covered" ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)",
                        color: ai.coverage_decision === "covered" ? "#15803d" : "#dc2626",
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ai.coverage_decision === "covered" ? "#16a34a" : "#dc2626" }} />
                      {ai.coverage_decision === "covered" ? t("covered") : t("notCovered")}
                    </span>
                  </div>
                  {typeof ai.confidence_score === "number" && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>
                        {t("confidenceTitle")}
                      </p>
                      <p className="text-[14px]" dir="ltr" style={{ color: "#050508", textAlign: isRTL ? "right" : "left" }}>
                        {(ai.confidence_score * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                {ai.reasoning && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.35)" }}>
                      {t("aiReasoningTitle")}
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "#050508" }}>
                      {ai.reasoning}
                    </p>
                  </div>
                )}

                {ai.applicable_clauses && ai.applicable_clauses.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.35)" }}>
                      {t("citedPolicyTitle")}
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
                      {t("flagsManualReviewTitle")}
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {ai.flags.map((f, i) => (
                        <li key={i} className="text-[13px]" style={{ color: "#b45309" }}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px] italic mb-5" style={{ color: "rgba(5,5,8,0.4)" }}>
                  {t("aiAssistedDisclaimer")}
                </p>
              </>
            )}

            {/* Editable draft / examiner response */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(5,5,8,0.35)" }}>
                  {(ai && ai.draft_response) || streamingDraft
                    ? t("aiDraftResponseTitle")
                    : t("examinerResponseOptional")}
                </p>
                {draftStreaming && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#0004E8" }} />
                    {t("streamingTitle")}
                  </span>
                )}
              </div>
              <textarea
                className="w-full rounded-xl border p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0004E8]"
                style={{ borderColor: "#e2e2ee", color: "#050508", background: "#f9f9fc" }}
                rows={(ai && ai.draft_response) || streamingDraft ? 6 : 3}
                placeholder={(ai && ai.draft_response) || streamingDraft
                  ? t("editDraftPlaceholder")
                  : t("enterResponsePlaceholder")}
                value={examinerResponse}
                onChange={(e) => {
                  examinerEditedRef.current = true;
                  setExaminerResponse(e.target.value);
                }}
              />
              {isRTL && (
                <p className="text-[12px] mt-1.5 font-medium px-1 flex items-center gap-1" style={{ color: "#b45309" }}>
                  ⚠️ {t("englishOnlyHint")}
                </p>
              )}
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
            {t("makeDecisionTitle")}
          </p>
          <p className="text-[13px] mb-4" style={{ color: "rgba(5,5,8,0.5)" }}>
            {t("makeDecisionDesc")}
          </p>
          <div className="flex flex-col gap-3 mb-5">
            {/* Approve List Item */}
            <button
              onClick={() => setSelectedDecision("approved")}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${isRTL ? "text-right" : "text-left"}`}
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
                <p className="text-[14px] font-semibold" style={{ color: selectedDecision === "approved" ? "#0004E8" : "#050508" }}>{t("approveClaimBtn")}</p>
                <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.5)" }}>{t("approveClaimDesc")}</p>
              </div>
            </button>

            {/* Reject List Item */}
            <button
              onClick={() => setSelectedDecision("rejected")}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${isRTL ? "text-right" : "text-left"}`}
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
                <p className="text-[14px] font-semibold" style={{ color: selectedDecision === "rejected" ? "#0004E8" : "#050508" }}>{t("rejectClaimBtn")}</p>
                <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.5)" }}>{t("rejectClaimDesc")}</p>
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
              {t("submitDecisionBtn")}
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
            {claim.status === "approved" ? t("youApprovedClaimMsg") : t("youRejectedClaimMsg")}
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
              {pendingDecision === "approved" ? t("approveThisClaimConfirm") : t("rejectThisClaimConfirm")}
            </h3>
            <p className="text-[13px] mb-6" style={{ color: "rgba(5,5,8,0.5)" }}>
              {pendingDecision === "approved"
                ? t("approveClaimConfirmDesc")
                : t("rejectClaimConfirmDesc")}
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
                    {isRTL ? "جارٍ التقديم..." : "Submitting..."}
                  </>
                ) : pendingDecision === "approved" ? t("yesApprove") : t("yesReject")}
              </button>
              <button
                onClick={() => { setPendingDecision(null); setDecideError(""); }}
                disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all disabled:opacity-50"
                style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {t("cancel")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
