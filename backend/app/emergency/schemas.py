import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SIMULATION_NOTICE = (
    "SIMULATION ONLY. No ambulance was contacted or sent, and none is on its way. "
    "In a real emergency call 112."
)
DISPATCH_UNAVAILABLE = (
    "No ambulance service is connected to this app, so nothing was requested. Call 112 now."
)

SimulationStatus = Literal["requested", "acknowledged", "en_route", "arrived", "cancelled"]


class EmergencyStatus(BaseModel):
    """Lets the screen be honest: it only offers a dispatch request when a provider is connected."""

    emergency_number: str = "112"
    dispatch_available: bool


class EmergencySettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_blood_group: bool = True
    include_allergies: bool = True
    include_conditions: bool = False
    include_medications: bool = False
    include_contacts: bool = True


class EmergencySettingsOut(EmergencySettingsIn):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class EmergencyAllergy(BaseModel):
    substance: str
    reaction: str | None
    severity: str | None
    verification_status: str


class EmergencyCondition(BaseModel):
    display_name: str
    verification_status: str


class EmergencyMedication(BaseModel):
    display_name: str
    strength_text: str | None
    dose_text: str | None
    status: str


class EmergencyContactBrief(BaseModel):
    name: str
    relationship: str | None
    phone_e164: str
    is_primary: bool


class EmergencySummary(BaseModel):
    """Only what the patient switched on. A section that is off is None, not empty."""

    generated_at: datetime
    display_name: str
    blood_group: str | None = None
    blood_group_verification_status: str | None = None
    allergies: list[EmergencyAllergy] | None = None
    conditions: list[EmergencyCondition] | None = None
    medications: list[EmergencyMedication] | None = None
    contacts: list[EmergencyContactBrief] | None = None
    settings: EmergencySettingsOut
    limitations: list[str]


class SimulationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    share_location: bool = False
    # Two explicit confirmations: starting even a practice run is a deliberate act.
    confirm: Literal[True]
    understand_simulation: Literal[True]


class HistoryEntry(BaseModel):
    status: SimulationStatus
    at: datetime


class SimulationOut(BaseModel):
    id: uuid.UUID
    is_simulation: Literal[True] = True
    notice: str = SIMULATION_NOTICE
    status: SimulationStatus
    location_shared: bool
    is_open: bool
    next_status: SimulationStatus | None
    history: list[HistoryEntry]
    created_at: datetime
    updated_at: datetime


class DispatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    confirm: Literal[True]


class DispatchOut(BaseModel):
    is_simulation: Literal[False] = False
    status: Literal["accepted_by_provider"] = "accepted_by_provider"
    provider_reference: str
    accepted_at: datetime
    notice: str = (
        "A provider accepted this request. This is not a promise of arrival time. "
        "If your situation changes or help does not arrive, call 112."
    )
