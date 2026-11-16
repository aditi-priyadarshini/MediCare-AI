"""Contract for a real ambulance dispatch integration (ADR-005).

None is integrated. The default raises `ProviderUnavailable`, so the app can never show a
"requested" or "confirmed" ambulance that no provider accepted. A real adapter must return an
acceptance that names the provider's own reference; anything else is treated as unavailable.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


class ProviderUnavailable(Exception):
    """The provider cannot take the request. Nothing was sent."""


@dataclass(frozen=True)
class DispatchRequest:
    """Deliberately minimal: where to go. No name, medical summary or contact details. A real
    integration must add the fields its contract needs together with a consent step."""

    request_id: uuid.UUID
    latitude: float
    longitude: float


@dataclass(frozen=True)
class DispatchAcceptance:
    reference: str  # the provider's own reference for the job
    accepted_at: datetime  # when the provider accepted, by the provider's clock


class AmbulanceDispatchProvider(Protocol):
    def request(self, req: DispatchRequest) -> DispatchAcceptance:
        """Return the provider's acceptance, or raise ProviderUnavailable."""
        ...


class UnsupportedAmbulanceProvider:
    def request(self, req: DispatchRequest) -> DispatchAcceptance:
        raise ProviderUnavailable("No ambulance provider is integrated.")
