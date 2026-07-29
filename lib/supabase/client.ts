import { createClient } from '@supabase/supabase-js';

// Cliente único de Supabase. Al no haber auth, usamos la anon key tanto en
// cliente como en servidor. Las variables se cargan desde .env.local.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Aviso claro en consola si faltan las credenciales
  console.warn(
    '[supabase] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local'
  );
}

// Placeholders válidos para que el build no falle si todavía no hay credenciales.
// En ejecución real (con .env.local completo) se usan los valores verdaderos.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

// Nombre del bucket de Storage para la evidencia
export const EVIDENCE_BUCKET = 'evidencia-meli';
