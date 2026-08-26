-- Parche si ya corriste una versión anterior de 0005 con service_role.
-- Seguro correrlo aunque hayas corrido la 0005 actualizada.

create or replace function public.meli_get_public_results_client(
  p_username text,
  p_password text
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

  return public.meli_get_public_results();
end;
$$;

revoke execute on function public.meli_get_public_results() from anon;

revoke all on function public.meli_validate_resultados_client(text, text) from public;
grant execute on function public.meli_validate_resultados_client(text, text)
  to anon, authenticated;

grant execute on function public.meli_get_public_results_client(text, text)
  to anon, authenticated;
