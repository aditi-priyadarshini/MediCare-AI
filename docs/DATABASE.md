# Database Design — PostgreSQL

## 1. Modelling principles

- UUID primary keys for application entities.
- UTC timestamps stored consistently; preserve patient timezone for schedules.
- `created_at`, `updated_at` on mutable entities.
- Foreign keys and check constraints for integrity.
- Use `ON DELETE RESTRICT` for clinical history that must not disappear accidentally.
- Prefer archive/status transitions over hard deletion for medication and observation history.
- Every patient-owned resource must have a clear ownership path.
- Store units and source metadata with clinical observations.
- Do not use a single unstructured JSON blob as the health record.

## 2. Core entity groups

### Identity and consent
- `users`
- `oauth_accounts`
- `sessions`
- `otp_challenges`
- `patient_profiles`
- `caregiver_grants`
- `user_consents`
- `emergency_contacts`

### Health profile and history
- `conditions`
- `patient_conditions`
- `allergies`
- `patient_allergies`
- `patient_vitals`
- `medical_events`

### Documents and laboratory results
- `medical_documents`
- `document_extractions`
- `lab_reports`
- `lab_observations`
- `observation_reference_ranges`

### Medicine catalogue and medication use
- `medicines`
- `active_ingredients`
- `medicine_ingredients`
- `medicine_products`
- `medication_requests`
- `medication_statements`
- `medication_schedules`
- `dose_logs`
- `medicine_batches`
- `refill_events`

### Safety reference data
- `drug_interactions`
- `drug_food_interactions`
- `drug_condition_warnings`
- `drug_allergy_warnings`
- `adverse_effects`
- `adverse_event_reports`
- `reference_sources`
- `reference_data_versions`

### Discovery and care
- `pharmacies`
- `pharmacy_inventory_snapshots`
- `doctors`
- `doctor_specialties`
- `doctor_credentials`
- `appointments`
- `provider_sources`

### AI and sharing
- `chat_sessions`
- `chat_messages`
- `chat_context_access_logs`
- `ai_evidence_items`
- `medical_share_grants`
- `medical_share_items`
- `medical_share_access_logs`

### Diet, emergency and platform
- `diet_preferences`
- `diet_plans`
- `diet_plan_items`
- `ambulance_providers`
- `emergency_requests`
- `ambulance_bookings`
- `ambulance_tracking_events`
- `notifications`
- `feedback`
- `audit_logs`

## 3. Key table definitions

The following is the logical schema. Implement exact SQLAlchemy models and Alembic migrations from this contract.

### users
- `id UUID PK`
- `email CITEXT UNIQUE NOT NULL`
- `password_hash TEXT NULL` (null for OAuth-only account until password is set)
- `role ENUM(patient, admin, doctor, caregiver)`
- `email_verified_at TIMESTAMPTZ NULL`
- `phone_e164 TEXT NULL`
- `phone_verified_at TIMESTAMPTZ NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at`, `updated_at`

### oauth_accounts
- `id UUID PK`
- `user_id UUID FK users`
- `provider TEXT`
- `provider_subject TEXT`
- unique `(provider, provider_subject)`

### sessions
- `id UUID PK`
- `user_id UUID FK users`
- `session_token_hash TEXT UNIQUE`
- `expires_at TIMESTAMPTZ`
- `revoked_at TIMESTAMPTZ NULL`
- `created_at`

### otp_challenges
- `id UUID PK`
- `user_id UUID FK users NULL`
- `destination_hash TEXT`
- `purpose TEXT`
- `code_hash TEXT`
- `expires_at TIMESTAMPTZ`
- `consumed_at TIMESTAMPTZ NULL`
- `attempt_count INTEGER`
- `created_at`

Never store OTP in plaintext. Apply rate limits outside and inside the application.

### patient_profiles
- `id UUID PK`
- `user_id UUID UNIQUE FK users`
- `display_name TEXT`
- `date_of_birth DATE NULL`
- `preferred_language TEXT DEFAULT 'en'`
- `timezone TEXT DEFAULT 'Asia/Kolkata'`
- `height_cm NUMERIC NULL`
- `weight_kg NUMERIC NULL`
- `blood_group TEXT NULL`
- `blood_group_verification_status TEXT`
- `accessibility_preferences JSONB`
- `created_at`, `updated_at`

