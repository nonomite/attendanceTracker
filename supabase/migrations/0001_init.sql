-- Attendance system schema: students, meetings, attendance, roles, and RLS.
-- Run this in the Supabase SQL editor (or `supabase db push` once linked).

create extension if not exists pgcrypto;

create type meeting_status as enum ('OPEN', 'ENDED', 'EXPIRED');
create type app_role as enum ('admin', 'student');

-- One row per auth.users, used to authorize admin actions in Edge Functions.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  student_number text unique not null,
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_code text unique not null,
  title text not null,
  created_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  status meeting_status not null default 'OPEN',
  qr_token_hash text unique not null,
  created_at timestamptz not null default now(),
  check (expires_at > started_at)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  student_id uuid not null references public.students(id),
  timed_in_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (meeting_id, student_id)
);

create index attendance_meeting_id_idx on public.attendance(meeting_id);
create index meetings_open_expiry_idx on public.meetings(status, expires_at);

-- Row Level Security: the anon/browser key can only ever read what these
-- policies allow. All writes to meetings/attendance happen inside Edge
-- Functions using the service-role key, which bypasses RLS entirely.

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;

create policy "profiles: self read" on public.profiles
  for select using (id = auth.uid());

create policy "students: self read" on public.students
  for select using (auth_user_id = auth.uid());

create policy "students: admin read" on public.students
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "meetings: admin read" on public.meetings
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "attendance: student reads own" on public.attendance
  for select using (
    exists (
      select 1 from public.students s
      where s.id = attendance.student_id and s.auth_user_id = auth.uid()
    )
  );

create policy "attendance: admin reads all" on public.attendance
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- No insert/update/delete policies are defined for students/meetings/attendance,
-- so direct client writes are denied by default. Only the service-role key
-- (used inside Edge Functions) can write to these tables.

-- RLS policies only decide which ROWS a role can see -- the role still needs
-- a baseline table-level GRANT before Postgres will let it touch the table
-- at all. Tables created via the SQL editor don't always inherit this
-- automatically, so it's set explicitly here.
grant select on public.profiles, public.students, public.meetings, public.attendance to authenticated;

-- After running this migration:
--   1. Create your admin user in Supabase Auth (Authentication > Users).
--   2. insert into public.profiles (id, role) values ('<that user's UUID>', 'admin');
--   3. Add student rows as you build your roster, e.g.:
--      insert into public.students (student_number, full_name) values ('2023-0001', 'Juan Dela Cruz');
