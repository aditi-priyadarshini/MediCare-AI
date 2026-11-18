import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DeviceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Literal["android", "ios"]
    push_token: str = Field(min_length=16, max_length=4096)
    voip_token: str | None = Field(default=None, min_length=16, max_length=4096)
    app_version: str | None = Field(default=None, max_length=32)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    platform: str
    app_version: str | None
    last_seen_at: datetime
    can_ring: bool


class CallOut(BaseModel):
    """What the app may know about a call before the patient answers: nothing about the
    medicine. Details come from `accept`."""

    id: uuid.UUID
    status: str
    attempt: int
    ring_expires_at: datetime
    answered_at: datetime | None
    ended_at: datetime | None
    end_reason: str | None
    media_connected_at: datetime | None
    created_at: datetime


class DoseBrief(BaseModel):
    dose_id: uuid.UUID
    medication_name: str
    dose_text: str | None
    scheduled_at: datetime | None
    status: str
    spoken_text: str


class AcceptOut(BaseModel):
    call: CallOut
    dose: DoseBrief
    ticket: str
    ws_path: str
    ice_servers: list[dict]
    ticket_ttl_seconds: int


class IceOut(BaseModel):
    ice_servers: list[dict]