### patient_conditions
- `id UUID PK`
- `patient_user_id UUID FK users`
- `condition_code TEXT NULL`
- `display_name TEXT`
- `status TEXT`
- `verification_status TEXT` (patient_reported, clinician_confirmed, imported, unverified)
- `onset_date DATE NULL`
- `resolved_date DATE NULL`
- `source_document_id UUID NULL`
- `created_at`, `updated_at`

### patient_allergies
- `id UUID PK`
- `patient_user_id UUID FK users`
- `substance TEXT`
- `reaction TEXT NULL`
- `severity TEXT NULL`
- `verification_status TEXT`
- `source TEXT`
- `created_at`, `updated_at`

### patient_vitals
- `id UUID PK`
- `patient_user_id UUID FK users`
- `vital_type TEXT`
- `value NUMERIC`
- `unit TEXT`
- `measured_at TIMESTAMPTZ`
- `source_type TEXT`
- `verification_status TEXT`
- `notes TEXT NULL`

### medical_documents
- `id UUID PK`
- `patient_user_id UUID FK users`
- `document_type TEXT`
- `original_filename TEXT`
- `storage_key TEXT`
- `mime_type TEXT`
- `size_bytes BIGINT`
- `document_date DATE NULL`
- `uploaded_by UUID FK users`
- `processing_status TEXT`
- `review_status TEXT`
- `created_at`

Storage key must not be a public URL. Validate MIME by content, scan uploads and enforce size limits.

### lab_reports
- `id UUID PK`
- `patient_user_id UUID FK users`
- `document_id UUID FK medical_documents`
- `laboratory_name TEXT NULL`
- `report_date DATE`
- `status TEXT`
- `created_at`

### lab_observations
- `id UUID PK`
- `patient_user_id UUID FK users`
- `lab_report_id UUID FK lab_reports NULL`
- `test_code TEXT NULL`
- `test_name TEXT`
- `value_numeric NUMERIC NULL`
- `value_text TEXT NULL`
- `unit TEXT NULL`
- `reference_low NUMERIC NULL`
- `reference_high NUMERIC NULL`
- `reference_text TEXT NULL`
- `observed_at TIMESTAMPTZ`
- `specimen TEXT NULL`
- `source_document_id UUID FK medical_documents NULL`
- `verification_status TEXT`
- `created_at`

Never compare observations with incompatible test codes, methods or units without a documented normalization rule.

### medicines
- `id UUID PK`
- `canonical_name TEXT`
- `generic_name TEXT NULL`
- `dosage_form TEXT NULL`
- `route TEXT NULL`
- `jurisdiction TEXT`
- `source_id UUID FK reference_sources`
- `source_identifier TEXT NULL`
- `created_at`, `updated_at`

### active_ingredients
- `id UUID PK`
- `name TEXT UNIQUE`
- `normalized_name TEXT`
- `external_identifier TEXT NULL`

### medicine_ingredients
- `medicine_id UUID FK medicines`
- `ingredient_id UUID FK active_ingredients`
- `strength_value NUMERIC NULL`
- `strength_unit TEXT NULL`
- PK `(medicine_id, ingredient_id)`

### medicine_products
- `id UUID PK`
- `medicine_id UUID FK medicines`
- `brand_name TEXT NULL`
- `manufacturer TEXT NULL`
- `pack_description TEXT NULL`
- `barcode TEXT NULL`
- `jurisdiction TEXT`
- `source_id UUID FK reference_sources`
- `verification_status TEXT`

### medication_requests
Represents a prescription/order.
- `id UUID PK`
- `patient_user_id UUID FK users`
- `medicine_product_id UUID FK medicine_products NULL`
- `prescriber_name TEXT NULL`
- `instructions TEXT`
- `dose_value NUMERIC NULL`
- `dose_unit TEXT NULL`
- `route TEXT NULL`
- `start_date DATE NULL`
- `end_date DATE NULL`
- `prescribed_at TIMESTAMPTZ NULL`
- `source_document_id UUID NULL`
- `status TEXT`

### medication_statements
Represents what the patient reports taking.
- `id UUID PK`
- `patient_user_id UUID FK users`
- `medication_request_id UUID FK medication_requests NULL`
- `medicine_product_id UUID FK medicine_products NULL`
- `patient_entered_name TEXT NULL`
- `dose_value NUMERIC NULL`
- `dose_unit TEXT NULL`
- `frequency_text TEXT NULL`
- `status TEXT`
- `start_date DATE NULL`
- `end_date DATE NULL`
- `recorded_source TEXT`
- `created_at`, `updated_at`

