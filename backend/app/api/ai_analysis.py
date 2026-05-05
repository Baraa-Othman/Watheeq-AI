"""
AI analysis router — examiner-only endpoints.

Mounted under /api/examiner/ai/* in main.py.
Reuses require_examiner from api.examiner so the same Firebase ID token used by
the rest of the examiner UI is the only credential needed.
"""

from datetime import datetime, timezone
from http import HTTPStatus
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.api.examiner import require_examiner
from app.core.config import settings
from app.models.ai_analysis import (
    AnalysisResultResponse,
    AnalysisTriggerRequest,
    AnalysisTriggerResponse,
    ApplicableClause,
    DraftResponseResult,
    EditDraftRequest,
    EditDraftResponse,
    HealthCheckResponse,
)
from app.services.ai import analysis_service, response_service
from app.services.ai.exceptions import AnalysisNotFoundError, DraftNotFoundError

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="AI service health check",
)
async def health_check() -> HealthCheckResponse:
    """No auth — used by load balancers and the frontend to verify the AI layer is up."""
    return HealthCheckResponse(llm_model=settings.LLM_MODEL)


@router.post(
    "/analysis/trigger",
    response_model=AnalysisTriggerResponse,
    status_code=HTTPStatus.ACCEPTED,
    summary="Trigger AI analysis for a claim (US-20)",
)
async def trigger_analysis(
    data: AnalysisTriggerRequest,
    background_tasks: BackgroundTasks,
    examiner: dict = Depends(require_examiner),
) -> AnalysisTriggerResponse:
    """Queue the analysis pipeline as a background task and return 202 immediately."""
    if not data.examiner_id:
        data.examiner_id = examiner["uid"]

    analysis_id = str(uuid4())
    background_tasks.add_task(analysis_service.run_analysis, analysis_id, data)

    return AnalysisTriggerResponse(
        analysis_id=analysis_id,
        claim_id=data.claim_id,
        status="pending",
    )


@router.get(
    "/analysis/{claim_id}",
    response_model=AnalysisResultResponse,
    summary="Get AI analysis results for a claim (US-21, US-22)",
)
async def get_analysis_results(
    claim_id: str,
    examiner: dict = Depends(require_examiner),
) -> AnalysisResultResponse:
    """Poll this until status == 'completed' or 'failed'."""
    try:
        data = analysis_service.get_analysis_result(claim_id)
    except AnalysisNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    clauses = None
    if data.get("applicable_clauses"):
        clauses = [
            ApplicableClause(
                clause_id=c.get("clause_id", ""),
                clause_text=c.get("clause_text", ""),
                relevance=c.get("relevance", ""),
            )
            for c in data["applicable_clauses"]
        ]

    return AnalysisResultResponse(
        analysis_id=data.get("analysis_id") or "",
        claim_id=data.get("claim_id", claim_id),
        status=data.get("status", "unknown"),
        coverage_decision=data.get("coverage_decision"),
        confidence_score=data.get("confidence_score"),
        applicable_clauses=clauses,
        reasoning=data.get("reasoning"),
        flags=data.get("flags"),
        draft_response=data.get("draft_response"),
        ai_model_used=data.get("ai_model_used"),
        processing_time_seconds=data.get("processing_time_seconds"),
        created_at=data.get("created_at"),
        completed_at=data.get("completed_at"),
        error_message=data.get("error_message"),
    )


@router.get(
    "/responses/{claim_id}/draft",
    response_model=DraftResponseResult,
    summary="Get the AI draft response for a claim (US-23)",
)
async def get_draft_response(
    claim_id: str,
    examiner: dict = Depends(require_examiner),
) -> DraftResponseResult:
    try:
        data = response_service.get_draft(claim_id)
    except DraftNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    return DraftResponseResult(
        claim_id=data.get("claim_id", claim_id),
        original_draft=data.get("original_draft", ""),
        current_draft=data.get("current_draft", ""),
        is_edited=data.get("is_edited", False),
        generated_at=data.get("generated_at"),
        last_edited_at=data.get("last_edited_at"),
        last_edited_by=data.get("last_edited_by"),
    )


@router.put(
    "/responses/{claim_id}/draft",
    response_model=EditDraftResponse,
    summary="Edit the AI draft response (US-24)",
)
async def edit_draft_response(
    claim_id: str,
    data: EditDraftRequest,
    examiner: dict = Depends(require_examiner),
) -> EditDraftResponse:
    examiner_id = data.examiner_id or examiner["uid"]
    try:
        updated = response_service.edit_draft(
            claim_id=claim_id,
            edited_response=data.edited_response,
            examiner_id=examiner_id,
        )
    except DraftNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    last_edited_at = updated.get("last_edited_at")
    if isinstance(last_edited_at, str):
        last_edited_at = datetime.fromisoformat(last_edited_at)

    return EditDraftResponse(
        claim_id=claim_id,
        current_draft=updated.get("current_draft", ""),
        is_edited=True,
        last_edited_at=last_edited_at or datetime.now(timezone.utc),
        last_edited_by=updated.get("last_edited_by", examiner_id),
    )
