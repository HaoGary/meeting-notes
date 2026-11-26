-- 會議紀錄系統：資料表、索引、RLS 開啟與基本授權
create extension if not exists citext with schema extensions;

create table public.permissions (
  key         text primary key,
  "group"     text not null,
  label       text not null,
  description text not null default '',
  sort        int  not null default 0
);

create table public.roles (
  id          text primary key check (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  name        text not null unique check (char_length(btrim(name)) between 1 and 30),
  description text not null default '',
  color       text not null default '#6b7280' check (color ~ '^#[0-9a-fA-F]{6}$'),
  locked      boolean not null default false,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id        text not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             extensions.citext not null unique check (username ~ '^[a-zA-Z][a-zA-Z0-9_.]{3,19}$'),
  name                 text not null check (char_length(btrim(name)) between 1 and 30),
  email                text not null unique,
  role_id              text not null default 'viewer' references public.roles(id) on delete restrict,
  active               boolean not null default true,
  color                text not null default '#4f46e5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  must_change_password boolean not null default false,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index profiles_role_id_idx on public.profiles (role_id);
create index profiles_created_by_idx on public.profiles (created_by);

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '未命名會議' check (char_length(btrim(title)) between 1 and 200),
  meeting_date date not null default current_date,
  start_time   time not null default '10:00',
  end_time     time not null default '11:00',
  location     text not null default '' check (char_length(location) <= 200),
  online_url   text not null default '' check (online_url = '' or online_url ~* '^https?://'),
  host_id      uuid not null references public.profiles(id) on delete restrict,
  type         text not null default '例行會議'
               check (type in ('例行會議', '專案會議', '業務會議', '客戶會議', '內部檢討')),
  status       text not null default 'draft' check (status in ('draft', 'done', 'archived')),
  created_by   uuid not null references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint meetings_time_order check (end_time > start_time)
);
create index meetings_date_idx on public.meetings (meeting_date desc, start_time desc);
create index meetings_status_idx on public.meetings (status);
create index meetings_host_idx on public.meetings (host_id);
create index meetings_created_by_idx on public.meetings (created_by);

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete restrict,
  permission text not null default 'viewer' check (permission in ('editor', 'viewer')),
  added_at   timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index meeting_attendees_user_idx on public.meeting_attendees (user_id);

create table public.meeting_contents (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  doc        jsonb not null,
  version    int not null default 1 check (version >= 1),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create index meeting_contents_updated_by_idx on public.meeting_contents (updated_by);

create table public.meeting_shares (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  token      text not null unique default
             replace(replace(rtrim(encode(extensions.gen_random_bytes(12), 'base64'), '='), '+', '-'), '/', '_'),
  enabled    boolean not null default true,
  scope      text not null default 'org' check (scope in ('org', 'public')),
  expires_at timestamptz default now() + interval '30 days',
  view_count int not null default 0 check (view_count >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index meeting_shares_created_by_idx on public.meeting_shares (created_by);

create table public.meeting_history (
  id         bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete restrict,
  action     text not null,
  created_at timestamptz not null default now()
);
create index meeting_history_meeting_idx on public.meeting_history (meeting_id, created_at desc);
create index meeting_history_user_idx on public.meeting_history (user_id);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid not null references public.profiles(id) on delete restrict,
  action     text not null,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

alter table public.permissions       enable row level security;
alter table public.roles             enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.profiles          enable row level security;
alter table public.meetings          enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_contents  enable row level security;
alter table public.meeting_shares    enable row level security;
alter table public.meeting_history   enable row level security;
alter table public.audit_logs        enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;

grant select on public.permissions, public.roles, public.role_permissions,
  public.meetings, public.meeting_attendees, public.meeting_contents,
  public.meeting_shares, public.meeting_history, public.audit_logs to authenticated;
grant select (id, username, name, role_id, active, color, must_change_password, created_at) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
grant update (title, meeting_date, start_time, end_time, location, online_url, host_id, type) on public.meetings to authenticated;
grant delete on public.meetings to authenticated;
