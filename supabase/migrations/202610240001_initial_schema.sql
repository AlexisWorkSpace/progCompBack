create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[[:alnum:]_-]{3,20}$')
);

create unique index if not exists profiles_username_case_insensitive_idx
  on public.profiles (lower(username));

create table if not exists public.exercise_scores (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  exercise_id text not null check (exercise_id in ('A','B','C','D','E','F','G','H','I','J')),
  score smallint,
  wrong_attempts integer not null default 0 check (wrong_attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint exercise_score_range check (score is null or score between 1 and 10)
);

create index if not exists exercise_scores_ranking_idx
  on public.exercise_scores (user_id, score desc);

alter table public.profiles enable row level security;
alter table public.exercise_scores enable row level security;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
begin
  new_username := new.raw_user_meta_data ->> 'username';
  if new_username is null or new_username !~ '^[[:alnum:]_-]{3,20}$' then
    raise exception 'A valid username is required';
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, new_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.record_submission(
  p_user_id uuid,
  p_exercise_id text,
  p_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_score smallint;
  attempts integer;
  penalty integer;
  awarded_score smallint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_exercise_id not in ('A','B','C','D','E','F','G','H','I','J') then
    raise exception 'Invalid exercise';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_exercise_id, 0)
  );

  select s.score, s.wrong_attempts
    into existing_score, attempts
    from public.exercise_scores as s
    where s.user_id = p_user_id and s.exercise_id = p_exercise_id
    for update;

  if existing_score is not null then
    return jsonb_build_object(
      'alreadySolved', true,
      'score', existing_score,
      'wrongAttempts', coalesce(attempts, 0),
      'penalty', 0
    );
  end if;

  attempts := coalesce(attempts, 0);
  if not p_accepted then
    attempts := attempts + 1;
    insert into public.exercise_scores (user_id, exercise_id, score, wrong_attempts, updated_at)
    values (p_user_id, p_exercise_id, null, attempts, now())
    on conflict (user_id, exercise_id) do update
      set wrong_attempts = excluded.wrong_attempts, updated_at = now();
    return jsonb_build_object(
      'alreadySolved', false,
      'score', 0,
      'wrongAttempts', attempts,
      'penalty', 0
    );
  end if;

  penalty := least(9, attempts / 3);
  awarded_score := 10 - penalty;
  insert into public.exercise_scores (user_id, exercise_id, score, wrong_attempts, updated_at)
  values (p_user_id, p_exercise_id, awarded_score, attempts, now())
  on conflict (user_id, exercise_id) do update
    set score = excluded.score, updated_at = now();

  return jsonb_build_object(
    'alreadySolved', false,
    'score', awarded_score,
    'wrongAttempts', attempts,
    'penalty', penalty
  );
end;
$$;

revoke all on function public.record_submission(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_submission(uuid, text, boolean) to service_role;
