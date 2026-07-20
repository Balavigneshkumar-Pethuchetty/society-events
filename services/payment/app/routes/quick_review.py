"""Token-authenticated, no-login quick approve/reject page for the "payment
verification requested" email/Telegram notification (see confirm_payment_details in
payments.py, which mints the token and sends the links).

The token is a Fernet-encrypted {txn_ref, recipient_id} payload (app.crypto) — anyone
holding the emailed/Telegrammed link can act, same trust model as a password-reset
link. GET only ever renders a page — it never mutates state, since email clients and
link-preview/security scanners routinely prefetch GET URLs, and a side-effecting GET
would let a scanner silently approve or reject a payment. The verdict is applied only
on POST, once a human reviews the details and clicks a button.
"""
import html as html_lib

from fastapi import APIRouter, Form
from fastapi.responses import HTMLResponse

from app.crypto import read_action_token
from app.database import get_pool
from app.notifications import notify_payment_verdict, send_channels
from app.routes.payments import apply_payment_verdict

router = APIRouter()

_TOKEN_TTL_SECONDS = 7 * 24 * 3600  # quick-review links stay valid for a week

_TXN_DETAIL_QUERY = """
    SELECT pt.status, pt.amount, pt.currency, pt.registration_id::text AS registration_id,
           pt.parsed_upi_ref, pt.parsed_bank, pt.parsed_timestamp, pt.screenshot_path,
           e.title AS event_title,
           u.name AS user_name, u.phone AS user_phone, u.email AS user_email,
           COALESCE(
               (SELECT sn.name FROM user_units uu JOIN structure_nodes sn ON sn.id = uu.node_id
                WHERE uu.user_id = u.id LIMIT 1),
               (SELECT a.block || ' – ' || a.unit_number FROM user_apartments ua
                JOIN apartment a ON a.id = ua.apartment_id WHERE ua.user_id = u.id LIMIT 1)
           ) AS unit_label
    FROM payment_transaction pt
    JOIN event e ON e.id = pt.event_id
    JOIN users u ON u.id = pt.user_id
    WHERE pt.txn_ref = $1
"""

_ITEMS_QUERY = """
    SELECT tt.name, ri.quantity, ri.unit_price FROM registration_item ri
    JOIN ticket_type tt ON tt.id = ri.ticket_type_id
    WHERE ri.registration_id = $1::uuid
"""


def _page(title: str, body_html: str, status_code: int = 200) -> HTMLResponse:
    doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html_lib.escape(title)}</title>
