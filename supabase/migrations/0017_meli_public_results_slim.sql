-- Listado /resultados liviano: evita timeout al no transferir answers completos.
-- Detalle on-demand: answers completos por id (mismo gating Ops / cliente).

-- Solo claves usadas en filtros/tabla de /resultados (ver lib/survey-snapshot.ts).
create or replace function public.meli_public_list_answers(p_answers jsonb)
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
        'q10-ciudad'
      )
    ),
    '{}'::jsonb
  );
$$;

-- Listado set-based: sin loop ni concatenación O(n²) del JSON completo.
create or replace function public.meli_get_public_results()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'code', code,
          'nombre', nombre,
          'apellido', apellido,
          'nombreApellido', nombre_apellido,
          'empresa', empresa,
          'ciudad', ciudad,
          'maxApprovedStage', public.meli_max_approved_stage(stages),
          'stages', coalesce(stages, '{}'::jsonb),
          'answers', public.meli_public_list_answers(answers),
          'updatedAt', updated_at
        )
        order by updated_at desc
      ),
      '[]'::jsonb
    )
    from meli_responses
    where coalesce(is_prueba, false) = false
      and public.meli_max_approved_stage(stages) is not null
  );
end;
$$;

-- Una encuesta publicada con answers completos (uso interno tras validar auth).
create or replace function public.meli_get_public_result_by_id(p_response_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_max_stage text;
begin
  select * into v_row
  from meli_responses
  where id = p_response_id
    and coalesce(is_prueba, false) = false;

  if not found then
    return null;
  end if;

  v_max_stage := public.meli_max_approved_stage(v_row.stages);
  if v_max_stage is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'nombre', v_row.nombre,
    'apellido', v_row.apellido,
    'nombreApellido', v_row.nombre_apellido,
    'empresa', v_row.empresa,
    'ciudad', v_row.ciudad,
    'maxApprovedStage', v_max_stage,
    'stages', coalesce(v_row.stages, '{}'::jsonb),
    'answers', coalesce(v_row.answers, '{}'::jsonb),
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.meli_get_public_result_ops(
  p_passcode text,
  p_response_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  return public.meli_get_public_result_by_id(p_response_id);
end;
$$;

create or replace function public.meli_get_public_result_client(
  p_username text,
  p_password text,
  p_response_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.meli_validate_resultados_client(p_username, p_password) then
    raise exception 'Credenciales inválidas';
  end if;

  return public.meli_get_public_result_by_id(p_response_id);
end;
$$;

revoke all on function public.meli_get_public_result_by_id(text) from public;
revoke execute on function public.meli_get_public_results() from anon;

grant execute on function public.meli_public_list_answers(jsonb)
  to anon, authenticated;

grant execute on function public.meli_get_public_result_ops(text, text)
  to anon, authenticated;

grant execute on function public.meli_get_public_result_client(text, text, text)
  to anon, authenticated;
