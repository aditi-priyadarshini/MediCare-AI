"""adverse effects reference table, plus a larger demonstration dataset

Revision ID: 0010
Revises: 0009

Adds ``ingredient_effects`` (known adverse effects per active ingredient) so the safety page can
show what to watch for, and extends the demonstration dataset from migration 0004 with more
interactions, condition contraindications and food notes.

Like 0004, everything seeded here is a DEMONSTRATION dataset: it is attributed to the same
synthetic source, has not been clinically reviewed and must not be relied on. Replace it through
/admin before any real use.
"""
import uuid
from datetime import date

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

DEMO_SOURCE = "MediCare AI demonstration dataset (synthetic, not clinically reviewed)"
DEMO_VERSION = "demo-1"
DEMO_DATE = date(2026, 11, 15)
_GUIDE = "Ask a pharmacist or the prescriber before changing anything."

# (ingredient, effect, frequency, seriousness, when to get help)
_EFFECTS = [
    ("Paracetamol", "Skin rash or other allergic reaction", "rare", "serious",
     "Get urgent help for swelling of the face or lips, trouble breathing or a severe skin reaction."),
    ("Paracetamol", "Liver harm if more than the stated daily amount is taken", "rare", "serious",
     "Get urgent help if too much has been taken, even if you feel well."),
    ("Ibuprofen", "Indigestion or stomach pain", "common", "mild", None),
    ("Ibuprofen", "Nausea", "common", "mild", None),
    ("Ibuprofen", "Raised blood pressure or fluid retention", "uncommon", "moderate", None),
    ("Ibuprofen", "Stomach bleeding or ulcer", "uncommon", "serious",
     "Get urgent help for black or bloody stools or vomiting blood."),
    ("Ibuprofen", "Wheeze or allergic reaction", "rare", "serious",
     "Get urgent help for wheezing, swelling or trouble breathing."),
    ("Aspirin", "Indigestion", "common", "mild", None),
    ("Aspirin", "Bruising or bleeding more easily", "common", "moderate", None),
    ("Aspirin", "Ringing in the ears", "uncommon", "moderate", None),
    ("Aspirin", "Wheeze in people with asthma", "uncommon", "moderate", None),
    ("Aspirin", "Stomach bleeding or ulcer", "uncommon", "serious",
     "Get urgent help for black or bloody stools or vomiting blood."),
    ("Metformin", "Nausea, diarrhoea or stomach upset", "very_common", "mild", None),
    ("Metformin", "Metallic taste", "common", "mild", None),
    ("Metformin", "Low vitamin B12 with long-term use", "uncommon", "moderate", None),
    ("Metformin", "Lactic acidosis", "rare", "serious",
     "Get urgent help for fast breathing, muscle pain, stomach pain or unusual tiredness."),
    ("Amlodipine", "Swollen ankles", "common", "mild", None),
    ("Amlodipine", "Flushing or headache", "common", "mild", None),
    ("Amlodipine", "Dizziness or tiredness", "common", "mild", None),
    ("Amlodipine", "Fast or pounding heartbeat", "uncommon", "moderate", None),
    ("Losartan", "Dizziness or light-headedness", "common", "mild", None),
    ("Losartan", "High blood potassium", "uncommon", "moderate", None),
    ("Losartan", "Swelling of the face, lips or tongue", "rare", "serious",
     "Get urgent help if this happens."),
    ("Atorvastatin", "Headache or nausea", "common", "mild", None),
    ("Atorvastatin", "Muscle aches", "common", "moderate",
     "Tell a clinician about unexplained muscle pain or weakness, especially with fever or dark urine."),
    ("Atorvastatin", "Raised liver enzymes", "uncommon", "moderate", None),
    ("Levothyroxine", "Trouble sleeping or restlessness", "common", "mild", None),
    ("Levothyroxine", "Fast or irregular heartbeat", "uncommon", "moderate", None),
    ("Levothyroxine", "Chest pain", "rare", "serious", "Get urgent help for chest pain."),
    ("Omeprazole", "Headache", "common", "mild", None),
    ("Omeprazole", "Stomach pain, nausea or diarrhoea", "common", "mild", None),
    ("Omeprazole", "Low magnesium with long-term use", "rare", "moderate", None),
    ("Pantoprazole", "Headache", "common", "mild", None),
    ("Pantoprazole", "Diarrhoea", "common", "mild", None),
    ("Pantoprazole", "Low magnesium with long-term use", "rare", "moderate", None),
    ("Cetirizine", "Drowsiness", "common", "mild", None),
    ("Cetirizine", "Dry mouth", "common", "mild", None),
    ("Cetirizine", "Headache", "common", "mild", None),
    ("Amoxicillin", "Diarrhoea", "common", "mild", None),
    ("Amoxicillin", "Nausea", "common", "mild", None),
    ("Amoxicillin", "Skin rash", "common", "moderate",
     "Tell a clinician about any new rash while taking it."),
    ("Amoxicillin", "Severe allergic reaction", "rare", "serious",
     "Get urgent help for swelling, trouble breathing or a spreading rash."),
    ("Amoxicillin", "Severe or bloody diarrhoea", "rare", "serious",
     "Tell a clinician promptly if diarrhoea is severe or does not stop."),
    ("Azithromycin", "Diarrhoea, nausea or stomach pain", "common", "mild", None),
    ("Azithromycin", "Fast or irregular heartbeat", "rare", "serious",
     "Get urgent help for fainting or a racing, irregular heartbeat."),
    ("Azithromycin", "Yellowing of the skin or eyes", "rare", "serious",
     "Tell a clinician promptly if this happens."),
    ("Salbutamol", "Shaky hands", "common", "mild", None),
    ("Salbutamol", "Fast heartbeat or palpitations", "common", "mild", None),
    ("Salbutamol", "Headache", "common", "mild", None),
    ("Salbutamol", "Low blood potassium at high doses", "uncommon", "moderate", None),
    ("Salbutamol", "Wheeze getting worse after a dose", "rare", "serious",
     "Get urgent help if breathing gets worse after using it."),
]

