-- Flag reutilizable para destacar una encuesta en los listados de Ops
-- (Postulantes / Revisión), sin hardcodear IDs en el front.

alter table public.meli_responses
  add column if not exists is_destacada boolean not null default false;

-- Caso pedido: 236COL Cali Temu
update public.meli_responses
set is_destacada = true
where code = 'ML-COL-584';

-- Exponer isDestacada en el listado liviano del panel
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
        'isDestacada', coalesce(is_destacada, false),
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

-- Toggle Destacar / Quitar destacado desde Postulantes
create or replace function public.meli_admin_set_destacada(
  p_passcode text,
  p_response_id text,
  p_destacada boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.meli_responses%rowtype;
  v_now timestamptz := now();
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  update meli_responses
  set
    is_destacada = coalesce(p_destacada, false),
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

grant execute on function public.meli_admin_list_responses_summary(text) to anon, authenticated;
grant execute on function public.meli_admin_set_destacada(text, text, boolean) to anon, authenticated;

-- Detalle por token: incluir isDestacada (toggle y unlock lo usan)
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
    'isDestacada', coalesce(v_row.is_destacada, false),
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

grant execute on function public.meli_get_response_by_token(uuid) to anon, authenticated;
