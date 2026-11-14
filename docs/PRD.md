# Product Requirements Document (PRD)

**Product:** MediCare AI  
**Version:** 1.0  
**Audience:** Academic evaluators, product/design, frontend/backend development  
**Primary platform:** Responsive web application  
**Primary locale:** India; English first, Hindi and Odia planned

## 1. Product vision

MediCare AI gives a patient one place to maintain and understand their health journey: personal health profile, medical history, test reports, medicines, reminders, safety information, care discovery and controlled sharing with doctors or caregivers.

The platform should help patients organize information and ask better questions of qualified professionals. It does not diagnose, prescribe, replace a doctor, or dispatch emergency services unless a real authorized provider integration exists.

**Product promise:** "Your health, connected."

## 2. Problem statement

Patients often keep prescriptions, laboratory reports, medicine schedules and medical history in separate places. They may forget doses, overlook expiry dates, struggle to understand reports, or have difficulty sharing a complete and accurate history during a consultation. Elderly users may also face accessibility and language barriers. Finding nearby providers is difficult when pharmacy stock and doctor availability are not transparently connected.

MediCare AI brings these workflows together while preserving patient control and clearly communicating the limits of available data.

## 3. Goals

- Create a secure patient account with Google and email/password sign-in, verification and OTP flows.
- Maintain a structured patient profile, conditions, allergies, vitals, medical history and uploaded documents.
- Track medication schedules, taken/skipped/missed doses, refills and expiry dates.
- Store laboratory reports and structured results over time.
- Let the AI assistant explain patient-authorized records and longitudinal trends with source references.
- Provide evidence-based medicine information, interaction warnings and adverse-reaction reporting.
- Compare medicine products and potential generic alternatives without automatically recommending substitution.
- Support voice and accessible interfaces for older adults.
- Discover nearby pharmacies, doctors, clinics and hospitals.
- Support consent-based medical-summary sharing.
- Provide emergency guidance and an ambulance workflow that is simulated until real providers are integrated.
- Provide an admin console for catalogue, source, content and platform management.

## 4. Non-goals

- Autonomous diagnosis or treatment recommendations.
- Prescribing or changing medication dosage.
- Automatic medication substitution.
- Guaranteeing medicine authenticity from QR/barcode alone.
- Claiming live pharmacy stock without a trusted inventory feed.
- Ranking doctors as clinically "best" without verified and defensible criteria.
- Real ambulance dispatch without an authorized operational partner.
- Replacing a hospital EHR or clinician workflow.
- Making clinical decisions from an LLM response.
- Storing real patient information for an academic demo; use synthetic data unless a lawful, approved deployment exists.

## 5. Personas

### P1 — Patient
Wants a clear overview of health records, medicines, upcoming reminders, test trends and care options.

### P2 — Older adult
Needs large text, clear navigation, voice input/output, simple reminders and caregiver assistance.

### P3 — Caregiver
With explicit patient authorization, helps maintain schedules, sees selected reminders and supports appointments. Access must be scoped and revocable.

### P4 — Doctor / authorized clinician
Views only records the patient has shared, with clear provenance, timestamps and a way to distinguish patient-entered from clinician-confirmed information.

### P5 — Administrator / data curator
Maintains medicine catalogue records, source metadata, interaction rules, provider directory quality and moderation. Admin access does not imply unrestricted access to private clinical records.

## 6. Roles and permissions

| Capability | Patient | Caregiver | Doctor recipient | Admin |
|---|---:|---:|---:|---:|
| Manage own profile | Yes | No | No | No |
| Manage own medicines | Yes | Scoped, if delegated | No | No |
| Upload own reports | Yes | Scoped, if delegated | No | No |
| View shared records | N/A | Scoped | Scoped | No by default |
| Revoke sharing | Yes | No | No | No |
| Maintain reference catalogue | No | No | No | Yes |
| View audit events | Own sharing/access history | Scoped | Own access history | Admin actions only |
| Manage users | No | No | No | Limited administrative metadata |

Implement authorization as permissions and resource ownership, not just hiding buttons in the frontend.

## 7. Functional requirements

### FR-01 — Authentication and onboarding
- Register with email and password.
- Verify email with a one-time code or verification link.
- Sign in with Google OAuth.
- Support password reset.
- Support optional phone verification through an OTP provider.
- Secure logout and session revocation.
- Rate-limit login, OTP and password-reset requests.
- Do not store plaintext passwords or OTPs.

**Acceptance:** An unverified account cannot use protected patient features if email verification is required by the configured policy. Sessions are invalidated on logout. OTPs expire and are single-use.

