import re
import sys
import httpx
from datetime import datetime, timezone
from urllib.parse import urlparse
from fastapi import HTTPException
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.core.config import settings


def _authentica_base() -> str:
    """Strip any path from the URL — always use /api/v2/ endpoints."""
    parsed = urlparse(settings.AUTHINTICA_API_URL)
    return f"{parsed.scheme}://{parsed.netloc}"


def _phone_to_uid(phone: str) -> str:
    """Stable UID from phone number: '+9665XXXXXXXX' → 'phone_9665XXXXXXXX'."""
    return "phone_" + re.sub(r"\D", "", phone)


async def send_otp(phone: str, context: str = "login", national_id: str | None = None, email: str | None = None) -> dict:
    if not re.match(r"^\+9665\d{8}$", phone):
        raise HTTPException(
            status_code=400,
            detail="Valid Saudi phone number required (+9665XXXXXXXX)",
        )
    if not settings.AUTHINTICA_API_KEY:
        raise HTTPException(status_code=500, detail="OTP service not configured")

    uid = _phone_to_uid(phone)
    db = get_db()
    user_exists = db.collection("users").document(uid).get().exists

    if context == "login" and not user_exists:
        # Check if there's a pending/rejected examiner request for this phone
        req_snaps = list(db.collection("examiner_requests").where("phone", "==", phone).limit(1).stream())
        if req_snaps:
            req_data = req_snaps[0].to_dict()
            status = req_data.get("status")
            if status == "pending":
                raise HTTPException(status_code=403, detail="Your registration request is still pending approval.")
            if status == "rejected":
                raise HTTPException(status_code=403, detail="Your registration request has been rejected. Please contact support.")
        raise HTTPException(
            status_code=404,
            detail="No account found for this number. Please register first.",
        )

    if context == "register" and user_exists:
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this number. Please login.",
        )

    if context == "register":
        if national_id:
            dupes = list(db.collection("users").where("nationalId", "==", national_id).limit(1).stream())
            if dupes:
                raise HTTPException(status_code=409, detail="This National ID or Iqama is already registered.")
        if email:
            dupes = list(db.collection("users").where("email", "==", email).limit(1).stream())
            if dupes:
                raise HTTPException(status_code=409, detail="This email address is already registered.")

    if context == "examiner_register":
        # Block if phone already has an account
        if user_exists:
            raise HTTPException(status_code=409, detail="An account already exists for this number. Please login.")
        # Block if there's already a pending or approved request
        existing = list(
            db.collection("examiner_requests")
            .where("phone", "==", phone)
            .where("status", "in", ["pending", "approved"])
            .limit(1).stream()
        )
        if existing:
            raise HTTPException(status_code=409, detail="A registration request already exists for this number.")
        # Check NID across users + examiner_requests
        if national_id:
            dupes = list(db.collection("users").where("nationalId", "==", national_id).limit(1).stream())
            if not dupes:
                dupes = list(
                    db.collection("examiner_requests")
                    .where("national_id", "==", national_id)
                    .where("status", "in", ["pending", "approved"])
                    .limit(1).stream()
                )
            if dupes:
                raise HTTPException(status_code=409, detail="This National ID or Iqama is already in use.")
        # Check email across users + examiner_requests
        if email:
            dupes = list(db.collection("users").where("email", "==", email).limit(1).stream())
            if not dupes:
                dupes = list(
                    db.collection("examiner_requests")
                    .where("email", "==", email)
                    .where("status", "in", ["pending", "approved"])
                    .limit(1).stream()
                )
            if dupes:
                raise HTTPException(status_code=409, detail="This email address is already in use.")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{_authentica_base()}/api/v2/send-otp",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Authorization": settings.AUTHINTICA_API_KEY,
            },
            json={"method": "sms", "phone": phone},
            timeout=10.0,
        )

    print(f"[Authentica send-otp] status={res.status_code} body={res.text!r}", file=sys.stderr)

    if not res.is_success:
        try:
            msg = res.json().get("message") or res.text
        except Exception:
            msg = res.text
        raise HTTPException(status_code=res.status_code, detail=msg or "Failed to send OTP")

    return {"success": True}


