import sys
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth
from google.cloud.firestore_v1 import transaction as fs_transaction
from app.services.firestore_client import get_db
from app.services.claims_service import notify_claim_decision

router = APIRouter()


# ── Auth dependency ────────────────────────────────────────────────────────────

async def require_examiner(authorization: str = Header(..., alias="Authorization")) -> dict:
    """Verify Firebase ID token and assert the caller has role='examiner'."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = authorization[7:]
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    db = get_db()
    snap = db.collection("users").document(decoded["uid"]).get()
    if not snap.exists:
        raise HTTPException(status_code=403, detail="User not found")

    profile = snap.to_dict()
    if profile.get("role") != "examiner":
        raise HTTPException(status_code=403, detail="Examiner access required")
    if profile.get("status") != "active":
        raise HTTPException(status_code=403, detail="Your examiner account is not active yet")

    return {"uid": decoded["uid"], **profile}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _serialize_claim(data: dict) -> dict:
    """Convert Firestore Timestamps to ISO strings for JSON serialisation."""
    st = data.get("submittingTime")
    if st and hasattr(st, "isoformat"):
        data["submittingTime"] = st.isoformat()
    return data


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/claims", summary="List claims visible to this examiner")
def list_examiner_claims(examiner: dict = Depends(require_examiner)):
    """
    Returns claims according to visibility rules:
    - submitted (examinerID == ""): visible to ALL examiners
    - under review / approved / rejected: only visible to the assigned examiner
    - cancelled: never shown
    """
    uid = examiner["uid"]
    db = get_db()
    results = []

    # 1. All submitted claims (any examiner can see these)
    submitted_docs = (
        db.collection("claims")
        .where("status", "==", "submitted")
        .stream()
    )
    for doc in submitted_docs:
        data = doc.to_dict()
        results.append(_serialize_claim(data))

    # 2. Claims owned by this examiner (under review / approved / rejected)
    owned_docs = (
        db.collection("claims")
        .where("examinerID", "==", uid)
        .stream()
    )
    submitted_ids = {c["claimId"] for c in results}
    for doc in owned_docs:
        data = doc.to_dict()
        status = data.get("status", "")
        # Skip submitted (already included above) and cancelled
        if status in ("cancelled", "submitted"):
            continue
        if data.get("claimId") not in submitted_ids:
            results.append(_serialize_claim(data))

    # Sort newest first
    results.sort(key=lambda x: x.get("submittingTime", ""), reverse=True)
    return results


@router.get("/claims/{claim_id}", summary="Get a single claim (examiner-visible)")
def get_examiner_claim(claim_id: str, examiner: dict = Depends(require_examiner)):
    """
    Returns a claim if the examiner is allowed to see it:
    - submitted with no examinerID → any examiner
    - all other statuses → only the assigned examiner
    """
    uid = examiner["uid"]
    db = get_db()
    snap = db.collection("claims").document(claim_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Claim not found")

    data = snap.to_dict()
    status = data.get("status")
    assigned = data.get("examinerID", "")

    if status == "submitted" and assigned == "":
        return _serialize_claim(data)
    if assigned == uid:
        return _serialize_claim(data)

    raise HTTPException(status_code=403, detail="You do not have access to this claim")


class PickResponse(BaseModel):
    success: bool
    claimId: str


@router.post("/claims/{claim_id}/pick", summary="Pick and lock a submitted claim", response_model=PickResponse)
def pick_claim(claim_id: str, examiner: dict = Depends(require_examiner)):
    """
    Atomically transitions a claim from 'submitted' → 'under review' and
    sets examinerID to the caller's UID.

    Uses a Firestore transaction to prevent two examiners from picking the
    same claim simultaneously (first write wins; second gets a 409).
    """
    uid = examiner["uid"]
    db = get_db()
    ref = db.collection("claims").document(claim_id)

    @fs_transaction.transactional
    def _do_pick(txn):
        snap = ref.get(transaction=txn)
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Claim not found")

        data = snap.to_dict()
        if data.get("status") != "submitted":
            raise HTTPException(
                status_code=409,
                detail=f"Claim cannot be picked — current status is '{data.get('status')}'"
            )
        if data.get("examinerID", "") != "":
            raise HTTPException(
                status_code=409,
                detail="This claim has already been picked by another examiner"
            )

        txn.update(ref, {"status": "under review", "examinerID": uid})

    txn = db.transaction()
    _do_pick(txn)

    print(f"[Examiner] Picked claim={claim_id} by examiner={uid}", file=sys.stderr)
    return {"success": True, "claimId": claim_id}


class DecideRequest(BaseModel):
    decision: Literal["approved", "rejected"]


@router.patch("/claims/{claim_id}/decide", summary="Approve or reject a claim under review")
def decide_claim(claim_id: str, body: DecideRequest, examiner: dict = Depends(require_examiner)):
    """
    Sets the claim status to 'approved' or 'rejected'.
    Only the examiner who picked the claim (examinerID == uid) can decide.
    Triggers an email notification to the claimant via the existing service.
    """
    uid = examiner["uid"]
    db = get_db()
    ref = db.collection("claims").document(claim_id)
    snap = ref.get()

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Claim not found")

    data = snap.to_dict()

    if data.get("examinerID") != uid:
        raise HTTPException(status_code=403, detail="You are not assigned to this claim")

    if data.get("status") != "under review":
        raise HTTPException(
            status_code=409,
            detail=f"Claim is not under review — current status is '{data.get('status')}'"
        )

    ref.update({"status": body.decision})
    print(f"[Examiner] Decision '{body.decision}' for claim={claim_id} by examiner={uid}", file=sys.stderr)

    # Send email notification to claimant (fire-and-forget — don't fail the request if email fails)
    try:
        notify_claim_decision(claim_id)
    except Exception as e:
        print(f"[Examiner] Email notification failed for claim={claim_id}: {e}", file=sys.stderr)

    return {"success": True, "claimId": claim_id, "status": body.decision}
