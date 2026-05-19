import sys
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from firebase_admin import auth as firebase_auth
from app.services.firestore_client import get_db
from app.services import audit_service
from app.utils.email import send_examiner_approved, send_examiner_rejected
from app.services.auth_service import _phone_to_uid


def parse_datetime(val) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val.astimezone(timezone.utc)
    if hasattr(val, "to_datetime"):
        try:
            dt = val.to_datetime()
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass
    if isinstance(val, str):
        try:
            s = val
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass
    if hasattr(val, "year") and hasattr(val, "month") and hasattr(val, "day"):
        try:
            dt = datetime(val.year, val.month, val.day,
                          getattr(val, "hour", 0), getattr(val, "minute", 0), getattr(val, "second", 0),
                          getattr(val, "microsecond", 0), tzinfo=getattr(val, "tzinfo", timezone.utc))
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass
    return None


CLAIM_STATUSES = ("submitted", "under review", "approved", "rejected", "cancelled")


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

    actor_role, actor_name = audit_service._resolve_actor(admin_uid)
    audit_service.record_action(
        action="examiner_request_approved",
        actor_uid=admin_uid,
        actor_role=actor_role or "admin",
        actor_name=actor_name,
        target_type="examiner_request",
        target_id=request_id,
        metadata={
            "examiner_uid": uid,
            "examiner_email": req.get("email", ""),
            "examiner_name": req.get("full_name", ""),
        },
    )

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

    actor_role, actor_name = audit_service._resolve_actor(admin_uid)
    audit_service.record_action(
        action="examiner_request_rejected",
        actor_uid=admin_uid,
        actor_role=actor_role or "admin",
        actor_name=actor_name,
        target_type="examiner_request",
        target_id=request_id,
        metadata={
            "examiner_email": req.get("email", ""),
            "examiner_name": req.get("full_name", ""),
        },
    )

    # Send rejection email (non-fatal)
    send_examiner_rejected(req["email"], req["full_name"])

    return {"success": True}


# ── Statistics ────────────────────────────────────────────────────────────────

def get_claims_stats() -> dict:
    """Aggregate counts of claims grouped by status."""
    db = get_db()
    docs = list(db.collection("claims").stream())

    by_status = {s: 0 for s in CLAIM_STATUSES}
    for d in docs:
        status = (d.to_dict() or {}).get("status", "")
        if status in by_status:
            by_status[status] += 1
        else:
            by_status.setdefault("unknown", 0)
            by_status["unknown"] += 1

    return {
        "total": len(docs),
        "byStatus": by_status,
    }


def get_examiner_performance() -> list[dict]:
    """
    Return per-examiner performance metrics.

    Headline metric is `avgHandlingSeconds`: the average time, in seconds,
    between when an examiner picked a claim (`pickedTime`) and when they
    closed it (`closedTime`). Lower is better. Claims missing either
    timestamp (legacy data) are skipped from the average.
    """
    db = get_db()

    def _default_bucket(uid: str, full_name: str = "", email: str = "", status: str = "") -> dict:
        return {
            "examinerId": uid,
            "fullName": full_name,
            "email": email,
            "status": status,
            "totalAssigned": 0,
            "approved": 0,
            "rejected": 0,
            "underReview": 0,
            "approvalRate": 0.0,
            "avgHandlingSeconds": None,
            "handledCount": 0,
            "_durations": [],
        }

    # 1. Load every examiner
    examiner_docs = list(
        db.collection("users").where("role", "==", "examiner").stream()
    )
    examiners: dict[str, dict] = {}
    for snap in examiner_docs:
        u = snap.to_dict() or {}
        uid = u.get("uid") or snap.id
        examiners[uid] = _default_bucket(
            uid,
            full_name=u.get("fullName", ""),
            email=u.get("email", ""),
            status=u.get("status", ""),
        )

    # 2. Scan claims that have a non-empty examinerID
    claim_docs = list(db.collection("claims").stream())
    for snap in claim_docs:
        c = snap.to_dict() or {}
        eid = c.get("examinerID") or ""
        if not eid:
            continue
        bucket = examiners.get(eid)
        if bucket is None:
            # examinerID points to a user that is not an active examiner
            # (e.g. corrupted data, deleted account). Skip — don't surface them.
            continue

        bucket["totalAssigned"] += 1
        status = c.get("status", "")
        if status == "approved":
            bucket["approved"] += 1
        elif status == "rejected":
            bucket["rejected"] += 1
        elif status == "under review":
            bucket["underReview"] += 1

        # Handling time: (closedTime - pickedTime) for closed claims with both timestamps
        if status in ("approved", "rejected"):
            picked = parse_datetime(c.get("pickedTime"))
            closed = parse_datetime(c.get("closedTime"))
            if picked is not None and closed is not None:
                try:
                    delta = (closed - picked).total_seconds()
                except Exception:
                    delta = None
                if delta is not None and delta >= 0:
                    bucket["_durations"].append(delta)

    # 3. Finalize derived metrics
    for b in examiners.values():
        finalized = b["approved"] + b["rejected"]
        b["approvalRate"] = (b["approved"] / finalized) if finalized > 0 else 0.0
        durations = b.pop("_durations")
        if durations:
            b["avgHandlingSeconds"] = sum(durations) / len(durations)
            b["handledCount"] = len(durations)
        else:
            b["avgHandlingSeconds"] = None
            b["handledCount"] = 0

    # Sort: fastest examiners first; those without a measured average go last
    results = list(examiners.values())
    results.sort(
        key=lambda x: (
            x["avgHandlingSeconds"] is None,
            x["avgHandlingSeconds"] if x["avgHandlingSeconds"] is not None else 0,
        )
    )
    return results


