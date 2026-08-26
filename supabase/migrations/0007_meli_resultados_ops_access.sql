-- Ops puede ver /resultados con passcode (mismo patrón que RPCs admin).

create or replace function public.meli_get_public_results_ops(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  return public.meli_get_public_results();
end;
$$;

grant execute on function public.meli_get_public_results_ops(text)
  to anon, authenticated;
