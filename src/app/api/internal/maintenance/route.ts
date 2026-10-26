import { NextResponse } from 'next/server';
import { runMaintenance } from '@/lib/db/maintenance';

export async function POST(request: Request) {
  const expected = process.env.MAINTENANCE_TOKEN;
  const received = request.headers.get('x-maintenance-token');
  if (!expected) return NextResponse.json({ error: 'MAINTENANCE_TOKEN não configurado.' }, { status: 503 });
  if (!received || received !== expected) return NextResponse.json({ error: 'Token de manutenção inválido.' }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await runMaintenance()) });
  } catch (error) {
    console.error('Falha na rotina de manutenção.', error);
    return NextResponse.json({ error: 'Não foi possível executar a manutenção.' }, { status: 500 });
  }
}
