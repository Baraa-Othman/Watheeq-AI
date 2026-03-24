import sys
from datetime import datetime, timezone
from fastapi import HTTPException
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.utils.email import send_examiner_approved, send_examiner_rejected
from app.services.auth_service import _phone_to_uid


def list_examiner_requests(status_filter: str | None = None) -> list[dict]:
    """Return all examiner registration requests, optionally filtered by status."""
    db = get_db()
    col = db.collection("examiner_requests")
    if status_filter and status_filter in ("pending", "approved", "rejected"):
        # Filter-only query (no order_by) avoids needing a composite index
        docs = list(col.where("status", "==", status_filter).stream())
    else:
        docs = list(col.order_by("created_at").stream())
    results = [d.to_dict() for d in docs]
    # Sort in Python when a status filter is applied
    if status_filter:
        results.sort(key=lambda x: x.get("created_at", ""), reverse=False)
    return results


def approve_examiner_request(request_id: str, admin_uid: str) -> dict:
    """
    Approve a pending examiner request:
    1. Update request document to status=approved
    2. Create the examiner user in the `users` collection
    3. Send approval email
    """
    db = get_db()
    ref = db.collection("examiner_requests").document(request_id)
    snap = ref.get()

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Registration request not found")

    req = snap.to_dict()

    if req.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req.get('status')}")

    now = datetime.now(timezone.utc).isoformat()

    # 1. Update request
    ref.update({
        "status": "approved",
        "reviewed_at": now,
        "reviewed_by": admin_uid,
    })

    # 2. Create user account in `users` collection
    uid = _phone_to_uid(req["phone"])
    user_profile = {
        "uid": uid,
        "phone": req["phone"],
        "fullName": req["full_name"],
        "nationalId": req["national_id"],
        "email": req["email"],
        "role": "examiner",
        "status": "active",
        "createdAt": now,
    }
    db.collection("users").document(uid).set(user_profile)
    print(f"[Admin] Approved examiner request={request_id} uid={uid}", file=sys.stderr)

    # 3. Send approval email (non-fatal)
    send_examiner_approved(req["email"], req["full_name"])

    return {"success": True, "uid": uid}


def reject_examiner_request(request_id: str, admin_uid: str) -> dict:
    """
    Reject a pending examiner request:
    1. Update request document to status=rejected
    2. Send rejection email
    """
    db = get_db()
    ref = db.collection("examiner_requests").document(request_id)
    snap = ref.get()

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Registration request not found")

    req = snap.to_dict()

    if req.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Request is already {req.get('status')}")

    now = datetime.now(timezone.utc).isoformat()

    ref.update({
        "status": "rejected",
        "reviewed_at": now,
        "reviewed_by": admin_uid,
    })
    print(f"[Admin] Rejected examiner request={request_id}", file=sys.stderr)

    # Send rejection email (non-fatal)
    send_examiner_rejected(req["email"], req["full_name"])

    return {"success": True}
