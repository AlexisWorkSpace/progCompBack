do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.judge_jobs'::regclass, 'public.team_scores'::regclass)
      and pg_get_constraintdef(oid) like '%exercise_id%'
      and pg_get_constraintdef(oid) like '%''J''%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end;
$$;
 
alter table public.judge_jobs
  add constraint judge_jobs_exercise_id_check
  check (exercise_id is null or exercise_id in ('A','B','C','D','E','F','G','H','I','J','T'));
 
alter table public.team_scores
  add constraint team_scores_exercise_id_check
  check (exercise_id in ('A','B','C','D','E','F','G','H','I','J','T'));
 
-- 2) Funciones con la lista A..J escrita en el codigo (enqueue_judge_job y record_team_submission).
--    Se toma la definicion actual desde la base de datos y solo se agrega 'T' a esa lista.
--    Se conservan permisos, propietario y el resto del codigo tal como estan.
do $$
declare
  fn regprocedure;
  def text;
begin
  foreach fn in array array[
    'public.enqueue_judge_job(uuid, uuid, text, text, text, text, text)'::regprocedure,
    'public.record_team_submission(uuid, text, boolean)'::regprocedure
  ]
  loop
    def := pg_get_functiondef(fn);
    if position('''T''' in def) = 0 then
      def := replace(def, '''J''', '''J'',''T''');
      if position('''T''' in def) = 0 then
        raise exception 'No se encontro la lista de ejercicios en la funcion %', fn;
      end if;
      execute def;
    end if;
  end loop;
end;
$$;
 