def _quarter_range(year: int, quarter: int) -> tuple[datetime, datetime]:
    """Return [start, end) UTC datetimes for the given quarter (end is exclusive)."""
    if quarter not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="quarter must be 1..4")
    start_month = {1: 1, 2: 4, 3: 7, 4: 10}[quarter]
    start = datetime(year, start_month, 1, tzinfo=timezone.utc)
    end_month = start_month + 3
    end_year = year
    if end_month > 12:
        end_month -= 12
        end_year += 1
    end = datetime(end_year, end_month, 1, tzinfo=timezone.utc)
    return start, end


def get_claims_volume(year: int, quarter: int) -> dict:
    """
    Aggregate claim volume by quarter (for the given year) and by day (within
    the selected quarter).

    Returns:
      {
        "year": 2026,
        "quarter": 2,
        "quarters": [{"quarter": 1, "count": …}, …],   # totals for each Q of `year`
        "buckets": [{"date": "2026-04-01", "count": …}, …],  # daily counts in the selected quarter
        "totalInQuarter": int,
        "availableYears": [2024, 2025, 2026]            # years that contain at least one claim
      }
    """
    if year < 1970 or year > 9999:
        raise HTTPException(status_code=400, detail="invalid year")
    q_start, q_end = _quarter_range(year, quarter)

    db = get_db()
    docs = list(db.collection("claims").stream())

    quarter_totals = {1: 0, 2: 0, 3: 0, 4: 0}
    daily_counts: dict[str, int] = {}
    years_seen: set[int] = set()

    for snap in docs:
        c = snap.to_dict() or {}
        st = parse_datetime(c.get("submittingTime"))
        if st is None:
            continue
        years_seen.add(st.year)
        if st.year == year:
            q = (st.month - 1) // 3 + 1
            quarter_totals[q] += 1
        if q_start <= st < q_end:
            key = st.strftime("%Y-%m-%d")
            daily_counts[key] = daily_counts.get(key, 0) + 1

    # Build dense daily buckets (fill in zero days) so the chart x-axis is continuous
    buckets = []
    cursor = q_start
    while cursor < q_end:
        key = cursor.strftime("%Y-%m-%d")
        buckets.append({"date": key, "count": daily_counts.get(key, 0)})
        cursor += timedelta(days=1)

    # Always include the requested year (and current year) in availableYears
    now = datetime.now(timezone.utc)
    years_seen.update({year, now.year})
    available_years = sorted(years_seen, reverse=True)

    return {
        "year": year,
        "quarter": quarter,
        "quarters": [{"quarter": q, "count": quarter_totals[q]} for q in (1, 2, 3, 4)],
        "buckets": buckets,
        "totalInQuarter": sum(daily_counts.values()),
        "availableYears": available_years,
    }
