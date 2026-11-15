"""medicine safety: sources, ingredients, curated rules, prices, adverse event reports

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-15 12:00:00.000000

The seed below is a DEMONSTRATION dataset. It is synthetic, has not been clinically reviewed
and must not be relied on. It exists so the checks have something to find and so the "no
matching record" and "insufficient data" paths are visible. Replace it through /admin before
any real use.
"""
import uuid
from datetime import date

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

DEMO_SOURCE = "MediCare AI demonstration dataset (synthetic, not clinically reviewed)"
DEMO_VERSION = "demo-1"
DEMO_DATE = date(2026, 11, 15)

# (ingredient, drug class, allergy terms)
_INGREDIENTS = [
    ("Paracetamol", None, ["acetaminophen"]),
    ("Ibuprofen", "nsaid", ["nsaid"]),
    ("Aspirin", "nsaid", ["nsaid", "salicylate"]),
    ("Metformin", None, []),
    ("Amlodipine", None, []),
    ("Losartan", None, []),
    ("Atorvastatin", "statin", []),
    ("Levothyroxine", None, []),
    ("Omeprazole", None, []),
    ("Pantoprazole", None, []),
    ("Cetirizine", None, []),
    ("Amoxicillin", "penicillin", ["penicillin"]),
    ("Azithromycin", "macrolide", ["macrolide"]),
    ("Salbutamol", None, ["albuterol"]),
]
# medicine name -> (ingredient, value, unit, route, release type)
_COMPOSITION = {
    "Paracetamol": ("Paracetamol", 500, "mg", "oral", "immediate"),
    "Ibuprofen": ("Ibuprofen", 400, "mg", "oral", "immediate"),
    "Aspirin": ("Aspirin", 75, "mg", "oral", None),  # release type deliberately left unknown
    "Metformin": ("Metformin", 500, "mg", "oral", "immediate"),
    "Amlodipine": ("Amlodipine", 5, "mg", "oral", "immediate"),
    "Losartan": ("Losartan", 50, "mg", "oral", "immediate"),
    "Atorvastatin": ("Atorvastatin", 10, "mg", "oral", "immediate"),
    "Levothyroxine": ("Levothyroxine", 50, "mcg", "oral", "immediate"),
    "Omeprazole": ("Omeprazole", 20, "mg", "oral", "delayed"),
    "Pantoprazole": ("Pantoprazole", 40, "mg", "oral", "delayed"),
    "Cetirizine": ("Cetirizine", 10, "mg", "oral", "immediate"),
    "Amoxicillin": ("Amoxicillin", 500, "mg", "oral", "immediate"),
    "Azithromycin": ("Azithromycin", 500, "mg", "oral", "immediate"),
    "Salbutamol": ("Salbutamol", 100, "mcg", "inhalation", "immediate"),
}
_GUIDE = "Ask a pharmacist or the prescriber before changing anything."
# (kind, ingredient, counterpart ingredient or term, severity, description, significance)
_RULES = [
    ("drug_drug", "Ibuprofen", "Aspirin", "moderate",
     "Taking an anti-inflammatory painkiller together with aspirin may increase stomach and "
     "bleeding risk.", "Demo rule."),
    ("drug_drug", "Ibuprofen", "Losartan", "moderate",
     "Anti-inflammatory painkillers may reduce the effect of some blood pressure medicines and "
     "can affect the kidneys.", "Demo rule."),
    ("drug_condition", "Ibuprofen", "kidney disease", "major",
     "Anti-inflammatory painkillers can affect kidney function.", "Demo rule."),
    ("drug_food", "Atorvastatin", "grapefruit", "minor",
     "Large amounts of grapefruit juice may raise the level of this medicine.", "Demo rule."),
    ("drug_food", "Levothyroxine", "calcium", "moderate",
     "Calcium products can reduce absorption if taken close together. Timing matters.",
     "Demo rule."),
]


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    sources = op.create_table(
        "reference_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("licence", sa.Text(), nullable=True),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("reviewed_at", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reference_sources")),
        sa.UniqueConstraint("name", "version", name="uq_reference_sources_identity"),
    )
    op.create_table(
        "active_ingredients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("drug_class", sa.Text(), nullable=True),
        sa.Column("allergy_terms", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["reference_sources.id"], name=op.f("fk_active_ingredients_source_id_reference_sources"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_active_ingredients")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_active_ingredients_normalized_name")),
    )
    op.create_index(op.f("ix_active_ingredients_source_id"), "active_ingredients", ["source_id"], unique=False)

    op.add_column("medicines", sa.Column("route", sa.String(length=24), nullable=True))
    op.add_column("medicines", sa.Column("release_type", sa.String(length=24), nullable=True))

    op.create_table(
        "medicine_ingredients",
        sa.Column("medicine_id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_id", sa.Uuid(), nullable=False),
        sa.Column("strength_value", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("strength_unit", sa.String(length=16), nullable=True),
        sa.ForeignKeyConstraint(["medicine_id"], ["medicines.id"], name=op.f("fk_medicine_ingredients_medicine_id_medicines"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ingredient_id"], ["active_ingredients.id"], name=op.f("fk_medicine_ingredients_ingredient_id_active_ingredients"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("medicine_id", "ingredient_id", name=op.f("pk_medicine_ingredients")),
    )
    op.create_index(op.f("ix_medicine_ingredients_ingredient_id"), "medicine_ingredients", ["ingredient_id"], unique=False)

    op.create_table(
        "safety_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("ingredient_id", sa.Uuid(), nullable=False),
        sa.Column("counterpart_ingredient_id", sa.Uuid(), nullable=True),
        sa.Column("counterpart_term", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("clinical_significance", sa.Text(), nullable=True),
        sa.Column("guidance", sa.Text(), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_version", sa.String(length=32), nullable=False),
        sa.Column("reviewed_at", sa.Date(), nullable=False),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('drug_drug','drug_food','drug_condition')", name=op.f("ck_safety_rules_kind_valid")),
        sa.CheckConstraint("severity IN ('unknown','minor','moderate','major','contraindicated')", name=op.f("ck_safety_rules_severity_valid")),
        sa.CheckConstraint("status IN ('active','retired')", name=op.f("ck_safety_rules_status_valid")),
        sa.CheckConstraint(
            "(kind = 'drug_drug' AND counterpart_ingredient_id IS NOT NULL "
            "AND counterpart_term IS NULL AND ingredient_id < counterpart_ingredient_id) "
            "OR (kind <> 'drug_drug' AND counterpart_ingredient_id IS NULL "
            "AND counterpart_term IS NOT NULL)",
            name=op.f("ck_safety_rules_shape_matches_kind"),
        ),
        sa.ForeignKeyConstraint(["ingredient_id"], ["active_ingredients.id"], name=op.f("fk_safety_rules_ingredient_id_active_ingredients"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["counterpart_ingredient_id"], ["active_ingredients.id"], name=op.f("fk_safety_rules_counterpart_ingredient_id_active_ingredients"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_id"], ["reference_sources.id"], name=op.f("fk_safety_rules_source_id_reference_sources"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], name=op.f("fk_safety_rules_created_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_safety_rules")),
    )
    op.create_index(op.f("ix_safety_rules_counterpart_ingredient_id"), "safety_rules", ["counterpart_ingredient_id"], unique=False)
    op.create_index(op.f("ix_safety_rules_source_id"), "safety_rules", ["source_id"], unique=False)
    op.create_index("ix_safety_rules_lookup", "safety_rules", ["kind", "status", "ingredient_id"], unique=False)
    op.create_index(
        "uq_safety_rules_active_pair", "safety_rules",
        ["ingredient_id", "counterpart_ingredient_id", "source_id", "source_version"],
        unique=True, postgresql_where=sa.text("kind = 'drug_drug' AND status = 'active'"),
    )
    op.create_index(
        "uq_safety_rules_active_term", "safety_rules",
        ["kind", "ingredient_id", "counterpart_term", "source_id", "source_version"],
        unique=True, postgresql_where=sa.text("kind <> 'drug_drug' AND status = 'active'"),
    )

    op.create_table(
        "medicine_prices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("medicine_id", sa.Uuid(), nullable=False),
        sa.Column("source_name", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("pack_quantity", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("pack_unit", sa.String(length=16), nullable=False),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("price > 0", name=op.f("ck_medicine_prices_price_positive")),
        sa.CheckConstraint("pack_quantity > 0", name=op.f("ck_medicine_prices_pack_positive")),
        sa.ForeignKeyConstraint(["medicine_id"], ["medicines.id"], name=op.f("fk_medicine_prices_medicine_id_medicines"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], name=op.f("fk_medicine_prices_created_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_medicine_prices")),
    )
    op.create_index("ix_medicine_prices_medicine", "medicine_prices", ["medicine_id", "observed_at"], unique=False)

    op.create_table(
        "adverse_event_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_user_id", sa.Uuid(), nullable=False),
        sa.Column("medication_id", sa.Uuid(), nullable=True),
        sa.Column("medication_name", sa.Text(), nullable=False),
        sa.Column("reaction", sa.Text(), nullable=False),
        sa.Column("onset_date", sa.Date(), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("record_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        *_ts(),
        sa.CheckConstraint("severity IN ('mild','moderate','severe')", name=op.f("ck_adverse_event_reports_severity_valid")),
        sa.CheckConstraint("outcome IN ('recovered','ongoing','unknown')", name=op.f("ck_adverse_event_reports_outcome_valid")),
        sa.CheckConstraint("status IN ('submitted','entered_in_error')", name=op.f("ck_adverse_event_reports_status_valid")),
        sa.ForeignKeyConstraint(["patient_user_id"], ["users.id"], name=op.f("fk_adverse_event_reports_patient_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], name=op.f("fk_adverse_event_reports_medication_id_medications"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["record_id"], ["health_records.id"], name=op.f("fk_adverse_event_reports_record_id_health_records"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_adverse_event_reports")),
    )
    op.create_index("ix_adverse_event_reports_patient", "adverse_event_reports", ["patient_user_id", "created_at"], unique=False)
    op.create_index(op.f("ix_adverse_event_reports_medication_id"), "adverse_event_reports", ["medication_id"], unique=False)
    op.create_index(op.f("ix_adverse_event_reports_record_id"), "adverse_event_reports", ["record_id"], unique=False)

    _seed(sources)


def _seed(sources) -> None:
    conn = op.get_bind()
    source_id = uuid.uuid4()
    op.bulk_insert(sources, [{
        "id": source_id, "name": DEMO_SOURCE, "publisher": "MediCare AI project", "url": None,
        "licence": "Synthetic demo data", "jurisdiction": "IN", "version": DEMO_VERSION,
        "reviewed_at": DEMO_DATE,
    }])
    ingredient_ids = {name: uuid.uuid4() for name, _, _ in _INGREDIENTS}
    for name, drug_class, terms in _INGREDIENTS:
        conn.execute(
            sa.text(
                "INSERT INTO active_ingredients (id, name, normalized_name, drug_class, "
                "allergy_terms, source_id) VALUES (:id, :name, :norm, :cls, CAST(:terms AS text[]), :src)"
            ),
            {"id": ingredient_ids[name], "name": name, "norm": name.lower(), "cls": drug_class,
             "terms": terms, "src": source_id},
        )
    for med_name, (ing, value, unit, route, release) in _COMPOSITION.items():
        for (mid,) in conn.execute(sa.text("SELECT id FROM medicines WHERE name = :n"), {"n": med_name}):
            conn.execute(
                sa.text("INSERT INTO medicine_ingredients (medicine_id, ingredient_id, strength_value, strength_unit) VALUES (:m, :i, :v, :u)"),
                {"m": mid, "i": ingredient_ids[ing], "v": value, "u": unit},
            )
            conn.execute(
                sa.text("UPDATE medicines SET route = :r, release_type = :t WHERE id = :m"),
                {"r": route, "t": release, "m": mid},
            )
    for kind, ing, other, severity, description, significance in _RULES:
        a, b = ingredient_ids[ing], None
        term = None
        if kind == "drug_drug":
            a, b = sorted([ingredient_ids[ing], ingredient_ids[other]])
        else:
            term = other
        conn.execute(
            sa.text(
                "INSERT INTO safety_rules (id, kind, ingredient_id, counterpart_ingredient_id, "
                "counterpart_term, severity, description, clinical_significance, guidance, "
                "source_id, source_version, reviewed_at, jurisdiction, status) VALUES "
                "(:id, :kind, :a, :b, :term, :sev, :d, :sig, :g, :src, :ver, :rev, 'IN', 'active')"
            ),
            {"id": uuid.uuid4(), "kind": kind, "a": a, "b": b, "term": term, "sev": severity,
             "d": description, "sig": significance, "g": _GUIDE, "src": source_id,
             "ver": DEMO_VERSION, "rev": DEMO_DATE},
        )


def downgrade() -> None:
    for table in (
        "adverse_event_reports",
        "medicine_prices",
        "safety_rules",
        "medicine_ingredients",
    ):
        op.drop_table(table)
    op.drop_column("medicines", "release_type")
    op.drop_column("medicines", "route")
    op.drop_table("active_ingredients")
    op.drop_table("reference_sources")
