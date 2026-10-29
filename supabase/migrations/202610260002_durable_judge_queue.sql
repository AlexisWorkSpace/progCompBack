create unique index if not exists teams_name_case_insensitive_idx on public.teams (lower(name));
create unique index if not exists teams_invite_code_case_insensitive_idx on public.teams (upper(invite_code));

create table if not exists public.judge_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  mode text not null check (mode in ('run', 'submit')),
  exercise_id text check (exercise_id is null or exercise_id in ('A','B','C','D','E','F','G','H','I','J')),
  language text not null check (language in ('python', 'java', 'c', 'cpp')),
  source_code text not null,
  stdin text not null default '',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  worker_id text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint judge_jobs_mode_exercise check ((mode = 'run' and exercise_id is null) or (mode = 'submit' and exercise_id is not null))
);

create table if not exists public.judge_workers (
  worker_id text primary key,
  concurrency integer not null check (concurrency between 1 and 6),
  active_jobs integer not null default 0 check (active_jobs between 0 and concurrency),
  heartbeat_at timestamptz not null default now()
);
alter table public.judge_workers enable row level security;

create index if not exists judge_jobs_queue_idx on public.judge_jobs (status, created_at) where status = 'queued';
create index if not exists judge_jobs_owner_idx on public.judge_jobs (owner_user_id, created_at desc);
create unique index if not exists judge_jobs_one_active_submission_idx
  on public.judge_jobs (team_id, exercise_id) where mode = 'submit' and status in ('queued', 'running');

alter table public.judge_jobs enable row level security;

create or replace function public.enqueue_judge_job(
  p_user_id uuid, p_team_id uuid, p_mode text, p_exercise_id text,
  p_language text, p_source_code text, p_stdin text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  new_job public.judge_jobs%rowtype;
  existing_job public.judge_jobs%rowtype;
  queued_count integer;
  solved_score smallint;
  solved_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_mode not in ('run', 'submit') or p_language not in ('python', 'java', 'c', 'cpp') then
    raise exception 'Invalid judge job';
  end if;
  if p_mode = 'submit' and p_exercise_id not in ('A','B','C','D','E','F','G','H','I','J') then
    raise exception 'Invalid exercise';
  end if;
  if pg_catalog.octet_length(p_source_code) > 524288 or pg_catalog.octet_length(p_stdin) > 65536 then
    raise exception 'Submission exceeds size limits';
  end if;
  if not exists (select 1 from public.profiles as p where p.user_id = p_user_id and p.team_id = p_team_id) then
    raise exception 'User is not a member of this team' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(74219032);
  if p_mode = 'submit' then
    select score, wrong_attempts into solved_score, solved_attempts
      from public.team_scores where team_id = p_team_id and exercise_id = p_exercise_id;
    if solved_score is not null then
      return jsonb_build_object('alreadySolved', true, 'verdict', 'AC', 'score', solved_score,
        'wrongAttempts', solved_attempts, 'penalty', least(9, solved_attempts / 3));
    end if;
    select * into existing_job from public.judge_jobs
      where team_id = p_team_id and exercise_id = p_exercise_id
        and mode = 'submit' and status in ('queued', 'running')
      order by created_at desc limit 1;
    if existing_job.id is not null then
      return jsonb_build_object('jobId', existing_job.id, 'status', existing_job.status,
        'queuePosition', (select count(*) from public.judge_jobs as q where q.status = 'queued' and q.created_at <= existing_job.created_at));
    end if;
  end if;

  select count(*) into queued_count from public.judge_jobs where status = 'queued' and mode = p_mode;
  if queued_count >= 200 then
    raise exception 'La cola de evaluación está llena; vuelve a intentar en unos segundos' using errcode = '53300';
  end if;

  insert into public.judge_jobs (owner_user_id, team_id, mode, exercise_id, language, source_code, stdin)
  values (p_user_id, p_team_id, p_mode, p_exercise_id, p_language, p_source_code, coalesce(p_stdin, ''))
  returning * into new_job;
  return jsonb_build_object('jobId', new_job.id, 'status', new_job.status, 'queuePosition', queued_count + 1);
end;
$$;

create or replace function public.claim_next_judge_job(p_worker_id text)
returns setof public.judge_jobs language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
  with next_job as (
    select j.id from public.judge_jobs as j where j.status = 'queued'
    order by j.created_at asc, j.id asc for update of j skip locked limit 1
  )
  update public.judge_jobs as j
    set status = 'running', worker_id = p_worker_id, started_at = now()
    from next_job where j.id = next_job.id
  returning j.*;
end;
$$;

create or replace function public.finish_judge_job(p_job_id uuid, p_worker_id text, p_result jsonb, p_failure text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job public.judge_jobs%rowtype;
  score_result jsonb;
  final_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into job from public.judge_jobs where id = p_job_id for update;
  if job.id is null or job.status <> 'running' or job.worker_id <> p_worker_id then
    raise exception 'Job is not owned by this worker or is not running' using errcode = '42501';
  end if;

  if p_failure is not null then
    final_result := jsonb_build_object('error', p_failure);
    update public.judge_jobs set status = 'failed', result = final_result,
      source_code = '', stdin = '', completed_at = now() where id = p_job_id;
    return final_result;
  end if;

  final_result := coalesce(p_result, '{}'::jsonb);
  if job.mode = 'submit' then
    select public.record_team_submission(job.team_id, job.exercise_id, final_result ->> 'verdict' = 'AC')
      into score_result;
    final_result := final_result || score_result;
  end if;
  update public.judge_jobs set status = 'completed', result = final_result,
    source_code = '', stdin = '', completed_at = now() where id = p_job_id;
  return final_result;
end;
$$;

create or replace function public.requeue_stale_judge_jobs(p_stale_before timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.judge_jobs set status = 'queued', worker_id = null, started_at = null
    where status = 'running' and started_at < p_stale_before;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.prune_old_judge_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.judge_jobs where status in ('completed', 'failed') and completed_at < now() - interval '7 days';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.heartbeat_judge_worker(p_worker_id text, p_concurrency integer, p_active_jobs integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_concurrency not between 1 and 6 or p_active_jobs not between 0 and p_concurrency then
    raise exception 'Invalid worker heartbeat';
  end if;
  insert into public.judge_workers (worker_id, concurrency, active_jobs, heartbeat_at)
  values (p_worker_id, p_concurrency, p_active_jobs, now())
  on conflict (worker_id) do update
    set concurrency = excluded.concurrency, active_jobs = excluded.active_jobs, heartbeat_at = now();
end;
$$;

revoke all on function public.enqueue_judge_job(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_next_judge_job(text) from public, anon, authenticated;
revoke all on function public.finish_judge_job(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.requeue_stale_judge_jobs(timestamptz) from public, anon, authenticated;
revoke all on function public.prune_old_judge_jobs() from public, anon, authenticated;
revoke all on function public.heartbeat_judge_worker(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enqueue_judge_job(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.claim_next_judge_job(text) to service_role;
grant execute on function public.finish_judge_job(uuid, text, jsonb, text) to service_role;
grant execute on function public.requeue_stale_judge_jobs(timestamptz) to service_role;
grant execute on function public.prune_old_judge_jobs() to service_role;
grant execute on function public.heartbeat_judge_worker(text, integer, integer) to service_role;
