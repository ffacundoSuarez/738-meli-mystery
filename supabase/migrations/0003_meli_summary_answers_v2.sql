-- ============================================================
-- 0003 — Allowlist de screening alineada al cuestionario v2
-- q32-entrega-tiempo → q34-entrega-tiempo
-- ============================================================

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

grant execute on function public.meli_summary_answers(jsonb) to anon, authenticated;
