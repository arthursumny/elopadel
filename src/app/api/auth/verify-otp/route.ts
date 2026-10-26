import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  ok: false,
  code: 'GONE',
  error: 'A autenticação por celular foi descontinuada. Use Google ou email e senha.',
};

/**
 * @deprecated Phone/OTP authentication is disabled. No session is created.
 */
export async function POST(_request?: Request) {
  return NextResponse.json(GONE_RESPONSE, { status: 410, headers: { 'cache-control': 'no-store' } });
}
