# AI Clip Studio — Phase 0: Planning and Architecture

Status: DRAFT for approval. Date: 2026-11-19.
Scope: documents only. No code scaffolded, no cloud accounts created, no paid service enabled.

> Current track: **prototype** (see 10-prototype-plan.md). Docs 02-07 are the later full-product design.

## Contents
| File | Purpose |
|---|---|
| 01-requirements-and-journeys.md | What the product must do and for whom |
| 02-architecture.md | Components, data flow, job model, deployment options |
| 03-database-schema.sql | Draft Postgres schema with RLS intent (not applied anywhere) |
| 04-api-contracts.md | Draft REST API for the app |
| 05-cost-model.md | Cost formulas, sizing, assumptions (no provider quotes) |
| 06-monetization-plan.md | Tiers, credits, entitlements, billing approach |
| 07-security-privacy-plan.md | Threats, controls, RLS tests, retention, compliance flags |
| 08-decision-log.md | Decisions needing your approval, verified facts, open questions |
| 10-prototype-plan.md | Zero-budget, on-device, phone-only prototype scope, spikes, build path |
| 09-development-plan.md | Roadmap review findings, MVP critical path, sequenced phases and gates |

## Phase 0 acceptance checklist
- [x] Deliverable documents drafted
- [x] Repository inspected (none exists yet) and roadmap reviewed (see 09)
- [x] Cost model uses formulas and assumptions, no invented prices
- [x] Verified facts recorded with source and date (see 08)
- [ ] Decisions D1-D8 in 08 approved by the product owner
- [ ] Provider pricing and limits filled into 05 from current official pages
- [ ] Legal/compliance flags in 07 reviewed by a qualified person

## MVP definition (from roadmap)
Register, upload an authorised 10-minute video, receive five AI highlights, preview and adjust boundaries, export vertical MP4 clips, save to the Android gallery.

## Next step
Review 08-decision-log.md and approve or change D1-D8. Phase 1 should not start until D1, D2 (repo layout) and the Expo SDK check in 08 are settled.
