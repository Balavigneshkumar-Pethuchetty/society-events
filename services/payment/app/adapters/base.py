from abc import ABC, abstractmethod
from typing import Any


class PaymentProcessor(ABC):
    """Abstract adapter contract (FR-01). Add a new gateway by subclassing this."""

    @abstractmethod
    async def initiate_payment(self, order: dict) -> dict:
        """Create a PENDING transaction.
        Returns: {txn_ref, payee_upi, amount, upi_intent_uri, status}
        """

    @abstractmethod
    async def verify_payment(self, txn_ref: str, ref: str) -> dict:
        """Mark a transaction VERIFIED given a UTR/reference.
        Returns: {status, utr}
        """

    @abstractmethod
    async def process_refund(self, txn_ref: str, refund_ref: str) -> dict:
        """Mark a transaction REFUNDED given a refund UTR.
        Returns: {status, refund_utr}
        """
