-- Ejemplo: cargar usuarios cliente para /resultados (post-deploy).
-- Reemplazá <passcode-ops>, emails y passwords reales. NO commitear passwords.
--
-- Requiere haber corrido supabase/migrations/0005_meli_resultados_auth.sql

select public.meli_admin_upsert_resultados_client(
  '<passcode-ops>',
  'usuario1@mercadolibre.com',
  '<password-1>'
);

select public.meli_admin_upsert_resultados_client(
  '<passcode-ops>',
  'usuario2@mercadolibre.cl',
  '<password-2>'
);

select public.meli_admin_upsert_resultados_client(
  '<passcode-ops>',
  'usuario3@mercadolibre.cl',
  '<password-3>'
);
