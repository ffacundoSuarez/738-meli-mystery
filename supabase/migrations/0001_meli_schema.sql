-- ============================================================
-- Mystery Shopper Mercado Libre — esquema completo
--
-- Convive en el MISMO proyecto Supabase que Mystery Shopper Prosegur
-- (prosegur_*) y que el legacy Mystery Candidate (mystery_responses).
-- Todo lo que se crea acá lleva prefijo meli_ y es PURAMENTE ADITIVO:
-- no toca ninguna tabla, función, policy ni bucket de los otros proyectos.
--
-- Ejecutar completo en el SQL Editor del proyecto Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- ⚠️ ANTES DE CORRER: reemplazá CAMBIAR_ESTE_PASSCODE (más abajo, en el
--    insert a app_config) por el passcode real del panel Ops, y poné ese
--    mismo valor en INTERNAL_PASSCODE de tu .env.local.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Secuencia y generador de códigos legibles
-- ============================================================

-- Códigos: ML-001, ML-002, ... Las encuestas de prueba llevan prefijo T:
-- TML-003. El contador es único y compartido entre reales y pruebas, así
-- que los números no se repiten nunca.
create sequence if not exists public.meli_code_seq start 1;

create or replace function public.meli_generate_code(p_is_prueba boolean default false)
returns text
language plpgsql
as $$
declare
  v_n text := lpad(nextval('public.meli_code_seq')::text, 3, '0');
begin
  if coalesce(p_is_prueba, false) then
    return 'TML-' || v_n;
  end if;
  return 'ML-' || v_n;
end;
$$;

-- ============================================================
-- Tabla principal
-- ============================================================

create table if not exists public.meli_responses (
  id              text primary key,
  code            text not null default public.meli_generate_code(),
  access_token    uuid not null default gen_random_uuid(),
  nombre          text,
  apellido        text,
  nombre_apellido text,
  empresa         text,
  ciudad          text,
  fecha_inicio    date,
  fecha_fin       date,
  ultima_etapa    text,
  status          text not null default 'borrador'
                  check (status in ('borrador','en_revision','publicado','rechazado')),
  stages          jsonb not null default '{}'::jsonb,
  answers         jsonb not null default '{}'::jsonb,
  review_flags    jsonb not null default '{}'::jsonb,
  idioma          text not null default 'es'
                  check (idioma in ('es','pt')),
  is_prueba       boolean not null default false,
  reviewed_at     timestamptz,
  reviewed_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists meli_responses_code_idx
  on public.meli_responses (code);
create unique index if not exists meli_responses_access_token_idx
  on public.meli_responses (access_token);
create index if not exists meli_responses_status_idx
  on public.meli_responses (status);
create index if not exists meli_responses_stages_idx
  on public.meli_responses using gin (stages);

create or replace function public.meli_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meli_responses_set_updated_at on public.meli_responses;
create trigger meli_responses_set_updated_at
  before update on public.meli_responses
  for each row execute function public.meli_set_updated_at();

-- RLS habilitado SIN policies: nadie consulta la tabla directo con la anon key.
-- Todo el acceso pasa por las funciones security definer de más abajo.
alter table public.meli_responses enable row level security;

-- ============================================================
-- Passcode del panel Ops
--
-- app_config es COMPARTIDA con Prosegur y el legacy Mystery Candidate.
-- Por eso: create table if not exists + insert ... on conflict do nothing.
-- Nunca hacer alter ni delete sobre esta tabla.
-- ============================================================

create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

-- No se toca el RLS de app_config: ya viene habilitado desde los proyectos
-- que la crearon, y un alter acá afectaría a Prosegur y al legacy.
-- La tabla no tiene policies: solo la leen las funciones security definer.

-- ⚠️ REEMPLAZAR 'CAMBIAR_ESTE_PASSCODE' (en la línea de abajo) por el passcode
-- real del panel, y poner EXACTAMENTE el mismo valor en INTERNAL_PASSCODE de
-- tu .env.local. Si no coinciden, el login entra pero todas las consultas
-- fallan con "Passcode inválido".
--
-- Ojo con el on conflict do nothing: si corrés el script sin editar esta línea,
-- volver a correrlo NO arregla el hash. En ese caso, cambialo con:
--   select public.meli_admin_update_passcode('CAMBIAR_ESTE_PASSCODE', 'tu-passcode-real');
--
-- pgcrypto vive en el schema "extensions" en Supabase, por eso se califica.
insert into public.app_config (key, value)
values (
  'meli_passcode_hash',
  extensions.crypt('operaciones123', extensions.gen_salt('bf'))
)
on conflict (key) do nothing;

-- ============================================================
-- Storage — bucket de evidencia propio
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencia-meli', 'evidencia-meli', true, 5368709120, null)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Los nombres de policy son únicos por tabla en storage.objects, de ahí el
-- prefijo "meli". Estos drops solo tocan las policies de Meli.
drop policy if exists "meli evidencia lectura publica" on storage.objects;
create policy "meli evidencia lectura publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'evidencia-meli');

drop policy if exists "meli evidencia subida publica" on storage.objects;
create policy "meli evidencia subida publica"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'evidencia-meli');

