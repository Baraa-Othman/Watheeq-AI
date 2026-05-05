"""Pydantic schemas for AI analysis endpoints."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ── Trigger ───────────────────────────────────────────────────────────────────


class PatientInfo(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: str


class AnalysisTriggerRequest(BaseModel):
    """
    All fields except claim_id are optional — when omitted the backend reads them
    from the claim doc + policies collection in Firestore.
    """

    claim_id: str = Field(..., description="Firestore claim document ID")
    patient_info: Optional[PatientInfo] = None
    treatment_type: Optional[str] = None
    policy_plan_id: Optional[str] = None
    medical_report_url: Optional[str] = None
    policy_document_url: Optional[str] = None
    examiner_id: Optional[str] = Field(default=None, description="Filled in by the route from the auth token if not provided")


class AnalysisTriggerResponse(BaseModel):
    analysis_id: str
    claim_id: str
    status: str = "pending"
    message: str = "AI analysis has been triggered successfully"


# ── Result ────────────────────────────────────────────────────────────────────


class ApplicableClause(BaseModel):
    clause_id: str
    clause_text: str
    relevance: str


class AnalysisResultResponse(BaseModel):
    analysis_id: Optional[str] = None
    claim_id: str
    status: str
    coverage_decision: Optional[str] = None
    confidence_score: Optional[float] = None
    applicable_clauses: Optional[List[ApplicableClause]] = None
    reasoning: Optional[str] = None
    flags: Optional[List[str]] = None
    draft_response: Optional[str] = None
    ai_model_used: Optional[str] = None
    processing_time_seconds: Optional[float] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    disclaimer: str = "This is an AI-assisted analysis. Final decision requires human review."


# ── Draft response ────────────────────────────────────────────────────────────


class DraftResponseResult(BaseModel):
    claim_id: str
    original_draft: str
    current_draft: str
    is_edited: bool = False
    generated_at: Optional[datetime] = None
    last_edited_at: Optional[datetime] = None
    last_edited_by: Optional[str] = None
    disclaimer: str = "This is an AI-assisted draft. Review and edit before sending to the claimant."


class EditDraftRequest(BaseModel):
    edited_response: str
    examiner_id: Optional[str] = None  # Filled from the auth token if not provided


class EditDraftResponse(BaseModel):
    claim_id: str
    current_draft: str
    is_edited: bool = True
    last_edited_at: datetime
    last_edited_by: str


# ── Health ────────────────────────────────────────────────────────────────────


class HealthCheckResponse(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    llm_provider: str = "google-gemini"
    llm_model: str
