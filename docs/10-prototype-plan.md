# 10 — Prototype Plan (zero budget, on-device, phone-only)

Status: DRAFT for approval. Date: 2026-11-19.
Inputs from the product owner: English-only videos; open source and free; no budget; no Supabase, Expo, or Google Play accounts; no watermark; build a phone-only prototype first, test it on a real phone, then improve from feedback.

## What changes versus docs 02-07
Docs 02-07 describe the full product (cloud API, database, workers, billing). The prototype deliberately skips all of that. The cloud design stays as the later "full product" track; nothing in it is deleted.

| Area | Full product | Prototype |
|---|---|---|
| Accounts / auth | Supabase Auth | None (single local user) |
| Database | Postgres + RLS | Local on-device storage (SQLite or similar) |
| Upload | Resumable upload to cloud | None; video stays on the phone |
| Transcription | Python worker, faster-whisper | On-device whisper.cpp (English tiny/base model) |
| Highlights | Multi-signal scoring | Transcript-only heuristics, no paid AI |
| Render | Server FFmpeg | On-device (approach chosen by spike) |
| Billing, credits, quotas | Play Billing + ledger | None |
| Cost | Hosting, storage, egress | 0 (only your time, phone battery, storage) |
| Privacy | Data-flow map, retention | Video never leaves the phone (simplest case) |

## Prototype scope (the MVP flow, locally)
1. Pick a video from the gallery (≤10 minutes proposed).
2. App extracts audio and transcribes it on the phone, with timestamps.
3. App proposes five highlight clips (start, end, title, short reason, experimental score).
4. You preview each clip and adjust start/end.
5. App exports vertical 9:16 MP4 clips, no watermark.
6. Saved to the phone gallery; share sheet.
Not in the prototype: login, cloud, billing, manual timeline editor, captions, scene/visual analysis, multiple languages.

## Honest feasibility risks (to settle with short spikes)
| Risk | Why it matters | Spike |
|---|---|---|
| S1: Video → 16 kHz mono audio on device | Whisper needs audio in a specific format; no ready path in Expo alone | Prove on your phone with a 1-minute clip |
| S2: Transcription speed and memory | 10 min of audio on a mid-range phone may be slow or heavy | Time tiny.en vs base.en on your phone; record numbers |
| S3: Trim + 9:16 crop + export on device | Needs a video-processing library | Prove on one clip; compare options below |
| S4: Save to gallery and share | Android storage permissions | Prove on one file |
| S5: Highlight quality | Heuristics may feel weak | Try on 3 of your own videos; collect your feedback |

If S1-S3 cannot be solved on-device within reason, the fallback is a free local helper on your computer (still no cost), decided after spike results.

## Technology candidates (all free and open source; verify licences before choosing)
- App: React Native + Expo (development build, not Expo Go), TypeScript, Expo Router.
- Transcription: `whisper.rn` (React Native binding of whisper.cpp). Verified 2026-11-19: MIT licence; Expo projects must prebuild (a custom development build, so Expo Go will not work); examples use the English `tiny.en` model. Whisper model licence not yet verified.
- Render options:
  - R1 (recommended to test first): Android Media3 Transformer through a small custom native module. Free; needs verification of Expo integration and licence.
  - R2: an FFmpeg wrapper. Verified 2026-11-19: the original FFmpegKit was retired in April 2025 and its binaries removed. Community forks exist, but at least one has paid tiers, and FFmpeg builds can carry LGPL/GPL obligations. Use only after licence review.
- Highlights: pure TypeScript heuristics on transcript (pauses, sentence boundaries, questions/hook phrases, keyword density, length fit, de-duplication). No external API.

## Build and install path (no accounts needed)
- Path A (recommended): build locally on your computer with free tools (Node.js, JDK, Android Studio SDK), then install the APK on your phone by USB or file transfer. Needs a Windows/Mac/Linux computer.
- Path B: Expo's EAS cloud build needs a free Expo account and has plan limits (unverified).
- Google Play is not needed for the prototype; you sideload the APK.
- Environment note: the sandbox I work in has no internet, so I can write the code but cannot run `npm install`, a build, or a device test here. All build/test results will come from your machine and I will report only what is actually run. Using Claude Code on your computer would let builds and tests run alongside the code.

## Milestones
| Step | Output | Done when |
|---|---|---|
| P0 | This plan approved; open decisions D9-D11 answered | You say "start prototype" |
| P1 | App skeleton (Phase 1 shell, trimmed) + spike screens S1-S4 | Each spike has a pass/fail result with numbers from your phone |
| P2 | Pipeline: pick → transcribe → five highlights | Works on a 5-10 min English video |
| P3 | Review and export | You can preview, adjust, export, and find files in the gallery |
| P4 | Your feedback round | Prioritised improvement list |

Rules carried over: no fake results, no dead buttons, test claims only for what actually ran, no paid services.

## Open source basics (free)
- Pick a licence (MIT or Apache-2.0 are common) — decision D9.
- Keep the code in a local Git repository now; publishing to a public host is optional later and free.
- Do not commit signing keys or personal data. Third-party licences are listed in a NOTICE file.
