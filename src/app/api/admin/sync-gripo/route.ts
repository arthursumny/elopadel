import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth';
import { syncGripoClubsDatabase } from '@/lib/integrations/gripo-sync';

export async function POST() {
  try {
    await requireAdminSession();
    const result = await syncGripoClubsDatabase();
    return NextResponse.json({
      ok: true,
      message: `${result.uniqueClubsCount} clubes sincronizados com sucesso a partir do Gripo!`,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na sincronização';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
