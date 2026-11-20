# 07 — Security and Privacy Plan (Draft)

Not legal advice. Items marked LEGAL need review by a qualified person.

## Assets
User videos and transcripts (private, possibly sensitive), account identity, purchase entitlements, signing keys, service credentials.

## Threats and controls
| Threat | Controls |
|---|---|
| Access to another user's media/projects (IDOR) | Opaque IDs; ownership check on every API call; RLS on all user tables; 404 for foreign resources; multi-user tests |
| Service-role key leak | Key only in server env; never in app bundle or repo; secret scanning in CI; rotate on suspicion |
| Malicious/corrupt upload | Server-side FFprobe validation; allow-list containers/codecs; size/duration caps; run FFmpeg with timeouts and resource limits; never trust extension or client metadata |
| Public media exposure | Private buckets; signed, short-lived URLs; no filenames in keys |
| Free-credit abuse / cost attacks | Server-side quotas; rate limits on uploads/jobs; per-user concurrency caps; email verification; monitor spend alerts |
| Forged premium status | Entitlements in DB only; Google Play server verification; never trust client flag |
| Replay/duplicate requests | Idempotency keys on job, export, and credit operations |
| Token theft | Short-lived access tokens, secure storage on device, HTTPS only, logout/revoke |
| Log leakage | Redact tokens; no transcript text, no filenames, minimal personal data in logs |
| Abusive/infringing content | Rights confirmation at upload; terms of use; takedown/report process; ability to disable content (LEGAL) |
| Dependency/model licence risk | Licence review of faster-whisper models, Silero VAD, audio classifiers, FFmpeg build options before commercial use (LEGAL) |
| Supply chain | Pin versions, lockfiles, review new native modules, minimum release-age policy for new packages |

## RLS test plan (Phase 2)
With two test users A and B: A cannot select/update/delete B's rows in every table; clients cannot insert/update jobs, credits, subscriptions, entitlements; clip updates cannot change `user_id`, `score`, or source ids; unauthenticated requests get nothing. Automate as part of CI.

## Data lifecycle (proposed — D6 sets numbers)
| Data | Retention proposal |
|---|---|
| Source video | Deleted N days after last use or on user delete (N to decide) |
| Proxy / thumbnails / extracted audio | Delete when project closes; audio deleted right after transcription |
| Transcripts | Kept with project; deleted with project |
| Exports | Expire after N days; user can delete anytime |
| Account deletion | Delete profile, projects, media, exports; keep only legally required billing records (LEGAL) |
Verify storage cleanup actually happened (test), not just DB rows.

## Privacy and consent
- Private uploads are never used for model training without explicit, separate, revocable opt-in (`profiles.training_consent_at`).
- Product-quality metrics (selection, boundary edits, exports) collected only with notice and consent; aggregate where possible.
- Data-safety disclosures and privacy policy are written from the real data-flow map below, not assumptions.
- LEGAL: confirm obligations under applicable data-protection law (for an India-based operator, for example the Digital Personal Data Protection Act, 2023, and any rules in force) and the app store's policies for user-generated and uploaded content. Also confirm requirements for processing videos that contain other people.

## Data-flow map (starting point)
Device gallery → app → storage (original) → worker (proxy, audio, transcript, analysis) → database (metadata, transcript, clips) → worker (render) → storage (export) → device gallery. Third parties: Supabase, hosting/worker provider, storage provider, Google Play (billing), crash/analytics provider if added. List each with region and purpose before writing the privacy policy.

## Operational security
Separate dev/staging/prod credentials; least-privilege API keys; backups with restore test; spend and error alerts; incident contact process; signing keys backed up offline (Phase 14).
