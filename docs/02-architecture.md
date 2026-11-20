# 02 — Architecture (Draft)

Logical separation, not a mandate for many deployables on day one.

## Components
1. **Android app** (React Native, Expo, TypeScript, Expo Router): UI, gallery picking, upload client, preview playback, API calls. No secrets, no entitlement decisions.
2. **Supabase Auth + Postgres**: identity, relational data, RLS, job state, ledger.
3. **Application API** (Node.js + TypeScript): validates JWT, enforces ownership and quotas, creates jobs, issues signed upload/download URLs. Runtime-validated request/response schemas.
4. **Worker** (Python): transcription, analysis, rendering via FFmpeg/FFprobe and faster-whisper. Pulls jobs from Postgres.
5. **Object storage** (private): originals, proxies, thumbnails, exports.

```
 Android app ──HTTPS+JWT──▶ API ──▶ Postgres (RLS, jobs, ledger)
      │                      │              ▲
      │ resumable upload     │ signed URLs  │ claim/update jobs
      └────────────────────▶ Object storage ◀── Worker (FFprobe/FFmpeg/whisper)
```

## Recommended starting shape (proposed, needs approval — D1, D2, D4)
- One repository. Simple layout until a second consumer of shared code exists.
- One API service and one worker service.
- **Postgres-backed job queue** (`processing_jobs` with `FOR UPDATE SKIP LOCKED`) instead of Redis/BullMQ initially: one fewer paid component and failure mode. Move to Redis/BullMQ only if throughput, scheduling, or rate-limiting needs demonstrate the need.
- Workers on CPU first. Measure transcription and render time before considering GPU (cost).

## Job model
States: `queued → running → succeeded | failed | cancelled` (upload tracked in `source_videos.status`: `pending_upload → uploaded → validating → ready | rejected`).
- `idempotency_key` unique per user prevents duplicate jobs on retry.
- Worker claims with a lease (`locked_by`, `locked_at`); stale leases are re-queued after a timeout.
- Attempts counted; capped retries with backoff; terminal failure stores a safe error code and message (no private content).
- Cancellation: `cancel_requested_at` is a request. The status becomes `cancelled` only after the worker confirms it stopped; do not claim a running FFmpeg process stopped until confirmed.
- Progress is persisted (0-100 plus stage); the app polls `GET /v1/jobs/{id}` (push/Realtime can be evaluated later).

## Pipeline stages (per project)
1. Upload → probe (FFprobe) → validate codec/duration/size → create proxy (low-res) and thumbnails.
2. Extract audio → transcribe (timestamps preserved in ms) — Phase 4.
3. Scene detect, VAD, frame sampling on the proxy — Phase 5.
4. Candidate generation → scoring → boundary refinement → dedupe → top N — Phase 6. Each step independently testable; evidence (timestamps) stored for the "reason".
5. Render from a versioned edit document — Phase 10.

## Time model
All times stored as integer milliseconds. `source_*` fields refer to source-video time; timeline time is separate in the edit document. Never mix.

## Edit document (Phase 8 preview)
Versioned JSON stored on `projects.edit_document` with `schema_version`. Defined and validated (client and server) before Phase 8; not built earlier.

## Storage layout (proposed)
`users/{user_id}/projects/{project_id}/source/{uuid}`, `/proxy/...`, `/thumbs/...`, `/exports/...`. Opaque IDs, no filenames in keys. Buckets private.

## Deployment options (to be priced in 05)
- A: Managed API host + a single VM/container for the worker (simplest).
- B: Serverless API + queue-triggered container workers (scales to zero, more moving parts).
- C: All-in-one single VM for early testing (cheapest, least resilient).
Recommendation for the MVP test: A or C, decided after D4 and cost inputs.

## Observability
Structured logs with request/job IDs; no tokens, transcript text, or filenames in logs; metrics for job duration, failure rate, queue depth, storage growth.

## Environments
`local` (dev), `staging`, `production`. Separate Supabase projects and storage per environment; `.env.example` only in the repo.
