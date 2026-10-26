import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  ok: false,
  code: 'GONE',
  error: 'A troca de ticket de sessão foi descontinuada. Entre novamente com Google ou email e senha.',
};

/**
 * @deprecated The ticket exchange allowed anyone holding a ticket URL to claim
 * session/onboarding tokens. Disabled as a 410 tombstone; it never publishes or
 * returns credentials.
 */
export async function GET() {
  return NextResponse.json(GONE_RESPONSE, { status: 410, headers: { 'cache-control': 'no-store' } });
}

export async function POST() {
  return NextResponse.json(GONE_RESPONSE, { status: 410, headers: { 'cache-control': 'no-store' } });
}
