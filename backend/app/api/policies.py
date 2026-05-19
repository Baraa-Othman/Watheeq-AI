import re
import time
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.services import policy_service
from app.utils import cloudinary_client

# Two routers: admin-protected operations and public (any authenticated user)
admin_router = APIRouter()
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Auth dependencies ──────────────────────────────────────────────────────────

async def require_admin(authorization: str = Header(..., alias="Authorization")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = authorization[7:]
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    db = get_db()
    snap = db.collection("users").document(decoded["uid"]).get()
    if not snap.exists or snap.to_dict().get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return {"uid": decoded["uid"], **snap.to_dict()}


async def require_authenticated(authorization: str = Header(..., alias="Authorization")) -> dict:
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

    return {"uid": decoded["uid"], **snap.to_dict()}


# ── Admin endpoints ────────────────────────────────────────────────────────────

@admin_router.get("/policies/check-name", summary="Check if a policy name already exists")
def check_policy_name(name: str, admin: dict = Depends(require_admin)):
    exists = policy_service.check_policy_name_exists(name)
    return {"exists": exists}


@admin_router.get("/policies", summary="List all policies (admin view)")
def list_policies_admin(admin: dict = Depends(require_admin)):
    return policy_service.list_policies()


@admin_router.post("/policies", summary="Upload a new policy plan PDF")
async def create_policy(
    policy_name: str = Form(...),
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    if file.content_type and "pdf" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 10 MB limit")

    return policy_service.create_policy(
        policy_name=policy_name,
        file_bytes=file_bytes,
        file_name=file.filename,
        file_size=file_size,
        uploaded_by=admin["uid"],
    )


@admin_router.delete("/policies/{policy_id}", summary="Delete a policy plan")
def delete_policy(policy_id: str, admin: dict = Depends(require_admin)):
    return policy_service.delete_policy(policy_id, deleted_by=admin["uid"])


# ── Public endpoints (any authenticated user) ─────────────────────────────────

@router.get("/policies", summary="List all policies (any authenticated user)")
def list_policies_public(user: dict = Depends(require_authenticated)):
    return policy_service.list_policies()


@router.get("/policies/{policy_id}/download", summary="Stream policy PDF through backend")
async def download_policy(policy_id: str, user: dict = Depends(require_authenticated)):
    db = get_db()
    snap = db.collection("policies").document(policy_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Policy not found")

    data = snap.to_dict()
    file_url = data.get("file_url", "")
    policy_name = data.get("policy_name", "policy")

    # Generate a private download URL via Cloudinary API (bypasses delivery restrictions)
    match = re.search(r"/upload/(?:v\d+/)?(.+)$", file_url)
    if not match:
        raise HTTPException(status_code=500, detail="Invalid file URL stored")

    public_id = match.group(1)

    # Try direct CDN URL first, fall back to signed private URL
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(file_url)
        if resp.status_code != 200:
            private_url = cloudinary_client.get_private_download_url(public_id)
            resp = await client.get(private_url)
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Cloudinary {resp.status_code}: {resp.text[:300]}"
            )

    safe_name = policy_name.replace('"', "")
    return StreamingResponse(
        iter([resp.content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )
