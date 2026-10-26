import { NextResponse } from 'next/server';
import { currentAdminSession } from '@/lib/auth';
import { runAutoMigrations } from '@/lib/db/migrate';

export async function GET() {
  return NextResponse.json(
    { error: 'Método não permitido. Utilize POST autenticado como administrador.' },
    { status: 405, headers: { Allow: 'POST', 'cache-control': 'no-store' } }
  );
}

export async function POST() {
  const session = await currentAdminSession();
  if (!session || session.role !== 'admin' || session.id !== 'admin') {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    );
  }

  const ok = await runAutoMigrations();
  return NextResponse.json(
    {
      ok,
      message: ok
        ? 'Migrations executed successfully! Database schema is ready.'
        : 'Migration failed. Check server logs.',
    },
    { status: ok ? 200 : 500 }
  );
}
