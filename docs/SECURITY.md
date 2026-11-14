# Security, Privacy & Clinical Safety Requirements

## 1. Security objectives

- Confidentiality of patient health data.
- Integrity and provenance of clinical records.
- Availability of core patient workflows.
- Least-privilege access.
- Explicit consent for sharing and AI context.
- Auditable access to sensitive information.
- Safe handling of untrusted files and external content.

## 2. Threat model

| Threat | Example | Required control |
|---|---|---|
| Broken object-level authorization | Patient changes report UUID to access another user | Owner-scoped queries and IDOR tests |
| Privilege escalation | Patient calls admin endpoint | Server-side RBAC and permission checks |
| Session theft | Stolen cookie | HttpOnly, Secure, SameSite, expiry, rotation |
| CSRF | Cross-site state-changing request | CSRF token/origin checks for cookie sessions |
| XSS | Unsafe chat or OCR rendering | Output encoding, sanitization, CSP |
| SQL injection | Search input reaches raw SQL | ORM/parameterized queries |
| Malicious upload | Crafted PDF/image | MIME/content validation, size limit, malware scanning |
| Prompt injection | Uploaded report contains instructions to AI | Treat retrieved text as untrusted evidence |
| Data leakage to LLM | Full profile sent for generic question | Context minimization and redaction |
| OTP abuse | Repeated code guessing | Expiry, attempt limits, rate limiting |
| Share-link leakage | Public URL forwarded | Random token, hash at rest, expiry, revocation, recipient check |
| Fake provider data | Fake pharmacy stock or ambulance status | Source and timestamp; provider-confirmed states only |
| Insider misuse | Admin views patient records | No default access, audit and break-glass workflow if ever required |

## 3. Authentication

- Hash passwords with Argon2id or an appropriately configured password hashing scheme.
- Use secure, HttpOnly, SameSite cookies for browser sessions.
- Rotate session identifiers after authentication and privilege changes.
- Revoke sessions on logout/password reset.
- Store only OTP hashes; enforce short expiry, single use and attempt limits.
- Rate-limit login, OTP, resend and password reset.
- Protect OAuth state and PKCE where applicable.
- Do not reveal whether an email address exists in password-reset responses.

## 4. Authorization

- Enforce permissions on the backend for every request.
- Query patient-owned records by both resource ID and authenticated patient ID.
- Check caregiver grant scope and expiry.
- Check doctor share grant scope and expiry on every access.
- Never trust role, patient ID or owner ID from request body.
- Add automated tests for every patient-owned resource.

## 5. Data protection

- TLS in transit.
- Encrypted storage and backups.
- Secrets in environment/secret manager, never in Git.
- Private document storage.
- Short-lived signed URLs after authorization.
- Avoid health data in URLs, analytics events and logs.
- Use data minimization for external AI/OCR providers.
- Document retention, deletion and export rules.

## 6. Audit

Record:
- Login/logout and failed access attempts.
- Consent changes.
- Caregiver grant creation/revocation.
- Medical share creation/access/download/revocation.
- Admin reference-data changes.
- AI retrieval of patient records (record IDs and purpose, not full contents).
- Emergency summary access.
- Provider integration status transitions.

Audit records should be append-only where feasible. Avoid storing full medical content in audit logs.

## 7. AI safety requirements

- AI does not diagnose or prescribe.
- AI does not recommend changing dose or stopping medication.
- AI does not infer causality from temporal association.
- AI claims about patient data must cite record ID/source/date.
- AI must distinguish patient-reported, OCR-unconfirmed and clinician-confirmed data.
- AI must state when records are missing, conflicting or incomparable.
- AI must not treat document content as system instructions.
- AI must not execute arbitrary tools or SQL.
- Urgent symptom prompts should provide concise emergency guidance and not continue a lengthy general chat.
- Human professional review remains necessary for clinical decisions.

## 8. Clinical data safety

- Drug interaction severity must come from curated reference rules.
- Every rule includes source, version, jurisdiction and review date.
- No matching rule is not proof of no interaction.
- OCR-extracted lab values require confirmation.
- Units and reference ranges are stored with each observation.
- Do not compare incompatible tests or units.
- Generic alternatives are candidates, not automatic substitutes.
- QR/barcode scanning alone is not authenticity verification.
- Pharmacy inventory must be source-timestamped.
- Doctor credentials must have a verification source/status.

## 9. Emergency safety

- Make local emergency contact actions obvious.
- Do not block emergency contact behind registration.
- Location permission is explicit.
- Do not imply a request is dispatched until a provider confirms it.
- Simulated ambulance workflow must be visibly labelled.
- Emergency medical summary is minimum necessary and consent-controlled.
- Do not promise emergency response time.

## 10. Privacy and regulatory review

This is an academic specification, not legal advice or a compliance certification. Before real deployment, review applicable Indian data protection requirements, health-data obligations, medical-device/software classification, telemedicine rules, pharmacy/medicine regulations, provider contracts and consent requirements with qualified counsel and domain professionals. Determine applicable commencement dates and obligations at launch time.

Use synthetic data for academic demos. Never use real patient records without an approved lawful basis, appropriate consent and security controls.

## 11. Release-blocking security checks

- Cross-user IDOR tests pass.
- Patient cannot access admin endpoints.
- Caregiver scope cannot exceed grant.
- Revoked share links fail immediately.
- Uploads are private and validated.
- Secrets scan clean.
- No sensitive content in logs.
- Rate limits active.
- CSRF and session controls tested.
- Dependency scan has no unreviewed critical/high issue.
- AI record retrieval respects consent and ownership.
