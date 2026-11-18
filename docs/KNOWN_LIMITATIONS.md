# Known limitations (release notes for the academic build)

**What this is:** a research and teaching build. It is not a medical device, not clinically validated, and has had no independent penetration test or privacy-law review.

## Clinical content
- The bundled safety rules, medicines, prices, pharmacies and doctors are a **synthetic demonstration set**, labelled as such, not clinically reviewed. Do not use them for real decisions.
- Second-person review is recorded but is not a gate: an unreviewed rule is live. A real deployment should require clinician sign-off before activation.
- No emergency dispatch, clinic booking or stock feed is integrated. The ambulance flow is a labelled simulation; the only real action is the `tel:112` link.

## Security
- Rate limiting is in process memory (per instance, reset on restart). Use Redis before running more than one API instance.
- The web CSP allows `'unsafe-inline'` scripts and styles because Next.js injects inline bootstrap code. A nonce-based CSP is future work.
- Registration reveals whether an email exists (409). Password-reset timing is not fully constant.
- No malware scanning of uploads; files are validated by type and size only.
- Client IP comes from the socket; behind a proxy configure trusted forwarded headers.
- Administrators are created on the server (`create_admin`), not in the UI. There is no two-factor authentication.
- `npm audit` reports moderate issues in development tooling (ESLint chain); none ship in the production build.

## Product
- Admin and feedback pages are English only; other pages have machine-generated Hindi and Odia that no native speaker has reviewed.
- Accessibility was checked with automated tools (axe-core in jsdom and in a real browser, including colour contrast). **No manual screen-reader pass has been done.**
- Performance: list endpoints are paginated and capped and the audit log has indexes for its filters, but there has been **no load test**. Do not claim capacity figures.
- Caregiver delegation, doctor-side accounts, real notifications to clinics and adverse-event review by administrators are not built.
- AI provider adapters are tested against a fake HTTP layer, not live vendor APIs; vendor request formats and model names change, so run the admin Test button after configuring.
- Provider health counters live in process memory (per instance, reset on restart).

## AI safety review and generics (added after Phase 9)
- The AI's medical statements (interactions, contraindications, allergy cross-reactions, side effects, generic product lists) come from a general-purpose model and have **not** been reviewed by a clinician. They are labelled as such and can be wrong or incomplete; "nothing reported" is not "safe".
- **AI prices are estimates only.** A model has no access to real prices. They are shown as ranges for a stated pack, are not sourced or dated, and may be far from what a pharmacy charges. Treat them as a prompt to ask a pharmacist, not as a quote.
- A suggested generic is checked only for matching active ingredients, strength and form (no unit conversion). Fillers, dyes and bioequivalence are not assessed.
- Brand names are model recall for the Indian market and can be out of date or wrong; products the server cannot match are discarded, which can also hide a real one.
- Not verified against a live provider; every run makes model calls (no caching), so cost and latency grow with the number of medicines (reviews are capped at 12 medicines, generics at 8).

