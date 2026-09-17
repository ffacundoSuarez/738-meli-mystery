-- Nuevo StageStatus: cancelada_player (Ops marca compra cancelada por el player).
-- Acción del select de revisión; no reabre al shopper (no es corrección).

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
  v_answers jsonb;
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

  if p_action not in (
    'aprobar',
    'rechazar',
    'corregir',
    'en_revision',
    'revisado',
    'cancelada_player'
  ) then
    raise exception 'Acción inválida';
  end if;

  -- Acciones que devuelven la etapa al shopper: aceptan flags y mensaje de rechazo
  v_devuelve := p_action in ('rechazar', 'corregir');

  v_new_status := case p_action
    when 'aprobar' then 'aprobada'
    when 'rechazar' then 'rechazada'
    when 'corregir' then 'a_corregir'
    when 'revisado' then 'revisado'
    when 'cancelada_player' then 'cancelada_player'
    else 'en_revision'
  end;

  select * into v_row from meli_responses where id = p_response_id;
  if not found then
    raise exception 'Postulante no encontrado';
  end if;

  v_flags := coalesce(v_row.review_flags, '{}'::jsonb);
  v_answers := coalesce(v_row.answers, '{}'::jsonb);

  if v_devuelve and p_review_flags is not null and p_review_flags <> '{}'::jsonb then
    -- Descartar flags ya corregidas de esta sección antes de mergear nuevas
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
    for v_key, v_entry in select * from jsonb_each(p_review_flags) loop
      v_flags := v_flags || jsonb_build_object(v_key, v_entry);
    end loop;
  elsif p_action in ('aprobar', 'cancelada_player') then
    v_flags := public.meli_clear_review_flags_for_section(v_flags, p_section_id);
  end if;
  -- en_revision / revisado: no borrar flags existentes

  -- Pendiente de corrección: reabrir el cuestionario (quita thank-you / hard lock)
  if p_action = 'corregir' then
    v_answers := v_answers
      - 'proceso-finalizado'
      - 'encuesta-cerrada';
  end if;

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
      when p_action in ('en_revision', 'revisado', 'cancelada_player') then
        -- Reabrir, marcar revisado o cancelada por player: limpia mensaje de rechazo
        (coalesce(v_stages -> p_section_id, '{}'::jsonb) || v_stage_patch) - 'rejectionMessage'
      when v_devuelve and nullif(trim(p_rejection_message), '') is null then
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
    answers = v_answers,
    updated_at = v_now
  where id = p_response_id
  returning * into v_row;

  return public.meli_get_response_by_token(v_row.access_token);
end;
$$;

grant execute on function public.meli_admin_review_stage(text, text, text, text, text, text, jsonb) to anon, authenticated;