-- ============================================================
-- Helpers internos
-- ============================================================

create or replace function public.meli_validate_passcode(p_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select value into v_hash from app_config where key = 'meli_passcode_hash';
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_passcode, v_hash);
end;
$$;

-- ⚠️ PUNTO ACOPLADO 1 de 2 con el cuestionario.
-- Debe coincidir EXACTAMENTE con REVIEWABLE_SECTIONS de lib/survey-config.ts
-- (que sale de los ids de surveySections). Si agregás o quitás partes,
-- este array se actualiza a la par o la cola de revisión deja de verlas.
create or replace function public.meli_reviewable_sections()
returns text[]
language sql
immutable
as $$
  select array['parte-1', 'parte-2', 'parte-3']::text[];
$$;

create or replace function public.meli_max_approved_stage(p_stages jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_order text[] := public.meli_reviewable_sections();
  v_stage text;
  v_status text;
  v_max text := null;
  v_idx int := 0;
  v_max_idx int := -1;
begin
  foreach v_stage in array v_order loop
    v_status := p_stages -> v_stage ->> 'status';
    if v_status = 'aprobada' then
      v_idx := array_position(v_order, v_stage);
      if v_idx > v_max_idx then
        v_max_idx := v_idx;
        v_max := v_stage;
      end if;
    end if;
  end loop;
  return v_max;
end;
$$;

-- Quita del mapa las flags de una sección (al aprobar, o antes de mergear nuevas)
create or replace function public.meli_clear_review_flags_for_section(
  p_flags jsonb,
  p_section_id text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_key text;
  v_result jsonb := '{}'::jsonb;
  v_entry jsonb;
begin
  if p_flags is null or p_flags = '{}'::jsonb then
    return '{}'::jsonb;
  end if;

  for v_key, v_entry in select * from jsonb_each(p_flags) loop
    if coalesce(v_entry ->> 'sectionId', '') <> p_section_id then
      v_result := v_result || jsonb_build_object(v_key, v_entry);
    end if;
  end loop;

  return v_result;
end;
$$;

-- Marca las flags de una sección como corregidas (al reenviar), sin borrarlas:
-- quedan como historial de qué se pidió corregir y cuándo se corrigió.
create or replace function public.meli_mark_review_flags_corrected(
  p_flags jsonb,
  p_section_id text,
  p_corrected_at timestamptz
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_key text;
  v_result jsonb := '{}'::jsonb;
  v_entry jsonb;
begin
  if p_flags is null or p_flags = '{}'::jsonb then
    return '{}'::jsonb;
  end if;

  for v_key, v_entry in select * from jsonb_each(p_flags) loop
    if coalesce(v_entry ->> 'sectionId', '') = p_section_id then
      v_result := v_result || jsonb_build_object(
        v_key,
        v_entry || jsonb_build_object(
          'corrected', true,
          'correctedAt', to_jsonb(p_corrected_at::text)
        )
      );
    else
      v_result := v_result || jsonb_build_object(v_key, v_entry);
    end if;
  end loop;

  return v_result;
end;
$$;

-- ⚠️ PUNTO ACOPLADO 2 de 2 con el cuestionario.
-- Recorta el jsonb de respuestas a las claves de screening, para que el
-- listado del panel no transfiera evidencias, matrices ni textos largos.
--
-- Alimenta meli_admin_list_responses_summary, que es la ÚNICA fuente de datos
-- de /dashboard, /dashboard/estadisticas, /dashboard/postulantes y
-- /dashboard/revision.
--
-- Si estas claves no coinciden con los ids reales de las preguntas de
-- screening, TODOS los gráficos del dashboard salen vacíos SIN lanzar ningún
-- error — parece "todavía no hay datos". Actualizar junto con
-- lib/survey-config/constants.ts y lib/survey-snapshot.ts.
create or replace function public.meli_summary_answers(p_answers jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (
      select jsonb_object_agg(key, value)
      from jsonb_each(coalesce(p_answers, '{}'::jsonb))
      where key in (
        'f1-pais',
        'f2-region',
        'f3-marca',
        'f3-marca-otra',
        'f4-categoria',
        'f5-canal',
        'reclutador',
        'ultima-etapa'
      )
    ),
    '{}'::jsonb
  );
$$;

-- ============================================================
-- RPCs — Shopper (access_token)
-- ============================================================

create or replace function public.meli_get_response_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
begin
  select * into v_row
  from meli_responses
  where access_token = p_token;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'accessToken', v_row.access_token,
    'idioma', coalesce(v_row.idioma, 'es'),
    'isPrueba', coalesce(v_row.is_prueba, false),
    'nombre', v_row.nombre,
    'apellido', v_row.apellido,
    'nombreApellido', v_row.nombre_apellido,
    'empresa', v_row.empresa,
    'ciudad', v_row.ciudad,
    'fechaInicio', v_row.fecha_inicio,
    'fechaFin', v_row.fecha_fin,
    'ultimaEtapa', v_row.ultima_etapa,
    'status', v_row.status,
    'stages', coalesce(v_row.stages, '{}'::jsonb),
    'reviewFlags', coalesce(v_row.review_flags, '{}'::jsonb),
    'answers', coalesce(v_row.answers, '{}'::jsonb),
    'reviewedAt', v_row.reviewed_at,
    'reviewedBy', v_row.reviewed_by,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.meli_save_stage_by_token(
  p_token uuid,
  p_section_id text,
  p_answers jsonb,
  p_submit_for_review boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_stages jsonb;
  v_merged jsonb;
  v_flags jsonb;
  v_now timestamptz := now();
  v_nombre text;
  v_apellido text;
begin
  select * into v_row from meli_responses where access_token = p_token;
  if not found then
    raise exception 'Encuesta no encontrada';
  end if;

  if coalesce(v_row.answers ->> 'proceso-finalizado', '') = 'si' then
    raise exception 'El proceso ya fue finalizado';
  end if;

  v_merged := coalesce(v_row.answers, '{}'::jsonb) || coalesce(p_answers, '{}'::jsonb);
  v_stages := coalesce(v_row.stages, '{}'::jsonb);
  v_flags := coalesce(v_row.review_flags, '{}'::jsonb);

  if p_section_id <> 'general' and p_submit_for_review then
    v_stages := v_stages || jsonb_build_object(
      p_section_id,
      (coalesce(v_stages -> p_section_id, '{}'::jsonb) ||
        jsonb_build_object(
          'status', 'en_revision',
          'submittedAt', v_now
        )) - 'rejectionMessage'
    );
    -- Al reenviar correcciones, marcar flags de esta sección como corregidas
    v_flags := public.meli_mark_review_flags_corrected(v_flags, p_section_id, v_now);
  elsif p_section_id <> 'general' then
    -- Guardado parcial: no cambia el estado de la etapa
    v_stages := v_stages || jsonb_build_object(
      p_section_id,
      coalesce(v_stages -> p_section_id, '{}'::jsonb) ||
      jsonb_build_object('status', coalesce(v_stages -> p_section_id ->> 'status', 'pendiente'))
    );
  end if;

  v_nombre := coalesce(v_row.nombre, v_merged ->> 'nombre-apellido');
  v_apellido := v_row.apellido;

  update meli_responses
  set
    answers = v_merged,
    stages = v_stages,
    review_flags = v_flags,
    nombre_apellido = coalesce(
      nullif(trim(coalesce(v_nombre, '') || ' ' || coalesce(v_apellido, '')), ''),
      v_merged ->> 'nombre-apellido',
      nombre_apellido
    ),
    empresa = coalesce(nullif(v_merged ->> 'empresa', ''), empresa),
    ciudad = coalesce(nullif(v_merged ->> 'ciudad', ''), ciudad),
    fecha_inicio = coalesce((v_merged ->> 'fecha-inicio')::date, fecha_inicio),
    fecha_fin = coalesce((v_merged ->> 'fecha-fin')::date, fecha_fin),
    ultima_etapa = coalesce(nullif(v_merged ->> 'ultima-etapa', ''), ultima_etapa),
    updated_at = v_now
  where access_token = p_token
  returning * into v_row;

  return public.meli_get_response_by_token(p_token);
end;
$$;

-- ============================================================
-- RPCs — Vista pública (/resultados, sin login)
-- ============================================================

create or replace function public.meli_get_public_results()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_max_stage text;
begin
  for v_row in
    select *
    from meli_responses
    where coalesce(is_prueba, false) = false
    order by updated_at desc
  loop
    v_max_stage := public.meli_max_approved_stage(v_row.stages);
    if v_max_stage is not null then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', v_row.id,
        'code', v_row.code,
        'nombre', v_row.nombre,
        'apellido', v_row.apellido,
        'nombreApellido', v_row.nombre_apellido,
        'empresa', v_row.empresa,
        'ciudad', v_row.ciudad,
        'maxApprovedStage', v_max_stage,
        'stages', v_row.stages,
        'answers', v_row.answers,
        'updatedAt', v_row.updated_at
      ));
    end if;
  end loop;
  return v_result;
end;
$$;

-- ============================================================
-- RPCs — Admin (passcode)
-- ============================================================

-- Crear postulante. La región NO se define desde el admin: la completa el
-- shopper en el screening. p_pais se precarga en answers bajo la clave
-- 'f1-pais', que debe existir como id de pregunta en lib/survey-config.
create or replace function public.meli_admin_create_postulante(
  p_passcode text,
  p_nombre_apellido text,
  p_pais text,
  p_idioma text default 'es',
  p_reclutador text default null,
  p_is_prueba boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_code text;
  v_idioma text;
  v_full_name text;
  v_nombre text;
  v_apellido text;
  v_space int;
  v_answers jsonb;
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  v_full_name := trim(coalesce(p_nombre_apellido, ''));
  if v_full_name = '' then
    raise exception 'Nombre y apellido requerido';
  end if;

  if coalesce(p_pais, '') = '' then
    raise exception 'País requerido';
  end if;

  v_idioma := case when p_idioma = 'pt' then 'pt' else 'es' end;
  v_code := public.meli_generate_code(p_is_prueba);

  -- Separar nombre y apellido por el primer espacio
  v_space := position(' ' in v_full_name);
  if v_space > 0 then
    v_nombre := left(v_full_name, v_space - 1);
    v_apellido := trim(substring(v_full_name from v_space + 1));
  else
    v_nombre := v_full_name;
    v_apellido := '';
  end if;

  v_answers := jsonb_build_object(
    'nombre-apellido', v_full_name,
    'f1-pais', p_pais
  );

  if nullif(trim(coalesce(p_reclutador, '')), '') is not null then
    v_answers := v_answers || jsonb_build_object('reclutador', trim(p_reclutador));
  end if;

  insert into meli_responses (
    id, code, nombre, apellido, nombre_apellido, idioma, answers, stages, is_prueba
  )
  values (
    v_code,
    v_code,
    v_nombre,
    nullif(v_apellido, ''),
    v_full_name,
    v_idioma,
    v_answers,
    '{}'::jsonb,
    coalesce(p_is_prueba, false)
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'accessToken', v_row.access_token,
    'idioma', v_row.idioma,
    'isPrueba', v_row.is_prueba,
    'nombre', v_row.nombre,
    'apellido', v_row.apellido,
    'nombreApellido', v_row.nombre_apellido,
    'answers', coalesce(v_row.answers, '{}'::jsonb),
    'stages', coalesce(v_row.stages, '{}'::jsonb),
    'createdAt', v_row.created_at
  );
end;
$$;

create or replace function public.meli_admin_list_postulantes(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'accessToken', access_token,
        'idioma', coalesce(idioma, 'es'),
        'isPrueba', coalesce(is_prueba, false),
        'nombre', nombre,
        'apellido', apellido,
        'nombreApellido', nombre_apellido,
        'empresa', empresa,
        'ciudad', ciudad,
        'stages', coalesce(stages, '{}'::jsonb),
        'reviewFlags', coalesce(review_flags, '{}'::jsonb),
        'answers', coalesce(answers, '{}'::jsonb),
        'status', status,
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by created_at desc
    ), '[]'::jsonb)
    from meli_responses
  );
end;
$$;

create or replace function public.meli_admin_get_responses(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'accessToken', access_token,
        'idioma', coalesce(idioma, 'es'),
        'isPrueba', coalesce(is_prueba, false),
        'nombre', nombre,
        'apellido', apellido,
        'nombreApellido', nombre_apellido,
        'empresa', empresa,
        'ciudad', ciudad,
        'fechaInicio', fecha_inicio,
        'fechaFin', fecha_fin,
        'ultimaEtapa', ultima_etapa,
        'status', status,
        'stages', coalesce(stages, '{}'::jsonb),
        'reviewFlags', coalesce(review_flags, '{}'::jsonb),
        'answers', coalesce(answers, '{}'::jsonb),
        'reviewedAt', reviewed_at,
        'reviewedBy', reviewed_by,
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by updated_at desc
    ), '[]'::jsonb)
    from meli_responses
  );
