import { NextRequest, NextResponse } from 'next/server';
import { mapPublicResultFromRpc, mapPublicResultsFromRpc } from '@/lib/data';
import { supabase } from '@/lib/supabase/client';

const OPS_AUTH_COOKIE = 'meli_auth';

/**
 * Resultados para Ops con cookie de sesión (pestaña nueva sin sessionStorage).
 * Sin ?id → listado liviano. Con ?id= → detalle con answers completos.
 */
export async function GET(request: NextRequest) {
  const opsAuth = request.cookies.get(OPS_AUTH_COOKIE)?.value;
  if (opsAuth !== '1') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const passcode = process.env.INTERNAL_PASSCODE;
  if (!passcode) {
    return NextResponse.json(
      { error: 'INTERNAL_PASSCODE no configurado en el servidor' },
      { status: 500 }
    );
  }

  const responseId = request.nextUrl.searchParams.get('id');

  try {
    if (responseId) {
      const { data, error } = await supabase.rpc('meli_get_public_result_ops', {
        p_passcode: passcode,
        p_response_id: responseId,
      });

      if (error) {
        console.error('[resultados/ops] detail RPC error:', error.message);
        if (error.message?.includes('Passcode inválido')) {
          return NextResponse.json({ error: 'Passcode inválido' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Error al cargar resultado' }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
      }
      return NextResponse.json(mapPublicResultFromRpc(data));
    }

    const { data, error } = await supabase.rpc('meli_get_public_results_ops', {
      p_passcode: passcode,
    });

    if (error) {
      console.error('[resultados/ops] RPC error:', error.message);
      if (error.message?.includes('Passcode inválido')) {
        return NextResponse.json({ error: 'Passcode inválido' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Error al cargar resultados' }, { status: 500 });
    }

    return NextResponse.json(mapPublicResultsFromRpc(data));
  } catch (err) {
    console.error('[resultados/ops] GET error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
