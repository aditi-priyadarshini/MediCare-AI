"""medications, schedules, supplies, dose logs, notifications

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15 09:00:00.000000
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_VERIFICATION = "verification_status IN ('patient_reported','clinician_confirmed','imported','unverified')"

# Baseline catalogue: product names, forms and strengths only. No dosing, interactions or advice.
_SEED = [
    ("Paracetamol", "tablet", "500 mg"),
    ("Ibuprofen", "tablet", "400 mg"),
    ("Aspirin", "tablet", "75 mg"),
    ("Metformin", "tablet", "500 mg"),
    ("Amlodipine", "tablet", "5 mg"),
    ("Losartan", "tablet", "50 mg"),
    ("Atorvastatin", "tablet", "10 mg"),
    ("Levothyroxine", "tablet", "50 mcg"),
    ("Omeprazole", "capsule", "20 mg"),
    ("Pantoprazole", "tablet", "40 mg"),
    ("Cetirizine", "tablet", "10 mg"),
    ("Amoxicillin", "capsule", "500 mg"),
    ("Azithromycin", "tablet", "500 mg"),
    ("Salbutamol", "inhaler", "100 mcg per puff"),
]


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    medicines = op.create_table(
        "medicines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("form", sa.String(length=32), nullable=True),
        sa.Column("strength_text", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("source IN ('seed','admin')", name=op.f("ck_medicines_source_valid")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_medicines")),
        sa.UniqueConstraint("name", "form", "strength_text", name="uq_medicines_identity"),
    )
    op.create_index("ix_medicines_name_lower", "medicines", [sa.text("lower(name)")], unique=False)
    op.bulk_insert(
        medicines,
        [
            {"id": uuid.uuid4(), "name": n, "form": f, "strength_text": s, "source": "seed"}
            for n, f, s in _SEED
        ],
    )

    op.create_table(
        "prescriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("record_id", sa.Uuid(), nullable=True),
        sa.Column("prescriber_name", sa.Text(), nullable=True),
        sa.Column("prescribed_on", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("verification_status", sa.String(length=24), nullable=False),
        *_ts(),
        sa.CheckConstraint("status IN ('active','entered_in_error')", name=op.f("ck_prescriptions_status_valid")),
        sa.CheckConstraint(_VERIFICATION, name=op.f("ck_prescriptions_verification_valid")),
        sa.CheckConstraint(
            "valid_until IS NULL OR prescribed_on IS NULL OR valid_until >= prescribed_on",
            name=op.f("ck_prescriptions_dates_valid"),
        ),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_prescriptions_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["record_id"], ["health_records.id"], name=op.f("fk_prescriptions_record_id_health_records"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_prescriptions")),
    )
    op.create_index("ix_prescriptions_patient", "prescriptions", ["patient_user_id", "prescribed_on"], unique=False)
    op.create_index(op.f("ix_prescriptions_record_id"), "prescriptions", ["record_id"], unique=False)

    op.create_table(
        "medications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("medicine_id", sa.Uuid(), nullable=True),
        sa.Column("prescription_id", sa.Uuid(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("strength_text", sa.String(length=64), nullable=True),
        sa.Column("form", sa.String(length=32), nullable=True),
        sa.Column("dose_text", sa.String(length=120), nullable=True),
        sa.Column("units_per_dose", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("as_needed", sa.Boolean(), nullable=False),
        sa.Column("basis", sa.String(length=16), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("refill_threshold_days", sa.Integer(), nullable=False),
        sa.Column("verification_status", sa.String(length=24), nullable=False),
        *_ts(),
        sa.CheckConstraint("status IN ('active','paused','stopped','entered_in_error')", name=op.f("ck_medications_status_valid")),
        sa.CheckConstraint("basis IN ('prescribed','self_reported')", name=op.f("ck_medications_basis_valid")),
        sa.CheckConstraint(
            "(basis = 'prescribed' AND prescription_id IS NOT NULL) OR (basis = 'self_reported' AND prescription_id IS NULL)",
            name=op.f("ck_medications_basis_matches_prescription"),
        ),
        sa.CheckConstraint(_VERIFICATION, name=op.f("ck_medications_verification_valid")),
        sa.CheckConstraint("units_per_dose > 0", name=op.f("ck_medications_units_positive")),
        sa.CheckConstraint("refill_threshold_days BETWEEN 0 AND 90", name=op.f("ck_medications_threshold_valid")),
        sa.CheckConstraint("end_date IS NULL OR start_date IS NULL OR end_date >= start_date", name=op.f("ck_medications_dates_valid")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_medications_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medicine_id"], ["medicines.id"], name=op.f("fk_medications_medicine_id_medicines"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["prescription_id"], ["prescriptions.id"], name=op.f("fk_medications_prescription_id_prescriptions"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_medications")),
    )
    op.create_index("ix_medications_patient_status", "medications", ["patient_user_id", "status"], unique=False)
    op.create_index(op.f("ix_medications_prescription_id"), "medications", ["prescription_id"], unique=False)

    op.create_table(
        "medication_schedules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sa.Text(), nullable=False),
        sa.Column("times", postgresql.JSONB(), nullable=False),
        sa.Column("days_of_week", postgresql.JSONB(), nullable=True),
        sa.Column("every_n_days", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_ts(),
        sa.CheckConstraint("every_n_days BETWEEN 1 AND 365", name=op.f("ck_medication_schedules_interval_valid")),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name=op.f("ck_medication_schedules_dates_valid")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_medication_schedules_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], name=op.f("fk_medication_schedules_medication_id_medications"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_medication_schedules")),
    )
    op.create_index("ix_medication_schedules_medication", "medication_schedules", ["medication_id"], unique=False)

    op.create_table(
        "medication_supplies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("lot_number", sa.String(length=64), nullable=True),
        sa.Column("manufacturer", sa.Text(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("received_on", sa.Date(), nullable=True),
        sa.Column("unit", sa.String(length=16), nullable=True),
        sa.Column("quantity_initial", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("quantity_remaining", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        *_ts(),
        sa.CheckConstraint("status IN ('active','discarded','entered_in_error')", name=op.f("ck_medication_supplies_status_valid")),
        sa.CheckConstraint("quantity_initial > 0", name=op.f("ck_medication_supplies_initial_positive")),
        sa.CheckConstraint("quantity_remaining >= 0", name=op.f("ck_medication_supplies_remaining_nonneg")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_medication_supplies_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], name=op.f("fk_medication_supplies_medication_id_medications"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_medication_supplies")),
    )
    op.create_index("ix_medication_supplies_medication", "medication_supplies", ["medication_id", "expiry_date"], unique=False)

    op.create_table(
        "dose_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=False),
        sa.Column("schedule_id", sa.Uuid(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("supply_id", sa.Uuid(), nullable=True),
        sa.Column("units_used", sa.Numeric(precision=8, scale=2), nullable=True),
        *_ts(),
        sa.CheckConstraint("status IN ('pending','taken','skipped')", name=op.f("ck_dose_logs_status_valid")),
        sa.CheckConstraint("(status = 'taken') = (taken_at IS NOT NULL)", name=op.f("ck_dose_logs_taken_at_matches_status")),
        sa.CheckConstraint("scheduled_at IS NOT NULL OR status = 'taken'", name=op.f("ck_dose_logs_ad_hoc_is_taken")),
        sa.CheckConstraint("units_used IS NULL OR units_used >= 0", name=op.f("ck_dose_logs_units_nonneg")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_dose_logs_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], name=op.f("fk_dose_logs_medication_id_medications"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["schedule_id"], ["medication_schedules.id"], name=op.f("fk_dose_logs_schedule_id_medication_schedules"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supply_id"], ["medication_supplies.id"], name=op.f("fk_dose_logs_supply_id_medication_supplies"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dose_logs")),
        sa.UniqueConstraint("schedule_id", "scheduled_at", name="uq_dose_logs_slot"),
    )
    op.create_index("ix_dose_logs_patient_scheduled", "dose_logs", ["patient_user_id", "scheduled_at"], unique=False)
    op.create_index("ix_dose_logs_medication", "dose_logs", ["medication_id", "scheduled_at"], unique=False)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("dedupe_key", sa.String(length=120), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dose_log_id", sa.Uuid(), nullable=True),
        sa.Column("medication_id", sa.Uuid(), nullable=True),
        sa.Column("supply_id", sa.Uuid(), nullable=True),
        *_ts(),
        sa.CheckConstraint(
            "kind IN ('dose_due','refill_soon','out_of_stock','expiring_soon','expired')",
            name=op.f("ck_notifications_kind_valid"),
        ),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_notifications_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["dose_log_id"], ["dose_logs.id"], name=op.f("fk_notifications_dose_log_id_dose_logs"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], name=op.f("fk_notifications_medication_id_medications"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supply_id"], ["medication_supplies.id"], name=op.f("fk_notifications_supply_id_medication_supplies"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
        sa.UniqueConstraint("patient_user_id", "dedupe_key", name="uq_notifications_dedupe"),
    )
    op.create_index("ix_notifications_patient_due", "notifications", ["patient_user_id", "due_at"], unique=False)
    op.create_index(op.f("ix_notifications_dose_log_id"), "notifications", ["dose_log_id"], unique=False)
    op.create_index(op.f("ix_notifications_medication_id"), "notifications", ["medication_id"], unique=False)
    op.create_index(op.f("ix_notifications_supply_id"), "notifications", ["supply_id"], unique=False)


def downgrade() -> None:
    for table in (
        "notifications",
        "dose_logs",
        "medication_supplies",
        "medication_schedules",
        "medications",
        "prescriptions",
        "medicines",
    ):
        op.drop_table(table)  # indexes and constraints go with the table
