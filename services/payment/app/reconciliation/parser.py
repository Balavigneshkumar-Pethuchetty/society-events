"""Regex-based parser for Indian bank UPI confirmation emails (FR-05)."""
import re
from typing import Optional

# UTR / transaction reference patterns (longest first to avoid partial matches)
_UTR_PATTERNS = [
    r'\bUTR\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bTransaction\s*(?:ID|Ref|No)\.?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bRef(?:erence)?\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z0-9]{12,22})\b',
    r'\bRRN\s*:?\s*([0-9]{12})\b',
    r'\b([A-Z]{4}[0-9]{12})\b',  # Standard 16-char UTR (e.g. HDFC123456789012)
    r'\b([0-9]{12})\b',           # 12-digit numeric reference
]

# Amount patterns — INR, Rs, ₹
_AMOUNT_PATTERNS = [
    r'(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
    r'([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|INR|₹)',
    r'amount\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)',
    r'(?:credited|debited|paid|received)\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)',
]


def extract_utr_amount(text: str) -> Optional[tuple[str, float]]:
    """Return (utr, amount) if both can be extracted from the email body, else None."""
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
                amount = float(m.group(1).replace(",", ""))
                if amount > 0:
                    break
            except ValueError:
                continue

    if utr and amount:
        return utr, amount
    return None
