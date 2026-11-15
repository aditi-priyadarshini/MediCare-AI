"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-11-14 16:58:21.106737
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.email is CITEXT (DATABASE.md): case-insensitive uniqueness enforced by the database.
    op.execute('CREATE EXTENSION IF NOT EXISTS citext')
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=True),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('phone_e164', sa.Text(), nullable=True),
    sa.Column('phone_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role IN ('patient','admin','doctor','caregiver')", name=op.f('ck_users_role_valid')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('audit_logs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('actor_user_id', sa.Uuid(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('resource_type', sa.String(length=64), nullable=True),
    sa.Column('resource_id', sa.Text(), nullable=True),
    sa.Column('ip', sa.String(length=64), nullable=True),
    sa.Column('request_id', sa.String(length=64), nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], name=op.f('fk_audit_logs_actor_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index('ix_audit_logs_actor_created', 'audit_logs', ['actor_user_id', 'created_at'], unique=False)
    op.create_table('emergency_contacts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('patient_user_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('relationship', sa.Text(), nullable=True),
    sa.Column('phone_e164', sa.String(length=16), nullable=False),
    sa.Column('email', sa.Text(), nullable=True),
    sa.Column('is_primary', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['patient_user_id'], ['users.id'], name=op.f('fk_emergency_contacts_patient_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_emergency_contacts'))
    )
    op.create_index('ix_emergency_contacts_patient', 'emergency_contacts', ['patient_user_id'], unique=False)
    op.create_table('oauth_accounts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('provider_subject', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_oauth_accounts_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_oauth_accounts')),
    sa.UniqueConstraint('provider', 'provider_subject', name=op.f('uq_oauth_accounts_provider'))
    )
    op.create_index(op.f('ix_oauth_accounts_user_id'), 'oauth_accounts', ['user_id'], unique=False)
    op.create_table('otp_challenges',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=True),
    sa.Column('destination_hash', sa.Text(), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('code_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('attempt_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_otp_challenges_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_otp_challenges'))
    )
    op.create_index(op.f('ix_otp_challenges_user_id'), 'otp_challenges', ['user_id'], unique=False)
    op.create_table('patient_allergies',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('patient_user_id', sa.Uuid(), nullable=False),
    sa.Column('substance', sa.Text(), nullable=False),
    sa.Column('reaction', sa.Text(), nullable=True),
    sa.Column('severity', sa.String(length=16), nullable=True),
    sa.Column('verification_status', sa.String(length=24), nullable=False),
    sa.Column('source', sa.String(length=24), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("severity IS NULL OR severity IN ('mild','moderate','severe','unknown')", name=op.f('ck_patient_allergies_severity_valid')),
    sa.CheckConstraint("status IN ('active','entered_in_error')", name=op.f('ck_patient_allergies_status_valid')),
    sa.CheckConstraint("verification_status IN ('patient_reported','clinician_confirmed','imported','unverified')", name=op.f('ck_patient_allergies_verification_valid')),
    sa.ForeignKeyConstraint(['patient_user_id'], ['users.id'], name=op.f('fk_patient_allergies_patient_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_patient_allergies'))
    )
    op.create_index('ix_patient_allergies_patient', 'patient_allergies', ['patient_user_id'], unique=False)
    op.create_table('patient_conditions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('patient_user_id', sa.Uuid(), nullable=False),
    sa.Column('condition_code', sa.Text(), nullable=True),
    sa.Column('display_name', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('verification_status', sa.String(length=24), nullable=False),
    sa.Column('onset_date', sa.Date(), nullable=True),
    sa.Column('resolved_date', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('active','resolved','inactive','entered_in_error')", name=op.f('ck_patient_conditions_status_valid')),
    sa.CheckConstraint("verification_status IN ('patient_reported','clinician_confirmed','imported','unverified')", name=op.f('ck_patient_conditions_verification_valid')),
    sa.ForeignKeyConstraint(['patient_user_id'], ['users.id'], name=op.f('fk_patient_conditions_patient_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_patient_conditions'))
    )
    op.create_index('ix_patient_conditions_patient', 'patient_conditions', ['patient_user_id'], unique=False)
    op.create_table('patient_profiles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('display_name', sa.Text(), nullable=False),
    sa.Column('date_of_birth', sa.Date(), nullable=True),
    sa.Column('preferred_language', sa.String(length=8), nullable=False),
    sa.Column('timezone', sa.Text(), nullable=False),
    sa.Column('height_cm', sa.Numeric(precision=5, scale=1), nullable=True),
    sa.Column('weight_kg', sa.Numeric(precision=5, scale=1), nullable=True),
    sa.Column('blood_group', sa.String(length=3), nullable=True),
    sa.Column('blood_group_verification_status', sa.String(length=24), nullable=False),
    sa.Column('accessibility_preferences', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_patient_profiles_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_patient_profiles')),
    sa.UniqueConstraint('user_id', name=op.f('uq_patient_profiles_user_id'))
    )
    op.create_table('sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('session_token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions')),
    sa.UniqueConstraint('session_token_hash', name=op.f('uq_sessions_session_token_hash'))
    )
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('user_consents',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('consent_type', sa.String(length=32), nullable=False),
    sa.Column('policy_version', sa.String(length=32), nullable=False),
    sa.Column('granted', sa.Boolean(), nullable=False),
    sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_consents_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_consents'))
    )
    op.create_index('ix_user_consents_user_type', 'user_consents', ['user_id', 'consent_type'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_user_consents_user_type', table_name='user_consents')
    op.drop_table('user_consents')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_table('patient_profiles')
    op.drop_index('ix_patient_conditions_patient', table_name='patient_conditions')
    op.drop_table('patient_conditions')
    op.drop_index('ix_patient_allergies_patient', table_name='patient_allergies')
    op.drop_table('patient_allergies')
    op.drop_index(op.f('ix_otp_challenges_user_id'), table_name='otp_challenges')
    op.drop_table('otp_challenges')
    op.drop_index(op.f('ix_oauth_accounts_user_id'), table_name='oauth_accounts')
    op.drop_table('oauth_accounts')
    op.drop_index('ix_emergency_contacts_patient', table_name='emergency_contacts')
    op.drop_table('emergency_contacts')
    op.drop_index('ix_audit_logs_actor_created', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_table('users')
