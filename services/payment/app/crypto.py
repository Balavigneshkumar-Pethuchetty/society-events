"""Symmetric encryption for secrets stored per-event (e.g. committee_registry.imap_password),
plus signed/expiring action tokens for no-login quick-review links (see routes/quick_review.py).

Previously the IMAP password lived in a single admin-only global settings row; now that
each event's organizer can store their own personal email account's password, it's
encrypted at rest instead of the plaintext the old global-only table used.
"""
import json

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_fernet = Fernet(settings.payment_secret_key.encode())


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return ""


def make_action_token(payload: dict) -> str:
    """Fernet already timestamps + HMAC-authenticates its tokens, so this doubles as a
    tamper-proof, self-expiring (see read_action_token's ttl) bearer credential for
    one-click email/Telegram links — no separate token table or login needed."""
    return _fernet.encrypt(json.dumps(payload).encode()).decode()


def read_action_token(token: str, max_age_seconds: int) -> dict | None:
    try:
        raw = _fernet.decrypt(token.encode(), ttl=max_age_seconds)
        return json.loads(raw.decode())
    except (InvalidToken, ValueError):
        return None