### medication_schedules
- `id UUID PK`
- `medication_statement_id UUID FK medication_statements`
- `local_time TIME`
- `timezone TEXT`
- `days_of_week SMALLINT[]`
- `start_date DATE`
- `end_date DATE NULL`
- `is_active BOOLEAN`
- `created_at`, `updated_at`

### dose_logs
- `id UUID PK`
- `medication_statement_id UUID FK medication_statements`
- `schedule_id UUID FK medication_schedules NULL`
- `scheduled_at TIMESTAMPTZ`
- `status TEXT` (taken, skipped, missed, delayed, unknown)
- `recorded_at TIMESTAMPTZ`
- `recorded_by UUID FK users`
- `notes TEXT NULL`
- Unique idempotency key for a schedule occurrence.

### medicine_batches
- `id UUID PK`
- `patient_user_id UUID FK users`
- `medicine_product_id UUID FK medicine_products NULL`
- `batch_number TEXT NULL`
- `manufacture_date DATE NULL`
- `expiry_date DATE NULL`
- `quantity NUMERIC NULL`
- `quantity_unit TEXT NULL`
- `verification_status TEXT`
- `verification_source TEXT NULL`
- `created_at`

### drug_interactions
- `id UUID PK`
- `ingredient_a UUID FK active_ingredients`
- `ingredient_b UUID FK active_ingredients`
- `severity TEXT`
- `description TEXT`
- `clinical_significance TEXT NULL`
- `recommended_action TEXT NULL`
- `source_id UUID FK reference_sources`
- `source_version TEXT`
- `reviewed_at DATE`
- `jurisdiction TEXT`
- Unique canonical ingredient pair + source/version.

Store pairs in canonical order to avoid duplicate A/B and B/A records.

### adverse_event_reports
- `id UUID PK`
- `patient_user_id UUID FK users`
- `medication_statement_id UUID FK medication_statements NULL`
- `reaction_description TEXT`
- `onset_at TIMESTAMPTZ NULL`
- `patient_reported_severity TEXT`
- `medical_attention_sought BOOLEAN NULL`
- `document_id UUID FK medical_documents NULL`
- `status TEXT`
- `created_at`

### reference_sources
- `id UUID PK`
- `name TEXT`
- `source_url TEXT NULL`
- `jurisdiction TEXT`
- `license_name TEXT NULL`
- `license_url TEXT NULL`
- `last_synced_at TIMESTAMPTZ NULL`
- `data_limitations TEXT NULL`

### chat_sessions / chat_messages
`chat_sessions`: `id`, `patient_user_id`, `title`, `language`, `context_mode`, `created_at`.  
`chat_messages`: `id`, `session_id`, `role`, `content`, `created_at`, `safety_classification`, `model_metadata`.  
`ai_evidence_items`: `id`, `message_id`, `source_type`, `source_record_id`, `source_label`, `recorded_at`, `excerpt_hash`.

Avoid copying whole medical reports into chat messages. Store references to evidence items.

### medical_share_grants
- `id UUID PK`
- `patient_user_id UUID FK users`
- `recipient_email_hash TEXT NULL`
- `recipient_user_id UUID FK users NULL`
- `token_hash TEXT UNIQUE`
- `expires_at TIMESTAMPTZ`
- `revoked_at TIMESTAMPTZ NULL`
- `created_at`

### medical_share_items
- `id UUID PK`
- `share_grant_id UUID FK medical_share_grants`
- `resource_type TEXT`
- `resource_id UUID`
- `permission TEXT` (view, download)
- `created_at`

### medical_share_access_logs
- `id UUID PK`
- `share_grant_id UUID FK medical_share_grants`
- `actor_user_id UUID FK users NULL`
- `action TEXT`
- `ip_hash TEXT NULL`
- `created_at`

### pharmacies / inventory snapshots
`pharmacies`: provider identity, name, address, lat/lon, phone, hours, source, verification status.  
`pharmacy_inventory_snapshots`: pharmacy, product, availability status, price, pack size, currency, source timestamp, received timestamp.  
Inventory must expire/stale according to provider-specific policy.

