-- Auth clientes para /resultados: hashes bcrypt en app_config (mismo patrón que Ops).
-- Los 3 usuarios se cargan post-deploy vía meli_admin_upsert_resultados_client.

insert into public.app_config (key, value)
values ('meli_resultados_clients', '[]')
on conflict (key) do nothing;

-- Valida email+password contra meli_resultados_clients (grant anon, como RPCs admin).
create or replace function public.meli_validate_resultados_client(
  p_username text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clients jsonb;
  v_entry jsonb;
  v_normalized text := lower(trim(p_username));
  v_hash text;
begin
  select value::jsonb into v_clients
  from app_config
  where key = 'meli_resultados_clients';

  if v_clients is null or jsonb_array_length(v_clients) = 0 then
    return false;
  end if;

  for v_entry in select * from jsonb_array_elements(v_clients)
  loop
    if lower(trim(v_entry->>'username')) = v_normalized then
      v_hash := v_entry->>'hash';
      if v_hash is null then
        return false;
      end if;
      return v_hash = extensions.crypt(p_password, v_hash);
    end if;
  end loop;

  return false;
end;
$$;

-- Alta o rotación de usuario cliente (requiere passcode Ops). Máx. 3 entradas.
create or replace function public.meli_admin_upsert_resultados_client(
  p_passcode text,
  p_username text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clients jsonb;
  v_normalized text := lower(trim(p_username));
  v_new_hash text;
  v_found boolean := false;
  v_new_clients jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_count int := 0;
begin
  if not public.meli_validate_passcode(p_passcode) then
    raise exception 'Passcode inválido';
  end if;

  if p_username is null or trim(p_username) = '' then
    raise exception 'Username requerido';
  end if;

  if p_new_password is null or p_new_password = '' then
    raise exception 'Password requerido';
  end if;

  select coalesce(value::jsonb, '[]'::jsonb) into v_clients
  from app_config
  where key = 'meli_resultados_clients';

  v_new_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  for v_entry in select * from jsonb_array_elements(v_clients)
  loop
    v_count := v_count + 1;
    if lower(trim(v_entry->>'username')) = v_normalized then
      v_new_clients := v_new_clients || jsonb_build_array(
        jsonb_build_object('username', trim(p_username), 'hash', v_new_hash)
      );
      v_found := true;
    else
      v_new_clients := v_new_clients || jsonb_build_array(v_entry);
    end if;
  end loop;

  if not v_found then
    if v_count >= 3 then
      raise exception 'Máximo 3 usuarios cliente permitidos';
    end if;
    v_new_clients := v_new_clients || jsonb_build_array(
      jsonb_build_object('username', trim(p_username), 'hash', v_new_hash)
    );
  end if;

  insert into public.app_config (key, value)
  values ('meli_resultados_clients', v_new_clients::text)
  on conflict (key) do update set value = excluded.value;

  return true;
end;
$$;

-- Resultados publicados — requiere credenciales cliente (reemplaza acceso anon directo).
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

-- Cerrar acceso público sin credenciales.
revoke execute on function public.meli_get_public_results() from anon;

grant execute on function public.meli_validate_resultados_client(text, text)
  to anon, authenticated;

grant execute on function public.meli_get_public_results_client(text, text)
  to anon, authenticated;

grant execute on function public.meli_get_public_results_ops(text)
  to anon, authenticated;

grant execute on function public.meli_admin_upsert_resultados_client(text, text, text)
  to anon, authenticated;
