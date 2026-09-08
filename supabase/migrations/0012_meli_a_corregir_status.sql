-- Estado "a_corregir": la etapa volvió al shopper con correcciones marcadas.
-- Se separa de 'rechazada' (descarte real) para que en el panel y en la base se
-- distinga "pendiente de corrección" de "rechazado rechazado".
--
-- 'rechazada' NO cambia de comportamiento: sigue devolviéndole la edición al shopper.
-- No afecta resultados públicos ni meli_max_approved_stage (solo 'aprobada').

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
  v_devuelve boolean;
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  if p_action not in ('aprobar', 'rechazar', 'corregir', 'en_revision', 'revisado') then
    raise exception 'Acción inválida';
  end if;

  -- Acciones que devuelven la etapa al shopper: aceptan flags y mensaje de rechazo
  v_devuelve := p_action in ('rechazar', 'corregir');

  v_new_status := case p_action
    when 'aprobar' then 'aprobada'
    when 'rechazar' then 'rechazada'
    when 'corregir' then 'a_corregir'
    when 'revisado' then 'revisado'
    else 'en_revision'
  end;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_flags := coalesce(v_row.review_flags, '{}'::jsonb);

  if v_devuelve and p_review_flags is not null and p_review_flags <> '{}'::jsonb then
    -- Descartar flags ya corregidas de esta sección antes de mergear nuevas
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
    for v_key, v_entry in select * from jsonb_each(p_review_flags) loop
      v_flags := v_flags || jsonb_build_object(v_key, v_entry);
    end loop;
  elsif p_action = 'aprobar' then
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
  end if;
  -- en_revision / revisado: no borrar flags existentes

  v_stage_patch := jsonb_build_object(
    'status', v_new_status,
    'reviewedAt', v_now,
    'reviewedBy', p_reviewed_by
  );

  if v_devuelve and nullif(trim(p_rejection_message), '') is not null then
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
      when p_action in ('en_revision', 'revisado') then
        -- Reabrir o marcar revisado: limpia mensaje de rechazo; conserva flags
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

-- ⚠️ ANTES de correr el backfill: ejecutar este SELECT y guardar el resultado.
-- Devuelve exactamente el conjunto que el DO block va a modificar, y es la única
-- lista de deshacer que va a existir (el trigger de updated_at pisa la marca de
-- tiempo, así que después no se puede distinguir qué filas se tocaron).
--
--   select r.id, r.code, e.key as section
--   from public.meli_responses r,
--        lateral jsonb_each(coalesce(r.stages, '{}'::jsonb)) as e(key, value)
--   where e.value ->> 'status' = 'rechazada'
--     and e.key = any(public.meli_reviewable_sections())
--     and exists (
--       select 1 from jsonb_each(coalesce(r.review_flags, '{}'::jsonb)) as f(key, entry)
--       where coalesce(f.entry ->> 'sectionId', '') = e.key
--         and coalesce(f.entry ->> 'corrected', 'false') <> 'true'
--     );

-- Backfill (una sola vez): las etapas hoy 'rechazada' que tengan correcciones
-- pendientes de esa sección fueron en realidad "enviadas a corregir".
--
-- Se excluyen las flags ya marcadas corrected=true: meli_mark_review_flags_corrected
-- no las borra al reenviar, quedan como historial. Sin ese filtro, un rechazo real
-- posterior a una corrección ya resuelta se reclasificaría mal.
--
-- Nota: el trigger meli_responses_set_updated_at pisa updated_at en cada UPDATE, así que
-- las filas reclasificadas suben en los listados ordenados por updated_at. Es cosmético
-- y de una sola vez; no se toca el trigger para no dejarlo deshabilitado si algo falla.
do $$
declare
  v_sections text[] := public.meli_reviewable_sections();
  v_row public.meli_responses%rowtype;
  v_section text;
  v_stages jsonb;
  v_changed boolean;
  v_has_pending boolean;
  v_count int := 0;
begin
  for v_row in select * from public.meli_responses loop
    v_stages := coalesce(v_row.stages, '{}'::jsonb);
    v_changed := false;

    foreach v_section in array v_sections loop
      if (v_stages -> v_section ->> 'status') = 'rechazada' then
        select exists (
          select 1
          from jsonb_each(coalesce(v_row.review_flags, '{}'::jsonb)) as f(key, entry)
          where coalesce(f.entry ->> 'sectionId', '') = v_section
            and coalesce(f.entry ->> 'corrected', 'false') <> 'true'
        ) into v_has_pending;

        if v_has_pending then
          v_stages := jsonb_set(
            v_stages,
            array[v_section, 'status'],
            to_jsonb('a_corregir'::text),
            true
          );
          v_changed := true;
        end if;
      end if;
    end loop;

    if v_changed then
      update public.meli_responses set stages = v_stages where id = v_row.id;
      v_count := v_count + 1;
    end if;
  end loop;

  raise notice 'Backfill a_corregir: % postulantes reclasificados', v_count;
end;
$$;

-- Control post-migración: recuento de etapas por estado.
--   select s.status, count(*)
--   from public.meli_responses r,
--        lateral (
--          select e.value ->> 'status' as status
--          from jsonb_each(coalesce(r.stages, '{}'::jsonb)) as e(key, value)
--        ) s
--   group by 1 order by 2 desc;
