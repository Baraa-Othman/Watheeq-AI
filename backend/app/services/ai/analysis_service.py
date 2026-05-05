"""
AI analysis orchestration pipeline.

Runs as a FastAPI BackgroundTask:
  1. Resolve claim + policy URLs from Firestore
  2. Extract text from medical report, policy, supporting documents (PDFs)
  3. Build prompt and call Gemini for structured analysis
  4. Generate draft response (hardcoded for 'covered', AI for 'not_covered')
  5. Persist aiDecision, aiMessage, aiDraft, aiDraftOriginal on the claim doc
  6. Cache the full analysis record for the GET endpoint
"""

import logging
import time
from datetime import datetime, timezone

from app.core.config import settings
from app.models.ai_analysis import AnalysisTriggerRequest
from app.services.ai import llm_service, pdf_service, response_service, store
from app.services.ai.exceptions import (
    AnalysisNotFoundError,
    LLMResponseParsingError,
    LLMServiceError,
    PDFDownloadError,
    PDFExtractionError,
)
from app.services.ai.prompts import CLAIM_ANALYSIS_SYSTEM_PROMPT, build_analysis_prompt

logger = logging.getLogger(__name__)


async def run_analysis(analysis_id: str, request: AnalysisTriggerRequest) -> None:
    """Background task: full analysis pipeline. Updates the in-memory cache as it progresses."""
    started = time.time()

    record: dict = {
        "analysis_id": analysis_id,
        "claim_id": request.claim_id,
        "examiner_id": request.examiner_id,
        "status": "processing",
        "ai_model_used": settings.LLM_MODEL,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "coverage_decision": None,
        "confidence_score": None,
        "applicable_clauses": None,
        "reasoning": None,
        "flags": None,
        "draft_response": None,
        "processing_time_seconds": None,
        "error_message": None,
    }
    store.save_analysis(request.claim_id, record)

    try:
        # Always fetch the claim from Firestore — request fields are optional
        claim_doc = store.get_claim(request.claim_id)
        if not claim_doc:
            raise PDFExtractionError(f"Claim {request.claim_id} not found in Firestore")

        patient_info = request.patient_info.model_dump() if request.patient_info else {
            "first_name": claim_doc.get("patientFName", ""),
            "last_name": claim_doc.get("patientLName", ""),
            "date_of_birth": claim_doc.get("patientDOB", ""),
        }
        treatment_type = request.treatment_type or claim_doc.get("treatmentType", "")
        policy_name = request.policy_plan_id or claim_doc.get("policyName", "")

        medical_report_url = request.medical_report_url or claim_doc.get("medicalReport")
        policy_document_url = request.policy_document_url
        if not policy_document_url:
            if not policy_name:
                raise PDFExtractionError("No policyName found on claim and no policy_plan_id provided")
            policy_doc = store.get_policy_by_name(policy_name)
            if not policy_doc:
                raise PDFExtractionError(f"Policy '{policy_name}' not found in policies collection")
            policy_document_url = policy_doc.get("file_url")

        if not medical_report_url:
            raise PDFExtractionError("No medical report URL on claim or in request")
        if not policy_document_url:
            raise PDFExtractionError("Policy document has no file_url")

        # Step 1 + 2: extract PDFs
        logger.info(f"[{analysis_id}] Extracting medical report from {medical_report_url[:80]}…")
        medical_text = await pdf_service.extract_text(medical_report_url)
        logger.info(f"[{analysis_id}] Medical report: {len(medical_text)} chars")

        logger.info(f"[{analysis_id}] Extracting policy document from {policy_document_url[:80]}…")
        policy_text = await pdf_service.extract_text(policy_document_url)
        logger.info(f"[{analysis_id}] Policy document: {len(policy_text)} chars")

        supporting_text = ""
        supporting_url = claim_doc.get("supportingDocuments")
        if supporting_url and supporting_url not in ("some URL", ""):
            try:
                supporting_text = await pdf_service.extract_text(supporting_url)
                logger.info(f"[{analysis_id}] Supporting documents: {len(supporting_text)} chars")
            except Exception as e:
                logger.warning(f"[{analysis_id}] Supporting documents extraction failed (non-fatal): {e}")

        # Step 3 + 4: build prompt and call Gemini
        prompt = build_analysis_prompt(
            claim_id=request.claim_id,
            patient_info=patient_info,
            treatment_type=treatment_type,
            medical_report_text=medical_text,
            policy_document_text=policy_text,
            supporting_documents_text=supporting_text,
        )
        llm_raw = await llm_service.analyze(
            user_prompt=prompt,
            system_prompt=CLAIM_ANALYSIS_SYSTEM_PROMPT,
        )
        parsed = _validate_llm_response(llm_raw)

        # Step 5: draft response
        draft_text = await response_service.generate_draft(
            claim_id=request.claim_id,
            patient_info=patient_info,
            treatment_type=treatment_type,
            coverage_decision=parsed["coverage_decision"],
            reasoning=parsed["reasoning"],
            applicable_clauses=parsed["applicable_clauses"],
            flags=parsed["flags"],
        )

        # Step 6: persist + cache
        store.update_claim_with_ai_result(
            claim_id=request.claim_id,
            ai_decision=parsed["coverage_decision"],
            ai_message=parsed["reasoning"],
            ai_draft=draft_text,
            ai_draft_original=draft_text,
        )

        elapsed = round(time.time() - started, 2)
        record.update({
            "status": "completed",
            "coverage_decision": parsed["coverage_decision"],
            "confidence_score": parsed["confidence_score"],
            "applicable_clauses": parsed["applicable_clauses"],
            "reasoning": parsed["reasoning"],
            "flags": parsed["flags"],
            "draft_response": draft_text,
            "processing_time_seconds": elapsed,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        store.save_analysis(request.claim_id, record)
        logger.info(f"[{analysis_id}] Completed in {elapsed}s — decision={parsed['coverage_decision']}")

    except (PDFExtractionError, PDFDownloadError) as e:
        _fail(record, request.claim_id, started, f"PDF processing error: {e}")
    except (LLMServiceError, LLMResponseParsingError) as e:
        _fail(record, request.claim_id, started, f"LLM error: {e}")
    except Exception as e:
        _fail(record, request.claim_id, started, f"Unexpected error: {e}")


def _fail(record: dict, claim_id: str, started: float, message: str) -> None:
    logger.error(f"[{record.get('analysis_id')}] {message}")
    record.update({
        "status": "failed",
        "error_message": message,
        "processing_time_seconds": round(time.time() - started, 2),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    store.save_analysis(claim_id, record)


def _validate_llm_response(response: dict) -> dict:
    decision = (response.get("coverage_decision") or "").lower()
    if decision not in {"covered", "not_covered"}:
        raise LLMResponseParsingError(
            f"Invalid coverage_decision '{decision}', expected 'covered' or 'not_covered'"
        )

    confidence = response.get("confidence_score")
    try:
        confidence = max(0.0, min(1.0, float(confidence))) if confidence is not None else 0.0
    except (TypeError, ValueError):
        confidence = 0.0

    raw_clauses = response.get("applicable_clauses") or []
    if not isinstance(raw_clauses, list):
        raw_clauses = []
    clauses = [
        {
            "clause_id": c.get("clause_id", "Unknown"),
            "clause_text": c.get("clause_text", ""),
            "relevance": c.get("relevance", ""),
        }
        for c in raw_clauses
        if isinstance(c, dict)
    ]

    flags = response.get("flags") or []
    if not isinstance(flags, list):
        flags = []

    return {
        "coverage_decision": decision,
        "confidence_score": confidence,
        "applicable_clauses": clauses,
        "reasoning": response.get("reasoning") or "No reasoning provided",
        "flags": flags,
    }


def get_analysis_result(claim_id: str) -> dict:
    """Return the cached analysis result, or rehydrate from the claim doc if the cache was lost."""
    cached = store.get_analysis(claim_id)
    if cached:
        return cached

    claim = store.get_claim(claim_id)
    if claim and claim.get("aiDecision"):
        return {
            "analysis_id": "",
            "claim_id": claim_id,
            "examiner_id": claim.get("examinerID", ""),
            "status": "completed",
            "coverage_decision": claim.get("aiDecision"),
            "confidence_score": None,
            "applicable_clauses": None,
            "reasoning": claim.get("aiMessage"),
            "flags": None,
            "draft_response": claim.get("aiDraft"),
            "ai_model_used": None,
            "processing_time_seconds": None,
            "created_at": None,
            "completed_at": None,
            "error_message": None,
        }

    raise AnalysisNotFoundError(claim_id)