end;
$$;

-- Listado liviano para el panel: stages + solo las claves de screening.
-- Evita transferir evidencias, matrices y textos largos en listados grandes.
create or replace function public.meli_admin_list_responses_summary(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'accessToken', access_token,
        'idioma', coalesce(idioma, 'es'),
        'isPrueba', coalesce(is_prueba, false),
        'nombre', nombre,
        'apellido', apellido,
        'nombreApellido', nombre_apellido,
        'empresa', empresa,
        'ciudad', ciudad,
        'fechaInicio', fecha_inicio,
        'fechaFin', fecha_fin,
        'ultimaEtapa', ultima_etapa,
        'status', status,
        'stages', coalesce(stages, '{}'::jsonb),
        'answers', public.meli_summary_answers(answers),
        'createdAt', created_at,
        'updatedAt', updated_at
      ) order by updated_at desc
    ), '[]'::jsonb)
    from meli_responses
  );
end;
$$;

create or replace function public.meli_admin_get_pending_reviews(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_section text;
  v_sections text[] := public.meli_reviewable_sections();
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  for v_row in select * from meli_responses order by updated_at desc loop
    foreach v_section in array v_sections loop
      if (v_row.stages -> v_section ->> 'status') = 'en_revision' then
        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'id', v_row.id,
          'code', v_row.code,
          'accessToken', v_row.access_token,
          'idioma', coalesce(v_row.idioma, 'es'),
          'nombre', v_row.nombre,
          'apellido', v_row.apellido,
          'nombreApellido', v_row.nombre_apellido,
          'empresa', v_row.empresa,
          'ciudad', v_row.ciudad,
          'sectionId', v_section,
          'stages', coalesce(v_row.stages, '{}'::jsonb),
          'reviewFlags', coalesce(v_row.review_flags, '{}'::jsonb),
          'answers', coalesce(v_row.answers, '{}'::jsonb),
          'updatedAt', v_row.updated_at
        ));
      end if;
    end loop;
  end loop;

  return v_result;
