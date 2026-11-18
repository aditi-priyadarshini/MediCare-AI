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

## Reminder calls (WebRTC)
- Optional and off by default. The backend rules are covered by tests; the push adapters (FCM, APNs VoIP), aiortc media, TURN and the phone app were **not run against real services or devices**. See `docs/REMINDER_CALLS.md` for the full list, including app-store policy and Android battery-optimisation caveats.
- Spoken text is English; there is no two-way audio; only the most recently used phone rings; refill and expiry alerts don't ring.
