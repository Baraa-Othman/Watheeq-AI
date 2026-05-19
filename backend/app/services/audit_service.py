import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.services.firestore_client import get_db


AUDIT_COLLECTION = "audit_logs"

ACTION_CATEGORIES = {
    # Auth / accounts
    "examiner_request_submitted": "account",
    "examiner_request_approved": "account",
    "examiner_request_rejected": "account",
    "user_signup": "account",
    # Policies
    "policy_uploaded": "policy",
    "policy_deleted": "policy",
    # Claims (claimant)
    "claim_submitted": "claim",
    "claim_cancelled": "claim",
    # Claims (examiner)
    "claim_picked": "claim",
    "claim_approved": "claim",
    "claim_rejected": "claim",
}


def record_action(
    action: str,
    actor_uid: str = "",
    actor_role: str = "",
    actor_name: str = "",
    target_type: str = "",
    target_id: str = "",
    metadata: Optional[dict] = None,
) -> None:
    """
    Persist an audit event to Firestore.

    Failures are swallowed (logged to stderr) so audit issues never break the
    user-facing operation that produced them.
    """
    try:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc_id = uuid.uuid4().hex
        db.collection(AUDIT_COLLECTION).document(doc_id).set({
            "id": doc_id,
            "timestamp": now.isoformat(),
            "action": action,
            "category": ACTION_CATEGORIES.get(action, "other"),
            "actorUid": actor_uid or "",
            "actorRole": actor_role or "",
            "actorName": actor_name or "",
            "targetType": target_type or "",
            "targetId": target_id or "",
            "metadata": metadata or {},
        })
    except Exception as e:
        print(f"[Audit] Failed to record action={action}: {e}", file=sys.stderr)


def _resolve_actor(uid: str) -> tuple[str, str]:
    """Look up (role, fullName) for a uid from the users collection."""
    if not uid:
        return ("", "")
    try:
        snap = get_db().collection("users").document(uid).get()
        if snap.exists:
            u = snap.to_dict() or {}
            return (u.get("role", ""), u.get("fullName", ""))
    except Exception:
        pass
    return ("", "")


def list_audit_logs(
    actor_role: Optional[str] = None,
    action: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 200,
) -> list[dict]:
    """
    Return audit log entries, newest first. All filters are optional.

    `date_from` and `date_to` are inclusive ISO-8601 strings (UTC). Filtering
    is done in Python after pulling the collection to avoid needing composite
    Firestore indexes for an arbitrary combination of filters.
    """
    db = get_db()
    docs = list(db.collection(AUDIT_COLLECTION).stream())

    results: list[dict] = []
    for d in docs:
        row = d.to_dict() or {}
        if actor_role and row.get("actorRole") != actor_role:
            continue
        if action and row.get("action") != action:
            continue
        if category and row.get("category") != category:
            continue
        ts = row.get("timestamp", "")
        if date_from and ts < date_from:
            continue
        if date_to and ts > date_to:
            continue
        results.append(row)

    results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    if limit and limit > 0:
        results = results[:limit]
    return results
