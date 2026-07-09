"""Email parsers for UPI bank notification emails.

Two modes:
  1. Regex parser  — fast, zero dependencies, works offline.
  2. Ollama AI     — calls a local LLM; more robust across bank formats,
                     also extracts payer VPA for precise transaction matching.
"""
import json
import re
from typing import Optional

# ── Regex parser ──────────────────────────────────────────────────────────────

_UTR_PATTERNS = [
    r'\bUTR\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bTransaction\s*(?:ID|Ref|No)\.?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bRef(?:erence)?\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bRRN\s*:?\s*([0-9]{12})\b',
    r'\bUPI\s+Reference\s+No\.?\s*:?\s*([0-9]{10,22})\b',
    r'\b([A-Z]{4}[0-9]{12})\b',   # Standard 16-char UTR
    r'\b([0-9]{12})\b',            # 12-digit numeric reference
]

_AMOUNT_PATTERNS = [
    r'(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
    r'([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|INR|₹)',
    r'amount\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)',
    r'(?:credited|debited|paid|received)\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)',
]

_VPA_PATTERNS = [
    r'VPA\s*:?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+)',
    r'UPI\s+ID\s*:?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+)',
    r'Sender.*?VPA\s*:?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+)',
    r'\b([a-zA-Z0-9.\-_]+@(?:upi|axl|oksbi|okicici|okhdfcbank|paytm|ybl|ibl|apl|waicici|wpay|phonepe))\b',
]


def extract_utr_amount(text: str) -> Optional[tuple[str, float]]:
    """Return (utr, amount) via regex. Legacy entry point used when AI is off."""
    result = extract_all_regex(text)
    if result and result[0] and result[1]:
        return result[0], result[1]
    return None


def extract_all_regex(text: str) -> tuple[Optional[str], Optional[float], Optional[str]]:
    """Return (utr, amount, payer_vpa) — any field may be None."""
    utr: Optional[str] = None
    for pattern in _UTR_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            utr = m.group(1).upper()
            break

    amount: Optional[float] = None
    for pattern in _AMOUNT_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
                if val > 0:
                    amount = val
                    break
            except ValueError:
                continue

    payer_vpa: Optional[str] = None
    for pattern in _VPA_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            payer_vpa = m.group(1).lower()
            break

    return utr, amount, payer_vpa


# ── Ollama AI parser ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a payment email parser for Indian UPI bank notifications.
Extract the following fields from the email and return ONLY a valid JSON object with these keys:
- "utr": the UPI Reference Number / Transaction ID / UTR number (string, digits only, no spaces)
- "amount": the credited/debited amount as a number (float, e.g. 2.00)
- "payer_vpa": the sender's UPI VPA / UPI ID (e.g. "9884930229@axl"), null if not found

Return null for any field you cannot find. Output ONLY the JSON object, nothing else."""

_USER_PROMPT_TPL = """Parse this bank notification email and extract the payment details:

---
{body}
---

Return JSON only."""


async def extract_all_ai(
    text: str,
    ollama_host: str,
    model: str,
) -> tuple[Optional[str], Optional[float], Optional[str]]:
    """Call Ollama to parse email. Returns (utr, amount, payer_vpa)."""
    prompt = _USER_PROMPT_TPL.format(body=text[:3000])

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        "stream": False,
        "format": "json",
    }

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{ollama_host}/api/chat", json=payload)
            if resp.status_code != 200:
                print(f"[parser/ollama] HTTP {resp.status_code} — falling back to regex")
                return extract_all_regex(text)
            data = resp.json()

        raw = data.get("message", {}).get("content", "")
        parsed = json.loads(raw)

        utr       = str(parsed["utr"]).upper()  if parsed.get("utr")       else None
        amount    = float(parsed["amount"])      if parsed.get("amount")    else None
        payer_vpa = str(parsed["payer_vpa"]).lower() if parsed.get("payer_vpa") else None
        return utr, amount, payer_vpa

    except Exception as exc:
        print(f"[parser/ollama] error: {exc} — falling back to regex")
        return extract_all_regex(text)


# ── Claude (Anthropic) AI parser ───────────────────────────────────────────────

async def extract_all_claude(
    text: str,
    api_key: str,
    model: str,
) -> tuple[Optional[str], Optional[float], Optional[str]]:
    """Call Claude to parse email. Returns (utr, amount, payer_vpa).

    Falls back to regex on any error (missing/invalid key, rate limit, network) —
    same fallback contract as extract_all_ai, so callers don't need provider-specific
    error handling.
    """
    if not api_key:
        print("[parser/claude] no API key configured — falling back to regex")
        return extract_all_regex(text)

    prompt = _USER_PROMPT_TPL.format(body=text[:3000])

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=api_key)
        resp = await client.messages.create(
            model=model,
            max_tokens=256,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")
        parsed = json.loads(raw)

        utr       = str(parsed["utr"]).upper()      if parsed.get("utr")       else None
        amount    = float(parsed["amount"])         if parsed.get("amount")    else None
        payer_vpa = str(parsed["payer_vpa"]).lower() if parsed.get("payer_vpa") else None
        return utr, amount, payer_vpa

    except Exception as exc:
        print(f"[parser/claude] error: {exc} — falling back to regex")
        return extract_all_regex(text)