# (kind, ingredient, counterpart ingredient or term, severity, description)
_RULES = [
    ("drug_drug", "Omeprazole", "Levothyroxine", "moderate",
     "Acid-reducing medicines can lower how well levothyroxine is absorbed. Thyroid levels may "
     "need checking."),
    ("drug_drug", "Pantoprazole", "Levothyroxine", "moderate",
     "Acid-reducing medicines can lower how well levothyroxine is absorbed. Thyroid levels may "
     "need checking."),
    ("drug_drug", "Omeprazole", "Pantoprazole", "moderate",
     "Two acid-reducing medicines of the same type are rarely needed together."),
    ("drug_drug", "Aspirin", "Losartan", "moderate",
     "Anti-inflammatory doses of aspirin may reduce the effect of some blood pressure medicines "
     "and can affect the kidneys."),
    ("drug_condition", "Metformin", "kidney disease", "major",
     "Metformin can build up when the kidneys are not working well."),
    ("drug_condition", "Metformin", "liver disease", "moderate",
     "Liver problems can raise the risk of a build-up of lactic acid with metformin."),
    ("drug_condition", "Ibuprofen", "ulcer", "major",
     "Anti-inflammatory painkillers can cause bleeding in a stomach or gut ulcer."),
    ("drug_condition", "Aspirin", "ulcer", "major",
     "Aspirin can cause bleeding in a stomach or gut ulcer."),
    ("drug_condition", "Ibuprofen", "asthma", "moderate",
     "Anti-inflammatory painkillers can trigger wheeze in some people with asthma."),
    ("drug_condition", "Aspirin", "asthma", "moderate",
     "Aspirin can trigger wheeze in some people with asthma."),
    ("drug_condition", "Aspirin", "kidney disease", "moderate",
     "Anti-inflammatory doses of aspirin can affect kidney function."),
    ("drug_condition", "Ibuprofen", "heart failure", "major",
     "Anti-inflammatory painkillers can cause fluid retention and may make heart failure worse."),
    ("drug_condition", "Paracetamol", "liver disease", "moderate",
     "The liver processes paracetamol, so the usual daily limit may not apply."),
    ("drug_condition", "Atorvastatin", "liver disease", "major",
     "Statins are not usually used when the liver is diseased or liver tests are raised."),
    ("drug_condition", "Losartan", "pregnancy", "contraindicated",
     "This type of blood pressure medicine can harm an unborn baby."),
    ("drug_condition", "Atorvastatin", "pregnancy", "contraindicated",
     "Statins are not recommended in pregnancy."),
    ("drug_condition", "Ibuprofen", "pregnancy", "major",
     "Anti-inflammatory painkillers are generally avoided in pregnancy, especially later on."),
    ("drug_condition", "Levothyroxine", "heart disease", "moderate",
     "Thyroid hormone can put extra strain on the heart, so the dose is usually raised slowly."),
    ("drug_food", "Paracetamol", "alcohol", "moderate",
     "Regular or heavy alcohol use increases the risk of liver harm with paracetamol."),
    ("drug_food", "Metformin", "alcohol", "moderate",
     "Heavy alcohol use raises the risk of lactic acid build-up with metformin."),
    ("drug_food", "Ibuprofen", "alcohol", "moderate",
     "Alcohol together with anti-inflammatory painkillers raises the risk of stomach bleeding."),
    ("drug_food", "Aspirin", "alcohol", "moderate",
     "Alcohol together with aspirin raises the risk of stomach bleeding."),
    ("drug_food", "Losartan", "potassium", "moderate",
     "Potassium supplements and salt substitutes can push potassium levels too high."),
    ("drug_food", "Amlodipine", "grapefruit", "minor",
     "Grapefruit juice may slightly raise the level of this medicine."),
    ("drug_food", "Azithromycin", "antacid", "minor",
     "Antacids with aluminium or magnesium can lower absorption if taken close together. "
     "Timing matters."),
]


