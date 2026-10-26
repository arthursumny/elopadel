import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  ok: false,
  code: 'GONE',
  error: 'O vínculo de conta social por celular foi descontinuado. Entre com Google ou email e senha.',
};

/**
 * @deprecated Phone-based social linking is disabled. No session is created.
 */
export async function POST(_request?: Request) {
  return NextResponse.json(GONE_RESPONSE, { status: 410, headers: { 'cache-control': 'no-store' } });
}