async def verify_otp(phone: str, otp: str) -> dict:
    if not phone or not otp:
        raise HTTPException(status_code=400, detail="Phone and OTP required")
    if not settings.AUTHINTICA_API_KEY:
        raise HTTPException(status_code=500, detail="OTP service not configured")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{_authentica_base()}/api/v2/verify-otp",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Authorization": settings.AUTHINTICA_API_KEY,
            },
            json={"phone": phone, "otp": otp},
            timeout=10.0,
        )

    print(f"[Authentica verify-otp] status={res.status_code} body={res.text!r}", file=sys.stderr)

    try:
        data = res.json()
    except Exception:
        data = {}

    if not res.is_success:
        detail = (
            data.get("message") or data.get("error")
            or f"Authentica {res.status_code}: {res.text[:200]}"
        )
        raise HTTPException(status_code=401, detail=detail)

    # OTP verified — check Firestore (no Firebase Auth API call needed)
    uid = _phone_to_uid(phone)
    print(f"[verify_otp] phone={phone!r} → uid={uid!r}", file=sys.stderr)
    db = get_db()
    try:
        profile_snap = db.collection("users").document(uid).get()
        print(f"[verify_otp] Firestore read success: exists={profile_snap.exists}", file=sys.stderr)
    except Exception as e:
        print(f"[verify_otp] Firestore read FAILED: {e}", file=sys.stderr)
        raise

    if not profile_snap.exists:
        print(f"[Firestore] new user uid={uid}", file=sys.stderr)
        return {"verified": True, "is_new_user": True}

    profile = profile_snap.to_dict()
    print(f"[Firestore] existing user uid={uid} role={profile.get('role')} status={profile.get('status')}", file=sys.stderr)

    if profile.get("role") == "examiner" and profile.get("status") == "pending":
        raise HTTPException(status_code=403, detail="Your examiner account is pending admin approval")

    if profile.get("status") == "rejected":
        raise HTTPException(status_code=403, detail="Your account has been rejected. Contact support.")

    # create_custom_token is a LOCAL operation — signs a JWT with the service account key.
    # It does NOT call any Firebase Auth APIs, so it works regardless of auth provider config.
    raw_token = firebase_auth.create_custom_token(uid, {"role": profile.get("role")})
    token_str = raw_token.decode() if isinstance(raw_token, bytes) else raw_token

    return {"verified": True, "token": token_str, "role": profile.get("role")}


async def signup(
    phone: str,
    full_name: str,
    role: str,
    national_id: str | None = None,
    email: str | None = None,
    hospital_name: str | None = None,
    organization: str | None = None,
) -> dict:
    if not phone or not full_name or not role:
        raise HTTPException(status_code=400, detail="Phone, full name, and role are required")
    if role not in ("claimant", "examiner"):
        raise HTTPException(status_code=400, detail="Invalid role")

    uid = _phone_to_uid(phone)
    print(f"[signup] phone={phone!r} → uid={uid!r}", file=sys.stderr)
    db = get_db()

    # Check for duplicate phone
    if db.collection("users").document(uid).get().exists:
        raise HTTPException(status_code=409, detail="Account already exists. Please login.")

    # Check for duplicate National ID / Iqama
    if national_id:
        dupes = list(db.collection("users").where("nationalId", "==", national_id).limit(1).stream())
        if dupes:
            raise HTTPException(status_code=409, detail="This National ID or Iqama is already registered.")

    # Check for duplicate email
    if email:
        dupes = list(db.collection("users").where("email", "==", email).limit(1).stream())
        if dupes:
            raise HTTPException(status_code=409, detail="This email address is already registered.")

    profile: dict = {
        "uid": uid,
        "phone": phone,
        "fullName": full_name,
        "role": role,
        "status": "pending" if role == "examiner" else "active",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if national_id:
        profile["nationalId"] = national_id
    if email:
        profile["email"] = email
    if hospital_name:
        profile["hospitalName"] = hospital_name
    if organization:
        profile["organization"] = organization

    db.collection("users").document(uid).set(profile)
    print(f"[Firestore] created user uid={uid} role={role}", file=sys.stderr)

    if role == "claimant":
        raw_token = firebase_auth.create_custom_token(uid, {"role": "claimant"})
        token_str = raw_token.decode() if isinstance(raw_token, bytes) else raw_token
        return {"success": True, "token": token_str, "role": "claimant"}

    return {
        "success": True,
        "message": "Registration submitted. Awaiting admin approval.",
        "status": "pending",
    }


async def register_examiner_request(
    phone: str,
    full_name: str,
    national_id: str,
    email: str,
) -> dict:
    """Create a pending examiner registration request. No user account is created yet."""
    if not phone or not full_name or not national_id or not email:
        raise HTTPException(status_code=400, detail="All fields are required")

    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    doc_ref = db.collection("examiner_requests").document()
    request_data = {
        "id": doc_ref.id,
        "phone": phone,
        "full_name": full_name,
        "national_id": national_id,
        "email": email,
        "status": "pending",
        "created_at": now,
        "reviewed_at": None,
        "reviewed_by": None,
    }
    doc_ref.set(request_data)
    print(f"[Firestore] examiner_request created id={doc_ref.id} phone={phone!r}", file=sys.stderr)

    return {
        "success": True,
        "message": "Your registration request has been submitted and is pending approval. You will receive an email once your request is reviewed.",
    }


async def get_current_user(id_token: str) -> dict:
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        uid: str = decoded["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    db = get_db()
    profile_snap = db.collection("users").document(uid).get()
    if not profile_snap.exists:
        raise HTTPException(status_code=404, detail="User profile not found")

    return profile_snap.to_dict()
