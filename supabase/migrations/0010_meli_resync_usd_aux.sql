-- ============================================================
-- 0010_meli_resync_usd_aux.sql
-- Falabella + Chile: A21 debe ser 0. En DB a veces quedó un monto
-- crudo (ej. 3767) y al abrir la UI el computed viejo hacía
-- A21.2 = 3.96 antes del lock.
--
-- Correr a mano en el SQL Editor:
--   1) SELECT diagnóstico
--   2) UPDATE
--   3) SELECT verificación (0 filas)
-- ============================================================

-- ------------------------------------------------------------
-- PASO 1 — SELECT diagnóstico
-- ------------------------------------------------------------
/*
select
  code,
  coalesce(nombre_apellido, answers->>'nombre-apellido') as titulo,
  answers->>'q8-competidor' as competidor,
  answers->>'f1-pais' as pais,
  answers->>'q19a-precio-impuestos' as a21,
  answers->>'q19b-impuestos-usd' as a21_usd
from public.meli_responses
where
  answers->>'q8-competidor' = 'falabella'
  and answers->>'f1-pais' = '1'
  and public.meli_parse_amount(answers->>'q19a-precio-impuestos') is distinct from 0
order by code;
*/

-- ------------------------------------------------------------
-- PASO 2 — UPDATE: A21 → '0', A21.2 → '0.00'
-- ------------------------------------------------------------
/*
update public.meli_responses
set answers = answers || jsonb_build_object(
  'q19a-precio-impuestos', to_jsonb('0'::text),
  'q19b-impuestos-usd', to_jsonb('0.00'::text)
)
where
  answers->>'q8-competidor' = 'falabella'
  and answers->>'f1-pais' = '1'
  and public.meli_parse_amount(answers->>'q19a-precio-impuestos') is distinct from 0;
*/

-- ------------------------------------------------------------
-- PASO 3 — SELECT verificación (esperado: 0 filas)
-- ------------------------------------------------------------
/*
select
  code,
  coalesce(nombre_apellido, answers->>'nombre-apellido') as titulo,
  answers->>'q19a-precio-impuestos' as a21,
  answers->>'q19b-impuestos-usd' as a21_usd
from public.meli_responses
where
  answers->>'q8-competidor' = 'falabella'
  and answers->>'f1-pais' = '1'
  and public.meli_parse_amount(answers->>'q19a-precio-impuestos') is distinct from 0
order by code;
*/
