from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.services import admin_service
from app.services import audit_service

router = APIRouter()


# ── Auth dependency ──────────────────────────────────────────────────────────

async def require_admin(authorization: str = Header(..., alias="Authorization")) -> dict:
    """Verify Firebase ID token and assert the caller has role='admin'."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = authorization[7:]
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    try:
        db = get_db()
        snap = db.collection("users").document(decoded["uid"]).get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not snap.exists or snap.to_dict().get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return {"uid": decoded["uid"], **snap.to_dict()}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/examiner-requests", summary="List all Claims Examiner registration requests")
def list_requests(
    status: Optional[str] = None,
    admin: dict = Depends(require_admin),
):
    """
    Returns all examiner registration requests.
    Optional `?status=pending|approved|rejected` filter.
    """
    return admin_service.list_examiner_requests(status_filter=status)


@router.post(
    "/examiner-requests/{request_id}/approve",
    summary="Approve a Claims Examiner registration request",
)
def approve_request(
    request_id: str,
    admin: dict = Depends(require_admin),
):
    return admin_service.approve_examiner_request(request_id, admin_uid=admin["uid"])


@router.post(
    "/examiner-requests/{request_id}/reject",
    summary="Reject a Claims Examiner registration request",
)
def reject_request(
    request_id: str,
    admin: dict = Depends(require_admin),
):
    return admin_service.reject_examiner_request(request_id, admin_uid=admin["uid"])


# ── Statistics ────────────────────────────────────────────────────────────────

@router.get("/stats/claims", summary="Aggregate claim counts grouped by status")
def claims_stats(admin: dict = Depends(require_admin)):
    return admin_service.get_claims_stats()


@router.get("/stats/examiners", summary="Per-examiner performance metrics")
def examiner_stats(admin: dict = Depends(require_admin)):
    return admin_service.get_examiner_performance()


@router.get("/stats/claims/volume", summary="Quarterly + daily claim volume for a year/quarter")
def claims_volume(
    year: Optional[int] = None,
    quarter: Optional[int] = None,
    admin: dict = Depends(require_admin),
):
    """
    Volume aggregation. Both `year` and `quarter` default to the current UTC date
    when omitted (current year, current quarter Q1..Q4).
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    y = year if year is not None else now.year
    q = quarter if quarter is not None else (now.month - 1) // 3 + 1
    return admin_service.get_claims_volume(y, q)


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit-logs", summary="List system audit log entries")
def list_audit_logs(
    actor_role: Optional[str] = None,
    action: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 200,
    admin: dict = Depends(require_admin),
):
    """
    Returns audit log entries, newest first.

    Optional query params:
    - `actor_role`: admin | examiner | claimant
    - `action`: e.g. claim_approved, policy_uploaded
    - `category`: account | policy | claim
    - `date_from`, `date_to`: inclusive ISO-8601 strings
    - `limit`: cap on rows returned (default 200)
    """
    return audit_service.list_audit_logs(
        actor_role=actor_role,
        action=action,
        category=category,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
