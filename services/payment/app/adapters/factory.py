from app.adapters.base import PaymentProcessor
from app.adapters.manual_upi import ManualUpiAdapter
from app.config import settings

_ADAPTERS: dict[str, type[PaymentProcessor]] = {
    "MANUAL_UPI": ManualUpiAdapter,
    # Future: "RAZORPAY": RazorpayAdapter, "STRIPE": StripeAdapter
}


def get_processor() -> PaymentProcessor:
    cls = _ADAPTERS.get(settings.payment_provider.upper())
    if not cls:
        raise RuntimeError(
            f"Unknown PAYMENT_PROVIDER='{settings.payment_provider}'. "
            f"Valid options: {list(_ADAPTERS)}"
        )
    return cls()
