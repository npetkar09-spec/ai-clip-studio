-- AI Clip Studio — DRAFT schema (Phase 0). NOT applied to any database.
-- Target: PostgreSQL (Supabase). Review before Phase 2 migration.
-- Conventions: uuid PKs, timestamptz, times in integer milliseconds, soft limits via CHECK.
-- Writes to jobs / credits / subscriptions / entitlements / exports are done ONLY by the
-- trusted backend (service role). Clients get SELECT on their own rows via RLS.

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  preferences   jsonb not null default '{}'::jsonb,
  training_consent_at timestamptz,          -- explicit, informed opt-in (Phase 12); null = no consent
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- projects ----------
create table projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 120),
  category_profile text not null default 'general'
    check (category_profile in ('general','podcast_interview','comedy','gaming','education','entertainment','motivation','news_commentary')),
  status          text not null default 'draft'
    check (status in ('draft','processing','ready','failed','archived')),
  edit_document   jsonb,                    -- versioned non-destructive edit doc (Phase 8)
  schema_version  int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on projects (user_id, created_at desc);

-- ---------- source_videos ----------
create table source_videos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  storage_key     text not null unique,     -- opaque path, no filename
  original_name   text,                     -- display only; never used in paths
  size_bytes      bigint check (size_bytes > 0),
  duration_ms     bigint check (duration_ms > 0),
  width           int, height int,
  container       text, video_codec text, audio_codec text,
  probe           jsonb,                    -- server FFprobe output (trusted); client metadata is NOT trusted
  status          text not null default 'pending_upload'
    check (status in ('pending_upload','uploaded','validating','ready','rejected','deleted')),
  reject_reason   text,
  rights_confirmed_at timestamptz not null, -- user confirmed they own / are authorised to process
  retention_expires_at timestamptz,
  created_at      timestamptz not null default now()
);
create index on source_videos (user_id, project_id);

-- ---------- processing_jobs ----------
create table processing_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  source_video_id uuid references source_videos(id) on delete cascade,
  type            text not null
    check (type in ('probe','proxy','transcribe','analyze','highlight','render')),
  status          text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  stage           text,
  progress        smallint not null default 0 check (progress between 0 and 100),
  attempt         int not null default 0,
  max_attempts    int not null default 3,
  idempotency_key text not null,
  params          jsonb not null default '{}'::jsonb,
  error_code      text,
  error_message   text,                     -- safe, no private content
  locked_by       text, locked_at timestamptz,
  cancel_requested_at timestamptz,
  created_at      timestamptz not null default now(),
  started_at      timestamptz, finished_at timestamptz,
  unique (user_id, idempotency_key)
);
create index on processing_jobs (status, created_at) where status in ('queued','running');

-- ---------- clips ----------
create table clips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  source_video_id uuid not null references source_videos(id) on delete cascade,
  origin          text not null default 'ai' check (origin in ('ai','manual')),
  start_ms        bigint not null check (start_ms >= 0),
  end_ms          bigint not null,
  title           text, description text, category text,
  score           numeric(5,2),             -- experimental score, NOT a probability
  reason          text,
  evidence        jsonb,                    -- timestamp references supporting the reason
  scoring_version text,
  status          text not null default 'suggested' check (status in ('suggested','accepted','rejected')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_ms > start_ms)
);
create index on clips (project_id, status);

-- ---------- exports ----------
create table exports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  clip_id         uuid references clips(id) on delete set null,
  job_id          uuid references processing_jobs(id) on delete set null,
  profile         jsonb not null,           -- e.g. {"aspect":"9:16","height":1080}
  status          text not null default 'queued'
    check (status in ('queued','rendering','ready','failed','expired','deleted')),
  storage_key     text unique,
  size_bytes      bigint, duration_ms bigint,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------- subscriptions / entitlements (Phase 11; backend-written only) ----------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  tier            text not null check (tier in ('free','pro','creator')),
  status          text not null check (status in ('active','grace','on_hold','cancelled','expired','refunded')),
  provider        text not null default 'google_play',
  provider_ref_hash text,                   -- hash of purchase token, not the raw token
  current_period_end timestamptz,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table entitlements (
  user_id         uuid primary key references profiles(id) on delete cascade,
  tier            text not null default 'free' check (tier in ('free','pro','creator')),
  monthly_credits int not null default 0,
  credits_period_start timestamptz,
  limits          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- ---------- credit ledger (append-only) ----------
create table credit_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  delta           int not null,             -- negative = spend, positive = grant/refund
  reason          text not null check (reason in ('monthly_grant','job_spend','job_refund','purchase','adjustment')),
  job_id          uuid references processing_jobs(id) on delete set null,
  idempotency_key text not null,
  balance_after   int not null check (balance_after >= 0),
  created_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- Later-phase tables (not drafted yet): transcripts, transcript_segments (Phase 4),
-- scene_segments / audio_events (Phase 5), feedback_events (Phase 12).

-- =====================  ROW LEVEL SECURITY (intent)  =====================
alter table profiles            enable row level security;
alter table projects            enable row level security;
alter table source_videos       enable row level security;
alter table processing_jobs     enable row level security;
alter table clips               enable row level security;
alter table exports             enable row level security;
alter table subscriptions       enable row level security;
alter table entitlements        enable row level security;
alter table credit_transactions enable row level security;

-- Owner full access (own rows only)
create policy profiles_own      on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy projects_own      on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Owner read-only; writes through backend (service role bypasses RLS)
create policy source_videos_read on source_videos for select using (user_id = auth.uid());
create policy jobs_read          on processing_jobs for select using (user_id = auth.uid());
create policy exports_read       on exports for select using (user_id = auth.uid());
create policy subs_read          on subscriptions for select using (user_id = auth.uid());
create policy entitlements_read  on entitlements for select using (user_id = auth.uid());
create policy credits_read       on credit_transactions for select using (user_id = auth.uid());

-- Clips: owner may read and adjust boundaries/status; creation of AI clips is backend-only.
create policy clips_read   on clips for select using (user_id = auth.uid());
create policy clips_update on clips for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- NOTE: no INSERT/UPDATE/DELETE policies on jobs, credits, subscriptions, entitlements => denied for clients.
-- NOTE: column-level protection (e.g. clients must not change clips.user_id/score) must be enforced
--       with a trigger or by routing updates through the API. Decide in Phase 2.
-- NOTE: storage bucket policies are separate; buckets are private. Draft with Phase 3.
