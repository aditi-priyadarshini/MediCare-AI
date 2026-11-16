"""care discovery (pharmacies, doctors, inventory, appointments) and diet planner

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-15 22:00:00.000000
"""
import uuid
from datetime import date, datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

DEMO_SOURCE = "MediCare AI demonstration directory"
DEMO_DAY = date(2026, 11, 15)
DEMO_OBSERVED = datetime(2026, 11, 15, tzinfo=timezone.utc)

# Synthetic demonstration entries. Names, addresses and coordinates are invented and every one is
# labelled "(demo)". None carries a phone number, a registration number or a verified credential.
_PHARMACIES = [
    ("Demo Pharmacy North (demo)", "1 Sample Road, demo entry, not a real location", "Bhubaneswar", "Odisha", "751001", 20.2961, 85.8245),
    ("Demo Pharmacy Central (demo)", "2 Sample Road, demo entry, not a real location", "Bhubaneswar", "Odisha", "751002", 20.2700, 85.8400),
    ("Demo Pharmacy South (demo)", "3 Sample Road, demo entry, not a real location", "Cuttack", "Odisha", "753001", 20.4625, 85.8830),
    ("Demo Pharmacy East (demo)", "4 Sample Road, demo entry, not a real location", "Puri", "Odisha", "752001", 19.8135, 85.8312),
]
_DOCTORS = [
    ("Dr. Asha Demo (demo)", "Demo Family Clinic (demo)", ["general medicine"], ["English", "Hindi", "Odia"], "Bhubaneswar"),
    ("Dr. Ravi Sample (demo)", "Demo Heart Centre (demo)", ["cardiology"], ["English", "Hindi"], "Bhubaneswar"),
    ("Dr. Meera Example (demo)", "Demo Children's Clinic (demo)", ["paediatrics"], ["English", "Odia"], "Cuttack"),
    ("Dr. Kiran Placeholder (demo)", "Demo Diabetes Clinic (demo)", ["endocrinology", "general medicine"], ["English", "Hindi"], "Puri"),
]


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    sources = op.create_table(
        "provider_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("licence", sa.Text(), nullable=True),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("retrieved_on", sa.Date(), nullable=False),
        sa.Column("stale_after_hours", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('directory', 'inventory', 'credential')", name=op.f("ck_provider_sources_kind_valid")),
        sa.CheckConstraint("stale_after_hours > 0", name=op.f("ck_provider_sources_stale_after_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_provider_sources")),
        sa.UniqueConstraint("name", "kind", "retrieved_on", name="uq_provider_sources_identity"),
    )

    pharmacies = op.create_table(
        "pharmacies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address_line", sa.Text(), nullable=False),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("postal_code", sa.String(length=12), nullable=True),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("phone", sa.String(length=24), nullable=True),
        sa.Column("hours_text", sa.Text(), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verification_status", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        *_ts(),
        sa.CheckConstraint("verification_status IN ('unverified', 'source_listed')", name=op.f("ck_pharmacies_verification_valid")),
        sa.CheckConstraint("status IN ('active','retired')", name=op.f("ck_pharmacies_status_valid")),
        sa.CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name=op.f("ck_pharmacies_coordinates_both_or_neither")),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
            name=op.f("ck_pharmacies_coordinates_in_range"),
        ),
        sa.ForeignKeyConstraint(["source_id"], ["provider_sources.id"], name=op.f("fk_pharmacies_source_id_provider_sources"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pharmacies")),
    )
    op.create_index("ix_pharmacies_city_lower", "pharmacies", [sa.text("lower(city)")], unique=False)
    op.create_index("ix_pharmacies_coordinates", "pharmacies", ["latitude", "longitude"], unique=False)
    op.create_index(op.f("ix_pharmacies_source_id"), "pharmacies", ["source_id"], unique=False)

    op.create_table(
        "pharmacy_inventory_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pharmacy_id", sa.Uuid(), nullable=False),
        sa.Column("medicine_id", sa.Uuid(), nullable=False),
        sa.Column("availability", sa.String(length=16), nullable=False),
        sa.Column("price_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("pack_size_text", sa.String(length=64), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("availability IN ('in_stock', 'low_stock', 'out_of_stock')", name=op.f("ck_pharmacy_inventory_snapshots_availability_valid")),
        sa.CheckConstraint("price_amount IS NULL OR price_amount >= 0", name=op.f("ck_pharmacy_inventory_snapshots_price_non_negative")),
        sa.CheckConstraint("(price_amount IS NULL) = (currency IS NULL)", name=op.f("ck_pharmacy_inventory_snapshots_price_has_currency")),
        sa.ForeignKeyConstraint(["pharmacy_id"], ["pharmacies.id"], name=op.f("fk_pharmacy_inventory_snapshots_pharmacy_id_pharmacies"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["medicine_id"], ["medicines.id"], name=op.f("fk_pharmacy_inventory_snapshots_medicine_id_medicines"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_id"], ["provider_sources.id"], name=op.f("fk_pharmacy_inventory_snapshots_source_id_provider_sources"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pharmacy_inventory_snapshots")),
    )
    op.create_index(
        "ix_inventory_medicine_pharmacy_time",
        "pharmacy_inventory_snapshots",
        ["medicine_id", "pharmacy_id", sa.text("source_timestamp DESC")],
        unique=False,
    )
    op.create_index(op.f("ix_pharmacy_inventory_snapshots_pharmacy_id"), "pharmacy_inventory_snapshots", ["pharmacy_id"], unique=False)
    op.create_index(op.f("ix_pharmacy_inventory_snapshots_source_id"), "pharmacy_inventory_snapshots", ["source_id"], unique=False)

    doctors = op.create_table(
        "doctors",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("clinic_name", sa.Text(), nullable=True),
        sa.Column("specialties", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        sa.Column("languages", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        sa.Column("address_line", sa.Text(), nullable=True),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("postal_code", sa.String(length=12), nullable=True),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("phone", sa.String(length=24), nullable=True),
        sa.Column("booking_mode", sa.String(length=16), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        *_ts(),
        sa.CheckConstraint("booking_mode IN ('request_only', 'provider')", name=op.f("ck_doctors_booking_mode_valid")),
        sa.CheckConstraint("status IN ('active','retired')", name=op.f("ck_doctors_status_valid")),
        sa.CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name=op.f("ck_doctors_coordinates_both_or_neither")),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
            name=op.f("ck_doctors_coordinates_in_range"),
        ),
        sa.ForeignKeyConstraint(["source_id"], ["provider_sources.id"], name=op.f("fk_doctors_source_id_provider_sources"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_doctors")),
    )
    op.create_index("ix_doctors_city_lower", "doctors", [sa.text("lower(city)")], unique=False)
    op.create_index("ix_doctors_specialties", "doctors", ["specialties"], unique=False, postgresql_using="gin")
    op.create_index(op.f("ix_doctors_source_id"), "doctors", ["source_id"], unique=False)

    credentials = op.create_table(
        "doctor_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("doctor_id", sa.Uuid(), nullable=False),
        sa.Column("qualification", sa.Text(), nullable=False),
        sa.Column("registration_number", sa.Text(), nullable=True),
        sa.Column("issuing_authority", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("verification_source_id", sa.Uuid(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.CheckConstraint("status IN ('unverified', 'source_listed', 'verified')", name=op.f("ck_doctor_credentials_status_valid")),
        sa.CheckConstraint(
            "status <> 'verified' OR (verification_source_id IS NOT NULL AND verified_at IS NOT NULL)",
            name=op.f("ck_doctor_credentials_verified_has_provenance"),
        ),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"], name=op.f("fk_doctor_credentials_doctor_id_doctors"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verification_source_id"], ["provider_sources.id"], name=op.f("fk_doctor_credentials_verification_source_id_provider_sources"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_doctor_credentials")),
    )
    op.create_index(op.f("ix_doctor_credentials_doctor_id"), "doctor_credentials", ["doctor_id"], unique=False)

    op.create_table(
        "appointments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("doctor_id", sa.Uuid(), nullable=False),
        sa.Column("preferred_date", sa.Date(), nullable=False),
        sa.Column("preferred_window", sa.String(length=12), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("provider_reference", sa.Text(), nullable=True),
        sa.Column("provider_responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_message", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.CheckConstraint("mode IN ('request_only', 'provider')", name=op.f("ck_appointments_mode_valid")),
        sa.CheckConstraint("status IN ('request_only', 'sent', 'confirmed', 'declined', 'cancelled')", name=op.f("ck_appointments_status_valid")),
        sa.CheckConstraint("preferred_window IN ('any', 'morning', 'afternoon', 'evening')", name=op.f("ck_appointments_window_valid")),
        sa.CheckConstraint(
            "(mode = 'request_only' AND status IN ('request_only','cancelled')) "
            "OR (mode = 'provider' AND status IN ('sent','confirmed','declined','cancelled'))",
            name=op.f("ck_appointments_status_matches_mode"),
        ),
        sa.CheckConstraint(
            "status NOT IN ('confirmed','declined') "
            "OR (provider_reference IS NOT NULL AND provider_responded_at IS NOT NULL)",
            name=op.f("ck_appointments_response_needs_provider"),
        ),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_appointments_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"], name=op.f("fk_appointments_doctor_id_doctors"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointments")),
    )
    op.create_index("ix_appointments_patient_created", "appointments", ["patient_user_id", sa.text("created_at DESC")], unique=False)
    op.create_index(op.f("ix_appointments_doctor_id"), "appointments", ["doctor_id"], unique=False)

    op.create_table(
        "diet_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("diet_type", sa.String(length=16), nullable=False),
        sa.Column("cuisine", sa.String(length=16), nullable=False),
        sa.Column("meals_per_day", sa.Integer(), nullable=False),
        sa.Column("avoid_foods", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        sa.Column("situations", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        *_ts(),
        sa.CheckConstraint("diet_type IN ('no_restriction', 'vegetarian', 'eggetarian', 'pescatarian', 'vegan', 'jain')", name=op.f("ck_diet_preferences_diet_type_valid")),
        sa.CheckConstraint("cuisine IN ('general', 'north_indian', 'south_indian', 'east_indian', 'western_indian')", name=op.f("ck_diet_preferences_cuisine_valid")),
        sa.CheckConstraint("meals_per_day BETWEEN 2 AND 5", name=op.f("ck_diet_preferences_meals_valid")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_diet_preferences_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_diet_preferences")),
        sa.UniqueConstraint("patient_user_id", name=op.f("uq_diet_preferences_patient_user_id")),
    )

    op.create_table(
        "diet_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("constraints_used", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("review_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("days", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("catalogue_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_diet_plans_patient_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_diet_plans")),
    )
    op.create_index("ix_diet_plans_patient_created", "diet_plans", ["patient_user_id", sa.text("created_at DESC")], unique=False)

    # Synthetic demonstration directory (see the module comment above the seed lists).
    source_id = uuid.uuid4()
    op.bulk_insert(
        sources,
        [{
            "id": source_id,
            "name": DEMO_SOURCE,
            "publisher": "MediCare AI project",
            "url": None,
            "licence": "Synthetic demo data",
            "jurisdiction": "IN",
            "kind": "directory",
            "retrieved_on": DEMO_DAY,
            "stale_after_hours": 24 * 180,
        }],
    )
    op.bulk_insert(
        pharmacies,
        [
            {
                "id": uuid.uuid4(), "name": n, "address_line": a, "city": c, "state": s, "postal_code": p,
                "latitude": lat, "longitude": lon, "phone": None, "hours_text": None,
                "source_id": source_id, "source_observed_at": DEMO_OBSERVED,
                "verification_status": "unverified", "status": "active",
            }
            for n, a, c, s, p, lat, lon in _PHARMACIES
        ],
    )
    doctor_rows = [
        {
            "id": uuid.uuid4(), "display_name": n, "clinic_name": clinic, "specialties": spec,
            "languages": langs, "address_line": "Demo entry, not a real location", "city": city,
            "state": "Odisha", "postal_code": None, "latitude": None, "longitude": None, "phone": None,
            "booking_mode": "request_only", "source_id": source_id, "source_observed_at": DEMO_OBSERVED,
            "status": "active",
        }
        for n, clinic, spec, langs, city in _DOCTORS
    ]
    op.bulk_insert(doctors, doctor_rows)
    op.bulk_insert(
        credentials,
        [
            {
                "id": uuid.uuid4(), "doctor_id": d["id"], "qualification": "Not recorded in the demo data",
                "registration_number": None, "issuing_authority": None, "status": "unverified",
                "verification_source_id": None, "verified_at": None,
            }
            for d in doctor_rows
        ],
    )


def downgrade() -> None:
    for table in (
        "diet_plans",
        "diet_preferences",
        "appointments",
        "doctor_credentials",
        "doctors",
        "pharmacy_inventory_snapshots",
        "pharmacies",
        "provider_sources",
    ):
        op.drop_table(table)