### FR-02 — Patient profile
- Store name, date of birth, preferred language, contact preferences and optional demographic data.
- Store height, weight, blood group (with verification/source status), emergency contacts and accessibility preferences.
- Store conditions and allergies as patient-reported, clinician-confirmed or imported, with source and date.
- Support caregiver delegation with explicit consent and revocation.

### FR-03 — Personal health records
- Upload PDF, JPG and PNG documents to private storage.
- Categorize prescriptions, lab reports, discharge summaries, imaging reports and other documents.
- Store source, document date, uploader, review status and extraction status.
- Support structured vitals and laboratory observations with units, reference ranges, specimen/date where applicable.
- Preserve original uploaded documents.
- Permit corrections while retaining audit history.
- Never silently convert OCR text into confirmed structured medical data.

### FR-04 — Medication management
- Search a normalized medicine catalogue.
- Add a medication to the patient's list with product, strength, form, instructions as prescribed, start/end dates, prescriber and source.
- Distinguish a prescription/order from a patient-reported medication statement.
- Create schedules and reminders.
- Record taken, skipped, delayed, missed or unknown dose status.
- Support pause, completion and discontinuation with history preservation.
- Track patient-held stock and refill reminders when entered by the patient.

### FR-05 — Expiry and batch tracking
- Record batch/lot, expiry, manufacture date, pack size and source where visible.
- Notify before expiry based on configurable thresholds.
- Flag expired stock.
- Clearly label user-entered batch data as unverified.
- Authenticity status must be one of verified against an authoritative source, mismatch, unable to verify, or suspicious for review. Do not infer authenticity from a successful barcode scan alone.

### FR-06 — Medicine information and alternatives
- Show generic/active ingredient, brand, strength, dosage form, route and source.
- Compare price only when source, pack size, jurisdiction and timestamp are available.
- Compare candidate alternatives using ingredient, strength, dosage form, release mechanism and other clinically relevant attributes.
- Label results as candidates, not automatic substitutions.
- Require pharmacist/prescriber review for prescription changes.

### FR-07 — Medicine safety
- Check drug-drug, drug-food, drug-condition and drug-allergy records against a curated reference dataset.
- Show severity, evidence, description, source, jurisdiction, version and review date.
- Include "unknown / insufficient data" as a valid outcome.
- Never interpret absence of a matching rule as proof of safety.
- Report possible adverse drug reactions with patient-described symptoms, timing, severity and supporting files.
- Do not infer causality from a patient report.

### FR-08 — Laboratory trend tracking
- Store observations with value, unit, test code/name, observation date, lab reference range, source document and verification status.
- Display a time-series only for comparable tests and compatible units.
- Show reference range and data provenance.
- Explain change direction and magnitude in neutral language.
- Distinguish observed change from clinical interpretation.
- Do not assert that medication caused improvement or deterioration.
- Allow the patient to correct extraction errors.

### FR-09 — AI health assistant
- Answer general health-literacy and medicine-information questions using retrieved, attributable sources.
- With explicit permission, retrieve relevant patient records: conditions, allergies, current medications, schedules, dose logs, test results and report summaries.
- Answer questions such as "How has my HbA1c changed?" using dated values and units.
- Compare values only when the tests are comparable.
- Present uncertainty, missing data and conflicting records.
- Explain that temporal association does not prove medication effectiveness or causation.
- Provide citations/source labels and dates for patient-record facts.
- Refuse to prescribe, diagnose or recommend changing treatment.
- Escalate urgent symptoms to emergency guidance.
- Minimize patient data sent to external model providers; redact direct identifiers where feasible.

### FR-10 — Voice and accessibility
- Speech-to-text for questions and navigation.
- Text-to-speech for reminders and responses.
- English, Hindi and Odia support, with clear indication when a translation is machine-generated.
- Adjustable font size, high contrast, keyboard navigation, focus visibility and reduced-motion support.
- Confirm high-impact actions by voice and on-screen confirmation.
- Never rely on voice alone for a medication dose or emergency action.

### FR-11 — Pharmacy discovery
- Map and list nearby pharmacies.
- Show distance, address, phone and opening hours only when sourced.
- Medicine stock and price must be timestamped and attributed to a pharmacy/provider feed.
- If no inventory integration exists, show "Call to confirm availability".
- Support directions and contact actions.

