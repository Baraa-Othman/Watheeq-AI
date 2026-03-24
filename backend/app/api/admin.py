from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.services import admin_service

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
