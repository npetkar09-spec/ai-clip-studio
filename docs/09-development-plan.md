# 09 — Development Plan (Draft)

Repository inspection (2026-11-19): no Git repository or application code exists yet. Only the skill and roadmap files were provided. Phase 0 therefore starts from a clean slate; nothing needs migrating or protecting.

## Roadmap review: findings
1. **MVP critical path skips Phases 8, 9, 11.** MVP = register → upload → five highlights → adjust → export vertical MP4 → gallery. Needed: 0, 1, 2, 3, 4, 6, 7, 10 (plus a thin slice of 5 and 13, then 14). The full editor (8), captions (9) and billing (11) can follow the MVP test.
2. **Phase 5 can be thinned for MVP.** Transcript-driven highlights (Phase 6) need only transcript timestamps plus basic VAD. Scene detection and visual analysis can be added after the first quality check. Decide in Phase 5 kickoff.
3. **Phase 7 needs no rendering.** Boundary adjustment previews by seeking the proxy/source between `start_ms` and `end_ms`. Rendering is first required in Phase 10.
4. **Cost controls arrive too late.** Phase 11 is monetization, but quotas, per-user job caps and a minimal credit ledger are needed in Phases 2-3 to prevent runaway spend during testing. Plan a minimal server-side quota in Phase 2; full billing stays in Phase 11.
5. **Benchmarks should precede limits.** Transcription and render speed (see 05) must be measured before fixing MVP upload limits (D6). Add two short spikes before Phase 3.
6. **Testing is continuous, not only Phase 13.** Each phase carries its own tests; Phase 13 is the hardening pass (devices, poor networks, A/V sync, security).
7. **Release prerequisites start early.** Play developer account, privacy policy draft, and Data safety inventory take elapsed time; begin drafting during Phase 3 when data flows become real.
8. **Native module risk.** Gallery picking, video playback, saving to the gallery and background upload may need native modules. Verify Expo compatibility at Phase 1 and again at Phases 3 and 10.
9. **Hindi/Indian-language support** (if targeted) changes transcription model choice and cost; answer question C1 in 08 before Phase 4.

## Sequenced plan
Sizes are rough relative effort (S/M/L/XL), not time estimates.

| Phase | Goal | Depends on | Size | Gate to pass |
|---|---|---|---|---|
| 0 | Plan and architecture | none | M | Decisions D1, D2, D5 approved |
| Spike A | Measure whisper and FFmpeg speed on target CPU | 0 | S | Numbers recorded in 05 |
| 1 | App shell, navigation, themes, states | 0 | L | Dev build installs and launches; no dead controls |
| 2 | Auth, DB, RLS, minimal quotas | 1, D3/D8 | L | Two-user RLS tests pass; account deletion works |
| 3 | Upload, probe, proxy, job queue, storage | 2, Spike A, D3, D4, D6 | XL | Interrupted upload resumes; bad files rejected server-side |
| 4 | Transcription | 3 | L | 10-min sample transcribed with ms timestamps and shown |
| 5 | Video intelligence (thin for MVP) | 3, 4 | M-L | VAD (and optionally scenes) aligned to transcript |
| 6 | Highlight detection | 4, 5 | XL | Five ranked candidates with reasons on test set; dedupe works |
| 7 | Clip review UI | 6 | L | Preview, adjust, accept/reject persisted |
| 10 | Render and export | 7 | XL | Vertical MP4s render, sync verified, saved to gallery |
| MVP test | Run MVP acceptance flow end to end with real users | 10 | M | MVP flow passes on physical device(s) |
| 13a | Hardening for the MVP slice | MVP | M | Failures, retries, poor-network tests |
| 14a | Internal testing release | 13a | M | Signed build on internal track |
| 8, 9 | Editor, captions | MVP | XL each | Per roadmap |
| 11 | Billing, entitlements | MVP | L | Server verification tested |
| 12 | Feedback and AI improvement | 6, MVP | M | Consent flow + metrics |
| 13b, 14b | Full testing, public release | all | L | Per roadmap |

## Per-phase kickoff checklist
1. Re-read the phase in the roadmap and its acceptance criteria.
2. Re-verify versions/limits that phase depends on (cite source and date in 08).
3. List files to change, dependencies, native build impact, security and cost impact.
4. Ask before paid services or architecture changes.
5. Implement small; test; update docs; report using `workflows/phase-execution.md`.

## Phase 1 preview (not started)
Planned only after approval: Expo project with Expo Router and TypeScript; theme tokens (light/dark); screen shells (splash, onboarding, login, registration, forgot password, dashboard, create project, project history, profile, settings); shared components for loading, empty, error; accessibility labels; disabled-with-explanation controls; Android development build. No auth, upload, AI, billing, or sample data.

## Phase 0 → Phase 1 approval gate
Say "start Phase 1" after approving D1, D2, D5 in 08. Until then nothing is implemented.
