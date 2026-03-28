import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


def send_email(to: str, subject: str, body_html: str) -> bool:
    """
    Send an email via Gmail SMTP.
    Returns True on success, False on failure (never raises).
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[Email] SMTP not configured — skipping email to {to!r}", file=sys.stderr)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
        msg["To"] = to
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(msg["From"], [to], msg.as_string())

        print(f"[Email] Sent to {to!r} subject={subject!r}", file=sys.stderr)
        return True

    except Exception as e:
        print(f"[Email] Failed to send to {to!r}: {e}", file=sys.stderr)
        return False


def send_examiner_approved(to: str, full_name: str) -> bool:
    subject = "Your Watheeq AI registration has been approved"
    body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#0004E8;margin-bottom:8px;">Registration Approved</h2>
      <p style="color:#333;">Hello {full_name},</p>
      <p style="color:#333;">
        Your Watheeq AI registration as a Claims Examiner has been approved.
        You can now log in using your registered phone number.
      </p>
      <a href="{settings.APP_URL}/login"
         style="display:inline-block;margin-top:16px;padding:12px 24px;
                background:#0004E8;color:#fff;text-decoration:none;
                border-radius:8px;font-weight:600;">
        Log In Now
      </a>
      <p style="margin-top:24px;color:#888;font-size:13px;">
        If you have any questions, contact our support team.
      </p>
    </div>
    """
    return send_email(to, subject, body)


def send_examiner_rejected(to: str, full_name: str) -> bool:
    subject = "Update on your Watheeq AI registration request"
    body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#050508;margin-bottom:8px;">Registration Update</h2>
      <p style="color:#333;">Hello {full_name},</p>
      <p style="color:#333;">
        Thank you for your interest in joining Watheeq AI as a Claims Examiner.
        After reviewing your registration request, we are unable to approve it at this time.
      </p>
      <p style="color:#333;">
        If you believe this is an error or would like more information,
        please contact our support team.
      </p>
      <p style="margin-top:24px;color:#888;font-size:13px;">Watheeq AI Team</p>
    </div>
    """
    return send_email(to, subject, body)


def send_claim_approved(to: str, full_name: str, claim_id: str) -> bool:
    subject = "Your Watheeq AI insurance claim has been approved"
    body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#0004E8;margin-bottom:8px;">Claim Approved ✓</h2>
      <p style="color:#333;">Hello {full_name},</p>
      <p style="color:#333;">
        Great news! Your insurance claim has been <strong>approved</strong>.
      </p>
      <p style="color:#333;">Claim Reference: <strong>{claim_id}</strong></p>
      <a href="{settings.APP_URL}/claimant/claims/{claim_id}"
         style="display:inline-block;margin-top:16px;padding:12px 24px;
                background:#0004E8;color:#fff;text-decoration:none;
                border-radius:8px;font-weight:600;">
        View Claim
      </a>
      <p style="margin-top:24px;color:#888;font-size:13px;">Watheeq AI Team</p>
    </div>
    """
    return send_email(to, subject, body)


def send_claim_rejected(to: str, full_name: str, claim_id: str) -> bool:
    subject = "Update on your Watheeq AI insurance claim"
    body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#050508;margin-bottom:8px;">Claim Decision</h2>
      <p style="color:#333;">Hello {full_name},</p>
      <p style="color:#333;">
        After thorough review, your insurance claim has been <strong>rejected</strong>.
      </p>
      <p style="color:#333;">Claim Reference: <strong>{claim_id}</strong></p>
      <a href="{settings.APP_URL}/claimant/claims/{claim_id}"
         style="display:inline-block;margin-top:16px;padding:12px 24px;
                background:#050508;color:#fff;text-decoration:none;
                border-radius:8px;font-weight:600;">
        View Claim Details
      </a>
      <p style="margin-top:16px;color:#555;font-size:14px;">
        If you believe this decision is incorrect, please contact our support team.
      </p>
      <p style="margin-top:24px;color:#888;font-size:13px;">Watheeq AI Team</p>
    </div>
    """
    return send_email(to, subject, body)
