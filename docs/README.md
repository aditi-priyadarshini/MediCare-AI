# MediCare AI — Product & Engineering Specification

**Document pack:** v1.0  
**Date:** 14 November 2026  
**Product type:** Academic healthcare web platform  
**Delivery model:** Solo developer, phased implementation  
**Status:** Baseline specification — implementation not yet started

## What's included

| File | Purpose |
|---|---|
| `PRD.md` | Product vision, users, requirements, scope and acceptance criteria |
| `DESIGN.md` | Visual identity, design tokens, UX principles, page layouts and component guidance |
| `PHASES.md` | Delivery roadmap, milestones, dependencies and definition of done |
| `ARCHITECTURE.md` | System architecture, technology decisions, modules and deployment |
| `DATABASE.md` | Proposed PostgreSQL schema, entities, constraints and relationships |
| `MEMORY.md` | Patient longitudinal health context and AI memory/retrieval design |
| `WORKFLOW.md` | End-to-end patient, medication, lab, AI, pharmacy and emergency workflows |
| `API.md` | REST API conventions and endpoint inventory |
| `SECURITY.md` | Privacy, threat model, access controls and safety requirements |
| `TESTING.md` | Test strategy and release gates |
| `UI_REDESIGN/` | Phase-wise UI/UX redesign plan (master spec + phases A–G with paste-ready prompts) |

## Product summary

MediCare AI is a patient-centred healthcare coordination platform. It combines personal health records, medication tracking, medicine safety information, AI-assisted explanations, pharmacy and doctor discovery, accessibility features, and emergency workflows.

It is **not** an electronic medical device, clinical decision support system, pharmacy inventory network, doctor credential authority, or ambulance dispatch operator. Those capabilities require validated data, qualified review, provider integrations and jurisdiction-specific compliance. The academic build must clearly label simulated integrations.

## Non-negotiable product rules

1. Patient-owned records are private by default.
2. The AI assistant uses only authorized, relevant patient context.
3. AI may explain trends; it must not claim a medicine caused a health change without clinical evidence.
4. A missing interaction record never means a medicine combination is safe.
5. OCR output is untrusted until a person confirms it.
6. A barcode/QR scan alone does not establish medicine authenticity.
7. Pharmacy stock, doctor availability and ambulance status must never be fabricated.
8. Emergency flows must not delay contacting local emergency services.
9. Clinical reference data must have provenance, version, jurisdiction and review date.
10. The first release prioritizes reliable records and medication workflows over flashy AI features.

## Recommended stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui-compatible components
- Backend: Python, FastAPI, Pydantic
- Database: PostgreSQL, SQLAlchemy 2.x, Alembic
- Background jobs: Redis + Celery (or a simpler worker initially)
- Authentication: secure server-side sessions; Google OAuth; email verification/OTP; optional phone OTP through a provider
- Files: private object storage; local private volume for development
- OCR: PaddleOCR or a replaceable OCR adapter
- Maps: OpenStreetMap-based map rendering and geocoding subject to provider terms
- AI: provider-neutral LLM adapter + retrieval layer
- Tests: Pytest, Vitest, Playwright
- Deployment: Docker Compose for development; Nginx/reverse proxy for deployment

## How to use this pack

Treat `PRD.md` as the product source of truth. Treat `SECURITY.md` and the safety constraints in `PRD.md` as release-blocking requirements. When implementation decisions change, update the relevant document and record the decision in `ARCHITECTURE.md` under Architecture Decision Records.