### FR-12 — Doctor and care discovery
- Search by specialty, location and available verified attributes.
- Display qualifications and registration information only from a credible source or provider submission with verification status.
- Appointment availability must come from a provider integration or be labelled indicative.
- Reviews must be moderated and must not be represented as clinical quality evidence.

### FR-13 — Diet planner
- Collect preferences, dietary restrictions and patient-reported conditions.
- Offer general educational meal ideas and planning.
- Explain which patient-entered constraints were used.
- Do not prescribe therapeutic diets or give disease-specific treatment plans without qualified review.
- Flag cases needing clinician/dietitian review, especially multiple conditions, pregnancy, renal disease, eating disorders or complex medication/diet interactions.

### FR-14 — Doctor sharing
- Patient selects records and recipient.
- Generate a time-limited, revocable sharing grant.
- Require authentication or an additional verification step for access.
- Log creation, access, download and revocation.
- Show patient which records are shared and until when.
- Provide a downloadable PDF summary as an alternative.
- No public, guessable share URLs.

### FR-15 — Emergency assistance
- Provide an obvious emergency information panel and configured local emergency contact details.
- Ask permission for location.
- Provide call/contact actions and nearby emergency facility discovery.
- Allow the patient to share a minimal emergency summary with a chosen contact.
- Do not delay a call to emergency services while trying to collect app data.
- Simulated ambulance requests must be visibly labelled as a demo.

### FR-16 — Ambulance workflow
- Store provider directory and integration status.
- In demo mode, create simulated request lifecycle: requested, accepted, en-route, arrived, cancelled.
- In real mode, only create bookings through an authorized provider API/contract.
- Display tracking only from provider-supplied updates.
- Do not claim availability, ETA or dispatch confirmation without a provider response.

### FR-17 — Reports and feedback
- Generate patient-selected medication and health summaries.
- Include generation timestamp and data-source labels.
- Allow feedback on the application.
- Keep platform feedback separate from clinical adverse-event reports.

### FR-18 — Admin and data governance
- Manage medicine catalogue and source metadata.
- Review and version interaction rules.
- Manage provider directory records and verification status.
- Review feedback and suspicious data submissions.
- Maintain audit trail for admin changes.
- No unrestricted patient-record browsing by default.

## 8. Dashboard information architecture

Patient navigation:
1. Overview
2. My Health
3. Medical Records
4. Medicines
5. Reminders
6. Safety Checker
7. AI Assistant
8. Pharmacy & Doctors
9. Diet & Wellness
10. Emergency
11. Reports
12. Settings

Dashboard priority:
- Today's medication and adherence
- Latest health observations and trends
- Active safety alerts
- Upcoming reminders/refills
- Recent documents
- AI assistant entry point
- Nearby care discovery
- Emergency action

Do not overload the landing dashboard with every module. Use clear hierarchy and drill-down pages.

## 9. Non-functional requirements

- Security: least privilege, secure sessions, encrypted transport, protected file storage, audit logs.
- Privacy: consent, purpose limitation, data minimization, export and deletion workflows.
- Reliability: transactional updates for medication and sharing operations.
- Performance: paginated tables; lazy-load heavy reports; avoid loading all patient records at once.
- Accessibility: target WCAG 2.2 AA where practical.
- Maintainability: modular monolith, typed API contracts, migrations and automated tests.
- Observability: structured logs, health checks and error reporting without logging sensitive health content.
- Portability: Docker-based local development and documented deployment.
- Localization: translation keys; store canonical data separately from translated display strings.

## 10. Success criteria

Academic MVP is successful when:
- User can register, verify, log in and maintain a profile.
- Patient can add medications and schedules.
- Reminder and dose-log workflow works end-to-end.
- Patient can upload a lab report and confirm extracted values.
- Comparable observations display a dated trend.
- AI can summarize only authorized records and correctly state uncertainty.
- Drug safety demo rules show source and severity, including unknown.
- Patient can create and revoke a secure medical-history share.
- All patient-owned endpoints enforce ownership.
- Automated tests pass and demo integrations are clearly labelled.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Incomplete drug interaction data | Curated limited dataset; unknown result; provenance |
| Incorrect OCR | Human confirmation before structured save |
| AI hallucination | Retrieval, citations, constrained outputs and tests |
| False medicine authenticity claim | Authoritative verification source required |
| Stale pharmacy inventory | Timestamp, source and stale-data label |
| False doctor recommendation | Transparent filters and credential provenance |
| Fake ambulance availability | Demo label or provider-confirmed integration |
| Privacy breach | Least privilege, isolation tests, audit and secure storage |
| Solo developer scope creep | Phase gates; defer provider integrations |
