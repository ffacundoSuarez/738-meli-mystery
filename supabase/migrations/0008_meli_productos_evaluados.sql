-- Listado público de productos evaluados (A03 + A10) para mystery shoppers.
-- Sin identificadores de postulante.

create or replace function public.meli_get_productos_evaluados()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_producto text;
begin
  for v_row in
    select answers
    from meli_responses
    where coalesce(is_prueba, false) = false
      and nullif(trim(answers->>'q03-producto'), '') is not null
    order by updated_at desc
  loop
    v_producto := trim(v_row.answers->>'q03-producto');
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'producto', v_producto,
      'categoria', v_row.answers->>'q11-categoria',
      'categoriaOtra', v_row.answers->>'q11-categoria-otra',
      'pais', v_row.answers->>'f1-pais'
    ));
  end loop;
  return v_result;
end;
$$;

grant execute on function public.meli_get_productos_evaluados() to anon, authenticated;
