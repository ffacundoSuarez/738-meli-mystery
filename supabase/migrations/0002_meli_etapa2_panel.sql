-- ============================================================
-- 0002 — Etapa 2: ola, códigos CHI/COL, allowlist de screening
--
-- Aditivo sobre 0001. Base compartida con Prosegur: solo objetos meli_*.
-- No tocar public.app_config con alter/delete.
-- ============================================================

-- Sufijo de país para códigos de encuesta (1=CHI, 2=COL)
create or replace function public.meli_country_suffix(p_pais text)
returns text
language sql
immutable
as $$
  select case coalesce(p_pais, '')
    when '1' then 'CHI'
    when '2' then 'COL'
    else 'XX'
  end;
$$;

-- Regenera códigos con sufijo de país: ML-CHI-001 / TML-COL-001
-- La columna meli_responses.code tiene default que depende de la firma
-- vieja (boolean): hay que soltar el default antes del DROP.
alter table public.meli_responses
  alter column code drop default;

drop function if exists public.meli_generate_code(boolean);

create or replace function public.meli_generate_code(
  p_is_prueba boolean default false,
  p_pais text default null
)
returns text
language plpgsql
as $$
declare
  v_n text := lpad(nextval('public.meli_code_seq')::text, 3, '0');
  v_suffix text := public.meli_country_suffix(p_pais);
begin
  if coalesce(p_is_prueba, false) then
    return 'TML-' || v_suffix || '-' || v_n;
  end if;
  return 'ML-' || v_suffix || '-' || v_n;
end;
$$;

-- Default sin país → sufijo XX (el flujo real siempre pasa p_pais vía RPC)
alter table public.meli_responses
  alter column code set default public.meli_generate_code(false, null);

-- Allowlist de claves de screening para el listado liviano del dashboard.
-- Si no coincide con los IDs reales, los gráficos salen vacíos en silencio.
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
        'q8-competidor',
        'q10-ciudad',
        'q11-categoria',
        'q34-entrega-tiempo',
        'ola',
        'reclutador',
        'ultima-etapa',
        'nombre-apellido'
      )
    ),
    '{}'::jsonb
  );
$$;

-- Crear postulante: agrega p_ola; código con sufijo de país
drop function if exists public.meli_admin_create_postulante(text, text, text, text, text, boolean);

create or replace function public.meli_admin_create_postulante(
  p_passcode text,
  p_nombre_apellido text,
  p_pais text,
  p_idioma text default 'es',
  p_reclutador text default null,
  p_is_prueba boolean default false,
  p_ola text default null
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
  v_code := public.meli_generate_code(p_is_prueba, p_pais);

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

  if nullif(trim(coalesce(p_ola, '')), '') is not null then
    v_answers := v_answers || jsonb_build_object('ola', trim(p_ola));
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

grant execute on function public.meli_country_suffix(text) to anon, authenticated;
grant execute on function public.meli_generate_code(boolean, text) to anon, authenticated;
grant execute on function public.meli_summary_answers(jsonb) to anon, authenticated;
grant execute on function public.meli_admin_create_postulante(text, text, text, text, text, boolean, text) to anon, authenticated;
