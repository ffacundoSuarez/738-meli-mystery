-- ============================================================
-- 0004_meli_fix_usd_amounts.sql
-- Backfill / diagnóstico de montos USD mal parseados (separadores
-- de miles: 87.000 → 87 → ~$0.09 USD).
--
-- Correr a mano en el SQL Editor de Supabase, en este orden:
--   1) SELECT diagnóstico
--   2) UPDATE de filas que todavía tienen separador
--   3) SELECT de sospechosos truncados (revisión manual)
--
-- FX alineado con lib/survey-config/fx.ts (placeholder Ops):
--   CLP→USD 0.00105 | COP→USD 0.00025 | USD passthrough
-- Si cambian las tasas en código, actualizar también acá.
-- ============================================================

-- Helper: parsea montos con punto/coma de miles o decimal.
-- Heurística: 3 dígitos tras el último separador → miles.
create or replace function public.meli_parse_amount(p_raw text)
returns numeric
language plpgsql
immutable
as $$
declare
  s text;
  last_dot int;
  last_comma int;
  last_sep int;
  after_part text;
  before_part text;
  sep text;
begin
  if p_raw is null then
    return null;
  end if;

  s := trim(p_raw);
  s := regexp_replace(s, '[$€£]|USD|CLP|COP|pesos?', '', 'gi');
  s := regexp_replace(s, '\s', '', 'g');
  if s = '' then
    return null;
  end if;

  -- Solo dígitos (y opcional decimal con punto)
  if s ~ '^\d+(\.\d+)?$' and position(',' in s) = 0 then
    return s::numeric;
  end if;

  last_dot := case when strpos(reverse(s), '.') > 0
    then length(s) - strpos(reverse(s), '.') + 1 else 0 end;
  last_comma := case when strpos(reverse(s), ',') > 0
    then length(s) - strpos(reverse(s), ',') + 1 else 0 end;
  last_sep := greatest(last_dot, last_comma);

  if last_sep = 0 then
    begin
      return s::numeric;
    exception when others then
      return null;
    end;
  end if;

  after_part := substring(s from last_sep + 1);
  before_part := substring(s from 1 for last_sep - 1);
  sep := substring(s from last_sep for 1);

  -- Miles: 87.000 / 87,000
  if after_part ~ '^\d{3}$'
     and position('.' in before_part) = 0
     and position(',' in before_part) = 0 then
    return (regexp_replace(before_part, '\D', '', 'g') || after_part)::numeric;
  end if;

  -- Grupos de miles: 1.234.567 / 1,234,567
  if (sep = '.' and s ~ '^\d{1,3}(\.\d{3})+$')
     or (sep = ',' and s ~ '^\d{1,3}(,\d{3})+$') then
    return regexp_replace(s, '[.,]', '', 'g')::numeric;
  end if;

  -- Decimal 1–2 dígitos: 87,50 / 87.5
  if after_part ~ '^\d{1,2}$' then
    return (regexp_replace(before_part, '[.,]', '', 'g') || '.' || after_part)::numeric;
  end if;

  -- Mixto US: 1,234.56
  if last_dot > last_comma and last_comma > 0 then
    return replace(s, ',', '')::numeric;
  end if;

  -- Mixto CL/CO: 1.234,56
  if last_comma > last_dot and last_dot > 0 then
    return replace(replace(s, '.', ''), ',', '.')::numeric;
  end if;

  begin
    return replace(s, ',', '')::numeric;
  exception when others then
    return null;
  end;
end;
$$;

-- Convierte monto local a USD (mismas tasas que fx.ts)
create or replace function public.meli_to_usd(p_amount numeric, p_moneda text)
returns numeric
language sql
immutable
as $$
  select case p_moneda
    when '1' then round(p_amount * 0.00105, 2)  -- CLP
    when '2' then round(p_amount * 0.00025, 2)  -- COP
    when '3' then round(p_amount, 2)            -- USD
    else null
  end;
$$;

-- ------------------------------------------------------------
-- PASO 1 — SELECT diagnóstico (no escribe nada)
-- ------------------------------------------------------------
/*
select
  code,
  answers->>'f1-pais' as pais,
  answers->>'q12-precio' as a11,
  answers->>'q12-1-moneda' as a11_moneda,
  answers->>'q12a-precio-usd' as a11_usd,
  answers->>'q19-precio-envio' as a20,
  answers->>'q19-1-moneda-envio' as a20_moneda,
  answers->>'q19-2-precio-envio-usd' as a20_usd,
  answers->>'q19a-precio-impuestos' as a21,
  answers->>'q19a-1-moneda-impuestos' as a21_moneda,
  answers->>'q19b-impuestos-usd' as a21_usd,
  answers->>'q46c-precio-final' as f13,
  answers->>'q46c-1-moneda' as f13_moneda,
  answers->>'q46c-2-precio-usd' as f13_usd
from public.meli_responses
where
  answers ? 'q12-precio'
  or answers ? 'q19-precio-envio'
  or answers ? 'q19a-precio-impuestos'
  or answers ? 'q46c-precio-final'
order by created_at desc nulls last;
*/

