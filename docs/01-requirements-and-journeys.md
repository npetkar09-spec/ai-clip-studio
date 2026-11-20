# 01 — Requirements and User Journeys

## Users
- Primary: solo creators, podcasters, educators, and small businesses who own long-form video and want short vertical clips for social platforms.
- Device assumption: mid-range Android phones on variable mobile networks. Android-first; no iOS, web, or PWA.

## Core journey (MVP)
1. Install, open, onboarding, register (email) — Phase 2.
2. Create project, pick a video from the gallery, confirm "I own or am authorised to use this video" — Phase 3.
3. Upload (resumable) with progress, retry, cancel; server probes and validates — Phase 3.
4. Transcription and analysis run as background jobs; app shows persisted status — Phases 4-6.
5. Review five ranked suggestions: preview, score, reason; adjust start/end; accept/reject — Phase 7.
6. Choose 9:16 and a duration preset; render — Phase 10.
7. Export saves to the Android gallery; user can share — Phase 10.

## Secondary journeys (post-MVP)
Manual editing and captions (8-9), subscription and credits (11), account and data deletion (2/3), feedback and quality measurement with consent (12).

## Functional requirements (MVP)
| ID | Requirement | Phase |
|---|---|---|
| F1 | Email registration/login/password reset with secure sessions | 2 |
| F2 | Project CRUD scoped to the owner | 2 |
| F3 | Pick MP4/compatible MOV, show metadata, validate size/duration | 3 |
| F4 | Resumable upload with progress, retry, cancel | 3 |
| F5 | Server-side probe and validation; reject corrupt/unsupported media | 3 |
| F6 | Background transcription with timestamps | 4 |
| F7 | Scene/speech analysis aligned to transcript time | 5 |
| F8 | Five ranked highlight candidates with start/end, title, score, reason | 6 |
| F9 | Preview and adjust boundaries; accept/reject | 7 |
| F10 | Render vertical MP4 per accepted clip with progress/cancel/retry | 10 |
| F11 | Save to gallery and share | 10 |
| F12 | Delete a project, its media, and the account | 2/3 |

## Non-functional requirements
- Original media immutable; editing non-destructive.
- No long-held HTTP requests for processing; all heavy work is a job with persisted state.
- Private storage by default; short-lived signed URLs.
- Ownership enforced on the server and by RLS.
- Resilience: interrupted uploads resume; jobs are idempotent and retryable; failures show a clear error.
- Accessibility: TalkBack labels, contrast, scalable text, touch targets.
- Cost transparency: per-job cost estimable from duration and profile.

## Out of scope for MVP
Multi-user collaboration, iOS, web app, translation/dubbing, karaoke captions, advanced effects, social-platform publishing, stock assets.

## Initial supported inputs (roadmap)
Common MP4 and compatible MOV. Proposed MVP limits (to be confirmed by D6 and cost model): up to 10 minutes and a maximum file size set after storage/egress pricing is known.
