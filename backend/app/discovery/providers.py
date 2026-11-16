"""Contracts for external care-discovery integrations (ADR-005).

None is integrated yet, and the defaults say so instead of inventing an answer:

* `PharmacyInventoryProvider`: a source of stock reports. Its output is not shown directly. It is
  turned into `InventoryItem`s and goes through `service.ingest_inventory`, the same validated
  path the admin feed endpoint uses, so every stock figure on screen is a stored, named,
  timestamped snapshot.
* `AppointmentProvider`: delivers a request to a clinic's booking system. The default raises
  `ProviderUnavailable`, so a clinic that claims `provider` booking cannot produce a "sent"
  appointment until a real adapter exists.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol


class ProviderUnavailable(Exception):
    """The provider cannot take the request right now. Nothing was sent."""


@dataclass(frozen=True)
class InventoryItem:
    medicine_id: uuid.UUID
    availability: str  # in_stock | low_stock | out_of_stock
    source_timestamp: datetime  # when the SOURCE observed it, not when we received it
    price_amount: Decimal | None = None
    currency: str | None = None
    pack_size_text: str | None = None


class PharmacyInventoryProvider(Protocol):
    def fetch(
        self, pharmacy_id: uuid.UUID, medicine_ids: list[uuid.UUID]
    ) -> list[InventoryItem]: ...


class UnsupportedInventoryProvider:
    def fetch(self, pharmacy_id: uuid.UUID, medicine_ids: list[uuid.UUID]) -> list[InventoryItem]:
        return []


@dataclass(frozen=True)
class AppointmentSubmission:
    """Deliberately minimal: no name, contact details or reason. A real integration must add the
    fields its contract needs together with an explicit patient consent step for sharing them."""

    appointment_id: uuid.UUID
    doctor_id: uuid.UUID
    preferred_date: date
    preferred_window: str


class AppointmentProvider(Protocol):
    def submit(self, submission: AppointmentSubmission) -> str:
        """Return the provider's reference for the request, or raise ProviderUnavailable."""
        ...


class UnsupportedAppointmentProvider:
    def submit(self, submission: AppointmentSubmission) -> str:
        raise ProviderUnavailable("No appointment provider is integrated.")
