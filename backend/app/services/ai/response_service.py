"""Draft response generation (US-23) and editing (US-24)."""

import logging
from datetime import datetime, timezone

from app.services.ai import llm_service, store
from app.services.ai.exceptions import DraftNotFoundError
from app.services.ai.prompts import (
    DRAFT_RESPONSE_SYSTEM_PROMPT,
    build_draft_response_prompt,
)

logger = logging.getLogger(__name__)


APPROVAL_STATEMENT = (
    "Your claim has been reviewed and approved. "
    "The treatment is covered under your insurance policy. "
    "No further action is required from your side. "
    "Thank you for choosing Watheeq."
)


async def generate_draft(
    claim_id: str,
    patient_info: dict,
    treatment_type: str,
    coverage_decision: str,
    reasoning: str,
    applicable_clauses: list,
    flags: list,
) -> str:
    """Produce a draft response. Hardcoded for 'covered'; AI-generated for 'not_covered'."""
    logger.info(f"Generating draft for claim {claim_id} (decision={coverage_decision})")

    if coverage_decision == "covered":
        draft_text = APPROVAL_STATEMENT
    else:
        prompt = build_draft_response_prompt(
            patient_info=patient_info,
            treatment_type=treatment_type,
            coverage_decision=coverage_decision,
            reasoning=reasoning,
            applicable_clauses=applicable_clauses,
            flags=flags,
        )
        draft_text = await llm_service.generate_text(
            user_prompt=prompt,
            system_prompt=DRAFT_RESPONSE_SYSTEM_PROMPT,
        )

    now = datetime.now(timezone.utc).isoformat()
    store.save_draft(claim_id, {
        "claim_id": claim_id,
        "original_draft": draft_text,
        "current_draft": draft_text,
        "is_edited": False,
        "generated_at": now,
        "last_edited_at": None,
        "last_edited_by": None,
        "coverage_decision": coverage_decision,
    })
    return draft_text


def get_draft(claim_id: str) -> dict:
    """Return the draft record from cache, or fall back to the persisted aiDraft on the claim."""
    cached = store.get_draft(claim_id)
    if cached:
        return cached

    claim = store.get_claim(claim_id)
    if claim and claim.get("aiDraft"):
        original = claim.get("aiDraftOriginal") or claim["aiDraft"]
        current = claim["aiDraft"]
        record = {
            "claim_id": claim_id,
            "original_draft": original,
            "current_draft": current,
            "is_edited": current != original,
            "generated_at": None,
            "last_edited_at": None,
            "last_edited_by": None,
            "coverage_decision": claim.get("aiDecision"),
        }
        store.save_draft(claim_id, record)
        return record

    raise DraftNotFoundError(claim_id)


def edit_draft(claim_id: str, edited_response: str, examiner_id: str) -> dict:
    """Update the editable draft, preserving the original for audit."""
    record = get_draft(claim_id)  # raises DraftNotFoundError if neither cache nor Firestore has it
    now = datetime.now(timezone.utc).isoformat()
    record["current_draft"] = edited_response
    record["is_edited"] = True
    record["last_edited_at"] = now
    record["last_edited_by"] = examiner_id
    store.save_draft(claim_id, record)
    store.update_claim_draft_only(claim_id, edited_response)
    logger.info(f"Draft for claim {claim_id} edited by examiner {examiner_id}")
    return record
