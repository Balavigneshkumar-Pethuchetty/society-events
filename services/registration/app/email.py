import html
import io
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import qrcode

from app.config import settings


def _generate_qr_png(token: str) -> bytes:
    img = qrcode.make(token)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def send_complimentary_ticket_email(
    to_email: str,
    guest_name: str,
    event_title: str,
    event_start: str,
    event_venue: str,
    ticket_count: int,
    qr_token: str,
    maps_url: str,
) -> None:
    if not settings.gmail_smtp_user or not settings.gmail_app_password:
        raise RuntimeError("SMTP is not configured on the server")

    qr_png = _generate_qr_png(qr_token)

    guest_name    = html.escape(guest_name)
    event_title   = html.escape(event_title)
    event_start   = html.escape(event_start)
    event_venue   = html.escape(event_venue)
    maps_url_attr = html.escape(maps_url, quote=True)

    msg = MIMEMultipart("related")
    msg["Subject"] = f"Your complimentary ticket — {event_title}"
    msg["From"] = f"{settings.smtp_from_name} <{settings.gmail_smtp_user}>"
    msg["To"] = to_email

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #6366f1;">You're invited!</h2>
      <p>Hi {guest_name},</p>
      <p>You've been issued a complimentary ticket to:</p>
      <p style="font-size: 18px; font-weight: bold;">{event_title}</p>
      <p>{event_start} &middot; {event_venue}</p>
      <p>{ticket_count} ticket{'s' if ticket_count != 1 else ''}</p>
      <p>
        <a href="{maps_url_attr}" style="display:inline-block; padding:8px 16px; background:#6366f1; color:#fff; text-decoration:none; border-radius:6px; font-size:14px;">
          Get Directions to {event_venue}
        </a>
      </p>
      <p>Show this QR code at the gate for entry:</p>
      <img src="cid:ticket_qr" alt="Ticket QR" style="width:220px;height:220px;" />
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">{html.escape(settings.society_name)}</p>
    </div>
    """
    msg.attach(MIMEText(body, "html"))

    qr_part = MIMEImage(qr_png, _subtype="png")
    qr_part.add_header("Content-ID", "<ticket_qr>")
    qr_part.add_header("Content-Disposition", "inline", filename="ticket_qr.png")
    msg.attach(qr_part)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        server.login(settings.gmail_smtp_user, settings.gmail_app_password)
        server.sendmail(settings.gmail_smtp_user, [to_email], msg.as_string())
