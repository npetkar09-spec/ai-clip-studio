# 05 — Cost Model (Formulas and Assumptions)

No provider prices are included. Fill the "Input" cells from current official pricing pages and record the date. Outputs below are formulas, not quotes. Ask before enabling any paid service.

## 1. Data sizes (computed from bitrate)
Size (MB) = bitrate (Mbit/s) × duration (s) ÷ 8.

| Asset (assumption) | Bitrate | Duration | Size |
|---|---|---|---|
| Source, 1080p MP4 (assumed 8 Mbit/s) | 8 | 10 min (600 s) | 600 MB |
| Source, 720p MP4 (assumed 4 Mbit/s) | 4 | 600 s | 300 MB |
| Analysis proxy, 480p (assumed 1 Mbit/s) | 1 | 600 s | 75 MB |
| Extracted audio, mono 16 kHz WAV (about 32 KB/s) | n/a | 600 s | about 19 MB (delete after transcription) |
| Export, 1080×1920 (assumed 6 Mbit/s) | 6 | 30 s | about 22.5 MB each |
| 5 exports | | | about 112 MB |

Real phone video bitrates vary widely (often 10–25+ Mbit/s for 4K or high-quality 1080p). Measure real samples before fixing limits.

## 2. Per-project storage (MVP flow, 1080p source)
`project_GB = source + proxy + thumbnails + exports ≈ 0.60 + 0.075 + ~0.01 + 0.112 ≈ 0.80 GB`
Retention matters more than size: `GB-months = project_GB × months_retained`.

## 3. Monthly cost formula
```
storage   = total_GB_stored × P_storage_per_GB_month
egress    = (GB_uploaded_through_provider × P_ingress)      # often 0, verify
          + (GB_downloaded × P_egress_per_GB)                # exports + previews
compute   = worker_hours × P_worker_per_hour                 # CPU/GPU
          where worker_hours = Σ jobs (transcribe_time + analyze_time + render_time) × retry_factor
database  = P_db_plan + backups
auth/api  = P_api_host + P_monitoring
overhead  = failed/retried jobs, temp files, idle capacity
total     = storage + egress + compute + database + auth/api + overhead
cost_per_active_user = total ÷ monthly_active_users
cost_per_project     = (project_GB × months_retained × P_storage) + (job_hours × P_worker) + egress
```

## 4. Inputs to fill (with source and date)
| Input | Value | Source / date |
|---|---|---|
| P_storage_per_GB_month | ? | |
| P_egress_per_GB, free allowance | ? | |
| Supabase plan price, DB/storage/egress limits | ? | |
| P_worker_per_hour (CPU, N vCPU) | ? | |
| P_api_host | ? | |
| Transcription speed (x realtime) of chosen faster-whisper model on chosen CPU | MEASURE | benchmark |
| Render speed (x realtime) FFmpeg 1080×1920 on chosen CPU | MEASURE | benchmark |
| Max upload size / duration allowed | ? | decision D6 |

## 5. Scenarios (to compute once inputs exist)
| Variable | Low | Base | High |
|---|---|---|---|
| Active users / month | 50 | 500 | 5,000 |
| Projects per user / month | 2 | 4 | 8 |
| Avg source length | 5 min | 10 min | 30 min |
| Retention of source | 7 days | 30 days | 90 days |
| Retry factor | 1.1 | 1.25 | 1.5 |
| Free-tier share of users | 95% | 90% | 85% |

These scenario values are assumptions for planning, not forecasts.

## 6. Cost levers
Shorter retention, delete extracted audio early, analyse proxies not originals, cap free-tier duration, smaller export default (720p), CPU before GPU, scale workers to zero when idle, credits priced to cover worst-case compute.

## 7. Credit pricing sanity check (links to 06)
`credit_cost ≥ expected_cost_per_source_minute × safety_margin`. Do this after benchmarks. A free tier must not exceed what monetised users subsidise.

## 8. Benchmarks needed before committing prices (Phase 4/10 spikes)
1. faster-whisper model size vs accuracy vs CPU time on 10-minute sample audio (Hindi/English mix if relevant to target users).
2. FFmpeg render time for 30 s 9:16 clip from 1080p source.
3. Peak memory per worker for each job type.