def upgrade() -> None:
    op.create_table(
        "ingredient_effects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_id", sa.Uuid(), nullable=False),
        sa.Column("effect", sa.Text(), nullable=False),
        sa.Column("frequency", sa.String(length=12), nullable=False),
        sa.Column("seriousness", sa.String(length=10), nullable=False),
        sa.Column("when_to_get_help", sa.Text(), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_version", sa.String(length=32), nullable=False),
        sa.Column("reviewed_at", sa.Date(), nullable=False),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("frequency IN ('very_common','common','uncommon','rare','unknown')", name=op.f("ck_ingredient_effects_frequency_valid")),
        sa.CheckConstraint("seriousness IN ('mild','moderate','serious')", name=op.f("ck_ingredient_effects_seriousness_valid")),
        sa.CheckConstraint("status IN ('active','retired')", name=op.f("ck_ingredient_effects_status_valid")),
        sa.ForeignKeyConstraint(["ingredient_id"], ["active_ingredients.id"], name=op.f("fk_ingredient_effects_ingredient_id_active_ingredients"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_id"], ["reference_sources.id"], name=op.f("fk_ingredient_effects_source_id_reference_sources"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], name=op.f("fk_ingredient_effects_created_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingredient_effects")),
    )
    op.create_index(op.f("ix_ingredient_effects_source_id"), "ingredient_effects", ["source_id"], unique=False)
    op.create_index("ix_ingredient_effects_lookup", "ingredient_effects", ["status", "ingredient_id"], unique=False)
    op.create_index(
        "uq_ingredient_effects_active",
        "ingredient_effects",
        ["ingredient_id", "effect", "source_id", "source_version"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    _seed()


def _seed() -> None:
    conn = op.get_bind()
    source_id = conn.execute(
        sa.text("SELECT id FROM reference_sources WHERE name = :n AND version = :v"),
        {"n": DEMO_SOURCE, "v": DEMO_VERSION},
    ).scalar()
    if source_id is None:  # the demo source was removed: nothing to attach the demo data to
        return
    ids = {
        name: iid
        for iid, name in conn.execute(sa.text("SELECT id, name FROM active_ingredients"))
    }
    for ing, effect, freq, serious, help_text in _EFFECTS:
        if ing not in ids:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO ingredient_effects (id, ingredient_id, effect, frequency, seriousness, "
                "when_to_get_help, source_id, source_version, reviewed_at, jurisdiction, status) "
                "VALUES (:id, :ing, :effect, :freq, :ser, :help, :src, :ver, :rev, 'IN', 'active')"
            ),
            {"id": uuid.uuid4(), "ing": ids[ing], "effect": effect, "freq": freq, "ser": serious,
             "help": help_text, "src": source_id, "ver": DEMO_VERSION, "rev": DEMO_DATE},
        )
    for kind, ing, other, severity, description in _RULES:
        if ing not in ids or (kind == "drug_drug" and other not in ids):
            continue
        a, b, term = ids[ing], None, None
        if kind == "drug_drug":
            a, b = sorted([ids[ing], ids[other]])
        else:
            term = other
        conn.execute(
            sa.text(
                "INSERT INTO safety_rules (id, kind, ingredient_id, counterpart_ingredient_id, "
                "counterpart_term, severity, description, clinical_significance, guidance, "
                "source_id, source_version, reviewed_at, jurisdiction, status) VALUES "
                "(:id, :kind, :a, :b, :term, :sev, :d, 'Demo rule.', :g, :src, :ver, :rev, 'IN', 'active')"
            ),
            {"id": uuid.uuid4(), "kind": kind, "a": a, "b": b, "term": term, "sev": severity,
             "d": description, "g": _GUIDE, "src": source_id, "ver": DEMO_VERSION,
             "rev": DEMO_DATE},
        )


def downgrade() -> None:
    conn = op.get_bind()
    ids = {
        name: iid
        for iid, name in conn.execute(sa.text("SELECT id, name FROM active_ingredients"))
    }
    for kind, ing, other, _severity, description in _RULES:
        if ing not in ids:
            continue
        if kind == "drug_drug":
            if other not in ids:
                continue
            a, b = sorted([ids[ing], ids[other]])
            conn.execute(
                sa.text(
                    "DELETE FROM safety_rules WHERE kind = 'drug_drug' AND ingredient_id = :a "
                    "AND counterpart_ingredient_id = :b AND description = :d AND source_version = :v"
                ),
                {"a": a, "b": b, "d": description, "v": DEMO_VERSION},
            )
        else:
            conn.execute(
                sa.text(
                    "DELETE FROM safety_rules WHERE kind = :k AND ingredient_id = :a "
                    "AND counterpart_term = :t AND description = :d AND source_version = :v"
                ),
                {"k": kind, "a": ids[ing], "t": other, "d": description, "v": DEMO_VERSION},
            )
    op.drop_table("ingredient_effects")