-- ------------------------------------------------------------
-- PASO 2 — UPDATE solo si el string todavía tiene separador
-- (punto/coma + 3 dígitos = miles). Reescribe monto limpio + USD.
-- Descomentá y corré después de revisar el SELECT.
-- ------------------------------------------------------------
/*
update public.meli_responses r
set answers = (
  with parsed as (
    select
      case
        when r.answers->>'q12-precio' ~ '[0-9][.,][0-9]{3}'
        then public.meli_parse_amount(r.answers->>'q12-precio')
        else null
      end as a11,
      case
        when r.answers->>'q19-precio-envio' ~ '[0-9][.,][0-9]{3}'
        then public.meli_parse_amount(r.answers->>'q19-precio-envio')
        else null
      end as a20,
      case
        when r.answers->>'q19a-precio-impuestos' ~ '[0-9][.,][0-9]{3}'
        then public.meli_parse_amount(r.answers->>'q19a-precio-impuestos')
        else null
      end as a21,
      case
        when r.answers->>'q46c-precio-final' ~ '[0-9][.,][0-9]{3}'
        then public.meli_parse_amount(r.answers->>'q46c-precio-final')
        else null
      end as f13
  )
  select
    r.answers
    || case when p.a11 is not null then jsonb_build_object(
         'q12-precio', to_jsonb(trim(to_char(p.a11, 'FM999999999999.######'))),
         'q12a-precio-usd', to_jsonb(to_char(
           public.meli_to_usd(p.a11, r.answers->>'q12-1-moneda'), 'FM999999990.00'
         ))
       ) else '{}'::jsonb end
    || case when p.a20 is not null then jsonb_build_object(
         'q19-precio-envio', to_jsonb(trim(to_char(p.a20, 'FM999999999999.######'))),
         'q19-2-precio-envio-usd', to_jsonb(to_char(
           public.meli_to_usd(p.a20, r.answers->>'q19-1-moneda-envio'), 'FM999999990.00'
         ))
       ) else '{}'::jsonb end
    || case when p.a21 is not null then jsonb_build_object(
         'q19a-precio-impuestos', to_jsonb(trim(to_char(p.a21, 'FM999999999999.######'))),
         'q19b-impuestos-usd', to_jsonb(to_char(
           public.meli_to_usd(p.a21, r.answers->>'q19a-1-moneda-impuestos'), 'FM999999990.00'
         ))
       ) else '{}'::jsonb end
    || case when p.f13 is not null then jsonb_build_object(
         'q46c-precio-final', to_jsonb(trim(to_char(p.f13, 'FM999999999999.######'))),
         'q46c-2-precio-usd', to_jsonb(to_char(
           public.meli_to_usd(p.f13, r.answers->>'q46c-1-moneda'), 'FM999999990.00'
         ))
       ) else '{}'::jsonb end
  from parsed p
)
where
  answers->>'q12-precio' ~ '[0-9][.,][0-9]{3}'
  or answers->>'q19-precio-envio' ~ '[0-9][.,][0-9]{3}'
  or answers->>'q19a-precio-impuestos' ~ '[0-9][.,][0-9]{3}'
  or answers->>'q46c-precio-final' ~ '[0-9][.,][0-9]{3}';
*/

-- ------------------------------------------------------------
-- PASO 3 — SELECT de sospechosos truncados (NO auto-fix)
-- Browser ya guardó "87"; el original se perdió. Revisar a mano.
-- Criterio: CLP/COP con monto < 1000 en producto/total, o USD < 1.
-- ------------------------------------------------------------
/*
select
  code,
  answers->>'f1-pais' as pais,
  answers->>'q12-precio' as a11,
  answers->>'q12-1-moneda' as a11_moneda,
  answers->>'q12a-precio-usd' as a11_usd,
  answers->>'q46c-precio-final' as f13,
  answers->>'q46c-1-moneda' as f13_moneda,
  answers->>'q46c-2-precio-usd' as f13_usd
from public.meli_responses
where
  (
    answers->>'q12-1-moneda' in ('1', '2')
    and nullif(trim(answers->>'q12-precio'), '') ~ '^\d+(\.\d+)?$'
    and nullif(trim(answers->>'q12-precio'), '')::numeric > 0
    and nullif(trim(answers->>'q12-precio'), '')::numeric < 1000
  )
  or (
    answers->>'q46c-1-moneda' in ('1', '2')
    and nullif(trim(answers->>'q46c-precio-final'), '') ~ '^\d+(\.\d+)?$'
    and nullif(trim(answers->>'q46c-precio-final'), '')::numeric > 0
    and nullif(trim(answers->>'q46c-precio-final'), '')::numeric < 1000
  )
  or (
    nullif(trim(answers->>'q12a-precio-usd'), '') ~ '^\d+(\.\d+)?$'
    and nullif(trim(answers->>'q12a-precio-usd'), '')::numeric > 0
    and nullif(trim(answers->>'q12a-precio-usd'), '')::numeric < 1
  )
  or (
    nullif(trim(answers->>'q46c-2-precio-usd'), '') ~ '^\d+(\.\d+)?$'
    and nullif(trim(answers->>'q46c-2-precio-usd'), '')::numeric > 0
    and nullif(trim(answers->>'q46c-2-precio-usd'), '')::numeric < 1
  )
order by code;
*/

grant execute on function public.meli_parse_amount(text) to anon, authenticated;
grant execute on function public.meli_to_usd(numeric, text) to anon, authenticated;
