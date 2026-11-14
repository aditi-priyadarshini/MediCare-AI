# Patient Longitudinal Memory & AI Context Specification

## 1. Purpose

The "memory" in MediCare AI is not an LLM's unrestricted conversational memory. It is a controlled, patient-owned longitudinal health record and a retrieval layer that allows the assistant to answer questions about the patient's recorded health journey.

Examples:
- "How has my HbA1c changed over the last year?"
- "What medicines was I taking when this test was recorded?"
- "Did my blood pressure readings change after my medication list was updated?"
- "Summarize my latest lab report for my next appointment."
- "What allergies have I recorded?"

## 2. Source of truth

The database is the source of truth. The AI must not invent or silently persist a medical fact.

Data sources:
1. Patient-entered information.
2. Patient-uploaded documents.
3. OCR-extracted values awaiting confirmation.
4. Patient-confirmed structured observations.
5. Clinician-confirmed records, where a trusted workflow exists.
6. External reference data with source and version.

Each fact must carry:
- Patient ID
- Record ID
- Data type
- Value and unit, where applicable
- Event/observation date
- Recorded/created date
- Source
- Verification status
- Provenance/reference
- Correction or supersession status

## 3. Memory categories

### Stable profile context
- Preferred language
- Accessibility preferences
- Time zone
- Patient-reported conditions
- Recorded allergies
- Emergency contacts

### Longitudinal observations
- Lab test results
- Vitals
- Weight measurements
- Other dated observations

### Medication timeline
- Prescription/order records
- Patient-reported medication use
- Dose schedules
- Dose logs
- Start, pause, completion and discontinuation events
- Batch/expiry information

### Documents
- Original report metadata
- Confirmed extracted observations
- Prescription metadata
- Discharge summary metadata

### AI conversation context
- User question
- Assistant response
- Evidence item references
- Consent/context mode
- Safety classification
- Model/provider metadata

Conversation text is not a verified medical record. If a user says "I have diabetes" in chat, the assistant may use it as conversational context for that turn, but must not silently create a confirmed condition record.

## 4. Retrieval process

1. Authenticate user.
2. Resolve patient identity and access rights.
3. Check context consent and selected scope.
4. Classify question intent.
5. Retrieve only relevant records.
6. Normalize units/dates where a validated mapping exists.
7. Build an evidence bundle with source references.
8. Generate a constrained explanation.
9. Validate every factual patient-record claim against evidence.
10. Return answer, source labels, dates, uncertainty and next-step guidance.

The LLM never receives direct database credentials and never generates arbitrary SQL.

## 5. Example: medication and HbA1c trend

Question: "Is my diabetes medicine improving my condition?"

The system should:
- Retrieve HbA1c observations with dates, units and reference ranges.
- Retrieve relevant medication timeline and patient-reported dose history.
- Check whether the medicine dates overlap with the observation periods.
- Display the observed lab trend.
- Display medication timeline separately.
- Identify missing data such as adherence, dosage changes, other medicines, illness, diet or clinician decisions.
- Explain that the trend may be consistent with improvement but cannot establish that the medicine caused it.
- Encourage discussion with the treating clinician.

### Safe response pattern

"Your recorded HbA1c values were 8.2% on 10 January and 7.4% on 12 April, a decrease of 0.8 percentage points. Your medication record shows Medicine X was marked active from 20 January. These records show that the HbA1c value decreased during a period when Medicine X was recorded as active. This does not prove the medicine caused the change. Other factors and adherence may matter. Please review the trend with your clinician."

The numbers above are illustrative only.

### Unsafe response pattern

"Your medicine is working perfectly. Continue it and increase the dose if you want faster improvement."

The assistant must never generate this kind of recommendation.

## 6. Comparability rules for test results

Before comparing:
- Same test concept/code or a documented equivalent.
- Compatible units.
- Comparable specimen and method where relevant.
- Correct date/time ordering.
- Reference ranges are stored per lab/report, not assumed universal.
- Missing values remain missing.
- OCR confidence alone does not equal verification.

If units differ, convert only through a validated conversion rule and retain original value/unit.

## 7. Patient context controls

Provide context toggles:
- Use my current medicines
- Use my medical history
- Use my recent test results
- Use my dose history
- Use my allergies

Default to minimum necessary context. Make it visible when patient records are being used. The user can inspect which records informed the answer.

## 8. Data correction and conflict handling

- Patient can flag a record as incorrect.
- Preserve original record and create correction/audit event.
- If two records conflict, show both sources and ask for clarification.
- Never silently choose one conflicting clinical value.
- Clinician-confirmed data may be displayed with provenance, but the system should not erase patient-entered history.

## 9. Retrieval safety and prompt injection

Uploaded reports and external webpages are untrusted data, not instructions. The assistant must ignore embedded commands in source documents. Retrieved content is evidence only.

## 10. Retention and privacy

- Do not store unnecessary sensitive context in chat.
- Avoid sending direct identifiers to model providers.
- Provide chat deletion and patient-record deletion/export controls according to applicable retention policy.
- Log which records were accessed for AI responses, without logging the full sensitive content.
- External model provider retention and training settings must be reviewed before use.
