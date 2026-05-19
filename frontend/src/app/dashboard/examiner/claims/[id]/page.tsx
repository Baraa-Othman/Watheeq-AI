"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { API_BASE_URL, apiFetchAuth } from "@/lib/apiClient";
import { LangProvider, useLang } from "@/lib/lang-context";
import LangToggle from "@/components/LangToggle";

function MedicalReportDownloadButton({ claimId, patientName, user }: { claimId: string; patientName: string; user: unknown }) {
  const [loading, setDlLoading] = useState(false);
  const [error, setDlError] = useState("");
  const { t } = useLang();

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
        {loading ? t("downloadingBtn") : t("downloadReportBtn")}
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
  examinerResponse?: string;
  aiDecision?: string;
  aiMessage?: string;
  aiDraft?: string;
  aiDraftOriginal?: string;
  aiConfidence?: number;
  aiClauses?: AIClause[];
  aiFlags?: string[];
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

const STATUS_CONFIG: Record<ClaimStatus, { labelKey: string; bg: string; color: string; dot: string; descKey: string }> = {
  submitted: { labelKey: "statusSubmitted", bg: "rgba(0,4,232,0.07)", color: "#0004E8", dot: "#0004E8", descKey: "descSubmitted" },
  "under review": { labelKey: "statusUnderReview", bg: "rgba(234,179,8,0.10)", color: "#b45309", dot: "#eab308", descKey: "descUnderReview" },
  approved: { labelKey: "statusApproved", bg: "rgba(22,163,74,0.08)", color: "#15803d", dot: "#16a34a", descKey: "descApproved" },
  rejected: { labelKey: "statusRejected", bg: "rgba(220,38,38,0.08)", color: "#dc2626", dot: "#dc2626", descKey: "descRejected" },
  cancelled: { labelKey: "statusCancelled", bg: "rgba(5,5,8,0.06)", color: "rgba(5,5,8,0.45)", dot: "rgba(5,5,8,0.3)", descKey: "descCancelled" },
};

function Field({ label, value, dir }: { label: string; value: string; dir?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>{label}</p>
      <p className="text-[14px]" style={{ color: "#050508" }} dir={dir}>{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-SA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return iso; }
}

function ExaminerClaimDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t, isRTL, lang } = useLang();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [examinerResponse, setExaminerResponse] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState("");

  // AI streaming state
  const [ai, setAI] = useState<AIAnalysis | null>(null);
  const [aiError, setAIError] = useState("");
  const [aiPhase, setAIPhase] = useState<AIPhase>("idle");
  const [streamingDraft, setStreamingDraft] = useState("");
  const [draftStreaming, setDraftStreaming] = useState(false);
  const examinerEditedRef = useRef(false);
  const aiCompletedRef = useRef(false);

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
        if (typeof data.aiDraft === "string" && data.aiDraft && !examinerEditedRef.current) {
          setExaminerResponse(data.aiDraft);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, id]);

  // ── AI live event stream (NDJSON over fetch) ───────────────────────────────
  useEffect(() => {
    if (!user || !claim) return;
    const isMyClaim = claim.examinerID === (profile?.uid ?? "");
    if (!isMyClaim) return;
    if (claim.status !== "under review") return;

    // The live stream already produced a completed result for this claim.
    if (aiCompletedRef.current) return;

    // Already analyzed (persisted on the claim doc): hydrate and skip the stream
    if (claim.aiDecision) {
      setAI({
        status: "completed",
        coverage_decision: (claim.aiDecision as AICoverage) || null,
        confidence_score: typeof claim.aiConfidence === "number" ? claim.aiConfidence : null,
        applicable_clauses: Array.isArray(claim.aiClauses) ? claim.aiClauses : null,
        reasoning: claim.aiMessage ?? null,
        flags: Array.isArray(claim.aiFlags) ? claim.aiFlags : null,
        draft_response: claim.aiDraft ?? null,
        error_message: null,
      });
      setAIPhase("done");
      aiCompletedRef.current = true;
      if (!examinerEditedRef.current && claim.aiDraft) {
        setExaminerResponse(claim.aiDraft);
      }
      // If older records don't yet have the rich fields, fall back to the
      // analysis GET endpoint to fill them in (in-memory cache or Firestore).
      const missingRichFields =
        typeof claim.aiConfidence !== "number" ||
        !Array.isArray(claim.aiClauses);
      if (missingRichFields) {
        apiFetchAuth(`/api/examiner/ai/analysis/${claim.claimId}`, user)
          .then(async (res) => {
            if (!res.ok) return;
            const rich = await res.json();
            setAI((prev) => prev ? {
              ...prev,
              confidence_score:
                typeof rich.confidence_score === "number"
                  ? rich.confidence_score
                  : prev.confidence_score,
              applicable_clauses: rich.applicable_clauses ?? prev.applicable_clauses,
              flags: rich.flags ?? prev.flags,
              reasoning: rich.reasoning ?? prev.reasoning,
              draft_response: rich.draft_response ?? prev.draft_response,
            } : prev);
          })
          .catch(() => { /* non-fatal */ });
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
            if (!examinerEditedRef.current) setExaminerResponse("");
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
          aiCompletedRef.current = true;
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
      // Persist any examiner edits to the AI draft before deciding (audit trail)
      if (ai && ai.draft_response && examinerResponse && examinerResponse !== ai.draft_response) {
        try {
          await apiFetchAuth(`/api/examiner/ai/responses/${claim.claimId}/draft`, user, {
            method: "PUT",
            body: JSON.stringify({ edited_response: examinerResponse }),
          });
        } catch {
          // non-fatal — proceed with the decision
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
    setAIPhase("started");
    setStreamingDraft("");
    setDraftStreaming(false);
    examinerEditedRef.current = false;
    aiCompletedRef.current = false;
    setExaminerResponse("");
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
      // Force the streaming useEffect to re-bind
      setClaim((prev) => prev ? { ...prev, aiDecision: "", aiMessage: "", aiDraft: "", aiDraftOriginal: "" } : prev);
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "AI retry failed");
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
    <div className="min-h-screen" style={{ background: "#fafafd" }} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <header
        className="h-16 border-b flex items-center justify-between px-6 sticky top-0 z-30"
        style={{ borderColor: "#e2e2ee", background: "#fff" }}
      >
        <div className="flex items-center gap-3">
          <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}>
            {t("claimDetailsSection")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle compact />
          <button
            onClick={() => router.push("/dashboard/examiner")}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-all hover:bg-gray-50"
            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isRTL ? "rotate-180" : ""}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {isRTL ? "لوحة التحكم" : "Dashboard"}
          </button>
        </div>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isRTL ? "rotate-180" : ""}><path d="M15 18l-6-6 6-6" /></svg>
              {t("claimsQueue")}
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isRTL ? "rotate-180" : ""}><path d="M15 18l-6-6 6-6" /></svg>
                {t("claimsQueue")}
              </button>

              {/* Title + status */}
              <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "#050508" }}>
                    {claim.patientFName} {claim.patientLName}
                  </h1>
                  <p className="text-[12px] mt-1" style={{ color: "rgba(5,5,8,0.3)" }}>
                    <span>{t("refLabel")} </span>
                    <span className="font-mono inline-block" dir="ltr">{claim.claimId}</span>
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-wide uppercase"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
                  {t(statusCfg.labelKey)}
                </span>
              </div>

              {/* Status banner */}
              <div className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3"
                style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.dot}25` }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={statusCfg.dot} strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[13px]" style={{ color: statusCfg.color }}>{t(statusCfg.descKey)}</p>
              </div>

              {/* Details card */}
              <div className="rounded-2xl border mb-4"
                style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}>
                <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>{t("patientInfoSection")}</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label={t("firstNameLabel")} value={claim.patientFName} />
                  <Field label={t("lastNameLabel")} value={claim.patientLName} />
                  <Field label={t("dobLabel")} value={claim.patientDOB} dir="ltr" />
                </div>
                <div className="px-6 pb-3 border-t border-b" style={{ borderColor: "#f0f0f5" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>{t("claimDetailsSection")}</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label={t("policyPlanLabel")} value={claim.policyName} />
                  <Field label={t("treatmentTypeLabel")} value={claim.treatmentType} />
                  <Field label={t("submittedOnLabel")} value={formatDate(claim.submittingTime)} dir="ltr" />
                  {claim.medicalReport && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>{t("medReportLabel")}</p>
                      <MedicalReportDownloadButton
                        claimId={claim.claimId}
                        patientName={`${claim.patientFName}-${claim.patientLName}`}
                        user={user}
                      />
                    </div>
                  )}
                  {claim.supportingDocuments && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.35)" }}>{t("supportDocsLabel")}</p>
                      <a href={claim.supportingDocuments} target="_blank" rel="noopener noreferrer"
                        className="text-[14px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70" style={{ color: "#0004E8" }}>
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

              {/* ── AI Analysis ── */}
              {canDecide && (() => {
                const isProcessing = ai?.status === "processing" || ai?.status === "pending" || (!ai && aiPhase !== "failed");
                const isFailed = ai?.status === "failed" || aiPhase === "failed";
                const isDone = ai?.status === "completed";
                const decisionLabel = ai?.coverage_decision === "covered"
                  ? t("covered")
                  : ai?.coverage_decision === "not_covered"
                  ? t("notCovered")
                  : "—";
                const decisionColor = ai?.coverage_decision === "covered"
                  ? "#15803d"
                  : ai?.coverage_decision === "not_covered"
                  ? "#dc2626"
                  : "rgba(5,5,8,0.45)";
                const decisionBg = ai?.coverage_decision === "covered"
                  ? "rgba(22,163,74,0.08)"
                  : ai?.coverage_decision === "not_covered"
                  ? "rgba(220,38,38,0.08)"
                  : "rgba(5,5,8,0.05)";

                return (
                  <div
                     className="rounded-2xl border mb-5"
                     style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}
                  >
                    <div className="px-6 pt-5 pb-3 border-b flex items-center justify-between gap-3" style={{ borderColor: "#f0f0f5" }}>
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>
                        {t("aiAnalysisTitle")}
                      </p>
                      {isProcessing && (
                        <div className="inline-flex items-center gap-2 text-[11px] font-medium" style={{ color: "rgba(5,5,8,0.55)" }}>
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {isRTL ? "قيد المعالجة" : "Processing"}
                        </div>
                      )}
                      {isDone && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#15803d" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          {isRTL ? "جاهز" : "Ready"}
                        </span>
                      )}
                    </div>

                    <div className="p-6">
                      {/* Live phase ticker */}
                      {(isProcessing || aiPhase === "done") && aiPhase !== "idle" && (
                        <div className="mb-5 rounded-xl px-4 py-3" style={{ background: "rgba(0,4,232,0.04)", border: "1px solid rgba(0,4,232,0.12)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(0,4,232,0.7)" }}>
                            {isRTL ? "الحالة" : "Status"}
                          </p>
                          <AnimatePresence mode="wait">
                            <motion.p
                              key={aiPhase}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.18 }}
                              className="text-[13px] font-medium"
                              style={{ color: "#050508" }}
                            >
                              {PHASE_COPY[aiPhase] || (isRTL ? "يجري العمل..." : "Working…")}
                            </motion.p>
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Decision + confidence */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                        <div className="rounded-xl px-4 py-3" style={{ background: decisionBg, border: `1px solid ${decisionColor}25` }}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {t("aiDecisionTitle")}
                          </p>
                          <p className="text-[15px] font-semibold" style={{ color: decisionColor }}>{decisionLabel}</p>
                        </div>
                        <div className="rounded-xl px-4 py-3" style={{ background: "#f9f9fc", border: "1px solid #e2e2ee" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {t("confidenceTitle")}
                          </p>
                          {typeof ai?.confidence_score === "number" ? (() => {
                            const pct = Math.round(ai.confidence_score * 100);
                            const barColor = pct >= 80 ? "#16a34a" : pct >= 50 ? "#0004E8" : "#eab308";
                            return (
                              <>
                                <p className="text-[15px] font-semibold" style={{ color: "#050508" }}>{pct}%</p>
                                <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(5,5,8,0.06)" }}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    className="h-full rounded-full"
                                    style={{ background: barColor }}
                                  />
                                </div>
                              </>
                            );
                          })() : (
                            <p className="text-[15px] font-semibold" style={{ color: "rgba(5,5,8,0.45)" }}>—</p>
                          )}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {ai?.reasoning && (
                        <div className="mb-5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {t("aiReasoningTitle")}
                          </p>
                          <p className="text-[13px] leading-relaxed" style={{ color: "#050508" }}>
                            {ai.reasoning}
                          </p>
                        </div>
                      )}

                      {/* Applicable clauses */}
                      {ai?.applicable_clauses && ai.applicable_clauses.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {t("citedPolicyTitle")}
                          </p>
                          <ul className="space-y-2">
                            {ai.applicable_clauses.map((c, i) => (
                              <li key={`${c.clause_id}-${i}`} className="rounded-lg p-3 text-[12px]"
                                style={{ background: "#f9f9fc", border: "1px solid #e2e2ee" }}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <span className="font-mono font-semibold" style={{ color: "#0004E8" }}>{c.clause_id}</span>
                                  <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(5,5,8,0.45)" }}>
                                    {c.relevance}
                                  </span>
                                </div>
                                <p style={{ color: "rgba(5,5,8,0.75)" }}>{c.clause_text}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Flags */}
                      {ai?.flags && ai.flags.length > 0 && (
                        <div className="mb-5 rounded-xl px-4 py-3" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#b45309" }}>
                            {t("flagsManualReviewTitle")}
                          </p>
                          <ul className="text-[12px] list-disc pl-5" style={{ color: "#92400e" }}>
                            {ai.flags.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Error + retry */}
                      {isFailed && (
                        <div className="mb-5 rounded-xl px-4 py-3 flex items-start justify-between gap-3"
                          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)" }}>
                          <div>
                            <p className="text-[12px] font-semibold" style={{ color: "#dc2626" }}>{isRTL ? "فشل تحليل الذكاء الاصطناعي" : "AI analysis failed"}</p>
                            <p className="text-[12px] mt-0.5" style={{ color: "rgba(5,5,8,0.6)" }}>
                              {ai?.error_message || aiError || (isRTL ? "يرجى المحاولة مجدداً." : "Please retry.")}
                            </p>
                          </div>
                          <button
                            onClick={handleRetryAI}
                            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                            style={{ background: "#fff", border: "1px solid rgba(220,38,38,0.4)", color: "#dc2626" }}
                          >
                            {isRTL ? "إعادة المحاولة" : "Retry"}
                          </button>
                        </div>
                      )}

                      {/* Examiner response (streamed draft) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {t("examinerResponseLabel")}
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
                          rows={5}
                          placeholder={
                            isProcessing
                              ? (isRTL ? "يقوم الذكاء الاصطناعي بصياغة الرد..." : "The AI is drafting a response…")
                              : t("enterResponsePlaceholder")
                          }
                          value={examinerResponse}
                          onChange={(e) => {
                            examinerEditedRef.current = true;
                            setExaminerResponse(e.target.value);
                          }}
                        />
                        {lang === "ar" && (
                          <div className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                            style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", border: "1px solid rgba(245,158,11,0.2)" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 animate-pulse">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <span>{t("englishOnlyHint")}</span>
                          </div>
                        )}
                        {streamingDraft && !examinerEditedRef.current && draftStreaming && (
                          <p className="text-[11px] mt-1.5" style={{ color: "rgba(5,5,8,0.45)" }}>
                            {isRTL ? "يمكنك تعديل هذا الرد قبل تقديم قرارك." : "You can edit this response before submitting your decision."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Decision panel */}
              {canDecide && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border p-5 mb-5"
                  style={{ background: "#fff", borderColor: "#e2e2ee", boxShadow: "0 1px 3px rgba(5,5,8,0.04)" }}>
                  <p className="text-[13px] font-semibold mb-1" style={{ color: "#050508" }}>{t("makeDecisionTitle")}</p>
                  <p className="text-[13px] mb-4" style={{ color: "rgba(5,5,8,0.5)" }}>
                    {t("makeDecisionDesc")}
                  </p>
                  <div className="flex flex-col gap-3 mb-5">
                    {/* Approve List Item */}
                    <button
                      onClick={() => setSelectedDecision("approved")}
                      className="flex items-center gap-3 p-4 rounded-xl border text-start transition-all"
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
                      className="flex items-center gap-3 p-4 rounded-xl border text-start transition-all"
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
                    {claim.status === "approved" ? t("youApprovedClaimMsg") : t("youRejectedClaimMsg")}
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
              {pendingDecision === "approved" ? t("approveThisClaimConfirm") : t("rejectThisClaimConfirm")}
            </h3>
            <p className="text-[13px] mb-6" style={{ color: "rgba(5,5,8,0.5)" }}>
              {pendingDecision === "approved" ? t("approveClaimConfirmDesc") : t("rejectClaimConfirmDesc")}
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
                    {isRTL ? "جارٍ الإرسال..." : "Submitting..."}
                  </>
                ) : (pendingDecision === "approved" ? t("yesApprove") : t("yesReject"))}
              </button>
              <button onClick={() => { setPendingDecision(null); setDecideError(""); }} disabled={deciding}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all disabled:opacity-50"
                style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                {t("cancel")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function ExaminerClaimDetailPage() {
  return (
    <LangProvider>
      <ExaminerClaimDetailPageInner />
    </LangProvider>
  );
}
