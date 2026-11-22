-- ============================================================
-- Additional schema: storage rules, settings tables, music library
-- Run after schema.sql
-- ============================================================

-- Storage: hotel photos bucket (public so images can be shown and sent to Meta)
insert into storage.buckets (id, name, public) values ('hotel-assets', 'hotel-assets', true)
  on conflict do nothing;
insert into storage.buckets (id, name, public) values ('campaign-images', 'campaign-images', true)
  on conflict do nothing;

-- Only admins can upload, replace or delete files in these buckets
create policy "admins write campaign and hotel images" on storage.objects
  for all to authenticated
  using (bucket_id in ('hotel-assets', 'campaign-images') and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id in ('hotel-assets', 'campaign-images') and public.has_role(auth.uid(), 'admin'));

-- Hotel details shown in Settings
alter table public.hotel_info add column if not exists room_categories text[] not null default '{}';
alter table public.hotel_info add column if not exists terrace_mountain_view text;

-- Features chosen for each event, and features stored on each campaign for regeneration
alter table public.events add column if not exists recommended_features text[] not null default '{}';
alter table public.campaigns add column if not exists features text[] not null default '{}';

-- Music library: only approved tracks are used. Only add tracks licensed for commercial use.
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('devotional', 'instrumental', 'traditional', 'contemporary')),
  mood text,
  license_note text,
  source_url text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.campaigns add column if not exists music_track_id uuid
  references public.music_tracks(id) on delete set null;

-- Brand settings (single row)
create table public.brand_settings (
  id int primary key default 1 check (id = 1),
  primary_color text not null default 'deep maroon and gold',
  heading_font text not null default 'modern serif',
  infographic_style text not null default 'elegant hospitality, clean typography, few words, no clutter',
  updated_at timestamptz not null default now()
);
insert into public.brand_settings (id) values (1) on conflict do nothing;

-- Content settings (single row)
create table public.content_settings (
  id int primary key default 1 check (id = 1),
  languages text[] not null default '{en,ta,te}' check (languages <@ array['en', 'ta', 'te']::text[]),
  images_per_event int not null default 2 check (images_per_event between 1 and 2),
  tone text not null default 'warm, welcoming and devotional',
  themes text[] not null default '{}',
  hashtags text[] not null default '{}',
  music_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.content_settings (id) values (1) on conflict do nothing;

-- Row-level security: admins only
alter table public.music_tracks enable row level security;
alter table public.brand_settings enable row level security;
alter table public.content_settings enable row level security;

create policy "admins manage music_tracks" on public.music_tracks
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins manage brand_settings" on public.brand_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins manage content_settings" on public.content_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
