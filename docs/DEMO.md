# Demo and presentation guide

All data below is synthetic (`example.com` addresses, invented values).

## Set up
```bash
cd backend && alembic upgrade head
DEMO_PASSWORD='choose-a-long-passphrase' python -m app.scripts.seed_demo
uvicorn app.main:app_factory --factory      # and: cd frontend && npm run dev
```
Accounts: `demo.patient@example.com`, `demo.admin@example.com`, `demo.reviewer@example.com` (same password). Never use the seed in production; it refuses to.

## Suggested 10-minute flow
1. **Patient dashboard** (patient): HbA1c falls 8.4 → 7.1 %; every value says "patient reported", never "confirmed".
2. **Safety** (patient): check Ibuprofen + Aspirin. Note the source line, "demonstration dataset, not clinically reviewed" and the absence of dosing advice.
3. **Share** (patient): pick labs only, preview, create. Open the link in a private window, enter the emailed code (Mailpit at :8025 with Docker), show that only labs appear; revoke; reload and show it fails.
4. **Emergency** (signed out): 112 link first; the ambulance run is labelled SIMULATION.
5. **Feedback** (patient): send a message; see "Received".
6. **Admin** (`demo.admin`): Overview shows rules awaiting review; open **Feedback** and mark it acted on (the sender's page now says "Acted on", without your note).
7. **Safety rules** (`demo.admin`): write a new version of a rule, open its version history; the old version is kept. Switch to `demo.reviewer` and approve it as second reviewer; try approving your own new version to show it is refused.
8. **Audit log**: show your own actions, the filters, and that patient data access is not listed here.
9. **Accounts**: deactivate the demo patient in one window and watch their session end on the next click; reactivate.

## Talking points
- Privacy by default: administrators cannot open health records; sharing is consent-based, time-limited and revocable.
- Safety by design: rules cite a source, never auto-change, are versioned, and say what they do not know.
- Honest limits: see `KNOWN_LIMITATIONS.md`.
