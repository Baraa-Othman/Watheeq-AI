import re
import uuid

from fastapi import HTTPException
from app.services.firestore_client import get_db
from app.services import audit_service
from app.utils import cloudinary_client

POLICIES_COLLECTION = "policies"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _sanitize_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", name)


def _public_id_from_url(url: str) -> str:
    """Extract Cloudinary public_id from a secure_url.
    e.g. https://res.cloudinary.com/{cloud}/raw/upload/v123/watheeq/policies/abc.pdf
    → watheeq/policies/abc.pdf
    """
    match = re.search(r"/upload/(?:v\d+/)?(.+)$", url)
    if not match:
        raise ValueError(f"Cannot extract public_id from URL: {url}")
    return match.group(1)


def check_policy_name_exists(name: str) -> bool:
    db = get_db()
    results = (
        db.collection(POLICIES_COLLECTION)
        .where("policy_name", "==", name)
        .limit(1)
        .get()
    )
    return len(results) > 0


def list_policies() -> list[dict]:
    db = get_db()
    docs = db.collection(POLICIES_COLLECTION).get()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


def create_policy(
    policy_name: str,
    file_bytes: bytes,
    file_name: str,
    file_size: int,
    uploaded_by: str,
) -> dict:
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit")

    if check_policy_name_exists(policy_name):
        raise HTTPException(
            status_code=409,
            detail=f"A policy named '{policy_name}' already exists",
        )

    short_id = str(uuid.uuid4())[:8]
    sanitized = _sanitize_filename(file_name)
    public_id = f"watheeq/policies/{short_id}_{sanitized}"

    try:
        upload_result = cloudinary_client.upload_file(
            file_bytes, public_id=public_id, resource_type="raw"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

    db = get_db()
    doc_ref = db.collection(POLICIES_COLLECTION).document()
    data = {
        "policy_name": policy_name,
        "file_url": upload_result["secure_url"],
    }
    doc_ref.set(data)

    actor_role, actor_name = audit_service._resolve_actor(uploaded_by)
    audit_service.record_action(
        action="policy_uploaded",
        actor_uid=uploaded_by,
        actor_role=actor_role or "admin",
        actor_name=actor_name,
        target_type="policy",
        target_id=doc_ref.id,
        metadata={"policy_name": policy_name, "file_size": file_size},
    )

    return {"id": doc_ref.id, **data}


def delete_policy(policy_id: str, deleted_by: str = "") -> dict:
    db = get_db()
    doc_ref = db.collection(POLICIES_COLLECTION).document(policy_id)
    snap = doc_ref.get()

    if not snap.exists:
        raise HTTPException(status_code=404, detail="Policy not found")

    data = snap.to_dict()

    try:
        public_id = _public_id_from_url(data["file_url"])
        cloudinary_client.delete_file(public_id, resource_type="raw")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete file from storage: {e}"
        )

    doc_ref.delete()

    actor_role, actor_name = audit_service._resolve_actor(deleted_by)
    audit_service.record_action(
        action="policy_deleted",
        actor_uid=deleted_by,
        actor_role=actor_role or "admin",
        actor_name=actor_name,
        target_type="policy",
        target_id=policy_id,
        metadata={"policy_name": data.get("policy_name", "")},
    )
    return {"message": "Policy deleted successfully"}