### doctors / credentials
`doctors`: display name, specialty references, clinic, location, provider source, verification status.  
`doctor_credentials`: qualification, registration number, issuing authority, verification source, verified timestamp. Protect registration data and show provenance.

### emergency_requests / ambulance_bookings
Store request mode (`simulation` or `provider`), patient, location consent, status, provider reference, timestamps and audit events. Tracking points must be provider-supplied or clearly synthetic.

## 4. Important indexes and constraints

- Unique normalized email.
- Index every `patient_user_id`.
- Index lab observations by `(patient_user_id, test_code, observed_at DESC)`.
- Index dose logs by `(medication_statement_id, scheduled_at DESC)`.
- Index reminders by `(status, scheduled_at)`.
- Index inventory by `(medicine_product_id, pharmacy_id, source_timestamp DESC)`.
- Index active interaction pairs.
- Check non-negative quantities and valid date ranges.
- Check `reference_low <= reference_high` where both exist.
- Unique idempotency key for reminder/dose occurrences.
- Use PostGIS only if geographic query needs justify it; otherwise basic latitude/longitude is enough for the academic version.

## 5. Ownership enforcement

Every patient-owned query must be scoped by authenticated patient ID. Never fetch by UUID alone and assume the caller is authorized.

For high-risk tables, consider PostgreSQL Row-Level Security as defense in depth, but application authorization tests remain mandatory.

## 6. Data lifecycle

- User may request export.
- User may request deletion subject to legal/retention obligations.
- Deletion must consider shared links, uploaded files, chat records and backups.
- Revocation immediately blocks future share access.
- Audit logs should be append-only and avoid storing sensitive content.
- Retention periods must be configured based on deployment jurisdiction and policy.

## 7. Migration strategy

- One Alembic migration per coherent schema change.
- Never edit an already-applied migration in a shared environment.
- Seed only synthetic demo records.
- Version safety reference datasets separately from application schema.


## 4. Phase 1 implementation notes (as built)

Implemented in migration `0001_initial_schema`. Differences from / additions to the logical schema:

- `users.email` is `CITEXT` (requires the `citext` extension; the migration creates it). The app also
  lowercases emails before lookup.
- `patient_profiles.blood_group_verification_status` defaults to `unverified`; the API sets
  `patient_reported` when a patient enters a blood group and never accepts a status from the client.
- `patient_conditions` gained `status` values `active | resolved | inactive | entered_in_error`.
  `source_document_id` is deferred to Phase 2 (no documents table yet).
- `patient_allergies` gained `status` (`active | entered_in_error`) for soft removal.
- `emergency_contacts`: `id, patient_user_id, name, relationship, phone_e164, email, is_primary`,
  timestamps. Max 10 per patient (application rule); one primary (application rule).
- `user_consents`: append-only ledger `id, user_id, consent_type, policy_version, granted, recorded_at`.
  Types: `terms_of_service, privacy_policy, health_data_processing, ai_context`.
- `audit_logs`: `id, actor_user_id, action, resource_type, resource_id, ip, request_id, metadata(JSONB),
  created_at`. Stores identifiers and event names only, never health content, emails or secrets.
- Not yet built: `caregiver_grants` (Phase 8), `conditions`/`allergies` reference catalogues.

## 5. Phase 4 implementation notes (as built)

Migration `0004_medicine_safety`:

- `reference_sources(name, version, jurisdiction, reviewed_at, ...)`, `active_ingredients` (with `drug_class`,
  curated `allergy_terms`, `source_id`), `medicine_ingredients(medicine_id, ingredient_id, strength_value, strength_unit)`.
- `medicines` gained nullable `route` and `release_type`; null means "not recorded" and blocks comparison.
- The separate interaction/food/condition tables in section 3 are one table, `safety_rules`, with `kind`
  (`drug_drug | drug_food | drug_condition`). A CHECK enforces the shape per kind, and drug-drug pairs are
  stored in canonical order (`ingredient_id < counterpart_ingredient_id`). Partial unique indexes allow one
  active rule per source/version and pair or term. Rules are retired, never updated.
- `medicine_prices` (source, price, currency, pack quantity and unit, jurisdiction, `observed_at`), all required.
- `adverse_event_reports` (patient-owned, soft removal, no causality field).
- The seed in this migration is synthetic demonstration data, not clinically reviewed.
