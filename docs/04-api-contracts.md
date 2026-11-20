# 04 — API Contracts (Draft)

Base: `https://<api-host>/v1`. JSON over HTTPS. Auth: `Authorization: Bearer <Supabase JWT>`; the API validates the token and resolves `user_id` itself. Request and response bodies are validated at runtime (e.g. a schema library). Final tooling choice is made in Phase 2.

## Conventions
- IDs are UUIDs, never sequential.
- Times are integer milliseconds; timestamps are ISO 8601 UTC.
- `Idempotency-Key` header required on every POST that creates a job, export, or spends credits.
- Pagination: `?limit=20&cursor=<opaque>`; response `{ "items": [...], "next_cursor": "..."|null }`.
- Errors: `{ "error": { "code": "string", "message": "safe text", "request_id": "uuid" } }`. Codes include `unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `quota_exceeded`, `rate_limited`, `unsupported_media`, `conflict`, `internal`.
- Not found and forbidden for another user's resource both return `404` to avoid leaking existence.
- Rate limits on upload init, job creation, and export.

## Endpoints
| Method & path | Purpose | Phase |
|---|---|---|
| `GET /me` | Profile, tier, credit balance | 2 |
| `PATCH /me` | Update display name, preferences | 2 |
| `DELETE /me` | Start account + data deletion | 2/3 |
| `POST /projects` | Create project `{title, category_profile}` | 2 |
| `GET /projects` | List own projects | 2 |
| `GET /projects/{id}` | Project detail with status summary | 2 |
| `PATCH /projects/{id}` | Rename / archive | 2 |
| `DELETE /projects/{id}` | Delete project and media | 3 |
| `POST /projects/{id}/uploads` | Start upload `{size_bytes, content_type, rights_confirmed:true}` → upload session and signed part/resumable URLs | 3 |
| `POST /uploads/{id}/complete` | Finish upload; triggers probe/validation job | 3 |
| `POST /uploads/{id}/abort` | Cancel upload, clean up | 3 |
| `GET /projects/{id}/source` | Source metadata and status | 3 |
| `POST /projects/{id}/analyze` | Create transcription+analysis+highlight job chain (spends credits) | 4-6 |
| `GET /jobs/{id}` | Status, stage, progress, safe error | 3+ |
| `POST /jobs/{id}/cancel` | Request cancellation (`cancel_requested_at`) | 3+ |
| `GET /projects/{id}/transcript` | Transcript segments | 4 |
| `GET /projects/{id}/clips` | Ranked clip suggestions | 6-7 |
| `PATCH /clips/{id}` | Adjust `start_ms`, `end_ms`, set `accepted`/`rejected` | 7 |
| `PUT /projects/{id}/edit-document` | Save versioned edit document (validated) | 8 |
| `POST /exports` | Render request `{clip_id, profile}` | 10 |
| `GET /exports/{id}` | Status; when ready, short-lived signed download URL | 10 |
| `DELETE /exports/{id}` | Delete export file | 10 |
| `GET /me/credits` | Balance and recent ledger | 11 |
| `POST /billing/verify` | Verify Google Play purchase token server-side | 11 |
| `POST /me/consent/training` | Record or withdraw training consent | 12 |

## Example: start upload
Request:
```json
POST /v1/projects/7b1e.../uploads
Idempotency-Key: 3c0d...
{ "size_bytes": 612345678, "content_type": "video/mp4", "rights_confirmed": true }
```
Response `201`:
```json
{ "upload_id": "a91f...", "protocol": "resumable", "url": "<signed, short-lived>", "expires_at": "2026-11-19T12:30:00Z", "max_size_bytes": 1073741824 }
```
Server re-validates real size, container, codecs and duration with FFprobe after upload; client values are advisory only.

## Job status example
```json
GET /v1/jobs/5d2c...
{ "id": "5d2c...", "type": "transcribe", "status": "running", "stage": "extracting_audio", "progress": 22, "attempt": 1, "error": null }
```

## Open items
- Upload protocol and size limits depend on the storage provider (D3). Verify before finalising.
- Realtime push vs polling for job status (start with polling).
- Whether clip boundary edits go through the API (preferred) or direct RLS-checked updates (see schema notes).
