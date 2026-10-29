create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('solo', 'pair')),
  invite_code text not null unique,
  member1_user_id uuid not null unique references auth.users (id) on delete cascade,
  member1_name text not null,
  member2_user_id uuid unique references auth.users (id) on delete set null,
  member2_expected_name text,
  member2_name text,
  created_at timestamptz not null default now(),
  constraint teams_member2_state check (
    (kind = 'solo' and member2_user_id is null and member2_expected_name is null and member2_name is null)
    or (kind = 'pair' and member2_expected_name is not null and
      ((member2_user_id is null and member2_name is null) or (member2_user_id is not null and member2_name is not null)))
  ),
  constraint teams_distinct_members check (member2_user_id is null or member2_user_id <> member1_user_id)
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists career text;
alter table public.profiles add column if not exists team_id uuid references public.teams (id) on delete restrict;
-- Existing prototype accounts need values before the new fields can be required.
update public.profiles set full_name = username where full_name is null;
update public.profiles set career = 'Sin especificar' where career is null;
-- Legacy users are put in one-member teams for a safe schema transition.
do $$
declare
  profile_row record;
  new_team_id uuid;
  invite text;
begin
  for profile_row in select user_id, username, full_name from public.profiles where team_id is null loop
    if (select count(*) from public.teams) >= 40 then
      raise exception 'More than 40 legacy teams: migrate users before applying this migration';
    end if;
    invite := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.teams (name, kind, invite_code, member1_user_id, member1_name)
    values ('Solo - ' || profile_row.username, 'solo', invite, profile_row.user_id, profile_row.full_name)
    returning id into new_team_id;
    update public.profiles set team_id = new_team_id where user_id = profile_row.user_id;
  end loop;
end;
$$;
alter table public.profiles alter column full_name set not null;
alter table public.profiles alter column career set not null;
alter table public.profiles alter column team_id set not null;
create index if not exists profiles_team_id_idx on public.profiles (team_id);

create table if not exists public.team_scores (
  team_id uuid not null references public.teams (id) on delete cascade,
  exercise_id text not null check (exercise_id in ('A','B','C','D','E','F','G','H','I','J')),
  score smallint,
  wrong_attempts integer not null default 0 check (wrong_attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (team_id, exercise_id),
  constraint team_score_range check (score is null or score between 1 and 10)
);
create index if not exists team_scores_ranking_idx on public.team_scores (team_id, score desc);

alter table public.teams enable row level security;
alter table public.team_scores enable row level security;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
  new_full_name text;
  new_career text;
  team_mode text;
  team_label text;
  partner_name text;
  invite text;
  target_team public.teams%rowtype;
  team_uuid uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(74219031);
  if (select count(*) from public.profiles) >= 80 then
    raise exception 'La competencia alcanzó el límite de 80 participantes';
  end if;

  new_username := new.raw_user_meta_data ->> 'username';
  new_full_name := pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name');
  new_career := pg_catalog.btrim(new.raw_user_meta_data ->> 'career');
  team_mode := new.raw_user_meta_data ->> 'team_mode';
  if new_username is null or new_username !~ '^[A-Za-z0-9_-]{3,20}$'
    or new_full_name is null or pg_catalog.char_length(new_full_name) not between 2 and 100
    or new_career is null or pg_catalog.char_length(new_career) not between 2 and 100 then
    raise exception 'Nombre, carrera o usuario inválido';
  end if;

  if team_mode in ('solo', 'pair') then
    if (select count(*) from public.teams) >= 40 then
      raise exception 'La competencia alcanzó el límite de 40 equipos';
    end if;
    team_label := pg_catalog.btrim(new.raw_user_meta_data ->> 'team_name');
    if team_mode = 'solo' then
      if team_label is null or pg_catalog.char_length(team_label) not between 2 and 60 then
        raise exception 'Indica el nombre del equipo individual';
      end if;
      invite := pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 10));
      insert into public.teams (name, kind, invite_code, member1_user_id, member1_name)
      values (team_label, 'solo', invite, new.id, new_full_name) returning id into team_uuid;
    else
      partner_name := pg_catalog.btrim(new.raw_user_meta_data ->> 'teammate_name');
      if team_label is null or pg_catalog.char_length(team_label) not between 2 and 60
        or partner_name is null or pg_catalog.char_length(partner_name) not between 2 and 100
        or pg_catalog.lower(partner_name) = pg_catalog.lower(new_full_name) then
        raise exception 'Indica un equipo y el nombre válido del segundo participante';
      end if;
      invite := pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 10));
      insert into public.teams (name, kind, invite_code, member1_user_id, member1_name, member2_expected_name)
      values (team_label, 'pair', invite, new.id, new_full_name, partner_name) returning id into team_uuid;
    end if;
  elsif team_mode = 'join' then
    invite := pg_catalog.upper(pg_catalog.btrim(new.raw_user_meta_data ->> 'invite_code'));
    select * into target_team from public.teams where invite_code = invite for update;
    if target_team.id is null or target_team.kind <> 'pair' or target_team.member2_user_id is not null then
      raise exception 'Código de equipo inválido o equipo completo';
    end if;
    if pg_catalog.lower(target_team.member2_expected_name) <> pg_catalog.lower(new_full_name) then
      raise exception 'El nombre no coincide con el segundo integrante invitado';
    end if;
    update public.teams set member2_user_id = new.id, member2_name = new_full_name where id = target_team.id;
    team_uuid := target_team.id;
  else
    raise exception 'Selecciona crear un equipo o unirse con un código';
  end if;

  insert into public.profiles (user_id, username, full_name, career, team_id)
  values (new.id, new_username, new_full_name, new_career, team_uuid);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.record_team_submission(
  p_team_id uuid,
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
    pg_catalog.hashtextextended(p_team_id::text || ':' || p_exercise_id, 0)
  );

  select score, wrong_attempts into existing_score, attempts
    from public.team_scores where team_id = p_team_id and exercise_id = p_exercise_id for update;
  if existing_score is not null then
    return jsonb_build_object('alreadySolved', true, 'score', existing_score,
      'wrongAttempts', coalesce(attempts, 0), 'penalty', 0);
  end if;

  attempts := coalesce(attempts, 0);
  if not p_accepted then
    attempts := attempts + 1;
    insert into public.team_scores (team_id, exercise_id, score, wrong_attempts, updated_at)
    values (p_team_id, p_exercise_id, null, attempts, now())
    on conflict (team_id, exercise_id) do update
      set wrong_attempts = excluded.wrong_attempts, updated_at = now();
    return jsonb_build_object('alreadySolved', false, 'score', 0, 'wrongAttempts', attempts, 'penalty', 0);
  end if;

  penalty := least(9, attempts / 3);
  awarded_score := 10 - penalty;
  insert into public.team_scores (team_id, exercise_id, score, wrong_attempts, updated_at)
  values (p_team_id, p_exercise_id, awarded_score, attempts, now())
  on conflict (team_id, exercise_id) do update set score = excluded.score, updated_at = now();
  return jsonb_build_object('alreadySolved', false, 'score', awarded_score,
    'wrongAttempts', attempts, 'penalty', penalty);
end;
$$;

revoke all on function public.record_team_submission(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_team_submission(uuid, text, boolean) to service_role;
