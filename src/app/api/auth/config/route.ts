import { NextResponse } from 'next/server';

export async function GET() {
  const configured =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '';

  // The backend keeps validating the full comma-separated audience list; the
  // browser receives only the primary web client ID.
  const googleClientId = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0] ?? '';

  return NextResponse.json(
    { googleClientId },
    { headers: { 'cache-control': 'no-store' } }
  );
}
