# 08 — Decision Log, Verified Facts, Open Questions

## A. Decisions needing your approval
| ID | Decision | Recommendation | Why | Status |
|---|---|---|---|---|
| D1 | Repo layout | Single repo; start with `app/` (Expo) and `docs/`; add `services/` when Phase 3/4 needs them | Smallest structure that works; avoids premature monorepo tooling | Proposed |
| D2 | Job queue | Postgres job table with `SKIP LOCKED`, no Redis/BullMQ initially | Fewer paid components and failure modes | Proposed |
| D3 | Object storage provider | Decide after comparing Supabase Storage vs an S3-compatible store on upload limits, resumable support, egress cost, region | Limits and pricing unverified | Open |
| D4 | Hosting for API and worker | Option A or C in 02 for the MVP test | Cost and simplicity; needs prices | Open |
| D5 | Transcription runtime | faster-whisper on CPU first; benchmark before any GPU spend | Cost control | Proposed |
| D6 | MVP limits and retention | Source ≤ 10 min; max file size, retention days, free-tier caps set after cost inputs | Needs 05 inputs | Open |
| D7 | App identity | Choose Android package name and display name (hard to change after Play listing) | Release dependency | Open |
| D8 | Data region and hosting jurisdiction | Choose region(s) for DB, storage, workers considering latency and legal review | Privacy/compliance | Open |

## A2. Update 2026-11-19 — answers from the product owner
English-only videos; open source, no budget; no Supabase/Expo/Play accounts; no watermark; prototype on own phone first. This moves D2, D3, D4, D8 out of scope for the prototype (no backend) and adds:
| ID | Decision | Recommendation | Status |
|---|---|---|---|
| D9 | Open-source licence | Apache-2.0 (patent grant, fits Apache-2.0 Media3, compatible with MIT whisper libraries) | Chosen by owner delegation 2026-11-19; not legal advice |
| D10 | On-device render approach | Spike R1 (Media3 Transformer) before any FFmpeg fork | Open |
| D11 | Build path | Owner has no computer and no budget; Path A needs a computer. Options in README/chat: GitHub Actions cloud build (free account) or a one-time borrowed computer | Open |
D1 (single repo) and D5 (on-device small English Whisper model first) still stand. D6 for the prototype: source ≤ 10 minutes. D7: any package name is fine for sideloading.

## B. Verified facts (as of 2026-11-19)
| Fact | Source | Note |
|---|---|---|
| Expo published an announcement of Expo SDK 58 including React Native 0.88 | expo.dev changelog (sdk-58) | Re-check at Phase 1 start; confirm stable status, Android requirements, and that Expo Go/EAS support matches. SDK 58 beta (Sep 15, 2026) preceded it |
| Expo SDK 57 used React Native 0.86 and React 19.2 | expo.dev changelog (sdk-57) | Previous SDK; relevant only if staying on it |
| whisper.rn is an MIT-licensed React Native binding of whisper.cpp; Expo needs prebuild (development build) | github.com/mybigday/whisper.rn | Whisper model licence still to verify |
| FFmpegKit was retired in April 2025; forks exist, some with paid tiers | github.com FFmpegKit notices and fork FAQs | Licence and maintenance review needed before use |
Not yet verified: Supabase plan limits and storage upload limits, Google Play Billing library version, India billing requirements, faster-whisper/Silero/classifier licences, Android Gradle Plugin/Kotlin versions for the chosen SDK, current provider pricing.

## C. Open questions for you
1. Target languages for videos (English only, Hindi, mixed)? Affects model size and cost.
2. Do you already have a Supabase project, Expo/EAS account, Google Play developer account, or a budget ceiling for testing?
3. Who are the first test users, and how many?
4. Free tier: watermark on exports, yes or no?
5. Are you comfortable with a monthly infrastructure budget cap that I use when sizing options?

## D. Risks
- Cost of video storage/egress and compute can outrun subscription revenue; mitigated by limits, retention, credits (05, 06).
- Content-rights and takedown obligations for uploaded video (07, LEGAL).
- Highlight quality is unproven; treat scores as hypotheses and plan evaluation (Phase 12).
- Native modules for video preview/gallery export may constrain Expo configuration; verify before Phase 3/10.

## E. Phase 0 exit criteria
You approve D1, D2, D5 (D3, D4, D6, D7, D8 may stay open if they do not block Phase 1), the Expo SDK is re-verified at Phase 1 kickoff, and you say "start Phase 1".
