-- ============================================================
-- Narayani Residency Marketing: core database schema
-- ============================================================

-- 1. Admin roles: only admins can use the app
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- 2. Hotel information (edited from Settings)
create table public.hotel_info (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Narayani Residency',
  tagline text not null default 'Stay. Float. Refresh',
  booking_phone text not null default '+91 6369409722',
  address text,
  description text,
  walking_minutes_to_temple int,
  parking_available boolean not null default true,
  restaurant_info text,
  updated_at timestamptz not null default now()
);

-- 3. Hotel images and assets (files live in Cloud Storage; metadata here)
create type public.asset_category as enum (
  'hotel_exterior', 'reception', 'executive_rooms', 'deluxe_rooms',
  'standard_rooms', 'restaurant', 'terrace_mountain_view', 'logo'
);

create table public.hotel_assets (
  id uuid primary key default gen_random_uuid(),
  category public.asset_category not null,
  storage_path text not null unique,
  public_url text not null,
  file_name text not null,
  description text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Local events found by research
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_start date not null,
  event_end date,
  description text,
  location text not null default 'Tiruvannamalai, Tamil Nadu',
  source_url text not null,
  verified_on date not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  marketing_relevance int not null default 0 check (marketing_relevance between 0 and 100),
  status text not null default 'discovered' check (status in ('discovered', 'updated', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, event_start)  -- duplicate prevention
);

-- Previous versions of an event, kept for the audit history
create table public.event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  previous_data jsonb not null,
  changed_at timestamptz not null default now()
);

-- 5. Generated content (one campaign per event and language)
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  language text not null default 'en' check (language in ('en', 'ta', 'te')),
  headline text not null,
  instagram_caption text not null,
  facebook_caption text not null,
  hashtags text[] not null default '{}',
  call_to_action text not null,
  music_mood text,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'rejected', 'partially_published', 'published')),
  current_version_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index campaigns_one_per_event_language
  on public.campaigns (event_id, language) where event_id is not null;

-- 6. Image versions (previous versions are kept for comparison)
create table public.campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_number int not null,
  format text not null check (format in ('portrait_1080x1350', 'square_1080x1080', 'story_1080x1920')),
  image_path text not null,
  image_url text not null,
  feedback text,
  generation_prompt text,
  created_at timestamptz not null default now(),
  unique (campaign_id, version_number, format)
);

-- 7. Approval history (approve, reject, feedback, regenerate, publish)
create table public.approval_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_id uuid references public.campaign_versions(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'request_changes', 'regenerate', 'publish')),
  note text,
  actor_id uuid,
  created_at timestamptz not null default now()
);

-- 8. Publishing history. A platform can have only one pending or successful row per campaign,
--    which blocks duplicate posts. Failed rows do not block a retry.
create table public.publishing_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  version_number int not null,
  status text not null check (status in ('pending', 'success', 'failed')),
  external_id text,
  external_url text,
  error_message text,
  requested_by uuid,
  attempted_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index publishing_one_active_per_platform
  on public.publishing_history (campaign_id, platform) where status in ('pending', 'success');

-- 9. Social account connections (display data only; tokens live in backend secrets)
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique check (platform in ('instagram', 'facebook')),
  account_id text,
  account_name text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  last_tested_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- 10. Automation schedule and run monitoring
create table public.automation_schedules (
  id uuid primary key default gen_random_uuid(),
  job_name text not null unique,
  enabled boolean not null default true,
  frequency_days int not null default 5 check (frequency_days > 0),
  timezone text not null default 'Asia/Kolkata',
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.automation_schedules (job_name) values ('event_discovery')
  on conflict (job_name) do nothing;

create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  triggered_by text not null check (triggered_by in ('schedule', 'manual')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_searched jsonb not null default '[]',
  events_discovered int not null default 0,
  campaigns_generated int not null default 0,
  error_details text
);

-- 11. Storage bucket for generated images.
-- Public so Instagram and Facebook can fetch the image URL when publishing.
insert into storage.buckets (id, name, public) values ('campaign-images', 'campaign-images', true)
  on conflict do nothing;

-- 12. Row-level security: only admins can read or change app data
do $$
declare t text;
begin
  foreach t in array array[
    'hotel_info', 'hotel_assets', 'events', 'event_revisions', 'campaigns',
    'campaign_versions', 'approval_history', 'publishing_history',
    'social_connections', 'automation_schedules', 'discovery_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.has_role(auth.uid(), ''admin''))
         with check (public.has_role(auth.uid(), ''admin''))',
      'admins_manage_' || t, t);
  end loop;
end $$;

-- 13. Scheduler: checks once a day at 00:05 UTC (05:35 IST). The function runs only when
--     next_run_at is due, so the real cadence is every 5 days. Re-running this with the same
--     job name replaces the entry, so no duplicate schedules are created.
-- Replace the placeholders and store the secret in Vault rather than in this file.
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('event-discovery-daily', '5 0 * * *', $$
--   select net.http_post(
--     url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/discover-events',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb)
-- $$);