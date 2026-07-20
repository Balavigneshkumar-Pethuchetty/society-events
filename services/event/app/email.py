import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


def _build_message(subject: str, message: str) -> MIMEMultipart:
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.gmail_smtp_user}>"
    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #6366f1;">{html.escape(subject)}</h2>
      <p style="white-space: pre-line;">{html.escape(message)}</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">{html.escape(settings.society_name)}</p>
    </div>
    """
    msg.attach(MIMEText(body, "html"))
    return msg


def send_notification_emails_sequential(recipients: list[tuple[str, str]], message: str) -> list[tuple[str, str]]:
    """recipients: list of (email, subject). Sends one at a time over a single
    SMTP connection reused for the whole batch, instead of opening/logging in
    fresh per recipient — a broadcast to hundreds of users doing that at once
    (or even via a thread pool) is what gets accounts rate-limited/blocked by
    Gmail. Returns [(email, error)] for any recipient that failed, so the
    caller (running this in a thread) can log them afterward without needing
    exception handling inside the thread itself."""
    if not settings.gmail_smtp_user or not settings.gmail_app_password:
        return []

    failures: list[tuple[str, str]] = []
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        server.login(settings.gmail_smtp_user, settings.gmail_app_password)
        for to_email, subject in recipients:
            try:
                msg = _build_message(subject, message)
                msg["To"] = to_email
                server.sendmail(settings.gmail_smtp_user, [to_email], msg.as_string())
            except Exception as exc:
                failures.append((to_email, str(exc)[:200]))
    return failures