<style>
  body {{ font-family: Arial, sans-serif; background:#f3f4f6; margin:0; padding:24px; color:#111827; }}
  .card {{ max-width:560px; margin:0 auto; background:#fff; border-radius:10px; padding:24px 28px; box-shadow:0 1px 4px rgba(0,0,0,.08); }}
  h1 {{ font-size:20px; color:#6366f1; margin-top:0; }}
  dl {{ margin:12px 0; overflow:hidden; }}
  dt {{ font-weight:bold; float:left; width:110px; clear:left; color:#374151; }}
  dd {{ margin:0 0 6px 120px; }}
  .tickets {{ white-space:pre-line; background:#f9fafb; border-radius:6px; padding:10px 14px; margin:12px 0; }}
  textarea {{ width:100%; min-height:70px; font-family:inherit; font-size:14px; padding:8px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box; }}
  .btns {{ margin-top:16px; }}
  button {{ font-size:15px; font-weight:bold; padding:10px 22px; border:none; border-radius:6px; color:#fff; cursor:pointer; margin-right:10px; }}
  .approve {{ background:#16a34a; }}
  .reject {{ background:#dc2626; }}
  img.proof {{ max-width:100%; border-radius:6px; margin-top:8px; border:1px solid #e5e7eb; }}
</style></head>
<body><div class="card">
<h1>{html_lib.escape(title)}</h1>
{body_html}
</div></body></html>"""
    return HTMLResponse(doc, status_code=status_code)


def _render_review_form(row, items, preselect: str) -> HTMLResponse:
    ticket_lines = "\n".join(
        f"• {it['name']} × {it['quantity']} @ {row['currency']} {float(it['unit_price']):.2f}"
        for it in items
    ) or "• (ticket details unavailable)"
    screenshot_html = (
        f'<a href="/api/payments/uploads/{html_lib.escape(row["screenshot_path"])}" target="_blank" rel="noopener">'
        f'<img class="proof" src="/api/payments/uploads/{html_lib.escape(row["screenshot_path"])}"></a>'
        if row["screenshot_path"] else "<p>No screenshot on file.</p>"
    )
    body = f"""
    <dl>
      <dt>Resident</dt><dd>{html_lib.escape(row['user_name'] or 'N/A')}</dd>
      <dt>Unit</dt><dd>{html_lib.escape(row['unit_label'] or 'N/A')}</dd>
      <dt>Phone</dt><dd>{html_lib.escape(row['user_phone'] or 'N/A')}</dd>
      <dt>Email</dt><dd>{html_lib.escape(row['user_email'] or 'N/A')}</dd>
      <dt>Event</dt><dd>{html_lib.escape(row['event_title'] or 'N/A')}</dd>
      <dt>Amount</dt><dd>{html_lib.escape(row['currency'])} {float(row['amount']):.2f}</dd>
      <dt>Status</dt><dd>Unpaid (pending verification)</dd>
      <dt>UPI Ref</dt><dd>{html_lib.escape(row['parsed_upi_ref'] or 'N/A')}</dd>
      <dt>Bank</dt><dd>{html_lib.escape(row['parsed_bank'] or 'N/A')}</dd>
      <dt>Paid at</dt><dd>{html_lib.escape(row['parsed_timestamp'] or 'N/A')}</dd>
    </dl>
    <div class="tickets">{html_lib.escape(ticket_lines)}</div>
    {screenshot_html}
    <form method="post">
      <label for="remark"><b>Remark (optional — shown to the resident)</b></label><br>
      <textarea id="remark" name="remark" placeholder="Add a comment for the resident..."></textarea>
      <div class="btns">
        <button class="approve" type="submit" name="verdict" value="approve" {"autofocus" if preselect == "approve" else ""}>✅ Approve</button>
        <button class="reject" type="submit" name="verdict" value="reject" {"autofocus" if preselect == "reject" else ""}>❌ Reject</button>
      </div>
    </form>
    """
    return _page(f"Review payment — {row['event_title'] or 'event'}", body)


@router.get("/{token}", response_class=HTMLResponse,
            summary="No-login quick-review page for a payment-verification link")
async def quick_review_page(token: str, verdict: str = ""):
    payload = read_action_token(token, _TOKEN_TTL_SECONDS)
    if not payload or not payload.get("txn_ref"):
        return _page("Link expired", "<p>This review link is invalid or has expired.</p>", status_code=400)

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_TXN_DETAIL_QUERY, payload["txn_ref"])
        items = await conn.fetch(_ITEMS_QUERY, row["registration_id"]) if row and row["registration_id"] else []

    if not row:
        return _page("Not found", "<p>This transaction no longer exists.</p>", status_code=404)
    if row["status"] != "pending":
        return _page(
            "Already reviewed",
            f"<p>This payment has already been marked <b>{html_lib.escape(row['status'])}</b>. No further action is needed.</p>",
        )
    return _render_review_form(row, items, preselect=verdict if verdict in ("approve", "reject") else "")


@router.post("/{token}", response_class=HTMLResponse,
             summary="Apply an approve/reject verdict from the quick-review page")
async def quick_review_submit(token: str, verdict: str = Form(...), remark: str = Form("")):
    payload = read_action_token(token, _TOKEN_TTL_SECONDS)
    if not payload or not payload.get("txn_ref"):
        return _page("Link expired", "<p>This review link is invalid or has expired.</p>", status_code=400)
    if verdict not in ("approve", "reject"):
        return _page("Invalid request", "<p>Unknown action.</p>", status_code=400)

    txn_ref = payload["txn_ref"]
    remark = remark.strip()
    pool = await get_pool()
    async with pool.acquire() as conn:
        reviewer_name = (
            await conn.fetchval("SELECT name FROM users WHERE id = $1::uuid", payload["recipient_id"])
            if payload.get("recipient_id") else None
        )
        actor = f"{reviewer_name} (quick-review link)" if reviewer_name else "quick-review link"
        note = remark or ("Approved via quick-review link" if verdict == "approve" else "Rejected via quick-review link")

        result = await apply_payment_verdict(conn, txn_ref, verdict, actor, note)
        if not result["ok"]:
            if result["reason"] == "not_found":
                return _page("Not found", "<p>This transaction no longer exists.</p>", status_code=404)
            return _page(
                "Already reviewed",
                f"<p>This payment has already been marked <b>{html_lib.escape(result['status'])}</b>. No further action is needed.</p>",
            )
        if result["already"]:
            return _page("Already approved", "<p>This payment was already approved.</p>")

        recipients, notify_message = await notify_payment_verdict(conn, txn_ref, result["status"], remark or None)

    if recipients:
        await send_channels(recipients, notify_message)

    verb = "approved ✅" if verdict == "approve" else "rejected ❌"
    return _page("Done", f"<p>Payment has been <b>{verb}</b>. The resident has been notified.</p>")
