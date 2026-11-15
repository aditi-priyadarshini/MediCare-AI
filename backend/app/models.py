"""Import every model so Alembic autogenerate and create_all see the full metadata."""

from app.assistant.models import AiEvidenceItem, ChatContextAccessLog, ChatMessage, ChatSession
from app.audit.models import AuditLog
from app.core.db import Base
from app.identity.models import OAuthAccount, OtpChallenge, SessionRecord, User
from app.medications.models import (
    DoseLog,
    Medication,
    MedicationSchedule,
    MedicationSupply,
    Medicine,
    Notification,
    Prescription,
)
from app.patients.models import (
    EmergencyContact,
    PatientAllergy,
    PatientCondition,
    PatientProfile,
    UserConsent,
)
from app.records.models import HealthRecord, LabResult
from app.safety.models import (
    ActiveIngredient,
    AdverseEventReport,
    MedicineIngredient,
    MedicinePrice,
    ReferenceSource,
    SafetyRule,
)

__all__ = [
    "ActiveIngredient",
    "AdverseEventReport",
    "AiEvidenceItem",
    "AuditLog",
    "Base",
    "ChatContextAccessLog",
    "ChatMessage",
    "ChatSession",
    "DoseLog",
    "EmergencyContact",
    "HealthRecord",
    "LabResult",
    "Medication",
    "MedicationSchedule",
    "MedicationSupply",
    "Medicine",
    "MedicineIngredient",
    "MedicinePrice",
    "Notification",
    "OAuthAccount",
    "OtpChallenge",
    "PatientAllergy",
    "PatientCondition",
    "PatientProfile",
    "Prescription",
    "ReferenceSource",
    "SafetyRule",
    "SessionRecord",
    "User",
    "UserConsent",
]
