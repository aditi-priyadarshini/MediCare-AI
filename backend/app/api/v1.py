from fastapi import APIRouter

from app.admin.router import router as admin_router
from app.assistant.admin import router as llm_admin_router
from app.assistant.router import router as assistant_router
from app.calls.router import router as calls_router
from app.discovery.admin import router as discovery_admin_router
from app.discovery.router import router as discovery_router
from app.emergency.router import router as emergency_router
from app.feedback.router import router as feedback_router
from app.identity.router import router as auth_router
from app.medications.router import router as medications_router
from app.nutrition.router import router as nutrition_router
from app.patients.router import router as patient_router
from app.records.router import router as records_router
from app.records.scan_router import router as scan_router
from app.safety.admin import router as safety_admin_router
from app.safety.ai_alternatives import router as safety_ai_alternatives_router
from app.safety.ai_pairs import router as safety_ai_pairs_router
from app.safety.ai_review import router as safety_ai_review_router
from app.safety.personal import router as safety_personal_router
from app.safety.router import router as safety_router
from app.sharing.router import router as sharing_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(patient_router)
api_v1.include_router(admin_router)
api_v1.include_router(scan_router)  # before records: '/records/scan' must not read as an id
api_v1.include_router(records_router)
api_v1.include_router(medications_router)
api_v1.include_router(safety_router)
api_v1.include_router(safety_personal_router)
api_v1.include_router(safety_ai_pairs_router)
api_v1.include_router(safety_ai_review_router)
api_v1.include_router(safety_ai_alternatives_router)
api_v1.include_router(safety_admin_router)
api_v1.include_router(assistant_router)
api_v1.include_router(discovery_router)
api_v1.include_router(discovery_admin_router)
api_v1.include_router(nutrition_router)
api_v1.include_router(sharing_router)
api_v1.include_router(emergency_router)
api_v1.include_router(feedback_router)
api_v1.include_router(calls_router)
api_v1.include_router(llm_admin_router)
