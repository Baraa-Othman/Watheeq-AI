import sys
from datetime import datetime, timezone
from fastapi import HTTPException
from app.services.firestore_client import get_db
from app.models.claim import SubmitClaimRequest
from app.utils.email import send_claim_approved, send_claim_rejected


def submit_claim(claimant_uid: str, data: SubmitClaimRequest) -> dict:
    """Create a new claim document in Firestore and return the claim reference ID."""
    db = get_db()
    now = datetime.now(timezone.utc)

    doc_ref = db.collection("claims").document()
    claim_data = {
        "claimId": doc_ref.id,
        "claimantID": claimant_uid,
        "examinerID": "",
        "patientFName": data.patientFName,
        "patientLName": data.patientLName,
        "patientDOB": data.patientDOB,
        "policyName": data.policyName,
        "treatmentType": data.treatmentType,
        "medicalReport": data.medicalReport,
        "supportingDocuments": data.supportingDocuments or "",
        "examinerResponse": "",
        "status": "submitted",
        "submittingTime": now,
    }
    doc_ref.set(claim_data)
    print(f"[Claims] Submitted claim={doc_ref.id} by claimant={claimant_uid}", file=sys.stderr)
    return {"claimId": doc_ref.id}


def list_claims(claimant_uid: str) -> list[dict]:
    """Return all claims belonging to the given claimant, newest first."""
    db = get_db()
    docs = list(
        db.collection("claims")
        .where("claimantID", "==", claimant_uid)
        .stream()
    )
    results = []
    for d in docs:
        data = d.to_dict()
        # Convert Firestore Timestamp to ISO string for JSON serialisation
        st = data.get("submittingTime")
        if st and hasattr(st, "isoformat"):
            data["submittingTime"] = st.isoformat()
        results.append(data)

    # Sort in Python — avoids needing a composite Firestore index
    results.sort(key=lambda x: x.get("submittingTime", ""), reverse=True)
    return results


def get_claim(claim_id: str, claimant_uid: str) -> dict:
    """Fetch a single claim and verify it belongs to the requesting claimant."""
    db = get_db()
    snap = db.collection("claims").document(claim_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Claim not found")

    data = snap.to_dict()
    if data.get("claimantID") != claimant_uid:
        raise HTTPException(status_code=403, detail="Access denied")

    st = data.get("submittingTime")
    if st and hasattr(st, "isoformat"):
        data["submittingTime"] = st.isoformat()

    return data


def cancel_claim(claim_id: str, claimant_uid: str) -> dict:
    """Cancel a submitted claim. Only allowed when status == 'submitted'."""
    db = get_db()
    ref = db.collection("claims").document(claim_id)
    snap = ref.get()

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Claim not found")

    data = snap.to_dict()
    if data.get("claimantID") != claimant_uid:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.get("status") != "submitted":
        raise HTTPException(
            status_code=409,
            detail=f"Claim cannot be cancelled — current status is '{data.get('status')}'",
        )

    ref.update({"status": "cancelled"})
    print(f"[Claims] Cancelled claim={claim_id} by claimant={claimant_uid}", file=sys.stderr)
    return {"success": True}


def notify_claim_decision(claim_id: str) -> None:
    """
    Called after an examiner/admin sets a claim to 'approved' or 'rejected'.
    Looks up the claimant's email and sends a notification.
    """
    db = get_db()
    snap = db.collection("claims").document(claim_id).get()
    if not snap.exists:
        return

    claim = snap.to_dict()
    status = claim.get("status")
    if status not in ("approved", "rejected"):
        return

    claimant_uid = claim.get("claimantID", "")
    if not claimant_uid:
        return

    user_snap = db.collection("users").document(claimant_uid).get()
    if not user_snap.exists:
        return

    user = user_snap.to_dict()
    email = user.get("email", "")
    full_name = user.get("fullName", "Claimant")

    if not email:
        print(f"[Claims] No email for claimant={claimant_uid}, skipping notification", file=sys.stderr)
        return

    if status == "approved":
        send_claim_approved(email, full_name, claim_id)
    else:
        send_claim_rejected(email, full_name, claim_id)