end;
$$;

-- Aprobar / rechazar / reabrir una etapa.
-- 'rechazar' con p_review_flags marca preguntas puntuales a corregir.
-- 'en_revision' reabre una etapa aprobada conservando las flags existentes.
create or replace function public.meli_admin_review_stage(
  p_passcode text,
  p_response_id text,
  p_section_id text,
  p_action text,
  p_reviewed_by text default 'Ops',
  p_rejection_message text default null,
  p_review_flags jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_stages jsonb;
  v_flags jsonb;
  v_stage_patch jsonb;
  v_new_status text;
  v_now timestamptz := now();
  v_key text;
  v_entry jsonb;
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  if p_action not in ('aprobar', 'rechazar', 'en_revision') then
    raise exception 'Acción inválida';
  end if;

  v_new_status := case p_action
    when 'aprobar' then 'aprobada'
    when 'rechazar' then 'rechazada'
    else 'en_revision'
  end;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_flags := coalesce(v_row.review_flags, '{}'::jsonb);

  if p_action = 'rechazar' and p_review_flags is not null and p_review_flags <> '{}'::jsonb then
    -- Descartar flags ya corregidas de esta sección antes de mergear nuevas
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
    for v_key, v_entry in select * from jsonb_each(p_review_flags) loop
      v_flags := v_flags || jsonb_build_object(v_key, v_entry);
    end loop;
  elsif p_action = 'aprobar' then
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
  end if;
  -- en_revision: no borrar flags existentes (Ops puede retomar correcciones)

  v_stage_patch := jsonb_build_object(
    'status', v_new_status,
    'reviewedAt', v_now,
    'reviewedBy', p_reviewed_by
  );

  if p_action = 'rechazar' and nullif(trim(p_rejection_message), '') is not null then
    v_stage_patch := v_stage_patch || jsonb_build_object(
      'rejectionMessage', trim(p_rejection_message)
    );
  end if;

  v_stages := coalesce(v_row.stages, '{}'::jsonb);
  v_stages := jsonb_set(
    v_stages,
    array[p_section_id],
    case
      when p_action = 'aprobar' then
        (coalesce(v_stages -> p_section_id, '{}'::jsonb) || v_stage_patch) - 'rejectionMessage'
      when p_action = 'en_revision' then
        -- Reabrir: limpia mensaje de rechazo; conserva flags de revisión
        (coalesce(v_stages -> p_section_id, '{}'::jsonb) || v_stage_patch) - 'rejectionMessage'
      when nullif(trim(p_rejection_message), '') is null then
        (coalesce(v_stages -> p_section_id, '{}'::jsonb) || v_stage_patch) - 'rejectionMessage'
      else
        coalesce(v_stages -> p_section_id, '{}'::jsonb) || v_stage_patch
    end,
    true
  );

  update meli_responses
  set
    stages = v_stages,
    review_flags = v_flags,
    reviewed_at = v_now,
    reviewed_by = p_reviewed_by,
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

-- Editar respuestas desde el panel sin cambiar el estado de las etapas
create or replace function public.meli_admin_update_answers(
  p_passcode text,
  p_response_id text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_merged jsonb;
  v_nombre text;
  v_apellido text;
  v_now timestamptz := now();
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_merged := coalesce(v_row.answers, '{}'::jsonb) || coalesce(p_answers, '{}'::jsonb);

  v_nombre := coalesce(v_row.nombre, v_merged ->> 'nombre-apellido');
  v_apellido := v_row.apellido;

  update meli_responses
  set
    answers = v_merged,
    nombre_apellido = coalesce(
      nullif(trim(coalesce(v_nombre, '') || ' ' || coalesce(v_apellido, '')), ''),
      v_merged ->> 'nombre-apellido',
      nombre_apellido
    ),
    empresa = coalesce(nullif(v_merged ->> 'empresa', ''), empresa),
    ciudad = coalesce(nullif(v_merged ->> 'ciudad', ''), ciudad),
    fecha_inicio = coalesce((v_merged ->> 'fecha-inicio')::date, fecha_inicio),
    fecha_fin = coalesce((v_merged ->> 'fecha-fin')::date, fecha_fin),
    ultima_etapa = coalesce(nullif(v_merged ->> 'ultima-etapa', ''), ultima_etapa),
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

-- Editar nombre/apellido y reclutador. No toca país, idioma, is_prueba ni el código.
create or replace function public.meli_admin_update_postulante(
  p_passcode text,
  p_response_id text,
  p_nombre_apellido text,
  p_reclutador text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_full_name text;
  v_nombre text;
  v_apellido text;
  v_space int;
  v_answers jsonb;
  v_now timestamptz := now();
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_full_name := trim(coalesce(p_nombre_apellido, ''));
  if v_full_name = '' then
    raise exception 'Nombre y apellido requerido';
  end if;

  v_space := position(' ' in v_full_name);
  if v_space > 0 then
    v_nombre := left(v_full_name, v_space - 1);
    v_apellido := trim(substring(v_full_name from v_space + 1));
  else
    v_nombre := v_full_name;
    v_apellido := '';
  end if;

  v_answers := coalesce(v_row.answers, '{}'::jsonb)
    || jsonb_build_object('nombre-apellido', v_full_name);

  if nullif(trim(coalesce(p_reclutador, '')), '') is null then
    v_answers := v_answers - 'reclutador';
  else
    v_answers := v_answers || jsonb_build_object('reclutador', trim(p_reclutador));
  end if;

  update meli_responses
  set
    nombre = v_nombre,
    apellido = nullif(v_apellido, ''),
    nombre_apellido = v_full_name,
    answers = v_answers,
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

create or replace function public.meli_admin_delete_postulante(
  p_passcode text,
  p_response_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  delete from meli_responses where id = p_response_id;

  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  return true;
end;
$$;

-- Reabrir el cuestionario: quita las marcas de cierre para que el shopper
-- pueda volver a editar. Se conserva fecha-fin por si Ops la necesita.
create or replace function public.meli_admin_unlock_survey(
  p_passcode text,
  p_response_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_answers jsonb;
  v_now timestamptz := now();
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_answers := coalesce(v_row.answers, '{}'::jsonb)
    - 'proceso-finalizado'
    - 'encuesta-cerrada';

  update meli_responses
  set
    answers = v_answers,
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

-- Cambiar el passcode del panel. Se invoca a mano desde el SQL Editor:
--   select public.meli_admin_update_passcode('passcode-actual', 'passcode-nuevo');
-- Acordate de actualizar también INTERNAL_PASSCODE en .env.local.
create or replace function public.meli_admin_update_passcode(
  p_current_passcode text,
  p_new_passcode text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.meli_validate_passcode(p_current_passcode) then
    raise exception 'Passcode actual inválido';
  end if;

  update app_config
  set value = crypt(p_new_passcode, gen_salt('bf'))
  where key = 'meli_passcode_hash';

  return true;
end;
$$;

-- ============================================================
-- Grants
--
-- La app usa solo la anon key: todas las RPCs se invocan como anon.
-- La autoridad real es el access_token (shopper) o el passcode validado
-- dentro de cada función admin contra app_config.
-- ============================================================

grant execute on function public.meli_generate_code(boolean) to anon, authenticated;
grant execute on function public.meli_reviewable_sections() to anon, authenticated;
grant execute on function public.meli_max_approved_stage(jsonb) to anon, authenticated;
grant execute on function public.meli_clear_review_flags_for_section(jsonb, text) to anon, authenticated;
grant execute on function public.meli_mark_review_flags_corrected(jsonb, text, timestamptz) to anon, authenticated;
grant execute on function public.meli_summary_answers(jsonb) to anon, authenticated;

grant execute on function public.meli_get_response_by_token(uuid) to anon, authenticated;
grant execute on function public.meli_save_stage_by_token(uuid, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.meli_get_public_results() to anon, authenticated;

grant execute on function public.meli_admin_create_postulante(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.meli_admin_list_postulantes(text) to anon, authenticated;
grant execute on function public.meli_admin_get_responses(text) to anon, authenticated;
grant execute on function public.meli_admin_list_responses_summary(text) to anon, authenticated;
grant execute on function public.meli_admin_get_pending_reviews(text) to anon, authenticated;
grant execute on function public.meli_admin_review_stage(text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.meli_admin_update_answers(text, text, jsonb) to anon, authenticated;
grant execute on function public.meli_admin_update_postulante(text, text, text, text) to anon, authenticated;
grant execute on function public.meli_admin_delete_postulante(text, text) to anon, authenticated;
grant execute on function public.meli_admin_unlock_survey(text, text) to anon, authenticated;
grant execute on function public.meli_admin_update_passcode(text, text) to anon, authenticated;
